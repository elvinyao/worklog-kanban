import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse, RedirectResponse

def create_app():
    app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
    @app.middleware('http')
    async def boundary(request, call_next):
        if request.headers.get('host') not in ('board.localhost:4173', '127.0.0.1:4173'):
            return JSONResponse({'code':'forbidden'},status_code=403)
        response = await call_next(request)
        response.headers['Cache-Control'] = 'no-store'
        response.headers['Content-Security-Policy'] = "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' blob:; frame-ancestors 'none'; base-uri 'none'"
        response.headers['X-Content-Type-Options'] = 'nosniff'
        return response
    @app.get('/health')
    async def health(): return {'ready':True}
    directory = Path('dist/lifecycle/probe' if os.environ.get('WORKLOG_BUILD_MODE') == 'lifecycle-test' else 'dist/probe')
    if not (directory/'index.html').is_file():
        raise RuntimeError('Build probe before starting')
    @app.get('/')
    async def root(): return RedirectResponse('/probe/')
    app.mount('/probe', StaticFiles(directory=directory,html=True),name='probe')
    return app
