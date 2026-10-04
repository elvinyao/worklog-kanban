import {useRef,useState} from 'react';
import {api,ApiError,errorText,type Archive,type ArchiveSummary,type ArchiveWrite,type Card,type Snapshot} from '../api';
import type {components} from '../../generated/shared-api';
import type {MessageKey} from '../i18n/core';
import {useLanguage} from '../i18n';
import {Modal} from './Modal';
import {CardLinks} from './CardLinks';
import {PreviewToolbar} from './PreviewProvider';
import {useDraftGuard} from '../state/draft-guard';
import {LocalDraft,useLocalDraft} from './LocalDraft';
import {object,text,number,strings} from '../state/recover-input';
type Models=components['schemas'];
type Common={snapshot:Snapshot;reload:()=>void;close:()=>void;done:(result:ArchiveWrite,count:number)=>void;onDirtyChange?:(dirty:boolean)=>void};

// Keep the exact payload after an uncertain failure, even if SSE has already updated Current.
function useArchiveMutation<T>(run:(value:T)=>Promise<ArchiveWrite>,done:(value:ArchiveWrite)=>void,reload:()=>void,idempotent=false){
 const pending=useRef<T|null>(null),inFlight=useRef(false);
 const [busy,setBusy]=useState(false),[locked,setLocked]=useState(false),[review,setReview]=useState(false),[uncertain,setUncertain]=useState(false),[error,setError]=useState<MessageKey|''>('');
 async function submit(value:T,before?:(pending:T)=>void){
  if(inFlight.current)return;inFlight.current=true;setBusy(true);setError('');pending.current??=value;setLocked(true);
  try{before?.(pending.current);done(await run(pending.current));}
  catch(reason){
   setError(errorText(reason));
   const rejected=reason instanceof ApiError&&reason.status>=400&&reason.status<500&&reason.status!==408;
   // A rejected replay says nothing about an earlier attempt's commit. Rename
   // uses version conflicts instead of request IDs, so it still needs review.
   if(rejected&&!(idempotent&&uncertain)){pending.current=null;setLocked(false);setReview(true);setUncertain(false);}
   else setUncertain(true);
   reload();
  }
  finally{inFlight.current=false;setBusy(false);}
 }
 return {busy,locked,review,uncertain,error,submit,pending:pending.current,restore:(value:T|null)=>{pending.current=value;setLocked(!!value);setUncertain(!!value);setReview(false);},reviewed:()=>{setReview(false);setError('');}};
}
function MutationFeedback({mutation}:{mutation:{error:MessageKey|'';locked:boolean;busy:boolean}}){const {t}=useLanguage();return <>{mutation.error&&<p role="alert" className="error">{t(mutation.error)}</p>}{mutation.locked&&!mutation.busy&&<p className="notice">{t('archive.uncertain')}</p>}</>;}
function SelectionRow({card,checked,change,disabled=false,children}:{card:Card;checked:boolean;change:()=>void;disabled?:boolean;children?:React.ReactNode}){
 const {t}=useLanguage();return <div className="archive-choice"><label className="check-label"><input type="checkbox" aria-label={t('archive.selectTask',{title:card.title})} checked={checked} disabled={disabled} onChange={change}/><span><strong>{card.title}</strong><small>{card.jiraLinks.map(j=>j.key).join(' · ')}</small></span></label>{children}</div>;
}
const toggle=(previous:Set<string>,id:string)=>{const next=new Set(previous);if(next.has(id))next.delete(id);else next.add(id);return next;};
const completed=(snapshot:Snapshot)=>snapshot.cards.filter(card=>snapshot.columns.some(column=>column.id===card.columnId&&column.isDone));
const sameSelection=(left:Set<string>,right:Set<string>)=>left.size===right.size&&[...left].every(id=>right.has(id));

