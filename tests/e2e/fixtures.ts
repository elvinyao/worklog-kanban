import { test as base, chromium, expect, type BrowserContext, type Page } from '@playwright/test';
import path from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';

export const board = 'http://board.localhost:4173';
export const jira = 'http://jira.localhost:4180/jira';
export const mm = 'http://mattermost.localhost:4181';
export const test = base.extend<{alice:BrowserContext;bob:BrowserContext}>({
  alice:async ({},use) => { await withProfile(use); },
  bob:async ({},use) => { await withProfile(use); },
});
async function withProfile(use:(context:BrowserContext)=>Promise<void>) {
  const directory = await mkdtemp(path.join(os.tmpdir(),'worklog-profile-'));
  const extension = path.resolve('dist/extension-dummy');
  const context = await chromium.launchPersistentContext(directory,{channel:'chromium',headless:true,args:['--disable-extensions-except='+extension,'--load-extension='+extension,'--host-resolver-rules=MAP board.localhost 127.0.0.1, MAP jira.localhost 127.0.0.1, MAP mattermost.localhost 127.0.0.1, MAP untrusted.localhost 127.0.0.1']});
  try { await use(context); } finally { await context.close(); await rm(directory,{recursive:true,force:true}); }
}
export async function login(context:BrowserContext,site:string,identity:'alice'|'bob') {
  const page = await context.newPage();
  await page.goto(site+'/__dummy/');
  await page.getByRole('button',{name:identity === 'alice' ? '以 Alice 登录' : '以 Bob 登录'}).click();
  await expect(page.locator('strong')).toHaveText(identity);
  return page;
}
export async function fault(page:Page,value:string) {
  await page.locator('#fault').selectOption(value);
  const [response]=await Promise.all([page.waitForResponse(r=>r.url().endsWith('/__dummy/fault')&&r.request().method()==='POST'),page.getByRole('button',{name:'应用',exact:true}).click()]);
  expect(response.status()).toBe(200);
  await expect(page.locator('#status')).toHaveText('已应用模拟响应');
}
export async function inspect(page:Page):Promise<{requests:{method:string;path:string}[];controls:{method:string;path:string}[]}> {
  return page.evaluate(async()=>{const r=await fetch('inspect',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});return r.json();});
}
export { expect };
