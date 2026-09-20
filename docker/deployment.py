"""Deployment configuration helpers. Invoked inside the operations container only."""
import argparse
import copy
import ipaddress
import json
import os
from pathlib import Path
import re
import tempfile
import hashlib

from app.config import SiteConfig


def confined(root,relative):
    root=Path(root).resolve();path=root/relative
    if not path.resolve().is_relative_to(root):raise ValueError('Path must stay inside the repository')
    return path


def state_dir(root,project):
    if not re.fullmatch(r'[a-z0-9][a-z0-9_-]{0,50}',project):raise ValueError('Invalid project name')
    return confined(root,'.tmp/docker-state/'+project)


def atomic_json(path,value):
    path.parent.mkdir(parents=True,exist_ok=True)
    temporary=None
    try:
        with tempfile.NamedTemporaryFile(mode='w',dir=path.parent,delete=False) as stream:
            temporary=Path(stream.name);json.dump(value,stream,indent=2);stream.write('\n');stream.flush();os.fsync(stream.fileno())
        temporary.replace(path)
    finally:
        if temporary:temporary.unlink(missing_ok=True)


def read_sites(path):
    try:return SiteConfig.model_validate_json(path.read_text()).model_dump()
    except Exception:raise ValueError('Invalid site configuration; check the three URLs and mode') from None


def load_settings(root,project):
    path=state_dir(root,project)/'compose.json'
    if not path.is_file():return None
    state=json.loads(path.read_text())
    if 'x-worklog' not in state:
        if set(state.get('services',{}))!={'board','jira','mattermost'}:raise ValueError('Unknown legacy deployment state')
        return {'format':1,'project':project,'mode':'dummy','sites':read_sites(Path(root)/'config/dummy.json'),'port':4173,'trustedProxies':[]}
    value=state['x-worklog']
    if value.get('format')!=1 or value.get('project')!=project:raise ValueError('Invalid deployment state')
    sites=SiteConfig.model_validate(value['sites']).model_dump()
    if value['mode']!=sites['mode']:raise ValueError('Deployment mode differs from sites')
    return {**value,'sites':sites}


def compose_document(project,settings):
    production=settings['mode']=='production'
    common={'image':project+':local','init':True,'restart':'unless-stopped','read_only':True,'tmpfs':['/tmp'],'cap_drop':['ALL'],'security_opt':['no-new-privileges:true'],'stop_grace_period':'15s','logging':{'driver':'json-file','options':{'max-size':'10m','max-file':'3'}}}
    def service(name,port,command=None):
        value=copy.deepcopy(common)
        value['ports']=[f'127.0.0.1:{port}:{4173 if name=="board" else port}']
        value['healthcheck']={'test':['CMD','python','-m','docker.healthcheck',name],'interval':'3s','timeout':'3s','start_period':'5s','retries':10}
        if command:value['command']=command
        return value
    board=service('board',settings['port'])
    board['volumes']=['board-data:/data'];board['environment']={'WORKLOG_DATABASE':'/data/board.sqlite3'}
    if production:
        board['command']=['python','/opt/worklog/release/run.py','--config','/opt/worklog/release/site-config.json','--database','/data/board.sqlite3']
        for proxy in settings['trustedProxies']:board['command']+=['--trusted-proxy',proxy]
    services={'board':board}
    if not production:
        for name,port in [('jira',4180),('mattermost',4181)]:
            services[name]=service(name,port,['python','-m','uvicorn',f'dummy.{name}:create_app','--factory','--host','0.0.0.0','--port',str(port),'--workers','1','--no-access-log','--no-proxy-headers','--log-level','warning'])
    return {'name':project,'x-worklog':settings,'services':services,'volumes':{'board-data':{'name':project+'_board-data'}}}


def prepare(root,project,*,config=None,port=None,trusted_proxies=None):
    directory=state_dir(root,project);previous=load_settings(root,project)
    sites=read_sites(confined(root,config)) if config else previous['sites'] if previous else read_sites(Path(root)/'config/dummy.json')
    if config and sites['mode']!='production':raise ValueError('--config requires production mode')
    if previous and previous['mode']!=sites['mode']:raise ValueError('Use a separate --project for a different deployment mode')
    port=port if port is not None else previous['port'] if previous else 4173
    if type(port) is not int or not 1<=port<=65535:raise ValueError('Port must be between 1 and 65535')
    proxies=trusted_proxies if trusted_proxies is not None else previous['trustedProxies'] if previous else []
    try:
        proxies=[str(ipaddress.ip_network(value,strict=False)) for value in proxies]
        if any(ipaddress.ip_network(value).prefixlen==0 for value in proxies):raise ValueError()
    except ValueError:raise ValueError('Use explicit trusted proxy IP/CIDR values, never all networks') from None
    if sites['mode']=='dummy' and (port!=4173 or proxies):raise ValueError('Custom ports and trusted proxies require production mode')
    settings={'format':1,'project':project,'mode':sites['mode'],'sites':sites,'port':port,'trustedProxies':proxies}
    result=compose_document(project,settings)
    atomic_json(directory/'candidate.json',result)
    atomic_json(directory/'candidate-sites.json',sites)
    return result


def promote(root,project):
    directory=state_dir(root,project)
    atomic_json(directory/'compose.json',json.loads((directory/'candidate.json').read_text()))


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('action',choices=['prepare','promote','summary','fingerprint'])
    parser.add_argument('--root',type=Path,default=Path('/workspace'))
    parser.add_argument('--project',required=True)
    parser.add_argument('--config');parser.add_argument('--port',type=int)
    parser.add_argument('--trusted-proxy',action='append',default=None)
    args=parser.parse_args()
    try:
        if args.action=='prepare':print(prepare(args.root,args.project,config=args.config,port=args.port,trusted_proxies=args.trusted_proxy)['x-worklog']['mode'])
        elif args.action=='promote':promote(args.root,args.project)
        elif args.action=='fingerprint':print(hashlib.sha256((state_dir(args.root,args.project)/'candidate-sites.json').read_bytes()).hexdigest())
        else:
            settings=load_settings(args.root,args.project)
            if not settings:raise ValueError('No successful deployment yet')
            print('Ready: '+settings['sites']['boardOrigin'])
            print(f'Local endpoint: http://127.0.0.1:{settings["port"]} (use the configured Host through your proxy)')
            if settings['mode']=='dummy':print('Jira login: http://jira.localhost:4180/jira/__dummy/\nMattermost login: http://mattermost.localhost:4181/__dummy/')
    except (ValueError,OSError,KeyError):
        raise SystemExit('Deployment configuration rejected. Check file, URLs, port, proxy CIDRs and project mode; the saved deployment is unchanged.') from None


if __name__=='__main__':main()
