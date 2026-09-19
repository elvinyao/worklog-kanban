import { createServer } from 'node:http';
import { test,expect,board,mm } from './fixtures';

test('shared malicious text remains plain after saving, synchronization, reopening and conflict comparison',async({alice,bob})=>{
 const title='<svg onload=window.__xss=1>共享标题</svg>';
 const notes='<script>window.__xss=2</script>\n![image](http://untrusted.localhost:4190/pixel)';
 const description='<img src=http://untrusted.localhost:4190/pixel onerror=window.__xss=3>';
 const column='<img src=http://untrusted.localhost:4190/p onerror=window.__xss=4>';
 let hits=0;const sentinel=createServer((_request,response)=>{hits++;response.end('synthetic sentinel');});await new Promise<void>(resolve=>sentinel.listen(4190,'0.0.0.0',resolve));
 try{
  const a=await alice.newPage(),b=await bob.newPage();await a.goto(board);await b.goto(board);
  await a.getByRole('button',{name:'管理列'}).click();await a.getByLabel('新列名称').fill(column);await a.getByRole('button',{name:'添加列',exact:true}).click();await expect(a.getByRole('button',{name:'迁移卡片并删除'+column,exact:true})).toBeVisible();await a.getByRole('button',{name:'关闭列管理'}).click();
  await expect(b.getByRole('heading',{name:column,exact:true})).toHaveText(column);
  await a.getByRole('button',{name:'在'+column+'新建卡片',exact:true}).click();await a.getByLabel('共享标题',{exact:true}).fill(title);await a.getByLabel('共享笔记').fill(notes);await a.getByRole('button',{name:'添加消息关联'}).click();await a.getByLabel('消息链接 1',{exact:true}).fill(mm+'/demo/pl/'+'a'.repeat(26));await a.getByLabel('消息说明 1',{exact:true}).fill(description);await a.getByRole('button',{name:'创建卡片',exact:true}).click();
  const other=b.getByRole('button',{name:'打开卡片：'+title,exact:true});await expect(other.locator('.card-title')).toHaveText(title);await expect(other.locator('.card-notes')).toHaveText(notes);await b.reload();await other.click();await expect(b.getByLabel('共享标题',{exact:true})).toHaveValue(title);await expect(b.getByLabel('共享笔记')).toHaveValue(notes);await expect(b.getByLabel('消息说明 1',{exact:true})).toHaveValue(description);
  await b.getByLabel('共享笔记').fill('本地尚未保存');await a.getByRole('button',{name:'打开卡片：'+title,exact:true}).click();await a.getByLabel('共享笔记').fill(notes+'\n远端');await a.getByRole('button',{name:'保存修改',exact:true}).click();await expect(b.getByText('共享内容已更新，本地草稿已保留。')).toBeVisible();await b.getByText('比较当前共享内容',{exact:true}).click();await expect(b.getByRole('dialog').locator('pre')).toHaveText(notes+'\n远端');await expect(b.getByRole('dialog').locator('details p').filter({hasText:description})).toBeVisible();
  for(const page of [a,b]){expect(await page.evaluate(()=>Reflect.get(window,'__xss'))).toBeUndefined();await expect(page.locator('[onerror],[onload],script:not([src]),img[src*="untrusted.localhost"]')).toHaveCount(0);}
  expect(hits).toBe(0);
  const link=b.getByRole('link',{name:'打开消息原文 1 ↗',exact:true});await expect(link).toHaveAttribute('rel','noopener noreferrer');const popup=b.waitForEvent('popup');await link.click();const original=await popup;await expect(original).toHaveURL(mm+'/demo/pl/'+'a'.repeat(26));expect(await original.evaluate(()=>window.opener)).toBeNull();await original.close();
 }finally{await new Promise<void>((resolve,reject)=>sentinel.close(error=>error?reject(error):resolve()));}
});
