import {afterEach,describe,expect,it,vi} from 'vitest';
import {putPrivateAudio} from './r2-upload';

describe('R2 browser upload',()=>{
 afterEach(()=>vi.unstubAllGlobals());
 it('reports progress and completes a successful signed PUT',async()=>{
   class FakeXHR{
     status=200;
     upload:{onprogress?:((e:{lengthComputable:boolean;loaded:number;total:number})=>void)}={};
     onload?:()=>void;onerror?:()=>void;onabort?:()=>void;
     open(method:string,url:string){expect(method).toBe('PUT');expect(url).toContain('r2.cloudflarestorage.com');}
     setRequestHeader(name:string,value:string){expect(name).toBe('Content-Type');expect(value).toBe('audio/mpeg');}
     send(_file:File){this.upload.onprogress?.({lengthComputable:true,loaded:5,total:10});this.onload?.();}
     abort(){this.onabort?.();}
   }
   vi.stubGlobal('XMLHttpRequest',FakeXHR);
   const progress:number[]=[];
   await putPrivateAudio('https://example.r2.cloudflarestorage.com/song','audio/mpeg',{name:'song.mp3'} as File,
     new AbortController().signal,p=>progress.push(p));
   expect(progress).toEqual([50]);
 });
 it('does not send a cancelled request',async()=>{
   const controller=new AbortController();controller.abort();
   await expect(putPrivateAudio('https://example.com','audio/mpeg',{} as File,controller.signal,()=>{}))
     .rejects.toThrow('r2_upload_cancelled');
 });
});
