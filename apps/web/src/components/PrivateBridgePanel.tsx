'use client';

import {useEffect,useRef,useState,type FormEvent} from 'react';
import {Download,Headphones,ShieldCheck,ExternalLink,Radio,Search} from 'lucide-react';
import {downloadLocalAudioBlob} from '../lib/local-audio-download';
import type {Track} from '../lib/catalog';
import {BRIDGE_ENABLED,BRIDGE_URL,bridgeVideos,isPlayableExternalUrl,type BridgeVideo} from '../lib/private-bridge';

const STORAGE='nebula:private-bridge-session-token';
export function PrivateBridgePanel({initialQuery='',standalone=false,onPlay,onImport,incomingUrl=''}:{
 initialQuery?:string;standalone?:boolean;onPlay:(track:Track)=>void;onImport:(files:File[])=>void;incomingUrl?:string;
}){
 const [token,setToken]=useState('');
 const [inputToken,setInputToken]=useState('');
 const [typed,setTyped]=useState('');
 const [online,setOnline]=useState(false);
 const [engine,setEngine]=useState(false);
 const [loading,setLoading]=useState(false);
 const [playing,setPlaying]=useState<string|null>(null);
 const [downloading,setDownloading]=useState<string|null>(null);
 const [downloadAllowed,setDownloadAllowed]=useState(false);
 const [directUrl,setDirectUrl]=useState('');
 const [directId,setDirectId]=useState<string|null>(null);
 const [items,setItems]=useState<BridgeVideo[]>([]);
 const [notice,setNotice]=useState('');
 const [refresh,setRefresh]=useState(0);
 const requestRef=useRef<AbortController|null>(null);
 const panelRef=useRef<HTMLElement|null>(null);
 useEffect(()=>{
  if(!incomingUrl)return;
  try{
   const u=new URL(incomingUrl);
   const host=u.hostname.toLowerCase();
   const id=host==='youtu.be'?u.pathname.slice(1):['youtube.com','www.youtube.com','m.youtube.com','music.youtube.com'].includes(host)?u.searchParams.get('v'):null;
   if(u.protocol==='https:'&&id&&/^[A-Za-z0-9_-]{11}$/.test(id)){
    setDirectUrl(incomingUrl);setDirectId(id);
    window.requestAnimationFrame(()=>panelRef.current?.scrollIntoView({behavior:'smooth',block:'start'}));
   }
  }catch{/* User can paste a different valid URL manually. */}
 },[incomingUrl]);
 const query=(standalone?typed:initialQuery).trim();
 useEffect(()=>{
  if(!BRIDGE_ENABLED)return;
  try{const saved=sessionStorage.getItem(STORAGE);if(saved&&saved.length>=32)setToken(saved);}
  catch{/* Private browsing may block sessionStorage. */}
  const controller=new AbortController();
  void fetch(BRIDGE_URL+'/health',{cache:'no-store',signal:controller.signal,redirect:'error'})
   .then(async r=>r.ok?r.json():null).then(data=>{
    if(!controller.signal.aborted){setOnline(data?.status==='ok');setEngine(data?.enabled===true);}
   }).catch(()=>{if(!controller.signal.aborted)setOnline(false);});
  return()=>controller.abort();
 },[]);
 useEffect(()=>{
  if(!BRIDGE_ENABLED||!token||!online||!engine||query.length<2||query.length>100){
   setItems([]);setLoading(false);return;
  }
  requestRef.current?.abort();
  const controller=new AbortController();
  requestRef.current=controller;
  setItems([]);
  const timer=window.setTimeout(()=>{
   setLoading(true);setNotice('');
   void fetch(BRIDGE_URL+'/search?q='+encodeURIComponent(query),{
    headers:{Authorization:'Bearer '+token},
    cache:'no-store',signal:controller.signal,redirect:'error',
   }).then(async r=>{
    if(r.status===401)throw Error('Token incorrecto. Empareja de nuevo el puente local.');
    if(r.status===429)throw Error('Demasiadas búsquedas. Prueba dentro de un momento.');
    if(!r.ok)throw Error('El buscador privado no respondió. Comprueba yt-dlp.');
    return r.json() as Promise<unknown>;
   }).then(data=>{if(!controller.signal.aborted)setItems(bridgeVideos(data));})
    .catch(e=>{if(!controller.signal.aborted){setItems([]);setNotice(e instanceof Error?e.message:'No se pudo buscar.');}})
    .finally(()=>{if(!controller.signal.aborted)setLoading(false);});
  },750);
  return()=>{window.clearTimeout(timer);controller.abort();};
 },[query,token,online,engine,refresh]);
 if(!BRIDGE_ENABLED)return null;
 function pair(event:FormEvent<HTMLFormElement>){
  event.preventDefault();
  const trimmed=inputToken.trim();
  if(trimmed.length<32){setNotice('El token del puente debe tener al menos 32 caracteres.');return;}
  try{sessionStorage.setItem(STORAGE,trimmed);}catch{/* The in-memory token works for this tab. */}
  setToken(trimmed);setInputToken('');setNotice('');
 }
 async function play(item:BridgeVideo){
  setPlaying(item.id);setNotice('');
  try{
   const response=await fetch(BRIDGE_URL+'/ticket',{
    method:'POST',headers:{'Authorization':'Bearer '+token,'Content-Type':'application/json'},
    body:JSON.stringify({id:item.id}),cache:'no-store',redirect:'error',
   });
   if(!response.ok)throw Error(response.status===401?'Token local inválido.':'El puente no pudo crear la sesión de audio.');
   const body=await response.json() as {ticket?:unknown};
   if(typeof body.ticket!=='string')throw Error('Respuesta de audio inválida.');
   const audioUrl=BRIDGE_URL+'/stream?ticket='+encodeURIComponent(body.ticket);
   if(!isPlayableExternalUrl(audioUrl,true))throw Error('El enlace local no pasó la comprobación de seguridad.');
   const d=item.durationSeconds;
   onPlay({id:'remote-localbridge-'+item.id,title:item.title,artist:item.artist,
    album:'Puente musical privado',genre:'Personal',
    cover:'/art/orbita.svg',duration:d===null?'--:--':Math.floor(d/60)+':'+String(d%60).padStart(2,'0'),
    audioUrl,source:'external',
   });
  }catch(e){setNotice(e instanceof Error?e.message:'No se pudo preparar el audio.');}
  finally{setPlaying(null);}
 }
 async function downloadMp3(item:BridgeVideo){
  if(!downloadAllowed){setNotice('Confirma que tienes permiso para guardar este contenido.');return;}
  if(downloading||playing)return;
  const abort=new AbortController();
  requestRef.current?.abort();
  requestRef.current=abort;
  setDownloading(item.id);setNotice('Preparando MP3 desde el puente local…');
  try{
   const ticketResponse=await fetch(BRIDGE_URL+'/ticket',{
    method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
    body:JSON.stringify({id:item.id}),cache:'no-store',redirect:'error',signal:abort.signal,
   });
   if(!ticketResponse.ok)throw Error(ticketResponse.status===401?'Token local inválido.':'No se pudo autorizar la conversión MP3.');
   const payload=await ticketResponse.json() as {ticket?:unknown};
   if(typeof payload.ticket!=='string'||!/^[A-Za-z0-9_-]{20,300}\\.[A-Za-z0-9_-]{30,80}$/.test(payload.ticket))throw Error('Ticket de descarga inválido.');
   const response=await fetch(BRIDGE_URL+'/download?ticket='+encodeURIComponent(payload.ticket),{
    cache:'no-store',redirect:'error',credentials:'omit',signal:abort.signal,
   });
   if(!response.ok||response.headers.get('content-type')?.split(';')[0]!=='audio/mpeg')throw Error('El puente no entregó un archivo MP3 válido.');
   if(!response.body)throw Error('No se recibió audio del puente.');
   const chunks:Uint8Array[]=[];let bytes=0;
   const reader=response.body.getReader();
   while(true){const {done,value}=await reader.read();if(done)break;
    bytes+=value.byteLength;
    if(bytes>100*1024*1024){await reader.cancel();throw Error('El MP3 supera el límite de 100 MB.');}
    chunks.push(value);
   }
   if(bytes<128)throw Error('La descarga de audio terminó vacía.');
   const filename=(item.title.normalize('NFKD').replace(/[^a-zA-Z0-9 ._-]/g,'').trim().slice(0,100)||item.id)+'.mp3';
   const file=new File(chunks.map(chunk=>new Uint8Array(chunk) as BlobPart),filename,{type:'audio/mpeg'});
   const header=new Uint8Array(await file.slice(0,3).arrayBuffer());
   if(!((header[0]===73&&header[1]===68&&header[2]===51)||(header[0]===255&&(header[1]&0xe0)===0xe0)))throw Error('La fuente no produjo un MP3 reconocible.');
   if(abort.signal.aborted)return;
   onImport([file]);
   downloadLocalAudioBlob(file,file.name);
   setNotice('MP3 descargado y añadido a tu Biblioteca local: '+file.name);
  }catch(e){if(!abort.signal.aborted)setNotice(e instanceof Error?e.message:'No se pudo generar el MP3.');}
  finally{setDownloading(null);if(requestRef.current===abort)requestRef.current=null;}
 }
 function importVideoLink(event:FormEvent<HTMLFormElement>){
  event.preventDefault();
  try{
   const url=new URL(directUrl.trim());
   if(url.protocol!=='https:'||url.username||url.password)throw Error('Usa un enlace HTTPS de un video YouTube.');
   const host=url.hostname.toLowerCase();
   const id=host==='youtu.be'?url.pathname.slice(1):
     ['youtube.com','www.youtube.com','m.youtube.com','music.youtube.com'].includes(host)?url.searchParams.get('v'):null;
   if(!id||!/^[A-Za-z0-9_-]{11}$/.test(id))throw Error('El enlace no contiene un video de YouTube compatible.');
   setDirectId(id);setNotice('Video preparado: puedes escucharlo o generar un MP3 autorizado.');
  }catch(e){setDirectId(null);setNotice(e instanceof Error?e.message:'Enlace inválido.');}
 }
 function searchNow(e:FormEvent<HTMLFormElement>){e.preventDefault();if(query.length>=2)setRefresh(i=>i+1);}
 return <section ref={panelRef} className="content-section private-bridge" aria-label="Reproductor local privado">
  <div className="section-heading"><h2><Radio size={19}/> Reproducción privada local</h2></div>
  <p className="page-description">Puente opcional de tu propio ordenador, sin clave de Google. Solo funciona mientras lo tengas abierto y autorizado. Las fuentes externas pueden fallar por restricciones del proveedor.</p>
  {!online?<p className="search-source-hint" role="status">No se detecta el puente en este dispositivo. Ejecuta <code>npm run bridge:dev</code> en tu ordenador y abre NÉBULA allí.</p>:
   !engine?<p className="search-source-hint" role="status">Puente detectado, pero el adaptador yt-dlp está deshabilitado. Actívalo solamente para contenidos a los que tengas derecho de acceso.</p>:
   !token?<form className="playlist-create glass" onSubmit={pair}>
    <ShieldCheck size={18}/>
    <label className="sr-only" htmlFor="private-bridge-token">Token de emparejamiento local</label>
    <input id="private-bridge-token" type="password" autoComplete="off" value={inputToken} onChange={e=>setInputToken(e.target.value)} placeholder="Pega aquí el token que imprime el puente"/>
    <button type="submit" className="button primary small" disabled={inputToken.trim().length<32}>Conectar</button>
   </form>:
   <>
    <div className="chip-row"><span className="chip active"><ShieldCheck size={14}/> Equipo local conectado</span><button type="button" className="chip" onClick={()=>{try{sessionStorage.removeItem(STORAGE);}catch{}setToken('');setItems([]);}}>Desvincular</button></div>
    {standalone&&<form className="explore-form glass" role="search" onSubmit={searchNow}><Search size={17}/><label htmlFor="bridge-search" className="sr-only">Buscar canción en puente privado</label><input id="bridge-search" value={typed} maxLength={100} onChange={e=>setTyped(e.target.value)} placeholder="Busca un título o artista"/>
     <button className="button primary small" disabled={query.length<2||loading}>Buscar</button></form>}
    <form className="playlist-create glass" onSubmit={importVideoLink}>
      <label className="sr-only" htmlFor="nebula-direct-youtube-url">Enlace de video de YouTube</label>
      <input id="nebula-direct-youtube-url" type="url" placeholder="https://www.youtube.com/watch?v=…" value={directUrl} onChange={e=>{setDirectUrl(e.target.value);setDirectId(null);}}/>
      <button className="button secondary small" type="submit" disabled={!directUrl.trim()}>Usar enlace</button>
    </form>
    <label className="authorized-web-confirm"><input type="checkbox" checked={downloadAllowed} onChange={e=>setDownloadAllowed(e.target.checked)}/> Confirmo que tengo derecho a descargar y guardar este audio.</label>
    <p className="disclosure">La descarga se realiza en tu propio equipo con yt-dlp y FFmpeg, sin enviar el MP3 a NÉBULA. No admite videos protegidos, privados ni fuentes bloqueadas.</p>
    {loading&&<p className="disclosure" role="status">Buscando pistas en tu puente privado…</p>}
    {(items.length>0||directId)&&<div className="track-list glass">{[...(directId?[{id:directId,title:'Video '+directId,artist:'YouTube',durationSeconds:null,sourceUrl:'https://www.youtube.com/watch?v='+directId}]:[]),...items].filter((item,index,list)=>list.findIndex(entry=>entry.id===item.id)===index).map(item=><div className="track-row" key={item.id}>
     <span className="track-descriptor"><strong>{item.title}</strong><small>{item.artist} · fuente local</small></span>
     <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" aria-label={'Abrir fuente de '+item.title}><ExternalLink size={15}/></a>
     <button className="button secondary small" type="button" disabled={playing!==null||downloading!==null} onClick={()=>{void play(item);}}><Headphones size={16}/>{playing===item.id?'Preparando…':'Escuchar'}</button>
     <button className="button primary small" type="button" disabled={!downloadAllowed||playing!==null||downloading!==null} onClick={()=>{void downloadMp3(item);}}><Download size={16}/>{downloading===item.id?'Convirtiendo MP3…':'Descargar MP3'}</button>
    </div>)}</div>}
   </>}
  {notice&&<p className="account-error" role="alert">{notice}</p>}
 </section>;
}
