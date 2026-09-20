import {afterEach,expect,it,vi} from 'vitest';
import dummy from '../../config/dummy.json';
import {validateConfig} from '../../src/contracts/config';
import {PreviewSession,type SessionClient} from '../../src/web/preview-session';
import type {DisconnectReason} from '../../src/web/extension-client';
import type {PreviewReply,PreviewRequest} from '../../src/contracts/preview-messages';
import type {PreviewView} from '../../src/web/state/preview';
const config=validateConfig(dummy),url=config.jiraBaseUrl+'/browse/DEMO-1';
afterEach(()=>vi.useRealTimers());
function harness(){
 vi.useFakeTimers();let views:ReadonlyMap<string,PreviewView>=new Map();const states:string[]=[],clients:{client:SessionClient;disconnect:(reason:DisconnectReason)=>void}[]=[];
 let fail=false,mismatch=false;
 const session=new PreviewSession(config,value=>{views=value;},value=>states.push(value),new Map(),disconnect=>{
  const client:SessionClient={request:vi.fn(async(request:PreviewRequest):Promise<PreviewReply>=>{
   if(fail)throw new Error('Unavailable');
   if(request.op==='hello')return mismatch?{version:1,id:request.id,ok:false,error:{code:'configuration_mismatch'}}:{version:1,id:request.id,ok:true,data:{connected:true}};
   return {version:1,id:request.id,ok:true,data:{kind:'jira',key:'DEMO-1',url,summary:'Synthetic',assignee:null,status:'Open',comment:null}};
  }),cancel:vi.fn(),dispose:vi.fn()};clients.push({client,disconnect});return client;
 });session.store.setResources([{kind:'jira',id:'DEMO-1',url}]);
 return {session,clients,states,get views(){return views;},fail:()=>{fail=true;},mismatch:()=>{mismatch=true;}};
}
it('recovers transient loss without rereading ready resources, and explicit invalidation clears immediately',async()=>{
 const h=harness();h.session.start();await vi.advanceTimersByTimeAsync(0);expect(h.views.get(url)?.state.status).toBe('ready');
 h.clients[0]!.disconnect('transport');expect(h.views.get(url)?.state.status).toBe('ready');await vi.advanceTimersByTimeAsync(0);
 expect(h.states.at(-1)).toBe('connected');expect(h.clients).toHaveLength(2);expect(h.clients[1]!.client.request).toHaveBeenCalledTimes(1);
 h.clients[1]!.disconnect('invalidated');expect(h.views.get(url)?.state.status).toBe('error');await vi.advanceTimersByTimeAsync(10000);expect(h.clients).toHaveLength(2);h.session.close();
});
it('bounds retries, clears content after failure, and cancels scheduled recovery on close',async()=>{
 const h=harness();h.session.start();await vi.advanceTimersByTimeAsync(0);h.fail();h.clients[0]!.disconnect('transport');await vi.advanceTimersByTimeAsync(10000);
 expect(h.clients).toHaveLength(4);expect(h.states.at(-1)).toBe('unavailable');expect(h.views.get(url)?.state.status).toBe('error');await vi.advanceTimersByTimeAsync(10000);expect(h.clients).toHaveLength(4);h.session.close();
 const other=harness();other.session.start();await vi.advanceTimersByTimeAsync(0);other.fail();other.clients[0]!.disconnect('transport');await vi.advanceTimersByTimeAsync(0);other.session.close();await vi.advanceTimersByTimeAsync(10000);expect(other.clients).toHaveLength(2);expect(other.views.size).toBe(0);
});
it('a mismatched configuration never resumes cached content',async()=>{
 const h=harness();h.session.start();await vi.advanceTimersByTimeAsync(0);h.mismatch();h.clients[0]!.disconnect('transport');await vi.advanceTimersByTimeAsync(0);
 expect(h.states.at(-1)).toBe('configuration_mismatch');expect(h.views.get(url)?.state.status).toBe('error');expect(h.clients).toHaveLength(2);h.session.close();
});
