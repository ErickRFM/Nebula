/**
 * Analysis primitives for external acoustic QA recordings.
 *
 * Two tracks recorded independently by unrelated phones do NOT share a clock;
 * pass only signals captured on the same clock (e.g. stereo channels of one
 * recorder) to avoid mistaking clock offset for speaker latency.
 */
export interface AcousticPeak { sample: number; ms: number; amplitude: number }

export function detectAcousticPeaks(
  samples: readonly number[],
  sampleRateHz: number,
  options: { minimumGapMs?: number; thresholdRatio?: number } = {},
): AcousticPeak[] {
  if (!Number.isFinite(sampleRateHz) || sampleRateHz < 8000 || sampleRateHz > 192000) {
    throw new Error('invalid_sample_rate');
  }
  const minimumGapMs = options.minimumGapMs ?? 15;
  const thresholdRatio = options.thresholdRatio ?? 0.4;
  if (!Number.isFinite(minimumGapMs) || minimumGapMs < 1 || minimumGapMs > 1000 ||
      !Number.isFinite(thresholdRatio) || thresholdRatio < 0.1 || thresholdRatio > 0.95) {
    throw new Error('invalid_detection_options');
  }
  const gapSamples = Math.ceil(sampleRateHz * minimumGapMs / 1000);
  const amplitudes = samples.map(value => Number.isFinite(value) ? Math.abs(value) : 0);
  const maximum = amplitudes.reduce((m, value) => Math.max(m, value), 0);
  if (maximum < 0.05) return [];
  const threshold = Math.max(0.05, maximum * thresholdRatio);
  const peaks: AcousticPeak[] = [];
  let nextAllowed = 0;
  for (let index = 0; index < amplitudes.length; index++) {
    if (index < nextAllowed || amplitudes[index] < threshold) continue;
    // Within a single impulse, use the strongest sample, not its leading edge.
    const end = Math.min(amplitudes.length, index + gapSamples);
    let sample = index;
    for (let probe = index + 1; probe < end; probe++) {
      if (amplitudes[probe] > amplitudes[sample]) sample = probe;
    }
    peaks.push({ sample, ms: sample * 1000 / sampleRateHz, amplitude: amplitudes[sample] });
    nextAllowed = end;
  }
  return peaks;
}

/**
 * Returns the delay between the first detected click in left and right tracks
 * recorded by ONE recorder: positive => right was later than left.
 * This is an acoustic measurement only if each channel isolates its source.
 */
export function relativeAcousticDelayMs(
  left: readonly number[],
  right: readonly number[],
  sampleRateHz: number,
): number | null {
  const first = detectAcousticPeaks(left, sampleRateHz)[0];
  const second = detectAcousticPeaks(right, sampleRateHz)[0];
  if (!first || !second) return null;
  return second.ms - first.ms;
}

/** Descriptive metrics, not a certification of phase-perfect sync. */
export function acousticDelaySummary(delaysMs: readonly number[]) {
  const clean = delaysMs.filter(Number.isFinite).map(Math.abs).sort((a, b) => a - b);
  if (!clean.length) return null;
  const percentile = (p: number) => clean[Math.min(clean.length - 1, Math.ceil(p * clean.length) - 1)];
  return { count: clean.length, medianAbsMs: percentile(0.5), p95AbsMs: percentile(0.95), maxAbsMs: clean[clean.length - 1] };
}
