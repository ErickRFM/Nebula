'use client';
import {useEffect,useMemo,useState,type FormEvent} from 'react';
import {FolderDown,ListMusic,RefreshCw,X} from 'lucide-react';
import {BRIDGE_URL} from '../lib/private-bridge';

type Item={id:string;title:string;artist:string;durationSeconds:number|null};
type Preview={listId:string;title:string;items:Item[];total:number;truncated:boolean};
type Job={id:string;total:number;completed:number;saved:number;failed:number;
 status:'running'|'completed'|'cancelled'|'error';current:string|null;
 errorItems:string[];destination:string;note:string};
const LIST_ID=/^[A-Za-z0-9_-]{10,90}$/;

export function youtubePlaylistId(value:string):string|null {
 try{
  const url=new URL(value.trim());
  if(url.protocol!=='https:'||url.username||url.password)return null;
  if(!['youtube.com','www.youtube.com','m.youtube.com','music.youtube.com','youtu.be'].includes(url.hostname.toLowerCase()))return null;
  if(url.hostname.toLowerCase()!=='youtu.be'&&!['/playlist','/watch'].includes(url.pathname))return null;
  const id=url.searchParams.get('list');
  if(!id||!LIST_ID.test(id)||id.startsWith('RD'))return null;
  return id;
 }catch{return null;}
}
export function PlaylistBatchPanel({token,authorized,incomingUrl=''}:{
 token:string;authorized:boolean;incomingUrl?:string;
}){
 const [link,setLink]=useState('');
 const [loading,setLoading]=useState(false);
 const [preview,setPreview]=useState<Preview|null>(null);
 const [selected,setSelected]=useState<Set<string>>(()=>new Set());
 const [filter,setFilter]=useState('');
 const [visible,setVisible]=useState(40);
 const [job,setJob]=useState<Job|null>(null);
 const [error,setError]=useState('');
 const [working,setWorking]=useState(false);
 useEffect(()=>{
  if(youtubePlaylistId(incomingUrl))setLink(incomingUrl);
 },[incomingUrl]);
 const filtered=useMemo(()=>preview?.items.filter(item=>
  (item.title+' '+item.artist).toLocaleLowerCase().includes(filter.toLocaleLowerCase()))??[],
  [preview,filter]);
 const shown=filtered.slice(0,visible);
 useEffect(()=>{
  if(!job||job.status!=='running')return;
  let cancelled=false;
  const update=async()=>{
   try{
    const response=await fetch(BRIDGE_URL+'/batch/'+encodeURIComponent(job.id),{
     headers:{Authorization:'Bearer '+token},cache:'no-store',redirect:'error'});
    if(!response.ok)throw Error('No se pudo consultar el progreso del lote.');
    const data=await response.json() as {job:Job};
    if(!cancelled)setJob(data.job);
   }catch{if(!cancelled)setError('No se pudo consultar el avance; el proceso puede seguir en tu computadora.');}
  };
  const timer=window.setInterval(()=>{void update();},1600);
  return()=>{cancelled=true;window.clearInterval(timer);};
 },[job?.id,job?.status,token]);
 async function inspect(event:FormEvent<HTMLFormElement>){
  event.preventDefault();
  const id=youtubePlaylistId(link);
  if(!id){setError('Pega una URL HTTPS de playlist fija de YouTube. Las radios dinámicas no son listas de 1,000 pistas.');return;}
  setLoading(true);setError('');setPreview(null);setSelected(new Set());setFilter('');setVisible(40);
  try{
   const response=await fetch(BRIDGE_URL+'/playlist?list='+encodeURIComponent(id),{
    headers:{Authorization:'Bearer '+token},cache:'no-store',redirect:'error'});
   if(!response.ok)throw Error(response.status===429?'Se alcanzó el límite de análisis. Reintenta más tarde.':
    'No se pudo analizar esta lista; verifica que sea pública o accesible sin cookies.');
   const data=await response.json() as Preview;
   if(!Array.isArray(data.items)||!data.items.length)throw Error('No hay pistas disponibles en esta playlist.');
   setPreview(data);setSelected(new Set(data.items.map(item=>item.id)));
  }catch(e){setError(e instanceof Error?e.message:'Error al analizar la lista.');}
  finally{setLoading(false);}
 }
 async function start(){
  if(!preview||!authorized||!selected.size||working)return;
  const count=selected.size;
  if(!window.confirm('¿Descargar '+count+' MP3 en el equipo que ejecuta el puente? Puede requerir bastante tiempo y espacio en disco.'))return;
  setWorking(true);setError('');
  try{
   const ids=preview.items.filter(item=>selected.has(item.id)).map(item=>item.id);
   const response=await fetch(BRIDGE_URL+'/batch',{
    method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
    body:JSON.stringify({listId:preview.listId,ids}),cache:'no-store',redirect:'error'});
   if(!response.ok)throw Error(response.status===409?'Ya se está procesando otro lote.':
    response.status===410?'La vista previa caducó. Analiza la playlist nuevamente.':
    'No se pudo iniciar la descarga. Verifica tu puente local.');
   const data=await response.json() as {job:Job};
   setJob(data.job);
  }catch(e){setError(e instanceof Error?e.message:'No se pudo iniciar el lote.');}
  finally{setWorking(false);}
 }
 async function cancel(){
  if(!job||job.status!=='running')return;
  setWorking(true);setError('');
  try{
   const response=await fetch(BRIDGE_URL+'/batch/'+encodeURIComponent(job.id)+'/cancel',{
    method:'POST',headers:{Authorization:'Bearer '+token},cache:'no-store',redirect:'error'});
   if(!response.ok)throw Error('No se pudo cancelar el lote.');
   const data=await response.json() as {job:Job};
   setJob(data.job);
  }catch(e){setError(e instanceof Error?e.message:'No se pudo cancelar.');}
  finally{setWorking(false);}
 }
 function toggle(id:string,checked:boolean){
  setSelected(prev=>{const next=new Set(prev);checked?next.add(id):next.delete(id);return next;});
 }
 return <section className="playlist-batch glass" aria-label="Descarga de playlists completas">
   <div className="section-heading"><h3><ListMusic size={19}/> Descargar una playlist completa</h3></div>
   <p className="disclosure">Pega una playlist fija de YouTube y analiza hasta 1,000 canciones. Selecciona las que quieras guardar; NÉBULA convierte los archivos uno a uno directamente en tu computadora mediante el puente local.</p>
   <form className="playlist-create" onSubmit={e=>{void inspect(e);}}>
    <label className="sr-only" htmlFor="nebula-playlist-batch-link">URL de playlist de YouTube</label>
    <input id="nebula-playlist-batch-link" type="url" required
      placeholder="https://www.youtube.com/playlist?list=PL..."
      value={link} onChange={e=>setLink(e.target.value)}/>
    <button type="submit" className="button primary small" disabled={loading||job?.status==='running'}>
      <RefreshCw size={16}/>{loading?'Analizando…':'Cargar canciones'}
    </button>
   </form>
   {preview&&<div className="batch-results">
    <div className="batch-controls">
     <div><strong>{preview.title}</strong><p>{preview.total} pistas cargadas{preview.truncated?' · límite de 1,000 alcanzado':''} · {selected.size} seleccionadas</p></div>
     <div className="batch-actions">
      <button className="button secondary small" type="button" onClick={()=>setSelected(new Set(preview.items.map(x=>x.id)))}>Seleccionar todas</button>
      <button className="button secondary small" type="button" onClick={()=>setSelected(new Set())}>Quitar selección</button>
     </div>
    </div>
    <label htmlFor="playlist-filter">Filtrar canciones</label>
    <input id="playlist-filter" type="search" value={filter}
      onChange={e=>{setFilter(e.target.value);setVisible(40);}} placeholder="Busca dentro de las canciones cargadas"/>
    <div className="batch-tracks" role="group" aria-label="Pistas de la playlist">
     {shown.map((item,index)=><label key={item.id} className="batch-track">
      <input type="checkbox" checked={selected.has(item.id)}
       onChange={e=>toggle(item.id,e.target.checked)}/>
      <span><strong>{item.title}</strong><small>{item.artist}{item.durationSeconds!==null?' · '+Math.floor(item.durationSeconds/60)+':'+String(item.durationSeconds%60).padStart(2,'0'):''}</small></span>
      <small>{index+1}</small>
     </label>)}
     {!shown.length&&<p className="empty-note">No hay coincidencias con ese filtro.</p>}
    </div>
    {visible<filtered.length&&<button type="button" className="button secondary small" onClick={()=>setVisible(x=>x+40)}>
      Ver 40 más ({filtered.length-visible} pendientes de mostrar)
    </button>}
    <button className="button primary" type="button" disabled={!authorized||!selected.size||working||job?.status==='running'} onClick={()=>{void start();}}>
     <FolderDown size={17}/> Descargar {selected.size} MP3 seleccionados
    </button>
    {!authorized&&<p className="disclosure">Confirma que tienes autorización para descargar estas pistas antes de iniciar el lote.</p>}
   </div>}
   {job&&<div className="batch-progress" aria-live="polite">
    <div className="batch-progress-heading"><strong>{job.status==='running'?'Descargando canciones…':job.status==='completed'?'Lote completado':job.status==='cancelled'?'Lote cancelado':'Lote interrumpido'}</strong>
      <span>{job.completed} / {job.total}</span></div>
    <progress max={Math.max(job.total,1)} value={job.completed} aria-label="Progreso de descarga de playlist"/>
    <p>{job.saved} procesadas correctamente · {job.failed} errores · Carpeta: {job.destination}</p>
    {job.current&&<p className="disclosure">Video actual: {job.current}</p>}
    {job.errorItems.length>0&&<p className="disclosure">Pistas con errores: {job.errorItems.slice(0,10).join(', ')}{job.errorItems.length>10?'…':''}</p>}
    {job.status==='running'&&<button className="button secondary small" type="button" disabled={working} onClick={()=>{void cancel();}}><X size={15}/> Detener lote</button>}
    <p className="disclosure">Los MP3 se guardan en el equipo que ejecuta el puente; no se suben automáticamente a R2. Puedes cerrar esta pestaña, pero debes mantener el puente abierto.</p>
   </div>}
   {error&&<p className="account-error" role="alert">{error}</p>}
 </section>;
}
