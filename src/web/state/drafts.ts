import type { Card } from '../api';
export interface Fields {title:string;notes:string;jiraUrl:string|null;mattermostLinks:{url:string;description:string}[]}
export interface Draft {baseVersion:number;baseline:Fields;fields:Fields}
export function draftFrom(card:Card):Draft {
 const fields:Fields={title:card.title,notes:card.notes,jiraUrl:card.jira?.url??null,mattermostLinks:card.mattermostLinks.map(link=>({url:link.url,description:link.description}))};
 return {baseVersion:card.version,baseline:fields,fields};
}
export const isDirty=(draft:Draft)=>JSON.stringify(draft.fields)!==JSON.stringify(draft.baseline);
export function reconcileDraft(draft:Draft,card:Card):Draft {return isDirty(draft)?draft:draftFrom(card);}
export function payloadFrom(draft:Draft):Fields {
 return {title:draft.fields.title,notes:draft.fields.notes,jiraUrl:draft.fields.jiraUrl,mattermostLinks:draft.fields.mattermostLinks.map(link=>({url:link.url,description:link.description}))};
}
