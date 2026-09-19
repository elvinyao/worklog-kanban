import sqlite3
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.config import SiteConfig
from app.main import create_app

CONFIG=SiteConfig.model_validate_json(Path('config/dummy.json').read_text())
HEADERS={'Origin':CONFIG.boardOrigin,'X-Worklog-Request':'1'}


@pytest.fixture
def client(tmp_path):
    app=create_app(config=CONFIG,database=tmp_path/'board.sqlite3')
    with TestClient(app,base_url=CONFIG.boardOrigin,client=('127.0.0.1',1234)) as value:
        yield value


def test_shared_api_create_edit_conflict_and_no_personal_fields(client):
    response=client.get('/api/board')
    assert response.status_code==200
    board=response.json()
    assert board['revision']==0 and len(board['columns'])==6
    response=client.post('/api/cards',headers=HEADERS,json={'title':'共享','columnId':board['columns'][0]['id']})
    assert response.status_code==200
    card=response.json()['cards'][0]
    changed=client.patch('/api/cards/'+card['id'],headers=HEADERS,json={'expectedVersion':1,'notes':'新笔记'})
    assert changed.status_code==200
    conflict=client.patch('/api/cards/'+card['id'],headers=HEADERS,json={'expectedVersion':1,'notes':'旧草稿'})
    assert conflict.status_code==409
    assert conflict.json()=={'code':'conflict','fields':[]}
    assert client.get('/api/board').json()==changed.json()
    assert set(card)=={'id','columnId','title','notes','position','version','jira','mattermostLinks'}


def test_write_boundaries_and_safe_validation_errors(client):
    board=client.get('/api/board').json()
    valid={'title':'共享','columnId':board['columns'][0]['id']}
    for headers in [{},{'Origin':'https://evil.invalid','X-Worklog-Request':'1'},{'Origin':CONFIG.boardOrigin},{**HEADERS,'Host':'evil.invalid'}]:
        assert client.post('/api/cards',headers=headers,json=valid).status_code==403
    assert client.post('/api/cards',headers={**HEADERS,'Content-Type':'text/plain'},content='{}').status_code==415
    marker='ALICE_ONLY_MARKER'
    for payload in [{**valid,'preview':marker},{**valid,marker:{'Cookie':marker}},{**valid,'title':{'private':marker}}]:
        response=client.post('/api/cards',headers=HEADERS,json=payload)
        assert response.status_code==422
        assert marker not in response.text
    malformed=client.post('/api/cards',headers={**HEADERS,'Content-Type':'application/json'},content='{"private":"'+marker)
    assert malformed.status_code==422 and marker not in malformed.text
    huge=client.post('/api/cards',headers={**HEADERS,'Content-Type':'application/json'},content='x'*(512*1024+1))
    assert huge.status_code==413
    assert client.get('/api/board').json()['revision']==0


def test_unknown_api_paths_and_docs_never_return_html(client):
    for path in ['/api/missing','/docs','/redoc','/openapi.json','/__dummy/session']:
        response=client.get(path)
        assert response.status_code==404
        assert 'application/json' in response.headers['content-type']
    assert client.get('/api/board').headers['cache-control']=='no-store'


@pytest.mark.parametrize('trusted,expected',[((),'127.0.0.1'),(('127.0.0.1/32',),'203.0.113.9')])
def test_only_configured_proxy_can_supply_audit_source(tmp_path,trusted,expected):
    database=tmp_path/'board.sqlite3'
    with TestClient(create_app(config=CONFIG,database=database,trusted_proxies=trusted),base_url=CONFIG.boardOrigin,client=('127.0.0.1',1234)) as client:
        column=client.get('/api/board').json()['columns'][0]['id']
        response=client.post('/api/cards',headers={**HEADERS,'X-Forwarded-For':'192.0.2.1, 203.0.113.9'},json={'title':'不进入日志','columnId':column})
        assert response.status_code==200
    with sqlite3.connect(database) as connection:
        assert connection.execute('SELECT source_ip FROM audit_events').fetchone()[0]==expected


def test_structural_routes_share_revision_protection(client):
    board=client.get('/api/board').json()
    response=client.post('/api/columns',headers=HEADERS,json={'name':'验收','expectedBoardRevision':0})
    assert response.status_code==200
    added=response.json()['columns'][-1]['id']
    assert client.patch('/api/columns/'+added,headers=HEADERS,json={'name':'新列名','expectedBoardRevision':1}).status_code==200
    ids=[c['id'] for c in reversed(client.get('/api/board').json()['columns'])]
    assert client.post('/api/columns/reorder',headers=HEADERS,json={'columnIds':ids,'expectedBoardRevision':2}).status_code==200
    assert client.request('DELETE','/api/columns/'+added,headers=HEADERS,json={'targetColumnId':board['columns'][0]['id'],'expectedBoardRevision':3}).status_code==200
    assert client.get('/api/board').json()['revision']==4


def test_file_symlink_cannot_start_another_instance_for_the_same_database(tmp_path):
    database=tmp_path/'board.sqlite3'
    alias=tmp_path/'alias.sqlite3'
    with TestClient(create_app(config=CONFIG,database=database),base_url=CONFIG.boardOrigin):
        alias.symlink_to(database)
        with pytest.raises(RuntimeError,match='another running instance'):
            with TestClient(create_app(config=CONFIG,database=alias),base_url=CONFIG.boardOrigin):
                pass


def test_unexpected_exception_never_echoes_or_logs_submitted_values(client,monkeypatch,capfd):
    marker='ALICE_ONLY_MARKER'
    def fail(*args):
        raise RuntimeError(marker)
    monkeypatch.setattr(client.app.state.store,'snapshot',fail)
    response=client.get('/api/board')
    assert response.status_code==500
    assert response.json()=={'code':'internal_error','fields':[]}
    assert marker not in capfd.readouterr().err
