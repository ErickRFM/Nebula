import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID, createHash } from 'node:crypto';
import { Pool } from 'pg';
import type { Server } from 'node:http';
import type { FastifyInstance } from 'fastify';
import { buildApp } from './app';

const url = process.env.NEBULA_TEST_DATABASE_URL;
const SECRET = 'nebula-websocket-gateway-test-00000000000000000';

describe.skipIf(!url)('real WebSocket gateway upgrade (PostgreSQL)', () => {
  let database: Pool;
  let app: FastifyInstance;
  let server: Server;
  let hostToken: string;
  let roomId: string;
  let port: number;
  const sockets = new Set<WebSocket>();
  const headers = (token: string) => ({ authorization: 'Bearer ' + token });

  beforeAll(async () => {
    database = new Pool({ connectionString: url });
    app = await buildApp({ pool: database, secret: SECRET, origin: 'http://localhost:3000', registrationEnabled: true });
    await app.ready();
    const registration = await app.inject({ method: 'POST', url: '/v1/auth/register', payload: {
      email: 'real-ws-' + randomUUID() + '@example.test',
      password: 'SecureTestPassword123!',
    } });
    expect(registration.statusCode).toBe(201);
    hostToken = registration.json().accessToken;
    const created = await app.inject({
      method: 'POST', url: '/v1/rooms', headers: headers(hostToken),
      payload: { name: 'Real WS smoke', mode: 'party' },
    });
    expect(created.statusCode).toBe(201);
    roomId = created.json().room.id;
    server = (await import('../../web/api/room-ws')).default;
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('invalid_ws_bind');
    port = address.port;
  });

  afterAll(async () => {
    for (const ws of sockets) ws.close();
    if (server?.listening) await new Promise<void>((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve());
    });
    if (app) await app.close();
    if (database) await database.end();
  });

  const issueTicket = async () => {
    const response = await app.inject({
      method: 'POST', url: '/v1/rooms/' + roomId + '/ws-ticket', headers: headers(hostToken),
    });
    expect(response.statusCode).toBe(200);
    return response.json().ticket as string;
  };

  const connect = (ticket: string) => {
    const socket = new WebSocket('ws://127.0.0.1:' + port, ['nebula.room.v1', ticket]);
    sockets.add(socket);
    socket.addEventListener('close', () => sockets.delete(socket), { once: true });
    return socket;
  };

  const nextMessage = (socket: WebSocket): Promise<unknown> => new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('gateway_frame_timeout')), 6000);
    socket.addEventListener('message', event => {
      clearTimeout(timeout);
      try { resolve(JSON.parse(String(event.data))); } catch (cause) { reject(cause); }
    }, { once: true });
    socket.addEventListener('error', () => {
      clearTimeout(timeout);
      reject(new Error('websocket_handshake_failed'));
    }, { once: true });
    socket.addEventListener('close', () => {
      clearTimeout(timeout);
      reject(new Error('websocket_closed_before_snapshot'));
    }, { once: true });
  });

  it('streams a current room snapshot over a real authenticated WebSocket', async () => {
    const ticket = await issueTicket();
    const socket = connect(ticket);
    const snapshot = await nextMessage(socket) as {type:string;revision:number;participantCount:number};
    expect(snapshot.type).toBe('room');
    expect(snapshot.revision).toBeGreaterThanOrEqual(0);
    expect(snapshot.participantCount).toBe(1);
    socket.close();

    const hash = createHash('sha256').update(ticket).digest('hex');
    const db = await database.query('SELECT 1 FROM room_ws_tickets WHERE token_hash=$1',[hash]);
    expect(db.rowCount).toBe(0);
  });

  it('rejects a replayed or forged ticket with policy violation code', async () => {
    const ticket = await issueTicket();
    const first = connect(ticket);
    await nextMessage(first);
    first.close();
    const replay = connect(ticket);
    const closeCode = await new Promise<number>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('replay_disconnect_timeout')), 6000);
      replay.addEventListener('close', event => { clearTimeout(timeout); resolve(event.code); }, { once: true });
      replay.addEventListener('error', () => {}, { once: true });
    });
    expect(closeCode).toBe(1008);
  });
});
