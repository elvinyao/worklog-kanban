import {useLanguage} from '../i18n';
import {newJira,newMessage,type Fields,type JiraDraft,type MessageDraft} from '../state/drafts';

function moved<T>(values:T[],index:number,offset:number){const result=[...values];const target=index+offset;if(target>=0&&target<result.length)[result[index],result[target]]=[result[target]!,result[index]!];return result;}

export function JiraLinksEditor({fields,change}:{fields:Fields;change:(fields:Fields)=>void}){
 const {t}=useLanguage();const jiras=fields.jiraLinks;
 const total=jiras.reduce((sum,jira)=>sum+jira.mattermostLinks.length,fields.unassignedMattermostLinks.length);
 const setJiras=(jiraLinks:JiraDraft[])=>change({...fields,jiraLinks});
 const setJira=(index:number,value:JiraDraft)=>setJiras(jiras.map((jira,i)=>i===index?value:jira));
 const moveMessage=(source:number|null,index:number,targetId:string)=>{
  const target=jiras.find(jira=>jira.draftId===targetId);if(!target||target.mattermostLinks.length>=20)return;
  const link=source===null?fields.unassignedMattermostLinks[index]:jiras[source]?.mattermostLinks[index];if(!link)return;
  change({...fields,jiraLinks:jiras.map((jira,i)=>({...jira,mattermostLinks:jira.draftId===targetId?[...jira.mattermostLinks,{draftId:link.draftId,url:link.url,description:link.description}]:i===source?jira.mattermostLinks.filter((_,n)=>n!==index):jira.mattermostLinks})),unassignedMattermostLinks:source===null?fields.unassignedMattermostLinks.filter((_,n)=>n!==index):fields.unassignedMattermostLinks});
 };
 const destination=(source:number|null,index:number)=><label className="message-destination">{t(source===null?'card.assignMessage':'card.moveMessageTo')}<select value="" onChange={event=>moveMessage(source,index,event.target.value)}><option value="">{t('card.chooseJira')}</option>{jiras.map((jira,i)=>i!==source&&<option key={jira.draftId} value={jira.draftId} disabled={jira.mattermostLinks.length>=20}>{jira.url||t('card.jiraNumber',{index:i+1})}</option>)}</select></label>;
 const messageFields=(link:MessageDraft,index:number,update:(value:MessageDraft)=>void,readOnly=false)=><><label>{t('card.messageUrl',{index:index+1})}<input required maxLength={2048} readOnly={readOnly} value={link.url} onChange={event=>update({...link,url:event.target.value})} placeholder={t('card.messageUrlPlaceholder')}/></label><label>{t('card.messageDescription',{index:index+1})}<input maxLength={2000} value={link.description} onChange={event=>update({...link,description:event.target.value})} placeholder={t('card.messageDescriptionPlaceholder')}/></label></>;
 return <>
  <div className="section-title"><h3>{t('card.jiraTickets')}</h3><span className="hint">{jiras.length}/20 · {t('card.messageCount',{count:total})}/100</span></div>
  <p className="hint">{t('card.hierarchyHint')}</p>
  {jiras.map((jira,index)=><section className="jira-editor" role="group" aria-label={t('card.jiraNumber',{index:index+1})} key={jira.draftId}>
   <div className="jira-editor-heading"><h3>{t('card.jiraNumber',{index:index+1})}</h3><div className="row-actions"><button type="button" disabled={index===0} aria-label={t('card.moveJiraUp',{index:index+1})} onClick={()=>setJiras(moved(jiras,index,-1))}>↑</button><button type="button" disabled={index===jiras.length-1} aria-label={t('card.moveJiraDown',{index:index+1})} onClick={()=>setJiras(moved(jiras,index,1))}>↓</button><button type="button" aria-label={t('card.removeJira',{index:index+1})} onClick={()=>setJiras(jiras.filter((_,i)=>i!==index))}>{t('common.remove')}</button></div></div>
   <label>{t('card.jiraKeyOrUrl')}<input required maxLength={2048} value={jira.url} onChange={event=>setJira(index,{...jira,url:event.target.value})} placeholder={t('card.jiraPlaceholder')}/></label>
   <div className="section-title"><h3>{t('card.mattermostMessages')}</h3><span className="hint">{jira.mattermostLinks.length}/20</span></div>
   {jira.mattermostLinks.map((link,n)=><div className="link-editor" key={link.draftId}>
    {messageFields(link,n,value=>setJira(index,{...jira,mattermostLinks:jira.mattermostLinks.map((item,i)=>i===n?value:item)}))}
    <div className="row-actions"><button type="button" disabled={n===0} aria-label={t('card.moveMessageUp',{index:n+1})} onClick={()=>setJira(index,{...jira,mattermostLinks:moved(jira.mattermostLinks,n,-1)})}>↑</button><button type="button" disabled={n===jira.mattermostLinks.length-1} aria-label={t('card.moveMessageDown',{index:n+1})} onClick={()=>setJira(index,{...jira,mattermostLinks:moved(jira.mattermostLinks,n,1)})}>↓</button><button type="button" aria-label={t('card.removeMessage',{index:n+1})} onClick={()=>setJira(index,{...jira,mattermostLinks:jira.mattermostLinks.filter((_,i)=>i!==n)})}>{t('common.remove')}</button></div>
    {jiras.length>1&&destination(index,n)}
   </div>)}
   <button type="button" disabled={jira.mattermostLinks.length>=20||total>=100} onClick={()=>setJira(index,{...jira,mattermostLinks:[...jira.mattermostLinks,newMessage()]})}>＋ {t('card.addMessageLink')}</button>
  </section>)}
  <button type="button" disabled={jiras.length>=20} onClick={()=>setJiras([...jiras,newJira()])}>＋ {t('card.addJira')}</button>
  {fields.unassignedMattermostLinks.length>0&&<section className="unassigned-messages" aria-label={t('card.unassignedMessages')}><h3>{t('card.unassignedMessages')}</h3><p className="hint">{t('card.unassignedHint')}</p>{fields.unassignedMattermostLinks.map((link,index)=><div className="link-editor" key={link.id}>
   {messageFields(link,index,value=>change({...fields,unassignedMattermostLinks:fields.unassignedMattermostLinks.map((item,i)=>i===index?{...value,id:link.id}:item)}),true)}
   {destination(null,index)}<button type="button" aria-label={t('card.removeMessage',{index:index+1})} onClick={()=>change({...fields,unassignedMattermostLinks:fields.unassignedMattermostLinks.filter((_,i)=>i!==index)})}>{t('common.remove')}</button>
  </div>)}</section>}
 </>;
}
