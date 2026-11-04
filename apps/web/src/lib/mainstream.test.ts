import {describe,expect,it} from 'vitest';
import {officialDeezerEmbed,officialMusicSearch,parseMainstreamResults} from './mainstream';
describe('Deezer mainstream official embed',()=>{
 it('constructs a safe widget URL using numeric IDs only',()=>{
  expect(officialDeezerEmbed('3135556')).toBe('https://widget.deezer.com/widget/dark/track/3135556');
  expect(officialDeezerEmbed('../x')).toBeNull();
  expect(officialDeezerEmbed('1?url=evil')).toBeNull();
 });
 it('discards untrusted links and no arbitrary audio playable URL passes to the player',()=>{
  const list=parseMainstreamResults({source:'deezer',items:[{
   id:'123',title:'Test',artist:'Singer',album:'Album',cover:'https://evil.com/a.png',sourceUrl:'https://evil.com',audioUrl:'http://127.0.0.1/private',rank:2,
  }]});
  expect(list[0].sourceUrl).toBe('https://www.deezer.com/track/123');
  expect(list[0].cover).toBeNull();
  expect('audioUrl' in list[0]).toBe(false);
 });
 it('uses exact official music-service hostnames for searches',()=>{
  const q={artist:'Daft Punk',title:'One More Time'};
  expect(officialMusicSearch('youtube',q)).toContain('www.youtube.com/results?search_query=');
  expect(officialMusicSearch('spotify',q)).toContain('open.spotify.com/search/');
  expect(officialMusicSearch('apple',q)).toContain('music.apple.com/mx/search');
 });
});
