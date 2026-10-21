import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHash, randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import type { FastifyInstance } from 'fastify';
import { buildApp } from './app';

const url=process.env.NEBULA_TEST_DATABASE_URL;
const secret='websocket-test-jwt-secret-000000000000000000000000';
describe.skipIf(!url)('private WebSocket tickets (PostgreSQL)',()=>{
 let pool:Pool,app:FastifyInstance,host='',outsider='',roomId='';
 const auth=(token:string)=>({authorization:'Bearer '+token});
 beforeAll(async()=>{
  pool=new Pool({connectionString:url});
  app=await buildApp({pool,secret,origin:'http://localhost:3000',registrationEnabled:true});
  await app.ready();
  for(let index=0;index<2;index++){
   const user=await app.inject({method:'POST',url:'/v1/auth/register',payload:{
    email:'room-ws-'+randomUUID()+'@example.test',password:'SecureTestPassword123!'
   }});
   expect(user.statusCode).toBe(201);
   if(index===0)host=user.json().accessToken;
   else outsider=user.json().accessToken;
  }
  const room=await app.inject({method:'POST',url:'/v1/rooms',headers:auth(host),
   payload:{name:'WS test',mode:'party'}});
  expect(room.statusCode).toBe(201);
  roomId=room.json().room.id;
 });
 afterAll(async()=>{if(app)await app.close();if(pool)await pool.end();});
 it('rejects unauthenticated and outsider ticket requests',async()=>{
  const path='/v1/rooms/'+roomId+'/ws-ticket';
  expect((await app.inject({method:'POST',url:path})).statusCode).toBe(401);
  expect((await app.inject({method:'POST',url:path,headers:auth(outsider)})).statusCode).toBe(404);
 });
 it('issues an unguessable one-use scoped capability without revealing its raw bytes to SQL',async()=>{
  const response=await app.inject({method:'POST',url:'/v1/rooms/'+roomId+'/ws-ticket',headers:auth(host)});
  expect(response.statusCode).toBe(200);
  expect(response.headers['cache-control']).toContain('no-store');
  const ticket=response.json().ticket as string;
  expect(ticket).toMatch(/^[A-Za-z0-9_-]{43}$/);
  const digest=createHash('sha256').update(ticket).digest('hex');
  const db=await pool.query<{token_hash:string;room_id:string;session_id:string}>(
   'SELECT token_hash,room_id,session_id FROM room_ws_tickets WHERE token_hash=$1',[digest]);
  expect(db.rows).toHaveLength(1);
  expect(db.rows[0].room_id).toBe(roomId);
  expect(db.rows[0].token_hash).not.toBe(ticket);
  const consumed=await pool.query('DELETE FROM room_ws_tickets WHERE token_hash=$1 RETURNING token_hash',[digest]);
  expect(consumed.rowCount).toBe(1);
  expect((await pool.query('DELETE FROM room_ws_tickets WHERE token_hash=$1 RETURNING token_hash',[digest])).rowCount).toBe(0);
 });
 it('does not mint tickets after closing a room',async()=>{
  expect((await app.inject({method:'POST',url:'/v1/rooms/'+roomId+'/close',headers:auth(host)})).statusCode).toBe(204);
  const denied=await app.inject({method:'POST',url:'/v1/rooms/'+roomId+'/ws-ticket',headers:auth(host)});
  expect(denied.statusCode).toBe(404);
 });
});
