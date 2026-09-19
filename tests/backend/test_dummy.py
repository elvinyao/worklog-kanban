import httpx
import pytest
import time
from concurrent.futures import ThreadPoolExecutor

from conftest import actor

PUBLIC = 'a' * 26
PRIVATE = 'b' * 26
USER = 'u' * 26
CHANNEL = 'c' * 26


def test_jira_requires_a_session_and_marks_dummy(jira_service):
    with actor(jira_service) as client:
        page = client.get('/jira/__dummy/')
        assert page.status_code == 200
        assert '模拟环境' in page.text
        response = client.get('/jira/rest/api/2/issue/DEMO-1')
        assert response.status_code == 401
        assert response.headers['cache-control'] == 'no-store'


def test_host_only_cookie_and_identity_is_not_a_request_parameter(jira_service):
    with actor(jira_service) as client:
        response = client.post('/jira/__dummy/session', json={'identity': 'alice'})
        assert response.status_code == 200
        cookie = response.headers['set-cookie'].lower()
        assert 'httponly' in cookie and 'domain=' not in cookie
        assert client.get('/jira/rest/api/2/issue/DEMO-2').status_code == 200
        assert client.get('/jira/rest/api/2/issue/DEMO-2?user=bob').status_code == 400
        assert client.get('/jira/rest/api/2/issue/DEMO-2', headers={'X-Dummy-User': 'bob'}).status_code == 400


def test_permissions_filter_before_comment_pagination(jira_service):
    all_comments = {}
    for identity, expected_total in [('alice', 54), ('bob', 53)]:
        with actor(jira_service, identity, '/jira') as client:
            issue = client.get('/jira/rest/api/2/issue/DEMO-1').json()
            assert issue['key'] == 'DEMO-1'
            assert set(issue['fields']) == {'summary', 'assignee', 'status'}
            comments, start = [], 0
            while True:
                response = client.get('/jira/rest/api/2/issue/DEMO-1/comment', params={'startAt': start, 'maxResults': 50})
                assert response.status_code == 200
                page = response.json()
                assert page['maxResults'] == 7
                assert page['total'] == expected_total
                assert page['startAt'] == start
                assert page['comments'], 'Pagination must advance while comments remain'
                assert all(isinstance(c['body'], str) for c in page['comments'])
                comments.extend(page['comments'])
                start += len(page['comments'])
                if start == page['total']:
                    break
                assert start < page['total']
            all_comments[identity] = comments
            private = client.get('/jira/rest/api/2/issue/DEMO-2')
            assert private.status_code == (200 if identity == 'alice' else 404)
            assert client.get('/jira/rest/api/2/issue/DOES-NOT-EXIST').status_code == 404
    newest = {who: max(rows, key=lambda row: row['created']) for who, rows in all_comments.items()}
    assert newest['alice']['id'] != newest['bob']['id']
    assert 'ALICE_ONLY_MARKER' in newest['alice']['body']
    assert 'ALICE_ONLY_MARKER' not in str(all_comments['bob'])
    assert max(all_comments['bob'], key=lambda row: row['updated'])['id'] == '1'


def test_empty_ticket_and_reject_business_writes(jira_service):
    with actor(jira_service, 'alice', '/jira') as client:
        assert client.get('/jira/rest/api/2/issue/DEMO-3').json()['fields']['assignee'] is None
        assert client.get('/jira/rest/api/2/issue/DEMO-3/comment').json()['comments'] == []
        assert client.post('/jira/rest/api/2/issue/DEMO-1', json={'fields': {}}).status_code == 405
        stats = client.post('/jira/__dummy/inspect', json={}).json()
        assert any(r['method'] == 'POST' and '/rest/' in r['path'] for r in stats['requests'])
        assert all(set(r) == {'method', 'path'} for r in stats['requests'])
        assert 'controls' in stats
        assert any(r['path'] == '/jira/__dummy/session' for r in stats['controls'])
        assert all(r['method'] == 'POST' and '/__dummy/' in r['path'] for r in stats['controls'])


@pytest.mark.parametrize('fault,status', [('unauthorized',401),('forbidden',403),('not-found',404),('rate-limit',429),('login-html',200),('malformed',200),('redirect',302)])
def test_synthetic_faults_are_controlled_by_the_source_session(jira_service, fault, status):
    with actor(jira_service, 'alice', '/jira') as client:
        assert client.post('/jira/__dummy/fault', json={'fault': fault}).status_code == 200
        response = client.get('/jira/rest/api/2/issue/DEMO-1')
        assert response.status_code == status
        assert response.headers['cache-control'] == 'no-store'
        if fault == 'rate-limit':
            assert response.headers['retry-after'] == '2'
        if fault == 'redirect':
            assert response.headers['location'].startswith('http://untrusted.localhost:4190/')
        if fault == 'login-html':
            assert 'text/html' in response.headers['content-type']
        if fault == 'malformed':
            with pytest.raises(ValueError):
                response.json()


