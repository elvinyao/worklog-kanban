import type { Snapshot } from './api';
export type BoardFocus={kind:'card';id:string}|{kind:'column';id:string;index:number};
export type Command={kind:'focus';target:BoardFocus}|{kind:'move';id:string;columnId:string;index:number}|{kind:'open';id:string}|{kind:'none'};
export function keyboardCommand(event:KeyboardEvent,snapshot:Snapshot,focus:BoardFocus):Command|null{
 if(event.isComposing||event.keyCode===229||event.ctrlKey||event.metaKey||event.shiftKey)return null;
 if(event.target instanceof HTMLElement&&(event.target.isContentEditable||event.target.closest('input,textarea,select,[role="textbox"]')))return null;
 const card=focus.kind==='card'?snapshot.cards.find(item=>item.id===focus.id):undefined;
 const columnId=card?.columnId??(focus.kind==='column'?focus.id:null);
 const columnIndex=snapshot.columns.findIndex(column=>column.id===columnId);
 if(columnIndex<0)return null;
 const cards=snapshot.cards.filter(item=>item.columnId===columnId);
 const index=card?cards.findIndex(item=>item.id===card.id):focus.kind==='column'?focus.index:0;
 if(event.key==='Enter'&&!event.altKey)return card?{kind:'open',id:card.id}:{kind:'none'};
 if(event.key==='ArrowLeft'||event.key==='ArrowRight'){
  const targetColumn=snapshot.columns[columnIndex+(event.key==='ArrowLeft'?-1:1)];
  if(!targetColumn)return {kind:'none'};
  const targetCards=snapshot.cards.filter(item=>item.columnId===targetColumn.id);
  if(event.altKey)return card?{kind:'move',id:card.id,columnId:targetColumn.id,index:targetCards.length}:{kind:'none'};
  const target=targetCards[Math.min(index,targetCards.length-1)];
  return {kind:'focus',target:target?{kind:'card',id:target.id}:{kind:'column',id:targetColumn.id,index}};
 }
 if((event.key==='ArrowUp'||event.key==='ArrowDown')&&!event.altKey){
  const target=cards[card?index+(event.key==='ArrowUp'?-1:1):Math.min(index,cards.length-1)];
  return target?{kind:'focus',target:{kind:'card',id:target.id}}:{kind:'none'};
 }
 return null;
}
