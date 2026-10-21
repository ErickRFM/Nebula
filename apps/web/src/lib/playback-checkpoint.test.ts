import {describe,it,expect} from 'vitest';
import {normalizeCheckpoint,readCheckpoint,saveCheckpoint} from './playback-checkpoint';
describe('private-safe local playback continuity',()=>{
  const now=Date.now();
  const data={trackId:'local-abcdef123456',time:86.5,queueIds:['local-abcdef123456','cloud-external','local-abcdef123456'],savedAt:now};
  it('keeps only local IDs and a finite playback position',()=>{
    const value=normalizeCheckpoint(data,now);
    expect(value).toMatchObject({trackId:data.trackId,time:86.5,queueIds:['local-abcdef123456']});
  });
  it('rejects expired, malformed or remote URL state',()=>{
    expect(normalizeCheckpoint({...data,savedAt:now-31*86400_000},now)).toBeNull();
    expect(normalizeCheckpoint({...data,time:Number.NaN},now)).toBeNull();
    expect(normalizeCheckpoint({...data,trackId:'cloud-abc'},now)).toBeNull();
  });
  it('round trips without persisting signed audio URLs',()=>{
    const values=new Map<string,string>();const storage={
      getItem:(key:string)=>values.get(key)||null,
      setItem:(key:string,value:string)=>{values.set(key,value);}
    };
    saveCheckpoint(storage,data);
    expect(readCheckpoint(storage)).toMatchObject({trackId:data.trackId,time:data.time});
    expect([...values.values()].join('')).not.toContain('https://');
  });
});
