import { exact, record, validateConfig } from '../contracts/config';
import { parseReply, parseRequest } from '../contracts/preview-messages';
import { allowedPage } from './guards';

const config = validateConfig(__SITE_CONFIG__);
if (allowedPage(location.origin,window.top === window,true,config)) {
  let port:chrome.runtime.Port|undefined;
  function connect() {
    if (port) return port;
    const current = chrome.runtime.connect({name:'worklog'});
    port = current;
    current.onMessage.addListener((raw:unknown) => {
      try { window.postMessage({channel:'worklog:reply',payload:parseReply(raw,config)},config.boardOrigin); } catch { /* Reject untrusted shapes. */ }
    });
    current.onDisconnect.addListener(() => {
      if (port !== current) return;
      port = undefined;
      window.postMessage({channel:'worklog:status',connected:false},config.boardOrigin);
    });
    return current;
  }
  window.addEventListener('message',(event:MessageEvent<unknown>) => {
    if (!allowedPage(event.origin,window.top === window,event.source === window,config)) return;
    try {
      const envelope = record(event.data);
      exact(envelope,['channel','payload']);
      if (envelope.channel !== 'worklog:request') return;
      connect().postMessage(parseRequest(envelope.payload));
    } catch { /* Invalid page messages never reach privileged code. */ }
  });
  window.addEventListener('pagehide',() => { port?.disconnect(); port = undefined; });
}
