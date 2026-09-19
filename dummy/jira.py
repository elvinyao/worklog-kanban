import html

from fastapi import FastAPI, Query, Request
from fastapi.responses import HTMLResponse

from dummy.fixtures import ISSUES, visible_comments
from dummy.sessions import document_shell, error, service


def create_app() -> FastAPI:
    app = service('jira', '/jira', 'http://jira.localhost:4180')

    def allowed(key, request):
        session = app.state.current_session(request)
        return session is not None and key in ISSUES and (key != 'DEMO-2' or session.identity == 'alice')

    @app.get('/jira/rest/api/2/issue/{key}')
    async def issue(key: str, request: Request):
        if not allowed(key, request):
            return error(404)
        return {'key':key, 'fields':ISSUES[key]}

    @app.get('/jira/rest/api/2/issue/{key}/comment')
    async def comments(key: str, request: Request, startAt: int = Query(default=0, ge=0), maxResults: int = Query(default=50, ge=1, le=100)):
        if not allowed(key, request):
            return error(404)
        session = app.state.current_session(request)
        rows = visible_comments(key, session.identity)
        size = min(maxResults, session.fault.page_size)
        page = [] if session.fault.fault == 'pagination-stall' else rows[startAt:startAt+size]
        return {'startAt':startAt, 'maxResults':size, 'total':len(rows), 'comments':page}

    @app.get('/jira/browse/{key}', response_class=HTMLResponse)
    async def original(key: str, request: Request):
        if not allowed(key, request):
            return error(404)
        return document_shell('Jira', '/jira', f'<h1>{html.escape(key)}</h1><p>{html.escape(ISSUES[key]["summary"])}</p>')

    return app
