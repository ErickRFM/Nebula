import {describe,it,expect} from 'vitest';
import {Pool} from 'pg';
import {buildApp} from './app';

describe('auth outage response',()=>{
 it('returns sanitized 503 for unreachable Postgres instead of misleading 500',async()=>{
  const pool=new Pool({host:'127.0.0.1',port:1,user:'test',password:'test',database:'none',connectionTimeoutMillis:300});
  const app=await buildApp({pool,secret:'integration-test-very-long-and-nonproduction-secret',origin:'http://localhost:3000',registrationEnabled:false});
  try{
   const config=await app.inject({method:'GET',url:'/v1/auth/config'});
   expect(config.statusCode).toBe(200);
   const failed=await app.inject({method:'POST',url:'/v1/auth/login',
    payload:{email:'nobody@example.test',password:'SafeTestPassword12345!'}});
   expect(failed.statusCode).toBe(503);
   expect(failed.json()).toEqual({error:'database_unavailable'});
   expect(failed.headers['retry-after']).toBe('30');
   expect(JSON.stringify(failed.json())).not.toContain('postgres');
  }finally{await app.close();await pool.end();}
 });
});
