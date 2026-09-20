import type {MessageKey} from './i18n/core';
import type { components } from '../generated/shared-api';
export type Snapshot=components['schemas']['BoardSnapshot'];
export type Card=components['schemas']['Card'];
export type Column=components['schemas']['Column'];
export type Archive=components['schemas']['ArchiveDetail'];
export type ArchiveSummary=components['schemas']['ArchiveSummary'];
export type ArchiveList=components['schemas']['ArchiveList'];
export type ArchiveWrite=components['schemas']['ArchiveWrite'];
type Models=components['schemas'];

export class ApiError extends Error {
  constructor(public readonly code:string,public readonly status:number,public readonly archiveId?:string){super(code);}
}
export const errorText=(error:unknown):MessageKey=>{
  if(error instanceof ApiError){
    if(error.code==='archive_links_changed')return 'archive.linksChanged';
    if(error.code==='already_restored')return 'archive.alreadyRestored';
    if(error.status===409)return 'error.sharedConflict';
    if(error.status===404)return 'error.notFound';
    if(error.status===400||error.status===422)return 'error.invalidInput';
    if(error.status===403)return 'error.sourceNotAllowed';
  }
  return 'error.requestFailed';
};
const record=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object';
const snapshot=(value:unknown)=>record(value)&&Number.isSafeInteger(value.revision)&&Array.isArray(value.columns)&&Array.isArray(value.cards);
async function request<T=Snapshot>(path:string,method='GET',body?:unknown,signal?:AbortSignal,kind:'board'|'list'|'archive'|'write'|'location'='board'):Promise<T>{
  const response=await fetch('/api'+path,{method,cache:'no-store',credentials:'same-origin',
    ...(signal?{signal}:{}),...(body===undefined?{}:{headers:{'Content-Type':'application/json','X-Worklog-Request':'1'},body:JSON.stringify(body)})});
  if(!response.ok){
    const data:unknown=await response.json().catch(()=>null);
    throw new ApiError(record(data)&&typeof data.code==='string'?data.code:'request_failed',response.status,record(data)&&typeof data.archiveId==='string'?data.archiveId:undefined);
  }
  const data:unknown=await response.json();
  const valid=record(data)&&(kind==='board'?snapshot(data):kind==='list'?Array.isArray(data.items)&&Number.isSafeInteger(data.total):kind==='archive'?typeof data.id==='string'&&snapshot(data.snapshot)&&record(data.restoredCards):kind==='write'?typeof data.archiveId==='string'&&snapshot(data.board)&&record(data.restoredCards):typeof data.archiveId==='string');
  if(!valid)throw new ApiError('protocol',502);
  return data as T;
}
export const api={
  board:(signal:AbortSignal)=>request('/board','GET',undefined,signal),
  createCard:(value:Models['CreateCard'])=>request('/cards','POST',value),
  editCard:(id:string,value:Models['EditCard'])=>request('/cards/'+encodeURIComponent(id),'PATCH',value),
  moveCard:(id:string,value:Models['MoveCard'])=>request('/cards/'+encodeURIComponent(id)+'/move','POST',value),
  createColumn:(value:Models['ChangeColumn'])=>request('/columns','POST',value),
  renameColumn:(id:string,value:Models['EditColumn'])=>request('/columns/'+encodeURIComponent(id),'PATCH',value),
  reorderColumns:(value:Models['ReorderColumns'])=>request('/columns/reorder','POST',value),
  deleteColumn:(id:string,value:Models['DeleteColumn'])=>request('/columns/'+encodeURIComponent(id),'DELETE',value),
  archives:(query:string,cursor:string|null,signal?:AbortSignal)=>request<ArchiveList>('/archives?'+new URLSearchParams({q:query,...(cursor?{cursor}:{})}),'GET',undefined,signal,'list'),
  archive:(id:string,signal?:AbortSignal)=>request<Archive>('/archives/'+encodeURIComponent(id),'GET',undefined,signal,'archive'),
  archiveLocation:(id:string,signal?:AbortSignal)=>request<Models['ArchiveLocation']>('/cards/'+encodeURIComponent(id)+'/archive','GET',undefined,signal,'location'),
  createArchive:(value:Models['CreateArchive'])=>request<ArchiveWrite>('/archives','POST',value,undefined,'write'),
  renameArchive:(id:string,value:Models['EditArchive'])=>request<ArchiveWrite>('/archives/'+encodeURIComponent(id),'PATCH',value,undefined,'write'),
  restoreArchive:(id:string,value:Models['RestoreArchive'])=>request<ArchiveWrite>('/archives/'+encodeURIComponent(id)+'/restore','POST',value,undefined,'write'),
};
