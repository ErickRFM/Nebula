/**
 * Best-effort, local-only music tags for personal file imports.
 * Never reads the whole audio file or sends its content to a metadata service.
 * Supported tags: ID3v2.3/v2.4 text frames and legacy ID3v1 on MP3.
 * Unsupported tags/codecs fall back to a readable filename.
 */
export type AudioMetadata = { title:string; artist:string; album:string; genre:string; coverDataUrl?:string };
export type NamedAudioBlob = Pick<File, 'name' | 'slice'>;

const FIELD_LIMIT=200;
const MAX_TAG_BYTES=512*1024;
const blank=(value:string):string=>value.replace(/\u0000/g,'').trim().slice(0,FIELD_LIMIT);
const safeText=(value:string):string=>blank(value) || '';

export function filenameAudioMetadata(filename:string):AudioMetadata {
  const clean=filename.split(/[\\/]/).pop()?.replace(/\.[^.]+$/,'').replace(/[_]+/g,' ').trim() || 'Sin título';
  const match=clean.match(/^(.{1,200}?)\s+[-–—]\s+(.{1,200})$/);
  return {
    title:safeText(match?.[2]||clean)||'Sin título',
    artist:safeText(match?.[1]||'')||'Mi música',
    album:'Archivos importados',genre:'Mis canciones',
  };
}

const latin1=(bytes:Uint8Array)=>new TextDecoder('iso-8859-1').decode(bytes);
const synchsafe=(buffer:Uint8Array,offset:number)=>((buffer[offset]&127)<<21)|((buffer[offset+1]&127)<<14)|((buffer[offset+2]&127)<<7)|(buffer[offset+3]&127);
const be32=(buffer:Uint8Array,offset:number)=>((buffer[offset]*0x1000000)+(buffer[offset+1]<<16)+(buffer[offset+2]<<8)+buffer[offset+3])>>>0;

function decodeText(payload:Uint8Array):string {
  if(payload.length<2)return '';
  const encoding=payload[0],data=payload.subarray(1);
  try{
    if(encoding===0)return safeText(latin1(data));
    if(encoding===3)return safeText(new TextDecoder('utf-8').decode(data));
    if(encoding!==1&&encoding!==2)return '';
    let offset=0,be=encoding===2;
    if(encoding===1&&data.length>=2){
      if(data[0]===0xff&&data[1]===0xfe){offset=2;be=false;}
      else if(data[0]===0xfe&&data[1]===0xff){offset=2;be=true;}
    }
    const even=data.subarray(offset,offset+Math.floor((data.length-offset)/2)*2);
    if(!be)return safeText(new TextDecoder('utf-16le').decode(even));
    const swapped=new Uint8Array(even.length);
    for(let i=0;i<even.length;i+=2){swapped[i]=even[i+1];swapped[i+1]=even[i];}
    return safeText(new TextDecoder('utf-16le').decode(swapped));
  }catch{return '';}
}

function parseV2(data:Uint8Array):Partial<AudioMetadata> {
  if(data.length<10||latin1(data.subarray(0,3))!=='ID3')return {};
  const version=data[3],flags=data[5];
  if((version!==3&&version!==4)||(flags&0xc0)!==0||(flags&0x40)!==0)return {};
  const end=Math.min(data.length,10+synchsafe(data,6));
  const result:Partial<AudioMetadata>={};
  for(let pos=10;pos+10<=end;){
    const name=latin1(data.subarray(pos,pos+4));
    if(!/^[A-Z0-9]{4}$/.test(name))break;
    const length=version===4?synchsafe(data,pos+4):be32(data,pos+4);
    if(length<0||length>end-pos-10)break;
    const frame=data.subarray(pos+10,pos+10+length);
    if(name==='APIC'){result.coverDataUrl=parseId3Picture(frame)||result.coverDataUrl;}
    const value=name==='APIC'?'':decodeText(frame);
    if(value){
      if(name==='TIT2')result.title=value;
      else if(name==='TPE1')result.artist=value;
      else if(name==='TALB')result.album=value;
      else if(name==='TCON')result.genre=value;
    }
    pos+=10+length;
  }
  return result;
}