export function CreateArchiveDialog({snapshot,reload,close,done,onDirtyChange}:Common){
 const {t,column:columnLabel}=useLanguage();const [base,setBase]=useState(snapshot);
 const [name,setName]=useState(()=>t('archive.defaultName',{date:new Date().toLocaleDateString('sv-SE')})),[description,setDescription]=useState('');
 const [selected,setSelected]=useState(()=>new Set(completed(snapshot).map(c=>c.id)));
 const baseline=useRef({name,description,selected});
 const mutation=useArchiveMutation<Models['CreateArchive']>(api.createArchive,result=>{local.clear();done(result,selected.size);},reload,true);
 const saved={name,description,selected:[...selected],revision:base.revision,pending:mutation.pending};
 const local=useLocalDraft('archive:create',saved,value=>{
  const data=object(value),nextName=text(data.name,80),nextDescription=text(data.description,500),ids=strings(data.selected),revision=number(data.revision);
  const pending=data.pending===null?null:{requestId:text(object(data.pending).requestId,100),expectedBoardRevision:revision,name:nextName.trim(),description:nextDescription,cardIds:ids};
  setName(nextName);setDescription(nextDescription);setSelected(new Set(ids));setBase({...snapshot,revision});mutation.restore(pending);
 });
 const requestClose=useDraftGuard({dirty:mutation.uncertain||name!==baseline.current.name||description!==baseline.current.description||!sameSelection(selected,baseline.current.selected),busy:mutation.busy,close:()=>{local.clear();close();},onDirtyChange});
 const stale=base.revision!==snapshot.revision||mutation.review;
 const review=()=>{const ids=new Set(completed(snapshot).map(c=>c.id));baseline.current.selected=new Set([...baseline.current.selected].filter(id=>ids.has(id)));setSelected(old=>new Set([...old].filter(id=>ids.has(id))));setBase(snapshot);mutation.reviewed();};
 return <Modal title={t('archive.create')} close={requestClose}><div className="dialog-head"><h2>{t('archive.create')}</h2><button className="icon" aria-label={t('common.close')} disabled={mutation.busy} onClick={requestClose}>×</button></div>
  <form onSubmit={event=>{event.preventDefault();if((stale&&!mutation.locked)||!selected.size)return;void mutation.submit({requestId:crypto.randomUUID(),expectedBoardRevision:base.revision,name:name.trim(),description,cardIds:[...selected]},pending=>local.persist({...saved,pending}));}}><div className="dialog-content"><p className="hint">{t('archive.onlyCompleted')}</p><LocalDraft draft={local} busy={mutation.busy}/>
   <fieldset disabled={mutation.busy||mutation.locked}><label>{t('archive.name')}<input required maxLength={80} value={name} onChange={event=>setName(event.target.value)} autoFocus/></label><label>{t('archive.description')}<textarea maxLength={500} rows={2} value={description} onChange={event=>setDescription(event.target.value)}/></label>
    {base.columns.filter(column=>column.isDone).map(column=><section className="archive-selection-group" key={column.id}><h3>{columnLabel(column)}</h3>{base.cards.filter(card=>card.columnId===column.id).map(card=><SelectionRow key={card.id} card={card} checked={selected.has(card.id)} change={()=>setSelected(value=>toggle(value,card.id))}/>)}</section>)}
   </fieldset>
   {stale&&!mutation.locked&&<div className="notice"><p>{t('archive.changed')}</p><button type="button" onClick={review}>{t('archive.review')}</button></div>}
   <MutationFeedback mutation={mutation}/><p className="hint">{t('archive.summary',{count:selected.size,remaining:base.cards.length-selected.size})}</p>
  </div><footer className="dialog-footer"><span/><div className="row-actions"><button type="button" disabled={mutation.busy} onClick={requestClose}>{t('common.cancel')}</button><button className="primary" disabled={mutation.busy||!selected.size||!name.trim()||(stale&&!mutation.locked)}>{t(mutation.busy?'common.saving':'archive.confirm',{count:selected.size})}</button></div></footer></form>
 </Modal>;
}

