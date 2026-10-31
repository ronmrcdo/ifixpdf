import {defineConfig} from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  use: {
    baseURL: 'http://localhost:4174',
    viewport: {width: 1440, height: 900},
    launchOptions: {
      executablePath: process.env.CHROME || '/usr/bin/google-chrome',
      args: ['--no-sandbox'],
    },
  },
  projects: [{name: 'chromium', use: {browserName: 'chromium'}}],
  webServer: {
    command: 'pnpm vite --port 4174 --strictPort',
    url: 'http://localhost:4174',
    reuseExistingServer: !process.env.CI,
  },
});
