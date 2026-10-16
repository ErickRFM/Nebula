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
import { playlists, users, externalLibraryItems } from './db/schema.js';
import { externalInput, externalDelete } from './library/external-input.js';
import { DiscoveryService } from './discovery/service.js';
import { MusicBrainzMetadata } from './metadata/musicbrainz.js';
import type { Config } from './config.js';
import { createGuards, registerAdminRoutes, registerAuthRoutes } from './modules/auth.js';
import './types.js';

type Options = { pool: Pool; config: Config };
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

export async function buildApp({ pool, config }: Options) {
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
  await app.register(rateLimit, { global: true, max: 120, timeWindow: '1 minute' });

  app.get('/v1/health', async (_request, reply) => {
    try {
      await pool.query('SELECT 1');
      return { status: 'ok', database: 'connected' };
    } catch {
      return reply.code(503).send({ status: 'degraded', database: 'unavailable' });
    }
  });

  registerAuthRoutes(app, { db, config });
  registerAdminRoutes(app, { db });

  app.get('/v1/auth/config', async () => ({ registrationOpen: config.allowPublicRegistration }));

  app.get('/v1/metadata/musicbrainz', {
    preHandler: requireAuth,
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const parsed = z.object({
      q: z.string().trim().min(2).max(100),
      limit: z.coerce.number().int().min(1).max(20).default(10),
    }).safeParse(request.query);
    if (!parsed.success) return reply.code(400).send(fail('invalid_metadata_query'));
    try {
      return { items: await musicBrainz.search(parsed.data.q, parsed.data.limit),
        source: 'musicbrainz', audioAvailable: false };
    } catch {
      return reply.code(503).send(fail('metadata_provider_unavailable'));
    }
  });

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
