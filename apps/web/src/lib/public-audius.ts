export type PublicAudiusTrack={
 id:string;title:string;artist:string;artworkUrl:string|null;
 streamUrl:string;sourceUrl:string;durationSeconds:number|null;
};
function obj(value:unknown):Record<string,unknown>|null{
 return value!==null&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:null;
}
function clean(value:unknown,fallback:string):string{
 return typeof value==='string'&&value.trim()?value.trim().slice(0,160):fallback;
}
function safeArtwork(value:unknown):string|null{
 if(typeof value!=='string'||value.length>2048)return null;
 try{
  const url=new URL(value);
  return url.protocol==='https:'&&!url.username&&!url.password&&!url.port?url.href:null;
 }catch{return null;}
}
function safePermalink(value:unknown):string|null{
 if(typeof value!=='string'||value.length>2048)return null;
 try{
  if(!value.startsWith('https://')&&!(value.startsWith('/')&&!value.startsWith('//')))return null;
  const url=new URL(value,'https://audius.co');
  return url.protocol==='https:'&&!url.username&&!url.password&&!url.port&&
   ['audius.co','www.audius.co'].includes(url.hostname.toLowerCase())?url.href:null;
 }catch{return null;}
}
/** Read-only public Audius API data; no arbitrary audio URLs are trusted. */
export function normalizePublicAudiusTracks(payload:unknown):PublicAudiusTrack[]{
 const data=obj(payload)?.data;
 if(!Array.isArray(data))return [];
 const unique=new Set<string>();
 return data.slice(0,24).flatMap((item):PublicAudiusTrack[]=>{
  const row=obj(item);
  if(!row||typeof row.id!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(row.id)||unique.has(row.id))return [];
  // The content owner must allow streaming through Audius' public API.
  if(row.is_stream_gated!==false||row.is_scheduled_release===true||row.is_streamable===false||row.is_available===false||row.is_delete===true||obj(row.access)?.stream===false)return [];
  const sourceUrl=safePermalink(row.permalink);
  if(!sourceUrl)return [];
  const art=obj(row.artwork);
  const user=obj(row.user);
  const duration=row.duration;
  unique.add(row.id);
  return [{
   id:row.id,title:clean(row.title,'Sin título'),
   artist:clean(user?.name,'Artista de Audius'),
   artworkUrl:safeArtwork(art?.['150x150'])??safeArtwork(art?.['480x480']),
   sourceUrl,streamUrl:'https://api.audius.co/v1/tracks/'+encodeURIComponent(row.id)+'/stream',
   durationSeconds:typeof duration==='number'&&Number.isFinite(duration)&&duration>=0&&duration<1_000_000?Math.round(duration):null,
  }];
 }).sort((a,b)=>Number(a.durationSeconds!==null&&a.durationSeconds>900)-Number(b.durationSeconds!==null&&b.durationSeconds>900)).slice(0,12);
}
