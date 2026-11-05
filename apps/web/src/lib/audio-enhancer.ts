/**
 * NÉBULA Audio Studio V2: non-destructive, local-file-only Web Audio DSP.
 *
 * Do not route CORS-protected external audio/video through MediaElementAudioSourceNode:
 * it can turn cross-origin media silent. The original IndexedDB file is never edited.
 *
 * Signal: source -> dry ---------------------> output -> speakers
 *                -> hum -> 7-band EQ -> trim -> compressor -> wet
 * When effects are off, the dry path is unity gain (no hidden attenuation).
 */
export type AudioPreset = 'off' | 'balanced' | 'clarity' | 'bass' | 'vocal' | 'punch' | 'custom';

export const AUDIO_BANDS = [
  { frequency: 60, label: '60 Hz' },
  { frequency: 150, label: '150 Hz' },
  { frequency: 400, label: '400 Hz' },
  { frequency: 1000, label: '1 kHz' },
  { frequency: 2400, label: '2.4 kHz' },
  { frequency: 6000, label: '6 kHz' },
  { frequency: 12000, label: '12 kHz' },
] as const;
export const MAX_EQ_DB = 6;
export type AudioBands = number[];
type Profile = { low: number; mid: number; high: number; compression: boolean; bands: readonly number[] };

export const AUDIO_PRESETS: Record<AudioPreset, Profile> = {
  off:      { low: 0,   mid: 0,    high: 0,   compression: false, bands: [0, 0, 0, 0, 0, 0, 0] },
  balanced: { low: 1,   mid: -0.5, high: 1,   compression: true,  bands: [1, 0.5, -0.5, 0, 0.5, 1, 0.5] },
  clarity:  { low: -1,  mid: 1.5,  high: 2,   compression: true,  bands: [-0.5, -0.5, -1, 0.5, 2, 1.5, 1] },
  bass:     { low: 2.5, mid: -0.8, high: 0.5, compression: true,  bands: [2.5, 1.5, -0.5, -0.5, 0, 0.5, 0.5] },
  vocal:    { low: -1,  mid: 2,    high: 1,   compression: true,  bands: [-1, -0.5, 0, 2, 2.5, 1, 0.5] },
  punch:    { low: 2,   mid: 0.5,  high: 1,   compression: true,  bands: [2, 0.5, -1, 0.5, 1, 1.5, 1] },
  custom:   { low: 0,   mid: 0,    high: 0,   compression: true,  bands: [0, 0, 0, 0, 0, 0, 0] },
};

export function normalizeAudioPreset(value: unknown): AudioPreset {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(AUDIO_PRESETS, value)
    ? value as AudioPreset
    : 'off';
}

export function normalizeAudioBands(value: unknown): AudioBands {
  if (!Array.isArray(value) || value.length !== AUDIO_BANDS.length ||
      !value.every((band) => typeof band === 'number' && Number.isFinite(band))) {
    return [...AUDIO_PRESETS.balanced.bands];
  }
  return value.map((band: number) => Math.round(Math.max(-MAX_EQ_DB, Math.min(MAX_EQ_DB, band)) * 2) / 2);
}

export function presetAudioBands(preset: AudioPreset, custom: readonly number[]): AudioBands {
  return preset === 'custom' ? normalizeAudioBands([...custom]) : [...AUDIO_PRESETS[preset].bands];
}

export interface AudioEnhancer {
  setPreset(preset: AudioPreset): void;
  setBands(bands: readonly number[]): void;
  setHumFilter(enabled: boolean): void;
  resume(): Promise<void>;
  fadeIn(): void;
  dispose(): void;
}

