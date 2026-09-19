import {createServer} from 'node:http';
import type {BrowserContext,Page} from '@playwright/test';
import {test,expect,board,jira,mm,login,inspect} from './fixtures';
import {seedCard} from './shared-helpers';
import {SETTINGS_KEY} from '../../src/contracts/extension-settings';

async function openSettings(context:BrowserContext){
 const worker=context.serviceWorkers()[0]??await context.waitForEvent('serviceworker');
 const page=await context.newPage();await page.goto(new URL('options.html',worker.url()).href);
 await expect(page.getByRole('button',{name:'保存设置',exact:true})).toBeEnabled();return {page,worker};
}
async function save(page:Page){await page.getByRole('button',{name:'保存设置',exact:true}).click();await expect(page.getByRole('status')).toHaveText('已保存。请刷新看板以应用新地址。');}

test('settings preserve defaults, validate input, survive reload and keep profiles separate',async({alice,bob})=>{
 const {page,worker}=await openSettings(alice);
 await expect(page.getByLabel('看板地址',{exact:true})).toHaveValue(board);await expect(page.getByLabel('Jira 地址',{exact:true})).toHaveValue(jira);
 await page.getByLabel('看板地址',{exact:true}).fill(board+'/bad');await page.getByRole('button',{name:'保存设置',exact:true}).click();await expect(page.getByRole('status')).toContainText('请检查地址');
 expect(await worker.evaluate(()=>chrome.storage.local.get(null))).toEqual({});
 await page.getByLabel('看板地址',{exact:true}).fill(board);await page.getByLabel('Jira 地址',{exact:true}).fill(jira+'/changed');await page.getByLabel('Jira 地址',{exact:true}).press('Enter');await expect(page.getByRole('status')).toHaveText('已保存。请刷新看板以应用新地址。');
 expect(await worker.evaluate(()=>chrome.storage.local.get(null))).toEqual({[SETTINGS_KEY]:{boardOrigin:board,jiraBaseUrl:jira+'/changed',mattermostBaseUrl:mm}});
 await page.reload();await expect(page.getByLabel('Jira 地址',{exact:true})).toHaveValue(jira+'/changed');
 const second=await openSettings(bob);await expect(second.page.getByLabel('Jira 地址',{exact:true})).toHaveValue(jira);
 const cdp=await alice.newCDPSession(page);const versions=new Map<string,{versionId:string;scriptURL:string;runningStatus:string}>();
 cdp.on('ServiceWorker.workerVersionUpdated',event=>{for(const version of event.versions)versions.set(version.versionId,version);});await cdp.send('ServiceWorker.enable');
 await expect.poll(()=>[...versions.values()].some(value=>value.scriptURL===worker.url()&&value.runningStatus==='running')).toBe(true);
 const version=[...versions.values()].find(value=>value.scriptURL===worker.url()&&value.runningStatus==='running')!;
 await cdp.send('ServiceWorker.stopWorker',{versionId:version.versionId});await expect.poll(()=>versions.get(version.versionId)?.runningStatus).toBe('stopped');
 await page.reload();await expect(page.getByLabel('Jira 地址',{exact:true})).toHaveValue(jira+'/changed');await cdp.detach();
 await page.getByRole('button',{name:'恢复部署默认'}).click();await expect(page.getByRole('status')).toContainText('已恢复部署默认');expect(await page.evaluate(()=>chrome.storage.local.get(null))).toEqual({});
});

test('changing settings clears previews and preserves drafts; mismatch makes no source requests',async({alice})=>{
 const control=await login(alice,jira,'alice');await seedCard(alice,'扩展设置草稿','DEMO-2');
 const boardPage=await alice.newPage();await boardPage.goto(board);await boardPage.getByRole('button',{name:'打开卡片：扩展设置草稿',exact:true}).click();
 await expect(boardPage.getByRole('dialog').getByText(/ALICE_ONLY_MARKER/).first()).toBeVisible();await boardPage.getByLabel('共享笔记').fill('切换设置仍保留');
 const {page,worker}=await openSettings(alice);await page.getByLabel('Jira 地址',{exact:true}).fill(jira+'/changed');await save(page);
 await expect(boardPage.getByText(/ALICE_ONLY_MARKER/)).toHaveCount(0);await expect(boardPage.getByLabel('共享笔记')).toHaveValue('切换设置仍保留');
 const count=(await inspect(control)).requests.length;
 const probe=await alice.newPage();await probe.goto(board+'/probe/');await expect(probe.getByRole('status')).toHaveText('扩展地址与看板不一致，请检查扩展设置');await expect(probe.getByRole('button',{name:'读取 Jira',exact:true})).toBeDisabled();
 expect((await inspect(control)).requests.length).toBe(count);
 const storage=await worker.evaluate(async()=>({local:await chrome.storage.local.get(null),sync:await chrome.storage.sync.get(null),session:await chrome.storage.session.get(null)}));
 expect(storage).toEqual({local:{[SETTINGS_KEY]:{boardOrigin:board,jiraBaseUrl:jira+'/changed',mattermostBaseUrl:mm}},sync:{},session:{}});
 await page.getByRole('button',{name:'恢复部署默认'}).click();await expect(page.getByRole('status')).toContainText('已恢复部署默认');
 await probe.getByRole('button',{name:'重新连接',exact:true}).click();await expect(probe.getByRole('status')).toHaveText('已连接');await probe.getByRole('button',{name:'读取 Jira',exact:true}).click();await expect(probe.getByTestId('result')).toContainText('jira');
 await expect(boardPage.getByLabel('共享笔记')).toHaveValue('切换设置仍保留');
});

