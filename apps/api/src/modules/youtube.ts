import type {FastifyInstance} from 'fastify';
import type {NodePgDatabase} from 'drizzle-orm/node-postgres';
import {z} from 'zod';
import {createGuards} from './auth.js';

const search=z.object({q:z.string().trim().min(2).max(100)});
type Video={id?:{videoId?:string};snippet?:{title?:string;channelTitle?:string;thumbnails?:{medium?:{url?:string}}}};
export function registerYoutubeRoutes(app:FastifyInstance,db:NodePgDatabase):void{
 const {requireAuth}=createGuards(db);
 const enabled=Boolean(process.env.YOUTUBE_API_KEY?.trim());
 app.get('/v1/discovery/youtube/config',{preHandler:requireAuth},async()=>({enabled}));
 app.get('/v1/discovery/youtube',{
   preHandler:requireAuth,config:{rateLimit:{max:8,timeWindow:'1 minute'}},
 },async(request,reply)=>{
   const parsed=search.safeParse(request.query);
   if(!parsed.success)return reply.code(400).send({error:'invalid_youtube_query'});
   const key=process.env.YOUTUBE_API_KEY?.trim();
   if(!key)return reply.code(503).send({error:'youtube_not_configured'});
   const url=new URL('https://www.googleapis.com/youtube/v3/search');
   url.searchParams.set('part','snippet');
   url.searchParams.set('q',parsed.data.q);
   url.searchParams.set('type','video');
   url.searchParams.set('videoEmbeddable','true');
   url.searchParams.set('videoSyndicated','true');
   url.searchParams.set('maxResults','10');
   url.searchParams.set('key',key);
   try{
     const response=await fetch(url,{signal:AbortSignal.timeout(8000),redirect:'error'});
     if(!response.ok)return reply.code(502).send({error:'youtube_provider_unavailable'});
     const data=await response.json() as {items?:Video[]};
     const items=(Array.isArray(data.items)?data.items:[]).flatMap(item=>{
       const videoId=item.id?.videoId;
       if(!videoId||!(/^[A-Za-z0-9_-]{11}$/).test(videoId))return [];
       const thumbnail=item.snippet?.thumbnails?.medium?.url;
       return [{videoId,title:(item.snippet?.title??'Video musical').slice(0,200),
         artist:(item.snippet?.channelTitle??'YouTube').slice(0,200),
         thumbnail:typeof thumbnail==='string'&&thumbnail.startsWith('https://')?thumbnail:null,
         sourceUrl:'https://www.youtube.com/watch?v='+videoId}];
     });
     return {items};
   }catch{
     return reply.code(502).send({error:'youtube_provider_unavailable'});
   }
 });
}
