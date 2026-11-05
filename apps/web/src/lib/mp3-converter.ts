/**
 * Internal client-side conversion for user-supplied audio.
 * Does not fetch online videos, decrypt streams, or send audio to an API.
 */
export const MAX_CONVERT_INPUT_BYTES=25*1024*1024;
export const MAX_CONVERT_SECONDS=600;
export const MAX_CONVERT_BATCH=8;
const EXT=/\.(mp3|m4a|wav|ogg|flac|aac|opus)$/i;
const MP3=/\.mp3$/i;
export function conversionOutputFilename(filename:string):string{
 const name=filename.replace(/\\/g,'/').split('/').pop()??'audio';
 const basename=name.replace(EXT,'').replace(/[<>:"/\\|?*\x00-\x1f]/g,'-').replace(/^[.\s-]+/,'').trim().slice(0,130)||'audio';
 return basename+'.mp3';
}
export function validateConversionFile(file:Pick<File,'name'|'size'>):void{
 if(!EXT.test(file.name))throw new Error('Importa archivos MP3, M4A, WAV, OGG, FLAC, AAC u OPUS.');
 if(file.size<1)throw new Error('No se puede convertir un archivo vacío.');
 if(file.size>MAX_CONVERT_INPUT_BYTES)throw new Error('Para convertir en tu navegador, usa archivos de hasta 25 MB.');
}
function abortError(){return new Error('Conversión cancelada.');}
type ConversionOptions={signal?:AbortSignal;onProgress?:(percent:number)=>void;bitrate?:128|160|192|256};
type Mp3Message={type:'progress';percent:number}|{type:'result';buffer:ArrayBuffer}|{type:'error';message:string};

async function decode(file:File,signal?:AbortSignal):Promise<{left:Float32Array;right:Float32Array;sampleRate:number;channels:1|2}>{
 if(typeof AudioContext==='undefined')throw new Error('Este navegador no ofrece un decodificador de audio compatible.');
 let ctx:AudioContext;
 try{ctx=new AudioContext({sampleRate:44100});}
 catch{ctx=new AudioContext();}
 try{
  if(signal?.aborted)throw abortError();
  const encoded=await file.arrayBuffer();
  if(signal?.aborted)throw abortError();
  let audio:AudioBuffer;
  try{audio=await ctx.decodeAudioData(encoded);}
  catch{throw new Error('El navegador no pudo decodificar este formato de audio. Prueba con WAV o M4A.');}
  if(!Number.isFinite(audio.duration)||audio.duration<=0||audio.duration>MAX_CONVERT_SECONDS)
   throw new Error('Solo pueden convertirse archivos de hasta 10 minutos.');
  if(signal?.aborted)throw abortError();
  let rate=audio.sampleRate;
  // LAME only accepts MPEG-1 sample rates in this build; use Web Audio to resample.
  if(![32000,44100,48000].includes(rate)){
   const frames=Math.ceil(audio.duration*44100);
   const offline=new OfflineAudioContext(Math.min(2,audio.numberOfChannels),frames,44100);
   const source=offline.createBufferSource();
   source.buffer=audio;source.connect(offline.destination);source.start(0);
   audio=await offline.startRendering();
   rate=44100;
  }
  const channels=audio.numberOfChannels>1?2:1;
  return {
   left:audio.getChannelData(0).slice(),
   right:(channels===2?audio.getChannelData(1):audio.getChannelData(0)).slice(),
   sampleRate:rate,channels,
  };
 }finally{void ctx.close().catch(()=>{});}
}
export async function convertOwnedAudioToMp3(file:File,{signal,onProgress,bitrate=192}:ConversionOptions={}):Promise<File>{
 validateConversionFile(file);
 if(signal?.aborted)throw abortError();
 if(MP3.test(file.name)&&['audio/mpeg','audio/mp3'].includes(file.type)){
  const header=new Uint8Array(await file.slice(0,3).arrayBuffer());
  if((header[0]===73&&header[1]===68&&header[2]===51)||
     (header[0]===255&&(header[1]&0xe0)===0xe0)){
    onProgress?.(100);return file;
  }
 }
 const decoded=await decode(file,signal);
 if(signal?.aborted)throw abortError();
 return new Promise<File>((resolve,reject)=>{
  const worker=new Worker('/workers/nebula-mp3-worker.js');
  let settled=false;
  const cleanup=()=>{worker.terminate();signal?.removeEventListener('abort',onAbort);};
  const fail=(err:Error)=>{if(settled)return;settled=true;cleanup();reject(err);};
  const onAbort=()=>fail(abortError());
  signal?.addEventListener('abort',onAbort,{once:true});
  if(signal?.aborted){onAbort();return;}
  worker.onerror=()=>fail(new Error('El codificador MP3 local no pudo iniciarse.'));
  worker.onmessage=(event:MessageEvent<Mp3Message>)=>{
   const message=event.data;
   if(message.type==='progress'){onProgress?.(Math.min(99,Math.max(0,message.percent)));return;}
   if(message.type==='error'){fail(new Error(message.message));return;}
   if(message.type==='result'){
    if(settled)return;
    settled=true;cleanup();
    onProgress?.(100);
    resolve(new File([message.buffer],conversionOutputFilename(file.name),{type:'audio/mpeg'}));
   }
  };
  const {left,right}=decoded;
  worker.postMessage({...decoded,left,right,bitrate},[left.buffer,right.buffer]);
 });
}
