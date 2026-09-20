import sqlite3
from pathlib import Path

import pytest
from pydantic import ValidationError

from app.config import SiteConfig
from app.schemas import CreateCard, EditCard
from app.store import Store, StoreError

CONFIG=SiteConfig.model_validate_json(Path('config/dummy.json').read_text())
def message(letter='a',description=''):
    return {'url':CONFIG.mattermostBaseUrl+'/demo/pl/'+letter*26,'description':description}
def ticket(key,*letters):
    return {'url':key,'mattermostLinks':[message(letter) for letter in letters]}

def legacy_database(path):
    with sqlite3.connect(path) as connection:
        connection.executescript(Path('tests/fixtures/board-v1.sql').read_text())
        connection.execute('INSERT INTO board_meta VALUES(1,7)')
        connection.execute("INSERT INTO columns VALUES('column','Existing',0)")
        for position,(card_id,key) in enumerate([('bound','DEMO-1'),('orphan',None),('empty',None)]):
            connection.execute('INSERT INTO cards VALUES(?,?,?,?,?,?,?,?)',(card_id,'Keep '+card_id,'Shared notes','column',position,3,key,CONFIG.jiraBaseUrl+'/browse/'+key if key else None))
        for link_id,card_id,letter,position in [('first','bound','a',0),('duplicate','bound','a',1),('legacy','orphan','b',0)]:
            connection.execute('INSERT INTO mattermost_links VALUES(?,?,?,?,?,?,?)',(link_id,card_id,letter*26,'demo',message(letter)['url'],'Keep '+link_id,position))
        connection.execute("INSERT INTO audit_events VALUES(1,7,'2026-09-19','card.edit','bound','127.0.0.1')")

@pytest.fixture
def store(tmp_path):
    value=Store(tmp_path/'board.sqlite3',CONFIG);value.initialize();return value

def create(store,jiras):
    return store.create_card(CreateCard(title='Hierarchy',columnId=store.snapshot().columns[0].id,jiraLinks=jiras),'127.0.0.1')

def test_legacy_migration_is_lossless_backed_up_and_idempotent(tmp_path):
    path=tmp_path/'board.sqlite3';legacy_database(path);store=Store(path,CONFIG);store.initialize();board=store.snapshot()
    assert board.revision==7
    bound,orphan,empty=board.cards
    assert [(c.id,c.version,c.notes,c.position) for c in board.cards]==[(name,3,'Shared notes',i) for i,name in enumerate(['bound','orphan','empty'])]
    assert [j.key for j in bound.jiraLinks]==['DEMO-1']
    assert [(m.id,m.position,m.description) for m in bound.jiraLinks[0].mattermostLinks]==[('first',0,'Keep first'),('duplicate',1,'Keep duplicate')]
    assert bound.unassignedMattermostLinks==[] and orphan.jiraLinks==[]
    assert [(m.id,m.postId) for m in orphan.unassignedMattermostLinks]==[('legacy','b'*26)]
    assert empty.jiraLinks==[] and empty.unassignedMattermostLinks==[]
    backups=list(tmp_path.glob('board.sqlite3.pre-v2-*.sqlite3'));assert len(backups)==1
    with sqlite3.connect(backups[0]) as connection:
        assert connection.execute('PRAGMA user_version').fetchone()[0]==1
        assert connection.execute('SELECT COUNT(*) FROM mattermost_links').fetchone()[0]==3
    with sqlite3.connect(path) as connection:
        assert connection.execute('PRAGMA user_version').fetchone()[0]==2
        assert connection.execute('PRAGMA foreign_key_check').fetchall()==[]
        assert connection.execute('SELECT COUNT(*) FROM audit_events').fetchone()[0]==1
    store.initialize();assert store.snapshot()==board;assert list(tmp_path.glob('board.sqlite3.pre-v2-*.sqlite3'))==backups

def test_migration_failure_rolls_back_schema_data_and_version(tmp_path,monkeypatch):
    from app import associations
    path=tmp_path/'board.sqlite3';legacy_database(path)
    original=associations.migrate_legacy
    def fail(connection):
        original(connection);raise RuntimeError('Synthetic migration failure')
    monkeypatch.setattr(associations,'migrate_legacy',fail)
    with pytest.raises(RuntimeError,match='Synthetic migration failure'):Store(path,CONFIG).initialize()
    with sqlite3.connect(path) as connection:
        assert connection.execute('PRAGMA user_version').fetchone()[0]==1
        assert connection.execute('SELECT COUNT(*) FROM mattermost_links').fetchone()[0]==3
        assert connection.execute("SELECT jira_key FROM cards WHERE id='bound'").fetchone()[0]=='DEMO-1'
        assert not connection.execute("SELECT name FROM sqlite_master WHERE name IN ('jira_links','legacy_mattermost_links')").fetchall()

