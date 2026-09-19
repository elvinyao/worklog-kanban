import MarkdownIt from 'markdown-it';
import DOMPurify from 'dompurify';
import type { MattermostPreview } from '../contracts/preview-messages';
const markdown=new MarkdownIt({html:false,linkify:false,typographer:false,breaks:true}).disable('image');
export function safeMarkdown(text:string):{html:string;truncated:boolean}{
 const truncated=text.length>1200;
 const fragment=DOMPurify.sanitize(markdown.render(text.slice(0,1200)),{
  ALLOWED_TAGS:['p','strong','em','s','code','pre','blockquote','ul','ol','li','br','a'],
  ALLOWED_ATTR:['href','title'],ALLOW_DATA_ATTR:false,ALLOW_ARIA_ATTR:false,RETURN_DOM_FRAGMENT:true,
 });
 for(const link of fragment.querySelectorAll('a')){
  const href=link.getAttribute('href')??'';
  if(!/^https?:\/\//i.test(href)){link.removeAttribute('href');continue;}
  try{const url=new URL(href);if(url.username||url.password)throw new Error('credentials');link.setAttribute('href',url.href);link.setAttribute('target','_blank');link.setAttribute('rel','noopener noreferrer');}
  catch{link.removeAttribute('href');}
 }
 const holder=document.createElement('div');holder.append(fragment);return {html:holder.innerHTML,truncated};
}
const avatarUrls=new Set<string>();
export function avatarUrl(avatar:MattermostPreview['avatar']):string|undefined{
 if(!avatar)return;
 try{
  const data=Uint8Array.from(atob(avatar.base64),char=>char.charCodeAt(0));
  if(data.length>256*1024)return;
  const valid=avatar.mime==='image/png'?[137,80,78,71,13,10,26,10].every((byte,index)=>data[index]===byte):avatar.mime==='image/jpeg'&&data[0]===255&&data[1]===216&&data[2]===255;
  if(!valid)return;const url=URL.createObjectURL(new Blob([data],{type:avatar.mime}));avatarUrls.add(url);return url;
 }catch{return;}
}
export function releaseAvatar(url:string|undefined){if(url){URL.revokeObjectURL(url);avatarUrls.delete(url);}}
export function releaseAvatars(){for(const url of avatarUrls)URL.revokeObjectURL(url);avatarUrls.clear();}
