'use client';
import {useEffect,useState} from 'react';
import {Cloud,Play,RefreshCw} from 'lucide-react';
import type {AccountApi} from '../hooks/useAccount';
import type {Track} from '../lib/catalog';
import {artwork} from '../lib/catalog';

type CloudTrack={id:string;title:string;artist:string;album?:string;genre?:string;byteSize:number;createdAt:string};
type SearchPage={items:CloudTrack[];nextCursor:string|null;hasMore:boolean};
const PAGE_SIZE=25;

/** Indexed on the server and scoped by the bearer principal; never download an entire library. */
export function CloudSearchResults({query,account,onAccount,onPlay}:{
  query:string;account:AccountApi;onAccount:()=>void;onPlay:(track:Track)=>void;
}){
  const [items,setItems]=useState<CloudTrack[]>([]);
  const [cursor,setCursor]=useState<string|null>(null);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');
  const [playingId,setPlayingId]=useState<string|null>(null);
  const [reload,setReload]=useState(0);
  const [moreBusy,setMoreBusy]=useState(false);

  useEffect(()=>{
    setItems([]);setCursor(null);setError('');
    if(!account.user||query.trim().length<2)return;
    let active=true;
    setLoading(true);
    const timer=setTimeout(()=>{
      const args=new URLSearchParams({q:query.trim(),limit:String(PAGE_SIZE)});
      void account.cloudRequest<SearchPage>('/v1/library/cloud/search?'+args).then(data=>{
        if(!active)return;
        setItems(Array.isArray(data.items)?data.items:[]);setCursor(data.nextCursor);
      }).catch(cause=>{
        if(active)setError(cause instanceof Error?cause.message:'No se pudo consultar tu música en la nube.');
      }).finally(()=>{if(active)setLoading(false);});
    },320);
    return()=>{active=false;clearTimeout(timer);};
  },[account.user?.id,account.cloudRequest,query,reload]);
  async function more(){
    if(!cursor||moreBusy)return;
    const forCursor=cursor;setMoreBusy(true);setError('');
    try{
      const args=new URLSearchParams({q:query.trim(),limit:String(PAGE_SIZE),cursor:forCursor});
      const data=await account.cloudRequest<SearchPage>('/v1/library/cloud/search?'+args);
      if(forCursor!==cursor)return;
      setItems(previous=>{
        const seen=new Set(previous.map(i=>i.id));
        return [...previous,...data.items.filter(item=>!seen.has(item.id))];
      });
      setCursor(data.nextCursor);
    }catch(cause){setError(cause instanceof Error?cause.message:'No se pudieron cargar más canciones.');}
    finally{setMoreBusy(false);}
  }
  async function play(item:CloudTrack){
    setPlayingId(item.id);setError('');
    try{
      const result=await account.cloudRequest<{url:string}>('/v1/library/cloud/'+encodeURIComponent(item.id)+'/play');
      const url=new URL(result.url);
      if(url.protocol!=='https:')throw new Error('URL temporal de audio insegura.');
      onPlay({id:'cloud-'+item.id,title:item.title,artist:item.artist,album:item.album||'NÉBULA Cloud',
        genre:item.genre||'Mi música',cover:artwork[0],duration:'--:--',audioUrl:url.toString(),source:'external'});
    }catch(cause){setError(cause instanceof Error?cause.message:'No fue posible reproducir la canción privada.');}
    finally{setPlayingId(null);}
  }
  if(query.trim().length<2)return null;
  return <section className="content-section cloud-search" aria-label="Resultados de tu música en la nube">
    <div className="section-heading"><div><h2><Cloud size={19}/> Tu música en la nube</h2><p className="search-section-note">Búsqueda privada con páginas de {PAGE_SIZE} pistas</p></div>
      {account.user&&<button type="button" className="icon-button glass-chip" aria-label="Actualizar música en la nube" disabled={loading||moreBusy} onClick={()=>setReload(v=>v+1)}><RefreshCw size={17}/></button>}
    </div>
    {!account.user?<div className="search-start glass"><span>Inicia sesión para buscar las canciones de tu R2 privado.</span><button type="button" className="button secondary small" onClick={onAccount}>Mi cuenta</button></div>:
      loading?<div className="search-start glass" role="status">Buscando en tu nube…</div>:
      items.length===0&&!error?<p className="empty-note glass">No encontramos pistas coincidentes en tu nube. Sube música desde Biblioteca.</p>:
      <div className="track-list glass">{items.map(item=><div className="track-row" key={item.id}>
        <span className="cloud-track-icon"><Cloud size={17}/></span>
        <span className="track-descriptor"><strong>{item.title}</strong><small>{item.artist} · {item.album||'NÉBULA Cloud'}</small></span>
        <button type="button" className="button secondary small" disabled={playingId!==null} onClick={()=>{void play(item);}}><Play size={15}/>{playingId===item.id?'Abriendo…':'Reproducir'}</button>
      </div>)}</div>}
    {error&&<p role="alert" className="account-error">{error}</p>}
    {cursor&&<button type="button" className="button secondary small" disabled={loading||moreBusy} onClick={()=>{void more();}}>{moreBusy?'Cargando…':'Mostrar más canciones'}</button>}
  </section>;
}
