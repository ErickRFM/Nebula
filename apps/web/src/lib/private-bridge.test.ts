import {describe,expect,it} from 'vitest';
import {bridgeVideos,isPlayableExternalUrl} from './private-bridge';
describe('private bridge browser trust boundary',()=>{
 const id='abcdefghijkl';
 const ticket= 'a'.repeat(90)+'.'+'b'.repeat(43);
 it('allows official https streams and only the exact private loopback endpoint',()=>{
  expect(isPlayableExternalUrl('https://api.audius.co/v1/tracks/123/stream',false)).toBe(true);
  expect(isPlayableExternalUrl('http://127.0.0.1:4177/stream?ticket='+ticket,true)).toBe(true);
  expect(isPlayableExternalUrl('http://127.0.0.1:4178/stream?ticket='+ticket,true)).toBe(false);
  expect(isPlayableExternalUrl('http://localhost:4177/stream?ticket='+ticket,true)).toBe(false);
  expect(isPlayableExternalUrl('http://127.0.0.1:4177/stream?ticket='+ticket,false)).toBe(false);
  expect(isPlayableExternalUrl('http://127.0.0.1:4177/stream?ticket='+ticket+'&url=https://evil.test',true)).toBe(false);
  expect(isPlayableExternalUrl('http://127.0.0.1:4177@evil.test/stream?ticket='+ticket,true)).toBe(false);
 });
 it('ignores remote field URLs and creates official source links from IDs',()=>{
  expect(bridgeVideos({items:[{id:'12345678901',title:'Title',artist:'Artist',sourceUrl:'https://bad.example/',durationSeconds:120}]})[0].sourceUrl)
   .toBe('https://www.youtube.com/watch?v=12345678901');
  expect(bridgeVideos({items:[{id:'../unsafe',title:'Invalid'}]})).toEqual([]);
 });
});
