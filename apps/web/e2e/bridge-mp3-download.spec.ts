import {test,expect,type Page} from '@playwright/test';

const MP3=Buffer.concat([Buffer.from('ID3'),Buffer.alloc(2048,7)]);
const TICKET='A'.repeat(40)+'.'+'B'.repeat(43);
const TOKEN='test-token-'+('x'.repeat(40));
const URL_LABEL='Enlace de YouTube: video, playlist o mix';
type Entry={id:string;title:string;artist:string;durationSeconds:number;sourceUrl:string};

function playlistEntries(count:number):Entry[]{
 return Array.from({length:count},(_,index)=>{
  const id='PLtrack'+String(index).padStart(4,'0');
  return {id,title:'Track '+String(index).padStart(2,'0'),artist:'Artist '+String(index).padStart(2,'0'),
   durationSeconds:180+index,sourceUrl:'https://www.youtube.com/watch?v='+id};
 });
}
async function mockBridge(page:Page,entries:Entry[]){
 const ids=new Set(entries.map(entry=>entry.id));
 await page.route('http://127.0.0.1:4177/health',route=>route.fulfill({
  status:200,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},
  body:JSON.stringify({status:'ok',private:true,enabled:true}),
 }));
 await page.route('http://127.0.0.1:4177/resolve?*',route=>route.fulfill({
  status:200,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},
  body:JSON.stringify({items:entries,truncated:false}),
 }));
 await page.route('http://127.0.0.1:4177/ticket',async route=>{
  if(route.request().method()==='OPTIONS'){
   await route.fulfill({status:204,headers:{
    'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'POST, OPTIONS',
    'Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Allow-Private-Network':'true',
   }});return;
  }
  expect(route.request().method()).toBe('POST');
  expect(ids.has(JSON.parse(route.request().postData()||'{}').id)).toBe(true);
  await route.fulfill({status:200,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},
   body:JSON.stringify({ticket:TICKET,expiresInSeconds:120})});
 });
 await page.route('http://127.0.0.1:4177/download?*',route=>{
  if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers:{
   'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET, OPTIONS','Access-Control-Allow-Private-Network':'true',
  }});
  return route.fulfill({status:200,body:MP3,headers:{
   'Content-Type':'audio/mpeg','Access-Control-Allow-Origin':'*','Access-Control-Allow-Private-Network':'true',
  }});
 });
}
async function openBridge(page:Page){
 await page.addInitScript(value=>sessionStorage.setItem('nebula:private-bridge-session-token',value),TOKEN);
 await page.goto('/');
 const desktop=page.getByRole('navigation',{name:'Navegación principal'}).getByRole('button',{name:'Buscar',exact:true});
 if(await desktop.isVisible())await desktop.click();
 else await page.getByRole('navigation',{name:'Navegación móvil'}).getByRole('button',{name:'Buscar',exact:true}).click();
 return page.getByRole('region',{name:'Reproductor local privado'});
}
async function openLibrary(page:Page){
 const desktop=page.getByRole('navigation',{name:'Navegación principal'}).getByRole('button',{name:'Biblioteca',exact:true});
 if(await desktop.isVisible())await desktop.click();
 else await page.getByRole('navigation',{name:'Navegación móvil'}).getByRole('button',{name:'Biblioteca',exact:true}).click();
}
function libraryTitle(page:Page,title:string){
 return page.locator('.track-list .track-descriptor strong').filter({hasText:title});
}

test('a single authorized YouTube URL becomes a downloadable library MP3',async({page})=>{
 const video:Entry={id:'dQw4w9WgXcQ',title:'Never Gonna Give You Up',artist:'Test Artist',durationSeconds:213,
  sourceUrl:'https://www.youtube.com/watch?v=dQw4w9WgXcQ'};
 await mockBridge(page,[video]);
 const bridge=await openBridge(page);
 await bridge.getByLabel(URL_LABEL).fill(video.sourceUrl);
 await bridge.getByRole('button',{name:'Ver lista de pistas'}).click();
 await expect(bridge.locator('.bridge-track')).toHaveCount(1);
 await expect(bridge.getByRole('button',{name:'Poner en cola 1 descargas MP3'})).toBeDisabled();
 await bridge.getByRole('checkbox',{name:'Confirmo que tengo derecho a descargar y guardar este audio.'}).check();
 const downloading=page.waitForEvent('download');
 await bridge.getByRole('button',{name:'Descargar MP3 de Never Gonna Give You Up'}).click();
 const saved=await downloading;
 expect(saved.suggestedFilename()).toMatch(/\.mp3$/);
 await expect(bridge.getByText('MP3 listo:')).toBeVisible();
 await expect(bridge.locator('.bridge-state.done')).toHaveCount(1);
 await openLibrary(page);
 // The library shows the parsed song title without the file extension.
 await expect(libraryTitle(page,'Never Gonna Give You Up').first()).toBeVisible();
 await expect(page.getByRole('button',{name:'Descargar archivo original de Never Gonna Give You Up'})).toBeVisible();
 await page.reload();
 await openLibrary(page);
 await expect(page.getByRole('button',{name:'Descargar archivo original de Never Gonna Give You Up'})).toBeVisible();
});

