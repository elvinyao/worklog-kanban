import sqlite3
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from threading import Barrier
from uuid import uuid4

import pytest

from test_api import client, CONFIG, HEADERS


def prepare(client):
    board=client.get('/api/board').json()
    for title,column in [('active',board['columns'][0]),('done-a',board['columns'][-1]),('done-b',board['columns'][-1])]:
        response=client.post('/api/cards',headers=HEADERS,json={'title':title,'notes':'Keep shared notes','columnId':column['id'],'jiraLinks':[{'url':'DEMO-1','mattermostLinks':[{'url':CONFIG.mattermostBaseUrl+'/demo/pl/'+'a'*26,'description':'Keep description'}]}]})
        assert response.status_code==200
    return response.json()


def command(board,ids=None):
    return {'requestId':uuid4().hex,'expectedBoardRevision':board['revision'],'name':'Week one','description':'Shared summary','cardIds':ids or [c['id'] for c in board['cards'] if c['title'].startswith('done-')]}


def archive(client,board,ids=None):
    data=command(board,ids);response=client.post('/api/archives',headers=HEADERS,json=data)
    assert response.status_code==200,response.text
    return response.json(),data


def test_archive_is_atomic_frozen_and_replayed_with_latest_current(client):
    before=prepare(client);done=[c for c in before['cards'] if c['title'].startswith('done-')]
    result,data=archive(client,before,[done[0]['id']]);current=result['board']
    assert [c['title'] for c in current['cards']]==['active','done-b']
    assert current['cards'][-1]['position']==0 and current['revision']==before['revision']+1
    saved=client.get('/api/archives/'+result['archiveId']).json()
    assert saved['snapshot']['cards']==[done[0]] and saved['snapshot']['columns']==before['columns']
    assert saved['cardCount']==saved['jiraLinkCount']==1 and saved['restoredCards']=={}
    change=client.patch('/api/columns/'+before['columns'][-1]['id'],headers=HEADERS,json={'expectedBoardRevision':current['revision'],'name':'Renamed'}).json()
    replay=client.post('/api/archives',headers=HEADERS,json=data)
    assert replay.status_code==200 and replay.json()['archiveId']==result['archiveId']
    assert replay.json()['board']==change
    assert client.get('/api/archives/'+result['archiveId']).json()['snapshot']==saved['snapshot']
    assert client.get('/api/archives').json()['total']==1
    assert client.post('/api/archives',headers=HEADERS,json={**data,'name':'different'}).status_code==409
    with client.app.state.store.connection() as c:
        assert c.execute("SELECT COUNT(*) FROM audit_events WHERE action='archive.create'").fetchone()[0]==1


def test_scope_revision_private_inputs_and_archived_old_writes(client):
    before=prepare(client);active=before['cards'][0];done=before['cards'][-1]
    for patch,status in [({'cardIds':[active['id']]},400),({'cardIds':['missing']},404),({'cardIds':[]},422),({'cardIds':[done['id'],done['id']]},422),({'expectedBoardRevision':0},409),({'preview':'PRIVATE'},422)]:
        response=client.post('/api/archives',headers=HEADERS,json={**command(before),**patch})
        assert response.status_code==status,response.text
        assert 'PRIVATE' not in response.text
        assert client.get('/api/board').json()==before
    result,_=archive(client,before)
    for method,path,data in [('PATCH','/api/cards/'+done['id'],{'expectedVersion':done['version'],'notes':'old'}),('POST','/api/cards/'+done['id']+'/move',{'expectedBoardRevision':before['revision'],'targetColumnId':active['columnId'],'index':0})]:
        response=client.request(method,path,headers=HEADERS,json=data)
        assert response.status_code==409 and response.json()['code']=='archived'
        assert response.json()['archiveId']==result['archiveId']


