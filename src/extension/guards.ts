import type { SiteConfig } from '../contracts/config';
export function allowedPage(origin:string,top:boolean,ownSource:boolean,config:SiteConfig):boolean { return top && ownSource && origin === config.boardOrigin; }
export function allowedSender(sender:chrome.runtime.MessageSender|undefined,id:string,config:SiteConfig):boolean {
  if (!sender || sender.id !== id || sender.frameId !== 0 || sender.origin !== config.boardOrigin || !Number.isInteger(sender.tab?.id) || !sender.url) return false;
  try { return new URL(sender.url).origin === config.boardOrigin; } catch { return false; }
}
