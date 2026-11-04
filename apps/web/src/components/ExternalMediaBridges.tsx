'use client';
import {useEffect,useRef,useState,type FormEvent} from 'react';
import type {AccountApi} from '../hooks/useAccount';
import {parseExternalEmbed,type ExternalEmbed} from '../lib/external-embeds';
type Video={videoId:string;title:string;artist:string;thumbnail:string|null;sourceUrl:string};
const base=process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/,'')??'';
const configured=Boolean(base)||process.env.NEXT_PUBLIC_USE_SAME_ORIGIN_API==='true';
export function ExternalMediaBridges({account,onActivate,initialQuery,embedded=false}:{
 account:AccountApi;onActivate:()=>void;initialQuery?:string;embedded?:boolean;
}){
 const [link,setLink]=useState('');
 const [active,setActive]=useState<ExternalEmbed|null>(null);
 const [query,setQuery]=useState('');
 const [videos,setVideos]=useState<Video[]>([]);
 const [youtubeReady,setYoutubeReady]=useState(false);
 const [searching,setSearching]=useState(false);
 const [error,setError]=useState('');
 const playerRef=useRef<HTMLDivElement>(null);
 const incomingLink=embedded?parseExternalEmbed(initialQuery??''):null;
 useEffect(()=>{
   if(!active)return;
   // The official player must remain visible; never autoplay it while hidden.
   const frame=window.requestAnimationFrame(()=>playerRef.current?.scrollIntoView({behavior:'smooth',block:'center'}));
   return ()=>window.cancelAnimationFrame(frame);
 },[active]);
 useEffect(()=>{
   if(!account.accessToken||!configured){setYoutubeReady(false);return;}
   let alive=true;
   void fetch(base+'/v1/discovery/youtube/config',{headers:{authorization:'Bearer '+account.accessToken},cache:'no-store'})
    .then(r=>r.ok?r.json():null).then(data=>{if(alive)setYoutubeReady(data?.enabled===true);})
    .catch(()=>{if(alive)setYoutubeReady(false);});
   return()=>{alive=false;};
 },[account.accessToken]);
 // Buscar already has a search box. Resolve song titles to playable YouTube
 // videos via NÉBULA's authenticated backend, never by scraping URLs.
 useEffect(()=>{
   if(!embedded)return;
   const q=(initialQuery??'').trim();
   if(!youtubeReady||!account.accessToken||q.length<4){setVideos([]);setSearching(false);setError('');return;}
   const controller=new AbortController();
   const timer=setTimeout(()=>{
     setSearching(true);setError('');
     void fetch(base+'/v1/discovery/youtube?q='+encodeURIComponent(q),{
       headers:{authorization:'Bearer '+account.accessToken},cache:'no-store',signal:controller.signal,
     }).then(async response=>{
       if(!response.ok)throw new Error(response.status===429?'Se alcanzó el límite temporal de búsquedas de YouTube. Intenta más tarde.':'No se pudo consultar YouTube (HTTP '+response.status+').');
       return response.json() as Promise<{items?:Video[]}>;
     }).then(data=>{if(!controller.signal.aborted)setVideos(Array.isArray(data.items)?data.items:[]);})
       .catch(err=>{if(!controller.signal.aborted){setVideos([]);setError(err instanceof Error?err.message:'Error al consultar YouTube.');}})
       .finally(()=>{if(!controller.signal.aborted)setSearching(false);});
   },1100);
   return ()=>{clearTimeout(timer);controller.abort();};
 },[embedded,initialQuery,youtubeReady,account.accessToken]);
 function activate(source:string){
   const media=parseExternalEmbed(source);
   if(!media){setError('Pega un enlace HTTPS válido de video de YouTube o pista de SoundCloud.');return;}
   onActivate();
   setError('');
   setActive(media);
 }
 async function searchYoutube(event:FormEvent<HTMLFormElement>){
   event.preventDefault();
   if(!account.accessToken||!youtubeReady||query.trim().length<2)return;
   setSearching(true);setError('');
   try{
     const url=base+'/v1/discovery/youtube?q='+encodeURIComponent(query.trim());
     const response=await fetch(url,{headers:{authorization:'Bearer '+account.accessToken},cache:'no-store'});
     if(!response.ok)throw new Error('YouTube no está disponible ahora (HTTP '+response.status+').');
     const data=await response.json() as {items?:Video[]};
     setVideos(Array.isArray(data.items)?data.items:[]);
   }catch(err){setVideos([]);setError(err instanceof Error?err.message:'Error de búsqueda.');}
   finally{setSearching(false);}
 }
 return <section className="content-section external-bridges" aria-label="Reproductor musical de YouTube y SoundCloud">
   <div className="section-heading"><h2>{embedded?'Escucha con YouTube o SoundCloud':'Reproductores externos'}</h2></div>
   <p className="page-description">{embedded?'Pega un enlace de video compatible para reproducirlo aquí. La búsqueda por nombre en YouTube requiere la API configurada.':'Abre enlaces compatibles con los reproductores oficiales, sin importar ni descargar audio a tu nube.'}</p>
   <form className="playlist-create glass" onSubmit={event=>{event.preventDefault();activate(link);}}>
     <label htmlFor="external-embed-link" className="sr-only">Enlace de YouTube o SoundCloud</label>
     <input id="external-embed-link" type="url" value={link} onChange={event=>setLink(event.target.value)}
       placeholder="https://youtube.com/watch?v=… o https://soundcloud.com/…" required/>
     <button className="button primary small" type="submit" disabled={!link.trim()}>Abrir reproductor</button>
   </form>
   {embedded&&incomingLink&&<div className="search-source-hint"><span>Enlace de {incomingLink.provider==='youtube'?'YouTube':'SoundCloud'} reconocido. </span><button type="button" className="button secondary small" onClick={()=>activate(initialQuery??'')}>Reproducir este enlace</button></div>}
   {!embedded&&account.accessToken&&youtubeReady ? <form className="playlist-create glass" onSubmit={event=>{void searchYoutube(event);}}>
     <label htmlFor="youtube-search" className="sr-only">Buscar videos musicales en YouTube</label>
     <input id="youtube-search" value={query} onChange={event=>setQuery(event.target.value)} maxLength={100}
       placeholder="Buscar videos musicales en YouTube"/>
     <button className="button secondary small" type="submit" disabled={searching||query.trim().length<2}>{searching?'Buscando…':'Buscar videos'}</button>
   </form> : !youtubeReady ? <p className="search-source-hint">{!account.accessToken?"Inicia sesión para consultar YouTube desde NÉBULA.":"YouTube no está habilitado en NÉBULA en este momento. Puedes consultar otros catálogos."}</p> : null}
   {embedded&&!youtubeReady&&(initialQuery??'').trim().length>=2&&<p className="disclosure">
     <a href={'https://www.youtube.com/results?search_query='+encodeURIComponent((initialQuery??'').trim())}
       target="_blank" rel="noopener noreferrer">Buscar «{(initialQuery??'').trim()}» en la web de YouTube</a>
     {' '}— sin clave API; los resultados se abrirán en YouTube, no en el reproductor de NÉBULA.
   </p>}
   {error&&<p className="account-error" role="alert">{error}</p>}
   {embedded&&youtubeReady&&searching&&<p className="disclosure" role="status">Buscando videos musicales relacionados…</p>}
   {embedded&&youtubeReady&&!searching&&(initialQuery??'').trim().length>=4&&videos.length===0&&!error&&<p className="empty-note">No hay videos encontrados para esa búsqueda.</p>}
   {videos.length>0&&<div className="track-list glass">{videos.map(video=><div className="track-row" key={video.videoId}>
     <span className="track-descriptor"><strong>{video.title}</strong><small>{video.artist} · YouTube</small></span>
     <button type="button" className="button secondary small" onClick={()=>activate(video.sourceUrl)}>Reproducir video</button>
   </div>)}</div>}
   {active&&<div ref={playerRef} className="bridge-player glass" role="region" aria-label="Reproductor externo activo">
     <div className="section-heading"><h2>{active.provider==='youtube'?'YouTube':'SoundCloud'}</h2><button type="button" className="button secondary small" onClick={()=>setActive(null)}>Cerrar reproductor</button></div>
     <iframe key={active.src} className="bridge-iframe" src={active.src}
       title={'Reproductor oficial de '+(active.provider==='youtube'?'YouTube':'SoundCloud')}
       loading="eager" referrerPolicy="strict-origin-when-cross-origin"
       allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen/>
     <p className="disclosure">Pulsa reproducir dentro del reproductor oficial. Este contenido no usa el mini-reproductor de audio de NÉBULA.</p>
     <a href={active.sourceUrl} target="_blank" rel="noopener noreferrer">Abrir contenido en su plataforma</a>
   </div>}
 </section>;
}
