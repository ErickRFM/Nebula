import { describe, expect, it } from 'vitest';
import { clockSample, correctionForDrift, desiredPositionMs, estimateClockOffset, expectedPositionMs, shouldAcceptRevision, type RoomTimeline } from './index';

describe('room synchronization primitives', () => {
  it('estimates clock offset excluding server processing', () => {
    // Client sends at 1000, server is +200 ahead, network is 50ms each way.
    expect(clockSample({ clientSentMs: 1000, serverReceivedMs: 1250, serverSentMs: 1260, clientReceivedMs: 1110 }))
      .toEqual({ offsetMs: 200, roundTripMs: 100 });
  });

  it('rejects reversed or impossible clock probes', () => {
    expect(clockSample({ clientSentMs: 100, serverReceivedMs: 50, serverSentMs: 40, clientReceivedMs: 120 })).toBeNull();
    expect(clockSample({ clientSentMs: 100, serverReceivedMs: 100, serverSentMs: 200, clientReceivedMs: 150 })).toBeNull();
    expect(clockSample({ clientSentMs: NaN, serverReceivedMs: 100, serverSentMs: 100, clientReceivedMs: 100 })).toBeNull();
  });

  it('ignores high latency samples and outliers', () => {
    expect(estimateClockOffset([
      { offsetMs: 20, roundTripMs: 10 },
      { offsetMs: 21, roundTripMs: 12 },
      { offsetMs: 400, roundTripMs: 1000 },
      { offsetMs: 18, roundTripMs: 15 },
    ])).toBe(20.5);
    expect(estimateClockOffset([])).toBeNull();
  });

  const playing: RoomTimeline = { revision: 2, trackId: 'cloud:abc', status: 'playing', positionMs: 1000, effectiveServerTimeMs: 5000 };
  it('projects scheduled and current timeline without going backwards', () => {
    expect(expectedPositionMs(playing, 4000)).toBe(1000);
    expect(expectedPositionMs(playing, 6000)).toBe(2000);
    expect(expectedPositionMs({ ...playing, status: 'paused' }, 9000)).toBe(1000);
  });

  it('accounts for clock offset and device output latency', () => {
    expect(desiredPositionMs(playing, 5800, { clockOffsetMs: 200, outputLatencyMs: 120, calibrationMs: -20 })).toBe(2100);
  });

  it('uses conservative correction thresholds', () => {
    expect(correctionForDrift(1000, 1020, true).kind).toBe('none');
    expect(correctionForDrift(1000, 1100, true)).toEqual({ kind: 'rate', errorMs: 100, playbackRate: 1.02 });
    expect(correctionForDrift(1100, 1000, true)).toEqual({ kind: 'rate', errorMs: -100, playbackRate: 0.98 });
    expect(correctionForDrift(1000, 1600, true)).toEqual({ kind: 'seek', errorMs: 600, targetPositionMs: 1600, playbackRate: 1 });
    expect(correctionForDrift(1000, 2000, false).kind).toBe('none');
  });

  it('ignores stale revisions', () => {
    expect(shouldAcceptRevision(8, 8)).toBe(false);
    expect(shouldAcceptRevision(8, 7)).toBe(false);
    expect(shouldAcceptRevision(8, 9)).toBe(true);
    expect(shouldAcceptRevision(8, 9.5)).toBe(false);
  });
});
