import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { createHash, randomBytes } from 'node:crypto';
import { drizzle } from 'drizzle-orm/node-postgres';
import { z } from 'zod';
import { createGuards } from './auth.js';

export function registerRoomWsTickets(app: FastifyInstance, pool: Pool): void {
 const {requireAuth}=createGuards(drizzle(pool));
 app.post('/v1/rooms/:id/ws-ticket',{preHandler:requireAuth,config:{rateLimit:{max:12,timeWindow:'1 minute'}}},async(req,reply)=>{
  const p=z.object({id:z.string().uuid()}).safeParse(req.params);
  if(!p.success)return reply.code(400).send({error:'invalid_room_id'});
  const token=randomBytes(32).toString('base64url');
  const hash=createHash('sha256').update(token).digest('hex');
  const userId=req.principal!.userId,sid=req.principal!.sessionId;
  const row=await pool.query(`
    INSERT INTO room_ws_tickets(token_hash,room_id,user_id,session_id,expires_at)
    SELECT $1,r.id,$3,$4,now()+interval '30 seconds'
    FROM rooms r JOIN room_members m ON m.room_id=r.id AND m.user_id=$3
    JOIN sessions s ON s.id=$4 AND s.user_id=$3 AND s.revoked_at IS NULL AND s.expires_at>now()
    WHERE r.id=$2 AND r.status='active' RETURNING room_id
  `,[hash,p.data.id,userId,sid]);
  if(!row.rowCount)return reply.code(404).send({error:'room_not_found'});
  reply.header('Cache-Control','no-store');
  return {ticket:token,expiresInSeconds:30,endpoint:'/api/room-ws'};
 });
}
