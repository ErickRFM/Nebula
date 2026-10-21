import {test,expect} from '@playwright/test';

test('account data from a delayed request cannot reappear after logout',async({page})=>{
 test.skip(!process.env.NEXT_PUBLIC_API_URL,'Requires disposable API');
 let releaseRequest:()=>void=()=>{};
 const held=new Promise<void>(resolve=>{releaseRequest=resolve;});
 let requestStarted=false;
 await page.route('**/v1/playlists',async route=>{
   if(route.request().method()!=='GET'){await route.continue();return;}
   requestStarted=true;
   await held;
   await route.fulfill({status:200,contentType:'application/json',
     body:JSON.stringify({items:[{id:'f6d1d0e8-7d14-4bc6-ab13-d400c41cff11',
       name:'Private playlist from signed-out account',createdAt:new Date().toISOString()}]})});
 });
 try{
   await page.goto('/');
   await page.getByRole('button',{name:'Mi cuenta'}).click();
   await page.getByRole('button',{name:'¿No tienes cuenta? Regístrate'}).click();
   const email='session-race-'+Date.now()+'-'+Math.random().toString(36).slice(2)+'@example.test';
   await page.getByRole('textbox',{name:'Correo electrónico'}).fill(email);
   await page.getByLabel('Contraseña').fill('NebulaTestPassword123!');
   await page.getByRole('button',{name:'Crear mi cuenta'}).click();
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
