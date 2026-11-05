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
 await expect(bridges.getByText('Reproduce desde los controles de YouTube',{exact:false})).toBeVisible();
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

test('YouTube playlist and RD Mix retain the list identity',async({page})=>{
 await page.route('https://www.youtube-nocookie.com/**',route=>route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><title>Playlist fixture</title>'}));
 await page.goto('/');await navigateToSearch(page);
 const bridges=page.locator('.search-page > .external-bridges');
 const field=bridges.getByRole('textbox',{name:'Enlace de YouTube, SoundCloud, Spotify o Deezer'});
 await field.fill('https://www.youtube.com/playlist?list=PL1234567890ABCDEFGHIJKL');
 await bridges.getByRole('button',{name:'Abrir reproductor'}).click();
 await expect(bridges.getByTitle('Reproductor oficial de YouTube')).toHaveAttribute('src',
  /youtube-nocookie\.com\/embed\?listType=playlist&list=PL1234567890ABCDEFGHIJKL&enablejsapi=1/);
 await expect(bridges.getByText('Playlist de YouTube',{exact:true})).toBeVisible();
 await bridges.getByRole('button',{name:'Cerrar reproductor'}).click();
 await field.fill('https://www.youtube.com/watch?v=M-E8rmhUxyw&list=RDM-E8rmhUxyw');
 await bridges.getByRole('button',{name:'Abrir reproductor'}).click();
 await expect(bridges.getByText('Mix / radio dinámica de YouTube')).toBeVisible();
 await expect(bridges.getByText('No es una lista fija',{exact:false})).toBeVisible();
 await expect(bridges.getByRole('link',{name:'Abrir en la plataforma original'})).toHaveAttribute('href',/list=RDM-E8rmhUxyw/);
});

test('official YouTube IFrame API shows songs, current playback and per-song MP3 controls',async({page})=>{
 const fixture=[
   "window.YT={Player:function(frame,opts){",
   "const api={getPlaylist:()=>['ABCDEFGHIJK','dQw4w9WgXcQ','M-E8rmhUxyw'],",
   "getPlaylistIndex:()=>0,getVideoData:()=>({video_id:'ABCDEFGHIJK',title:'Primera canción',author:'Artista'}),",
   "playVideoAt:(i)=>{window.__played_index=i},destroy:()=>{}};",
   "setTimeout(()=>opts.events.onReady({target:api}),20);return api;}};",
   "window.onYouTubeIframeAPIReady?.();",
 ].join('');
 await page.route('https://www.youtube.com/iframe_api',route=>route.fulfill({status:200,contentType:'text/javascript',body:fixture}));
 await page.route('https://www.youtube-nocookie.com/**',route=>route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><title>Fixture</title>'}));
 await page.route('**/v1/discovery/youtube/video-metadata?*',route=>route.fulfill({
   status:200,contentType:'application/json',
   body:JSON.stringify({items:[
    {videoId:'ABCDEFGHIJK',title:'Primera canción',artist:'Artista'},
    {videoId:'dQw4w9WgXcQ',title:'Segunda canción',artist:'Artista'},
    {videoId:'M-E8rmhUxyw',title:'Tercera canción',artist:'Artista'},
   ]}),
 }));
 await page.goto('/');await navigateToSearch(page);
 const bridges=page.locator('.search-page > .external-bridges');
 await bridges.getByRole('textbox',{name:'Enlace de YouTube, SoundCloud, Spotify o Deezer'})
  .fill('https://www.youtube.com/playlist?list=PL1234567890ABCDEFGHIJKL');
 await bridges.getByRole('button',{name:'Abrir reproductor'}).click();
 const tracks=bridges.getByRole('region',{name:'Canciones de la lista de YouTube'});
 await expect(tracks.getByText('3 videos disponibles',{exact:false})).toBeVisible({timeout:15000});
 await expect(tracks.getByText('Segunda canción')).toBeVisible();
 const second=tracks.locator('.yt-collection-item').nth(1);
 await second.getByRole('button',{name:'Escuchar'}).click();
 await expect.poll(()=>page.evaluate(()=>(window as Window & {__played_index?:number}).__played_index)).toBe(1);
 await second.locator('.yt-track-more > summary').click();
 await second.getByRole('button',{name:'Importar MP3 propio'}).click();
 await expect(second.getByRole('textbox',{name:'Enlace directo a MP3 autorizado'})).toBeVisible();
 await expect(second.getByRole('button',{name:'Descargar y añadir a Biblioteca'})).toBeDisabled();
});
