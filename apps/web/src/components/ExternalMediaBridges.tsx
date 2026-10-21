'use client';
import {useEffect,useState,type FormEvent} from 'react';
import type {AccountApi} from '../hooks/useAccount';
import {parseExternalEmbed,type ExternalEmbed} from '../lib/external-embeds';
type Video={videoId:string;title:string;artist:string;thumbnail:string|null;sourceUrl:string};
const base=process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/,'')??'';
const configured=Boolean(base)||process.env.NEXT_PUBLIC_USE_SAME_ORIGIN_API==='true';
export function ExternalMediaBridges({account,onActivate}:{
 account:AccountApi;onActivate:()=>void;
}){
 const [link,setLink]=useState('');
 const [active,setActive]=useState<ExternalEmbed|null>(null);
 const [query,setQuery]=useState('');
 const [videos,setVideos]=useState<Video[]>([]);
 const [youtubeReady,setYoutubeReady]=useState(false);
 const [searching,setSearching]=useState(false);
 const [error,setError]=useState('');
 useEffect(()=>{
   if(!account.accessToken||!configured){setYoutubeReady(false);return;}
   let alive=true;
   void fetch(base+'/v1/discovery/youtube/config',{headers:{authorization:'Bearer '+account.accessToken},cache:'no-store'})
    .then(r=>r.ok?r.json():null).then(data=>{if(alive)setYoutubeReady(data?.enabled===true);})
    .catch(()=>{if(alive)setYoutubeReady(false);});
   return()=>{alive=false;};
 },[account.accessToken]);
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
 return <section className="content-section external-bridges">
   <div className="section-heading"><h2>Reproductores externos</h2></div>
   <p className="page-description">Escucha enlaces compatibles con los reproductores oficiales de YouTube o SoundCloud sin importar archivos a tu nube.</p>
   <form className="playlist-create glass" onSubmit={event=>{event.preventDefault();activate(link);}}>
     <label htmlFor="external-embed-link" className="sr-only">Enlace de YouTube o SoundCloud</label>
     <input id="external-embed-link" type="url" value={link} onChange={event=>setLink(event.target.value)}
       placeholder="https://youtube.com/watch?v=… o https://soundcloud.com/…" required/>
     <button className="button primary small" type="submit">Abrir reproductor</button>
   </form>
   {account.accessToken&&youtubeReady ? <form className="playlist-create glass" onSubmit={event=>{void searchYoutube(event);}}>
     <label htmlFor="youtube-search" className="sr-only">Buscar videos musicales en YouTube</label>
     <input id="youtube-search" value={query} onChange={event=>setQuery(event.target.value)} maxLength={100}
       placeholder="Buscar videos musicales en YouTube"/>
     <button className="button secondary small" type="submit" disabled={searching||query.trim().length<2}>{searching?'Buscando…':'Buscar videos'}</button>
   </form> : <p className="disclosure">La búsqueda integrada de YouTube se habilitará cuando esté configurada una clave oficial de API. Puedes pegar enlaces mientras tanto.</p>}
   {error&&<p className="account-error" role="alert">{error}</p>}
   {videos.length>0&&<div className="track-list glass">{videos.map(video=><div className="track-row" key={video.videoId}>
     <span className="track-descriptor"><strong>{video.title}</strong><small>{video.artist} · YouTube</small></span>
     <button type="button" className="button secondary small" onClick={()=>activate(video.sourceUrl)}>Ver y escuchar</button>
   </div>)}</div>}
   {active&&<div className="bridge-player glass">
     <div className="section-heading"><h2>{active.provider==='youtube'?'YouTube':'SoundCloud'}</h2><button type="button" className="button secondary small" onClick={()=>setActive(null)}>Cerrar</button></div>
     <iframe key={active.src} className="bridge-iframe" src={active.src}
       title={'Reproductor oficial de '+(active.provider==='youtube'?'YouTube':'SoundCloud')}
       loading="lazy" referrerPolicy="strict-origin-when-cross-origin"
       allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen/>
     <a href={active.sourceUrl} target="_blank" rel="noopener noreferrer">Abrir contenido en su plataforma</a>
   </div>}
 </section>;
}
