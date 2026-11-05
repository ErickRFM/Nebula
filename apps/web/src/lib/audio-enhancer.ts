/**
 * Conservative processing for user-owned local audio ONLY.
 * Browser media from third-party origins must bypass WebAudio: CORS-protected
 * media elements become silent if routed through MediaElementAudioSourceNode.
 * This module never modifies the source file stored in IndexedDB.
 */
export type AudioPreset = 'off' | 'balanced' | 'clarity' | 'bass';

export const AUDIO_PRESETS: Record<AudioPreset, { low: number; mid: number; high: number; compression: boolean }> = {
  off: { low: 0, mid: 0, high: 0, compression: false },
  balanced: { low: 1, mid: -0.5, high: 1, compression: true },
  clarity: { low: -1, mid: 1.5, high: 2, compression: true },
  bass: { low: 2.5, mid: -0.8, high: 0.5, compression: true },
};

export function normalizeAudioPreset(value: unknown): AudioPreset {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(AUDIO_PRESETS, value)
    ? value as AudioPreset
    : 'off';
}

export interface AudioEnhancer {
  setPreset(preset: AudioPreset): void;
  setHumFilter(enabled: boolean): void;
  resume(): Promise<void>;
  fadeIn(): void;
  dispose(): void;
}

export function createAudioEnhancer(element: HTMLAudioElement): AudioEnhancer {
  const context = new AudioContext();
  const source = context.createMediaElementSource(element);
  const highpass = context.createBiquadFilter();
  highpass.type = 'highpass';
  highpass.frequency.value = 12;
  const hum = context.createBiquadFilter();
  hum.type = 'notch';
  hum.frequency.value = 60;
  hum.Q.value = 14;
  const low = context.createBiquadFilter();
  low.type = 'lowshelf';
  low.frequency.value = 125;
  const mid = context.createBiquadFilter();
  mid.type = 'peaking';
  mid.frequency.value = 1600;
  mid.Q.value = 0.8;
  const high = context.createBiquadFilter();
  high.type = 'highshelf';
  high.frequency.value = 6500;
  const compressor = context.createDynamicsCompressor();
  compressor.attack.value = 0.008;
  compressor.release.value = 0.22;
  compressor.knee.value = 10;
  const output = context.createGain();
  output.gain.value = 0.9;

  source.connect(highpass);
  highpass.connect(hum);
  hum.connect(low);
  low.connect(mid);
  mid.connect(high);
  high.connect(compressor);
  compressor.connect(output);
  output.connect(context.destination);

  function smooth(param: AudioParam, value: number) {
    param.setTargetAtTime(value, context.currentTime, 0.045);
  }
  function setPreset(preset: AudioPreset) {
    const profile = AUDIO_PRESETS[preset];
    smooth(low.gain, profile.low);
    smooth(mid.gain, profile.mid);
    smooth(high.gain, profile.high);
    smooth(compressor.threshold, profile.compression ? -18 : -1);
    smooth(compressor.ratio, profile.compression ? 2.2 : 1);
  }
  function setHumFilter(enabled: boolean) {
    // 60 Hz power-line hum is common in recordings. Do not run this by default:
    // the notch can also remove wanted musical bass, and cannot repair a bad DAC.
    smooth(highpass.frequency, enabled ? 28 : 12);
    smooth(hum.Q, 14);
    smooth(hum.frequency, enabled ? 60 : 10);
  }
  function fadeIn() {
    const now = context.currentTime;
    output.gain.cancelScheduledValues(now);
    output.gain.setValueAtTime(0.0, now);
    output.gain.linearRampToValueAtTime(0.9, now + 0.07);
  }
  function dispose() {
    source.disconnect();
    highpass.disconnect();
    hum.disconnect();
    low.disconnect();
    mid.disconnect();
    high.disconnect();
    compressor.disconnect();
    output.disconnect();
    void context.close().catch(() => {});
  }
  setPreset('off');
  setHumFilter(false);
  return { setPreset, setHumFilter, resume: () => context.resume(), fadeIn, dispose };
}
