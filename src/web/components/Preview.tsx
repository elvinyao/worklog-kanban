import { useEffect,useMemo,useState } from 'react';
import type { Card } from '../api';
import type { Resource } from '../../contracts/resource-links';
import type { MattermostPreview,PreviewError } from '../../contracts/preview-messages';
import { resourceKey } from '../state/preview';
import { avatarUrl,releaseAvatar,safeMarkdown } from '../safe-content';
import {useLanguage} from '../i18n';
import { usePreviews } from './PreviewProvider';
const errorLabel=(error:PreviewError)=>(({login_required:'preview.loginRequired',unavailable:'preview.unavailable',network:'preview.networkFailed',rate_limited:'preview.rateLimited',protocol:'preview.unreadableResponse',disconnected:'preview.disconnected',configuration_mismatch:'connection.configurationMismatch'} as const)[error.code]);
function Avatar({data}:{data:MattermostPreview}){
 const [url,setUrl]=useState<string>();
 useEffect(()=>{const value=avatarUrl(data.avatar);setUrl(value);return()=>releaseAvatar(value);},[data.avatar]);
 return url?<img className="avatar" src={url} alt="" onError={()=>{releaseAvatar(url);setUrl(undefined);}}/>:<span className="avatar placeholder" aria-hidden="true">{data.author.slice(0,1)||'?'}</span>;
}
function Message({data}:{data:MattermostPreview}){
 const {t,date}=useLanguage();
 const body=useMemo(()=>safeMarkdown(data.text),[data.text]);
 return <><div className="message-author"><Avatar data={data}/><div><strong>{data.author||t('preview.unknownUser')}</strong><span>{data.channel??t('preview.channelUnavailable')} · {date(data.createdAt)}</span></div></div><div className="safe-markdown" dangerouslySetInnerHTML={{__html:body.html}}/>{body.truncated&&<p className="hint">{t("preview.contentTruncated")}</p>}</>;
}
export function Preview({resource,compact=false}:{resource:Resource;compact?:boolean}){
 const {t,date,time}=useLanguage();
 const {views,connection,refresh}=usePreviews();const key=resourceKey(resource);const view=views.get(key);const state=view?.state??{status:'idle' as const};
 const [now,setNow]=useState(Date.now);const retryAt=view?.retryAt??0;
 useEffect(()=>{let timer:ReturnType<typeof setTimeout>;const update=()=>{const current=Date.now();setNow(current);if(retryAt>current)timer=setTimeout(update,Math.min(retryAt-current+10,2147483647));};update();return()=>clearTimeout(timer);},[retryAt]);
 const data='data' in state?state.data:undefined;
 return <section className={'preview '+(compact?'compact':'')} aria-label={t('preview.ariaLabel',{source:resource.kind==='jira'?'Jira':'Mattermost',id:resource.id})}>
  <div className="preview-heading"><span>{resource.kind==='jira'?resource.id:t('preview.message')}</span><button type="button" aria-label={t("preview.refresh")} title={t("preview.refresh")} disabled={connection!=='connected'||state.status==='loading'||now<retryAt} onClick={()=>refresh(key)}>↻</button></div>
  {state.status==='loading'&&<p className="preview-status">{t("preview.loading")}</p>}
  {state.status==='idle'&&<p className="preview-status">{t(connection==='connected'?'preview.waiting':'preview.connectPrompt')}</p>}
  {(state.status==='error'||state.status==='stale')&&<p className="preview-status error-text">{state.status==='stale'&&<strong className="old-label">{t("preview.outdated")}</strong>}{t(errorLabel(state.error))}{now<retryAt&&<span> · {t('preview.retryAfter',{time:time(retryAt)})}</span>}</p>}
  {data?.kind==='jira'&&<><p className="jira-summary">{data.summary}</p><div className="jira-meta"><span className="tag">{data.status}</span><span>{data.assignee??t('preview.unassigned')}</span></div>{data.commentUnavailable?<p className="hint">{t('preview.commentsUnavailable')}</p>:!compact&&(data.comment?<div className="jira-comment"><span>{data.comment.author||t('preview.unknownUser')} · {date(data.comment.created)}</span><p>{data.comment.excerpt}</p></div>:<p className="hint">{t("preview.noComments")}</p>)}</>}
  {data?.kind==='mattermost'&&<Message data={data}/>}
  <div className="preview-footer">{'lastSuccess' in state&&<span data-testid="preview-time">{t('preview.lastLoaded',{time:time(state.lastSuccess)})}</span>}<a href={resource.url} target="_blank" rel="noopener noreferrer">{t("preview.openOriginal")}</a></div>
 </section>;
}
export function CardLinks({card,previews=false,showDescriptions=false}:{card:Card;previews?:boolean;showDescriptions?:boolean}){
 const {t}=useLanguage();
 const message=(link:Card['unassignedMattermostLinks'][number],index:number)=><div key={link.id}><p className="original-link"><a href={link.url} target="_blank" rel="noopener noreferrer">{t('card.openMessage',{index:index+1})}</a>{(!previews||showDescriptions)&&link.description&&<span className="shared-message-description">{link.description}</span>}</p>{previews&&<Preview resource={{kind:'mattermost',id:link.postId,team:link.team,url:link.url}}/>}</div>;
 return <>{card.jiraLinks.map(jira=><section className="jira-related" key={jira.id} aria-label={jira.key}><h3><a href={jira.url} target="_blank" rel="noopener noreferrer">{jira.key} ↗</a></h3>{previews&&<Preview resource={{kind:'jira',id:jira.key,url:jira.url}}/>}<div className="jira-messages">{jira.mattermostLinks.map(message)}</div></section>)}{card.unassignedMattermostLinks.length>0&&<section className="unassigned-messages"><h3>{t('card.unassignedMessages')}</h3>{card.unassignedMattermostLinks.map(message)}</section>}</>;
}
