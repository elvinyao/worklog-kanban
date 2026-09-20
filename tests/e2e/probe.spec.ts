import { chromium } from '@playwright/test';
import { test, expect, board, jira, login, inspect } from './fixtures';

test('probe presents readable results, timestamp, reconnect and simulated environment',async({alice})=>{
  await login(alice,jira,'alice');
  const page=await alice.newPage();await page.goto(board+'/probe/');
  await expect(page.getByRole('status')).toHaveText('已连接');
  await expect(page.getByRole('button',{name:'重新连接',exact:true})).toBeEnabled();
  await page.getByLabel('Jira 票据').fill('DEMO-3');await page.getByRole('button',{name:'读取 Jira',exact:true}).click();
  await expect(page.getByRole('heading',{name:'没有评论和担当者的模拟票据'})).toBeVisible();
  await expect(page.getByTestId('last-success')).toContainText('最后成功');
  await expect(page.getByText('暂无评论',{exact:true})).toBeVisible();
  await page.screenshot({path:'.tmp/probe.png',fullPage:true});
});

test('missing extension is explicit and reconnect is available',async()=>{
  const browser=await chromium.launch();
  try{
    const page=await browser.newPage({locale:'zh-CN'});await page.goto(board+'/probe/');
    await expect(page.getByRole('status')).toHaveText('扩展不可用',{timeout:6000});
    await expect(page.getByRole('button',{name:'重新连接',exact:true})).toBeEnabled();
    await expect(page.getByRole('button',{name:'读取 Jira',exact:true})).toBeDisabled();
  }finally{await browser.close();}
});

test('page lifecycle removes listeners and aborts paging; StrictMode is exercised separately',async({alice})=>{
  const control=await login(alice,jira,'alice');
  const worker=alice.serviceWorkers()[0] ?? await alice.waitForEvent('serviceworker');
  await worker.evaluate(()=>{
    const state={active:0,hellos:0};Object.assign(globalThis,{__probeTransport:state});
    chrome.runtime.onConnect.addListener(port=>{state.active++;port.onMessage.addListener((value:unknown)=>{if(value&&typeof value==='object'&&Reflect.get(value,'op')==='hello')state.hellos++;});port.onDisconnect.addListener(()=>state.active--);});
  });
  const page=await alice.newPage();
  await page.addInitScript(()=>{
    const add=window.addEventListener.bind(window),remove=window.removeEventListener.bind(window);
    const active=new Set<EventListenerOrEventListenerObject>();const state={adds:0,removes:0,active:0};
    Object.assign(window,{__probeListeners:state});
    window.addEventListener=((name:string,listener:EventListenerOrEventListenerObject,options?:boolean|AddEventListenerOptions)=>{if(name==='message'){active.add(listener);state.adds++;state.active=active.size;}add(name,listener,options);}) as typeof window.addEventListener;
    window.removeEventListener=((name:string,listener:EventListenerOrEventListenerObject,options?:boolean|EventListenerOptions)=>{if(name==='message'){active.delete(listener);state.removes++;state.active=active.size;}remove(name,listener,options);}) as typeof window.removeEventListener;
  });
  await page.goto(board+'/probe/');await expect(page.getByRole('status')).toHaveText('已连接');
  expect(await page.evaluate(()=>Reflect.get(window,'__probeListeners').active)).toBe(1);
  const setups=process.env.WORKLOG_TEST_MODE==='lifecycle-test'?2:1;
  expect(await page.evaluate(()=>Reflect.get(window,'__probeListeners').adds)).toBe(setups);
  expect(await page.evaluate(()=>Reflect.get(window,'__probeListeners').removes)).toBe(setups-1);
  expect(await worker.evaluate(()=>Reflect.get(globalThis,'__probeTransport').hellos)).toBe(setups);
  expect(await worker.evaluate(()=>Reflect.get(globalThis,'__probeTransport').active)).toBe(1);
  for(let round=0;round<2;round++){
    const hellos=await worker.evaluate(()=>Reflect.get(globalThis,'__probeTransport').hellos);
    await page.getByRole('button',{name:'重新连接',exact:true}).click();
    await expect.poll(()=>worker.evaluate(()=>Reflect.get(globalThis,'__probeTransport').hellos)).toBe(hellos+1);
    await expect(page.getByRole('status')).toHaveText('已连接');
    expect(await page.evaluate(()=>Reflect.get(window,'__probeListeners').active)).toBe(1);
    expect(await worker.evaluate(()=>Reflect.get(globalThis,'__probeTransport').active)).toBe(1);
  }
  // Slow real pages make cancellation observable without fabricating responses.
  const faultStatus=await control.evaluate(async()=>{const response=await fetch('fault',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({fault:'delay',delay_ms:500,page_size:1})});return response.status;});
  expect(faultStatus).toBe(200);
  const before=(await inspect(control)).requests.length;
  await page.getByRole('button',{name:'读取 Jira',exact:true}).click();
  await expect.poll(async()=>(await inspect(control)).requests.length).toBeGreaterThanOrEqual(before+2);
  expect((await inspect(control)).requests.length).toBeLessThan(before+55);
  await expect(page.getByRole('button',{name:'读取 Jira',exact:true})).toBeDisabled();
  await page.close();
  await expect.poll(async()=>worker.evaluate(()=>Reflect.get(globalThis,'__probeTransport').active)).toBe(0);
  // Sample after disconnect: a page may legitimately begin during the pre-close assertions.
  const closing=(await inspect(control)).requests.length;
  expect(closing).toBeLessThan(before+55);
  // Wait longer than two dummy response periods; further pages must not begin.
  await new Promise(resolve=>setTimeout(resolve,1100));
  expect((await inspect(control)).requests.length).toBe(closing);
});
