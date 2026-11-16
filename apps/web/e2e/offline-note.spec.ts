import {test,expect} from './auth-test';

// El aviso de red solo existe si el navegador anuncia el cambio de estado; en el
// APK eso es exactamente lo que se pierde cuando el WebView no reenvía el evento.
test('the offline note appears when the connection drops and leaves when it returns',async({page,context})=>{
 await page.goto('/');
 await expect(page.locator('.offline-note')).toHaveCount(0);

 await context.setOffline(true);
 await expect(page.locator('.offline-note')).toBeVisible();
 await expect(page.locator('.offline-note')).toContainText('Sin conexión');

 await context.setOffline(false);
 await expect(page.locator('.offline-note')).toHaveCount(0);
});

// Abrir la app ya sin red no es reproducible en el navegador de pruebas: con
// `setOffline` el propio documento no carga (no hay service worker) y el caso real
// —el bundle viaja dentro del APK— solo se ve en el teléfono. Aquí se siembra
// `navigator.onLine=false` antes de hidratar, que es la rama que el hook ejecuta.
test('la nota aparece desde la primera pantalla si el dispositivo arranca sin red',async({page})=>{
 await page.addInitScript(()=>{
  Object.defineProperty(window.navigator,'onLine',{get:()=>false,configurable:true});
 });
 await page.goto('/');
 await expect(page.locator('.offline-note')).toBeVisible();
 await expect(page.locator('.offline-note')).toContainText('guardados en este dispositivo');
});
