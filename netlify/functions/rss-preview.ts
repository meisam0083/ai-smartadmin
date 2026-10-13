import type {Handler} from '@netlify/functions';
import {lookup} from 'node:dns/promises';
import {isIP} from 'node:net';
import {json,parseBody} from './_lib/http';
import {requireUser} from './_lib/auth';
import {trustedMutation} from './_lib/origin';

type Input={url?:unknown;imagesEnabled?:unknown};
const blocked=(ip:string)=>{
  if(isIP(ip)===4){const p=ip.split('.').map(Number);return p[0]===0||p[0]===10||p[0]===127||p[0]>=224||(p[0]===169&&p[1]===254)||(p[0]===172&&p[1]>=16&&p[1]<=31)||(p[0]===192&&p[1]===168)||(p[0]===100&&p[1]>=64&&p[1]<=127)||(p[0]===192&&p[1]===0)||(p[0]===198&&(p[1]===18||p[1]===19));}
  if(isIP(ip)===6){const v=ip.toLowerCase();return v==='::'||v==='::1'||v.startsWith('fe80:')||v.startsWith('fc')||v.startsWith('fd')||v.startsWith('ff')||v.startsWith('::ffff:')||v.startsWith('2001:db8:');}
  return true;
};
async function safeTarget(raw:string){
  let u:URL;try{u=new URL(raw)}catch{return null}
  if(!['https:','http:'].includes(u.protocol)||u.username||u.password||u.port&&u.port!=='80'&&u.port!=='443')return null;
  const host=u.hostname.toLowerCase().replace(/^\[|\]$/g,'');
  if(host==='localhost'||host.endsWith('.localhost')||host.endsWith('.local')||isIP(host)&&blocked(host))return null;
  if(!isIP(host)){try{const addresses=await lookup(host,{all:true,verbatim:true});if(!addresses.length||addresses.some(a=>blocked(a.address)))return null;}catch{return null}}
  return u;
}
const decode=(s:string)=>s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/&amp;/gi,'&').replace(/&lt;/gi,'<').replace(/&gt;/gi,'>').replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'").replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Math.min(0x10ffff,Number(n)||0))).replace(/&#x([\da-f]+);/gi,(_,n)=>String.fromCodePoint(Math.min(0x10ffff,parseInt(n,16)||0))).replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
const tag=(block:string,names:string[])=>{for(const name of names){const re=new RegExp('<'+name+'(?:\\s[^>]*)?>([\\s\\S]*?)<\\/'+name+'\\s*>','i');const m=block.match(re);if(m)return decode(m[1]);}return '';};
const attr=(s:string,name:string)=>{const m=s.match(new RegExp("(?:^|\\\\s)"+name+"\\\\s*=\\\\s*[\"']([^\"']+)[\"']","i"));return m?decode(m[1]):''};
function imageFrom(block:string,base:string){
 const rawHtml=(names:string[])=>{for(const name of names){const re=new RegExp('<'+name+'(?:\\s[^>]*)?>([\\s\\S]*?)<\\/'+name+'\\s*>','i');const m=block.match(re);if(m)return m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1');}return '';};
 const tags=block.match(/<(?:media:content|media:thumbnail|enclosure|content:encoded|description|summary|content)(?:\s[^>]*)?>[\s\S]*?(?:<\/[^>]+>)?|<(?:media:content|media:thumbnail|enclosure)\b[^>]*\/?>/gi)||[];
 for(const t of tags){const u=attr(t,'url')||attr(t,'href');const type=attr(t,'type');if(u&&(t.startsWith('<media:')||type.startsWith('image/')||/\.(jpe?g|png|webp|gif|avif)(?:\?|$)/i.test(u))){try{const x=new URL(u,base);if(['http:','https:'].includes(x.protocol))return x.href}catch{}}}
 const html=rawHtml(['content:encoded','description','summary','content']);
 const m=html.match(/<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/i);
 if(m){try{const x=new URL(m[1],base);if(['http:','https:'].includes(x.protocol))return x.href}catch{}}
 return '';
}
async function readLimited(response:Response,limit:number){const reader=response.body?.getReader();if(!reader)return '';const chunks:Uint8Array[]=[];let size=0;while(true){const r=await reader.read();if(r.done)break;size+=r.value.byteLength;if(size>limit){await reader.cancel();throw new Error('FEED_TOO_LARGE')}chunks.push(r.value)}const all=new Uint8Array(size);let offset=0;for(const c of chunks){all.set(c,offset);offset+=c.byteLength}return new TextDecoder('utf-8',{fatal:false}).decode(all)}
export const handler:Handler=async event=>{try{
 const user=await requireUser(event.headers.cookie);if(!user)return json(401,{error:'UNAUTHENTICATED'});
 if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});
 if(!trustedMutation(event))return json(403,{error:'ORIGIN_NOT_ALLOWED'});
 const b=parseBody(event.body,4096) as Input;const raw=typeof b.url==='string'?b.url.trim():'';
 if(!raw||raw.length>2048)return json(400,{error:'INVALID_URL'});
 let target=await safeTarget(raw);if(!target)return json(400,{error:'UNSAFE_URL'});
 let response:Response|undefined;
 for(let i=0;i<4;i++){
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),7000);
  try{response=await fetch(target.href,{method:'GET',redirect:'manual',signal:controller.signal,headers:{'user-agent':'AI-SmartAdmin-RSS/1.0 (+feed reader)','accept':'application/rss+xml, application/atom+xml, application/xml, text/xml, text/html;q=0.5'}})}finally{clearTimeout(timer)}
  if(response.status>=300&&response.status<400){const loc=response.headers.get('location');if(!loc||i===3)return json(400,{error:'TOO_MANY_REDIRECTS'});target=await safeTarget(new URL(loc,target).href);if(!target)return json(400,{error:'UNSAFE_REDIRECT'});continue;}
  break;
 }
 if(!response||!response.ok)return json(502,{error:'FEED_FETCH_FAILED',status:response?.status??0});
 const type=response.headers.get('content-type')||'';if(!/(xml|rss|atom|text\/plain|text\/html)/i.test(type))return json(415,{error:'UNSUPPORTED_FEED_TYPE'});
 const xml=await readLimited(response,1024*1024);
 if(/<!DOCTYPE|<!ENTITY/i.test(xml))return json(400,{error:'UNSAFE_XML'});
 const blocks=xml.match(/<(?:item|entry)(?:\s[^>]*)?>[\s\S]*?<\/(?:item|entry)\s*>/gi)||[];
 const items=blocks.slice(0,10).map(block=>{
  const title=tag(block,['title'])||'بدون عنوان';
  let link=tag(block,['link','guid']);
  if(!link){const m=block.match(/<link\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*\/?\s*>/i);if(m)link=m[1];}
  try{link=new URL(link,target).href}catch{link=''}
  const description=tag(block,['content:encoded','description','summary','content']);
  const published=tag(block,['pubDate','published','updated','dc:date']);
  const image=b.imagesEnabled===true?imageFrom(block,target.href):'';
  return {title:title.slice(0,300),link,description:description.slice(0,2000),published,image};
 }).filter(x=>x.title!=='بدون عنوان'||x.link);
 return json(200,{source:target.origin,imagesEnabled:b.imagesEnabled===true,count:items.length,items});
 }catch(e){if(e instanceof Error&&e.message==='INVALID_BODY')return json(400,{error:'INVALID_BODY'});if(e instanceof Error&&e.message==='FEED_TOO_LARGE')return json(413,{error:'FEED_TOO_LARGE'});if(e instanceof Error&&e.name==='AbortError')return json(504,{error:'FEED_TIMEOUT'});return json(500,{error:'SERVER_ERROR'})}};
