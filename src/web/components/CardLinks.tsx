import type {Card} from '../api';
import {useLanguage} from '../i18n';
import {Preview} from './Preview';

export function CardLinks({card,previews=false,showDescriptions=false}:{card:Card;previews?:boolean;showDescriptions?:boolean}){
 const {t}=useLanguage();
 const message=(link:Card['unassignedMattermostLinks'][number],index:number)=><div key={link.id}><p className="original-link"><a href={link.url} target="_blank" rel="noopener noreferrer">{t('card.openMessage',{index:index+1})}</a>{(!previews||showDescriptions)&&link.description&&<span className="shared-message-description">{link.description}</span>}</p>{previews&&<Preview resource={{kind:'mattermost',id:link.postId,team:link.team,url:link.url}}/>}</div>;
 return <>{card.jiraLinks.map(jira=><section className="jira-related" key={jira.id} aria-label={jira.key}><h3><a href={jira.url} target="_blank" rel="noopener noreferrer">{jira.key} ↗</a></h3>{previews&&<Preview resource={{kind:'jira',id:jira.key,url:jira.url}}/>}<div className="jira-messages">{jira.mattermostLinks.map(message)}</div></section>)}{card.unassignedMattermostLinks.length>0&&<section className="unassigned-messages"><h3>{t('card.unassignedMessages')}</h3>{card.unassignedMattermostLinks.map(message)}</section>}</>;
}
