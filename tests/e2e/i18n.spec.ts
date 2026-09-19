import {test,expect,board,jira,mm,login,inspect} from './fixtures';
import {seedCard,sharedRead} from './shared-helpers';
import {columnName} from '../../src/web/i18n/core';
const language='语言 / Language / 言語';

test('browser locale selects Japanese, English, Chinese variants and fallback',async({browser})=>{
 for(const [locale,lang,title,choice] of [['ja-JP','ja-JP','共有作業ボード','ja'],['en-GB','en-US','Shared work board','en'],['zh-TW','zh-CN','共享工作看板','zh'],['fr-FR','en-US','Shared work board','en']] as const){
  const context=await browser.newContext({locale});
  try{const page=await context.newPage();await page.goto(board);await expect(page.locator('html')).toHaveAttribute('lang',lang);await expect(page).toHaveTitle('Worklog · '+title);const column=(await sharedRead(context)).columns.find(item=>item.defaultNameKey);expect(column).toBeDefined();await expect(page.getByRole('region',{name:columnName(choice,column!),exact:true})).toBeVisible();await expect(page.getByLabel(language)).toHaveValue('auto');if(locale!=='fr-FR')await page.screenshot({path:'.tmp/i18n-'+choice+'.png',fullPage:true});}
  finally{await context.close();}
 }
});

test('manual language survives reload, preserves drafts and translates existing errors',async({browser})=>{
 const context=await browser.newContext({locale:'ja-JP'});
 try{
  const page=await context.newPage();await page.goto(board);await page.getByLabel(language).selectOption('en');
  const before=await sharedRead(context);const other=await context.newPage();await other.goto(board);
  await page.getByRole('button',{name:'New card',exact:true}).click();
  const dialog=page.getByRole('dialog');await dialog.getByLabel('Shared title').fill('完成 <draft>');await dialog.getByLabel('Shared notes').fill('Keep 日本語 中文 notes');
  await dialog.getByLabel(language).selectOption('zh');await expect(dialog.getByLabel('共享标题')).toHaveValue('完成 <draft>');await expect(other.locator('html')).toHaveAttribute('lang','zh-CN');
  await page.route('**/api/cards',route=>route.fulfill({status:409,contentType:'application/json',body:'{"code":"conflict"}'}));
  await dialog.getByRole('button',{name:'创建卡片',exact:true}).click();await expect(dialog.getByRole('alert')).toContainText('共享内容已更新');
  await dialog.getByLabel(language).selectOption('ja');await expect(dialog.getByRole('alert')).toContainText('共有内容が更新されました');await expect(dialog.getByLabel('共有メモ')).toHaveValue('Keep 日本語 中文 notes');
  await dialog.getByRole('button',{name:'詳細を閉じる',exact:true}).click();await dialog.getByRole('button',{name:'変更を破棄して閉じる'}).click();
  await page.getByRole('button',{name:'列を管理'}).click();await page.getByLabel('列名 1',{exact:true}).fill('My custom 列 draft');await page.getByRole('dialog').getByLabel(language).selectOption('en');await expect(page.getByLabel('Column name 1',{exact:true})).toHaveValue('My custom 列 draft');await expect(page.getByLabel('Column name 2',{exact:true})).toHaveValue(columnName('en',before.columns[1]!));
  await page.getByRole('button',{name:'Close column settings'}).click();expect((await sharedRead(context)).revision).toBe(before.revision);
  await page.reload();await expect(page.locator('html')).toHaveAttribute('lang','en-US');expect(await page.evaluate(()=>Object.entries(localStorage))).toEqual([['worklog.language','en']]);
  await page.getByLabel(language).selectOption('auto');await expect(page.locator('html')).toHaveAttribute('lang','ja-JP');expect(await page.evaluate(()=>Object.keys(localStorage))).toEqual([]);
 }finally{await context.close();}
});

test('denied browser storage does not block automatic or manual selection',async({browser})=>{
 const context=await browser.newContext({locale:'zh-CN'});
 try{await context.addInitScript(()=>Object.defineProperty(window,'localStorage',{get(){throw new DOMException('Blocked','SecurityError');}}));const page=await context.newPage();await page.goto(board);await expect(page.locator('html')).toHaveAttribute('lang','zh-CN');await page.getByLabel(language).selectOption('en');await expect(page.getByRole('button',{name:'New card',exact:true})).toBeVisible();await page.reload();await expect(page.locator('html')).toHaveAttribute('lang','zh-CN');}
 finally{await context.close();}
});

