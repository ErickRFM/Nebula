import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { writeFile } from 'fs/promises';

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('http://localhost:3001');
  const results = await new AxeBuilder({ page }).analyze();
  await writeFile('a11y-report.json', JSON.stringify(results, null, 2));
  console.log('A11Y report saved to a11y-report.json');
  await browser.close();
})();
