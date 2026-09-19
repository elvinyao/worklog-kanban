import {exact,record,validateConfig,type SiteConfig} from './config';

export type SiteAddresses=Pick<SiteConfig,'boardOrigin'|'jiraBaseUrl'|'mattermostBaseUrl'>;
export const SETTINGS_KEY='worklog.sites';
export const siteAddresses=({boardOrigin,jiraBaseUrl,mattermostBaseUrl}:SiteAddresses):SiteAddresses=>({boardOrigin,jiraBaseUrl,mattermostBaseUrl});
export function parseSites(value:unknown):SiteAddresses {
 const input=record(value);exact(input,['boardOrigin','jiraBaseUrl','mattermostBaseUrl']);
 return siteAddresses(validateConfig({...input,mode:'production'}));
}
export const sameSites=(a:SiteAddresses,b:SiteAddresses):boolean=>a.boardOrigin===b.boardOrigin&&a.jiraBaseUrl===b.jiraBaseUrl&&a.mattermostBaseUrl===b.mattermostBaseUrl;
export const hostPattern=(value:string):string=>{const url=new URL(value);return url.protocol+'//'+url.hostname+'/*';};
export const sitePermissions=(sites:SiteAddresses):string[]=>[...new Set(Object.values(siteAddresses(sites)).map(hostPattern))];
export interface ExtensionSettingsState {config:SiteConfig;defaults:SiteConfig;custom:boolean;permitted:boolean;failed:boolean}
