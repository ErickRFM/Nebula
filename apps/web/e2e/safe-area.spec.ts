import {test,expect} from '@playwright/test';

// env(safe-area-inset-*) is 0 in every emulator, so the insets reach the layout rules through
// --sa-top/--sa-bottom: the same declaration a notched phone resolves, but injectable here.
test('fixed bars reserve the device safe-area insets',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/?vista=biblioteca');
  const topbar=page.locator('.topbar');
  const nav=page.locator('.bottom-nav');
  const main=page.locator('.main-area');
  await expect(topbar).toBeVisible();
  await expect(nav).toBeVisible();
  await expect(topbar).toHaveCSS('height','64px');
  await expect(nav).toHaveCSS('padding-bottom','6px');
  await expect(main).toHaveCSS('padding-bottom','165px');

  await page.evaluate(()=>{
    document.documentElement.style.setProperty('--sa-top','59px');
    document.documentElement.style.setProperty('--sa-bottom','34px');
  });
  await expect(topbar).toHaveCSS('height','123px');
  await expect(topbar).toHaveCSS('padding-top','59px');
  await expect(nav).toHaveCSS('padding-bottom','34px');
  await expect(main).toHaveCSS('padding-bottom','199px');

  await page.evaluate(()=>document.documentElement.style.removeProperty('--sa-bottom'));
  await expect(nav).toHaveCSS('padding-bottom','6px');
  await expect(main).toHaveCSS('padding-bottom','165px');
});
