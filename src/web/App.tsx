import {useCallback,useEffect,useMemo,useRef,useState,type MouseEvent} from 'react';
import {LanguageSwitcher,useLanguage} from './i18n';
import type {MessageKey} from './i18n/core';
import {cardResources} from './resources';
import {PreviewToggle,usePreviewPreference} from './components/PreviewToggle';
import {api,errorText,type Archive,type ArchiveSummary,type Card,type Snapshot} from './api';
import {SharedBoard,subscribe,type SyncStatus} from './state/shared';
import {Board,type FocusRequest} from './components/Board';
import {CardDialog} from './components/CardDialog';
import {ColumnDialog} from './components/ColumnDialog';
import {PreviewProvider,PreviewToolbar} from './components/PreviewProvider';
import {ArchiveList} from './components/ArchiveList';
import {ArchiveCardDialog,CreateArchiveDialog,RenameArchiveDialog,RestoreArchiveDialog} from './components/ArchiveDialogs';
type Selection={kind:'card';card:Card}|{kind:'new';columnId:string}|{kind:'columns'}|{kind:'createArchive'}|{kind:'restore'}|{kind:'rename';archive:ArchiveSummary}|{kind:'archivedCard';card:Card}|null;
type Notice={key:MessageKey;count?:number;archiveId?:string};
export function App(){
 const {t,date}=useLanguage();
 const [showPreviews,setShowPreviews]=usePreviewPreference();
 const [snapshot,setSnapshot]=useState<Snapshot>(),[status,setStatus]=useState<SyncStatus>('sync.connecting'),[selection,setSelection]=useState<Selection>(null);
 const selectionRef=useRef(selection);selectionRef.current=selection;const [focusRequest,setFocusRequest]=useState<FocusRequest|null>(null);
 const [route,setRoute]=useState(location.hash),[archive,setArchive]=useState<Archive>(),[archiveError,setArchiveError]=useState<MessageKey|''>(''),[readEpoch,setReadEpoch]=useState(0),[notice,setNotice]=useState<Notice>();
 const routeRef=useRef(route);routeRef.current=route;const dirty=useRef(false),shared=useRef<SharedBoard|null>(null);
 const dirtyChanged=useCallback((value:boolean)=>{dirty.current=value;},[]);
 const archiveId=route.startsWith('#/archives/')?route.slice('#/archives/'.length):'';
 const listView=route==='#/archives',currentView=!listView&&!archiveId;
 const history=archive?.id===archiveId?archive:undefined;
 useEffect(()=>{
  const start=()=>{shared.current?.close();const state=new SharedBoard(subscribe,api.board,setSnapshot,setStatus);shared.current=state;state.start();};
  const hide=()=>{shared.current?.close();shared.current=null;};const show=(event:PageTransitionEvent)=>{if(event.persisted)start();};
  start();window.addEventListener('pagehide',hide);window.addEventListener('pageshow',show);
  return()=>{hide();window.removeEventListener('pagehide',hide);window.removeEventListener('pageshow',show);};
 },[]);
 useEffect(()=>{
  const changed=()=>{if(location.hash===routeRef.current)return;if(dirty.current&&!window.confirm(t('card.unsavedChanges'))){window.history.replaceState(null,'',routeRef.current||location.pathname);return;}dirty.current=false;setSelection(null);setNotice(undefined);routeRef.current=location.hash;setRoute(location.hash);};
  window.addEventListener('hashchange',changed);return()=>window.removeEventListener('hashchange',changed);
 },[t]);
 const navigate=(hash:string)=>{
  if(dirty.current&&!window.confirm(t('card.unsavedChanges')))return;
  dirty.current=false;setSelection(null);setNotice(undefined);window.history.pushState(null,'',hash||location.pathname);routeRef.current=hash;setRoute(hash);
 };
 const link=(event:MouseEvent<HTMLAnchorElement>,hash:string)=>{if(!event.metaKey&&!event.ctrlKey&&!event.altKey&&!event.shiftKey){event.preventDefault();navigate(hash);}};
 const accept=(value:Snapshot)=>shared.current?.accept(value);
 const reload=()=>{shared.current?.reload();setReadEpoch(value=>value+1);};
 useEffect(()=>{
  if(!archiveId)return;const abort=new AbortController();setArchiveError('');
  void api.archive(archiveId,abort.signal).then(value=>{if(!abort.signal.aborted)setArchive(value);}).catch(reason=>{if(!abort.signal.aborted)setArchiveError(errorText(reason));});
  return()=>abort.abort();
 },[archiveId,snapshot?.revision,readEpoch]);
 const lastCard=useRef<Card|undefined>(undefined);
 const card=selection?.kind==='card'?(snapshot?.cards.find(item=>item.id===selection.card.id)??(lastCard.current?.id===selection.card.id?lastCard.current:selection.card)):undefined;
 lastCard.current=card;
 const archivedCard=selection?.kind==='archivedCard'?selection.card:undefined;
 const visibleSnapshot=currentView?snapshot:history?.snapshot;
 const resources=useMemo(()=>[...(showPreviews&&!listView?visibleSnapshot?.cards.flatMap(item=>cardResources(item))??[]:[]),...(card?cardResources(card,true):[]),...(archivedCard?cardResources(archivedCard,true):[])],[visibleSnapshot,showPreviews,listView,card,archivedCard]);
 const close=()=>{
  if(selectionRef.current!==selection)return;
  if(selection?.kind==='card'||selection?.kind==='new')setFocusRequest(previous=>({target:selection.kind==='card'?{kind:'card',id:selection.card.id}:{kind:'column',id:selection.columnId,index:0},sequence:(previous?.sequence??0)+1}));
  dirty.current=false;setSelection(null);
 };
 const completed=snapshot?.cards.filter(card=>snapshot.columns.some(column=>column.id===card.columnId&&column.isDone))??[];
 const hasDone=snapshot?.columns.some(column=>column.isDone)??false;
 const detailOpen=selection?.kind==='card'||selection?.kind==='new'||selection?.kind==='archivedCard';
 return <PreviewProvider resources={resources}>
  <header className="app-header"><div className="brand"><span className="brand-mark">w.</span><div><h1>Worklog</h1><p>{t('app.tagline')}</p></div></div><div className="header-meta"><LanguageSwitcher/>{__SITE_CONFIG__.mode==='dummy'&&<span className="demo-badge">{t('environment.demo')}</span>}<span role="status" className="sync-status">● {t(status)}</span><button onClick={reload}>{t('sync.refresh')}</button></div></header>
  <nav className="board-navigation"><a href="#" aria-current={currentView?'page':undefined} onClick={event=>link(event,'')}>{t('archive.current')}</a><a href="#/archives" aria-current={!currentView?'page':undefined} onClick={event=>link(event,'#/archives')}>{t('archive.nav')} <span>{snapshot?.archiveCount??0}</span></a></nav>
  {notice&&<div role="status" className="board-notice"><span>{t(notice.key,{count:notice.count??0})}</span>{notice.archiveId&&<a href={'#/archives/'+notice.archiveId} onClick={event=>link(event,'#/archives/'+notice.archiveId)}>{t('archive.view')}</a>}{notice.key==='archive.restored'&&<a href="#" onClick={event=>link(event,'')}>{t('archive.openCurrent')}</a>}</div>}
  {currentView&&<>
   <div className="board-toolbar"><div><span className="eyebrow">{t('board.eyebrow')}</span><h2>{t('board.title')} <span>{t(snapshot?.cards.length===1?'board.oneWorkItem':'board.workCount',{count:snapshot?.cards.length??0})}</span></h2></div><div className="row-actions"><PreviewToggle enabled={showPreviews} change={setShowPreviews}/><button disabled={!snapshot||(hasDone&&!completed.length)} title={hasDone&&!completed.length?t('archive.noCompleted'):undefined} onClick={()=>{if(!hasDone){setNotice({key:'archive.noDoneColumn'});setSelection({kind:'columns'});}else setSelection({kind:'createArchive'});}}>{t('archive.create')}</button><button disabled={!snapshot} onClick={()=>setSelection({kind:'columns'})}>{t('columns.manage')}</button><button className="primary" aria-label={t('card.new')} disabled={!snapshot?.columns.length} onClick={()=>{const column=snapshot?.columns[0];if(column)setSelection({kind:'new',columnId:column.id});}}>＋ {t('card.new')}</button></div></div>
   {showPreviews&&!detailOpen&&<PreviewToolbar/>}
   {snapshot?<Board key="current" snapshot={snapshot} showPreviews={showPreviews} open={card=>setSelection({kind:'card',card})} create={columnId=>setSelection({kind:'new',columnId})} accept={accept} reload={reload} focusRequest={focusRequest}/>:<p className="loading">{t('board.loading')}</p>}
  </>}
  <ArchiveList active={listView} revision={`${snapshot?.revision??0}:${readEpoch}`} navigate={navigate} rename={archive=>setSelection({kind:'rename',archive})}/>
  {archiveId&&<>
   <div className="board-toolbar archive-toolbar"><div><a className="back-link" href="#/archives" onClick={event=>link(event,'#/archives')}>← {t('archive.list')}</a><h2>{history?.name??t('archive.nav')}</h2>{history&&<p className="hint">{date(history.createdAt)} · {t('archive.readonly')}</p>}</div><div className="row-actions"><PreviewToggle enabled={showPreviews} change={setShowPreviews}/><button className="primary" disabled={!history||!snapshot} onClick={()=>setSelection({kind:'restore'})}>{t('archive.restore')}</button></div></div>
   {archiveError&&<div role="alert" className="move-error error">{t(archiveError)} <button onClick={reload}>{t('sync.refresh')}</button></div>}
   {history?<>{history.description&&<p className="archive-board-description">{history.description}</p>}{showPreviews&&<p className="archive-live hint">{t('archive.live')}</p>}{showPreviews&&!detailOpen&&<PreviewToolbar/>}<div className="archive-board"><Board key={history.id} snapshot={history.snapshot} readOnly showPreviews={showPreviews} open={card=>setSelection({kind:'archivedCard',card})} create={()=>{}} accept={()=>{}} reload={reload} focusRequest={null}/></div></>:!archiveError&&<p className="loading">{t('board.loading')}</p>}
  </>}
  <footer className="app-footer"><span>{t('app.sharedNotesFooter')}</span><span>{t('app.sourceContentFooter')}</span></footer>
  {snapshot&&selection?.kind==='columns'&&<ColumnDialog snapshot={snapshot} accept={accept} reload={reload} close={close}/>}
  {snapshot&&(selection?.kind==='new'||(selection?.kind==='card'&&card))&&<CardDialog key={selection.kind==='card'?selection.card.id:'new'} card={card} columnId={selection.kind==='new'?selection.columnId:card!.columnId} missing={!!card&&!snapshot.cards.some(item=>item.id===card.id)} onDirtyChange={dirtyChanged} snapshot={snapshot} accept={accept} reload={reload} close={close}/>}
  {snapshot&&selection?.kind==='createArchive'&&<CreateArchiveDialog snapshot={snapshot} reload={reload} close={close} done={(result,count)=>{accept(result.board);close();setNotice({key:'archive.created',count,archiveId:result.archiveId});}}/>}
  {snapshot&&history&&selection?.kind==='restore'&&<RestoreArchiveDialog archive={history} snapshot={snapshot} reload={reload} close={close} done={(result,count)=>{accept(result.board);setArchive({...history,restoredCards:{...history.restoredCards,...result.restoredCards}});close();setNotice({key:'archive.restored',count});}} openCurrent={id=>{const item=snapshot.cards.find(card=>card.id===id);if(item){navigate('');setSelection({kind:'card',card:item});}else reload();}}/>}
  {selection?.kind==='rename'&&<RenameArchiveDialog archive={selection.archive} close={close} reload={reload} done={result=>{accept(result.board);close();reload();}}/>}
  {archivedCard&&<ArchiveCardDialog card={archivedCard} close={close}/>}
 </PreviewProvider>;
}
