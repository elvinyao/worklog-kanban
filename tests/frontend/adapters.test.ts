import { afterEach, expect, it, vi } from 'vitest';
import { validateConfig } from '../../src/contracts/config';
import sites from '../../config/dummy.json';
import { jiraPreview } from '../../src/adapters/jira';
import { mattermostPreview } from '../../src/adapters/mattermost';
import { retryAfter } from '../../src/adapters/http';
const config = validateConfig(sites);
const signal = () => new AbortController().signal;
const response=(body:unknown,status=200,headers:Record<string,string>={})=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json',...headers}});
const issue={key:'DEMO-1',fields:{summary:'合成摘要',assignee:null,status:{name:'Open'}}};
const comment=(id:string,created:string,updated:string)=>({id,body:'comment-'+id,created,updated,author:{displayName:'模拟作者'}});
afterEach(()=>vi.unstubAllGlobals());
it('reads all visible pages using actual count and chooses created, not updated',async()=>{
 const fetcher=vi.fn()
 .mockResolvedValueOnce(response(issue))
 .mockResolvedValueOnce(response({startAt:0,maxResults:1,total:2,comments:[comment('1','2026-09-18T00:00:00Z','2026-09-20T00:00:00Z')]}))
 .mockResolvedValueOnce(response({startAt:1,maxResults:1,total:2,comments:[comment('2','2026-09-19T00:00:00Z','2026-09-19T00:00:00Z')]}));
 vi.stubGlobal('fetch',fetcher);
 const result=await jiraPreview('DEMO-1',config,signal());
 expect(result.assignee).toBeNull();expect(result.comment?.excerpt).toBe('comment-2');
 expect(fetcher.mock.calls.map(c=>c[0])).toEqual([config.jiraBaseUrl+'/rest/api/2/issue/DEMO-1?fields=summary,assignee,status',config.jiraBaseUrl+'/rest/api/2/issue/DEMO-1/comment?startAt=0&maxResults=50',config.jiraBaseUrl+'/rest/api/2/issue/DEMO-1/comment?startAt=1&maxResults=50']);
 for(const call of fetcher.mock.calls) expect(call[1]).toMatchObject({method:'GET',credentials:'include',cache:'no-store',redirect:'error'});
});
it('does not report success for stalled, incomplete or failed pagination',async()=>{
 for(const page of [{startAt:0,maxResults:1,total:2,comments:[]},{startAt:1,maxResults:1,total:2,comments:[]},{startAt:0,maxResults:1,total:2,comments:[{id:'1',body:'bad'}]}]){
   vi.stubGlobal('fetch',vi.fn().mockResolvedValueOnce(response(issue)).mockResolvedValueOnce(response(page)));
   await expect(jiraPreview('DEMO-1',config,signal())).rejects.toMatchObject({code:'protocol'});
 }
 vi.stubGlobal('fetch',vi.fn().mockResolvedValueOnce(response(issue)).mockResolvedValueOnce(response({startAt:0,maxResults:1,total:2,comments:[comment('1','2026-09-18T00:00:00Z','2026-09-18T00:00:00Z')]})).mockResolvedValueOnce(response({},503)));
 await expect(jiraPreview('DEMO-1',config,signal())).rejects.toMatchObject({code:'network'});
});
it('distinguishes authentication, permissions, generic HTML, malformed JSON, and rate limits',async()=>{
 for(const [reply,code,retry] of [
  [response({},401),'login_required',undefined],[response({},404),'unavailable',undefined],
  [new Response('<html>generic</html>',{headers:{'Content-Type':'text/html'}}),'protocol',undefined],
  [new Response('<html><title>模拟登录</title><body>模拟环境：登录已过期</body></html>',{headers:{'Content-Type':'text/html'}}),'login_required',undefined],
  [new Response('{broken',{headers:{'Content-Type':'application/json'}}),'protocol',undefined],
  [response({},429,{'Retry-After':'3'}),'rate_limited',3000],
 ] as const){
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(reply));
  await expect(jiraPreview('DEMO-1',config,signal())).rejects.toMatchObject({code,...(retry !== undefined ? {retryAfterMs:retry} : {})});
 }
});
it('cancels before requesting another page',async()=>{
 const controller=new AbortController();
 const fetcher=vi.fn().mockResolvedValueOnce(response(issue)).mockImplementationOnce(async()=>{controller.abort();return response({startAt:0,maxResults:1,total:2,comments:[comment('1','2026-09-18T00:00:00Z','2026-09-18T00:00:00Z')]});});
 vi.stubGlobal('fetch',fetcher);
 await expect(jiraPreview('DEMO-1',config,controller.signal)).rejects.toBeDefined();
 expect(fetcher).toHaveBeenCalledTimes(2);
});
it('keeps a single message when metadata/avatar is unavailable and only uses fixed GETs',async()=>{
 const postId='a'.repeat(26), user='u'.repeat(26), channel='c'.repeat(26);
 const fetcher=vi.fn().mockImplementation(async(url:string)=>{
   if(url.endsWith('/posts/'+postId)) return response({id:postId,user_id:user,channel_id:channel,create_at:1,message:'long'.repeat(10000)});
   return response({},404);
 });
 vi.stubGlobal('fetch',fetcher);
 const result=await mattermostPreview(postId,'demo',config,signal());
 expect(result.text.length).toBeLessThanOrEqual(20000);expect(result.author).toBe('未知用户');expect(result.channel).toBeNull();expect(result.avatar).toBeUndefined();
 expect(fetcher.mock.calls.map(c=>c[0])).toEqual([config.mattermostBaseUrl+'/api/v4/posts/'+postId,config.mattermostBaseUrl+'/api/v4/users/'+user,config.mattermostBaseUrl+'/api/v4/channels/'+channel,config.mattermostBaseUrl+'/api/v4/users/'+user+'/image']);
});

