import {useEffect,useRef,useState} from 'react';
import {DRAFT_PREFIX,listDrafts,saveDraft,type SavedDraft} from '../state/local-drafts';
import {useLanguage} from '../i18n';
import {Modal} from './Modal';

export function SavedDraftsDialog({close}:{close:()=>void}){
 const {t,date}=useLanguage();const [failed,setFailed]=useState(false);
 const [items,setItems]=useState(()=>{try{return listDrafts(localStorage);}catch{return [];}});
 return <Modal title={t('draft.all')} close={close}><div className="dialog-head"><h2>{t('draft.all')}</h2><button onClick={close}>{t('common.close')}</button></div><div className="dialog-content"><p>{t('draft.copyHint')}</p>{!items.length&&<p>{t('draft.empty')}</p>}{failed&&<p role="alert">{t('draft.failed')}</p>}{items.map(item=><section key={item.id}><label>{item.scope} · {date(new Date(item.savedAt).toISOString())}<textarea readOnly rows={6} value={JSON.stringify(item.value,null,2)} onFocus={event=>event.currentTarget.select()}/></label><button onClick={()=>{try{localStorage.removeItem(DRAFT_PREFIX+item.id);setItems(previous=>previous.filter(row=>row.id!==item.id));}catch{setFailed(true);}}}>{t('columns.discardDraft')}</button></section>)}</div></Modal>;
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