def test_restore_new_ids_preserves_orphans_history_and_replay(client):
    before=prepare(client);card=before['cards'][-1]
    with client.app.state.store.connection() as c:
        c.execute('INSERT INTO mattermost_links VALUES (?,?,?,?,?,?,?,?)',('orphan',card['id'],None,'b'*26,'demo',CONFIG.mattermostBaseUrl+'/demo/pl/'+'b'*26,'Historical note',0))
    before=client.get('/api/board').json();result,_=archive(client,before)
    frozen=client.get('/api/archives/'+result['archiveId']).json()['snapshot']
    data={'requestId':uuid4().hex,'expectedBoardRevision':result['board']['revision'],'cardIds':[card['id']],'targetColumnId':before['columns'][0]['id']}
    url='/api/archives/'+result['archiveId']+'/restore';response=client.post(url,headers=HEADERS,json=data)
    assert response.status_code==200,response.text
    restored=response.json();copy=restored['board']['cards'][-1]
    assert copy['id']!=card['id'] and copy['title']==card['title'] and copy['notes']==card['notes']
    assert copy['jiraLinks'][0]['id']!=card['jiraLinks'][0]['id']
    assert copy['jiraLinks'][0]['mattermostLinks'][0]['description']=='Keep description'
    assert copy['unassignedMattermostLinks'][0]['id']!='orphan' and copy['unassignedMattermostLinks'][0]['description']=='Historical note'
    assert client.post(url,headers=HEADERS,json=data).json()==restored
    assert client.post(url,headers=HEADERS,json={**data,'requestId':uuid4().hex,'expectedBoardRevision':restored['board']['revision']}).status_code==409
    detail=client.get('/api/archives/'+result['archiveId']).json()
    assert detail['snapshot']==frozen and detail['restoredCards']=={card['id']:copy['id']}
    current=client.post('/api/cards/'+copy['id']+'/move',headers=HEADERS,json={'targetColumnId':before['columns'][-1]['id'],'index':0,'expectedBoardRevision':restored['board']['revision']}).json()
    next_archive,_=archive(client,current,[copy['id']])
    again=client.post(url,headers=HEADERS,json={**data,'requestId':uuid4().hex,'expectedBoardRevision':next_archive['board']['revision']})
    assert again.status_code==200 and again.json()['restoredCards'][card['id']]!=copy['id']


def test_archive_and_restore_failure_roll_back_all_changes(client,monkeypatch):
    before=prepare(client);store=client.app.state.store
    original=store._arrange_cards
    monkeypatch.setattr(store,'_arrange_cards',lambda *args:(_ for _ in ()).throw(RuntimeError('synthetic')))
    response=client.post('/api/archives',headers=HEADERS,json=command(before))
    assert response.status_code==500
    assert client.get('/api/board').json()==before and client.get('/api/archives').json()['total']==0
    monkeypatch.setattr(store,'_arrange_cards',original)
    result,_=archive(client,before)
    monkeypatch.setattr(store,'_resource',lambda *args:(_ for _ in ()).throw(ValueError('synthetic')))
    data={'requestId':uuid4().hex,'expectedBoardRevision':result['board']['revision'],'cardIds':[before['cards'][-1]['id']],'targetColumnId':before['columns'][0]['id']}
    assert client.post('/api/archives/'+result['archiveId']+'/restore',headers=HEADERS,json=data).status_code>=400
    assert client.get('/api/board').json()==result['board']
    assert client.get('/api/archives/'+result['archiveId']).json()['restoredCards']=={}


def test_list_search_pagination_and_metadata_conflict(client):
    for index in range(5):
        board=client.get('/api/board').json();board=client.post('/api/cards',headers=HEADERS,json={'title':str(index),'columnId':board['columns'][-1]['id']}).json()
        data={**command(board,[board['cards'][-1]['id']]),'name':'Match '+str(index),'description':'needle' if index==0 else ''}
        assert client.post('/api/archives',headers=HEADERS,json=data).status_code==200
    first=client.get('/api/archives?limit=2').json();assert first['total']==5 and len(first['items'])==2
    second=client.get('/api/archives',params={'limit':2,'cursor':first['nextCursor']}).json()
    third=client.get('/api/archives',params={'limit':2,'cursor':second['nextCursor']}).json()
    ids=[a['id'] for p in [first,second,third] for a in p['items']];assert len(set(ids))==5 and third['nextCursor'] is None
    assert client.get('/api/archives?q=needle').json()['total']==1
    target=first['items'][0];change={'name':'Updated','description':'changed','expectedMetadataVersion':target['metadataVersion']}
    assert client.patch('/api/archives/'+target['id'],headers=HEADERS,json=change).status_code==200
    assert client.patch('/api/archives/'+target['id'],headers=HEADERS,json=change).status_code==409
    assert client.get('/api/archives?q=Updated').json()['items'][0]['createdAt']==target['createdAt']
    assert client.get('/api/archives?cursor=invalid').status_code==400