it('rejects changing totals and duplicate IDs instead of returning a partial latest comment',async()=>{
 for(const second of [{startAt:1,maxResults:1,total:3,comments:[comment('2','2026-09-19T00:00:00Z','2026-09-19T00:00:00Z')]},{startAt:1,maxResults:1,total:2,comments:[comment('1','2026-09-19T00:00:00Z','2026-09-19T00:00:00Z')]}]){
  vi.stubGlobal('fetch',vi.fn().mockResolvedValueOnce(response(issue)).mockResolvedValueOnce(response({startAt:0,maxResults:1,total:2,comments:[comment('1','2026-09-18T00:00:00Z','2026-09-18T00:00:00Z')]})).mockResolvedValueOnce(response(second)));
  await expect(jiraPreview('DEMO-1',config,signal())).rejects.toMatchObject({code:'protocol'});
 }
});
it('cancels oversized JSON and image streams without forwarding them',async()=>{
 const jsonCancel=vi.fn();
 const hugeJSON=new Response(new ReadableStream({start(controller){controller.enqueue(new Uint8Array(2*1024*1024+1));},cancel:jsonCancel}),{headers:{'Content-Type':'application/json'}});
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(hugeJSON));
 await expect(jiraPreview('DEMO-1',config,signal())).rejects.toMatchObject({code:'protocol'});expect(jsonCancel).toHaveBeenCalledTimes(1);
 const imageCancel=vi.fn();
 const image=new Response(new ReadableStream({start(controller){controller.enqueue(new Uint8Array(256*1024+1));},cancel:imageCancel}),{headers:{'Content-Type':'image/png'}});
 const id='a'.repeat(26),user='u'.repeat(26);
 vi.stubGlobal('fetch',vi.fn().mockResolvedValueOnce(response({id,user_id:user,channel_id:'',create_at:1,message:'synthetic'})).mockResolvedValueOnce(response({id:user,username:'author'})).mockResolvedValueOnce(image));
 const result=await mattermostPreview(id,'demo',config,signal());expect(result.avatar).toBeUndefined();expect(imageCancel).toHaveBeenCalledTimes(1);
});
it('honors HTTP-date Retry-After and uses a conservative fallback',()=>{
 const now=Date.parse('2026-09-19T00:00:00Z');
 expect(retryAfter('Sat, 19 Sep 2026 00:00:05 GMT',now)).toBe(5000);
 expect(retryAfter('invalid',now)).toBe(60000);
});
