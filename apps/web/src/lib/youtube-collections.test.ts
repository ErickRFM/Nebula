import {describe,it,expect} from 'vitest';
import {parseYouTubeCollection} from './youtube-collections';
describe('YouTube playlist and RD Mix recognition',()=>{
 it('identifies the RD radio from a watch URL without flattening it into one video',()=>{
  expect(parseYouTubeCollection('https://www.youtube.com/watch?v=M-E8rmhUxyw&list=RDM-E8rmhUxyw&start_radio=1')).toEqual({
   kind:'mix',id:'RDM-E8rmhUxyw',videoId:'M-E8rmhUxyw',
   sourceUrl:'https://www.youtube.com/watch?v=M-E8rmhUxyw&list=RDM-E8rmhUxyw',
   embedUrl:'https://www.youtube-nocookie.com/embed/M-E8rmhUxyw'
  });
 });
 it('embeds fixed YouTube Music playlists using official listType',()=>{
  const id='PL1234567890ABCDEFGHIJKL';
  expect(parseYouTubeCollection('https://music.youtube.com/playlist?list='+id+'&utm=ignored')).toEqual({
   kind:'playlist',id,videoId:null,
   sourceUrl:'https://www.youtube.com/playlist?list='+id,
   embedUrl:'https://www.youtube-nocookie.com/embed?listType=playlist&list='+id,
  });
  expect(parseYouTubeCollection('https://www.youtube.com/watch?v=ABCDEFGHIJK&list='+id)?.embedUrl)
   .toBe('https://www.youtube-nocookie.com/embed/ABCDEFGHIJK?listType=playlist&list='+id);
 });
 it('rejects invalid playlists, forged domains and unsafe protocols',()=>{
  for(const v of [
   'https://youtube.com.evil.test/playlist?list=PL1234567890',
   'http://www.youtube.com/playlist?list=PL1234567890',
   'https://www.youtube.com:8443/playlist?list=PL1234567890',
   'https://youtube.com/other?list=PL1234567890',
   'https://youtube.com/watch?v=INVALID&list=PL1234567890',
   'https://youtube.com/playlist?list=../secret',
  ])expect(parseYouTubeCollection(v)).toBeNull();
 });
});
