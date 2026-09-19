import type { SiteConfig } from '../contracts/config';
import type { Preview, PreviewRequest } from '../contracts/preview-messages';
import { jiraPreview } from '../adapters/jira';
import { mattermostPreview } from '../adapters/mattermost';
import { ReadError } from '../adapters/http';
export { ReadError } from '../adapters/http';

export async function readPreview(request:PreviewRequest,config:SiteConfig,signal:AbortSignal):Promise<Preview> {
  if(request.op==='jira.preview')return jiraPreview(request.key,config,signal);
  if(request.op==='mattermost.preview')return mattermostPreview(request.postId,request.team,config,signal);
  throw new ReadError('protocol');
}
