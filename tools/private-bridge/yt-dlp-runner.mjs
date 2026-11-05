import {spawn} from 'node:child_process';
import {join} from 'node:path';
import {PLAYLIST_ID} from './playlist-batch.mjs';
import {PassThrough} from 'node:stream';
import {normalizeVideos,VIDEO_ID} from './bridge-core.mjs';

function runJson(executable,args,timeoutMs=18000,maxBytes=1_000_000){
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
   if(stdout.length>maxBytes){child.kill();finish(Error('response_too_large'));}
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
  async listPlaylist(listId){
   if(!enabled)throw Error('bridge_disabled');
   if(!PLAYLIST_ID.test(listId))throw Error('invalid_playlist_id');
   return runJson(ytdlp,[
    '--ignore-config','--flat-playlist','--dump-single-json','--skip-download',
    '--playlist-end','1000','--no-warnings','--no-progress','--socket-timeout','12',
    'https://www.youtube.com/playlist?list='+listId,
   ],120_000,9_000_000);
  },
  downloadOne(id,{directory,signal}){
   if(!enabled)throw Error('bridge_disabled');
   if(!VIDEO_ID.test(id)||typeof directory!=='string')throw Error('invalid_batch_item');
   if(signal?.aborted)return Promise.reject(Error('cancelled'));
   return new Promise((resolve,reject)=>{
    let settled=false;
    const child=spawn(ytdlp,[
     '--ignore-config','--no-playlist','--no-warnings','--no-progress',
     '--socket-timeout','12','--retries','2','--fragment-retries','2',
     '--extract-audio','--audio-format','mp3','--audio-quality','160K',
     '--ffmpeg-location',ffmpeg,'--no-overwrites',
     '--download-archive',join(directory,'.nebula-download-archive.txt'),
     '--paths',directory,'--output','%(title).140B [%(id)s].%(ext)s',
     'https://www.youtube.com/watch?v='+id,
    ],{shell:false,windowsHide:true,stdio:['ignore','ignore','pipe']});
    const timer=setTimeout(()=>{child.kill();finish(Error('download_timeout'));},15*60_000);
    function finish(error){
     if(settled)return;
     settled=true;clearTimeout(timer);
     signal?.removeEventListener('abort',cancel);
     error?reject(error):resolve({id});
    }
    const cancel=()=>{child.kill();finish(Error('cancelled'));};
    signal?.addEventListener('abort',cancel,{once:true});
    child.stderr?.resume();
    child.once('error',finish);
    child.once('close',code=>finish(code===0?null:Error('yt_dlp_exit_'+code)));
    if(signal?.aborted)cancel();
   });
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
