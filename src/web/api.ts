import type {MessageKey} from './i18n/core';
import type { components } from '../generated/shared-api';
export type Snapshot=components['schemas']['BoardSnapshot'];
export type Card=components['schemas']['Card'];
export type Column=components['schemas']['Column'];
type Models=components['schemas'];

export class ApiError extends Error {
  constructor(public readonly code:string,public readonly status:number){super(code);}
}
export const errorText=(error:unknown):MessageKey=>{
  if(error instanceof ApiError){
    if(error.status===409)return 'error.sharedConflict';
    if(error.status===404)return 'error.notFound';
    if(error.status===400||error.status===422)return 'error.invalidInput';
    if(error.status===403)return 'error.sourceNotAllowed';
  }
  return 'error.requestFailed';
};
async function request(path:string,method='GET',body?:unknown,signal?:AbortSignal):Promise<Snapshot>{
  const response=await fetch('/api'+path,{method,cache:'no-store',credentials:'same-origin',
    ...(signal?{signal}:{}),...(body===undefined?{}:{headers:{'Content-Type':'application/json','X-Worklog-Request':'1'},body:JSON.stringify(body)})});
  if(!response.ok){
    const data:unknown=await response.json().catch(()=>null);
    throw new ApiError(data&&typeof data==='object'&&'code' in data&&typeof data.code==='string'?data.code:'request_failed',response.status);
  }
  const data:unknown=await response.json();
  if(!data||typeof data!=='object'||!('revision' in data)||!Number.isSafeInteger(data.revision)||!('columns' in data)||!Array.isArray(data.columns)||!('cards' in data)||!Array.isArray(data.cards))throw new ApiError('protocol',502);
  return data as Snapshot;
}
export const api={
  board:(signal:AbortSignal)=>request('/board','GET',undefined,signal),
  createCard:(value:Models['CreateCard'])=>request('/cards','POST',value),
  editCard:(id:string,value:Models['EditCard'])=>request('/cards/'+encodeURIComponent(id),'PATCH',value),
  moveCard:(id:string,value:Models['MoveCard'])=>request('/cards/'+encodeURIComponent(id)+'/move','POST',value),
  createColumn:(value:Models['ChangeColumn'])=>request('/columns','POST',value),
  renameColumn:(id:string,value:Models['ChangeColumn'])=>request('/columns/'+encodeURIComponent(id),'PATCH',value),
  reorderColumns:(value:Models['ReorderColumns'])=>request('/columns/reorder','POST',value),
  deleteColumn:(id:string,value:Models['DeleteColumn'])=>request('/columns/'+encodeURIComponent(id),'DELETE',value),
};
