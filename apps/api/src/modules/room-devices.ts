import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { z } from 'zod';
import { createGuards } from './auth.js';

const roomId = z.object({ id: z.string().uuid() });
const deviceParams = z.object({ id: z.string().uuid(), deviceId: z.string().uuid() });
const registration = z.object({
  deviceId: z.string().uuid(),
  label: z.string().trim().min(1).max(80),
  platform: z.enum(['web', 'android', 'ios', 'desktop']),
});
const outputInput = z.object({ outputEnabled: z.boolean() });
const heartbeatInput = z.object({
  playbackState: z.enum(['idle', 'ready', 'buffering', 'playing', 'error']),
});
const error = (name: string) => ({ error: name });
const projection = `d.id AS "deviceId", d.user_id AS "userId",
 d.label, d.platform, d.output_enabled AS "outputEnabled",
 d.playback_state AS "playbackState", d.last_seen_at AS "lastSeenAt",
 (d.last_seen_at >= now() - interval '45 seconds') AS online`;

/**
 * Presence is a room-scoped opt-in receiver registry, NOT physical Wi-Fi/Bluetooth
 * discovery and NOT permission to remotely start audio. Only the owning account
 * can enable its output; actual browser playback still needs a user gesture.
 */
export function registerRoomDeviceRoutes(app: FastifyInstance, pool: Pool): void {
  const { requireAuth } = createGuards(drizzle(pool));

  app.get('/v1/rooms/:id/devices', { preHandler: requireAuth }, async (request, reply) => {
    const params = roomId.safeParse(request.params);
    if (!params.success) return reply.code(400).send(error('invalid_room_id'));
    const result = await pool.query<{ deviceId: string }>(`
      SELECT ${projection}
      FROM room_devices d
      JOIN rooms r ON r.id=d.room_id AND r.status='active'
      WHERE d.room_id=$1
        AND EXISTS (SELECT 1 FROM room_members m WHERE m.room_id=r.id AND m.user_id=$2)
      ORDER BY d.last_seen_at DESC LIMIT 64
    `, [params.data.id, request.principal!.userId]);
    // Hide the entire participant/device roster from non-members.
    const membership = await pool.query(`
      SELECT 1 FROM room_members m JOIN rooms r ON r.id=m.room_id AND r.status='active'
      WHERE m.room_id=$1 AND m.user_id=$2
    `, [params.data.id, request.principal!.userId]);
    if (!membership.rowCount) return reply.code(404).send(error('room_not_found'));
    reply.header('Cache-Control', 'no-store');
    return { items: result.rows };
  });

  app.post('/v1/rooms/:id/devices', {
    preHandler: requireAuth, config: { rateLimit: { max: 12, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const params = roomId.safeParse(request.params);
    const body = registration.safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send(error('invalid_room_device'));
    const userId = request.principal!.userId;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // A room row lock serializes per-user caps on new device identities.
      const membership = await client.query(`
        SELECT 1 FROM rooms r JOIN room_members m ON m.room_id=r.id
        WHERE r.id=$1 AND m.user_id=$2 AND r.status='active' FOR UPDATE OF r
      `, [params.data.id, userId]);
      if (!membership.rowCount) {
        await client.query('ROLLBACK');
        return reply.code(404).send(error('room_not_found'));
      }
      const count = await client.query<{ count: string; already: boolean }>(`
        SELECT count(*)::text AS count,
          coalesce(bool_or(id=$3),false) AS already
        FROM room_devices WHERE room_id=$1 AND user_id=$2
      `, [params.data.id, userId, body.data.deviceId]);
      if (!count.rows[0].already && Number(count.rows[0].count) >= 4) {
        await client.query('ROLLBACK');
        return reply.code(409).send(error('device_limit_reached'));
      }
      const result = await client.query(`
        INSERT INTO room_devices (room_id,id,user_id,label,platform)
        VALUES ($1,$2,$3,$4,$5)
        ON CONFLICT (room_id,id) DO UPDATE
          SET label=EXCLUDED.label, platform=EXCLUDED.platform, last_seen_at=now()
        WHERE room_devices.user_id=EXCLUDED.user_id
        RETURNING ${projection.replaceAll('d.', 'room_devices.')}
      `, [params.data.id, body.data.deviceId, userId, body.data.label, body.data.platform]);
      if (!result.rowCount) {
        await client.query('ROLLBACK');
        return reply.code(409).send(error('device_id_in_use'));
      }
      await client.query('COMMIT');
      return reply.code(200).send({ device: result.rows[0] });
    } catch (cause) {
      await client.query('ROLLBACK');
      throw cause;
    } finally {
      client.release();
    }
  });

  app.patch('/v1/rooms/:id/devices/:deviceId/output', {
    preHandler: requireAuth, config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const params = deviceParams.safeParse(request.params);
    const body = outputInput.safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send(error('invalid_device_output'));
    // Even the host cannot switch on another participant's speaker.
    const changed = await pool.query(`
      UPDATE room_devices d
        SET output_enabled=$4,
            playback_state=CASE WHEN $4 THEN 'ready' ELSE 'idle' END,
            last_seen_at=now()
      FROM rooms r
      WHERE d.room_id=$1 AND d.id=$2 AND d.user_id=$3
        AND r.id=d.room_id AND r.status='active'
      RETURNING d.output_enabled AS "outputEnabled"
    `, [params.data.id, params.data.deviceId, request.principal!.userId, body.data.outputEnabled]);
    if (!changed.rowCount) return reply.code(404).send(error('device_not_found'));
    return { outputEnabled: changed.rows[0].outputEnabled };
  });

  app.post('/v1/rooms/:id/devices/:deviceId/heartbeat', {
    preHandler: requireAuth, config: { rateLimit: { max: 12, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const params = deviceParams.safeParse(request.params);
    const body = heartbeatInput.safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send(error('invalid_device_heartbeat'));
    const changed = await pool.query(`
      UPDATE room_devices d SET
        playback_state=CASE WHEN d.output_enabled THEN $4::varchar ELSE 'idle' END,
        last_seen_at=now()
      FROM rooms r
      WHERE d.room_id=$1 AND d.id=$2 AND d.user_id=$3
        AND r.id=d.room_id AND r.status='active'
      RETURNING d.playback_state AS "playbackState"
    `, [params.data.id, params.data.deviceId, request.principal!.userId, body.data.playbackState]);
    if (!changed.rowCount) return reply.code(404).send(error('device_not_found'));
    return { playbackState: changed.rows[0].playbackState };
  });

  app.delete('/v1/rooms/:id/devices/:deviceId', { preHandler: requireAuth }, async (request, reply) => {
    const params = deviceParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send(error('invalid_room_device'));
    const removed = await pool.query(`
      DELETE FROM room_devices WHERE room_id=$1 AND id=$2 AND user_id=$3 RETURNING id
    `, [params.data.id, params.data.deviceId, request.principal!.userId]);
    if (!removed.rowCount) return reply.code(404).send(error('device_not_found'));
    return reply.code(204).send();
  });
}
