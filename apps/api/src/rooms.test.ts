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
