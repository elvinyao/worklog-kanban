import type { PreviewRequest,PreviewReply,PreviewState,Preview,PreviewError } from '../../contracts/preview-messages';
import type { Resource } from '../../contracts/resource-links';
import { TransportError } from '../transport-error';
export interface Transport {request:(value:PreviewRequest)=>Promise<PreviewReply>;cancel:(id:string)=>void}
export interface PreviewView {state:PreviewState;retryAt:number}
// Post IDs identify messages across team-link aliases; links themselves remain unchanged.
export const resourceKey=(resource:Resource)=>resource.kind==='jira'?resource.url:'mattermost:'+resource.url.slice(0,-('/'+resource.team+'/pl/'+resource.id).length)+':'+resource.id;
interface Entry {resource:Resource;view:PreviewView;cached:{data:Preview;lastSuccess:number}|undefined;id:string|undefined;queued:boolean}
export class PreviewStore {
 private entries=new Map<string,Entry>();
 private queue:Entry[]=[];
 private active=0;
 private connected=false;
 private disposed=false;
 constructor(private transport:Transport,private changed:(views:ReadonlyMap<string,PreviewView>)=>void,private now:()=>number=Date.now,private cooldowns:Map<string,number>=new Map()){}
 private emit(){this.changed(new Map([...this.entries].map(([key,entry])=>[key,entry.view])));}
 setResources(resources:Resource[]){
  if(this.disposed)return;
  const wanted=new Map(resources.map(resource=>[resourceKey(resource),resource]));
  for(const [key,entry] of this.entries)if(!wanted.has(key)){this.cancel(entry);entry.cached=undefined;this.entries.delete(key);}
  for(const [key,resource] of wanted)if(!this.entries.has(key)){
   const entry:Entry={resource,view:{state:{status:'idle'},retryAt:this.cooldowns.get(key)??0},cached:undefined,id:undefined,queued:false};
   this.entries.set(key,entry);if(this.connected)this.enqueue(entry);
  }
  this.emit();this.pump();
 }
 connect(resume=false){if(this.disposed||this.connected)return;this.connected=true;for(const entry of this.entries.values())if(!resume||entry.view.state.status==='idle'||(entry.view.state.status==='stale'&&entry.view.state.error.code==='disconnected'))this.enqueue(entry);this.emit();this.pump();}
 refresh(key:string){const entry=this.entries.get(key);if(!this.connected||this.disposed||!entry)return;this.enqueue(entry);this.emit();this.pump();}
 refreshAll(){if(!this.connected||this.disposed)return;for(const entry of this.entries.values())this.enqueue(entry);this.emit();this.pump();}
 private enqueue(entry:Entry){
  if(entry.id||entry.queued)return;
  const retryAt=this.cooldowns.get(resourceKey(entry.resource))??0;
  if(this.now()<retryAt){entry.view={state:entry.cached?{status:'stale',...entry.cached,error:{code:'rate_limited'}}:{status:'error',error:{code:'rate_limited'}},retryAt};return;}
  this.cooldowns.delete(resourceKey(entry.resource));
  entry.view={state:{status:'loading'},retryAt:0};entry.queued=true;this.queue.push(entry);
 }
 private pump(){
  while(!this.disposed&&this.connected&&this.active<4&&this.queue.length){
   const entry=this.queue.shift()!;entry.queued=false;
   const key=resourceKey(entry.resource);if(this.entries.get(key)!==entry)continue;
   const id=crypto.randomUUID();entry.id=id;this.active++;
   const request:PreviewRequest=entry.resource.kind==='jira'?{version:1,id,op:'jira.preview',key:entry.resource.id}:{version:1,id,op:'mattermost.preview',postId:entry.resource.id,team:entry.resource.team};
   const current=()=>!this.disposed&&this.connected&&this.entries.get(key)===entry&&entry.id===id;
   void this.transport.request(request).then(reply=>{
    if(!current())return;
    if(!reply.ok){this.failed(entry,reply.error);return;}
    if(!('kind' in reply.data)||reply.data.kind!==entry.resource.kind||reply.data.url!==entry.resource.url){this.failed(entry,{code:'protocol'});return;}
    entry.cached={data:reply.data,lastSuccess:this.now()};entry.view={state:{status:'ready',...entry.cached},retryAt:0};
   }).catch(error=>{if(current())this.failed(entry,{code:error instanceof TransportError&&error.code==='network'?'network':'disconnected'});}).finally(()=>{
    this.active--;if(current()){entry.id=undefined;this.emit();}this.pump();
   });
  }
 }
 private failed(entry:Entry,error:PreviewError){
  let retryAt=0;
  if(error.code==='rate_limited'){retryAt=Math.min(Number.MAX_SAFE_INTEGER,this.now()+(error.retryAfterMs??60000));this.cooldowns.set(resourceKey(entry.resource),retryAt);}
  if(error.code==='network'||error.code==='rate_limited'){
   entry.view={state:entry.cached?{status:'stale',...entry.cached,error}:{status:'error',error},retryAt};
  }else{entry.cached=undefined;entry.view={state:{status:'error',error},retryAt};}
 }
 private cancel(entry:Entry){if(entry.id){const id=entry.id;entry.id=undefined;this.transport.cancel(id);}entry.queued=false;}
 suspend(){
  if(this.disposed)return;this.connected=false;this.queue=[];
  for(const entry of this.entries.values()){
   const interrupted=!!entry.id||entry.queued;this.cancel(entry);
   if(interrupted)entry.view={...entry.view,state:entry.cached?{status:'stale',...entry.cached,error:{code:'disconnected'}}:{status:'idle'}};
  }
  this.emit();
 }
 disconnect(){
  this.connected=false;this.queue=[];
  for(const entry of this.entries.values()){this.cancel(entry);entry.cached=undefined;entry.view={state:{status:'error',error:{code:'disconnected'}},retryAt:this.cooldowns.get(resourceKey(entry.resource))??0};}
  this.emit();
 }
 dispose(){if(this.disposed)return;this.disposed=true;this.disconnect();this.entries.clear();this.emit();}
}
