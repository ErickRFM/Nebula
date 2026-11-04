import {describe,it,expect} from 'vitest';
import {exportedSongFilename} from './local-audio-download';
import type {SavedSong} from './local-library';

function song(overrides:Partial<SavedSong>={}):SavedSong {
 return {id:'local-1',title:'Canción',artist:'Mi artista',album:'Demo',genre:'Personal',
  cover:'/art/orbita.svg',duration:'--:--',mimeType:'audio/mpeg',
  blob:new Blob(['ID3'],{type:'audio/mpeg'}),createdAt:1,...overrides};
}
describe('download original owned audio from NÉBULA library',()=>{
 it('keeps actual MP3 as .mp3 without re-encoding',()=>{
  expect(exportedSongFilename(song({filename:'mi-tema.mp3'}))).toBe('mi-tema.mp3');
 });
 it('preserves WAV and FLAC and never renames them to MP3',()=>{
  expect(exportedSongFilename(song({mimeType:'audio/wav',filename:'mi-audio.wav'}))).toBe('mi-audio.wav');
  expect(exportedSongFilename(song({mimeType:'audio/flac',filename:'un-album.flac'}))).toBe('un-album.flac');
 });
 it('sanitizes filenames and derives readable fallback',()=>{
  expect(exportedSongFilename(song({filename:'../a:b?.mp3'}))).toBe('a-b-.mp3');
  expect(exportedSongFilename(song({filename:undefined}))).toBe('Mi artista - Canción.mp3');
 });
});
