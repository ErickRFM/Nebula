import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {Pool} from 'pg';
import type {FastifyInstance} from 'fastify';
import {buildApp} from './app';

const url=process.env.NEBULA_TEST_DATABASE_URL;
describe.skipIf(!url)('authenticated API backed by PostgreSQL',()=>{
  let pool:Pool;
  let app:FastifyInstance;
  beforeAll(async()=>{
    pool=new Pool({connectionString:url});
    app=await buildApp({pool,secret:'integration-test-not-for-production-000000001',origin:'http://localhost:3000'});
    await app.ready();
  });
  afterAll(async()=>{if(app)await app.close();if(pool)await pool.end();});

  async function register(prefix:string){
    const email=prefix+Date.now()+Math.random().toString(36).slice(2)+'@example.test';
    const result=await app.inject({method:'POST',url:'/v1/auth/register',payload:{email,password:'SecureTestPassword123!'}});
    expect(result.statusCode).toBe(201);
    return {email,token:result.json().accessToken as string};
  }

  it('rejects public registration when private mode is enabled',async()=>{
    const privateApp=await buildApp({pool,secret:'private-test-only-jwt-secret-000000000000000',origin:'http://localhost:3000',registrationEnabled:false});
    try {
      const response=await privateApp.inject({method:'POST',url:'/v1/auth/register',
        payload:{email:'unauthorized@example.test',password:'NotAllowedToJoin123!'}});
      expect(response.statusCode).toBe(403);
      expect(response.json().error).toBe('registration_closed');
      const config=await privateApp.inject({method:'GET',url:'/v1/auth/config'});
      expect(config.json().registrationOpen).toBe(false);
    } finally {await privateApp.close();}
  });

  it('protects MusicBrainz metadata lookup and rejects invalid search',async()=>{
    const denied=await app.inject({method:'GET',url:'/v1/metadata/musicbrainz?q=music'});
    expect(denied.statusCode).toBe(401);
    const {token}=await register('metadata');
    const invalid=await app.inject({method:'GET',url:'/v1/metadata/musicbrainz?q=a',
      headers:{authorization:'Bearer '+token}});
    expect(invalid.statusCode).toBe(400);
  });

  it('health reports database connectivity',async()=>{
    const response=await app.inject({method:'GET',url:'/v1/health'});
    expect(response.statusCode).toBe(200);
    expect(response.json().status).toBe('ok');
  });

  it('registers and signs in using an unguessable bearer token',async()=>{
    const {email,token}=await register('account');
    expect(token.split('.').length).toBe(3);
    const profile=await app.inject({method:'GET',url:'/v1/me',headers:{authorization:'Bearer '+token}});
    expect(profile.statusCode).toBe(200);
    expect(profile.json().user.email).toBe(email);
    const bad=await app.inject({method:'GET',url:'/v1/me'});
    expect(bad.statusCode).toBe(401);
    const login=await app.inject({method:'POST',url:'/v1/auth/login',payload:{email,password:'SecureTestPassword123!'}});
    expect(login.statusCode).toBe(200);
    const invalid=await app.inject({method:'POST',url:'/v1/auth/login',payload:{email,password:'NotThePassword123'}});
    expect(invalid.statusCode).toBe(401);
  });

  it('enforces ownership on playlist list, rename and delete',async()=>{
    const a=await register('owner');
    const b=await register('viewer');
    const created=await app.inject({method:'POST',url:'/v1/playlists',headers:{authorization:'Bearer '+a.token},payload:{name:'  Mi música  '}});
    expect(created.statusCode).toBe(201);
    const id=created.json().playlist.id as string;
    const visible=await app.inject({method:'GET',url:'/v1/playlists',headers:{authorization:'Bearer '+a.token}});
    expect(visible.json().items.some((p:{id:string})=>p.id===id)).toBe(true);
    const hidden=await app.inject({method:'GET',url:'/v1/playlists',headers:{authorization:'Bearer '+b.token}});
    expect(hidden.json().items.some((p:{id:string})=>p.id===id)).toBe(false);
    const blocked=await app.inject({method:'PATCH',url:'/v1/playlists/'+id,headers:{authorization:'Bearer '+b.token},payload:{name:'intruder'}});
    expect(blocked.statusCode).toBe(404);
    const deleted=await app.inject({method:'DELETE',url:'/v1/playlists/'+id,headers:{authorization:'Bearer '+b.token}});
    expect(deleted.statusCode).toBe(404);
    const renamed=await app.inject({method:'PATCH',url:'/v1/playlists/'+id,headers:{authorization:'Bearer '+a.token},payload:{name:'Renombrada'}});
    expect(renamed.statusCode).toBe(200);
    const removed=await app.inject({method:'DELETE',url:'/v1/playlists/'+id,headers:{authorization:'Bearer '+a.token}});
    expect(removed.statusCode).toBe(204);
  });
  it('requires authentication and validates provider search parameters',async()=>{
    const denied=await app.inject({method:'GET',url:'/v1/discovery/search?q=music'});
    expect(denied.statusCode).toBe(401);
    const {token}=await register('discovery');
    const headers={authorization:'Bearer '+token};
    const providers=await app.inject({method:'GET',url:'/v1/discovery/providers',headers});
    expect(providers.statusCode).toBe(200);
    expect(providers.json().providers.some((p:{id:string})=>p.id==='jamendo')).toBe(true);
    const invalid=await app.inject({method:'GET',url:'/v1/discovery/search?q=a',headers});
    expect(invalid.statusCode).toBe(400);
    const disabled=await app.inject({method:'GET',url:'/v1/discovery/search?q=ambient&provider=jamendo',headers});
    expect(disabled.statusCode).toBe(200);
    expect(disabled.json().items).toEqual([]);
    expect(disabled.json().disabledProviders).toContain('jamendo');
  });

  it('stores external references only for owner and de-duplicates saves',async()=>{
    const owner=await register('reference-owner');
    const stranger=await register('reference-stranger');
    const body={provider:'jamendo',externalId:'12345',title:'Mi canción',artist:'Demo',
      sourceUrl:'https://www.jamendo.com/track/12345'};
    const header=(token:string)=>({authorization:'Bearer '+token});
    const saved=await app.inject({method:'POST',url:'/v1/library/external',headers:header(owner.token),payload:body});
    expect(saved.statusCode).toBe(201);
    const duplicate=await app.inject({method:'POST',url:'/v1/library/external',headers:header(owner.token),payload:body});
    expect(duplicate.statusCode).toBe(200);
    expect(duplicate.json().created).toBe(false);
    const mine=await app.inject({method:'GET',url:'/v1/library/external',headers:header(owner.token)});
    expect(mine.json().items.some((x:{externalId:string})=>x.externalId==='12345')).toBe(true);
    const other=await app.inject({method:'GET',url:'/v1/library/external',headers:header(stranger.token)});
    expect(other.json().items.some((x:{externalId:string})=>x.externalId==='12345')).toBe(false);
    const blocked=await app.inject({method:'DELETE',url:'/v1/library/external/jamendo/12345',headers:header(stranger.token)});
    expect(blocked.statusCode).toBe(404);
    const removed=await app.inject({method:'DELETE',url:'/v1/library/external/jamendo/12345',headers:header(owner.token)});
    expect(removed.statusCode).toBe(204);
    const denied=await app.inject({method:'GET',url:'/v1/library/external'});
    expect(denied.statusCode).toBe(401);
  });

});
