import { expect,it,vi } from 'vitest';
import { PreviewStore,resourceKey,type PreviewView,type Transport } from '../../src/web/state/preview';
import type { PreviewRequest,PreviewReply,JiraPreview,PreviewErrorCode } from '../../src/contracts/preview-messages';
import type { Resource } from '../../src/contracts/resource-links';
import { TransportError } from '../../src/web/transport-error';
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
const resource=(id:number):Resource=>({kind:'jira',id:'DEMO-'+id,url:'http://jira.localhost:4180/jira/browse/DEMO-'+id});
function setup(cooldowns=new Map<string,number>()){
 let views:ReadonlyMap<string,PreviewView>=new Map();let time=1000;
 const calls:{request:PreviewRequest;resolve:(reply:PreviewReply)=>void;reject:(reason:Error)=>void}[]=[];
 const transport:Transport={request:vi.fn((request:PreviewRequest)=>new Promise<PreviewReply>((resolve,reject)=>calls.push({request,resolve,reject}))),cancel:vi.fn()};
 const store=new PreviewStore(transport,next=>{views=next;},()=>time,cooldowns);
 const ok=(index:number,id:number)=>{const call=calls[index]!;const data:JiraPreview={kind:'jira',key:'DEMO-'+id,url:resource(id).url,summary:'模拟个人内容',assignee:null,status:'Open',comment:null};call.resolve({version:1,id:call.request.id,ok:true,data});};
 const fail=(index:number,code:PreviewErrorCode,retryAfterMs?:number)=>{const call=calls[index]!;call.resolve({version:1,id:call.request.id,ok:false,error:{code,...(retryAfterMs===undefined?{}:{retryAfterMs})}});};
 return {store,transport,calls,ok,fail,get views(){return views;},set time(value:number){time=value;}};
}
it('deduplicates resources and keeps at most four requests in flight without polling',async()=>{
 const s=setup();s.store.setResources([1,2,3,4,5,1].map(resource));s.store.connect();expect(s.calls).toHaveLength(4);
 s.ok(0,1);await tick();expect(s.calls).toHaveLength(5);
 for(let index=1;index<5;index++)s.ok(index,index+1);await tick();
 s.store.setResources([1,2,3,4,5,1].map(resource));await tick();expect(s.calls).toHaveLength(5);expect(s.views.size).toBe(5);s.store.dispose();
});
it('removed and re-added resources reject late responses and cancel old work',async()=>{
 const s=setup();s.store.setResources([resource(1)]);s.store.connect();s.store.setResources([]);expect(s.transport.cancel).toHaveBeenCalledWith(s.calls[0]!.request.id);
 s.store.setResources([resource(1)]);expect(s.calls).toHaveLength(2);s.ok(0,1);await tick();expect(s.views.get(resource(1).url)?.state.status).toBe('loading');
 s.ok(1,1);await tick();expect(s.views.get(resource(1).url)?.state.status).toBe('ready');s.store.dispose();expect(s.views.size).toBe(0);
});
it('network failure preserves a marked old result, authentication removes it, and rate limit blocks early refresh',async()=>{
 const s=setup();const key=resource(1).url;s.store.setResources([resource(1)]);s.store.connect();s.ok(0,1);await tick();
 s.store.refresh(key);s.fail(1,'network');await tick();expect(s.views.get(key)?.state).toMatchObject({status:'stale',lastSuccess:1000});
 s.store.refresh(key);s.fail(2,'login_required');await tick();expect(s.views.get(key)?.state).toEqual({status:'error',error:{code:'login_required'}});
 s.store.refresh(key);s.fail(3,'rate_limited',2000);await tick();expect(s.views.get(key)?.retryAt).toBe(3000);
 s.store.refreshAll();expect(s.calls).toHaveLength(4);s.time=2999;s.store.refresh(key);expect(s.calls).toHaveLength(4);
 s.time=3000;await tick();expect(s.calls).toHaveLength(4);s.store.refresh(key);expect(s.calls).toHaveLength(5);s.store.dispose();
});
it('disconnect clears ready and pending previews and completion cannot repopulate disposed state',async()=>{
 const s=setup();s.store.setResources([resource(1),resource(2)]);s.store.connect();s.ok(0,1);await tick();s.store.disconnect();
 expect(s.views.get(resource(1).url)?.state).toEqual({status:'error',error:{code:'disconnected'}});expect(s.transport.cancel).toHaveBeenCalledWith(s.calls[1]!.request.id);
 s.store.dispose();s.ok(1,2);await tick();expect(s.views.size).toBe(0);expect(s.calls).toHaveLength(2);
});
it('rate-limit deadlines survive resource removal and client recreation within this page',async()=>{
 const cooldowns=new Map<string,number>();const s=setup(cooldowns);s.store.setResources([resource(1)]);s.store.connect();s.fail(0,'rate_limited',2000);await tick();
 s.store.setResources([]);s.store.setResources([resource(1)]);expect(s.calls).toHaveLength(1);expect(s.views.get(resource(1).url)?.retryAt).toBe(3000);s.store.dispose();
 const next=setup(cooldowns);next.store.setResources([resource(1)]);next.store.connect();expect(next.calls).toHaveLength(0);expect(next.views.get(resource(1).url)?.retryAt).toBe(3000);next.time=3000;next.store.refreshAll();expect(next.calls).toHaveLength(1);next.store.dispose();
});
it('Mattermost aliases for one post share a request while keeping their original links',()=>{
 const s=setup();const id='a'.repeat(26);const first:Resource={kind:'mattermost',id,team:'demo',url:'http://mattermost.localhost:4181/demo/pl/'+id};const second:Resource={...first,team:'another',url:'http://mattermost.localhost:4181/another/pl/'+id};
 s.store.setResources([first,second]);s.store.connect();expect(resourceKey(first)).toBe(resourceKey(second));expect(s.calls).toHaveLength(1);s.store.setResources([second]);expect(s.transport.cancel).not.toHaveBeenCalled();s.store.dispose();
});
it('an overall request timeout marks the prior preview stale without claiming extension disconnect',async()=>{
 const s=setup();s.store.setResources([resource(1)]);s.store.connect();s.ok(0,1);await tick();s.store.refresh(resource(1).url);s.calls[1]!.reject(new TransportError('network'));await tick();
 expect(s.views.get(resource(1).url)?.state).toMatchObject({status:'stale',lastSuccess:1000,error:{code:'network'}});s.store.dispose();
});
it('temporary suspension preserves successful content and resumes only interrupted resources',async()=>{
 const s=setup();s.store.setResources([resource(1),resource(2)]);s.store.connect();s.ok(0,1);await tick();
 s.store.suspend();expect(s.views.get(resource(1).url)?.state).toMatchObject({status:'ready',lastSuccess:1000});expect(s.transport.cancel).toHaveBeenCalledWith(s.calls[1]!.request.id);
 s.calls[1]!.reject(new TransportError('disconnected'));await tick();s.store.connect(true);expect(s.calls).toHaveLength(3);expect(s.calls[2]!.request).toMatchObject({key:'DEMO-2'});
 s.ok(2,2);await tick();expect(s.views.get(resource(2).url)?.state.status).toBe('ready');s.store.dispose();
});
it('transport recovery does not turn completed permission errors into automatic source polling',async()=>{
 const s=setup();s.store.setResources([resource(1),resource(2),resource(3)]);s.store.connect();s.fail(0,'login_required');s.fail(1,'unavailable');s.fail(2,'protocol');await tick();
 s.store.suspend();s.store.connect(true);await tick();expect(s.calls).toHaveLength(3);expect(s.views.get(resource(1).url)?.state).toEqual({status:'error',error:{code:'login_required'}});s.store.dispose();
});
