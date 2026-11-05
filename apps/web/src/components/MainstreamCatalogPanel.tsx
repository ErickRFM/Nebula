'use client';

import {useEffect,useRef,useState,type FormEvent} from 'react';
import {ExternalLink,Headphones,Disc3,Search,Link2} from 'lucide-react';
import {parseExternalEmbed,type ExternalEmbed} from '../lib/external-embeds';
import {officialDeezerEmbed,officialMusicSearch,parseMainstreamResults,type MainstreamTrack} from '../lib/mainstream';

const base=process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/,'')??'';
const configured=Boolean(base)||process.env.NEXT_PUBLIC_USE_SAME_ORIGIN_API==='true';

export function MainstreamCatalogPanel({query='',standalone=false,onActivate}:{
 query?:string;standalone?:boolean;onActivate:()=>void;
}){
 const [typed,setTyped]=useState('');
 const [tracks,setTracks]=useState<MainstreamTrack[]>([]);
 const [preview,setPreview]=useState<MainstreamTrack|null>(null);
 const [selected,setSelected]=useState<MainstreamTrack|null>(null);
 const [fullLink,setFullLink]=useState('');
 const [fullEmbed,setFullEmbed]=useState<ExternalEmbed|null>(null);
 const [fullError,setFullError]=useState('');
 const [loading,setLoading]=useState(false);
 const [error,setError]=useState('');
 const [showVariants,setShowVariants]=useState(false);
 const [searched,setSearched]=useState(false);
 const playerRef=useRef<HTMLDivElement>(null);
 const text=(standalone?typed:query).trim();

 useEffect(()=>{
  const abort=new AbortController();
  setTracks([]);setError('');setLoading(false);setSearched(false);
  setPreview(null);setSelected(null);setFullEmbed(null);setFullLink('');setFullError('');
  setShowVariants(false);
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
   }).catch(cause=>{
    if(!abort.signal.aborted){setTracks([]);setSearched(true);setError(cause instanceof Error?cause.message:'No se pudo consultar el catálogo.');}
   }).finally(()=>{if(!abort.signal.aborted)setLoading(false);});
  },500);
  return()=>{clearTimeout(timer);abort.abort();};
 },[text]);
 useEffect(()=>{
  if(!preview&&!selected)return;
  const frame=requestAnimationFrame(()=>playerRef.current?.scrollIntoView({behavior:'smooth',block:'nearest'}));
  return()=>cancelAnimationFrame(frame);
 },[preview,selected,fullEmbed]);

 if(!configured)return null;

 const studio=tracks.filter(track=>!track.isVariant);
 const variants=tracks.filter(track=>track.isVariant);
 const visible=showVariants?variants:(studio.length?studio:tracks);
 const first=tracks[0];
 const searchFallback=first??{title:text,artist:''};

 function showPreview(track:MainstreamTrack){
  if(!officialDeezerEmbed(track.id))return;
  onActivate();
  setSelected(null);setFullEmbed(null);setPreview(track);
 }
 function chooseFull(track:MainstreamTrack){
  setPreview(null);setSelected(track);
  setFullLink('');setFullEmbed(null);setFullError('');
 }
 function activateFull(event:FormEvent<HTMLFormElement>){
  event.preventDefault();
  const parsed=parseExternalEmbed(fullLink);
  // Deezer still shows only previews in its public widget.
  if(!parsed||parsed.provider==='deezer'){
   setFullEmbed(null);
   setFullError('Utiliza un enlace válido de video de YouTube, pista de SoundCloud o Spotify. Deezer aquí solo ofrece una muestra.');
   return;
  }
  onActivate();
  setFullError('');setFullEmbed(parsed);
 }

 return <section className="content-section mainstream-catalog" aria-label="Grabaciones de artistas populares">
  <div className="section-heading"><div><h2><Disc3 size={19} aria-hidden="true"/> Grabaciones de artistas</h2>
   <p className="search-section-note">Deezer identifica canciones y álbumes; no proporciona audio completo a NÉBULA</p></div></div>
  <p className="page-description">Identifica la grabación original y el artista. Las muestras de Deezer duran 30 segundos; para otras opciones de escucha abre la canción.</p>
  {standalone&&<div className="explore-form glass" role="search"><label className="sr-only" htmlFor="studio-discovery-query">Buscar canción o artista comercial</label><input id="studio-discovery-query" value={typed} maxLength={100} onChange={event=>setTyped(event.target.value)} placeholder="Canción original o artista" /></div>}
  {loading&&<p className="disclosure" role="status">Buscando canciones y artistas en Deezer…</p>}
  {error&&<p className="search-source-hint" role="alert">{error}</p>}
  {searched&&!loading&&!error&&tracks.length===0&&<p className="empty-note">No encontramos grabaciones en Deezer con ese nombre. Prueba agregar el artista.</p>}
  {variants.length>0&&studio.length>0&&<div className="chip-row" role="group" aria-label="Tipo de grabación">
   <button type="button" className={'chip '+(!showVariants?'active':'')} aria-pressed={!showVariants} onClick={()=>setShowVariants(false)}>De estudio ({studio.length})</button>
   <button type="button" className={'chip '+(showVariants?'active':'')} aria-pressed={showVariants} onClick={()=>setShowVariants(true)}>Remixes y versiones ({variants.length})</button>
  </div>}
  {visible.length>0&&<div className="track-list glass">{visible.map(track=><div key={track.id} className="track-row mainstream-row">
   {track.cover?<img src={track.cover} alt="" width={48} height={48} loading="lazy" className="mainstream-cover"/>:<div className="mainstream-cover mainstream-placeholder" aria-hidden="true"><Disc3 size={20}/></div>}
   <span className="track-descriptor"><strong>{track.title}</strong><small>{track.artist} · {track.album}</small></span>
   <button type="button" className="button primary small" onClick={()=>chooseFull(track)} aria-label={'Opciones para escuchar '+track.title}><Headphones size={15}/> Cómo escuchar</button>
   <button type="button" className="button secondary small" onClick={()=>showPreview(track)} aria-label={'Muestra de 30 segundos: '+track.title}>Muestra 30 s</button>
  </div>)}</div>}
  {(first||searched)&&<div className="mainstream-alternatives"><span>Más opciones</span>
   <a href={officialMusicSearch('youtube',searchFallback)} target="_blank" rel="noopener noreferrer">YouTube · audio oficial</a>
   <a href={officialMusicSearch('spotify',searchFallback)} target="_blank" rel="noopener noreferrer">Spotify</a>
   <a href={officialMusicSearch('apple',searchFallback)} target="_blank" rel="noopener noreferrer">Apple Music</a>
  </div>}
  {selected&&<div ref={playerRef} className="bridge-player glass mainstream-full-player official-player-surface" role="region" aria-label={'Opciones de reproducción de '+selected.title}>
   <div className="section-heading official-player-header"><div className="official-player-identity"><span className="official-source-label">OPCIONES DE ESCUCHA</span><h2>{selected.title} — {selected.artist}</h2><small>Selecciona la fuente oficial que tengas disponible.</small></div><button className="button secondary small" type="button" onClick={()=>{setSelected(null);setFullEmbed(null);}}>Cerrar</button></div>
   <p className="page-description">Esta ficha no contiene el archivo de audio. Encuentra el video oficial de la canción en YouTube, copia su enlace y reprodúcelo aquí. El video debe permitir reproducción incrustada y su duración no está limitada por la muestra de Deezer.</p>
   <a className="button primary small mainstream-official-search" href={officialMusicSearch('youtube',selected)} target="_blank" rel="noopener noreferrer"><Search size={16}/> 1. Buscar video oficial de la canción</a>
   <form className="playlist-create glass mainstream-full-form" onSubmit={activateFull}>
    <label className="sr-only" htmlFor="mainstream-full-link">Enlace a la canción completa de {selected.title}</label>
    <Link2 size={17} aria-hidden="true"/>
    <input id="mainstream-full-link" type="url" required value={fullLink} onChange={event=>{setFullLink(event.target.value);setFullError('');}}
      autoComplete="off" placeholder="https://www.youtube.com/watch?v=…"/>
    <button className="button primary small" type="submit" disabled={!fullLink.trim()}>2. Reproducir aquí</button>
   </form>
   <p className="disclosure">También admite SoundCloud o Spotify. Spotify puede dar canciones completas con Premium y sesión activa; sin acceso, puede ofrecer una muestra. El reproductor original de YouTube permanece visible.</p>
   {fullError&&<p className="account-error" role="alert">{fullError}</p>}
   {fullEmbed&&<div role="region" aria-label="Reproductor musical oficial">
    <iframe key={fullEmbed.src} className="bridge-iframe mainstream-video" src={fullEmbed.src}
      title={'Reproductor oficial de '+(fullEmbed.provider==='youtube'?'YouTube':fullEmbed.provider==='spotify'?'Spotify':'SoundCloud')}
      loading="eager" referrerPolicy="strict-origin-when-cross-origin" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen/>
    <a href={fullEmbed.sourceUrl} target="_blank" rel="noopener noreferrer">Abrir en la plataforma original</a>
   </div>}
  </div>}
  {preview&&officialDeezerEmbed(preview.id)&&<div ref={playerRef} className="bridge-player glass official-player-surface" role="region" aria-label="Muestra de 30 segundos de Deezer">
   <div className="section-heading official-player-header"><div className="official-player-identity"><span className="official-source-label">MUESTRA · DEEZER</span><h2>{preview.title}</h2><small>Fragmento de 30 segundos, no es la grabación completa.</small></div><button type="button" className="button secondary small" onClick={()=>setPreview(null)}>Cerrar</button></div>
   <iframe key={preview.id} className="bridge-iframe mainstream-iframe" src={officialDeezerEmbed(preview.id)!}
     title={'Muestra de '+preview.title+' en Deezer'} loading="eager" referrerPolicy="strict-origin-when-cross-origin"
     allow="autoplay; encrypted-media; clipboard-write"/>
   <p className="disclosure">Solo 30 segundos de muestra. No se anuncia como canción completa.</p>
   <button type="button" className="button primary small" onClick={()=>chooseFull(preview)}>Opciones de reproducción completa</button>
  </div>}
 </section>;
}
