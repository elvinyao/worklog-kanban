import {test,expect,board,jira,mm,login,inspect} from './fixtures';
import {seedCard} from './shared-helpers';

test('worker suspension keeps Jira and Mattermost visible and reconnects without rereading ready previews',async({alice})=>{
 const jiraControl=await login(alice,jira,'alice'),mmControl=await login(alice,mm,'alice');
 await seedCard(alice,'后台休眠恢复','DEMO-2',[{url:mm+'/demo/pl/'+'b'.repeat(26),description:''}]);
 const page=await alice.newPage();await page.goto(board);await page.getByRole('button',{name:'打开卡片：后台休眠恢复',exact:true}).click();
 const detail=page.getByRole('dialog');await expect(detail.locator('.jira-summary')).toContainText('ALICE_ONLY_MARKER');await expect(detail.locator('.safe-markdown')).toContainText('ALICE_ONLY_MARKER');
 await page.getByLabel('共享笔记').fill('后台休眠期间保留草稿');
 const before=[(await inspect(jiraControl)).requests.length,(await inspect(mmControl)).requests.length];
 await page.evaluate(()=>{
  Object.assign(window,{__lostPreview:false,__recovering:false});
  const observer=new MutationObserver(()=>{
   if(!document.querySelector('dialog .jira-summary')?.textContent?.includes('ALICE_ONLY_MARKER')||!document.querySelector('dialog .safe-markdown')?.textContent?.includes('ALICE_ONLY_MARKER'))Reflect.set(window,'__lostPreview',true);
   if(document.querySelector('[data-testid="preview-connection"]')?.textContent?.includes('恢复'))Reflect.set(window,'__recovering',true);
  });observer.observe(document.body,{childList:true,subtree:true,characterData:true});
 });
 const cdp=await alice.newCDPSession(page);const versions=new Map<string,{versionId:string;scriptURL:string;runningStatus:string}>();
 cdp.on('ServiceWorker.workerVersionUpdated',event=>{for(const version of event.versions)versions.set(version.versionId,version);});await cdp.send('ServiceWorker.enable');
 await expect.poll(()=>[...versions.values()].some(value=>value.scriptURL.startsWith('chrome-extension://')&&value.runningStatus==='running')).toBe(true);
 const version=[...versions.values()].find(value=>value.scriptURL.startsWith('chrome-extension://')&&value.runningStatus==='running')!;
 await cdp.send('ServiceWorker.stopWorker',{versionId:version.versionId});
 await expect.poll(()=>page.evaluate(()=>Reflect.get(window,'__recovering'))).toBe(true);
 await expect(page.getByTestId('preview-connection')).toHaveText('个人预览已连接');
 expect(await page.evaluate(()=>Reflect.get(window,'__lostPreview'))).toBe(false);
 expect([(await inspect(jiraControl)).requests.length,(await inspect(mmControl)).requests.length]).toEqual(before);
 await expect(page.getByLabel('共享笔记')).toHaveValue('后台休眠期间保留草稿');
 await detail.getByRole('region',{name:'个人 Jira 预览 DEMO-2',exact:true}).getByRole('button',{name:'刷新个人预览',exact:true}).click();
 await expect(detail.locator('.jira-summary')).toContainText('ALICE_ONLY_MARKER');expect((await inspect(jiraControl)).requests.length).toBeGreaterThan(before[0]!);await cdp.detach();
});

test('an idle open page keeps both previews for 45 seconds without source polling',async({alice})=>{
 test.setTimeout(70000);
 const jiraControl=await login(alice,jira,'alice'),mmControl=await login(alice,mm,'alice');
 await seedCard(alice,'闲置预览','DEMO-1',[{url:mm+'/demo/pl/'+'a'.repeat(26),description:''}]);
 const page=await alice.newPage();await page.goto(board);await page.getByRole('button',{name:'打开卡片：闲置预览',exact:true}).click();
 await expect(page.getByRole('dialog').locator('.jira-summary')).toBeVisible();await expect(page.locator('.safe-markdown')).toContainText('模拟消息');
 const before=[(await inspect(jiraControl)).requests.length,(await inspect(mmControl)).requests.length];
 await new Promise(resolve=>setTimeout(resolve,45000));
 await expect(page.getByRole('dialog').locator('.jira-summary')).toBeVisible();await expect(page.locator('.safe-markdown')).toContainText('模拟消息');
 expect([(await inspect(jiraControl)).requests.length,(await inspect(mmControl)).requests.length]).toEqual(before);
});
