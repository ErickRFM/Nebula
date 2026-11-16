import {test as base,expect,type Page} from '@playwright/test';
import {createHash} from 'node:crypto';
export type {Page} from '@playwright/test';

/** Isolate Fastify's per-IP auth throttle by Playwright test, not in production.
 * Headers are attached to intercepted test-only requests at the network layer.
 * Real clients cannot change the production auth policy. */
export const test=base.extend({
 page:async({page},use,testInfo)=>{
  const hash=createHash('sha256').update(testInfo.testId+'#'+testInfo.retry).digest();
  const ip='198.51.100.'+String(1+(hash[0]%253));
  await page.route('**/v1/auth/**',async route=>{
   if(route.request().method()==='OPTIONS'){await route.continue();return;}
   await route.continue({headers:{...route.request().headers(),'x-forwarded-for':ip}});
  });
  await use(page);
 },
});
export {expect};

/**
 * La entrada sin formulario deja la pantalla de Cuenta con una identidad de invitado, así que
 * el formulario de credenciales ya no es el primer estado: hay que pedirlo. Si la sesión activa
 * es real (recarga o reload tras Salir) la puerta no está y se usa el formulario directo.
 */
export async function openSignInForm(page:Page):Promise<void> {
  await page.getByRole('button',{name:'Mi cuenta'}).click();
  const guestDoor=page.getByRole('button',{name:'Iniciar sesión con mi cuenta'});
  if(await guestDoor.isVisible()) await guestDoor.click();
  await expect(page.getByRole('textbox',{name:'Correo electrónico'})).toBeVisible();
}
