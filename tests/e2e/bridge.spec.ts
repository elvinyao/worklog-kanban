import { createServer } from 'node:http';
import { test, expect, board, jira, mm, login, fault, inspect } from './fixtures';

test('real extension uses independent browser sessions and host-only cookies',async({alice,bob})=>{
  await login(alice,jira,'alice'); await login(alice,mm,'alice'); await login(bob,jira,'bob'); await login(bob,mm,'bob');
  const a = await alice.newPage(); const b = await bob.newPage();
  for (const page of [a,b]) { await page.goto(board+'/probe/'); await expect(page.getByRole('status')).toHaveText('已连接'); await page.getByLabel('Jira 票据').fill('DEMO-2'); await page.getByRole('button',{name:'读取 Jira',exact:true}).click(); }
  await expect(a.getByTestId('result')).toContainText('ALICE_ONLY_MARKER');
  await expect(b.getByTestId('result')).toContainText('unavailable');
  await a.getByRole('button',{name:'读取 Mattermost',exact:true}).click();
  await expect(a.getByTestId('result')).toContainText('mattermost');
  for (const context of [alice,bob]) {
    const cookies = await context.cookies();
    expect(cookies.map(c=>({name:c.name,domain:c.domain,httpOnly:c.httpOnly})).sort((a,b)=>a.name.localeCompare(b.name))).toEqual([
      {name:'worklog_dummy_jira',domain:'jira.localhost',httpOnly:true},
      {name:'worklog_dummy_mattermost',domain:'mattermost.localhost',httpOnly:true},
    ]);
    expect(await context.cookies(board)).toEqual([]);
  }
});

test('redirect targets are never contacted',async({alice})=>{
  let hits=0;
  const sentinel = createServer((_req,res)=>{hits++;res.end('sentinel');});
  await new Promise<void>(resolve=>sentinel.listen(4190,'0.0.0.0',resolve));
  try {
    const control=await login(alice,jira,'alice'); await fault(control,'redirect');
    const page=await alice.newPage(); await page.goto(board+'/probe/'); await expect(page.getByRole('status')).toHaveText('已连接');
    await page.getByRole('button',{name:'读取 Jira',exact:true}).click(); await expect(page.getByTestId('result')).toContainText('network');
    expect(hits).toBe(0);
  } finally { await new Promise<void>((resolve,reject)=>sentinel.close(error=>error?reject(error):resolve())); }
});

test('invalid page messages never become external requests',async({alice})=>{
  const control=await login(alice,jira,'alice');
  const page=await alice.newPage(); await page.goto(board+'/probe/'); await expect(page.getByRole('status')).toHaveText('已连接');
  const before=(await inspect(control)).requests.length;
  await page.evaluate(()=>{
    for(const payload of [{version:1,id:'bad_1',op:'fetch',url:'http://jira.localhost:4180/jira/rest/api/2/issue/DEMO-1'},{version:1,id:'bad_2',op:'jira.preview',key:'DEMO-1',method:'POST'}]) window.postMessage({channel:'worklog:request',payload},location.origin);
  });
  // A valid ordered handshake proves the prior message tasks were processed.
  await page.evaluate(()=>new Promise<void>(resolve=>{const listener=(e:MessageEvent)=>{if(e.data?.channel==='worklog:reply'&&e.data.payload?.id==='barrier'){removeEventListener('message',listener);resolve();}};addEventListener('message',listener);postMessage({channel:'worklog:request',payload:{version:1,id:'barrier',op:'hello'}},location.origin);}));
  expect((await inspect(control)).requests.length).toBe(before);
});

test('duplicate IDs run once and closing the page aborts its actual fetch',async({alice})=>{
  const control=await login(alice,jira,'alice'); await fault(control,'delay');
  const worker=alice.serviceWorkers()[0] ?? await alice.waitForEvent('serviceworker');
  await worker.evaluate(()=>{
    const original = globalThis.fetch;
    const state = {aborts:0};
    Object.assign(globalThis,{__transportTest:state});
    globalThis.fetch = (input,init) => { init?.signal?.addEventListener('abort',()=>state.aborts++,{once:true}); return original(input,init); };
  });
  const page=await alice.newPage(); await page.goto(board+'/probe/'); await expect(page.getByRole('status')).toHaveText('已连接');
  const before=(await inspect(control)).requests.length;
  await page.evaluate(()=>{
    const payload={version:1,id:'same-request',op:'jira.preview',key:'DEMO-1'};
    postMessage({channel:'worklog:request',payload},location.origin);postMessage({channel:'worklog:request',payload},location.origin);
  });
  await expect.poll(async()=>(await inspect(control)).requests.length).toBe(before+1);
  await page.close();
  await expect.poll(async()=>worker.evaluate(()=>Reflect.get(globalThis,'__transportTest').aborts)).toBe(1);
  expect((await inspect(control)).requests.length).toBe(before+1);
});
