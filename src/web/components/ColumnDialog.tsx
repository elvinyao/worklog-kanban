import { useEffect,useState } from 'react';
import { api,errorText,type Column,type Snapshot } from '../api';
import { Modal } from './Modal';
function ColumnRow({column,index,snapshot,busy,run}:{column:Column;index:number;snapshot:Snapshot;busy:boolean;run:(operation:()=>Promise<Snapshot>)=>Promise<void>}){
 const [name,setName]=useState(column.name);const [baseline,setBaseline]=useState(column.name);const [target,setTarget]=useState('');
 useEffect(()=>{if(name===baseline)setName(column.name);setBaseline(column.name);},[column.name]);
 const reorder=(offset:number)=>{const ids=snapshot.columns.map(item=>item.id);const to=index+offset;[ids[index],ids[to]]=[ids[to]!,ids[index]!];return api.reorderColumns({columnIds:ids,expectedBoardRevision:snapshot.revision});};
 return <div className="column-editor">
  <label>列名称 {index+1}<input value={name} maxLength={80} onChange={event=>setName(event.target.value)} disabled={busy}/></label>
  <div className="row-actions"><button disabled={busy||!name.trim()} aria-label={'保存列名 '+(index+1)} onClick={()=>void run(()=>api.renameColumn(column.id,{name,expectedBoardRevision:snapshot.revision}))}>保存名称</button><button disabled={busy||index===0} aria-label={'上移列 '+(index+1)} onClick={()=>void run(()=>reorder(-1))}>↑</button><button disabled={busy||index===snapshot.columns.length-1} aria-label={'下移列 '+(index+1)} onClick={()=>void run(()=>reorder(1))}>↓</button></div>
  {snapshot.columns.length>1&&<div className="delete-column"><label>删除{column.name}后移至<select disabled={busy} value={target} onChange={event=>setTarget(event.target.value)}><option value="">选择接收卡片的列</option>{snapshot.columns.filter(item=>item.id!==column.id).map(item=><option value={item.id} key={item.id}>{item.name}</option>)}</select></label><button className="danger" disabled={busy||!snapshot.columns.some(item=>item.id===target)} onClick={()=>void run(()=>api.deleteColumn(column.id,{targetColumnId:target,expectedBoardRevision:snapshot.revision}))}>迁移卡片并删除{column.name}</button></div>}
 </div>;
}
export function ColumnDialog({snapshot,accept,reload,close}:{snapshot:Snapshot;accept:(value:Snapshot)=>void;reload:()=>void;close:()=>void}){
 const [name,setName]=useState('');const [busy,setBusy]=useState(false);const [error,setError]=useState('');
 async function run(operation:()=>Promise<Snapshot>){if(busy)return;setBusy(true);setError('');try{accept(await operation());}catch(reason){setError(errorText(reason));reload();}finally{setBusy(false);}}
 return <Modal title="管理列" close={()=>{if(!busy)close();}}><div className="dialog-head"><div><span className="eyebrow">BOARD SETTINGS</span><h2>管理列</h2></div><button className="icon" disabled={busy} aria-label="关闭列管理" onClick={close}>×</button></div><div className="dialog-content"><p className="hint">调整工作流。删除列时，其卡片会依原顺序移到目标列末尾。</p>
  {error&&<p role="alert" className="error">{error}</p>}
  {snapshot.columns.map((column,index)=><ColumnRow key={column.id} column={column} index={index} snapshot={snapshot} busy={busy} run={run}/>)}
  <form onSubmit={event=>{event.preventDefault();void run(async()=>{const result=await api.createColumn({name,expectedBoardRevision:snapshot.revision});setName('');return result;});}}><label>新列名称<input maxLength={80} value={name} onChange={event=>setName(event.target.value)} disabled={busy}/></label><button className="primary" disabled={busy||!name.trim()}>添加列</button></form>
 </div></Modal>;
}
