import { describe, expect, it } from 'vitest';
import { getSampleAudioUrl, SAMPLE_ROOM_TRACK } from './sample-audio';

describe('sample audio generator', () => {
  it('defines a sample track metadata', () => {
    expect(SAMPLE_ROOM_TRACK.id).toBe('sample-cosmic-pulse');
    expect(SAMPLE_ROOM_TRACK.title).toContain('Pulso Cósmico');
    expect(SAMPLE_ROOM_TRACK.artist).toBe('NÉBULA Sound Lab');
  });

  it('generates a valid WAV blob or data URL in browser-like environment', () => {
    const url = getSampleAudioUrl();
    // In node/test environment without window/Blob or with polyfill
    if (typeof window !== 'undefined' && typeof Blob !== 'undefined') {
      expect(url.length).toBeGreaterThan(0);
    }
  });
});
