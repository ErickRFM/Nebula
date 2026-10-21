import {describe,expect,it,vi} from 'vitest';
import {directAudioFileInfo,retrieveAuthorizedAudio,MAX_WEB_AUDIO_BYTES} from './authorized-web-audio';

describe('authorized web audio imports',()=>{
 it('accepts direct HTTPS audio and strips unsafe filename characters',()=>{
   expect(directAudioFileInfo('https://audio.example.net/mi-cancion.mp3?download=1')?.filename).toBe('mi-cancion.mp3');
   expect(directAudioFileInfo('https://audio.example.net/alb%C3%BAm/una%20rola.flac')?.filename).toBe('una-rola.flac');
 });
 it('rejects YouTube pages, HTML, credentials and local networks',()=>{
   for(const url of [
     'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
     'https://youtu.be/dQw4w9WgXcQ',
     'https://evil.example/video.mp4',
     'https://evil.example/page.html',
     'http://audio.example.net/song.mp3',
     'https://name:pass@audio.example.net/song.mp3',
     'https://127.0.0.1/song.mp3',
     'https://192.168.1.4/song.mp3',
     'https://localhost/song.mp3',
   ])expect(directAudioFileInfo(url)).toBeNull();
 });
 it('downloads an audio file without passing its URL through a server',async()=>{
   const bytes=new Uint8Array([73,68,51,3,0,0]);
   const fetcher=vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
     expect(input).toBe('https://audio.example.net/track.mp3');
     expect(init?.credentials).toBe('omit');
     expect(init?.redirect).toBe('error');
     return new Response(bytes,{headers:{'Content-Type':'audio/mpeg','Content-Length':String(bytes.byteLength)}});
   }) as unknown as typeof fetch;
   const progress:number[]=[];
   const file=await retrieveAuthorizedAudio('https://audio.example.net/track.mp3',
     new AbortController().signal,x=>progress.push(x),fetcher);
   expect(file.name).toBe('track.mp3');
   expect(file.size).toBe(bytes.byteLength);
   expect(file.type).toBe('audio/mpeg');
   expect(progress.at(-1)).toBe(100);
   expect(fetcher).toHaveBeenCalledTimes(1);
 });
 it('refuses HTML and oversized responses before storing them',async()=>{
   const html=vi.fn(async()=>new Response('<html>invalid</html>',{headers:{'Content-Type':'text/html'}})) as unknown as typeof fetch;
   await expect(retrieveAuthorizedAudio('https://audio.example.net/not-music.mp3',
     new AbortController().signal,undefined,html)).rejects.toThrow('no entregó audio');
   const large=vi.fn(async()=>new Response('a',{headers:{'Content-Type':'audio/mpeg','Content-Length':String(MAX_WEB_AUDIO_BYTES+1)}})) as unknown as typeof fetch;
   await expect(retrieveAuthorizedAudio('https://audio.example.net/huge.mp3',
     new AbortController().signal,undefined,large)).rejects.toThrow('100 MB');
 });
 it('reports missing browser cross-origin permission without server-side proxy',async()=>{
   const blocked=vi.fn(async()=>{throw new TypeError('CORS');}) as unknown as typeof fetch;
   await expect(retrieveAuthorizedAudio('https://audio.example.net/song.mp3',
     new AbortController().signal,undefined,blocked)).rejects.toThrow('CORS');
 });
});
