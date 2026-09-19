import { test,expect } from '@playwright/test';
import { board } from './fixtures';
import { interactionColumns,seedCard,sharedRead,sharedWrite } from './shared-helpers';
test('keyboard navigation, empty columns, boundaries, movement, editing, and close focus work in the browser',async({context,page})=>{
 const {ids,snapshot}=await interactionColumns(context,'键盘列');const first=await seedCard(context,'键盘甲',null,[],ids[0]);const second=await seedCard(context,'键盘乙',null,[],ids[0]);const adjacent=await seedCard(context,'键盘丙',null,[],ids[1]);
 await page.goto(board+'/probe/');await page.goto(board);const a=page.getByRole('button',{name:'打开卡片：键盘甲',exact:true}),b=page.getByRole('button',{name:'打开卡片：键盘乙',exact:true}),c=page.getByRole('button',{name:'打开卡片：键盘丙',exact:true});
 await a.focus();await page.keyboard.press('ArrowUp');await expect(a).toBeFocused();await page.keyboard.press('ArrowLeft');await expect(a).toBeFocused();await page.keyboard.press('ArrowDown');await expect(b).toBeFocused();await page.keyboard.press('ArrowDown');await expect(b).toBeFocused();await page.keyboard.press('ArrowRight');await expect(c).toBeFocused();
 await page.keyboard.press('ArrowRight');await expect(page.locator('[data-column-id="'+ids[2]+'"]')).toBeFocused();await page.keyboard.press('ArrowLeft');await expect(c).toBeFocused();
 await page.keyboard.press('Alt+ArrowLeft');await expect(page.locator('[data-column-id="'+ids[0]+'"]').getByRole('button',{name:'打开卡片：键盘丙',exact:true})).toBeFocused();expect(page.url()).toBe(board+'/');
 await expect(page.getByRole('main',{name:'工作看板'})).toHaveAttribute('aria-busy','false');const current=await sharedRead(context);expect(current.cards.filter(card=>card.columnId===ids[0]).map(card=>card.id)).toEqual([first.id,second.id,adjacent.id]);
 await page.keyboard.press('Enter');await expect(page.getByRole('dialog')).toBeVisible();await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);await expect(c).toBeFocused();
 await page.keyboard.press('Enter');const notes=page.getByLabel('共享笔记');await notes.fill('输入中的笔记');await notes.press('ArrowLeft');await notes.press('Enter');await notes.press('Alt+ArrowRight');await expect(page.getByRole('dialog')).toBeVisible();expect((await sharedRead(context)).cards.find(card=>card.id===adjacent.id)!.columnId).toBe(ids[0]);
 await notes.dispatchEvent('keydown',{key:'Escape',code:'Escape',isComposing:true,keyCode:229,bubbles:true,cancelable:true});await expect(page.getByRole('dialog')).toBeVisible();
 await page.keyboard.press('Escape');await expect(page.getByText('有未保存的修改。')).toBeVisible();await page.getByRole('button',{name:'继续编辑'}).click();await expect(notes).toHaveValue('输入中的笔\n记');await page.keyboard.press('Escape');await page.getByRole('button',{name:'放弃修改并关闭'}).click();await expect(c).toBeFocused();
 const before=await sharedRead(context);await c.dispatchEvent('keydown',{key:'ArrowRight',altKey:true,isComposing:true,keyCode:229,bubbles:true,cancelable:true});expect((await sharedRead(context)).revision).toBe(before.revision);
 const last=page.locator('[data-column-id="'+snapshot.columns.at(-1)!.id+'"]');await last.focus();await page.keyboard.press('ArrowRight');await expect(last).toBeFocused();
});
test('native drag and drop supports crossing columns and reordering',async({context,page})=>{
 const {ids}=await interactionColumns(context,'拖拽列');const first=await seedCard(context,'拖拽甲',null,[],ids[0]);const second=await seedCard(context,'拖拽乙',null,[],ids[1]);await page.goto(board);
 const a=page.locator('[data-card-id="'+first.id+'"]'),b=page.locator('[data-card-id="'+second.id+'"]');const before=(await sharedRead(context)).revision;await a.dragTo(b,{targetPosition:{x:20,y:5}});
 await expect(page.locator('[data-column-id="'+ids[1]+'"] .card-title')).toHaveText(['拖拽甲','拖拽乙']);await expect(page.getByRole('button',{name:'打开卡片：拖拽甲',exact:true})).toBeFocused();
 await expect(page.getByRole('main',{name:'工作看板'})).toHaveAttribute('aria-busy','false');expect((await sharedRead(context)).revision).toBe(before+1);await b.dragTo(a,{targetPosition:{x:20,y:5}});await expect(page.locator('[data-column-id="'+ids[1]+'"] .card-title')).toHaveText(['拖拽乙','拖拽甲']);await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.getByRole('main',{name:'工作看板'})).toHaveAttribute('aria-busy','false');await page.getByRole('button',{name:'打开卡片：拖拽乙',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();await page.keyboard.press('Escape');
 const rect=await a.boundingBox();await b.dragTo(a,{targetPosition:{x:20,y:rect!.height-5}});await expect(page.locator('[data-column-id="'+ids[1]+'"] .card-title')).toHaveText(['拖拽甲','拖拽乙']);await expect(page.getByRole('main',{name:'工作看板'})).toHaveAttribute('aria-busy','false');
 await b.dragTo(page.locator('[data-column-id="'+ids[2]+'"]'),{targetPosition:{x:30,y:100}});await expect(page.locator('[data-column-id="'+ids[2]+'"] .card-title')).toHaveText(['拖拽乙']);await expect(page.getByRole('main',{name:'工作看板'})).toHaveAttribute('aria-busy','false');
 const stable=(await sharedRead(context)).revision;await a.dragTo(page.locator('.app-header'));expect((await sharedRead(context)).revision).toBe(stable);await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.getByRole('button',{name:'打开卡片：拖拽甲',exact:true})).toBeFocused();
});
test('a conflicting move rolls back layout and focus, and remote migration preserves detail drafts',async({context,page})=>{
 const {ids}=await interactionColumns(context,'冲突列');const card=await seedCard(context,'移动冲突卡片',null,[],ids[0]);await page.goto(board);const button=page.getByRole('button',{name:'打开卡片：移动冲突卡片',exact:true});await button.focus();
 let moveRequests=0;let release:()=>void=()=>{};const gate=new Promise<void>(resolve=>{release=resolve;});await page.route('**/api/cards/*/move',async route=>{moveRequests++;await gate;await route.continue();});
 await page.keyboard.press('Alt+ArrowRight');
 try{await expect(page.locator('[data-column-id="'+ids[1]+'"]').getByRole('button',{name:'打开卡片：移动冲突卡片',exact:true})).toBeVisible();await page.keyboard.press('Alt+ArrowRight');expect(moveRequests).toBe(1);const snapshot=await sharedRead(context);await sharedWrite(context,'/columns/'+ids[0],{name:'远端改名',expectedBoardRevision:snapshot.revision},'PATCH');}finally{release();}
 await expect(page.getByRole('alert')).toContainText('已更新');await expect(page.locator('[data-column-id="'+ids[0]+'"]').getByRole('button',{name:'打开卡片：移动冲突卡片',exact:true})).toBeFocused();await expect(page.locator('[data-card-id="'+card.id+'"]')).toHaveCount(1);
 await page.unroute('**/api/cards/*/move');await page.keyboard.press('Enter');await page.getByLabel('共享笔记').fill('迁移时保留草稿');const snapshot=await sharedRead(context);await sharedWrite(context,'/columns/'+ids[0],{targetColumnId:ids[1],expectedBoardRevision:snapshot.revision},'DELETE');
 await expect(page.getByLabel('共享笔记')).toHaveValue('迁移时保留草稿');await page.keyboard.press('Escape');await page.getByRole('button',{name:'放弃修改并关闭'}).click();await expect(page.locator('[data-column-id="'+ids[1]+'"]').getByRole('button',{name:'打开卡片：移动冲突卡片',exact:true})).toBeFocused();
});
test('a remote move during a held native drag does not leave card clicks blocked',async({context,page})=>{
 const {ids}=await interactionColumns(context,'拖拽并发列');const card=await seedCard(context,'拖拽中远端移动',null,[],ids[0]);await page.goto(board);
 const source=page.locator('[data-card-id="'+card.id+'"]');await source.hover();
 await page.evaluate(()=>document.addEventListener('dragstart',()=>Reflect.set(window,'__heldDrag',true),{once:true}));
 const rect=await source.boundingBox();await page.mouse.down();await page.mouse.move(rect!.x+10,rect!.y+rect!.height/2,{steps:5});
 try{
  await expect.poll(()=>page.evaluate(()=>Reflect.get(window,'__heldDrag'))).toBe(true);
  const snapshot=await sharedRead(context);await sharedWrite(context,'/cards/'+card.id+'/move',{targetColumnId:ids[1],index:0,expectedBoardRevision:snapshot.revision});
  await expect(page.locator('[data-column-id="'+ids[1]+'"] [data-card-id="'+card.id+'"]')).toBeVisible();
  await page.mouse.move(40,40,{steps:5});
 }finally{await page.mouse.up();}
 await page.getByRole('button',{name:'打开卡片：拖拽中远端移动',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();
});
