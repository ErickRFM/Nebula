// audit.ts – runs axe-core accessibility audit on local dev server
import puppeteer from 'puppeteer';
import axeCore from 'axe-core';

(async () => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle0' });
  // inject axe
  await page.addScriptTag({ content: axeCore.source });
  const results = await page.evaluate(async () => {
    // @ts-ignore – axe is global
    return await (window as any).axe.run({});
  });
  console.log(JSON.stringify(results, null, 2));
  await browser.close();
})();
