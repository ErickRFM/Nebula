'use client';

import {useEffect,useRef,useState,type ChangeEvent} from 'react';
import {Download,Music2,RefreshCw,Square} from 'lucide-react';
import {convertOwnedAudioToMp3,MAX_CONVERT_BATCH,validateConversionFile} from '../lib/mp3-converter';
import {downloadLocalAudioBlob} from '../lib/local-audio-download';

export function Mp3ConvertPanel({onImport}:{onImport:(files:File[])=>void}){
 const [input,setInput]=useState<File[]>([]);
 const [bitrate,setBitrate]=useState<128|160|192|256>(192);
 const [results,setResults]=useState<File[]>([]);
 const [busy,setBusy]=useState(false);
 const [progress,setProgress]=useState(0);
 const [current,setCurrent]=useState('');
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 const controller=useRef<AbortController|null>(null);
 useEffect(()=>()=>controller.current?.abort(),[]);
 function select(event:ChangeEvent<HTMLInputElement>){
  const files=Array.from(event.target.files??[]);
  event.target.value='';
  setError('');setNotice('');setResults([]);setInput([]);
  if(files.length>MAX_CONVERT_BATCH){setError('Máximo '+MAX_CONVERT_BATCH+' canciones por lote.');return;}
  try{files.forEach(validateConversionFile);}
  catch(cause){setError(cause instanceof Error?cause.message:'Formato de audio no permitido.');return;}
  setInput(files);
 }
 async function convert(){
  if(busy||!input.length)return;
  const task=new AbortController();
  controller.current=task;
  setBusy(true);setError('');setNotice('');setProgress(0);setResults([]);
  let success=0;
  try{
   for(const [i,file] of input.entries()){
    if(task.signal.aborted)throw new Error('Conversión cancelada.');
    setCurrent(file.name);
    const mp3=await convertOwnedAudioToMp3(file,{bitrate,signal:task.signal,onProgress:p=>setProgress(Math.round((i+p/100)*100/input.length))});
    if(task.signal.aborted)throw new Error('Conversión cancelada.');
    // Existing NÉBULA ingestion adds metadata, saves to IndexedDB, and makes it playable.
    onImport([mp3]);
    setResults(old=>[...old,mp3]);
    success++;
   }
   setNotice(success+' archivo(s) MP3 generados y enviados a Biblioteca. Los originales no se modificaron.');
  }catch(cause){
   setError(cause instanceof Error?cause.message:'No fue posible convertir el audio.');
  }finally{
   if(controller.current===task)controller.current=null;
   setBusy(false);setCurrent('');setProgress(0);
  }
 }
 return <section className="content-section mp3-converter-panel" aria-label="Conversor MP3 interno">
  <div className="section-heading"><h2><RefreshCw size={19} aria-hidden="true"/> Convertir audio a MP3</h2></div>
  <p className="page-description">Convierte tus archivos de audio compatibles a MP3 directamente en este dispositivo y añádelos a NÉBULA. Sin páginas de conversión, cuentas ni subir los archivos al servidor.</p>
  <div className="mp3-converter-card glass">
   <label className="mp3-converter-field" htmlFor="nebula-converter-file">Elegir archivos de audio</label>
   <input id="nebula-converter-file" aria-label="Archivos de audio para convertir a MP3" type="file" multiple disabled={busy}
    accept="audio/*,.mp3,.wav,.m4a,.ogg,.flac,.aac,.opus" onChange={select}/>
   <p className="disclosure">Hasta {MAX_CONVERT_BATCH} archivos por lote, máximo 25 MB y 10 minutos por canción. Algunos formatos dependen de tu navegador.</p>
   <label className="mp3-converter-field" htmlFor="nebula-mp3-bitrate">Calidad de MP3</label>
   <select id="nebula-mp3-bitrate" disabled={busy} value={bitrate} onChange={e=>setBitrate(Number(e.target.value) as 128|160|192|256)}>
    <option value={128}>128 kbps — ligero</option>
    <option value={160}>160 kbps — equilibrado</option>
    <option value={192}>192 kbps — recomendado</option>
    <option value={256}>256 kbps — más calidad</option>
   </select>
   {input.length>0&&<p className="mp3-selection-note">{input.length} archivo(s): {input.map(f=>f.name).join(' · ')}</p>}
   <div className="mp3-converter-actions">
    <button type="button" className="button primary small" disabled={!input.length||busy} onClick={()=>{void convert();}}><Music2 size={16}/> Convertir y añadir a Biblioteca</button>
    {busy&&<button type="button" className="button secondary small" onClick={()=>controller.current?.abort()}><Square size={14}/> Cancelar</button>}
   </div>
   {busy&&<div role="status" className="mp3-converter-progress">
    <span>Convirtiendo {current} — {progress}%</span>
    <progress max={100} value={progress} aria-label="Progreso de conversión MP3"/>
   </div>}
   {notice&&<p role="status" className="disclosure">{notice}</p>}
   {error&&<p role="alert" className="account-error">{error}</p>}
  </div>
  {results.length>0&&<div className="mp3-converter-results" aria-label="Archivos MP3 generados">
   {results.map((file,i)=><div className="mp3-converted-row" key={i}>
    <span>{file.name} <small>MP3 · {Math.max(1,Math.round(file.size/1024))} KB</small></span>
    <button type="button" className="button secondary small" aria-label={'Guardar MP3 '+file.name}
     onClick={()=>{try{downloadLocalAudioBlob(file,file.name);}catch(e){setError(e instanceof Error?e.message:'No se pudo guardar el archivo.');}}}>
     <Download size={15}/> Guardar MP3
    </button>
   </div>)}
  </div>}
 </section>;
}
