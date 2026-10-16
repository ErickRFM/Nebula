import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { z } from 'zod';
import { drizzle } from 'drizzle-orm/node-postgres';
import { createGuards } from './auth.js';

const roomCreate = z.object({
  name: z.string().trim().min(1).max(80),
  mode: z.enum(['listening', 'party']).default('listening'),
});
const joinInput = z.object({ code: z.string().trim().min(20).max(80) });
const roomId = z.object({ id: z.string().uuid() });
const timelineInput = z.object({
  expectedRevision: z.number().int().nonnegative(),
  trackId: z.string().uuid().nullable(),
  status: z.enum(['playing', 'paused']),
  positionMs: z.number().int().min(0).max(86_400_000),
});
type RoomRow = {
  id: string; name: string; mode: 'listening' | 'party'; status: string;
  ownerUserId: string; revision: number; trackId: string | null;
  playbackStatus: 'playing' | 'paused'; positionMs: number;
  effectiveAt: Date; createdAt: Date; participantCount: number;
};
const projection = `
  r.id, r.name, r.mode, r.status, r.owner_user_id AS "ownerUserId",
  r.revision::int AS revision, r.track_id AS "trackId",
  r.playback_status AS "playbackStatus", r.position_ms AS "positionMs",
  r.effective_at AS "effectiveAt", r.created_at AS "createdAt",
  (SELECT count(*)::int FROM room_members m WHERE m.room_id = r.id) AS "participantCount"
`;
const codeHash = (code: string) => createHash('sha256').update(code).digest('hex');
const inviteCode = () => randomBytes(24).toString('base64url');
const error = (message: string) => ({ error: message });

