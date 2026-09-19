import { createContext,useContext,useEffect,useRef,useState,type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import type { Resource } from '../../contracts/resource-links';
import { ExtensionClient } from '../extension-client';
import { PreviewStore,type PreviewView } from '../state/preview';
import {useLanguage} from '../i18n';
import { releaseAvatars } from '../safe-content';
type Connection='connecting'|'connected'|'unavailable'|'configuration_mismatch';
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
  const client=new ExtensionClient(__SITE_CONFIG__,()=>{if(alive){client.dispose();store.disconnect();setConnection('unavailable');}});
  const store=new PreviewStore(client,value=>{if(alive)setViews(value);},Date.now,cooldowns.current);storeRef.current=store;store.setResources(resourcesRef.current);
  void client.request({version:1,id:crypto.randomUUID(),op:'hello'},2500).then(reply=>{
   if(!alive)return;
   if(reply.ok&&'connected' in reply.data){setConnection('connected');store.connect();}else{store.disconnect();setConnection(!reply.ok&&reply.error.code==='configuration_mismatch'?'configuration_mismatch':'unavailable');}
  }).catch(()=>{if(alive){client.dispose();store.disconnect();setConnection('unavailable');}});
  const hide=()=>{alive=false;store.dispose();client.dispose();storeRef.current=null;releaseAvatars();flushSync(()=>{setViews(new Map());setConnection('unavailable');});};
  const show=(event:PageTransitionEvent)=>{if(event.persisted)setEpoch(value=>value+1);};
  window.addEventListener('pagehide',hide);window.addEventListener('pageshow',show);
  return()=>{alive=false;store.dispose();client.dispose();storeRef.current=null;releaseAvatars();window.removeEventListener('pagehide',hide);window.removeEventListener('pageshow',show);};
 },[epoch]);
 useEffect(()=>{storeRef.current?.setResources(resources);},[resources]);
 return <Previews.Provider value={{views,connection,refresh:key=>storeRef.current?.refresh(key),refreshAll:()=>storeRef.current?.refreshAll(),reconnect:()=>setEpoch(value=>value+1)}}>{children}</Previews.Provider>;
}
export function PreviewToolbar(){
 const {t}=useLanguage();
 const {connection,refreshAll,reconnect}=usePreviews();
 return <div className="preview-toolbar"><span data-testid="preview-connection">{t(connection==='connected'?'preview.connected':connection==='connecting'?'preview.connecting':connection==='configuration_mismatch'?'connection.configurationMismatch':'preview.disconnectedSharedAvailable')}</span><div className="row-actions"><button disabled={connection!=='connected'} onClick={refreshAll}>{t("preview.refreshAll")}</button><button disabled={connection==='connecting'} onClick={reconnect}>{t("preview.reconnect")}</button></div></div>;
}
