import { test, expect, type Page } from './auth-test';

async function navigate(page: Page, name: string) {
  const desktop = page.getByRole('navigation',{name:'Navegación principal'}).getByRole('button',{name,exact:true});
  const mobile = page.getByRole('navigation',{name:'Navegación móvil'}).getByRole('button',{name,exact:true});
  if (await desktop.isVisible()) await desktop.click();
  else if(await mobile.isVisible()) await mobile.click();
  else {
    await page.getByRole('button',{name:'Más secciones'}).click();
    await page.getByRole('navigation',{name:'Más secciones de NÉBULA'}).getByRole('button',{name,exact:true}).click();
  }
}


test('navigation and search work', async ({page}) => {
  await page.goto('/');
  await expect(page.getByRole('heading',{name:/Encuentra tu próxima canción/})).toBeVisible();
  await navigate(page,'Buscar');
  await expect(page.getByRole('heading',{name:'¿Qué quieres escuchar?'})).toBeVisible();
  await page.getByRole('textbox',{name:'Buscar canciones, artistas o álbumes'}).fill('Frecuencia');
  await expect(page.getByText('No hay coincidencias entre tus archivos locales.',{exact:false})).toBeVisible();
  await expect(page.getByText('Frecuencia azul')).toHaveCount(0);
});

test('keyboard search, real albums and accessible contrast settings', async ({page}) => {
  await page.goto('/');
  await page.keyboard.press('ControlOrMeta+k');
  const input=page.getByRole('textbox',{name:'Buscar canciones, artistas o álbumes'});
  await expect(input).toBeFocused();
  await input.fill('Música importada');
  await expect(page.locator('.search-page')).toBeVisible();
  const desktop=page.getByRole('navigation',{name:'Navegación principal'});
  if(await desktop.isVisible()) await navigate(page,'Ajustes');
  else await navigate(page,'Ajustes');
  const contrast=page.getByRole('switch',{name:'Contraste alto'});
  await contrast.click();
  await expect(contrast).toHaveAttribute('aria-checked','true');
  await expect(page.locator('html')).toHaveClass(/nebula-high-contrast/);
  await page.reload();
  await expect(page.locator('html')).toHaveClass(/nebula-high-contrast/);
});

test('personal albums reflect imported music, not illustrative mixes', async ({page}) => {
  await page.goto('/');
  await navigate(page,'Biblioteca');
  await page.getByRole('button',{name:'Álbumes'}).click();
  await expect(page.locator('.album-grid .album-card')).toHaveCount(0);
  const pcm=Buffer.alloc(44+8820);
  pcm.write('RIFF',0);pcm.writeUInt32LE(pcm.length-8,4);pcm.write('WAVE',8);
  pcm.write('fmt ',12);pcm.writeUInt32LE(16,16);pcm.writeUInt16LE(1,20);
  pcm.writeUInt16LE(1,22);pcm.writeUInt32LE(44100,24);pcm.writeUInt32LE(88200,28);
  pcm.writeUInt16LE(2,32);pcm.writeUInt16LE(16,34);pcm.write('data',36);pcm.writeUInt32LE(pcm.length-44,40);
  await page.getByLabel('Importar archivos de audio propios').setInputFiles({name:'album-real.wav',mimeType:'audio/wav',buffer:pcm});
  await expect(page.locator('.album-grid .album-card').filter({hasText:'Archivos importados'})).toBeVisible();
  await expect(page.getByText('Selecciones de ejemplo')).toHaveCount(0);
});

