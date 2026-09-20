import { useEffect,useLayoutEffect,useRef,useState,type DragEvent,type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { api,errorText,type Card,type Snapshot } from '../api';
import { keyboardCommand,type BoardFocus } from '../keyboard';
import { dropIndex,moveLayout,type Move } from '../drag';
import {useLanguage} from '../i18n';
import type {MessageKey} from '../i18n/core';
import { Preview } from './Preview';
export interface FocusRequest {target:BoardFocus;sequence:number}
export function Board({snapshot,open,create,accept,reload,focusRequest,showPreviews=false,readOnly=false}:{snapshot:Snapshot;open:(card:Card)=>void;create:(columnId:string)=>void;accept:(value:Snapshot)=>void;reload:()=>void;focusRequest:FocusRequest|null;showPreviews?:boolean;readOnly?:boolean}){
 const {t,column:columnLabel}=useLanguage();
 const [selected,setSelected]=useState<BoardFocus|null>(null);const selectedRef=useRef<BoardFocus|null>(null);
 const [pending,setPending]=useState<Move|null>(null);const busy=useRef(false);const [error,setError]=useState<MessageKey|''>('');
 const board=useRef<HTMLElement>(null);const cards=useRef(new Map<string,HTMLButtonElement>());const columns=useRef(new Map<string,HTMLElement>());
 const dragging=useRef<string|null>(null);const dragged=useRef(false);const hadFocus=useRef(false);const anchor=useRef({column:0,index:0});
 const dragSource=useRef<HTMLElement|null>(null);
 const composing=useRef(false);
 const layout=pending?moveLayout(snapshot,pending):snapshot;
 const remember=(target:BoardFocus)=>{selectedRef.current=target;setSelected(target);const card=target.kind==='card'?layout.cards.find(item=>item.id===target.id):undefined;const columnId=card?.columnId??target.id;anchor.current={column:Math.max(0,layout.columns.findIndex(column=>column.id===columnId)),index:card?.position??(target.kind==='column'?target.index:0)};};
 const focus=(target:BoardFocus)=>{
  let next=target;let node=target.kind==='card'?cards.current.get(target.id):columns.current.get(target.id);
  if(!node){const column=layout.columns[Math.min(anchor.current.column,layout.columns.length-1)];if(!column)return;const items=layout.cards.filter(card=>card.columnId===column.id);const card=items[Math.min(anchor.current.index,items.length-1)];next=card?{kind:'card',id:card.id}:{kind:'column',id:column.id,index:anchor.current.index};node=card?cards.current.get(card.id):columns.current.get(column.id);}
  remember(next);if(node&&document.activeElement!==node)node.focus();
 };
 useEffect(()=>{const onFocus=(event:FocusEvent)=>{if(event.target!==document.body)hadFocus.current=board.current?.contains(event.target as Node)??false;};document.addEventListener('focusin',onFocus);return()=>document.removeEventListener('focusin',onFocus);},[]);
 useLayoutEffect(()=>{
  // A remote move can detach the native drag source before React receives dragend.
  if(dragSource.current&&!dragSource.current.isConnected){dragSource.current=null;dragging.current=null;dragged.current=false;}
  if(!hadFocus.current||!selectedRef.current||document.querySelector('dialog[open]'))return;
  if(document.activeElement===document.body||!document.activeElement?.isConnected)focus(selectedRef.current);
 },[snapshot,pending]);
 useEffect(()=>{if(!focusRequest)return;const frame=requestAnimationFrame(()=>{if(!document.querySelector('dialog[open]'))focus(focusRequest.target);});return()=>cancelAnimationFrame(frame);},[focusRequest]);
 async function move(value:Move){
  if(readOnly||busy.current)return;const card=snapshot.cards.find(item=>item.id===value.id);if(!card||(card.columnId===value.columnId&&card.position===value.index))return;busy.current=true;setError('');remember({kind:'card',id:value.id});setPending(value);
  try{accept(await api.moveCard(value.id,{targetColumnId:value.columnId,index:value.index,expectedBoardRevision:snapshot.revision}));}
  catch(reason){setError(errorText(reason));reload();}
  finally{busy.current=false;setPending(null);}
 }
 function keydown(event:ReactKeyboardEvent<HTMLElement>){
  if(composing.current)return;
  const element=event.target as HTMLElement;const id=element.dataset.navCard??element.dataset.navColumn;if(!id)return;
  const target:BoardFocus=element.dataset.navCard?{kind:'card',id}:{kind:'column',id,index:selectedRef.current?.kind==='column'?selectedRef.current.index:0};
  const command=keyboardCommand(event.nativeEvent,layout,target);if(!command)return;event.preventDefault();if(busy.current)return;
  if(command.kind==='focus')focus(command.target);else if(command.kind==='move')void move(command);else if(command.kind==='open'){const card=layout.cards.find(item=>item.id===command.id);if(card)open(card);}
 }
 function drop(event:DragEvent<HTMLElement>,columnId:string,targetId?:string){
  const id=dragging.current;if(!id||busy.current)return;event.preventDefault();event.stopPropagation();dragging.current=null;setTimeout(()=>{dragged.current=false;},0);
  if(id===targetId)return;
  const rect=event.currentTarget.getBoundingClientRect();const index=targetId?dropIndex(layout,id,targetId,event.clientY>rect.top+rect.height/2):layout.cards.filter(card=>card.columnId===columnId&&card.id!==id).length;
  hadFocus.current=true;focus({kind:'card',id});void move({id,columnId,index});
 }
 return <>{error&&<p role="alert" className="move-error error">{t(error)}</p>}<main ref={board} className="board" aria-label={t("board.ariaLabel")} data-revision={snapshot.revision} aria-busy={!!pending} onCompositionStart={()=>{composing.current=true;}} onCompositionEnd={()=>{composing.current=false;}} onKeyDown={keydown} onFocus={event=>{
  const target=event.target as HTMLElement;const cardId=target.closest<HTMLElement>('[data-card-id]')?.dataset.cardId;if(cardId)remember({kind:'card',id:cardId});else if(target.dataset.navColumn)remember({kind:'column',id:target.dataset.navColumn,index:selectedRef.current?.kind==='column'?selectedRef.current.index:0});
 }}>
  {layout.columns.map(column=><section ref={node=>{if(node)columns.current.set(column.id,node);else columns.current.delete(column.id);}} tabIndex={0} data-nav-column={column.id} data-column-id={column.id} className="column" role="region" aria-label={columnLabel(column)} key={column.id} onDragOver={event=>{if(dragging.current&&!busy.current){event.preventDefault();event.dataTransfer.dropEffect='move';}}} onDrop={event=>drop(event,column.id)}>
   <header className="column-heading"><h2>{columnLabel(column)}{column.isDone&&<small className="done-column-label">{t('archive.doneColumn')}</small>}</h2><span className="count">{layout.cards.filter(card=>card.columnId===column.id).length}</span>{!readOnly&&<button className="icon" aria-label={t('card.newInColumn',{column:columnLabel(column)})} onClick={()=>create(column.id)}>＋</button>}</header>
   <div className="cards">{layout.cards.filter(card=>card.columnId===column.id).map(card=><article className={'card'+(selected?.kind==='card'&&selected.id===card.id?' selected':'')} key={card.id} data-card-id={card.id} draggable={!readOnly&&!pending} onDragStart={event=>{
    if(readOnly||busy.current||(event.target as HTMLElement).closest('a,input,textarea,select')){event.preventDefault();return;}dragSource.current=event.currentTarget;dragging.current=card.id;dragged.current=true;event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',card.id);focus({kind:'card',id:card.id});
   }} onDragEnd={()=>{dragSource.current=null;dragging.current=null;setTimeout(()=>{dragged.current=false;},0);}} onDragOver={event=>{if(dragging.current&&!busy.current){event.preventDefault();event.stopPropagation();event.dataTransfer.dropEffect='move';}}} onDrop={event=>drop(event,card.columnId,card.id)}>
    <button ref={node=>{if(node)cards.current.set(card.id,node);else cards.current.delete(card.id);}} data-nav-card={card.id} className="card-open" aria-label={t('card.open',{title:card.title})} onClick={()=>{if(!busy.current&&!dragged.current)open(card);}}>
     <span className="card-title">{card.title}</span>
     {card.notes&&<span className="card-notes">{card.notes}</span>}
     <span className="card-tags">{card.jiraLinks.length>0&&<span className="tag">{card.jiraLinks.length} Jira</span>}{card.jiraLinks.some(j=>j.mattermostLinks.length>0)&&<span className="tag neutral">{t('card.messageCount',{count:card.jiraLinks.reduce((n,j)=>n+j.mattermostLinks.length,0)})}</span>}{card.unassignedMattermostLinks.length>0&&<span className="tag neutral">{t('card.unassignedMessages')} · {card.unassignedMattermostLinks.length}</span>}</span>
    </button>
    {showPreviews&&card.jiraLinks.map(jira=><section className="card-jira-group" role="group" aria-label={jira.key} key={jira.id}>
     <Preview resource={{kind:'jira',id:jira.key,url:jira.url}} compact/>
     {jira.mattermostLinks.length>0&&<div className="card-jira-messages">{jira.mattermostLinks.map(link=><Preview key={link.id} resource={{kind:'mattermost',id:link.postId,team:link.team,url:link.url}} compact/>)}</div>}
    </section>)}
   </article>)}</div>
   {!layout.cards.some(card=>card.columnId===column.id)&&<p className="empty">{t("board.emptyColumn")}</p>}
   {!readOnly&&<button className="add-card" onClick={()=>create(column.id)}>＋ {t('card.add')}</button>}
  </section>)}
 </main></>;
}
