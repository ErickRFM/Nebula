import {test,expect,type Page} from '@playwright/test';

async function navigateToSearch(page:Page){
 const desktop=page.getByRole('navigation',{name:'Navegación principal'}).getByRole('button',{name:'Buscar',exact:true});
 const mobile=page.getByRole('navigation',{name:'Navegación móvil'}).getByRole('button',{name:'Buscar',exact:true});
 if(await desktop.isVisible())await desktop.click();else await mobile.click();
}

test('official YouTube embed works from a pasted HTTPS link without an API key',async({page})=>{
 await page.route('https://www.youtube-nocookie.com/**',route=>route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><title>Fixture</title>'}));
 await page.goto('/');
 await navigateToSearch(page);
 const bridges=page.locator('.search-page > .external-bridges');
 await expect(bridges.getByRole('textbox',{name:'Enlace de YouTube, SoundCloud, Spotify o Deezer'})).toBeVisible();
 await bridges.getByRole('textbox',{name:'Enlace de YouTube, SoundCloud, Spotify o Deezer'}).fill('https://music.youtube.com/watch?v=dQw4w9WgXcQ&feature=share');
 await bridges.getByRole('button',{name:'Abrir reproductor'}).click();
 const iframe=bridges.getByTitle('Reproductor oficial de YouTube');
 await expect(iframe).toHaveAttribute('src','https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
 await expect(bridges.getByText('Pulsa reproducir dentro del reproductor oficial.',{exact:false})).toBeVisible();
 await bridges.getByRole('button',{name:'Cerrar reproductor'}).click();
 await expect(iframe).toHaveCount(0);
});

test('a pasted YouTube link in the main music search offers direct playback',async({page})=>{
 await page.route('https://www.youtube-nocookie.com/**',route=>route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><title>Fixture</title>'}));
 await page.goto('/');
 await navigateToSearch(page);
 await page.getByRole('textbox',{name:'Buscar canciones, artistas o álbumes'}).fill('https://youtu.be/dQw4w9WgXcQ');
 const bridges=page.locator('.search-page > .external-bridges');
 await bridges.getByRole('button',{name:'Reproducir este enlace'}).click();
 await expect(bridges.getByTitle('Reproductor oficial de YouTube')).toHaveAttribute('src','https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
});

test('rejects fake YouTube hosts without mounting an external player',async({page})=>{
 await page.goto('/');
 await navigateToSearch(page);
 const bridges=page.locator('.search-page > .external-bridges');
 await bridges.getByRole('textbox',{name:'Enlace de YouTube, SoundCloud, Spotify o Deezer'}).fill('https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ');
 await bridges.getByRole('button',{name:'Abrir reproductor'}).click();
 await expect(bridges.getByRole('alert')).toContainText('enlace HTTPS válido');
 await expect(bridges.locator('iframe')).toHaveCount(0);
});


test('official Spotify and Deezer links mount safe in-page players',async({page})=>{
 await page.route('https://open.spotify.com/embed/**',route=>route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><title>Fixture Spotify</title>'}));
 await page.route('https://widget.deezer.com/widget/**',route=>route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><title>Fixture Deezer</title>'}));
 await page.goto('/');
 await navigateToSearch(page);
 const bridges=page.locator('.search-page > .external-bridges');
 const input=bridges.getByRole('textbox',{name:'Enlace de YouTube, SoundCloud, Spotify o Deezer'});
 await input.fill('https://open.spotify.com/track/0123456789ABCDEFGHIJKL?si=share');
 await bridges.getByRole('button',{name:'Abrir reproductor'}).click();
 await expect(bridges.getByTitle('Reproductor oficial de Spotify')).toHaveAttribute('src','https://open.spotify.com/embed/track/0123456789ABCDEFGHIJKL');
 await bridges.getByRole('button',{name:'Cerrar reproductor'}).click();
 await input.fill('https://www.deezer.com/track/3135556');
 await bridges.getByRole('button',{name:'Abrir reproductor'}).click();
 await expect(bridges.getByTitle('Reproductor oficial de Deezer')).toHaveAttribute('src','https://widget.deezer.com/widget/dark/track/3135556');
});
