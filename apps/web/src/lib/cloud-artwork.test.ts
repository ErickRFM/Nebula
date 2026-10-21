import {describe,expect,it} from 'vitest';
import {embeddedCoverFile,validatedCoverFile} from './cloud-artwork';
const jpeg=new Uint8Array([255,216,255,224,0,16,74,70,73,70,0,0]);
describe('guarded cloud album artwork',()=>{
 it('recognizes small valid image bytes',async()=>{
  const f=new File([jpeg.buffer as ArrayBuffer],'cover.jpg',{type:'image/jpeg'});
  expect(await validatedCoverFile(f)).toBe(true);
  const encoded=btoa(String.fromCharCode(...jpeg));
  const embedded=embeddedCoverFile('data:image/jpeg;base64,'+encoded);
  expect(embedded?.type).toBe('image/jpeg');
  expect(embedded?.size).toBe(jpeg.length);
 });
 it('rejects polyglot and unsafe cover types',async()=>{
  expect(embeddedCoverFile('data:image/svg+xml;base64,PHN2Zz4=')).toBeNull();
  expect(embeddedCoverFile('data:image/jpeg;base64,YWJj')).toBeNull();
  expect(await validatedCoverFile(new File(['<svg></svg>'],'cover.jpg',{type:'image/jpeg'}))).toBe(false);
 });
});
