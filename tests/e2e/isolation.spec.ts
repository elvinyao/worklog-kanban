import { readFile,readdir } from 'node:fs/promises';
import path from 'node:path';
import { test,expect,board,jira,mm,login,inspect,profiles } from './fixtures';
import { seedCard,sharedRead } from './shared-helpers';
const marker='ALICE_ONLY_MARKER';
test('private synthetic content stays out of Bob, shared responses, SQLite, events, logs and storage',async({alice,bob})=>{
 const control=await login(alice,jira,'alice');await login(alice,mm,'alice');await login(bob,jira,'bob');await login(bob,mm,'bob');
 const sharedCard=await seedCard(alice,'隔离验收卡片','DEMO-2',[{url:mm+'/demo/pl/'+'b'.repeat(26),description:'共享关联'}]);
 const worker=alice.serviceWorkers()[0]??await alice.waitForEvent('serviceworker');
 await worker.evaluate(()=>{const state:string[]=[];Object.assign(globalThis,{__cacheModes:state});const original=fetch;globalThis.fetch=(input,init)=>{state.push(init?.cache??'default');return original(input,init);};});
 const a=await alice.newPage(),b=await bob.newPage();await a.goto(board);await b.goto(board);
 await a.getByRole('button',{name:'打开卡片：隔离验收卡片',exact:true}).click();await b.getByRole('button',{name:'打开卡片：隔离验收卡片',exact:true}).click();
 for(const name of ['个人 Jira 预览 DEMO-2','个人 Mattermost 预览 '+'b'.repeat(26)]){
  await expect(a.getByRole('dialog').getByRole('region',{name,exact:true}).getByText(new RegExp(marker)).first()).toBeVisible();
  await expect(b.getByRole('dialog').getByRole('region',{name,exact:true}).getByText('无权访问或资源不可用')).toBeVisible();
 }
 await expect(a.getByRole('dialog').locator('img.avatar')).toBeVisible();expect(await b.content()).not.toContain(marker);
 expect(JSON.stringify(await sharedRead(alice))).not.toContain(marker);
 const error=await a.evaluate(async secret=>{const response=await fetch('/api/cards',{method:'POST',headers:{'Content-Type':'application/json','X-Worklog-Request':'1'},body:JSON.stringify({title:'校验负例',columnId:'missing',preview:secret,[secret]:secret})});return {status:response.status,body:await response.text()};},marker);
 expect(error.status).toBe(422);expect(error.body).not.toContain(marker);
 await a.evaluate(()=>new Promise<void>(resolve=>{const events:string[]=[];const stream=new EventSource('/api/events');Object.assign(window,{__auditEvents:events,__auditStream:stream});stream.addEventListener('revision',event=>{events.push(event.data);resolve();});}));
 await a.getByLabel('共享笔记').fill('隔离测试的共享笔记');const [saved]=await Promise.all([a.waitForResponse(response=>response.url().endsWith('/api/cards/'+sharedCard.id)&&response.request().method()==='PATCH'),a.getByRole('button',{name:'保存修改',exact:true}).click()]);expect(saved.status()).toBe(200);const savedBody=await saved.text();expect(savedBody).not.toContain(marker);const revision=(JSON.parse(savedBody) as {revision:number}).revision;
 await expect.poll(()=>a.evaluate(()=>Reflect.get(window,'__auditEvents').map((value:string)=>JSON.parse(value).revision) as number[])).toContain(revision);
 const events=await a.evaluate(()=>{Reflect.get(window,'__auditStream').close();return Reflect.get(window,'__auditEvents') as string[];});expect(events.every(value=>Object.keys(JSON.parse(value)).join(',')==='revision')).toBe(true);expect(events.join()).not.toContain(marker);
 const database=process.env.WORKLOG_TEST_DATABASE!;const databaseBytes=await readFile(database);expect(databaseBytes.subarray(0,15).toString()).toBe('SQLite format 3');const files=[databaseBytes];try{files.push(await readFile(database+'-wal'));}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
 const persisted=Buffer.concat(files);expect(persisted.includes(Buffer.from(sharedCard.id))).toBe(true);expect(persisted.includes(Buffer.from('隔离测试的共享笔记'))).toBe(true);expect(persisted.includes(Buffer.from(marker))).toBe(false);
 const log=await readFile(process.env.WORKLOG_TEST_APP_LOG!,'utf8');expect(log).toContain('operation=card.create');expect(log).not.toContain(marker);
 // A manual preference may persist only its language code, even after viewing restricted content.
 await a.getByLabel('语言 / Language / 言語').selectOption('ja');
 await a.getByLabel('语言 / Language / 言語').selectOption('zh');
 for(const page of [a,b,control])expect(await page.evaluate(async()=>({local:Object.entries(localStorage),session:Object.keys(sessionStorage),databases:await indexedDB.databases(),caches:await caches.keys()}))).toEqual({local:page===a?[['worklog.language','zh']]:[],session:[],databases:[],caches:[]});
 expect(await worker.evaluate(async()=>({databases:await indexedDB.databases(),caches:await caches.keys(),storageAPI:typeof chrome.storage}))).toEqual({databases:[],caches:[],storageAPI:'undefined'});
 const modes=await worker.evaluate(()=>Reflect.get(globalThis,'__cacheModes') as string[]);expect(modes.length).toBeGreaterThan(0);expect(modes.every(mode=>mode==='no-store')).toBe(true);
 const before=(await inspect(control)).requests.length;await a.close();const reopened=await alice.newPage();await reopened.goto(board);await reopened.getByRole('button',{name:'打开卡片：隔离验收卡片',exact:true}).click();await expect(reopened.getByRole('dialog').getByText(new RegExp(marker)).first()).toBeVisible();expect((await inspect(control)).requests.length).toBeGreaterThan(before);
 // Inspect only cache/storage directories, never Cookie/session exports. No bytes are saved as evidence.
 const root=profiles.get(alice)!;await alice.close();let scanned=0;
 async function scan(directory:string):Promise<void>{let entries;try{entries=await readdir(directory,{withFileTypes:true});}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return;throw error;}for(const entry of entries){const file=path.join(directory,entry.name);if(entry.isDirectory())await scan(file);else if(entry.isFile()){scanned++;expect((await readFile(file)).includes(Buffer.from(marker))).toBe(false);}}}
 for(const name of ['Cache','Code Cache','Local Storage','Session Storage','IndexedDB','Service Worker'])await scan(path.join(root,'Default',name));expect(scanned).toBeGreaterThan(0);
});
test('real history navigation clears private state and reads again on return',async({alice})=>{
 const control=await login(alice,jira,'alice');await seedCard(alice,'历史恢复验收','DEMO-2');const page=await alice.newPage();
 await page.addInitScript(()=>{Object.assign(window,{__restored:false});addEventListener('pageshow',event=>{Object.assign(window,{__restored:event.persisted});});});
 const cdp=await alice.newCDPSession(page);await cdp.send('Page.enable');const reasons:string[]=[];cdp.on('Page.backForwardCacheNotUsed',event=>{for(const item of event.notRestoredExplanations)reasons.push(item.reason);});
 await page.goto(board);await expect(page.locator('article').filter({has:page.getByRole('button',{name:'打开卡片：历史恢复验收',exact:true})}).getByText(new RegExp(marker))).toBeVisible();
 await page.goto(board+'/probe/');const before=(await inspect(control)).requests.filter(request=>request.path.includes('/issue/DEMO-2')).length;await page.goBack();
 await expect(page.locator('article').filter({has:page.getByRole('button',{name:'打开卡片：历史恢复验收',exact:true})}).getByText(new RegExp(marker))).toBeVisible();expect((await inspect(control)).requests.filter(request=>request.path.includes('/issue/DEMO-2')).length).toBeGreaterThan(before);
 console.log('History evidence:',JSON.stringify({persisted:await page.evaluate(()=>Reflect.get(window,'__restored')),notRestoredReasons:[...new Set(reasons)]}));
 await cdp.detach();
});
