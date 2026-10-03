import type {ArchiveList,ArchiveSummary} from '../api';

export interface ArchivePageState {
 items:ArchiveSummary[];
 total:number;
 cursor:string|null;
 busy:boolean;
 error:unknown;
}
type FetchPage=(query:string,cursor:string|null,signal:AbortSignal)=>Promise<ArchiveList>;
type ReadKind='refresh'|'more';
export const emptyArchivePages=():ArchivePageState=>({items:[],total:0,cursor:null,busy:false,error:null});

// Keep successfully read pages across navigation. Only archive changes invalidate
// their cursor chain; loading more requests exactly the next page.
export class ArchivePages {
 private state=emptyArchivePages();
 private query='';
 private revision='';
 private active=false;
 private disposed=false;
 private pages=0;
 private needsRefresh=true;
 private failed:ReadKind='refresh';
 private controller:AbortController|undefined;
 private timer:ReturnType<typeof setTimeout>|undefined;

 constructor(private fetchPage:FetchPage,private changed:(state:ArchivePageState)=>void){}

 configure(query:string,revision:string,active:boolean){
  if(this.disposed)return;
  const queryChanged=query!==this.query;
  const invalidated=queryChanged||revision!==this.revision;
  this.query=query;this.revision=revision;this.active=active;
  if(invalidated||!active)this.cancel();
  if(queryChanged){this.pages=0;this.state=emptyArchivePages();}
  if(invalidated)this.needsRefresh=true;
  if(!active){this.emit({busy:false});return;}
  if(this.needsRefresh&&!this.controller&&!this.timer){
   this.emit({busy:true,error:null});
   this.timer=setTimeout(()=>{this.timer=undefined;void this.read('refresh');},150);
  }else if(queryChanged)this.emit({});
 }

 more(){if(this.active&&!this.state.busy&&!this.needsRefresh&&this.state.cursor)void this.read('more');}
 retry(){
  if(!this.active||this.state.busy)return;
  void this.read(this.needsRefresh?'refresh':this.failed);
 }
 private emit(patch:Partial<ArchivePageState>){this.state={...this.state,...patch};this.changed(this.state);}
 private cancel(){
  clearTimeout(this.timer);this.timer=undefined;
  this.controller?.abort();this.controller=undefined;
 }
 private async read(kind:ReadKind){
  if(this.disposed||!this.active||this.controller)return;
  const controller=new AbortController();this.controller=controller;
  const current=()=>!this.disposed&&this.active&&this.controller===controller&&!controller.signal.aborted;
  this.failed=kind;this.emit({busy:true,error:null});
  try{
   const count=kind==='more'?1:Math.max(1,this.pages);
   let cursor=kind==='more'?this.state.cursor:null;
   let items=kind==='more'?[...this.state.items]:[];
   let total=0,loaded=0;
   for(let index=0;index<count;index++){
    const page=await this.fetchPage(this.query,cursor,controller.signal);
    if(!current())return;
    items.push(...page.items);total=page.total;cursor=page.nextCursor??null;loaded++;
    if(!cursor)break;
   }
   this.pages=kind==='more'?this.pages+loaded:loaded;
   this.needsRefresh=false;
   // A moving search result must never introduce duplicate React keys.
   this.emit({items:[...new Map(items.map(item=>[item.id,item])).values()],total,cursor,error:null});
  }catch(error){if(current())this.emit({error});}
  finally{if(current()){this.controller=undefined;this.emit({busy:false});}}
 }
 dispose(){this.disposed=true;this.cancel();}
}
