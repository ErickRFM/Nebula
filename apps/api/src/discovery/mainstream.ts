/**
 * Deezer public catalog metadata for real-label recording discovery.
 * No music files are fetched, streamed or stored by this adapter.
 * Playback stays in Deezer's official embedded widget.
 */
export type MainstreamTrack={
 id:string;title:string;artist:string;album:string;
 cover:string|null;durationSeconds:number|null;sourceUrl:string;
 rank:number;isVariant:boolean;
};
type JsonFetch=(url:string,init?:RequestInit)=>Promise<Response>;
function row(value:unknown):Record<string,unknown>|null{
 return !!value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:null;
}
function short(value:unknown,fallback:string):string{
 return typeof value==='string'&&value.trim()?value.trim().slice(0,180):fallback;
}
function artwork(value:unknown):string|null{
 if(typeof value!=='string'||value.length>2048)return null;
 try {
  const url=new URL(value);
  return url.protocol==='https:'&&!url.username&&!url.password&&!url.port&&
   (['e-cdns-images.dzcdn.net','cdns-images.dzcdn.net','cdn-images.dzcdn.net'].includes(url.hostname))?url.href:null;
 }catch{return null;}
}
const VARIANT=/\b(remix|cover|karaoke|tribute|instrumental|live|slowed|sped.?up|nightcore|reverb|dj edit|bootleg|mashup|acoustic version|8d audio|reaction|original(?:ly)? by|piano version)\b/i;
function normalized(value:string):string{
 return value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
}
function rankSong(item:MainstreamTrack,query:string):number {
 const q=normalized(query).split(/\s+/).filter(Boolean);
 const title=normalized(item.title),artist=normalized(item.artist);
 const combined=title+' '+artist;
 const hits=q.filter(word=>combined.includes(word)).length;
 const exact=normalized(item.title)===normalized(query)?6:0;
 const variantPenalty=item.isVariant&&!VARIANT.test(query)?(/\b(karaoke|tribute|nightcore|instrumental)\b/i.test(item.title)?25:15):0;
 // Deezer's popularity rank is an ordering hint, not a license verification.
 return hits*12+exact+Math.min(item.rank/100000,6)-variantPenalty;
}
export function normalizeMainstream(payload:unknown,query:string):MainstreamTrack[]{
 const data=row(payload)?.data;
 if(!Array.isArray(data))return [];
 const seen=new Set<string>();
 return data.slice(0,40).flatMap((value):MainstreamTrack[]=>{
  const r=row(value);
  const id=r?.id;
  if((typeof id!=='number'&&!/^[1-9]\d*$/.test(String(id??'')))||!Number.isSafeInteger(Number(id))||Number(id)<=0)return [];
  const key=String(id);
  if(seen.has(key))return [];
  const artist=row(r?.artist),album=row(r?.album);
  if(!artist||!album||typeof r?.title!=='string'||typeof artist.name!=='string')return [];
  seen.add(key);
  const title=short(r.title,'Sin título');
  const artistName=short(artist.name,'Artista desconocido');
  const duration=Number(r.duration);
  return [{id:key,title,artist:artistName,album:short(album.title,'Álbum'),
   cover:artwork(album.cover_medium)??artwork(album.cover_small),
   durationSeconds:Number.isFinite(duration)&&duration>=0&&duration<100000?Math.round(duration):null,
   sourceUrl:'https://www.deezer.com/track/'+key,
   rank:typeof r.rank==='number'&&Number.isFinite(r.rank)?r.rank:0,
   isVariant:(VARIANT.test(title)||VARIANT.test(artistName)||VARIANT.test(short(album.title,'')))&&!VARIANT.test(query),
  }];
 }).sort((a,b)=>rankSong(b,query)-rankSong(a,query)).slice(0,16);
 // If the search clearly targets one recording (artist + title, or an
 // unambiguous popular title), prefer that credited artist. Metadata cannot
 // certify recording rights, so alternatives remain accessible in a
 // separate variants tab instead of disappearing from search.
 const anchor=ordered.find(item=>!item.isVariant&&item.rank>=300000);
 const q=normalized(query);
 const sameArtist=anchor?normalized(anchor.artist):'';
 const songTitle=anchor?normalized(anchor.title):'';
 const both=q.includes(sameArtist)&&q.includes(songTitle)&&sameArtist.length>=4&&songTitle.length>=4;
 const titleOnly=q===songTitle&&songTitle.length>=8&&anchor!==undefined&&anchor.rank>=700000;
 const enforce=anchor!==undefined&&!VARIANT.test(query)&&(both||titleOnly);
 return ordered.map(item=>({
  ...item,
  isVariant:item.isVariant||(enforce&&normalized(item.artist)!==sameArtist),
 }));
}
export async function searchMainstream(query:string,fetchImpl:JsonFetch=fetch):Promise<MainstreamTrack[]>{
 if(query.length<2||query.length>100)throw Error('invalid_query');
 const url=new URL('https://api.deezer.com/search');
 url.searchParams.set('q',query);
 url.searchParams.set('limit','40');
 const response=await fetchImpl(url.toString(),{
  method:'GET',
  headers:{Accept:'application/json'},
  redirect:'error',
  signal:AbortSignal.timeout(7500),
 });
 if(!response.ok)throw Error('deezer_http_'+response.status);
 if(Number(response.headers.get('content-length')||0)>850000)throw Error('provider_response_too_large');
 const payload=await response.json() as unknown;
 if(row(payload)?.error)throw Error('provider_error');
 return normalizeMainstream(payload,query);
}
