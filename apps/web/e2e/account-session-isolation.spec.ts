import {test,expect} from '@playwright/test';
import {Pool} from 'pg';
import {randomBytes,randomUUID,scryptSync} from 'node:crypto';

test('late account playlist fetch cannot restore private data after logout',async({page})=>{
 test.skip(!process.env.NEXT_PUBLIC_API_URL||!process.env.NEBULA_TEST_DATABASE_URL,'Requires disposable PostgreSQL API');
 let releaseRequest:()=>void=()=>{};
 const held=new Promise<void>(resolve=>{releaseRequest=resolve;});
 let requestStarted=false;
 await page.route('**/v1/playlists',async route=>{
  if(route.request().method()!=='GET'){await route.continue();return;}
  requestStarted=true;await held;
  await route.fulfill({status:200,contentType:'application/json',
   body:JSON.stringify({items:[{id:'f6d1d0e8-7d14-4bc6-ab13-d400c41cff11',
    name:'Private playlist from signed-out account',createdAt:new Date().toISOString()}]})});
 });
 try{
  const email='session-race-'+Date.now()+'-'+Math.random().toString(36).slice(2)+'@example.test';
  const password='NebulaTestPassword123!';
  const pool=new Pool({connectionString:process.env.NEBULA_TEST_DATABASE_URL,max:1});
  try{
   const salt=randomBytes(16).toString('hex');
   const hash='scrypt$'+salt+'$'+scryptSync(password,salt,64).toString('hex');
   await pool.query("INSERT INTO users (id,email,password_hash,role) VALUES ($1,$2,$3,'member')",[randomUUID(),email,hash]);
  }finally{await pool.end();}
  await page.goto('/');
  await page.getByRole('button',{name:'Mi cuenta'}).click();
  await page.getByRole('textbox',{name:'Correo electrónico'}).fill(email);
  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button',{name:'Entrar'}).click();
  await expect(page.getByText('Sesión activa')).toBeVisible();
  await expect.poll(()=>requestStarted).toBe(true);
  await page.getByRole('button',{name:'Salir'}).click();
  releaseRequest();
  await expect(page.getByText('Sesión activa')).toHaveCount(0);
  await expect(page.getByText('Private playlist from signed-out account')).toHaveCount(0);
  await page.waitForTimeout(300);
  await expect(page.getByText('Private playlist from signed-out account')).toHaveCount(0);
 }finally{releaseRequest();}
});
