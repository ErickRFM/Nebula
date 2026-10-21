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

  async function register(prefix: string, clientIp?: string) {
    const email = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`;
    const result = await app.inject({ method: 'POST', url: '/v1/auth/register', headers: clientIp ? {'x-forwarded-for': clientIp} : undefined, payload: { email, password: PASSWORD } });
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

  it('allows only the configured site and fixed Capacitor native origins', async () => {
    for (const origin of ['http://localhost:3000', 'http://localhost', 'https://localhost', 'capacitor://localhost']) {
      const res=await app.inject({method:'OPTIONS',url:'/v1/auth/config',headers:{
        origin,'access-control-request-method':'GET',
      }});
      expect(res.headers['access-control-allow-origin']).toBe(origin);
      expect(res.headers['access-control-allow-credentials']).toBe('true');
    }
    const denied=await app.inject({method:'OPTIONS',url:'/v1/auth/config',headers:{
      origin:'https://untrusted.example','access-control-request-method':'GET'
    }});
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
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

  it('synchronizes per-account favorite references without leaking them', async () => {
    const owner=await register('favorite-owner','198.51.100.72');
    const stranger=await register('favorite-stranger','198.51.100.72');
    const h=(token:string)=>({authorization:'Bearer '+token,'x-forwarded-for':'198.51.100.72'});
    const saved=await app.inject({method:'POST',url:'/v1/library/external',headers:h(owner.token),payload:{
      provider:'jamendo',externalId:'favorites-728',title:'Pista de prueba',artist:'Demo',
      sourceUrl:'https://www.jamendo.com/track/728',
    }});
    expect([200,201]).toContain(saved.statusCode);
    const library=await app.inject({method:'GET',url:'/v1/library/external',headers:h(owner.token)});
    const trackId=(library.json().items as {id:string;externalId:string}[]).find(x=>x.externalId==='favorites-728')!.id;
    const url='/v1/library/favorites';
    const blocked=await app.inject({method:'POST',url,headers:h(stranger.token),payload:{source:'external',trackId}});
    expect(blocked.statusCode).toBe(404);
    expect((await app.inject({method:'POST',url,headers:h(owner.token),payload:{source:'external',trackId}})).statusCode).toBe(201);
    expect((await app.inject({method:'POST',url,headers:h(owner.token),payload:{source:'external',trackId}})).statusCode).toBe(200);
    const mine=await app.inject({method:'GET',url,headers:h(owner.token)});
    expect(mine.json().items).toHaveLength(1);
    const favoriteId=mine.json().items[0].id as string;
    const other=await app.inject({method:'GET',url,headers:h(stranger.token)});
    expect(other.json().items).toHaveLength(0);
    expect((await app.inject({method:'DELETE',url:url+'/'+favoriteId,headers:h(stranger.token)})).statusCode).toBe(404);
    expect((await app.inject({method:'DELETE',url:url+'/'+favoriteId,headers:h(owner.token)})).statusCode).toBe(204);
  });

  it('gates YouTube search behind authentication and official API configuration', async()=>{
    const ip='198.51.100.73';
    const denied=await app.inject({method:'GET',url:'/v1/discovery/youtube?q=music',headers:{'x-forwarded-for':ip}});
    expect(denied.statusCode).toBe(401);
    const owner=await register('youtube-search',ip);
    const headers={authorization:'Bearer '+owner.token,'x-forwarded-for':ip};
    const config=await app.inject({method:'GET',url:'/v1/discovery/youtube/config',headers});
    expect(config.statusCode).toBe(200);
    const invalid=await app.inject({method:'GET',url:'/v1/discovery/youtube?q=a',headers});
    expect(invalid.statusCode).toBe(400);
    if(config.json().enabled===false){
      const missing=await app.inject({method:'GET',url:'/v1/discovery/youtube?q=music',headers});
      expect(missing.statusCode).toBe(503);
      expect(missing.json().error).toBe('youtube_not_configured');
    }
  });

  it('persists playlist references and blocks cross-account membership access', async () => {
    const owner = await register('playlist-item-owner','198.51.100.71');
    const stranger = await register('playlist-item-stranger','198.51.100.71');
    const header = (token: string) => ({ authorization: 'Bearer ' + token, 'x-forwarded-for': '198.51.100.71' });
    const playlist = await app.inject({method:'POST',url:'/v1/playlists',headers:header(owner.token),payload:{name:'Favoritas de nube'}});
    expect(playlist.statusCode).toBe(201);
    const playlistId = playlist.json().playlist.id as string;
    const source = await app.inject({method:'POST',url:'/v1/library/external',headers:header(owner.token),payload:{
      provider:'jamendo',externalId:'45790',title:'Pista permitida',artist:'Artista',
      sourceUrl:'https://www.jamendo.com/track/45790',
    }});
    expect([200,201]).toContain(source.statusCode);
    const references = await app.inject({method:'GET',url:'/v1/library/external',headers:header(owner.token)});
    const trackId = (references.json().items as {id:string;externalId:string}[]).find(x=>x.externalId==='45790')!.id;
    const itemUrl = '/v1/playlists/'+playlistId+'/items';
    const denied = await app.inject({method:'GET',url:itemUrl,headers:header(stranger.token)});
    expect(denied.statusCode).toBe(404);
    const unauthorized = await app.inject({method:'POST',url:itemUrl,headers:header(stranger.token),payload:{source:'external',trackId}});
    expect(unauthorized.statusCode).toBe(404);
    const created = await app.inject({method:'POST',url:itemUrl,headers:header(owner.token),payload:{source:'external',trackId}});
    expect(created.statusCode).toBe(201);
    const duplicate = await app.inject({method:'POST',url:itemUrl,headers:header(owner.token),payload:{source:'external',trackId}});
    expect(duplicate.statusCode).toBe(200);
    const items = await app.inject({method:'GET',url:itemUrl,headers:header(owner.token)});
    expect(items.json().items).toHaveLength(1);
    const itemId = items.json().items[0].id as string;
    expect((await app.inject({method:'DELETE',url:itemUrl+'/'+itemId,headers:header(stranger.token)})).statusCode).toBe(404);
    expect((await app.inject({method:'DELETE',url:itemUrl+'/'+itemId,headers:header(owner.token)})).statusCode).toBe(204);
  });

  it('allows owner-scoped Internet Archive metadata references, not third-party hosts',async()=>{
    const owner=await register('archive-reference','198.51.100.90');
    const stranger=await register('archive-outsider','198.51.100.91');
    const headers=(token:string,ip:string)=>({authorization:'Bearer '+token,'x-forwarded-for':ip});
    const body={
      provider:'internetarchive',externalId:'d6dbfca5e1d500ffa4b94988e6aab3193123b427',
      title:'Public-domain recording',artist:'Open archive',
      sourceUrl:'https://archive.org/details/open_record_2026',
      licenseUrl:'https://creativecommons.org/publicdomain/zero/1.0/',
    };
    const ownerHeaders=headers(owner.token,'198.51.100.90');
    const first=await app.inject({method:'POST',url:'/v1/library/external',headers:ownerHeaders,payload:body});
    expect(first.statusCode).toBe(201);
    const duplicate=await app.inject({method:'POST',url:'/v1/library/external',headers:ownerHeaders,payload:body});
    expect(duplicate.statusCode).toBe(200);
    const invalid=await app.inject({method:'POST',url:'/v1/library/external',headers:ownerHeaders,
      payload:{...body,sourceUrl:'https://archive.org.evil.example/details/open_record_2026'}});
    expect(invalid.statusCode).toBe(400);
    const others=await app.inject({method:'GET',url:'/v1/library/external',headers:headers(stranger.token,'198.51.100.91')});
    expect(others.json().items.some((item:{externalId:string})=>item.externalId===body.externalId)).toBe(false);
    const mine=await app.inject({method:'GET',url:'/v1/library/external',headers:ownerHeaders});
    expect(mine.json().items.some((item:{externalId:string})=>item.externalId===body.externalId)).toBe(true);
    const denied=await app.inject({method:'DELETE',url:'/v1/library/external/internetarchive/'+body.externalId,
      headers:headers(stranger.token,'198.51.100.91')});
    expect(denied.statusCode).toBe(404);
    const deleted=await app.inject({method:'DELETE',url:'/v1/library/external/internetarchive/'+body.externalId,
      headers:ownerHeaders});
    expect(deleted.statusCode).toBe(204);
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

  it('accepts a private invite only once under concurrent requests', async () => {
    const invite = await app.inject({
      method: 'POST', url: '/v1/admin/invites',
      headers: { authorization: 'Bearer ' + ownerToken }, payload: {},
    });
    expect(invite.statusCode).toBe(201);
    const token = invite.json().token as string;
    const attempts = await Promise.all([1, 2].map(async (n) => app.inject({
      method: 'POST', url: '/v1/auth/accept-invite',
      payload: { token, email: 'invite-race-' + n + '-' + Date.now() + '@example.test', password: PASSWORD },
    })));
    expect(attempts.filter(result => result.statusCode === 201)).toHaveLength(1);
    expect(attempts.filter(result => result.statusCode === 401)).toHaveLength(1);
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
      const a = { token: ownerToken };
      const b = { token: memberToken };
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
      expect(strangerList.json().pendingItems).toEqual([]);
      const pendingMine=await app.inject({method:'GET',url:'/v1/library/cloud',
        headers:{...headers(a.token),'x-forwarded-for':'198.51.100.74'}});
      expect(pendingMine.json().pendingItems.some((item:{id:string})=>item.id===id)).toBe(true);
      await pool.query("UPDATE cloud_tracks SET status='ready' WHERE id=$1", [id]);
      const mine = await app.inject({ method: 'GET', url: '/v1/library/cloud', headers: headers(a.token) });
      expect(mine.json().items.some((item: { id: string }) => item.id === id)).toBe(true);
      const playable = await app.inject({ method: 'GET', url: '/v1/library/cloud/' + id + '/play', headers: headers(a.token) });
      expect(playable.statusCode).toBe(200);
      expect(new URL(playable.json().url).searchParams.get('X-Amz-Expires')).toBe('3600');
      const download = await app.inject({method:'GET',url:'/v1/library/cloud/'+id+'/download',headers:headers(a.token)});
      expect(download.statusCode).toBe(200);
      expect(new URL(download.json().url).searchParams.get('response-content-disposition')).toContain('attachment;');
      expect(new URL(download.json().url).searchParams.get('X-Amz-Expires')).toBe('300');
      const deniedDownload = await app.inject({method:'GET',url:'/v1/library/cloud/'+id+'/download',headers:headers(b.token)});
      expect(deniedDownload.statusCode).toBe(404);
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
