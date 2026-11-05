import {test,expect} from '@playwright/test';

test('mobile navigation exposes four primary destinations without horizontal scrolling',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.goto('/');
 const nav=page.getByRole('navigation',{name:'Navegación móvil'});
 await expect(nav.getByRole('button')).toHaveCount(4);
 for(const name of ['Inicio','Buscar','Biblioteca','Salas']){
  await expect(nav.getByRole('button',{name,exact:true})).toBeVisible();
 }
 await nav.getByRole('button',{name:'Biblioteca'}).click();
 await expect(page.getByRole('heading',{name:'Tu biblioteca'})).toBeVisible();
 await expect(page.getByRole('button',{name:'Ajustes'}).first()).toBeVisible();
});

test('library leads with music and keeps file utilities discoverable on demand',async({page})=>{
 await page.goto('/');
 const desktop=page.getByRole('navigation',{name:'Navegación principal'});
 await desktop.getByRole('button',{name:'Biblioteca',exact:true}).click();
 const management=page.locator('details.library-management');
 await expect(management).not.toHaveAttribute('open');
 await expect(page.getByRole('heading',{name:'Colección musical'})).toBeVisible();
 await management.locator('summary').click();
 await expect(management).toHaveAttribute('open');
 await expect(management.getByRole('heading',{name:'Convertir audio a MP3'})).toBeVisible();
 await expect(management.getByRole('region',{name:'Respaldo musical en ZIP'})).toBeVisible();
});
