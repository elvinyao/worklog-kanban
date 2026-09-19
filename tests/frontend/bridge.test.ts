import { expect, it, vi } from 'vitest';
import config from '../../config/dummy.json';
import { validateConfig } from '../../src/contracts/config';
import { allowedPage, allowedSender } from '../../src/extension/guards';
const sites = validateConfig(config);
it('only trusts its top-level configured page', () => {
 expect(allowedPage(sites.boardOrigin,true,true,sites)).toBe(true);
 for(const [origin,top,own] of [[sites.boardOrigin,false,true],[sites.boardOrigin,true,false],['http://board.localhost:9999',true,true],['https://evil.invalid',true,true]] as const) expect(allowedPage(origin,top,own,sites)).toBe(false);
});

it('ignores an old port disconnect after page restoration opens a new port',async()=>{
 const listeners = new Map<string,(event:unknown)=>void>();
 const posts = vi.fn();
 const fakeWindow: Record<string,unknown> = {addEventListener:(name:string,fn:(event:unknown)=>void)=>listeners.set(name,fn),postMessage:posts};
 fakeWindow.top=fakeWindow;
 const ports = [0,1].map(()=>({postMessage:vi.fn(),disconnect:vi.fn(),onMessage:{addListener:vi.fn()},onDisconnect:{addListener:vi.fn()}}));
 let index=0;
 vi.stubGlobal('window',fakeWindow);vi.stubGlobal('location',{origin:sites.boardOrigin});vi.stubGlobal('__SITE_CONFIG__',sites);
 vi.stubGlobal('chrome',{runtime:{connect:()=>ports[index++]}});
 try {
  await import('../../src/extension/bridge');
  const hello=()=>listeners.get('message')!({origin:sites.boardOrigin,source:fakeWindow,data:{channel:'worklog:request',payload:{version:1,id:'hello',op:'hello'}}});
  hello();listeners.get('pagehide')!({});hello();
  const oldDisconnect=ports[0]!.onDisconnect.addListener.mock.calls[0]![0] as ()=>void;
  oldDisconnect();
  expect(posts).not.toHaveBeenCalled();
 } finally {vi.unstubAllGlobals();vi.resetModules();}
});
it('rechecks sender identity, tab, frame, and exact origin in the worker', () => {
 const sender:chrome.runtime.MessageSender = {id:'extension-id',origin:sites.boardOrigin,url:sites.boardOrigin+'/',frameId:0,tab:{id:1,index:0,pinned:false,highlighted:false,windowId:1,active:true,incognito:false,selected:false,frozen:false,discarded:false,autoDiscardable:true,groupId:-1,lastAccessed:0}};
 expect(allowedSender(sender,'extension-id',sites)).toBe(true);
 for(const patch of [{id:'other'},{frameId:1},{origin:'http://board.localhost:9999'},{url:'https://evil.invalid/'},{tab:undefined},{origin:undefined}]) expect(allowedSender({...sender,...patch} as chrome.runtime.MessageSender,'extension-id',sites)).toBe(false);
});
