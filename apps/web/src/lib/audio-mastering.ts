/**
 * Pure helpers for the NÉBULA immersion engine.
 *
 * Loudness here is a K-weighted momentary estimate (BS.1770-style), not a
 * certified integrated LUFS meter. It is good enough to ride gain smoothly
 * without pumping, and it is fully testable without a browser.
 */
export type AudioMasterSettings = {
  intensity: number;
  bass: number;
  width: number;
  dynamics: number;
};

export type AudioMeter = {
  lufs: number | null;
  peakDb: number | null;
  correlation: number | null;
  levelerDb: number;
};

export const DEFAULT_MASTER_SETTINGS: AudioMasterSettings = {
  intensity: 60,
  bass: 55,
  width: 55,
  dynamics: 45,
};

export const LEVELER_MAX_DB = 9;
export const LEVELER_RATE_DB_PER_SECOND = 4;

export function clampPercent(value: unknown, fallback: number): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.round(Math.min(100, Math.max(0, numeric)));
}

export function normalizeMasterSettings(value: unknown): AudioMasterSettings {
  if (!value || typeof value !== 'object') return { ...DEFAULT_MASTER_SETTINGS };
  const raw = value as Record<string, unknown>;
  return {
    intensity: clampPercent(raw.intensity, DEFAULT_MASTER_SETTINGS.intensity),
    bass: clampPercent(raw.bass, DEFAULT_MASTER_SETTINGS.bass),
    width: clampPercent(raw.width, DEFAULT_MASTER_SETTINGS.width),
    dynamics: clampPercent(raw.dynamics, DEFAULT_MASTER_SETTINGS.dynamics),
  };
}

/** 0..1 amount combining the module slider and the master intensity. */
export function moduleAmount(value: number, intensity: number): number {
  return (clampPercent(value, 0) / 100) * (clampPercent(intensity, 0) / 100);
}

/** 50 is neutral, 0 narrows and 100 widens; intensity scales the movement. */
export function widthSideGain(value: number, intensity: number): number {
  const amount = clampPercent(value, 50) / 100;
  const depth = clampPercent(intensity, 0) / 100;
  return 1 + (amount - 0.5) * 1.2 * depth;
}

export function bassHarmonicGain(value: number, intensity: number): number {
  return 0.55 * moduleAmount(value, intensity);
}

export function multibandRatio(value: number, intensity: number): number {
  return 1 + 2.4 * moduleAmount(value, intensity);
}

export function multibandThreshold(value: number, intensity: number): number {
  return -6 - 16 * moduleAmount(value, intensity);
}

/** K-weighted mean square -> momentary loudness estimate in LUFS. */
export function lufsFromMeanSquare(meanSquare: number): number | null {
  if (!Number.isFinite(meanSquare) || meanSquare <= 0) return null;
  return -0.691 + 10 * Math.log10(meanSquare);
}

export function peakFromSamples(samples: Float32Array): number | null {
  let peak = 0;
  for (let index = 0; index < samples.length; index++) {
    const value = Math.abs(samples[index]);
    if (value > peak) peak = value;
  }
  return peak > 0 ? 20 * Math.log10(peak) : null;
}

/** Pearson correlation of two equal-length sample windows. */
export function correlationFromChannels(left: Float32Array, right: Float32Array): number | null {
  const length = Math.min(left.length, right.length);
  let leftEnergy = 0;
  let rightEnergy = 0;
  let product = 0;
  for (let index = 0; index < length; index++) {
    leftEnergy += left[index] * left[index];
    rightEnergy += right[index] * right[index];
    product += left[index] * right[index];
  }
  const denominator = Math.sqrt(leftEnergy * rightEnergy);
  if (denominator <= 1e-9) return null;
  return Math.min(1, Math.max(-1, product / denominator));
}

/**
 * Slow gain rider toward the profile target. Corrections are capped by
 * intensity, rate-limited, and ignore sub-0.15 dB drift to avoid pumping.
 */
export function nextLevelerGainDb(
  currentDb: number,
  lufs: number | null,
  targetLufs: number,
  intensity: number,
  deltaSeconds: number,
): number {
  if (lufs === null || !Number.isFinite(lufs)) return currentDb;
  const depth = clampPercent(intensity, 0) / 100;
  if (depth <= 0) return 0;
  const maxCorrection = LEVELER_MAX_DB * depth;
  const desired = Math.min(maxCorrection, Math.max(-maxCorrection, targetLufs - lufs));
  const delta = desired - currentDb;
  if (Math.abs(delta) < 0.15) return currentDb;
  const maxStep = LEVELER_RATE_DB_PER_SECOND * Math.max(0.016, Math.min(1, deltaSeconds));
  return currentDb + Math.min(maxStep, Math.max(-maxStep, delta));
}
