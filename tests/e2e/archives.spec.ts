import {test,expect,board,chooseLanguage,mm,jira,login,inspect,enablePreviews} from './fixtures';
import {seedCard,sharedRead,sharedWrite,interactionColumns} from './shared-helpers';
import type {Page,BrowserContext} from '@playwright/test';
import {draftFrom,payloadFrom} from '../../src/web/state/drafts';

async function setup(context:BrowserContext,prefix:string){
 const {ids}=await interactionColumns(context,prefix);let snapshot=await sharedRead(context);
 await sharedWrite(context,'/columns/'+ids[2],{isDone:true,expectedBoardRevision:snapshot.revision},'PATCH');
 const active=await seedCard(context,prefix+' active',null,[],ids[0]);
 const done=await seedCard(context,prefix+' done','DEMO-1',[{url:mm+'/demo/pl/'+'a'.repeat(26),description:'归档中的共享消息说明'}],ids[2]);
 return {ids,active,done};
}
async function chooseTasks(page:Page,titles:string[]){
 const dialog=page.getByRole('dialog');for(const checkbox of await dialog.getByRole('checkbox').all())await checkbox.uncheck();
 for(const title of titles)await dialog.getByRole('checkbox',{name:'选择任务：'+title,exact:true}).check();
}
async function archiveApi(context:BrowserContext,id:string,name:string){
 const snapshot=await sharedRead(context);const response=await context.request.post('http://127.0.0.1:4173/api/archives',{headers:{Host:'board.localhost:4173',Origin:board,'X-Worklog-Request':'1'},data:{requestId:crypto.randomUUID(),expectedBoardRevision:snapshot.revision,cardIds:[id],name}});expect(response.ok()).toBe(true);return await response.json() as {archiveId:string};
}