function parseV1(data:Uint8Array):Partial<AudioMetadata> {
  if(data.length!==128||latin1(data.subarray(0,3))!=='TAG')return {};
  const title=safeText(latin1(data.subarray(3,33)));
  const artist=safeText(latin1(data.subarray(33,63)));
  const album=safeText(latin1(data.subarray(63,93)));
  return { ...(title?{title}:{}), ...(artist?{artist}:{}), ...(album?{album}:{}) };
}


/** Inline covers are limited to 256 KiB; larger pictures never enter IndexedDB. */
function embeddedCover(bytes:Uint8Array):string|undefined{
  if(bytes.length<12||bytes.length>256*1024)return undefined;
  const png=bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71;
  const jpeg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
  if(!png&&!jpeg)return undefined;
  let encoded='';
  for(let i=0;i<bytes.length;i+=8192)encoded+=String.fromCharCode(...bytes.subarray(i,i+8192));
  return 'data:image/'+(png?'png':'jpeg')+';base64,'+btoa(encoded);
}
function parseId3Picture(bytes:Uint8Array):string|undefined{
  if(bytes.length<8)return undefined;
  const mimeEnd=bytes.indexOf(0,1);
  if(mimeEnd<0)return undefined;
  let pos=mimeEnd+2;
  const encoding=bytes[0];
  if(encoding===0||encoding===3){
    const next=bytes.indexOf(0,pos);
    if(next<0)return undefined;
    pos=next+1;
  }else{
    while(pos+1<bytes.length && !(bytes[pos]===0&&bytes[pos+1]===0))pos+=2;
    pos+=2;
  }
  return embeddedCover(bytes.subarray(pos));
}
function u32le(data:Uint8Array,at:number):number {
  if(at<0||at+4>data.length)return 0;
  return (data[at]+data[at+1]*256+data[at+2]*65536+data[at+3]*16777216)>>>0;
}
function parseFlac(data:Uint8Array):Partial<AudioMetadata>{
  if(latin1(data.subarray(0,4))!=='fLaC')return {};
  let pos=4;
  const result:Partial<AudioMetadata>={};
  for(let n=0;n<80&&pos+4<=data.length;n++){
    const last=(data[pos]&0x80)!==0,type=data[pos]&0x7f;
    const size=(data[pos+1]<<16)|(data[pos+2]<<8)|data[pos+3];
    pos+=4;
    if(size<0||pos+size>data.length)break;
    const block=data.subarray(pos,pos+size);
    if(type===4 && block.length>=8){
      let cursor=0;
      const vendorLength=u32le(block,cursor);cursor+=4+vendorLength;
      if(cursor+4<=block.length){
        const count=Math.min(100,u32le(block,cursor));cursor+=4;
        for(let i=0;i<count&&cursor+4<=block.length;i++){
          const len=u32le(block,cursor);cursor+=4;
          if(len>4096||cursor+len>block.length)break;
          const tag=new TextDecoder().decode(block.subarray(cursor,cursor+len));
          cursor+=len;
          const split=tag.indexOf('=');
          if(split<1)continue;
          const key=tag.slice(0,split).toUpperCase(),value=safeText(tag.slice(split+1));
          if(!value)continue;
          if(key==='TITLE')result.title=value;
          else if(key==='ARTIST')result.artist=value;
          else if(key==='ALBUM')result.album=value;
          else if(key==='GENRE')result.genre=value;
        }
      }
    }else if(type===6&&block.length>32){
      let cursor=4;
      const mimeLength=(block[cursor]*0x1000000+(block[cursor+1]<<16)+(block[cursor+2]<<8)+block[cursor+3])>>>0;
      cursor+=4+mimeLength;
      if(cursor+4>block.length)break;
      const descriptionLength=(block[cursor]*0x1000000+(block[cursor+1]<<16)+(block[cursor+2]<<8)+block[cursor+3])>>>0;
      cursor+=4+descriptionLength+16;
      if(cursor+4>block.length)break;
      const imageLen=(block[cursor]*0x1000000+(block[cursor+1]<<16)+(block[cursor+2]<<8)+block[cursor+3])>>>0;
      cursor+=4;
      if(imageLen<=block.length-cursor)result.coverDataUrl=embeddedCover(block.subarray(cursor,cursor+imageLen))||result.coverDataUrl;
    }
    pos+=size;if(last)break;
  }
  return result;
}
function parseMp4(data:Uint8Array):Partial<AudioMetadata>{
  const result:Partial<AudioMetadata>={};
  const label=(at:number)=>latin1(data.subarray(at,at+4));
  function visit(start:number,end:number,depth:number){
    if(depth>6)return;
    let pos=start;
    for(let count=0;count<200&&pos+8<=end;count++){
      const size=be32(data,pos);
      if(size<8||pos+size>end)break;
      const type=label(pos+4);
      if(type==='moov'||type==='udta'||type==='ilst'||type==='meta'){
        visit(pos+(type==='meta'?12:8),pos+size,depth+1);
      }else if(['©nam','©ART','aART','©alb','©gen','covr'].includes(type)){
        const d=pos+8;
        if(d+16<=pos+size && label(d+4)==='data'){
          const len=be32(data,d);
          if(len>=16&&d+len<=pos+size){
            const payload=data.subarray(d+16,d+len);
            const value=safeText(new TextDecoder().decode(payload));
            if(type==='©nam'&&value)result.title=value;
            else if((type==='©ART'||type==='aART')&&value)result.artist=value;
            else if(type==='©alb'&&value)result.album=value;
            else if(type==='©gen'&&value)result.genre=value;
            else if(type==='covr')result.coverDataUrl=embeddedCover(payload)||result.coverDataUrl;
          }
        }
      }
      pos+=size;
    }
  }
  visit(0,data.length,0);
  return result;
}

