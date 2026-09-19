import {afterEach,expect,it,vi} from 'vitest';
import dummy from '../../config/dummy.json';
import {validateConfig} from '../../src/contracts/config';
import {settingsPlatform} from '../../src/extension/settings-platform';
const defaults=validateConfig(dummy);
afterEach(()=>vi.unstubAllGlobals());
it('removes only retired grants, preserving defaults, queued sites and unrelated newly granted hosts',async()=>{
 const grants=new Set(['http://board.localhost/*','https://retired.example/*','https://queued.example/*','https://new.example/*']);
 vi.stubGlobal('chrome',{permissions:{getAll:async()=>({origins:[...grants]}),remove:vi.fn(async({origins}:{origins:string[]})=>{origins.forEach(origin=>grants.delete(origin));return true;})}});
 const platform=settingsPlatform(defaults),retired={...defaults,boardOrigin:'https://retired.example',jiraBaseUrl:'https://queued.example'};
 await platform.cleanup(retired,defaults,[{...defaults,jiraBaseUrl:'https://queued.example'}]);
 expect([...grants]).toEqual(['http://board.localhost/*','https://queued.example/*','https://new.example/*']);
});
