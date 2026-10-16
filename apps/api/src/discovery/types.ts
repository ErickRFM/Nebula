export type AudioProviderId = 'jamendo' | 'openverse' | 'audius';

export interface ExternalTrack {
  id: string;
  provider: AudioProviderId;
  externalId: string;
  title: string;
  artist: string;
  album: string | null;
  durationSeconds: number | null;
  artworkUrl: string | null;
  sourceUrl: string;
  licenseUrl: string | null;
  /** Explicit provider-facing playback capability, NOT an import permission. */
  canStream: boolean;
  /** Provider says download can be offered; does not authorize R2 storage. */
  canDownload: boolean;
  canStorePrivateCopy: false;
  streamUrl: string | null;
}

export interface SearchRequest {
  query: string;
  page: number;
  limit: number;
}

export interface AudioProvider {
  readonly id: AudioProviderId;
  readonly enabled: boolean;
  search(request: SearchRequest): Promise<ExternalTrack[]>;
}

export function safeHttpsUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2048) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    if (!url.hostname || url.hostname === 'localhost' || url.hostname.endsWith('.local')) return null;
    return url.href;
  } catch { return null; }
}

export function stringField(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.trim().slice(0, 300) : fallback;
}

export function durationField(value: unknown): number | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(n) && n >= 0 && n < 1_000_000 ? Math.round(n) : null;
}
