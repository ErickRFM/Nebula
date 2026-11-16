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
