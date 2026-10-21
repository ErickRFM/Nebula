import { test, expect, type Page } from '@playwright/test';
import { Pool } from 'pg';
import { randomBytes, randomUUID, scryptSync } from 'node:crypto';

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

test('account login keeps a persistent private session', async ({page, request}) => {
  const api = (process.env.NEXT_PUBLIC_API_URL ?? '').replace(/\/$/,'');
  test.skip(!api,'API not configured for browser integration');
  const email='nebula-e2e-'+Date.now()+'-'+Math.random().toString(36).slice(2)+'@example.test';
  const password='NebulaTestPassword123!';
  // Create the account directly (registration is disabled by default; the E2E server enables it for provisioning).
  const created=await request.post(api+'/v1/auth/register',{data:{email,password},headers:{'x-nebula-client':'e2e'}});
  expect(created.status()).toBe(201);

  await page.goto('/');
  await page.getByRole('button',{name:'Mi cuenta'}).click();
  await expect(page.getByRole('heading',{name:'Cuenta NÉBULA'})).toBeVisible();
  await page.getByRole('textbox',{name:'Correo electrónico'}).fill(email);
  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button',{name:'Entrar'}).click();
  await expect(page.getByText('Sesión activa')).toBeVisible();

  await page.getByRole('textbox',{name:'Nombre de playlist en nube'}).fill('Colección E2E');
  await page.getByRole('button',{name:'Crear en cuenta'}).click();
  await expect(page.locator('.account-remote-list').getByText('Colección E2E')).toBeVisible();

  // The HttpOnly refresh cookie must keep the session alive across a full reload.
  await page.reload();
  await page.getByRole('button',{name:'Mi cuenta'}).click();
  await expect(page.getByText('Sesión activa')).toBeVisible();

  await page.getByRole('button',{name:'Salir'}).click();
  await expect(page.getByRole('heading',{name:'Iniciar sesión'})).toBeVisible();
});

test('private explorer saves a real provider reference, not an audio file',async({page})=>{
  test.skip(!process.env.NEXT_PUBLIC_API_URL,'Needs local API with disposable PostgreSQL');
  await page.route('**/v1/discovery/search?**',async route=>{
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
      failedProviders:[],disabledProviders:[],
      items:[{id:'jamendo:54321',provider:'jamendo',externalId:'54321',
        title:'Noche de prueba',artist:'Artista E2E',album:'Álbum test',
        durationSeconds:120,artworkUrl:null,
        sourceUrl:'https://www.jamendo.com/track/54321',licenseUrl:null,
        canStream:false,canDownload:false,canStorePrivateCopy:false,streamUrl:null}]
    })});
  });
  await page.goto('/');
  await page.getByRole('button',{name:'Mi cuenta'}).click();
  await page.getByRole('button',{name:'¿No tienes cuenta? Regístrate'}).click();
  const email='explore-'+Date.now()+'-'+Math.random().toString(36).slice(2)+'@example.test';
  await page.getByRole('textbox',{name:'Correo electrónico'}).fill(email);
  await page.getByLabel('Contraseña').fill('NebulaTestPassword123!');
  await page.getByRole('button',{name:'Crear mi cuenta'}).click();
  await expect(page.getByText('Sesión activa')).toBeVisible();
  await navigate(page,'Explorar');
  await page.getByRole('textbox',{name:'Buscar canciones externas'}).fill('noche');
  await page.locator('.explore-form').getByRole('button',{name:'Buscar'}).click();
  await expect(page.getByText('Noche de prueba')).toBeVisible();
  await expect(page.getByRole('button',{name:'Escuchar'})).toBeDisabled();
  await page.getByRole('button',{name:'Guardar',exact:true}).click();
  await expect(page.getByRole('button',{name:'Guardada'})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Mi colección externa'})).toBeVisible();
  await expect(page.locator('.content-section').filter({hasText:'Mi colección externa'}).getByText('Noche de prueba')).toBeVisible();
  await expect(page.getByRole('status')).toContainText('Referencia guardada');
});

