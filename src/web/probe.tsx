import { StrictMode, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { validateConfig } from '../contracts/config';
import { parseResource } from '../contracts/resource-links';
import type { PreviewReply, PreviewRequest } from '../contracts/preview-messages';
import { ExtensionClient } from './extension-client';
import { TransportError } from './transport-error';
import './probe.css';
import {LanguageProvider,useLanguage} from './i18n';
import type {MessageKey} from './i18n/core';
const config = validateConfig(__SITE_CONFIG__);
const errors = {login_required:'probe.loginRequired',unavailable:'probe.unavailable',network:'probe.networkFailed',rate_limited:'probe.rateLimited',protocol:'probe.unrecognizedResponse',disconnected:'probe.disconnected',configuration_mismatch:'connection.configurationMismatch'} as const;

function Probe() {
  const {t,date,time}=useLanguage();
  const client = useRef<ExtensionClient|null>(null);
  const activeId = useRef<string|null>(null);
  const generation = useRef(0);
  const [epoch,setEpoch] = useState(0);
  const [status,setStatus] = useState<MessageKey>('connection.connecting');
  const [key,setKey] = useState('DEMO-1');
  const [post,setPost] = useState('a'.repeat(26));
  const [result,setResult] = useState<PreviewReply|null>(null);
  const [busy,setBusy] = useState(false);
  const [lastSuccess,setLastSuccess] = useState<number|null>(null);
  const [retryAt,setRetryAt] = useState(0);
  const [inputError,setInputError] = useState<MessageKey|''>('');
  function invalidate() {
    generation.current++;
    if(activeId.current)client.current?.cancel(activeId.current);
    activeId.current=null;setBusy(false);setResult(null);setLastSuccess(null);setInputError('');
  }
  useEffect(() => {
    let alive = true;
    setStatus('connection.connecting');
    const connection = new ExtensionClient(config,() => { if(alive){invalidate();setStatus('connection.disconnected');} });
    client.current = connection;
    void connection.request({version:1,id:crypto.randomUUID(),op:'hello'},2500).then(reply => { if(alive)setStatus(reply.ok ? 'connection.connected' : reply.error.code==='configuration_mismatch'?'connection.configurationMismatch':'connection.failed'); }).catch(() => { if(alive)setStatus('connection.unavailable'); });
    const hide = () => {
      alive=false;
      flushSync(()=>{invalidate();setStatus('connection.paused');});
      connection.dispose();client.current=null;
    };
    const show = (event:PageTransitionEvent) => {if(event.persisted)setEpoch(value=>value+1);};
    window.addEventListener('pagehide',hide);window.addEventListener('pageshow',show);
    return () => {
      alive=false;generation.current++;connection.dispose();client.current=null;
      window.removeEventListener('pagehide',hide);window.removeEventListener('pageshow',show);
    };
  },[epoch]);
  useEffect(()=>{
    if(!retryAt)return;
    let timer:ReturnType<typeof setTimeout>;
    const wait=()=>{const remaining=retryAt-Date.now();if(remaining<=0)setRetryAt(0);else timer=setTimeout(wait,Math.min(remaining,2147483647));};
    wait();
    return ()=>clearTimeout(timer);
  },[retryAt]);
  async function read(op:'jira.preview'|'mattermost.preview') {
    const current=client.current;
    if(!current)return;
    const id=crypto.randomUUID(),mine=++generation.current;
    let request:PreviewRequest;
    try{
      const resource=op==='jira.preview'?parseResource('jira',key,config):parseResource('mattermost',config.mattermostBaseUrl+'/demo/pl/'+post,config);
      request=resource.kind==='jira'?{version:1,id,op:'jira.preview',key:resource.id}:{version:1,id,op:'mattermost.preview',postId:resource.id,team:resource.team};
    }catch{setInputError('probe.invalidResource');return;}
    activeId.current=id;setBusy(true);setResult(null);setInputError('');
    try {
      const reply=await current.request(request);
      if(mine!==generation.current)return;
      setResult(reply);
      if(reply.ok)setLastSuccess(Date.now());
      else if(reply.error.code==='rate_limited')setRetryAt(Date.now()+(reply.error.retryAfterMs??60000));
    } catch (error) {
      if(mine===generation.current)setResult({version:1,id,ok:false,error:{code:error instanceof TransportError&&error.code==='network'?'network':'disconnected'}});
    } finally {if(mine===generation.current){activeId.current=null;setBusy(false);}}
  }
  const preview=result?.ok && 'kind' in result.data ? result.data : null;
  const disabled=busy||status!=='connection.connected'||retryAt>Date.now();
  return <main>
    <header><div><p className="brand">{t("probe.eyebrow")}</p><h1>{t("probe.heading")}</h1><p className="muted">{t("probe.description")}</p></div><span className="badge">{t("environment.demo")}</span></header>
    <section className="connection"><div><span className={'dot '+(status==='connection.connected'?'online':'')}/><strong role="status">{t(status)}</strong><p className="muted">{t("probe.signInHint")}</p></div><button className="secondary" disabled={status==='connection.connecting'} onClick={()=>{invalidate();setEpoch(value=>value+1);}}>{t("probe.reconnect")}</button></section>
    <div className="sources"><section className="source"><div className="source-title"><h2>Jira 9.7</h2><a href={config.jiraBaseUrl+'/__dummy/'} target="_blank" rel="noopener noreferrer">{t("probe.demoLogin")}</a></div><label>{t("probe.jiraIssue")}<input aria-label={t("probe.jiraIssue")} value={key} onChange={e=>{invalidate();setKey(e.target.value);}}/></label><p className="hint">{t("probe.jiraExamples")}</p><button disabled={disabled} onClick={()=>void read('jira.preview')}>{t("probe.readJira")}</button></section>
    <section className="source"><div className="source-title"><h2>Mattermost</h2><a href={config.mattermostBaseUrl+'/__dummy/'} target="_blank" rel="noopener noreferrer">{t("probe.demoLogin")}</a></div><label>{t("probe.messageId")}<input aria-label={t("probe.messageId")} value={post} onChange={e=>{invalidate();setPost(e.target.value);}}/></label><p className="hint">{t("probe.messageExamples")}</p><button disabled={disabled} onClick={()=>void read('mattermost.preview')}>{t("probe.readMattermost")}</button></section></div>
    <section className="preview"><div className="source-title"><h2>{t("probe.currentPreview")}</h2><span className="muted" data-testid="last-success">{lastSuccess?t('preview.lastLoaded',{time:time(lastSuccess)}):t('probe.notLoaded')}</span></div>
      {busy&&<p>{t("probe.loading")}</p>}{inputError&&<p role="alert">{t(inputError)}</p>}
      {result&&!result.ok&&<p role="alert">{t(errors[result.error.code])}</p>}
      {retryAt>Date.now()&&<p>{t('probe.retryAt',{time:time(retryAt)})}</p>}
      {!preview&&!result&&!busy&&<p className="empty">{t("probe.emptyPreview")}</p>}
      {preview?.kind==='jira'&&<article><h3>{preview.summary}</h3><p className="meta">{preview.key} · {preview.status} · {preview.assignee??t('preview.unassigned')}</p>{preview.comment?<blockquote><p>{preview.comment.excerpt}</p><footer>{preview.comment.author||t('preview.unknownUser')} · {date(preview.comment.created)}</footer></blockquote>:<p>{t("preview.noComments")}</p>}<a href={preview.url} target="_blank" rel="noopener noreferrer">{t("probe.openIssue")}</a></article>}
      {preview?.kind==='mattermost'&&<article><h3>{preview.author||t('preview.unknownUser')}</h3><p className="meta">{preview.channel??t('probe.channelUnavailable')} · {date(preview.createdAt)}</p><p className="message">{preview.text}</p><a href={preview.url} target="_blank" rel="noopener noreferrer">{t("probe.openMessage")}</a></article>}
    </section>
    <details><summary>{t("probe.syntheticResponse")}</summary><pre data-testid="result">{result?JSON.stringify(result,null,2):t('probe.notRead')}</pre></details>
    <p className="footnote">{t("probe.disclaimer")}</p>
  </main>;
}
createRoot(document.getElementById('root')!).render(<StrictMode><LanguageProvider page="probe"><Probe/></LanguageProvider></StrictMode>);
