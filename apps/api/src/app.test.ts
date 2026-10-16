import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { buildApp } from './app';
import { loadConfig } from './config';
import { hashPassword } from './security/password';

const url = process.env.NEBULA_TEST_DATABASE_URL;
const SECRET = 'integration-test-secret-000000000000000001';
const PASSWORD = 'SecureTestPassword123!';

function testConfig(extra: Record<string, string> = {}) {
  return loadConfig({ API_JWT_SECRET: SECRET, API_CORS_ORIGIN: 'http://localhost:3000', ...extra });
}

describe.skipIf(!url)('private accounts API backed by PostgreSQL', () => {
  let pool: Pool;
  let app: FastifyInstance;
  let appOpen: FastifyInstance;
  const ownerEmail = `owner-${Date.now()}@example.test`;
  const memberEmail = `member-${Date.now()}@example.test`;
  let ownerToken = '';
  let ownerCookie = '';
  let memberToken = '';
  let memberCookie = '';

  beforeAll(async () => {
    pool = new Pool({ connectionString: url });
    app = await buildApp({ pool, config: testConfig() });
    appOpen = await buildApp({ pool, config: testConfig({ API_ALLOW_PUBLIC_REGISTRATION: 'true' }) });
    await app.ready();
    await appOpen.ready();
    const hash = await hashPassword(PASSWORD);
    await pool.query("INSERT INTO users (id, email, password_hash, role) VALUES ($1, $2, $3, 'owner')", [
      randomUUID(),
      ownerEmail,
      hash,
    ]);
  });

  afterAll(async () => {
    if (app) await app.close();
    if (appOpen) await appOpen.close();
    if (pool) await pool.end();
  });

  function cookieValue(response: { cookies: { name: string; value: string }[] }, name: string): string {
    return response.cookies.find((entry) => entry.name === name)?.value ?? '';
  }

  // Registration is disabled on `app`; use `appOpen` to provision disposable accounts.
  async function register(prefix: string) {
    const email = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`;
    const result = await appOpen.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { email, password: PASSWORD },
    });
    expect(result.statusCode).toBe(201);
    return { email, token: result.json().accessToken as string };
  }

  it('keeps public configuration compatible and protects MusicBrainz', async () => {
    const config = await app.inject({method:'GET',url:'/v1/auth/config'});
    expect(config.statusCode).toBe(200);
    expect(config.json().registrationOpen).toBe(false);
    const denied = await app.inject({ method: 'GET', url: '/v1/metadata/musicbrainz?q=music' });
    expect(denied.statusCode).toBe(401);
  });

  it('reports database connectivity', async () => {
    const response = await app.inject({ method: 'GET', url: '/v1/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json().status).toBe('ok');
  });

  it('disables public registration by default', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { email: `blocked-${Date.now()}@example.test`, password: PASSWORD },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().error).toBe('registration_disabled');
  });

  it('allows registration only when explicitly enabled', async () => {
    const email = `open-${Date.now()}@example.test`;
    const response = await appOpen.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { email, password: PASSWORD },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json().user.role).toBe('member');
    expect(typeof response.json().accessToken).toBe('string');
  });

  it('signs the owner in with a revocable session and refresh cookie', async () => {
    const login = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email: ownerEmail, password: PASSWORD },
    });
    expect(login.statusCode).toBe(200);
    ownerToken = login.json().accessToken as string;
    ownerCookie = cookieValue(login, 'nebula_refresh');
    expect(ownerCookie.length).toBeGreaterThan(20);
    const profile = await app.inject({ method: 'GET', url: '/v1/me', headers: { authorization: 'Bearer ' + ownerToken } });
    expect(profile.statusCode).toBe(200);
    expect(profile.json().user.role).toBe('owner');
    const anonymous = await app.inject({ method: 'GET', url: '/v1/me' });
    expect(anonymous.statusCode).toBe(401);
    const invalid = await app.inject({ method: 'POST', url: '/v1/auth/login', payload: { email: ownerEmail, password: 'NotThePassword123' } });
    expect(invalid.statusCode).toBe(401);
  });

  it('invites and provisions a member account', async () => {
    const invite = await app.inject({
      method: 'POST',
      url: '/v1/admin/invites',
      headers: { authorization: 'Bearer ' + ownerToken },
      payload: { email: memberEmail },
    });
    expect(invite.statusCode).toBe(201);
    const inviteToken = invite.json().token as string;
    expect(inviteToken.length).toBeGreaterThan(20);
    const accept = await app.inject({
      method: 'POST',
      url: '/v1/auth/accept-invite',
      payload: { token: inviteToken, email: memberEmail, password: PASSWORD },
    });
    expect(accept.statusCode).toBe(201);
    expect(accept.json().user.role).toBe('member');
    memberToken = accept.json().accessToken as string;
    memberCookie = cookieValue(accept, 'nebula_refresh');
  });

  it('blocks members from owner administration', async () => {
    const create = await app.inject({
      method: 'POST',
      url: '/v1/admin/invites',
      headers: { authorization: 'Bearer ' + memberToken },
      payload: {},
    });
    expect(create.statusCode).toBe(403);
    const list = await app.inject({ method: 'GET', url: '/v1/admin/users', headers: { authorization: 'Bearer ' + memberToken } });
    expect(list.statusCode).toBe(403);
  });

  it('lets the owner list authorized accounts and active sessions', async () => {
    const accounts = await app.inject({ method: 'GET', url: '/v1/admin/users', headers: { authorization: 'Bearer ' + ownerToken } });
    expect(accounts.statusCode).toBe(200);
    const emails = accounts.json().items.map((item: { email: string }) => item.email);
    expect(emails).toContain(ownerEmail);
    expect(emails).toContain(memberEmail);
    const sessions = await app.inject({ method: 'GET', url: '/v1/auth/sessions', headers: { authorization: 'Bearer ' + ownerToken } });
    expect(sessions.statusCode).toBe(200);
    expect(sessions.json().items.some((item: { current: boolean }) => item.current)).toBe(true);
  });

  it('enforces playlist ownership between accounts', async () => {
    const a = await register('pl-owner');
    const b = await register('pl-viewer');
    const created = await app.inject({ method: 'POST', url: '/v1/playlists', headers: { authorization: 'Bearer ' + a.token }, payload: { name: '  Mi música  ' } });
    expect(created.statusCode).toBe(201);
    const id = created.json().playlist.id as string;
    const visible = await app.inject({ method: 'GET', url: '/v1/playlists', headers: { authorization: 'Bearer ' + a.token } });
    expect(visible.json().items.some((p: { id: string }) => p.id === id)).toBe(true);
    const hidden = await app.inject({ method: 'GET', url: '/v1/playlists', headers: { authorization: 'Bearer ' + b.token } });
    expect(hidden.json().items.some((p: { id: string }) => p.id === id)).toBe(false);
    const blocked = await app.inject({ method: 'PATCH', url: '/v1/playlists/' + id, headers: { authorization: 'Bearer ' + b.token }, payload: { name: 'intruder' } });
    expect(blocked.statusCode).toBe(404);
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
