import {test,expect,type Page} from '@playwright/test';

async function navigate(page:Page,name:string){
 const desktop=page.getByRole('navigation',{name:'Navegación principal'}).getByRole('button',{name,exact:true});
 const mobile=page.getByRole('navigation',{name:'Navegación móvil'}).getByRole('button',{name,exact:true});
 if(await desktop.isVisible())await desktop.click();else await mobile.click();
}

test('catalog supports more pages without duplicates and resets results on provider change',async({page})=>{
 test.skip(!process.env.NEXT_PUBLIC_API_URL,'Requires disposable API');
 const track=(id:number)=>({
   id:'jamendo:'+id,provider:'jamendo',externalId:String(id),title:'Pista paginada '+id,
   artist:'Artista E2E',album:null,durationSeconds:120,artworkUrl:null,
   sourceUrl:'https://www.jamendo.com/track/'+id,licenseUrl:null,
   canStream:false,canDownload:false,canStorePrivateCopy:false,streamUrl:null,
 });
 const pages:number[]=[];
 await page.route('**/v1/discovery/search?**',async route=>{
   const current=Number(new URL(route.request().url()).searchParams.get('page')??'1');
   pages.push(current);
   const items=current===1?Array.from({length:12},(_,i)=>track(5001+i)):current===2?[track(5012),track(5013)]:[];
   await route.fulfill({status:200,contentType:'application/json',
     body:JSON.stringify({items,failedProviders:[],disabledProviders:[]})});
 });
 await page.goto('/');
 await page.getByRole('button',{name:'Mi cuenta'}).click();
 await page.getByRole('button',{name:'¿No tienes cuenta? Regístrate'}).click();
 const email='catalog-pages-'+Date.now()+'-'+Math.random().toString(36).slice(2)+'@example.test';
 await page.getByRole('textbox',{name:'Correo electrónico'}).fill(email);
 await page.getByLabel('Contraseña').fill('NebulaTestPassword123!');
 await page.getByRole('button',{name:'Crear mi cuenta'}).click();
 await expect(page.getByText('Sesión activa')).toBeVisible();
 await navigate(page,'Explorar');
 await page.getByRole('textbox',{name:'Buscar canciones externas'}).fill('paginada');
 await page.locator('.explore-form').getByRole('button',{name:'Buscar'}).click();
 await expect(page.locator('.explore-card')).toHaveCount(12);
 await page.getByRole('button',{name:'Cargar más canciones'}).click();
 await expect(page.locator('.explore-card')).toHaveCount(13);
 await expect(page.getByText('Pista paginada 5012')).toHaveCount(1);
 await expect(page.getByText('Pista paginada 5013')).toBeVisible();
 await expect(page.getByRole('button',{name:'Cargar más canciones'})).toHaveCount(0);
 expect(pages).toEqual([1,2]);
 await page.getByRole('button',{name:'Internet Archive'}).click();
 await expect(page.locator('.explore-card')).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Cargar más canciones'})).toHaveCount(0);
});
