import {messages} from './messages';
export {messages};
export type MessageKey=keyof typeof messages;
export type Locale='zh'|'en'|'ja';
export type Preference=Locale|'auto';
export const LOCALE_KEY='worklog.language';
export interface SettingsStorage {getItem(key:string):string|null;setItem(key:string,value:string):void;removeItem(key:string):void}
export const localeTags:Record<Locale,string>={zh:'zh-CN',en:'en-US',ja:'ja-JP'};
export const isLocale=(value:unknown):value is Locale=>value==='zh'||value==='en'||value==='ja';
export function detectLocale(languages:readonly string[]):Locale {
 for(const language of languages){const base=language.toLowerCase().split(/[-_]/)[0];if(isLocale(base))return base;}
 return 'en';
}
export const resolveLocale=(preference:Preference,languages:readonly string[]):Locale=>preference==='auto'?detectLocale(languages):preference;
export function readPreference(storage?:SettingsStorage):Preference {
 try{const value=storage?.getItem(LOCALE_KEY);return isLocale(value)?value:'auto';}catch{return 'auto';}
}
export function savePreference(storage:SettingsStorage|undefined,preference:Preference):void {
 try{if(isLocale(preference))storage?.setItem(LOCALE_KEY,preference);else storage?.removeItem(LOCALE_KEY);}catch{/* The current page still switches when persistence is unavailable. */}
}
export function browserStorage():SettingsStorage|undefined {try{return window.localStorage;}catch{return undefined;}}
export const browserLanguages=():readonly string[]=>navigator.languages?.length?navigator.languages:[navigator.language];
export function translate(locale:Locale,key:MessageKey,params:Record<string,string|number>={}):string {
 return messages[key][{zh:0,en:1,ja:2}[locale]]!.replace(/\{(\w+)\}/g,(match,name:string)=>Object.hasOwn(params,name)?String(params[name]):match);
}
const defaultColumns={todo:'待处理',investigating:'调查中',implementing:'实装中',unitTesting:'单体测试',integrationTesting:'结合测试',done:'完成'} as const;
export function columnName(locale:Locale,column:{name:string;defaultNameKey?:string|null}):string {
 const key=column.defaultNameKey;
 return key&&Object.hasOwn(defaultColumns,key)?translate(locale,defaultColumns[key as keyof typeof defaultColumns]):column.name;
}
