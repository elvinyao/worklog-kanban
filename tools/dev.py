"""Container-only service supervision; never imports dummy into shared app."""
import argparse
import os
import signal
import subprocess
import sys
import time
import urllib.request


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--probe', action='store_true')
    parser.add_argument('--mode', choices=['dummy','lifecycle-test'], default='dummy')
    args = parser.parse_args()
    if not args.probe:
        raise SystemExit('Full board server is planned in T09')
    env = {**os.environ, 'WORKLOG_BUILD_MODE':args.mode}
    children = []
    stopping = False
    def stop(signum, frame):
        nonlocal stopping
        stopping = True
    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    services = [('tools.probe:create_app',4173),('dummy.jira:create_app',4180),('dummy.mattermost:create_app',4181)]
    try:
        for module,port in services:
            children.append(subprocess.Popen([sys.executable,'-m','uvicorn',module,'--factory','--host','0.0.0.0','--port',str(port),'--workers','1','--no-access-log','--no-proxy-headers','--log-level','warning'],env=env))
        deadline = time.monotonic()+15
        for host,port,route in [('board.localhost',4173,'/health'),('jira.localhost',4180,'/jira/__dummy/'),('mattermost.localhost',4181,'/__dummy/')]:
            while not stopping:
                if any(child.poll() is not None for child in children): raise RuntimeError('Development child exited before ready')
                try:
                    request = urllib.request.Request(f'http://127.0.0.1:{port}{route}',headers={'Host':f'{host}:{port}'})
                    with urllib.request.urlopen(request,timeout=.5) as response:
                        if response.status == 200: break
                except OSError:
                    if time.monotonic() > deadline: raise RuntimeError('Development readiness timeout')
                    time.sleep(.1)
        if not stopping: print('READY: board.localhost:4173, jira.localhost:4180, mattermost.localhost:4181',flush=True)
        while not stopping:
            if any(child.poll() is not None for child in children): raise RuntimeError('Development child exited')
            time.sleep(.1)
    finally:
        for child in children:
            if child.poll() is None: child.terminate()
        for child in children:
            try: child.wait(timeout=5)
            except subprocess.TimeoutExpired: child.kill(); child.wait()


if __name__ == '__main__':
    main()
