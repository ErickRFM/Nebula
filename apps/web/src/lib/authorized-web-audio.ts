/** Retrieve an explicitly authorized, directly linked audio file in the user's browser.
 *  Never sends a third-party URL to NÉBULA's backend and never processes video pages.
 *  The remote origin must allow cross-origin fetching. */
export const MAX_WEB_AUDIO_BYTES = 100 * 1024 * 1024;
const AUDIO_EXTENSIONS = new Set(['mp3','m4a','wav','ogg','opus','flac','aac']);
const MIME_ALIASES: Record<string,string[]> = {
  mp3:['audio/mpeg','audio/mp3'],
  m4a:['audio/mp4','audio/x-m4a'],
  wav:['audio/wav','audio/x-wav','audio/wave','audio/vnd.wave'],
  ogg:['audio/ogg'],
  opus:['audio/ogg','audio/opus'],
  flac:['audio/flac','audio/x-flac'],
  aac:['audio/aac','audio/aacp'],
};

export function directAudioFileInfo(input:string):{url:string;filename:string;extension:string}|null {
  try {
    const url=new URL(input.trim());
    if(url.protocol!=='https:'||url.username||url.password||url.href.length>2048)return null;
    const host=url.hostname.toLowerCase();
    if(host==='localhost'||host.endsWith('.localhost')||host.endsWith('.local')||
       /^127\./.test(host)||/^10\./.test(host)||/^192\.168\./.test(host)||
       /^172\.(1[6-9]|2\d|3[01])\./.test(host)||host==='[::1]')return null;
    const basename=decodeURIComponent(url.pathname.split('/').pop()??'');
    const extension=(basename.match(/\.([a-z0-9]+)$/i)?.[1]??'').toLowerCase();
    if(!AUDIO_EXTENSIONS.has(extension))return null;
    const safe=basename.replace(/[^a-zA-Z0-9_.-]/g,'-').slice(0,160);
    if(!safe||safe.startsWith('.'))return null;
    return {url:url.href,filename:safe,extension};
  }catch{return null;}
}

export async function retrieveAuthorizedAudio(
 input:string, signal:AbortSignal, onProgress?:(pct:number)=>void,
 fetchImpl:typeof fetch=fetch,
):Promise<File>{
  const info=directAudioFileInfo(input);
  if(!info)throw new Error('Usa una URL HTTPS directa que termine en MP3, FLAC, WAV, M4A, OGG, OPUS o AAC.');
  let response:Response;
  try{
    response=await fetchImpl(info.url,{method:'GET',credentials:'omit',redirect:'error',signal,cache:'no-store'});
  }catch(error){
    if(signal.aborted)throw new Error('Carga cancelada.');
    throw new Error('La fuente no permite descargar el audio desde este navegador (CORS o conexión). Descarga el archivo autorizado e impórtalo desde tu dispositivo.');
  }
  if(!response.ok)throw new Error('La fuente rechazó la descarga (HTTP '+response.status+').');
  const contentType=(response.headers.get('Content-Type')??'').split(';')[0].trim().toLowerCase();
  if(!MIME_ALIASES[info.extension].includes(contentType))
    throw new Error('La URL no entregó audio del formato indicado; no se aceptan páginas HTML ni videos.');
  const statedBytes=Number(response.headers.get('Content-Length')??0);
  if(statedBytes>MAX_WEB_AUDIO_BYTES)throw new Error('El archivo supera los 100 MB permitidos.');
  if(!response.body)throw new Error('El servidor no entregó el contenido de audio.');
  const reader=response.body.getReader();
  const chunks:Uint8Array[]=[];
  let received=0;
  try{
    while(true){
      const {value,done}=await reader.read();
      if(done)break;
      if(signal.aborted)throw new Error('Carga cancelada.');
      received+=value.byteLength;
      if(received>MAX_WEB_AUDIO_BYTES)throw new Error('El archivo supera los 100 MB permitidos.');
      chunks.push(value);
      if(statedBytes>0)onProgress?.(Math.min(100,Math.round(received*100/statedBytes)));
    }
  }catch(error){await reader.cancel().catch(()=>{});throw error;}
  if(signal.aborted)throw new Error('Carga cancelada.');
  if(received<1)throw new Error('El archivo de audio está vacío.');
  if(statedBytes>0&&received!==statedBytes)throw new Error('La descarga terminó incompleta.');
  return new File(chunks.map(chunk=>new Uint8Array(chunk) as BlobPart),info.filename,{type:contentType});
}
