import type {Draft,Fields} from './drafts';
export const object=(value:unknown):Record<string,unknown>=>{if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid draft');return value as Record<string,unknown>;};
export const text=(value:unknown,max=20000):string=>{if(typeof value!=='string'||value.length>max)throw new Error('Invalid text');return value;};
export const number=(value:unknown):number=>{if(!Number.isSafeInteger(value)||(value as number)<0)throw new Error('Invalid revision');return value as number;};
export const strings=(value:unknown):string[]=>{if(!Array.isArray(value)||value.length>5000)throw new Error('Invalid selection');return value.map(item=>text(item,100));};
function fields(value:unknown):Fields{
 const data=object(value);
 const list=(raw:unknown,max:number)=>{if(!Array.isArray(raw)||raw.length>max)throw new Error('Invalid links');return raw;};
 const message=(raw:unknown)=>{const row=object(raw);return {draftId:text(row.draftId,100),url:text(row.url,2048),description:text(row.description,2000)};};
 return {title:text(data.title,200),notes:text(data.notes),jiraLinks:list(data.jiraLinks,20).map(raw=>{const row=object(raw);return {draftId:text(row.draftId,100),url:text(row.url,2048),mattermostLinks:list(row.mattermostLinks,20).map(message)};}),unassignedMattermostLinks:list(data.unassignedMattermostLinks,20).map(raw=>({...message(raw),id:text(object(raw).id,100)}))};
}
export function cardDraft(value:unknown):Draft{const data=object(value);return {baseVersion:number(data.baseVersion),baseline:fields(data.baseline),fields:fields(data.fields)};}
