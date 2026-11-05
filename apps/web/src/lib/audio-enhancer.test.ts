import { describe, expect, it } from 'vitest';
import { AUDIO_PRESETS, normalizeAudioPreset } from './audio-enhancer';

describe('local-only audio enhancement presets', () => {
  it('does not enable DSP unless explicitly selected', () => {
    expect(normalizeAudioPreset(undefined)).toBe('off');
    expect(normalizeAudioPreset('unknown')).toBe('off');
    expect(AUDIO_PRESETS.off).toMatchObject({low:0,mid:0,high:0,compression:false});
  });
  it('constrains all preset boosts to conservative values', () => {
    for (const profile of Object.values(AUDIO_PRESETS)) {
      for (const band of [profile.low, profile.mid, profile.high]) {
        expect(Number.isFinite(band)).toBe(true);
        expect(Math.abs(band)).toBeLessThanOrEqual(3);
      }
    }
    expect(normalizeAudioPreset('clarity')).toBe('clarity');
    expect(normalizeAudioPreset('bass')).toBe('bass');
  });
});
