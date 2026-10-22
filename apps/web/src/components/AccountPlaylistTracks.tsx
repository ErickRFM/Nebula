'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import type {AccountApi,AccountPlaylistItem} from '../hooks/useAccount';
import type {Track} from '../lib/catalog';

export function AccountPlaylistTracks({account,playlistId,onPlay}:{
 account:AccountApi;playlistId:string;onPlay:(track:Track)=>void;
}){
 const [items,setItems]=useState<AccountPlaylistItem[]>([]);
 const [nextCursor,setNextCursor]=useState<string|null>(null);
 const [loadingMore,setLoadingMore]=useState(false);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const generation=useRef(0);
 const getItems=account.getAccountPlaylistItems;
 const request=account.cloudRequest;
 const load=useCallback(async()=>{
   const active=++generation.current;
   setBusy(true);setError('');setItems([]);setNextCursor(null);
   try{
     // The endpoint joins owner-scoped metadata for the referenced items.
     // A playlist must not depend on the first 500 cloud library tracks.
     const response=await getItems(playlistId,{limit:50});
     if(active===generation.current){setItems(response.items);setNextCursor(response.nextCursor);}
   }catch(cause){
     if(active===generation.current)
       setError(cause instanceof Error?cause.message:'No se pudo abrir la playlist.');
   }finally{
     if(active===generation.current)setBusy(false);
   }
 },[playlistId,getItems]);
 useEffect(()=>{void load();return()=>{generation.current++;};},[load]);
 async function loadMore(){
   if(!nextCursor||busy||loadingMore)return;
   const active=generation.current;
   const expectedCursor=nextCursor;
   setLoadingMore(true);setError('');
   try{
     const page=await getItems(playlistId,{limit:50,cursor:expectedCursor});
     if(active!==generation.current)return;
     setItems(existing=>{
       const seen=new Set(existing.map(item=>item.id));
       return [...existing,...page.items.filter(item=>!seen.has(item.id))];
     });
     setNextCursor(page.nextCursor);
   }catch(cause){
     if(active===generation.current)
       setError(cause instanceof Error?cause.message:'No se pudieron cargar más canciones.');
   }finally{
     if(active===generation.current)setLoadingMore(false);
   }
 }
 async function remove(id:string){
   const active=generation.current;
   setBusy(true);setError('');
   try{
     await request('/v1/playlists/'+encodeURIComponent(playlistId)+'/items/'+encodeURIComponent(id),{method:'DELETE'});
     if(active!==generation.current)return;
     await load();
   }catch(cause){
     if(active===generation.current)
       setError(cause instanceof Error?cause.message:'No se pudo quitar la canción.');
   }finally{
     if(active===generation.current)setBusy(false);
   }
 }
 async function play(item:NonNullable<AccountPlaylistItem['cloud']>){
   const active=generation.current;
   setError('');
   try{
     const result=await request<{url:string;expiresInSeconds:number}>('/v1/library/cloud/'+encodeURIComponent(item.id)+'/play');
     if(active!==generation.current)return;
     if(new URL(result.url).protocol!=='https:')throw new Error('El enlace temporal de audio no es seguro.');
     onPlay({id:'cloud-'+item.id,title:item.title,artist:item.artist,album:item.album,
       cover:item.coverUrl||'/art/orbita.svg',genre:item.genre,duration:'--:--',
       audioUrl:result.url,source:'external',
       signedAudioExpiresInSeconds:result.expiresInSeconds,
       renewAudioUrl:()=>request<{url:string;expiresInSeconds:number}>('/v1/library/cloud/'+encodeURIComponent(item.id)+'/play')});
   }catch(cause){
     if(active===generation.current)
       setError(cause instanceof Error?cause.message:'No se pudo reproducir la canción.');
   }
 }
 return <section className="content-section" aria-label="Canciones de playlist de cuenta">
   {busy&&<p role="status" className="disclosure">Sincronizando canciones…</p>}
   {error&&<p role="alert" className="account-error">{error}</p>}
   {!busy&&items.length===0&&<p className="empty-note">Esta playlist todavía no contiene canciones. Agrégalas desde Mi música en la nube.</p>}
   <div className="track-list glass">{items.map(item=>{
     const cloud=item.cloud;
     const external=item.external;
     const name=cloud?.title??external?.title??'Referencia no disponible';
     return <div className="track-row" key={item.id}>
       <span className="track-descriptor"><strong>{name}</strong><small>{cloud?.artist??external?.artist??'Origen eliminado'} · {cloud?'Mi nube':external?'Fuente externa':'No disponible'}</small></span>
       {cloud&&<button type="button" className="button small" disabled={busy} onClick={()=>{void play(cloud);}}>Reproducir</button>}
       {external&&<a className="button small" href={external.sourceUrl} target="_blank" rel="noopener noreferrer">Abrir fuente</a>}
       <button type="button" className="icon-button" disabled={busy} aria-label={'Quitar '+name+' de la playlist'} onClick={()=>{void remove(item.id);}}>Quitar</button>
     </div>;
   })}</div>
   {nextCursor&&<button type="button" className="button secondary small" disabled={busy||loadingMore}
     onClick={()=>{void loadMore();}}>{loadingMore?'Cargando más canciones…':'Mostrar más canciones'}</button>}
 </section>;
}
