/**
 * NÉBULA Audio Studio V4: non-destructive, local-file-only Web Audio DSP.
 *
 * Do not route CORS-protected external audio/video through MediaElementAudioSourceNode:
 * it can turn cross-origin media silent. The original IndexedDB file is never edited.
 *
 * Signal: source -> dry ------------------------------------------> output -> analyser -> speakers
 *                -> hum -> 7-band EQ -> harmonic bass -> 3-band dynamics
 *                -> presence -> loudness leveler -> mid/side width
 *                -> soft clip -> peak limiter -> wet
 * When effects are off, the dry path is unity gain (no hidden attenuation).
 */
import {
  bassHarmonicGain, clampPercent, correlationFromChannels, DEFAULT_MASTER_SETTINGS,
  lufsFromMeanSquare, multibandRatio, multibandThreshold, nextLevelerGainDb,
  normalizeMasterSettings, peakFromSamples, widthSideGain,
  type AudioMasterSettings, type AudioMeter,
} from './audio-mastering';

export type AudioPreset =
  | 'off' | 'balanced' | 'clarity' | 'bass' | 'vocal' | 'punch'
  | 'treble' | 'podcast' | 'night' | 'electronic' | 'custom'
  | 'natural' | 'cine' | 'spatial' | 'club';

export const AUDIO_BANDS = [
  { frequency: 60, label: '60 Hz' },
  { frequency: 150, label: '150 Hz' },
  { frequency: 400, label: '400 Hz' },
  { frequency: 1000, label: '1 kHz' },
  { frequency: 2400, label: '2.4 kHz' },
  { frequency: 6000, label: '6 kHz' },
  { frequency: 12000, label: '12 kHz' },
] as const;
export const MAX_EQ_DB = 12;

export type AudioBands = number[];

type Profile = {
  low: number;
  mid: number;
  high: number;
  compression: boolean;
  bands: readonly number[];
  /** Default module amounts (0..100) applied when the profile is selected. */
  bass: number;
  width: number;
  dynamics: number;
  /** Static presence lift at 3 kHz in dB, scaled by intensity. */
  clarity: number;
  targetLufs: number;
};

const profile = (
  bands: readonly number[], bass: number, width: number, dynamics: number,
  clarity: number, targetLufs: number, compression = true,
): Profile => ({
  low: bands[0], mid: bands[3], high: bands[6], compression, bands,
  bass, width, dynamics, clarity, targetLufs,
});

export const AUDIO_PRESETS: Record<AudioPreset, Profile> = {
  off:        profile([0, 0, 0, 0, 0, 0, 0], 0, 50, 0, 0, -14, false),
  balanced:   profile([1, 0.5, -0.5, 0, 0.5, 1, 0.5], 45, 45, 40, 0.5, -14),
  clarity:    profile([-0.5, -0.5, -1, 0.5, 2, 1.5, 1], 20, 40, 40, 1.5, -14),
  bass:       profile([2.5, 1.5, -0.5, -0.5, 0, 0.5, 0.5], 75, 40, 45, 0, -14),
  vocal:      profile([-1, -0.5, 0, 2, 2.5, 1, 0.5], 15, 25, 55, 2, -15),
  punch:      profile([2, 0.5, -1, 0.5, 1, 1.5, 1], 60, 45, 70, 0.5, -13),
  treble:     profile([-1, -0.5, 0, 1, 2.5, 3.5, 4], 20, 50, 35, 1.5, -14),
  podcast:    profile([-6, -3, 0, 2.5, 3.5, 2, 1], 10, 15, 65, 1, -16),
  night:      profile([2, 1, 0.5, 0, -1, -1.5, -2], 45, 30, 85, -0.5, -18),
  electronic: profile([4, 3, 0, -1, 1.5, 3, 3], 70, 60, 60, 0, -13),
  custom:     profile([0, 0, 0, 0, 0, 0, 0], 45, 45, 40, 0.5, -14),
  natural:    profile([1.5, 1, 0, -0.5, 0.5, 1, 0.5], 55, 55, 45, 0.5, -14),
  cine:       profile([2, 1, -0.5, 0, 1, 1.5, 1], 50, 65, 65, 1.5, -16),
  spatial:    profile([1, 0.5, -0.5, 0, 0.5, 1.5, 1.5], 35, 90, 40, 0.5, -15),
  club:       profile([3, 2, -0.5, -1, 0.5, 2, 2], 75, 50, 70, 0, -12),
};