def test_completion_flag_is_independent_of_names(client):
    board=client.get('/api/board').json();assert [c['isDone'] for c in board['columns']]==[False]*5+[True]
    column=board['columns'][0];changed=client.patch('/api/columns/'+column['id'],headers=HEADERS,json={'isDone':True,'expectedBoardRevision':board['revision']}).json()
    assert changed['columns'][0]['isDone'] and changed['columns'][0]['defaultNameKey']=='todo'
    renamed=client.patch('/api/columns/'+column['id'],headers=HEADERS,json={'name':'Custom','expectedBoardRevision':changed['revision']}).json()
    assert renamed['columns'][0]['isDone'] and renamed['columns'][0]['defaultNameKey'] is None
    created=client.post('/api/columns',headers=HEADERS,json={'name':'完成','expectedBoardRevision':renamed['revision']}).json()
    assert created['columns'][-1]['isDone'] is False


def test_metadata_patch_preserves_omitted_fields(client):
    result,_=archive(client,prepare(client));url='/api/archives/'+result['archiveId']
    assert client.patch(url,headers=HEADERS,json={'name':'Renamed','expectedMetadataVersion':1}).status_code==200
    assert client.get(url).json()['description']=='Shared summary'
    assert client.patch(url,headers=HEADERS,json={'description':'','expectedMetadataVersion':2}).status_code==200
    detail=client.get(url).json();assert detail['name']=='Renamed' and detail['description']==''
    for data in [{'expectedMetadataVersion':3},{'name':None,'expectedMetadataVersion':3},{'name':'  ','expectedMetadataVersion':3}]:
        assert client.patch(url,headers=HEADERS,json=data).status_code==422


def test_archive_boundaries(client):
    board=prepare(client);valid=command(board)
    for headers in [{},{'Origin':CONFIG.boardOrigin},{'Origin':'https://other.invalid','X-Worklog-Request':'1'}]:
        assert client.post('/api/archives',headers=headers,json=valid).status_code==403
    assert client.post('/api/archives',headers={**HEADERS,'Content-Type':'text/plain'},content='{}').status_code==415
    assert client.post('/api/archives',headers={**HEADERS,'Content-Type':'application/json'},content='x'*(512*1024+1)).status_code==413
    result,_=archive(client,board)
    for payload in [{**valid,'snapshot':{'text':'PRIVATE'}},{**valid,'name':{'PRIVATE':'PRIVATE'}}]:
        response=client.post('/api/archives',headers=HEADERS,json=payload);assert response.status_code==422 and 'PRIVATE' not in response.text
    assert 'PRIVATE' not in client.get('/api/archives/'+result['archiveId']).text


def make_v2(path):
    with sqlite3.connect(path) as c:
        c.executescript(Path('tests/fixtures/board-v2.sql').read_text())
        c.execute('INSERT INTO board_meta VALUES(1,9)')
        c.executemany('INSERT INTO columns VALUES(?,?,?)',[('done','完成',0),('custom','完成',1),('renamed','Finished',2)])
        c.execute('INSERT INTO cards VALUES(?,?,?,?,?,?,?,?)',('saved','Keep title','Keep notes','done',0,4,None,None))
        c.execute('INSERT INTO jira_links VALUES(?,?,?,?,?)',('jira','saved','DEMO-1',CONFIG.jiraBaseUrl+'/browse/DEMO-1',0))
        c.execute('INSERT INTO mattermost_links VALUES(?,?,?,?,?,?,?,?)',('msg','saved','jira','a'*26,'demo',CONFIG.mattermostBaseUrl+'/demo/pl/'+'a'*26,'Keep description',0))
        c.execute("INSERT INTO audit_events VALUES(1,8,'2026-09-20','column.create','custom','127.0.0.1')")
        c.execute("INSERT INTO audit_events VALUES(2,9,'2026-09-20','column.rename','renamed','127.0.0.1')")


