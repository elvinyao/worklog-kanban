import { expect,it,vi } from 'vitest';
import config from '../../config/dummy.json';
import { validateConfig } from '../../src/contracts/config';
import { ExtensionClient } from '../../src/web/extension-client';
it('timeout cancels the worker request and reports network failure rather than disconnected',async()=>{
 const fakeWindow={addEventListener:vi.fn(),removeEventListener:vi.fn(),postMessage:vi.fn()};vi.stubGlobal('window',fakeWindow);vi.useFakeTimers();
 const client=new ExtensionClient(validateConfig(config));
 try{
  const outcome=client.request({version:1,id:'slow-request',op:'jira.preview',key:'DEMO-1'},30000).catch(error=>error);
  await vi.advanceTimersByTimeAsync(30000);expect(await outcome).toMatchObject({code:'network'});
  expect(fakeWindow.postMessage.mock.calls.at(-1)?.[0]).toMatchObject({payload:{op:'cancel',targetId:'slow-request'}});
 }finally{client.dispose();vi.useRealTimers();vi.unstubAllGlobals();}
});