test('MusicBrainz lookup displays reviewed matches without importing audio',async({page})=>{
  test.skip(!process.env.NEXT_PUBLIC_API_URL,'API not configured');
  await page.route('**/v1/metadata/musicbrainz?**',async route=>{
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
      source:'musicbrainz',audioAvailable:false,
      items:[{
        recordingId:'6ba7b810-9dad-11d1-80b4-00c04fd430c8',
        title:'Grabación de prueba',artist:'Banda E2E',
        album:'Disco E2E',releaseId:null,durationSeconds:180,
        score:94,sourceUrl:'https://musicbrainz.org/recording/6ba7b810-9dad-11d1-80b4-00c04fd430c8',
        coverArtCandidate:null,
      }]
    })});
  });
  await page.goto('/');
  await page.getByRole('button',{name:'Mi cuenta'}).click();
  await page.getByRole('button',{name:'¿No tienes cuenta? Regístrate'}).click();
  const email='mb-'+Date.now()+Math.random().toString(36).slice(2)+'@example.test';
  await page.getByRole('textbox',{name:'Correo electrónico'}).fill(email);
  await page.getByLabel('Contraseña').fill('NebulaTestPassword123!');
  await page.getByRole('button',{name:'Crear mi cuenta'}).click();
  await expect(page.getByText('Sesión activa')).toBeVisible();
  await navigate(page,'Explorar');
  await page.getByRole('textbox',{name:'Buscar metadatos musicales'}).fill('banda');
  await page.getByRole('button',{name:'Identificar'}).click();
  await expect(page.getByText('Grabación de prueba')).toBeVisible();
  await expect(page.getByText('Banda E2E', {exact:false})).toBeVisible();
});

test('Buscar plays official YouTube search results without pasting links',async({page})=>{
  test.skip(!process.env.NEBULA_TEST_DATABASE_URL||!process.env.NEXT_PUBLIC_API_URL,'Requires disposable account API');
  const password='NebulaTestPassword123!';
  const email='youtube-auto-'+Date.now()+'-'+Math.random().toString(36).slice(2)+'@example.test';
  const pool=new Pool({connectionString:process.env.NEBULA_TEST_DATABASE_URL,max:1});
  try{
    const salt=randomBytes(16).toString('hex');
    const hash='scrypt$'+salt+'$'+scryptSync(password,salt,64).toString('hex');
    await pool.query("INSERT INTO users (id,email,password_hash,role) VALUES ($1,$2,$3,'member')",[randomUUID(),email,hash]);
  }finally{await pool.end();}
  await page.route('**/v1/discovery/youtube/config',async route=>{
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({enabled:true})});
  });
  await page.route('**/v1/discovery/youtube?**',async route=>{
    expect(new URL(route.request().url()).searchParams.get('q')).toBe('Rola automatica');
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
      items:[{videoId:'dQw4w9WgXcQ',title:'Rola encontrada E2E',artist:'Canal de prueba',thumbnail:null,
        sourceUrl:'https://www.youtube.com/watch?v=dQw4w9WgXcQ'}]
    })});
  });
  await page.goto('/');
  await page.getByRole('button',{name:'Mi cuenta'}).click();
  await page.getByRole('textbox',{name:'Correo electrónico'}).fill(email);
  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button',{name:'Entrar'}).click();
  await expect(page.getByText('Sesión activa')).toBeVisible();
  await navigate(page,'Buscar');
  await page.getByRole('textbox',{name:'Buscar canciones, artistas o álbumes'}).fill('Rola automatica');
  await expect(page.getByText('Rola encontrada E2E')).toBeVisible({timeout:15000});
  await page.getByRole('button',{name:'Reproducir video'}).click();
  await expect(page.getByTitle('Reproductor oficial de YouTube')).toHaveAttribute('src',/youtube-nocookie\.com\/embed\/dQw4w9WgXcQ/);
});

