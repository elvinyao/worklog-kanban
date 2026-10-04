import {test,expect,board} from './fixtures';
import {sharedRead,seedCard} from './shared-helpers';

const optIn='在此浏览器保留输入草稿（7天，不含个人预览）';
test('card drafts recover after reload and replay the original committed request',async({alice})=>{
 const page=await alice.newPage();await page.goto(board);
 const payloads:unknown[]=[];
 await page.route('**/api/cards',async route=>{
  if(route.request().method()!=='POST'){await route.continue();return;}
  payloads.push(route.request().postDataJSON());
  if(payloads.length===1){const response=await route.fetch({url:route.request().url().replace('board.localhost','127.0.0.1'),headers:{...route.request().headers(),Host:'board.localhost:4173'}});expect(response.ok()).toBe(true);await route.abort();}
  else await route.continue();
 });
 const title='recover-card-'+Date.now();
 await page.getByRole('button',{name:'新建卡片',exact:true}).click();
 await page.getByLabel(optIn,{exact:true}).check();
 await page.getByLabel('共享标题',{exact:true}).fill(title);
 await page.getByLabel('共享笔记',{exact:true}).fill('保持输入');
 await page.getByRole('button',{name:'创建卡片',exact:true}).click();
 await expect(page.getByRole('button',{name:'重试并确认创建结果',exact:true})).toBeEnabled();
 page.once('dialog',dialog=>dialog.accept());await page.reload();
 await page.getByRole('button',{name:'新建卡片',exact:true}).click();
 await page.getByRole('button',{name:/^恢复草稿：/}).click();
 await expect(page.getByLabel('共享标题',{exact:true})).toHaveValue(title);
 await expect(page.getByRole('textbox',{name:'共享笔记',exact:true})).toHaveValue('保持输入');
 await page.setViewportSize({width:390,height:844});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:'.tmp/local-draft-recovery-mobile.png',fullPage:true});
 await page.getByRole('button',{name:'重试并确认创建结果',exact:true}).click();
 await expect(page.getByRole('dialog')).toHaveCount(0);
 expect(payloads).toHaveLength(2);expect(payloads[0]).toEqual(payloads[1]);
 expect((await sharedRead(alice)).cards.filter(card=>card.title===title)).toHaveLength(1);
 expect(await page.evaluate(()=>Object.keys(localStorage).filter(key=>key.startsWith('worklog.draft.')))).toEqual([]);
});

test('column replay survives reload and rejected retry without duplicate columns',async({alice})=>{
 const page=await alice.newPage();await page.goto(board);const requests:unknown[]=[];
 await page.route('**/api/columns',async route=>{
  if(route.request().method()!=='POST'){await route.continue();return;}
  requests.push(route.request().postDataJSON());
  if(requests.length===1){const response=await route.fetch({url:route.request().url().replace('board.localhost','127.0.0.1'),headers:{...route.request().headers(),Host:'board.localhost:4173'}});expect(response.ok()).toBe(true);await route.abort();}
  else if(requests.length===2)await route.fulfill({status:429,contentType:'application/json',body:'{"code":"rate_limited"}'});
  else await route.continue();
 });
 const name='recover-column-'+Date.now();await page.getByRole('button',{name:'管理列',exact:true}).click();
 await page.getByLabel(optIn,{exact:true}).check();await page.getByLabel('新列名称',{exact:true}).fill(name);
 await page.getByRole('button',{name:'添加列',exact:true}).click();
 const retry=page.getByRole('button',{name:'重试并确认创建列',exact:true});
 await expect(retry).toBeEnabled();page.once('dialog',dialog=>dialog.accept());await page.reload();
 await page.getByRole('button',{name:'管理列',exact:true}).click();await page.getByRole('button',{name:/^恢复草稿：/}).click();
 await retry.click();await expect(page.getByRole('alert')).toBeVisible();await expect(retry).toBeEnabled();
 await expect(page.getByLabel('新列名称',{exact:true})).toBeDisabled();await retry.click();
 await expect(page.getByLabel('新列名称',{exact:true})).toHaveValue('');
 expect(requests).toHaveLength(3);expect(requests[0]).toEqual(requests[1]);expect(requests[1]).toEqual(requests[2]);
 expect((await sharedRead(alice)).columns.filter(column=>column.name===name)).toHaveLength(1);
});

test('archive pending input remains recoverable when the committed archive emptied completed tasks',async({alice})=>{
 const done=(await sharedRead(alice)).columns.find(column=>column.isDone)!;
 await seedCard(alice,'recover archived input',null,[],done.id);
 const page=await alice.newPage();await page.goto(board);const requests:unknown[]=[];
 await page.route('**/api/archives',async route=>{
  if(route.request().method()!=='POST'){await route.continue();return;}
  requests.push(route.request().postDataJSON());
  if(requests.length===1){const response=await route.fetch({url:route.request().url().replace('board.localhost','127.0.0.1'),headers:{...route.request().headers(),Host:'board.localhost:4173'}});expect(response.ok()).toBe(true);await route.abort();}else await route.continue();
 });
 await page.getByRole('button',{name:'归档已完成任务',exact:true}).click();await page.getByLabel(optIn,{exact:true}).check();
 await page.getByLabel('归档名称',{exact:true}).fill('recovered archive');
 await page.getByRole('button',{name:/^归档 \d+ 项$/}).click();await expect(page.getByRole('alert')).toBeVisible();
 page.once('dialog',dialog=>dialog.accept());await page.reload();
 await page.getByRole('button',{name:'归档已完成任务',exact:true}).click();await page.getByRole('button',{name:/^恢复草稿：/}).click();
 await page.getByRole('button',{name:/^归档 \d+ 项$/}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
 expect(requests).toHaveLength(2);expect(requests[0]).toEqual(requests[1]);
});

test('blocked draft storage leaves inputs usable and reports the failure',async({alice})=>{
 const page=await alice.newPage();await page.goto(board);await page.evaluate(()=>{Storage.prototype.setItem=()=>{throw new Error('quota');};});
 await page.getByRole('button',{name:'新建卡片',exact:true}).click();await page.getByLabel(optIn,{exact:true}).check();
 await expect(page.getByRole('alert')).toContainText('本地草稿无法保存');
 await page.getByLabel('共享标题',{exact:true}).fill('storage failure keeps input');await page.getByRole('button',{name:'创建卡片',exact:true}).click();
 await expect(page.getByRole('dialog')).toHaveCount(0);
});
