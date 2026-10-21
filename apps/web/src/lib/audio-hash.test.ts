import {describe,expect,it} from 'vitest';
import {hashAudioFile} from './audio-hash';
describe('audio SHA-256',()=>{
  it('hashes the same bytes deterministically',async()=>{
    const file=new Blob(['abc']);
    expect(await hashAudioFile(file)).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
  it('rejects cancelled and oversized input',async()=>{
    const signal=new AbortController();signal.abort();
    await expect(hashAudioFile(new Blob(['abc']),signal.signal)).rejects.toThrow();
    await expect(hashAudioFile({size:100*1024*1024+1,arrayBuffer:async()=>new ArrayBuffer(0)})).rejects.toThrow('100 MB');
  });
});
