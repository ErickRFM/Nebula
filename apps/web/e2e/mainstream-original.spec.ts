import {test,expect,type Page} from '@playwright/test';

async function goToSearch(page:Page){
 const desktop=page.getByRole('navigation',{name:'Navegación principal'}).getByRole('button',{name:'Buscar',exact:true});
 const mobile=page.getByRole('navigation',{name:'Navegación móvil'}).getByRole('button',{name:'Buscar',exact:true});
 if(await desktop.isVisible())await desktop.click();else await mobile.click();
}

test('search excludes 30-second Deezer previews but plays YouTube embedded',async({page})=>{
 let obsoleteRequests=0;
 await page.route('**/v1/discovery/mainstream?**',route=>{
  obsoleteRequests++;
  return route.fulfill({status:500,body:'Deprecated Deezer API should not be requested'});
 });
 await page.route('https://www.youtube-nocookie.com/**',route=>route.fulfill({
  status:200,contentType:'text/html',body:'<!doctype html><title>YouTube fixture</title>',
 }));
 await page.goto('/');
 await goToSearch(page);
 await page.getByRole('textbox',{name:'Buscar canciones, artistas o álbumes'}).fill('The Weeknd Blinding Lights');
 await expect(page.getByRole('region',{name:'Grabaciones de artistas populares'})).toHaveCount(0);
 await expect(page.getByRole('button',{name:/Muestra de 30 segundos/})).toHaveCount(0);
 expect(obsoleteRequests).toBe(0);
 const bridge=page.getByRole('region',{name:'Reproductores oficiales de música'});
 await bridge.getByRole('textbox',{name:'Enlace de YouTube, SoundCloud o Spotify'}).fill('https://youtu.be/dQw4w9WgXcQ');
 await bridge.getByRole('button',{name:'Abrir reproductor'}).click();
 await expect(bridge.getByTitle('Reproductor oficial de YouTube')).toHaveAttribute('src','https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
 await expect(bridge.getByRole('link',{name:'Abrir en la plataforma original'})).toHaveCount(0);
});
