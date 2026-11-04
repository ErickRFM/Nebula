import {describe,it,expect,vi} from 'vitest';
import {normalizeMainstream,searchMainstream} from './mainstream';
const make=(id:number,title:string,artist:string,rank=1000)=>({
 id,title,rank,duration:220,
 artist:{name:artist},
 album:{title:'Album',cover_medium:'https://e-cdns-images.dzcdn.net/images/cover/example.jpg'},
 preview:'https://evil.example/audio.mp3',
 link:'https://evil.example/fake',
});
describe('original recordings via Deezer metadata',()=>{
 it('ranks artist/title matches above remix and never accepts untrusted stream URLs',()=>{
  const rows=normalizeMainstream({data:[
   make(1,'Blinding Lights (remix)','Cover Project',9000),
   make(2,'Blinding Lights','The Weeknd',8000),
   make(3,'Blinding Lights - Karaoke','Unknown',9999),
  ]},'Blinding Lights The Weeknd');
  expect(rows.map(x=>x.id)).toEqual(['2','1','3']);
  expect(rows[0].sourceUrl).toBe('https://www.deezer.com/track/2');
  expect('audioUrl' in rows[0]).toBe(false);
 });
 it('separates other performers and covers for a clearly requested original',()=>{
  const list=normalizeMainstream({data:[
   make(908604612,'Blinding Lights','The Weeknd',984833),
   make(2282985187,'Blinding Lights The Weeknd','Pancadão GD Som',394412),
   make(1146504462,'Blinding Lights (Original by The Weeknd)','Piano Cover by Lily Morgan',194622),
  ]},'The Weeknd Blinding Lights');
  expect(list[0].artist).toBe('The Weeknd');
  expect(list[0].isVariant).toBe(false);
  expect(list.filter(x=>!x.isVariant).map(x=>x.id)).toEqual(['908604612']);
  expect(list.filter(x=>x.isVariant)).toHaveLength(2);
 });
 it('does not force one artist for generic searches',()=>{
  const list=normalizeMainstream({data:[
   make(1,'Random Song','Singer A',987000),
   make(2,'Different Song','Singer B',849000),
  ]},'pop');
  expect(list.every(x=>!x.isVariant)).toBe(true);
 });
 it('skips bogus IDs, spoofed artwork, malformed rows, duplicates',()=>{
  const rows=normalizeMainstream({data:[
   {...make(3,'Original','Artist'),album:{title:'A',cover_medium:'https://evil.example/img.png'}},
   make(3,'Duplicate','Artist'),
   {...make(4,'Missing','Artist'),artist:null},
   {...make(5,'Bad','Artist'),id:'../123'},
  ]},'Original Artist');
  expect(rows).toHaveLength(1);
  expect(rows[0].cover).toBeNull();
 });
 it('uses fixed HTTPS upstream and returns normalized metadata',async()=>{
  const mock=vi.fn(async(url:string)=>new Response(JSON.stringify({data:[make(7,'Song','Singer')]}),{status:200,headers:{'content-type':'application/json'}}));
  const result=await searchMainstream('Song Singer',mock);
  expect(mock).toHaveBeenCalledOnce();
  expect(String(mock.mock.calls[0][0])).toContain('https://api.deezer.com/search?');
  expect(result[0].title).toBe('Song');
 });
 it('rejects bad query, non-200, and provider errors',async()=>{
  await expect(searchMainstream('x')).rejects.toThrow('invalid_query');
  await expect(searchMainstream('ok',async()=>new Response('Not available',{status:503}))).rejects.toThrow('deezer_http_503');
  await expect(searchMainstream('ok',async()=>new Response(JSON.stringify({error:{code:4}})))).rejects.toThrow('provider_error');
 });
});
