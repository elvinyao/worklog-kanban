import type { BrowserContext } from '@playwright/test';
import type { components } from '../../src/generated/shared-api';
import { board } from './fixtures';
export async function seedCard(context:BrowserContext,title:string,jiraUrl:string|null=null,mattermostLinks:{url:string;description:string}[]=[]){
 const headers={Host:'board.localhost:4173',Origin:board,'X-Worklog-Request':'1'};
 const response=await context.request.get('http://127.0.0.1:4173/api/board',{headers});
 if(!response.ok())throw new Error('Shared fixture read failed');
 const snapshot=await response.json() as components['schemas']['BoardSnapshot'];
 const result=await context.request.post('http://127.0.0.1:4173/api/cards',{headers,data:{title,notes:'',columnId:snapshot.columns[0]!.id,jiraUrl,mattermostLinks}});
 if(!result.ok())throw new Error('Shared fixture create failed');
 const next=await result.json() as components['schemas']['BoardSnapshot'];return next.cards.find(card=>card.title===title)!;
}
