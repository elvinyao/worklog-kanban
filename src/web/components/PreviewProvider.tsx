import { createContext,useContext,useEffect,useRef,useState,type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import type { Resource } from '../../contracts/resource-links';
import { PreviewStore,type PreviewView } from '../state/preview';
import {PreviewSession,type Connection} from '../preview-session';
import {useLanguage} from '../i18n';
import { releaseAvatars } from '../safe-content';
interface Context {views:ReadonlyMap<string,PreviewView>;connection:Connection;refresh:(key:string)=>void;refreshAll:()=>void;reconnect:()=>void}
const Previews=createContext<Context|null>(null);
export function usePreviews(){const value=useContext(Previews);if(!value)throw new Error('Preview provider required');return value;}
export function PreviewProvider({resources,children}:{resources:Resource[];children:ReactNode}){
 const [views,setViews]=useState<ReadonlyMap<string,PreviewView>>(new Map());const [connection,setConnection]=useState<Connection>('connecting');const [epoch,setEpoch]=useState(0);
 const storeRef=useRef<PreviewStore|null>(null);const resourcesRef=useRef(resources);resourcesRef.current=resources;
 const cooldowns=useRef(new Map<string,number>());
 useEffect(()=>{
  let alive=true;
  setViews(new Map());setConnection('connecting');
  const session=new PreviewSession(__SITE_CONFIG__,value=>{if(alive)setViews(value);},value=>{if(alive)setConnection(value);},cooldowns.current);
  const store=session.store;storeRef.current=store;store.setResources(resourcesRef.current);session.start();
  const hide=()=>{alive=false;session.close();storeRef.current=null;releaseAvatars();flushSync(()=>{setViews(new Map());setConnection('unavailable');});};
  const show=(event:PageTransitionEvent)=>{if(event.persisted)setEpoch(value=>value+1);};
  window.addEventListener('pagehide',hide);window.addEventListener('pageshow',show);
  return()=>{alive=false;session.close();storeRef.current=null;releaseAvatars();window.removeEventListener('pagehide',hide);window.removeEventListener('pageshow',show);};
 },[epoch]);
 useEffect(()=>{storeRef.current?.setResources(resources);},[resources]);
 return <Previews.Provider value={{views,connection,refresh:key=>storeRef.current?.refresh(key),refreshAll:()=>storeRef.current?.refreshAll(),reconnect:()=>setEpoch(value=>value+1)}}>{children}</Previews.Provider>;
}
export function PreviewToolbar(){
 const {t}=useLanguage();
 const {connection,refreshAll,reconnect}=usePreviews();
 return <div className="preview-toolbar"><span data-testid="preview-connection">{t(connection==='connected'?'preview.connected':connection==='connecting'?'preview.connecting':connection==='reconnecting'?'preview.reconnecting':connection==='configuration_mismatch'?'connection.configurationMismatch':'preview.disconnectedSharedAvailable')}</span><div className="row-actions"><button type="button" disabled={connection!=='connected'} onClick={refreshAll}>{t("preview.refreshAll")}</button><button type="button" disabled={connection==='connecting'||connection==='reconnecting'} onClick={reconnect}>{t("preview.reconnect")}</button></div></div>;
}
