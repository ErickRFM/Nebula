import {describe,it,expect} from 'vitest';
import {hashPassword,verifyPassword} from './password';
describe('account password hashing',()=>{
  it('salts every encoded password and verifies safely',async()=>{
    const a=await hashPassword('PasswordForTests123');
    const b=await hashPassword('PasswordForTests123');
    expect(a).not.toEqual(b);
    expect(await verifyPassword('PasswordForTests123',a)).toBe(true);
    expect(await verifyPassword('not-correct',a)).toBe(false);
    expect(await verifyPassword('wrong','garbage')).toBe(false);
  });
});
