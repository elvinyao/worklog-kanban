import json
import os
from pathlib import Path
import shutil
import socket
import sqlite3
import subprocess
import sys
import time
import venv
from contextlib import contextmanager

import httpx
import pytest

from app.cli import production_app

ROOT=Path(__file__).resolve().parents[2]
ORIGIN='https://board.example.invalid'
HEADERS={'Host':'board.example.invalid','Origin':ORIGIN,'X-Worklog-Request':'1'}


@pytest.fixture(scope='module')
def package(tmp_path_factory):
    missing=subprocess.run(['npm','run','build:production','--','--config','config/missing.local.json'],cwd=ROOT,capture_output=True,text=True)
    assert missing.returncode!=0 and 'configuration' in missing.stderr.lower()
    subprocess.run(['npm','run','build:production','--','--config','config/production.example.json'],cwd=ROOT,check=True,capture_output=True)
    directory=tmp_path_factory.mktemp('production-isolated')
    bundle=directory/'release'
    shutil.copytree(ROOT/'dist/production',bundle)
    config=directory/'sites.json';shutil.copy2(ROOT/'config/production.example.json',config)
    environment=directory/'runtime';venv.EnvBuilder(with_pip=True).create(environment)
    python=environment/'bin/python'
    subprocess.run([str(python),'-m','pip','install','--require-hashes','-r',str(bundle/'requirements/runtime.txt')],check=True,capture_output=True)
    env={**os.environ,'PATH':str(environment/'bin'),'PYTHONPATH':'/nonexistent-source','PYTHONNOUSERSITE':'1'}
    assert shutil.which('node',path=env['PATH']) is None and shutil.which('npm',path=env['PATH']) is None
    inventory=json.loads(subprocess.check_output([str(python),'-I','-c','import importlib.metadata,json; print(json.dumps(sorted(d.metadata["Name"].lower() for d in importlib.metadata.distributions())))'],env=env,cwd=directory))
    assert not {'pytest','httpx','pip-tools','playwright'} & set(inventory)
    return directory,bundle,config,python,env


@contextmanager
def server(package,database,extra=()):
    directory,bundle,config,python,env=package
    with socket.socket() as listener:
        listener.bind(('127.0.0.1',0));port=listener.getsockname()[1]
    log=directory/('server-'+str(port)+'.log')
    with log.open('wb') as output:
        process=subprocess.Popen([str(python),'-I',str(bundle/'run.py'),'--config',str(config),'--database',str(database),'--host','127.0.0.1','--port',str(port),*extra],cwd=directory,env=env,stdout=output,stderr=output)
        try:
            with httpx.Client(base_url=f'http://127.0.0.1:{port}',headers=HEADERS,trust_env=False,timeout=5) as client:
                for _ in range(100):
                    if process.poll() is not None: raise AssertionError('Isolated server exited: '+log.read_text()[:1000])
                    try:
                        if client.get('/health').status_code==200: break
                    except httpx.ConnectError: pass
                    time.sleep(.05)
                else: raise AssertionError('Isolated production server did not start')
                yield client,log
        finally:
            process.terminate()
            try: process.wait(timeout=10)
            except subprocess.TimeoutExpired: process.kill();process.wait();raise AssertionError('Production shutdown did not finish')


