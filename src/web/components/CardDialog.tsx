import { useEffect,useState } from 'react';
import { api,ApiError,errorText,type Card,type Snapshot } from '../api';
import { draftFrom,isDirty,payloadFrom,reconcileDraft,type Draft,type Fields } from '../state/drafts';
import { Modal } from './Modal';

export function CardDialog({card,columnId,snapshot,accept,reload,close}:{card:Card|undefined;columnId:string;snapshot:Snapshot;accept:(value:Snapshot)=>void;reload:()=>void;close:()=>void}){
 const [draft,setDraft]=useState<Draft>(()=>draftFrom(card??{id:'new',title:'',notes:'',version:0,columnId,position:0,jira:null,mattermostLinks:[]}));
 const [saving,setSaving]=useState(false);const [error,setError]=useState('');const [conflict,setConflict]=useState(false);const [closing,setClosing]=useState(false);
 const [target,setTarget]=useState(columnId);
 const targetExists=snapshot.columns.some(column=>column.id===target);
 useEffect(()=>{if(card)setDraft(value=>reconcileDraft(value,card));},[card]);
 const field=<K extends keyof Fields>(key:K,value:Fields[K])=>setDraft(previous=>({...previous,fields:{...previous.fields,[key]:value}}));
 const changeLink=(index:number,key:'url'|'description',value:string)=>field('mattermostLinks',draft.fields.mattermostLinks.map((link,i)=>i===index?{...link,[key]:value}:link));
 const moveLink=(index:number,offset:number)=>{const links=[...draft.fields.mattermostLinks];const target=index+offset;if(target<0||target>=links.length)return;[links[index],links[target]]=[links[target]!,links[index]!];field('mattermostLinks',links);};
 const requestClose=()=>{if(saving)return;if(isDirty(draft))setClosing(true);else close();};
 const requestCloseDiscard=()=>{if(!saving)close();};
 async function save(compare=false){
  if(saving||(!card&&!targetExists))return;setSaving(true);setError('');
  try{
   const fields=payloadFrom(draft);fields.jiraUrl=fields.jiraUrl?.trim()||null;
   const result=card?await api.editCard(card.id,{...fields,expectedVersion:compare?card.version:draft.baseVersion}):await api.createCard({...fields,columnId:target});
   accept(result);close();
  }catch(reason){setError(errorText(reason));if(reason instanceof ApiError&&reason.status===409){setConflict(true);reload();}}
  finally{setSaving(false);}
 }
 const changed=!!card&&card.version!==draft.baseVersion&&isDirty(draft);
 return <Modal title={card?'卡片详情':'新建卡片'} close={requestClose}>
  <div className="dialog-head"><div><span className="eyebrow">SHARED WORK</span><h2>{card?'卡片详情':'新建卡片'}</h2></div><button className="icon" aria-label="关闭详情" onClick={requestClose} disabled={saving}>×</button></div>
  <form onSubmit={event=>{event.preventDefault();void save();}}>
   <div className="dialog-content">
    <p className="hint">标题、笔记和关联说明对所有看板使用者可见。</p>
    <fieldset disabled={saving}>
     {!card&&<><label>所在列<select value={targetExists?target:''} onChange={event=>setTarget(event.target.value)}><option value="" disabled>选择一列</option>{snapshot.columns.map(column=><option key={column.id} value={column.id}>{column.name}</option>)}</select></label>{!targetExists&&<p className="notice">原来的列已删除，请选择新的列。</p>}</>}
     <label>共享标题<input autoFocus required maxLength={200} value={draft.fields.title} onChange={event=>field('title',event.target.value)} placeholder="这张卡片要完成什么？"/></label>
     <label>共享笔记<textarea rows={7} maxLength={20000} value={draft.fields.notes} onChange={event=>field('notes',event.target.value)} placeholder="记录进展、结论与下一步，支持纯文本。"/></label>
     <div className="section-title"><h3>Jira 关联</h3>{card?.jira&&<a href={card.jira.url} target="_blank" rel="noopener noreferrer">打开 Jira 原文 ↗</a>}</div>
     <label>Jira 编号或链接<input value={draft.fields.jiraUrl??''} onChange={event=>field('jiraUrl',event.target.value||null)} placeholder="例如 DEMO-1；留空即可解绑"/></label>
     <div className="section-title"><h3>Mattermost 消息</h3><span className="hint">{draft.fields.mattermostLinks.length}/20</span></div>
     {draft.fields.mattermostLinks.map((link,index)=><div className="link-editor" key={index}>
      <label>消息链接 {index+1}<input required value={link.url} onChange={event=>changeLink(index,'url',event.target.value)} placeholder="粘贴单条消息的原始链接"/></label>
      <label>消息说明 {index+1}<input maxLength={2000} value={link.description} onChange={event=>changeLink(index,'description',event.target.value)} placeholder="这条消息与工作有什么关系？"/></label>
      <div className="row-actions"><button type="button" disabled={index===0} aria-label={'上移消息 '+(index+1)} onClick={()=>moveLink(index,-1)}>↑</button><button type="button" disabled={index===draft.fields.mattermostLinks.length-1} aria-label={'下移消息 '+(index+1)} onClick={()=>moveLink(index,1)}>↓</button><button type="button" aria-label={'移除消息 '+(index+1)} onClick={()=>field('mattermostLinks',draft.fields.mattermostLinks.filter((_,i)=>i!==index))}>移除</button></div>
     </div>)}
     <button type="button" disabled={draft.fields.mattermostLinks.length>=20} onClick={()=>field('mattermostLinks',[...draft.fields.mattermostLinks,{url:'',description:''}])}>＋ 添加消息关联</button>
    </fieldset>
    {card?.mattermostLinks.map((link,index)=><p className="original-link" key={link.id}><a href={link.url} target="_blank" rel="noopener noreferrer">打开消息原文 {index+1} ↗</a></p>)}
    {changed&&<div className="notice"><strong>共享内容已更新，本地草稿已保留。</strong><details open={conflict}><summary>比较当前共享内容</summary><p>标题：{card.title}</p><pre>{card.notes||'（笔记为空）'}</pre><p>Jira：{card.jira?.url??'未关联'}</p>{card.mattermostLinks.map(link=><p key={link.id}>{link.url}<br/>{link.description}</p>)}</details></div>}
    {error&&<p role="alert" className="error">{error}</p>}
    {closing&&<div className="notice" role="alert"><p>有未保存的修改。</p><div className="row-actions"><button type="button" disabled={saving} onClick={()=>setClosing(false)}>继续编辑</button><button type="button" disabled={saving} onClick={requestCloseDiscard}>放弃修改并关闭</button></div></div>}
   </div>
   <footer className="dialog-footer"><span className="hint">{snapshot.columns.find(column=>column.id===(card?.columnId??target))?.name}</span><div className="row-actions">{conflict&&changed&&<button type="button" disabled={saving} onClick={()=>void save(true)}>比较后用草稿保存</button>}<button type="submit" className="primary" disabled={saving||!draft.fields.title.trim()||(!card&&!targetExists)}>{saving?'正在保存…':card?'保存修改':'创建卡片'}</button></div></footer>
  </form>
 </Modal>;
}
