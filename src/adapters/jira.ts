import type { SiteConfig } from '../contracts/config';
import type { JiraPreview } from '../contracts/preview-messages';
import { parseResource } from '../contracts/resource-links';
import { ReadError, object, readJSON, string } from './http';

export async function jiraPreview(key:string,config:SiteConfig,signal:AbortSignal):Promise<JiraPreview> {
  const resource=parseResource('jira',key,config);
  const base=config.jiraBaseUrl+'/rest/api/2/issue/'+resource.id;
  const issue=await readJSON(base+'?fields=summary,assignee,status',signal,config);
  if(issue.key !== resource.id) throw new ReadError('protocol');
  const fields=object(issue.fields);
  const summary=string(fields.summary,2000),status=string(object(fields.status).name,200);
  const assignee=fields.assignee === null ? null : string(object(fields.assignee).displayName,500);
  let comment:JiraPreview['comment']=null;
  let newest=-Infinity,offset=0,total:number|undefined;
  const seen=new Set<string>();
  do {
    signal.throwIfAborted();
    const page=await readJSON(base+'/comment?startAt='+offset+'&maxResults=50',signal,config);
    if(!Number.isSafeInteger(page.total) || (page.total as number)<0 || page.startAt!==offset || !Number.isSafeInteger(page.maxResults) || (page.maxResults as number)<0 || !Array.isArray(page.comments) || page.comments.length>(page.maxResults as number)) throw new ReadError('protocol');
    if(total!==undefined && total!==page.total) throw new ReadError('protocol');
    total=page.total as number;
    if(offset+page.comments.length>total || (offset<total && page.comments.length===0) || total>100000) throw new ReadError('protocol');
    for(const raw of page.comments) {
      const row=object(raw);
      const id=string(row.id,200),body=string(row.body,4000),created=string(row.created,64);
      const timestamp=Date.parse(created);
      if(!id || seen.has(id) || !Number.isFinite(timestamp)) throw new ReadError('protocol');
      seen.add(id);
      if(timestamp>newest){
        newest=timestamp;
        const author=row.author && typeof row.author==='object' ? object(row.author).displayName : undefined;
        comment={author:typeof author==='string'?author.slice(0,500):'未知用户',created,excerpt:body};
      }
    }
    offset+=page.comments.length;
  } while(offset<total);
  return {kind:'jira',key:resource.id,url:resource.url,summary,assignee,status,comment};
}
