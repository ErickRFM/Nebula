import {describe,expect,it} from 'vitest';
import {conversionOutputFilename,validateConversionFile,MAX_CONVERT_INPUT_BYTES,MAX_CONVERT_BATCH,MAX_CONVERT_SECONDS} from './mp3-converter';

describe('NÉBULA local MP3 transcoding safety',()=>{
 it('creates an actual MP3 filename without confusing original formats',()=>{
  expect(conversionOutputFilename('demo.wav')).toBe('demo.mp3');
  expect(conversionOutputFilename('Artist - Track.flac')).toBe('Artist - Track.mp3');
  expect(conversionOutputFilename('evil/../a:b.m4a')).toBe('a-b.mp3');
  expect(conversionOutputFilename('song.mp3')).toBe('song.mp3');
 });
 it('rejects unsupported, empty and oversized inputs',()=>{
  expect(()=>validateConversionFile({name:'x.html',size:2000})).toThrow('Importa archivos');
  expect(()=>validateConversionFile({name:'empty.wav',size:0})).toThrow('vacío');
  expect(()=>validateConversionFile({name:'huge.wav',size:MAX_CONVERT_INPUT_BYTES+1})).toThrow('25 MB');
  expect(()=>validateConversionFile({name:'demo.wav',size:100})).not.toThrow();
 });
 it('bounds browser memory with file-size, duration and batch caps',()=>{
  expect(MAX_CONVERT_INPUT_BYTES).toBe(25*1024*1024);
  expect(MAX_CONVERT_SECONDS).toBe(600);
  expect(MAX_CONVERT_BATCH).toBe(8);
 });
});
