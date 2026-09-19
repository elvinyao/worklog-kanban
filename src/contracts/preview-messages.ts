import { exact, record, type SiteConfig } from './config';
import { JIRA_KEY, POST_ID, TEAM, parseResource } from './resource-links';

type Envelope = {version:1;id:string};
export type PreviewRequest = Envelope & (
  {op:'hello'} | {op:'jira.preview';key:string} |
  {op:'mattermost.preview';postId:string;team:string} | {op:'cancel';targetId:string}
);
export type PreviewErrorCode = 'login_required'|'unavailable'|'network'|'rate_limited'|'protocol'|'disconnected';
export interface PreviewError {code:PreviewErrorCode;retryAfterMs?:number}
export interface JiraPreview {
  kind:'jira'; key:string; url:string; summary:string; assignee:string|null; status:string;
  comment:{author:string;created:string;excerpt:string}|null;
}
export interface MattermostPreview {
  kind:'mattermost';postId:string;url:string;author:string;channel:string|null;createdAt:string;text:string;
  avatar?:{mime:'image/png'|'image/jpeg';base64:string};
}
export type Preview = JiraPreview | MattermostPreview;
export type PreviewReply = Envelope & ({ok:true;data:Preview|{connected:true}|{cancelled:true}} | {ok:false;error:PreviewError});
export type PreviewState = {status:'idle'|'loading'} | {status:'ready';data:Preview;lastSuccess:number} |
  {status:'error';error:PreviewError;retryAt?:number} | {status:'stale';data:Preview;lastSuccess:number;error:PreviewError};

const requestId = (v:unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(v);
export function parseRequest(value: unknown): PreviewRequest {
  const v = record(value);
  if (v.version !== 1 || !requestId(v.id)) throw new Error('Invalid envelope');
  const base = ['version','id','op'];
  if (v.op === 'hello') exact(v,base);
  else if (v.op === 'cancel') {
    exact(v,[...base,'targetId']);
    if (!requestId(v.targetId)) throw new Error('Invalid cancellation');
  } else if (v.op === 'jira.preview') {
    exact(v,[...base,'key']);
    if (typeof v.key !== 'string' || v.key.length > 200 || !JIRA_KEY.test(v.key)) throw new Error('Invalid issue');
  } else if (v.op === 'mattermost.preview') {
    exact(v,[...base,'postId','team']);
    if (typeof v.postId !== 'string' || !POST_ID.test(v.postId) || typeof v.team !== 'string' || v.team.length > 64 || !TEAM.test(v.team)) throw new Error('Invalid message');
  } else throw new Error('Invalid operation');
  return v as PreviewRequest;
}

function text(value:unknown, max=20000): asserts value is string {
  if (typeof value !== 'string' || value.length > max) throw new Error('Invalid text');
}
function date(value:unknown): void {
  text(value,64);
  if (!Number.isFinite(Date.parse(value))) throw new Error('Invalid date');
}
export function parseReply(value:unknown, config:SiteConfig): PreviewReply {
  const v = record(value);
  if (v.version !== 1 || !requestId(v.id) || typeof v.ok !== 'boolean') throw new Error('Invalid reply');
  exact(v, ['version','id','ok',v.ok ? 'data' : 'error']);
  if (!v.ok) {
    const error = record(v.error);
    exact(error, ['code',...('retryAfterMs' in error ? ['retryAfterMs'] : [])]);
    if (typeof error.code !== 'string' || !['login_required','unavailable','network','rate_limited','protocol','disconnected'].includes(error.code)) throw new Error('Invalid error');
    if ('retryAfterMs' in error && (error.code !== 'rate_limited' || typeof error.retryAfterMs !== 'number' || !Number.isSafeInteger(error.retryAfterMs) || error.retryAfterMs < 0)) throw new Error('Invalid retry time');
  } else {
    const data = record(v.data);
    if (data.connected === true) exact(data,['connected']);
    else if (data.cancelled === true) exact(data,['cancelled']);
    else if (data.kind === 'jira') {
      exact(data,['kind','key','url','summary','assignee','status','comment']);
      text(data.key,200); text(data.url,2048); text(data.summary,2000); text(data.status,200);
      if (data.assignee !== null) text(data.assignee,500);
      const resource = parseResource('jira',data.url,config);
      if (resource.id !== data.key || resource.url !== data.url) throw new Error('Mismatched issue');
      if (data.comment !== null) {
        const comment = record(data.comment);
        exact(comment,['author','created','excerpt']); text(comment.author,500); date(comment.created); text(comment.excerpt);
      }
    } else if (data.kind === 'mattermost') {
      exact(data,['kind','postId','url','author','channel','createdAt','text',...('avatar' in data ? ['avatar'] : [])]);
      text(data.postId,26); text(data.url,2048); text(data.author,500); text(data.text); date(data.createdAt);
      if (data.channel !== null) text(data.channel,500);
      const resource = parseResource('mattermost',data.url,config);
      if (resource.id !== data.postId || resource.url !== data.url) throw new Error('Mismatched post');
      if ('avatar' in data) {
        const avatar = record(data.avatar); exact(avatar,['mime','base64']); text(avatar.base64,350000);
        if (typeof avatar.mime !== 'string' || !['image/png','image/jpeg'].includes(avatar.mime) || !/^[A-Za-z0-9+/]+={0,2}$/.test(avatar.base64)) throw new Error('Invalid avatar');
      }
    } else throw new Error('Invalid preview');
  }
  return v as PreviewReply;
}
