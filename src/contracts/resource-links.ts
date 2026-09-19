import { canonicalBase, type SiteConfig } from './config';

export const JIRA_KEY = /^[A-Z][A-Z0-9_]*-[1-9][0-9]*$/;
export const POST_ID = /^[a-z0-9]{26}$/;
export const TEAM = /^[a-z0-9_-]+$/;
export type Resource = {kind:'jira';id:string;url:string} | {kind:'mattermost';id:string;team:string;url:string};

export function parseResource(kind: string, value: string, config: SiteConfig): Resource {
  if (typeof value !== 'string' || value.length > 2048) throw new Error('Invalid resource');
  if (kind === 'jira') {
    let key = value.toUpperCase();
    if (!JIRA_KEY.test(key)) {
      const canonical = canonicalBase(value);
      const prefix = config.jiraBaseUrl + '/browse/';
      if (!canonical.startsWith(prefix)) throw new Error('Wrong Jira site or path');
      key = canonical.slice(prefix.length).toUpperCase();
    }
    if (key.length > 200 || !JIRA_KEY.test(key)) throw new Error('Invalid issue key');
    return {kind, id:key, url:config.jiraBaseUrl + '/browse/' + key};
  }
  if (kind === 'mattermost') {
    const canonical = canonicalBase(value);
    const prefix = config.mattermostBaseUrl + '/';
    if (!canonical.startsWith(prefix)) throw new Error('Wrong Mattermost site');
    const match = /^([a-z0-9_-]+)\/pl\/([a-z0-9]{26})$/.exec(canonical.slice(prefix.length));
    if (match && match[1]!.length <= 64) return {kind, id:match[2]!, team:match[1]!, url:canonical};
  }
  throw new Error('Invalid resource');
}
