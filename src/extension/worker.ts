import { validateConfig } from '../contracts/config';
import { parseReply, parseRequest, type PreviewReply } from '../contracts/preview-messages';
import { allowedSender } from './guards';
import { ReadError, readPreview } from './read';

const config = validateConfig(__SITE_CONFIG__);
chrome.runtime.onConnect.addListener(port => {
  if (port.name !== 'worklog' || !allowedSender(port.sender,chrome.runtime.id,config)) { port.disconnect(); return; }
  const pending = new Map<string,AbortController>();
  const used = new Set<string>();
  let closed = false;
  const close = () => { closed = true; for (const controller of pending.values()) controller.abort(); pending.clear(); used.clear(); };
  const send = (reply:PreviewReply) => { if (!closed) port.postMessage(parseReply(reply,config)); };
  port.onMessage.addListener((raw:unknown) => {
    let request;
    try { request = parseRequest(raw); } catch { return; }
    if (used.has(request.id)) return;
    used.add(request.id);
    if (used.size > 10000) { close(); port.disconnect(); return; }
    const envelope = {version:1 as const,id:request.id};
    if (request.op === 'hello') { send({...envelope,ok:true,data:{connected:true}}); return; }
    if (request.op === 'cancel') { pending.get(request.targetId)?.abort(); send({...envelope,ok:true,data:{cancelled:true}}); return; }
    if (pending.size >= 4) { send({...envelope,ok:false,error:{code:'rate_limited',retryAfterMs:1000}}); return; }
    const controller = new AbortController();
    pending.set(request.id,controller);
    void readPreview(request,config,controller.signal).then(data => {
      if (!controller.signal.aborted) send({...envelope,ok:true,data});
    }).catch((error:unknown) => {
      if (controller.signal.aborted) return;
      const safe = error instanceof ReadError ? {code:error.code,...(error.retryAfterMs !== undefined ? {retryAfterMs:error.retryAfterMs} : {})} : {code:'network' as const};
      send({...envelope,ok:false,error:safe});
    }).finally(() => pending.delete(request.id));
  });
  port.onDisconnect.addListener(close);
});
