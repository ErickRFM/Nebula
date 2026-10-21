import { createHmac, createHash } from 'node:crypto';

export type R2Settings = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
};

export const MAX_CLOUD_AUDIO_BYTES = 100 * 1024 * 1024;

export function readR2Settings(env: NodeJS.ProcessEnv = process.env): R2Settings | null {
  const accountId = env.R2_ACCOUNT_ID?.trim() ?? '';
  const accessKeyId = env.R2_ACCESS_KEY_ID?.trim() ?? '';
  const secretAccessKey = env.R2_SECRET_ACCESS_KEY ?? '';
  const bucket = env.R2_BUCKET?.trim() ?? '';
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) return null;
  if (!/^[a-f0-9]{32}$/i.test(accountId) || !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket)) {
    return null;
  }
  return { accountId, accessKeyId, secretAccessKey, bucket };
}

function encoded(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) => '%' + char.charCodeAt(0).toString(16).toUpperCase());
}

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac('sha256', key).update(data).digest();
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** AWS SigV4 query authentication, compatible with Cloudflare R2's S3 endpoint. */
export function presignR2(
  settings: R2Settings,
  method: 'PUT' | 'GET' | 'HEAD' | 'DELETE',
  objectKey: string,
  expiresSeconds: number,
  contentType?: string,
  now = new Date(),
  downloadFilename?: string,
): string {
  if (expiresSeconds < 1 || expiresSeconds > 3600 || !Number.isInteger(expiresSeconds)) {
    throw new Error('invalid_presign_ttl');
  }
  if (!/^audio\/[a-z0-9.+-]+$/.test(contentType ?? 'audio/mpeg') || (method !== 'PUT' && contentType)) {
    throw new Error('invalid_signed_content_type');
  }
  if (downloadFilename && (method !== 'GET' || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,159}$/.test(downloadFilename))) {
    throw new Error('invalid_download_filename');
  }
  if (!/^users\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.[a-z0-9]+$/.test(objectKey)) {
    throw new Error('invalid_object_key');
  }
  const url = new URL('https://' + settings.accountId + '.r2.cloudflarestorage.com/' +
    encoded(settings.bucket) + '/' + objectKey.split('/').map(encoded).join('/'));
  const stamp = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const date = stamp.slice(0, 8);
  const scope = date + '/auto/s3/aws4_request';
  const signedHeaders = contentType ? 'content-type;host' : 'host';
  const params: Record<string, string> = {
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': settings.accessKeyId + '/' + scope,
    'X-Amz-Date': stamp,
    'X-Amz-Expires': String(expiresSeconds),
    'X-Amz-SignedHeaders': signedHeaders,
  };
  if (downloadFilename) params['response-content-disposition'] = 'attachment; filename="' + downloadFilename + '"';
  const canonicalQuery = Object.keys(params).sort()
    .map((key) => encoded(key) + '=' + encoded(params[key])).join('&');
  const canonicalHeaders = (contentType ? 'content-type:' + contentType + '\n' : '') + 'host:' + url.host + '\n';
  const canonicalRequest = [method, url.pathname, canonicalQuery, canonicalHeaders, signedHeaders, 'UNSIGNED-PAYLOAD'].join('\n');
  const toSign = ['AWS4-HMAC-SHA256', stamp, scope, sha256(canonicalRequest)].join('\n');
  const signingKey = hmac(hmac(hmac(hmac('AWS4' + settings.secretAccessKey, date), 'auto'), 's3'), 'aws4_request');
  const signature = createHmac('sha256', signingKey).update(toSign).digest('hex');
  url.search = canonicalQuery + '&X-Amz-Signature=' + signature;
  return url.toString();
}

export async function inspectR2Object(settings: R2Settings, key: string): Promise<{ size: number; contentType: string } | null> {
  const response = await fetch(presignR2(settings, 'HEAD', key, 60), {
    method: 'HEAD', redirect: 'error', signal: AbortSignal.timeout(8000),
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error('r2_head_failed_' + response.status);
  const size = Number(response.headers.get('content-length'));
  const contentType = response.headers.get('content-type')?.split(';')[0].toLowerCase() ?? '';
  if (!Number.isSafeInteger(size) || size < 1) throw new Error('r2_invalid_object_size');
  return { size, contentType };
}

export async function deleteR2Object(settings: R2Settings, key: string): Promise<void> {
  const response = await fetch(presignR2(settings, 'DELETE', key, 60), {
    method: 'DELETE', redirect: 'error', signal: AbortSignal.timeout(8000),
  });
  if (!response.ok && response.status !== 404) throw new Error('r2_delete_failed_' + response.status);
}

export const AUDIO_MIME: Record<string, string> = {
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  opus: 'audio/ogg',
  flac: 'audio/flac',
  aac: 'audio/aac',
};

export function audioMimeForFilename(filename: string): string | null {
  const extension = filename.toLowerCase().split('.').pop() ?? '';
  return AUDIO_MIME[extension] ?? null;
}
