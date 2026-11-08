const { chromium } = require('playwright');
const { AxeBuilder } = require('@axe-core/playwright');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('http://localhost:3001');
  const results = await new AxeBuilder({ page }).analyze();
  fs.writeFileSync('a11y-report.json', JSON.stringify(results, null, 2));
  console.log('A11Y report saved to a11y-report.json');
  await browser.close();
})();
