import { test,expect,board,jira,mm,login,inspect,fault } from './fixtures';
import type { Page } from '@playwright/test';
import { seedCard } from './shared-helpers';
async function create(page:Page,title:string,jiraKey:string,posts:string[]=[]){
 await page.getByRole('button',{name:'新建卡片',exact:true}).click();await page.getByLabel('共享标题').fill(title);await page.getByRole('button',{name:'添加 Jira 票据'}).click();await page.getByLabel('Jira 编号或链接').fill(jiraKey);
 for(let i=0;i<posts.length;i++){await page.getByRole('button',{name:'添加消息关联'}).click();await page.getByLabel('消息链接 '+(i+1),{exact:true}).fill(mm+'/demo/pl/'+posts[i]);}
 await page.getByRole('button',{name:'创建卡片',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
}
test('personal previews are deduplicated, safe, and separate from shared title and notes',async({alice,bob})=>{
 const control=await login(alice,jira,'alice');await login(alice,mm,'alice');await login(bob,jira,'bob');await login(bob,mm,'bob');
 const before=(await inspect(control)).requests.filter(request=>request.path.includes('/issue/DEMO-1')).length;
 const page=await alice.newPage();let untrustedRequests=0;page.on('request',request=>{if(request.url().includes('untrusted.localhost'))untrustedRequests++;});await page.goto(board);await expect(page.getByTestId('preview-connection')).toHaveText('个人预览已连接');
 await create(page,'预览验收一','DEMO-1',['a'.repeat(26),'x'.repeat(26),'l'.repeat(26)]);
 const card=page.locator('article').filter({has:page.getByRole('button',{name:'打开卡片：预览验收一',exact:true})});
 await expect(card.getByText('验证个人预览与共享工作记录',{exact:true})).toBeVisible();
 await create(page,'重复关联','DEMO-1');
 expect((await inspect(control)).requests.filter(request=>request.path.includes('/issue/DEMO-1')).length-before).toBe(9);
 await card.getByRole('button',{name:'打开卡片：预览验收一',exact:true}).click();
 await expect(page.getByRole('dialog').getByText('ALICE_ONLY_MARKER：最新的受限模拟评论',{exact:true})).toBeVisible();
 await expect(page.getByLabel('共享标题')).toHaveValue('预览验收一');await expect(page.getByLabel('共享笔记')).toHaveValue('');
 await expect(page.getByRole('dialog').locator('.safe-markdown strong').filter({hasText:'模拟消息'})).toBeVisible();
 await expect(page.getByRole('dialog').locator('.safe-markdown strong').filter({hasText:'保留安全格式'})).toBeVisible();
 expect(await page.evaluate(()=>Reflect.get(window,'__xss'))).toBeUndefined();
 await expect(page.getByRole('dialog').locator('.safe-markdown img, .safe-markdown script, .safe-markdown [onerror], .safe-markdown a[href^="javascript:"]')).toHaveCount(0);
 await expect(page.getByRole('dialog').getByText('内容已截断，请打开原文查看。')).toBeVisible();
 await expect(page.getByRole('dialog').getByTestId('preview-time').first()).toContainText('最后成功');
 expect(untrustedRequests).toBe(0);await page.getByRole('dialog').locator('.personal-detail').scrollIntoViewIfNeeded();await page.screenshot({path:'.tmp/preview-dialog.png'});
 const other=await bob.newPage();await other.goto(board);await other.getByRole('button',{name:'打开卡片：预览验收一',exact:true}).click();
 await expect(other.getByRole('dialog').getByText('第 53 条模拟评论',{exact:true})).toBeVisible();await expect(other.getByText(/ALICE_ONLY_MARKER/)).toHaveCount(0);
 const stable=(await inspect(control)).requests.length;await new Promise(resolve=>setTimeout(resolve,500));expect((await inspect(control)).requests.length).toBe(stable);
});
test('temporary failure marks old content, login loss clears it, and refresh respects rate limits',async({alice})=>{
 const control=await login(alice,jira,'alice');const page=await alice.newPage();await page.goto(board);
 await create(page,'故障刷新卡片','DEMO-3');const card=page.locator('article').filter({has:page.getByRole('button',{name:'打开卡片：故障刷新卡片',exact:true})});
 await expect(card.getByText('没有评论和担当者的模拟票据',{exact:true})).toBeVisible();
 await fault(control,'connection');await card.getByRole('button',{name:'刷新个人预览'}).click();await expect(card.getByText('旧内容',{exact:true})).toBeVisible();await expect(card.getByText('没有评论和担当者的模拟票据',{exact:true})).toBeVisible();
 await fault(control,'unauthorized');await card.getByRole('button',{name:'刷新个人预览'}).click();await expect(card.getByText('需要登录原系统')).toBeVisible();await expect(card.getByText('没有评论和担当者的模拟票据',{exact:true})).toHaveCount(0);
 await fault(control,'rate-limit');await card.getByRole('button',{name:'刷新个人预览'}).click();await expect(card.getByText(/请求受限/)).toBeVisible();await expect(card.getByRole('button',{name:'刷新个人预览'})).toBeDisabled();
 const count=(await inspect(control)).requests.length;await new Promise(resolve=>setTimeout(resolve,500));expect((await inspect(control)).requests.length).toBe(count);
 await expect(card.getByRole('button',{name:'刷新个人预览'})).toBeEnabled({timeout:4000});expect((await inspect(control)).requests.length).toBe(count);
});
test('changing and unbinding a slow association never displays its old personal response',async({alice})=>{
 const control=await login(alice,jira,'alice');await seedCard(alice,'切换关联验收','DEMO-2');
 const status=await control.evaluate(async()=>{const response=await fetch('fault',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({fault:'delay',delay_ms:700,page_size:7})});return response.status;});expect(status).toBe(200);
 const page=await alice.newPage();await page.goto(board);await expect.poll(async()=>(await inspect(control)).requests.filter(request=>request.path.includes('/issue/DEMO-2')).length).toBeGreaterThan(0);
 await page.getByRole('button',{name:'打开卡片：切换关联验收',exact:true}).click();await page.getByLabel('共享笔记').fill('切换保留笔记');await page.getByLabel('Jira 编号或链接').fill('DEMO-3');await page.getByRole('button',{name:'保存修改',exact:true}).click();
 const card=page.locator('article').filter({has:page.getByRole('button',{name:'打开卡片：切换关联验收',exact:true})});await expect(card.getByText('没有评论和担当者的模拟票据',{exact:true})).toBeVisible();await expect(card.getByText(/ALICE_ONLY_MARKER/)).toHaveCount(0);
 await card.getByRole('button',{name:'打开卡片：切换关联验收',exact:true}).click();await expect(page.getByLabel('共享笔记')).toHaveValue('切换保留笔记');await page.getByRole('button',{name:'移除 Jira 票据 1 及其消息关联'}).click();await page.getByRole('button',{name:'保存修改',exact:true}).click();
 await expect(card.locator('.preview')).toHaveCount(0);await new Promise(resolve=>setTimeout(resolve,800));await expect(card.locator('.preview')).toHaveCount(0);
});
test('page and StrictMode cleanup leave one connection, clear private content, preserve drafts, and stop paging',async({alice})=>{
 const control=await login(alice,jira,'alice');await login(alice,mm,'alice');
 await seedCard(alice,'生命周期验收','DEMO-1',[{url:mm+'/demo/pl/'+'a'.repeat(26),description:''}]);
 const worker=alice.serviceWorkers()[0]??await alice.waitForEvent('serviceworker');
 await worker.evaluate(()=>{const state={active:0,hellos:0};Object.assign(globalThis,{__boardPorts:state});chrome.runtime.onConnect.addListener(port=>{state.active++;port.onMessage.addListener((value:unknown)=>{if(value&&typeof value==='object'&&Reflect.get(value,'op')==='hello')state.hellos++;});port.onDisconnect.addListener(()=>state.active--);});});
 const page=await alice.newPage();let writes=0;page.on('request',request=>{if(request.url().startsWith(board+'/api/')&&request.method()!=='GET')writes++;});
 await page.addInitScript(()=>{
  const state={messages:0,adds:0,removes:0,sse:0,sseAdds:0,sseCloses:0,blobs:0};Object.assign(window,{__lifecycle:state});
  const listeners=new Set<EventListenerOrEventListenerObject>();const add=window.addEventListener.bind(window),remove=window.removeEventListener.bind(window);
  window.addEventListener=((name:string,listener:EventListenerOrEventListenerObject,options?:boolean|AddEventListenerOptions)=>{if(name==='message'){listeners.add(listener);state.adds++;state.messages=listeners.size;}add(name,listener,options);}) as typeof window.addEventListener;
  window.removeEventListener=((name:string,listener:EventListenerOrEventListenerObject,options?:boolean|EventListenerOptions)=>{if(name==='message'){listeners.delete(listener);state.removes++;state.messages=listeners.size;}remove(name,listener,options);}) as typeof window.removeEventListener;
  const Original=window.EventSource;window.EventSource=class extends Original{private done=false;constructor(url:string|URL,options?:EventSourceInit){super(url,options);state.sse++;state.sseAdds++;}override close(){if(!this.done){this.done=true;state.sse--;state.sseCloses++;}super.close();}};
  const urls=new Set<string>();const make=URL.createObjectURL.bind(URL),revoke=URL.revokeObjectURL.bind(URL);
  URL.createObjectURL=(blob:Blob|MediaSource)=>{const url=make(blob);urls.add(url);state.blobs=urls.size;return url;};URL.revokeObjectURL=(url:string)=>{urls.delete(url);state.blobs=urls.size;revoke(url);};
 });
 await page.goto(board);await expect(page.getByTestId('preview-connection')).toHaveText('个人预览已连接');
 await page.getByRole('button',{name:'打开卡片：生命周期验收',exact:true}).click();await expect(page.getByRole('dialog').getByText('ALICE_ONLY_MARKER：最新的受限模拟评论',{exact:true})).toBeVisible();
 await expect(page.getByRole('dialog').locator('.safe-markdown strong').filter({hasText:'模拟消息'})).toBeVisible();
 await page.getByLabel('共享笔记').fill('生命周期草稿');
 const setups=process.env.WORKLOG_TEST_MODE==='lifecycle-test'?2:1;
 expect(await page.evaluate(()=>Reflect.get(window,'__lifecycle'))).toMatchObject({messages:1,adds:setups,removes:setups-1,sse:1,sseAdds:setups,sseCloses:setups-1});
 expect(await page.evaluate(()=>Reflect.get(window,'__lifecycle').blobs)).toBeGreaterThan(0);
 expect(await worker.evaluate(()=>Reflect.get(globalThis,'__boardPorts'))).toEqual({active:1,hellos:setups});
 const before=(await inspect(control)).requests.length;
 // Explicit lifecycle-event test; real history/BFCache is covered separately in T12.
 await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true})));
 await expect(page.getByText(/ALICE_ONLY_MARKER/)).toHaveCount(0);await expect(page.getByLabel('共享笔记')).toHaveValue('生命周期草稿');
 expect(await page.evaluate(()=>Reflect.get(window,'__lifecycle'))).toMatchObject({messages:0,sse:0,blobs:0});
 await expect.poll(()=>worker.evaluate(()=>Reflect.get(globalThis,'__boardPorts').active)).toBe(0);
 await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));
 await expect(page.getByRole('dialog').getByText('ALICE_ONLY_MARKER：最新的受限模拟评论',{exact:true})).toBeVisible();await expect(page.getByLabel('共享笔记')).toHaveValue('生命周期草稿');
 expect((await inspect(control)).requests.length).toBeGreaterThan(before);expect(writes).toBe(0);
 await page.getByRole('button',{name:'关闭详情'}).click();await page.getByRole('button',{name:'放弃修改并关闭'}).click();
 const status=await control.evaluate(async()=>{const response=await fetch('fault',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({fault:'delay',delay_ms:300,page_size:1})});return response.status;});expect(status).toBe(200);
 const starting=(await inspect(control)).requests.length;await page.getByRole('button',{name:'刷新全部预览'}).click();await expect.poll(async()=>(await inspect(control)).requests.length).toBeGreaterThan(starting+1);
 await page.close();const stopped=(await inspect(control)).requests.length;await new Promise(resolve=>setTimeout(resolve,800));expect((await inspect(control)).requests.length).toBe(stopped);
 await expect.poll(()=>worker.evaluate(()=>Reflect.get(globalThis,'__boardPorts').active)).toBe(0);
});
