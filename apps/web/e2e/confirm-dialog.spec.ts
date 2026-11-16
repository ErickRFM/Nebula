import {test,expect,type Page} from './auth-test';

async function navigate(page:Page,name:string){
 const desktop=page.getByRole('navigation',{name:'Navegación principal'}).getByRole('button',{name,exact:true});
 const mobile=page.getByRole('navigation',{name:'Navegación móvil'}).getByRole('button',{name,exact:true});
 if(await desktop.isVisible())await desktop.click();
 else if(await mobile.isVisible())await mobile.click();
 else{
  await page.getByRole('button',{name:'Más secciones'}).click();
  await page.getByRole('navigation',{name:'Más secciones de NÉBULA'}).getByRole('button',{name,exact:true}).click();
 }
}

async function crearLista(page:Page,titulo:string){
 await page.goto('/');
 await navigate(page,'Playlists');
 await page.getByPlaceholder('Nombre de nueva playlist').fill(titulo);
 await page.getByRole('button',{name:'Crear playlist'}).click();
 return page.locator('.playlist-entry-main').filter({hasText:titulo});
}

test('deleting a playlist asks inside the app and never opens the native dialog',async({page})=>{
 const nativos:string[]=[];
 page.on('dialog',dialog=>{nativos.push(dialog.message());void dialog.dismiss();});
 const lista=await crearLista(page,'Para estudiar');
 await expect(lista).toBeVisible();

 await page.getByRole('button',{name:'Eliminar Para estudiar'}).click();
 const dialogo=page.getByRole('alertdialog');
 await expect(dialogo).toBeVisible();
 await expect(dialogo.getByText('¿Eliminar la lista Para estudiar?')).toBeVisible();
 await expect(dialogo.getByRole('button',{name:'Cancelar'})).toBeFocused();

 await dialogo.getByRole('button',{name:'Cancelar'}).click();
 await expect(dialogo).toHaveCount(0);
 await expect(lista).toBeVisible();
 await expect(nativos).toEqual([]);
});

test('confirming in the dialog deletes the playlist and it stays deleted after reload',async({page})=>{
 page.on('dialog',()=>{throw new Error('el diálogo nativo volvió a abrirse');});
 const lista=await crearLista(page,'Borrar despues');
 await page.getByRole('button',{name:'Eliminar Borrar despues'}).click();
 const dialogo=page.getByRole('alertdialog');
 await expect(dialogo.getByText(/Las canciones que contiene no se eliminan/)).toBeVisible();
 await dialogo.getByRole('button',{name:'Eliminar lista'}).click();
 await expect(dialogo).toHaveCount(0);
 await expect(lista).toHaveCount(0);
 await page.reload();
 await navigate(page,'Playlists');
 await expect(lista).toHaveCount(0);
});

test('Escape closes the confirmation without deleting',async({page})=>{
 const lista=await crearLista(page,'Intocable');
 await page.getByRole('button',{name:'Eliminar Intocable'}).click();
 const dialogo=page.getByRole('alertdialog');
 await expect(dialogo).toBeVisible();
 await page.keyboard.press('Escape');
 await expect(dialogo).toHaveCount(0);
 await expect(lista).toBeVisible();
 await expect(page.getByRole('button',{name:'Eliminar Intocable'})).toBeVisible();
});
