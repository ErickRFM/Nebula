import {describe,expect,it,vi} from 'vitest';
import {Pool} from 'pg';
import {buildApp} from './app';

describe('official YouTube metadata lookup for known playlist IDs',()=>{
 it('rejects untrusted URL inputs, oversized lists, and only fetches canonical YouTube oEmbed metadata',async()=>{
  const pool=new Pool({host:'127.0.0.1',port:1,user:'test',password:'test',database:'none',connectionTimeoutMillis:250});
  const app=await buildApp({pool,secret:'long-private-test-only-nebula-secret-123456',origin:'http://localhost:3000'});
  const original=globalThis.fetch;
  const calls:string[]=[];
  vi.stubGlobal('fetch',async(url:string)=>{
   calls.push(url);
   return {ok:true,json:async()=>({title:'DAÑO · Canción original',author_name:'Canal oficial'})};
  });
  try{
   const invalid=await app.inject({method:'GET',url:'/v1/discovery/youtube/video-metadata?ids=https%3A%2F%2Fevil.test'});
   expect(invalid.statusCode).toBe(400);
   const tooMany=await app.inject({method:'GET',url:'/v1/discovery/youtube/video-metadata?ids='+Array(21).fill('ABCDEFGHIJK').join(',')});
   expect(tooMany.statusCode).toBe(400);
   expect(calls).toHaveLength(0);
   const valid=await app.inject({method:'GET',url:'/v1/discovery/youtube/video-metadata?ids=M-E8rmhUxyw,ABCDEFGHIJK'});
   expect(valid.statusCode).toBe(200);
   expect(valid.json().items).toEqual([
    {videoId:'M-E8rmhUxyw',title:'DAÑO · Canción original',artist:'Canal oficial'},
    {videoId:'ABCDEFGHIJK',title:'DAÑO · Canción original',artist:'Canal oficial'},
   ]);
   expect(calls).toHaveLength(2);
   expect(calls.every(x=>x.startsWith('https://www.youtube.com/oembed?url='))).toBe(true);
  }finally{
   vi.stubGlobal('fetch',original);
   await app.close();await pool.end();
  }
 });
});
