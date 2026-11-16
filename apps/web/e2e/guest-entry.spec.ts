import {test,expect} from './auth-test';

/**
 * Entrada sin formulario: el visitante obtiene una identidad propia y su catálogo sigue
 * limitado a esa identidad. La aserción de playlists cruzadas es la que impide que un
 * cambio de política vuelva a exponer la música de otra persona.
 */
test('a first visit provisions its own identity and keeps each device private',async({page,browser})=>{
  test.setTimeout(60_000);
  const api=process.env.NEXT_PUBLIC_API_URL;
  test.skip(!api,'Needs API');

  const firstIssued=page.waitForResponse(response=>response.url().endsWith('/v1/auth/guest')&&response.status()===201);
  await page.goto('/');
  const first=await (await firstIssued).json() as {user:{id:string;email:string;role:string};accessToken:string};
  expect(first.user.role).toBe('member');
  await expect(page.locator('.sidebar-footer')).toContainText('Biblioteca conectada');
  await expect(page.locator('input[type="email"]')).toHaveCount(0);

  const other=await browser.newContext();
  try{
    const secondPage=await other.newPage();
    // Identidad distinta: otro dispositivo, otra IP a efectos del límite por IP.
    await secondPage.route('**/v1/auth/**',route=>route.continue({headers:{...route.request().headers(),'x-forwarded-for':'198.51.100.251'}}));
    const secondIssued=secondPage.waitForResponse(response=>response.url().endsWith('/v1/auth/guest')&&response.status()===201);
    await secondPage.goto('/');
    const second=await (await secondIssued).json() as {user:{id:string};accessToken:string};
    expect(second.user.id).not.toBe(first.user.id);

    const created=await page.request.post(api+'/v1/playlists',{
      headers:{authorization:'Bearer '+first.accessToken},
      data:{name:'Solo en mi dispositivo'},
    });
    expect(created.status()).toBe(201);
    const seenByOther=await secondPage.request.get(api+'/v1/playlists',{
      headers:{authorization:'Bearer '+second.accessToken},
    });
    expect(seenByOther.status()).toBe(200);
    expect((await seenByOther.json()).items).not.toContainEqual(expect.objectContaining({name:'Solo en mi dispositivo'}));

    const mine=await page.request.get(api+'/v1/library/cloud',{headers:{authorization:'Bearer '+first.accessToken}});
    const theirs=await secondPage.request.get(api+'/v1/library/cloud',{headers:{authorization:'Bearer '+second.accessToken}});
    expect(mine.status()).toBe(200);
    expect(theirs.status()).toBe(200);
    const idsOf=(payload:{items:{id:string}[]})=>payload.items.map(item=>item.id);
    expect(idsOf(await theirs.json())).toEqual([]);
    expect(idsOf(await mine.json())).toEqual([]);
  }finally{await other.close();}
});

/**
 * El visitante no puede quedarse sin puerta: si el invitado oculta el formulario, quien tiene
 * una cuenta invitada ya no puede usarla nunca. Esta prueba es la que falla si alguien vuelve a
 * borrar el acceso a las credenciales.
 */
test('the guest identity keeps an explicit way to use a real account',async({page,request})=>{
  const api=process.env.NEXT_PUBLIC_API_URL;
  test.skip(!api,'Needs API');
  const email='guest-swap-'+Date.now()+'@example.test';
  const password='NebulaTestPassword123!';
  expect((await request.post(api+'/v1/auth/register',{
    data:{email,password},headers:{'x-nebula-client':'e2e'},
  })).status()).toBe(201);

  await page.goto('/');
  await page.getByRole('button',{name:'Mi cuenta'}).click();
  const door=page.getByRole('button',{name:'Iniciar sesión con mi cuenta'});
  await expect(door).toBeVisible();
  await expect(page.getByText('Correo electrónico',{exact:true})).toHaveCount(0);

  await door.click();
  await page.getByRole('textbox',{name:'Correo electrónico'}).fill(email);
  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button',{name:'Entrar'}).click();
  await expect(page.getByText('Sesión activa')).toBeVisible();
  await expect(page.getByText(email)).toBeVisible();
  await expect(door).toHaveCount(0);
});

/**
 * El token del invitado no puede cerrar el catálogo público: esa fuente nunca pidió credenciales
 * y es lo que hace útil la primera visita. Con la puerta en accessToken, la región desaparecía.
 */
test('the guest keeps listening to the public Audius catalogue',async({page})=>{
  test.skip(!process.env.NEXT_PUBLIC_API_URL,'Needs API');
  await page.route('https://api.audius.co/v1/tracks/search?**',route=>route.fulfill({
    status:200,contentType:'application/json',
    body:JSON.stringify({data:[{id:'Track_Fixture',title:'Demo Audius Pública',
      user:{name:'Artista Audius'},permalink:'/artist/song',is_stream_gated:false,is_streamable:true,duration:132}]}),
  }));
  const issued=page.waitForResponse(response=>response.url().endsWith('/v1/auth/guest')&&response.status()===201);
  await page.goto('/');
  await issued;
  const desktop=page.getByRole('navigation',{name:'Navegación principal'}).getByRole('button',{name:'Buscar',exact:true});
  if(await desktop.isVisible()) await desktop.click();
  else await page.getByRole('navigation',{name:'Navegación móvil'}).getByRole('button',{name:'Buscar',exact:true}).click();
  await page.getByRole('textbox',{name:'Buscar canciones, artistas o álbumes'}).fill('electrónica');
  await expect(page.getByRole('region',{name:'Catálogo público de Audius'}).getByText('Demo Audius Pública')).toBeVisible();
});
