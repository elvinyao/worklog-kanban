import { useEffect,useRef,useState } from 'react';
import { api,ApiError,errorText,type Card,type Snapshot } from '../api';
import { draftFrom,isDirty,payloadFrom,reconcileDraft,type Draft,type Fields } from '../state/drafts';
import {useLanguage} from '../i18n';
import type {MessageKey} from '../i18n/core';
import { Modal } from './Modal';
import { JiraLinksEditor } from './JiraLinksEditor';
import { CardLinks } from './CardLinks';
import {PreviewToolbar} from './PreviewProvider';

export function CardDialog({card,columnId,snapshot,accept,reload,close,missing=false,onDirtyChange}:{card:Card|undefined;columnId:string;snapshot:Snapshot;accept:(value:Snapshot)=>void;reload:()=>void;close:()=>void;missing?:boolean;onDirtyChange?:(dirty:boolean)=>void}){
 const {t,column:columnLabel}=useLanguage();
 const [draft,setDraft]=useState<Draft>(()=>draftFrom(card??{id:'new',title:'',notes:'',version:0,columnId,position:0,jiraLinks:[],unassignedMattermostLinks:[]}));
 const [saving,setSaving]=useState(false);const [error,setError]=useState<MessageKey|''>('');const [conflict,setConflict]=useState(false);const [closing,setClosing]=useState(false);
 const [target,setTarget]=useState(columnId);
 const pendingCreate=useRef<Parameters<typeof api.createCard>[0]|null>(null),inFlight=useRef(false);
 const [uncertain,setUncertain]=useState(false);
 const [archiveId,setArchiveId]=useState<string>();const [lookup,setLookup]=useState(0);const [copyVisible,setCopyVisible]=useState(false);const gone=missing||!!archiveId;
 const dirty=isDirty(draft)||(!card&&target!==columnId)||uncertain;
 useEffect(()=>{onDirtyChange?.(dirty);return()=>onDirtyChange?.(false);},[dirty,onDirtyChange]);
 useEffect(()=>{if(!dirty)return;const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[dirty]);
 useEffect(()=>{if(!missing||!card)return;const abort=new AbortController();void api.archiveLocation(card.id,abort.signal).then(value=>setArchiveId(value.archiveId)).catch(reason=>{if(!abort.signal.aborted)setError(errorText(reason));});return()=>abort.abort();},[missing,card?.id,lookup]);
 const targetExists=snapshot.columns.some(column=>column.id===target);
 useEffect(()=>{if(card)setDraft(value=>reconcileDraft(value,card));},[card]);
 const field=<K extends keyof Fields>(key:K,value:Fields[K])=>setDraft(previous=>({...previous,fields:{...previous.fields,[key]:value}}));
 const requestClose=()=>{if(saving)return;if(dirty)setClosing(true);else close();};
 const requestCloseDiscard=()=>{if(!saving)close();};
 async function save(compare=false){
  if(gone||inFlight.current||(!card&&!targetExists&&!pendingCreate.current))return;
  inFlight.current=true;setSaving(true);setError('');
  try{
   const fields=payloadFrom(draft);
   if(!card)pendingCreate.current??={requestId:crypto.randomUUID(),title:fields.title,notes:fields.notes,jiraLinks:fields.jiraLinks,columnId:target};
   const result=card?await api.editCard(card.id,{...fields,expectedVersion:compare?card.version:draft.baseVersion}):await api.createCard(pendingCreate.current!);
   accept(result);close();
  }catch(reason){
   setError(errorText(reason));
   if(!card){
    // A rejected replay cannot establish whether an earlier uncertain attempt committed.
    const rejected=!uncertain&&reason instanceof ApiError&&reason.status>=400&&reason.status<500&&reason.status!==408;
    if(rejected)pendingCreate.current=null;
    setUncertain(!rejected);reload();
   }
   if(reason instanceof ApiError&&reason.code==='archived')setArchiveId(reason.archiveId);
   if(card&&reason instanceof ApiError&&reason.status===409){setConflict(true);reload();}
  }
  finally{inFlight.current=false;setSaving(false);}
 }
 const footerColumn=snapshot.columns.find(column=>column.id===(card?.columnId??target));
 const changed=!!card&&card.version!==draft.baseVersion&&isDirty(draft);
 return <Modal title={t(card?'card.details':'card.new')} close={requestClose}>
  <div className="dialog-head"><div><span className="eyebrow">{t('card.eyebrow')}</span><h2>{t(card?'card.details':'card.new')}</h2></div><button className="icon" aria-label={t("card.close")} onClick={requestClose} disabled={saving}>×</button></div>
  <form onSubmit={event=>{event.preventDefault();void save();}}>
   <div className="dialog-content">
    <PreviewToolbar/>
    {gone&&<div className="notice"><strong>{t('archive.archivedDraft')}</strong><div className="row-actions">{archiveId?<a href={'#/archives/'+archiveId}>{t('archive.view')}</a>:<button type="button" onClick={()=>setLookup(value=>value+1)}>{t('sync.refresh')}</button>}<button type="button" onClick={()=>{setCopyVisible(true);void navigator.clipboard?.writeText(JSON.stringify(payloadFrom(draft),null,2)).catch(()=>{});}}>{t('archive.copyDraft')}</button></div>{copyVisible&&<label>{t('archive.draftCopy')}<textarea readOnly rows={6} value={JSON.stringify(payloadFrom(draft),null,2)} onFocus={event=>event.target.select()}/></label>}</div>}
    <p className="hint">{t("card.sharedFieldsHint")}</p>
    <fieldset disabled={saving||uncertain}>
     {!card&&<><label>{t("card.column")}<select value={targetExists?target:''} onChange={event=>setTarget(event.target.value)}><option value="" disabled>{t("card.chooseColumn")}</option>{snapshot.columns.map(column=><option key={column.id} value={column.id}>{columnLabel(column)}</option>)}</select></label>{!targetExists&&<p className="notice">{t("card.columnDeleted")}</p>}</>}
     <label>{t("card.sharedTitle")}<input autoFocus required maxLength={200} value={draft.fields.title} onChange={event=>field('title',event.target.value)} placeholder={t("card.titlePlaceholder")}/></label>
     <label>{t("card.sharedNotes")}<textarea rows={7} maxLength={20000} value={draft.fields.notes} onChange={event=>field('notes',event.target.value)} placeholder={t("card.notesPlaceholder")}/></label>
     <JiraLinksEditor fields={draft.fields} change={fields=>setDraft(previous=>({...previous,fields}))}/>
    </fieldset>
    {card&&(card.jiraLinks.length>0||card.unassignedMattermostLinks.length>0)&&<div className="personal-detail"><div className="section-title"><h3>{t("preview.title")}</h3><span className="hint">{t("preview.sessionHint")}</span></div><CardLinks card={card} previews/></div>}
    {changed&&<div className="notice"><strong>{t("card.draftPreserved")}</strong><details open={conflict}><summary>{t("card.compareSharedContent")}</summary><p>{t('card.currentTitle',{title:card.title})}</p><pre>{card.notes||t('card.emptyNotes')}</pre><CardLinks card={card}/></details></div>}
    {error&&<p role="alert" className="error">{t(error)}</p>}
    {uncertain&&<p className="notice">{t('card.createUncertain')}</p>}
    {closing&&<div className="notice" role="alert"><p>{t("card.unsavedChanges")}</p><div className="row-actions"><button type="button" disabled={saving} onClick={()=>setClosing(false)}>{t("card.keepEditing")}</button><button type="button" disabled={saving} onClick={requestCloseDiscard}>{t("card.discardAndClose")}</button></div></div>}
   </div>
   <footer className="dialog-footer"><span className="hint">{footerColumn?columnLabel(footerColumn):''}</span><div className="row-actions">{conflict&&changed&&!gone&&<button type="button" disabled={saving} onClick={()=>void save(true)}>{t("card.saveComparedDraft")}</button>}<button type="submit" className="primary" disabled={gone||saving||!draft.fields.title.trim()||(!card&&!targetExists&&!pendingCreate.current)}>{t(saving?'common.saving':card?'card.saveChanges':uncertain?'card.retryCreate':'card.create')}</button></div></footer>
  </form>
 </Modal>;
}
