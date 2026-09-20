import json
from pathlib import Path
import shutil
import sqlite3
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

import pytest

from app.config import SiteConfig
from app.store import Store
from docker.deployment import prepare, promote

ROOT=Path(__file__).resolve().parents[2]

@pytest.fixture
def installation(tmp_path):
    root=tmp_path/'repo';(root/'config').mkdir(parents=True)
    shutil.copy2(ROOT/'config/dummy.json',root/'config/dummy.json')
    prepare(root,'fixture');promote(root,'fixture')
    data=tmp_path/'data';data.mkdir()
    store=Store(data/'board.sqlite3',SiteConfig.model_validate_json((root/'config/dummy.json').read_text()));store.initialize()
    (data/'board.sqlite3.lock').touch()
    extension=root/'dist/extensions/fixture';extension.mkdir(parents=True)
    for name in ('manifest.json','worker.js','bridge.js','options.html','options.js','options.css'):(extension/name).write_text('{}')
    return root,data

def test_stopped_diagnosis_preserves_files_and_reports_state(installation):
    from docker.doctor import diagnose
    root,data=installation
    before={p:p.read_bytes() for base in (root,data) for p in base.rglob('*') if p.is_file()}
    reports=diagnose(root,'fixture',data,running=False,image_sites=json.loads((root/'config/dummy.json').read_text()))
    assert not any(level=='FAIL' for level,_ in reports)
    assert any('stopped' in text for _,text in reports)
    assert before=={p:p.read_bytes() for base in (root,data) for p in base.rglob('*') if p.is_file()}

@pytest.mark.parametrize('fault',['missing','corrupt','schema','config','extension'])
def test_diagnosis_reports_actionable_failures_without_changing_data(installation,fault):
    from docker.doctor import diagnose
    root,data=installation;sites=json.loads((root/'config/dummy.json').read_text())
    if fault=='missing':(root/'.tmp/docker-state/fixture/compose.json').unlink()
    elif fault=='corrupt':(data/'board.sqlite3').write_bytes(b'corrupt')
    elif fault=='schema':
        with sqlite3.connect(data/'board.sqlite3') as db:db.execute('PRAGMA user_version=999')
    elif fault=='config':sites['jiraBaseUrl']='https://wrong.example.invalid'
    else:(root/'dist/extensions/fixture/worker.js').unlink()
    before=(data/'board.sqlite3').read_bytes()
    reports=diagnose(root,'fixture',data,running=False,image_sites=sites)
    assert any(level=='FAIL' for level,_ in reports)
    assert before==(data/'board.sqlite3').read_bytes()

def test_health_uses_loopback_correct_host_and_never_follows_redirects():
    from docker.doctor import check_health
    seen=[]
    class Handler(BaseHTTPRequestHandler):
        def log_message(self,*_):pass
        def do_GET(self):
            seen.append((self.path,self.headers['Host']))
            if self.headers['Host']=='redirect.example.invalid':
                self.send_response(302);self.send_header('Location','https://must-not-contact.example.invalid');self.end_headers()
            else:self.send_response(200);self.end_headers();self.wfile.write(b'{"status":"ok"}')
    server=HTTPServer(('127.0.0.1',0),Handler);thread=threading.Thread(target=server.serve_forever);thread.start()
    try:
        assert check_health('https://board.example.invalid',port=server.server_port)
        assert not check_health('https://redirect.example.invalid',port=server.server_port)
        assert seen==[('/health','board.example.invalid'),('/health','redirect.example.invalid')]
    finally:server.shutdown();thread.join();server.server_close()

def test_diagnosis_does_not_create_missing_database_or_directories(tmp_path):
    from docker.doctor import diagnose
    assert any(level=='FAIL' for level,_ in diagnose(tmp_path,'fixture',tmp_path/'missing',running=False,image_sites=None))
    assert list(tmp_path.iterdir())==[]

@pytest.mark.parametrize('state',[{'status':'exited','exitCode':1,'oomKilled':False},{'status':'exited','exitCode':137,'oomKilled':True},{'status':'dead','exitCode':0,'oomKilled':False}])
def test_crashed_container_is_not_reported_as_normal_stopped(installation,state):
    from docker.doctor import diagnose
    root,data=installation
    reports=diagnose(root,'fixture',data,running=False,image_sites=json.loads((root/'config/dummy.json').read_text()),container_state=state)
    assert any(level=='FAIL' and 'container' in text.lower() for level,text in reports)

@pytest.mark.parametrize('services',[
    [{'Service':'board','State':'exited','ExitCode':143,'Health':''}],
    [{'Service':name,'State':'exited','ExitCode':1 if name=='mattermost' else 143,'Health':''} for name in ('board','jira','mattermost')],
])
def test_missing_or_failed_dummy_services_make_diagnosis_fail(installation,services):
    from docker.doctor import diagnose
    root,data=installation
    reports=diagnose(root,'fixture',data,running=False,image_sites=json.loads((root/'config/dummy.json').read_text()),service_states=services)
    assert any(level=='FAIL' for level,_ in reports)
