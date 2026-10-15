export type RepeatMode = 'off' | 'all' | 'one';
export type PlaybackState = 'idle' | 'loading' | 'buffering' | 'playing' | 'paused' | 'ended' | 'error';
export interface QueueOptions { shuffle: boolean; repeat: RepeatMode; random?: () => number; }
export function nextIndex(index: number, length: number, options: QueueOptions): number | null {
  if (length <= 0 || index < 0 || index >= length) return null;
  if (options.repeat === 'one') return index;
  if (options.shuffle && length > 1) {
    const raw = options.random?.() ?? Math.random();
    const choice = Math.min(length - 2, Math.max(0, Math.floor(raw * (length - 1))));
    return choice >= index ? choice + 1 : choice;
  }
  if (index + 1 < length) return index + 1;
  return options.repeat === 'all' ? 0 : null;
}
export function previousIndex(index: number, length: number, repeat: RepeatMode): number | null {
  if (length <= 0 || index < 0 || index >= length) return null;
  if (index > 0) return index - 1;
  return repeat === 'all' ? length - 1 : 0;
}
export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
export function clampSeek(seconds: number, duration: number): number {
  if (!Number.isFinite(seconds) || !Number.isFinite(duration) || duration <= 0) return 0;
  return Math.max(0, Math.min(seconds, duration));
}
