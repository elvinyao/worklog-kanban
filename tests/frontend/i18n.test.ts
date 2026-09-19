import {describe,it,expect} from 'vitest';
import {columnName,detectLocale,resolveLocale,readPreference,savePreference,translate,messages,LOCALE_KEY} from '../../src/web/i18n/core';

describe('language preference',()=>{
 it('matches browser preferences in order including regional variants',()=>{
  expect(detectLocale(['fr-FR','ja-JP','en-US'])).toBe('ja');
  expect(detectLocale(['zh-Hant-TW','en-GB'])).toBe('zh');
  expect(detectLocale(['en-GB','ja'])).toBe('en');
  expect(detectLocale(['de-DE'])).toBe('en');
  expect(detectLocale([])).toBe('en');
 });
 it('manual preference overrides browser and auto follows it again',()=>{
  expect(resolveLocale('ja',['en-US'])).toBe('ja');
  expect(resolveLocale('auto',['zh-CN'])).toBe('zh');
 });
 it('stores only a valid language code and removes the override for auto',()=>{
  const data=new Map<string,string>();const storage={getItem:(key:string)=>data.get(key)??null,setItem:(key:string,value:string)=>{data.set(key,value);},removeItem:(key:string)=>{data.delete(key);}};
  expect(readPreference(storage)).toBe('auto');savePreference(storage,'ja');
  expect([...data]).toEqual([[LOCALE_KEY,'ja']]);expect(readPreference(storage)).toBe('ja');
  savePreference(storage,'auto');expect(data.size).toBe(0);
  data.set(LOCALE_KEY,'invalid');expect(readPreference(storage)).toBe('auto');
 });
 it('storage denial is nonfatal',()=>{
  const blocked={getItem:()=>{throw Error('blocked');},setItem:()=>{throw Error('blocked');},removeItem:()=>{throw Error('blocked');}};
  expect(readPreference(blocked)).toBe('auto');expect(()=>savePreference(blocked,'en')).not.toThrow();
 });
 it('covers every locale and substitutes user text literally',()=>{
  const placeholders=(value:string)=>[...value.matchAll(/\{(\w+)\}/g)].map(match=>match[1]).sort();
  for(const [key,values] of Object.entries(messages)){expect(key).toMatch(/^[a-z][A-Za-z0-9]*(?:\.[a-z][A-Za-z0-9]*)+$/);expect(values).toHaveLength(3);for(const value of values){expect(value.trim()).not.toBe('');expect(placeholders(value)).toEqual(placeholders(values[0]));}}
  expect(translate('en','card.new')).toBe('New card');
  expect(translate('ja','card.new')).toBe('カードを作成');
  expect(translate('en','card.open',{title:'完成 <script>$&'})).toBe('Open card: 完成 <script>$&');
 });
 it('translates only columns explicitly marked as defaults',()=>{
  expect(columnName('en',{name:'完成',defaultNameKey:'done'})).toBe('Done');
  expect(columnName('ja',{name:'完成',defaultNameKey:null})).toBe('完成');
  expect(columnName('en',{name:'完成'})).toBe('完成');
  expect(columnName('en',{name:'original',defaultNameKey:'toString'})).toBe('original');
 });
});