test('playlist creation persists after reloading', async ({page}) => {
  await page.goto('/');
  await navigate(page,'Playlists');
  await page.getByPlaceholder('Nombre de nueva playlist').fill('Para estudiar');
  await page.getByRole('button',{name:'Crear playlist',exact:true}).click();
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
  await page.getByLabel('Importar archivos de audio propios').setInputFiles({name:'mi-cancion.wav',mimeType:'audio/wav',buffer:pcm});
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

test('all visitors access shared cloud without an account form', async ({page}) => {
  test.skip(!process.env.NEXT_PUBLIC_API_URL,'Needs API');
  await page.goto('/');
  await expect(page.getByRole('button',{name:'Mi cuenta'})).toHaveCount(0);
  await navigate(page,'Biblioteca');
  await expect(page.getByText('Biblioteca para todos')).toBeVisible();
  await expect(page.getByLabel('Compartir canciones en NÉBULA Cloud')).toHaveCount(1);
  await page.reload();
  await expect(page.getByText('Biblioteca para todos')).toBeVisible();
  await expect(page.getByRole('heading',{name:'Iniciar sesión'})).toHaveCount(0);
});

test('guest explorer saves provider references without sign-in',async({page})=>{
  test.skip(!process.env.NEXT_PUBLIC_API_URL,'Needs API');
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
  await navigate(page,'Explorar');
  await expect(page.getByRole('button',{name:'Internet Archive'})).toBeVisible();
  await page.getByRole('textbox',{name:'Buscar canciones externas'}).fill('noche');
  await page.locator('.explore-form').getByRole('button',{name:'Buscar',exact:true}).click();
  await expect(page.getByText('Noche de prueba')).toBeVisible();
  await expect(page.getByRole('button',{name:'Escuchar'})).toBeDisabled();
  await page.getByRole('button',{name:'Guardar',exact:true}).click();
  await expect(page.getByRole('button',{name:'Guardada'})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Mi colección externa'})).toBeVisible();
});

test('MusicBrainz lookup displays verified metadata for guests',async({page})=>{
  test.skip(!process.env.NEXT_PUBLIC_API_URL,'Needs API');
  await page.route('**/v1/metadata/musicbrainz?**',async route=>{
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
      source:'musicbrainz',audioAvailable:false,
      items:[{recordingId:'6ba7b810-9dad-11d1-80b4-00c04fd430c8',
        title:'Grabación de prueba',artist:'Banda E2E',album:'Disco E2E',
        releaseId:null,durationSeconds:180,score:94,
        sourceUrl:'https://musicbrainz.org/recording/6ba7b810-9dad-11d1-80b4-00c04fd430c8',
        coverArtCandidate:null}]
    })});
  });
  await page.goto('/');
  await navigate(page,'Explorar');
  await page.getByRole('textbox',{name:'Buscar metadatos musicales'}).fill('banda');
  await page.getByRole('button',{name:'Identificar'}).click();
  await expect(page.getByText('Grabación de prueba')).toBeVisible();
  await expect(page.getByText('Banda E2E',{exact:false})).toBeVisible();
});

test('Buscar plays official YouTube results for guests',async({page})=>{
  test.skip(!process.env.NEXT_PUBLIC_API_URL,'Needs API');
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
  await navigate(page,'Buscar');
  await page.getByRole('textbox',{name:'Buscar canciones, artistas o álbumes'}).fill('Rola automatica');
  await expect(page.getByText('Rola encontrada E2E')).toBeVisible({timeout:15000});
  await page.getByRole('button',{name:'Reproducir video'}).click();
  await expect(page.getByTitle('Reproductor oficial de YouTube')).toHaveAttribute('src',/youtube-nocookie\.com\/embed\/dQw4w9WgXcQ/);
});

test('guests can create and join rooms without sign-in',async({page,browser})=>{
  test.skip(!process.env.NEXT_PUBLIC_API_URL||!process.env.NEBULA_TEST_DATABASE_URL,'Needs disposable API');
  async function openRooms(target:Page){
    await target.goto('/');
    await navigate(target,'Salas');
    await expect(target.getByRole('heading',{name:'Salas NÉBULA'})).toBeVisible();
    await expect(target.getByRole('button',{name:'Crear sala',exact:true})).toBeVisible();
  }
  await openRooms(page);
  await page.getByLabel('Nombre').fill('Sala E2E privada');
  const clockProbe=page.waitForResponse(response=>response.url().includes('/v1/rooms/clock')&&response.status()===200);
  await page.getByRole('button',{name:'Crear sala',exact:true}).click();
  const clock=await clockProbe;
  expect(clock.headers()['cache-control']).toContain('no-store');
  const codeElement=page.locator('.room-hero code');
  await expect(codeElement).toBeVisible();
  const code=(await codeElement.textContent())?.trim()??'';
  expect(code.length).toBeGreaterThan(20);
  await expect(page.getByRole('button',{name:'Ir a Biblioteca y subir música'})).toBeVisible();
  await expect(page.getByRole('button',{name:'Compartir y empezar'})).toBeDisabled();
  const context=await browser.newContext();
  try{
    const guest=await context.newPage();
    await openRooms(guest);
    await guest.getByLabel('Código privado').fill(code);
    await guest.getByRole('button',{name:'Unirme'}).click();
    await expect(guest.getByText('Te uniste a la sala.')).toBeVisible();
    await expect(guest.getByText('2 participante(s)',{exact:false}).first()).toBeVisible();
    page.once('dialog',dialog=>{void dialog.accept();});
    await page.getByRole('button',{name:'Salir o cerrar Sala E2E privada'}).click();
    await expect(page.getByText('Sala cerrada.')).toBeVisible();
  }finally{await context.close();}
});

test('anonymous guests cannot create administrative invitations',async({page,request})=>{
  const api=process.env.NEXT_PUBLIC_API_URL;
  test.skip(!api,'Needs API');
  await page.goto('/');
  await expect(page.getByRole('button',{name:'Mi cuenta'})).toHaveCount(0);
  const guest=await request.post(api+'/v1/auth/guest',{data:{},headers:{'x-nebula-client':'e2e','x-forwarded-for':'198.51.100.188'}});
  expect(guest.status()).toBe(201);
  const {accessToken}=await guest.json() as {accessToken:string};
  const admin=await request.post(api+'/v1/admin/invites',{data:{},headers:{authorization:'Bearer '+accessToken}});
  expect(admin.status()).toBe(403);
});

