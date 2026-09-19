import type { Page } from '@playwright/test';
import type { PreviewReply } from '../../src/contracts/preview-messages';
import { test, expect, board, jira, mm, login, fault, inspect } from './fixtures';

async function read(page:Page,kind:'Jira'|'Mattermost'):Promise<PreviewReply> {
  const button=page.getByRole('button',{name:'读取 '+kind,exact:true});
  await button.click();await expect(button).toBeEnabled();
  if(await page.locator('details').getAttribute('open')===null)await page.getByText('查看本次合成响应',{exact:true}).click();
  return JSON.parse(await page.getByTestId('result').innerText()) as PreviewReply;
}
test('actual extension reads all visible Jira 9.7 comment pages for each identity',async({alice,bob})=>{
  const ac=await login(alice,jira,'alice'),bc=await login(bob,jira,'bob');
  const start=(await inspect(ac)).requests.length;
  for(const [context,excerpt] of [[alice,'ALICE_ONLY_MARKER：最新的受限模拟评论'],[bob,'第 53 条模拟评论']] as const){
    const page=await context.newPage();await page.goto(board+'/probe/');await expect(page.getByRole('status')).toHaveText('已连接');
    const result=await read(page,'Jira');
    expect(result.ok).toBe(true);
    if(result.ok && 'kind' in result.data && result.data.kind==='jira'){
      expect(result.data.comment?.excerpt).toBe(excerpt);expect(result.data.assignee).toBe('模拟担当者');
    }else throw new Error('Expected Jira preview');
    await page.getByLabel('Jira 票据').fill('DEMO-3');
    const empty=await read(page,'Jira');
    expect(empty).toMatchObject({ok:true,data:{kind:'jira',assignee:null,comment:null}});
  }
  const requests=(await inspect(bc)).requests.slice(start);
  expect(requests.filter(r=>r.path.endsWith('/DEMO-1/comment'))).toHaveLength(16);
  expect(requests.every(r=>r.method==='GET'&&/^\/jira\/rest\/api\/2\/issue\/DEMO-[13](\/comment)?$/.test(r.path))).toBe(true);
});

test('actual responses distinguish incomplete pagination, HTML, login and rate limit',async({alice})=>{
  const control=await login(alice,jira,'alice');
  const page=await alice.newPage();await page.goto(board+'/probe/');await expect(page.getByRole('status')).toHaveText('已连接');
  for(const [mode,code] of [['pagination-stall','protocol'],['html','protocol'],['login-html','login_required'],['malformed','protocol'],['forbidden','unavailable'],['rate-limit','rate_limited']] as const){
    await fault(control,mode);const result=await read(page,'Jira');
    expect(result).toMatchObject({ok:false,error:{code}});
    if(mode==='rate-limit')expect(result).toMatchObject({error:{retryAfterMs:2000}});
  }
});

test('Mattermost reads only a post and its metadata; failures degrade locally',async({alice,bob})=>{
  const control=await login(alice,mm,'alice');await login(bob,mm,'bob');
  const page=await alice.newPage();await page.goto(board+'/probe/');await expect(page.getByRole('status')).toHaveText('已连接');
  const start=(await inspect(control)).requests.length;
  expect(await read(page,'Mattermost')).toMatchObject({ok:true,data:{kind:'mattermost',author:'模拟作者',channel:'模拟团队',avatar:{mime:'image/png'}}});
  for(const [mode,expected] of [['missing-user',{author:'未知用户'}],['missing-channel',{channel:null}],['avatar-failure',{author:'模拟作者'}]] as const){
    await fault(control,mode);const result=await read(page,'Mattermost');expect(result).toMatchObject({ok:true,data:expected});
    if(mode==='avatar-failure' && result.ok)expect(result.data).not.toHaveProperty('avatar');
  }
  const bp=await bob.newPage();await bp.goto(board+'/probe/');await expect(bp.getByRole('status')).toHaveText('已连接');
  await bp.getByLabel('消息标识').fill('b'.repeat(26));expect(await read(bp,'Mattermost')).toMatchObject({ok:false,error:{code:'unavailable'}});
  const requests=(await inspect(control)).requests.slice(start);
  expect(requests.every(r=>r.method==='GET'&&/^\/api\/v4\/(posts\/[ab]{26}|users\/u{26}(\/image)?|channels\/c{26})$/.test(r.path))).toBe(true);
});
