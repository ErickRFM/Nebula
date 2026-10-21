export type ExternalEmbed = {provider:'youtube'|'soundcloud'; src:string; sourceUrl:string};
const VIDEO=/^[A-Za-z0-9_-]{11}$/;
export function parseExternalEmbed(input:string):ExternalEmbed|null{
 let url:URL;
 try{url=new URL(input.trim());}catch{return null;}
 if(url.protocol!=='https:'||url.username||url.password)return null;
 const host=url.hostname.toLowerCase();
 const youtubeHosts=['youtube.com','www.youtube.com','m.youtube.com','music.youtube.com','youtu.be'];
 if(youtubeHosts.includes(host)){
   let id:string|null=null;
   if(host==='youtu.be')id=url.pathname.split('/')[1]??null;
   else if(url.pathname==='/watch')id=url.searchParams.get('v');
   else if(/^\/(shorts|live|embed)\//.test(url.pathname))id=url.pathname.split('/')[2]??null;
   if(!id||!VIDEO.test(id))return null;
   return {provider:'youtube',src:'https://www.youtube-nocookie.com/embed/'+id,sourceUrl:'https://www.youtube.com/watch?v='+id};
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
