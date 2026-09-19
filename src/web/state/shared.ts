import type { Snapshot } from '../api';
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
 constructor(private subscribe:(listener:Subscription)=>()=>void,private fetcher:(signal:AbortSignal)=>Promise<Snapshot>,private changed:(snapshot:Snapshot)=>void,private status:(status:string)=>void){}
 start(){
   if(this.remove||this.closed)return;
   this.status('正在连接');
   this.remove=this.subscribe({
     open:()=>{this.initial=true;this.connected=true;},
     revision:value=>{
       if(this.closed||!Number.isSafeInteger(value)||value<0)return;
       this.wanted=Math.max(this.wanted,value);
       if(this.initial){this.initial=false;this.refresh=true;}
       this.read();
     },
     error:()=>{this.connected=false;if(!this.closed)this.status('连接中断，正在重连');},
   });
 }
 accept(snapshot:Snapshot){
   if(this.closed||snapshot.revision<this.applied)return;
   this.applied=snapshot.revision;this.changed(snapshot);
 }
 reload(){if(!this.closed){this.refresh=true;this.read();}}
 private read(){
   if(this.closed||this.controller||(!this.refresh&&this.wanted<=this.applied))return;
   this.refresh=false;
   const wantedAtStart=this.wanted;
   const controller=new AbortController();this.controller=controller;
   let succeeded=false;
   void this.fetcher(controller.signal).then(snapshot=>{
     if(this.closed)return;
     this.accept(snapshot);succeeded=true;if(this.connected)this.status('已同步');
   }).catch(()=>{if(!this.closed)this.status('读取失败，请重试');}).finally(()=>{
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
