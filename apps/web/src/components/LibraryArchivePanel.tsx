'use client';
import {useEffect,useRef,useState,type ChangeEvent} from 'react';
import {Archive,Download,FolderOpen} from 'lucide-react';
import {createMusicArchive,readMusicArchive,ZIP_MAX_BYTES,ZIP_MAX_FILES} from '../lib/music-zip';
import {loadSavedSongs} from '../lib/local-library';
import {downloadLocalAudioBlob} from '../lib/local-audio-download';

export function LibraryArchivePanel({onImport,localCount}:{
 onImport:(files:File[])=>void;localCount:number;
}){
 const [busy,setBusy]=useState(false);
 const [status,setStatus]=useState('');
 const [error,setError]=useState('');
 const alive=useRef(true);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 async function downloadArchive(){
  if(busy)return;setBusy(true);setStatus('');setError('');
  try{
   const saved=await loadSavedSongs();
   if(!saved.length)throw Error('No hay archivos locales guardados para exportar.');
   if(saved.length>ZIP_MAX_FILES)throw Error('Hay más de '+ZIP_MAX_FILES+' canciones. Exporta un lote más pequeño.');
   const blob=await createMusicArchive(saved);
   if(!alive.current)return;
   downloadLocalAudioBlob(blob,'Nebula-Audios-'+new Date().toISOString().slice(0,10)+'.zip');
   setStatus('ZIP creado con '+saved.length+' canción(es), en sus formatos originales. Guarda tu copia de seguridad.');
  }catch(cause){if(alive.current)setError(cause instanceof Error?cause.message:'No se pudo crear el ZIP.');}
  finally{if(alive.current)setBusy(false);}
 }
 async function restore(event:ChangeEvent<HTMLInputElement>){
  const archive=event.target.files?.[0];
  event.target.value='';
  if(!archive||busy)return;
  setBusy(true);setError('');setStatus('');
  try{
   if(!archive.name.toLowerCase().endsWith('.zip'))throw Error('Selecciona un ZIP musical exportado por NÉBULA.');
   if(archive.size>ZIP_MAX_BYTES+10*1024*1024)throw Error('El ZIP excede el límite seguro de 130 MB.');
   const songs=await readMusicArchive(archive);
   if(!alive.current)return;
   onImport(songs);
   setStatus(songs.length+' archivos de audio recuperados del ZIP. NÉBULA los está guardando en este navegador.');
  }catch(cause){if(alive.current)setError(cause instanceof Error?cause.message:'El ZIP no es válido.');}
  finally{if(alive.current)setBusy(false);}
 }
 return <section className="content-section nebula-archive" aria-label="Respaldo musical en ZIP">
  <div className="section-heading"><h2><Archive size={19} aria-hidden="true"/> Respaldo de tus canciones</h2></div>
  <p className="page-description">Exporta los archivos musicales de este navegador en un solo ZIP y recupéralos en otro equipo. Tus canciones no se envían a servidores externos.</p>
  <div className="nebula-archive-actions glass">
   <button type="button" className="button primary small" onClick={()=>{void downloadArchive();}} disabled={busy||localCount===0}><Download size={16}/> Descargar mi música (.zip)</button>
   <label className="nebula-archive-restore"><FolderOpen size={17}/> Restaurar ZIP local
    <input aria-label="Restaurar ZIP de canciones" type="file" accept=".zip,application/zip" disabled={busy}
     onChange={event=>{void restore(event);}}/>
   </label>
  </div>
  <p className="disclosure">Máximo {ZIP_MAX_FILES} canciones y 120 MB por lote. Conservará MP3, WAV, FLAC y otros archivos sin recomprimirlos. No incluye playlists de cuenta ni datos de otros familiares.</p>
  {busy&&<p role="status">Procesando los archivos musicales…</p>}
  {status&&<p role="status" className="disclosure">{status}</p>}
  {error&&<p role="alert" className="account-error">{error}</p>}
 </section>;
}
