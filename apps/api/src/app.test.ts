import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { buildApp } from './app';
import { hashPassword } from './security/password';

const url = process.env.NEBULA_TEST_DATABASE_URL;
const SECRET = 'integration-test-not-for-production-000000001';
const PASSWORD = 'SecureTestPassword123!';

describe.skipIf(!url)('private accounts API backed by PostgreSQL', () => {
  let pool: Pool;
  let app: FastifyInstance;
  let privateApp: FastifyInstance;
  const ownerEmail = `owner-${Date.now()}@example.test`;
  const memberEmail = `member-${Date.now()}@example.test`;
  let ownerToken = '';
  let ownerCookie = '';
  let memberToken = '';
  let memberCookie = '';

  beforeAll(async () => {
    pool = new Pool({ connectionString: url });
    app = await buildApp({ pool, secret: SECRET, origin: 'http://localhost:3000', registrationEnabled: true });
    privateApp = await buildApp({ pool, secret: SECRET, origin: 'http://localhost:3000', registrationEnabled: false });
    await app.ready();
    await privateApp.ready();
    const hash = await hashPassword(PASSWORD);
    await pool.query("INSERT INTO users (id, email, password_hash, role) VALUES ($1, $2, $3, 'owner')", [
      randomUUID(),
      ownerEmail,
      hash,
    ]);
  });

  afterAll(async () => {
    if (app) await app.close();
    if (privateApp) await privateApp.close();
    if (pool) await pool.end();
  });

  function cookieValue(response: { cookies: { name: string; value: string }[] }, name: string): string {
    return response.cookies.find((entry) => entry.name === name)?.value ?? '';
  }

  async function register(prefix: string) {
    const email = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`;
    const result = await app.inject({ method: 'POST', url: '/v1/auth/register', payload: { email, password: PASSWORD } });
    expect(result.statusCode).toBe(201);
    return { email, token: result.json().accessToken as string };
  }

  it('rejects public registration when private mode is enabled', async () => {
    const response = await privateApp.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { email: 'unauthorized@example.test', password: 'NotAllowedToJoin123!' },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().error).toBe('registration_closed');
    const config = await privateApp.inject({ method: 'GET', url: '/v1/auth/config' });
    expect(config.json().registrationOpen).toBe(false);
    const open = await app.inject({ method: 'GET', url: '/v1/auth/config' });
    expect(open.json().registrationOpen).toBe(true);
  });

  it('protects MusicBrainz metadata lookup and rejects invalid search', async () => {
    const denied = await app.inject({ method: 'GET', url: '/v1/metadata/musicbrainz?q=music' });
    expect(denied.statusCode).toBe(401);
    const { token } = await register('metadata');
    const invalid = await app.inject({ method: 'GET', url: '/v1/metadata/musicbrainz?q=a', headers: { authorization: 'Bearer ' + token } });
    expect(invalid.statusCode).toBe(400);
  });

  it('health reports database connectivity', async () => {
    const response = await app.inject({ method: 'GET', url: '/v1/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json().status).toBe('ok');
  });

  it('registers and signs in using an unguessable bearer token', async () => {
    const { email, token } = await register('account');
    expect(token.split('.').length).toBe(3);
    const profile = await app.inject({ method: 'GET', url: '/v1/me', headers: { authorization: 'Bearer ' + token } });
    expect(profile.statusCode).toBe(200);
    expect(profile.json().user.email).toBe(email);
    expect(profile.json().user.role).toBe('member');
    const bad = await app.inject({ method: 'GET', url: '/v1/me' });
    expect(bad.statusCode).toBe(401);
    const login = await app.inject({ method: 'POST', url: '/v1/auth/login', payload: { email, password: PASSWORD } });
    expect(login.statusCode).toBe(200);
    const invalid = await app.inject({ method: 'POST', url: '/v1/auth/login', payload: { email, password: 'NotThePassword123' } });
    expect(invalid.statusCode).toBe(401);
  });

  it('enforces ownership on playlist list, rename and delete', async () => {
    const a = await register('owner');
    const b = await register('viewer');
    const created = await app.inject({ method: 'POST', url: '/v1/playlists', headers: { authorization: 'Bearer ' + a.token }, payload: { name: '  Mi música  ' } });
    expect(created.statusCode).toBe(201);
    const id = created.json().playlist.id as string;
    const visible = await app.inject({ method: 'GET', url: '/v1/playlists', headers: { authorization: 'Bearer ' + a.token } });
    expect(visible.json().items.some((p: { id: string }) => p.id === id)).toBe(true);
    const hidden = await app.inject({ method: 'GET', url: '/v1/playlists', headers: { authorization: 'Bearer ' + b.token } });
    expect(hidden.json().items.some((p: { id: string }) => p.id === id)).toBe(false);
    const blocked = await app.inject({ method: 'PATCH', url: '/v1/playlists/' + id, headers: { authorization: 'Bearer ' + b.token }, payload: { name: 'intruder' } });
    expect(blocked.statusCode).toBe(404);
    const deleted = await app.inject({ method: 'DELETE', url: '/v1/playlists/' + id, headers: { authorization: 'Bearer ' + b.token } });
    expect(deleted.statusCode).toBe(404);
    const renamed = await app.inject({ method: 'PATCH', url: '/v1/playlists/' + id, headers: { authorization: 'Bearer ' + a.token }, payload: { name: 'Renombrada' } });
    expect(renamed.statusCode).toBe(200);
    const removed = await app.inject({ method: 'DELETE', url: '/v1/playlists/' + id, headers: { authorization: 'Bearer ' + a.token } });
    expect(removed.statusCode).toBe(204);
  });

  it('requires authentication and validates provider search parameters', async () => {
    const denied = await app.inject({ method: 'GET', url: '/v1/discovery/search?q=music' });
    expect(denied.statusCode).toBe(401);
    const { token } = await register('discovery');
    const headers = { authorization: 'Bearer ' + token };
    const providers = await app.inject({ method: 'GET', url: '/v1/discovery/providers', headers });
    expect(providers.statusCode).toBe(200);
    expect(providers.json().providers.some((p: { id: string }) => p.id === 'jamendo')).toBe(true);
    const invalid = await app.inject({ method: 'GET', url: '/v1/discovery/search?q=a', headers });
    expect(invalid.statusCode).toBe(400);
    const disabled = await app.inject({ method: 'GET', url: '/v1/discovery/search?q=ambient&provider=jamendo', headers });
    expect(disabled.statusCode).toBe(200);
    expect(disabled.json().items).toEqual([]);
    expect(disabled.json().disabledProviders).toContain('jamendo');
  });

  it('stores external references only for the owner and de-duplicates saves', async () => {
    const owner = await register('reference-owner');
    const stranger = await register('reference-stranger');
    const body = { provider: 'jamendo', externalId: '12345', title: 'Mi canción', artist: 'Demo', sourceUrl: 'https://www.jamendo.com/track/12345' };
    const header = (token: string) => ({ authorization: 'Bearer ' + token });
    const saved = await app.inject({ method: 'POST', url: '/v1/library/external', headers: header(owner.token), payload: body });
    expect(saved.statusCode).toBe(201);
    const duplicate = await app.inject({ method: 'POST', url: '/v1/library/external', headers: header(owner.token), payload: body });
    expect(duplicate.statusCode).toBe(200);
    expect(duplicate.json().created).toBe(false);
    const mine = await app.inject({ method: 'GET', url: '/v1/library/external', headers: header(owner.token) });
    expect(mine.json().items.some((x: { externalId: string }) => x.externalId === '12345')).toBe(true);
    const other = await app.inject({ method: 'GET', url: '/v1/library/external', headers: header(stranger.token) });
    expect(other.json().items.some((x: { externalId: string }) => x.externalId === '12345')).toBe(false);
    const blocked = await app.inject({ method: 'DELETE', url: '/v1/library/external/jamendo/12345', headers: header(stranger.token) });
    expect(blocked.statusCode).toBe(404);
    const removed = await app.inject({ method: 'DELETE', url: '/v1/library/external/jamendo/12345', headers: header(owner.token) });
    expect(removed.statusCode).toBe(204);
    const denied = await app.inject({ method: 'GET', url: '/v1/library/external' });
    expect(denied.statusCode).toBe(401);
  });

  it('isolates private R2 tracks and issues signed URLs only to their owner', async () => {
    const previous = {
      R2_ACCOUNT_ID: process.env.R2_ACCOUNT_ID,
      R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID,
      R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY,
      R2_BUCKET: process.env.R2_BUCKET,
    };
    Object.assign(process.env, {
      R2_ACCOUNT_ID: '0123456789abcdef0123456789abcdef',
      R2_ACCESS_KEY_ID: 'testAccessKey',
      R2_SECRET_ACCESS_KEY: 'testSecretKey',
      R2_BUCKET: 'nebula-music-private',
    });
    try {
      const a = await register('r2-owner');
      const b = await register('r2-other');
      const headers = (token: string) => ({ authorization: 'Bearer ' + token });
      const denied = await app.inject({ method: 'GET', url: '/v1/library/cloud' });
      expect(denied.statusCode).toBe(401);
      const config = await app.inject({ method: 'GET', url: '/v1/library/cloud/config', headers: headers(a.token) });
      expect(config.json().configured).toBe(true);
      const invalid = await app.inject({ method: 'POST', url: '/v1/library/cloud/uploads', headers: headers(a.token), payload: { filename: 'song.exe', size: 100 } });
      expect(invalid.statusCode).toBe(400);
      const ticket = await app.inject({
        method: 'POST', url: '/v1/library/cloud/uploads', headers: headers(a.token),
        payload: { filename: 'My Song.mp3', size: 1024, title: 'My Song' },
      });
      expect(ticket.statusCode).toBe(201);
      const id = ticket.json().id as string;
      expect(new URL(ticket.json().uploadUrl).searchParams.get('X-Amz-SignedHeaders')).toBe('content-type;host');
      const strangerList = await app.inject({ method: 'GET', url: '/v1/library/cloud', headers: headers(b.token) });
      expect(strangerList.json().items).toEqual([]);
      await pool.query("UPDATE cloud_tracks SET status='ready' WHERE id=$1", [id]);
      const mine = await app.inject({ method: 'GET', url: '/v1/library/cloud', headers: headers(a.token) });
      expect(mine.json().items.some((item: { id: string }) => item.id === id)).toBe(true);
      const playable = await app.inject({ method: 'GET', url: '/v1/library/cloud/' + id + '/play', headers: headers(a.token) });
      expect(playable.statusCode).toBe(200);
      expect(new URL(playable.json().url).searchParams.get('X-Amz-Expires')).toBe('3600');
      const blocked = await app.inject({ method: 'GET', url: '/v1/library/cloud/' + id + '/play', headers: headers(b.token) });
      expect(blocked.statusCode).toBe(404);
      const blockedDelete = await app.inject({ method: 'DELETE', url: '/v1/library/cloud/' + id, headers: headers(b.token) });
      expect(blockedDelete.statusCode).toBe(404);
      await pool.query('DELETE FROM cloud_tracks WHERE id=$1', [id]);
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  it('signs the owner in and enforces owner-only administration', async () => {
    const login = await app.inject({ method: 'POST', url: '/v1/auth/login', payload: { email: ownerEmail, password: PASSWORD } });
    expect(login.statusCode).toBe(200);
    ownerToken = login.json().accessToken as string;
    ownerCookie = cookieValue(login, 'nebula_refresh');
    expect(ownerCookie.length).toBeGreaterThan(20);
    const profile = await app.inject({ method: 'GET', url: '/v1/me', headers: { authorization: 'Bearer ' + ownerToken } });
    expect(profile.json().user.role).toBe('owner');

    const invite = await app.inject({ method: 'POST', url: '/v1/admin/invites', headers: { authorization: 'Bearer ' + ownerToken }, payload: { email: memberEmail } });
    expect(invite.statusCode).toBe(201);
    const inviteToken = invite.json().token as string;
    const accept = await app.inject({ method: 'POST', url: '/v1/auth/accept-invite', payload: { token: inviteToken, email: memberEmail, password: PASSWORD } });
    expect(accept.statusCode).toBe(201);
    expect(accept.json().user.role).toBe('member');
    memberToken = accept.json().accessToken as string;
    memberCookie = cookieValue(accept, 'nebula_refresh');

    const blocked = await app.inject({ method: 'POST', url: '/v1/admin/invites', headers: { authorization: 'Bearer ' + memberToken }, payload: {} });
    expect(blocked.statusCode).toBe(403);
    const accounts = await app.inject({ method: 'GET', url: '/v1/admin/users', headers: { authorization: 'Bearer ' + ownerToken } });
    expect(accounts.statusCode).toBe(200);
    const emails = accounts.json().items.map((item: { email: string }) => item.email);
    expect(emails).toContain(ownerEmail);
    expect(emails).toContain(memberEmail);
    const sessions = await app.inject({ method: 'GET', url: '/v1/auth/sessions', headers: { authorization: 'Bearer ' + ownerToken } });
    expect(sessions.statusCode).toBe(200);
    expect(sessions.json().items.some((item: { current: boolean }) => item.current)).toBe(true);
  });

  it('rotates refresh tokens and detects reuse', async () => {
    const rotated = await app.inject({ method: 'POST', url: '/v1/auth/refresh', headers: { cookie: 'nebula_refresh=' + ownerCookie, 'x-nebula-client': 'test' } });
    expect(rotated.statusCode).toBe(200);
    const rotatedCookie = cookieValue(rotated, 'nebula_refresh');
    expect(rotatedCookie).not.toBe(ownerCookie);
    const reused = await app.inject({ method: 'POST', url: '/v1/auth/refresh', headers: { cookie: 'nebula_refresh=' + ownerCookie, 'x-nebula-client': 'test' } });
    expect(reused.statusCode).toBe(401);
    expect(reused.json().error).toBe('refresh_token_reused');
    const afterFamilyRevoke = await app.inject({ method: 'POST', url: '/v1/auth/refresh', headers: { cookie: 'nebula_refresh=' + rotatedCookie, 'x-nebula-client': 'test' } });
    expect(afterFamilyRevoke.statusCode).toBe(401);
  });

  it('requires the client header for cookie-authenticated endpoints', async () => {
    const missing = await app.inject({ method: 'POST', url: '/v1/auth/refresh', headers: { cookie: 'nebula_refresh=' + memberCookie } });
    expect(missing.statusCode).toBe(400);
    expect(missing.json().error).toBe('missing_client_header');
  });

  it('logs out and revokes the session access token', async () => {
    const logout = await app.inject({ method: 'POST', url: '/v1/auth/logout', headers: { authorization: 'Bearer ' + memberToken, 'x-nebula-client': 'test' } });
    expect(logout.statusCode).toBe(204);
    const after = await app.inject({ method: 'GET', url: '/v1/me', headers: { authorization: 'Bearer ' + memberToken } });
    expect(after.statusCode).toBe(401);
  });
});
