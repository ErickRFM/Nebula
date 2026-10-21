import {describe,expect,it} from 'vitest';
import {filenameAudioMetadata,readAudioMetadata} from './audio-metadata';

const named=(name:string,parts:BlobPart[])=>Object.assign(new Blob(parts),{name});
const frame=(id:string,value:string):Uint8Array=>{
  const encoded=new TextEncoder().encode(value);
  const content=new Uint8Array([3,...encoded]);
  const bytes=new Uint8Array(10+content.length);
  bytes.set(new TextEncoder().encode(id));
  bytes[4]=0;bytes[5]=0;bytes[6]=0;bytes[7]=content.length;
  bytes.set(content,10);
  return bytes;
};

describe('client-only audio tags',()=>{
  it('derives artist and title from a normal filename',()=>{
    expect(filenameAudioMetadata('Artist - Great_Song.mp3')).toMatchObject({artist:'Artist',title:'Great Song'});
    expect(filenameAudioMetadata('Live set.flac').title).toBe('Live set');
  });
  it('reads bounded UTF-8 ID3v2.3 tags without loading audio payload',async()=>{
    const frames=[frame('TIT2','Canción real'),frame('TPE1','Artista real'),frame('TALB','Mi álbum'),frame('TCON','Pop')];
    const body=new Uint8Array(frames.reduce((sum,v)=>sum+v.length,0));
    let pos=0;for(const f of frames){body.set(f,pos);pos+=f.length;}
    const header=new Uint8Array([73,68,51,3,0,0,0,0,(body.length>>7)&127,body.length&127]);
    const raw=named('bad - name.mp3',[header,body,new Uint8Array(200)]);
    const calls:{start:number;end:number}[]=[];
    const observed={name:raw.name,size:raw.size,slice:(start:number,end:number)=>{
      calls.push({start,end});return raw.slice(start,end);
    }};
    const tags=await readAudioMetadata(observed);
    expect(tags).toEqual({title:'Canción real',artist:'Artista real',album:'Mi álbum',genre:'Pop'});
    expect(calls.every(x=>x.end-x.start<=512*1024)).toBe(true);
  });
  it('falls back to ID3v1 when v2 tags are missing',async()=>{
    const tag=new Uint8Array(128);
    tag.set(new TextEncoder().encode('TAG'),0);
    tag.set(new TextEncoder().encode('Legacy Song'),3);
    tag.set(new TextEncoder().encode('Legacy Artist'),33);
    tag.set(new TextEncoder().encode('Legacy Album'),63);
    const result=await readAudioMetadata(named('raw.mp3',[new Uint8Array(40),tag]));
    expect(result).toMatchObject({title:'Legacy Song',artist:'Legacy Artist',album:'Legacy Album'});
  });
  it('handles unsupported and malformed media without crashing',async()=>{
    const malformed=named('Grupo - Tema.mp3',[new Uint8Array([73,68,51,3,0,0,127,127,127,127]),new Uint8Array(50)]);
    expect(await readAudioMetadata(malformed)).toMatchObject({title:'Tema',artist:'Grupo'});
    expect(await readAudioMetadata(named('Track.flac',[new Uint8Array(10)]))).toMatchObject({title:'Track'});
  });
  it('reads FLAC Vorbis comments as album artist and title',async()=>{
    const encode=new TextEncoder();
    const u32=(value:number)=>new Uint8Array([value&255,(value>>8)&255,(value>>16)&255,(value>>24)&255]);
    const comments=['TITLE=Un cielo azul','ARTIST=Grupo del Río','ALBUM=Mi álbum','GENRE=Rock'];
    const payload:Uint8Array[]=[u32(0),u32(comments.length)];
    for(const tag of comments){const bytes=encode.encode(tag);payload.push(u32(bytes.length),bytes);}
    const length=payload.reduce((sum,x)=>sum+x.length,0);
    const header=new Uint8Array([102,76,97,67,0x84,(length>>16)&255,(length>>8)&255,length&255]);
    const tags=await readAudioMetadata(named('fallback.flac',[header,...payload]));
    expect(tags).toMatchObject({title:'Un cielo azul',artist:'Grupo del Río',album:'Mi álbum',genre:'Rock'});
  });
  it('reads small M4A iTunes atoms without decoding the audio track',async()=>{
    const enc=new TextEncoder();
    const be=(value:number)=>new Uint8Array([(value>>>24)&255,(value>>>16)&255,(value>>>8)&255,value&255]);
    const atom=(label:string,payload:Uint8Array):Uint8Array=>{
      const result=new Uint8Array(8+payload.length);
      result.set(be(result.length));result.set(new Uint8Array([...label].map(c=>c.charCodeAt(0)&255)),4);
      result.set(payload,8);return result;
    };
    const data=atom('data',new Uint8Array([0,0,0,1,0,0,0,0,...enc.encode('Noche de Luna')]));
    const name=atom(String.fromCharCode(169)+'nam',data);
    const container=atom('moov',atom('udta',atom('meta',new Uint8Array([0,0,0,0,...atom('ilst',name)]))));
    const tags=await readAudioMetadata(named('fallback.m4a',[container]));
    expect(tags.title).toBe('Noche de Luna');
  });

});
