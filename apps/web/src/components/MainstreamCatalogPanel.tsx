'use client';

import {useEffect,useRef,useState} from 'react';
import {ExternalLink,Headphones,Disc3} from 'lucide-react';
import {parseExternalEmbed} from '../lib/external-embeds';
import {officialDeezerEmbed,officialMusicSearch,parseMainstreamResults,type MainstreamTrack} from '../lib/mainstream';

const base=process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/,'')??'';
const configured=Boolean(base)||process.env.NEXT_PUBLIC_USE_SAME_ORIGIN_API==='true';

export function MainstreamCatalogPanel({query,onActivate}:{
 query:string;onActivate:()=>void;
}){
 const [tracks,setTracks]=useState<MainstreamTrack[]>([]);
 const [active,setActive]=useState<MainstreamTrack|null>(null);
 const [loading,setLoading]=useState(false);
 const [error,setError]=useState('');
 const [showVariants,setShowVariants]=useState(false);
 const [searched,setSearched]=useState(false);
 const playerRef=useRef<HTMLDivElement>(null);
 const text=query.trim();
 useEffect(()=>{
  const abort=new AbortController();
  setTracks([]);setError('');setLoading(false);setSearched(false);setActive(null);setShowVariants(false);
  if(!configured||text.length<2||text.length>100||parseExternalEmbed(text))return;
  const timer=setTimeout(()=>{
   setLoading(true);
   void fetch(base+'/v1/discovery/mainstream?q='+encodeURIComponent(text),{
    signal:abort.signal,cache:'no-store',redirect:'error',
   }).then(async response=>{
    if(response.status===429)throw Error('Demasiadas búsquedas. Intenta nuevamente.');
    if(!response.ok)throw Error('El catálogo comercial no está disponible. Puedes buscar en las plataformas oficiales.');
    return response.json() as Promise<unknown>;
   }).then(result=>{
    if(!abort.signal.aborted){setTracks(parseMainstreamResults(result));setSearched(true);}
   }).catch(e=>{
    if(!abort.signal.aborted){setTracks([]);setSearched(true);setError(e instanceof Error?e.message:'No se pudo consultar el catálogo.');}
   }).finally(()=>{if(!abort.signal.aborted)setLoading(false);});
  },500);
  return()=>{clearTimeout(timer);abort.abort();};
 },[text]);
 useEffect(()=>{
  if(!active)return;
  const frame=requestAnimationFrame(()=>playerRef.current?.scrollIntoView({behavior:'smooth',block:'nearest'}));
  return()=>cancelAnimationFrame(frame);
 },[active]);
 if(!configured)return null;
 const studio=tracks.filter(x=>!x.isVariant);
 const variants=tracks.filter(x=>x.isVariant);
 const visible=showVariants?variants:(studio.length?studio:tracks);
 const first=tracks[0];
 const artist=text;
 function choose(song:MainstreamTrack){
  if(!officialDeezerEmbed(song.id))return;
  onActivate();setActive(song);
 }
 return <section className="content-section mainstream-catalog" aria-label="Grabaciones de artistas populares">
  <div className="section-heading"><div><h2><Disc3 size={19} aria-hidden="true"/> Catálogo de artistas y grabaciones</h2>
   <p className="search-section-note">Deezer · versiones de estudio primero, remixes separados</p></div></div>
  <p className="page-description">Busca lanzamientos de artistas conocidos, no solo música independiente. La disponibilidad depende de Deezer. El reproductor oficial puede limitar la escucha a una muestra.</p>
  {loading&&<p className="disclosure" role="status">Buscando canciones y artistas en Deezer…</p>}
  {error&&<p className="search-source-hint" role="alert">{error}</p>}
  {searched&&!loading&&!error&&tracks.length===0&&<p className="empty-note">No encontramos grabaciones en Deezer con ese nombre. Prueba agregar el artista.</p>}
  {variants.length>0&&studio.length>0&&<div className="chip-row" role="group" aria-label="Tipo de grabación">
   <button type="button" className={'chip '+(!showVariants?'active':'')} aria-pressed={!showVariants} onClick={()=>setShowVariants(false)}>De estudio ({studio.length})</button>
   <button type="button" className={'chip '+(showVariants?'active':'')} aria-pressed={showVariants} onClick={()=>setShowVariants(true)}>Remixes y versiones ({variants.length})</button>
  </div>}
  {visible.length>0&&<div className="track-list glass">{visible.map(song=><div key={song.id} className="track-row mainstream-row">
   {song.cover?<img src={song.cover} alt="" width={48} height={48} loading="lazy" className="mainstream-cover"/>:<div className="mainstream-cover mainstream-placeholder" aria-hidden="true"><Disc3 size={20}/></div>}
   <span className="track-descriptor"><strong>{song.title}</strong><small>{song.artist} · {song.album}</small></span>
   <button type="button" className="button secondary small" onClick={()=>choose(song)} aria-label={'Reproducir en Deezer: '+song.title}><Headphones size={15}/> Escuchar</button>
   <a className="button secondary small mainstream-link" href={song.sourceUrl} target="_blank" rel="noopener noreferrer" aria-label={'Abrir '+song.title+' en Deezer'}><ExternalLink size={14}/> Deezer</a>
  </div>)}</div>}
  {(first||searched)&&<div className="mainstream-alternatives"><span>¿No es la versión que buscabas?</span>
   <a href={officialMusicSearch('youtube',first??{title:artist,artist:''})} target="_blank" rel="noopener noreferrer">Buscar audio oficial en YouTube</a>
   <a href={officialMusicSearch('spotify',first??{title:artist,artist:''})} target="_blank" rel="noopener noreferrer">Buscar en Spotify</a>
   <a href={officialMusicSearch('apple',first??{title:artist,artist:''})} target="_blank" rel="noopener noreferrer">Apple Music</a>
  </div>}
  {active&&officialDeezerEmbed(active.id)&&<div ref={playerRef} className="bridge-player glass" role="region" aria-label="Reproductor oficial Deezer activo">
   <div className="section-heading"><h2>{active.title} — {active.artist}</h2><button type="button" className="button secondary small" onClick={()=>setActive(null)}>Cerrar</button></div>
   <iframe key={active.id} className="bridge-iframe mainstream-iframe" src={officialDeezerEmbed(active.id)!} title={'Escuchar '+active.title+' en el reproductor de Deezer'}
    loading="eager" referrerPolicy="strict-origin-when-cross-origin" allow="autoplay; encrypted-media; clipboard-write" />
   <p className="disclosure">Reproductor oficial Deezer: en muchos casos solo ofrece 30 segundos de muestra. Para escuchar la canción completa sigue las condiciones de Deezer.</p>
  </div>}
 </section>;
}