export const DEFAULT_PRESET: AudioPreset = 'natural';

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

/** Module defaults for a profile; custom keeps whatever the listener tuned. */
export function presetModules(preset: AudioPreset, current: AudioMasterSettings): AudioMasterSettings {
  if (preset === 'off' || preset === 'custom') return { ...current };
  const selected = AUDIO_PRESETS[preset];
  return {
    intensity: current.intensity,
    bass: selected.bass,
    width: selected.width,
    dynamics: selected.dynamics,
  };
}

export interface AudioEnhancer {
  setPreset(preset: AudioPreset): void;
  setBands(bands: readonly number[]): void;
  setHumFilter(enabled: boolean): void;
  setBypass(enabled: boolean): void;
  setIntensity(value: number): void;
  setModules(value: Pick<AudioMasterSettings, 'bass' | 'width' | 'dynamics'>): void;
  readMeter(): AudioMeter;
  getAnalyser(): AnalyserNode | null;
  resume(): Promise<void>;
  fadeIn(): void;
  dispose(): void;
}

function softClipCurve(size = 2048) {
  const curve = new Float32Array(size);
  const threshold = 0.7;
  for (let index = 0; index < size; index++) {
    const x = (index / (size - 1)) * 2 - 1;
    const magnitude = Math.abs(x);
    curve[index] = magnitude <= threshold
      ? x
      : Math.sign(x) * (threshold + (1 - threshold) * Math.tanh((magnitude - threshold) / (1 - threshold)));
  }
  return curve;
}

function harmonicCurve(size = 1024) {
  const curve = new Float32Array(size);
  const drive = 2.2;
  for (let index = 0; index < size; index++) {
    const x = (index / (size - 1)) * 2 - 1;
    curve[index] = Math.tanh(drive * x) / Math.tanh(drive);
  }
  return curve;
}

function dbToGain(db: number) {
  return Math.pow(10, db / 20);
}

const EMPTY_METER: AudioMeter = { lufs: null, peakDb: null, correlation: null, levelerDb: 0 };

