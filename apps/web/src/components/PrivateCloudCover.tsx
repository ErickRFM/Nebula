'use client';
import {useEffect,useRef,useState,type ReactNode} from 'react';
import type {AccountApi} from '../hooks/useAccount';

/** A signed image can expire while a page is open. Retry once via the owner
 * endpoint instead of persisting R2 bearer URLs or showing a broken image. */
export function PrivateCloudCover({trackId,coverUrl,account,fallback,className='cloud-track-cover'}:{
  trackId:string;coverUrl:string|null|undefined;account:AccountApi;fallback:ReactNode;className?:string;
}){
  const [source,setSource]=useState(coverUrl||'');
  const [failed,setFailed]=useState(false);
  const tried=useRef(false);
  const mounted=useRef(true);
  useEffect(()=>{
    mounted.current=true;
    tried.current=false;
    setSource(coverUrl||'');
    setFailed(false);
    return()=>{mounted.current=false;};
  },[coverUrl,trackId,account.user?.id]);
  async function onError(){
    if(tried.current||!account.user){setFailed(true);return;}
    tried.current=true;
    try{
      const result=await account.cloudRequest<{coverUrl:string}>('/v1/library/cloud/'+encodeURIComponent(trackId)+'/cover');
      const url=new URL(result.coverUrl);
      if(url.protocol!=='https:'||!url.hostname.endsWith('.r2.cloudflarestorage.com'))
        throw new Error('private_cover_invalid_source');
      if(mounted.current&&account.user){
        setSource(url.href);
      }
    }catch{
      if(mounted.current)setFailed(true);
    }
  }
  if(!source||failed)return <>{fallback}</>;
  return <img className={className} src={source} loading="lazy" alt=""
    referrerPolicy="no-referrer" onError={()=>{void onError();}}/>;
}
