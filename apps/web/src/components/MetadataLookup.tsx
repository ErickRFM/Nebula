'use client';
import {useState, type FormEvent} from 'react';
import {ExternalLink, Search, Disc3} from 'lucide-react';
import type {AccountApi} from '../hooks/useAccount';

interface Match {
  recordingId:string; title:string; artist:string;
  album:string|null; releaseId:string|null;
  durationSeconds:number|null; score:number|null;
  sourceUrl:string; coverArtCandidate:string|null;
}
const api=process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/,'') ?? '';

export function MetadataLookup({account}:{account:AccountApi}) {
  const [query,setQuery]=useState('');
  const [loading,setLoading]=useState(false);
  const [results,setResults]=useState<Match[]>([]);
  const [searched,setSearched]=useState(false);
  const [error,setError]=useState('');

  async function search(e:FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const q=query.trim();
    if(q.length<2 || !account.accessToken || !api){setError('Necesitas una búsqueda de al menos dos caracteres y una sesión activa.');return;}
    setLoading(true);setError('');setSearched(true);
    try{
      const response=await fetch(api+'/v1/metadata/musicbrainz?'+new URLSearchParams({q,limit:'10'}),{
        headers:{Authorization:'Bearer '+account.accessToken},cache:'no-store',
      });
      if(!response.ok) throw new Error(response.status===429?'Límite de consultas. Inténtalo después.':
        response.status===401?'La sesión caducó. Inicia sesión de nuevo.':
        'No se pudo consultar MusicBrainz.');
      const data=await response.json() as {items?:unknown};
      if(!Array.isArray(data.items))throw new Error('Respuesta inesperada del catálogo.');
      setResults(data.items as Match[]);
    }catch(e){setResults([]);setError(e instanceof Error?e.message:'Ocurrió un error.');}
    finally{setLoading(false);}
  }

  return <section className="content-section">
    <div className="section-heading"><h2>Identificar música · MusicBrainz</h2></div>
    <p className="page-description">Consulta artistas, álbumes y grabaciones para comparar metadatos. No descarga música ni modifica tus archivos.</p>
    <form className="explore-form glass" onSubmit={(event)=>void search(event)}>
      <Search size={19}/><label className="sr-only" htmlFor="metadata-query">Buscar metadatos musicales</label>
      <input id="metadata-query" maxLength={100} placeholder="Título, álbum o artista" value={query} onChange={e=>setQuery(e.target.value)}/>
      <button type="submit" className="button secondary small" disabled={loading}>{loading?'Consultando…':'Identificar'}</button>
    </form>
    {error&&<p role="alert" className="explore-notice">{error}</p>}
    {searched&&!loading&&results.length===0&&!error&&<p className="disclosure">Sin coincidencias; prueba con una búsqueda más específica.</p>}
    {results.length>0&&<div className="track-list glass metadata-results">{results.map(match=>
      <div className="track-row" key={match.recordingId}>
        <Disc3 size={22}/>
        <span className="track-descriptor" style={{flex:1}}>
          <strong>{match.title}</strong>
          <small>{match.artist} · {match.album??'Álbum sin identificar'} {match.score!==null?'· Coincidencia '+match.score+'%':''}</small>
        </span>
        <a href={match.sourceUrl} target="_blank" rel="noopener noreferrer" aria-label={'Abrir coincidencia de '+match.title} title="Revisar en MusicBrainz"><ExternalLink size={18}/></a>
      </div>
    )}</div>}
    <p className="disclosure">Estas coincidencias son propuestas, no correcciones automáticas de la biblioteca. La portada puede no estar disponible y debe verificarse por separado.</p>
  </section>;
}
