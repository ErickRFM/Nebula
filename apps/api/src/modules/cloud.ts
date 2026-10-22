import type { FastifyInstance } from 'fastify';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { and, desc, eq, isNull, lt, or, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { cloudTracks } from '../db/schema.js';
import {createCoverTicket,verifyCoverTicket} from '../storage/cover-ticket.js';
import { createGuards } from './auth.js';
import {
  MAX_CLOUD_AUDIO_BYTES, MAX_CLOUD_ARTWORK_BYTES, audioMimeForFilename, deleteR2Object,
  inspectR2Object, presignR2, readR2Settings,
} from '../storage/r2.js';

const uploadInput = z.object({
  filename: z.string().trim().min(5).max(255),
  size: z.number().int().min(1).max(MAX_CLOUD_AUDIO_BYTES),
  title: z.string().trim().min(1).max(200).optional(),
  artist: z.string().trim().min(1).max(200).optional(),
  album: z.string().trim().min(1).max(200).optional(),
  genre: z.string().trim().min(1).max(120).optional(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/).optional(),
});
const idInput = z.object({ id: z.string().uuid() });

const projection = {
  id: cloudTracks.id,
  title: cloudTracks.title,
  artist: cloudTracks.artist,
  album: cloudTracks.album,
  genre: cloudTracks.genre,
  coverObjectKey: cloudTracks.coverObjectKey,
  mimeType: cloudTracks.mimeType,
  byteSize: cloudTracks.byteSize,
  createdAt: cloudTracks.createdAt,
};

const coverInput=z.object({
  contentType:z.enum(['image/png','image/jpeg']),
  size:z.number().int().min(12).max(MAX_CLOUD_ARTWORK_BYTES),
});
const coverCompleteInput=z.object({ticket:z.string().min(32).max(1300)});
const signedCover=<T extends {coverObjectKey:string|null}>(row:T)=>{
  const {coverObjectKey,...publicItem}=row;
  const settings=readR2Settings();
  return {...publicItem,coverUrl:coverObjectKey&&settings?presignR2(settings,'GET',coverObjectKey,3600):null};
};

const searchInput=z.object({
  q:z.string().trim().max(120).default(''),
  limit:z.coerce.number().int().min(1).max(50).default(25),
  cursor:z.string().max(180).optional(),
});
type CloudCursor={t:string;id:string};
const cursorFormat=z.object({t:z.string().datetime({offset:true}),id:z.string().uuid()});
function parseCloudCursor(encoded:string):CloudCursor|null{
  try{
    const result=cursorFormat.safeParse(JSON.parse(Buffer.from(encoded,'base64url').toString('utf8')));
    if(!result.success||!Number.isFinite(Date.parse(result.data.t)))return null;
    return result.data;
  }catch{return null;}
}
function encodeCloudCursor(createdAt:Date,id:string):string{
  return Buffer.from(JSON.stringify({t:createdAt.toISOString(),id})).toString('base64url');
}
const normalizeQuery=(value:string):string=>value.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es').replace(/\s+/g,' ').trim();

export function registerCloudRoutes(app: FastifyInstance, db: NodePgDatabase): void {
  const { requireAuth } = createGuards(db);

  app.get('/v1/library/cloud/config', { preHandler: requireAuth }, async () => ({
    configured: Boolean(readR2Settings()),
    maxBytes: MAX_CLOUD_AUDIO_BYTES,
  }));

  app.get('/v1/library/cloud', { preHandler: requireAuth }, async (request,reply) => {
    reply.header('Cache-Control','no-store');
    const items = await db.select(projection).from(cloudTracks)
      .where(and(eq(cloudTracks.userId, request.principal!.userId), eq(cloudTracks.status, 'ready')))
      .orderBy(desc(cloudTracks.createdAt)).limit(500);
    const pendingItems = await db.select(projection).from(cloudTracks)
      .where(and(eq(cloudTracks.userId,request.principal!.userId),eq(cloudTracks.status,'pending')))
      .orderBy(desc(cloudTracks.createdAt)).limit(50);
    return { items:items.map(signedCover), pendingItems:pendingItems.map(signedCover), configured: Boolean(readR2Settings()) };
  });

  app.get('/v1/library/cloud/pending',{preHandler:requireAuth},async(request,reply)=>{
    reply.header('Cache-Control','no-store');
    const pendingItems=await db.select(projection).from(cloudTracks)
      .where(and(eq(cloudTracks.userId,request.principal!.userId),eq(cloudTracks.status,'pending')))
      .orderBy(desc(cloudTracks.createdAt),desc(cloudTracks.id)).limit(50);
    return {pendingItems:pendingItems.map(signedCover),configured:Boolean(readR2Settings())};
  });

  // Authenticated search across all owner rows, not just legacy 500.
  app.get('/v1/library/cloud/search',{preHandler:requireAuth},async(request,reply)=>{
    const input=searchInput.safeParse(request.query);
    if(!input.success)return reply.code(400).send({error:'invalid_cloud_search'});
    const cursor=input.data.cursor?parseCloudCursor(input.data.cursor):null;
    if(input.data.cursor&&!cursor)return reply.code(400).send({error:'invalid_cloud_cursor'});
    const normalized=normalizeQuery(input.data.q);
    if(normalized.length===1)return reply.code(400).send({error:'cloud_search_too_short'});
    const conditions=[
      eq(cloudTracks.userId,request.principal!.userId),
      eq(cloudTracks.status,'ready'),
    ];
    if(normalized.length>=2){
      // position() treats SQL wildcard characters as literal query text.
      conditions.push(sql`position(${normalized} in translate(lower(concat_ws(' ',${cloudTracks.title},${cloudTracks.artist},${cloudTracks.album},${cloudTracks.genre})),'áéíóúüñ','aeiouun')) > 0`);
    }
    if(cursor){
      const timestamp=new Date(cursor.t);
      conditions.push(or(
        lt(cloudTracks.createdAt,timestamp),
        and(eq(cloudTracks.createdAt,timestamp),lt(cloudTracks.id,cursor.id)),
      )!);
    }
    const rows=await db.select(projection).from(cloudTracks)
      .where(and(...conditions))
      .orderBy(desc(cloudTracks.createdAt),desc(cloudTracks.id))
      .limit(input.data.limit+1);
    const hasMore=rows.length>input.data.limit;
    const items=rows.slice(0,input.data.limit);
    const last=items.at(-1);
    reply.header('Cache-Control','no-store');
    return {items:items.map(signedCover),hasMore,nextCursor:hasMore&&last?encodeCloudCursor(last.createdAt,last.id):null};
  });

  app.post('/v1/library/cloud/uploads', {
    preHandler: requireAuth, config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const settings = readR2Settings();
    if (!settings) return reply.code(503).send({ error: 'storage_not_configured' });
    const parsed = uploadInput.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_audio_upload' });
    const data = parsed.data;
    const mimeType = audioMimeForFilename(data.filename);
    if (!mimeType) return reply.code(400).send({ error: 'unsupported_audio_format' });
    if(data.sha256){
      const [existing]=await db.select({id:cloudTracks.id,status:cloudTracks.status}).from(cloudTracks)
        .where(and(eq(cloudTracks.userId,request.principal!.userId),eq(cloudTracks.sha256,data.sha256))).limit(1);
      if(existing)return reply.code(409).send({error:'duplicate_cloud_audio',existingId:existing.id,status:existing.status});
    }
    const extension = data.filename.toLowerCase().split('.').pop()!;
    const id = randomUUID();
    const userId = request.principal!.userId;
    const objectKey = 'users/' + userId + '/' + id + '.' + extension;
    const title = data.title ?? data.filename.replace(/\.[^.]+$/, '').slice(0, 200);
    try {
      await db.insert(cloudTracks).values({
        id,userId,objectKey,title,artist:data.artist??'Mi música',
        album:data.album??'Archivos importados',genre:data.genre??'Mis canciones',sha256:data.sha256,
        mimeType,byteSize:data.size,status:'pending',
      });
    }catch(error){
      if((error as {code?:string}).code==='23505'&&data.sha256)
        return reply.code(409).send({error:'duplicate_cloud_audio'});
      throw error;
    }
    return reply.code(201).send({
      id, uploadUrl: presignR2(settings, 'PUT', objectKey, 600, mimeType),
      contentType: mimeType, expiresInSeconds: 600,
    });
  });

  app.post('/v1/library/cloud/:id/complete', { preHandler: requireAuth }, async (request, reply) => {
    const settings = readR2Settings();
    if (!settings) return reply.code(503).send({ error: 'storage_not_configured' });
    const parsed = idInput.safeParse(request.params);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_track_id' });
    const [row] = await db.select().from(cloudTracks)
      .where(and(eq(cloudTracks.id, parsed.data.id), eq(cloudTracks.userId, request.principal!.userId))).limit(1);
    if (!row) return reply.code(404).send({ error: 'cloud_track_not_found' });
    if (row.status !== 'ready') {
      let object: Awaited<ReturnType<typeof inspectR2Object>>;
      try { object = await inspectR2Object(settings, row.objectKey); }
      catch { return reply.code(502).send({ error: 'storage_unavailable' }); }
      if (!object) return reply.code(409).send({ error: 'upload_not_found' });
      if (object.size !== row.byteSize || object.contentType !== row.mimeType) {
        return reply.code(422).send({ error: 'uploaded_file_mismatch' });
      }
      await db.update(cloudTracks).set({ status: 'ready' })
        .where(and(eq(cloudTracks.id, row.id), eq(cloudTracks.userId, request.principal!.userId)));
    }
    const [item] = await db.select(projection).from(cloudTracks)
      .where(and(eq(cloudTracks.id, row.id), eq(cloudTracks.userId, request.principal!.userId))).limit(1);
    return { item:item?signedCover(item):null };
  });

  // A ticket reserves a fresh immutable key. Unlike a PUT to trackId.png,
  // an interrupted/concurrent upload never changes the selected cover.
  app.post('/v1/library/cloud/:id/cover-ticket',{
    preHandler:requireAuth,config:{rateLimit:{max:30,timeWindow:'1 minute'}},
  },async(request,reply)=>{
    const settings=readR2Settings();
    if(!settings)return reply.code(503).send({error:'storage_not_configured'});
    const params=idInput.safeParse(request.params);
    const body=coverInput.safeParse(request.body);
    if(!params.success||!body.success)return reply.code(400).send({error:'invalid_cover_upload'});
    const userId=request.principal!.userId;
    const [track]=await db.select({id:cloudTracks.id,coverObjectKey:cloudTracks.coverObjectKey}).from(cloudTracks)
      .where(and(eq(cloudTracks.id,params.data.id),eq(cloudTracks.userId,userId),eq(cloudTracks.status,'ready'))).limit(1);
    if(!track)return reply.code(404).send({error:'cloud_track_not_found'});
    const result=createCoverTicket(settings,{
      userId,trackId:track.id,previousKey:track.coverObjectKey,
      contentType:body.data.contentType,size:body.data.size,
    });
    reply.header('Cache-Control','no-store');
    return {ticket:result.token,
      uploadUrl:presignR2(settings,'PUT',result.key,600,body.data.contentType),
      contentType:body.data.contentType,expiresInSeconds:600,maxBytes:MAX_CLOUD_ARTWORK_BYTES};
  });

  app.post('/v1/library/cloud/:id/cover-complete',{preHandler:requireAuth},async(request,reply)=>{
    const settings=readR2Settings();
    if(!settings)return reply.code(503).send({error:'storage_not_configured'});
    const params=idInput.safeParse(request.params);
    const body=coverCompleteInput.safeParse(request.body);
    if(!params.success||!body.success)return reply.code(400).send({error:'invalid_cover_completion'});
    const userId=request.principal!.userId;
    const ticket=verifyCoverTicket(settings,body.data.ticket,userId,params.data.id);
    if(!ticket)return reply.code(400).send({error:'invalid_or_expired_cover_ticket'});
    const [track]=await db.select({id:cloudTracks.id}).from(cloudTracks)
      .where(and(eq(cloudTracks.id,params.data.id),eq(cloudTracks.userId,userId),eq(cloudTracks.status,'ready'))).limit(1);
    if(!track)return reply.code(404).send({error:'cloud_track_not_found'});
    let object:Awaited<ReturnType<typeof inspectR2Object>>;
    try{object=await inspectR2Object(settings,ticket.key);}
    catch{return reply.code(502).send({error:'storage_unavailable'});}
    if(!object)return reply.code(409).send({error:'cover_not_uploaded'});
    if(object.size!==ticket.size||object.contentType!==ticket.contentType||object.size>MAX_CLOUD_ARTWORK_BYTES)
      return reply.code(422).send({error:'cover_mismatch'});
    // Compare-and-swap prevents an older ticket completing after a newer cover.
    const [updated]=await db.update(cloudTracks).set({coverObjectKey:ticket.key})
      .where(and(eq(cloudTracks.id,track.id),eq(cloudTracks.userId,userId),eq(cloudTracks.status,'ready'),
        ticket.previousKey===null?isNull(cloudTracks.coverObjectKey):eq(cloudTracks.coverObjectKey,ticket.previousKey)))
      .returning({id:cloudTracks.id});
    if(!updated)return reply.code(409).send({error:'cover_replaced_during_upload'});
    // Previous R2 tokens may live for up to 1h; delete best effort only after
    // the new database pointer is committed and never on CAS failure.
    if(ticket.previousKey&&ticket.previousKey!==ticket.key){
      try{await deleteR2Object(settings,ticket.previousKey);}
      catch{app.log.warn({trackId:track.id},'Previous private cover cleanup failed after replacement');}
    }
    reply.header('Cache-Control','no-store');
    return {coverUrl:presignR2(settings,'GET',ticket.key,3600)};
  });

  // Refresh only an existing cover for its owner. Keep the R2 key hidden.
  app.get('/v1/library/cloud/:id/cover',{preHandler:requireAuth},async(request,reply)=>{
    const settings=readR2Settings();
    if(!settings)return reply.code(503).send({error:'storage_not_configured'});
    const params=idInput.safeParse(request.params);
    if(!params.success)return reply.code(400).send({error:'invalid_track_id'});
    const [track]=await db.select({key:cloudTracks.coverObjectKey}).from(cloudTracks)
      .where(and(eq(cloudTracks.id,params.data.id),eq(cloudTracks.userId,request.principal!.userId),
        eq(cloudTracks.status,'ready'))).limit(1);
    if(!track||!track.key)return reply.code(404).send({error:'cover_not_found'});
    reply.header('Cache-Control','no-store');
    return {coverUrl:presignR2(settings,'GET',track.key,3600),expiresInSeconds:3600};
  });

  app.get('/v1/library/cloud/:id/play', { preHandler: requireAuth }, async (request, reply) => {
    const settings = readR2Settings();
    if (!settings) return reply.code(503).send({ error: 'storage_not_configured' });
    const parsed = idInput.safeParse(request.params);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_track_id' });
    const [item] = await db.select({ objectKey: cloudTracks.objectKey }).from(cloudTracks)
      .where(and(
        eq(cloudTracks.id, parsed.data.id), eq(cloudTracks.userId, request.principal!.userId),
        eq(cloudTracks.status, 'ready'),
      )).limit(1);
    if (!item) return reply.code(404).send({ error: 'cloud_track_not_found' });
    reply.header('Cache-Control', 'no-store');
    return { url: presignR2(settings, 'GET', item.objectKey, 3600), expiresInSeconds: 3600 };
  });

  app.get('/v1/library/cloud/:id/download', { preHandler: requireAuth }, async (request, reply) => {
    const settings = readR2Settings();
    if (!settings) return reply.code(503).send({error:'storage_not_configured'});
    const parsed = idInput.safeParse(request.params);
    if (!parsed.success) return reply.code(400).send({error:'invalid_track_id'});
    const [track] = await db.select({objectKey:cloudTracks.objectKey,title:cloudTracks.title}).from(cloudTracks)
      .where(and(eq(cloudTracks.id,parsed.data.id),eq(cloudTracks.userId,request.principal!.userId),
        eq(cloudTracks.status,'ready'))).limit(1);
    if (!track) return reply.code(404).send({error:'cloud_track_not_found'});
    const extension=track.objectKey.split('.').pop() ?? 'mp3';
    const base=track.title.normalize('NFKD').replace(/[^a-zA-Z0-9_-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,100) || 'mi-cancion';
    const filename=base+'.'+extension;
    reply.header('Cache-Control','no-store');
    return {url:presignR2(settings,'GET',track.objectKey,300,undefined,undefined,filename),filename,expiresInSeconds:300};
  });

  app.delete('/v1/library/cloud/:id', { preHandler: requireAuth }, async (request, reply) => {
    const settings = readR2Settings();
    if (!settings) return reply.code(503).send({ error: 'storage_not_configured' });
    const parsed = idInput.safeParse(request.params);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_track_id' });
    const [item] = await db.select({ objectKey: cloudTracks.objectKey,coverObjectKey:cloudTracks.coverObjectKey }).from(cloudTracks)
      .where(and(eq(cloudTracks.id, parsed.data.id), eq(cloudTracks.userId, request.principal!.userId))).limit(1);
    if (!item) return reply.code(404).send({ error: 'cloud_track_not_found' });
    try { await deleteR2Object(settings, item.objectKey); if(item.coverObjectKey)await deleteR2Object(settings,item.coverObjectKey); }
    catch { return reply.code(502).send({ error: 'storage_unavailable' }); }
    await db.delete(cloudTracks).where(and(
      eq(cloudTracks.id, parsed.data.id), eq(cloudTracks.userId, request.principal!.userId),
    ));
    return reply.code(204).send();
  });
}
