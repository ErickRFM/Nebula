import type {FastifyInstance} from 'fastify';
import type {NodePgDatabase} from 'drizzle-orm/node-postgres';
import {and, desc, eq} from 'drizzle-orm';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {favoriteItems, cloudTracks, externalLibraryItems} from '../db/schema.js';
import {createGuards} from './auth.js';

const input=z.object({source:z.enum(['cloud','external']),trackId:z.string().uuid()});
const pathParams=z.object({id:z.string().uuid()});

export function registerFavoriteRoutes(app:FastifyInstance,db:NodePgDatabase):void {
 const {requireAuth}=createGuards(db);
 app.get('/v1/library/favorites',{preHandler:requireAuth},async request=>{
   const items=await db.select({
     id:favoriteItems.id,cloudTrackId:favoriteItems.cloudTrackId,
     externalItemId:favoriteItems.externalItemId,createdAt:favoriteItems.createdAt,
   }).from(favoriteItems).where(eq(favoriteItems.userId,request.principal!.userId))
     .orderBy(desc(favoriteItems.createdAt)).limit(1000);
   return {items};
 });
 app.post('/v1/library/favorites',{preHandler:requireAuth},async(request,reply)=>{
   const parsed=input.safeParse(request.body);
   if(!parsed.success)return reply.code(400).send({error:'invalid_favorite'});
   const userId=request.principal!.userId;
   if(parsed.data.source==='cloud'){
     const [track]=await db.select({id:cloudTracks.id}).from(cloudTracks).where(and(
       eq(cloudTracks.id,parsed.data.trackId),eq(cloudTracks.userId,userId),eq(cloudTracks.status,'ready')
     )).limit(1);
     if(!track)return reply.code(404).send({error:'track_not_found'});
   }else{
     const [track]=await db.select({id:externalLibraryItems.id}).from(externalLibraryItems).where(and(
       eq(externalLibraryItems.id,parsed.data.trackId),eq(externalLibraryItems.userId,userId)
     )).limit(1);
     if(!track)return reply.code(404).send({error:'track_not_found'});
   }
   const itemId=randomUUID();
   const [created]=await db.insert(favoriteItems).values({
     id:itemId,userId,
     ...(parsed.data.source==='cloud'?{cloudTrackId:parsed.data.trackId}:{externalItemId:parsed.data.trackId}),
   }).onConflictDoNothing().returning({id:favoriteItems.id});
   return reply.code(created?201:200).send({created:Boolean(created)});
 });
 app.delete('/v1/library/favorites/:id',{preHandler:requireAuth},async(request,reply)=>{
   const parsed=pathParams.safeParse(request.params);
   if(!parsed.success)return reply.code(400).send({error:'invalid_favorite_id'});
   const [deleted]=await db.delete(favoriteItems).where(and(
     eq(favoriteItems.id,parsed.data.id),eq(favoriteItems.userId,request.principal!.userId)
   )).returning({id:favoriteItems.id});
   if(!deleted)return reply.code(404).send({error:'favorite_not_found'});
   return reply.code(204).send();
 });
}
