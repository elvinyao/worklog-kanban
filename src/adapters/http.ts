import { record, type SiteConfig } from '../contracts/config';
import type { PreviewErrorCode } from '../contracts/preview-messages';

export class ReadError extends Error {
  constructor(public code:PreviewErrorCode,public retryAfterMs?:number) { super(code); }
}
export const object = (value:unknown):Record<string,unknown> => { try{return record(value);}catch{throw new ReadError('protocol');} };
export function string(value:unknown,max=20000):string {
  if(typeof value !== 'string') throw new ReadError('protocol');
  return value.slice(0,max);
}
export function retryAfter(value:string|null,now=Date.now()):number {
  if(value && /^\d+$/.test(value)) { const ms=Number(value)*1000; if(Number.isSafeInteger(ms)) return ms; }
  const timestamp=value ? Date.parse(value) : NaN;
  return Number.isFinite(timestamp) ? Math.max(0,timestamp-now) : 60000;
}
export async function get(url:string,signal:AbortSignal):Promise<Response> {
  signal.throwIfAborted();
  let response:Response;
  try { response=await fetch(url,{method:'GET',credentials:'include',cache:'no-store',redirect:'error',signal:AbortSignal.any([signal,AbortSignal.timeout(20000)])}); }
  catch(error) { signal.throwIfAborted(); throw new ReadError('network'); }
  const code = response.status === 401 ? 'login_required' : [403,404].includes(response.status) ? 'unavailable' : response.status === 429 ? 'rate_limited' : !response.ok ? 'network' : null;
  if(code) { void response.body?.cancel(); throw new ReadError(code,code === 'rate_limited' ? retryAfter(response.headers.get('Retry-After')) : undefined); }
  return response;
}
export async function bytes(response:Response,max:number,signal:AbortSignal):Promise<Uint8Array> {
  const reader=response.body?.getReader();
  if(!reader) throw new ReadError('protocol');
  const chunks:Uint8Array[]=[];
  let length=0;
  try {
    while(true) {
      signal.throwIfAborted();
      const chunk=await reader.read();
      if(chunk.done) break;
      length+=chunk.value.length;
      if(length>max) throw new ReadError('protocol');
      chunks.push(chunk.value);
    }
    const result=new Uint8Array(length);
    let offset=0;
    for(const chunk of chunks){result.set(chunk,offset);offset+=chunk.length;}
    return result;
  } catch(error) {
    await reader.cancel().catch(()=>{});
    signal.throwIfAborted();
    throw error instanceof ReadError ? error : new ReadError('network');
  } finally { reader.releaseLock(); }
}
export async function readJSON(url:string,signal:AbortSignal,config:SiteConfig):Promise<Record<string,unknown>> {
  const response=await get(url,signal);
  const content=new TextDecoder().decode(await bytes(response,2*1024*1024,signal));
  if(!response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase().endsWith('/json')) {
    if(config.mode === 'dummy' && content.includes('<title>模拟登录</title>') && content.includes('模拟环境：登录已过期')) throw new ReadError('login_required');
    throw new ReadError('protocol');
  }
  try { return object(JSON.parse(content)); } catch { throw new ReadError('protocol'); }
}
export async function optional<T>(operation:()=>Promise<T>,signal:AbortSignal):Promise<T|undefined> {
  try{return await operation();}catch(error){
    signal.throwIfAborted();
    if(error instanceof ReadError && ['login_required','rate_limited'].includes(error.code)) throw error;
    return undefined;
  }
}
