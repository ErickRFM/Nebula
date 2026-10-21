/** Only small embedded PNG/JPEG covers become private cloud cover files. */
const MAX_COVER_BYTES=256*1024;
export function embeddedCoverFile(dataUrl:string):File|null{
  const match=/^data:(image\/(?:png|jpeg));base64,([a-zA-Z0-9+/=]+)$/.exec(dataUrl);
  if(!match||match[2].length>Math.ceil(MAX_COVER_BYTES/3)*4+4)return null;
  try{
    const raw=atob(match[2]);
    if(raw.length<12||raw.length>MAX_COVER_BYTES)return null;
    const bytes=Uint8Array.from(raw,ch=>ch.charCodeAt(0));
    const valid=match[1]==='image/png'
      ? bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71
      : bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
    if(!valid)return null;
    return new File([Uint8Array.from(bytes).buffer as ArrayBuffer],match[1]==='image/png'?'cover.png':'cover.jpg',{type:match[1]});
  }catch{return null;}
}
export async function validatedCoverFile(file:File):Promise<boolean>{
  if(!['image/png','image/jpeg'].includes(file.type)||file.size<12||file.size>MAX_COVER_BYTES)return false;
  const bytes=new Uint8Array(await file.slice(0,8).arrayBuffer());
  return file.type==='image/png'?(bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71)
    :(bytes[0]===255&&bytes[1]===216&&bytes[2]===255);
}