def test_nested_links_order_move_and_atomic_failure(store):
    board=create(store,[ticket('demo-1','a','b'),ticket('DEMO-2','l')]);card=board.cards[0]
    assert [(j.key,j.position,[m.postId for m in j.mattermostLinks]) for j in card.jiraLinks]==[('DEMO-1',0,['a'*26,'b'*26]),('DEMO-2',1,['l'*26])]
    board=store.edit_card(card.id,EditCard(expectedVersion=1,jiraLinks=[ticket('DEMO-2','b','l'),ticket('DEMO-1','a')]),'127.0.0.1')
    assert [j.key for j in board.cards[0].jiraLinks]==['DEMO-2','DEMO-1']
    assert [m.postId for m in board.cards[0].jiraLinks[0].mattermostLinks]==['b'*26,'l'*26]
    invalid=[ticket('DEMO-3'),{'url':'DEMO-1','mattermostLinks':[message(),{'url':'https://other.invalid/demo/pl/'+'a'*26}]}]
    with pytest.raises(StoreError,match='invalid_link'):
        store.edit_card(card.id,EditCard(expectedVersion=2,title='Must roll back',jiraLinks=invalid),'127.0.0.1')
    assert store.snapshot()==board
    with pytest.raises(StoreError,match='conflict'):
        store.edit_card(card.id,EditCard(expectedVersion=1,jiraLinks=[]),'127.0.0.1')
    assert store.snapshot()==board
    changed=store.edit_card(card.id,EditCard(expectedVersion=2,notes='Notes only'),'127.0.0.1')
    assert changed.cards[0].jiraLinks==board.cards[0].jiraLinks

def test_duplicate_jira_and_limits_reject_without_changes(store):
    for links in [[ticket('demo-1'),ticket(CONFIG.jiraBaseUrl+'/browse/DEMO-1')],[ticket('DEMO-'+str(i+1),*('a'*20)) for i in range(6)]]:
        before=store.snapshot()
        with pytest.raises((StoreError,ValidationError)):create(store,links)
        assert store.snapshot()==before
    with pytest.raises(ValidationError):create(store,[ticket('DEMO-'+str(i+1)) for i in range(21)])
    with pytest.raises(ValidationError):create(store,[ticket('DEMO-1',*('a'*21))])

def test_legacy_unassigned_can_only_be_retained_or_assigned_not_fabricated(tmp_path):
    path=tmp_path/'board.sqlite3';legacy_database(path);store=Store(path,CONFIG);store.initialize();before=store.snapshot();card=before.cards[1];link=card.unassignedMattermostLinks[0]
    legacy={'id':link.id,'url':link.url,'description':'Updated shared note'}
    board=store.edit_card(card.id,EditCard(expectedVersion=3,unassignedMattermostLinks=[legacy]),'127.0.0.1')
    assert board.cards[1].unassignedMattermostLinks[0].id==link.id
    for patch in [{**legacy,'id':'invented'},{**legacy,'url':message('a')['url']},legacy]:
        target=before.cards[0] if patch==legacy else board.cards[1]
        with pytest.raises(StoreError,match='invalid_link'):
            store.edit_card(target.id,EditCard(expectedVersion=target.version,unassignedMattermostLinks=[patch]),'127.0.0.1')
    board=store.edit_card(card.id,EditCard(expectedVersion=4,jiraLinks=[ticket('DEMO-3','b')],unassignedMattermostLinks=[]),'127.0.0.1')
    assert board.cards[1].unassignedMattermostLinks==[] and board.cards[1].jiraLinks[0].mattermostLinks[0].url==link.url

def test_old_flat_writes_and_private_nested_data_are_rejected(store):
    for payload in [{'jiraUrl':'DEMO-1'},{'mattermostLinks':[message()]}]:
        with pytest.raises(ValidationError):CreateCard(title='Legacy',columnId='column',**payload)
        with pytest.raises(ValidationError):EditCard(expectedVersion=1,**payload)
    with pytest.raises(ValidationError):CreateCard(title='Invalid',columnId='column',jiraLinks=[{'url':'DEMO-1','summary':'Private'}])
    with pytest.raises(ValidationError):CreateCard(title='Invalid',columnId='column',jiraLinks=[{'url':'DEMO-1','mattermostLinks':[{**message(),'preview':'Private'}]}])
    with pytest.raises(ValidationError):CreateCard(title='Invalid',columnId='column',unassignedMattermostLinks=[message()])

def test_database_enforces_same_card_parent_and_cascades_only_bound_messages(tmp_path):
    path=tmp_path/'board.sqlite3';legacy_database(path);store=Store(path,CONFIG);store.initialize()
    bound,orphan,_=store.snapshot().cards
    with store.connection() as connection:
        with pytest.raises(sqlite3.IntegrityError):
            connection.execute('UPDATE mattermost_links SET jira_link_id=? WHERE id=?',(bound.jiraLinks[0].id,orphan.unassignedMattermostLinks[0].id))
        connection.execute('DELETE FROM jira_links WHERE id=?',(bound.jiraLinks[0].id,))
        assert connection.execute('SELECT id FROM mattermost_links').fetchall()[0][0]=='legacy'
        assert connection.execute('SELECT COUNT(*) FROM mattermost_links').fetchone()[0]==1