export function RestoreArchiveDialog({archive,snapshot,reload,close,done,openCurrent,onDirtyChange}:{archive:Archive;openCurrent:(id:string)=>void}&Common){
 const {t,column:columnLabel}=useLanguage();const [base,setBase]=useState(snapshot),[history,setHistory]=useState(archive);
 const [selected,setSelected]=useState(new Set<string>()),[target,setTarget]=useState(()=>snapshot.columns.find(c=>!c.isDone)?.id??'');
 const [reviewing,setReviewing]=useState(false),[reviewError,setReviewError]=useState<MessageKey|''>('');
 const baseline=useRef({target});
 const mutation=useArchiveMutation<Models['RestoreArchive']>(value=>api.restoreArchive(archive.id,value),result=>{local.clear();done(result,Object.keys(result.restoredCards??{}).length);},reload,true);
 const saved={selected:[...selected],target,revision:base.revision,pending:mutation.pending};
 const local=useLocalDraft('archive:restore:'+archive.id,saved,value=>{
  const data=object(value),ids=strings(data.selected),destination=text(data.target,100),revision=number(data.revision);
  const pending=data.pending===null?null:{requestId:text(object(data.pending).requestId,100),expectedBoardRevision:revision,targetColumnId:destination,cardIds:ids};
  setSelected(new Set(ids));setTarget(destination);setBase({...snapshot,revision});mutation.restore(pending);
 });
 const requestClose=useDraftGuard({dirty:mutation.uncertain||selected.size>0||target!==baseline.current.target,busy:mutation.busy||reviewing,close:()=>{local.clear();close();},onDirtyChange});
 const stale=base.revision!==snapshot.revision||mutation.review;
 async function review(){setReviewing(true);setReviewError('');try{const latest=await api.archive(archive.id);setHistory(latest);setBase(snapshot);setSelected(old=>new Set([...old].filter(id=>!latest.restoredCards[id])));if(!snapshot.columns.some(c=>c.id===target))setTarget('');if(!snapshot.columns.some(c=>c.id===baseline.current.target))baseline.current.target='';mutation.reviewed();}catch(error){setReviewError(errorText(error));}finally{setReviewing(false);}}
 return <Modal title={t('archive.restoreTitle')} close={requestClose}><div className="dialog-head"><h2>{t('archive.restoreTitle')}</h2><button className="icon" aria-label={t('common.close')} disabled={mutation.busy||reviewing} onClick={requestClose}>×</button></div>
  <form onSubmit={event=>{event.preventDefault();if(!target||!selected.size||(stale&&!mutation.locked))return;void mutation.submit({requestId:crypto.randomUUID(),expectedBoardRevision:base.revision,targetColumnId:target,cardIds:[...selected]},pending=>local.persist({...saved,pending}));}}><div className="dialog-content"><p className="hint">{t('archive.restoreHint')}</p><LocalDraft draft={local} busy={mutation.busy||reviewing}/>
   <fieldset disabled={mutation.busy||mutation.locked||reviewing}>{history.snapshot.cards.map(card=><SelectionRow key={card.id} card={card} disabled={!!history.restoredCards[card.id]} checked={selected.has(card.id)} change={()=>setSelected(value=>toggle(value,card.id))}>{history.restoredCards[card.id]&&<button type="button" onClick={()=>openCurrent(history.restoredCards[card.id]!)}>{t('archive.alreadyCurrent')} ↗</button>}</SelectionRow>)}
    <label>{t('archive.target')}<select required value={target} onChange={event=>setTarget(event.target.value)}><option value="" disabled>{t('card.chooseColumn')}</option>{base.columns.map(column=><option value={column.id} key={column.id}>{columnLabel(column)}</option>)}</select></label>
   </fieldset>
   {stale&&!mutation.locked&&<div className="notice"><p>{t('archive.changed')}</p><button type="button" disabled={reviewing} onClick={()=>void review()}>{t('archive.review')}</button></div>}
   {reviewError&&<p role="alert" className="error">{t(reviewError)}</p>}<MutationFeedback mutation={mutation}/><p className="hint">{t('archive.restoreSummary',{count:selected.size})}</p>
  </div><footer className="dialog-footer"><span/><div className="row-actions"><button type="button" disabled={mutation.busy||reviewing} onClick={requestClose}>{t('common.cancel')}</button><button className="primary" disabled={mutation.busy||reviewing||!selected.size||!target||(stale&&!mutation.locked)}>{t(mutation.busy?'common.saving':'archive.restoreConfirm',{count:selected.size})}</button></div></footer></form>
 </Modal>;
}

