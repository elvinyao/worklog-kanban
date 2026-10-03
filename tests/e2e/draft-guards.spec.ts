import {test,expect,type Page,type BrowserContext} from '@playwright/test';
import {board} from './fixtures';
import {seedCard,sharedRead,sharedWrite} from './shared-helpers';

const unloadProtected=(page:Page)=>page.evaluate(()=>!window.dispatchEvent(new Event('beforeunload',{cancelable:true})));

async function discardPrompt(page:Page,action:()=>Promise<unknown>,accept=false){
 const prompt=page.waitForEvent('dialog');
 const pending=action();
 const dialog=await prompt;
 expect(dialog.type()).toBe('confirm');
 expect(dialog.message()).toBe('有未保存的修改。');
 if(accept)await dialog.accept();else await dialog.dismiss();
 await pending;
}

async function archiveFixture(context:BrowserContext,name:string){
 const snapshot=await sharedRead(context);
 const column=snapshot.columns.find(item=>item.isDone)!;
 const cards=await Promise.all([
  seedCard(context,name+' task 1',null,[],column.id),
  seedCard(context,name+' task 2',null,[],column.id),
 ]);
 const current=await sharedRead(context);
 const response=await context.request.post('http://127.0.0.1:4173/api/archives',{
  headers:{Host:'board.localhost:4173',Origin:board,'X-Worklog-Request':'1'},
  data:{requestId:crypto.randomUUID(),expectedBoardRevision:current.revision,name,cardIds:cards.map(card=>card.id)},
 });
 expect(response.ok()).toBe(true);
 const result=await response.json() as {archiveId:string};
 return {...result,cards};
}

