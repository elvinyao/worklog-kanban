import { useEffect,useMemo,useState } from 'react';
import type { Resource } from '../../contracts/resource-links';
import type { MattermostPreview,PreviewError } from '../../contracts/preview-messages';
import { resourceKey } from '../state/preview';
import { avatarUrl,releaseAvatar,safeMarkdown } from '../safe-content';
import {useLanguage} from '../i18n';
import { usePreviews } from './PreviewProvider';
const errorLabel=(error:PreviewError)=>(({login_required:'需要登录原系统',unavailable:'无权访问或资源不可用',network:'网络读取失败',rate_limited:'请求受限，请稍后手动刷新',protocol:'响应无法读取',disconnected:'扩展未连接'} as const)[error.code]);
function Avatar({data}:{data:MattermostPreview}){
 const [url,setUrl]=useState<string>();
 useEffect(()=>{const value=avatarUrl(data.avatar);setUrl(value);return()=>releaseAvatar(value);},[data.avatar]);
 return url?<img className="avatar" src={url} alt="" onError={()=>{releaseAvatar(url);setUrl(undefined);}}/>:<span className="avatar placeholder" aria-hidden="true">{data.author.slice(0,1)||'?'}</span>;
}
function Message({data}:{data:MattermostPreview}){
 const {t,date}=useLanguage();
 const body=useMemo(()=>safeMarkdown(data.text),[data.text]);
 return <><div className="message-author"><Avatar data={data}/><div><strong>{data.author||t('未知用户')}</strong><span>{data.channel??t('频道不可见')} · {date(data.createdAt)}</span></div></div><div className="safe-markdown" dangerouslySetInnerHTML={{__html:body.html}}/>{body.truncated&&<p className="hint">{t("内容已截断，请打开原文查看。")}</p>}</>;
}
export function Preview({resource,compact=false}:{resource:Resource;compact?:boolean}){
 const {t,date,time}=useLanguage();
 const {views,connection,refresh}=usePreviews();const key=resourceKey(resource);const view=views.get(key);const state=view?.state??{status:'idle' as const};
 const [now,setNow]=useState(Date.now);const retryAt=view?.retryAt??0;
 useEffect(()=>{let timer:ReturnType<typeof setTimeout>;const update=()=>{const current=Date.now();setNow(current);if(retryAt>current)timer=setTimeout(update,Math.min(retryAt-current+10,2147483647));};update();return()=>clearTimeout(timer);},[retryAt]);
 const data='data' in state?state.data:undefined;
 return <section className={'preview '+(compact?'compact':'')} aria-label={t('个人 {source} 预览 {id}',{source:resource.kind==='jira'?'Jira':'Mattermost',id:resource.id})}>
  <div className="preview-heading"><span>{resource.kind==='jira'?resource.id:t('消息预览')} <small>{t("仅自己可见")}</small></span><button type="button" aria-label={t("刷新个人预览")} title={t("刷新个人预览")} disabled={connection!=='connected'||state.status==='loading'||now<retryAt} onClick={()=>refresh(key)}>↻</button></div>
  {state.status==='loading'&&<p className="preview-status">{t("正在读取…")}</p>}
  {state.status==='idle'&&<p className="preview-status">{t(connection==='connected'?'等待读取':'连接扩展后可查看个人预览')}</p>}
  {(state.status==='error'||state.status==='stale')&&<p className="preview-status error-text">{state.status==='stale'&&<strong className="old-label">{t("旧内容")}</strong>}{t(errorLabel(state.error))}{now<retryAt&&<span> · {t('{time} 后可重试',{time:time(retryAt)})}</span>}</p>}
  {data?.kind==='jira'&&<><p className="jira-summary">{data.summary}</p><div className="jira-meta"><span className="tag">{data.status}</span><span>{data.assignee??t('未指定担当者')}</span></div>{!compact&&(data.comment?<div className="jira-comment"><span>{data.comment.author||t('未知用户')} · {date(data.comment.created)}</span><p>{data.comment.excerpt}</p></div>:<p className="hint">{t("暂无评论")}</p>)}</>}
  {data?.kind==='mattermost'&&<Message data={data}/>}
  <div className="preview-footer">{'lastSuccess' in state&&<span data-testid="preview-time">{t('最后成功 {time}',{time:time(state.lastSuccess)})}</span>}<a href={resource.url} target="_blank" rel="noopener noreferrer">{t("查看原文 ↗")}</a></div>
 </section>;
}
