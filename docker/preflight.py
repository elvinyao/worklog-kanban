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
        process=subprocess.Popen([sys.executable,'-m','tools.dev'],cwd='/opt/worklog',env={**os.environ,'WORKLOG_DATABASE':str(Path(directory)/'board.sqlite3')},stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        try:
            for _ in range(150):
                if process.poll() is not None:raise RuntimeError('Candidate exited before ready')
                try:
                    for service in SERVICES:check(service)
                    print('Candidate: board, Jira and Mattermost are healthy with temporary data.')
                    return
                except OSError:time.sleep(.1)
            raise RuntimeError('Candidate health check timed out')
        finally:
            process.terminate()
            try:process.wait(timeout=8)
            except subprocess.TimeoutExpired:process.kill();process.wait()


if __name__=='__main__':main()
