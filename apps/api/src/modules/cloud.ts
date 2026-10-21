import type { FastifyInstance } from 'fastify';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { and, desc, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { cloudTracks } from '../db/schema.js';
import { createGuards } from './auth.js';
import {
  MAX_CLOUD_AUDIO_BYTES, audioMimeForFilename, deleteR2Object,
  inspectR2Object, presignR2, readR2Settings,
} from '../storage/r2.js';

const uploadInput = z.object({
  filename: z.string().trim().min(5).max(255),
  size: z.number().int().min(1).max(MAX_CLOUD_AUDIO_BYTES),
  title: z.string().trim().min(1).max(200).optional(),
  artist: z.string().trim().min(1).max(200).optional(),
});
const idInput = z.object({ id: z.string().uuid() });

const projection = {
  id: cloudTracks.id,
  title: cloudTracks.title,
  artist: cloudTracks.artist,
  mimeType: cloudTracks.mimeType,
  byteSize: cloudTracks.byteSize,
  createdAt: cloudTracks.createdAt,
};

export function registerCloudRoutes(app: FastifyInstance, db: NodePgDatabase): void {
  const { requireAuth } = createGuards(db);

  app.get('/v1/library/cloud/config', { preHandler: requireAuth }, async () => ({
    configured: Boolean(readR2Settings()),
    maxBytes: MAX_CLOUD_AUDIO_BYTES,
  }));

  app.get('/v1/library/cloud', { preHandler: requireAuth }, async (request) => {
    const items = await db.select(projection).from(cloudTracks)
      .where(and(eq(cloudTracks.userId, request.principal!.userId), eq(cloudTracks.status, 'ready')))
      .orderBy(desc(cloudTracks.createdAt)).limit(500);
    const pendingItems = await db.select(projection).from(cloudTracks)
      .where(and(eq(cloudTracks.userId,request.principal!.userId),eq(cloudTracks.status,'pending')))
      .orderBy(desc(cloudTracks.createdAt)).limit(50);
    return { items, pendingItems, configured: Boolean(readR2Settings()) };
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
    const extension = data.filename.toLowerCase().split('.').pop()!;
    const id = randomUUID();
    const userId = request.principal!.userId;
    const objectKey = 'users/' + userId + '/' + id + '.' + extension;
    const title = data.title ?? data.filename.replace(/\.[^.]+$/, '').slice(0, 200);
    await db.insert(cloudTracks).values({
      id, userId, objectKey, title, artist: data.artist ?? 'Mi música',
      mimeType, byteSize: data.size, status: 'pending',
    });
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
    return { item };
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
    const [item] = await db.select({ objectKey: cloudTracks.objectKey }).from(cloudTracks)
      .where(and(eq(cloudTracks.id, parsed.data.id), eq(cloudTracks.userId, request.principal!.userId))).limit(1);
    if (!item) return reply.code(404).send({ error: 'cloud_track_not_found' });
    try { await deleteR2Object(settings, item.objectKey); }
    catch { return reply.code(502).send({ error: 'storage_unavailable' }); }
    await db.delete(cloudTracks).where(and(
      eq(cloudTracks.id, parsed.data.id), eq(cloudTracks.userId, request.principal!.userId),
    ));
    return reply.code(204).send();
  });
}
