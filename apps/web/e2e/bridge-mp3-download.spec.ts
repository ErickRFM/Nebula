import {test,expect} from '@playwright/test';

test('private bridge converts an authorized YouTube URL into downloadable library MP3',async({page})=>{
 const mp3=Buffer.concat([Buffer.from('ID3'),Buffer.alloc(2048,7)]);
 await page.route('http://127.0.0.1:4177/health',route=>route.fulfill({
  status:200,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},
  body:JSON.stringify({status:'ok',private:true,enabled:true}),
 }));
 await page.route('http://127.0.0.1:4177/ticket',async route=>{
  if(route.request().method()==='OPTIONS'){
   await route.fulfill({status:204,headers:{
    'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'POST, OPTIONS',
    'Access-Control-Allow-Headers':'Authorization, Content-Type',
    'Access-Control-Allow-Private-Network':'true',
   }});return;
  }
  expect(route.request().method()).toBe('POST');
  expect(JSON.parse(route.request().postData()||'{}').id).toBe('dQw4w9WgXcQ');
  await route.fulfill({status:200,contentType:'application/json',
   headers:{'Access-Control-Allow-Origin':'*'},
   body:JSON.stringify({ticket:'A'.repeat(40)+'.'+'B'.repeat(43),expiresInSeconds:120})});
 });
 await page.route('http://127.0.0.1:4177/download?*',route=>route.fulfill({
  status:200,body:mp3,headers:{'Content-Type':'audio/mpeg','Access-Control-Allow-Origin':'*','Access-Control-Allow-Private-Network':'true'},
 }));
 await page.addInitScript(()=>sessionStorage.setItem('nebula:private-bridge-session-token','test-token-'+('x'.repeat(40))));
 await page.goto('/');
 const desktop=page.getByRole('navigation',{name:'Navegación principal'}).getByRole('button',{name:'Buscar',exact:true});
 if(await desktop.isVisible())await desktop.click();
 else await page.getByRole('navigation',{name:'Navegación móvil'}).getByRole('button',{name:'Buscar',exact:true}).click();
 const bridge=page.getByRole('region',{name:'Reproductor local privado'});
 await expect(bridge.getByLabel('Enlace de video de YouTube')).toBeVisible();
 await bridge.getByLabel('Enlace de video de YouTube').fill('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
 await bridge.getByRole('button',{name:'Usar enlace'}).click();
 await expect(bridge.getByRole('button',{name:'Descargar MP3'})).toBeDisabled();
 await bridge.getByRole('checkbox',{name:'Confirmo que tengo derecho a descargar y guardar este audio.'}).check();
 const downloading=page.waitForEvent('download');
 await bridge.getByRole('button',{name:'Descargar MP3'}).click();
 const saved=await downloading;
 expect(saved.suggestedFilename()).toMatch(/\.mp3$/);
 await expect(bridge.getByText('MP3 descargado y añadido a tu Biblioteca local',{exact:false})).toBeVisible();
 const library=page.getByRole('navigation',{name:'Navegación principal'}).getByRole('button',{name:'Biblioteca',exact:true});
 if(await library.isVisible())await library.click();
 else await page.getByRole('navigation',{name:'Navegación móvil'}).getByRole('button',{name:'Biblioteca',exact:true}).click();
 await expect(page.getByText('Video dQw4w9WgXcQ.mp3')).toBeVisible();
});
