import {createContext,useContext,useEffect,useLayoutEffect,useMemo,useState,type ReactNode} from 'react';
import {browserLanguages,browserStorage,columnName,localeTags,LOCALE_KEY,readPreference,resolveLocale,savePreference,translate,type MessageKey,type Preference} from './core';

function useLanguageState(){
 const [preference,setPreference]=useState<Preference>(()=>readPreference(browserStorage()));
 const [languages,setLanguages]=useState(browserLanguages);
 const locale=resolveLocale(preference,languages);
 useEffect(()=>{
  const languageChange=()=>setLanguages(browserLanguages());
  const storageChange=(event:StorageEvent)=>{if(event.key===LOCALE_KEY||event.key===null)setPreference(readPreference(browserStorage()));};
  window.addEventListener('languagechange',languageChange);window.addEventListener('storage',storageChange);
  return()=>{window.removeEventListener('languagechange',languageChange);window.removeEventListener('storage',storageChange);};
 },[]);
 return useMemo(()=>({locale,preference,
  setPreference:(value:Preference)=>{setPreference(value);savePreference(browserStorage(),value);},
  t:(key:MessageKey,params?:Record<string,string|number>)=>translate(locale,key,params),
  column:(value:{name:string;defaultNameKey?:string|null})=>columnName(locale,value),
  date:(value:string|number)=>new Date(value).toLocaleString(localeTags[locale]),
  time:(value:string|number)=>new Date(value).toLocaleTimeString(localeTags[locale]),
 }),[locale,preference]);
}
const LanguageContext=createContext<ReturnType<typeof useLanguageState>|null>(null);
export function LanguageProvider({children,page='board'}:{children:ReactNode;page?:'board'|'probe'}){
 const value=useLanguageState();
 useLayoutEffect(()=>{document.documentElement.lang=localeTags[value.locale];document.title='Worklog · '+value.t(page==='board'?'共享工作看板':'模拟接入验证');},[value.locale,page]);
 return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}
export function useLanguage(){const value=useContext(LanguageContext);if(!value)throw new Error('Language provider required');return value;}
export function LanguageSwitcher(){
 const {preference,setPreference,t}=useLanguage();
 const choices=[
  {value:'auto',label:t('自动'),name:t('跟随浏览器')},
  {value:'zh',label:'中文',name:'简体中文'},
  {value:'en',label:'EN',name:'English'},
  {value:'ja',label:'日本語',name:'日本語'},
 ] as const;
 return <div className="language-switcher" role="group" aria-label="语言 / Language / 言語">
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.25" aria-hidden="true"><circle cx="10" cy="10" r="7.2"/><ellipse cx="10" cy="10" rx="3" ry="7.2"/><path d="M3 10h14"/></svg>
  {choices.map(({value,label,name})=><button key={value} type="button" data-language={value} aria-label={name} title={name} aria-pressed={preference===value} lang={value==='auto'?undefined:localeTags[value]} onClick={()=>setPreference(value)}>{label}</button>)}
 </div>;
}
