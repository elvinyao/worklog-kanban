import { useCallback,useRef,useState } from 'react';
import { api,errorText,type Column,type Snapshot } from '../api';
import {useLanguage} from '../i18n';
import type {MessageKey} from '../i18n/core';
import { Modal } from './Modal';
import {useDraftGuard} from '../state/draft-guard';
interface ColumnDraft {value:string;baseline:string;column:Column}
function ColumnRow({column,index,snapshot,busy,run,draft,onDraftChange,clearDraft}:{column:Column;index:number;snapshot:Snapshot;busy:boolean;run:(operation:()=>Promise<Snapshot>)=>Promise<void>;draft:ColumnDraft|undefined;onDraftChange:(column:Column,value:string,baseline:string)=>void;clearDraft:(id:string)=>void}){
 const {t,column:columnLabel}=useLanguage();const displayName=columnLabel(column);
 // Missing drafts follow translations/server updates; explicit input remains in the dialog.
 const name=draft?.value??displayName;const [target,setTarget]=useState('');
 const reorder=(offset:number)=>{const ids=snapshot.columns.map(item=>item.id);const to=index+offset;[ids[index],ids[to]]=[ids[to]!,ids[index]!];return api.reorderColumns({columnIds:ids,expectedBoardRevision:snapshot.revision});};
 return <div className="column-editor">
  <label>{t('columns.name',{index:index+1})}<input value={name} maxLength={80} onChange={event=>onDraftChange(column,event.target.value,displayName)} disabled={busy}/></label>
  <label className="check-label"><input type="checkbox" checked={column.isDone} disabled={busy} onChange={event=>{const isDone=event.target.checked;void run(()=>api.renameColumn(column.id,{isDone,expectedBoardRevision:snapshot.revision}));}}/>{t('archive.setDone',{column:displayName})}</label>
  <div className="row-actions"><button disabled={busy||!name.trim()||!draft} aria-label={t('columns.saveNameLabel',{index:index+1})} onClick={()=>void run(async()=>{const result=await api.renameColumn(column.id,{name,expectedBoardRevision:snapshot.revision});clearDraft(column.id);return result;})}>{t("columns.saveName")}</button><button disabled={busy||index===0} aria-label={t('columns.moveUp',{index:index+1})} onClick={()=>void run(()=>reorder(-1))}>↑</button><button disabled={busy||index===snapshot.columns.length-1} aria-label={t('columns.moveDown',{index:index+1})} onClick={()=>void run(()=>reorder(1))}>↓</button></div>
  {snapshot.columns.length>1&&<div className="delete-column"><label>{t('columns.moveCardsTo',{column:displayName})}<select disabled={busy} value={target} onChange={event=>setTarget(event.target.value)}><option value="">{t("columns.chooseDestination")}</option>{snapshot.columns.filter(item=>item.id!==column.id).map(item=><option value={item.id} key={item.id}>{columnLabel(item)}</option>)}</select></label><button className="danger" disabled={busy||!snapshot.columns.some(item=>item.id===target)} onClick={()=>void run(()=>api.deleteColumn(column.id,{targetColumnId:target,expectedBoardRevision:snapshot.revision}))}>{t('columns.deleteAndMove',{column:displayName})}</button></div>}
 </div>;
}
export function ColumnDialog({snapshot,accept,reload,close,onDirtyChange}:{snapshot:Snapshot;accept:(value:Snapshot)=>void;reload:()=>void;close:()=>void;onDirtyChange?:(dirty:boolean)=>void}){
 const {t,column:columnLabel}=useLanguage();
 const [name,setName]=useState('');const [busy,setBusy]=useState(false);const [error,setError]=useState<MessageKey|''>('');
 // Keep drafts above rows so remote column deletion cannot unmount their only copy.
 const [drafts,setDrafts]=useState(()=>new Map<string,ColumnDraft>());const inFlight=useRef(false);
 const onDraftChange=useCallback((column:Column,value:string,baseline:string)=>setDrafts(previous=>{
  const next=new Map(previous),draft=previous.get(column.id)??{column,baseline};
  if(value===draft.baseline)next.delete(column.id);else next.set(column.id,{...draft,value});return next;
 }),[]);
 const clearDraft=useCallback((id:string)=>setDrafts(previous=>{const next=new Map(previous);next.delete(id);return next;}),[]);
 const dirtyDrafts=[...drafts.values()].filter(draft=>draft.value!==draft.baseline);
 const missingDrafts=dirtyDrafts.filter(draft=>!snapshot.columns.some(column=>column.id===draft.column.id));
 const requestClose=useDraftGuard({dirty:name!==''||dirtyDrafts.length>0,busy,close,onDirtyChange});
 async function run(operation:()=>Promise<Snapshot>){if(inFlight.current)return;inFlight.current=true;setBusy(true);setError('');try{accept(await operation());}catch(reason){setError(errorText(reason));reload();}finally{inFlight.current=false;setBusy(false);}}
 return <Modal title={t("columns.manage")} close={requestClose}><div className="dialog-head"><div><span className="eyebrow">{t('columns.eyebrow')}</span><h2>{t("columns.manage")}</h2></div><button className="icon" disabled={busy} aria-label={t("columns.close")} onClick={requestClose}>×</button></div><div className="dialog-content"><p className="hint">{t("columns.description")}</p>
  {error&&<p role="alert" className="error">{t(error)}</p>}
  {snapshot.columns.map((column,index)=><ColumnRow key={column.id} column={column} index={index} snapshot={snapshot} busy={busy} run={run} draft={drafts.get(column.id)} onDraftChange={onDraftChange} clearDraft={clearDraft}/>)}
  {missingDrafts.map(draft=><section className="column-editor" key={draft.column.id}>
   <p className="notice" role="status">{t('columns.deletedDraft',{column:columnLabel(draft.column)})}</p>
   <label>{t('columns.deletedDraftLabel',{column:columnLabel(draft.column)})}<input readOnly value={draft.value} onFocus={event=>event.currentTarget.select()}/></label>
   <button type="button" disabled={busy} onClick={()=>clearDraft(draft.column.id)}>{t('columns.discardDraft')}</button>
  </section>)}
  <form onSubmit={event=>{event.preventDefault();void run(async()=>{const result=await api.createColumn({name,expectedBoardRevision:snapshot.revision});setName('');return result;});}}><label>{t("columns.newName")}<input maxLength={80} value={name} onChange={event=>setName(event.target.value)} disabled={busy}/></label><button className="primary" disabled={busy||!name.trim()}>{t("columns.add")}</button></form>
 </div></Modal>;
}
