'use client';
import {useEffect,useMemo,useRef,useState,type FormEvent} from 'react';
import {Download,ExternalLink,ListMusic,Music2,Play,RefreshCw} from 'lucide-react';
import type {ExternalEmbed} from '../lib/external-embeds';
import {directAudioFileInfo,retrieveAuthorizedAudio} from '../lib/authorized-web-audio';
import {downloadLocalAudioBlob} from '../lib/local-audio-download';

type PlayerHandle={
 getPlaylist?:()=>string[]|null;
 getPlaylistIndex?:()=>number;
 getVideoData?:()=>{video_id?:string;title?:string;author?:string};
 playVideoAt?:(index:number)=>void;
 destroy?:()=>void;
};
type PlayerApi={Player:new(element:HTMLIFrameElement,options:{
 events:{onReady:(event:{target:PlayerHandle})=>void;onStateChange:(event:{target:PlayerHandle})=>void}
})=>PlayerHandle};
declare global{
 interface Window{YT?:PlayerApi;onYouTubeIframeAPIReady?:(()=>void)|undefined}
}
let youtubeSdkPromise:Promise<PlayerApi>|null=null;
function loadYouTubeSdk():Promise<PlayerApi>{
 if(window.YT?.Player)return Promise.resolve(window.YT);
 if(youtubeSdkPromise)return youtubeSdkPromise;
 youtubeSdkPromise=new Promise((resolve,reject)=>{
  let settled=false;
  const done=(api:PlayerApi)=>{if(!settled){settled=true;resolve(api);}};
  const fail=()=>{if(!settled){settled=true;youtubeSdkPromise=null;reject(new Error('No se pudo cargar el índice de YouTube.'));}};
  const previous=window.onYouTubeIframeAPIReady;
  window.onYouTubeIframeAPIReady=()=>{previous?.();if(window.YT?.Player)done(window.YT);else fail();};
  if(!document.querySelector('script[data-nebula-youtube-api]')){
   const script=document.createElement('script');
   script.dataset.nebulaYoutubeApi='1';
   script.src='https://www.youtube.com/iframe_api';
   script.async=true;script.onerror=fail;
   document.head.appendChild(script);
  }
  window.setTimeout(fail,12000);
 });
 return youtubeSdkPromise;
}
const safeVideo=(s:unknown):s is string=>typeof s==='string'&&/^[A-Za-z0-9_-]{11}$/.test(s);
type Metadata={videoId:string;title:string|null;artist:string|null};
const base=process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/,'')??'';
const mayFetchMetadata=Boolean(base)||process.env.NEXT_PUBLIC_USE_SAME_ORIGIN_API==='true';
function videoIdFromSource(source:string):string|null{
 try{const u=new URL(source),v=u.searchParams.get('v');return safeVideo(v)?v:null;}catch{return null;}
}
/** Official API returns the currently accessible video IDs, not an entire infinite RD radio. */
export function YouTubePlaylistBrowser({media,onImport}:{
 media:ExternalEmbed;onImport:(files:File[])=>void;
}){
 const frameRef=useRef<HTMLIFrameElement|null>(null);
 const ytRef=useRef<PlayerHandle|null>(null);
 const [ids,setIds]=useState<string[]>([]);
 const [index,setIndex]=useState<number>(0);
 const [metadata,setMetadata]=useState<Record<string,Metadata>>({});
 const [visible,setVisible]=useState(20);
 const [status,setStatus]=useState('');
 const [activeMp3,setActiveMp3]=useState<string|null>(null);
 const [url,setUrl]=useState('');
 const [allowed,setAllowed]=useState(false);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [saved,setSaved]=useState<File|null>(null);
 const mounted=useRef(true);
 const requested=useRef(new Set<string>());
 const controller=useRef<AbortController|null>(null);
 const collection=media.collection!;
 const fallback=useMemo(()=>videoIdFromSource(media.sourceUrl),[media.sourceUrl]);
 const list=ids.length?ids:fallback?[fallback]:[];
 const shown=list.slice(0,visible);
 const src=useMemo(()=>{
  const u=new URL(media.src);
  u.searchParams.set('enablejsapi','1');
  if(typeof window!=='undefined')u.searchParams.set('origin',window.location.origin);
  return u.toString();
 },[media.src]);
 function sync(player:PlayerHandle){
  ytRef.current=player;
  try{
   const all=player.getPlaylist?.();
   if(Array.isArray(all)){
    const unique=[...new Set(all.filter(safeVideo))].slice(0,100);
    if(unique.length)setIds(unique);
   }
   const i=player.getPlaylistIndex?.();
   if(typeof i==='number'&&Number.isInteger(i)&&i>=0&&i<100)setIndex(i);
   const current=player.getVideoData?.();
   if(current&&safeVideo(current.video_id)&&typeof current.title==='string'&&current.title){
    const id=current.video_id;
    setMetadata(prev=>({...prev,[id]:{videoId:id,title:current.title!.slice(0,160),artist:typeof current.author==='string'?current.author.slice(0,100):null}}));
   }
  }catch{setStatus('El reproductor no entregó la lista completa. Puedes abrirla en YouTube.');}
 }
 useEffect(()=>{
  mounted.current=true;let closed=false;
  void loadYouTubeSdk().then(api=>{
   if(closed||!frameRef.current)return;
   const player=new api.Player(frameRef.current,{
    events:{
     onReady:(e)=>{if(!closed){sync(e.target);setStatus('Índice recibido del reproductor oficial.');}},
     onStateChange:(e)=>{if(!closed)sync(e.target);},
    },
   });
   ytRef.current=player;
  }).catch(()=>{if(!closed)setStatus('El navegador bloqueó la API de YouTube. El video sigue disponible, pero no se puede enumerar la lista aquí.');});
  return()=>{closed=true;mounted.current=false;controller.current?.abort();try{ytRef.current?.destroy?.();}catch{}ytRef.current=null;};
 },[media.src]);
 useEffect(()=>{
  if(!mayFetchMetadata||!shown.length)return;
  const fresh=shown.filter(id=>!metadata[id]&&!requested.current.has(id)).slice(0,20);
  if(!fresh.length)return;
  fresh.forEach(id=>requested.current.add(id));
  const abort=new AbortController();
  void fetch(base+'/v1/discovery/youtube/video-metadata?ids='+fresh.join(','),{signal:abort.signal,cache:'no-store'})
   .then(r=>r.ok?r.json():null).then((data:{items?:Metadata[]}|null)=>{
    if(!mounted.current||!Array.isArray(data?.items))return;
    setMetadata(old=>{
     const next={...old};
     for(const value of data.items??[])if(safeVideo(value.videoId)){
      next[value.videoId]={
       videoId:value.videoId,
       title:typeof value.title==='string'?value.title.slice(0,160):null,
       artist:typeof value.artist==='string'?value.artist.slice(0,100):null,
      };
     }
     return next;
    });
   }).catch(()=>{});
  return()=>abort.abort();
 },[shown.join(','),media.src]);
 function selectMp3(id:string){setActiveMp3(activeMp3===id?null:id);setUrl('');setError('');setSaved(null);setAllowed(false);}
 async function importMp3(event:FormEvent){
  event.preventDefault();
  if(busy||!activeMp3)return;
  const info=directAudioFileInfo(url);
  if(!info||info.extension!=='mp3'){setError('Necesitas un enlace HTTPS directo a un MP3, no una página de YouTube.');return;}
  if(!allowed){setError('Confirma que tienes permiso para guardar ese MP3.');return;}
  const abort=new AbortController();controller.current=abort;setBusy(true);setError('');
  try{
   const f=await retrieveAuthorizedAudio(info.url,abort.signal);
   const header=new Uint8Array(await f.slice(0,3).arrayBuffer());
   if(!((header[0]===73&&header[1]===68&&header[2]===51)||
       (header[0]===255&&(header[1]&0xe0)===0xe0)))throw Error('La fuente no entregó un MP3 válido.');
   if(abort.signal.aborted)return;
   onImport([f]);setSaved(f);setStatus('MP3 importado en tu biblioteca local.');
  }catch(e){if(!abort.signal.aborted)setError(e instanceof Error?e.message:'No se pudo importar el MP3.');}
  finally{if(mounted.current){setBusy(false);controller.current=null;}}
 }
 return <div className="yt-collection-browser" role="region" aria-label="Canciones de la lista de YouTube">
  <iframe key={media.src} ref={frameRef} className="bridge-iframe" src={src} title="Reproductor oficial de YouTube"
   loading="eager" referrerPolicy="strict-origin-when-cross-origin"
   allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen/>
  <div className="yt-collection-heading">
   <span><ListMusic size={18}/> {collection.kind==='mix'?'Radio / Mix de YouTube':'Canciones de la playlist'} · {list.length} {list.length===1?'video disponible':'videos disponibles'}</span>
   <button type="button" className="button secondary small" onClick={()=>{if(ytRef.current)sync(ytRef.current);}}> <RefreshCw size={14}/> Actualizar lista</button>
  </div>
  <p className="disclosure">{collection.kind==='mix'
   ?'YouTube genera esta mezcla continuamente. Aquí aparecen solo los videos que entrega a su reproductor; para ver el resto abre la mezcla original.'
   :'Se muestran hasta 100 videos disponibles en el reproductor oficial. Los títulos se consultan por metadatos públicos; algunos pueden no estar disponibles.'}</p>
  {status&&<p role="status" className="disclosure">{status}</p>}
  {shown.length>0&&<div className="yt-collection-items">
   {shown.map((id,i)=><div key={id} className={'yt-collection-item '+(index===i?'current':'')}>
    <img src={'https://i.ytimg.com/vi/'+id+'/mqdefault.jpg'} alt="" width={88} height={50} loading="lazy"/>
    <span className="yt-collection-caption"><strong>{metadata[id]?.title||'Video '+(i+1)}</strong>
     <small>{metadata[id]?.artist||'YouTube'} · {i+1} / {list.length}</small></span>
    <div className="yt-collection-buttons">
     <button type="button" className="button primary small" onClick={()=>{if(ytRef.current?.playVideoAt&&ids.length){ytRef.current.playVideoAt(i);}else window.open('https://www.youtube.com/watch?v='+id+'&list='+collection.id,'_blank','noopener,noreferrer');}}><Play size={14}/> Escuchar</button>
     <details className="yt-track-more">
       <summary aria-label={'Más opciones para '+(metadata[id]?.title||'video '+(i+1))}>Más opciones</summary>
       <div className="yt-track-more-actions">
         <a href={'https://www.youtube.com/watch?v='+id+'&list='+collection.id} target="_blank" rel="noopener noreferrer" className="button secondary small"><ExternalLink size={14}/> Abrir en YouTube</a>
         <button type="button" className="button secondary small" onClick={()=>selectMp3(id)} aria-expanded={activeMp3===id}><Download size={14}/> Importar MP3 propio</button>
       </div>
     </details>
    </div>
    {activeMp3===id&&<form className="yt-collection-mp3" onSubmit={event=>{void importMp3(event);}}>
     <p className="disclosure">Para guardar esta canción, introduce un enlace directo al MP3 que tengas permiso para descargar. El enlace del video no sirve como archivo MP3.</p>
     <label className="sr-only" htmlFor={'playlist-mp3-'+id}>Enlace directo a MP3 autorizado</label>
     <input id={'playlist-mp3-'+id} value={url} onChange={e=>setUrl(e.target.value)} type="url" required
      placeholder="https://tu-servidor/cancion.mp3" disabled={busy}/>
     <label className="yt-collection-allow"><input type="checkbox" checked={allowed} onChange={e=>setAllowed(e.target.checked)} disabled={busy}/> Tengo permiso para guardar este audio</label>
     <button type="submit" className="button primary small" disabled={!url||!allowed||busy}>{busy?'Importando…':'Descargar y añadir a Biblioteca'}</button>
     {saved&&<button type="button" className="button secondary small" onClick={()=>downloadLocalAudioBlob(saved,saved.name)}>Guardar MP3 en Descargas</button>}
     {error&&<p role="alert" className="account-error">{error}</p>}
    </form>}
   </div>)}
  </div>}
  {shown.length<list.length&&<button type="button" className="button secondary small" onClick={()=>setVisible(n=>Math.min(n+20,100))}>Mostrar más canciones</button>}
  {!list.length&&<p className="empty-note">Este reproductor todavía no ha proporcionado los IDs de la lista. Abre la playlist original para ver todas las canciones.</p>}
 </div>;
}