export function createAudioEnhancer(element: HTMLAudioElement): AudioEnhancer {
  const context = new AudioContext();
  // A media element can be connected to createMediaElementSource only once.
  // The hook retains and disposes this graph over the element's lifetime.
  const source = context.createMediaElementSource(element);
  const dry = context.createGain();
  const wet = context.createGain();
  const output = context.createGain();
  dry.gain.value = 1;
  wet.gain.value = 0;
  output.gain.value = 1;

  const highpass = context.createBiquadFilter();
  highpass.type = 'highpass';
  highpass.frequency.value = 12;
  highpass.Q.value = 0.7;

  const hum60 = context.createBiquadFilter();
  const hum120 = context.createBiquadFilter();
  for (const [filter, frequency] of [[hum60, 60], [hum120, 120]] as const) {
    filter.type = 'notch';
    filter.frequency.value = 10;
    filter.Q.value = 18;
    // Frequency is set to 10 Hz when bypassed, well below musical fundamentals.
    void frequency;
  }

  const eq = AUDIO_BANDS.map((band, index) => {
    const filter = context.createBiquadFilter();
    filter.type = index === 0 ? 'lowshelf' : index === AUDIO_BANDS.length - 1 ? 'highshelf' : 'peaking';
    filter.frequency.value = band.frequency;
    if (filter.type === 'peaking') filter.Q.value = 1;
    filter.gain.value = 0;
    return filter;
  });

  const headroom = context.createGain();
  headroom.gain.value = 1;
  const compressor = context.createDynamicsCompressor();
  compressor.attack.value = 0.012;
  compressor.release.value = 0.25;
  compressor.knee.value = 18;
  compressor.threshold.value = -16;
  compressor.ratio.value = 2;

  source.connect(dry);
  dry.connect(output);
  source.connect(highpass);
  highpass.connect(hum60);
  hum60.connect(hum120);
  let previous: AudioNode = hum120;
  for (const filter of eq) {
    previous.connect(filter);
    previous = filter;
  }
  previous.connect(headroom);
  headroom.connect(compressor);
  compressor.connect(wet);
  wet.connect(output);
  output.connect(context.destination);

  let preset: AudioPreset = 'off';
  let humEnabled = false;
  let customBands: AudioBands = [...AUDIO_PRESETS.balanced.bands];
  let disposed = false;

  const smooth = (param: AudioParam, value: number) => {
    if (!disposed) param.setTargetAtTime(value, context.currentTime, 0.025);
  };

  function sync() {
    const enabled = preset !== 'off' || humEnabled;
    const bands = presetAudioBands(preset, customBands);
    bands.forEach((gain, i) => smooth(eq[i].gain, gain));
    // Leave headroom for EQ boosts. Compression is not a true-peak limiter.
    const peakBoost = Math.max(0, ...bands);
    smooth(headroom.gain, Math.pow(10, -Math.max(0, peakBoost - 0.5) / 20));
    const compression = preset !== 'off' && AUDIO_PRESETS[preset].compression;
    smooth(compressor.threshold, compression ? (preset === 'punch' ? -19 : -16) : -1);
    smooth(compressor.ratio, compression ? (preset === 'punch' ? 2.6 : 2) : 1);
    smooth(highpass.frequency, humEnabled ? 28 : 12);
    smooth(hum60.frequency, humEnabled ? 60 : 10);
    smooth(hum120.frequency, humEnabled ? 120 : 10);
    smooth(dry.gain, enabled ? 0 : 1);
    smooth(wet.gain, enabled ? 1 : 0);
  }

  function setPreset(value: AudioPreset) {
    preset = normalizeAudioPreset(value);
    sync();
  }
  function setBands(value: readonly number[]) {
    customBands = normalizeAudioBands([...value]);
    preset = 'custom';
    sync();
  }
  function setHumFilter(value: boolean) {
    humEnabled = value === true;
    sync();
  }
  function fadeIn() {
    if (disposed) return;
    const now = context.currentTime;
    output.gain.cancelScheduledValues(now);
    output.gain.setValueAtTime(0, now);
    output.gain.linearRampToValueAtTime(1, now + 0.07);
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    source.disconnect();
    dry.disconnect();
    highpass.disconnect();
    hum60.disconnect();
    hum120.disconnect();
    for (const filter of eq) filter.disconnect();
    headroom.disconnect();
    compressor.disconnect();
    wet.disconnect();
    output.disconnect();
    void context.close().catch(() => {});
  }
  return { setPreset, setBands, setHumFilter, resume: () => context.resume(), fadeIn, dispose };
}
