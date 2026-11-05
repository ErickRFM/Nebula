import {describe,it,expect} from 'vitest';
import {encodeStoredAudioZip,readMusicArchive,createMusicArchive,ZIP_MAX_BYTES} from './music-zip';
import type {SavedSong} from './local-library';
describe('offline NÉBULA ZIP archive',()=>{
 it('round-trips original MP3 and WAV file bytes without re-encoding',async()=>{
  const mp3=new Uint8Array([73,68,51,0,0,0,1,2,3]);
  const wav=new Uint8Array([82,73,70,70,4,5,6,7,8,9]);
  const archive=encodeStoredAudioZip([{name:'song.mp3',bytes:mp3},{name:'demo.wav',bytes:wav}]);
  expect([...archive.slice(0,4)]).toEqual([0x50,0x4b,0x03,0x04]);
  const files=await readMusicArchive(new File([new Uint8Array(archive)],'backup.zip'));
  expect(files.map(f=>f.name)).toEqual(['song.mp3','demo.wav']);
  expect([...new Uint8Array(await files[0].arrayBuffer())]).toEqual([...mp3]);
  expect([...new Uint8Array(await files[1].arrayBuffer())]).toEqual([...wav]);
 });
 it('preserves stored filename when generating a ZIP from local library records',async()=>{
  const song:SavedSong={id:'local-1',title:'Example',artist:'Artist',album:'A',genre:'Personal',
   cover:'/art/a.svg',duration:'--:--',mimeType:'audio/mpeg',filename:'my-song.mp3',
   blob:new Blob([new Uint8Array([73,68,51,4,5])],{type:'audio/mpeg'}),createdAt:1};
  const blob=await createMusicArchive([song]);
  const files=await readMusicArchive(new File([blob],'nebula.zip'));
  expect(files[0].name).toBe('my-song.mp3');
 });
 it('rejects malicious paths and oversized archives',()=>{
  expect(()=>encodeStoredAudioZip([{name:'script.html',bytes:new Uint8Array([1])}])).toThrow('Nombre');
  expect(()=>encodeStoredAudioZip([{name:'song.mp3',bytes:new Uint8Array(0)}])).toThrow('ZIP');
  expect(ZIP_MAX_BYTES).toBe(120*1024*1024);
 });
 it('rejects corrupt ZIP CRC and encrypted headers',async()=>{
  const b=encodeStoredAudioZip([{name:'test.mp3',bytes:new Uint8Array([73,68,51,11])}]);
  b[30+'test.mp3'.length]^=1;
  await expect(readMusicArchive(new File([new Uint8Array(b)],'x.zip'))).rejects.toThrow('dañado');
  const c=encodeStoredAudioZip([{name:'test.mp3',bytes:new Uint8Array([73,68,51,11])}]);
  c[6]=1;
  await expect(readMusicArchive(new File([new Uint8Array(c)],'x.zip'))).rejects.toThrow('sin cifrado');
 });
});
