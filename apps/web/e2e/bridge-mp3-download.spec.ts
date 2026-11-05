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
 await page.route('http://127.0.0.1:4177/download?*',route=>{
  if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers:{
   'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET, OPTIONS',
   'Access-Control-Allow-Private-Network':'true',
  }});
  return route.fulfill({status:200,body:mp3,headers:{
   'Content-Type':'audio/mpeg','Access-Control-Allow-Origin':'*','Access-Control-Allow-Private-Network':'true',
  }});
 });
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
 // The library shows the parsed song title without the file extension.
 await expect(page.getByText('Video dQw4w9WgXcQ',{exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Descargar archivo original de Video dQw4w9WgXcQ'})).toBeVisible();
 await page.reload();
 const restored=page.getByRole('navigation',{name:'Navegación principal'}).getByRole('button',{name:'Biblioteca',exact:true});
 if(await restored.isVisible())await restored.click();
 else await page.getByRole('navigation',{name:'Navegación móvil'}).getByRole('button',{name:'Biblioteca',exact:true}).click();
 await expect(page.getByRole('button',{name:'Descargar archivo original de Video dQw4w9WgXcQ'})).toBeVisible();
});

test('embedded YouTube link opens the paired MP3 bridge with URL prefilled',async({page})=>{
 await page.route('http://127.0.0.1:4177/health',route=>route.fulfill({
  status:200,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},
  body:JSON.stringify({status:'ok',private:true,enabled:true}),
 }));
 await page.addInitScript(()=>sessionStorage.setItem('nebula:private-bridge-session-token','test-token-'+('x'.repeat(40))));
 await page.goto('/');
 const nav=page.getByRole('navigation',{name:'Navegación principal'}).getByRole('button',{name:'Buscar',exact:true});
 if(await nav.isVisible())await nav.click();
 else await page.getByRole('navigation',{name:'Navegación móvil'}).getByRole('button',{name:'Buscar',exact:true}).click();
 const external=page.getByRole('region',{name:'Reproductores oficiales de música'});
 const video='https://www.youtube.com/watch?v=dQw4w9WgXcQ';
 await external.getByRole('textbox',{name:'Enlace de YouTube, SoundCloud o Spotify'}).fill(video);
 await external.getByRole('button',{name:'Abrir reproductor'}).click();
 await external.getByRole('button',{name:'Descargar MP3 (puente local)'}).click();
 const bridge=page.getByRole('region',{name:'Reproductor local privado'});
 await expect(bridge.getByLabel('Enlace de video de YouTube')).toHaveValue(video);
 await expect(bridge.getByRole('button',{name:'Descargar MP3'})).toBeDisabled();
});
