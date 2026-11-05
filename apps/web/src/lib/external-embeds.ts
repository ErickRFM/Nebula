import {parseYouTubeCollection,type YouTubeCollection} from './youtube-collections';
export type ExternalEmbed = {provider:'youtube'|'soundcloud'|'spotify'|'deezer'; src:string; sourceUrl:string;collection?:Pick<YouTubeCollection,'kind'|'id'>};
const VIDEO=/^[A-Za-z0-9_-]{11}$/;
export function parseExternalEmbed(input:string):ExternalEmbed|null{
 let url:URL;
 try{url=new URL(input.trim());}catch{return null;}
 if(url.protocol!=='https:'||url.username||url.password||url.port)return null;
 const host=url.hostname.toLowerCase();
 const youtubeHosts=['youtube.com','www.youtube.com','m.youtube.com','music.youtube.com','youtu.be'];
 if(youtubeHosts.includes(host)){
   const list=parseYouTubeCollection(input);
   if(list)return {provider:'youtube',src:list.embedUrl,sourceUrl:list.sourceUrl,collection:{kind:list.kind,id:list.id}};
   if(url.searchParams.has('list'))return null;
   let id:string|null=null;
   const segments=url.pathname.split('/').filter(Boolean);
   if(host==='youtu.be'){
     if(segments.length!==1)return null;
     id=segments[0];
   }else if(url.pathname==='/watch')id=url.searchParams.get('v');
   else if(segments.length===2&&['shorts','live','embed'].includes(segments[0]))id=segments[1];
   if(!id||!VIDEO.test(id))return null;
   return {provider:'youtube',src:'https://www.youtube-nocookie.com/embed/'+id,sourceUrl:'https://www.youtube.com/watch?v='+id};
 }
 if(host==='open.spotify.com'){
   const segments=url.pathname.split('/').filter(Boolean);
   const allowed=['track','album','playlist'];
   if(segments.length===2&&allowed.includes(segments[0])&&/^[A-Za-z0-9]{22}$/.test(segments[1])){
     const sourceUrl='https://open.spotify.com/'+segments[0]+'/'+segments[1];
     return {provider:'spotify',src:'https://open.spotify.com/embed/'+segments[0]+'/'+segments[1],sourceUrl};
   }
   return null;
 }
 if(host==='deezer.com'||host==='www.deezer.com'){
   const segments=url.pathname.split('/').filter(Boolean);
   const parts=segments.length===3&&/^[a-z]{2}(?:-[A-Z]{2})?$/.test(segments[0])?segments.slice(1):segments;
   if(parts.length===2&&parts[0]==='track'&&/^[1-9][0-9]{0,17}$/.test(parts[1])){
     return {provider:'deezer',src:'https://widget.deezer.com/widget/dark/track/'+parts[1],sourceUrl:'https://www.deezer.com/track/'+parts[1]};
   }
   return null;
 }
 if(host==='soundcloud.com'||host==='www.soundcloud.com'){
   const segments=url.pathname.split('/').filter(Boolean);
   if(segments.length<2||segments.some(x=>x.length>120)||['discover','search','stream','you','stations'].includes(segments[0]))return null;
   const sourceUrl='https://soundcloud.com/'+segments.map(encodeURIComponent).join('/');
   const params=new URLSearchParams({url:sourceUrl,auto_play:'false',show_comments:'false',show_user:'true',visual:'true'});
   return {provider:'soundcloud',src:'https://w.soundcloud.com/player/?'+params.toString(),sourceUrl};
 }
 return null;
}