test('denied access keeps configuration and localized settings remain usable on narrow screens',async({alice})=>{
 const {page,worker}=await openSettings(alice);
 await page.evaluate(()=>{chrome.permissions.request=async()=>false;});
 await page.getByLabel('Jira 地址',{exact:true}).fill('https://other.example.invalid/jira');await page.getByRole('button',{name:'保存设置',exact:true}).click();await expect(page.getByRole('status')).toHaveText('未获得站点权限，原设置保持不变。');
 expect(await worker.evaluate(()=>chrome.storage.local.get(null))).toEqual({});
 await page.setViewportSize({width:375,height:900});
 for(const [locale,heading] of [['en-US','Extension connection settings'],['ja-JP','拡張機能の接続設定'],['zh-CN','扩展连接设置']] as const){
  await page.evaluate(value=>{Object.defineProperty(navigator,'languages',{value:[value],configurable:true});dispatchEvent(new Event('languagechange'));},locale);
  await expect(page.getByRole('heading',{name:heading})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:'.tmp/extension-settings-'+locale+'.png',fullPage:true});
 }
});

test('an unchanged extension connects to configured board port and source paths, enforcing handshake before reads',async({alice})=>{
 const sites={boardOrigin:'http://board.localhost:4192',jiraBaseUrl:'http://jira.localhost:4192/another/jira',mattermostBaseUrl:'http://mattermost.localhost:4192/another/chat'};
 const paths:string[]=[];
 const server=createServer((req,res)=>{
  if(req.url==='/favicon.ico'){res.statusCode=204;res.end();return;}
  if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Configured board</title><h1>Configured board</h1>');return;}
  paths.push(req.url!);res.setHeader('Content-Type','application/json');
  if(req.url?.startsWith('/another/jira/rest/api/2/issue/DEMO-1/comment'))res.end(JSON.stringify({startAt:0,maxResults:50,total:0,comments:[]}));
  else if(req.url?.startsWith('/another/jira/rest/api/2/issue/DEMO-1?'))res.end(JSON.stringify({key:'DEMO-1',fields:{summary:'Configured Jira',status:{name:'Open'},assignee:null}}));
  else if(req.url==='/another/chat/api/v4/posts/'+'a'.repeat(26))res.end(JSON.stringify({id:'a'.repeat(26),message:'Configured Mattermost',create_at:1700000000000}));
  else {res.statusCode=404;res.end('{}');}
 });
 await new Promise<void>(resolve=>server.listen(4192,'0.0.0.0',resolve));
 try{
  const {page,worker}=await openSettings(alice);for(const [field,value] of Object.entries(sites))await page.locator('#'+field).fill(value);await save(page);
  expect(await worker.evaluate(()=>chrome.scripting.getRegisteredContentScripts())).toMatchObject([{id:'worklog-board',matches:['http://board.localhost/*']}]);
  const target=await alice.newPage();await target.goto(sites.boardOrigin);
  const call=(payload:unknown)=>target.evaluate(data=>new Promise<any>(resolve=>{const listener=(event:MessageEvent)=>{if(event.data?.channel==='worklog:reply'&&event.data.payload.id===(data as {id:string}).id){removeEventListener('message',listener);resolve(event.data.payload);}};addEventListener('message',listener);postMessage({channel:'worklog:request',payload:data},location.origin);}),payload);
  expect(await call({version:1,id:'before',op:'jira.preview',key:'DEMO-1'})).toMatchObject({error:{code:'configuration_mismatch'}});expect(paths).toEqual([]);
  expect(await call({version:1,id:'hello',op:'hello',sites})).toMatchObject({ok:true,data:{connected:true}});
  expect(await call({version:1,id:'jira',op:'jira.preview',key:'DEMO-1'})).toMatchObject({ok:true,data:{summary:'Configured Jira',url:sites.jiraBaseUrl+'/browse/DEMO-1'}});
  expect(await call({version:1,id:'chat',op:'mattermost.preview',postId:'a'.repeat(26),team:'demo'})).toMatchObject({ok:true,data:{text:'Configured Mattermost',url:sites.mattermostBaseUrl+'/demo/pl/'+'a'.repeat(26)}});
  expect(paths).toHaveLength(3);
 }finally{await new Promise<void>((resolve,reject)=>{server.close(error=>error?reject(error):resolve());server.closeAllConnections();});}
});

