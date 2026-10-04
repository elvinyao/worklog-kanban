import pytest

from test_api import client, HEADERS


def test_column_create_replay_survives_changes_and_deletion(client):
    initial = client.get('/api/board').json()
    data = {'requestId': 'column-once', 'name': 'Once', 'expectedBoardRevision': initial['revision']}
    first = client.post('/api/columns', headers=HEADERS, json=data).json()
    column = first['columns'][-1]
    renamed = client.patch('/api/columns/' + column['id'], headers=HEADERS, json={
        'name': 'Renamed', 'expectedBoardRevision': first['revision'],
    }).json()
    assert client.post('/api/columns', headers=HEADERS, json=data).json() == renamed
    deleted = client.request('DELETE', '/api/columns/' + column['id'], headers=HEADERS, json={
        'targetColumnId': initial['columns'][0]['id'], 'expectedBoardRevision': renamed['revision'],
    }).json()
    assert client.post('/api/columns', headers=HEADERS, json=data).json() == deleted
    assert client.app.state.events.revision == deleted['revision']


@pytest.mark.parametrize('change', [{'name': 'Other'}, {'expectedBoardRevision': 1}])
def test_column_request_id_cannot_be_reused_for_another_payload(client, change):
    data = {'requestId': 'column-once', 'name': 'Once', 'expectedBoardRevision': 0}
    first = client.post('/api/columns', headers=HEADERS, json=data).json()
    assert client.post('/api/columns', headers=HEADERS, json={**data, **change}).status_code == 409
    assert client.get('/api/board').json() == first


def test_rejected_column_create_can_retry_same_id(client):
    data = {'requestId': 'column-once', 'name': 'Once', 'expectedBoardRevision': 99}
    assert client.post('/api/columns', headers=HEADERS, json=data).status_code == 409
    data['expectedBoardRevision'] = 0
    assert client.post('/api/columns', headers=HEADERS, json=data).status_code == 200
