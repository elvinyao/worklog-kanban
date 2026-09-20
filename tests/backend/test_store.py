import sqlite3
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from threading import Barrier

import pytest

from app.config import SiteConfig
from app.schemas import ChangeColumn, CreateCard, DeleteColumn, EditCard, MoveCard, ReorderColumns
from app.store import Store, StoreError

CONFIG = SiteConfig.model_validate_json(Path('config/dummy.json').read_text())


@pytest.fixture
def store(tmp_path):
    value = Store(tmp_path / 'board.sqlite3', CONFIG)
    value.initialize()
    return value


def create(store, title='合成卡片', column=None, **fields):
    column = column or store.snapshot().columns[0].id
    return store.create_card(CreateCard(title=title, columnId=column, **fields), '127.0.0.1')


def test_initial_columns_and_restart_preserve_changes(store):
    initial = store.snapshot()
    assert initial.revision == 0
    assert [c.name for c in initial.columns] == ['待处理','调查中','实装中','单体测试','结合测试','完成']
    changed = create(store)
    reopened = Store(store.path, CONFIG)
    reopened.initialize()
    assert reopened.snapshot() == changed


def test_only_unmodified_seed_columns_have_localized_labels(store):
    initial=store.snapshot()
    assert [c.defaultNameKey for c in initial.columns]==['todo','investigating','implementing','unitTesting','integrationTesting','done']
    changed=store.create_column(ChangeColumn(name='完成',expectedBoardRevision=0),'127.0.0.1')
    assert changed.columns[-1].defaultNameKey is None
    first=changed.columns[0]
    renamed=store.rename_column(first.id,ChangeColumn(name=first.name,expectedBoardRevision=changed.revision),'127.0.0.1')
    assert renamed.columns[0].defaultNameKey is None
    reversed_board=store.reorder_columns(ReorderColumns(columnIds=[c.id for c in reversed(renamed.columns)],expectedBoardRevision=renamed.revision),'127.0.0.1')
    assert next(c for c in reversed_board.columns if c.id==initial.columns[-1].id).defaultNameKey=='done'
    reopened=Store(store.path,CONFIG);reopened.initialize()
    assert reopened.snapshot()==reversed_board


def test_links_normalize_without_overwriting_shared_notes(store):
    board = create(store, notes='共享笔记', jiraLinks=[{'url':'demo-1','mattermostLinks':[{'url':CONFIG.mattermostBaseUrl+'/demo/pl/'+'a'*26,'description':'共享说明'}]}])
    card = board.cards[0]
    assert card.title == '合成卡片'
    assert card.jiraLinks[0].key == 'DEMO-1'
    assert card.jiraLinks[0].mattermostLinks[0].postId == 'a'*26
    changed = store.edit_card(card.id, EditCard(expectedVersion=card.version,jiraLinks=[]), '127.0.0.1')
    assert changed.cards[0].notes == '共享笔记'
    assert changed.cards[0].jiraLinks == []
    assert changed.cards[0].unassignedMattermostLinks == []


def test_stale_card_edits_conflict_but_unrelated_edits_succeed(store):
    first = create(store, '第一张').cards[0]
    second = create(store, '第二张').cards[1]
    store.edit_card(first.id, EditCard(expectedVersion=1,notes='新笔记'), '127.0.0.1')
    before = store.snapshot()
    with pytest.raises(StoreError, match='conflict'):
        store.edit_card(first.id, EditCard(expectedVersion=1,notes='旧草稿'), '127.0.0.1')
    assert store.snapshot() == before
    store.edit_card(second.id, EditCard(expectedVersion=1,notes='独立编辑'), '127.0.0.1')
    assert [c.notes for c in store.snapshot().cards] == ['新笔记','独立编辑']


def test_move_is_atomic_and_positions_remain_unique(store):
    for title in ['A','B','C']:
        create(store, title)
    board = store.snapshot()
    first, second = board.columns[:2]
    moved = store.move_card(board.cards[1].id, MoveCard(targetColumnId=second.id,index=0,expectedBoardRevision=board.revision), '127.0.0.1')
    assert [(c.title,c.position) for c in moved.cards if c.columnId == first.id] == [('A',0),('C',1)]
    assert [(c.title,c.position) for c in moved.cards if c.columnId == second.id] == [('B',0)]
    before = store.snapshot()
    with pytest.raises(StoreError, match='conflict'):
        store.move_card(board.cards[0].id, MoveCard(targetColumnId=second.id,index=0,expectedBoardRevision=board.revision), '127.0.0.1')
    assert store.snapshot() == before


def test_column_migration_preserves_order_and_keeps_one_column(store):
    board = store.snapshot()
    source, target = board.columns[:2]
    create(store,'A',source.id); create(store,'B',source.id); create(store,'Z',target.id)
    board = store.delete_column(source.id, DeleteColumn(targetColumnId=target.id,expectedBoardRevision=store.snapshot().revision), '127.0.0.1')
    assert [c.title for c in board.cards if c.columnId == target.id] == ['Z','A','B']
    while len(board.columns)>1:
        board=store.delete_column(board.columns[-1].id, DeleteColumn(targetColumnId=target.id,expectedBoardRevision=board.revision), '127.0.0.1')
    with pytest.raises(StoreError, match='last_column'):
        store.delete_column(target.id, DeleteColumn(targetColumnId=target.id,expectedBoardRevision=board.revision), '127.0.0.1')
    assert store.snapshot() == board


