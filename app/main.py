import asyncio
from contextlib import asynccontextmanager
import fcntl
import ipaddress
import logging
import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from app.api import router
from app.config import SiteConfig
from app.events import EventHub, WriteCoordinator
from app.security import RequestBoundary
from app.store import Store
from app.validation import install_errors


def create_app(config:SiteConfig|None=None, database:Path|None=None, trusted_proxies=(), static_dir:Path|None=None):
    if any(os.environ.get(name,'1')!='1' for name in ('WEB_CONCURRENCY','UVICORN_WORKERS')):
        raise RuntimeError('Worklog requires one worker')
    if config is None:
        try:
            config = SiteConfig.model_validate_json(Path(os.environ.get('WORKLOG_CONFIG','config/dummy.json')).read_text())
        except Exception:
            raise RuntimeError('Invalid site configuration') from None
    database = Path(database or os.environ.get('WORKLOG_DATABASE','.tmp/worklog.sqlite3')).expanduser().resolve()
    store = Store(database,config)
    events = EventHub()
    writes = WriteCoordinator(events)
    proxies = tuple(ipaddress.ip_network(value) for value in trusted_proxies)
    logger = logging.getLogger('worklog')
    if not logger.handlers:
        logger.addHandler(logging.StreamHandler())
    logger.setLevel(logging.INFO)
    logger.propagate = False

    @asynccontextmanager
    async def lifespan(app):
        def start():
            database.parent.mkdir(parents=True,exist_ok=True)
            lock = database.with_suffix(database.suffix+'.lock').open('a')
            try:
                fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
                if database.with_suffix(database.suffix+'.maintenance').exists():
                    raise RuntimeError('Incomplete database restore; run maintenance restore before starting')
                store.initialize()
                return lock,store.snapshot().revision
            except BaseException:
                lock.close()
                raise
        try:
            lock,revision = await asyncio.to_thread(start)
        except BlockingIOError:
            raise RuntimeError('Database already belongs to another running instance') from None
        events.revision = revision
        try:
            yield
        finally:
            await writes.close()
            events.close()
            lock.close()

    app = FastAPI(title='Worklog Shared Board',version='0.1.0',docs_url=None,redoc_url=None,openapi_url=None,lifespan=lifespan)
    app.state.store,app.state.events,app.state.writes = store,events,writes
    app.state.trusted_proxies = proxies
    app.state.config = config
    app.add_middleware(RequestBoundary,config=config)
    install_errors(app)
    app.include_router(router)

    @app.get('/health',include_in_schema=False)
    async def health():
        return {'ready':True}

    if static_dir is not None:
        app.mount('/',StaticFiles(directory=static_dir,html=True),name='web')
    return app
