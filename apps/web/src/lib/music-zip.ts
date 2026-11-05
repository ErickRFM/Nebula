/**
 * Offline ZIP STORE for user-owned audio. No CDN, Node backend, compression,
 * decompression bomb, or external dependency. ZIP entries are stored verbatim.
 */
import type {SavedSong} from './local-library';
import {exportedSongFilename} from './local-audio-download';
export const ZIP_MAX_FILES=50;
export const ZIP_MAX_BYTES=120*1024*1024;
const EXT=/\.(mp3|m4a|wav|ogg|flac|aac|opus)$/i;
type Entry={name:string;bytes:Uint8Array};
const enc=new TextEncoder();
const dec=new TextDecoder('utf-8',{fatal:true});
function crc32(input:Uint8Array):number{
 let crc=0xffffffff;
 for(const value of input){
  crc^=value;
  for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);
 }
 return (crc^0xffffffff)>>>0;
}
function safeName(name:string):string{
 const result=name.replaceAll('\\','/').split('/').pop()?.replace(/[<>:"/\\|?*\x00-\x1f]/g,'-').trim().slice(0,140)||'audio';
 if(!EXT.test(result)||result.startsWith('.'))throw Error('Nombre de audio no permitido en ZIP.');
 return result;
}
function sizeCheck(files:number,total:number){
 if(files<1||files>ZIP_MAX_FILES)throw Error('Selecciona de 1 a '+ZIP_MAX_FILES+' canciones.');
 if(total<1||total>ZIP_MAX_BYTES)throw Error('El ZIP puede contener como máximo 120 MB de audio por lote.');
}
export function encodeStoredAudioZip(entries:Entry[]):Uint8Array{
 const names=entries.map(x=>enc.encode(safeName(x.name)));
 const totalBytes=entries.reduce((n,e)=>n+e.bytes.byteLength,0);
 sizeCheck(entries.length,totalBytes);
 const bytes=22+entries.reduce((s,e,i)=>s+30+names[i].length+e.bytes.byteLength+46+names[i].length,0);
 const out=new Uint8Array(bytes),view=new DataView(out.buffer);
 const u16=(offset:number,value:number)=>view.setUint16(offset,value,true);
 const u32=(offset:number,value:number)=>view.setUint32(offset,value,true);
 let pos=0;const offsets:number[]=[];const checks:number[]=[];
 for(let i=0;i<entries.length;i++){
  const file=entries[i],name=names[i],size=file.bytes.byteLength,hash=crc32(file.bytes);
  offsets.push(pos);checks.push(hash);
  u32(pos,0x04034b50);u16(pos+4,20);u16(pos+6,0);u16(pos+8,0);
  u32(pos+14,hash);u32(pos+18,size);u32(pos+22,size);u16(pos+26,name.length);
  out.set(name,pos+30);out.set(file.bytes,pos+30+name.length);pos+=30+name.length+size;
 }
 const central=pos;
 for(let i=0;i<entries.length;i++){
  const file=entries[i],name=names[i],size=file.bytes.byteLength;
  u32(pos,0x02014b50);u16(pos+4,20);u16(pos+6,20);
  u32(pos+16,checks[i]);u32(pos+20,size);u32(pos+24,size);u16(pos+28,name.length);
  u32(pos+42,offsets[i]);out.set(name,pos+46);pos+=46+name.length;
 }
 u32(pos,0x06054b50);u16(pos+8,entries.length);u16(pos+10,entries.length);
 u32(pos+12,pos-central);u32(pos+16,central);
 return out;
}
const MIME:Record<string,string>={mp3:'audio/mpeg',m4a:'audio/mp4',wav:'audio/wav',flac:'audio/flac',
 ogg:'audio/ogg',opus:'audio/opus',aac:'audio/aac'};
export async function createMusicArchive(songs:SavedSong[]):Promise<Blob>{
 const chosen=songs.slice(0,ZIP_MAX_FILES+1);
 const seen=new Set<string>();const entries:Entry[]=[];
 let total=0;
 for(const song of chosen){
  const base=safeName(exportedSongFilename(song));
  const filename=seen.has(base)?base.replace(EXT,(ext)=>' ('+(entries.length+1)+')'+ext):base;
  seen.add(filename);
  const size=song.blob.size;total+=size;
  sizeCheck(chosen.length,total);
  entries.push({name:filename,bytes:new Uint8Array(await song.blob.arrayBuffer())});
 }
 const archive=encodeStoredAudioZip(entries);
 return new Blob([new Uint8Array(archive)],{type:'application/zip'});
}
export async function readMusicArchive(file:File):Promise<File[]>{
 if(file.size<=22||file.size>ZIP_MAX_BYTES+10*1024*1024)throw Error('El ZIP está vacío o supera 130 MB.');
 const bytes=new Uint8Array(await file.arrayBuffer()),view=new DataView(bytes.buffer);
 const u16=(off:number)=>view.getUint16(off,true),u32=(off:number)=>view.getUint32(off,true);
 let pos=0,total=0;const result:File[]=[];
 while(pos+4<=bytes.length&&u32(pos)===0x04034b50){
  if(pos+30>bytes.length)throw Error('Cabecera ZIP incompleta.');
  if(u16(pos+6)!==0||u16(pos+8)!==0)throw Error('Solo se aceptan ZIP de NÉBULA sin cifrado ni compresión.');
  const length=u32(pos+18),original=u32(pos+22),nameLen=u16(pos+26),extra=u16(pos+28);
  const start=pos+30+nameLen+extra;
  if(length!==original||!nameLen||length<1||start>bytes.length||length>bytes.length-start)
   throw Error('Archivo ZIP incompleto o modificado.');
  const name=dec.decode(bytes.subarray(pos+30,pos+30+nameLen));
  if(name.includes('/')||name.includes('\\')||name.startsWith('.')||name!==safeName(name))
   throw Error('El ZIP contiene una ruta o un archivo no permitido.');
  const payload=bytes.slice(start,start+length);
  if(crc32(payload)!==u32(pos+14))throw Error('El ZIP contiene un archivo dañado.');
  total+=length;sizeCheck(result.length+1,total);
  const extension=name.match(EXT)?.[1].toLowerCase()??'mp3';
  result.push(new File([new Uint8Array(payload)],name,{type:MIME[extension]}));
  pos=start+length;
 }
 if(!result.length||pos+4>bytes.length||u32(pos)!==0x02014b50)
  throw Error('Este ZIP no es una colección musical compatible de NÉBULA.');
 return result;
}
