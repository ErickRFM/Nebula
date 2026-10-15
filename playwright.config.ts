import {defineConfig,devices} from '@playwright/test';

export default defineConfig({
  testDir:'./apps/web/e2e',
  fullyParallel:true,
  retries:process.env.CI ? 1 : 0,
  reporter:process.env.CI ? 'github' : 'list',
  use:{baseURL:'http://127.0.0.1:3000',trace:'retain-on-failure'},
  projects:[
    {name:'desktop-chromium',use:{...devices['Desktop Chrome']}},
    {name:'mobile-chromium',use:{...devices['Pixel 7']}},
  ],
  webServer:{
    command:'npm run dev',
    url:'http://127.0.0.1:3000',
    timeout:120_000,
    reuseExistingServer:!process.env.CI,
  },
});