def test_artifact_only_contains_runtime_and_requires_matching_production_config(package,tmp_path):
    _,bundle,config,python,env=package
    assert {path.name for path in bundle.iterdir()}=={'app','run.py','web','extension','requirements','site-config.json'}
    forbidden={'dummy','probe','lifecycle','node_modules','tests','tools','scripts','__pycache__'}
    assert not any(forbidden & set(path.relative_to(bundle).parts) or path.suffix=='.map' for path in bundle.rglob('*'))
    assert (bundle/'app/schema.sql').is_file() and (bundle/'web/index.html').is_file()
    manifest=json.loads((bundle/'extension/manifest.json').read_text())
    assert manifest['host_permissions']==['https://board.example.invalid/*','https://jira.example.invalid/*','https://mattermost.example.invalid/*']
    assert manifest['optional_host_permissions']==['http://*/*','https://*/*']
    assert manifest['permissions']==['storage','scripting'] and 'cookies' not in manifest['permissions']
    assert manifest['options_ui']=={'page':'options.html','open_in_tab':True} and 'content_scripts' not in manifest
    assert {file.name for file in (bundle/'extension').iterdir()}=={'manifest.json','worker.js','bridge.js','options.html','options.js','options.css'}
    for path in [bundle/'web',bundle/'extension']:
        for file in path.rglob('*'):
            if file.is_file(): assert not any(value in file.read_text() for value in ('jira.localhost','mattermost.localhost','/probe/','__dummy','ALICE_ONLY_MARKER'))
    assert production_app(config,tmp_path/'board.sqlite3',bundle=bundle).state.config.mode=='production'
    for args,label in [([], 'required'),(['--config',str(tmp_path/'missing.json')],'configuration')]:
        result=subprocess.run([str(python),'-I',str(bundle/'run.py'),*args],cwd=tmp_path,env=env,capture_output=True,text=True)
        assert result.returncode!=0 and label in result.stderr.lower()
    invalid=tmp_path/'invalid.json'
    for change in [{'mode':'dummy'},{'boardOrigin':'https://other.example.invalid'}]:
        invalid.write_text(json.dumps({**json.loads(config.read_text()),**change}))
        with pytest.raises(RuntimeError):production_app(invalid,tmp_path/'board.sqlite3',bundle=bundle)
    with pytest.raises(RuntimeError,match='assets'):production_app(config,tmp_path/'board.sqlite3',bundle=tmp_path)


def test_isolated_python_runtime_serves_web_api_sse_rejects_private_fields_and_survives_restart(package,tmp_path):
    database=tmp_path/'persistent/board.sqlite3'
    with server(package,database) as (client,log):
        page=client.get('/');assert page.status_code==200 and '<div id="root">' in page.text
        assert page.headers['cache-control']=='no-store' and 'content-security-policy' in page.headers
        asset=next((package[1]/'web/assets').glob('*.js'));assert client.get('/assets/'+asset.name).status_code==200
        initial=client.get('/api/board').json();assert len(initial['columns'])==6
        for route in ['/__dummy/','/__dummy/session','/jira/__dummy/','/probe/','/docs','/redoc','/openapi.json','/api/missing']:
            assert client.get(route).status_code==404
        payload={'title':'生产包重启验收','columnId':initial['columns'][0]['id'],'notes':'持久共享笔记'}
        assert client.post('/api/cards',json=payload,headers={'Origin':'https://evil.invalid'}).status_code==403
        assert client.post('/api/cards',json={**payload,'preview':'PRIVATE_RUNTIME_MARKER'}).status_code==422
        with client.stream('GET','/api/events') as stream:
            assert stream.status_code==200
            events=stream.iter_lines()
            def revision():
                for line in events:
                    if line.startswith('data:'):
                        event=json.loads(line.removeprefix('data:'));assert set(event)=={'revision'};return event['revision']
                raise AssertionError('No revision event')
            assert revision()==0
            result=client.post('/api/cards',json=payload,headers={'X-Forwarded-For':'203.0.113.9'})
            assert result.status_code==200 and result.json()['revision']==1
            assert revision()==1
        assert 'PRIVATE_RUNTIME_MARKER' not in log.read_text() and '持久共享笔记' not in log.read_text()
        # A second instance must fail even when its listen port differs.
        with pytest.raises(AssertionError,match='already belongs'): 
            with server(package,database): pass
    with server(package,database) as (client,_):
        restored=client.get('/api/board').json();assert len(restored['columns'])==6 and restored['revision']==1
        assert restored['cards'][0]['notes']=='持久共享笔记'
    with sqlite3.connect(database) as connection:
        assert connection.execute('select source_ip from audit_events').fetchone()[0]=='127.0.0.1'
    with server(package,tmp_path/'trusted.sqlite3',('--trusted-proxy','127.0.0.1/32')) as (client,_):
        column=client.get('/api/board').json()['columns'][0]['id']
        assert client.post('/api/cards',json={'title':'代理演练','columnId':column},headers={'X-Forwarded-For':'203.0.113.9'}).status_code==200
    with sqlite3.connect(tmp_path/'trusted.sqlite3') as connection:assert connection.execute('select source_ip from audit_events').fetchone()[0]=='203.0.113.9'


