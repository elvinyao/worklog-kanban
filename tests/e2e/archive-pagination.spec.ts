import {test,expect} from '@playwright/test';
import {board} from './fixtures';
import {seedCard,sharedRead,sharedWrite} from './shared-helpers';

test('archive pagination is incremental, ignores card edits and refreshes remote archive metadata',async({page,context})=>{
 const start=await sharedRead(context);
 const done=start.columns.find(column=>column.isDone)!;
 const prefix='分页性能';
 for(let index=0;index<42;index++){
  const card=await seedCard(context,prefix+'任务 '+index,null,[],done.id);
  const snapshot=await sharedRead(context);
  await sharedWrite(context,'/archives',{
   requestId:crypto.randomUUID(),expectedBoardRevision:snapshot.revision,cardIds:[card.id],name:prefix+' '+index,
  });
 }
 const active=await seedCard(context,'分页期间的普通卡片');
 const requests:string[]=[];
 const revisions:number[]=[];
 let release=()=>{};
 const gate=new Promise<void>(resolve=>{release=resolve;});
 let holdNext=true;
 page.on('response',async response=>{
  if(response.url().endsWith('/api/board')&&response.ok())revisions.push((await response.json()).revision as number);
 });
 await page.route('**/api/archives?*',async route=>{
  const url=new URL(route.request().url());
  if(url.searchParams.get('q')===prefix){
   requests.push(url.searchParams.get('cursor')??'first');
   if(url.searchParams.has('cursor')&&holdNext){holdNext=false;await gate;}
  }
  await route.continue();
 });
 await page.goto(board+'/#/archives');
 await expect(page.locator('.sync-status')).toContainText('已同步');
 await page.getByRole('searchbox',{name:'搜索归档'}).fill(prefix);
 await expect(page.locator('.archive-row')).toHaveCount(20);
 expect(requests).toEqual(['first']);
 await page.getByRole('button',{name:'加载更多',exact:true}).click();
 try{
  await expect.poll(()=>requests.length).toBe(2);
  let snapshot=await sharedRead(context);
  for(let index=0;index<3;index++){
   const card=snapshot.cards.find(item=>item.id===active.id)!;
   snapshot=await sharedWrite(context,'/cards/'+card.id,{notes:'普通编辑 '+index,expectedVersion:card.version},'PATCH');
  }
  await expect.poll(()=>revisions.includes(snapshot.revision)).toBe(true);
  expect(requests).toHaveLength(2);
 }finally{release();}
 await expect(page.locator('.archive-row')).toHaveCount(40);
 await page.getByRole('button',{name:'加载更多',exact:true}).click();
 await expect(page.locator('.archive-row')).toHaveCount(42);
 expect(requests).toHaveLength(3);
 expect(new Set(requests).size).toBe(3);
 const last=page.locator('.archive-row').last();
 const title=await last.locator('.archive-name').textContent();
 const href=await last.locator('.archive-name').getAttribute('href');
 await last.locator('.archive-name').scrollIntoViewIfNeeded();
 const scroll=await page.evaluate(()=>window.scrollY);
 await last.locator('.archive-name').click();
 await expect(page.getByRole('button',{name:'恢复任务',exact:true})).toBeEnabled();
 await page.goBack();
 await expect(page.locator('.archive-row')).toHaveCount(42);
 await expect.poll(()=>page.evaluate(()=>window.scrollY)).toBe(scroll);
 expect(requests).toHaveLength(3);
 const id=href!.slice('#/archives/'.length);
 await sharedWrite(context,'/archives/'+id,{name:title+' 更新',expectedMetadataVersion:1},'PATCH');
 await expect(page.getByRole('link',{name:title+' 更新',exact:true})).toBeVisible();
 await expect(page.locator('.archive-row')).toHaveCount(42);
 expect(requests).toHaveLength(6);
});
