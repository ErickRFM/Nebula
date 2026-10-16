import { describe, expect, it } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'node:http';
import handler from './index';

async function invoke(path: string, method = 'GET', body?: unknown) {
  const headers: Record<string, string | string[] | number> = {};
  let raw: Buffer | string | undefined;
  const req = {
    method,
    url: '/api/index?nebulaPath=' + encodeURIComponent(path),
    headers: { 'content-type': 'application/json' },
    query: { nebulaPath: path },
    body,
  } as unknown as IncomingMessage;
  const res = {
    statusCode: 200,
    setHeader(key: string, value: string | string[] | number) { headers[key.toLowerCase()] = value; },
    end(value?: Buffer | string) { raw = value; },
  } as unknown as ServerResponse;
  await handler(req, res);
  return { status: res.statusCode, headers, data: raw ? JSON.parse(raw.toString()) as Record<string, unknown> : null };
}

describe('Vercel /v1 function adapter', () => {
  it('rejects missing and unsafe routes', async () => {
    expect((await invoke('../etc')).status).toBe(404);
    expect((await invoke('')).status).toBe(404);
  });
  it('checks the real CI Postgres connection through the Vercel adapter', async () => {
    const response = await invoke('health');
    expect(response.status).toBe(200);
    expect(response.data).toEqual({ status: 'ok', database: 'connected' });
  });
  it('keeps private registration closed unless explicitly enabled', async () => {
    const response = await invoke('auth/config');
    expect(response.status).toBe(200);
    expect(typeof response.data?.registrationOpen).toBe('boolean');
  });
  it('rejects unauthenticated remote searches', async () => {
    const response = await invoke('discovery/search');
    expect(response.status).toBe(401);
  });
});
