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
 const more=page.getByRole('button',{name:'Más secciones'});
 await more.click();
 const menu=page.getByRole('navigation',{name:'Más secciones de NÉBULA'});
 await expect(menu.getByRole('button',{name:'Ajustes'})).toBeVisible();
 await page.keyboard.press('Escape');
 await expect(menu).toHaveCount(0);
 await expect(more).toBeFocused();
 await more.click();
 await page.locator('main').click({position:{x:10,y:10}});
 await expect(menu).toHaveCount(0);
});

test('library leads with music and keeps file utilities discoverable on demand',async({page})=>{
 await page.goto('/');
 const desktop=page.getByRole('navigation',{name:'Navegación principal'}).getByRole('button',{name:'Biblioteca',exact:true});
 const mobile=page.getByRole('navigation',{name:'Navegación móvil'}).getByRole('button',{name:'Biblioteca',exact:true});
 if(await desktop.isVisible()) await desktop.click(); else await mobile.click();
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
 const desktopSearch=page.getByRole('navigation',{name:'Navegación principal'}).getByRole('button',{name:'Buscar',exact:true});
 if(await desktopSearch.isVisible()) await desktopSearch.click();
 else await page.getByRole('navigation',{name:'Navegación móvil'}).getByRole('button',{name:'Buscar',exact:true}).click();
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
 const desktopSearch=page.getByRole('navigation',{name:'Navegación principal'}).getByRole('button',{name:'Buscar',exact:true});
 if(await desktopSearch.isVisible()) await desktopSearch.click();
 else await page.getByRole('navigation',{name:'Navegación móvil'}).getByRole('button',{name:'Buscar',exact:true}).click();
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

test('playlist picker lets listeners choose the destination instead of silently choosing first',async({page})=>{
 await page.goto('/');
 async function openScreen(screen:'Biblioteca'|'Playlists'){
  const desktop=page.getByRole('navigation',{name:'Navegación principal'}).getByRole('button',{name:screen,exact:true});
  if(await desktop.isVisible()){await desktop.click();return;}
  if(screen==='Biblioteca'){
   await page.getByRole('navigation',{name:'Navegación móvil'}).getByRole('button',{name:screen,exact:true}).click();
  }else{
   await page.getByRole('button',{name:'Más secciones'}).click();
   await page.getByRole('navigation',{name:'Más secciones de NÉBULA'}).getByRole('button',{name:screen,exact:true}).click();
  }
 }
 await openScreen('Playlists');
 for(const name of ['Lista A','Lista B']){
  await page.getByPlaceholder('Nombre de nueva playlist').fill(name);
  await page.getByRole('button',{name:'Crear playlist'}).click();
  await expect(page.locator('.playlist-entry-main').filter({hasText:name})).toBeVisible();
 }
 await openScreen('Biblioteca');
 const frames=11025,pcm=Buffer.alloc(44+frames*2);
 pcm.write('RIFF',0);pcm.writeUInt32LE(pcm.length-8,4);pcm.write('WAVE',8);
 pcm.write('fmt ',12);pcm.writeUInt32LE(16,16);pcm.writeUInt16LE(1,20);
 pcm.writeUInt16LE(1,22);pcm.writeUInt32LE(44100,24);pcm.writeUInt32LE(88200,28);
 pcm.writeUInt16LE(2,32);pcm.writeUInt16LE(16,34);pcm.write('data',36);pcm.writeUInt32LE(frames*2,40);
 await page.getByLabel('Importar archivos de audio propios').setInputFiles({name:'selector-ux.wav',mimeType:'audio/wav',buffer:pcm});
 const track=page.locator('.track-row').filter({hasText:'selector-ux'}).first();
 await expect(track).toBeVisible();
 await track.getByRole('button',{name:/Añadir .* a playlist/}).click();
 const picker=page.getByRole('dialog',{name:'Elegir playlist'});
 await expect(picker).toBeVisible();
 await expect(picker.getByRole('button',{name:/Lista A/})).toBeVisible();
 await picker.getByRole('button',{name:/Lista B/}).click();
 await expect(picker).toBeHidden();
 await openScreen('Playlists');
 await page.locator('.playlist-entry-main').filter({hasText:'Lista B'}).click();
 await expect(page.locator('.playlist-track').filter({hasText:'selector-ux'})).toBeVisible();
 await page.locator('.playlist-entry-main').filter({hasText:'Lista A'}).click();
 await expect(page.locator('.playlist-track').filter({hasText:'selector-ux'})).toHaveCount(0);
});
