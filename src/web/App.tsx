import { useEffect,useMemo,useRef,useState } from 'react';
import {LanguageSwitcher,useLanguage} from './i18n';
import type {SyncStatus} from './state/shared';
import type { Resource } from '../contracts/resource-links';
import { api,type Snapshot } from './api';
import { SharedBoard,subscribe } from './state/shared';
import { Board,type FocusRequest } from './components/Board';
import { CardDialog } from './components/CardDialog';
import { ColumnDialog } from './components/ColumnDialog';
import { PreviewProvider,PreviewToolbar } from './components/PreviewProvider';
type Selection={kind:'card';id:string}|{kind:'new';columnId:string}|{kind:'columns'}|null;
export function App(){
 const {t}=useLanguage();
 const [snapshot,setSnapshot]=useState<Snapshot>();const [status,setStatus]=useState<SyncStatus>('sync.connecting');const [selection,setSelection]=useState<Selection>(null);
 const selectionRef=useRef(selection);selectionRef.current=selection;const [focusRequest,setFocusRequest]=useState<FocusRequest|null>(null);
 const shared=useRef<SharedBoard|null>(null);
 useEffect(()=>{
  const start=()=>{shared.current?.close();const state=new SharedBoard(subscribe,api.board,setSnapshot,setStatus);shared.current=state;state.start();};
  const hide=()=>{shared.current?.close();shared.current=null;};const show=(event:PageTransitionEvent)=>{if(event.persisted)start();};
  start();window.addEventListener('pagehide',hide);window.addEventListener('pageshow',show);
  return()=>{hide();window.removeEventListener('pagehide',hide);window.removeEventListener('pageshow',show);};
 },[]);
 const resources=useMemo<Resource[]>(()=>snapshot?.cards.flatMap(card=>[...card.jiraLinks.flatMap(jira=>[{kind:'jira' as const,id:jira.key,url:jira.url},...jira.mattermostLinks.map(link=>({kind:'mattermost' as const,id:link.postId,team:link.team,url:link.url}))]),...card.unassignedMattermostLinks.map(link=>({kind:'mattermost' as const,id:link.postId,team:link.team,url:link.url}))])??[],[snapshot]);
 const accept=(value:Snapshot)=>shared.current?.accept(value);const reload=()=>shared.current?.reload();
 const card=selection?.kind==='card'?snapshot?.cards.find(item=>item.id===selection.id):undefined;
 const close=()=>{
  if(selectionRef.current!==selection)return;
  if(selection?.kind==='card'||selection?.kind==='new')setFocusRequest(previous=>({target:selection.kind==='card'?{kind:'card',id:selection.id}:{kind:'column',id:selection.columnId,index:0},sequence:(previous?.sequence??0)+1}));
  setSelection(null);
 };
 return <PreviewProvider resources={resources}><header className="app-header"><div className="brand"><span className="brand-mark">w.</span><div><h1>Worklog</h1><p>{t("app.tagline")}</p></div></div><div className="header-meta"><LanguageSwitcher/>{__SITE_CONFIG__.mode==='dummy'&&<span className="demo-badge">{t("environment.demo")}</span>}<span role="status" className="sync-status">● {t(status)}</span><button onClick={reload}>{t("sync.refresh")}</button></div></header>
  <div className="board-toolbar"><div><span className="eyebrow">{t('board.eyebrow')}</span><h2>{t('board.title')} <span>{t(snapshot?.cards.length===1?'board.oneWorkItem':'board.workCount',{count:snapshot?.cards.length??0})}</span></h2></div><div className="row-actions"><button disabled={!snapshot} onClick={()=>setSelection({kind:'columns'})}>{t("columns.manage")}</button><button className="primary" aria-label={t("card.new")} disabled={!snapshot?.columns.length} onClick={()=>{const column=snapshot?.columns[0];if(column)setSelection({kind:'new',columnId:column.id});}}>＋ {t('card.new')}</button></div></div>
  <PreviewToolbar/>
  {snapshot?<Board snapshot={snapshot} open={item=>setSelection({kind:'card',id:item.id})} create={columnId=>setSelection({kind:'new',columnId})} accept={accept} reload={reload} focusRequest={focusRequest}/>:<p className="loading">{t("board.loading")}</p>}
  <footer className="app-footer"><span>{t("app.sharedNotesFooter")}</span><span>{t("app.sourceContentFooter")}</span></footer>
  {snapshot&&selection?.kind==='columns'&&<ColumnDialog snapshot={snapshot} accept={accept} reload={reload} close={close}/>}
  {snapshot&&(selection?.kind==='new'||(selection?.kind==='card'&&card))&&<CardDialog key={selection.kind==='card'?selection.id:'new'} card={card} columnId={selection.kind==='new'?selection.columnId:card!.columnId} snapshot={snapshot} accept={accept} reload={reload} close={close}/>}
 </PreviewProvider>;
}
