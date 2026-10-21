import { afterAll,beforeAll,describe,expect,it } from 'vitest';
import { Pool } from 'pg';
import type { FastifyInstance } from 'fastify';
import { buildApp } from './app';

const url=process.env.NEBULA_TEST_DATABASE_URL;
const secret='dj-room-test-only-secret-0000000000000000000';
describe.skipIf(!url)('DJ room suggestions and voting (PostgreSQL)',()=>{
 let pool:Pool,app:FastifyInstance,host='',guest='',outsider='',roomId='',requestId='';
 const auth=(token:string)=>({authorization:'Bearer '+token});
 beforeAll(async()=>{
  pool=new Pool({connectionString:url});
  app=await buildApp({pool,secret,origin:'http://localhost:3000',registrationEnabled:true});
  await app.ready();
  const keys:string[]=[];
  for(let i=0;i<3;i++){
   const result=await app.inject({method:'POST',url:'/v1/auth/register',
    payload:{email:'dj-'+crypto.randomUUID()+'@example.test',password:'SecureTestPassword123!'}});
   expect(result.statusCode).toBe(201);
   keys.push(result.json().accessToken);
  }
  [host,guest,outsider]=keys;
  const created=await app.inject({method:'POST',url:'/v1/rooms',headers:auth(host),
   payload:{name:'DJ restricted',mode:'party'}});
  roomId=created.json().room.id;
  const joined=await app.inject({method:'POST',url:'/v1/rooms/join',headers:auth(guest),
   payload:{code:created.json().inviteCode}});
  expect(joined.statusCode).toBe(200);
 });
 afterAll(async()=>{if(app)await app.close();if(pool)await pool.end();});
 it('prevents outsiders from inspecting or submitting private room suggestions',async()=>{
  const url='/v1/rooms/'+roomId+'/requests';
  expect((await app.inject({method:'GET',url})).statusCode).toBe(401);
  expect((await app.inject({method:'GET',url,headers:auth(outsider)})).statusCode).toBe(404);
  expect((await app.inject({method:'POST',url,headers:auth(outsider),
   payload:{title:'secret song',artist:'secret artist'}})).statusCode).toBe(404);
 });
 it('validates participant proposals and makes private metadata visible to the host',async()=>{
  const url='/v1/rooms/'+roomId+'/requests';
  expect((await app.inject({method:'POST',url,headers:auth(guest),
   payload:{title:'',artist:'A'}})).statusCode).toBe(400);
  const result=await app.inject({method:'POST',url,headers:auth(guest),
   payload:{title:'Song proposed',artist:'Member'}});
  expect(result.statusCode).toBe(201);
  requestId=result.json().item.id;
  const listing=await app.inject({method:'GET',url,headers:auth(host)});
  expect(listing.statusCode).toBe(200);
  expect(listing.json().items.some((x:{id:string})=>x.id===requestId)).toBe(true);
 });
 it('deduplicates votes, denies outsider votes and rejects wrong ids',async()=>{
  const base='/v1/rooms/'+roomId+'/requests/'+requestId+'/vote';
  expect((await app.inject({method:'POST',url:base,headers:auth(outsider)})).statusCode).toBe(404);
  expect((await app.inject({method:'POST',url:base,headers:auth(host)})).statusCode).toBe(200);
  expect((await app.inject({method:'POST',url:base,headers:auth(host)})).statusCode).toBe(200);
  const wrong=await app.inject({method:'POST',url:'/v1/rooms/'+roomId+'/requests/'+crypto.randomUUID()+'/vote',headers:auth(host)});
  expect(wrong.statusCode).toBe(404);
  const listing=await app.inject({method:'GET',url:'/v1/rooms/'+roomId+'/requests',headers:auth(host)});
  const current=listing.json().items.find((x:{id:string})=>x.id===requestId);
  expect(current.votes).toBe(1);
  expect(current.votedByMe).toBe(true);
 });
 it('allows the host to moderate guest requests',async()=>{
  const path='/v1/rooms/'+roomId+'/requests/'+requestId;
  expect((await app.inject({method:'DELETE',url:path,headers:auth(outsider)})).statusCode).toBe(404);
  expect((await app.inject({method:'DELETE',url:path,headers:auth(host)})).statusCode).toBe(204);
  const list=await app.inject({method:'GET',url:'/v1/rooms/'+roomId+'/requests',headers:auth(guest)});
  expect(list.json().items).toHaveLength(0);
 });
});
