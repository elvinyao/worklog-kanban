import {useEffect,useLayoutEffect} from 'react';
import {useLanguage} from '../i18n';

export interface DraftGuardOptions {
 dirty:boolean;
 busy?:boolean;
 close:()=>void;
 onDirtyChange?:((dirty:boolean)=>void)|undefined;
}

// Register every editable dialog with routing and browser-navigation protection.
// Successful saves call their completion callback directly, bypassing this guard.
export function useDraftGuard({dirty,busy=false,close,onDirtyChange}:DraftGuardOptions){
 const {t}=useLanguage();
 const protectedDraft=dirty||busy;
 useLayoutEffect(()=>{
  onDirtyChange?.(protectedDraft);
  return()=>onDirtyChange?.(false);
 },[protectedDraft,onDirtyChange]);
 useEffect(()=>{
  if(!protectedDraft)return;
  const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();};
  window.addEventListener('beforeunload',warn);
  return()=>window.removeEventListener('beforeunload',warn);
 },[protectedDraft]);
 return ()=>{
  if(busy)return;
  if(!dirty||window.confirm(t('card.unsavedChanges')))close();
 };
}
