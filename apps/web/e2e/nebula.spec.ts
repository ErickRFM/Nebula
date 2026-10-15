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
  await expect(page.getByText('mi-cancion',{exact:true})).toBeVisible();
  await expect(page.getByRole('status')).toContainText('guardadas');
  await page.reload();
  await navigate(page,'Biblioteca');
  await expect(page.getByText('mi-cancion',{exact:true})).toBeVisible();
});

test('web manifest is served for installation', async ({request}) => {
  const r=await request.get('/manifest.webmanifest');
  expect(r.ok()).toBe(true);
  expect((await r.json()).name).toBe('NÉBULA Music');
});
