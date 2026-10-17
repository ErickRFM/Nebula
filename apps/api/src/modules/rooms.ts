import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { z } from 'zod';
import { drizzle } from 'drizzle-orm/node-postgres';
import { createGuards } from './auth.js';
import { presignR2, readR2Settings } from '../storage/r2.js';

const roomCreate = z.object({
  name: z.string().trim().min(1).max(80),
  mode: z.enum(['listening', 'party']).default('listening'),
});
const joinInput = z.object({ code: z.string().trim().min(20).max(80) });
const roomId = z.object({ id: z.string().uuid() });
const sharingInput = z.object({ enabled: z.boolean(), rightsConfirmed: z.boolean().optional() });
const timelineInput = z.object({
  expectedRevision: z.number().int().nonnegative(),
  trackId: z.string().uuid().nullable(),
  status: z.enum(['playing', 'paused']),
  positionMs: z.number().int().min(0).max(86_400_000),
  rightsConfirmed: z.boolean().optional(),
});
type RoomRow = {
  id: string; name: string; mode: 'listening' | 'party'; status: string;
  ownerUserId: string; revision: number; trackId: string | null; shareEnabled: boolean;
  playbackStatus: 'playing' | 'paused'; positionMs: number;
  effectiveAt: Date; createdAt: Date; participantCount: number;
};
const projection = `
  r.id, r.name, r.mode, r.status, r.owner_user_id AS "ownerUserId",
  r.revision::int AS revision, r.track_id AS "trackId", r.share_enabled AS "shareEnabled",
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

  app.post('/v1/rooms/join', { preHandler: requireAuth, config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (request, reply) => {
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


  // Room membership alone never grants private audio access. The host must explicitly
  // confirm sharing rights, and only the currently selected ready track is exposed.
  app.post('/v1/rooms/:id/sharing', { preHandler: requireAuth }, async (request, reply) => {
    const params = roomId.safeParse(request.params);
    const body = sharingInput.safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send(error('invalid_sharing_settings'));
    if (body.data.enabled && body.data.rightsConfirmed !== true) {
      return reply.code(400).send(error('sharing_rights_confirmation_required'));
    }
    const updated = await pool.query<{ shareEnabled: boolean }>(`
      UPDATE rooms SET share_enabled=$3
      WHERE id=$1 AND owner_user_id=$2 AND status='active'
      RETURNING share_enabled AS "shareEnabled"
    `, [params.data.id, request.principal!.userId, body.data.enabled]);
    if (!updated.rowCount) return reply.code(404).send(error('room_not_found'));
    return { shareEnabled: updated.rows[0].shareEnabled };
  });

  app.get('/v1/rooms/:id/audio', { preHandler: requireAuth, config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (request, reply) => {
    const params = roomId.safeParse(request.params);
    if (!params.success) return reply.code(400).send(error('invalid_room_id'));
    const result = await pool.query<{ shareEnabled: boolean; id: string; title: string; artist: string; objectKey: string }>(`
      SELECT r.share_enabled AS "shareEnabled", c.id, c.title, c.artist, c.object_key AS "objectKey"
      FROM rooms r
      JOIN room_members m ON m.room_id=r.id AND m.user_id=$2
      JOIN cloud_tracks c ON c.id=r.track_id AND c.user_id=r.owner_user_id AND c.status='ready'
      WHERE r.id=$1 AND r.status='active'
    `, [params.data.id, request.principal!.userId]);
    const item = result.rows[0];
    if (!item) return reply.code(404).send(error('room_audio_not_found'));
    if (!item.shareEnabled) return reply.code(403).send(error('room_audio_not_shared'));
    const settings = readR2Settings();
    if (!settings) return reply.code(503).send(error('storage_not_configured'));
    reply.header('Cache-Control', 'no-store');
    // Short expiry limits the window after revocation; URLs are still bearer capabilities.
    return { track: { id: item.id, title: item.title, artist: item.artist },
      url: presignR2(settings, 'GET', item.objectKey, 300), expiresInSeconds: 300 };
  });

  app.post('/v1/rooms/:id/timeline', { preHandler: requireAuth, config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (request, reply) => {
    const params = roomId.safeParse(request.params);
    const body = timelineInput.safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send(error('invalid_timeline'));
    const userId = request.principal!.userId;
    const { trackId, status, positionMs, expectedRevision, rightsConfirmed } = body.data;
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
        -- A host must reconfirm rights when switching the shared track.
        -- Enforce in the same CAS UPDATE to prevent concurrent bypasses.
        AND (NOT r.share_enabled OR $4::uuid IS NULL OR
             r.track_id IS NOT DISTINCT FROM $4::uuid OR $7::boolean IS TRUE)
      RETURNING r.id, r.revision::int AS revision, r.track_id AS "trackId",
        r.playback_status AS "playbackStatus", r.position_ms AS "positionMs",
        r.effective_at AS "effectiveAt"
    `, [params.data.id, userId, expectedRevision, trackId, status, positionMs, rightsConfirmed === true]);
    if (!updated.rowCount) {
      // Distinguish a missing per-track consent from a stale revision without
      // weakening the atomic guard above.
      const current = await pool.query<{ trackId: string | null; shareEnabled: boolean }>(`
        SELECT track_id AS "trackId", share_enabled AS "shareEnabled"
        FROM rooms WHERE id=$1 AND owner_user_id=$2 AND status='active' AND revision=$3
      `, [params.data.id, userId, expectedRevision]);
      if (current.rows[0]?.shareEnabled && trackId && current.rows[0].trackId !== trackId && rightsConfirmed !== true) {
        return reply.code(403).send(error('sharing_rights_confirmation_required'));
      }
      return reply.code(409).send(error('room_not_found_or_revision_conflict'));
    }
    return { timeline: updated.rows[0], serverNowMs: Date.now() };
  });


  app.get('/v1/rooms/:id/queue', { preHandler: requireAuth }, async (request, reply) => {
    const params = roomId.safeParse(request.params);
    if (!params.success) return reply.code(400).send(error('invalid_room_id'));
    const result = await pool.query<{
      id: string; trackId: string; title: string; artist: string; position: number;
    }>(`
      SELECT q.id, q.track_id AS "trackId", c.title, c.artist, q.position
      FROM room_queue_items q
      JOIN cloud_tracks c ON c.id=q.track_id
      JOIN rooms r ON r.id=q.room_id AND r.status='active'
      JOIN room_members m ON m.room_id=r.id AND m.user_id=$2
      WHERE q.room_id=$1 ORDER BY q.position ASC LIMIT 200
    `, [params.data.id, request.principal!.userId]);
    return { items: result.rows };
  });

  app.post('/v1/rooms/:id/queue', { preHandler: requireAuth, config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (request, reply) => {
    const params = roomId.safeParse(request.params);
    const body = z.object({ trackId: z.string().uuid(), rightsConfirmed: z.literal(true) }).safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send(error('invalid_queue_item'));
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const room = await client.query(`
        SELECT id FROM rooms WHERE id=$1 AND owner_user_id=$2 AND status='active' FOR UPDATE
      `, [params.data.id, request.principal!.userId]);
      if (!room.rowCount) { await client.query('ROLLBACK'); return reply.code(404).send(error('room_not_found')); }
      const owned = await client.query(`
        SELECT 1 FROM cloud_tracks WHERE id=$1 AND user_id=$2 AND status='ready'
      `, [body.data.trackId, request.principal!.userId]);
      if (!owned.rowCount) { await client.query('ROLLBACK'); return reply.code(403).send(error('track_not_available')); }
      const count = await client.query<{count:string;next:number}>(`
        SELECT count(*)::text AS count, (coalesce(max(position),0)+1)::int AS next
        FROM room_queue_items WHERE room_id=$1
      `, [params.data.id]);
      if (Number(count.rows[0].count) >= 200) {
        await client.query('ROLLBACK'); return reply.code(409).send(error('room_queue_full'));
      }
      const inserted = await client.query<{id:string;position:number}>(`
        INSERT INTO room_queue_items (id,room_id,track_id,added_by,position)
        VALUES ($1,$2,$3,$4,$5) RETURNING id,position
      `, [randomUUID(), params.data.id, body.data.trackId, request.principal!.userId, count.rows[0].next]);
      await client.query('COMMIT');
      return reply.code(201).send({ item: inserted.rows[0] });
    } catch (cause) {
      await client.query('ROLLBACK'); throw cause;
    } finally { client.release(); }
  });

  app.patch('/v1/rooms/:id/queue/reorder', {
    preHandler: requireAuth, config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const params = roomId.safeParse(request.params);
    const body = z.object({ itemIds: z.array(z.string().uuid()).min(2).max(200) }).safeParse(request.body);
    if (!params.success || !body.success || new Set(body.data.itemIds).size !== body.data.itemIds.length) {
      return reply.code(400).send(error('invalid_queue_order'));
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const host = await client.query(
        "SELECT id FROM rooms WHERE id=$1 AND owner_user_id=$2 AND status='active' FOR UPDATE",
        [params.data.id, request.principal!.userId],
      );
      if (!host.rowCount) { await client.query('ROLLBACK'); return reply.code(404).send(error('room_not_found')); }
      const current = await client.query<{ id: string }>(
        'SELECT id FROM room_queue_items WHERE room_id=$1 ORDER BY position ASC FOR UPDATE',
        [params.data.id],
      );
      const expected = body.data.itemIds;
      if (current.rows.length !== expected.length ||
          current.rows.some(row => !expected.includes(row.id))) {
        await client.query('ROLLBACK');
        return reply.code(409).send(error('room_queue_changed'));
      }
      if (current.rows.every((row, index) => row.id === expected[index])) {
        await client.query('COMMIT');
        return { itemIds: expected };
      }
      // The unique(room_id, position) constraint is immediate. Move all rows
      // into a disjoint positive range first, then assign final positions.
      await client.query('UPDATE room_queue_items SET position=position+1000 WHERE room_id=$1', [params.data.id]);
      for (let index = 0; index < expected.length; index++) {
        await client.query(
          'UPDATE room_queue_items SET position=$3 WHERE room_id=$1 AND id=$2',
          [params.data.id, expected[index], index + 1],
        );
      }
      await client.query('COMMIT');
      return { itemIds: expected };
    } catch (cause) { await client.query('ROLLBACK'); throw cause; }
    finally { client.release(); }
  });

  app.delete('/v1/rooms/:id/queue/:itemId', { preHandler: requireAuth }, async (request, reply) => {
    const params = z.object({ id: z.string().uuid(), itemId: z.string().uuid() }).safeParse(request.params);
    if (!params.success) return reply.code(400).send(error('invalid_queue_item'));
    const deleted = await pool.query(`
      DELETE FROM room_queue_items q USING rooms r
      WHERE q.room_id=r.id AND r.id=$1 AND q.id=$2
        AND r.owner_user_id=$3 AND r.status='active'
      RETURNING q.id
    `, [params.data.id, params.data.itemId, request.principal!.userId]);
    if (!deleted.rowCount) return reply.code(404).send(error('queue_item_not_found'));
    return reply.code(204).send();
  });

  app.post('/v1/rooms/:id/next', { preHandler: requireAuth, config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (request, reply) => {
    const params = roomId.safeParse(request.params);
    const body = z.object({ expectedRevision: z.number().int().nonnegative() }).safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send(error('invalid_room_revision'));
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const selected = await client.query<{revision:number;shareEnabled:boolean}>(`
        SELECT revision::int AS revision, share_enabled AS "shareEnabled"
        FROM rooms WHERE id=$1 AND owner_user_id=$2 AND status='active' FOR UPDATE
      `, [params.data.id, request.principal!.userId]);
      const room = selected.rows[0];
      if (!room) { await client.query('ROLLBACK'); return reply.code(404).send(error('room_not_found')); }
      if (room.revision !== body.data.expectedRevision) {
        await client.query('ROLLBACK'); return reply.code(409).send(error('revision_conflict'));
      }
      if (!room.shareEnabled) { await client.query('ROLLBACK'); return reply.code(409).send(error('room_audio_not_shared')); }
      const next = await client.query<{id:string;trackId:string}>(`
        SELECT q.id, q.track_id AS "trackId" FROM room_queue_items q
        JOIN cloud_tracks c ON c.id=q.track_id AND c.user_id=$2 AND c.status='ready'
        WHERE q.room_id=$1 ORDER BY q.position ASC LIMIT 1 FOR UPDATE OF q
      `, [params.data.id, request.principal!.userId]);
      if (!next.rows[0]) { await client.query('ROLLBACK'); return reply.code(409).send(error('room_queue_empty')); }
      const updated = await client.query<{revision:number}>(`
        UPDATE rooms SET track_id=$3, playback_status='playing', position_ms=0,
          effective_at=now()+interval '3 seconds', revision=revision+1
        WHERE id=$1 AND owner_user_id=$2 RETURNING revision::int AS revision
      `, [params.data.id, request.principal!.userId, next.rows[0].trackId]);
      await client.query('DELETE FROM room_queue_items WHERE id=$1', [next.rows[0].id]);
      await client.query('COMMIT');
      return { trackId: next.rows[0].trackId, revision: updated.rows[0].revision };
    } catch (cause) {
      await client.query('ROLLBACK'); throw cause;
    } finally { client.release(); }
  });


  // Membership visibility is restricted to participants. Only the host can
  // see participant email addresses for moderation; listeners see pseudonymous IDs.
  app.get('/v1/rooms/:id/members', { preHandler: requireAuth }, async (request, reply) => {
    const params = roomId.safeParse(request.params);
    if (!params.success) return reply.code(400).send(error('invalid_room_id'));
    const result = await pool.query<{
      userId: string; role: 'host' | 'listener'; joinedAt: Date; email: string | null;
    }>(`
      SELECT m.user_id AS "userId", m.role, m.joined_at AS "joinedAt",
        CASE WHEN r.owner_user_id=$2 THEN u.email ELSE NULL END AS email
      FROM rooms r
      JOIN room_members viewer ON viewer.room_id=r.id AND viewer.user_id=$2
      JOIN room_members m ON m.room_id=r.id
      JOIN users u ON u.id=m.user_id
      WHERE r.id=$1 AND r.status='active'
      ORDER BY CASE WHEN m.role='host' THEN 0 ELSE 1 END, m.joined_at ASC
      LIMIT 16
    `, [params.data.id, request.principal!.userId]);
    if (!result.rows.length) return reply.code(404).send(error('room_not_found'));
    return { items: result.rows };
  });

  app.delete('/v1/rooms/:id/members/:memberId', {
    preHandler: requireAuth, config: { rateLimit: { max: 15, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const params = z.object({ id: z.string().uuid(), memberId: z.string().uuid() }).safeParse(request.params);
    if (!params.success) return reply.code(400).send(error('invalid_room_member'));
    const hostId = request.principal!.userId;
    if (params.data.memberId === hostId) return reply.code(400).send(error('host_must_transfer_or_close'));
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const room = await client.query(
        "SELECT id FROM rooms WHERE id=$1 AND owner_user_id=$2 AND status='active' FOR UPDATE",
        [params.data.id, hostId],
      );
      if (!room.rowCount) { await client.query('ROLLBACK'); return reply.code(404).send(error('room_not_found')); }
      const removed = await client.query(
        "DELETE FROM room_members WHERE room_id=$1 AND user_id=$2 AND role='listener' RETURNING user_id",
        [params.data.id, params.data.memberId],
      );
      if (!removed.rowCount) { await client.query('ROLLBACK'); return reply.code(404).send(error('member_not_found')); }
      await client.query('COMMIT');
      return reply.code(204).send();
    } catch (cause) { await client.query('ROLLBACK'); throw cause; }
    finally { client.release(); }
  });

  app.post('/v1/rooms/:id/transfer-host', {
    preHandler: requireAuth, config: { rateLimit: { max: 6, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const params = roomId.safeParse(request.params);
    const body = z.object({ memberId: z.string().uuid() }).safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send(error('invalid_host_transfer'));
    const hostId = request.principal!.userId;
    if (body.data.memberId === hostId) return reply.code(400).send(error('already_host'));
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const room = await client.query(
        "SELECT id FROM rooms WHERE id=$1 AND owner_user_id=$2 AND status='active' FOR UPDATE",
        [params.data.id, hostId],
      );
      if (!room.rowCount) { await client.query('ROLLBACK'); return reply.code(404).send(error('room_not_found')); }
      const target = await client.query(
        "SELECT user_id FROM room_members WHERE room_id=$1 AND user_id=$2 AND role='listener' FOR UPDATE",
        [params.data.id, body.data.memberId],
      );
      if (!target.rowCount) { await client.query('ROLLBACK'); return reply.code(404).send(error('member_not_found')); }
      await client.query(
        "UPDATE room_members SET role='listener' WHERE room_id=$1 AND user_id=$2 AND role='host'",
        [params.data.id, hostId],
      );
      await client.query(
        "UPDATE room_members SET role='host' WHERE room_id=$1 AND user_id=$2",
        [params.data.id, body.data.memberId],
      );
      await client.query(
        "UPDATE rooms SET owner_user_id=$2, revision=revision+1 WHERE id=$1",
        [params.data.id, body.data.memberId],
      );
      await client.query('COMMIT');
      return { ownerUserId: body.data.memberId };
    } catch (cause) { await client.query('ROLLBACK'); throw cause; }
    finally { client.release(); }
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
