import { useCallback,useRef,useState } from 'react';
import { api,ApiError,errorText,type Column,type Snapshot } from '../api';
import {useLanguage} from '../i18n';
import type {MessageKey} from '../i18n/core';
import { Modal } from './Modal';
import {LocalDraft,number,object,text,useDraftGuard,useLocalDraft} from './LocalDraft';
interface ColumnDraft {value:string;baseline:string;column:Column}
function ColumnRow({column,index,snapshot,busy,run,draft,onDraftChange,clearDraft}:{column:Column;index:number;snapshot:Snapshot;busy:boolean;run:(operation:()=>Promise<Snapshot>)=>Promise<void>;draft:ColumnDraft|undefined;onDraftChange:(column:Column,value:string,baseline:string)=>void;clearDraft:(id:string)=>void}){
 const {t,column:columnLabel}=useLanguage();const displayName=columnLabel(column);
 // Missing drafts follow translations/server updates; explicit input remains in the dialog.
 const name=draft?.value??displayName;const [target,setTarget]=useState('');
 const conflict=!!draft&&draft.column.name!==column.name;
 const saveName=()=>run(async()=>{const result=await api.renameColumn(column.id,{name,expectedBoardRevision:snapshot.revision});clearDraft(column.id);return result;});
 const reorder=(offset:number)=>{const ids=snapshot.columns.map(item=>item.id);const to=index+offset;[ids[index],ids[to]]=[ids[to]!,ids[index]!];return api.reorderColumns({columnIds:ids,expectedBoardRevision:snapshot.revision});};
 return <div className="column-editor">
  <label>{t('columns.name',{index:index+1})}<input value={name} maxLength={80} onChange={event=>onDraftChange(column,event.target.value,displayName)} disabled={busy}/></label>
  <label className="check-label"><input type="checkbox" checked={column.isDone} disabled={busy} onChange={event=>{const isDone=event.target.checked;void run(()=>api.renameColumn(column.id,{isDone,expectedBoardRevision:snapshot.revision}));}}/>{t('archive.setDone',{column:displayName})}</label>
  {conflict&&<div className="notice"><p>{t('columns.conflict',{original:draft.baseline,remote:displayName,local:name})}</p><button disabled={busy||!name.trim()} onClick={()=>void saveName()}>{t('columns.saveCompared')}</button></div>}
  <div className="row-actions"><button disabled={busy||!name.trim()||!draft||conflict} aria-label={t('columns.saveNameLabel',{index:index+1})} onClick={()=>void saveName()}>{t("columns.saveName")}</button><button disabled={busy||index===0} aria-label={t('columns.moveUp',{index:index+1})} onClick={()=>void run(()=>reorder(-1))}>↑</button><button disabled={busy||index===snapshot.columns.length-1} aria-label={t('columns.moveDown',{index:index+1})} onClick={()=>void run(()=>reorder(1))}>↓</button></div>
  {snapshot.columns.length>1&&<div className="delete-column"><label>{t('columns.moveCardsTo',{column:displayName})}<select disabled={busy} value={target} onChange={event=>setTarget(event.target.value)}><option value="">{t("columns.chooseDestination")}</option>{snapshot.columns.filter(item=>item.id!==column.id).map(item=><option value={item.id} key={item.id}>{columnLabel(item)}</option>)}</select></label><button className="danger" disabled={busy||!snapshot.columns.some(item=>item.id===target)} onClick={()=>void run(()=>api.deleteColumn(column.id,{targetColumnId:target,expectedBoardRevision:snapshot.revision}))}>{t('columns.deleteAndMove',{column:displayName})}</button></div>}
 </div>;
}
export function ColumnDialog({snapshot,accept,reload,close,onDirtyChange}:{snapshot:Snapshot;accept:(value:Snapshot)=>void;reload:()=>void;close:()=>void;onDirtyChange?:(dirty:boolean)=>void}){
 const {t,column:columnLabel}=useLanguage();
 const [name,setName]=useState('');const [busy,setBusy]=useState(false);const [error,setError]=useState<MessageKey|''>('');
 const pending=useRef<Parameters<typeof api.createColumn>[0]|null>(null);const [uncertain,setUncertain]=useState(false);
 // Keep drafts above rows so remote column deletion cannot unmount their only copy.
 const [drafts,setDrafts]=useState(()=>new Map<string,ColumnDraft>());const inFlight=useRef(false);
 const onDraftChange=useCallback((column:Column,value:string,baseline:string)=>setDrafts(previous=>{
  const next=new Map(previous),draft=previous.get(column.id)??{column,baseline};
  if(value===draft.baseline)next.delete(column.id);else next.set(column.id,{...draft,value});return next;
 }),[]);
 const clearDraft=useCallback((id:string)=>setDrafts(previous=>{const next=new Map(previous);next.delete(id);return next;}),[]);
 const dirtyDrafts=[...drafts.values()].filter(draft=>draft.value!==draft.baseline);
 const missingDrafts=dirtyDrafts.filter(draft=>!snapshot.columns.some(column=>column.id===draft.column.id));
 const savedValue=()=>({name,pending:pending.current,drafts:[...drafts.values()].map(draft=>({id:draft.column.id,originalName:draft.column.name,baseline:draft.baseline,value:draft.value}))});
 const local=useLocalDraft('columns',savedValue(),value=>{
  const data=object(value),restoredName=text(data.name,80);if(!Array.isArray(data.drafts)||data.drafts.length>100)throw new Error('Invalid columns');
  const restored=new Map<string,ColumnDraft>();
  for(const item of data.drafts){const row=object(item),id=text(row.id,100),originalName=text(row.originalName,80);restored.set(id,{value:text(row.value,80),baseline:text(row.baseline,80),column:{id,name:originalName,position:0,isDone:false,defaultNameKey:null}});}
  let request:Parameters<typeof api.createColumn>[0]|null=null;
  if(data.pending!==null){const raw=object(data.pending);request={requestId:text(raw.requestId,100),name:text(raw.name,80),expectedBoardRevision:number(raw.expectedBoardRevision)};if(request.name!==restoredName)throw new Error('Invalid pending name');}
  setName(restoredName);setDrafts(restored);pending.current=request;setUncertain(!!request);
 });
 const requestClose=useDraftGuard({dirty:uncertain||name!==''||dirtyDrafts.length>0,busy,close:()=>{local.clear();close();},onDirtyChange});
 async function create(){
  await run(async()=>{
   pending.current??={requestId:crypto.randomUUID(),name,expectedBoardRevision:snapshot.revision};
   local.persist(savedValue());
   try{const result=await api.createColumn(pending.current);pending.current=null;setUncertain(false);setName('');return result;}
   catch(reason){const rejected=!uncertain&&reason instanceof ApiError&&reason.status>=400&&reason.status<500&&reason.status!==408;if(rejected)pending.current=null;setUncertain(!rejected);throw reason;}
  });
 }
 async function run(operation:()=>Promise<Snapshot>){if(inFlight.current)return;inFlight.current=true;setBusy(true);setError('');try{accept(await operation());}catch(reason){setError(errorText(reason));reload();}finally{inFlight.current=false;setBusy(false);}}
 return <Modal title={t("columns.manage")} close={requestClose}><div className="dialog-head"><h2>{t("columns.manage")}</h2><button className="icon" disabled={busy} aria-label={t("columns.close")} onClick={requestClose}>×</button></div><div className="dialog-content">
  {error&&<p role="alert" className="error">{t(error)}</p>}
  <LocalDraft draft={local} busy={busy}/>
  {snapshot.columns.map((column,index)=><ColumnRow key={column.id} column={column} index={index} snapshot={snapshot} busy={busy} run={run} draft={drafts.get(column.id)} onDraftChange={onDraftChange} clearDraft={clearDraft}/>)}
  {missingDrafts.map(draft=><section className="column-editor" key={draft.column.id}>
   <p className="notice" role="status">{t('columns.deletedDraft',{column:columnLabel(draft.column)})}</p>
   <label>{t('columns.deletedDraftLabel',{column:columnLabel(draft.column)})}<input readOnly value={draft.value} onFocus={event=>event.currentTarget.select()}/></label>
   <button type="button" disabled={busy} onClick={()=>clearDraft(draft.column.id)}>{t('columns.discardDraft')}</button>
  </section>)}
  {uncertain&&<p className="notice">{t('columns.uncertain')}</p>}
  <form onSubmit={event=>{event.preventDefault();void create();}}><label>{t("columns.newName")}<input maxLength={80} value={name} onChange={event=>setName(event.target.value)} disabled={busy||uncertain}/></label><button className="primary" disabled={busy||!name.trim()}>{t(uncertain?'columns.retryCreate':'columns.add')}</button></form>
 </div></Modal>;
}
