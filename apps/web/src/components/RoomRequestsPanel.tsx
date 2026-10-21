'use client';
import { useCallback, useEffect, useState } from 'react';
import type { AccountApi } from '../hooks/useAccount';

type Suggestion={id:string;userId:string;title:string;artist:string;votes:number;votedByMe:boolean};

export function RoomRequestsPanel({roomId,hostId,account}:{roomId:string;hostId:string;account:AccountApi}) {
 const [items,setItems]=useState<Suggestion[]>([]);
 const [title,setTitle]=useState('');
 const [artist,setArtist]=useState('');
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const refresh=useCallback(async()=>{
  try{
   const result=await account.cloudRequest<{items:Suggestion[]}>('/v1/rooms/'+roomId+'/requests');
   setItems(result.items);
  }catch{ /* Keep the latest confirmed roster on transient API errors. */ }
 },[roomId,account.cloudRequest]);
 useEffect(()=>{
  void refresh();
  const timer=window.setInterval(()=>{if(document.visibilityState==='visible')void refresh();},10000);
  return()=>window.clearInterval(timer);
 },[refresh]);
 async function act(action:()=>Promise<unknown>,onSuccess?:()=>void){
  if(busy)return;setBusy(true);setError('');
  try{await action();onSuccess?.();await refresh();}
  catch(cause){setError(cause instanceof Error?cause.message:'No se pudo actualizar la propuesta.');}
  finally{setBusy(false);}
 }
 const mine=account.user?.id;
 return <section className="content-section">
  <div className="section-heading"><h2>DJ colaborativo</h2><span>{items.length} propuestas</span></div>
  <div className="room-card glass">
   <p>Propón una canción. El anfitrión decidirá qué archivo autorizado reproducir; las sugerencias no comparten bibliotecas privadas.</p>
   <label htmlFor="request-title">Canción</label>
   <input id="request-title" value={title} maxLength={120} onChange={e=>setTitle(e.target.value)} placeholder="Nombre de la canción"/>
   <label htmlFor="request-artist">Artista</label>
   <input id="request-artist" value={artist} maxLength={120} onChange={e=>setArtist(e.target.value)} placeholder="Artista"/>
   <button type="button" className="button small" disabled={busy||!title.trim()||!artist.trim()}
    onClick={()=>{void act(()=>account.cloudRequest('/v1/rooms/'+roomId+'/requests',{method:'POST',body:JSON.stringify({title,artist})}),
      ()=>{setTitle('');setArtist('');});}}>Enviar propuesta</button>
  </div>
  <div className="track-list glass">
   {!items.length&&<p className="empty-note">Todavía no hay propuestas.</p>}
   {items.map(item=><div key={item.id} className="track-row">
    <span className="track-descriptor"><strong>{item.title}</strong><small>{item.artist} · {item.votes} voto(s)</small></span>
    <button className="button small" type="button" disabled={busy||item.votedByMe}
     onClick={()=>{void act(()=>account.cloudRequest('/v1/rooms/'+roomId+'/requests/'+item.id+'/vote',{method:'POST'}));}}>
      {item.votedByMe?'Votado':'Votar'}
    </button>
    {(item.userId===mine||hostId===mine)&&<button className="button small" type="button" disabled={busy}
      onClick={()=>{void act(()=>account.cloudRequest('/v1/rooms/'+roomId+'/requests/'+item.id,{method:'DELETE'}));}}>Quitar</button>}
   </div>)}
  </div>
  {error&&<p role="alert" className="account-error">{error}</p>}
 </section>;
}
