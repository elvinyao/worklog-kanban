// Only explicit user-input projections belong here. Never store API snapshots or previews.
export const DRAFT_PREFIX='worklog.draft.v1.';
export const DRAFT_TTL=7*24*60*60*1000;
const MAX_BYTES=512000;
export interface SavedDraft {id:string;scope:string;savedAt:number;value:unknown}
const unsafeKeys=new Set(['preview','avatar','cookie','token','snapshot','__proto__','constructor','prototype']);
function safe(value:unknown,depth=0):boolean{
 if(depth>12)return false;
 if(value===null||typeof value==='boolean')return true;
 if(typeof value==='string')return value.length<=20000;
 if(typeof value==='number')return Number.isSafeInteger(value)&&value>=0;
 if(Array.isArray(value))return value.length<=5000&&value.every(item=>safe(item,depth+1));
 if(typeof value==='object')return Object.entries(value).every(([key,item])=>!unsafeKeys.has(key)&&safe(item,depth+1));
 return false;
}
export function listDrafts(storage:Storage,scope?:string,now=Date.now()):SavedDraft[]{
 const result:SavedDraft[]=[];
 for(const key of Array.from({length:storage.length},(_,index)=>storage.key(index))){
  if(!key?.startsWith(DRAFT_PREFIX))continue;
  try{
   const raw=storage.getItem(key)!;if(raw.length>MAX_BYTES)throw new Error();
   const item=JSON.parse(raw) as SavedDraft;
   if(item.id!==key.slice(DRAFT_PREFIX.length)||typeof item.scope!=='string'||!Number.isSafeInteger(item.savedAt)||item.savedAt>now||now-item.savedAt>DRAFT_TTL||!safe(item.value))throw new Error();
   if(scope===undefined||item.scope===scope)result.push(item);
  }catch{storage.removeItem(key);}
 }
 return result.sort((left,right)=>right.savedAt-left.savedAt);
}
export function saveDraft(storage:Storage,item:SavedDraft){
 if(!safe(item.value))throw new Error('Invalid draft');
 const raw=JSON.stringify(item);if(raw.length>MAX_BYTES)throw new Error('Draft too large');
 listDrafts(storage,item.scope);
 // Separate records per editing session avoid one tab overwriting another.
 const keys=Array.from({length:storage.length},(_,index)=>storage.key(index)).filter(key=>key?.startsWith(DRAFT_PREFIX));
 if(!storage.getItem(DRAFT_PREFIX+item.id)&&keys.length>=20)throw new Error('Draft limit reached');
 storage.setItem(DRAFT_PREFIX+item.id,raw);
}
