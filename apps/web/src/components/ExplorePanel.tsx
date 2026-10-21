'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Bookmark, Check, ExternalLink, Headphones, Search, WifiOff } from 'lucide-react';
import type { AccountApi } from '../hooks/useAccount';
import type { Track } from '../lib/catalog';
import { MetadataLookup } from './MetadataLookup';

type Provider = 'all'|'jamendo'|'openverse'|'audius';
interface RemoteTrack {
  id:string;provider:Exclude<Provider,'all'>;externalId:string;
  title:string;artist:string;album:string|null;durationSeconds:number|null;
  artworkUrl:string|null;sourceUrl:string;licenseUrl:string|null;
  canStream:boolean;canDownload:boolean;canStorePrivateCopy:false;streamUrl:string|null;
}
interface SavedTrack {
  provider:Exclude<Provider,'all'>;externalId:string;title:string;artist:string;
  artworkUrl:string|null;sourceUrl:string;licenseUrl:string|null;
}
const apiBase=process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/,'') ?? '';
const apiConfigured=Boolean(apiBase) || process.env.NEXT_PUBLIC_USE_SAME_ORIGIN_API === 'true';
const providerNames:{id:Provider;label:string}[]=[
  {id:'all',label:'Todas'}, {id:'jamendo',label:'Jamendo'},
  {id:'openverse',label:'Openverse'}, {id:'audius',label:'Audius'},
];
const keyOf=(item:SavedTrack)=>item.provider+':'+item.externalId;
const isSafe=(url:string|null):url is string=>{
  if(!url) return false;
  try {const u=new URL(url);return u.protocol==='https:' && !u.username && !u.password;}
  catch{return false;}
};

