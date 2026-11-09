import {VIDEO_ID} from './bridge-core.mjs';

const HOSTS=new Set(['youtube.com','www.youtube.com','m.youtube.com','music.youtube.com','youtu.be']);
const PLAYLIST_ID=/^[A-Za-z0-9_-]{3,80}$/;
export const MAX_RESOLVE_ENTRIES=200;

// The URL handed to yt-dlp must never look like an option and must stay on an allowlisted host.
export function sanitizeYouTubeUrl(value){
 if(typeof value!=='string'||value.length>2048)return null;
 let url;
 try{url=new URL(value);}catch{return null;}
 if(url.protocol!=='https:'||url.username||url.password||url.hash)return null;
 if(!HOSTS.has(url.hostname.toLowerCase()))return null;
 const host=url.hostname.toLowerCase();
 const videoId=host==='youtu.be'?url.pathname.slice(1):url.searchParams.get('v');
 const listId=url.searchParams.get('list');
 if(listId!==null){
  if(!PLAYLIST_ID.test(listId))return null;
  if(videoId!==null && !VIDEO_ID.test(videoId))return null;
  const clean=new URL('https://www.youtube.com/playlist');
  clean.searchParams.set('list',listId);
  return clean.toString();
 }
 if(videoId!==null){
  if(!VIDEO_ID.test(videoId))return null;
  const clean=new URL('https://www.youtube.com/watch');
  clean.searchParams.set('v',videoId);
  const index=url.searchParams.get('index');
  if(index!==null && /^\d{1,6}$/.test(index))clean.searchParams.set('index',index);
  return clean.toString();
 }
 return null;
}

export function normalizeEntries(payload,maxEntries=MAX_RESOLVE_ENTRIES){
 const raw=Array.isArray(payload?.entries)?payload.entries:[];
 const seen=new Set();
 const items=[];
 for(const entry of raw){
  if(items.length>=maxEntries)break;
  if(!entry||typeof entry!=='object')continue;
  if(entry.is_live===true||entry.live_status==='is_live')continue;
  if(typeof entry.id!=='string'||!VIDEO_ID.test(entry.id)||seen.has(entry.id))continue;
  const duration=Number(entry.duration);
  seen.add(entry.id);
  items.push({
   id:entry.id,
   title:String(entry.title||'Sin título').slice(0,180),
   artist:String(entry.channel||entry.uploader||'YouTube').slice(0,100),
   durationSeconds:Number.isFinite(duration)&&duration>=0&&duration<=86400?Math.round(duration):null,
   sourceUrl:'https://www.youtube.com/watch?v='+entry.id,
  });
 }
 return {items,truncated:raw.length>items.length};
}
