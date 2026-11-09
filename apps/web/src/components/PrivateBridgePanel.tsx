'use client';

import {useEffect,useMemo,useRef,useState,type FormEvent} from 'react';
import {Download,Headphones,ShieldCheck,ExternalLink,Radio,Search,Square} from 'lucide-react';
import {downloadLocalAudioBlob} from '../lib/local-audio-download';
import type {Track} from '../lib/catalog';
import {BRIDGE_ENABLED,BRIDGE_URL,bridgeEntries,bridgeVideos,isPlayableExternalUrl,parseYouTubeUrl,type BridgeVideo} from '../lib/private-bridge';

const STORAGE='nebula:private-bridge-session-token';
const BATCH_SIZE=10;
const MAX_MP3_BYTES=100*1024*1024;
const TICKET=/^[A-Za-z0-9_-]{20,300}\.[A-Za-z0-9_-]{30,80}$/;
type EntryState='ready'|'working'|'done'|'failed';

function mp3Filename(item:BridgeVideo){
 return (item.title.normalize('NFKD').replace(/[^a-zA-Z0-9 ._-]/g,'').trim().slice(0,100)||item.id)+'.mp3';
}
function durationLabel(seconds:number|null){
 if(seconds===null)return '--:--';
 const total=Math.floor(seconds);
 return Math.floor(total/60)+':'+String(total%60).padStart(2,'0');
}
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
 const [downloadAllowed,setDownloadAllowed]=useState(false);
 const [directUrl,setDirectUrl]=useState('');
 const [savingToLibrary,setSavingToLibrary]=useState(true);
 const [savingFileCopy,setSavingFileCopy]=useState(true);
 const [items,setItems]=useState<BridgeVideo[]>([]);
 const [selected,setSelected]=useState<string[]>([]);
 const [states,setStates]=useState<Record<string,EntryState>>({});
 const [truncated,setTruncated]=useState(false);
 const [resolving,setResolving]=useState(false);
 const [queue,setQueue]=useState(false);
 const [progress,setProgress]=useState('');
 const [notice,setNotice]=useState('');
 const [refresh,setRefresh]=useState(0);
 const requestRef=useRef<AbortController|null>(null);
 const queueAbortRef=useRef<AbortController|null>(null);
 const cancelRef=useRef(false);
 const panelRef=useRef<HTMLElement|null>(null);
 const selectedSet=useMemo(()=>new Set(selected),[selected]);
 const doneCount=useMemo(()=>selected.filter(id=>states[id]==='done').length,[selected,states]);
 useEffect(()=>{
  if(!incomingUrl)return;
  const target=parseYouTubeUrl(incomingUrl);
  if(!target)return;
  setDirectUrl(target.canonicalUrl);
  window.requestAnimationFrame(()=>panelRef.current?.scrollIntoView({behavior:'smooth',block:'start'}));
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
  setItems([]);setSelected([]);setStates({});setTruncated(false);
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
   }).then(data=>{
    if(controller.signal.aborted)return;
    const found=bridgeVideos(data);
    setItems(found);setSelected(found.map(item=>item.id));
   }).catch(e=>{if(!controller.signal.aborted){setItems([]);setNotice(e instanceof Error?e.message:'No se pudo buscar.');}})
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
 function applyList(found:BridgeVideo[],cut:boolean,origin:string){
  setItems(found);setSelected(found.map(item=>item.id));setStates({});setTruncated(cut);
  setNotice(found.length?origin:origin+' No devolvió pistas descargables.');
 }
 async function resolveList(event:FormEvent<HTMLFormElement>){
  event.preventDefault();
  if(resolving||queue)return;
  const target=parseYouTubeUrl(directUrl.trim());
  if(!target){setNotice('Pega un enlace HTTPS de YouTube: video, playlist o mix.');return;}
  setResolving(true);setNotice('');
  const controller=new AbortController();
  requestRef.current?.abort();
  requestRef.current=controller;
  try{
   const response=await fetch(BRIDGE_URL+'/resolve?url='+encodeURIComponent(target.canonicalUrl),{
    headers:{Authorization:'Bearer '+token},cache:'no-store',redirect:'error',signal:controller.signal,
   });
   if(response.status===401)throw Error('Token local inválido. Empareja de nuevo el puente.');
   if(response.status===400)throw Error('El enlace no contiene un video ni una playlist de YouTube compatible.');
   if(response.status===429)throw Error('Demasiadas peticiones al puente. Espera un momento.');
   if(!response.ok)throw Error('El puente no pudo leer la lista. Comprueba que yt-dlp funciona.');
   const parsed=bridgeEntries(await response.json());
   applyList(parsed.items,parsed.truncated,target.kind==='playlist'?'Playlist cargada.':'Video cargado.');
  }catch(e){
   if(!controller.signal.aborted)setNotice(e instanceof Error?e.message:'No se pudo leer el enlace.');
  }finally{
   setResolving(false);
   if(requestRef.current===controller)requestRef.current=null;
  }
 }
 function toggleSelected(id:string){
  setSelected(current=>current.includes(id)?current.filter(item=>item!==id):[...current,id]);
 }
 function selectNextBatch(){
  const pending=items.filter(item=>!selectedSet.has(item.id)).slice(0,BATCH_SIZE);
  if(!pending.length){setNotice('Todas las pistas ya están seleccionadas.');return;}
  setSelected(current=>[...current,...pending.map(item=>item.id)]);
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
   onPlay({id:'remote-localbridge-'+item.id,title:item.title,artist:item.artist,
    album:'Puente musical privado',genre:'Personal',
    cover:'/art/orbita.svg',duration:durationLabel(item.durationSeconds),audioUrl,source:'external',
   });
  }catch(e){setNotice(e instanceof Error?e.message:'No se pudo preparar el audio.');}
  finally{setPlaying(null);}
 }
 async function fetchMp3(item:BridgeVideo,signal:AbortSignal):Promise<File>{
  const ticketResponse=await fetch(BRIDGE_URL+'/ticket',{
   method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
   body:JSON.stringify({id:item.id}),cache:'no-store',redirect:'error',signal,
  });
  if(!ticketResponse.ok)throw Error(ticketResponse.status===401?'Token local inválido.':'No se pudo autorizar la conversión MP3.');
  const payload=await ticketResponse.json() as {ticket?:unknown};
  if(typeof payload.ticket!=='string'||!TICKET.test(payload.ticket))throw Error('Ticket de descarga inválido.');
  const response=await fetch(BRIDGE_URL+'/download?ticket='+encodeURIComponent(payload.ticket),{
   cache:'no-store',redirect:'error',credentials:'omit',signal,
  });
  if(!response.ok||response.headers.get('content-type')?.split(';')[0]!=='audio/mpeg')throw Error('El puente no entregó un archivo MP3 válido.');
  if(!response.body)throw Error('No se recibió audio del puente.');
  const chunks:Uint8Array[]=[];let bytes=0;
  const reader=response.body.getReader();
  while(true){const {done,value}=await reader.read();if(done)break;
   bytes+=value.byteLength;
   if(bytes>MAX_MP3_BYTES){await reader.cancel();throw Error('El MP3 supera el límite de 100 MB.');}
   chunks.push(value);
  }
  if(bytes<128)throw Error('La descarga de audio terminó vacía.');
  const file=new File(chunks.map(chunk=>new Uint8Array(chunk) as BlobPart),mp3Filename(item),{type:'audio/mpeg'});
  const header=new Uint8Array(await file.slice(0,3).arrayBuffer());
  if(!((header[0]===73&&header[1]===68&&header[2]===51)||(header[0]===255&&(header[1]&0xe0)===0xe0)))throw Error('La fuente no produjo un MP3 reconocible.');
  return file;
 }
 function deliver(file:File){
  if(savingToLibrary)onImport([file]);
  if(savingFileCopy)downloadLocalAudioBlob(file,file.name);
 }
 function flushLibrary(files:File[]){
  if(!savingToLibrary||!files.length)return;
  onImport(files.splice(0,files.length));
 }
 async function downloadOne(item:BridgeVideo){
  if(queue||playing!==null)return;
  if(!downloadAllowed){setNotice('Confirma que tienes permiso para guardar este contenido.');return;}
  if(!savingToLibrary&&!savingFileCopy){setNotice('Elige al menos un destino para el MP3.');return;}
  const controller=new AbortController();
  requestRef.current?.abort();
  requestRef.current=controller;
  setStates(current=>({...current,[item.id]:'working'}));
  setNotice('Convirtiendo a MP3 en la mejor calidad disponible…');
  try{
   const file=await fetchMp3(item,controller.signal);
   if(controller.signal.aborted)return;
   deliver(file);
   setStates(current=>({...current,[item.id]:'done'}));
   setNotice('MP3 listo: '+file.name);
  }catch(e){
   if(controller.signal.aborted)return;
   setStates(current=>({...current,[item.id]:'failed'}));
   setNotice(e instanceof Error?e.message:'No se pudo generar el MP3.');
  }finally{if(requestRef.current===controller)requestRef.current=null;}
 }
 async function runQueue(){
  if(queue)return;
  if(!downloadAllowed){setNotice('Confirma que tienes permiso para guardar este contenido.');return;}
  if(!savingToLibrary&&!savingFileCopy){setNotice('Elige al menos un destino para el MP3.');return;}
  const pending=items.filter(item=>selectedSet.has(item.id)&&states[item.id]!=='done');
  if(!pending.length){setNotice('Selecciona al menos una pista para descargar.');return;}
  cancelRef.current=false;setQueue(true);setNotice('');
  const lots=Math.ceil(pending.length/BATCH_SIZE);
  let ok=0;let failed=0;let stopped=false;
  const collected:File[]=[];
  for(let index=0;index<pending.length;index++){
   if(cancelRef.current){stopped=true;break;}
   const item=pending[index];
   const controller=new AbortController();
   queueAbortRef.current=controller;
   setStates(current=>({...current,[item.id]:'working'}));
   setProgress('Descargando '+(index+1)+' de '+pending.length+' · Lote '+(Math.floor(index/BATCH_SIZE)+1)+' de '+lots);
   try{
    const file=await fetchMp3(item,controller.signal);
    if(cancelRef.current){stopped=true;setStates(current=>({...current,[item.id]:'ready'}));break;}
    collected.push(file);
    if(savingFileCopy)downloadLocalAudioBlob(file,file.name);
    if(collected.length>=BATCH_SIZE)flushLibrary(collected);
    setStates(current=>({...current,[item.id]:'done'}));
    ok++;
   }catch(e){
    if(cancelRef.current){stopped=true;setStates(current=>({...current,[item.id]:'ready'}));break;}
    setStates(current=>({...current,[item.id]:'failed'}));
    failed++;
    setNotice(e instanceof Error?'Último error: '+e.message:'Hubo pistas que no se pudieron convertir.');
   }
  }
  queueAbortRef.current=null;
  flushLibrary(collected);
  setQueue(false);setProgress('');
  setNotice('Descargas terminadas: '+ok+' listas, '+failed+' fallidas.'+(stopped?' Cola detenida.':''));
 }
 function stopQueue(){
  cancelRef.current=true;
  queueAbortRef.current?.abort();
 }
 function searchNow(e:FormEvent<HTMLFormElement>){e.preventDefault();if(query.length>=2)setRefresh(i=>i+1);}
 const busy=playing!==null||queue;
 return <section ref={panelRef} className="content-section private-bridge" aria-label="Reproductor local privado">
  <div className="section-heading"><h2><Radio size={19}/> Reproducción privada local</h2></div>
  <p className="page-description">Puente opcional de tu propio ordenador, sin clave de Google. Pega un enlace de YouTube para ver sus pistas, reproducirlas, marcarlas una a una o en lotes y descargarlas en MP3 con la mejor calidad que ofrezca la fuente.</p>
  {!online?<p className="search-source-hint">No se detecta el puente en este dispositivo. Ejecuta <code>npm run bridge:dev</code> en tu ordenador y abre NÉBULA allí.</p>:
   !engine?<p className="search-source-hint" role="status">Puente detectado, pero el adaptador yt-dlp está deshabilitado. Actívalo solamente para contenidos a los que tengas derecho de acceso.</p>:
   !token?<form className="playlist-create glass" onSubmit={pair}>
    <ShieldCheck size={18}/>
    <label className="sr-only" htmlFor="private-bridge-token">Token de emparejamiento local</label>
    <input id="private-bridge-token" type="password" autoComplete="off" value={inputToken} onChange={e=>setInputToken(e.target.value)} placeholder="Pega aquí el token que imprime el puente"/>
    <button type="submit" className="button primary small" disabled={inputToken.trim().length<32}>Conectar</button>
   </form>:
   <>
    <div className="chip-row"><span className="chip active"><ShieldCheck size={14}/> Equipo local conectado</span><button type="button" className="chip" onClick={()=>{try{sessionStorage.removeItem(STORAGE);}catch{}setToken('');setItems([]);setSelected([]);setStates({});setTruncated(false);}}>Desvincular</button></div>
    {standalone&&<form className="explore-form glass" role="search" onSubmit={searchNow}><Search size={17}/><label htmlFor="bridge-search" className="sr-only">Buscar canción en puente privado</label><input id="bridge-search" value={typed} maxLength={100} onChange={e=>setTyped(e.target.value)} placeholder="Busca un título o artista"/>
     <button className="button primary small" disabled={query.length<2||loading}>Buscar</button></form>}
    <form className="playlist-create glass" onSubmit={resolveList}>
      <label className="sr-only" htmlFor="nebula-direct-youtube-url">Enlace de YouTube: video, playlist o mix</label>
      <input id="nebula-direct-youtube-url" type="url" placeholder="https://www.youtube.com/watch?v=… o /playlist?list=…" value={directUrl} onChange={e=>setDirectUrl(e.target.value)}/>
      <button className="button secondary small" type="submit" disabled={!directUrl.trim()||resolving||queue}>{resolving?'Leyendo lista…':'Ver lista de pistas'}</button>
    </form>
    <label className="authorized-web-confirm"><input type="checkbox" checked={downloadAllowed} onChange={e=>setDownloadAllowed(e.target.checked)}/> Confirmo que tengo derecho a descargar y guardar este audio.</label>
    <fieldset className="bridge-destinations">
     <legend>Destino de cada MP3</legend>
     <label><input type="checkbox" checked={savingToLibrary} onChange={e=>setSavingToLibrary(e.target.checked)}/> Guardar en mi Biblioteca automáticamente</label>
     <label><input type="checkbox" checked={savingFileCopy} onChange={e=>setSavingFileCopy(e.target.checked)}/> Descargar también una copia de archivo</label>
    </fieldset>
    <p className="disclosure">La descarga se realiza en tu propio equipo con yt-dlp y FFmpeg, sin enviar el MP3 a NÉBULA. No admite videos protegidos, privados ni fuentes bloqueadas.</p>
    {loading&&<p className="disclosure" role="status">Buscando pistas en tu puente privado…</p>}
    {items.length>0&&<div className="bridge-queue glass" role="region" aria-label="Lista de descargas">
     <div className="bridge-queue-head">
      <span className="bridge-queue-count" role="status">{items.length} pistas · {selected.length} seleccionadas · {doneCount} listas</span>
      <div className="bridge-queue-actions">
       <button type="button" className="chip" disabled={queue} onClick={()=>setSelected(items.map(item=>item.id))}>Seleccionar todo</button>
       <button type="button" className="chip" disabled={queue} onClick={()=>setSelected([])}>Ninguna</button>
       <button type="button" className="chip" disabled={queue} onClick={selectNextBatch}>+{BATCH_SIZE} siguientes</button>
      </div>
     </div>
     {truncated&&<p className="search-source-hint">La lista es larga: el puente muestra las primeras {items.length} pistas. Vuelve a abrir el enlace para revisar el resto.</p>}
     <div className="track-list">{items.map(item=>{
       const state=states[item.id]??'ready';
       return <div className={'track-row bridge-track'+(selectedSet.has(item.id)?' picked':'')} key={item.id}>
        <input className="bridge-select" type="checkbox" checked={selectedSet.has(item.id)} disabled={queue} aria-label={'Seleccionar '+item.title} onChange={()=>toggleSelected(item.id)}/>
        <span className="track-descriptor"><strong>{item.title}</strong><small>{item.artist} · {durationLabel(item.durationSeconds)} · fuente local</small></span>
        <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" aria-label={'Abrir fuente de '+item.title}><ExternalLink size={15}/></a>
        <span className="bridge-track-actions">
         <button className="button secondary small" type="button" disabled={busy} aria-label={'Escuchar '+item.title} onClick={()=>{void play(item);}}><Headphones size={16}/>{playing===item.id?'Preparando…':'Escuchar'}</button>
         <button className="button primary small" type="button" disabled={!downloadAllowed||busy} aria-label={'Descargar MP3 de '+item.title} onClick={()=>{void downloadOne(item);}}><Download size={16}/>{state==='working'?'Convirtiendo…':'MP3'}</button>
        </span>
        <span className={'bridge-state '+state}>{state==='done'?'Lista':state==='failed'?'Fallida':state==='working'?'Trabajando':'Pendiente'}</span>
       </div>;
      })}</div>
     <div className="bridge-queue-footer">
      <button className="button primary" type="button" disabled={!downloadAllowed||queue||selected.length===0} onClick={()=>{void runQueue();}}><Download size={16}/> Poner en cola {selected.length} descargas MP3</button>
      {queue&&<button className="button danger small" type="button" onClick={stopQueue}><Square size={15}/> Detener cola</button>}
      {progress&&<p className="disclosure" role="status">{progress}</p>}
     </div>
    </div>}
   </>}
  {notice&&<p className="account-error" role="alert">{notice}</p>}
 </section>;
}
