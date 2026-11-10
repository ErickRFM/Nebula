import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MASTER_SETTINGS, bassHarmonicGain, clampPercent, correlationFromChannels,
  lufsFromMeanSquare, moduleAmount, multibandRatio, nextLevelerGainDb,
  normalizeMasterSettings, peakFromSamples, widthSideGain,
} from './audio-mastering';

describe('immersion master settings', () => {
  it('clamps and normalizes every control to 0..100', () => {
    expect(clampPercent(140, 60)).toBe(100);
    expect(clampPercent(-20, 60)).toBe(0);
    expect(clampPercent(Number.NaN, 60)).toBe(60);
    expect(normalizeMasterSettings(null)).toEqual(DEFAULT_MASTER_SETTINGS);
    expect(normalizeMasterSettings({ intensity: '75', bass: 500, width: -1, dynamics: 33 }))
      .toEqual({ intensity: 75, bass: 100, width: 0, dynamics: 33 });
  });

  it('scales modules with master intensity and keeps width neutral at 50', () => {
    expect(moduleAmount(80, 50)).toBeCloseTo(0.4);
    expect(bassHarmonicGain(100, 100)).toBeCloseTo(0.55);
    expect(multibandRatio(0, 100)).toBe(1);
    expect(multibandRatio(100, 100)).toBeCloseTo(3.4);
    expect(widthSideGain(50, 100)).toBeCloseTo(1);
    expect(widthSideGain(100, 100)).toBeCloseTo(1.6);
    expect(widthSideGain(0, 100)).toBeCloseTo(0.4);
    expect(widthSideGain(100, 0)).toBeCloseTo(1);
  });
});

describe('loudness and stereo measurements', () => {
  it('estimates momentary loudness from a K-weighted mean square', () => {
    expect(lufsFromMeanSquare(0)).toBeNull();
    expect(lufsFromMeanSquare(Number.NaN)).toBeNull();
    expect(lufsFromMeanSquare(0.01)).toBeCloseTo(-20.691, 2);
  });

  it('measures sample peak and correlation', () => {
    expect(peakFromSamples(new Float32Array([0, 0.5, -0.25]))).toBeCloseTo(-6.02, 1);
    expect(peakFromSamples(new Float32Array([0, 0]))).toBeNull();
    const left = new Float32Array([0.2, -0.4, 0.1, 0.3]);
    expect(correlationFromChannels(left, left)).toBeCloseTo(1);
    expect(correlationFromChannels(left, left.map(value => -value))).toBeCloseTo(-1);
    expect(correlationFromChannels(left, new Float32Array(4))).toBeNull();
  });
});

describe('gain rider', () => {
  it('moves toward the target at a bounded rate', () => {
    const oneSecond = nextLevelerGainDb(0, -20, -14, 100, 1);
    expect(oneSecond).toBeCloseTo(4);
    const halfSecond = nextLevelerGainDb(0, -20, -14, 100, 0.5);
    expect(halfSecond).toBeCloseTo(2);
  });

  it('caps correction by intensity and ignores tiny drift', () => {
    let gain = 0;
    for (let step = 0; step < 3; step++) gain = nextLevelerGainDb(gain, -30, -14, 100, 1);
    expect(gain).toBeCloseTo(9);
    let half = 0;
    for (let step = 0; step < 3; step++) half = nextLevelerGainDb(half, -30, -14, 50, 1);
    expect(half).toBeCloseTo(4.5);
    expect(nextLevelerGainDb(1, -15.1, -14, 100, 1)).toBe(1);
    expect(nextLevelerGainDb(3, null, -14, 100, 1)).toBe(3);
    expect(nextLevelerGainDb(3, -20, -14, 0, 1)).toBe(0);
  });
});
