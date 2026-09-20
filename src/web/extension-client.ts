import { record, type SiteConfig } from '../contracts/config';
import { parseReply, parseRequest, type PreviewReply, type PreviewRequest } from '../contracts/preview-messages';
import { TransportError } from './transport-error';
import {siteAddresses} from '../contracts/extension-settings';
export type DisconnectReason='transport'|'invalidated';

export class ExtensionClient {
  private pending = new Map<string,{resolve:(v:PreviewReply)=>void;reject:(e:Error)=>void;timer:ReturnType<typeof setTimeout>}>();
  private disposed = false;
  constructor(private config:SiteConfig, private disconnected:(reason:DisconnectReason)=>void = () => {}) {
    window.addEventListener('message',this.receive);
  }
  private receive = (event:MessageEvent<unknown>) => {
    if (this.disposed || event.origin !== this.config.boardOrigin || event.source !== window) return;
    try {
      const message = record(event.data);
      if (message.channel === 'worklog:status' && message.connected === false) { this.failAll(); this.disconnected(message.reason==='invalidated'?'invalidated':'transport'); return; }
      if (message.channel !== 'worklog:reply') return;
      const reply = parseReply(message.payload,this.config);
      const pending = this.pending.get(reply.id);
      if (pending) { clearTimeout(pending.timer); this.pending.delete(reply.id); pending.resolve(reply); }
    } catch { /* Ignore invalid replies. */ }
  };
  request(request:PreviewRequest,timeoutMs=30000):Promise<PreviewReply> {
    if(request.op==='hello')request={...request,sites:siteAddresses(this.config)};
    if (this.disposed || this.pending.has(request.id)) return Promise.reject(new TransportError('disconnected'));
    parseRequest(request);
    return new Promise((resolve,reject) => {
      const timer = setTimeout(() => { this.pending.delete(request.id); this.cancel(request.id); reject(new TransportError('network')); },timeoutMs);
      this.pending.set(request.id,{resolve,reject,timer});
      window.postMessage({channel:'worklog:request',payload:request},this.config.boardOrigin);
    });
  }
  cancel(id:string) {
    if (!this.disposed) window.postMessage({channel:'worklog:request',payload:{version:1,id:crypto.randomUUID(),op:'cancel',targetId:id}},this.config.boardOrigin);
    const pending = this.pending.get(id);
    if (pending) { clearTimeout(pending.timer); pending.reject(new TransportError('cancelled')); this.pending.delete(id); }
  }
  private failAll() { for (const entry of this.pending.values()) { clearTimeout(entry.timer); entry.reject(new TransportError('disconnected')); } this.pending.clear(); }
  dispose() {
    for (const id of this.pending.keys()) this.cancel(id);
    this.disposed = true; this.failAll(); window.removeEventListener('message',this.receive);
  }
}
