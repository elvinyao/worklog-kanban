import {useState} from 'react';
import {useLanguage} from '../i18n';
const key='worklog.cardPreviews';
export function usePreviewPreference(){
 const [enabled,setEnabled]=useState(()=>{try{return localStorage.getItem(key)==='true';}catch{return false;}});
 return [enabled,(value:boolean)=>{setEnabled(value);try{localStorage.setItem(key,String(value));}catch{/* The switch still works when browser storage is unavailable. */}}] as const;
}
export function PreviewToggle({enabled,change}:{enabled:boolean;change:(value:boolean)=>void}){
 const {t}=useLanguage();
 return <button type="button" className="preview-toggle" role="switch" aria-label={t('preview.cardToggle')} aria-checked={enabled} onClick={()=>change(!enabled)}><span className="switch-track" aria-hidden="true"><span/></span>{t('preview.cardToggle')}<small>{t(enabled?'preview.on':'preview.off')}</small></button>;
}
