import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir:'./tests/e2e',fullyParallel:false,workers:1,retries:0,timeout:30000,
  use:{trace:'off',screenshot:'off',video:'off'},reporter:'list',outputDir:'.tmp/playwright-results',
  webServer:{command:'python -m tools.dev --probe'+(process.env.WORKLOG_TEST_MODE === 'lifecycle-test' ? ' --mode lifecycle-test' : ''),url:'http://127.0.0.1:4173/health',reuseExistingServer:false,timeout:20000,gracefulShutdown:{signal:'SIGTERM',timeout:8000}},
});
