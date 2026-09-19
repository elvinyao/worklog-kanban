import html

from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, Response

from dummy.fixtures import AUTHOR, POSTS, PRIVATE_CHANNEL, PRIVATE_POST, PUBLIC_CHANNEL, PNG, post_data
from dummy.sessions import error, service


def create_app() -> FastAPI:
    app = service('mattermost', '', 'http://mattermost.localhost:4181')

    def allowed(post_id, request):
        session = app.state.current_session(request)
        return session is not None and post_id in POSTS and (post_id != PRIVATE_POST or session.identity == 'alice')

    @app.get('/api/v4/posts/{post_id}')
    async def post(post_id: str, request: Request):
        return post_data(post_id) if allowed(post_id, request) else error(404)

    @app.get('/api/v4/users/{user_id}')
    async def user(user_id: str, request: Request):
        session = app.state.current_session(request)
        if session is None:
            return error(401)
        if user_id != AUTHOR or session.fault.fault == 'missing-user':
            return error(404)
        return {'id':AUTHOR, 'username':'demo-author', 'nickname':'模拟作者', 'first_name':'', 'last_name':''}

    @app.get('/api/v4/channels/{channel_id}')
    async def channel(channel_id: str, request: Request):
        session = app.state.current_session(request)
        if session is None:
            return error(401)
        if channel_id not in (PUBLIC_CHANNEL,PRIVATE_CHANNEL) or session.fault.fault == 'missing-channel' or (channel_id == PRIVATE_CHANNEL and session.identity != 'alice'):
            return error(404)
        return {'id':channel_id, 'display_name':'模拟团队' if channel_id == PUBLIC_CHANNEL else '模拟受限频道', 'name':'demo-channel'}

    @app.get('/api/v4/users/{user_id}/image')
    async def avatar(user_id: str, request: Request):
        session = app.state.current_session(request)
        if session is None:
            return error(401)
        if user_id != AUTHOR or session.fault.fault == 'avatar-failure':
            return error(404)
        return Response(PNG, media_type='image/png')

    @app.get('/demo/pl/{post_id}', response_class=HTMLResponse)
    async def original(post_id: str, request: Request):
        if not allowed(post_id, request):
            return error(404)
        return f'<h1>模拟环境 · Mattermost</h1><p>{html.escape(POSTS[post_id]["message"])}</p>'

    return app
