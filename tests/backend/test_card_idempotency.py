from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.schemas import CreateCard
from app.store import Store, StoreError
from test_api import client, CONFIG, HEADERS


def request(board, **changes):
    return {'requestId': 'create-one', 'title': 'Shared task', 'columnId': board['columns'][0]['id'], **changes}


def test_create_replay_returns_current_board_without_revision_or_notification(client):
    data = request(client.get('/api/board').json())
    first = client.post('/api/cards', headers=HEADERS, json=data)
    assert first.status_code == 200
    card = first.json()['cards'][0]
    current = client.patch('/api/cards/' + card['id'], headers=HEADERS, json={'expectedVersion': 1, 'notes': 'Later edit'}).json()
    hub = client.app.state.events
    replay = client.post('/api/cards', headers=HEADERS, json={**data, 'notes': '', 'jiraLinks': []})
    assert replay.status_code == 200 and replay.json() == current
    assert hub.revision == current['revision'] == 2
    with client.app.state.store.connection() as connection:
        assert connection.execute("SELECT COUNT(*) FROM audit_events WHERE action='card.create'").fetchone()[0] == 1
        assert connection.execute('SELECT COUNT(*) FROM create_card_requests').fetchone()[0] == 1
    next_create = client.post('/api/cards', headers=HEADERS, json={**data, 'requestId': 'create-two'})
    assert next_create.status_code == 200
    assert next_create.json()['revision'] == hub.revision == 3
    assert len(next_create.json()['cards']) == 2


@pytest.mark.parametrize('changed_field', ['title', 'notes', 'columnId', 'jiraLinks'])
def test_reused_create_id_rejects_changed_payload_without_changes(client, changed_field):
    initial = client.get('/api/board').json()
    data = request(initial)
    first = client.post('/api/cards', headers=HEADERS, json=data).json()
    changes = {'title': 'Other task', 'notes': 'Other note', 'columnId': initial['columns'][1]['id'], 'jiraLinks': [{'url': 'DEMO-1'}]}
    rejected = client.post('/api/cards', headers=HEADERS, json={**data, changed_field: changes[changed_field]})
    assert rejected.status_code == 409
    assert rejected.json() == {'code': 'request_conflict', 'fields': []}
    assert client.get('/api/board').json() == first


def test_legacy_create_without_request_id_still_creates_separate_cards(client):
    data = request(client.get('/api/board').json())
    del data['requestId']
    assert client.post('/api/cards', headers=HEADERS, json=data).status_code == 200
    second = client.post('/api/cards', headers=HEADERS, json={**data, 'requestId': None})
    assert second.status_code == 200
    assert second.json()['revision'] == len(second.json()['cards']) == 2


def test_create_replay_survives_application_restart(tmp_path):
    database = tmp_path / 'board.sqlite3'
    with TestClient(create_app(config=CONFIG, database=database), base_url=CONFIG.boardOrigin) as first_client:
        data = request(first_client.get('/api/board').json())
        first = first_client.post('/api/cards', headers=HEADERS, json=data).json()
    with TestClient(create_app(config=CONFIG, database=database), base_url=CONFIG.boardOrigin) as restarted:
        replay = restarted.post('/api/cards', headers=HEADERS, json=data)
        assert replay.status_code == 200 and replay.json() == first
        assert restarted.app.state.events.revision == first['revision'] == 1


def test_failed_create_rolls_back_idempotency_record_and_allows_retry(client, monkeypatch):
    before = client.get('/api/board').json()
    data = request(before)
    store = client.app.state.store
    original = store._snapshot

    def fail_after_record(connection):
        assert connection.execute('SELECT COUNT(*) FROM create_card_requests').fetchone()[0] == 1
        raise RuntimeError('Synthetic failure before commit')

    monkeypatch.setattr(store, '_snapshot', fail_after_record)
    assert client.post('/api/cards', headers=HEADERS, json=data).status_code == 500
    monkeypatch.setattr(store, '_snapshot', original)
    assert client.get('/api/board').json() == before
    with store.connection() as connection:
        assert connection.execute('SELECT COUNT(*) FROM create_card_requests').fetchone()[0] == 0
        assert connection.execute('SELECT COUNT(*) FROM audit_events').fetchone()[0] == 0
    retried = client.post('/api/cards', headers=HEADERS, json=data)
    assert retried.status_code == 200
    assert retried.json()['revision'] == len(retried.json()['cards']) == 1


@pytest.mark.parametrize('different_payload', [False, True])
def test_concurrent_create_id_is_committed_at_most_once(tmp_path, different_payload):
    store = Store(tmp_path / 'board.sqlite3', CONFIG)
    store.initialize()
    column = store.snapshot().columns[0].id
    barrier = Barrier(2)

    def create(index):
        independent = Store(store.path, CONFIG)
        data = CreateCard(requestId='concurrent-create', title=str(index) if different_payload else 'Same task', columnId=column)
        barrier.wait()
        try:
            return independent.create_card(data, '127.0.0.1').committed
        except StoreError as error:
            return error.code

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(create, range(2)))
    assert results.count(True) == 1
    expected_other = 'request_conflict' if different_payload else False
    assert results.count(expected_other) == 1
    board = store.snapshot()
    assert board.revision == len(board.cards) == 1
    with store.connection() as connection:
        assert connection.execute('SELECT COUNT(*) FROM create_card_requests').fetchone()[0] == 1


def test_create_replay_does_not_recreate_archived_card_or_require_old_column(client):
    initial = client.get('/api/board').json()
    done_column = initial['columns'][-1]['id']
    data = request(initial, columnId=done_column)
    created = client.post('/api/cards', headers=HEADERS, json=data).json()
    archived = client.post('/api/archives', headers=HEADERS, json={
        'requestId': 'archive-one', 'name': 'Completed', 'expectedBoardRevision': created['revision'], 'cardIds': [created['cards'][0]['id']],
    })
    assert archived.status_code == 200
    deleted = client.request('DELETE', '/api/columns/' + done_column, headers=HEADERS, json={
        'expectedBoardRevision': archived.json()['board']['revision'], 'targetColumnId': initial['columns'][0]['id'],
    })
    assert deleted.status_code == 200
    replay = client.post('/api/cards', headers=HEADERS, json=data)
    assert replay.status_code == 200 and replay.json() == deleted.json()
    assert replay.json()['cards'] == [] and replay.json()['archiveCount'] == 1
    assert client.app.state.events.revision == deleted.json()['revision']


def test_existing_v3_database_adds_create_request_table_without_rewriting_data(tmp_path):
    store = Store(tmp_path / 'board.sqlite3', CONFIG)
    store.initialize()
    before = store.create_card(CreateCard(title='Existing task', columnId=store.snapshot().columns[0].id), '127.0.0.1')
    with store.connection() as connection:
        connection.execute('DROP TABLE create_card_requests')
    reopened = Store(store.path, CONFIG)
    reopened.initialize()
    assert reopened.snapshot() == before
    with reopened.connection() as connection:
        assert connection.execute('PRAGMA user_version').fetchone()[0] == 3
        assert connection.execute('SELECT COUNT(*) FROM create_card_requests').fetchone()[0] == 0
    assert not list(tmp_path.glob('*.pre-v3-*.sqlite3'))
