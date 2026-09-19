import {LanguageSelect} from '../i18n';
import { useEffect,useRef,type ReactNode } from 'react';
export function Modal({title,close,children}:{title:string;close:()=>void;children:ReactNode}){
 const ref=useRef<HTMLDialogElement>(null);const composing=useRef(false);
 useEffect(()=>{const dialog=ref.current!;dialog.showModal();return()=>dialog.close();},[]);
 return <dialog ref={ref} aria-label={title} onCompositionStartCapture={()=>{composing.current=true;}} onCompositionEndCapture={()=>{composing.current=false;}} onKeyDownCapture={event=>{if(event.key==='Escape'&&(composing.current||event.nativeEvent.isComposing||event.nativeEvent.keyCode===229)){event.preventDefault();event.stopPropagation();}}} onSubmitCapture={event=>{if(composing.current){event.preventDefault();event.stopPropagation();}}} onCancel={event=>{event.preventDefault();if(!composing.current)close();}}><div className="dialog-language"><LanguageSelect/></div>{children}</dialog>;
}
