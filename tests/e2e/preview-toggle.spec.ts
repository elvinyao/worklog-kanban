import {test,expect,board,jira,mm,login,inspect} from './fixtures';
import {seedCard,sharedRead} from './shared-helpers';

test('home previews default off, detail loads only its card, toggle persists and releases avatars',async({alice})=>{
 const jc=await login(alice,jira,'alice'),mc=await login(alice,mm,'alice');
 await seedCard(alice,'按需预览','DEMO-1',[{url:mm+'/demo/pl/'+'a'.repeat(26),description:''}]);
 await seedCard(alice,'保持隐藏','DEMO-2');
 const beforeJ=(await inspect(jc)).requests.length,beforeM=(await inspect(mc)).requests.length;
 const page=await alice.newPage();await page.goto(board);
 const toggle=page.getByRole('switch',{name:'卡片预览',exact:true});
 await expect(toggle).toHaveAttribute('aria-checked','false');await expect(page.locator('.card-jira-group')).toHaveCount(0);
 await expect(page.getByRole('button',{name:'打开卡片：按需预览',exact:true})).toBeVisible();
 expect((await inspect(jc)).requests.length).toBe(beforeJ);expect((await inspect(mc)).requests.length).toBe(beforeM);
 await page.getByRole('button',{name:'打开卡片：按需预览',exact:true}).click();
 await expect(page.getByRole('dialog').locator('.safe-markdown')).toContainText('模拟消息');
 expect((await inspect(jc)).requests.slice(beforeJ).some(r=>r.path.includes('DEMO-2'))).toBe(false);
 await page.getByRole('button',{name:'关闭详情'}).click();await expect(page.locator('.preview')).toHaveCount(0);
 await toggle.click();await expect(toggle).toHaveAttribute('aria-checked','true');await expect(page.locator('main .safe-markdown').first()).toBeVisible();
 await page.reload();await expect(toggle).toHaveAttribute('aria-checked','true');
 await toggle.click();await expect(page.locator('.preview')).toHaveCount(0);await expect(page.locator('img.avatar')).toHaveCount(0);
 await page.reload();await expect(toggle).toHaveAttribute('aria-checked','false');
});

test('detail preview controls keep an unsaved draft without writing shared data',async({alice})=>{
 await login(alice,jira,'alice');const card=await seedCard(alice,'预览按钮保留草稿','DEMO-1');
 const page=await alice.newPage();await page.goto(board);await page.getByRole('button',{name:'打开卡片：'+card.title,exact:true}).click();
 await page.getByLabel('共享笔记').fill('尚未保存的内容');const baseline=await sharedRead(alice);
 const controls=page.getByRole('dialog').locator('.preview-toolbar button');
 for(let index=0;index<2;index++){await expect(controls.nth(index)).toBeEnabled();await controls.nth(index).click();await expect(page.getByRole('dialog')).toBeVisible();await expect(page.getByLabel('共享笔记')).toHaveValue('尚未保存的内容');expect((await sharedRead(alice)).revision).toBe(baseline.revision);}
});
