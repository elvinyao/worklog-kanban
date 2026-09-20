import type {Card} from './api';
import type {Resource} from '../contracts/resource-links';
export function cardResources(card:Card,detail=false):Resource[]{
 return [...card.jiraLinks.flatMap(jira=>[{kind:'jira' as const,id:jira.key,url:jira.url},...jira.mattermostLinks.map(link=>({kind:'mattermost' as const,id:link.postId,team:link.team,url:link.url}))]),...(detail?card.unassignedMattermostLinks.map(link=>({kind:'mattermost' as const,id:link.postId,team:link.team,url:link.url})):[])];
}
