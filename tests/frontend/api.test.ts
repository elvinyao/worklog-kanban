import {afterEach,expect,it,vi} from 'vitest';
import {api,REQUEST_TIMEOUT_MS} from '../../src/web/api';

afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});

it('times out a stalled write and aborts its transport',async()=>{
 vi.useFakeTimers();
 const fetcher=vi.fn(()=>new Promise<Response>(()=>{}));vi.stubGlobal('fetch',fetcher);
 const result=api.createCard({title:'Synthetic',columnId:'column',notes:''});
 const failed=expect(result).rejects.toMatchObject({code:'request_timeout',status:408});
 await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS);
 await failed;
 expect((fetcher.mock.calls[0] as unknown as [string,RequestInit])[1].signal?.aborted).toBe(true);
 expect(vi.getTimerCount()).toBe(0);
});

it('bounds decoding after response headers arrive',async()=>{
 vi.useFakeTimers();
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:()=>new Promise(()=>{})}));
 const failed=expect(api.board(new AbortController().signal)).rejects.toMatchObject({code:'request_timeout'});
 await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS);
 await failed;
});

it('propagates cancellation without waiting for the timeout',async()=>{
 vi.useFakeTimers();
 vi.stubGlobal('fetch',vi.fn(()=>new Promise<Response>(()=>{})));
 const controller=new AbortController();
 const failed=expect(api.board(controller.signal)).rejects.toMatchObject({name:'AbortError'});
 controller.abort();await failed;
 expect(vi.getTimerCount()).toBe(0);
});

it('cleans deadlines after successful responses',async()=>{
 vi.useFakeTimers();
 const board={revision:1,columns:[],cards:[],archiveCount:0};
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify(board))));
 await expect(api.board(new AbortController().signal)).resolves.toEqual(board);
 expect(vi.getTimerCount()).toBe(0);
});
