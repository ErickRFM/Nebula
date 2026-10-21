import { describe, expect, it } from 'vitest';
import { acousticDelaySummary, detectAcousticPeaks, relativeAcousticDelayMs } from './acoustic';

function impulse(index: number, size = 48_000): number[] {
  const data = new Array<number>(size).fill(0);
  if (index >= 0 && index < size) {
    data[index] = 1;
    data[index + 1] = 0.3;
  }
  return data;
}
describe('acoustic QA measurement primitives', () => {
  it('detects a controlled 125 ms relative delay on a shared clock', () => {
    const left = impulse(4800);
    const right = impulse(10800);
    expect(relativeAcousticDelayMs(left, right, 48000)).toBeCloseTo(125, 5);
    expect(relativeAcousticDelayMs(right, left, 48000)).toBeCloseTo(-125, 5);
  });
  it('does not invent offsets from silence or noise floor', () => {
    expect(detectAcousticPeaks(new Array(4000).fill(0.01), 48000)).toEqual([]);
    expect(relativeAcousticDelayMs(impulse(10), new Array(48_000).fill(0), 48000)).toBeNull();
  });
  it('enforces calibration settings and quantifies P95', () => {
    expect(() => detectAcousticPeaks([0, 1], 0)).toThrow('invalid_sample_rate');
    expect(() => detectAcousticPeaks([0, 1], 48000, { thresholdRatio: -1 })).toThrow('invalid_detection_options');
    expect(acousticDelaySummary([-8, 16, 24, 80, 120])).toEqual({ count: 5, medianAbsMs: 24, p95AbsMs: 120, maxAbsMs: 120 });
    expect(acousticDelaySummary([Number.NaN])).toBeNull();
  });
});