export function ExplorePanel({account,onAccount,onPlay,initialQuery,embedded=false}:{
  account:AccountApi;onAccount:()=>void;onPlay:(track:Track)=>void;initialQuery?:string;embedded?:boolean;
}) {
  const [query,setQuery]=useState('');
  const [provider,setProvider]=useState<Provider>('all');
  const [tracks,setTracks]=useState<RemoteTrack[]>([]);
  const [saved,setSaved]=useState<SavedTrack[]>([]);
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState('');
  const [searched,setSearched]=useState(false);
  const [failed,setFailed]=useState<string[]>([]);
  const [saving,setSaving]=useState<string|null>(null);
  const [enabled,setEnabled]=useState<Record<string,boolean>>({});
  const searchAbort=useRef<AbortController|null>(null);

  const loadSaved=useCallback(async()=>{
    if(!account.accessToken || !apiConfigured) {setSaved([]);return;}
    try {
      const response=await fetch(apiBase+'/v1/library/external',{headers:{Authorization:'Bearer '+account.accessToken},cache:'no-store'});
      if(response.ok) setSaved((await response.json()).items as SavedTrack[]);
    } catch { /* Discovery still works if saved list is temporarily unavailable. */ }
  },[account.accessToken]);

  useEffect(()=>{void loadSaved();},[loadSaved]);
  useEffect(()=>{
    if(!account.accessToken || !apiConfigured) return;
    void fetch(apiBase+'/v1/discovery/providers',{
      headers:{Authorization:'Bearer '+account.accessToken},cache:'no-store',
    }).then(r=>r.ok?r.json():null).then((data)=>{
      if(data?.providers) setEnabled(Object.fromEntries((data.providers as {id:string;enabled:boolean}[]).map(x=>[x.id,x.enabled])));
    }).catch(()=>{});
  },[account.accessToken]);

  async function searchRemote(q:string) {
    searchAbort.current?.abort();
    if(q.length<2){setTracks([]);setSearched(false);setBusy(false);return;}
    if(!account.accessToken || !apiConfigured){setTracks([]);setBusy(false);setNotice('Inicia sesión en tu cuenta para explorar el catálogo.');return;}
    const controller=new AbortController();
    searchAbort.current=controller;
    setBusy(true);setNotice('');setFailed([]);setSearched(true);
    try {
      const params=new URLSearchParams({q,provider,limit:'12',page:'1'});
      const response=await fetch(apiBase+'/v1/discovery/search?'+params.toString(),{
        headers:{Authorization:'Bearer '+account.accessToken},cache:'no-store',signal:controller.signal,
      });
      if(!response.ok) throw new Error(response.status===401?'La sesión caducó; vuelve a iniciar sesión.':'No fue posible consultar los proveedores.');
      const json=await response.json();
      if(controller.signal.aborted) return;
      setTracks(Array.isArray(json.items)?json.items:[]);
      setFailed(Array.isArray(json.failedProviders)?json.failedProviders:[]);
      if(json.disabledProviders?.length) setNotice('Este proveedor necesita configuración en el servidor.');
    } catch(e) {
      if(controller.signal.aborted) return;
      setTracks([]);
      setNotice(e instanceof Error?e.message:'Ocurrió un error al buscar.');
    } finally {if(searchAbort.current===controller) {searchAbort.current=null;setBusy(false);} }
  }

  useEffect(()=>{
    if(!embedded) return;
    const q=(initialQuery??'').trim();
    searchAbort.current?.abort();
    if(q.length<2){setTracks([]);setSearched(false);setNotice('');setBusy(false);return;}
    const timer=setTimeout(()=>{void searchRemote(q);},400);
    return ()=>{clearTimeout(timer);searchAbort.current?.abort();};
  },[embedded,initialQuery,provider,account.accessToken]);

  async function removeSavedReference(item:SavedTrack) {
    if(!account.accessToken) return;
    setSaving(keyOf(item));setNotice('');
    try {
      const url=apiBase+'/v1/library/external/'+encodeURIComponent(item.provider)+'/'+encodeURIComponent(item.externalId);
      const response=await fetch(url,{method:'DELETE',headers:{Authorization:'Bearer '+account.accessToken}});
      if(!response.ok) throw new Error('No fue posible eliminar la referencia.');
      await loadSaved();
      setNotice('Referencia eliminada de tu biblioteca.');
    } catch(error) {setNotice(error instanceof Error?error.message:'Error de biblioteca.');}
    finally {setSaving(null);}
  }

  function play(item:RemoteTrack) {
    if(!item.canStream || !isSafe(item.streamUrl)) {
      setNotice('Este proveedor no ofrece una dirección de audio reproducible para esta pista.');
      return;
    }
    onPlay({
      id:'remote-'+item.provider+'-'+item.externalId,
      title:item.title,artist:item.artist,album:item.album??'Catálogo externo',
      cover:isSafe(item.artworkUrl)?item.artworkUrl:'/art/orbita.svg',
      genre:item.provider,duration:item.durationSeconds?Math.floor(item.durationSeconds/60)+':'+String(item.durationSeconds%60).padStart(2,'0'):'--:--',
      audioUrl:item.streamUrl,source:'external',
    });
    setNotice('Pista enviada al reproductor. La carga depende de la disponibilidad del proveedor; comprueba el estado del reproductor.');
  }

  async function save(item:RemoteTrack) {
    if(!account.accessToken) return;
    if(!isSafe(item.sourceUrl)){setNotice('La fuente de esta pista no es segura.');return;}
    const key=keyOf(item);
    setSaving(key);setNotice('');
    try {
      const exists=saved.some(x=>keyOf(x)===key);
      const url=apiBase+'/v1/library/external'+(exists?'/'+encodeURIComponent(item.provider)+'/'+encodeURIComponent(item.externalId):'');
      const response=await fetch(url,{
        method:exists?'DELETE':'POST',
        headers:{'Content-Type':'application/json',Authorization:'Bearer '+account.accessToken},
        ...(exists?{}:{body:JSON.stringify({
          provider:item.provider,externalId:item.externalId,
          title:item.title.slice(0,200),artist:item.artist.slice(0,200),
          sourceUrl:item.sourceUrl,artworkUrl:isSafe(item.artworkUrl)?item.artworkUrl:null,
          licenseUrl:isSafe(item.licenseUrl)?item.licenseUrl:null,
        })}),
      });
      if(!response.ok) throw new Error('No se pudo actualizar tu biblioteca (HTTP '+response.status+').');
      await loadSaved();
      setNotice(exists?'Referencia eliminada de tu biblioteca.':'Referencia guardada en tu cuenta, sin copiar audio.');
    } catch(e) {setNotice(e instanceof Error?e.message:'Error al guardar.');}
    finally {setSaving(null);}
  }

  return <section className="explore-page">
    {!embedded && <div className="eyebrow">CATÁLOGOS MUSICALES</div>}
    {!embedded && <h1 className="page-title">Explora nuevas frecuencias</h1>}
    {!embedded && <p className="page-description">Busca canciones reales, escucha desde sus proveedores y guarda referencias privadas, sin descargar ni replicar archivos.</p>}
    {!apiConfigured || !account.user ? <div className="explore-gate glass">
      <WifiOff size={25}/><div><strong>Exploración privada</strong><p>Necesitas la API configurada y una sesión iniciada para acceder a los catálogos.</p></div>
      <button className="button primary small" type="button" onClick={onAccount}>Ir a Cuenta</button>
    </div> : <>
      {!embedded && <form onSubmit={(event)=>{event.preventDefault();void searchRemote(query.trim());}} className="explore-form glass">
        <Search size={19}/><label className="sr-only" htmlFor="catalog-query">Buscar canciones externas</label>
        <input id="catalog-query" placeholder="Busca por artista, canción o género" value={query} maxLength={100} onChange={e=>setQuery(e.target.value)}/>
        <button type="submit" className="button primary small" disabled={busy}>{busy?'Buscando…':'Buscar'}</button>
      </form>}
      <div className="chip-row">{providerNames.map(x=><button type="button" key={x.id}
        className={'chip '+(provider===x.id?'active':'')} onClick={()=>setProvider(x.id)}>
        {x.label}{x.id!=='all'&&enabled[x.id]===false?' · sin configurar':''}
      </button>)}</div>
      {notice && <p className="explore-notice" role="status">{notice}</p>}
      {failed.length>0 && <p className="explore-notice">Algunas fuentes no respondieron: {failed.join(', ')}.</p>}
      {!embedded && !searched && <div className="explore-empty glass"><Headphones size={33}/><strong>Empieza por una búsqueda</strong><span>Jamendo, Openverse y Audius, según disponibilidad.</span></div>}
      {searched && !busy && tracks.length===0 && <div className="explore-empty glass">No encontramos canciones. Prueba otro término o proveedor.</div>}
      <div className="explore-grid">{tracks.map(item=>{
        const id=keyOf(item);
        const exists=saved.some(x=>keyOf(x)===id);
        return <article className="explore-card glass" key={item.id}>
          {isSafe(item.artworkUrl)?<img className="explore-art" alt={'Portada de '+item.title} src={item.artworkUrl} loading="lazy"/>:
          <div className="explore-art explore-placeholder"><Headphones size={32}/></div>}
          <div className="explore-card-content">
            <div className="explore-provider">{item.provider.toUpperCase()}</div>
            <strong>{item.title}</strong><span>{item.artist}</span>
            <small>{item.album || 'Colección externa'}</small>
            <div className="explore-links">
              <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer"><ExternalLink size={14}/> Fuente</a>
              {isSafe(item.licenseUrl)&&<a href={item.licenseUrl} target="_blank" rel="noopener noreferrer">Licencia</a>}
            </div>
            <div className="explore-actions">
              <button type="button" className="button secondary small" disabled={!item.canStream || !isSafe(item.streamUrl)} onClick={()=>play(item)}>
                <Headphones size={16}/> Escuchar
              </button>
              <button type="button" className="button secondary small" disabled={saving===id} onClick={()=>void save(item)}>
                {exists?<Check size={16}/>:<Bookmark size={16}/>} {exists?'Guardada':'Guardar'}
              </button>
            </div>
            <div className="explore-rights">Archivo en NÉBULA: no · {item.canDownload?'Descarga ofrecida por proveedor':'Sin descarga confirmada'}</div>
          </div>
        </article>;
      })}</div>
      {!embedded && <section className="content-section">
        <div className="section-heading"><h2>Mi colección externa</h2><span className="server-pill">{saved.length} referencias</span></div>
        {saved.length===0?<div className="explore-empty glass"><Bookmark size={25}/><strong>Aún no hay canciones externas guardadas</strong><span>Busca música y elige «Guardar» para encontrarla aquí cuando vuelvas a iniciar sesión.</span></div>:
          <div className="track-list glass">{saved.map(item=><div className="track-row" key={keyOf(item)}>
            <span className="track-descriptor" style={{flex:1}}>
              <strong>{item.title}</strong>
              <small>{item.artist} · {item.provider}</small>
            </span>
            {isSafe(item.sourceUrl) && <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" aria-label={'Ver fuente de '+item.title}><ExternalLink size={18}/></a>}
            <button type="button" className="icon-button" disabled={saving===keyOf(item)} aria-label={'Quitar '+item.title+' de la colección'} onClick={()=>void removeSavedReference(item)}><Bookmark size={18}/></button>
          </div>)}</div>}
      </section>}
      {!embedded && <MetadataLookup account={account}/>}
      {!embedded && <p className="disclosure">Guardar una referencia no importa audio. Las pistas externas dependen de sus fuentes y términos; la importación a R2 requiere autorización independiente.</p>}
    </>}
  </section>;
}
