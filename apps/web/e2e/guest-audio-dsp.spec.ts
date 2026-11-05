import {test,expect,type Page} from '@playwright/test';

async function navigate(page:Page,label:string){
 const desktop=page.getByRole('navigation',{name:'Navegación principal'}).getByRole('button',{name:label,exact:true});
 const mobile=page.getByRole('navigation',{name:'Navegación móvil'}).getByRole('button',{name:label,exact:true});
 if(await desktop.isVisible())await desktop.click();
 else if(await mobile.isVisible())await mobile.click();
 else {
  await page.getByRole('button',{name:'Más secciones'}).click();
  await page.getByRole('navigation',{name:'Más secciones de NÉBULA'}).getByRole('button',{name:label,exact:true}).click();
 }
}

test('guest audio is saved after a reload without signing in, with persistent sound preferences',async({page})=>{
 await page.goto('/');
 await navigate(page,'Biblioteca');
 const pcm=Buffer.alloc(44+8820);
 pcm.write('RIFF',0);pcm.writeUInt32LE(pcm.length-8,4);pcm.write('WAVE',8);
 pcm.write('fmt ',12);pcm.writeUInt32LE(16,16);pcm.writeUInt16LE(1,20);
 pcm.writeUInt16LE(1,22);pcm.writeUInt32LE(44100,24);pcm.writeUInt32LE(88200,28);
 pcm.writeUInt16LE(2,32);pcm.writeUInt16LE(16,34);pcm.write('data',36);
 pcm.writeUInt32LE(pcm.length-44,40);
 await page.getByLabel('Importar archivos de audio propios').setInputFiles({
  name:'sin-cuenta.wav',mimeType:'audio/wav',buffer:pcm,
 });
 await expect(page.getByText('1 canción(es) guardadas',{exact:false})).toBeVisible();
 await navigate(page,'Ajustes');
 await page.getByRole('combobox',{name:'Perfil del ecualizador'}).selectOption('clarity');
 const bassBand=page.getByRole('slider',{name:'Banda 60 Hz'});
 await expect(bassBand).toHaveValue('-0.5');
 await bassBand.focus();
 await bassBand.press('ArrowRight');
 await expect(bassBand).toHaveValue('0');
 await expect(page.getByRole('combobox',{name:'Perfil del ecualizador'})).toHaveValue('custom');
 const hum=page.getByRole('switch',{name:'Reducir zumbido'});
 await hum.click();
 await expect(hum).toHaveAttribute('aria-checked','true');
 await expect(page.getByRole('button',{name:'Proteger biblioteca'})).toBeVisible();
 await page.reload();
 await navigate(page,'Ajustes');
 await expect(page.getByRole('combobox',{name:'Perfil del ecualizador'})).toHaveValue('custom');
 await expect(page.getByRole('slider',{name:'Banda 60 Hz'})).toHaveValue('0');
 await expect(page.getByRole('switch',{name:'Reducir zumbido'})).toHaveAttribute('aria-checked','true');
 await navigate(page,'Biblioteca');
 await expect(page.getByRole('button',{name:'Descargar archivo original de sin-cuenta'})).toBeVisible();
});

test('a new guest can switch EQ presets without audio or login on mobile',async({page})=>{
 const errors:string[]=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.setViewportSize({width:375,height:812});
 await page.goto('/');
 await navigate(page,'Ajustes');
 const studio=page.getByRole('region',{name:'NÉBULA Audio Studio'});
 await expect(studio).toBeVisible();
 const preset=studio.getByRole('combobox',{name:'Perfil del ecualizador'});
 await preset.selectOption('clarity');
 await expect(preset).toHaveValue('clarity');
 const bassBand=studio.getByRole('slider',{name:'Banda 60 Hz'});
 await expect(bassBand).toHaveValue('-0.5');
 await bassBand.focus();
 await bassBand.press('ArrowRight');
 await expect(preset).toHaveValue('custom');
 await expect(bassBand).toHaveValue('0');
 const rect=await studio.boundingBox();
 expect(rect).not.toBeNull();
 expect(rect!.x).toBeGreaterThanOrEqual(-1);
 expect(rect!.x+rect!.width).toBeLessThanOrEqual(380);
 expect(errors).toEqual([]);
});