test('archive list, readonly history, rename, restore and three languages work',async({page})=>{
 const {ids,active,done}=await setup(page.context(),'归档流程');await page.goto(board);
 await page.getByRole('button',{name:'归档已完成任务',exact:true}).click();await chooseTasks(page,[done.title]);
 await page.getByLabel('归档名称',{exact:true}).fill('本周完成');await page.getByLabel('归档说明（选填）').fill('迭代交付记录');
 await page.getByRole('button',{name:'归档 1 项',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
 const current=await sharedRead(page.context());expect(current.cards.some(c=>c.id===active.id)).toBe(true);expect(current.cards.some(c=>c.id===done.id)).toBe(false);
 await page.getByRole('link',{name:'查看归档',exact:true}).click();await expect(page.locator('.archive-toolbar').getByText(/只读归档/)).toBeVisible();
 await expect(page.getByRole('button',{name:'新建卡片',exact:true})).toHaveCount(0);await expect(page.locator('article[draggable="true"]')).toHaveCount(0);
 const beforeReadonly=await sharedRead(page.context());const cardButton=page.getByRole('button',{name:'打开卡片：'+done.title,exact:true});await cardButton.focus();await page.keyboard.press('Alt+ArrowLeft');expect((await sharedRead(page.context())).revision).toBe(beforeReadonly.revision);
 await cardButton.click();await expect(page.getByRole('dialog').getByRole('textbox',{name:'共享标题'})).toHaveCount(0);await expect(page.getByRole('button',{name:'保存修改',exact:true})).toHaveCount(0);await expect(page.getByRole('dialog').getByText('归档中的共享消息说明',{exact:true})).toBeVisible();await page.getByRole('button',{name:'关闭归档详情',exact:true}).click();
 await page.getByRole('button',{name:'恢复任务',exact:true}).click();await expect(page.getByRole('button',{name:'恢复 0 项到 Current',exact:true})).toBeDisabled();
 await chooseTasks(page,[done.title]);await page.getByLabel('恢复到列').selectOption(ids[0]!);await page.getByRole('button',{name:'恢复 1 项到 Current',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
 await page.getByRole('button',{name:'恢复任务',exact:true}).click();await expect(page.getByRole('checkbox',{name:'选择任务：'+done.title,exact:true})).toBeDisabled();await page.getByRole('button',{name:'取消',exact:true}).click();
 await page.getByRole('link',{name:'归档列表'}).click();await page.getByRole('searchbox',{name:'搜索归档'}).fill('本周完成');
 const row=page.locator('.archive-row').filter({hasText:'本周完成'});await expect(row).toHaveCount(1);await row.getByRole('button',{name:'重命名',exact:true}).click();await page.getByLabel('归档名称',{exact:true}).fill('本周交付');await page.getByRole('button',{name:'保存归档名称',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
 await page.getByRole('searchbox',{name:'搜索归档'}).fill('本周交付');await expect(page.locator('.archive-row')).toHaveCount(1);await page.screenshot({path:'.tmp/archives-list.png'});
 await page.getByRole('link',{name:'本周交付',exact:true}).click();await page.goBack();await expect(page.getByRole('searchbox',{name:'搜索归档'})).toHaveValue('本周交付');
 await chooseLanguage(page,'en');await expect(page.getByRole('searchbox',{name:'Search archives'})).toBeVisible();await chooseLanguage(page,'ja');await expect(page.getByRole('searchbox',{name:'アーカイブを検索'})).toBeVisible();
 await page.setViewportSize({width:360,height:800});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:'.tmp/archives-mobile.png'});
 const restored=(await sharedRead(page.context())).cards.find(c=>c.title===done.title)!;expect(restored.id).not.toBe(done.id);expect(restored.columnId).toBe(ids[0]);
});

test('remote archival preserves an open dirty draft and blocks stale saves',async({page})=>{
 const {done}=await setup(page.context(),'远程归档');await page.goto(board);await page.getByRole('button',{name:'打开卡片：'+done.title,exact:true}).click();await page.getByLabel('共享笔记').fill('不能丢失的草稿');
 const result=await archiveApi(page.context(),done.id,'远程历史');await expect(page.getByRole('dialog')).toBeVisible();await expect(page.getByText('此任务已归档，本地草稿已保留。')).toBeVisible();
 await expect(page.getByLabel('共享笔记')).toHaveValue('不能丢失的草稿');await expect(page.getByRole('button',{name:'保存修改',exact:true})).toBeDisabled();
 await expect(page.getByRole('link',{name:'查看归档',exact:true})).toHaveAttribute('href','#/archives/'+result.archiveId);
 await page.getByRole('button',{name:'复制草稿',exact:true}).click();await expect(page.getByLabel('草稿副本')).toHaveValue(/不能丢失的草稿/);
 await page.getByRole('button',{name:'关闭详情',exact:true}).click();await page.getByRole('button',{name:'放弃修改并关闭',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('default archive input stays protected and retries keep their identity after a lost response and 429',async({page})=>{
 await setup(page.context(),'重试归档');const before=await sharedRead(page.context());await page.goto(board);
 await page.getByRole('link',{name:/Archives/}).click();await page.getByRole('link',{name:'Current',exact:true}).click();
 await page.getByRole('button',{name:'归档已完成任务',exact:true}).click();
 const originalName=await page.getByLabel('归档名称',{exact:true}).inputValue();
 expect(await page.evaluate(()=>!window.dispatchEvent(new Event('beforeunload',{cancelable:true})))).toBe(false);
 const requests:unknown[]=[];
 await page.route('**/api/archives',async route=>{
  if(route.request().method()!=='POST')return route.continue();requests.push(route.request().postDataJSON());
  if(requests.length===1){const response=await route.fetch({url:'http://127.0.0.1:4173/api/archives',headers:{...route.request().headers(),Host:'board.localhost:4173'}});expect(response.ok()).toBe(true);await route.abort('failed');}
  else if(requests.length===2)await route.fulfill({status:429,contentType:'application/json',body:JSON.stringify({code:'rate_limited'})});
  else await route.continue();
 });
 const submit=page.getByRole('button',{name:/^归档 \d+ 项$/});
 await submit.click();await expect(page.getByRole('dialog').getByRole('alert')).toBeVisible();await expect(page.getByLabel('归档名称',{exact:true})).toHaveValue(originalName);
 expect(await page.evaluate(()=>!window.dispatchEvent(new Event('beforeunload',{cancelable:true})))).toBe(true);
 const closing=page.waitForEvent('dialog');const escape=page.keyboard.press('Escape');const closePrompt=await closing;expect(closePrompt.message()).toBe('有未保存的修改。');await closePrompt.dismiss();await escape;
 await expect(page.getByRole('dialog')).toBeVisible();
 const leaving=page.waitForEvent('dialog');const back=page.goBack();const navigationPrompt=await leaving;expect(navigationPrompt.message()).toBe('有未保存的修改。');await navigationPrompt.dismiss();await back;
 await expect(page).toHaveURL(board+'/');await expect(page.getByRole('dialog')).toBeVisible();
 await submit.click();await expect(page.getByRole('dialog').getByRole('alert')).toContainText('暂时无法保存或读取');await expect(submit).toBeEnabled();await expect(page.getByLabel('归档名称',{exact:true})).toBeDisabled();
 await submit.click();await expect(page.getByRole('dialog')).toHaveCount(0);expect(requests).toHaveLength(3);expect(requests[0]).toEqual(requests[1]);expect(requests[1]).toEqual(requests[2]);
 expect((await sharedRead(page.context())).archiveCount).toBe(before.archiveCount+1);
});

test('remote edit then archive keeps the last visible card and declining navigation retains a draft',async({page})=>{
 const {done}=await setup(page.context(),'最后版本');await page.goto(board);await page.getByRole('button',{name:'打开卡片：'+done.title,exact:true}).click();
 await sharedWrite(page.context(),'/cards/'+done.id,{...payloadFrom(draftFrom(done)),notes:'归档前的新版本',expectedVersion:done.version},'PATCH');
 await expect(page.getByLabel('共享笔记')).toHaveValue('归档前的新版本');await archiveApi(page.context(),done.id,'最新内容');await expect(page.getByText('此任务已归档，本地草稿已保留。')).toBeVisible();await expect(page.getByLabel('共享笔记')).toHaveValue('归档前的新版本');
 await page.getByLabel('共享笔记').fill('继续保留的草稿');page.once('dialog',dialog=>dialog.dismiss());await page.getByRole('link',{name:'查看归档',exact:true}).click();await expect(page.getByLabel('共享笔记')).toHaveValue('继续保留的草稿');await expect(page).toHaveURL(board+'/');
});

test('changed board requires review and completion columns can be configured',async({page})=>{
 const {done,ids}=await setup(page.context(),'重新核对');await page.goto(board);await page.getByRole('button',{name:'归档已完成任务',exact:true}).click();await chooseTasks(page,[done.title]);
 await seedCard(page.context(),'远端新增',null,[],ids[0]);await expect(page.getByRole('button',{name:'重新核对任务',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'归档 1 项',exact:true})).toBeDisabled();
 await page.getByRole('button',{name:'重新核对任务',exact:true}).click();await expect(page.getByRole('button',{name:'归档 1 项',exact:true})).toBeEnabled();page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'取消',exact:true}).click();
 await page.getByRole('button',{name:'管理列',exact:true}).click();const checkbox=page.getByRole('checkbox',{name:'将重新核对2设为完成列',exact:true});await expect(checkbox).toBeChecked();await checkbox.click();await expect(checkbox).not.toBeChecked();await expect.poll(async()=>(await sharedRead(page.context())).columns.find(c=>c.id===ids[2])!.isDone).toBe(false);
});

test('archives load previews only for the visible history and the list reads no sources',async({alice})=>{
 const jc=await login(alice,jira,'alice'),mc=await login(alice,mm,'alice');const {done}=await setup(alice,'归档预览隔离');const result=await archiveApi(alice,done.id,'隔离历史');await seedCard(alice,'Current 隐藏来源','DEMO-2');
 const beforeJ=(await inspect(jc)).requests.length,beforeM=(await inspect(mc)).requests.length;
 const page=await alice.newPage();await page.goto(board+'/#/archives/'+result.archiveId);await expect(page.getByRole('button',{name:'打开卡片：'+done.title,exact:true})).toBeVisible();expect((await inspect(jc)).requests.length).toBe(beforeJ);
 await enablePreviews(page);await expect(page.locator('main .safe-markdown')).toContainText('模拟消息');expect((await inspect(jc)).requests.slice(beforeJ).some(r=>r.path.includes('DEMO-2'))).toBe(false);expect((await inspect(mc)).requests.length).toBeGreaterThan(beforeM);
 await page.getByRole('link',{name:'归档列表'}).click();await expect(page.getByRole('searchbox')).toBeVisible();await expect(page.locator('.preview')).toHaveCount(0);await expect(page.locator('img.avatar')).toHaveCount(0);
 const listJ=(await inspect(jc)).requests.length,listM=(await inspect(mc)).requests.length;await page.getByRole('button',{name:'重新同步',exact:true}).click();await expect(page.locator('.archive-row').filter({hasText:'隔离历史'})).toBeVisible();expect((await inspect(jc)).requests.length).toBe(listJ);expect((await inspect(mc)).requests.length).toBe(listM);
});

test('restore retries its original request after losing the response and a rejected replay',async({page})=>{
 const {done}=await setup(page.context(),'恢复重试');const archive=await archiveApi(page.context(),done.id,'恢复响应丢失');await page.goto(board+'/#/archives/'+archive.archiveId);
 await page.getByRole('button',{name:'恢复任务',exact:true}).click();await chooseTasks(page,[done.title]);const requests:unknown[]=[];
 await page.route('**/api/archives/*/restore',async route=>{
  requests.push(route.request().postDataJSON());
  if(requests.length===1){const response=await route.fetch({url:route.request().url().replace('board.localhost','127.0.0.1'),headers:{...route.request().headers(),Host:'board.localhost:4173'}});expect(response.ok()).toBe(true);await route.abort('failed');}
  else if(requests.length===2)await route.fulfill({status:429,contentType:'application/json',body:JSON.stringify({code:'rate_limited'})});
  else await route.continue();
 });
 const submit=page.getByRole('button',{name:'恢复 1 项到 Current',exact:true});
 await submit.click();await expect(page.getByRole('dialog').getByRole('alert')).toBeVisible();
 await submit.click();await expect(page.getByRole('dialog').getByRole('alert')).toContainText('暂时无法保存或读取');await expect(submit).toBeEnabled();await expect(page.getByLabel('恢复到列')).toBeDisabled();
 await submit.click();await expect(page.getByRole('dialog')).toHaveCount(0);expect(requests).toHaveLength(3);expect(requests[0]).toEqual(requests[1]);expect(requests[1]).toEqual(requests[2]);expect((await sharedRead(page.context())).cards.filter(card=>card.title===done.title)).toHaveLength(1);
});

test('rename still reviews a version conflict after its successful response is lost',async({page})=>{
 const snapshot=await sharedRead(page.context());const done=snapshot.columns.find(column=>column.isDone)!;
 const card=await seedCard(page.context(),'重命名结果确认任务',null,[],done.id);const archive=await archiveApi(page.context(),card.id,'重命名结果确认');
 await page.goto(board+'/#/archives');await page.getByRole('searchbox',{name:'搜索归档'}).fill('重命名结果确认');
 await page.locator('.archive-row').filter({hasText:'重命名结果确认'}).getByRole('button',{name:'重命名',exact:true}).click();
 await page.getByLabel('归档名称',{exact:true}).fill('重命名结果确认 updated');
 const versions:number[]=[];
 await page.route('**/api/archives/'+archive.archiveId,async route=>{
  if(route.request().method()!=='PATCH')return route.continue();versions.push(route.request().postDataJSON().expectedMetadataVersion);
  if(versions.length===1){const response=await route.fetch({url:route.request().url().replace('board.localhost','127.0.0.1'),headers:{...route.request().headers(),Host:'board.localhost:4173'}});expect(response.ok()).toBe(true);await route.abort('failed');}
  else await route.continue();
 });
 const submit=page.getByRole('button',{name:'保存归档名称',exact:true});
 await submit.click();await expect(page.getByRole('dialog').getByRole('alert')).toBeVisible();
 await submit.click();await expect(page.getByRole('dialog').getByRole('alert')).toContainText('共享内容已更新');
 await expect(page.getByLabel('归档名称',{exact:true})).toBeEnabled();await expect(submit).toBeDisabled();
 await page.getByRole('dialog').getByRole('button',{name:'重新同步',exact:true}).click();await expect(submit).toBeEnabled();
 await submit.click();await expect(page.getByRole('dialog')).toHaveCount(0);expect(versions).toEqual([1,1,2]);
});

test('archive pagination and scroll survive opening a history and going back',async({page})=>{
 const {ids}=await setup(page.context(),'翻页');for(let index=0;index<22;index++){const card=await seedCard(page.context(),'翻页任务'+index,null,[],ids[2]);await archiveApi(page.context(),card.id,'分页专用 '+index);}
 await page.goto(board+'/#/archives');await page.getByRole('searchbox',{name:'搜索归档'}).fill('分页专用');await expect(page.locator('.archive-row')).toHaveCount(20);await page.getByRole('button',{name:'加载更多',exact:true}).click();await expect(page.locator('.archive-row')).toHaveCount(22);
 const last=page.locator('.archive-row').last().locator('.archive-name');await last.scrollIntoViewIfNeeded();const scroll=await page.evaluate(()=>window.scrollY);expect(scroll).toBeGreaterThan(0);await last.click();await expect(page.getByRole('button',{name:'恢复任务',exact:true})).toBeEnabled();await page.goBack();await expect(page.locator('.archive-row')).toHaveCount(22);await expect(page.getByRole('searchbox',{name:'搜索归档'})).toHaveValue('分页专用');await expect.poll(()=>page.evaluate(()=>window.scrollY)).toBe(scroll);
});
