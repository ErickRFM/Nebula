import {test,expect,type Page} from '@playwright/test';
async function navigateToSearch(page:Page){
 const desktop=page.getByRole('navigation',{name:'Navegación principal'}).getByRole('button',{name:'Buscar',exact:true});
 const mobile=page.getByRole('navigation',{name:'Navegación móvil'}).getByRole('button',{name:'Buscar',exact:true});
 if(await desktop.isVisible())await desktop.click();else await mobile.click();
}
test('public Audius search offers playable tracks without authentication or YouTube credentials',async({page})=>{
 await page.route('https://api.audius.co/v1/tracks/search?**',route=>route.fulfill({
  status:200,contentType:'application/json',
  body:JSON.stringify({data:[{id:'Track_Fixture',title:'Demo Audius Pública',
   user:{name:'Artista Audius'},permalink:'https://audius.co/artist/song',is_stream_gated:false,duration:132}]}),
 }));
 await page.route('https://api.audius.co/v1/tracks/Track_Fixture/stream',route=>route.fulfill({status:503,body:'fixture: no real audio'}));
 await page.goto('/');
 await navigateToSearch(page);
 await page.getByRole('textbox',{name:'Buscar canciones, artistas o álbumes'}).fill('electrónica');
 const catalog=page.getByRole('region',{name:'Catálogo público de Audius'});
 await expect(catalog.getByText('Demo Audius Pública')).toBeVisible();
 await catalog.getByRole('button',{name:'Escuchar Demo Audius Pública'}).click();
 await expect(page.locator('.mini-player')).toContainText('Demo Audius Pública');
});
