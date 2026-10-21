import Fastify, { type FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import { drizzle } from 'drizzle-orm/node-postgres';
import { and, desc, eq } from 'drizzle-orm';
import type { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { playlists, playlistItems, cloudTracks, users, externalLibraryItems } from './db/schema.js';
import { externalInput, externalDelete } from './library/external-input.js';
import { DiscoveryService } from './discovery/service.js';
import { MusicBrainzMetadata } from './metadata/musicbrainz.js';
import { loadConfig } from './config.js';
import { createGuards, registerAdminRoutes, registerAuthRoutes } from './modules/auth.js';
import { registerCloudRoutes } from './modules/cloud.js';
import { registerFavoriteRoutes } from './modules/favorites.js';
import { registerRoomRoutes } from './modules/rooms.js';
import { classifyDatabaseFailure, describeDatabaseConnectionShape } from './db/diagnostics.js';
import './types.js';

type Options = { pool: Pool; secret: string; origin: string; registrationEnabled?: boolean };
const playlistInput = z.object({ name: z.string().trim().min(1).max(80) });
const idInput = z.object({ id: z.string().uuid() });
const discoveryInput = z.object({
  q: z.string().trim().min(2).max(100),
  page: z.coerce.number().int().min(1).max(20).default(1),
  limit: z.coerce.number().int().min(1).max(25).default(12),
  provider: z.enum(['all', 'jamendo', 'openverse', 'audius']).default('all'),
});

function fail(reason: string) {
  return { error: reason };
}

function principalId(request: FastifyRequest): string {
  return request.principal!.userId;
}

export async function buildApp({ pool, secret, origin, registrationEnabled }: Options) {
  const config = loadConfig(process.env, { jwtSecret: secret, corsOrigin: origin, allowPublicRegistration: registrationEnabled });
  if (config.jwtSecret.length < 32) throw new Error('API_JWT_SECRET must contain at least 32 characters');
  const app = Fastify({ logger: false, bodyLimit: 50_000, trustProxy: true });
  const db = drizzle(pool);
  const discovery = new DiscoveryService();
  const musicBrainz = new MusicBrainzMetadata();
  const { requireAuth } = createGuards(db);
  await app.register(cors, {
    origin: config.corsOrigin,
    credentials: true,
    allowedHeaders: ['content-type', 'authorization', 'x-nebula-client'],
  });
  await app.register(cookie);
  await app.register(jwt, { secret: config.jwtSecret, sign: { expiresIn: config.accessTtlSeconds } });
  // A private Party Sound room may have up to 16 phones behind one Wi-Fi NAT.
  // A 120/minute shared-IP ceiling caused legitimate room polling and E2E
  // moderation actions to receive 429. Sensitive auth and mutation routes
  // retain their much tighter per-route limits.
  await app.register(rateLimit, { global: true, max: 900, timeWindow: '1 minute' });

  app.get('/v1/health', async (_request, reply) => {
    try {
      const result = await pool.query<{ ready: boolean }>(`
        SELECT (
          to_regclass('public.users') IS NOT NULL AND
          to_regclass('public.playlists') IS NOT NULL AND
          to_regclass('public.external_library_items') IS NOT NULL AND
          to_regclass('public.sessions') IS NOT NULL AND
          to_regclass('public.invites') IS NOT NULL AND
          to_regclass('public.audit_events') IS NOT NULL AND
          to_regclass('public.cloud_tracks') IS NOT NULL AND
          to_regclass('public.rooms') IS NOT NULL AND
          to_regclass('public.room_members') IS NOT NULL AND
          to_regclass('public.room_queue_items') IS NOT NULL
        ) AS ready
      `);
      if (!result.rows[0]?.ready) {
        return reply.code(503).send({ status: 'degraded', database: 'schema_incomplete' });
      }
      return { status: 'ok', database: 'connected' };
    } catch (cause) {
      // Never log DATABASE_URL, connection hosts, usernames or raw driver
      // messages. This classification is sufficient for operator triage.
      console.error('[nebula:health] database probe failed', {
        ...classifyDatabaseFailure(cause),
        connection: describeDatabaseConnectionShape(process.env.DATABASE_URL),
      });
      return reply.code(503).send({ status: 'degraded', database: 'unavailable' });
    }
  });

  app.get('/v1/auth/config', async () => ({ registrationOpen: config.allowPublicRegistration }));

  registerAuthRoutes(app, { db, config });
  registerAdminRoutes(app, { db });
  registerCloudRoutes(app, db);
  registerFavoriteRoutes(app, db);
  registerRoomRoutes(app, pool);

  app.get('/v1/me', { preHandler: requireAuth }, async (request, reply) => {
    const [user] = await db
      .select({ id: users.id, email: users.email, role: users.role, createdAt: users.createdAt })
      .from(users)
      .where(eq(users.id, principalId(request)))
      .limit(1);
    if (!user) return reply.code(404).send(fail('user_not_found'));
    return { user };
  });

  app.get('/v1/discovery/providers', { preHandler: requireAuth }, async () => ({ providers: discovery.list() }));

  app.get(
    '/v1/discovery/search',
    { preHandler: requireAuth, config: { rateLimit: { max: 24, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const parsed = discoveryInput.safeParse(request.query);
      if (!parsed.success) return reply.code(400).send(fail('invalid_discovery_query'));
      const { q, page, limit, provider } = parsed.data;
      return discovery.search({ query: q, page, limit }, provider === 'all' ? undefined : provider);
    },
  );

  app.get(
    '/v1/metadata/musicbrainz',
    { preHandler: requireAuth, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const parsed = z
        .object({
          q: z.string().trim().min(2).max(100),
          limit: z.coerce.number().int().min(1).max(20).default(10),
        })
        .safeParse(request.query);
      if (!parsed.success) return reply.code(400).send(fail('invalid_metadata_query'));
      try {
        return { items: await musicBrainz.search(parsed.data.q, parsed.data.limit), source: 'musicbrainz', audioAvailable: false };
      } catch {
        return reply.code(503).send(fail('metadata_provider_unavailable'));
      }
    },
  );

  app.get('/v1/playlists', { preHandler: requireAuth }, async (request) => {
    const items = await db
      .select({ id: playlists.id, name: playlists.name, createdAt: playlists.createdAt })
      .from(playlists)
      .where(eq(playlists.userId, principalId(request)))
      .orderBy(desc(playlists.createdAt));
    return { items };
  });

  app.post('/v1/playlists', { preHandler: requireAuth }, async (request, reply) => {
    const parsed = playlistInput.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(fail('invalid_playlist_name'));
    const [playlist] = await db
      .insert(playlists)
      .values({ id: randomUUID(), userId: principalId(request), name: parsed.data.name })
      .returning({ id: playlists.id, name: playlists.name, createdAt: playlists.createdAt });
    return reply.code(201).send({ playlist });
  });

  app.patch('/v1/playlists/:id', { preHandler: requireAuth }, async (request, reply) => {
    const params = idInput.safeParse(request.params);
    const body = playlistInput.safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send(fail('invalid_playlist'));
    const [playlist] = await db
      .update(playlists)
      .set({ name: body.data.name })
      .where(and(eq(playlists.id, params.data.id), eq(playlists.userId, principalId(request))))
      .returning({ id: playlists.id, name: playlists.name });
    if (!playlist) return reply.code(404).send(fail('playlist_not_found'));
    return { playlist };
  });

  app.delete('/v1/playlists/:id', { preHandler: requireAuth }, async (request, reply) => {
    const params = idInput.safeParse(request.params);
    if (!params.success) return reply.code(400).send(fail('invalid_playlist_id'));
    const [deleted] = await db
      .delete(playlists)
      .where(and(eq(playlists.id, params.data.id), eq(playlists.userId, principalId(request))))
      .returning({ id: playlists.id });
    if (!deleted) return reply.code(404).send(fail('playlist_not_found'));
    return reply.code(204).send();
  });

  // A playlist can reference the owner's ready cloud files or saved provider metadata.
  // An external reference does not authorize storing or copying the audio bytes.
  const playlistItemInput = z.object({
    source: z.enum(['cloud', 'external']),
    trackId: z.string().uuid(),
  });
  app.get('/v1/playlists/:id/items', { preHandler: requireAuth }, async (request, reply) => {
    const params = idInput.safeParse(request.params);
    if (!params.success) return reply.code(400).send(fail('invalid_playlist_id'));
    const [owner] = await db.select({ id: playlists.id }).from(playlists)
      .where(and(eq(playlists.id, params.data.id), eq(playlists.userId, principalId(request)))).limit(1);
    if (!owner) return reply.code(404).send(fail('playlist_not_found'));
    const items = await db.select({
      id: playlistItems.id, cloudTrackId: playlistItems.cloudTrackId,
      externalItemId: playlistItems.externalItemId, createdAt: playlistItems.createdAt,
    }).from(playlistItems).where(eq(playlistItems.playlistId, owner.id))
      .orderBy(playlistItems.createdAt, playlistItems.id).limit(500);
    return { items };
  });
  app.post('/v1/playlists/:id/items', { preHandler: requireAuth }, async (request, reply) => {
    const params = idInput.safeParse(request.params);
    const body = playlistItemInput.safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send(fail('invalid_playlist_item'));
    const userId = principalId(request);
    const [owner] = await db.select({ id: playlists.id }).from(playlists)
      .where(and(eq(playlists.id, params.data.id), eq(playlists.userId, userId))).limit(1);
    if (!owner) return reply.code(404).send(fail('playlist_not_found'));
    if (body.data.source === 'cloud') {
      const [track] = await db.select({ id: cloudTracks.id }).from(cloudTracks)
        .where(and(eq(cloudTracks.id, body.data.trackId), eq(cloudTracks.userId, userId), eq(cloudTracks.status, 'ready'))).limit(1);
      if (!track) return reply.code(404).send(fail('track_not_found'));
    } else {
      const [track] = await db.select({ id: externalLibraryItems.id }).from(externalLibraryItems)
        .where(and(eq(externalLibraryItems.id, body.data.trackId), eq(externalLibraryItems.userId, userId))).limit(1);
      if (!track) return reply.code(404).send(fail('track_not_found'));
    }
    const key = body.data.source === 'cloud' ? {cloudTrackId: body.data.trackId} : {externalItemId: body.data.trackId};
    const [row] = await db.insert(playlistItems).values({id: randomUUID(),playlistId:owner.id,...key})
      .onConflictDoNothing().returning({id:playlistItems.id});
    return reply.code(row ? 201 : 200).send({created:Boolean(row)});
  });
  app.delete('/v1/playlists/:id/items/:itemId', { preHandler: requireAuth }, async (request, reply) => {
    const parsed = z.object({id:z.string().uuid(),itemId:z.string().uuid()}).safeParse(request.params);
    if (!parsed.success) return reply.code(400).send(fail('invalid_playlist_item'));
    const [owner] = await db.select({id:playlists.id}).from(playlists)
      .where(and(eq(playlists.id,parsed.data.id),eq(playlists.userId,principalId(request)))).limit(1);
    if (!owner) return reply.code(404).send(fail('playlist_not_found'));
    const [deleted] = await db.delete(playlistItems).where(and(
      eq(playlistItems.id,parsed.data.itemId),eq(playlistItems.playlistId,owner.id)
    )).returning({id:playlistItems.id});
    if (!deleted) return reply.code(404).send(fail('playlist_item_not_found'));
    return reply.code(204).send();
  });

  app.get('/v1/library/external', { preHandler: requireAuth }, async (request) => {
    const items = await db
      .select({
        id: externalLibraryItems.id,
        provider: externalLibraryItems.provider,
        externalId: externalLibraryItems.externalId,
        title: externalLibraryItems.title,
        artist: externalLibraryItems.artist,
        artworkUrl: externalLibraryItems.artworkUrl,
        sourceUrl: externalLibraryItems.sourceUrl,
        licenseUrl: externalLibraryItems.licenseUrl,
        createdAt: externalLibraryItems.createdAt,
      })
      .from(externalLibraryItems)
      .where(eq(externalLibraryItems.userId, principalId(request)))
      .orderBy(desc(externalLibraryItems.createdAt))
      .limit(1000);
    return { items };
  });

  app.post('/v1/library/external', { preHandler: requireAuth }, async (request, reply) => {
    const parsed = externalInput.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(fail('invalid_external_track'));
    const data = parsed.data;
    const userId = principalId(request);
    const projection = {
      provider: externalLibraryItems.provider,
      externalId: externalLibraryItems.externalId,
      title: externalLibraryItems.title,
      artist: externalLibraryItems.artist,
      artworkUrl: externalLibraryItems.artworkUrl,
      sourceUrl: externalLibraryItems.sourceUrl,
      licenseUrl: externalLibraryItems.licenseUrl,
      id: externalLibraryItems.id,
    };
    const created = await db
      .insert(externalLibraryItems)
      .values({
        id: randomUUID(),
        userId,
        provider: data.provider,
        externalId: data.externalId,
        title: data.title,
        artist: data.artist,
        artworkUrl: data.artworkUrl ?? null,
        sourceUrl: data.sourceUrl,
        licenseUrl: data.licenseUrl ?? null,
      })
      .onConflictDoNothing({
        target: [externalLibraryItems.userId, externalLibraryItems.provider, externalLibraryItems.externalId],
      })
      .returning(projection);
    if (created.length) return reply.code(201).send({ item: created[0], created: true });
    const [existing] = await db
      .select(projection)
      .from(externalLibraryItems)
      .where(and(
        eq(externalLibraryItems.userId, userId),
        eq(externalLibraryItems.provider, data.provider),
        eq(externalLibraryItems.externalId, data.externalId),
      ))
      .limit(1);
    return reply.code(200).send({ item: existing, created: false });
  });

  app.delete('/v1/library/external/:provider/:externalId', { preHandler: requireAuth }, async (request, reply) => {
    const parsed = externalDelete.safeParse(request.params);
    if (!parsed.success) return reply.code(400).send(fail('invalid_external_track_id'));
    const [removed] = await db
      .delete(externalLibraryItems)
      .where(and(
        eq(externalLibraryItems.userId, principalId(request)),
        eq(externalLibraryItems.provider, parsed.data.provider),
        eq(externalLibraryItems.externalId, parsed.data.externalId),
      ))
      .returning({ id: externalLibraryItems.id });
    if (!removed) return reply.code(404).send(fail('external_track_not_found'));
    return reply.code(204).send();
  });

  app.setErrorHandler((error, request, reply) => {
    request.log.error(error);
    const status =
      typeof error === 'object' && error !== null && 'statusCode' in error && typeof error.statusCode === 'number'
        ? error.statusCode
        : 500;
    if (status === 429) return reply.code(429).send(fail('rate_limited'));
    return reply.code(status >= 400 && status < 500 ? status : 500).send(fail('server_error'));
  });
  return app;
}
