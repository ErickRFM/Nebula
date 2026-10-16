import { z } from 'zod';

const httpsUrl=z.string().url().max(2048).refine((value)=>{
  try {
    const uri=new URL(value);
    return uri.protocol==='https:' && !uri.username && !uri.password;
  } catch { return false; }
},'https_url_required');

export const externalInput=z.object({
  provider:z.enum(['jamendo','openverse','audius']),
  externalId:z.string().trim().regex(/^[a-zA-Z0-9_-]{1,160}$/),
  title:z.string().trim().min(1).max(200),
  artist:z.string().trim().min(1).max(200),
  artworkUrl:httpsUrl.nullish(),
  sourceUrl:httpsUrl,
  licenseUrl:httpsUrl.nullish(),
}).strict().superRefine(({provider,sourceUrl},ctx)=>{
  const host=new URL(sourceUrl).hostname;
  if(provider==='jamendo' && !['www.jamendo.com','jamendo.com','jamen.do'].includes(host))
    ctx.addIssue({code:'custom',path:['sourceUrl'],message:'invalid_jamendo_source'});
  if(provider==='audius' && !['audius.co','www.audius.co'].includes(host))
    ctx.addIssue({code:'custom',path:['sourceUrl'],message:'invalid_audius_source'});
});
export const externalDelete=z.object({
  provider:z.enum(['jamendo','openverse','audius']),
  externalId:z.string().regex(/^[a-zA-Z0-9_-]{1,160}$/),
});
