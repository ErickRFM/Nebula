import {describe,expect,it} from 'vitest';
import {createCoverTicket,verifyCoverTicket} from './cover-ticket';
const settings={accountId:'0123456789abcdef0123456789abcdef',accessKeyId:'test',secretAccessKey:'r2-private-test',bucket:'nebula-music-private'};
const userId='00000000-0000-4000-8000-000000000000';
const trackId='00000000-0000-4000-8000-000000000001';
const now=Date.parse('2026-10-21T15:00:00Z');

describe('private versioned artwork reservations',()=>{
  it('issues unique keys and binds image size, type, owner and old cover',()=>{
    const props={userId,trackId,previousKey:null,contentType:'image/png' as const,size:64};
    const first=createCoverTicket(settings,props,now);
    const second=createCoverTicket(settings,props,now);
    expect(first.key).not.toBe(second.key);
    const verified=verifyCoverTicket(settings,first.token,userId,trackId,now+1000);
    expect(verified).toMatchObject({key:first.key,size:64,contentType:'image/png',previousKey:null});
    expect(first.token).not.toContain('r2-private-test');
    expect(verifyCoverTicket(settings,first.token,'00000000-0000-4000-8000-000000000002',trackId,now)).toBeNull();
    expect(verifyCoverTicket(settings,first.token,userId,'00000000-0000-4000-8000-000000000003',now)).toBeNull();
    expect(verifyCoverTicket(settings,first.token,userId,trackId,now+601000)).toBeNull();
  });
  it('rejects tampering, invalid signatures and mismatched key types',()=>{
    const {token}=createCoverTicket(settings,{userId,trackId,previousKey:null,contentType:'image/jpeg',size:200},now);
    const [payload,signature]=token.split('.');
    expect(verifyCoverTicket(settings,payload+'.'+signature.slice(0,-1)+'A',userId,trackId,now)).toBeNull();
    expect(verifyCoverTicket({...settings,secretAccessKey:'different'},token,userId,trackId,now)).toBeNull();
    expect(verifyCoverTicket(settings,token+'...',userId,trackId,now)).toBeNull();
    expect(verifyCoverTicket(settings,token,userId,trackId,now-601000)).toBeNull();
  });
});
