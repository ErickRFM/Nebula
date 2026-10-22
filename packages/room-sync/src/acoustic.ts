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


/**
 * Align repeated acoustic impulses captured on ONE stereo sample clock.
 * Ambiguous periodic sequences must not be reported as measured sync.
 * Missing clicks and background spikes are counted rather than silently
 * shifting every subsequent pair by a whole repetition interval.
 */
export interface AcousticPair { leftMs: number; rightMs: number; delayMs: number }
export type AcousticAlignment =
  | {kind:'matched';pairs:AcousticPair[];unmatchedLeft:number;unmatchedRight:number;
      medianSignedMs:number;driftMsPerMinute:number|null;quality:'good'|'caution'}
  | {kind:'ambiguous'|'insufficient';reason:string};

export function alignAcousticPeaks(
  left:readonly AcousticPeak[],right:readonly AcousticPeak[],
  options:{maxOffsetMs?:number;toleranceMs?:number;minimumPairs?:number}={},
):AcousticAlignment{
  const maxOffset=options.maxOffsetMs??1500;
  const tolerance=options.toleranceMs??60;
  const minimumPairs=options.minimumPairs??3;
  if(!Number.isFinite(maxOffset)||maxOffset<50||maxOffset>2000||
     !Number.isFinite(tolerance)||tolerance<5||tolerance>250||
     !Number.isSafeInteger(minimumPairs)||minimumPairs<3||minimumPairs>20)
    throw new Error('invalid_alignment_options');
  if(left.length<minimumPairs||right.length<minimumPairs||left.length>80||right.length>80)
    return {kind:'insufficient',reason:'insufficient_or_excessive_impulses'};
  const l=[...left].sort((a,b)=>a.ms-b.ms);
  const r=[...right].sort((a,b)=>a.ms-b.ms);
  if([...l,...r].some(p=>!Number.isFinite(p.ms)||p.ms<0))
    return {kind:'insufficient',reason:'invalid_impulse_times'};
  const offsetCandidates=new Set<number>();
  for(const a of l)for(const b of r){
    const diff=b.ms-a.ms;
    if(Math.abs(diff)<=maxOffset)offsetCandidates.add(Math.round(diff*2)/2);
  }
  type Candidate={pairs:AcousticPair[];center:number;variance:number};
  const distinct:Candidate[]=[];
  for(const offset of offsetCandidates){
    const pairs:AcousticPair[]=[];
    let i=0,j=0;
    while(i<l.length&&j<r.length){
      const d=r[j].ms-l[i].ms-offset;
      if(Math.abs(d)<=tolerance){
        pairs.push({leftMs:l[i].ms,rightMs:r[j].ms,delayMs:r[j].ms-l[i].ms});
        i++;j++;
      }else if(d < -tolerance)j++;
      else i++;
    }
    if(pairs.length<minimumPairs)continue;
    const sorted=pairs.map(p=>p.delayMs).sort((a,b)=>a-b);
    const center=sorted[Math.floor(sorted.length/2)];
    const variance=pairs.reduce((sum,p)=>sum+(p.delayMs-center)**2,0)/pairs.length;
    const entry={pairs,center,variance};
    const same=distinct.findIndex(x=>Math.abs(x.center-center)<=tolerance);
    if(same<0)distinct.push(entry);
    else if(pairs.length>distinct[same].pairs.length||
           pairs.length===distinct[same].pairs.length&&variance<distinct[same].variance)
      distinct[same]=entry;
  }
  distinct.sort((a,b)=>b.pairs.length-a.pairs.length||a.variance-b.variance||Math.abs(a.center)-Math.abs(b.center));
  const best=distinct[0];
  if(!best)return {kind:'insufficient',reason:'no_consistent_alignment'};
  if(distinct.some(other=>other!==best&&other.pairs.length===best.pairs.length
      &&Math.abs(other.center-best.center)>tolerance*2))
    return {kind:'ambiguous',reason:'multiple_plausible_click_shifts'};
  const span=best.pairs.at(-1)!.leftMs-best.pairs[0].leftMs;
  let driftMsPerMinute:number|null=null;
  if(span>=5000){
    const avgX=best.pairs.reduce((sum,p)=>sum+p.leftMs,0)/best.pairs.length;
    const avgY=best.pairs.reduce((sum,p)=>sum+p.delayMs,0)/best.pairs.length;
    const numerator=best.pairs.reduce((sum,p)=>sum+(p.leftMs-avgX)*(p.delayMs-avgY),0);
    const denominator=best.pairs.reduce((sum,p)=>sum+(p.leftMs-avgX)**2,0);
    if(denominator>0)driftMsPerMinute=numerator/denominator*60000;
  }
  const coverage=best.pairs.length/Math.max(l.length,r.length);
  return {kind:'matched',pairs:best.pairs,
    unmatchedLeft:l.length-best.pairs.length,unmatchedRight:r.length-best.pairs.length,
    medianSignedMs:best.center,driftMsPerMinute,
    quality:coverage>=0.85&&best.pairs.length>=6?'good':'caution'};
}
