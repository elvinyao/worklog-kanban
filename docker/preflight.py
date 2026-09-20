"""Verify all three services using temporary data, never the live named volume."""
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time

from docker.healthcheck import SERVICES,check


def main():
    with tempfile.TemporaryDirectory(prefix='worklog-preflight-') as directory:
        production=os.environ.get('WORKLOG_MODE')=='production'
        command=[sys.executable,'/opt/worklog/release/run.py','--config',os.environ['WORKLOG_SITE_CONFIG'],'--database',str(Path(directory)/'board.sqlite3')] if production else [sys.executable,'-m','tools.dev']
        process=subprocess.Popen(command,cwd='/opt/worklog',env={**os.environ,'WORKLOG_DATABASE':str(Path(directory)/'board.sqlite3')},stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        try:
            for _ in range(150):
                if process.poll() is not None:raise RuntimeError('Candidate exited before ready')
                try:
                    for service in (['board'] if production else SERVICES):check(service)
                    print('Candidate is healthy with temporary data ('+('production' if production else 'dummy')+').')
                    return
                except OSError:time.sleep(.1)
            raise RuntimeError('Candidate health check timed out')
        finally:
            process.terminate()
            try:process.wait(timeout=8)
            except subprocess.TimeoutExpired:process.kill();process.wait()


if __name__=='__main__':main()
