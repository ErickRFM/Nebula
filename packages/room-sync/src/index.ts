/**
 * Pure room synchronization primitives. All timestamps use milliseconds.
 * The transport supplies server timestamps; clients supply monotonic local timestamps.
 * This package never transports audio, assumes rights to audio, or controls hardware.
 */
export type RoomPlaybackStatus = 'playing' | 'paused';

export interface RoomTimeline {
  revision: number;
  trackId: string | null;
  status: RoomPlaybackStatus;
  positionMs: number;
  effectiveServerTimeMs: number;
}

export interface ClockProbe {
  /** Client monotonic clock when the request was sent. */
  clientSentMs: number;
  /** Server clock when request arrived. */
  serverReceivedMs: number;
  /** Server clock when response left. */
  serverSentMs: number;
  /** Client monotonic clock when response arrived. */
  clientReceivedMs: number;
}

export interface ClockSample {
  /** Add to client clock to estimate server time. */
  offsetMs: number;
  /** Network round trip excluding server processing time. */
  roundTripMs: number;
}

export interface DeviceTiming {
  /** Server time ~= client time + clockOffsetMs. */
  clockOffsetMs: number;
  /** Delay between scheduling playback and audible output. */
  outputLatencyMs: number;
  /** Manual adjustment for this particular speaker / Bluetooth route. */
  calibrationMs: number;
}

export type SyncCorrection =
  | { kind: 'none'; errorMs: number; playbackRate: 1 }
  | { kind: 'rate'; errorMs: number; playbackRate: number }
  | { kind: 'seek'; errorMs: number; targetPositionMs: number; playbackRate: 1 };

function finite(value: number): boolean {
  return Number.isFinite(value);
}

/** NTP-style four-timestamp offset estimate. Reject malformed or reversed probes. */
export function clockSample(probe: ClockProbe): ClockSample | null {
  const { clientSentMs: c0, serverReceivedMs: s1, serverSentMs: s2, clientReceivedMs: c3 } = probe;
  if (![c0, s1, s2, c3].every(finite) || c3 < c0 || s2 < s1) return null;
  const roundTripMs = c3 - c0 - (s2 - s1);
  if (roundTripMs < 0 || roundTripMs > 60_000) return null;
  return { offsetMs: ((s1 - c0) + (s2 - c3)) / 2, roundTripMs };
}

/**
 * Favor low-RTT probes to reduce asymmetric network bias; use the median
 * of the best half to reject individual outliers.
 */
export function estimateClockOffset(samples: readonly ClockSample[]): number | null {
  const valid = samples.filter(s => finite(s.offsetMs) && finite(s.roundTripMs) && s.roundTripMs >= 0);
  if (!valid.length) return null;
  const best = [...valid].sort((a, b) => a.roundTripMs - b.roundTripMs).slice(0, Math.max(1, Math.ceil(valid.length / 2)));
  const offsets = best.map(s => s.offsetMs).sort((a, b) => a - b);
  const middle = Math.floor(offsets.length / 2);
  return offsets.length % 2 ? offsets[middle] : (offsets[middle - 1] + offsets[middle]) / 2;
}

/** Expected logical playback position, not guaranteed acoustic position. */
export function expectedPositionMs(timeline: RoomTimeline, serverNowMs: number): number {
  if (![timeline.positionMs, timeline.effectiveServerTimeMs, serverNowMs].every(finite)) return 0;
  const position = Math.max(0, timeline.positionMs);
  if (timeline.status === 'paused') return position;
  return Math.max(0, position + Math.max(0, serverNowMs - timeline.effectiveServerTimeMs));
}

/**
 * Project a server timeline into local output time. Output latency and calibration
 * are subtracted so the audible result approaches the shared timeline.
 */
export function desiredPositionMs(timeline: RoomTimeline, clientNowMs: number, timing: DeviceTiming): number {
  const serverNow = clientNowMs + timing.clockOffsetMs;
  const latency = Math.max(0, timing.outputLatencyMs);
  return expectedPositionMs(timeline, serverNow + latency + timing.calibrationMs);
}

/**
 * A conservative correction policy: ignore tiny errors, nudge playback rate
 * within 2% for moderate drift, seek only when substantially out of sync.
 * Playback rate must be reset to 1 on pause/track change by the consumer.
 */
export function correctionForDrift(actualMs: number, targetMs: number, playing: boolean): SyncCorrection {
  if (![actualMs, targetMs].every(finite) || !playing) return { kind: 'none', errorMs: 0, playbackRate: 1 };
  const errorMs = targetMs - actualMs;
  if (Math.abs(errorMs) <= 35) return { kind: 'none', errorMs, playbackRate: 1 };
  if (Math.abs(errorMs) > 250) return { kind: 'seek', errorMs, targetPositionMs: Math.max(0, targetMs), playbackRate: 1 };
  return { kind: 'rate', errorMs, playbackRate: errorMs > 0 ? 1.02 : 0.98 };
}

/** Reject delayed or duplicate room updates. */
export function shouldAcceptRevision(currentRevision: number, incomingRevision: number): boolean {
  return Number.isSafeInteger(incomingRevision) && incomingRevision > currentRevision;
}

export { detectAcousticPeaks, relativeAcousticDelayMs, acousticDelaySummary, alignAcousticPeaks } from './acoustic';
export type { AcousticPeak, AcousticAlignment, AcousticPair } from './acoustic';
