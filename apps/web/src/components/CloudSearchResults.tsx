'use client';

import {useEffect,useMemo,useState} from 'react';
import {Cloud,Play,RefreshCw} from 'lucide-react';
import type {AccountApi} from '../hooks/useAccount';
import type {Track} from '../lib/catalog';
import {artwork} from '../lib/catalog';
import {searchCloudTracks,type IndexedCloudTrack} from '../lib/cloud-search';

type CloudList={items:IndexedCloudTrack[]};

/** The same authenticated /v1/library/cloud contract as CloudLibrary; no duplicate backend. */
export function CloudSearchResults({query,account,onAccount,onPlay}:{
  query:string;account:AccountApi;onAccount:()=>void;onPlay:(track:Track)=>void;
}) {
  const [items,setItems]=useState<IndexedCloudTrack[]>([]);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');
  const [playingId,setPlayingId]=useState<string|null>(null);
  const [reload,setReload]=useState(0);
  useEffect(()=>{
    if(!account.user){setItems([]);setError('');return;}
    let alive=true;
    setLoading(true);setError('');
    void account.cloudRequest<CloudList>('/v1/library/cloud').then(data=>{
      if(alive)setItems(Array.isArray(data.items)?data.items:[]);
    }).catch(reason=>{
      if(alive){setItems([]);setError(reason instanceof Error?reason.message:'No pudimos consultar tu biblioteca en la nube.');}
    }).finally(()=>{if(alive)setLoading(false);});
    return()=>{alive=false;};
  },[account.user?.id,account.cloudRequest,reload]);

  const matches=useMemo(()=>searchCloudTracks(items,query),[items,query]);
  async function play(track:IndexedCloudTrack) {
    setPlayingId(track.id);setError('');
    try {
      const result=await account.cloudRequest<{url:string}>('/v1/library/cloud/'+encodeURIComponent(track.id)+'/play');
      const url=new URL(result.url);
      if(url.protocol!=='https:')throw new Error('La URL de reproducción privada no es segura.');
      onPlay({
        id:'cloud-'+track.id,title:track.title,artist:track.artist,album:'NÉBULA Cloud',
        genre:'Mi música',cover:artwork[0],duration:'--:--',audioUrl:url.toString(),source:'external',
      });
    } catch(reason) {
      setError(reason instanceof Error?reason.message:'No se pudo abrir la canción privada.');
    } finally {setPlayingId(null);}
  }
  if(query.trim().length<2)return null;
  return <section className="content-section cloud-search" aria-label="Resultados de tu música en la nube">
    <div className="section-heading">
      <div><h2><Cloud size={19}/> Tu música en la nube</h2><p className="search-section-note">Canciones privadas de tu cuenta NÉBULA</p></div>
      {account.user&&<button className="icon-button glass-chip" type="button" aria-label="Actualizar música en la nube" disabled={loading} onClick={()=>setReload(value=>value+1)}><RefreshCw size={17}/></button>}
    </div>
    {!account.user ? <div className="search-start glass"><span>Inicia sesión para incluir las canciones que subiste a R2.</span><button type="button" className="button secondary small" onClick={onAccount}>Mi cuenta</button></div> :
      loading ? <div className="search-start glass">Buscando en tu biblioteca privada…</div> :
      error ? <p className="account-error" role="alert">{error}</p> :
      matches.length===0 ? <p className="empty-note glass">No hay coincidencias en tu nube. Puedes subir tu música desde Biblioteca.</p> :
      <div className="track-list glass">{matches.slice(0,20).map(item=>
        <div className="track-row" key={item.id}>
          <span className="cloud-track-icon"><Cloud size={17}/></span>
          <span className="track-descriptor"><strong>{item.title}</strong><small>{item.artist} · NÉBULA Cloud</small></span>
          <button type="button" className="button secondary small" disabled={playingId!==null} onClick={()=>{void play(item);}}><Play size={15}/>{playingId===item.id?'Abriendo…':'Reproducir'}</button>
        </div>
      )}</div>}
    {matches.length>20&&<p className="search-section-note">Mostrando 20 de {matches.length} coincidencias en tu nube.</p>}
  </section>;
}
