import asyncio
from dataclasses import dataclass, field
import html
import os
from pathlib import Path
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



def document_shell(kind: str, prefix: str, body: str):
    controls = f'{prefix}/__dummy'
    return f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Worklog</title><link rel="stylesheet" href="{controls}/style.css"></head><body>
<main data-kind="{html.escape(kind, quote=True)}"><label class="language">语言 / Language / 言語 <select id="language" aria-label="语言 / Language / 言語"><option value="auto" data-i18n="跟随浏览器">跟随浏览器</option><option value="zh">简体中文</option><option value="en">English</option><option value="ja">日本語</option></select></label>
<p class="badge" data-i18n="模拟环境 · {{kind}}">模拟环境 · {html.escape(kind)}</p>{body}
</main><script src="{controls}/controls.js" type="module"></script></body></html>'''


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
        who = html.escape(session.identity) if session else '<span data-i18n="未登录">未登录</span>'
        fault_labels = ['正常响应','登录已过期','禁止访问','资源不存在','请求限流','返回登录页面','返回 HTML','无效 JSON','外站重定向','响应延迟','连接中断','头像读取失败','分页停滞','缺少用户信息','缺少频道信息']
        faults = ''.join(f'<option value="{value}" data-i18n="{label}">{label}</option>' for value, label in zip(FaultInput.model_fields['fault'].annotation.__args__, fault_labels, strict=True))
        return document_shell(kind, prefix, f'''
<h1 data-i18n="外部服务模拟控制台">外部服务模拟控制台</h1><p><span data-i18n="当前身份：">当前身份：</span><strong>{who}</strong></p>
<p data-i18n="仅用于本地测试，不需要公司账号、密码或 Token。">仅用于本地测试，不需要公司账号、密码或 Token。</p><section><button data-identity="alice" data-i18n="以 Alice 登录">以 Alice 登录</button><button data-identity="bob" data-i18n="以 Bob 登录">以 Bob 登录</button><button data-identity="none" data-i18n="退出">退出</button></section>
<section><label><span data-i18n="模拟响应">模拟响应</span> <select id="fault">{faults}</select></label><button id="apply-fault" data-i18n="应用">应用</button></section><output id="status"></output>
<p data-i18n="Jira：DEMO-1（公开）、DEMO-2（Alice）、DEMO-3（空态）">Jira：DEMO-1（公开）、DEMO-2（Alice）、DEMO-3（空态）</p><p data-i18n="Mattermost：{{public}}（公开）、{{private}}（Alice）">Mattermost：{'a'*26}（公开）、{'b'*26}（Alice）</p>''')

    @app.get(controls + '/style.css')
    async def stylesheet():
        return Response('body{font:16px system-ui;background:#f3f4f1;color:#26372b;margin:0}main{max-width:760px;margin:40px auto;padding:24px;background:white;border-radius:16px;overflow-wrap:anywhere}section{margin:24px 0}button,select{font:inherit;padding:10px;margin:4px;border:1px solid #b5c4b8;border-radius:8px;max-width:100%}button{cursor:pointer}.badge{color:#64775d}output{display:block}.language{display:flex;flex-wrap:wrap;align-items:center;justify-content:flex-end;font-size:13px;gap:6px}', media_type='text/css')

    @app.get(controls + '/controls.js')
    async def control_script():
        script = Path(__file__).resolve().parents[1] / 'dist/dummy/controls.js'
        if not script.is_file():
            return Response('Dummy assets require npm run build.', status_code=503, media_type='text/plain')
        return Response(script.read_text(encoding='utf-8'), media_type='text/javascript')

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