export function registerRoomRoutes(app: FastifyInstance, pool: Pool): void {
  const { requireAuth } = createGuards(drizzle(pool));

  // Four-timestamp probe: client records monotonic send/receive and bridges to wall time.
  app.get('/v1/rooms/clock', { preHandler: requireAuth }, async () => {
    const serverReceivedMs = Date.now();
    return { serverReceivedMs, serverSentMs: Date.now() };
  });

  app.get('/v1/rooms', { preHandler: requireAuth }, async request => {
    const result = await pool.query<RoomRow>(`
      SELECT ${projection}
      FROM rooms r JOIN room_members own ON own.room_id = r.id
      WHERE own.user_id = $1 AND r.status = 'active'
      ORDER BY r.created_at DESC LIMIT 50
    `, [request.principal!.userId]);
    return { items: result.rows };
  });

  app.post('/v1/rooms', { preHandler: requireAuth, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
    const parsed = roomCreate.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(error('invalid_room'));
    const id = randomUUID();
    const code = inviteCode();
    const userId = request.principal!.userId;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`
        INSERT INTO rooms (id, owner_user_id, name, mode, invite_hash, invite_expires_at)
        VALUES ($1,$2,$3,$4,$5,now() + interval '7 days')
      `, [id, userId, parsed.data.name, parsed.data.mode, codeHash(code)]);
      await client.query("INSERT INTO room_members (room_id,user_id,role) VALUES ($1,$2,'host')", [id, userId]);
      await client.query('COMMIT');
    } catch (cause) {
      await client.query('ROLLBACK');
      throw cause;
    } finally {
      client.release();
    }
    return reply.code(201).send({ room: { id, name: parsed.data.name, mode: parsed.data.mode }, inviteCode: code });
  });

  app.post('/v1/rooms/join', { preHandler: requireAuth, config: { rateLimit: { max: 6, timeWindow: '1 minute' } } }, async (request, reply) => {
    const parsed = joinInput.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(error('invalid_invite'));
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Serialize joins against room close and the capacity check.
      const selected = await client.query<{ id: string }>(`
        SELECT id FROM rooms WHERE invite_hash=$1 AND invite_expires_at > now()
        AND status='active' FOR UPDATE
      `, [codeHash(parsed.data.code)]);
      const room = selected.rows[0];
      if (!room) { await client.query('ROLLBACK'); return reply.code(404).send(error('room_not_found')); }
      const count = await client.query<{ count: string }>('SELECT count(*)::text AS count FROM room_members WHERE room_id=$1', [room.id]);
      const already = await client.query('SELECT 1 FROM room_members WHERE room_id=$1 AND user_id=$2', [room.id, request.principal!.userId]);
      if (!already.rowCount && Number(count.rows[0].count) >= 16) {
        await client.query('ROLLBACK');
        return reply.code(409).send(error('room_full'));
      }
      await client.query(`
        INSERT INTO room_members (room_id,user_id,role) VALUES ($1,$2,'listener')
        ON CONFLICT (room_id,user_id) DO NOTHING
      `, [room.id, request.principal!.userId]);
      await client.query('COMMIT');
      return { roomId: room.id };
    } catch (cause) {
      await client.query('ROLLBACK');
      throw cause;
    } finally {
      client.release();
    }
  });

  app.get('/v1/rooms/:id', { preHandler: requireAuth }, async (request, reply) => {
    const params = roomId.safeParse(request.params);
    if (!params.success) return reply.code(400).send(error('invalid_room_id'));
    const result = await pool.query<RoomRow>(`
      SELECT ${projection} FROM rooms r
      JOIN room_members m ON m.room_id=r.id
      WHERE r.id=$1 AND m.user_id=$2 AND r.status='active'
    `, [params.data.id, request.principal!.userId]);
    if (!result.rows[0]) return reply.code(404).send(error('room_not_found'));
    return { room: result.rows[0], serverNowMs: Date.now() };
  });

  app.post('/v1/rooms/:id/invite', { preHandler: requireAuth, config: { rateLimit: { max: 6, timeWindow: '1 minute' } } }, async (request, reply) => {
    const params = roomId.safeParse(request.params);
    if (!params.success) return reply.code(400).send(error('invalid_room_id'));
    const code = inviteCode();
    const updated = await pool.query(`
      UPDATE rooms SET invite_hash=$3, invite_expires_at=now() + interval '7 days'
      WHERE id=$1 AND owner_user_id=$2 AND status='active' RETURNING id
    `, [params.data.id, request.principal!.userId, codeHash(code)]);
    if (!updated.rowCount) return reply.code(404).send(error('room_not_found'));
    return { inviteCode: code };
  });

  app.post('/v1/rooms/:id/timeline', { preHandler: requireAuth, config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (request, reply) => {
    const params = roomId.safeParse(request.params);
    const body = timelineInput.safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send(error('invalid_timeline'));
    const userId = request.principal!.userId;
    const { trackId, status, positionMs, expectedRevision } = body.data;
    if (trackId) {
      const owned = await pool.query(`
        SELECT 1 FROM cloud_tracks WHERE id=$1 AND user_id=$2 AND status='ready'
      `, [trackId, userId]);
      if (!owned.rowCount) return reply.code(403).send(error('track_not_available'));
    }
    // Atomic compare-and-swap: stale clients cannot overwrite newer playback events.
    const updated = await pool.query<RoomRow>(`
      UPDATE rooms r
      SET track_id=$4, playback_status=$5, position_ms=$6,
          effective_at=now() + CASE WHEN $5::varchar='playing' THEN interval '3 seconds' ELSE interval '0 seconds' END,
          revision=revision+1
      WHERE r.id=$1 AND r.owner_user_id=$2 AND r.status='active' AND r.revision=$3
      RETURNING r.id, r.revision::int AS revision, r.track_id AS "trackId",
        r.playback_status AS "playbackStatus", r.position_ms AS "positionMs",
        r.effective_at AS "effectiveAt"
    `, [params.data.id, userId, expectedRevision, trackId, status, positionMs]);
    if (!updated.rowCount) return reply.code(409).send(error('room_not_found_or_revision_conflict'));
    return { timeline: updated.rows[0], serverNowMs: Date.now() };
  });

  app.post('/v1/rooms/:id/leave', { preHandler: requireAuth }, async (request, reply) => {
    const params = roomId.safeParse(request.params);
    if (!params.success) return reply.code(400).send(error('invalid_room_id'));
    const removed = await pool.query(`
      DELETE FROM room_members m USING rooms r
      WHERE m.room_id=r.id AND r.id=$1 AND m.user_id=$2
      AND r.owner_user_id<>$2 RETURNING m.room_id
    `, [params.data.id, request.principal!.userId]);
    if (!removed.rowCount) return reply.code(404).send(error('room_not_found_or_host_must_close'));
    return reply.code(204).send();
  });

  app.post('/v1/rooms/:id/close', { preHandler: requireAuth }, async (request, reply) => {
    const params = roomId.safeParse(request.params);
    if (!params.success) return reply.code(400).send(error('invalid_room_id'));
    const updated = await pool.query(`
      UPDATE rooms SET status='closed', closed_at=now(), revision=revision+1
      WHERE id=$1 AND owner_user_id=$2 AND status='active' RETURNING id
    `, [params.data.id, request.principal!.userId]);
    if (!updated.rowCount) return reply.code(404).send(error('room_not_found'));
    return reply.code(204).send();
  });
}
