/* NÉBULA: browser-local MP3 encoding worker.
 * lame.min.js is an unmodified LGPL-3.0 third-party component.
 * See /vendor/LAMEJS-LICENSE.txt and docs/catalog/INTERNAL_MP3_CONVERSION.md.
 */
'use strict';
importScripts('/vendor/lame.min.js');
const CHUNK=1152;
const ALLOWED_SAMPLE_RATES=new Set([32000,44100,48000]);
function int16From(float,at,count){
 const out=new Int16Array(count);
 for(let i=0;i<count;i++){
  const value=Math.max(-1,Math.min(1,float[at+i]||0));
  out[i]=value<0?Math.round(value*32768):Math.round(value*32767);
 }
 return out;
}
self.onmessage=function(event){
 const data=event.data||{};
 try{
  const left=data.left,right=data.right,rate=data.sampleRate,bitrate=data.bitrate;
  const channels=data.channels;
  if(!(left instanceof Float32Array)||!(right instanceof Float32Array)||
     !ALLOWED_SAMPLE_RATES.has(rate)||(channels!==1&&channels!==2)||
     ![128,160,192,256].includes(bitrate)||
     left.length!==right.length||left.length<1||left.length>rate*600)
    throw new Error('Datos de conversión no válidos o audio demasiado largo.');
  const encoder=new self.lamejs.Mp3Encoder(channels,rate,bitrate);
  const parts=[];
  for(let offset=0;offset<left.length;offset+=CHUNK){
   const count=Math.min(CHUNK,left.length-offset);
   const a=int16From(left,offset,count);
   const b=channels===2?int16From(right,offset,count):a;
   const bytes=channels===2?encoder.encodeBuffer(a,b):encoder.encodeBuffer(a);
   if(bytes.length)parts.push(new Uint8Array(bytes));
   if(offset%(CHUNK*96)===0)self.postMessage({type:'progress',percent:Math.min(99,Math.round((offset+count)*100/left.length))});
  }
  const final=encoder.flush();
  if(final.length)parts.push(new Uint8Array(final));
  const blob=new Blob(parts,{type:'audio/mpeg'});
  blob.arrayBuffer().then(buffer=>{
   if(buffer.byteLength<16)throw new Error('La conversión no generó audio MP3.');
   self.postMessage({type:'result',buffer},[buffer]);
  }).catch(error=>self.postMessage({type:'error',message:String(error.message||'Error al finalizar MP3.')}));
 }catch(error){
  self.postMessage({type:'error',message:String(error.message||'No se pudo convertir el audio.')});
 }
};
