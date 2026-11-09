/**
 * A private stream is reachable ONLY from an explicit loopback origin.
 * The MP3 bridge interface is available by default, but actual extraction requires
 * the user to run and pair their own authenticated localhost service.
 * Never allow arbitrary HTTP URLs, host aliases, alternate ports or credentials.
 * Operators may explicitly disable this feature at build time.
 */
export const BRIDGE_URL='http://127.0.0.1:4177';
export const BRIDGE_ENABLED=process.env.NEXT_PUBLIC_ENABLE_PRIVATE_BRIDGE!=='false';
const TICKET=/^[A-Za-z0-9_-]{20,300}\.[A-Za-z0-9_-]{30,80}$/;
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
  items:items.slice(0,200).flatMap((raw):BridgeVideo[]=>{
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
