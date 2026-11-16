import {test,expect,type Page} from '@playwright/test';

const TOKEN='test-token-'+('x'.repeat(40));
const LIST='https://www.youtube.com/playlist?list=PL'+('a'.repeat(30));
const URL_LABEL='Enlace de YouTube: video, playlist o mix';
const JOB='11111111-1111-4111-8111-111111111111';
const BRIDGE='http://127.0.0.1:4177';
type Entry={id:string;title:string;artist:string;durationSeconds:number;sourceUrl:string};

function entries(count:number):Entry[]{
 return Array.from({length:count},(_,index)=>{
  const id='PLtrack'+String(index).padStart(4,'0');
  return {id,title:'Track '+String(index).padStart(4,'0'),artist:'Artist '+String(index%40),
   durationSeconds:180,sourceUrl:'https://www.youtube.com/watch?v='+id};
 });
}
function cors(){
 return {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Private-Network':'true',
  'Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Allow-Methods':'GET, POST, OPTIONS'};
}
async function openBridge(page:Page){
 await page.addInitScript(value=>sessionStorage.setItem('nebula:private-bridge-session-token',value),TOKEN);
 await page.goto('/');
 const desktop=page.getByRole('navigation',{name:'Navegación principal'}).getByRole('button',{name:'Buscar',exact:true});
 if(await desktop.isVisible())await desktop.click();
 else await page.getByRole('navigation',{name:'Navegación móvil'}).getByRole('button',{name:'Buscar',exact:true}).click();
 return page.getByRole('region',{name:'Reproductor local privado'});
}

test('a playlist link lists 1.000 tracks and the bridge writes the batch on its own machine',async({page})=>{
 const items=entries(1000);
 const ids=new Set(items.map(item=>item.id));
 let sentUrl='';
 let sentIds:string[]=[];
 await page.route(BRIDGE+'/health',route=>route.fulfill({status:200,contentType:'application/json',
  headers:cors(),body:JSON.stringify({status:'ok',private:true,enabled:true})}));
 await page.route(BRIDGE+'/resolve?*',route=>{
  expect(new URL(route.request().url()).searchParams.get('url')).toBe(LIST);
  return route.fulfill({status:200,contentType:'application/json',headers:cors(),
   body:JSON.stringify({items,truncated:false})});
 });
 await page.route(BRIDGE+'/batch',async route=>{
  if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers:cors()});
  expect(route.request().headers().authorization).toContain('test-token');
  const body=JSON.parse(route.request().postData()||'{}') as {listUrl?:string;ids?:string[]};
  sentUrl=body.listUrl??'';
  sentIds=body.ids??[];
  await route.fulfill({status:202,contentType:'application/json',headers:cors(),body:JSON.stringify({job:{
   id:JOB,total:sentIds.length,completed:0,saved:0,failed:0,status:'running',current:null,
   errorItems:[],destination:'C:\\Users\\test\\Downloads\\Nebula',
   note:'Los archivos se guardan en el equipo que ejecuta el puente.'}})});
 });
 await page.route(BRIDGE+'/batch/'+JOB,route=>route.fulfill({status:200,contentType:'application/json',
  headers:cors(),body:JSON.stringify({job:{id:JOB,total:1000,completed:1000,saved:1000,failed:0,
   status:'completed',current:null,errorItems:[],destination:'C:\\Users\\test\\Downloads\\Nebula',
   note:'Los archivos se guardan en el equipo que ejecuta el puente.'}})}));
 const bridge=await openBridge(page);
 await bridge.getByLabel(URL_LABEL).fill(LIST);
 await bridge.getByRole('button',{name:'Ver lista de pistas'}).click();
 await expect(bridge.getByText('1000 pistas · 1000 seleccionadas · 0 listas')).toBeVisible();
 // Mil filas seguirían siendo mil nodos de botones: la lista se abre en ventanas de 60.
 await expect(bridge.locator('.bridge-track')).toHaveCount(60);
 await bridge.getByRole('button',{name:'Mostrar 60 más (940 por mostrar)'}).click();
 await expect(bridge.locator('.bridge-track')).toHaveCount(120);
 // La reproducción y la cola del navegador siguen existiendo; el lote largo es un destino más.
 await bridge.getByRole('checkbox',{name:'Confirmo que tengo derecho a descargar y guardar este audio.'}).check();
 await expect(bridge.getByRole('button',{name:'Poner en cola 1000 descargas MP3'})).toBeEnabled();
 await bridge.getByRole('checkbox',{name:'Guardar el lote en la carpeta del puente (hasta 1000)'}).check();
 await expect(bridge.getByRole('checkbox',{name:'Guardar en mi Biblioteca automáticamente'})).toBeDisabled();
 await expect(bridge.getByRole('button',{name:'Descargar MP3 de Track 0000'})).toBeDisabled();
 await bridge.getByRole('button',{name:'Guardar 1000 MP3 en este equipo'}).click();
 const dialogo=page.getByRole('alertdialog');
 await expect(dialogo.getByText('¿Guardar 1000 MP3 en este equipo?')).toBeVisible();
 await dialogo.getByRole('button',{name:'Empezar el lote'}).click();
 await expect(bridge.getByText('Lote completado')).toBeVisible();
 await expect(bridge.getByText('1000 convertidas · 0 con error',{exact:false})).toBeVisible();
 expect(sentUrl).toBe(LIST);
 expect(sentIds.length).toBe(1000);
 expect(new Set(sentIds).size).toBe(1000);
 expect(sentIds.every(id=>ids.has(id))).toBe(true);
});