export function RenameArchiveDialog({archive,close,reload,done,onDirtyChange}:{archive:ArchiveSummary;close:()=>void;reload:()=>void;done:(result:ArchiveWrite)=>void;onDirtyChange?:(dirty:boolean)=>void}){
 const {t}=useLanguage();const [base,setBase]=useState(archive),[name,setName]=useState(archive.name),[description,setDescription]=useState(archive.description),[reviewing,setReviewing]=useState(false),[reviewError,setReviewError]=useState<MessageKey|''>('');
 const mutation=useArchiveMutation<Models['EditArchive']>(value=>api.renameArchive(archive.id,value),result=>{local.clear();done(result);},reload);
 const saved={name,description,version:base.metadataVersion,pending:mutation.pending};
 const local=useLocalDraft('archive:rename:'+archive.id,saved,value=>{
  const data=object(value),nextName=text(data.name,80),nextDescription=text(data.description,500),version=number(data.version);
  setName(nextName);setDescription(nextDescription);setBase({...archive,metadataVersion:version});mutation.restore(data.pending===null?null:{name:nextName.trim(),description:nextDescription,expectedMetadataVersion:version});
 });
 const baseline=useRef({name,description});
 const requestClose=useDraftGuard({dirty:mutation.uncertain||name!==baseline.current.name||description!==baseline.current.description,busy:mutation.busy||reviewing,close:()=>{local.clear();close();},onDirtyChange});
 async function review(){setReviewing(true);try{setBase(await api.archive(archive.id));mutation.reviewed();setReviewError('');}catch(reason){setReviewError(errorText(reason));}finally{setReviewing(false);}}
 return <Modal title={t('archive.renameTitle')} close={requestClose}><div className="dialog-head"><h2>{t('archive.renameTitle')}</h2><button className="icon" aria-label={t('common.close')} disabled={mutation.busy||reviewing} onClick={requestClose}>×</button></div>
  <form onSubmit={event=>{event.preventDefault();void mutation.submit({name:name.trim(),description,expectedMetadataVersion:base.metadataVersion},pending=>local.persist({...saved,pending}));}}><div className="dialog-content"><LocalDraft draft={local} busy={mutation.busy||reviewing}/><fieldset disabled={mutation.busy||mutation.locked||reviewing}><label>{t('archive.name')}<input required maxLength={80} autoFocus value={name} onChange={event=>setName(event.target.value)}/></label><label>{t('archive.description')}<textarea rows={3} maxLength={500} value={description} onChange={event=>setDescription(event.target.value)}/></label></fieldset>
   {mutation.review&&<div className="notice"><p>{t('error.sharedConflict')}</p><button type="button" disabled={reviewing} onClick={()=>void review()}>{t('sync.refresh')}</button></div>}{base.metadataVersion!==archive.metadataVersion&&<p className="notice">{base.name} · {base.description}</p>}
   {reviewError&&<p role="alert" className="error">{t(reviewError)}</p>}<MutationFeedback mutation={mutation}/>
  </div><footer className="dialog-footer"><span/><div className="row-actions"><button type="button" disabled={mutation.busy||reviewing} onClick={requestClose}>{t('common.cancel')}</button><button className="primary" disabled={mutation.busy||reviewing||mutation.review||!name.trim()}>{t(mutation.busy?'common.saving':'archive.saveName')}</button></div></footer></form>
 </Modal>;
}

export function ArchiveCardDialog({card,close}:{card:Card;close:()=>void}){
 const {t}=useLanguage();return <Modal title={t('archive.readonly')} close={close}><div className="dialog-head"><div><span className="eyebrow">{t('archive.readonly')}</span><h2>{card.title}</h2></div><button className="icon" aria-label={t('archive.closeDetail')} onClick={close}>×</button></div><div className="dialog-content"><p className="archive-notes">{card.notes}</p><PreviewToolbar/><p className="hint">{t('archive.live')}</p><CardLinks card={card} previews showDescriptions/></div></Modal>;
}
