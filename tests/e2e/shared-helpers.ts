import type { BrowserContext } from '@playwright/test';
import type { components } from '../../src/generated/shared-api';
import { board } from './fixtures';
export async function seedCard(context:BrowserContext,title:string,jiraUrl:string|null=null,mattermostLinks:{url:string;description:string}[]=[],columnId?:string){
 const headers={Host:'board.localhost:4173',Origin:board,'X-Worklog-Request':'1'};
 const response=await context.request.get('http://127.0.0.1:4173/api/board',{headers});
 if(!response.ok())throw new Error('Shared fixture read failed');
 const snapshot=await response.json() as components['schemas']['BoardSnapshot'];
 const result=await context.request.post('http://127.0.0.1:4173/api/cards',{headers,data:{title,notes:'',columnId:columnId??snapshot.columns[0]!.id,jiraUrl,mattermostLinks}});
 if(!result.ok())throw new Error('Shared fixture create failed');
 const next=await result.json() as components['schemas']['BoardSnapshot'];return next.cards.find(card=>card.title===title)!;
}
export async function sharedRead(context:BrowserContext){
 const response=await context.request.get('http://127.0.0.1:4173/api/board',{headers:{Host:'board.localhost:4173'}});if(!response.ok())throw new Error('Shared read failed');return await response.json() as components['schemas']['BoardSnapshot'];
}
export async function sharedWrite(context:BrowserContext,path:string,data:unknown,method='POST'){
 const response=await context.request.fetch('http://127.0.0.1:4173/api'+path,{method,headers:{Host:'board.localhost:4173',Origin:board,'X-Worklog-Request':'1'},data});if(!response.ok())throw new Error('Shared fixture write failed');return await response.json() as components['schemas']['BoardSnapshot'];
}
export async function interactionColumns(context:BrowserContext,prefix:string){
 let snapshot=await sharedRead(context);const ids:string[]=[];
 for(let i=0;i<3;i++){snapshot=await sharedWrite(context,'/columns',{name:prefix+i,expectedBoardRevision:snapshot.revision});ids.push(snapshot.columns.at(-1)!.id);}
 snapshot=await sharedWrite(context,'/columns/reorder',{columnIds:[...ids,...snapshot.columns.filter(column=>!ids.includes(column.id)).map(column=>column.id)],expectedBoardRevision:snapshot.revision});return {ids,snapshot};
}
