import { useEffect,useState } from 'react';
import { api,ApiError,errorText,type Card,type Snapshot } from '../api';
import { draftFrom,isDirty,payloadFrom,reconcileDraft,type Draft,type Fields } from '../state/drafts';
import {useLanguage} from '../i18n';
import type {MessageKey} from '../i18n/core';
import { Modal } from './Modal';
import { JiraLinksEditor } from './JiraLinksEditor';
import { CardLinks } from './CardLinks';
import {PreviewToolbar} from './PreviewProvider';

export function CardDialog({card,columnId,snapshot,accept,reload,close}:{card:Card|undefined;columnId:string;snapshot:Snapshot;accept:(value:Snapshot)=>void;reload:()=>void;close:()=>void}){
 const {t,column:columnLabel}=useLanguage();
 const [draft,setDraft]=useState<Draft>(()=>draftFrom(card??{id:'new',title:'',notes:'',version:0,columnId,position:0,jiraLinks:[],unassignedMattermostLinks:[]}));
 const [saving,setSaving]=useState(false);const [error,setError]=useState<MessageKey|''>('');const [conflict,setConflict]=useState(false);const [closing,setClosing]=useState(false);
 const [target,setTarget]=useState(columnId);
 const targetExists=snapshot.columns.some(column=>column.id===target);
 useEffect(()=>{if(card)setDraft(value=>reconcileDraft(value,card));},[card]);
 const field=<K extends keyof Fields>(key:K,value:Fields[K])=>setDraft(previous=>({...previous,fields:{...previous.fields,[key]:value}}));
 const requestClose=()=>{if(saving)return;if(isDirty(draft))setClosing(true);else close();};
 const requestCloseDiscard=()=>{if(!saving)close();};
 async function save(compare=false){
  if(saving||(!card&&!targetExists))return;setSaving(true);setError('');
  try{
   const fields=payloadFrom(draft);
   const result=card?await api.editCard(card.id,{...fields,expectedVersion:compare?card.version:draft.baseVersion}):await api.createCard({title:fields.title,notes:fields.notes,jiraLinks:fields.jiraLinks,columnId:target});
   accept(result);close();
  }catch(reason){setError(errorText(reason));if(reason instanceof ApiError&&reason.status===409){setConflict(true);reload();}}
  finally{setSaving(false);}
 }
 const footerColumn=snapshot.columns.find(column=>column.id===(card?.columnId??target));
 const changed=!!card&&card.version!==draft.baseVersion&&isDirty(draft);
 return <Modal title={t(card?'card.details':'card.new')} close={requestClose}>
  <div className="dialog-head"><div><span className="eyebrow">{t('card.eyebrow')}</span><h2>{t(card?'card.details':'card.new')}</h2></div><button className="icon" aria-label={t("card.close")} onClick={requestClose} disabled={saving}>×</button></div>
  <form onSubmit={event=>{event.preventDefault();void save();}}>
   <div className="dialog-content">
    <PreviewToolbar/>
    <p className="hint">{t("card.sharedFieldsHint")}</p>
    <fieldset disabled={saving}>
     {!card&&<><label>{t("card.column")}<select value={targetExists?target:''} onChange={event=>setTarget(event.target.value)}><option value="" disabled>{t("card.chooseColumn")}</option>{snapshot.columns.map(column=><option key={column.id} value={column.id}>{columnLabel(column)}</option>)}</select></label>{!targetExists&&<p className="notice">{t("card.columnDeleted")}</p>}</>}
     <label>{t("card.sharedTitle")}<input autoFocus required maxLength={200} value={draft.fields.title} onChange={event=>field('title',event.target.value)} placeholder={t("card.titlePlaceholder")}/></label>
     <label>{t("card.sharedNotes")}<textarea rows={7} maxLength={20000} value={draft.fields.notes} onChange={event=>field('notes',event.target.value)} placeholder={t("card.notesPlaceholder")}/></label>
     <JiraLinksEditor fields={draft.fields} change={fields=>setDraft(previous=>({...previous,fields}))}/>
    </fieldset>
    {card&&(card.jiraLinks.length>0||card.unassignedMattermostLinks.length>0)&&<div className="personal-detail"><div className="section-title"><h3>{t("preview.title")}</h3><span className="hint">{t("preview.sessionHint")}</span></div><CardLinks card={card} previews/></div>}
    {changed&&<div className="notice"><strong>{t("card.draftPreserved")}</strong><details open={conflict}><summary>{t("card.compareSharedContent")}</summary><p>{t('card.currentTitle',{title:card.title})}</p><pre>{card.notes||t('card.emptyNotes')}</pre><CardLinks card={card}/></details></div>}
    {error&&<p role="alert" className="error">{t(error)}</p>}
    {closing&&<div className="notice" role="alert"><p>{t("card.unsavedChanges")}</p><div className="row-actions"><button type="button" disabled={saving} onClick={()=>setClosing(false)}>{t("card.keepEditing")}</button><button type="button" disabled={saving} onClick={requestCloseDiscard}>{t("card.discardAndClose")}</button></div></div>}
   </div>
   <footer className="dialog-footer"><span className="hint">{footerColumn?columnLabel(footerColumn):''}</span><div className="row-actions">{conflict&&changed&&<button type="button" disabled={saving} onClick={()=>void save(true)}>{t("card.saveComparedDraft")}</button>}<button type="submit" className="primary" disabled={saving||!draft.fields.title.trim()||(!card&&!targetExists)}>{t(saving?'common.saving':card?'card.saveChanges':'card.create')}</button></div></footer>
  </form>
 </Modal>;
}
