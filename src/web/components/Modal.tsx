import { useEffect,useRef,type ReactNode } from 'react';
export function Modal({title,close,children}:{title:string;close:()=>void;children:ReactNode}){
 const ref=useRef<HTMLDialogElement>(null);
 useEffect(()=>{const dialog=ref.current!;dialog.showModal();return()=>dialog.close();},[]);
 return <dialog ref={ref} aria-label={title} onCancel={event=>{event.preventDefault();close();}}>{children}</dialog>;
}
