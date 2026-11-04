import {spawn} from 'node:child_process';
import {PassThrough} from 'node:stream';
import {normalizeVideos,VIDEO_ID} from './bridge-core.mjs';

function runJson(executable,args,timeoutMs=18000){
 return new Promise((resolve,reject)=>{
  const child=spawn(executable,args,{shell:false,windowsHide:true,stdio:['ignore','pipe','pipe']});
  let stdout='';let stderr='';let closed=false;
  const timer=setTimeout(()=>{child.kill();finish(Error('search_timeout'));},timeoutMs);
  function finish(error,data){
   if(closed)return;closed=true;clearTimeout(timer);
   error?reject(error):resolve(data);
  }
  child.once('error',e=>finish(e));
  child.stdout.on('data',chunk=>{
   stdout+=chunk.toString('utf8');
   if(stdout.length>1_000_000){child.kill();finish(Error('response_too_large'));}
  });
  child.stderr.on('data',chunk=>{if(stderr.length<4096)stderr+=chunk.toString('utf8');});
  child.once('close',code=>{
   if(code!==0){finish(Error('yt_dlp_exit_'+code));return;}
   try{finish(null,JSON.parse(stdout));}catch{finish(Error('invalid_provider_json'));}
  });
 });
}
export function createYtdlpRunner({enabled=false,ytdlp='yt-dlp',ffmpeg='ffmpeg'}={}){
 return {
  enabled,
  async search(query){
   if(!enabled)throw Error('bridge_disabled');
   const payload=await runJson(ytdlp,[
    '--ignore-config','--no-playlist','--flat-playlist','--dump-single-json',
    '--no-warnings','--no-progress','ytsearch12:'+query,
   ]);
   return normalizeVideos(payload);
  },
  stream(id){
   if(!enabled)throw Error('bridge_disabled');
   if(!VIDEO_ID.test(id))throw Error('invalid_video_id');
   const output=new PassThrough({highWaterMark:128*1024});
   const download=spawn(ytdlp,[
    '--ignore-config','--no-playlist','--no-warnings','--no-progress',
    '-f','bestaudio/best','-o','-','https://www.youtube.com/watch?v='+id,
   ],{shell:false,windowsHide:true,stdio:['ignore','pipe','pipe']});
   const convert=spawn(ffmpeg,[
    '-nostdin','-hide_banner','-loglevel','error',
    '-i','pipe:0','-vn','-ac','2','-b:a','160k','-f','mp3','pipe:1',
   ],{shell:false,windowsHide:true,stdio:['ignore','pipe','pipe']});
   let stopped=false;let sawBytes=false;
   const watchdog=setTimeout(()=>output.destroy(Error('stream_timeout')),25*60_000);
   function cancel(){
    if(stopped)return;
    stopped=true;clearTimeout(watchdog);
    download.kill();convert.kill();
   }
   download.on('error',e=>output.destroy(e));
   convert.on('error',e=>output.destroy(e));
   download.stdout.pipe(convert.stdin);
   download.stdout.on('error',e=>output.destroy(e));
   convert.stdin.on('error',()=>{/* FFmpeg may close first; convert close handles failure. */});
   download.stderr.resume();
   convert.stderr.resume();
   convert.stdout.on('data',()=>{sawBytes=true;});
   convert.stdout.pipe(output);
   convert.once('close',code=>{
    if(code!==0&&!stopped)output.destroy(Error('ffmpeg_exit_'+code));
    else if(!sawBytes&&!stopped)output.destroy(Error('no_audio_received'));
   });
   output.once('close',cancel);
   return {output,cancel};
  },
 };
}
