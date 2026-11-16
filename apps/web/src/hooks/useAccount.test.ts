import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {describe,expect,it} from 'vitest';
import {GUEST_EMAIL_DOMAIN,isGuestIdentity} from './useAccount';
describe('guest identity marker',()=>{
 it('recognizes only the domain the bridge of guests reserves',()=>{
  expect(isGuestIdentity({id:'u1',email:'guest-1f0e@nebula.invalid',role:'member'})).toBe(true);
  expect(isGuestIdentity({id:'u2',email:'Guest-1F0E@NEBULA.INVALID',role:'member'})).toBe(true);
 });
 it('keeps real accounts and signed-out devices out of the guest path',()=>{
  expect(isGuestIdentity({id:'u3',email:'ana@ejemplo.com',role:'owner'})).toBe(false);
  expect(isGuestIdentity({id:'u4',email:'ana@nebula.invalid.ejemplo.com'})).toBe(false);
  expect(isGuestIdentity({id:'u5',email:'nebula.invalid'})).toBe(false);
  expect(isGuestIdentity(null)).toBe(false);
 });
 it('uses a domain no invited account can be created with',()=>{
  // '.invalid' está reservado por la RFC 2606: ningún correo real puede terminarlo.
  expect(GUEST_EMAIL_DOMAIN).toBe('@nebula.invalid');
 });
 it('agrees with the address the API really provisions',()=>{
  const source=readFileSync(fileURLToPath(new URL('../../../../apps/api/src/modules/auth.ts',import.meta.url)),'utf8');
  expect(/email:\s*'guest-'\s*\+\s*id\s*\+\s*'([^']+)'/.exec(source)?.[1]).toBe(GUEST_EMAIL_DOMAIN);
 });
});
