import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import type {ArchiveList,ArchiveSummary} from '../../src/web/api';
import {ArchivePages,emptyArchivePages,type ArchivePageState} from '../../src/web/state/archive-pages';

const archive=(id:string,name=id):ArchiveSummary=>({id,name,description:'',createdAt:'2026-09-26T00:00:00Z',sourceRevision:1,metadataVersion:1,cardCount:1,jiraLinkCount:0});
const page=(ids:string[],nextCursor:string|null=null):ArchiveList=>({items:ids.map(id=>archive(id)),total:5,nextCursor});
function fixture(fetcher:(query:string,cursor:string|null,signal:AbortSignal)=>Promise<ArchiveList>){
 let state:ArchivePageState=emptyArchivePages();
 const changed=vi.fn((value:ArchivePageState)=>{state=value;});
 const pages=new ArchivePages(fetcher,changed);
 return {pages,changed,get state(){return state;}};
}
const complete=()=>vi.advanceTimersByTimeAsync(0);
beforeEach(()=>vi.useFakeTimers());
afterEach(()=>vi.useRealTimers());

it('loads each next cursor once and keeps pages when returning from a history',async()=>{
 const fetcher=vi.fn().mockResolvedValueOnce(page(['a','b'],'cursor-2')).mockResolvedValueOnce(page(['c','d'],'cursor-3')).mockResolvedValueOnce(page(['e']));
 const result=fixture(fetcher);
 result.pages.configure('query','1',true);await vi.advanceTimersByTimeAsync(150);
 result.pages.more();result.pages.more();await complete();
 result.pages.more();await complete();
 expect(fetcher.mock.calls.map(call=>call[1])).toEqual([null,'cursor-2','cursor-3']);
 expect(result.state.items.map(item=>item.id)).toEqual(['a','b','c','d','e']);
 result.pages.configure('query','1',false);
 result.pages.configure('query','1',true);await vi.advanceTimersByTimeAsync(150);
 expect(fetcher).toHaveBeenCalledTimes(3);
 result.pages.dispose();
});

it('archive invalidation reloads the loaded depth with fresh cursors and current search results',async()=>{
 const fetcher=vi.fn().mockResolvedValueOnce(page(['a','b'],'old-2')).mockResolvedValueOnce(page(['c','d'],'old-3'))
  .mockResolvedValueOnce(page(['new','a'],'new-2')).mockResolvedValueOnce(page(['b','c'],'new-3'));
 const result=fixture(fetcher);
 result.pages.configure('','1',true);await vi.advanceTimersByTimeAsync(150);
 result.pages.more();await complete();
 result.pages.configure('','2',true);
 expect(result.state.items.map(item=>item.id)).toEqual(['a','b','c','d']);
 await vi.advanceTimersByTimeAsync(150);
 expect(fetcher.mock.calls.map(call=>call[1])).toEqual([null,'old-2',null,'new-2']);
 expect(result.state.items.map(item=>item.id)).toEqual(['new','a','b','c']);
 expect(result.state.cursor).toBe('new-3');
 result.pages.dispose();
});

it('a failed next page retains earlier rows and retry uses the failed cursor only',async()=>{
 const error=new Error('network');
 const fetcher=vi.fn().mockResolvedValueOnce(page(['a','b'],'next')).mockRejectedValueOnce(error).mockResolvedValueOnce(page(['c']));
 const result=fixture(fetcher);
 result.pages.configure('','1',true);await vi.advanceTimersByTimeAsync(150);
 result.pages.more();await complete();
 expect(result.state.items.map(item=>item.id)).toEqual(['a','b']);
 expect(result.state.error).toBe(error);
 result.pages.retry();await complete();
 expect(fetcher.mock.calls.map(call=>call[1])).toEqual([null,'next','next']);
 expect(result.state.items.map(item=>item.id)).toEqual(['a','b','c']);
 expect(result.state.error).toBeNull();
 result.pages.dispose();
});

it('query changes cancel old work and ignore late responses without mixing result sets',async()=>{
 let finish:(value:ArchiveList)=>void=()=>{};
 const fetcher=vi.fn().mockImplementationOnce(()=>new Promise<ArchiveList>(resolve=>{finish=resolve;})).mockResolvedValueOnce(page(['new']));
 const result=fixture(fetcher);
 result.pages.configure('old','1',true);await vi.advanceTimersByTimeAsync(150);
 const oldSignal=fetcher.mock.calls[0]![2] as AbortSignal;
 result.pages.configure('new','1',true);
 expect(oldSignal.aborted).toBe(true);
 await vi.advanceTimersByTimeAsync(150);
 finish(page(['old']));await complete();
 expect(fetcher.mock.calls.map(call=>[call[0],call[1]])).toEqual([['old',null],['new',null]]);
 expect(result.state.items.map(item=>item.id)).toEqual(['new']);
 result.pages.dispose();
});

it('unchanged archive revisions leave a pending request alone, while hidden invalidations refresh on return',async()=>{
 let finish:(value:ArchiveList)=>void=()=>{};
 const fetcher=vi.fn().mockImplementationOnce(()=>new Promise<ArchiveList>(resolve=>{finish=resolve;})).mockResolvedValueOnce(page(['renamed']));
 const result=fixture(fetcher);
 result.pages.configure('','1',true);await vi.advanceTimersByTimeAsync(150);
 const signal=fetcher.mock.calls[0]![2] as AbortSignal;
 result.pages.configure('','1',true);
 expect(signal.aborted).toBe(false);
 finish(page(['original']));await complete();
 result.pages.configure('','1',false);
 result.pages.configure('','2',false);await vi.advanceTimersByTimeAsync(150);
 expect(fetcher).toHaveBeenCalledTimes(1);
 result.pages.configure('','2',true);await vi.advanceTimersByTimeAsync(150);
 expect(result.state.items[0]!.id).toBe('renamed');
 result.pages.dispose();
});

it('leaving during the first read cancels it and reentry restarts it without late updates',async()=>{
 let finish:(value:ArchiveList)=>void=()=>{};
 const fetcher=vi.fn().mockImplementationOnce(()=>new Promise<ArchiveList>(resolve=>{finish=resolve;})).mockResolvedValueOnce(page(['current']));
 const result=fixture(fetcher);
 result.pages.configure('','1',true);await vi.advanceTimersByTimeAsync(150);
 const signal=fetcher.mock.calls[0]![2] as AbortSignal;
 result.pages.configure('','1',false);
 expect(signal.aborted).toBe(true);
 expect(result.state.busy).toBe(false);
 result.pages.configure('','1',true);await vi.advanceTimersByTimeAsync(150);
 finish(page(['stale']));await complete();
 expect(result.state.items.map(item=>item.id)).toEqual(['current']);
 result.pages.dispose();
});