export function createAudioEnhancer(element: HTMLAudioElement): AudioEnhancer {
  const context = new AudioContext();
  const nodes: AudioNode[] = [];
  const track = <T extends AudioNode>(node: T): T => { nodes.push(node); return node; };

  // A media element can be connected to createMediaElementSource only once.
  // The hook retains and disposes this graph over the element's lifetime.
  const source = track(context.createMediaElementSource(element));
  const dry = track(context.createGain());
  const wet = track(context.createGain());
  const output = track(context.createGain());
  dry.gain.value = 1;
  wet.gain.value = 0;
  output.gain.value = 1;

  const highpass = track(context.createBiquadFilter());
  highpass.type = 'highpass';
  highpass.frequency.value = 12;
  highpass.Q.value = 0.7;

  const hum60 = track(context.createBiquadFilter());
  const hum120 = track(context.createBiquadFilter());
  for (const [filter, frequency] of [[hum60, 60], [hum120, 120]] as const) {
    filter.type = 'notch';
    filter.frequency.value = 10;
    filter.Q.value = 18;
    // Frequency is set to 10 Hz when bypassed, well below musical fundamentals.
    void frequency;
  }

  const eq = AUDIO_BANDS.map((band, index) => {
    const filter = track(context.createBiquadFilter());
    filter.type = index === 0 ? 'lowshelf' : index === AUDIO_BANDS.length - 1 ? 'highshelf' : 'peaking';
    filter.frequency.value = band.frequency;
    if (filter.type === 'peaking') filter.Q.value = 1;
    filter.gain.value = 0;
    return filter;
  });

  const headroom = track(context.createGain());
  headroom.gain.value = 1;

  // Parallel harmonic bass: low fundamentals are saturated and high-passed so
  // only the added harmonics remain. This is what makes small speakers feel bass.
  const bassLow = track(context.createBiquadFilter());
  bassLow.type = 'lowpass';
  bassLow.frequency.value = 140;
  bassLow.Q.value = 0.7;
  const bassShaper = track(context.createWaveShaper());
  bassShaper.curve = harmonicCurve();
  bassShaper.oversample = '2x';
  const bassHigh = track(context.createBiquadFilter());
  bassHigh.type = 'highpass';
  bassHigh.frequency.value = 110;
  bassHigh.Q.value = 0.7;
  const bassGain = track(context.createGain());
  bassGain.gain.value = 0;
  const bassSum = track(context.createGain());
  bassSum.gain.value = 1;

  const crossover = (type: BiquadFilterType, frequency: number) => {
    const first = track(context.createBiquadFilter());
    const second = track(context.createBiquadFilter());
    for (const filter of [first, second]) {
      filter.type = type;
      filter.frequency.value = frequency;
      filter.Q.value = 0.707;
    }
    return [first, second] as const;
  };
  const [lowA, lowB] = crossover('lowpass', 120);
  const [midHighA, midHighB] = crossover('highpass', 120);
  const [midLowA, midLowB] = crossover('lowpass', 3000);
  const [highA, highB] = crossover('highpass', 3000);

  const compressors = [0, 1, 2].map((index) => {
    const compressor = track(context.createDynamicsCompressor());
    compressor.threshold.value = 0;
    compressor.ratio.value = 1;
    compressor.knee.value = 6;
    compressor.attack.value = index === 0 ? 0.02 : index === 1 ? 0.01 : 0.006;
    compressor.release.value = index === 0 ? 0.26 : index === 1 ? 0.2 : 0.15;
    return compressor;
  });
  const bandSum = track(context.createGain());
  bandSum.gain.value = 1;

  const presence = track(context.createBiquadFilter());
  presence.type = 'peaking';
  presence.frequency.value = 3000;
  presence.Q.value = 0.9;
  presence.gain.value = 0;

  const levelGain = track(context.createGain());
  levelGain.gain.value = 1;

  // Mid/side width with the side channel high-passed: bass stays mono and
  // the mix survives a mono fold-down without cancellation.
  const splitter = track(context.createChannelSplitter(2));
  const midLeft = track(context.createGain());
  const midRight = track(context.createGain());
  const midSum = track(context.createGain());
  midLeft.gain.value = 0.5;
  midRight.gain.value = 0.5;
  const sideLeft = track(context.createGain());
  const sideRight = track(context.createGain());
  const sideSum = track(context.createGain());
  sideLeft.gain.value = 0.5;
  sideRight.gain.value = -0.5;
  const sideHigh = track(context.createBiquadFilter());
  sideHigh.type = 'highpass';
  sideHigh.frequency.value = 150;
  sideHigh.Q.value = 0.7;
  const sideGain = track(context.createGain());
  sideGain.gain.value = 1;
  const sideScaled = track(context.createGain());
  sideScaled.gain.value = 1;
  const sideInverted = track(context.createGain());
  sideInverted.gain.value = -1;
  const leftSum = track(context.createGain());
  const rightSum = track(context.createGain());
  const merger = track(context.createChannelMerger(2));

  const clip = track(context.createWaveShaper());
  clip.curve = softClipCurve();
  clip.oversample = '4x';
  const limiter = track(context.createDynamicsCompressor());
  limiter.threshold.value = -2;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.001;
  limiter.release.value = 0.1;

  const analyser = track(context.createAnalyser());
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.82;
  analyser.minDecibels = -92;
  analyser.maxDecibels = -12;

  // Metering taps: K-weighting approximates BS.1770, stereo split allows
  // correlation, and a zero-gain sink keeps the analysers pulled by the graph.
  const kHigh = track(context.createBiquadFilter());
  kHigh.type = 'highpass';
  kHigh.frequency.value = 38;
  kHigh.Q.value = 0.5;
  const kShelf = track(context.createBiquadFilter());
  kShelf.type = 'highshelf';
  kShelf.frequency.value = 1500;
  kShelf.Q.value = 0.7;
  kShelf.gain.value = 4;
  const kAnalyser = track(context.createAnalyser());
  kAnalyser.fftSize = 4096;
  kAnalyser.smoothingTimeConstant = 0;
  const meterSplitter = track(context.createChannelSplitter(2));
  const leftAnalyser = track(context.createAnalyser());
  const rightAnalyser = track(context.createAnalyser());
  for (const meter of [leftAnalyser, rightAnalyser]) {
    meter.fftSize = 2048;
    meter.smoothingTimeConstant = 0;
  }
  const meterSink = track(context.createGain());
  meterSink.gain.value = 0;

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
  headroom.connect(bassSum);
  headroom.connect(bassLow);
  bassLow.connect(bassShaper);
  bassShaper.connect(bassHigh);
  bassHigh.connect(bassGain);
  bassGain.connect(bassSum);

  bassSum.connect(lowA);
  lowA.connect(lowB);
  lowB.connect(compressors[0]);
  compressors[0].connect(bandSum);

  bassSum.connect(midHighA);
  midHighA.connect(midHighB);
  midHighB.connect(midLowA);
  midLowA.connect(midLowB);
  midLowB.connect(compressors[1]);
  compressors[1].connect(bandSum);

  bassSum.connect(highA);
  highA.connect(highB);
  highB.connect(compressors[2]);
  compressors[2].connect(bandSum);

  bandSum.connect(presence);
  presence.connect(levelGain);
  levelGain.connect(splitter);
  splitter.connect(midLeft, 0);
  splitter.connect(midRight, 1);
  midLeft.connect(midSum);
  midRight.connect(midSum);
  splitter.connect(sideLeft, 0);
  splitter.connect(sideRight, 1);
  sideLeft.connect(sideSum);
  sideRight.connect(sideSum);
  sideSum.connect(sideHigh);
  sideHigh.connect(sideGain);
  sideGain.connect(sideScaled);
  midSum.connect(leftSum);
  sideScaled.connect(leftSum);
  midSum.connect(rightSum);
  sideScaled.connect(sideInverted);
  sideInverted.connect(rightSum);
  leftSum.connect(merger, 0, 0);
  rightSum.connect(merger, 0, 1);
  merger.connect(clip);
  clip.connect(limiter);
  limiter.connect(wet);
  wet.connect(output);
  output.connect(analyser);
  analyser.connect(context.destination);
  limiter.connect(kHigh);
  kHigh.connect(kShelf);
  kShelf.connect(kAnalyser);
  kAnalyser.connect(meterSink);
  limiter.connect(meterSplitter);
  meterSplitter.connect(leftAnalyser, 0);
  meterSplitter.connect(rightAnalyser, 1);
  leftAnalyser.connect(meterSink);
  rightAnalyser.connect(meterSink);
  meterSink.connect(context.destination);

  let profileName: AudioPreset = 'off';
  let humEnabled = false;
  let bypassed = false;
  let customBands: AudioBands = [...AUDIO_PRESETS.balanced.bands];
  let master: AudioMasterSettings = { ...DEFAULT_MASTER_SETTINGS };
  let disposed = false;
  let levelerDb = 0;
  let smoothedLufs: number | null = null;
  let measuredPeak: number | null = null;
  let smoothedCorrelation: number | null = null;
  let meterTimer: ReturnType<typeof setInterval> | null = null;
  let lastTick = 0;

  const smooth = (param: AudioParam, value: number) => {
    if (!disposed) param.setTargetAtTime(value, context.currentTime, 0.025);
  };

  function sync() {
    const presetOn = !bypassed && profileName !== 'off';
    const enabled = presetOn || (!bypassed && humEnabled);
    const depth = presetOn ? clampPercent(master.intensity, 0) / 100 : 0;
    const bands = presetAudioBands(profileName, customBands);
    bands.forEach((gain, index) => smooth(eq[index].gain, gain));

    // Partial headroom: the soft clip and limiter catch the remaining peaks.
    const peakBoost = Math.max(0, ...bands);
    smooth(headroom.gain, Math.pow(10, -(peakBoost * 0.45) / 20));

    smooth(bassGain.gain, presetOn ? bassHarmonicGain(master.bass, master.intensity) : 0);

    if (presetOn) {
      const ratio = multibandRatio(master.dynamics, master.intensity);
      const threshold = multibandThreshold(master.dynamics, master.intensity);
      [-2, 0, 2].forEach((offset, index) => {
        smooth(compressors[index].threshold, threshold + offset);
        smooth(compressors[index].ratio, ratio);
      });
    } else {
      for (const compressor of compressors) {
        smooth(compressor.threshold, 0);
        smooth(compressor.ratio, 1);
      }
    }

    smooth(presence.gain, presetOn ? AUDIO_PRESETS[profileName].clarity * depth : 0);
    smooth(sideGain.gain, presetOn ? widthSideGain(master.width, master.intensity) : 1);
    if (!presetOn) {
      levelerDb = 0;
      smooth(levelGain.gain, 1);
    }

    smooth(highpass.frequency, humEnabled ? 28 : 12);
    smooth(hum60.frequency, humEnabled ? 60 : 10);
    smooth(hum120.frequency, humEnabled ? 120 : 10);
    smooth(dry.gain, enabled ? 0 : 1);
    smooth(wet.gain, enabled ? 1 : 0);
  }

  const kBuffer = new Float32Array(kAnalyser.fftSize);
  const leftBuffer = new Float32Array(leftAnalyser.fftSize);
  const rightBuffer = new Float32Array(rightAnalyser.fftSize);
  const canMeter = typeof window !== 'undefined' && typeof kAnalyser.getFloatTimeDomainData === 'function';

  function tick() {
    if (disposed) return;
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const delta = lastTick ? (now - lastTick) / 1000 : 0.12;
    lastTick = now;
    kAnalyser.getFloatTimeDomainData(kBuffer);
    let sum = 0;
    for (let index = 0; index < kBuffer.length; index++) sum += kBuffer[index] * kBuffer[index];
    const momentary = lufsFromMeanSquare(sum / kBuffer.length);
    if (momentary !== null) {
      smoothedLufs = smoothedLufs === null ? momentary : smoothedLufs * 0.72 + momentary * 0.28;
    }

    leftAnalyser.getFloatTimeDomainData(leftBuffer);
    rightAnalyser.getFloatTimeDomainData(rightBuffer);
    const leftPeak = peakFromSamples(leftBuffer);
    const rightPeak = peakFromSamples(rightBuffer);
    measuredPeak = leftPeak === null ? rightPeak
      : rightPeak === null ? leftPeak : Math.max(leftPeak, rightPeak);
    const correlation = correlationFromChannels(leftBuffer, rightBuffer);
    if (correlation !== null) {
      smoothedCorrelation = smoothedCorrelation === null
        ? correlation : smoothedCorrelation * 0.75 + correlation * 0.25;
    }

    const presetOn = !bypassed && profileName !== 'off';
    if (presetOn) {
      levelerDb = nextLevelerGainDb(
        levelerDb, smoothedLufs, AUDIO_PRESETS[profileName].targetLufs,
        master.intensity, delta,
      );
      smooth(levelGain.gain, dbToGain(levelerDb));
    }
  }

  if (canMeter) {
    lastTick = typeof performance !== 'undefined' ? performance.now() : Date.now();
    meterTimer = setInterval(tick, 120);
  }

  function resetMeter() {
    smoothedLufs = null;
    measuredPeak = null;
    smoothedCorrelation = null;
  }

  function setPreset(value: AudioPreset) {
    profileName = normalizeAudioPreset(value);
    resetMeter();
    sync();
  }
  function setBands(value: readonly number[]) {
    customBands = normalizeAudioBands([...value]);
    profileName = 'custom';
    sync();
  }
  function setHumFilter(value: boolean) {
    humEnabled = value === true;
    sync();
  }
  function setBypass(value: boolean) {
    bypassed = value === true;
    if (bypassed) {
      levelerDb = 0;
      smooth(levelGain.gain, 1);
    }
    resetMeter();
    sync();
  }
  function setIntensity(value: number) {
    master = normalizeMasterSettings({ ...master, intensity: value });
    sync();
  }
  function setModules(value: Pick<AudioMasterSettings, 'bass' | 'width' | 'dynamics'>) {
    master = normalizeMasterSettings({ ...master, ...value });
    sync();
  }
  function readMeter(): AudioMeter {
    if (disposed) return { ...EMPTY_METER };
    return {
      lufs: smoothedLufs,
      peakDb: measuredPeak,
      correlation: smoothedCorrelation,
      levelerDb,
    };
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
    if (meterTimer !== null) clearInterval(meterTimer);
    meterTimer = null;
    for (const node of nodes) {
      try { node.disconnect(); } catch { /* already detached */ }
    }
    void context.close().catch(() => {});
  }
  return {
    setPreset, setBands, setHumFilter, setBypass, setIntensity, setModules, readMeter,
    getAnalyser: () => (disposed ? null : analyser),
    resume: () => context.resume(), fadeIn, dispose,
  };
}
