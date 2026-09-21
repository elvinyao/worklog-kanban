"""Run inside the final image in CI; never ships as part of that image."""
import importlib.util
import os
from pathlib import Path
import shutil
import signal
import sqlite3
import subprocess
import sys
import tempfile
import time

ROOT = Path('/opt/worklog')
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / 'release'))
from docker.healthcheck import check

assert os.getuid() == 10001, 'Production must run as the application user'
assert shutil.which('node') is None and shutil.which('npm') is None
for module in ('dummy', 'pytest', 'httpx', 'piptools'):
    assert importlib.util.find_spec(module) is None, module
assert {p.name for p in ROOT.iterdir()} == {'release', 'docker'}
for path in (ROOT / 'release').rglob('*'):
    assert not {'dummy', 'probe', 'tests', 'tools', 'node_modules'} & set(path.parts)
    assert path.suffix != '.map'

with tempfile.TemporaryDirectory() as directory:
    process = subprocess.Popen([
        sys.executable, str(ROOT / 'release/run.py'),
        '--config', str(ROOT / 'release/site-config.json'),
        '--database', str(Path(directory) / 'board.sqlite3'),
    ])
    try:
        for _ in range(150):
            assert process.poll() is None, 'Production server exited'
            try:
                check('board')
                break
            except OSError:
                time.sleep(0.1)
        else:
            raise AssertionError('Production server did not become healthy')
    finally:
        process.terminate()
        try:
            process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait()
            raise AssertionError('Production did not stop gracefully')
    # Uvicorn completes shutdown then re-raises the captured termination signal.
    assert process.returncode in (0, -signal.SIGTERM), process.returncode
    with sqlite3.connect(Path(directory) / 'board.sqlite3') as database:
        assert database.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
print('Production image: isolation, non-root startup, health and shutdown passed.')
