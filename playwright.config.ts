import { defineConfig } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const database=process.env.WORKLOG_TEST_DATABASE??join(mkdtempSync(join(tmpdir(),'worklog-e2e-')),'board.sqlite3');
process.env.WORKLOG_TEST_DATABASE=database;
process.env.WORKLOG_TEST_APP_LOG=database+'.log';
export default defineConfig({
  testDir:'./tests/e2e',fullyParallel:false,workers:1,retries:0,timeout:30000,
  use:{locale:'zh-CN',trace:'off',screenshot:'off',video:'off'},reporter:'list',outputDir:'.tmp/playwright-results',
  webServer:{command:'python -m tools.dev'+(process.env.WORKLOG_TEST_PAGE === 'probe'?' --probe':'')+(process.env.WORKLOG_TEST_MODE === 'lifecycle-test' ? ' --mode lifecycle-test' : ''),env:{WORKLOG_DATABASE:database,WORKLOG_TEST_APP_LOG:database+'.log'},url:'http://127.0.0.1:4173/health',reuseExistingServer:false,timeout:20000,gracefulShutdown:{signal:'SIGTERM',timeout:8000}},
});
