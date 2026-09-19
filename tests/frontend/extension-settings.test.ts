import {expect,it,vi} from 'vitest';
import dummy from '../../config/dummy.json';
import {validateConfig} from '../../src/contracts/config';
import {ExtensionSettings,type SettingsPlatform} from '../../src/extension/settings';
import {siteAddresses} from '../../src/contracts/extension-settings';

const defaults=validateConfig(dummy);
const other={boardOrigin:'https://board.example',jiraBaseUrl:'https://jira.example/context/jira',mattermostBaseUrl:'https://chat.example/chat'};
function harness(stored:unknown=undefined){
 let value=stored,granted=true;
 const platform:SettingsPlatform={load:vi.fn(async()=>value),persist:vi.fn(async(next)=>{value=next??undefined;}),hasPermissions:vi.fn(async()=>granted),register:vi.fn(async()=>{}),cleanup:vi.fn(async()=>{})};
 const invalidated=vi.fn();const settings=new ExtensionSettings(defaults,platform,invalidated);
 return {settings,platform,invalidated,value:()=>value,grant:(next:boolean)=>{granted=next;}};
}
it('uses deployment defaults, persists only addresses, restores defaults and reloads custom sites',async()=>{
 const h=harness();await h.settings.ready;expect(h.settings.active).toEqual(defaults);expect(h.value()).toBeUndefined();
 await h.settings.save(other);expect(h.value()).toEqual(other);expect(h.settings.active).toEqual({mode:'production',...other});
 const restarted=harness(h.value());await restarted.settings.ready;expect(restarted.settings.active).toEqual(h.settings.active);
 await h.settings.save(null);expect(h.value()).toBeUndefined();expect(h.settings.active).toEqual(defaults);expect(h.invalidated).toHaveBeenCalled();
});
it('normalizes configured paths and allows a production deployment sharing one host',async()=>{
 const h=harness();await h.settings.ready;await h.settings.save({boardOrigin:'https://ONE.EXAMPLE:443/',jiraBaseUrl:'https://one.example/jira/',mattermostBaseUrl:'https://one.example/chat/'});
 expect(h.value()).toEqual({boardOrigin:'https://one.example',jiraBaseUrl:'https://one.example/jira',mattermostBaseUrl:'https://one.example/chat'});
});
it('invalid addresses and denied permissions preserve the active settings',async()=>{
 const h=harness();await h.settings.ready;
 for(const patch of [{boardOrigin:'https://board.example/path'},{jiraBaseUrl:'https://jira.example/?token=x'},{cookie:'secret'}])await expect(h.settings.save({...other,...patch})).rejects.toMatchObject({code:'invalid'});
 h.grant(false);await expect(h.settings.save(other)).rejects.toMatchObject({code:'permission'});expect(h.value()).toBeUndefined();expect(h.settings.active).toEqual(defaults);
});
it('failed persistence rolls registration back and later saves can succeed',async()=>{
 const h=harness();await h.settings.ready;vi.mocked(h.platform.persist).mockRejectedValueOnce(new Error('disk'));
 await expect(h.settings.save(other)).rejects.toMatchObject({code:'save'});expect(h.settings.active).toEqual(defaults);expect(h.platform.register).toHaveBeenLastCalledWith(defaults);expect(h.value()).toBeUndefined();
 await h.settings.save(other);expect(h.settings.active?.boardOrigin).toBe(other.boardOrigin);
});
it('failed registration never commits storage and serializes two overlapping saves',async()=>{
 const h=harness();await h.settings.ready;vi.mocked(h.platform.register).mockRejectedValueOnce(new Error('register'));
 const failed=h.settings.save(other).catch(error=>error);const next={...other,jiraBaseUrl:'https://jira.example/next'};const success=h.settings.save(next);
 expect(await failed).toMatchObject({code:'save'});await success;expect(h.value()).toEqual(next);expect(h.settings.active?.jiraBaseUrl).toBe(next.jiraBaseUrl);
});
it('corrupt storage and startup permission loss fail closed, with explicit reset available',async()=>{
 const broken=harness({...other,token:'secret'});await broken.settings.ready;expect(broken.settings.active).toBeNull();expect((await broken.settings.state()).failed).toBe(true);
 await broken.settings.save(null);expect(broken.settings.active).toEqual(defaults);
 const missing=harness(other);missing.grant(false);await missing.settings.ready;expect(missing.settings.active).toBeNull();expect(missing.platform.register).toHaveBeenLastCalledWith(null);
});
it('permission removal invalidates immediately before asynchronous reconciliation',async()=>{
 const h=harness(siteAddresses(defaults));await h.settings.ready;const version=h.settings.revision;
 h.grant(false);const pending=h.settings.permissionsRemoved();expect(h.settings.active).toBeNull();expect(h.settings.revision).toBeGreaterThan(version);expect(h.invalidated).toHaveBeenCalled();
 await pending;expect(h.settings.active).toBeNull();expect(h.platform.register).toHaveBeenLastCalledWith(null);expect(h.value()).toEqual(siteAddresses(defaults));
});
function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(done=>{resolve=done;});return {promise,resolve};}
it('revocation during failed-save rollback cannot re-enable the previous configuration',async()=>{
 const h=harness();await h.settings.ready;const rollback=deferred<void>(),reconcile=deferred<boolean>();let rollingBack=false;
 vi.mocked(h.platform.persist).mockRejectedValueOnce(new Error('disk'));
 vi.mocked(h.platform.register).mockImplementationOnce(async()=>{}).mockImplementationOnce(async()=>{rollingBack=true;await rollback.promise;});
 const saving=h.settings.save(other).catch(error=>error);await vi.waitFor(()=>expect(rollingBack).toBe(true));
 vi.mocked(h.platform.hasPermissions).mockImplementationOnce(()=>reconcile.promise);const revoked=h.settings.permissionsRemoved();rollback.resolve();
 expect(await saving).toMatchObject({code:'save'});expect(h.settings.active).toBeNull();reconcile.resolve(false);await revoked;
});
it('startup and repeated permission checks cannot publish grants from before revocation',async()=>{
 const startup=deferred<void>(),reconcile=deferred<boolean>();const h=harness();
 vi.mocked(h.platform.register).mockImplementationOnce(()=>startup.promise);await vi.waitFor(()=>expect(h.platform.register).toHaveBeenCalled());
 expect(h.settings.active).toBeNull();vi.mocked(h.platform.hasPermissions).mockImplementationOnce(()=>reconcile.promise);
 const revoked=h.settings.permissionsRemoved();startup.resolve();await h.settings.ready;expect(h.settings.active).toBeNull();reconcile.resolve(false);await revoked;
});
it('a revoked permission check cannot start a save or replace stored addresses',async()=>{
 const h=harness();await h.settings.ready;const check=deferred<boolean>();vi.mocked(h.platform.hasPermissions).mockImplementationOnce(()=>check.promise);
 const saving=h.settings.save(other).catch(error=>error);await vi.waitFor(()=>expect(h.platform.hasPermissions).toHaveBeenCalledTimes(2));
 h.grant(false);const revoked=h.settings.permissionsRemoved();check.resolve(true);
 expect(await saving).toMatchObject({code:'permission'});await revoked;expect(h.value()).toBeUndefined();expect(h.settings.active).toBeNull();
});
it('cleanup reserves queued sites when saving A to B and back to A',async()=>{
 const h=harness(other);await h.settings.ready;const b={...other,boardOrigin:'https://second.example'};
 const first=h.settings.save(b),second=h.settings.save(other);await first;await second;
 expect(h.platform.cleanup).toHaveBeenNthCalledWith(1,{mode:'production',...other},{mode:'production',...b},expect.arrayContaining([{mode:'production',...other}]));
 expect(h.settings.active).toEqual({mode:'production',...other});
});
