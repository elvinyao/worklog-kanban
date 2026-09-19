import {afterEach,expect,it,vi} from 'vitest';
import dummy from '../../config/dummy.json';
import {validateConfig} from '../../src/contracts/config';
import {siteAddresses} from '../../src/contracts/extension-settings';

const defaults=validateConfig(dummy);
afterEach(()=>{vi.unstubAllGlobals();vi.resetModules();vi.doUnmock('../../src/extension/settings-platform');vi.doUnmock('../../src/extension/read');});
async function worker(){
 let connect:(port:chrome.runtime.Port)=>void=()=>{},message:(data:unknown,sender:chrome.runtime.MessageSender,reply:(value:unknown)=>void)=>unknown=()=>{};
 let stored:unknown,permissions=true,removed:(value:{origins:string[]})=>void=()=>{};
 const platform={load:async()=>stored,persist:vi.fn(async(value:unknown)=>{stored=value;}),hasPermissions:async()=>permissions,register:vi.fn(async()=>{}),cleanup:async()=>{}};
 const read=vi.fn(async(_request:unknown,config:typeof defaults,_signal:AbortSignal)=>({kind:'jira',key:'DEMO-1',url:config.jiraBaseUrl+'/browse/DEMO-1',summary:'Synthetic',assignee:null,status:'Open',comment:null}));
 vi.stubGlobal('__SITE_CONFIG__',defaults);
 vi.stubGlobal('chrome',{runtime:{id:'extension',getURL:(name:string)=>'chrome-extension://extension/'+name,onConnect:{addListener:(fn:typeof connect)=>{connect=fn;}},onMessage:{addListener:(fn:typeof message)=>{message=fn;}}},permissions:{onRemoved:{addListener:(fn:typeof removed)=>{removed=fn;}}},action:{onClicked:{addListener:vi.fn()}}});
 vi.doMock('../../src/extension/settings-platform',()=>({settingsPlatform:()=>platform}));
 vi.doMock('../../src/extension/read',async importOriginal=>({...await importOriginal<object>(),readPreview:read}));
 await import('../../src/extension/worker');await vi.waitFor(()=>expect(platform.register).toHaveBeenCalled());
 const options={id:'extension',url:'chrome-extension://extension/options.html'};
 const manage=(data:unknown,sender:chrome.runtime.MessageSender=options)=>new Promise<any>(resolve=>{if(message(data,sender,resolve)!==true)resolve(undefined);});
 function port(origin=defaults.boardOrigin){
  let receive:(data:unknown)=>void=()=>{};const replies:unknown[]=[];
  const sender={id:'extension',origin,url:origin+'/',frameId:0,tab:{id:1}} as chrome.runtime.MessageSender;
  const disconnect=vi.fn();connect({name:'worklog',sender,postMessage:(reply:unknown)=>replies.push(reply),disconnect,onMessage:{addListener:(fn:typeof receive)=>{receive=fn;}},onDisconnect:{addListener:vi.fn()}} as unknown as chrome.runtime.Port);
  return {send:(data:unknown)=>receive(data),replies,disconnect,sender};
 }
 return {port,manage,platform,read,revoke:()=>{permissions=false;removed({origins:['http://jira.localhost/*']});}};
}
it('requires a matching handshake before any external read, including legacy handshakes after reconfiguration',async()=>{
 const h=await worker(),p=h.port();
 const legacy=h.port();legacy.send({version:1,id:'legacy-default',op:'hello'});legacy.send({version:1,id:'legacy-read',op:'jira.preview',key:'DEMO-1'});
 await vi.waitFor(()=>expect(legacy.replies).toHaveLength(2));expect(legacy.replies[0]).toMatchObject({error:{code:'configuration_mismatch'}});expect(h.read).not.toHaveBeenCalled();
 p.send({version:1,id:'before',op:'jira.preview',key:'DEMO-1'});await vi.waitFor(()=>expect(p.replies).toHaveLength(1));expect(h.read).not.toHaveBeenCalled();
 p.send({version:1,id:'wrong',op:'hello',sites:{...siteAddresses(defaults),jiraBaseUrl:defaults.jiraBaseUrl+'/other'}});await vi.waitFor(()=>expect(p.replies).toHaveLength(2));expect(p.replies[1]).toMatchObject({error:{code:'configuration_mismatch'}});
 p.send({version:1,id:'correct',op:'hello',sites:siteAddresses(defaults)});p.send({version:1,id:'read',op:'jira.preview',key:'DEMO-1'});await vi.waitFor(()=>expect(h.read).toHaveBeenCalledTimes(1));
 await h.manage({op:'settings.save',sites:{...siteAddresses(defaults),jiraBaseUrl:defaults.jiraBaseUrl+'/new'}});
 const changed=h.port();changed.send({version:1,id:'old-client',op:'hello'});changed.send({version:1,id:'nope',op:'jira.preview',key:'DEMO-1'});
 await vi.waitFor(()=>expect(changed.replies).toHaveLength(2));expect(changed.replies[0]).toMatchObject({error:{code:'configuration_mismatch'}});expect(h.read).toHaveBeenCalledTimes(1);
});
it('permission removal immediately cancels reads and rejects new sessions',async()=>{
 const h=await worker(),p=h.port();h.read.mockImplementationOnce(()=>new Promise(()=>{}));
 p.send({version:1,id:'hello',op:'hello',sites:siteAddresses(defaults)});p.send({version:1,id:'slow',op:'jira.preview',key:'DEMO-1'});await vi.waitFor(()=>expect(h.read).toHaveBeenCalledTimes(1));
 const signal=h.read.mock.calls[0]![2];h.revoke();expect(signal.aborted).toBe(true);expect(p.disconnect).toHaveBeenCalled();
 const next=h.port();await vi.waitFor(()=>expect(next.disconnect).toHaveBeenCalled());expect(h.platform.register).toHaveBeenLastCalledWith(null);
});
it('only the options page may write settings, and switching invalidates pending reads before late results',async()=>{
 const h=await worker(),p=h.port();let finish:(data:unknown)=>void=()=>{};
 h.read.mockImplementationOnce((_request,config,signal)=>new Promise(resolve=>{finish=()=>resolve({kind:'jira',key:'DEMO-1',url:config.jiraBaseUrl+'/browse/DEMO-1',summary:'Old content',assignee:null,status:'Open',comment:null});expect(signal.aborted).toBe(false);}));
 expect(await h.manage({op:'settings.save',sites:siteAddresses(defaults)},p.sender)).toBeUndefined();expect(h.platform.persist).not.toHaveBeenCalled();
 p.send({version:1,id:'hello',op:'hello',sites:siteAddresses(defaults)});p.send({version:1,id:'slow',op:'jira.preview',key:'DEMO-1'});await vi.waitFor(()=>expect(h.read).toHaveBeenCalledTimes(1));
 const signal=h.read.mock.calls[0]![2];expect((await h.manage({op:'settings.save',sites:{...siteAddresses(defaults),boardOrigin:'http://board.localhost:4192'}})).ok).toBe(true);
 expect(signal.aborted).toBe(true);expect(p.disconnect).toHaveBeenCalled();finish(undefined);await Promise.resolve();expect(p.replies).toHaveLength(1);
 const old=h.port();await vi.waitFor(()=>expect(old.disconnect).toHaveBeenCalled());expect(h.read).toHaveBeenCalledTimes(1);
});
