import {test,expect,type Page} from '@playwright/test';
import {readFile} from 'node:fs/promises';
async function library(page:Page){
 const desktop=page.getByRole('navigation',{name:'Navegación principal'}).getByRole('button',{name:'Biblioteca',exact:true});
 const mobile=page.getByRole('navigation',{name:'Navegación móvil'}).getByRole('button',{name:'Biblioteca',exact:true});
 if(await desktop.isVisible())await desktop.click();else await mobile.click();
}
test('bulk-export local audio to ZIP and restore songs on same device',async({page})=>{
 await page.goto('/');await library(page);
 const archive=page.getByRole('region',{name:'Respaldo musical en ZIP'});
 await expect(archive.getByRole('button',{name:'Descargar mi música (.zip)'})).toBeDisabled();
 await page.getByLabel('Importar archivos de audio propios').setInputFiles({
  name:'my-demo-track.mp3',mimeType:'audio/mpeg',
  buffer:Buffer.from([73,68,51,...Array(250).fill(0)]),
 });
 await expect(page.getByRole('button',{name:'Descargar archivo original de my-demo-track'})).toBeVisible();
 await expect(page.getByText('canción(es) guardadas',{exact:false})).toBeVisible();
 const downloadEvent=page.waitForEvent('download');
 await archive.getByRole('button',{name:'Descargar mi música (.zip)'}).click();
 const download=await downloadEvent;
 expect(download.suggestedFilename()).toMatch(/^Nebula-Audios-\d{4}-\d{2}-\d{2}\.zip$/);
 const buffer=await readFile(await download.path());
 expect(buffer.subarray(0,4)).toEqual(Buffer.from([0x50,0x4b,0x03,0x04]));
 await archive.getByLabel('Restaurar ZIP de canciones').setInputFiles({
  name:'collection.zip',mimeType:'application/zip',buffer,
 });
 await expect(archive.getByText('1 archivos de audio recuperados',{exact:false})).toBeVisible();
 await expect(page.getByRole('button',{name:'Descargar archivo original de my-demo-track'})).toHaveCount(2);
});
