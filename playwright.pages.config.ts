import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/pages',
  reporter: 'list',
  outputDir: 'artifacts/pages-results',
  use: { baseURL: 'http://localhost:4173/orbit/', trace: 'retain-on-failure' },
  webServer: {
    command: 'npm run build:pages && npm run preview:pages -- --port 4173 --strictPort',
    url: 'http://localhost:4173/orbit/',
    reuseExistingServer: false,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
});
