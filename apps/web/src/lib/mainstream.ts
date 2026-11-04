export type MainstreamTrack={
 id:string;title:string;artist:string;album:string;
 cover:string|null;durationSeconds:number|null;sourceUrl:string;
 rank:number;isVariant:boolean;
};
function asRecord(value:unknown):Record<string,unknown>|null{
 return !!value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:null;
}
export function parseMainstreamResults(data:unknown):MainstreamTrack[]{
 const source=asRecord(data);
 if(source?.source!=='deezer'||!Array.isArray(source.items))return [];
 const seen=new Set<string>();
 return source.items.slice(0,16).flatMap((entry):MainstreamTrack[]=>{
  const item=asRecord(entry);
  if(!item)return [];
  const id=item.id;
  if(typeof id!=='string'||!(/^[1-9][0-9]{0,17}$/).test(id)||seen.has(id))return [];
  if(typeof item.title!=='string'||typeof item.artist!=='string')return [];
  seen.add(id);
  const cover=typeof item.cover==='string'&& /^https:\/\/(?:e-cdns-images|cdns-images|cdn-images)\.dzcdn\.net\//.test(item.cover)?item.cover:null;
  const duration=item.durationSeconds;
  return [{id,title:item.title.slice(0,180),artist:item.artist.slice(0,180),
    album:typeof item.album==='string'?item.album.slice(0,180):'Álbum',
    cover,durationSeconds:typeof duration==='number'&&Number.isFinite(duration)&&duration>=0?duration:null,
    rank:typeof item.rank==='number'?item.rank:0,
    isVariant:item.isVariant===true,
    sourceUrl:'https://www.deezer.com/track/'+id,
  }];
 });
}
export function officialDeezerEmbed(trackId:string):string|null{
 return (/^[1-9][0-9]{0,17}$/).test(trackId)?'https://widget.deezer.com/widget/dark/track/'+trackId:null;
}
export function officialMusicSearch(provider:'youtube'|'spotify'|'apple',track:{title:string;artist:string}):string{
 const term=(track.artist+' '+track.title).trim().slice(0,180);
 if(provider==='youtube')return 'https://www.youtube.com/results?search_query='+encodeURIComponent(term+' official audio');
 if(provider==='spotify')return 'https://open.spotify.com/search/'+encodeURIComponent(term);
 return 'https://music.apple.com/mx/search?term='+encodeURIComponent(term);
}
