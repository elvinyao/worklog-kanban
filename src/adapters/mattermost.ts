import type { SiteConfig } from '../contracts/config';
import type { MattermostPreview } from '../contracts/preview-messages';
import { parseResource, POST_ID } from '../contracts/resource-links';
import { ReadError, bytes, get, optional, readJSON, string } from './http';

async function avatar(url:string,signal:AbortSignal):Promise<NonNullable<MattermostPreview['avatar']>> {
  const response=await get(url,signal);
  const mime=response.headers.get('content-type')?.split(';')[0]?.trim();
  if(mime!=='image/png' && mime!=='image/jpeg'){void response.body?.cancel();throw new ReadError('protocol');}
  const data=await bytes(response,256*1024,signal);
  const png=[137,80,78,71,13,10,26,10].every((n,i)=>data[i]===n);
  const jpeg=data[0]===255&&data[1]===216&&data[2]===255;
  if(!(mime==='image/png'?png:jpeg))throw new ReadError('protocol');
  let binary='';for(const byte of data)binary+=String.fromCharCode(byte);
  return {mime,base64:btoa(binary)};
}
export async function mattermostPreview(postId:string,team:string,config:SiteConfig,signal:AbortSignal):Promise<MattermostPreview> {
  const resource=parseResource('mattermost',config.mattermostBaseUrl+'/'+team+'/pl/'+postId,config);
  const base=config.mattermostBaseUrl+'/api/v4';
  const post=await readJSON(base+'/posts/'+resource.id,signal,config);
  if(post.id!==resource.id || typeof post.create_at!=='number' || !Number.isSafeInteger(post.create_at) || post.create_at<0 || !Number.isFinite(new Date(post.create_at).valueOf()))throw new ReadError('protocol');
  const result:MattermostPreview={kind:'mattermost',postId:resource.id,url:resource.url,author:'',channel:null,createdAt:new Date(post.create_at).toISOString(),text:string(post.message)};
  const userId=typeof post.user_id==='string' && POST_ID.test(post.user_id) ? post.user_id : null;
  const channelId=typeof post.channel_id==='string' && POST_ID.test(post.channel_id) ? post.channel_id : null;
  if(userId){
    const user=await optional(()=>readJSON(base+'/users/'+userId,signal,config),signal);
    if(user?.id===userId) {
      const name=typeof user.nickname==='string'&&user.nickname ? user.nickname : user.username;
      if(typeof name==='string') result.author=name.slice(0,500);
    }
  }
  if(channelId){
    const channel=await optional(()=>readJSON(base+'/channels/'+channelId,signal,config),signal);
    if(channel?.id===channelId && typeof channel.display_name==='string')result.channel=channel.display_name.slice(0,500);
  }
  if(userId){
    const image=await optional(()=>avatar(base+'/users/'+userId+'/image',signal),signal);
    if(image)result.avatar=image;
  }
  return result;
}
