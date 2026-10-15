import { test, expect, type Page } from '@playwright/test';

async function navigate(page: Page, name: string) {
  const desktop = page.getByRole('navigation',{name:'Navegación principal'}).getByRole('button',{name,exact:true});
  const mobile = page.getByRole('navigation',{name:'Navegación móvil'}).getByRole('button',{name,exact:true});
  if (await desktop.isVisible()) await desktop.click();
  else await mobile.click();
}


test('navigation and search work', async ({page}) => {
  await page.goto('/');
  await expect(page.getByText('La música se siente', {exact:false})).toBeVisible();
  await navigate(page,'Buscar');
  await expect(page.getByRole('heading',{name:'¿Qué quieres escuchar?'})).toBeVisible();
  await page.getByRole('textbox',{name:'Buscar canciones, artistas o álbumes'}).fill('Frecuencia');
  await expect(page.getByText('Frecuencia azul')).toBeVisible();
  await expect(page.getByText('Ecos de neón')).toHaveCount(0);
});

test('playlist creation persists after reloading', async ({page}) => {
  await page.goto('/');
  await navigate(page,'Playlists');
  await page.getByPlaceholder('Nombre de nueva playlist').fill('Para estudiar');
  await page.getByRole('button',{name:'Crear playlist'}).click();
  await expect(page.locator('.playlist-entry-main').filter({hasText:'Para estudiar'})).toBeVisible();
  await page.reload();
  await navigate(page,'Playlists');
  await expect(page.locator('.playlist-entry-main').filter({hasText:'Para estudiar'})).toBeVisible();
});

test('local audio import survives reload in IndexedDB', async ({page}) => {
  await page.goto('/');
  await navigate(page,'Biblioteca');
  // WAV header for a 0.1-second PCM mono sample
  const pcm = Buffer.alloc(44 + 8820);
  pcm.write('RIFF',0); pcm.writeUInt32LE(pcm.length-8,4); pcm.write('WAVE',8);
  pcm.write('fmt ',12); pcm.writeUInt32LE(16,16); pcm.writeUInt16LE(1,20);
  pcm.writeUInt16LE(1,22); pcm.writeUInt32LE(44100,24); pcm.writeUInt32LE(88200,28);
  pcm.writeUInt16LE(2,32); pcm.writeUInt16LE(16,34); pcm.write('data',36); pcm.writeUInt32LE(pcm.length-44,40);
  await page.locator('input[type=file]').setInputFiles({name:'mi-cancion.wav',mimeType:'audio/wav',buffer:pcm});
  await expect(page.locator('.track-list .track-descriptor strong').filter({hasText:'mi-cancion'}).first()).toBeVisible();
  await expect(page.getByRole('status')).toContainText('guardadas');
  await page.reload();
  await navigate(page,'Biblioteca');
  await expect(page.locator('.track-list .track-descriptor strong').filter({hasText:'mi-cancion'}).first()).toBeVisible();
});

test('web manifest is served for installation', async ({request}) => {
  const r=await request.get('/manifest.webmanifest');
  expect(r.ok()).toBe(true);
  expect((await r.json()).name).toBe('NÉBULA Music');
});

test('account UI registers and manages server-side playlists', async ({page}) => {
  test.skip(!process.env.NEXT_PUBLIC_API_URL,'API not configured for browser integration');
  await page.goto('/');
  await page.getByRole('button',{name:'Mi cuenta'}).click();
  await expect(page.getByRole('heading',{name:'Cuenta NÉBULA'})).toBeVisible();
  await page.getByRole('button',{name:'¿No tienes cuenta? Regístrate'}).click();
  const email='nebula-e2e-'+Date.now()+'-'+Math.random().toString(36).slice(2)+'@example.test';
  await page.getByRole('textbox',{name:'Correo electrónico'}).fill(email);
  await page.getByLabel('Contraseña').fill('NebulaTestPassword123!');
  await page.getByRole('button',{name:'Crear mi cuenta'}).click();
  await expect(page.getByText('Sesión activa')).toBeVisible();
  await page.getByRole('textbox',{name:'Nombre de playlist en nube'}).fill('Colección E2E');
  await page.getByRole('button',{name:'Crear en cuenta'}).click();
  await expect(page.locator('.account-remote-list').getByText('Colección E2E')).toBeVisible();
  await page.reload();
  await page.getByRole('button',{name:'Mi cuenta'}).click();
  await expect(page.getByRole('heading',{name:'Iniciar sesión'})).toBeVisible();
});
