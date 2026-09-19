"""Dummy-only composition. The production app never imports this module."""
import os
from pathlib import Path

from fastapi.staticfiles import StaticFiles
from app.main import create_app as shared_app


def create_app():
    root = Path('dist/lifecycle' if os.environ.get('WORKLOG_BUILD_MODE') == 'lifecycle-test' else 'dist')
    if any(not (root/name/'index.html').is_file() for name in ('web','probe')):
        raise RuntimeError('Build complete dummy board before starting')
    app = shared_app()
    app.mount('/probe', StaticFiles(directory=root/'probe',html=True),name='probe')
    app.mount('/', StaticFiles(directory=root/'web',html=True),name='web')
    return app
