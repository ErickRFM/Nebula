'use client';
import {useCallback, useEffect, useState} from 'react';
import type {AccountApi} from '../hooks/useAccount';
import type {Track} from '../lib/catalog';

type Item = {id:string; cloudTrackId:string|null; externalItemId:string|null};
type Cloud = {id:string;title:string;artist:string;album?:string;genre?:string};
type External = {id:string;title:string;artist:string;sourceUrl:string};
export function AccountPlaylistTracks({account,playlistId,onPlay}:{
 account:AccountApi; playlistId:string; onPlay:(track:Track)=>void;
}) {
 const [items,setItems]=useState<Item[]>([]);
 const [cloud,setCloud]=useState<Cloud[]>([]);
 const [external,setExternal]=useState<External[]>([]);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const getItems=account.getAccountPlaylistItems;
 const request=account.cloudRequest;
 const reload=useCallback(async()=>{
   const [references,cloudList,externalList]=await Promise.all([
     getItems(playlistId),
     request<{items:Cloud[]}>('/v1/library/cloud'),
     request<{items:External[]}>('/v1/library/external'),
   ]);
   setItems(references.items);
   setCloud(cloudList.items);
   setExternal(externalList.items);
 },[playlistId,getItems,request]);
 useEffect(()=>{
   let active=true;
   setBusy(true);setError('');
   void Promise.all([getItems(playlistId),request<{items:Cloud[]}>('/v1/library/cloud'),
     request<{items:External[]}>('/v1/library/external')])
     .then(([references,cloudList,externalList])=>{
       if(!active)return;
       setItems(references.items);setCloud(cloudList.items);setExternal(externalList.items);
     })
     .catch((err:unknown)=>{if(active)setError(err instanceof Error?err.message:'No se pudo abrir la playlist.');})
     .finally(()=>{if(active)setBusy(false);});
   return ()=>{active=false;};
 },[playlistId,getItems,request]);
 async function remove(id:string){
   setBusy(true);setError('');
   try {
     await request('/v1/playlists/'+encodeURIComponent(playlistId)+'/items/'+encodeURIComponent(id),{method:'DELETE'});
     await reload();
   } catch(err){setError(err instanceof Error?err.message:'No se pudo quitar la canción.');}
   finally{setBusy(false);}
 }
 async function play(item:Cloud){
   setError('');
   try{
     const result=await request<{url:string;expiresInSeconds:number}>('/v1/library/cloud/'+encodeURIComponent(item.id)+'/play');
     onPlay({id:'cloud-'+item.id,title:item.title,artist:item.artist,album:item.album||'NÉBULA Cloud',
       cover:'/art/orbita.svg',genre:item.genre||'Mi música',duration:'--:--',audioUrl:result.url,source:'external',
       signedAudioExpiresInSeconds:result.expiresInSeconds,
       renewAudioUrl:()=>request<{url:string;expiresInSeconds:number}>('/v1/library/cloud/'+encodeURIComponent(item.id)+'/play')});
   }catch(err){setError(err instanceof Error?err.message:'No se pudo reproducir la canción.');}
 }
 return <section className="content-section" aria-label="Canciones de playlist de cuenta">
   {busy && <p role="status" className="disclosure">Sincronizando canciones…</p>}
   {error && <p role="alert" className="account-error">{error}</p>}
   {!busy && items.length===0 && <p className="empty-note">Esta playlist todavía no contiene canciones. Agrégalas desde Mi música en la nube.</p>}
   <div className="track-list glass">{items.map(item=>{
     const local=item.cloudTrackId?cloud.find(t=>t.id===item.cloudTrackId):null;
     const reference=item.externalItemId?external.find(t=>t.id===item.externalItemId):null;
     const name=local?.title??reference?.title??'Referencia no disponible';
     return <div className="track-row" key={item.id}>
       <span className="track-descriptor"><strong>{name}</strong><small>{local?.artist??reference?.artist??'Origen eliminado'} · {local?'Mi nube':reference?'Fuente externa':'No disponible'}</small></span>
       {local && <button type="button" className="button small" disabled={busy} onClick={()=>{void play(local);}}>Reproducir</button>}
       {reference && <a className="button small" href={reference.sourceUrl} target="_blank" rel="noopener noreferrer">Abrir fuente</a>}
       <button type="button" className="icon-button" disabled={busy} aria-label={'Quitar '+name+' de la playlist'} onClick={()=>{void remove(item.id);}}>Quitar</button>
     </div>;
   })}</div>
 </section>;
}