def test_controls_reject_foreign_origins_and_logout_revokes_session(jira_service):
    with actor(jira_service, 'alice', '/jira') as client:
        assert client.post('/jira/__dummy/fault', json={'fault':'none'}, headers={'Origin':'http://board.localhost:4173'}).status_code == 403
        assert client.post('/jira/__dummy/fault', json={'fault':'none'}, headers={'Host':'evil.localhost'}).status_code == 403
        assert client.get('/jira/__dummy/session?identity=bob').status_code == 405
        assert client.post('/jira/__dummy/session', json={'identity':'none'}).status_code == 200
        assert client.get('/jira/rest/api/2/issue/DEMO-1').status_code == 401


def test_mattermost_posts_users_channel_and_avatar(mm_service):
    with actor(mm_service, 'alice') as alice, actor(mm_service, 'bob') as bob:
        post = alice.get(f'/api/v4/posts/{PUBLIC}').json()
        assert post['id'] == PUBLIC and post['user_id'] == USER and post['channel_id'] == CHANNEL
        assert isinstance(post['create_at'], int)
        assert alice.get(f'/api/v4/posts/{PRIVATE}').status_code == 200
        assert bob.get(f'/api/v4/posts/{PRIVATE}').status_code == 404
        assert alice.get(f'/api/v4/users/{USER}').json()['username'] == 'demo-author'
        assert alice.get(f'/api/v4/channels/{CHANNEL}').json()['display_name'] == '模拟团队'
        avatar = alice.get(f'/api/v4/users/{USER}/image')
        assert avatar.content.startswith(b'\x89PNG') and avatar.headers['cache-control'] == 'no-store'
        assert alice.get(f'/api/v4/posts/{PUBLIC}/thread').status_code == 404
        assert alice.post('/api/v4/posts', json={'message':'should not be sent'}).status_code in (404,405)
        assert alice.post('/__dummy/fault', json={'fault':'avatar-failure'}).status_code == 200
        assert alice.get(f'/api/v4/users/{USER}/image').status_code == 404
        assert alice.get(f'/api/v4/posts/{PUBLIC}').status_code == 200


def test_fault_state_is_per_session_and_pagination_stall_is_explicit(jira_service):
    with actor(jira_service, 'alice', '/jira') as alice, actor(jira_service, 'bob', '/jira') as bob:
        assert alice.post('/jira/__dummy/fault', json={'fault':'pagination-stall'}).status_code == 200
        page = alice.get('/jira/rest/api/2/issue/DEMO-1/comment').json()
        assert page['comments'] == [] and page['total'] == 54
        assert bob.get('/jira/rest/api/2/issue/DEMO-1/comment').json()['comments']
        assert alice.post('/jira/__dummy/fault', json={'fault':'none','page_size':3}).status_code == 200
        assert len(alice.get('/jira/rest/api/2/issue/DEMO-1/comment').json()['comments']) == 3


def test_delay_and_actual_transport_failure(jira_service):
    with actor(jira_service, 'alice', '/jira') as client:
        assert client.post('/jira/__dummy/fault', json={'fault':'delay','delay_ms':100}).status_code == 200
        start = time.monotonic()
        assert client.get('/jira/rest/api/2/issue/DEMO-1').status_code == 200
        assert time.monotonic() - start >= 0.08
        assert client.post('/jira/__dummy/fault', json={'fault':'connection'}).status_code == 200
        with pytest.raises(httpx.RemoteProtocolError):
            client.get('/jira/rest/api/2/issue/DEMO-1')
        assert client.post('/jira/__dummy/fault', json={'fault':'none'}).status_code == 200
        assert client.get('/jira/rest/api/2/issue/DEMO-1').status_code == 200


@pytest.mark.parametrize('fault,path', [('missing-user', f'/api/v4/users/{USER}'), ('missing-channel', f'/api/v4/channels/{CHANNEL}')])
def test_mattermost_metadata_failure_keeps_post_readable(mm_service, fault, path):
    with actor(mm_service, 'alice') as client:
        assert client.post('/__dummy/fault', json={'fault':fault}).status_code == 200
        assert client.get(path).status_code == 404
        assert client.get(f'/api/v4/posts/{PUBLIC}').status_code == 200


@pytest.mark.parametrize('path', [f'/api/v4/users/{USER}', f'/api/v4/channels/{CHANNEL}', f'/api/v4/users/{USER}/image'])
def test_logout_during_delayed_metadata_read_is_not_a_server_error(mm_service, path):
    with actor(mm_service, 'alice') as client, ThreadPoolExecutor(max_workers=1) as pool:
        assert client.post('/__dummy/fault', json={'fault':'delay','delay_ms':500}).status_code == 200
        pending = pool.submit(client.get, path)
        deadline = time.monotonic() + 2
        while True:
            rows = client.post('/__dummy/inspect', json={}).json()['requests']
            if any(row['path'] == path for row in rows):
                break
            assert time.monotonic() < deadline
            time.sleep(0.01)
        assert client.post('/__dummy/session', json={'identity':'none'}).status_code == 200
        assert pending.result(timeout=3).status_code == 401
