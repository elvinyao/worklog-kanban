import { StrictMode, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { validateConfig } from '../contracts/config';
import { parseResource } from '../contracts/resource-links';
import type { PreviewReply, PreviewRequest } from '../contracts/preview-messages';
import { ExtensionClient } from './extension-client';
import { TransportError } from './transport-error';
import './probe.css';
const config = validateConfig(__SITE_CONFIG__);
const errors = {login_required:'请到原站点重新登录，然后手动读取。',unavailable:'当前会话无法读取此资源。',network:'读取暂时失败，请稍后重试。',rate_limited:'原站点限制了读取频率，请等待后重试。',protocol:'原站点返回的内容无法识别，未作为预览显示。',disconnected:'扩展连接已断开，请重新连接。'};

function Probe() {
  const client = useRef<ExtensionClient|null>(null);
  const activeId = useRef<string|null>(null);
  const generation = useRef(0);
  const [epoch,setEpoch] = useState(0);
  const [status,setStatus] = useState('连接中');
  const [key,setKey] = useState('DEMO-1');
  const [post,setPost] = useState('a'.repeat(26));
  const [result,setResult] = useState<PreviewReply|null>(null);
  const [busy,setBusy] = useState(false);
  const [lastSuccess,setLastSuccess] = useState<number|null>(null);
  const [retryAt,setRetryAt] = useState(0);
  const [inputError,setInputError] = useState('');
  function invalidate() {
    generation.current++;
    if(activeId.current)client.current?.cancel(activeId.current);
    activeId.current=null;setBusy(false);setResult(null);setLastSuccess(null);setInputError('');
  }
  useEffect(() => {
    let alive = true;
    setStatus('连接中');
    const connection = new ExtensionClient(config,() => { if(alive){invalidate();setStatus('已断开');} });
    client.current = connection;
    void connection.request({version:1,id:crypto.randomUUID(),op:'hello'},2500).then(reply => { if(alive)setStatus(reply.ok ? '已连接' : '连接失败'); }).catch(() => { if(alive)setStatus('扩展不可用'); });
    const hide = () => {
      alive=false;
      flushSync(()=>{invalidate();setStatus('已暂停');});
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
    }catch{setInputError('请输入有效的模拟票据或消息标识。');return;}
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
  const disabled=busy||status!=='已连接'||retryAt>Date.now();
  return <main>
    <header><div><p className="brand">WORKLOG / 接入验证</p><h1>先确认，个人预览能正常读取。</h1><p className="muted">共享工作记录留在看板。外部内容由当前浏览器的登录会话决定。</p></div><span className="badge">模拟环境</span></header>
    <section className="connection"><div><span className={'dot '+(status==='已连接'?'online':'')}/><strong role="status">{status}</strong><p className="muted">每个浏览器 profile 独立登录；这里无需输入密码或 Token。</p></div><button className="secondary" disabled={status==='连接中'} onClick={()=>{invalidate();setEpoch(value=>value+1);}}>重新连接</button></section>
    <div className="sources"><section className="source"><div className="source-title"><h2>Jira 9.7</h2><a href={config.jiraBaseUrl+'/__dummy/'} target="_blank" rel="noopener noreferrer">模拟登录 ↗</a></div><label>Jira 票据<input aria-label="Jira 票据" value={key} onChange={e=>{invalidate();setKey(e.target.value);}}/></label><p className="hint">DEMO-1 公开 · DEMO-2 Alice 专属 · DEMO-3 空态</p><button disabled={disabled} onClick={()=>void read('jira.preview')}>读取 Jira</button></section>
    <section className="source"><div className="source-title"><h2>Mattermost</h2><a href={config.mattermostBaseUrl+'/__dummy/'} target="_blank" rel="noopener noreferrer">模拟登录 ↗</a></div><label>消息标识<input aria-label="消息标识" value={post} onChange={e=>{invalidate();setPost(e.target.value);}}/></label><p className="hint">26 个 a：公开消息 · 26 个 b：Alice 专属</p><button disabled={disabled} onClick={()=>void read('mattermost.preview')}>读取 Mattermost</button></section></div>
    <section className="preview"><div className="source-title"><h2>当前浏览器的预览</h2><span className="muted" data-testid="last-success">{lastSuccess?'最后成功 · '+new Date(lastSuccess).toLocaleTimeString():'尚无成功读取'}</span></div>
      {busy&&<p>正在读取可见内容…</p>}{inputError&&<p role="alert">{inputError}</p>}
      {result&&!result.ok&&<p role="alert">{errors[result.error.code]}</p>}
      {retryAt>Date.now()&&<p>可再次读取时间：{new Date(retryAt).toLocaleTimeString()}</p>}
      {!preview&&!result&&!busy&&<p className="empty">先在原站点选择模拟身份，再读取一条资源。</p>}
      {preview?.kind==='jira'&&<article><h3>{preview.summary}</h3><p className="meta">{preview.key} · {preview.status} · {preview.assignee??'未分配担当者'}</p>{preview.comment?<blockquote><p>{preview.comment.excerpt}</p><footer>{preview.comment.author} · {new Date(preview.comment.created).toLocaleString()}</footer></blockquote>:<p>暂无评论</p>}<a href={preview.url} target="_blank" rel="noopener noreferrer">打开原票据 ↗</a></article>}
      {preview?.kind==='mattermost'&&<article><h3>{preview.author}</h3><p className="meta">{preview.channel??'频道信息不可用'} · {new Date(preview.createdAt).toLocaleString()}</p><p className="message">{preview.text}</p><a href={preview.url} target="_blank" rel="noopener noreferrer">打开原消息 ↗</a></article>}
    </section>
    <details><summary>查看本次合成响应</summary><pre data-testid="result">{result?JSON.stringify(result,null,2):'尚未读取'}</pre></details>
    <p className="footnote">这是本地模拟验证，不代表公司 SSO 或真实系统兼容性已验收。预览不写入共享服务。</p>
  </main>;
}
createRoot(document.getElementById('root')!).render(<StrictMode><Probe/></StrictMode>);
