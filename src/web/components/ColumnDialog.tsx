import { useState } from 'react';
import { api,errorText,type Column,type Snapshot } from '../api';
import {useLanguage} from '../i18n';
import type {MessageKey} from '../i18n/core';
import { Modal } from './Modal';
function ColumnRow({column,index,snapshot,busy,run}:{column:Column;index:number;snapshot:Snapshot;busy:boolean;run:(operation:()=>Promise<Snapshot>)=>Promise<void>}){
 const {t,column:columnLabel}=useLanguage();const displayName=columnLabel(column);
 // Null means untouched: follow translations/server updates. Any input is an explicit draft.
 const [draft,setDraft]=useState<string|null>(null);const name=draft??displayName;const [target,setTarget]=useState('');
 const reorder=(offset:number)=>{const ids=snapshot.columns.map(item=>item.id);const to=index+offset;[ids[index],ids[to]]=[ids[to]!,ids[index]!];return api.reorderColumns({columnIds:ids,expectedBoardRevision:snapshot.revision});};
 return <div className="column-editor">
  <label>{t('columns.name',{index:index+1})}<input value={name} maxLength={80} onChange={event=>setDraft(event.target.value)} disabled={busy}/></label>
  <label className="check-label"><input type="checkbox" checked={column.isDone} disabled={busy} onChange={event=>{const isDone=event.target.checked;void run(()=>api.renameColumn(column.id,{isDone,expectedBoardRevision:snapshot.revision}));}}/>{t('archive.setDone',{column:displayName})}</label>
  <div className="row-actions"><button disabled={busy||!name.trim()||draft===null} aria-label={t('columns.saveNameLabel',{index:index+1})} onClick={()=>void run(async()=>{const result=await api.renameColumn(column.id,{name,expectedBoardRevision:snapshot.revision});setDraft(null);return result;})}>{t("columns.saveName")}</button><button disabled={busy||index===0} aria-label={t('columns.moveUp',{index:index+1})} onClick={()=>void run(()=>reorder(-1))}>↑</button><button disabled={busy||index===snapshot.columns.length-1} aria-label={t('columns.moveDown',{index:index+1})} onClick={()=>void run(()=>reorder(1))}>↓</button></div>
  {snapshot.columns.length>1&&<div className="delete-column"><label>{t('columns.moveCardsTo',{column:displayName})}<select disabled={busy} value={target} onChange={event=>setTarget(event.target.value)}><option value="">{t("columns.chooseDestination")}</option>{snapshot.columns.filter(item=>item.id!==column.id).map(item=><option value={item.id} key={item.id}>{columnLabel(item)}</option>)}</select></label><button className="danger" disabled={busy||!snapshot.columns.some(item=>item.id===target)} onClick={()=>void run(()=>api.deleteColumn(column.id,{targetColumnId:target,expectedBoardRevision:snapshot.revision}))}>{t('columns.deleteAndMove',{column:displayName})}</button></div>}
 </div>;
}
export function ColumnDialog({snapshot,accept,reload,close}:{snapshot:Snapshot;accept:(value:Snapshot)=>void;reload:()=>void;close:()=>void}){
 const {t}=useLanguage();
 const [name,setName]=useState('');const [busy,setBusy]=useState(false);const [error,setError]=useState<MessageKey|''>('');
 async function run(operation:()=>Promise<Snapshot>){if(busy)return;setBusy(true);setError('');try{accept(await operation());}catch(reason){setError(errorText(reason));reload();}finally{setBusy(false);}}
 return <Modal title={t("columns.manage")} close={()=>{if(!busy)close();}}><div className="dialog-head"><div><span className="eyebrow">{t('columns.eyebrow')}</span><h2>{t("columns.manage")}</h2></div><button className="icon" disabled={busy} aria-label={t("columns.close")} onClick={close}>×</button></div><div className="dialog-content"><p className="hint">{t("columns.description")}</p>
  {error&&<p role="alert" className="error">{t(error)}</p>}
  {snapshot.columns.map((column,index)=><ColumnRow key={column.id} column={column} index={index} snapshot={snapshot} busy={busy} run={run}/>)}
  <form onSubmit={event=>{event.preventDefault();void run(async()=>{const result=await api.createColumn({name,expectedBoardRevision:snapshot.revision});setName('');return result;});}}><label>{t("columns.newName")}<input maxLength={80} value={name} onChange={event=>setName(event.target.value)} disabled={busy}/></label><button className="primary" disabled={busy||!name.trim()}>{t("columns.add")}</button></form>
 </div></Modal>;
}
