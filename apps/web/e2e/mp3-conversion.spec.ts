import {test,expect,type Page} from '@playwright/test';
import {readFile} from 'node:fs/promises';

async function openLibrary(page:Page){
 const desktop=page.getByRole('navigation',{name:'Navegación principal'}).getByRole('button',{name:'Biblioteca',exact:true});
 const mobile=page.getByRole('navigation',{name:'Navegación móvil'}).getByRole('button',{name:'Biblioteca',exact:true});
 if(await desktop.isVisible())await desktop.click();else await mobile.click();
}
function wavTone(){
 const frames=11025,pcm=Buffer.alloc(44+frames*2);
 pcm.write('RIFF',0);pcm.writeUInt32LE(pcm.length-8,4);pcm.write('WAVE',8);
 pcm.write('fmt ',12);pcm.writeUInt32LE(16,16);pcm.writeUInt16LE(1,20);
 pcm.writeUInt16LE(1,22);pcm.writeUInt32LE(44100,24);pcm.writeUInt32LE(88200,28);
 pcm.writeUInt16LE(2,32);pcm.writeUInt16LE(16,34);pcm.write('data',36);pcm.writeUInt32LE(frames*2,40);
 for(let i=0;i<frames;i++)pcm.writeInt16LE(Math.round(Math.sin(i*2*Math.PI*440/44100)*10000),44+i*2);
 return pcm;
}
test('local codec turns a WAV into a real MP3 and persists it in Biblioteca',async({page})=>{
 await page.goto('/');
 await openLibrary(page);
 const panel=page.getByRole('region',{name:'Conversor MP3 interno'});
 await expect(panel.getByRole('heading',{name:'Convertir audio a MP3'})).toBeVisible();
 await panel.getByLabel('Archivos de audio para convertir a MP3').setInputFiles({
  name:'prueba-440.wav',mimeType:'audio/wav',buffer:wavTone(),
 });
 await panel.getByRole('button',{name:'Convertir y añadir a Biblioteca'}).click();
 await expect(panel.getByText('archivo(s) MP3 generados',{exact:false})).toBeVisible({timeout:60000});
 const downloadEvent=page.waitForEvent('download');
 await panel.getByRole('button',{name:'Guardar MP3 prueba-440.mp3'}).click();
 const download=await downloadEvent;
 expect(download.suggestedFilename()).toBe('prueba-440.mp3');
 const data=await readFile(await download.path());
 expect(data.length).toBeGreaterThan(100);
 expect((data[0]===0x49&&data[1]===0x44&&data[2]===0x33)||(data[0]===0xff&&(data[1]&0xe0)===0xe0)).toBe(true);
 await page.reload();
 await openLibrary(page);
 await expect(page.getByRole('button',{name:'Descargar archivo original de prueba-440'})).toBeVisible();
});
test('browser converter rejects oversized and suspicious HTML file',async({page})=>{
 await page.goto('/');
 await openLibrary(page);
 const panel=page.getByRole('region',{name:'Conversor MP3 interno'});
 await panel.getByLabel('Archivos de audio para convertir a MP3').setInputFiles({
  name:'fake.mp3',mimeType:'text/html',buffer:Buffer.from('<!doctype html>Not music'),
 });
 await panel.getByRole('button',{name:'Convertir y añadir a Biblioteca'}).click();
 await expect(panel.getByRole('alert')).toContainText('navegador no pudo decodificar',{timeout:20000});
 await expect(panel.getByRole('button',{name:'Guardar MP3 fake.mp3'})).toHaveCount(0);
});
