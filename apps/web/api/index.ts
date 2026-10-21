import type { IncomingMessage, ServerResponse } from 'node:http';
import { Pool } from 'pg';
import type { buildApp } from '../../api/src/app.js';

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
        // Keep the backend ESM package out of the CJS require() path used by
        // Vercel's standalone Node Function launcher.
        const backend = await import('../../api/src/app.js');
        return await backend.buildApp({
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
    if (method === 'GET' && /^\/v1\/rooms\/[0-9a-fA-F-]{36}\/events$/.test(url)) {
      // Fastify injection buffers the entire response and cannot transport SSE.
      // Hand off the original Node streams directly only for this GET endpoint.
      // No request body or URL bearer token is involved.
      req.url = url;
      await new Promise<void>(resolve => {
        res.once('finish', resolve);
        res.once('close', resolve);
        app.server.emit('request', req, res);
      });
      return;
    }
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
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'unknown';
    const detail = process.env.VERCEL_ENV === 'preview' && error instanceof Error
      ? error.message.replace(/postgres(?:ql)?:\/\/[^\s]+/gi, 'postgresql://[redacted]')
      : undefined;
    console.error('[nebula-api] function request failed', { code, name: error instanceof Error ? error.name : 'unknown', detail });
    res.statusCode = error instanceof Error && error.message === 'nebula_api_not_configured' ? 503 : 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: res.statusCode === 503 ? 'api_not_configured' : 'server_error' }));
  }
}
