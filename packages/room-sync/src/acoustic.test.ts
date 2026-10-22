import { describe, expect, it } from 'vitest';
import { acousticDelaySummary, alignAcousticPeaks, detectAcousticPeaks, relativeAcousticDelayMs } from './acoustic';

function impulse(index: number, size = 48_000): number[] {
  const data = new Array<number>(size).fill(0);
  if (index >= 0 && index < size) {
    data[index] = 1;
    data[index + 1] = 0.3;
  }
  return data;
}
describe('acoustic QA measurement primitives', () => {
  it('detects a controlled 125 ms relative delay on a shared clock', () => {
    const left = impulse(4800);
    const right = impulse(10800);
    expect(relativeAcousticDelayMs(left, right, 48000)).toBeCloseTo(125, 5);
    expect(relativeAcousticDelayMs(right, left, 48000)).toBeCloseTo(-125, 5);
  });
  it('does not invent offsets from silence or noise floor', () => {
    expect(detectAcousticPeaks(new Array(4000).fill(0.01), 48000)).toEqual([]);
    expect(relativeAcousticDelayMs(impulse(10), new Array(48_000).fill(0), 48000)).toBeNull();
  });
  it('reads browser Float32Array audio directly without copying PCM samples',()=>{
    const buffer=new Float32Array(48_000);
    buffer[4800]=.8;
    buffer[4801]=.2;
    buffer[24000]=1;
    const peaks=detectAcousticPeaks(buffer,48_000,{minimumGapMs:180,thresholdRatio:.5});
    expect(peaks).toHaveLength(2);
    expect(peaks.map(p=>p.ms)).toEqual([100,500]);
    expect(buffer[4800]).toBeCloseTo(.8,5);
  });
  it('rejects non-finite PCM noise rather than inventing an impulse',()=>{
    const samples=Float32Array.from([Number.NaN,Number.POSITIVE_INFINITY,0,.06,0]);
    expect(detectAcousticPeaks(samples,48000,{thresholdRatio:.4})).toHaveLength(1);
  });
  it('enforces calibration settings and quantifies P95', () => {
    expect(() => detectAcousticPeaks([0, 1], 0)).toThrow('invalid_sample_rate');
    expect(() => detectAcousticPeaks([0, 1], 48000, { thresholdRatio: -1 })).toThrow('invalid_detection_options');
    expect(acousticDelaySummary([-8, 16, 24, 80, 120])).toEqual({ count: 5, medianAbsMs: 24, p95AbsMs: 120, maxAbsMs: 120 });
    expect(acousticDelaySummary([Number.NaN])).toBeNull();
  });
  it('pairs single-clock click sequences with an offset and identifies missed impulses',()=>{
    const seq=(times:number[])=>times.map((ms,i)=>({sample:Math.round(ms*48),ms,amplitude:1-i*.01}));
    const left=seq([100,900,1700,2500,3300,4100,4900,5700]);
    const right=seq([220,1020,1820,3420,4220,5020,5820]); // one missing at 2500
    const result=alignAcousticPeaks(left,right,{toleranceMs:20});
    expect(result.kind).toBe('matched');
    if(result.kind!=='matched')return;
    expect(result.pairs).toHaveLength(7);
    expect(result.unmatchedLeft).toBe(1);
    expect(result.unmatchedRight).toBe(0);
    expect(result.medianSignedMs).toBe(120);
    expect(result.quality).toBe('good');
    expect(result.pairs.every(p=>p.delayMs===120)).toBe(true);
  });
  it('rejects ambiguous periodic shifts instead of pretending they are valid latency',()=>{
    const make=(times:number[])=>times.map(ms=>({sample:ms*48,ms,amplitude:1}));
    const left=make([100,900,1700,2500,3300,4100]);
    const right=make([1020,1820,2620,3420,4220]);
    const alignment=alignAcousticPeaks(left,right,{toleranceMs:20});
    expect(alignment.kind).toBe('ambiguous');
  });
  it('estimates acoustic drift only across a sufficiently long reference sequence',()=>{
    const make=(times:number[])=>times.map(ms=>({sample:ms*48,ms,amplitude:1}));
    const times=[0,2000,4000,6000,8000,10000,12000];
    const delayed=times.map((t,i)=>t+100+i*3);
    const result=alignAcousticPeaks(make(times),make(delayed),{toleranceMs:40});
    expect(result.kind).toBe('matched');
    if(result.kind!=='matched')return;
    expect(result.driftMsPerMinute).toBeCloseTo(90,1);
    expect(result.quality).toBe('good');
    expect(result.pairs).toHaveLength(7);
    expect(alignAcousticPeaks(make([100]),make([200])).kind).toBe('insufficient');
  });

});