test('language changes preserve personal content without re-reading the source',async({alice})=>{
 const control=await login(alice,jira,'alice');await seedCard(alice,'多语言个人预览','DEMO-2');const page=await alice.newPage();await page.goto(board);await page.getByRole('button',{name:'打开卡片：多语言个人预览',exact:true}).click();const dialog=page.getByRole('dialog');await expect(dialog.getByText('ALICE_ONLY_MARKER：最新的受限模拟评论',{exact:true})).toBeVisible();
 const count=() => inspect(control).then(value=>value.requests.filter(item=>item.path.includes('/issue/DEMO-2')).length);const before=await count();
 await dialog.getByLabel(language).selectOption('en');await expect(dialog.getByRole('heading',{name:'Personal preview',exact:true})).toBeVisible();await expect(dialog.locator('.jira-comment > span')).toContainText('9/18/2026');
 await dialog.getByLabel(language).selectOption('ja');await expect(dialog.getByText('ALICE_ONLY_MARKER：最新的受限模拟评论',{exact:true})).toBeVisible();await expect(dialog.locator('.jira-comment > span')).toContainText('2026/9/18');expect(await count()).toBe(before);
 expect(await page.evaluate(()=>Object.entries(localStorage))).toEqual([['worklog.language','ja']]);
});

test('probe and dummy consoles support browser detection and manual language',async({browser})=>{
 const context=await browser.newContext({locale:'en-US'});
 try{const page=await context.newPage();await page.goto(board+'/probe/');await expect(page.getByRole('heading',{name:'Check that personal previews work.'})).toBeVisible();await page.getByLabel(language).selectOption('ja');await expect(page.getByRole('button',{name:'Jira を読み込む',exact:true})).toBeVisible();
  for(const site of [jira,mm]){await page.goto(site+'/__dummy/');await expect(page.getByRole('button',{name:'Sign in as Alice'})).toBeVisible();await page.getByLabel(language).selectOption('ja');await page.getByRole('button',{name:'Alice としてログイン'}).click();await expect(page.locator('strong')).toHaveText('alice');await expect(page.locator('html')).toHaveAttribute('lang','ja-JP');await page.getByRole('button',{name:'適用',exact:true}).click();await expect(page.locator('#status')).toHaveText('模擬応答を適用しました');await page.getByLabel(language).selectOption('en');await expect(page.locator('#status')).toHaveText('Simulated response applied');await page.goto(site+(site===jira?'/browse/DEMO-1':'/demo/pl/'+'a'.repeat(26)));await expect(page.locator('.badge')).toContainText('Demo environment');await page.getByLabel(language).selectOption('zh');await expect(page.locator('.badge')).toContainText('模拟环境');}
 }finally{await context.close();}
});

test('column drafts matching another translation survive consecutive language changes',async({page})=>{
 await page.goto(board);const snapshot=await sharedRead(page.context());const index=snapshot.columns.findIndex(item=>item.defaultNameKey);expect(index).toBeGreaterThanOrEqual(0);
 const englishName=columnName('en',snapshot.columns[index]!);
 await page.getByRole('button',{name:'管理列',exact:true}).click();const dialog=page.getByRole('dialog');
 await dialog.getByLabel('列名称 '+(index+1),{exact:true}).fill(englishName);await dialog.getByLabel(language).selectOption('en');
 await expect(dialog.getByRole('button',{name:'Save column name '+(index+1),exact:true})).toBeEnabled();
 await dialog.getByLabel(language).selectOption('ja');await expect(dialog.getByLabel('列名 '+(index+1),{exact:true})).toHaveValue(englishName);
});

test('automatic mode responds to browser language changes and manual choice overrides them',async({page})=>{
 await page.goto(board);
 await page.evaluate(()=>{Object.defineProperty(navigator,'languages',{get:()=>['de-DE','ja-JP'],configurable:true});dispatchEvent(new Event('languagechange'));});await expect(page.locator('html')).toHaveAttribute('lang','ja-JP');
 await page.getByLabel(language).selectOption('en');
 await page.evaluate(()=>{Object.defineProperty(navigator,'languages',{get:()=>['zh-HK'],configurable:true});dispatchEvent(new Event('languagechange'));});await expect(page.locator('html')).toHaveAttribute('lang','en-US');
 await page.getByLabel(language).selectOption('auto');await expect(page.locator('html')).toHaveAttribute('lang','zh-CN');
});
