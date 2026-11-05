import {test,expect} from '@playwright/test';

test('mobile navigation exposes four primary destinations without horizontal scrolling',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.goto('/');
 const nav=page.getByRole('navigation',{name:'Navegación móvil'});
 await expect(nav.getByRole('button')).toHaveCount(4);
 for(const name of ['Inicio','Buscar','Biblioteca','Salas']){
  await expect(nav.getByRole('button',{name,exact:true})).toBeVisible();
 }
 await nav.getByRole('button',{name:'Biblioteca'}).click();
 await expect(page.getByRole('heading',{name:'Tu biblioteca'})).toBeVisible();
 await expect(page.getByRole('button',{name:'Ajustes'}).first()).toBeVisible();
});

test('library leads with music and keeps file utilities discoverable on demand',async({page})=>{
 await page.goto('/');
 const desktop=page.getByRole('navigation',{name:'Navegación principal'});
 await desktop.getByRole('button',{name:'Biblioteca',exact:true}).click();
 const management=page.locator('details.library-management');
 await expect(management).not.toHaveAttribute('open');
 await expect(page.getByRole('heading',{name:'Colección musical'})).toBeVisible();
 await management.locator('summary').click();
 await expect(management).toHaveAttribute('open');
 await expect(management.getByRole('heading',{name:'Convertir audio a MP3'})).toBeVisible();
 await expect(management.getByRole('region',{name:'Respaldo musical en ZIP'})).toBeVisible();
});

test('home shows a real library continuation, never a fake demo queue',async({page})=>{
 await page.goto('/');
 await expect(page.getByRole('heading',{name:'Encuentra tu próxima canción.'})).toBeVisible();
 await expect(page.getByRole('button',{name:'Buscar música'})).toBeVisible();
 await page.getByRole('navigation',{name:'Navegación principal'})
  .getByRole('button',{name:'Buscar',exact:true}).click();
 await expect(page.getByRole('heading',{name:'¿Qué quieres escuchar?'})).toBeVisible();
 await expect(page.getByRole('textbox',{name:'Buscar canciones, artistas o álbumes'})).toBeFocused();
});

for(const width of [360,390,768,1280,1440]){
 test('responsive music experience '+width+'px has no horizontal page overflow',async({page})=>{
  await page.setViewportSize({width,height:820});
  await page.goto('/');
  await expect(page.getByRole('heading',{name:'Encuentra tu próxima canción.'})).toBeVisible();
  const globalOverflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+2);
  expect(globalOverflow).toBe(false);
  if(width<=760){
   const nav=page.getByRole('navigation',{name:'Navegación móvil'});
   await expect(nav.getByRole('button')).toHaveCount(4);
   await expect(nav.getByRole('button',{name:'Biblioteca'})).toBeVisible();
  }
  const nav=width<=760?page.getByRole('navigation',{name:'Navegación móvil'}):page.getByRole('navigation',{name:'Navegación principal'});
  await nav.getByRole('button',{name:'Biblioteca',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Tu biblioteca'})).toBeVisible();
  const libraryOverflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+2);
  expect(libraryOverflow).toBe(false);
  await page.screenshot({path:test.info().outputPath('library-'+width+'.png'),fullPage:true,animations:'disabled'});
 });
}

test('external YouTube player keeps platform identity and action outside the local mini-player',async({page})=>{
 await page.goto('/');
 await page.getByRole('navigation',{name:'Navegación principal'}).getByRole('button',{name:'Buscar',exact:true}).click();
 const bridges=page.locator('.search-page > .external-bridges');
 const input=bridges.getByRole('textbox',{name:'Enlace de YouTube, SoundCloud, Spotify o Deezer'});
 await input.fill('https://www.youtube.com/watch?v=M-E8rmhUxyw');
 await bridges.getByRole('button',{name:'Abrir reproductor'}).click();
 const region=bridges.getByRole('region',{name:'Reproductor externo activo'});
 await expect(region.locator('.official-source-label')).toHaveText('FUENTE OFICIAL');
 await expect(region.getByRole('heading',{name:'YouTube'})).toBeVisible();
 await expect(region.getByRole('link',{name:'Abrir en la plataforma original'})).toHaveAttribute('href',/youtube.com/);
 await region.getByRole('button',{name:'Cerrar reproductor'}).click();
 await expect(region).toHaveCount(0);
});
