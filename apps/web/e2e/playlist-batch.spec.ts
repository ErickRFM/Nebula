import {test,expect} from '@playwright/test';

const playlistId='PL'+('a'.repeat(30));
const origin='http://127.0.0.1:4177';
function cors(){
 return {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Private-Network':'true',
  'Access-Control-Allow-Headers':'Authorization, Content-Type',
  'Access-Control-Allow-Methods':'GET, POST, OPTIONS'};
}
test('a playlist URL loads up to 1000 selectable songs and tracks a local batch',async({page})=>{
 const songs=Array.from({length:1000},(_,index)=>({
  id:String(index).padStart(11,'0'),title:'Canción '+index,artist:'Artista',
  durationSeconds:120,
 }));
 let received=0;
 await page.route(origin+'/health',route=>route.fulfill({
  status:200,contentType:'application/json',headers:cors(),
  body:JSON.stringify({status:'ok',private:true,enabled:true}),
 }));
 await page.route(origin+'/playlist?*',async route=>{
  if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers:cors()});
  expect(route.request().headers().authorization).toContain('test-token');
  return route.fulfill({status:200,contentType:'application/json',headers:cors(),
   body:JSON.stringify({listId:playlistId,title:'Colección de prueba',total:1000,
    truncated:true,items:songs})});
 });
 await page.route(origin+'/batch',async route=>{
  if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers:cors()});
  const body=JSON.parse(route.request().postData()||'{}');
  expect(body.listId).toBe(playlistId);
  received=body.ids.length;
  return route.fulfill({status:202,contentType:'application/json',headers:cors(),
   body:JSON.stringify({job:{id:'11111111-1111-4111-8111-111111111111',total:received,
    completed:0,saved:0,failed:0,status:'running',current:songs[0].id,
    errorItems:[],destination:'Descargas/Nebula',note:'Guardado en tu equipo'}})});
 });
 await page.route(origin+'/batch/11111111-1111-4111-8111-111111111111',route=>route.fulfill({
  status:200,contentType:'application/json',headers:cors(),
  body:JSON.stringify({job:{id:'11111111-1111-4111-8111-111111111111',
   total:received,completed:received,saved:received,failed:0,
   status:'completed',current:null,errorItems:[],destination:'Descargas/Nebula',note:'Guardado en tu equipo'}}),
 }));
 await page.addInitScript(()=>sessionStorage.setItem('nebula:private-bridge-session-token','test-token-'+('x'.repeat(40))));
 await page.goto('/');
 const desktop=page.getByRole('navigation',{name:'Navegación principal'}).getByRole('button',{name:'Buscar',exact:true});
 if(await desktop.isVisible())await desktop.click();
 else await page.getByRole('navigation',{name:'Navegación móvil'}).getByRole('button',{name:'Buscar',exact:true}).click();
 const bridge=page.getByRole('region',{name:'Reproductor local privado'});
 const panel=bridge.getByRole('region',{name:'Descarga de playlists completas'});
 await panel.getByLabel('URL de playlist de YouTube').fill('https://www.youtube.com/playlist?list='+playlistId);
 await panel.getByRole('button',{name:'Cargar canciones'}).click();
 await expect(panel.getByText('1000 pistas cargadas',{exact:false})).toBeVisible();
 await expect(panel.locator('.batch-track')).toHaveCount(40);
 await panel.getByLabel('Filtrar canciones').fill('Canción 999');
 await expect(panel.locator('.batch-track')).toHaveCount(1);
 await panel.getByLabel('Filtrar canciones').fill('');
 await expect(panel.getByRole('button',{name:'Descargar 1000 MP3 seleccionados'})).toBeDisabled();
 await bridge.getByRole('checkbox',{name:'Confirmo que tengo derecho a descargar y guardar este audio.'}).check();
 page.once('dialog',dialog=>{void dialog.accept();});
 await panel.getByRole('button',{name:'Descargar 1000 MP3 seleccionados'}).click();
 await expect(panel.getByText('Lote completado')).toBeVisible({timeout:15000});
 await expect(panel.getByText('1000 procesadas correctamente',{exact:false})).toBeVisible();
 expect(received).toBe(1000);
});
