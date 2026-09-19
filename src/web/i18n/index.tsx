import {createContext,useContext,useEffect,useLayoutEffect,useMemo,useState,type ReactNode} from 'react';
import {browserLanguages,browserStorage,columnName,isLocale,localeTags,LOCALE_KEY,readPreference,resolveLocale,savePreference,translate,type MessageKey,type Preference} from './core';

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
export function LanguageSelect(){
 const {preference,setPreference,t}=useLanguage();
 return <label className="language-select"><span>语言 / Language / 言語</span><select aria-label="语言 / Language / 言語" value={preference} onChange={event=>{const value=event.target.value;if(value==='auto'||isLocale(value))setPreference(value);}}>
  <option value="auto">{t('跟随浏览器')}</option><option value="zh">简体中文</option><option value="en">English</option><option value="ja">日本語</option>
 </select></label>;
}
