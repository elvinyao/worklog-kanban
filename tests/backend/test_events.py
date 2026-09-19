import asyncio
import json
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from threading import Event
from types import SimpleNamespace

import httpx
from conftest import running_service

from app.config import SiteConfig
from app.events import EventHub, WriteCoordinator
from app.schemas import CreateCard
from app.store import Store

CONFIG=SiteConfig.model_validate_json(Path('config/dummy.json').read_text())


def test_initial_revision_overflow_disconnect_and_cleanup():
    async def scenario():
        hub=EventHub(revision=7,queue_size=2)
        stream=hub.stream()
        assert await anext(stream)==7
        assert len(hub.subscribers)==1
        hub.publish(8)
        assert await anext(stream)==8
        hub.publish(9);hub.publish(10);hub.publish(11)
        try:
            await anext(stream)
        except StopAsyncIteration:
            pass
        else:
            raise AssertionError('Slow subscriber must close and resynchronize')
        assert len(hub.subscribers)==0
        current=hub.stream()
        assert await anext(current)==11
        await current.aclose()
        assert len(hub.subscribers)==0
    asyncio.run(scenario())


def test_route_generator_closes_subscription_immediately_when_disconnected():
    from app.api import events
    async def scenario():
        hub=EventHub()
        request=SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace(events=hub)))
        route=events(request)
        assert (await anext(route)).id=='0'
        assert len(hub.subscribers)==1
        await route.aclose()
        assert len(hub.subscribers)==0
    asyncio.run(scenario())


def test_real_http_sse_two_clients_order_and_reconnect(tmp_path):
    def environment(origin):
        config=CONFIG.model_copy(update={'boardOrigin':origin})
        file=tmp_path/'sites.json';file.write_text(config.model_dump_json())
        return {'WORKLOG_CONFIG':str(file),'WORKLOG_DATABASE':str(tmp_path/'board.sqlite3')}
    def event(iterator):
        for line in iterator:
            if line.startswith('data:'):
                payload=json.loads(line.removeprefix('data:').strip())
                assert set(payload)=={'revision'}
                return payload['revision']
        raise AssertionError('SSE ended before revision')
    with running_service('app.main','board.localhost',environment) as (url,origin):
        headers={'Host':origin.removeprefix('http://'),'Origin':origin,'X-Worklog-Request':'1'}
        with httpx.Client(base_url=url,headers=headers,timeout=5,trust_env=False) as a, httpx.Client(base_url=url,headers=headers,timeout=5,trust_env=False) as b:
            with a.stream('GET','/api/events') as first,b.stream('GET','/api/events') as second:
                assert first.status_code==second.status_code==200
                assert first.headers['content-type'].startswith('text/event-stream')
                left,right=first.iter_lines(),second.iter_lines()
                assert event(left)==event(right)==0
                column=a.get('/api/board').json()['columns'][0]['id']
                def write(title):
                    with httpx.Client(base_url=url,headers=headers,timeout=5,trust_env=False) as writer:
                        response=writer.post('/api/cards',json={'title':title,'columnId':column})
                        assert response.status_code==200
                        return response.json()['revision']
                with ThreadPoolExecutor(max_workers=2) as executor:
                    revisions=list(executor.map(write,['shared A','shared B']))
                assert sorted(revisions)==[1,2]
                assert [event(left),event(left)]==[1,2]
                assert [event(right),event(right)]==[1,2]
                assert a.get('/api/board').json()['revision']==2
            with a.stream('GET','/api/events',headers={'Last-Event-ID':'0'}) as reconnected:
                assert event(reconnected.iter_lines())==2


def test_cancelled_write_finishes_commit_and_notification_before_next_write(tmp_path):
    store=Store(tmp_path/'board.sqlite3',CONFIG);store.initialize()
    column=store.snapshot().columns[0].id
    entered,release,second_started=Event(),Event(),Event()
    async def scenario():
        hub=EventHub()
        coordinator=WriteCoordinator(hub)
        stream=hub.stream()
        assert await anext(stream)==0
        def first_write():
            entered.set()
            if not release.wait(3):
                raise AssertionError('Event loop failed to release database work')
            return store.create_card(CreateCard(title='A',columnId=column),'127.0.0.1')
        def second_write():
            second_started.set()
            return store.create_card(CreateCard(title='B',columnId=column),'127.0.0.1')
        first=asyncio.create_task(coordinator.run(first_write,'card.create','127.0.0.1'))
        await asyncio.wait_for(asyncio.to_thread(entered.wait),1)
        first.cancel()
        second=asyncio.create_task(coordinator.run(second_write,'card.create','127.0.0.1'))
        await asyncio.sleep(.03)
        assert not first.done()
        assert not second_started.is_set()
        release.set()
        try:
            await first
        except asyncio.CancelledError:
            pass
        else:
            raise AssertionError('Request cancellation must remain cancellation')
        assert (await second).revision==2
        assert [await anext(stream),await anext(stream)]==[1,2]
        assert store.snapshot().revision==2
        await stream.aclose()
        await coordinator.close()
    asyncio.run(scenario())
