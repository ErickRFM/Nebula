export type YouTubeCollection={kind:'playlist'|'mix';id:string;videoId:string|null;sourceUrl:string;embedUrl:string};
const HOSTS=new Set(['youtube.com','www.youtube.com','m.youtube.com','music.youtube.com','youtu.be']);
const VIDEO=/^[A-Za-z0-9_-]{11}$/;
const LIST=/^[A-Za-z0-9_-]{8,120}$/;
/** RD playlists are dynamic YouTube Mixes and cannot promise a finite track list. */
export function parseYouTubeCollection(input:string):YouTubeCollection|null{
 if(typeof input!=='string'||input.length>2048)return null;
 let url:URL;try{url=new URL(input.trim());}catch{return null;}
 if(url.protocol!=='https:'||url.username||url.password||url.port||!HOSTS.has(url.hostname.toLowerCase()))return null;
 const host=url.hostname.toLowerCase(),segments=url.pathname.split('/').filter(Boolean);
 const isPlaylist=host!=='youtu.be'&&url.pathname==='/playlist';
 const isWatch=host!=='youtu.be'&&url.pathname==='/watch';
 const isShort=host==='youtu.be'&&segments.length===1;
 if(!isPlaylist&&!isWatch&&!isShort)return null;
 const id=url.searchParams.get('list');
 if(!id||!LIST.test(id))return null;
 const candidate=isWatch?url.searchParams.get('v'):isShort?segments[0]:null;
 const videoId=candidate&&VIDEO.test(candidate)?candidate:null;
 if(!isPlaylist&&!videoId)return null;
 const kind=id.startsWith('RD')?'mix':'playlist';
 const sourceUrl=kind==='mix'&&videoId
  ?'https://www.youtube.com/watch?v='+videoId+'&list='+id
  :'https://www.youtube.com/playlist?list='+id;
 const embedUrl=kind==='mix'
  ?videoId?'https://www.youtube-nocookie.com/embed/'+videoId:
   'https://www.youtube-nocookie.com/embed?listType=playlist&list='+id
  :videoId?'https://www.youtube-nocookie.com/embed/'+videoId+'?listType=playlist&list='+id:
   'https://www.youtube-nocookie.com/embed?listType=playlist&list='+id;
 return {kind,id,videoId,sourceUrl,embedUrl};
}
