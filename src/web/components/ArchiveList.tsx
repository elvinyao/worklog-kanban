import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {api,errorText,type ArchiveSummary} from '../api';
import {useLanguage} from '../i18n';
import {ArchivePages,emptyArchivePages} from '../state/archive-pages';

export function ArchiveList({active,revision,navigate,rename}:{active:boolean;revision:string;navigate:(hash:string)=>void;rename:(archive:ArchiveSummary)=>void}){
 const {t,date}=useLanguage();const [query,setQuery]=useState('');const [state,setState]=useState(emptyArchivePages);
 const {items,total,cursor,busy,error}=state;const pages=useRef<ArchivePages|null>(null);
 const scroll=useRef(0);
 useLayoutEffect(()=>{if(active)window.scrollTo(0,scroll.current);return()=>{if(active)scroll.current=window.scrollY;};},[active]);
 useEffect(()=>{
  const reader=new ArchivePages(api.archives,setState);pages.current=reader;
  return()=>{reader.dispose();pages.current=null;};
 },[]);
 useEffect(()=>{pages.current?.configure(query,revision,active);},[active,revision,query]);
 const link=(event:React.MouseEvent<HTMLAnchorElement>,hash:string)=>{if(!event.metaKey&&!event.ctrlKey&&!event.shiftKey&&!event.altKey){event.preventDefault();navigate(hash);}};
 return <section className="archive-list" hidden={!active} aria-label={t('archive.list')}><div className="archive-list-heading"><h2>{t('archive.nav')}</h2><p className="hint">{t('archive.listSummary',{count:total})}</p></div><label className="archive-search">{t('archive.search')}<input type="search" value={query} maxLength={200} placeholder={t('archive.searchHint')} onChange={event=>setQuery(event.target.value)}/></label>
  {!!error&&<div role="alert" className="error"><p>{t(errorText(error))}</p><button onClick={()=>pages.current?.retry()}>{t('sync.refresh')}</button></div>}
  <div aria-busy={busy}>{items.map(archive=><article className="archive-row" key={archive.id}><div><a className="archive-name" href={'#/archives/'+archive.id} onClick={event=>link(event,'#/archives/'+archive.id)}>{archive.name}</a><p className="archive-description">{archive.description}</p></div><time dateTime={archive.createdAt}>{date(archive.createdAt)}</time><span>{t('archive.counts',{cards:archive.cardCount,jiras:archive.jiraLinkCount})}</span><div className="row-actions"><a className="button-link" href={'#/archives/'+archive.id} onClick={event=>link(event,'#/archives/'+archive.id)}>{t('archive.view')}</a><button onClick={()=>rename(archive)}>{t('archive.rename')}</button></div></article>)}</div>
  {!busy&&!error&&!items.length&&<div className="archive-empty"><p>{t(query?'archive.noResults':'archive.empty')}</p>{!query&&<a href="#" onClick={event=>link(event,'')}>{t('archive.openCurrent')}</a>}</div>}
  {busy&&<p role="status" className="hint">{t('board.loading')}</p>}{cursor&&<button className="archive-more" disabled={busy||!!error} onClick={()=>pages.current?.more()}>{t('archive.more')}</button>}
 </section>;
}
