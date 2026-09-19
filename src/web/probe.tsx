import { StrictMode, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { validateConfig } from '../contracts/config';
import type { PreviewReply, PreviewRequest } from '../contracts/preview-messages';
import { ExtensionClient } from './extension-client';
import './probe.css';
const config = validateConfig(__SITE_CONFIG__);

function Probe() {
  const client = useRef<ExtensionClient|null>(null);
  const [status,setStatus] = useState('连接中');
  const [key,setKey] = useState('DEMO-1');
  const [post,setPost] = useState('a'.repeat(26));
  const [result,setResult] = useState<PreviewReply|null>(null);
  const [busy,setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    const connection = new ExtensionClient(config,() => { if (active) { setStatus('已断开'); setResult(null); } });
    client.current = connection;
    void connection.request({version:1,id:crypto.randomUUID(),op:'hello'}).then(reply => { if (active) setStatus(reply.ok ? '已连接' : '连接失败'); }).catch(() => { if (active) setStatus('扩展不可用'); });
    return () => { active = false; connection.dispose(); client.current = null; };
  },[]);
  async function read(op:'jira.preview'|'mattermost.preview') {
    setBusy(true); setResult(null);
    const request:PreviewRequest = op === 'jira.preview' ? {version:1,id:crypto.randomUUID(),op,key} : {version:1,id:crypto.randomUUID(),op,postId:post,team:'demo'};
    try { setResult(await client.current!.request(request)); } catch { setStatus('读取失败'); } finally { setBusy(false); }
  }
  return <main><p className="badge">模拟环境 · 接入验证</p><h1>个人会话读取</h1><p>当前阶段验证连接与基础字段；完整评论和人员字段将在适配器阶段补齐。</p>
    <nav><a href={config.jiraBaseUrl+'/__dummy/'} target="_blank" rel="noopener noreferrer">Jira 模拟登录</a><a href={config.mattermostBaseUrl+'/__dummy/'} target="_blank" rel="noopener noreferrer">Mattermost 模拟登录</a></nav>
    <p role="status">{status}</p><section><label>Jira 票据 <input aria-label="Jira 票据" value={key} onChange={e=>setKey(e.target.value)}/></label><button disabled={busy} onClick={()=>void read('jira.preview')}>读取 Jira</button></section>
    <section><label>消息标识 <input aria-label="消息标识" value={post} onChange={e=>setPost(e.target.value)}/></label><button disabled={busy} onClick={()=>void read('mattermost.preview')}>读取 Mattermost</button></section>
    <pre data-testid="result">{result ? JSON.stringify(result,null,2) : '尚未读取'}</pre></main>;
}
createRoot(document.getElementById('root')!).render(<StrictMode><Probe/></StrictMode>);
