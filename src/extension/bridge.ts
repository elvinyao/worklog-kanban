import {exact,record,validateConfig,type SiteConfig} from '../contracts/config';
import {parseReply,parseRequest} from '../contracts/preview-messages';
import {allowedPage} from './guards';

// Registration changes affect future navigations. Existing documents resolve again on reconnect.
if(window.top===window){
 let port:chrome.runtime.Port|undefined;
 let connecting:Promise<{port:chrome.runtime.Port;config:SiteConfig}>|undefined;
 let active=true,generation=0;
 function connect(){
  if(connecting)return connecting;const mine=generation;
  connecting=chrome.runtime.sendMessage({op:'settings.resolve'}).then((reply:unknown)=>{
   const response=record(reply);if(response.ok!==true)throw new Error('Unavailable');
   const config=validateConfig(response.config);
   if(!active||mine!==generation||!allowedPage(location.origin,window.top===window,true,config))throw new Error('Unavailable');
   const current=chrome.runtime.connect({name:'worklog'});port=current;
   current.onMessage.addListener((raw:unknown)=>{
    if(!active||port!==current)return;
    try{window.postMessage({channel:'worklog:reply',payload:parseReply(raw,config)},config.boardOrigin);}catch{/* Reject invalid replies. */}
   });
   current.onDisconnect.addListener(()=>{
    if(port!==current)return;port=undefined;connecting=undefined;generation++;
    window.postMessage({channel:'worklog:status',connected:false},config.boardOrigin);
   });
   return {port:current,config};
  });
  void connecting.catch(()=>{if(mine===generation)connecting=undefined;});return connecting;
 }
 window.addEventListener('message',(event:MessageEvent<unknown>)=>{
  if(!active||event.source!==window||event.origin!==location.origin)return;
  try{
   const envelope=record(event.data);exact(envelope,['channel','payload']);if(envelope.channel!=='worklog:request')return;
   const request=parseRequest(envelope.payload),mine=generation;
   void connect().then(connection=>{if(active&&mine===generation&&port===connection.port&&allowedPage(event.origin,window.top===window,event.source===window,connection.config))connection.port.postMessage(request);})
    .catch(()=>{if(active&&mine===generation)window.postMessage({channel:'worklog:status',connected:false},location.origin);});
  }catch{/* Invalid page messages never reach privileged code. */}
 });
 window.addEventListener('pagehide',()=>{active=false;generation++;const old=port;port=undefined;connecting=undefined;old?.disconnect();});
 window.addEventListener('pageshow',()=>{active=true;});
}
