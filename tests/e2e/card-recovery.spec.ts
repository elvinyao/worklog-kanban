import {test,expect,board} from './fixtures';

test('a lost create response keeps its request identity through a rejected retry',async({alice})=>{
 const page=await alice.newPage();await page.goto(board);
 const payloads:unknown[]=[];
 await page.route('**/api/cards',async route=>{
  if(route.request().method()!=='POST'){await route.continue();return;}
  payloads.push(route.request().postDataJSON());
  if(payloads.length===1){
   const response=await route.fetch({url:route.request().url().replace('board.localhost','127.0.0.1'),headers:{...route.request().headers(),Host:'board.localhost:4173'}});
   expect(response.ok()).toBe(true);await route.abort('failed');
  }else if(payloads.length===2){
   await route.fulfill({status:429,contentType:'application/json',body:JSON.stringify({code:'rate_limited'})});
  }else await route.continue();
 });
 const title='lost-response-'+Date.now();
 await page.getByRole('button',{name:'新建卡片',exact:true}).click();
 await page.getByLabel('共享标题',{exact:true}).fill(title);
 await page.getByRole('button',{name:'创建卡片',exact:true}).click();
 const retry=page.getByRole('button',{name:'重试并确认创建结果',exact:true});
 await expect(retry).toBeEnabled();
 await expect(page.getByLabel('共享标题',{exact:true})).toBeDisabled();
 await retry.click();
 await expect(page.getByRole('alert')).toContainText('暂时无法保存或读取');
 await expect(retry).toBeEnabled();
 await expect(page.getByLabel('共享标题',{exact:true})).toBeDisabled();
 expect(payloads).toHaveLength(2);
 await retry.click();await expect(page.getByRole('dialog')).toHaveCount(0);
 await expect(page.getByRole('button',{name:'打开卡片：'+title,exact:true})).toHaveCount(1);
 expect(payloads).toHaveLength(3);expect(payloads[0]).toEqual(payloads[1]);expect(payloads[1]).toEqual(payloads[2]);
 expect((payloads[0] as {requestId:string}).requestId).toBeTruthy();
});

test('a stalled creation times out, preserves its input, and can be retried',async({alice})=>{
 const page=await alice.newPage();await page.clock.install();await page.goto(board);
 let stall=true;
 await page.route('**/api/cards',async route=>{
  if(route.request().method()==='POST'&&stall){stall=false;return;}
  await route.continue();
 });
 const title='timeout-'+Date.now();
 await page.getByRole('button',{name:'新建卡片',exact:true}).click();
 await page.getByLabel('共享标题',{exact:true}).fill(title);
 const requested=page.waitForRequest(request=>request.url().endsWith('/api/cards')&&request.method()==='POST');
 await page.getByRole('button',{name:'创建卡片',exact:true}).click();await requested;
 await page.clock.fastForward(16000);
 await expect(page.getByRole('alert')).toContainText('请求超时');
 await expect(page.getByLabel('共享标题',{exact:true})).toHaveValue(title);
 await expect(page.getByRole('button',{name:'关闭详情',exact:true})).toBeEnabled();
 await page.getByRole('button',{name:'重试并确认创建结果',exact:true}).click();
 await expect(page.getByRole('dialog')).toHaveCount(0);
 await expect(page.getByRole('button',{name:'打开卡片：'+title,exact:true})).toHaveCount(1);
});