def test_v2_migration_backup_preserves_ids_audit_and_semantics(tmp_path):
    from app.store import Store
    path=tmp_path/'board.sqlite3';make_v2(path);store=Store(path,CONFIG);store.initialize();board=store.snapshot()
    assert board.revision==9 and board.archiveCount==0
    assert [c.isDone for c in board.columns]==[True,False,False]
    assert (board.cards[0].id,board.cards[0].version,board.cards[0].notes)==('saved',4,'Keep notes')
    assert board.cards[0].jiraLinks[0].id=='jira' and board.cards[0].jiraLinks[0].mattermostLinks[0].id=='msg'
    backups=list(tmp_path.glob('*.pre-v3-*.sqlite3'));assert len(backups)==1
    with sqlite3.connect(backups[0]) as c:
        assert c.execute('PRAGMA user_version').fetchone()[0]==2
        assert len(c.execute('PRAGMA table_info(columns)').fetchall())==3
        assert c.execute('SELECT notes FROM cards').fetchone()[0]=='Keep notes'
    store.initialize();assert store.snapshot()==board and list(tmp_path.glob('*.pre-v3-*.sqlite3'))==backups


def test_v2_migration_failure_rolls_back_added_schema(tmp_path,monkeypatch):
    from app.store import Store
    path=tmp_path/'board.sqlite3';make_v2(path)
    def fail(connection):
        connection.execute('UPDATE columns SET is_done=1');raise RuntimeError('synthetic migration')
    monkeypatch.setattr(Store,'_migrate_completed_columns',staticmethod(fail))
    with pytest.raises(RuntimeError,match='synthetic migration'):Store(path,CONFIG).initialize()
    with sqlite3.connect(path) as c:
        assert c.execute('PRAGMA user_version').fetchone()[0]==2
        assert len(c.execute('PRAGMA table_info(columns)').fetchall())==3
        assert not c.execute("SELECT name FROM sqlite_master WHERE name='board_archives'").fetchall()
        assert c.execute('SELECT COUNT(*) FROM mattermost_links').fetchone()[0]==1


def test_two_restore_connections_create_at_most_one_active_copy(client):
    from app.archives import Archives
    from app.schemas import RestoreArchive
    from app.store import Store
    from app.errors import StoreError
    before=prepare(client);result,_=archive(client,before);barrier=Barrier(2)
    def run(_):
        store=Store(client.app.state.store.path,CONFIG);barrier.wait()
        try:
            return Archives(store).restore(result['archiveId'],RestoreArchive(requestId=uuid4().hex,expectedBoardRevision=result['board']['revision'],cardIds=[before['cards'][-1]['id']],targetColumnId=before['columns'][0]['id']),'127.0.0.1').committed
        except StoreError as error:return error.code
    with ThreadPoolExecutor(max_workers=2) as pool:results=list(pool.map(run,range(2)))
    assert sorted(results,key=str)==[True,'conflict']
    assert len(client.app.state.store.snapshot().cards)==2


def test_restore_rejects_changed_site_and_deleted_target_without_partial_write(client):
    before=prepare(client);result,_=archive(client,before);store=client.app.state.store
    data={'requestId':uuid4().hex,'expectedBoardRevision':result['board']['revision'],'cardIds':[before['cards'][-1]['id']],'targetColumnId':'missing'}
    url='/api/archives/'+result['archiveId']+'/restore'
    assert client.post(url,headers=HEADERS,json=data).status_code==404
    store.config=CONFIG.model_copy(update={'jiraBaseUrl':'https://different.invalid/jira'})
    data['targetColumnId']=before['columns'][0]['id'];response=client.post(url,headers=HEADERS,json=data)
    assert response.status_code==400 and response.json()['code']=='archive_links_changed'
    assert store.snapshot().model_dump()==result['board']


def test_replay_does_not_notify_twice_and_next_commit_notifies(client):
    before=prepare(client);result,data=archive(client,before);hub=client.app.state.events
    revision=hub.revision
    assert client.post('/api/archives',headers=HEADERS,json=data).status_code==200
    assert hub.revision==revision
    board=client.post('/api/cards',headers=HEADERS,json={'title':'next','columnId':before['columns'][0]['id']}).json()
    assert hub.revision==board['revision']==revision+1
