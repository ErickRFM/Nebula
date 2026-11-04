import {test,expect,type Page} from '@playwright/test';

async function library(page:Page){
 const desktop=page.getByRole('navigation',{name:'Navegación principal'}).getByRole('button',{name:'Biblioteca',exact:true});
 const mobile=page.getByRole('navigation',{name:'Navegación móvil'}).getByRole('button',{name:'Biblioteca',exact:true});
 if(await desktop.isVisible())await desktop.click();else await mobile.click();
}

test('authorized MP3: receive direct HTTPS file, save in local library, download and restore after reload',async({page})=>{
 const bytes=Buffer.alloc(500,0);
 bytes.write('ID3',0);
 await page.route('https://media.example.test/song-from-my-site.mp3',route=>route.fulfill({
  status:200,headers:{'Content-Type':'audio/mpeg','Access-Control-Allow-Origin':'*','Content-Length':String(bytes.length)},
  body:bytes,
 }));
 await page.goto('/');
 await library(page);
 const form=page.getByRole('region',{name:'Descargar MP3 autorizado e importarlo'});
 await form.getByRole('textbox',{name:'URL directa del MP3'}).fill('https://media.example.test/song-from-my-site.mp3');
 await form.getByRole('checkbox',{name:'Confirmo que tengo permiso para descargar y guardar este MP3.'}).check();
 await form.getByRole('button',{name:'Descargar e importar a Biblioteca'}).click();
 await expect(form.getByText('MP3 recibido:',{exact:false})).toBeVisible();
 await expect(page.locator('.track-list .track-descriptor strong').filter({hasText:'song-from-my-site'}).first()).toBeVisible();
 const downloadEvent=page.waitForEvent('download');
 await form.getByRole('button',{name:'Guardar copia MP3 en Descargas'}).click();
 const download=await downloadEvent;
 expect(download.suggestedFilename()).toBe('song-from-my-site.mp3');
 await expect(page.getByRole('status').filter({hasText:'guardadas'})).toBeVisible();
 await page.reload();
 await library(page);
 const restored=page.getByRole('button',{name:'Descargar archivo original de song-from-my-site'});
 await expect(restored).toBeVisible();
 const downloadAgain=page.waitForEvent('download');
 await restored.click();
 expect((await downloadAgain).suggestedFilename()).toBe('song-from-my-site.mp3');
});

test('the MP3 importer rejects a YouTube page and a fake MP3 response',async({page})=>{
 await page.route('https://media.example.test/fake.mp3',route=>route.fulfill({
  status:200,headers:{'Content-Type':'audio/mpeg','Access-Control-Allow-Origin':'*'},body:'<!doctype html><html>not an mp3</html>',
 }));
 await page.goto('/');
 await library(page);
 const form=page.getByRole('region',{name:'Descargar MP3 autorizado e importarlo'});
 await form.getByRole('textbox',{name:'URL directa del MP3'}).fill('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
 await form.getByRole('checkbox',{name:'Confirmo que tengo permiso para descargar y guardar este MP3.'}).check();
 await form.getByRole('button',{name:'Descargar e importar a Biblioteca'}).click();
 await expect(form.getByRole('alert')).toContainText('enlace HTTPS directo');
 await form.getByRole('textbox',{name:'URL directa del MP3'}).fill('https://media.example.test/fake.mp3');
 await form.getByRole('button',{name:'Descargar e importar a Biblioteca'}).click();
 await expect(form.getByRole('alert')).toContainText('cabecera MP3 reconocible');
});
