import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AUDIO_BANDS, AUDIO_PRESETS, MAX_EQ_DB, createAudioEnhancer,
  normalizeAudioBands, normalizeAudioPreset, presetAudioBands,
} from './audio-enhancer';

describe('NÉBULA seven-band audio processing', () => {
  it('validates custom EQ values and never persists unsafe boosts', () => {
    expect(AUDIO_BANDS).toHaveLength(7);
    expect(normalizeAudioBands([500, -100, 1.24, 2, 0, 0, 0]))
      .toEqual([MAX_EQ_DB, -MAX_EQ_DB, 1, 2, 0, 0, 0]);
    expect(normalizeAudioBands([NaN, 0, 0, 0, 0, 0, 0]))
      .toEqual(AUDIO_PRESETS.balanced.bands);
    expect(normalizeAudioBands({})).toEqual(AUDIO_PRESETS.balanced.bands);
    expect(normalizeAudioPreset('custom')).toBe('custom');
    expect(normalizeAudioPreset('__proto__')).toBe('off');
  });

  it('has a real distinct 7-band profile for each listening mode', () => {
    for (const [name, profile] of Object.entries(AUDIO_PRESETS)) {
      expect(profile.bands).toHaveLength(7);
      expect(profile.bands.every((db) => Number.isFinite(db) && Math.abs(db) <= MAX_EQ_DB)).toBe(true);
      expect(presetAudioBands(name as keyof typeof AUDIO_PRESETS, [1, 2, 3, 4, 5, 6, 0])).toHaveLength(7);
    }
    expect(presetAudioBands('custom', [1, 2, 3, 4, 5, 6, 0])).toEqual([1, 2, 3, 4, 5, 6, 0]);
    expect(presetAudioBands('off', [3, 3, 3, 3, 3, 3, 3])).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });
});

class FakeParam {
  value = 0;
  setTargetAtTime(value: number) { this.value = value; }
  cancelScheduledValues() {}
  setValueAtTime(value: number) { this.value = value; }
  linearRampToValueAtTime(value: number) { this.value = value; }
}
class FakeNode {
  gain = new FakeParam();
  frequency = new FakeParam();
  Q = new FakeParam();
  threshold = new FakeParam();
  ratio = new FakeParam();
  attack = new FakeParam();
  release = new FakeParam();
  knee = new FakeParam();
  type = '';
  curve: Float32Array | null = null;
  oversample = '';
  connections: FakeNode[] = [];
  disconnected = false;
  constructor(readonly kind: string) {}
  connect(node: FakeNode, _output?: number, _input?: number) { this.connections.push(node); return node; }
  disconnect() { this.disconnected = true; }
}
class FakeAudioContext {
  static instances: FakeAudioContext[] = [];
  currentTime = 0;
  destination = new FakeNode('destination');
  nodes: FakeNode[] = [];
  closed = false;
  constructor() { FakeAudioContext.instances.push(this); }
  private add(kind: string) { const node = new FakeNode(kind); this.nodes.push(node); return node; }
  createMediaElementSource() { return this.add('source'); }
  createGain() { return this.add('gain'); }
  createBiquadFilter() { return this.add('filter'); }
  createDynamicsCompressor() { return this.add('compressor'); }
  createWaveShaper() { return this.add('waveshaper'); }
  createChannelSplitter() { return this.add('splitter'); }
  createChannelMerger() { return this.add('merger'); }
  createAnalyser() { return this.add('analyser'); }
  resume() { return Promise.resolve(); }
  close() { this.closed = true; return Promise.resolve(); }
}

describe('Web Audio graph', () => {
  afterEach(() => { vi.unstubAllGlobals(); FakeAudioContext.instances.length = 0; });

  it('has a unity-gain dry route, applies EQ, switches back to original and disposes', async () => {
    vi.stubGlobal('AudioContext', FakeAudioContext);
    const enhancer = createAudioEnhancer({} as HTMLAudioElement);
    const context = FakeAudioContext.instances[0];
    const source = context.nodes.find((node) => node.kind === 'source');
    const dry = source?.connections.find((node) => node.kind === 'gain');
    const output = dry?.connections[0];
    const wet = context.nodes.find((node) => node.kind === 'gain' && node !== dry &&
      node.connections.includes(output as FakeNode));
    expect(dry?.gain.value).toBe(1);
    expect(wet?.gain.value).toBe(0);
    expect(enhancer.getAnalyser()).not.toBeNull();

    enhancer.setPreset('punch');
    expect(dry?.gain.value).toBe(0);
    expect(wet?.gain.value).toBe(1);
    const compressors = context.nodes.filter((node) => node.kind === 'compressor');
    // Three-band dynamics plus the final peak limiter.
    expect(compressors).toHaveLength(4);
    expect(compressors[0].ratio.value).toBeGreaterThan(1);
    expect(compressors[1].ratio.value).toBe(compressors[0].ratio.value);
    expect(compressors[2].ratio.value).toBe(compressors[0].ratio.value);
    const thresholds = compressors.slice(0, 3).map((node) => node.threshold.value);
    // Each band gets a slightly different knee point, 2 dB apart.
    expect(thresholds[1] - thresholds[0]).toBeCloseTo(2);
    expect(thresholds[2] - thresholds[1]).toBeCloseTo(2);
    expect(compressors[3].ratio.value).toBe(20);
    expect(compressors[3].threshold.value).toBe(-2);

    enhancer.setBands([2, -2, 0, 0, 1, 1, 0]);
    const eqFilters = context.nodes.filter((node) => node.kind === 'filter' &&
      (node.type === 'lowshelf' || node.type === 'peaking' || node.type === 'highshelf') &&
      AUDIO_BANDS.some((band) => band.frequency === node.frequency.value));
    expect(eqFilters.map((node) => node.gain.value)).toEqual([2, -2, 0, 0, 1, 1, 0]);

    enhancer.setHumFilter(true);
    expect(context.nodes.filter((node) => node.type === 'notch').map((node) => node.frequency.value)).toEqual([60, 120]);
    enhancer.setBypass(true);
    expect(dry?.gain.value).toBe(1);
    expect(wet?.gain.value).toBe(0);
    enhancer.setBypass(false);
    expect(dry?.gain.value).toBe(0);
    expect(wet?.gain.value).toBe(1);
    enhancer.setPreset('off');
    enhancer.setHumFilter(false);
    expect(dry?.gain.value).toBe(1);
    expect(wet?.gain.value).toBe(0);
    expect(enhancer.readMeter()).toEqual({ lufs: null, peakDb: null, correlation: null, levelerDb: 0 });
    enhancer.fadeIn();
    await enhancer.resume();
    enhancer.dispose();
    enhancer.dispose();
    expect(enhancer.getAnalyser()).toBeNull();
    expect(context.closed).toBe(true);
    expect(context.nodes.every((node) => node.disconnected)).toBe(true);
  });
});
