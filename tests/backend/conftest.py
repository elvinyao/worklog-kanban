import os
import socket
import subprocess
import sys
import time
from contextlib import contextmanager

import httpx
import pytest


@contextmanager
def running_service(module: str, host: str, env_factory=None):
    with socket.socket() as listener:
        listener.bind(('127.0.0.1', 0))
        port = listener.getsockname()[1]
    origin = f'http://{host}:{port}'
    env = {**os.environ, 'WORKLOG_DUMMY_ORIGIN': origin}
    if env_factory is not None:
        env.update(env_factory(origin))
    process = subprocess.Popen(
        [sys.executable, '-m', 'uvicorn', f'{module}:create_app', '--factory',
         '--host', '127.0.0.1', '--port', str(port), '--no-access-log',
         '--no-proxy-headers', '--log-level', 'critical'],
        env=env, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE,
    )
    try:
        deadline = time.monotonic() + 10
        with httpx.Client(base_url=f'http://127.0.0.1:{port}', headers={'Host': f'{host}:{port}'}, trust_env=False) as probe:
            while time.monotonic() < deadline:
                if process.poll() is not None:
                    raise AssertionError(f'Test HTTP service exited: {process.stderr.read().decode()[:1000]}')
                try:
                    probe.get('/')
                    break
                except httpx.ConnectError:
                    time.sleep(0.05)
            else:
                raise AssertionError('Test HTTP service did not start')
        yield (f'http://127.0.0.1:{port}', origin)
    finally:
        process.terminate()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=5)
        process.stderr.close()


@pytest.fixture
def jira_service():
    with running_service('dummy.jira', 'jira.localhost') as service:
        yield service


@pytest.fixture
def mm_service():
    with running_service('dummy.mattermost', 'mattermost.localhost') as service:
        yield service


@contextmanager
def actor(service, identity=None, prefix=''):
    url, origin = service
    with httpx.Client(base_url=url, headers={'Host': origin.removeprefix('http://'), 'Origin': origin}, trust_env=False) as client:
        if identity:
            response = client.post(f'{prefix}/__dummy/session', json={'identity': identity})
            assert response.status_code == 200
        yield client
