import {exact,record,validateConfig,type SiteConfig} from '../contracts/config';
import {parseReply,parseRequest,type PreviewReply} from '../contracts/preview-messages';
import {sameSites,sitePermissions} from '../contracts/extension-settings';
import {allowedSender} from './guards';
import {ReadError,readPreview} from './read';
import {ExtensionSettings,SettingsError} from './settings';
import {settingsPlatform} from './settings-platform';

const defaults=validateConfig(__SITE_CONFIG__);
const sessions=new Set<()=>void>();
const settings=new ExtensionSettings(defaults,settingsPlatform(defaults),()=>{for(const close of [...sessions])close();});

// Register listeners synchronously; each operation waits for restored settings before use.
chrome.runtime.onMessage.addListener((raw:unknown,sender,respond)=>{
 let message:Record<string,unknown>;
 try{message=record(raw);if(typeof message.op!=='string'||!message.op.startsWith('settings.'))return false;}catch{return false;}
 const options=sender.id===chrome.runtime.id&&sender.url===chrome.runtime.getURL('options.html')&&(sender.frameId===undefined||sender.frameId===0);
 if(message.op!=='settings.resolve'&&!options)return false;
 void (async()=>{
  if(message.op==='settings.resolve'){
   exact(message,['op']);await settings.state();const config=settings.active;
   if(!config||!allowedSender(sender,chrome.runtime.id,config))throw new Error('Unavailable');
   return {ok:true,config};
  }
  if(message.op==='settings.get'){exact(message,['op']);return {ok:true,state:await settings.state()};}
  if(message.op==='settings.save'){exact(message,['op','sites']);return {ok:true,state:await settings.save(message.sites)};}
  throw new Error('Invalid operation');
 })().then(respond,error=>respond({ok:false,error:error instanceof SettingsError?error.code:'save'}));
 return true;
});
chrome.permissions.onRemoved.addListener(removed=>{
 const config=settings.active;
 const protectedPatterns=[...(config?sitePermissions(config):[]),...settings.pendingSites.flatMap(sitePermissions)];
 if(!config||removed.origins?.some(origin=>protectedPatterns.includes(origin)||origin.includes('*://')||origin.includes('://*')))
  void settings.permissionsRemoved();
});
chrome.action.onClicked.addListener(()=>{void chrome.runtime.openOptionsPage();});

chrome.runtime.onConnect.addListener(port=>{
 const pending=new Map<string,AbortController>();const used=new Set<string>();
 let closed=false,verified=false,config:SiteConfig|null=null,revision=-1;
 const close=()=>{if(closed)return;closed=true;for(const controller of pending.values())controller.abort();pending.clear();used.clear();sessions.delete(close);port.disconnect();};
 if(port.name!=='worklog'){close();return;}sessions.add(close);
 let ordered=settings.state().then(()=>{if(closed)return;config=settings.active;revision=settings.revision;if(!config||!allowedSender(port.sender,chrome.runtime.id,config))close();});
 const send=(reply:PreviewReply)=>{if(!closed&&config&&revision===settings.revision)port.postMessage(parseReply(reply,config));};
 port.onMessage.addListener((raw:unknown)=>{
  ordered=ordered.then(()=>{
   if(closed||!config)return;
   if(revision!==settings.revision||!allowedSender(port.sender,chrome.runtime.id,config)){close();return;}
   let request;try{request=parseRequest(raw);}catch{return;}
   if(used.has(request.id))return;used.add(request.id);if(used.size>10000){close();return;}
   const envelope={version:1 as const,id:request.id};
   if(request.op==='hello'){
    verified=!!request.sites&&sameSites(request.sites,config);
    if(!verified){for(const controller of pending.values())controller.abort();pending.clear();}
    send(verified?{...envelope,ok:true,data:{connected:true}}:{...envelope,ok:false,error:{code:'configuration_mismatch'}});return;
   }
   if(request.op==='cancel'){pending.get(request.targetId)?.abort();send({...envelope,ok:true,data:{cancelled:true}});return;}
   if(!verified){send({...envelope,ok:false,error:{code:'configuration_mismatch'}});return;}
   if(pending.size>=4){send({...envelope,ok:false,error:{code:'rate_limited',retryAfterMs:1000}});return;}
   const controller=new AbortController();pending.set(request.id,controller);
   void readPreview(request,config,controller.signal).then(data=>{if(!controller.signal.aborted)send({...envelope,ok:true,data});}).catch((error:unknown)=>{
    if(controller.signal.aborted)return;
    const safe=error instanceof ReadError?{code:error.code,...(error.retryAfterMs!==undefined?{retryAfterMs:error.retryAfterMs}:{})}:{code:'network' as const};
    send({...envelope,ok:false,error:safe});
   }).finally(()=>pending.delete(request.id));
  }).catch(close);
 });
 port.onDisconnect.addListener(close);
});
