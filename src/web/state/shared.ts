import type { Snapshot } from '../api';
export type SyncStatus='sync.connecting'|'sync.reconnecting'|'sync.synced'|'sync.loadFailed';
export interface Subscription { open:()=>void; revision:(value:number)=>void; error:()=>void }
export class SharedBoard {
 private remove:(()=>void)|undefined;
 private controller:AbortController|undefined;
 private closed=false;
 private initial=true;
 private wanted=-1;
 private applied=-1;
 private refresh=false;
 private connected=false;
 constructor(private subscribe:(listener:Subscription)=>()=>void,private fetcher:(signal:AbortSignal)=>Promise<Snapshot>,private changed:(snapshot:Snapshot)=>void,private status:(status:SyncStatus)=>void){}
 start(){
   if(this.remove||this.closed)return;
   this.status('sync.connecting');
   this.remove=this.subscribe({
     open:()=>{this.initial=true;this.connected=true;},
     revision:value=>{
       if(this.closed||!Number.isSafeInteger(value)||value<0)return;
       this.wanted=Math.max(this.wanted,value);
       if(this.initial){this.initial=false;this.refresh=true;}
       this.read();
     },
     error:()=>{this.connected=false;if(!this.closed)this.status('sync.reconnecting');},
   });
 }
 accept(snapshot:Snapshot){
   if(this.closed||snapshot.revision<this.applied)return;
   this.applied=snapshot.revision;this.changed(snapshot);
 }
 reload(){
   if(this.closed)return;
   this.controller?.abort();this.controller=undefined;
   this.refresh=true;this.read();
 }
 private read(){
   if(this.closed||this.controller||(!this.refresh&&this.wanted<=this.applied))return;
   this.refresh=false;
   const wantedAtStart=this.wanted;
   const controller=new AbortController();this.controller=controller;
   let succeeded=false;
   void this.fetcher(controller.signal).then(snapshot=>{
     if(this.closed||this.controller!==controller)return;
     this.accept(snapshot);succeeded=true;if(this.connected)this.status('sync.synced');
   }).catch(()=>{if(!this.closed&&this.controller===controller)this.status('sync.loadFailed');}).finally(()=>{
     if(this.controller!==controller)return;
     this.controller=undefined;
     if(succeeded||this.refresh||this.wanted>wantedAtStart)this.read();
   });
 }
 close(){this.closed=true;this.remove?.();this.remove=undefined;this.controller?.abort();}
}

export function subscribe(listener:Subscription):()=>void{
  let events:EventSource|undefined;
  const connect=()=>{
    events?.close();events=new EventSource('/api/events');
    events.onopen=()=>listener.open();events.onerror=()=>listener.error();
    events.addEventListener('revision',event=>{
      try{const data:unknown=JSON.parse((event as MessageEvent<string>).data);
        if(data&&typeof data==='object'&&'revision' in data&&typeof data.revision==='number')listener.revision(data.revision);
      }catch{listener.error();}
    });
  };
  const offline=()=>{events?.close();listener.error();};
  window.addEventListener('offline',offline);window.addEventListener('online',connect);
  if(navigator.onLine)connect();else listener.error();
  return()=>{events?.close();window.removeEventListener('offline',offline);window.removeEventListener('online',connect);};
}
