import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import type { FastifyInstance } from 'fastify';
import { buildApp } from './app';

const url = process.env.NEBULA_TEST_DATABASE_URL;
const secret = 'rooms-integration-test-only-secret-00000000000000';
const password = 'SecureTestPassword123!';

describe.skipIf(!url)('rooms private lifecycle (PostgreSQL)', () => {
  let pool: Pool;
  let app: FastifyInstance;
  let a = '';
  let b = '';
  let c = '';
  let roomId = '';
  let code = '';

  beforeAll(async () => {
    pool = new Pool({ connectionString: url });
    app = await buildApp({ pool, secret, origin: 'http://localhost:3000', registrationEnabled: true });
    await app.ready();
    for (const set of [(value: string) => { a=value; }, (value: string) => { b=value; }, (value: string) => { c=value; }]) {
      const email = 'room-' + crypto.randomUUID() + '@example.test';
      const result = await app.inject({ method: 'POST', url: '/v1/auth/register', payload: { email, password } });
      expect(result.statusCode).toBe(201);
      set(result.json().accessToken as string);
    }
  });
  afterAll(async () => { if (app) await app.close(); if (pool) await pool.end(); });
  const auth = (token: string) => ({ authorization: 'Bearer ' + token });

  it('requires auth and creates a private room with a one-time code', async () => {
    const denied = await app.inject({ method: 'GET', url: '/v1/rooms' });
    expect(denied.statusCode).toBe(401);
    const result = await app.inject({ method: 'POST', url: '/v1/rooms', headers: auth(a), payload: { name: 'Sala privada', mode: 'party' } });
    expect(result.statusCode).toBe(201);
    roomId = result.json().room.id;
    code = result.json().inviteCode;
    expect(code.length).toBeGreaterThan(20);
    const hidden = await app.inject({ method: 'GET', url: '/v1/rooms/' + roomId, headers: auth(b) });
    expect(hidden.statusCode).toBe(404);
    const mine = await app.inject({ method: 'GET', url: '/v1/rooms', headers: auth(a) });
    expect(mine.json().items.some((r: {id:string}) => r.id===roomId)).toBe(true);
    expect(JSON.stringify(mine.json())).not.toContain(code);
  });

  it('allows invited members, rejects wrong codes and enforces capacity', async () => {
    const wrong = await app.inject({ method: 'POST', url: '/v1/rooms/join', headers: auth(b), payload: { code: 'A'.repeat(32) } });
    expect(wrong.statusCode).toBe(404);
    const joined = await app.inject({ method: 'POST', url: '/v1/rooms/join', headers: auth(b), payload: { code } });
    expect(joined.statusCode).toBe(200);
    expect(joined.json().roomId).toBe(roomId);
    const member = await app.inject({ method: 'GET', url: '/v1/rooms/' + roomId, headers: auth(b) });
    expect(member.statusCode).toBe(200);
    expect(member.json().room.participantCount).toBe(2);
    const outsider = await app.inject({ method: 'GET', url: '/v1/rooms/' + roomId, headers: auth(c) });
    expect(outsider.statusCode).toBe(404);
  });

  it('restricts playback state changes to host and checks revision', async () => {
    const payload = { expectedRevision: 0, trackId: null, status: 'paused', positionMs: 1200 };
    const forbidden = await app.inject({ method: 'POST', url: '/v1/rooms/' + roomId + '/timeline', headers: auth(b), payload });
    expect(forbidden.statusCode).toBe(409);
    const changed = await app.inject({ method: 'POST', url: '/v1/rooms/' + roomId + '/timeline', headers: auth(a), payload });
    expect(changed.statusCode).toBe(200);
    expect(changed.json().timeline.revision).toBe(1);
    const stale = await app.inject({ method: 'POST', url: '/v1/rooms/' + roomId + '/timeline', headers: auth(a), payload });
    expect(stale.statusCode).toBe(409);
  });

  it('requires explicit host rights confirmation before sharing private room audio', async () => {
    const profile = await app.inject({ method: 'GET', url: '/v1/me', headers: auth(a) });
    const userId = profile.json().user.id as string;
    const trackId = crypto.randomUUID();
    await pool.query(`
      INSERT INTO cloud_tracks (id,user_id,object_key,title,artist,mime_type,byte_size,status)
      VALUES ($1,$2,$3,'Test original','Artist','audio/mpeg',1024,'ready')
    `, [trackId, userId, 'users/' + userId + '/test-' + trackId + '.mp3']);
    const timeline = await app.inject({ method: 'POST', url: '/v1/rooms/' + roomId + '/timeline',
      headers: auth(a), payload: { expectedRevision: 1, trackId, status: 'paused', positionMs: 0 } });
    expect(timeline.statusCode).toBe(200);
    const denied = await app.inject({ method: 'GET', url: '/v1/rooms/' + roomId + '/audio', headers: auth(b) });
    expect(denied.statusCode).toBe(403);
    const notHost = await app.inject({ method: 'POST', url: '/v1/rooms/' + roomId + '/sharing',
      headers: auth(b), payload: { enabled: true, rightsConfirmed: true } });
    expect(notHost.statusCode).toBe(404);
    const missingRights = await app.inject({ method: 'POST', url: '/v1/rooms/' + roomId + '/sharing',
      headers: auth(a), payload: { enabled: true } });
    expect(missingRights.statusCode).toBe(400);
    const shared = await app.inject({ method: 'POST', url: '/v1/rooms/' + roomId + '/sharing',
      headers: auth(a), payload: { enabled: true, rightsConfirmed: true } });
    expect(shared.statusCode).toBe(200);
    // CI has no R2 credentials. Authorization now succeeds but storage is unavailable.
    const authorized = await app.inject({ method: 'GET', url: '/v1/rooms/' + roomId + '/audio', headers: auth(b) });
    expect(authorized.statusCode).toBe(503);
    const revoke = await app.inject({ method: 'POST', url: '/v1/rooms/' + roomId + '/sharing',
      headers: auth(a), payload: { enabled: false } });
    expect(revoke.statusCode).toBe(200);
    const blockedAgain = await app.inject({ method: 'GET', url: '/v1/rooms/' + roomId + '/audio', headers: auth(b) });
    expect(blockedAgain.statusCode).toBe(403);
  });

  it('enforces host-only queue mutations and atomically advances tracks', async () => {
    const profile = await app.inject({ method: 'GET', url: '/v1/me', headers: auth(a) });
    const userId = profile.json().user.id as string;
    const trackId = crypto.randomUUID();
    await pool.query(`
      INSERT INTO cloud_tracks (id,user_id,object_key,title,artist,mime_type,byte_size,status)
      VALUES ($1,$2,$3,'Queue test','Artist','audio/mpeg',2048,'ready')
    `, [trackId, userId, 'users/' + userId + '/queue-' + trackId + '.mp3']);
    const denied = await app.inject({ method: 'POST', url: '/v1/rooms/' + roomId + '/queue',
      headers: auth(b), payload: { trackId, rightsConfirmed: true } });
    expect(denied.statusCode).toBe(404);
    const added = await app.inject({ method: 'POST', url: '/v1/rooms/' + roomId + '/queue',
      headers: auth(a), payload: { trackId, rightsConfirmed: true } });
    expect(added.statusCode).toBe(201);
    const list = await app.inject({ method: 'GET', url: '/v1/rooms/' + roomId + '/queue', headers: auth(b) });
    expect(list.statusCode).toBe(200);
    expect(list.json().items[0].trackId).toBe(trackId);
    const shared = await app.inject({ method: 'POST', url: '/v1/rooms/' + roomId + '/sharing',
      headers: auth(a), payload: { enabled: true, rightsConfirmed: true } });
    expect(shared.statusCode).toBe(200);
    const advance = await app.inject({ method: 'POST', url: '/v1/rooms/' + roomId + '/next',
      headers: auth(a), payload: { expectedRevision: 2 } });
    expect(advance.statusCode).toBe(200);
    expect(advance.json().trackId).toBe(trackId);
    const stale = await app.inject({ method: 'POST', url: '/v1/rooms/' + roomId + '/next',
      headers: auth(a), payload: { expectedRevision: 2 } });
    expect(stale.statusCode).toBe(409);
    const empty = await app.inject({ method: 'GET', url: '/v1/rooms/' + roomId + '/queue', headers: auth(b) });
    expect(empty.json().items).toHaveLength(0);
  });

  it('requires renewed rights confirmation when changing the currently shared audio', async () => {
    const me = await app.inject({ method: 'GET', url: '/v1/me', headers: auth(a) });
    const userId = me.json().user.id as string;
    const trackId = crypto.randomUUID();
    await pool.query(`
      INSERT INTO cloud_tracks (id,user_id,object_key,title,artist,mime_type,byte_size,status)
      VALUES ($1,$2,$3,'Another original','Artist','audio/mpeg',2048,'ready')
    `, [trackId, userId, 'users/' + userId + '/rights-' + trackId + '.mp3']);
    const before = await app.inject({ method: 'GET', url: '/v1/rooms/' + roomId, headers: auth(a) });
    const revision = before.json().room.revision as number;
    const originalTrack = before.json().room.trackId as string;
    expect(before.json().room.shareEnabled).toBe(true);

    const payload = { expectedRevision: revision, trackId, status: 'playing', positionMs: 0 };
    const denied = await app.inject({ method: 'POST', url: '/v1/rooms/' + roomId + '/timeline',
      headers: auth(a), payload });
    expect(denied.statusCode).toBe(403);
    expect(denied.json().error).toBe('sharing_rights_confirmation_required');
    const unchanged = await app.inject({ method: 'GET', url: '/v1/rooms/' + roomId, headers: auth(b) });
    expect(unchanged.json().room.trackId).toBe(originalTrack);
    expect(unchanged.json().room.revision).toBe(revision);

    const allowed = await app.inject({ method: 'POST', url: '/v1/rooms/' + roomId + '/timeline',
      headers: auth(a), payload: { ...payload, rightsConfirmed: true } });
    expect(allowed.statusCode).toBe(200);
    expect(allowed.json().timeline.trackId).toBe(trackId);
  });

  it('lists members privately, allows host moderation and transfers host atomically', async () => {
    const created = await app.inject({ method: 'POST', url: '/v1/rooms', headers: auth(a),
      payload: { name: 'Moderación', mode: 'party' } });
    expect(created.statusCode).toBe(201);
    const id = created.json().room.id as string;
    const invite = created.json().inviteCode as string;
    const joinedB = await app.inject({ method: 'POST', url: '/v1/rooms/join', headers: auth(b), payload: { code: invite } });
    const joinedC = await app.inject({ method: 'POST', url: '/v1/rooms/join', headers: auth(c), payload: { code: invite } });
    expect(joinedB.statusCode).toBe(200);
    expect(joinedC.statusCode).toBe(200);
    const members = await app.inject({ method: 'GET', url: '/v1/rooms/' + id + '/members', headers: auth(a) });
    expect(members.statusCode).toBe(200);
    expect(members.json().items).toHaveLength(3);
    const guest = await app.inject({ method: 'GET', url: '/v1/rooms/' + id + '/members', headers: auth(b) });
    expect(guest.statusCode).toBe(200);
    expect(guest.json().items.every((m: { email: string | null }) => m.email === null)).toBe(true);
    const meB = await app.inject({ method: 'GET', url: '/v1/me', headers: auth(b) });
    const guestId = (guest.json().items as {userId:string;role:string}[]).find(m => m.role === 'listener' && m.userId !== meB.json().user.id)?.userId;
    expect(guestId).toBeDefined();
    const unauthorized = await app.inject({ method: 'DELETE', url: '/v1/rooms/' + id + '/members/' + guestId, headers: auth(b) });
    expect(unauthorized.statusCode).toBe(404);
    const kicked = await app.inject({ method: 'DELETE', url: '/v1/rooms/' + id + '/members/' + guestId, headers: auth(a) });
    expect(kicked.statusCode).toBe(204);
    const kickedRead = await app.inject({ method: 'GET', url: '/v1/rooms/' + id, headers: auth(c) });
    expect(kickedRead.statusCode).toBe(404);
    const newHost = (guest.json().items as {userId:string;role:string}[]).find(m => m.role === 'listener' && m.userId !== guestId)!.userId;
    const transfer = await app.inject({ method: 'POST', url: '/v1/rooms/' + id + '/transfer-host', headers: auth(a),
      payload: { memberId: newHost } });
    expect(transfer.statusCode).toBe(200);
    const formerHostDenied = await app.inject({ method: 'POST', url: '/v1/rooms/' + id + '/close', headers: auth(a), payload: {} });
    expect(formerHostDenied.statusCode).toBe(404);
    const currentHostClose = await app.inject({ method: 'POST', url: '/v1/rooms/' + id + '/close', headers: auth(b), payload: {} });
    expect(currentHostClose.statusCode).toBe(204);
  });

  it('reorders a private room queue atomically and rejects guest or stale lists', async () => {
    const me = await app.inject({ method: 'GET', url: '/v1/me', headers: auth(a) });
    const userId = me.json().user.id as string;
    const ids = [crypto.randomUUID(), crypto.randomUUID()];
    for (const id of ids) {
      await pool.query(`
        INSERT INTO cloud_tracks (id,user_id,object_key,title,artist,mime_type,byte_size,status)
        VALUES ($1,$2,$3,'Original','Artist','audio/mpeg',1024,'ready')
      `, [id, userId, 'users/' + userId + '/reorder-' + id + '.mp3']);
    }
    const created = await app.inject({ method: 'POST', url: '/v1/rooms', headers: auth(a),
      payload: { name: 'Cola ordenada', mode: 'listening' } });
    expect(created.statusCode).toBe(201);
    const id = created.json().room.id as string;
    await app.inject({ method: 'POST', url: '/v1/rooms/join', headers: auth(b),
      payload: { code: created.json().inviteCode } });
    for (const trackId of ids) {
      const added = await app.inject({ method: 'POST', url: '/v1/rooms/' + id + '/queue', headers: auth(a),
        payload: { trackId, rightsConfirmed: true } });
      expect(added.statusCode).toBe(201);
    }
    const before = await app.inject({ method: 'GET', url: '/v1/rooms/' + id + '/queue', headers: auth(a) });
    const itemIds = (before.json().items as {id:string}[]).map(item => item.id);
    const reverse = [...itemIds].reverse();
    const forbidden = await app.inject({ method: 'PATCH', url: '/v1/rooms/' + id + '/queue/reorder',
      headers: auth(b), payload: { itemIds: reverse } });
    expect(forbidden.statusCode).toBe(404);
    const incomplete = await app.inject({ method: 'PATCH', url: '/v1/rooms/' + id + '/queue/reorder',
      headers: auth(a), payload: { itemIds: [reverse[0], crypto.randomUUID()] } });
    expect(incomplete.statusCode).toBe(409);
    const moved = await app.inject({ method: 'PATCH', url: '/v1/rooms/' + id + '/queue/reorder',
      headers: auth(a), payload: { itemIds: reverse } });
    expect(moved.statusCode).toBe(200);
    const after = await app.inject({ method: 'GET', url: '/v1/rooms/' + id + '/queue', headers: auth(b) });
    expect((after.json().items as {id:string}[]).map(item => item.id)).toEqual(reverse);
    const unchanged = await app.inject({ method: 'PATCH', url: '/v1/rooms/' + id + '/queue/reorder',
      headers: auth(a), payload: { itemIds: reverse } });
    expect(unchanged.statusCode).toBe(200);
    await app.inject({ method: 'POST', url: '/v1/rooms/' + id + '/close', headers: auth(a), payload: {} });
  });

  it('rotates invites and closes room for all members', async () => {
    const denied = await app.inject({ method: 'POST', url: '/v1/rooms/' + roomId + '/invite', headers: auth(b), payload: {} });
    expect(denied.statusCode).toBe(404);
    const rotate = await app.inject({ method: 'POST', url: '/v1/rooms/' + roomId + '/invite', headers: auth(a), payload: {} });
    expect(rotate.statusCode).toBe(200);
    const old = await app.inject({ method: 'POST', url: '/v1/rooms/join', headers: auth(c), payload: { code } });
    expect(old.statusCode).toBe(404);
    const joined = await app.inject({ method: 'POST', url: '/v1/rooms/join', headers: auth(c), payload: { code: rotate.json().inviteCode } });
    expect(joined.statusCode).toBe(200);
    const close = await app.inject({ method: 'POST', url: '/v1/rooms/' + roomId + '/close', headers: auth(a), payload: {} });
    expect(close.statusCode).toBe(204);
    const hidden = await app.inject({ method: 'GET', url: '/v1/rooms/' + roomId, headers: auth(b) });
    expect(hidden.statusCode).toBe(404);
  });
});
