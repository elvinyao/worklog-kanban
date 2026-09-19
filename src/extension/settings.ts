import type {SiteConfig} from '../contracts/config';
import {parseSites,type SiteAddresses,type ExtensionSettingsState} from '../contracts/extension-settings';

export interface SettingsPlatform {
 load:()=>Promise<unknown>;
 persist:(sites:SiteAddresses|null)=>Promise<void>;
 hasPermissions:(config:SiteConfig)=>Promise<boolean>;
 register:(config:SiteConfig|null)=>Promise<void>;
 cleanup:(retired:SiteConfig,current:SiteConfig,reserved:SiteConfig[])=>Promise<void>;
}
export class SettingsError extends Error {constructor(public code:'invalid'|'permission'|'save'){super(code);}}

// Only addresses persist. Active requests are invalidated before changing any registration.
export class ExtensionSettings {
 private config:SiteConfig;
 private custom=false;
 private permitted=false;
 private failed=false;
 private tail:Promise<void>=Promise.resolve();
 private candidates=new Map<symbol,SiteConfig>();
 revision=0;
 readonly ready:Promise<void>;
 constructor(readonly defaults:SiteConfig,private platform:SettingsPlatform,private invalidated:()=>void){
  this.config=defaults;
  this.ready=this.enqueue(async()=>{
   const revision=this.revision;
   try{
    const stored=await platform.load();
    this.config=stored===undefined?defaults:{mode:'production',...parseSites(stored)};this.custom=stored!==undefined;
    const allowed=await platform.hasPermissions(this.config);
    await platform.register(allowed?this.config:null);
    this.permitted=allowed&&revision===this.revision;
   }catch{this.permitted=false;this.failed=true;await platform.register(null).catch(()=>{});}
  });
 }
 get active():SiteConfig|null{return this.permitted&&!this.failed?this.config:null;}
 get pendingSites():SiteConfig[]{return [...this.candidates.values()];}
 private snapshot():ExtensionSettingsState{return {config:this.config,defaults:this.defaults,custom:this.custom,permitted:this.permitted,failed:this.failed};}
 async state():Promise<ExtensionSettingsState>{await this.tail;return this.snapshot();}
 private enqueue<T>(operation:()=>Promise<T>):Promise<T>{const result=this.tail.then(operation);this.tail=result.then(()=>{},()=>{});return result;}
 private invalidate(){this.permitted=false;this.revision++;this.invalidated();}
 async save(value:unknown):Promise<ExtensionSettingsState>{
  let sites:SiteAddresses|null;
  try{sites=value===null?null:parseSites(value);}catch{throw new SettingsError('invalid');}
  const candidate=sites===null?this.defaults:{mode:'production' as const,...sites};
  const reservation=Symbol();this.candidates.set(reservation,candidate);
  return this.enqueue(async()=>{
   const checkedRevision=this.revision;
   if(!await this.platform.hasPermissions(candidate)||checkedRevision!==this.revision)throw new SettingsError('permission');
   const previous=this.active,retired=this.config;this.invalidate();const revision=this.revision;
   try{
    await this.platform.register(candidate);
    await this.platform.persist(sites);
   }catch{
    try{const allowed=previous&&await this.platform.hasPermissions(previous);await this.platform.register(allowed?previous:null);this.permitted=!!allowed&&revision===this.revision;}
    catch{this.failed=true;}
    throw new SettingsError('save');
   }
   this.config=candidate;this.custom=sites!==null;this.failed=false;this.permitted=revision===this.revision;
   // A stale optional grant cannot widen the runtime allowlist. Cleanup failure is non-fatal.
   await this.platform.cleanup(retired,candidate,this.pendingSites).catch(()=>{});
   return this.snapshot();
  }).finally(()=>{this.candidates.delete(reservation);});
 }
 permissionsRemoved():Promise<void>{
  this.invalidate();
  return this.enqueue(async()=>{
   const revision=this.revision;
   try{const allowed=!this.failed&&await this.platform.hasPermissions(this.config);await this.platform.register(allowed?this.config:null);this.permitted=allowed&&revision===this.revision;}
   catch{this.permitted=false;this.failed=true;}
  });
 }
}