test('a new host cannot be saved until the real optional permission request is approved',async({alice})=>{
 const {page,worker}=await openSettings(alice);
 const sites={boardOrigin:'http://127.0.0.1:4192',jiraBaseUrl:jira,mattermostBaseUrl:mm};
 expect(await page.evaluate(sites=>chrome.runtime.sendMessage({op:'settings.save',sites}),sites)).toMatchObject({ok:false,error:'permission'});
 await page.getByLabel('看板地址',{exact:true}).fill(sites.boardOrigin);await page.getByRole('button',{name:'保存设置',exact:true}).click();
 // The native Chrome permission prompt cannot be accepted via page automation.
 // Until that real request resolves, no config/registration may change. Approval/revocation is a manual case.
 await expect(page.getByRole('button',{name:'保存设置',exact:true})).toBeDisabled();
 expect(await worker.evaluate(()=>chrome.permissions.contains({origins:['http://127.0.0.1/*']}))).toBe(false);
 expect(await worker.evaluate(()=>chrome.permissions.contains({origins:['https://unrelated.example.invalid/*']}))).toBe(false);
 expect(await worker.evaluate(()=>chrome.storage.local.get(null))).toEqual({});
 expect(await worker.evaluate(()=>chrome.scripting.getRegisteredContentScripts())).toMatchObject([{matches:['http://board.localhost/*']}]);
});

test('a browser-managed optional grant enables a new board host and real revocation stops access',async({alice})=>{
 const control=await login(alice,jira,'alice');const {page,worker}=await openSettings(alice);
 const sites={boardOrigin:'http://127.0.0.1:4192',jiraBaseUrl:jira,mattermostBaseUrl:mm};
 const manager=await alice.newPage();await manager.goto('chrome://extensions/');
 // Test-profile preparation via Chrome's own management API; this does not exercise accepting the native prompt.
 await manager.evaluate(async id=>{await (chrome as unknown as {developerPrivate:{addHostPermission:(id:string,host:string)=>Promise<void>}}).developerPrivate.addHostPermission(id,'http://127.0.0.1/*');},new URL(worker.url()).host);
 const server=createServer((_req,res)=>{res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Configured board</title>Configured board');});
 await new Promise<void>(resolve=>server.listen(4192,'0.0.0.0',resolve));
 try{
  await page.getByLabel('看板地址',{exact:true}).fill(sites.boardOrigin);await save(page);
  expect(await worker.evaluate(()=>chrome.permissions.contains({origins:['http://127.0.0.1/*']}))).toBe(true);
  const target=await alice.newPage();await target.goto(sites.boardOrigin);
  const reply=await target.evaluate(sites=>new Promise<any>(resolve=>{const listener=(event:MessageEvent)=>{if(event.data?.channel!=='worklog:reply')return;const payload=event.data.payload;if(payload.id==='hello'&&payload.ok)postMessage({channel:'worklog:request',payload:{version:1,id:'read',op:'jira.preview',key:'DEMO-1'}},location.origin);if(payload.id==='read'){removeEventListener('message',listener);resolve(payload);}};addEventListener('message',listener);postMessage({channel:'worklog:request',payload:{version:1,id:'hello',op:'hello',sites}},location.origin);}),sites);
  expect(reply).toMatchObject({ok:true,data:{kind:'jira',key:'DEMO-1'}});const count=(await inspect(control)).requests.length;expect(count).toBeGreaterThan(0);
  expect(await worker.evaluate(()=>chrome.permissions.remove({origins:['http://127.0.0.1/*']}))).toBe(true);
  await page.reload();await expect(page.locator('#access')).toContainText('需要站点权限');await expect.poll(()=>worker.evaluate(()=>chrome.scripting.getRegisteredContentScripts())).toEqual([]);
  await target.evaluate(()=>postMessage({channel:'worklog:request',payload:{version:1,id:'after-revoke',op:'jira.preview',key:'DEMO-2'}},location.origin));
  expect((await inspect(control)).requests.length).toBe(count);
 }finally{await new Promise<void>((resolve,reject)=>{server.close(error=>error?reject(error):resolve());server.closeAllConnections();});}
});
