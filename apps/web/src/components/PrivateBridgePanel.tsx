'use client';

import {useEffect,useRef,useState,type FormEvent} from 'react';
import {Headphones,ShieldCheck,ExternalLink,Radio,Search} from 'lucide-react';
import type {Track} from '../lib/catalog';
import {BRIDGE_ENABLED,BRIDGE_URL,bridgeVideos,isPlayableExternalUrl,type BridgeVideo} from '../lib/private-bridge';

const STORAGE='nebula:private-bridge-session-token';
export function PrivateBridgePanel({initialQuery='',standalone=false,onPlay}:{
 initialQuery?:string;standalone?:boolean;onPlay:(track:Track)=>void;
}){
 const [token,setToken]=useState('');
 const [inputToken,setInputToken]=useState('');
 const [typed,setTyped]=useState('');
 const [online,setOnline]=useState(false);
 const [engine,setEngine]=useState(false);
 const [loading,setLoading]=useState(false);
 const [playing,setPlaying]=useState<string|null>(null);
 const [items,setItems]=useState<BridgeVideo[]>([]);
 const [notice,setNotice]=useState('');
 const [refresh,setRefresh]=useState(0);
 const requestRef=useRef<AbortController|null>(null);
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
 function searchNow(e:FormEvent<HTMLFormElement>){e.preventDefault();if(query.length>=2)setRefresh(i=>i+1);}
 return <section className="content-section private-bridge" aria-label="Reproductor local privado">
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
    {loading&&<p className="disclosure" role="status">Buscando pistas en tu puente privado…</p>}
    {items.length>0&&<div className="track-list glass">{items.map(item=><div className="track-row" key={item.id}>
     <span className="track-descriptor"><strong>{item.title}</strong><small>{item.artist} · fuente local</small></span>
     <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" aria-label={'Abrir fuente de '+item.title}><ExternalLink size={15}/></a>
     <button className="button secondary small" type="button" disabled={playing!==null} onClick={()=>{void play(item);}}><Headphones size={16}/>{playing===item.id?'Preparando…':'Escuchar'}</button>
    </div>)}</div>}
   </>}
  {notice&&<p className="account-error" role="alert">{notice}</p>}
 </section>;
}
