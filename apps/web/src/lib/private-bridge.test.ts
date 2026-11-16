import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {describe,expect,it} from 'vitest';
import {MAX_PLAYLIST_TRACKS,bridgeEntries,bridgeVideos,isPlayableExternalUrl,parseBatchJob,parseYouTubeUrl,type BridgeBatchJob} from './private-bridge';
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
  expect(bridgeEntries({items:Array.from({length:2100},(_,index)=>({id:'i'+String(index).padStart(10,'0')}))}).items.length).toBe(MAX_PLAYLIST_TRACKS);
  expect(bridgeEntries(null)).toEqual({items:[],truncated:false});
 });
 it('lists the same number of tracks the bridge process is allowed to enumerate',()=>{
  const limits=readFileSync(fileURLToPath(new URL('../../../../tools/private-bridge/limits.mjs',import.meta.url)),'utf8');
  const ceiling=Number(/export const MAX_PLAYLIST_TRACKS=(\d+)/.exec(limits)?.[1]);
  expect(ceiling).toBe(MAX_PLAYLIST_TRACKS);
 });
});
describe('long batch progress reported by the bridge',()=>{
 const uuid='11111111-1111-4111-8111-111111111111';
 const job={id:uuid,total:1000,completed:600,saved:590,failed:10,status:'running',
  current:'abcdefghijk',errorItems:['abcdefghijk'],destination:'C:\\Users\\me\\Downloads\\Nebula',
  note:'Los archivos se guardan en el equipo que ejecuta el puente.'};
 it('accepts a coherent job and keeps the folder the bridge chose',()=>{
  expect(parseBatchJob({job})).toEqual(job);
 });
 it('drops jobs that could not come from a real queue',()=>{
  expect(parseBatchJob(null)).toBeNull();
  expect(parseBatchJob({})).toBeNull();
  expect(parseBatchJob({job:{...job,id:'../../etc/passwd'}})).toBeNull();
  expect(parseBatchJob({job:{...job,status:'paused'}})).toBeNull();
  expect(parseBatchJob({job:{...job,total:MAX_PLAYLIST_TRACKS+1,completed:0,saved:0,failed:0}})).toBeNull();
  expect(parseBatchJob({job:{...job,saved:700}})).toBeNull();
  expect(parseBatchJob({job:{...job,completed:-1}})).toBeNull();
 });
 it('ignores malformed ids in the current track and the error list',()=>{
  const parsed=parseBatchJob({job:{...job,current:'../../x',errorItems:['abcdefghijk','bad','abcdefghij1',
   ...Array.from({length:60},(_,index)=>String(index).padStart(11,'0'))]}}) as BridgeBatchJob;
  expect(parsed.current).toBeNull();
  expect(parsed.errorItems.slice(0,2)).toEqual(['abcdefghijk','abcdefghij1']);
  expect(parsed.errorItems.length).toBe(30);
 });
 it('survives a bridge that omits the optional text fields',()=>{
  const parsed=parseBatchJob({job:{...job,note:undefined,destination:undefined,errorItems:undefined,current:undefined}}) as BridgeBatchJob;
  expect(parsed.note).toBe('');
  expect(parsed.destination).toBe('');
  expect(parsed.errorItems).toEqual([]);
 });
});
