import {validateConfig} from '../contracts/config';
import {parseSites,siteAddresses,sitePermissions,type ExtensionSettingsState,type SiteAddresses} from '../contracts/extension-settings';
import {browserLanguages,detectLocale,localeTags,messages,translate,type MessageKey} from '../web/i18n/core';

const form=document.querySelector<HTMLFormElement>('form')!;
const buttons=[...document.querySelectorAll<HTMLButtonElement>('button')];
const output=document.querySelector<HTMLElement>('#result')!;
let state:ExtensionSettingsState|undefined;
let result:MessageKey|undefined,error=false,busy=false;
const fields=['boardOrigin','jiraBaseUrl','mattermostBaseUrl'] as const;
const input=(name:typeof fields[number])=>document.getElementById(name) as HTMLInputElement;
function render(){
 const locale=detectLocale(browserLanguages()),t=(key:MessageKey)=>translate(locale,key);
 document.documentElement.lang=localeTags[locale];document.title=t('extension.title')+' · Worklog';
 for(const element of document.querySelectorAll<HTMLElement>('[data-i18n]')){const key=element.dataset.i18n!;if(Object.hasOwn(messages,key))element.textContent=t(key as MessageKey);}
 document.querySelector('#source')!.textContent=t(state?.custom?'extension.custom':'extension.defaults');
 document.querySelector('#access')!.textContent=t(state?.permitted?'extension.ready':'extension.permissionNeeded');
 output.textContent=result?t(result):'';output.dataset.error=String(error);
 for(const button of buttons)button.disabled=busy||!state;
 if(state)(document.querySelector('#open-board') as HTMLAnchorElement).href=state.config.boardOrigin;
}
function accept(value:ExtensionSettingsState){
 state={...value,config:validateConfig(value.config),defaults:validateConfig(value.defaults)};
 for(const field of fields)input(field).value=state.config[field];
}
function show(key:MessageKey,failed=false){result=key;error=failed;render();}
async function save(reset:boolean){
 if(busy||!state)return;
 let sites:SiteAddresses;
 try{sites=reset?siteAddresses(state.defaults):parseSites(Object.fromEntries(fields.map(field=>[field,input(field).value.trim()])));}
 catch{show('extension.invalid',true);return;}
 busy=true;result=undefined;render();
 try{
  // Must be invoked directly from the click/submit gesture, before any asynchronous work.
  const permitted=await chrome.permissions.request({origins:sitePermissions(sites)});
  if(!permitted){show('extension.denied',true);return;}
  const reply=await chrome.runtime.sendMessage({op:'settings.save',sites:reset?null:sites});
  if(!reply?.ok){show(reply?.error==='permission'?'extension.denied':reply?.error==='invalid'?'extension.invalid':'extension.failed',true);return;}
  accept(reply.state);show(reset?'extension.restored':'extension.saved');
 }catch{show('extension.failed',true);}
 finally{busy=false;render();}
}
form.addEventListener('submit',event=>{event.preventDefault();void save(false);});
document.querySelector('#restore')!.addEventListener('click',()=>{void save(true);});
window.addEventListener('languagechange',render);render();
void chrome.runtime.sendMessage({op:'settings.get'}).then(reply=>{
 if(!reply?.ok)throw new Error('Unavailable');accept(reply.state);
 if(state?.failed)show('extension.loadFailed',true);else render();
}).catch(()=>show('extension.loadFailed',true));
