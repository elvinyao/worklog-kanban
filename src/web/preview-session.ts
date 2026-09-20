import type {SiteConfig} from '../contracts/config';
import {ExtensionClient,type DisconnectReason} from './extension-client';
import {PreviewStore,type PreviewView,type Transport} from './state/preview';
import {TransportError} from './transport-error';

export type Connection='connecting'|'reconnecting'|'connected'|'unavailable'|'configuration_mismatch';
export interface SessionClient extends Transport {dispose:()=>void;request:ExtensionClient['request']}
type ClientFactory=(lost:(reason:DisconnectReason)=>void)=>SessionClient;

// Worker suspension is a transport event. Private content stays in this page only,
// while configuration/permission invalidation and failed recovery still clear it.
export class PreviewSession {
 readonly store:PreviewStore;
 private client:SessionClient|undefined;
 private timer:ReturnType<typeof setTimeout>|undefined;
 private generation=0;
 private closed=false;
 private started=false;
 constructor(config:SiteConfig,changed:(views:ReadonlyMap<string,PreviewView>)=>void,private status:(state:Connection)=>void,cooldowns=new Map<string,number>(),private createClient:ClientFactory=lost=>new ExtensionClient(config,lost)){
  this.store=new PreviewStore({request:request=>this.client?.request(request)??Promise.reject(new TransportError('disconnected')),cancel:id=>this.client?.cancel(id)},changed,Date.now,cooldowns);
 }
 start(){if(this.started||this.closed)return;this.started=true;this.status('connecting');this.connect(false,0);}
 private release(){this.generation++;clearTimeout(this.timer);this.timer=undefined;const old=this.client;this.client=undefined;old?.dispose();}
 private stop(state:Connection){this.release();this.store.disconnect();this.status(state);}
 private connect(recovering:boolean,attempt:number){
  if(this.closed)return;this.release();const generation=this.generation;let handshaking=true;
  const current=()=>!this.closed&&generation===this.generation;
  const failed=()=>{
   if(!current())return;this.release();
   if(recovering&&attempt<2)this.timer=setTimeout(()=>this.connect(true,attempt+1),[1000,3000][attempt]);
   else this.stop('unavailable');
  };
  const client=this.createClient(reason=>{
   if(!current())return;
   if(reason==='invalidated'){this.stop('unavailable');return;}
   if(handshaking){failed();return;}
   this.store.suspend();this.status('reconnecting');this.connect(true,0);
  });this.client=client;
  void client.request({version:1,id:crypto.randomUUID(),op:'hello'},2500).then(reply=>{
   if(!current())return;
   if(!reply.ok){this.stop(reply.error.code==='configuration_mismatch'?'configuration_mismatch':'unavailable');return;}
   if(!('connected' in reply.data)){failed();return;}
   handshaking=false;this.status('connected');this.store.connect(recovering);
  }).catch(failed);
 }
 close(){if(this.closed)return;this.closed=true;this.release();this.store.dispose();}
}
