import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { createGuards } from './auth.js';

const params=z.object({id:z.string().uuid()});
const withRequest=params.extend({requestId:z.string().uuid()});
const proposal=z.object({title:z.string().trim().min(1).max(120),artist:z.string().trim().min(1).max(120)});

/** Metadata-only room suggestions: members never gain another account's media rights. */
export function registerRoomRequestRoutes(app:FastifyInstance,pool:Pool):void {
 const {requireAuth}=createGuards(drizzle(pool));
 const check=async(roomId:string,userId:string)=> {
  const result=await pool.query(`SELECT 1 FROM rooms r JOIN room_members m ON m.room_id=r.id
   WHERE r.id=$1 AND m.user_id=$2 AND r.status='active'`,[roomId,userId]);
  return Boolean(result.rowCount);
 };
 app.get('/v1/rooms/:id/requests',{preHandler:requireAuth},async(req,reply)=>{
  const p=params.safeParse(req.params);
  if(!p.success)return reply.code(400).send({error:'invalid_room'});
  if(!await check(p.data.id,req.principal!.userId))return reply.code(404).send({error:'room_not_found'});
  const result=await pool.query(`
   SELECT x.id,x.user_id AS "userId",x.title,x.artist,x.created_at AS "createdAt",
    (SELECT count(*)::int FROM room_request_votes v WHERE v.request_id=x.id) AS votes,
    EXISTS(SELECT 1 FROM room_request_votes own WHERE own.request_id=x.id AND own.user_id=$2) AS "votedByMe"
   FROM room_requests x WHERE x.room_id=$1 ORDER BY votes DESC,x.created_at ASC LIMIT 100
  `,[p.data.id,req.principal!.userId]);
  reply.header('Cache-Control','no-store');
  return {items:result.rows};
 });
 app.post('/v1/rooms/:id/requests',{
  preHandler:requireAuth,config:{rateLimit:{max:10,timeWindow:'1 minute'}}
 },async(req,reply)=>{
  const p=params.safeParse(req.params),body=proposal.safeParse(req.body);
  if(!p.success||!body.success)return reply.code(400).send({error:'invalid_request'});
  const client=await pool.connect();
  try{
   await client.query('BEGIN');
   const member=await client.query(`SELECT r.id FROM rooms r JOIN room_members m ON m.room_id=r.id
    WHERE r.id=$1 AND m.user_id=$2 AND r.status='active' FOR UPDATE OF r`,
    [p.data.id,req.principal!.userId]);
   if(!member.rowCount){await client.query('ROLLBACK');return reply.code(404).send({error:'room_not_found'});}
   const counts=await client.query<{total:string;mine:string}>(`
    SELECT count(*)::text AS total,
      count(*) FILTER(WHERE user_id=$2)::text AS mine
    FROM room_requests WHERE room_id=$1`,[p.data.id,req.principal!.userId]);
   if(Number(counts.rows[0].total)>=100||Number(counts.rows[0].mine)>=5){
    await client.query('ROLLBACK');return reply.code(409).send({error:'request_limit_reached'});
   }
   const result=await client.query(`
    INSERT INTO room_requests(id,room_id,user_id,title,artist) VALUES($1,$2,$3,$4,$5)
    RETURNING id,title,artist`,[randomUUID(),p.data.id,req.principal!.userId,body.data.title,body.data.artist]);
   await client.query('COMMIT');
   return reply.code(201).send({item:result.rows[0]});
  }catch(e){await client.query('ROLLBACK');throw e}
  finally{client.release();}
 });
 app.post('/v1/rooms/:id/requests/:requestId/vote',{
  preHandler:requireAuth,config:{rateLimit:{max:20,timeWindow:'1 minute'}}
 },async(req,reply)=>{
  const p=withRequest.safeParse(req.params);
  if(!p.success)return reply.code(400).send({error:'invalid_request_id'});
  const result=await pool.query(`
   INSERT INTO room_request_votes(room_id,request_id,user_id)
   SELECT x.room_id,x.id,$3 FROM room_requests x
   JOIN rooms r ON r.id=x.room_id AND r.status='active'
   JOIN room_members m ON m.room_id=r.id AND m.user_id=$3
   WHERE x.id=$2 AND x.room_id=$1 ON CONFLICT DO NOTHING RETURNING request_id
  `,[p.data.id,p.data.requestId,req.principal!.userId]);
  if(!result.rowCount) {
   if(!await check(p.data.id,req.principal!.userId))return reply.code(404).send({error:'room_not_found'});
   const exists=await pool.query('SELECT 1 FROM room_requests WHERE id=$1 AND room_id=$2',
    [p.data.requestId,p.data.id]);
   if(!exists.rowCount)return reply.code(404).send({error:'request_not_found'});
   return {voted:true}; // idempotent vote only for room members
  }
  return {voted:true};
 });
 app.delete('/v1/rooms/:id/requests/:requestId',{preHandler:requireAuth},async(req,reply)=>{
  const p=withRequest.safeParse(req.params);
  if(!p.success)return reply.code(400).send({error:'invalid_request_id'});
  const removed=await pool.query(`
    DELETE FROM room_requests x USING rooms r
    WHERE x.room_id=$1 AND x.id=$2 AND r.id=x.room_id AND r.status='active'
      AND (x.user_id=$3 OR r.owner_user_id=$3)
    RETURNING x.id
  `,[p.data.id,p.data.requestId,req.principal!.userId]);
  if(!removed.rowCount)return reply.code(404).send({error:'request_not_found'});
  return reply.code(204).send();
 });
}