test('private rooms can be created, joined and closed across two accounts', async ({ page, browser }) => {
  const api = (process.env.NEXT_PUBLIC_API_URL ?? '').replace(/\/$/, '');
  test.skip(!api || !process.env.NEBULA_TEST_DATABASE_URL, 'Requires disposable PostgreSQL-backed API');
  const password = 'NebulaTestPassword123!';
  const suffix = Date.now() + '-' + Math.random().toString(36).slice(2);
  const hostEmail = 'rooms-host-' + suffix + '@example.test';
  const guestEmail = 'rooms-guest-' + suffix + '@example.test';
  // Provision fixture users directly in disposable CI PostgreSQL. Do not
  // consume public registration rate limits shared by parallel browser tests.
  const pool = new Pool({ connectionString: process.env.NEBULA_TEST_DATABASE_URL, max: 1 });
  try {
    for (const email of [hostEmail, guestEmail]) {
      const salt = randomBytes(16).toString('hex');
      const hash = 'scrypt$' + salt + '$' + scryptSync(password, salt, 64).toString('hex');
      await pool.query("INSERT INTO users (id,email,password_hash,role) VALUES ($1,$2,$3,'member')",
        [randomUUID(), email, hash]);
    }
  } finally { await pool.end(); }

  async function signIn(target: Page, email: string) {
    await target.goto('/');
    await target.getByRole('button', { name: 'Mi cuenta' }).click();
    await target.getByRole('textbox', { name: 'Correo electrónico' }).fill(email);
    await target.getByLabel('Contraseña').fill(password);
    await target.getByRole('button', { name: 'Entrar' }).click();
    await expect(target.getByText('Sesión activa')).toBeVisible();
    await navigate(target, 'Salas');
    await expect(target.getByRole('heading', { name: 'Salas NÉBULA' })).toBeVisible();
  }

  await signIn(page, hostEmail);
  await page.getByLabel('Nombre').fill('Sala E2E privada');
  await page.getByRole('button', { name: 'Crear sala', exact: true }).click();
  const codeElement = page.locator('.room-hero code');
  await expect(codeElement).toBeVisible();
  const code = (await codeElement.textContent())?.trim() ?? '';
  expect(code.length).toBeGreaterThan(20);

  const guestContext = await browser.newContext();
  try {
    const guest = await guestContext.newPage();
    await signIn(guest, guestEmail);
    await guest.getByLabel('Código privado').fill(code);
    await guest.getByRole('button', { name: 'Unirme' }).click();
    await expect(guest.getByText('Te uniste a la sala.')).toBeVisible();
    await expect(guest.getByText('2 participante(s)', { exact: false }).first()).toBeVisible();

    page.once('dialog', dialog => { void dialog.accept(); });
    await page.getByRole('button', { name: 'Salir o cerrar Sala E2E privada' }).click();
    await expect(page.getByText('Sala cerrada.')).toBeVisible();
    await expect(guest.getByText('La cola está vacía.')).toHaveCount(0, { timeout: 10000 });
  } finally {
    await guestContext.close();
  }
});

test('OWNER invites a MEMBER through the private account UI', async ({ page }) => {
  const api = process.env.NEXT_PUBLIC_API_URL;
  test.skip(!api || !process.env.NEBULA_TEST_DATABASE_URL, 'Requires disposable PostgreSQL-backed API');
  const password = 'NebulaTestPassword123!';
  const suffix = randomUUID();
  const ownerEmail = 'invite-owner-' + suffix + '@example.test';
  const memberEmail = 'invite-member-' + suffix + '@example.test';
  const pool = new Pool({ connectionString: process.env.NEBULA_TEST_DATABASE_URL, max: 1 });
  try {
    const salt = randomBytes(16).toString('hex');
    const hash = 'scrypt$' + salt + '$' + scryptSync(password, salt, 64).toString('hex');
    await pool.query("INSERT INTO users (id,email,password_hash,role) VALUES ($1,$2,$3,'owner')",
      [randomUUID(), ownerEmail, hash]);
  } finally { await pool.end(); }

  await page.goto('/');
  await page.getByRole('button', { name: 'Mi cuenta' }).click();
  await page.getByRole('textbox', { name: 'Correo electrónico' }).fill(ownerEmail);
  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByText('Sesión activa')).toBeVisible();

  await page.getByLabel('Correo de la persona invitada').fill(memberEmail);
  await page.getByRole('button', { name: 'Crear invitación' }).click();
  const tokenElement = page.locator('.settings-panel code').last();
  await expect(tokenElement).toBeVisible();
  const token = (await tokenElement.textContent())?.trim() ?? '';
  expect(token.length).toBeGreaterThan(20);

  await page.getByRole('button', { name: 'Salir' }).click();
  await page.getByRole('button', { name: 'Tengo un código de invitación' }).click();
  await page.getByLabel('Código de invitación').fill(token);
  await page.getByRole('textbox', { name: 'Correo electrónico' }).fill(memberEmail);
  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button', { name: 'Crear cuenta con invitación' }).click();
  await expect(page.getByText('Sesión activa')).toBeVisible();
  await expect(page.getByText(memberEmail)).toBeVisible();
});
