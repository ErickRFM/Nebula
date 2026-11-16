/**
 * A private stream is reachable ONLY from an explicit loopback origin.
 * The MP3 bridge interface is available by default, but actual extraction requires
 * the user to run and pair their own authenticated localhost service.
 * Never allow arbitrary HTTP URLs, host aliases, alternate ports or credentials.
 * Operators may explicitly disable this feature at build time.
 */
export const BRIDGE_URL='http://127.0.0.1:4177';
export const BRIDGE_ENABLED=process.env.NEXT_PUBLIC_ENABLE_PRIVATE_BRIDGE!=='false';
// Debe coincidir con MAX_PLAYLIST_TRACKS de tools/private-bridge/limits.mjs; lo fija
// private-bridge.test.ts, que importa el módulo del puente directamente.
export const MAX_PLAYLIST_TRACKS=1000;
const TICKET=/^[A-Za-z0-9_-]{20,300}\.[A-Za-z0-9_-]{30,80}$/;
const JOB_ID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const JOB_STATUS=['running','completed','cancelled','error'] as const;
export function isPlayableExternalUrl(value:unknown,bridgeEnabled=BRIDGE_ENABLED):value is string {
 if(typeof value!=='string'||value.length>2048)return false;
 try{
  const u=new URL(value);
  if(u.username||u.password)return false;
  if(u.protocol==='https:')return true;
  return bridgeEnabled && u.origin===BRIDGE_URL && u.pathname==='/stream' &&
    u.searchParams.size===1 && TICKET.test(u.searchParams.get('ticket')||'') &&
    !u.hash;
 }catch{return false;}
}
export type BridgeVideo={id:string;title:string;artist:string;durationSeconds:number|null;sourceUrl:string};
export type YouTubeTarget={kind:'playlist'|'video';videoId:string|null;listId:string|null;canonicalUrl:string};
const VIDEO_RE=/^[A-Za-z0-9_-]{11}$/;
const LIST_RE=/^[A-Za-z0-9_-]{3,80}$/;
const YT_HOSTS=new Set(['youtube.com','www.youtube.com','m.youtube.com','music.youtube.com','youtu.be']);
export function parseYouTubeUrl(value:unknown):YouTubeTarget|null{
 if(typeof value!=='string'||value.length>2048)return null;
 let url:URL;
 try{url=new URL(value);}catch{return null;}
 if(url.protocol!=='https:'||url.username||url.password)return null;
 const host=url.hostname.toLowerCase();
 if(!YT_HOSTS.has(host))return null;
 const videoId=(host==='youtu.be'?url.pathname.slice(1):url.searchParams.get('v'))||null;
 const listId=url.searchParams.get('list');
 const safeVideo=videoId&&VIDEO_RE.test(videoId)?videoId:null;
 const safeList=listId&&LIST_RE.test(listId)?listId:null;
 if(!safeVideo&&!safeList)return null;
 if(safeList)return {kind:'playlist',videoId:safeVideo,listId:safeList,canonicalUrl:'https://www.youtube.com/playlist?list='+safeList};
 return {kind:'video',videoId:safeVideo,listId:null,canonicalUrl:'https://www.youtube.com/watch?v='+safeVideo};
}
export function bridgeEntries(payload:unknown):{items:BridgeVideo[];truncated:boolean}{
 const data=payload&&typeof payload==='object'?payload as {items?:unknown;truncated?:unknown}:null;
 const items=Array.isArray(data?.items)?data.items:[];
 return {
  items:items.slice(0,MAX_PLAYLIST_TRACKS).flatMap((raw):BridgeVideo[]=>{
   const item=raw&&typeof raw==='object'?raw as Record<string,unknown>:null;
   if(!item||typeof item.id!=='string'||!VIDEO_RE.test(item.id))return [];
   const sec=item.durationSeconds;
   return [{
    id:item.id,
    title:typeof item.title==='string'&&item.title?item.title.slice(0,180):'Sin título',
    artist:typeof item.artist==='string'&&item.artist?item.artist.slice(0,100):'YouTube',
    durationSeconds:typeof sec==='number'&&Number.isFinite(sec)&&sec>=0?sec:null,
    sourceUrl:'https://www.youtube.com/watch?v='+item.id,
   }];
  }),
  truncated:data?.truncated===true,
 };
}
export function bridgeVideos(payload:unknown):BridgeVideo[]{
 const data=payload&&typeof payload==='object'? (payload as {items?:unknown}).items:null;
 if(!Array.isArray(data))return [];
 return data.slice(0,10).flatMap((raw):BridgeVideo[]=>{
  const item=raw&&typeof raw==='object'?raw as Record<string,unknown>:null;
  if(!item||typeof item.id!=='string'||!/^[A-Za-z0-9_-]{11}$/.test(item.id))return [];
  const sec=item.durationSeconds;
  return [{
    id:item.id,title:typeof item.title==='string'?item.title.slice(0,180):'Sin título',
    artist:typeof item.artist==='string'?item.artist.slice(0,100):'YouTube',
    durationSeconds:typeof sec==='number'&&Number.isFinite(sec)&&sec>=0?sec:null,
    sourceUrl:'https://www.youtube.com/watch?v='+item.id,
  }];
 });
}
export type BridgeBatchStatus=(typeof JOB_STATUS)[number];
export type BridgeBatchJob={id:string;total:number;completed:number;saved:number;failed:number;
 status:BridgeBatchStatus;current:string|null;errorItems:string[];destination:string;note:string};
// El lote lo reporta el proceso local: cualquier respuesta malformada se ignora en lugar de
// mostrar un progreso inventado o un camino de archivos controlado por el servidor.
export function parseBatchJob(payload:unknown):BridgeBatchJob|null{
 const job=(payload&&typeof payload==='object'?payload as {job?:unknown}:null)?.job;
 if(!job||typeof job!=='object')return null;
 const value=job as Record<string,unknown>;
 if(typeof value.id!=='string'||!JOB_ID.test(value.id))return null;
 const total=value.total;
 if(typeof total!=='number'||!Number.isInteger(total)||total<1||total>MAX_PLAYLIST_TRACKS)return null;
 if(!JOB_STATUS.includes(value.status as BridgeBatchStatus))return null;
 const count=(item:unknown)=>typeof item==='number'&&Number.isInteger(item)&&item>=0&&item<=total?item:null;
 const completed=count(value.completed);
 const saved=count(value.saved);
 const failed=count(value.failed);
 if(completed===null||saved===null||failed===null||saved+failed>completed)return null;
 const errors=Array.isArray(value.errorItems)?value.errorItems.filter((id):id is string=>typeof id==='string'&&/^[A-Za-z0-9_-]{11}$/.test(id)).slice(0,30):[];
 const current=typeof value.current==='string'&&/^[A-Za-z0-9_-]{11}$/.test(value.current)?value.current:null;
 const destination=typeof value.destination==='string'?value.destination.slice(0,300):'';
 return {id:value.id,total,completed,saved,failed,status:value.status as BridgeBatchStatus,
  current,errorItems:errors,destination,
  note:typeof value.note==='string'?value.note.slice(0,200):''};
}