test('a playlist link offers per-track selection and batches of ten into the library',async({page})=>{
 const entries=playlistEntries(12);
 await mockBridge(page,entries);
 const bridge=await openBridge(page);
 await bridge.getByLabel(URL_LABEL).fill('https://www.youtube.com/playlist?list=RDdQw4w9WgXcQ');
 await bridge.getByRole('button',{name:'Ver lista de pistas'}).click();
 await expect(bridge.locator('.bridge-track')).toHaveCount(12);
 await expect(bridge.getByText('12 pistas · 12 seleccionadas · 0 listas')).toBeVisible();
 await bridge.getByRole('button',{name:'Ninguna'}).click();
 await expect(bridge.getByText('12 pistas · 0 seleccionadas · 0 listas')).toBeVisible();
 await expect(bridge.getByRole('button',{name:'Poner en cola 0 descargas MP3'})).toBeDisabled();
 await bridge.getByRole('button',{name:'+10 siguientes'}).click();
 await expect(bridge.getByText('12 pistas · 10 seleccionadas · 0 listas')).toBeVisible();
 // Keep only the library destination so the batch does not fight the browser multi-download guard.
 await bridge.getByRole('checkbox',{name:'Descargar también una copia de archivo'}).uncheck();
 await bridge.getByRole('checkbox',{name:'Confirmo que tengo derecho a descargar y guardar este audio.'}).check();
 await bridge.getByRole('button',{name:'Poner en cola 10 descargas MP3'}).click();
 await expect(bridge.getByText('Descargas terminadas: 10 listas, 0 fallidas.')).toBeVisible();
 await expect(bridge.locator('.bridge-state.done')).toHaveCount(10);
 await expect(bridge.getByText('12 pistas · 10 seleccionadas · 10 listas')).toBeVisible();
 await expect(bridge.locator('.bridge-track').nth(11).locator('.bridge-state.ready')).toBeVisible();
 await bridge.getByRole('checkbox',{name:'Seleccionar Track 09'}).uncheck();
 await expect(bridge.getByText('12 pistas · 9 seleccionadas · 9 listas')).toBeVisible();
 await openLibrary(page);
 await expect(libraryTitle(page,'Track 00')).toHaveCount(1);
 await expect(libraryTitle(page,'Track 09')).toHaveCount(1);
 await expect(libraryTitle(page,'Track 10')).toHaveCount(0);
});

test('embedded YouTube link opens the paired MP3 bridge with URL prefilled',async({page})=>{
 await mockBridge(page,[playlistEntries(1)[0]]);
 await page.addInitScript(value=>sessionStorage.setItem('nebula:private-bridge-session-token',value),TOKEN);
 await page.goto('/');
 const desktop=page.getByRole('navigation',{name:'Navegación principal'}).getByRole('button',{name:'Buscar',exact:true});
 if(await desktop.isVisible())await desktop.click();
 else await page.getByRole('navigation',{name:'Navegación móvil'}).getByRole('button',{name:'Buscar',exact:true}).click();
 const external=page.getByRole('region',{name:'Reproductores oficiales de música'});
 const video='https://www.youtube.com/watch?v=dQw4w9WgXcQ';
 await external.getByRole('textbox',{name:'Enlace de YouTube, SoundCloud o Spotify'}).fill(video);
 await external.getByRole('button',{name:'Abrir reproductor'}).click();
 await external.getByRole('button',{name:'Descargar MP3 (puente local)'}).click();
 const bridge=page.getByRole('region',{name:'Reproductor local privado'});
 await expect(bridge.getByLabel(URL_LABEL)).toHaveValue(video);
 await expect(bridge.getByRole('button',{name:'Ver lista de pistas'})).toBeEnabled();
 await expect(bridge.getByRole('region',{name:'Lista de descargas'})).toHaveCount(0);
});
