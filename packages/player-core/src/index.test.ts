import { describe, it, expect } from 'vitest';
import { nextIndex, previousIndex, formatTime, clampSeek } from './index';
describe('playback queue rules', () => {
  it('stops at end with repeat disabled', () => expect(nextIndex(2,3,{shuffle:false,repeat:'off'})).toBeNull());
  it('wraps in repeat-all', () => expect(nextIndex(2,3,{shuffle:false,repeat:'all'})).toBe(0));
  it('repeats current', () => expect(nextIndex(1,3,{shuffle:true,repeat:'one'})).toBe(1));
  it('shuffle avoids current', () => {
    for (let i=0;i<5;i++) expect(nextIndex(2,5,{shuffle:true,repeat:'off',random:()=>i/5})).not.toBe(2);
  });
  it('handles invalid queues', () => {
    expect(nextIndex(0,0,{shuffle:false,repeat:'all'})).toBeNull();
    expect(previousIndex(-1,2,'off')).toBeNull();
  });
  it('previous wraps only on repeat all', () => {
    expect(previousIndex(0,3,'all')).toBe(2);
    expect(previousIndex(0,3,'off')).toBe(0);
  });
  it('formats/clamps safely', () => {
    expect(formatTime(73.5)).toBe('1:13');
    expect(formatTime(Infinity)).toBe('0:00');
    expect(clampSeek(200,95)).toBe(95);
    expect(clampSeek(-2,95)).toBe(0);
  });
});