export async function readAudioMetadata(file:NamedAudioBlob & { size:number }):Promise<AudioMetadata> {
  const fallback=filenameAudioMetadata(file.name);
  if(file.size<10)return fallback;
  try{
    const isMp3=/\.mp3$/i.test(file.name);
    const isFlac=/\.flac$/i.test(file.name);
    const isM4a=/\.(m4a|mp4)$/i.test(file.name);
    if(!isMp3&&!isFlac&&!isM4a)return fallback;
    let primary:Partial<AudioMetadata>={};
    let legacy:Partial<AudioMetadata>={};
    if(isMp3){
      const header=new Uint8Array(await file.slice(0,10).arrayBuffer());
      const length=latin1(header.subarray(0,3))==='ID3'?10+synchsafe(header,6):0;
      if(length>10&&length<=MAX_TAG_BYTES)primary=parseV2(new Uint8Array(await file.slice(0,length).arrayBuffer()));
      if(file.size>=128)legacy=parseV1(new Uint8Array(await file.slice(file.size-128,file.size).arrayBuffer()));
    }else if(isFlac){
      primary=parseFlac(new Uint8Array(await file.slice(0,Math.min(file.size,MAX_TAG_BYTES)).arrayBuffer()));
    }else{
      // iTunes metadata may live near the tail of a large MP4/M4A file.
      const head=new Uint8Array(await file.slice(0,Math.min(file.size,MAX_TAG_BYTES)).arrayBuffer());
      primary=parseMp4(head);
      if(!primary.title&&file.size>MAX_TAG_BYTES){
        const tail=new Uint8Array(await file.slice(Math.max(0,file.size-MAX_TAG_BYTES),file.size).arrayBuffer());
        primary={...parseMp4(tail),...primary};
      }
    }
    return {
      title:primary.title||legacy.title||fallback.title,
      artist:primary.artist||legacy.artist||fallback.artist,
      album:primary.album||legacy.album||fallback.album,
      genre:primary.genre||fallback.genre,
      ...(primary.coverDataUrl?{coverDataUrl:primary.coverDataUrl}:{}),
    };
  }catch{return fallback;}
}
