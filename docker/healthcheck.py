import sys
import json
import os
from pathlib import Path
from urllib.parse import urlsplit
import urllib.request

SERVICES={
    'board':('board.localhost',4173,'/health'),
    'jira':('jira.localhost',4180,'/jira/__dummy/'),
    'mattermost':('mattermost.localhost',4181,'/__dummy/'),
}


def check(name):
    host,port,route=SERVICES[name]
    authority=f'{host}:{port}'
    if name=='board' and os.environ.get('WORKLOG_MODE')=='production':
        authority=urlsplit(json.loads(Path(os.environ['WORKLOG_SITE_CONFIG']).read_text())['boardOrigin']).netloc
    request=urllib.request.Request(f'http://127.0.0.1:{port}{route}',headers={'Host':authority})
    with urllib.request.build_opener(urllib.request.ProxyHandler({})).open(request,timeout=2) as response:
        if response.status!=200:raise RuntimeError('Service is not healthy')


if __name__=='__main__':
    try:check(sys.argv[1])
    except Exception:raise SystemExit(1) from None
