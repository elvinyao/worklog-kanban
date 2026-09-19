import type {SiteConfig} from '../contracts/config';
import {hostPattern,SETTINGS_KEY,sitePermissions} from '../contracts/extension-settings';
import type {SettingsPlatform} from './settings';

const SCRIPT_ID='worklog-board';
export function settingsPlatform(defaults:SiteConfig):SettingsPlatform {
 return {
  load:async()=>{
   await chrome.storage.local.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'});
   return (await chrome.storage.local.get(SETTINGS_KEY))[SETTINGS_KEY];
  },
  persist:async sites=>{if(sites===null)await chrome.storage.local.remove(SETTINGS_KEY);else await chrome.storage.local.set({[SETTINGS_KEY]:sites});},
  hasPermissions:config=>chrome.permissions.contains({origins:sitePermissions(config)}),
  register:async config=>{
   const existing=await chrome.scripting.getRegisteredContentScripts({ids:[SCRIPT_ID]});
   if(!config){if(existing.length)await chrome.scripting.unregisterContentScripts({ids:[SCRIPT_ID]});return;}
   const script:chrome.scripting.RegisteredContentScript={id:SCRIPT_ID,matches:[hostPattern(config.boardOrigin)],js:['bridge.js'],runAt:'document_start',allFrames:false,persistAcrossSessions:true};
   if(existing.length)await chrome.scripting.updateContentScripts([script]);else await chrome.scripting.registerContentScripts([script]);
  },
  cleanup:async(retired,config,reserved)=>{
   // Never remove a new grant another options page has just requested.
   const keep=new Set([defaults,config,...reserved].flatMap(sitePermissions));
   const obsolete=sitePermissions(retired).filter(origin=>!keep.has(origin));
   if(obsolete.length)await chrome.permissions.remove({origins:obsolete});
  },
 };
}
