import {describe,expect,it} from 'vitest';
import {bridgeEntries,bridgeVideos,isPlayableExternalUrl,parseYouTubeUrl} from './private-bridge';
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
 it('canonicalizes watch, playlist and mix links without forwarding raw queries',()=>{
  const video='dQw4w9WgXcQ';
  expect(parseYouTubeUrl('https://youtu.be/'+video)).toEqual({kind:'video',videoId:video,listId:null,canonicalUrl:'https://www.youtube.com/watch?v='+video});
  expect(parseYouTubeUrl('https://www.youtube.com/watch?v='+video+'&list=RD'+video+'&t=30'))
   .toEqual({kind:'playlist',videoId:video,listId:'RD'+video,canonicalUrl:'https://www.youtube.com/playlist?list=RD'+video});
  expect(parseYouTubeUrl('https://music.youtube.com/watch?v='+video)?.canonicalUrl).toBe('https://www.youtube.com/watch?v='+video);
  expect(parseYouTubeUrl('http://www.youtube.com/watch?v='+video)).toBeNull();
  expect(parseYouTubeUrl('https://www.youtube.com/watch?v=--dump-options')).toBeNull();
  expect(parseYouTubeUrl('https://www.youtube.com/watch?v='+video+'@127.0.0.1:4177')).toBeNull();
  expect(parseYouTubeUrl('https://evil.test/watch?v='+video)).toBeNull();
  expect(parseYouTubeUrl(undefined)).toBeNull();
 });
 it('keeps only well-formed resolved entries and reports truncation',()=>{
  const valid='abcdefghijk';
  const parsed=bridgeEntries({items:[
   {id:valid,sourceUrl:'https://evil.test/'+valid,title:'Title',artist:null,durationSeconds:-5},
   {id:'12345678901',sourceUrl:'https://www.youtube.com/watch?v=12345678901/../x'},
   {id:'bad'},
  ],truncated:true});
  expect(parsed.truncated).toBe(true);
  expect(parsed.items.length).toBe(2);
  expect(parsed.items[0]).toEqual({id:valid,title:'Title',artist:'YouTube',durationSeconds:null,sourceUrl:'https://www.youtube.com/watch?v='+valid});
  expect(parsed.items[1].sourceUrl).toBe('https://www.youtube.com/watch?v=12345678901');
  expect(bridgeEntries({items:Array.from({length:260},(_,index)=>({id:'i'+String(index).padStart(10,'0')}))}).items.length).toBe(200);
  expect(bridgeEntries(null)).toEqual({items:[],truncated:false});
 });
});