def test_columns_create_rename_and_full_reorder(store):
    board = store.create_column(ChangeColumn(name='验收',expectedBoardRevision=0), '127.0.0.1')
    added = board.columns[-1]
    board = store.rename_column(added.id, ChangeColumn(name='待验收',expectedBoardRevision=board.revision), '127.0.0.1')
    ids = [c.id for c in reversed(board.columns)]
    board = store.reorder_columns(ReorderColumns(columnIds=ids,expectedBoardRevision=board.revision), '127.0.0.1')
    assert [c.id for c in board.columns] == ids
    assert board.columns[0].name == '待验收'
    with pytest.raises(StoreError, match='invalid_columns'):
        store.reorder_columns(ReorderColumns(columnIds=ids[:-1],expectedBoardRevision=board.revision), '127.0.0.1')
    assert store.snapshot() == board


def test_two_independent_connections_cannot_overwrite_one_version(store):
    card = create(store).cards[0]
    other = Store(store.path, CONFIG)
    barrier = Barrier(2)
    def write(instance, text):
        barrier.wait()
        try:
            return instance.edit_card(card.id, EditCard(expectedVersion=1,notes=text), '127.0.0.1').revision
        except StoreError as error:
            return error.code
    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(lambda pair:write(*pair), [(store,'A'),(other,'B')]))
    assert sorted(results,key=str) == [2,'conflict']
    assert store.snapshot().cards[0].version == 2


def test_invalid_link_or_move_rolls_back_everything(store):
    before=store.snapshot()
    with pytest.raises(StoreError, match='invalid_link'):
        create(store,jiraLinks=[{'url':'https://evil.invalid/browse/DEMO-1'}])
    assert store.snapshot() == before
    board=create(store)
    with pytest.raises(StoreError, match='invalid_position'):
        store.move_card(board.cards[0].id, MoveCard(targetColumnId=board.columns[1].id,index=9,expectedBoardRevision=board.revision), '127.0.0.1')
    assert store.snapshot() == board


def test_audit_contains_only_metadata_and_foreign_keys_are_enforced(store):
    create(store, title='SHARED_TITLE', notes='SHARED_NOTE')
    with sqlite3.connect(store.path) as connection:
        connection.execute('PRAGMA foreign_keys=ON')
        audit = connection.execute('SELECT * FROM audit_events').fetchall()
        assert len(audit) == 1
        assert 'SHARED_TITLE' not in str(audit) and 'SHARED_NOTE' not in str(audit)
        fields = [r[1] for r in connection.execute('PRAGMA table_info(cards)')]
        assert not {'summary','comment','cookie','avatar','author'} & set(fields)
        with pytest.raises(sqlite3.IntegrityError):
            connection.execute("UPDATE cards SET column_id='missing'")
        assert connection.execute('PRAGMA foreign_key_check').fetchall() == []


def test_failure_after_content_update_rolls_back_version_revision_links_and_audit(store):
    before=create(store, notes='保留笔记',jiraLinks=[{'url':'DEMO-1','mattermostLinks':[{'url':CONFIG.mattermostBaseUrl+'/demo/pl/'+'a'*26}]}])
    card=before.cards[0]
    with pytest.raises(StoreError,match='invalid_link'):
        store.edit_card(card.id,EditCard(expectedVersion=card.version,notes='不应提交',jiraLinks=[{'url':'DEMO-1','mattermostLinks':[{'url':'https://evil.invalid/demo/pl/'+'a'*26}]}]),'127.0.0.1')
    assert store.snapshot()==before
    with sqlite3.connect(store.path) as connection:
        assert connection.execute('SELECT COUNT(*) FROM audit_events').fetchone()[0]==before.revision


def test_same_column_reorder_and_link_order_are_stable(store):
    for title in ['A','B','C']:
        create(store,title)
    before=store.snapshot()
    first=before.cards[0]
    changed=store.move_card(first.id,MoveCard(targetColumnId=first.columnId,index=2,expectedBoardRevision=before.revision),'127.0.0.1')
    assert [(c.title,c.position) for c in changed.cards]==[('B',0),('C',1),('A',2)]
    card=changed.cards[-1]
    links=[{'url':CONFIG.mattermostBaseUrl+'/demo/pl/'+letter*26,'description':letter} for letter in ['b','a']]
    changed=store.edit_card(card.id,EditCard(expectedVersion=card.version,jiraLinks=[{'url':'DEMO-1','mattermostLinks':links}]),'127.0.0.1')
    assert [(v.postId,v.position) for v in changed.cards[-1].jiraLinks[0].mattermostLinks]==[('b'*26,0),('a'*26,1)]
