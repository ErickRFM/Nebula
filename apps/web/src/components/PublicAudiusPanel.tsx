'use client';

import {useEffect,useRef,useState,type FormEvent} from 'react';
import {Headphones,Search,ExternalLink} from 'lucide-react';
import {normalizePublicAudiusTracks,type PublicAudiusTrack} from '../lib/public-audius';
import {parseExternalEmbed} from '../lib/external-embeds';
import type {Track} from '../lib/catalog';

const SEARCH_ENDPOINT='https://api.audius.co/v1/tracks/search';
export function PublicAudiusPanel({initialQuery='',standalone=false,onPlay}:{
 initialQuery?:string;standalone?:boolean;onPlay:(track:Track)=>void;
}){
 const [typed,setTyped]=useState('');
 const [tracks,setTracks]=useState<PublicAudiusTrack[]>([]);
 const [loading,setLoading]=useState(false);
 const [error,setError]=useState('');
 const [searched,setSearched]=useState(false);
 const [refresh,setRefresh]=useState(0);
 const controllerRef=useRef<AbortController|null>(null);
 const query=(standalone?typed:initialQuery).trim();
 useEffect(()=>{
  controllerRef.current?.abort();
  if(query.length<2||query.length>100||parseExternalEmbed(query)){
   setTracks([]);setLoading(false);setError('');setSearched(false);return;
  }
  const controller=new AbortController();
  controllerRef.current=controller;
  setTracks([]);setSearched(false);setError('');
  const timer=window.setTimeout(()=>{
   setLoading(true);setError('');
   const url=new URL(SEARCH_ENDPOINT);
   url.searchParams.set('query',query);
   url.searchParams.set('limit','12');
   url.searchParams.set('filter_tracks','public');
   url.searchParams.set('gate_condition','ungated');
   void fetch(url,{signal:controller.signal,cache:'no-store',redirect:'error'})
    .then(async response=>{
     if(!response.ok)throw new Error(response.status===429?'Audius alcanzó su límite temporal de consultas.':'No se pudo conectar con el catálogo público de Audius.');
     return response.json() as Promise<unknown>;
    })
    .then(payload=>{if(!controller.signal.aborted){setTracks(normalizePublicAudiusTracks(payload));setSearched(true);}})
    .catch(e=>{if(!controller.signal.aborted){setTracks([]);setSearched(true);setError(e instanceof Error?e.message:'Audius no está disponible desde esta red.');}})
    .finally(()=>{if(!controller.signal.aborted)setLoading(false);});
  },650);
  return()=>{window.clearTimeout(timer);controller.abort();};
 },[query,refresh]);
 function choose(song:PublicAudiusTrack){
  const seconds=song.durationSeconds;
  onPlay({
   id:'remote-audius-'+song.id,title:song.title,artist:song.artist,
   album:'Audius · catálogo público',genre:'Audius',
   duration:seconds===null?'--:--':Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0'),
   cover:song.artworkUrl??'/art/orbita.svg',audioUrl:song.streamUrl,source:'external',
  });
 }
 function searchNow(event:FormEvent<HTMLFormElement>){event.preventDefault();if(query.length>=2)setRefresh(previous=>previous+1);}
 return <section className="content-section public-audius" aria-label="Catálogo público de Audius">
  <div className="section-heading"><h2>Música abierta de Audius</h2></div>
  <p className="page-description">Prueba canciones públicas sin cuenta de NÉBULA ni clave de YouTube. Audius recibe el término de búsqueda y ofrece sus propios streams; no garantiza todos los lanzamientos comerciales.</p>
  {standalone&&<form className="explore-form glass" onSubmit={searchNow} role="search">
   <Search size={18}/><label className="sr-only" htmlFor="audius-public-query">Buscar música pública</label>
   <input id="audius-public-query" value={typed} maxLength={100} placeholder="Busca música en Audius" onChange={event=>setTyped(event.target.value)}/>
   <button className="button primary small" type="submit" disabled={loading||query.length<2}>Buscar</button>
  </form>}
  {loading&&<p className="disclosure" role="status">Buscando pistas reproducibles en Audius…</p>}
  {error&&<p role="alert" className="search-source-hint">{error} <a href="https://audius.co" target="_blank" rel="noopener noreferrer">Abrir Audius</a></p>}
  {searched&&!loading&&!error&&tracks.length===0&&<p className="empty-note">Audius no encontró pistas públicas reproducibles para esta búsqueda.</p>}
  {tracks.length>0&&<div className="track-list glass">{tracks.map(song=><div className="track-row" key={song.id}>
    <span className="track-descriptor"><strong>{song.title}</strong><small>{song.artist} · Audius</small></span>
    <a href={song.sourceUrl} target="_blank" rel="noopener noreferrer" aria-label={'Ver pista en Audius: '+song.title}><ExternalLink size={16}/></a>
    <button type="button" className="button secondary small" onClick={()=>choose(song)} aria-label={'Escuchar '+song.title}><Headphones size={16}/> Escuchar</button>
  </div>)}</div>}
 </section>;
}
