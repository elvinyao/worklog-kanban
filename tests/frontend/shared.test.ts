import { expect,it,vi } from 'vitest';
import type { Card,Snapshot } from '../../src/web/api';
import { SharedBoard,type Subscription } from '../../src/web/state/shared';
import { draftFrom,reconcileDraft,payloadFrom } from '../../src/web/state/drafts';
const card:Card={id:'card',title:'共享标题',notes:'原笔记',version:1,columnId:'column',position:0,jiraLinks:[],unassignedMattermostLinks:[]};
const snapshot=(revision:number):Snapshot=>({revision,columns:[{id:'column',name:'待处理',position:0}],cards:[card]});
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
it('subscribes before snapshot and refetches when an event arrives during the first fetch',async()=>{
 let listener:Subscription|undefined;let resolveFirst:(value:Snapshot)=>void=()=>{};
 const fetcher=vi.fn().mockImplementationOnce(()=>new Promise<Snapshot>(resolve=>{resolveFirst=resolve;})).mockResolvedValueOnce(snapshot(2));
 const seen:number[]=[];const remove=vi.fn();
 const board=new SharedBoard(value=>{listener=value;return remove;},fetcher,value=>seen.push(value.revision),()=>{});
 board.start();expect(fetcher).not.toHaveBeenCalled();
 listener!.open();listener!.revision(1);expect(fetcher).toHaveBeenCalledTimes(1);
 listener!.revision(2);resolveFirst(snapshot(1));await tick();
 expect(fetcher).toHaveBeenCalledTimes(2);expect(seen.at(-1)).toBe(2);
 board.accept(snapshot(1));expect(seen.at(-1)).toBe(2);
 board.close();expect(remove).toHaveBeenCalledTimes(1);
});
it('reconnect fetches a full snapshot even when the revision is unchanged; close aborts work',async()=>{
 let listener:Subscription|undefined;let readSignal:AbortSignal|undefined;
 const fetcher=vi.fn().mockResolvedValueOnce(snapshot(1)).mockImplementation((_signal:AbortSignal)=>{readSignal=_signal;return new Promise<Snapshot>(()=>{});});
 const board=new SharedBoard(value=>{listener=value;return()=>{};},fetcher,()=>{},()=>{});
 board.start();listener!.open();listener!.revision(1);await tick();
 listener!.error();listener!.open();listener!.revision(1);expect(fetcher).toHaveBeenCalledTimes(2);
 board.close();expect(readSignal?.aborted).toBe(true);
});
it('remote snapshots preserve dirty drafts and only clean drafts follow the server',()=>{
 const draft=draftFrom(card);
 const remote={...card,version:2,notes:'远端更新'};
 expect(reconcileDraft(draft,remote)).toMatchObject({baseVersion:2,fields:{notes:'远端更新'}});
 const dirty={...draft,fields:{...draft.fields,notes:'本地未保存'}};
 expect(reconcileDraft(dirty,remote)).toBe(dirty);
 expect(payloadFrom(Object.assign(dirty,{preview:'ALICE_ONLY_MARKER',cookie:'synthetic'}))).toEqual({title:'共享标题',notes:'本地未保存',jiraLinks:[],unassignedMattermostLinks:[]});
});
it('preserves a dirty nested hierarchy across remote changes and strips private fields at every level',()=>{
 const message={id:'message',postId:'a'.repeat(26),team:'demo',url:'http://mattermost.localhost:4181/demo/pl/'+'a'.repeat(26),description:'Shared',position:0};
 const jira={id:'jira',key:'DEMO-1',url:'http://jira.localhost:4180/jira/browse/DEMO-1',position:0,mattermostLinks:[message]};
 const original={...card,jiraLinks:[jira],unassignedMattermostLinks:[{...message,id:'orphan'}]};const draft=draftFrom(original);
 const dirty={...draft,fields:{...draft.fields,jiraLinks:[{...draft.fields.jiraLinks[0]!,preview:'PRIVATE',mattermostLinks:[{...draft.fields.jiraLinks[0]!.mattermostLinks[0]!,description:'Local change',author:'PRIVATE',text:'PRIVATE',avatar:'PRIVATE'}]}],unassignedMattermostLinks:[{...draft.fields.unassignedMattermostLinks[0]!,preview:'PRIVATE'}]}};
 expect(reconcileDraft(dirty,{...original,version:2,jiraLinks:[],notes:'Remote'})).toBe(dirty);
 expect(dirty.baseVersion).toBe(1);expect(draft.baseline.jiraLinks[0]!.mattermostLinks[0]!.description).toBe('Shared');
 const payload=payloadFrom(dirty);expect(JSON.stringify(payload)).not.toContain('PRIVATE');expect(JSON.stringify(payload)).not.toContain('draftId');expect(payload.jiraLinks[0]!.mattermostLinks[0]!.description).toBe('Local change');expect(payload.unassignedMattermostLinks[0]!.id).toBe('orphan');
});
it('a failed in-flight fetch still runs the full refresh queued by reconnect',async()=>{
 let listener:Subscription|undefined;let fail:(reason:Error)=>void=()=>{};
 const fetcher=vi.fn().mockImplementationOnce(()=>new Promise<Snapshot>((_,reject)=>{fail=reject;})).mockResolvedValue(snapshot(2));
 const seen:number[]=[];const board=new SharedBoard(value=>{listener=value;return()=>{};},fetcher,value=>seen.push(value.revision),()=>{});
 board.start();listener!.open();listener!.revision(1);
 listener!.error();listener!.open();listener!.revision(2);fail(new Error('offline'));await tick();
 expect(fetcher).toHaveBeenCalledTimes(2);expect(seen).toEqual([2]);board.close();
});
it('a newer event queues one retry after failure, but failures alone do not cause polling',async()=>{
 let listener:Subscription|undefined;let fail:(reason:Error)=>void=()=>{};
 const fetcher=vi.fn().mockImplementationOnce(()=>new Promise<Snapshot>((_,reject)=>{fail=reject;})).mockRejectedValue(new Error('still offline'));
 const board=new SharedBoard(value=>{listener=value;return()=>{};},fetcher,()=>{},()=>{});
 board.start();listener!.open();listener!.revision(1);listener!.revision(2);fail(new Error('failed'));await tick();await tick();
 expect(fetcher).toHaveBeenCalledTimes(2);board.close();
});
