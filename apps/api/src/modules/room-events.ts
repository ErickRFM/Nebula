import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { z } from 'zod';
import { createGuards } from './auth.js';

const paramsSchema = z.object({ id: z.string().uuid() });
type Snapshot = { revision: number; participantCount: number };

/**
 * Authenticated low-latency room event stream.
 *
 * A bounded SSE stream is supported in current Vercel Functions, including
 * reconnection after serverless timeouts. A PostgreSQL snapshot, not function
 * memory, is the authoritative state. No credentials are placed in the URL.
 *
 * This is a fallback transport, not a WebSocket implementation or acoustic
 * synchronization guarantee.
 */
export function registerRoomEventRoutes(app: FastifyInstance, pool: Pool): void {
  const { requireAuth } = createGuards(drizzle(pool));
  app.get('/v1/rooms/:id/events', {
    preHandler: requireAuth,
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const parsed = paramsSchema.safeParse(request.params);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_room_id' });
    const roomId = parsed.data.id;
    const userId = request.principal!.userId;
    const sessionId = request.principal!.sessionId;
    const fetchSnapshot = async (): Promise<Snapshot | null> => {
      const result = await pool.query<Snapshot>(`
        SELECT r.revision::int AS revision,
          (SELECT count(*)::int FROM room_members m2 WHERE m2.room_id=r.id) AS "participantCount"
        FROM rooms r
        JOIN room_members m ON m.room_id=r.id AND m.user_id=$2
        JOIN sessions s ON s.id=$3 AND s.user_id=$2
          AND s.revoked_at IS NULL AND s.expires_at > now()
        WHERE r.id=$1 AND r.status='active'
      `, [roomId, userId, sessionId]);
      return result.rows[0] ?? null;
    };
    // Authenticate and authorize before upgrading to streaming response.
    const initial = await fetchSnapshot();
    if (!initial) return reply.code(404).send({ error: 'room_not_found' });

    reply.hijack();
    const out = reply.raw;
    out.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, no-transform',
      'X-Accel-Buffering': 'no',
      Connection: 'keep-alive',
    });
    out.flushHeaders();
    out.write('retry: 1000\n\n');
    let closed = false;
    let inFlight = false;
    let previous = '';
    const shutdown = () => {
      if (closed) return;
      closed = true;
      clearInterval(interval);
      clearTimeout(deadline);
      if (!out.destroyed && !out.writableEnded) out.end();
    };
    const publish = (snapshot: Snapshot) => {
      const fingerprint = snapshot.revision + ':' + snapshot.participantCount;
      if (fingerprint === previous) return;
      previous = fingerprint;
      const frame = 'event: room\ndata: ' + JSON.stringify(snapshot) + '\n\n';
      if (!out.write(frame)) shutdown(); // Bound memory when a client cannot read.
    };
    // Serialize queries, and recheck membership on each poll to revoke access
    // after kicking a listener or closing a room.
    const pulse = async () => {
      if (closed || inFlight) return;
      inFlight = true;
      try {
        const snapshot = await fetchSnapshot();
        if (!snapshot) { shutdown(); return; }
        publish(snapshot);
      } catch {
        shutdown(); // Client retries, no internal DB detail leaks into the stream.
      } finally {
        inFlight = false;
      }
    };
    // Timers are declared before publishing so disconnect cleanup is safe.
    const interval = setInterval(() => { void pulse(); }, 1000);
    const deadline = setTimeout(shutdown, 23_000);
    out.once('close', shutdown);
    publish(initial);
  });
}
