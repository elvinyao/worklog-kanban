import asyncio
from dataclasses import dataclass, field
import html
import os
import secrets
from typing import Literal
from urllib.parse import urlsplit

from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse, Response
from pydantic import BaseModel, ConfigDict, Field


class IdentityInput(BaseModel):
    model_config = ConfigDict(extra='forbid')
    identity: Literal['alice', 'bob', 'none']


class FaultInput(BaseModel):
    model_config = ConfigDict(extra='forbid')
    fault: Literal['none','unauthorized','forbidden','not-found','rate-limit','login-html','html','malformed','redirect','delay','connection','avatar-failure','pagination-stall','missing-user','missing-channel']
    delay_ms: int = Field(default=500, ge=0, le=10000)
    page_size: int = Field(default=7, ge=1, le=50)


@dataclass
class Session:
    identity: str
    fault: FaultInput = field(default_factory=lambda: FaultInput(fault='none'))


def error(status: int):
    return JSONResponse({'error':'resource_unavailable' if status in (403,404) else 'request_failed'}, status_code=status)


def service(kind: str, prefix: str, default_origin: str):
    app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
    origin = os.environ.get('WORKLOG_DUMMY_ORIGIN', default_origin)
    hostname = urlsplit(origin).netloc
    cookie_name = f'worklog_dummy_{kind}'
    sessions: dict[str, Session] = {}
    requests: list[dict] = []
    control_requests: list[dict] = []
    controls = f'{prefix}/__dummy'
    api_prefix = f'{prefix}/rest/api/2/' if kind == 'jira' else '/api/v4/'

    def current(request: Request):
        return sessions.get(request.cookies.get(cookie_name, ''))

    app.state.current_session = current

    @app.middleware('http')
    async def boundary(request: Request, call_next):
        path = request.url.path
        response = None
        if request.headers.get('host') != hostname:
            response = error(403)
        elif path.startswith(controls) and request.method not in ('GET','HEAD'):
            if request.headers.get('origin') != origin:
                response = error(403)
            elif request.headers.get('content-type', '').split(';')[0].strip() != 'application/json':
                response = error(415)
            if response is None:
                control_requests.append({'method':request.method, 'path':path})
                del control_requests[:-1000]
        if response is None and path.startswith(api_prefix):
            requests.append({'method': request.method, 'path': path})
            del requests[:-1000]
            session = current(request)
            if 'user' in request.query_params or 'identity' in request.query_params or 'x-dummy-user' in request.headers:
                response = error(400)
            elif session is None:
                response = error(401)
            elif request.method == 'GET':
                fault = session.fault.fault
                code = {'unauthorized':401, 'forbidden':403, 'not-found':404, 'rate-limit':429}.get(fault)
                if code:
                    response = error(code)
                    if code == 429:
                        response.headers['Retry-After'] = '2'
                elif fault in ('html','login-html'):
                    response = HTMLResponse('<html><title>模拟登录</title><body>模拟环境：登录已过期</body></html>' if fault == 'login-html' else '<html>模拟非 JSON 页面</html>')
                elif fault == 'malformed':
                    response = Response('{invalid', media_type='application/json')
                elif fault == 'redirect':
                    response = RedirectResponse('http://untrusted.localhost:4190/sentinel', status_code=302)
                elif fault == 'delay':
                    await asyncio.sleep(session.fault.delay_ms / 1000)
                    if current(request) is None:
                        response = error(401)
                elif fault == 'connection':
                    # A truncated synthetic response causes a real transport error.
                    response = Response('{', headers={'Content-Length':'20'}, media_type='application/json')
        if response is None:
            response = await call_next(request)
        response.headers['Cache-Control'] = 'no-store'
        response.headers['X-Content-Type-Options'] = 'nosniff'
        response.headers['Content-Security-Policy'] = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; frame-ancestors 'none'"
        return response

    @app.get('/')
    async def root():
        return RedirectResponse(controls + '/')

    @app.get(controls + '/', response_class=HTMLResponse)
    async def control_page(request: Request):
        session = current(request)
        who = session.identity if session else '未登录'
        faults = ''.join(f'<option>{value}</option>' for value in FaultInput.model_fields['fault'].annotation.__args__)
        return f'''<!doctype html><html lang="zh"><head><meta charset="utf-8"><title>{kind} 模拟环境</title><link rel="stylesheet" href="{controls}/style.css"></head><body>
<main><p class="badge">模拟环境 · {kind}</p><h1>外部服务模拟控制台</h1><p>当前身份：<strong>{html.escape(who)}</strong></p>
<p>仅用于本地测试，不需要公司账号、密码或 Token。</p><section><button data-identity="alice">以 Alice 登录</button><button data-identity="bob">以 Bob 登录</button><button data-identity="none">退出</button></section>
<section><label>模拟响应 <select id="fault">{faults}</select></label><button id="apply-fault">应用</button></section><output id="status"></output>
<p>Jira：DEMO-1（公开）、DEMO-2（Alice）、DEMO-3（空态）</p><p>Mattermost：{'a'*26}（公开）、{'b'*26}（Alice）</p>
</main><script src="{controls}/controls.js" type="module"></script></body></html>'''

    @app.get(controls + '/style.css')
    async def stylesheet():
        return Response('body{font:16px system-ui;background:#f3f4f1;color:#26372b;margin:0}main{max-width:760px;margin:60px auto;padding:32px;background:white;border-radius:16px}section{margin:24px 0}button,select{font:inherit;padding:10px;margin:4px;border:1px solid #b5c4b8;border-radius:8px}button{cursor:pointer}.badge{color:#64775d}output{display:block}', media_type='text/css')

    @app.get(controls + '/controls.js')
    async def control_script():
        return Response('''const base = new URL('./', import.meta.url);
async function send(route, body) { const r = await fetch(new URL(route, base), {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)}); if(!r.ok) throw new Error('模拟控制失败'); }
document.querySelectorAll('[data-identity]').forEach(b => b.addEventListener('click', async () => { try { await send('session',{identity:b.dataset.identity}); location.reload(); } catch(e) { document.querySelector('#status').textContent=e.message; } }));
document.querySelector('#apply-fault').addEventListener('click', async () => { try { await send('fault',{fault:document.querySelector('#fault').value}); document.querySelector('#status').textContent='已应用模拟响应'; } catch(e) { document.querySelector('#status').textContent=e.message; } });''', media_type='text/javascript')

    @app.post(controls + '/session')
    async def login(data: IdentityInput, request: Request):
        sessions.pop(request.cookies.get(cookie_name, ''), None)
        response = JSONResponse({'identity':data.identity})
        if data.identity == 'none':
            response.delete_cookie(cookie_name, path=prefix or '/', httponly=True, samesite='lax')
        else:
            token = secrets.token_urlsafe(32)
            sessions[token] = Session(data.identity)
            response.set_cookie(cookie_name, token, path=prefix or '/', httponly=True, samesite='lax')
        return response

    @app.post(controls + '/fault')
    async def set_fault(data: FaultInput, request: Request):
        session = current(request)
        if session is None:
            return error(401)
        session.fault = data
        return {'fault':data.fault}

    @app.post(controls + '/inspect')
    async def inspect(request: Request):
        if current(request) is None:
            return error(401)
        return {'requests':list(requests), 'controls':list(control_requests)}

    return app
