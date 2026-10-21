import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import type { FastifyInstance } from 'fastify';
import { buildApp } from './app';

const url = process.env.NEBULA_TEST_DATABASE_URL;
const secret = 'room-devices-test-only-jwt-secret-00000000000';

describe.skipIf(!url)('room device presence and output consent (PostgreSQL)', () => {
  let pool: Pool;
  let app: FastifyInstance;
  let hostToken = '';
  let guestToken = '';
  let strangerToken = '';
  let roomId = '';
  let inviteCode = '';
  const receiverId = crypto.randomUUID();
  const otherId = crypto.randomUUID();
  const headers = (token: string) => ({ authorization: 'Bearer ' + token });

  beforeAll(async () => {
    pool = new Pool({ connectionString: url });
    app = await buildApp({ pool, secret, origin: 'http://localhost:3000', registrationEnabled: true });
    await app.ready();
    const tokens: string[] = [];
    for (let i = 0; i < 3; i++) {
      const response = await app.inject({ method: 'POST', url: '/v1/auth/register', payload: {
        email: 'room-device-' + crypto.randomUUID() + '@example.test',
        password: 'SecureTestPassword123!',
      } });
      expect(response.statusCode).toBe(201);
      tokens.push(response.json().accessToken as string);
    }
    [hostToken, guestToken, strangerToken] = tokens;
    const created = await app.inject({
      method: 'POST', url: '/v1/rooms', headers: headers(hostToken),
      payload: { name: 'Room devices test', mode: 'party' },
    });
    expect(created.statusCode).toBe(201);
    roomId = created.json().room.id;
    inviteCode = created.json().inviteCode;
    const joined = await app.inject({
      method: 'POST', url: '/v1/rooms/join', headers: headers(guestToken), payload: { code: inviteCode },
    });
    expect(joined.statusCode).toBe(200);
  });

  afterAll(async () => {
    if (app) await app.close();
    if (pool) await pool.end();
  });

  it('keeps device roster private and requires membership to register', async () => {
    expect((await app.inject({ method: 'GET', url: '/v1/rooms/' + roomId + '/devices' })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/v1/rooms/' + roomId + '/devices', headers: headers(strangerToken) })).statusCode).toBe(404);
    const outsider = await app.inject({
      method: 'POST', url: '/v1/rooms/' + roomId + '/devices', headers: headers(strangerToken),
      payload: { deviceId: otherId, label: 'Not a member', platform: 'web' },
    });
    expect(outsider.statusCode).toBe(404);
  });

  it('registers a participant receiver disabled by default and supports idempotent reconnect', async () => {
    const path = '/v1/rooms/' + roomId + '/devices';
    const body = { deviceId: receiverId, label: 'My phone', platform: 'web' };
    const created = await app.inject({ method: 'POST', url: path, headers: headers(guestToken), payload: body });
    expect(created.statusCode).toBe(200);
    expect(created.json().device.outputEnabled).toBe(false);
    const again = await app.inject({ method: 'POST', url: path, headers: headers(guestToken), payload: { ...body, label: 'Renamed phone' } });
    expect(again.statusCode).toBe(200);
    expect(again.json().device.label).toBe('Renamed phone');
    const roster = await app.inject({ method: 'GET', url: path, headers: headers(hostToken) });
    expect(roster.statusCode).toBe(200);
    expect(roster.json().items).toHaveLength(1);
  });

  it('blocks host from enabling someone else\'s speaker', async () => {
    const path = '/v1/rooms/' + roomId + '/devices/' + receiverId + '/output';
    const host = await app.inject({ method: 'PATCH', url: path, headers: headers(hostToken), payload: { outputEnabled: true } });
    expect(host.statusCode).toBe(404);
    const guest = await app.inject({ method: 'PATCH', url: path, headers: headers(guestToken), payload: { outputEnabled: true } });
    expect(guest.statusCode).toBe(200);
    expect(guest.json().outputEnabled).toBe(true);
  });

  it('updates presence only for its owner and disables audio state when output is off', async () => {
    const url = '/v1/rooms/' + roomId + '/devices/' + receiverId + '/heartbeat';
    const forbidden = await app.inject({ method: 'POST', url, headers: headers(hostToken), payload: { playbackState: 'playing' } });
    expect(forbidden.statusCode).toBe(404);
    const live = await app.inject({ method: 'POST', url, headers: headers(guestToken), payload: { playbackState: 'playing' } });
    expect(live.statusCode).toBe(200);
    expect(live.json().playbackState).toBe('playing');
    const output = '/v1/rooms/' + roomId + '/devices/' + receiverId + '/output';
    expect((await app.inject({ method: 'PATCH', url: output, headers: headers(guestToken), payload: { outputEnabled: false } })).statusCode).toBe(200);
    const idle = await app.inject({ method: 'POST', url, headers: headers(guestToken), payload: { playbackState: 'playing' } });
    expect(idle.json().playbackState).toBe('idle');
  });

  it('removes an explicitly disconnected device', async () => {
    const path = '/v1/rooms/' + roomId + '/devices/' + receiverId;
    expect((await app.inject({ method: 'DELETE', url: path, headers: headers(hostToken) })).statusCode).toBe(404);
    expect((await app.inject({ method: 'DELETE', url: path, headers: headers(guestToken) })).statusCode).toBe(204);
    const roster = await app.inject({ method: 'GET', url: '/v1/rooms/' + roomId + '/devices', headers: headers(guestToken) });
    expect(roster.json().items).toHaveLength(0);
  });
});
