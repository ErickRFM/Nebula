import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { R2Settings } from './r2.js';

/**
 * Artwork ticket never exposes R2 credentials. Each upload has a unique object
 * key: an interrupted PUT cannot overwrite the currently selected cover.
 * HMAC is domain-separated from AWS SigV4 and binds owner, track, prior cover,
 * MIME, exact size, object key and expiry.
 */
const dataSchema=z.object({
  v:z.literal(2),
  userId:z.string().uuid(),
  trackId:z.string().uuid(),
  key:z.string().regex(/^users\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(?:png|jpg)$/),
  previousKey:z.string().nullable(),
  contentType:z.enum(['image/png','image/jpeg']),
  size:z.number().int().min(12).max(256*1024),
  expiresAt:z.number().int(),
});
export type CoverTicketData=z.infer<typeof dataSchema>;
const context='nebula:private-r2-cover-upload:v2:';
const sign=(settings:R2Settings,data:string)=>
  createHmac('sha256',settings.secretAccessKey).update(context+data).digest('base64url');

export function createCoverTicket(
  settings:R2Settings,
  args:{userId:string;trackId:string;previousKey:string|null;contentType:'image/png'|'image/jpeg';size:number},
  now=Date.now(),
):{token:string;key:string}{
  const extension=args.contentType==='image/png'?'png':'jpg';
  const data=dataSchema.parse({
    v:2,userId:args.userId,trackId:args.trackId,
    key:'users/'+args.userId+'/'+randomUUID()+'.'+extension,
    previousKey:args.previousKey,
    contentType:args.contentType,size:args.size,expiresAt:now+600_000,
  });
  const payload=Buffer.from(JSON.stringify(data)).toString('base64url');
  return {token:payload+'.'+sign(settings,payload),key:data.key};
}

export function verifyCoverTicket(
  settings:R2Settings,token:string,userId:string,trackId:string,now=Date.now(),
):CoverTicketData|null{
  if(token.length>1300||token.length<32)return null;
  const chunks=token.split('.');
  if(chunks.length!==2||!chunks[0]||!chunks[1]||!/^[a-zA-Z0-9_-]+$/.test(chunks[0])||!/^[a-zA-Z0-9_-]{43}$/.test(chunks[1]))return null;
  const provided=Buffer.from(chunks[1],'base64url');
  const expected=Buffer.from(sign(settings,chunks[0]),'base64url');
  if(provided.length!==expected.length||!timingSafeEqual(provided,expected))return null;
  try{
    const parsed=dataSchema.safeParse(JSON.parse(Buffer.from(chunks[0],'base64url').toString('utf8')) as unknown);
    if(!parsed.success)return null;
    const item=parsed.data;
    if(item.userId!==userId||item.trackId!==trackId||now>item.expiresAt||item.expiresAt-now>600_000)return null;
    const ext=item.contentType==='image/png'?'png':'jpg';
    if(!item.key.startsWith('users/'+userId+'/')||!item.key.endsWith('.'+ext))return null;
    return item;
  }catch{return null;}
}