def test_release_cannot_contain_its_database(package,tmp_path):
    _,bundle,config,_,_=package
    with pytest.raises(RuntimeError,match='database'):production_app(config,bundle/'data/board.sqlite3',bundle=bundle)
    alias=tmp_path/'release-alias';alias.symlink_to(bundle,target_is_directory=True)
    with pytest.raises(RuntimeError,match='database'):production_app(config,alias/'data/board.sqlite3',bundle=bundle)
@pytest.mark.parametrize('suffix',['css','js'])
def test_all_entry_assets_must_exist(package,tmp_path,suffix):
    _,bundle,config,_,_=package
    broken=tmp_path/'broken';shutil.copytree(bundle,broken)
    next((broken/'web/assets').glob('*.'+suffix)).unlink()
    (broken/'web/assets/unrelated.js').write_text('/* unrelated asset */')
    with pytest.raises(RuntimeError,match='assets'):production_app(config,tmp_path/'board.sqlite3',bundle=broken)


def test_rebuild_preserves_previous_files_and_uses_one_config_snapshot(package,tmp_path):
    original=json.loads(package[2].read_text());config=tmp_path/'build-sites.json';config.write_text(json.dumps(original))
    destination=ROOT/'dist/production';(destination/'operator-note.txt').write_text('SYNTHETIC_RELEASE_NOTE')
    previous=set((ROOT/'dist').glob('production.previous-*'))
    process=subprocess.Popen(['npm','run','build:production','--','--config',str(config)],cwd=ROOT,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True)
    changed=False
    for line in process.stdout:
        if not changed and 'vite v' in line:
            config.write_text(json.dumps({**original,'boardOrigin':'https://changed.example.invalid'}));changed=True
    assert process.wait(timeout=10)==0 and changed
    assert json.loads((destination/'site-config.json').read_text())==original
    retained=set((ROOT/'dist').glob('production.previous-*'))-previous
    assert len(retained)==1 and (retained.pop()/'operator-note.txt').read_text()=='SYNTHETIC_RELEASE_NOTE'


def test_dummy_supervisor_restart_retains_shared_data(tmp_path):
    import signal
    database=tmp_path/'dummy.sqlite3';log=tmp_path/'dummy.log'
    for attempt in range(2):
        with log.open('wb') as output:
            process=subprocess.Popen([sys.executable,'-m','tools.dev'],cwd=ROOT,env={**os.environ,'WORKLOG_DATABASE':str(database)},stdout=output,stderr=output)
            try:
                for _ in range(200):
                    if process.poll() is not None:raise AssertionError('Dummy supervisor exited')
                    if 'READY:' in log.read_text():break
                    time.sleep(.05)
                else:raise AssertionError('Dummy supervisor did not become ready')
                with httpx.Client(base_url='http://127.0.0.1:4173',headers={'Host':'board.localhost:4173','Origin':'http://board.localhost:4173','X-Worklog-Request':'1'},trust_env=False) as client:
                    snapshot=client.get('/api/board').json();assert len(snapshot['columns'])==6
                    if attempt==0:assert client.post('/api/cards',json={'title':'重启模拟','columnId':snapshot['columns'][0]['id'],'notes':'保留模拟笔记'}).status_code==200
                    else:assert snapshot['revision']==1 and snapshot['cards'][0]['notes']=='保留模拟笔记'
            finally:
                process.send_signal(signal.SIGINT)
                try:process.wait(timeout=10)
                except subprocess.TimeoutExpired:process.kill();process.wait();raise AssertionError('Dummy children failed to stop')
