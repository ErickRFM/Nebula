'use client';

import {useEffect,useRef,useState,type FormEvent} from 'react';
import {Download,Link2,Music2} from 'lucide-react';
import {directAudioFileInfo,retrieveAuthorizedAudio} from '../lib/authorized-web-audio';
import {downloadLocalAudioBlob} from '../lib/local-audio-download';

export function Mp3UrlImport({onImport}:{onImport:(files:File[])=>void}){
 const [url,setUrl]=useState('');
 const [authorized,setAuthorized]=useState(false);
 const [fetching,setFetching]=useState(false);
 const [percent,setPercent]=useState<number|null>(null);
 const [file,setFile]=useState<File|null>(null);
 const [message,setMessage]=useState('');
 const [error,setError]=useState('');
 const controller=useRef<AbortController|null>(null);
 useEffect(()=>()=>controller.current?.abort(),[]);
 async function importMp3(event:FormEvent<HTMLFormElement>){
  event.preventDefault();
  if(fetching)return;
  setError('');setMessage('');setFile(null);setPercent(null);
  const direct=directAudioFileInfo(url);
  if(!direct||direct.extension!=='mp3'){
   setError('Es necesario un enlace HTTPS directo a un archivo .mp3. Las páginas de YouTube o Deezer no son archivos MP3.');
   return;
  }
  if(!authorized){setError('Confirma que tienes permiso para descargar y guardar este audio.');return;}
  const next=new AbortController();
  controller.current=next;setFetching(true);
  try{
   const downloaded=await retrieveAuthorizedAudio(direct.url,next.signal,setPercent);
   if(next.signal.aborted)return;
   if(!['audio/mpeg','audio/mp3'].includes(downloaded.type))throw new Error('El servidor no entregó un MP3.');
   setFile(downloaded);
   onImport([downloaded]);
   setMessage('MP3 recibido: '+downloaded.name+'. Se está agregando a tu biblioteca local. Puedes guardar una copia en Descargas.');
   setUrl('');setAuthorized(false);
  }catch(failure){
   if(!next.signal.aborted)setError(failure instanceof Error?failure.message:'No se pudo importar el audio.');
  }finally{
   if(controller.current===next)controller.current=null;
   setFetching(false);
  }
 }
 return <section className="content-section mp3-url-import" aria-label="Descargar MP3 autorizado e importarlo">
  <div className="section-heading"><h2><Music2 size={19} aria-hidden="true"/> Importar MP3 de un enlace</h2></div>
  <p className="page-description">Pega una dirección HTTPS que termine en <code>.mp3</code> y permita descargar el archivo. NÉBULA lo recibe en tu navegador y lo guarda en esta biblioteca; no lo envía a Vercel ni a otros dispositivos.</p>
  <form className="authorized-web-import glass" onSubmit={event=>{void importMp3(event);}}>
   <label htmlFor="local-mp3-url">URL directa del MP3</label>
   <div className="mp3-input-row"><Link2 size={19} aria-hidden="true"/>
    <input id="local-mp3-url" type="url" required value={url} disabled={fetching}
     placeholder="https://archivos-permitidos.example/cancion.mp3"
     onChange={event=>{setUrl(event.target.value);setError('');setFile(null);}}/>
   </div>
   <label className="authorized-web-confirm">
    <input type="checkbox" checked={authorized} disabled={fetching} onChange={event=>setAuthorized(event.target.checked)}/>
    Confirmo que tengo permiso para descargar y guardar este MP3.
   </label>
   <button className="button primary small" type="submit" disabled={!url.trim()||!authorized||fetching}>
    <Download size={16}/> {fetching?'Descargando…':'Descargar e importar a Biblioteca'}
   </button>
   <p className="disclosure">Máximo 100 MB. El servidor debe permitir CORS y entregar audio MP3 auténtico. No funciona pegando una página de YouTube, Spotify o Deezer.</p>
  </form>
  {fetching&&<div role="status">Descargando MP3… {percent===null?'':percent+'%'}</div>}
  {fetching&&<button className="button secondary small" type="button" onClick={()=>controller.current?.abort()}>Cancelar</button>}
  {message&&<p role="status" className="disclosure">{message}</p>}
  {file&&<button className="button secondary small" type="button" onClick={()=>{try{downloadLocalAudioBlob(file,file.name);}catch(e){setError(e instanceof Error?e.message:'No se pudo descargar el MP3.');}}}>
   <Download size={16}/> Guardar copia MP3 en Descargas
  </button>}
  {error&&<p role="alert" className="account-error">{error}</p>}
 </section>;
}
