import {describe,it,expect} from 'vitest';
import {DRAFT_PREFIX,DRAFT_TTL,listDrafts,saveDraft} from '../../src/web/state/local-drafts';
function memory():Storage{
 const data=new Map<string,string>();
 return {get length(){return data.size;},key:index=>[...data.keys()][index]??null,getItem:key=>data.get(key)??null,setItem:(key,value)=>{data.set(key,value);},removeItem:key=>{data.delete(key);},clear:()=>data.clear()};
}
const draft=(id:string)=>({id,scope:'card:new',savedAt:Date.now(),value:{title:'my input',pending:{requestId:'same-operation'}}});
describe('local input drafts',()=>{
 it('keeps separate editing sessions and pending request IDs',()=>{
  const storage=memory();saveDraft(storage,draft('one'));saveDraft(storage,draft('two'));
  expect(listDrafts(storage,'card:new')).toHaveLength(2);
  expect(listDrafts(storage,'columns')).toEqual([]);
  expect(listDrafts(storage)[0]?.value).toEqual(draft('one').value);
 });
 it('removes expired, malformed and future records without touching other storage',()=>{
  const storage=memory(),now=Date.now();storage.setItem('language','en');
  storage.setItem(DRAFT_PREFIX+'old',JSON.stringify({...draft('old'),savedAt:now-DRAFT_TTL-1}));
  storage.setItem(DRAFT_PREFIX+'future',JSON.stringify({...draft('future'),savedAt:now+1000}));
  storage.setItem(DRAFT_PREFIX+'bad','{');
  expect(listDrafts(storage,undefined,now)).toEqual([]);expect(storage.length).toBe(1);
 });
 it('rejects personal previews and oversized input; never evicts valid drafts for quota',()=>{
  const storage=memory();
  expect(()=>saveDraft(storage,{...draft('private'),value:{preview:'private'}})).toThrow();
  expect(()=>saveDraft(storage,{...draft('huge'),value:'x'.repeat(20001)})).toThrow();
  for(let i=0;i<20;i++)saveDraft(storage,draft(String(i)));
  expect(()=>saveDraft(storage,draft('21'))).toThrow();expect(listDrafts(storage)).toHaveLength(20);
  expect(()=>saveDraft(storage,draft('0'))).not.toThrow();
 });
 it('surfaces denied storage writes to the caller',()=>{
  const storage=memory();storage.setItem=()=>{throw new Error('denied');};
  expect(()=>saveDraft(storage,draft('one'))).toThrow('denied');
 });
});
