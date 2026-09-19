import type { Snapshot } from './api';
export interface Move {id:string;columnId:string;index:number}
export function moveLayout(snapshot:Snapshot,move:Move):Snapshot{
 const card=snapshot.cards.find(item=>item.id===move.id);
 if(!card||!snapshot.columns.some(column=>column.id===move.columnId))return snapshot;
 const destination=snapshot.cards.filter(item=>item.columnId===move.columnId&&item.id!==move.id);
 destination.splice(Math.min(move.index,destination.length),0,{...card,columnId:move.columnId});
 return {...snapshot,cards:snapshot.columns.flatMap(column=>(column.id===move.columnId?destination:snapshot.cards.filter(item=>item.columnId===column.id&&item.id!==move.id)).map((item,position)=>({...item,position})))};
}
export function dropIndex(snapshot:Snapshot,draggedId:string,targetId:string,after:boolean):number{
 const target=snapshot.cards.find(card=>card.id===targetId);if(!target)return 0;
 const remaining=snapshot.cards.filter(card=>card.columnId===target.columnId&&card.id!==draggedId);
 const index=remaining.findIndex(card=>card.id===targetId);return Math.max(0,index+(after?1:0));
}
