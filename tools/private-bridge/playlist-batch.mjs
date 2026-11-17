import {randomUUID} from 'node:crypto';
import {join,resolve} from 'node:path';
import {homedir} from 'node:os';
import {mkdir} from 'node:fs/promises';
import {MAX_PLAYLIST_TRACKS} from './limits.mjs';

const VIDEO_ID=/^[A-Za-z0-9_-]{11}$/;
const PREVIEW_TTL=20*60_000;
const MAX_PREVIEWS=4;
const MAX_JOBS=4;
const MAX_ERROR_ITEMS=30;
export const DEFAULT_DOWNLOAD_DIR=join(homedir(),'Downloads','Nebula');

// Un lote se apoya en la lista que /resolve ya devolvió: no existe un segundo endpoint que
// vuelva a enumerar la playlist. Así la interfaz y el puente siempre hablan de las mismas pistas.
export function createPlaylistBatchManager({runner,downloadDir,clock=Date.now}={}){
 const folder=resolve(downloadDir||DEFAULT_DOWNLOAD_DIR);
 const previews=new Map();
 const jobs=new Map();
 let runningJob=null;
 function clean(){
  const now=clock();
  for(const [key,preview] of previews) if(preview.expires<=now) previews.delete(key);
  while(previews.size>MAX_PREVIEWS) previews.delete(previews.keys().next().value);
  while(jobs.size>MAX_JOBS) jobs.delete(jobs.keys().next().value);
 }
 function remember(key,items){
  if(typeof key!=='string'||key.length<1||key.length>2048||!Array.isArray(items))return;
  const ids=new Set();
  for(const item of items) if(item&&typeof item.id==='string'&&VIDEO_ID.test(item.id)) ids.add(item.id);
  if(!ids.size)return;
  previews.set(key,{ids,expires:clock()+PREVIEW_TTL});
  clean();
 }
 function status(id){
  const job=jobs.get(id);
  if(!job)return null;
  const {id:jobId,total,completed,saved,failed,status:state,current,errorItems}=job;
  return {id:jobId,total,completed,saved,failed,status:state,current,
   errorItems:[...errorItems],destination:folder,
   note:'Los archivos se guardan en el equipo que ejecuta el puente.'};
 }
 async function run(job){
  try{
   await mkdir(folder,{recursive:true,mode:0o700});
   for(const id of job.items){
    if(job.abort.signal.aborted)break;
    job.current=id;
    try{
     await runner.downloadOne(id,{directory:folder,signal:job.abort.signal});
     if(job.abort.signal.aborted)break;
     job.saved++;
    }catch{
     if(job.abort.signal.aborted)break;
     job.failed++;
     if(job.errorItems.length<MAX_ERROR_ITEMS)job.errorItems.push(id);
    }
    job.completed++;
   }
   job.status=job.abort.signal.aborted?'cancelled':'completed';
  }catch{
   job.status=job.abort.signal.aborted?'cancelled':'error';
   if(!job.abort.signal.aborted)job.failed++;
  }finally{
   job.current=null;
   if(runningJob===job)runningJob=null;
  }
 }
 function start(key,ids){
  clean();
  if(typeof key!=='string'||key.length>2048)throw Error('invalid_playlist_url');
  if(typeof runner.downloadOne!=='function')throw Error('batch_unavailable');
  const preview=previews.get(key);
  if(!preview)throw Error('preview_expired');
  if(runningJob)throw Error('batch_busy');
  if(!Array.isArray(ids)||ids.length<1||ids.length>MAX_PLAYLIST_TRACKS||
   ids.some(id=>typeof id!=='string'||!VIDEO_ID.test(id)||!preview.ids.has(id))||
   new Set(ids).size!==ids.length)throw Error('invalid_selection');
  const job={id:randomUUID(),items:[...ids],total:ids.length,completed:0,saved:0,failed:0,
   status:'running',current:null,errorItems:[],abort:new AbortController()};
  jobs.set(job.id,job);
  runningJob=job;
  clean();
  queueMicrotask(()=>{void run(job);});
  return status(job.id);
 }
 function cancel(id){
  const job=jobs.get(id);
  if(!job)return null;
  // La cancelación se responde ya detenida: la pista en curso puede tardar en morir y
  // un progreso que siga diciendo «running» haría reintentar el lote al usuario.
  if(job.status==='running'){job.abort.abort();job.status='cancelled';}
  return status(id);
 }
 function shutdown(){
  if(!runningJob)return;
  runningJob.abort.abort();
  if(runningJob.status==='running')runningJob.status='cancelled';
 }
 return {remember,start,status,cancel,shutdown};
}
