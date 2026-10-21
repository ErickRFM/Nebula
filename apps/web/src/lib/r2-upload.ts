/** Direct browser upload to a short-lived R2 PUT URL. Never proxies audio through Vercel. */
export function putPrivateAudio(
 url:string, contentType:string, file:File, signal:AbortSignal,
 onProgress:(percent:number)=>void,
):Promise<void>{
 return new Promise((resolve,reject)=>{
   if(signal.aborted){reject(new Error('r2_upload_cancelled'));return;}
   const xhr=new XMLHttpRequest();
   const abort=()=>xhr.abort();
   const done=()=>signal.removeEventListener('abort',abort);
   xhr.upload.onprogress=event=>{
     if(event.lengthComputable&&event.total>0)onProgress(Math.min(100,Math.round(event.loaded*100/event.total)));
   };
   xhr.onload=()=>{
     done();
     if(xhr.status>=200&&xhr.status<300)resolve();
     else reject(new Error('r2_upload_http_'+xhr.status));
   };
   xhr.onerror=()=>{done();reject(new Error('r2_upload_network_failed'));};
   xhr.onabort=()=>{done();reject(new Error('r2_upload_cancelled'));};
   xhr.open('PUT',url);
   xhr.setRequestHeader('Content-Type',contentType);
   signal.addEventListener('abort',abort,{once:true});
   xhr.send(file);
 });
}
