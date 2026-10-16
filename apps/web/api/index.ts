import type { IncomingMessage, ServerResponse } from 'node:http';
import { Pool } from 'pg';
import { buildApp } from '../../api/src/app.js';

// This is a Vercel Node Function. Keep the Next.js UI as a static export
// (also used by Capacitor) and expose the existing Fastify API on /v1/*.
type VercelRequest = IncomingMessage & {
  body?: unknown;
  query?: Record<string, string | string[] | undefined>;
};

let appPromise: ReturnType<typeof buildApp> | undefined;

function getApp() {
  if (!appPromise) {
    appPromise = (async () => {
      const connectionString = process.env.DATABASE_URL;
      const secret = process.env.API_JWT_SECRET;
      if (!connectionString || !secret || secret.length < 32) {
        throw new Error('nebula_api_not_configured');
      }
      // Each warm function instance owns a single connection. Prefer the
      // Supabase transaction pooler URL for serverless deployments.
      const pool = new Pool({
        connectionString,
        max: 1,
        connectionTimeoutMillis: 8000,
        idleTimeoutMillis: 10000,
      });
      try {
        return await buildApp({
          pool,
          secret,
          origin: process.env.API_CORS_ORIGIN ?? 'https://nebula-er-i1.vercel.app',
        });
      } catch (error) {
        await pool.end();
        throw error;
      }
    })().catch((error: unknown) => {
      appPromise = undefined;
      throw error;
    });
  }
  return appPromise;
}

function getPath(req: VercelRequest): string | null {
  const url = new URL(req.url ?? '/', 'https://nebula.local');
  const raw = req.query?.nebulaPath ?? url.searchParams.get('nebulaPath');
  const path = Array.isArray(raw) ? raw.join('/') : raw;
  if (typeof path !== 'string' || !/^[a-zA-Z0-9_/-]{1,300}$/.test(path)
    || path.includes('..') || path.startsWith('/') || path.endsWith('/')) return null;
  return path;
}

export default async function handler(req: VercelRequest, res: ServerResponse) {
  const path = getPath(req);
  if (!path) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'not_found' }));
    return;
  }
  const method = req.method?.toUpperCase() ?? 'GET';
  if (!['GET', 'POST', 'PATCH', 'DELETE', 'PUT', 'OPTIONS', 'HEAD'].includes(method)) {
    res.statusCode = 405;
    res.end();
    return;
  }

  const query = new URLSearchParams(new URL(req.url ?? '/', 'https://nebula.local').search);
  query.delete('nebulaPath');
  // Vercel exposes both rewritten and original query parameters on req.query.
  for (const [key, value] of Object.entries(req.query ?? {})) {
    if (key === 'nebulaPath' || query.has(key) || value === undefined) continue;
    for (const part of Array.isArray(value) ? value : [value]) query.append(key, part);
  }
  const url = '/v1/' + path + (query.size ? '?' + query.toString() : '');
  const headers = { ...req.headers };
  delete headers['content-length'];
  delete headers['transfer-encoding'];
  const body = req.body;
  const payload = body === undefined ? undefined
    : Buffer.isBuffer(body) ? body
    : typeof body === 'string' ? body : JSON.stringify(body);

  try {
    const app = await getApp();
    const response = await app.inject({
      method: method as 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT' | 'OPTIONS' | 'HEAD',
      url,
      headers,
      payload,
    });
    res.statusCode = response.statusCode;
    for (const [key, value] of Object.entries(response.headers)) {
      if (value !== undefined) res.setHeader(key, value);
    }
    res.end(response.rawPayload);
  } catch (error) {
    console.error('[nebula-api] function request failed', error instanceof Error ? error.name : 'unknown');
    res.statusCode = error instanceof Error && error.message === 'nebula_api_not_configured' ? 503 : 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: res.statusCode === 503 ? 'api_not_configured' : 'server_error' }));
  }
}
