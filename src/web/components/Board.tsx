import type { Card,Snapshot } from '../api';
import { Preview } from './Preview';
export function Board({snapshot,open,create}:{snapshot:Snapshot;open:(card:Card)=>void;create:(columnId:string)=>void}){
 return <main className="board" aria-label="工作看板" data-revision={snapshot.revision}>
  {snapshot.columns.map(column=><section className="column" role="region" aria-label={column.name} key={column.id}>
   <header className="column-heading"><h2>{column.name}</h2><span className="count">{snapshot.cards.filter(card=>card.columnId===column.id).length}</span><button className="icon" aria-label={'在'+column.name+'新建卡片'} onClick={()=>create(column.id)}>＋</button></header>
   <div className="cards">{snapshot.cards.filter(card=>card.columnId===column.id).map(card=><article className="card" key={card.id} data-card-id={card.id}>
    <button className="card-open" aria-label={'打开卡片：'+card.title} onClick={()=>open(card)}>
     <span className="card-title">{card.title}</span>
     {card.notes&&<span className="card-notes">{card.notes}</span>}
     <span className="card-tags">{card.jira&&<span className="tag">{card.jira.key}</span>}{card.mattermostLinks.length>0&&<span className="tag neutral">{card.mattermostLinks.length} 条消息</span>}</span>
    </button>
    {card.jira&&<Preview key={card.jira.url} resource={{kind:'jira',id:card.jira.key,url:card.jira.url}} compact/>}
   </article>)}</div>
   {!snapshot.cards.some(card=>card.columnId===column.id)&&<p className="empty">从一张工作卡片开始</p>}
   <button className="add-card" onClick={()=>create(column.id)}>＋ 添加卡片</button>
  </section>)}
 </main>;
}
