import {randomUUID} from 'node:crypto';
import {join,resolve} from 'node:path';
import {homedir} from 'node:os';
import {mkdir} from 'node:fs/promises';

export const MAX_PLAYLIST_TRACKS=1000;
export const PLAYLIST_ID=/^[A-Za-z0-9_-]{10,90}$/;
const VIDEO_ID=/^[A-Za-z0-9_-]{11}$/;
const PREVIEW_TTL=20*60_000;
export function normalizePlaylist(payload){
 const raw=Array.isArray(payload?.entries)?payload.entries:[];
 const seen=new Set();
 const items=[];
 for(const entry of raw){
  if(items.length===MAX_PLAYLIST_TRACKS)break;
  if(!entry||typeof entry!=='object')continue;
  const candidate=entry.id||entry.url;
  const id=typeof candidate==='string'&&VIDEO_ID.test(candidate)?candidate:null;
  if(!id||seen.has(id)||entry.is_live===true||entry.live_status==='is_live')continue;
  seen.add(id);
  const secs=Number(entry.duration??NaN);
  items.push({id,title:String(entry.title||'Video '+id).slice(0,180),
   artist:String(entry.channel||entry.uploader||'YouTube').slice(0,100),
   durationSeconds:Number.isFinite(secs)&&secs>=0&&secs<=86400?Math.round(secs):null});
 }
 return {title:String(payload?.title||'Playlist de YouTube').slice(0,180),items,
  truncated:raw.length>=MAX_PLAYLIST_TRACKS};
}
export function createPlaylistBatchManager({runner,downloadDir,clock=Date.now}={}){
 const folder=resolve(downloadDir||join(homedir(),'Downloads','Nebula'));
 const previews=new Map();
 const jobs=new Map();
 let runningJob=null;
 const clean=()=>{
  for(const [id,item] of previews)if(item.expires<clock())previews.delete(id);
  while(previews.size>3)previews.delete(previews.keys().next().value);
  while(jobs.size>4)jobs.delete(jobs.keys().next().value);
 };
 async function load(listId){
  if(!PLAYLIST_ID.test(listId))throw Error('invalid_playlist_id');
  if(typeof runner.listPlaylist!=='function')throw Error('playlist_unavailable');
  const data=normalizePlaylist(await runner.listPlaylist(listId));
  if(!data.items.length)throw Error('playlist_empty_or_unavailable');
  previews.delete(listId);
  previews.set(listId,{ids:new Set(data.items.map(x=>x.id)),expires:clock()+PREVIEW_TTL});
  clean();
  return {...data,listId,total:data.items.length};
 }
 function status(id){
  const job=jobs.get(id);
  if(!job)return null;
  const {id:jobId,total,completed,saved,failed,status:state,current,errorItems}=job;
  return {id:jobId,total,completed,saved,failed,status:state,current,errorItems:[...errorItems],
   destination:'Descargas/Nebula',note:'Los archivos quedan guardados en el equipo que ejecuta el puente.'};
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
    }catch(err){
     if(job.abort.signal.aborted)break;
     job.failed++;
     if(job.errorItems.length<30)job.errorItems.push(item.id);
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
 function start(listId,ids){
  clean();
  if(!PLAYLIST_ID.test(listId))throw Error('invalid_playlist_id');
  const preview=previews.get(listId);
  if(!preview||preview.expires<=clock())throw Error('preview_expired');
  if(runningJob)throw Error('batch_busy');
  if(!Array.isArray(ids)||ids.length<1||ids.length>MAX_PLAYLIST_TRACKS||
   ids.some(id=>typeof id!=='string'||!VIDEO_ID.test(id)||!preview.ids.has(id))||
   new Set(ids).size!==ids.length)throw Error('invalid_selection');
  const job={id:randomUUID(),items:[...ids],total:ids.length,completed:0,
   saved:0,failed:0,status:'running',current:null,errorItems:[],abort:new AbortController()};
  jobs.set(job.id,job);runningJob=job;clean();
  queueMicrotask(()=>{void run(job);});
  return status(job.id);
 }
 function cancel(id){
  const job=jobs.get(id);
  if(!job)return null;
  if(job.status==='running')job.abort.abort();
  return status(id);
 }
 function shutdown(){if(runningJob)runningJob.abort.abort();}
 return {load,start,status,cancel,shutdown};
}
