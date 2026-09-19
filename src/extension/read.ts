import { record, type SiteConfig } from '../contracts/config';
import type { Preview, PreviewErrorCode, PreviewRequest } from '../contracts/preview-messages';

export class ReadError extends Error {
  constructor(public code:PreviewErrorCode, public retryAfterMs?:number) { super(code); }
}
export async function readJSON(url:string,signal:AbortSignal):Promise<Record<string,unknown>> {
  const response = await fetch(url,{method:'GET',credentials:'include',cache:'no-store',redirect:'error',signal});
  if (response.status === 401) throw new ReadError('login_required');
  if (response.status === 403 || response.status === 404) throw new ReadError('unavailable');
  if (response.status === 429) throw new ReadError('rate_limited',2000);
  if (!response.ok) throw new ReadError('network');
  if (!response.headers.get('content-type')?.includes('application/json')) throw new ReadError('protocol');
  try { return record(await response.json()); } catch { throw new ReadError('protocol'); }
}
// T04 connectivity projection only; T05 replaces this with complete adapters.
export async function readPreview(request:PreviewRequest,config:SiteConfig,signal:AbortSignal):Promise<Preview> {
  if (request.op === 'jira.preview') {
    const data = await readJSON(config.jiraBaseUrl+'/rest/api/2/issue/'+request.key+'?fields=summary,assignee,status',signal);
    const fields = record(data.fields);
    const status = record(fields.status);
    if (typeof fields.summary !== 'string' || typeof status.name !== 'string') throw new ReadError('protocol');
    return {kind:'jira',key:request.key,url:config.jiraBaseUrl+'/browse/'+request.key,summary:fields.summary,assignee:null,status:status.name,comment:null};
  }
  if (request.op === 'mattermost.preview') {
    const data = await readJSON(config.mattermostBaseUrl+'/api/v4/posts/'+request.postId,signal);
    if (typeof data.message !== 'string' || typeof data.create_at !== 'number') throw new ReadError('protocol');
    return {kind:'mattermost',postId:request.postId,url:config.mattermostBaseUrl+'/'+request.team+'/pl/'+request.postId,author:'待读取',channel:null,createdAt:new Date(data.create_at).toISOString(),text:data.message.slice(0,20000)};
  }
  throw new ReadError('protocol');
}
