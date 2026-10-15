import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt=promisify(scryptCallback);
const DERIVED_LENGTH=64;
export async function hashPassword(password: string): Promise<string> {
  const salt=randomBytes(16).toString('hex');
  const derived=(await scrypt(password,salt,DERIVED_LENGTH)) as Buffer;
  return ['scrypt',salt,derived.toString('hex')].join('$');
}
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algorithm,salt,hex]=stored.split('$');
  if(algorithm!=='scrypt'||!salt||!hex) return false;
  let expected: Buffer;
  try {expected=Buffer.from(hex,'hex');} catch{return false;}
  if(expected.length!==DERIVED_LENGTH) return false;
  const actual=(await scrypt(password,salt,DERIVED_LENGTH)) as Buffer;
  return timingSafeEqual(actual,expected);
}
