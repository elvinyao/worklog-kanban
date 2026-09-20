import type { Card } from '../api';
export interface MessageDraft {draftId:string;url:string;description:string}
export interface JiraDraft {draftId:string;url:string;mattermostLinks:MessageDraft[]}
export interface Fields {title:string;notes:string;jiraLinks:JiraDraft[];unassignedMattermostLinks:(MessageDraft&{id:string})[]}
export interface Draft {baseVersion:number;baseline:Fields;fields:Fields}
export const newMessage=():MessageDraft=>({draftId:crypto.randomUUID(),url:'',description:''});
export const newJira=():JiraDraft=>({draftId:crypto.randomUUID(),url:'',mattermostLinks:[]});
export function draftFrom(card:Card):Draft {
 const message=(link:Card['unassignedMattermostLinks'][number])=>({draftId:link.id,url:link.url,description:link.description});
 const fields:Fields={title:card.title,notes:card.notes,jiraLinks:card.jiraLinks.map(jira=>({draftId:jira.id,url:jira.url,mattermostLinks:jira.mattermostLinks.map(message)})),unassignedMattermostLinks:card.unassignedMattermostLinks.map(link=>({...message(link),id:link.id}))};
 return {baseVersion:card.version,baseline:fields,fields};
}
export const isDirty=(draft:Draft)=>JSON.stringify(draft.fields)!==JSON.stringify(draft.baseline);
export function reconcileDraft(draft:Draft,card:Card):Draft {return isDirty(draft)?draft:draftFrom(card);}
export function payloadFrom(draft:Draft) {
 return {title:draft.fields.title,notes:draft.fields.notes,jiraLinks:draft.fields.jiraLinks.map(jira=>({url:jira.url.trim(),mattermostLinks:jira.mattermostLinks.map(link=>({url:link.url.trim(),description:link.description}))})),unassignedMattermostLinks:draft.fields.unassignedMattermostLinks.map(link=>({id:link.id,url:link.url,description:link.description}))};
}