test('archive creation protects changed fields and selections but not pristine or reverted drafts',async({page,context})=>{
 const snapshot=await sharedRead(context);
 const done=snapshot.columns.find(column=>column.isDone)!;
 const card=await seedCard(context,'草稿保护待归档',null,[],done.id);
 await page.goto(board);
 const open=page.getByRole('button',{name:'归档已完成任务',exact:true});
 await open.click();
 expect(await unloadProtected(page)).toBe(false);
 await page.keyboard.press('Escape');
 await expect(page.getByRole('dialog')).toHaveCount(0);

 await open.click();
 const name=page.getByLabel('归档名称',{exact:true});
 const original=await name.inputValue();
 await name.fill('待保存名称');
 await discardPrompt(page,()=>page.getByRole('button',{name:'关闭',exact:true}).click());
 await expect(name).toHaveValue('待保存名称');
 await name.fill(original);
 const description=page.getByLabel('归档说明（选填）');
 await description.fill('不能丢失的归档说明');
 expect(await unloadProtected(page)).toBe(true);
 await discardPrompt(page,()=>page.keyboard.press('Escape'));
 await seedCard(context,'远端活动任务不清空归档草稿');
 await page.getByRole('button',{name:'重新核对任务',exact:true}).click();
 await expect(description).toHaveValue('不能丢失的归档说明');
 await description.fill('');
 const choice=page.getByRole('checkbox',{name:'选择任务：'+card.title,exact:true});
 await choice.uncheck();
 await discardPrompt(page,()=>page.getByRole('button',{name:'取消',exact:true}).click());
 await expect(choice).not.toBeChecked();
 await choice.check();
 expect(await unloadProtected(page)).toBe(false);
 await page.keyboard.press('Escape');
 await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('archive rename keeps drafts after declined back navigation and remote conflict, then clears the guard on save',async({page,context})=>{
 const archive=await archiveFixture(context,'重命名草稿保护');
 await page.goto(board);
 await page.getByRole('link',{name:/Archives/}).click();
 const row=page.locator('.archive-row').filter({hasText:'重命名草稿保护'});
 await row.getByRole('button',{name:'重命名',exact:true}).click();
 await page.keyboard.press('Escape');
 await expect(page.getByRole('dialog')).toHaveCount(0);
 await row.getByRole('button',{name:'重命名',exact:true}).click();
 const description=page.getByLabel('归档说明（选填）');
 await description.fill('本地归档说明');
 await discardPrompt(page,()=>page.goBack());
 await expect(page).toHaveURL(board+'/#/archives');
 await expect(description).toHaveValue('本地归档说明');
 expect(await unloadProtected(page)).toBe(true);
 await sharedWrite(context,'/archives/'+archive.archiveId,{name:'远端已重命名',expectedMetadataVersion:1},'PATCH');
 await page.getByRole('button',{name:'保存归档名称',exact:true}).click();
 await expect(page.getByRole('dialog').getByRole('alert')).toContainText('共享内容已更新，请比较后重试。');
 await page.getByRole('dialog').getByRole('button',{name:'重新同步',exact:true}).click();
 await expect(description).toHaveValue('本地归档说明');
 await page.getByRole('button',{name:'保存归档名称',exact:true}).click();
 await expect(page.getByRole('dialog')).toHaveCount(0);
 expect(await unloadProtected(page)).toBe(false);
 await expect(page.locator('.archive-row').filter({hasText:'重命名草稿保护'})).toContainText('本地归档说明');
});

test('column drafts survive remote changes and each successful save clears only its own pending edit',async({page,context})=>{
 const snapshot=await sharedRead(context);
 const created=await sharedWrite(context,'/columns',{name:'列草稿保护',expectedBoardRevision:snapshot.revision});
 const column=created.columns.at(-1)!;
 const index=created.columns.length;
 await page.goto(board);
 await page.getByRole('button',{name:'管理列',exact:true}).click();
 await page.keyboard.press('Escape');
 await expect(page.getByRole('dialog')).toHaveCount(0);
 await page.getByRole('button',{name:'管理列',exact:true}).click();
 const input=page.getByLabel('列名称 '+index,{exact:true});
 await input.fill('临时编辑');await input.fill('列草稿保护');
 expect(await unloadProtected(page)).toBe(false);
 const reverted=await sharedRead(context);
 await sharedWrite(context,'/columns/'+column.id,{name:'撤销编辑后远端列名',expectedBoardRevision:reverted.revision},'PATCH');
 await expect(input).toHaveValue('撤销编辑后远端列名');
 await expect(page.getByRole('button',{name:'保存列名 '+index,exact:true})).toBeDisabled();
 await input.fill('本地列名');
 await page.getByLabel('新列名称',{exact:true}).fill('另一个未保存列');
 await discardPrompt(page,()=>page.keyboard.press('Escape'));
 const current=await sharedRead(context);
 await sharedWrite(context,'/columns/'+column.id,{name:'远端列名',expectedBoardRevision:current.revision},'PATCH');
 await expect(page.getByRole('checkbox',{name:'将远端列名设为完成列',exact:true})).toBeVisible();
 await expect(input).toHaveValue('本地列名');
 await page.getByRole('button',{name:'保存列名 '+index,exact:true}).click();
 await expect(page.getByRole('checkbox',{name:'将本地列名设为完成列',exact:true})).toBeVisible();
 expect(await unloadProtected(page)).toBe(true);
 await discardPrompt(page,()=>page.getByRole('button',{name:'关闭列管理',exact:true}).click());
 await page.getByRole('button',{name:'添加列',exact:true}).click();
 await expect(page.getByLabel('新列名称',{exact:true})).toHaveValue('');
 expect(await unloadProtected(page)).toBe(false);
 await page.getByRole('button',{name:'关闭列管理',exact:true}).click();
 await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('a remotely deleted column retains its name draft until it is explicitly discarded',async({page,context})=>{
 const initial=await sharedRead(context);
 const created=await sharedWrite(context,'/columns',{name:'远端删列保护',expectedBoardRevision:initial.revision});
 const column=created.columns.at(-1)!,target=created.columns[0]!;
 await page.goto(board);await page.getByRole('button',{name:'管理列',exact:true}).click();
 await page.getByLabel('列名称 '+created.columns.length,{exact:true}).fill('需要复制的列名草稿');
 const current=await sharedRead(context);
 await sharedWrite(context,'/columns/'+column.id,{targetColumnId:target.id,expectedBoardRevision:current.revision},'DELETE');
 const draft=page.getByLabel('已删除列的名称草稿：远端删列保护',{exact:true});
 await expect(draft).toHaveValue('需要复制的列名草稿');await expect(draft).toHaveAttribute('readonly','');
 expect(await unloadProtected(page)).toBe(true);
 await discardPrompt(page,()=>page.keyboard.press('Escape'));
 await expect(draft).toHaveValue('需要复制的列名草稿');
 await expect(page.getByRole('button',{name:'保存列名 '+created.columns.length,exact:true})).toHaveCount(0);
 const revision=(await sharedRead(context)).revision;
 await page.getByRole('button',{name:'丢弃此草稿',exact:true}).click();
 await expect(draft).toHaveCount(0);expect(await unloadProtected(page)).toBe(false);
 expect((await sharedRead(context)).revision).toBe(revision);
 await page.getByRole('button',{name:'关闭列管理',exact:true}).click();
 await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('a delayed restore response cannot overwrite newer archive metadata',async({page,context})=>{
 const archive=await archiveFixture(context,'恢复响应旧名称');
 await page.goto(board+'/#/archives/'+archive.archiveId);
 await page.getByRole('button',{name:'恢复任务',exact:true}).click();
 await page.getByRole('checkbox',{name:'选择任务：'+archive.cards[0]!.title,exact:true}).check();
 let release=()=>{},committed=()=>{};
 const gate=new Promise<void>(resolve=>{release=resolve;}),written=new Promise<void>(resolve=>{committed=resolve;});
 await page.route('**/api/archives/*/restore',async route=>{
  const response=await route.fetch({url:route.request().url().replace('board.localhost','127.0.0.1'),headers:{...route.request().headers(),Host:'board.localhost:4173'}});
  expect(response.ok()).toBe(true);committed();await gate;await route.fulfill({response});
 });
 try{
  await page.getByRole('button',{name:'恢复 1 项到 Current',exact:true}).click();await written;
  await sharedWrite(context,'/archives/'+archive.archiveId,{name:'恢复期间的远端新名称',description:'更新后的归档说明',expectedMetadataVersion:1},'PATCH');
  await expect(page.locator('.archive-toolbar h2')).toHaveText('恢复期间的远端新名称');
 }finally{release();}
 await expect(page.getByRole('dialog')).toHaveCount(0);
 await expect(page.locator('.archive-toolbar h2')).toHaveText('恢复期间的远端新名称');
 await expect(page.locator('.archive-board-description')).toHaveText('更新后的归档说明');
 await page.getByRole('button',{name:'恢复任务',exact:true}).click();
 await expect(page.getByRole('checkbox',{name:'选择任务：'+archive.cards[0]!.title,exact:true})).toBeDisabled();
});

test('restore protects selections, respects declined open-current navigation and cannot close during save',async({page,context})=>{
 const archive=await archiveFixture(context,'恢复草稿保护');
 const snapshot=await sharedRead(context);
 const target=snapshot.columns.find(column=>!column.isDone)!;
 await sharedWrite(context,'/archives/'+archive.archiveId+'/restore',{
  requestId:crypto.randomUUID(),expectedBoardRevision:snapshot.revision,targetColumnId:target.id,cardIds:[archive.cards[0]!.id],
 });
 await page.goto(board+'/#/archives/'+archive.archiveId);
 await page.getByRole('button',{name:'恢复任务',exact:true}).click();
 await page.keyboard.press('Escape');
 await expect(page.getByRole('dialog')).toHaveCount(0);
 await page.getByRole('button',{name:'恢复任务',exact:true}).click();
 const choice=page.getByRole('checkbox',{name:'选择任务：'+archive.cards[1]!.title,exact:true});
 await choice.check();
 await discardPrompt(page,()=>page.getByRole('button',{name:'已在 Current ↗',exact:true}).click());
 await expect(page).toHaveURL(board+'/#/archives/'+archive.archiveId);
 await expect(choice).toBeChecked();
 let release=()=>{};
 const gate=new Promise<void>(resolve=>{release=resolve;});
 await page.route('**/api/archives/*/restore',async route=>{await gate;await route.continue();});
 try{
  await page.getByRole('button',{name:'恢复 1 项到 Current',exact:true}).click();
  await expect(page.getByRole('button',{name:'正在保存…',exact:true})).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('button',{name:'取消',exact:true})).toBeDisabled();
  expect(await unloadProtected(page)).toBe(true);
 }finally{release();}
 await expect(page.getByRole('dialog')).toHaveCount(0);
 expect(await unloadProtected(page)).toBe(false);
});
