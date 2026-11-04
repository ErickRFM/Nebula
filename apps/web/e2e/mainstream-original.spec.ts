import {test,expect,type Page} from '@playwright/test';

async function goToSearch(page:Page){
 const desktop=page.getByRole('navigation',{name:'Navegación principal'}).getByRole('button',{name:'Buscar',exact:true});
 const mobile=page.getByRole('navigation',{name:'Navegación móvil'}).getByRole('button',{name:'Buscar',exact:true});
 if(await desktop.isVisible())await desktop.click();else await mobile.click();
}

test('mainstream catalog prioritizes studio recordings and mounts the official Deezer widget',async({page})=>{
 await page.route('**/v1/discovery/mainstream?**',route=>route.fulfill({
  status:200,contentType:'application/json',
  body:JSON.stringify({source:'deezer',playback:'official_embed_only',items:[
   {id:'3135556',title:'Blinding Lights',artist:'The Weeknd',album:'After Hours',cover:null,durationSeconds:200,rank:90000,isVariant:false},
   {id:'1234567',title:'Blinding Lights (Live Remix)',artist:'DJ X',album:'Mixes',cover:null,durationSeconds:300,rank:300,isVariant:true},
  ]}),
 }));
 await page.route('https://widget.deezer.com/**',route=>route.fulfill({
  status:200,contentType:'text/html',body:'<!doctype html><title>Widget Deezer fixture</title>',
 }));
 await page.goto('/');
 await goToSearch(page);
 await page.getByRole('textbox',{name:'Buscar canciones, artistas o álbumes'}).fill('The Weeknd Blinding Lights');
 const catalog=page.getByRole('region',{name:'Grabaciones de artistas populares'});
 await expect(catalog.getByText('Blinding Lights',{exact:true})).toBeVisible();
 await expect(catalog.getByText('Blinding Lights (Live Remix)')).toHaveCount(0);
 await catalog.getByRole('button',{name:'Reproducir en Deezer: Blinding Lights'}).click();
 await expect(catalog.getByTitle('Escuchar Blinding Lights en el reproductor de Deezer')).toHaveAttribute('src','https://widget.deezer.com/widget/dark/track/3135556');
 await expect(catalog.getByText('solo ofrece 30 segundos',{exact:false})).toBeVisible();
 await catalog.getByRole('button',{name:'Remixes y versiones (1)'}).click();
 await expect(catalog.getByText('Blinding Lights (Live Remix)')).toBeVisible();
});
