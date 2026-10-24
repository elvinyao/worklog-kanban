import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import type {Draft,Fields} from '../state/drafts';
import {DRAFT_PREFIX,listDrafts,saveDraft,type SavedDraft} from '../state/local-drafts';
import {useLanguage} from '../i18n';
import {Modal} from './Modal';

export const object=(value:unknown):Record<string,unknown>=>{if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid draft');return value as Record<string,unknown>;};
export const text=(value:unknown,max=20000):string=>{if(typeof value!=='string'||value.length>max)throw new Error('Invalid text');return value;};
export const number=(value:unknown):number=>{if(!Number.isSafeInteger(value)||(value as number)<0)throw new Error('Invalid revision');return value as number;};
export const strings=(value:unknown):string[]=>{if(!Array.isArray(value)||value.length>5000)throw new Error('Invalid selection');return value.map(item=>text(item,100));};
function fields(value:unknown):Fields{
 const data=object(value);
 const list=(raw:unknown,max:number)=>{if(!Array.isArray(raw)||raw.length>max)throw new Error('Invalid links');return raw;};
 const message=(raw:unknown)=>{const row=object(raw);return {draftId:text(row.draftId,100),url:text(row.url,2048),description:text(row.description,2000)};};
 return {title:text(data.title,200),notes:text(data.notes),jiraLinks:list(data.jiraLinks,20).map(raw=>{const row=object(raw);return {draftId:text(row.draftId,100),url:text(row.url,2048),mattermostLinks:list(row.mattermostLinks,20).map(message)};}),unassignedMattermostLinks:list(data.unassignedMattermostLinks,20).map(raw=>({...message(raw),id:text(object(raw).id,100)}))};
}
export function cardDraft(value:unknown):Draft{const data=object(value);return {baseVersion:number(data.baseVersion),baseline:fields(data.baseline),fields:fields(data.fields)};}

// Register every editable dialog with routing and browser-navigation protection.
export function useDraftGuard({dirty,busy=false,close,onDirtyChange,onDirtyClose}:{dirty:boolean;busy?:boolean;close:()=>void;onDirtyChange?:((dirty:boolean)=>void)|undefined;onDirtyClose?:()=>void}){
 const {t}=useLanguage();
 const protectedDraft=dirty||busy;
 useLayoutEffect(()=>{onDirtyChange?.(protectedDraft);return()=>onDirtyChange?.(false);},[protectedDraft,onDirtyChange]);
 useEffect(()=>{
  if(!protectedDraft)return;
  const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();};
  window.addEventListener('beforeunload',warn);
  return()=>window.removeEventListener('beforeunload',warn);
 },[protectedDraft]);
 return ()=>{if(busy)return;if(!dirty)close();else if(onDirtyClose)onDirtyClose();else if(window.confirm(t('card.unsavedChanges')))close();};
}

export function SavedDraftsDialog({close}:{close:()=>void}){
 const {t,date}=useLanguage();const [failed,setFailed]=useState(false);
 const [items,setItems]=useState(()=>{try{return listDrafts(localStorage);}catch{return [];}});
 return <Modal title={t('draft.all')} close={close}><div className="dialog-head"><h2>{t('draft.all')}</h2><button onClick={close}>{t('common.close')}</button></div><div className="dialog-content">{!items.length&&<p>{t('draft.empty')}</p>}{failed&&<p role="alert">{t('draft.failed')}</p>}{items.map(item=><section key={item.id}><label>{item.scope} · {date(new Date(item.savedAt).toISOString())}<textarea readOnly rows={6} value={JSON.stringify(item.value,null,2)} onFocus={event=>event.currentTarget.select()}/></label><button onClick={()=>{try{localStorage.removeItem(DRAFT_PREFIX+item.id);setItems(previous=>previous.filter(row=>row.id!==item.id));}catch{setFailed(true);}}}>{t('columns.discardDraft')}</button></section>)}</div></Modal>;
}

export function useLocalDraft<T>(scope:string,value:T,restore:(value:unknown)=>void){
 const [enabled,setEnabled]=useState(false),[failed,setFailed]=useState(false);
 const [choices,setChoices]=useState<SavedDraft[]>(()=>{try{return listDrafts(localStorage,scope);}catch{return [];}});
 const id=useRef(crypto.randomUUID()),finished=useRef(false),latest=useRef(value);latest.current=value;
 const persist=(value=latest.current)=>{if(!enabled||finished.current)return;try{saveDraft(localStorage,{id:id.current,scope,savedAt:Date.now(),value});setFailed(false);}catch{setFailed(true);}};
 useEffect(()=>{persist();},[value,enabled]);
 useEffect(()=>{
  const save=()=>persist();window.addEventListener('pagehide',save);window.addEventListener('beforeunload',save);
  return()=>{window.removeEventListener('pagehide',save);window.removeEventListener('beforeunload',save);};
 },[enabled,scope]);
 const clear=()=>{finished.current=true;try{localStorage.removeItem(DRAFT_PREFIX+id.current);}catch{setFailed(true);}};
 const toggle=(next:boolean)=>{if(!next){try{localStorage.removeItem(DRAFT_PREFIX+id.current);}catch{setFailed(true);}}setEnabled(next);};
 const recover=(item:SavedDraft)=>{try{restore(item.value);saveDraft(localStorage,{...item,id:id.current,savedAt:Date.now()});localStorage.removeItem(DRAFT_PREFIX+item.id);setEnabled(true);setChoices(previous=>previous.filter(choice=>choice.id!==item.id));}catch{setFailed(true);}};
 const discard=()=>{try{for(const item of choices)localStorage.removeItem(DRAFT_PREFIX+item.id);setChoices([]);}catch{setFailed(true);}};
 return {clear,persist,enabled,failed,choices,toggle,recover,discard};
}
export function LocalDraft({draft,busy=false}:{draft:Pick<ReturnType<typeof useLocalDraft>,'enabled'|'failed'|'choices'|'toggle'|'recover'|'discard'>;busy?:boolean}){
 const {t,date}=useLanguage();
 return <section className="notice"><label className="check-label"><input type="checkbox" checked={draft.enabled} disabled={busy} onChange={event=>draft.toggle(event.target.checked)}/>{t('draft.localOptIn')}</label>
  {draft.failed&&<p role="alert">{t('draft.failed')}</p>}
  {!!draft.choices.length&&<><p>{t('draft.available')}</p>{draft.choices.map(item=><button type="button" key={item.id} disabled={busy} onClick={()=>draft.recover(item)}>{t('draft.restore',{date:date(new Date(item.savedAt).toISOString())})}</button>)}<button type="button" disabled={busy} onClick={draft.discard}>{t('draft.discardSaved')}</button></>}
 </section>;
}
