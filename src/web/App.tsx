import { useEffect,useRef,useState } from 'react';
import { api,type Snapshot } from './api';
import { SharedBoard,subscribe } from './state/shared';
import { Board } from './components/Board';
import { CardDialog } from './components/CardDialog';
import { ColumnDialog } from './components/ColumnDialog';
type Selection={kind:'card';id:string}|{kind:'new';columnId:string}|{kind:'columns'}|null;
export function App(){
 const [snapshot,setSnapshot]=useState<Snapshot>();const [status,setStatus]=useState('正在连接');const [selection,setSelection]=useState<Selection>(null);
 const shared=useRef<SharedBoard|null>(null);
 useEffect(()=>{const state=new SharedBoard(subscribe,api.board,setSnapshot,setStatus);shared.current=state;state.start();return()=>{state.close();shared.current=null;};},[]);
 const accept=(value:Snapshot)=>shared.current?.accept(value);const reload=()=>shared.current?.reload();
 const card=selection?.kind==='card'?snapshot?.cards.find(item=>item.id===selection.id):undefined;
 return <><header className="app-header"><div className="brand"><span className="brand-mark">w.</span><div><h1>Worklog</h1><p>让工作进展有迹可循</p></div></div><div className="header-meta">{__SITE_CONFIG__.mode==='dummy'&&<span className="demo-badge">模拟环境</span>}<span role="status" className="sync-status">● {status}</span><button onClick={reload}>重新同步</button></div></header>
  <div className="board-toolbar"><div><span className="eyebrow">TEAM WORKSPACE</span><h2>共享工作看板 <span>{snapshot?.cards.length??0} 项工作</span></h2></div><div className="row-actions"><button disabled={!snapshot} onClick={()=>setSelection({kind:'columns'})}>管理列</button><button className="primary" aria-label="新建卡片" disabled={!snapshot?.columns.length} onClick={()=>{const column=snapshot?.columns[0];if(column)setSelection({kind:'new',columnId:column.id});}}>＋ 新建卡片</button></div></div>
  {snapshot?<Board snapshot={snapshot} open={item=>setSelection({kind:'card',id:item.id})} create={columnId=>setSelection({kind:'new',columnId})}/>:<p className="loading">正在读取共享看板…</p>}
  <footer className="app-footer"><span>共享笔记 · 即时同步</span><span>Jira 与消息原文保留在各自系统</span></footer>
  {snapshot&&selection?.kind==='columns'&&<ColumnDialog snapshot={snapshot} accept={accept} reload={reload} close={()=>setSelection(current=>current===selection?null:current)}/>}
  {snapshot&&(selection?.kind==='new'||(selection?.kind==='card'&&card))&&<CardDialog key={selection.kind==='card'?selection.id:'new'} card={card} columnId={selection.kind==='new'?selection.columnId:card!.columnId} snapshot={snapshot} accept={accept} reload={reload} close={()=>setSelection(current=>current===selection?null:current)}/>}
 </>;
}
