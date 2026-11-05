import {test,expect} from './auth-test';

test('guest devices keep distinct playlists while sharing the music catalog',async({page,browser})=>{
  test.setTimeout(60_000);
  const api=process.env.NEXT_PUBLIC_API_URL;
  test.skip(!api,'Needs API');
  const firstIssued=page.waitForResponse(response=>response.url().endsWith('/v1/auth/guest')&&response.status()===201);
  await page.goto('/');
  const first=await (await firstIssued).json() as {user:{id:string};accessToken:string};
  const context=await browser.newContext();
  try{
    const secondPage=await context.newPage();
    await secondPage.route('**/v1/auth/**',route=>route.continue({headers:{...route.request().headers(),'x-forwarded-for':'198.51.100.251'}}));
    const secondIssued=secondPage.waitForResponse(response=>response.url().endsWith('/v1/auth/guest')&&response.status()===201);
    await secondPage.goto('/');
    const second=await (await secondIssued).json() as {user:{id:string};accessToken:string};
    expect(first.user.id).not.toBe(second.user.id);

    const playlist=await page.request.post(api+'/v1/playlists',{
      headers:{authorization:'Bearer '+first.accessToken},
      data:{name:'Solo en mi dispositivo'},
    });
    expect(playlist.status()).toBe(201);
    const other=await secondPage.request.get(api+'/v1/playlists',{
      headers:{authorization:'Bearer '+second.accessToken},
    });
    expect(other.status()).toBe(200);
    expect((await other.json()).items).not.toContainEqual(expect.objectContaining({name:'Solo en mi dispositivo'}));

    const sharedA=await page.request.get(api+'/v1/library/cloud/search?limit=5',{
      headers:{authorization:'Bearer '+first.accessToken},
    });
    const sharedB=await secondPage.request.get(api+'/v1/library/cloud/search?limit=5',{
      headers:{authorization:'Bearer '+second.accessToken},
    });
    expect(sharedA.status()).toBe(200);
    expect(sharedB.status()).toBe(200);
    expect((await sharedA.json()).items.map((item:{id:string})=>item.id))
      .toEqual((await sharedB.json()).items.map((item:{id:string})=>item.id));
    await expect(page.getByRole('button',{name:'Mi cuenta'})).toHaveCount(0);
    await expect(secondPage.getByRole('button',{name:'Mi cuenta'})).toHaveCount(0);
  }finally{await context.close();}
});
