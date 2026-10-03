import asyncio
from collections.abc import Callable
import logging

from app.schemas import BoardSnapshot
from app.write_result import WriteResult

logger = logging.getLogger('worklog')


class EventHub:
    def __init__(self, revision=0, queue_size=32):
        self.revision = revision
        self.queue_size = queue_size
        self.subscribers: set[asyncio.Queue] = set()

    async def stream(self):
        queue = asyncio.Queue(maxsize=self.queue_size)
        # No await between subscription and initial revision: no snapshot gap.
        self.subscribers.add(queue)
        queue.put_nowait(self.revision)
        try:
            while True:
                revision = await queue.get()
                if revision is None:
                    return
                yield revision
        finally:
            self.subscribers.discard(queue)

    def publish(self, revision: int):
        if revision <= self.revision:
            raise RuntimeError('Non-increasing revision')
        self.revision = revision
        for queue in tuple(self.subscribers):
            if queue.full():
                while not queue.empty():
                    queue.get_nowait()
                queue.put_nowait(None)
                self.subscribers.discard(queue)
            else:
                queue.put_nowait(revision)

    def close(self):
        for queue in tuple(self.subscribers):
            while not queue.empty():
                queue.get_nowait()
            queue.put_nowait(None)
        self.subscribers.clear()


class WriteCoordinator:
    def __init__(self, hub: EventHub):
        self.hub = hub
        self.lock = asyncio.Lock()
        self.tasks: set[asyncio.Task] = set()

    async def run(self, operation: Callable[[], BoardSnapshot | WriteResult], action: str, source: str):
        async def committed():
            async with self.lock:
                result = await asyncio.to_thread(operation)
                if not isinstance(result,WriteResult) or result.committed:
                    self.hub.publish(result.revision)
                    logger.info('operation=%s revision=%d source=%s',action,result.revision,source)
                return result.value if isinstance(result,WriteResult) else result
        task = asyncio.create_task(committed())
        self.tasks.add(task)
        task.add_done_callback(self.tasks.discard)
        cancelled = False
        while not task.done():
            try:
                await asyncio.shield(task)
            except asyncio.CancelledError:
                cancelled = True
            except Exception:
                break
        if cancelled:
            # Retrieve any failure without logging submitted values.
            if not task.cancelled():
                task.exception()
            raise asyncio.CancelledError
        return task.result()

    async def close(self):
        if self.tasks:
            await asyncio.gather(*tuple(self.tasks),return_exceptions=True)
