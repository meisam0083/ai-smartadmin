import type {Handler} from '@netlify/functions';
import {db} from './_lib/db';
import {json,parseBody} from './_lib/http';
import {requireUser} from './_lib/auth';
import {trustedMutation} from './_lib/origin';
import {decryptSecret} from './_lib/security';

const validId=(v:string)=>/^[0-9a-f-]{36}$/i.test(v);
type Input={id?:unknown};
export const handler:Handler=async event=>{
 try{
  const user=await requireUser(event.headers.cookie);
  if(!user)return json(401,{error:'UNAUTHENTICATED'});
  if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});
  if(!trustedMutation(event))return json(403,{error:'ORIGIN_NOT_ALLOWED'});
  const body=parseBody(event.body) as Input;
  const id=String(body.id??'');
  if(!validId(id))return json(400,{error:'INVALID_ID'});
  const sql=db();
  await sql`ALTER TABLE content_queue ADD COLUMN IF NOT EXISTS published_at timestamptz`;
  await sql`ALTER TABLE content_queue ADD COLUMN IF NOT EXISTS telegram_message_id text`;
  await sql`ALTER TABLE content_queue ADD COLUMN IF NOT EXISTS last_error text`;
  // Claim the row atomically to avoid two simultaneous clicks sending the same post.
  const claimed=await sql`UPDATE content_queue SET status='sending',last_error=NULL,updated_at=now() WHERE id=${id} AND user_id=${user} AND status='ready' AND connection_id IS NOT NULL RETURNING id,title,content,connection_id`;
  if(!claimed.length)return json(409,{error:'ITEM_NOT_READY'});
  const item=claimed[0] as {id:string;title:string;content:string;connection_id:string};
  try{
   const rows=await sql`SELECT account_id,encrypted_credentials FROM social_connections WHERE id=${item.connection_id} AND user_id=${user} AND platform='telegram' AND enabled=true LIMIT 1`;
   if(!rows.length)throw new Error('CONNECTION_UNAVAILABLE');
   const token=decryptSecret(String(rows[0].encrypted_credentials));
   const message=[item.title?.trim(),item.content?.trim()].filter(Boolean).join('\n\n').slice(0,4096);
   if(!message)throw new Error('EMPTY_MESSAGE');
   const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),15000);
   let response:Response;
   try{
    response=await fetch('https://api.telegram.org/bot'+token+'/sendMessage',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({chat_id:rows[0].account_id,text:message,disable_web_page_preview:false}),signal:controller.signal});
   }finally{clearTimeout(timer)}
   const result=await response.json() as {ok?:boolean;description?:string;result?:{message_id?:number;date?:number}};
   if(!response.ok||!result.ok)throw new Error('TELEGRAM_SEND_FAILED');
   await sql`UPDATE content_queue SET status='published',published_at=now(),telegram_message_id=${String(result.result?.message_id??'')},last_error=NULL,updated_at=now() WHERE id=${item.id} AND user_id=${user}`;
   return json(200,{ok:true,status:'published',messageId:result.result?.message_id??null});
  }catch(error){
   await sql`UPDATE content_queue SET status='failed',last_error=${error instanceof Error?error.message:'UNKNOWN_SEND_ERROR'},updated_at=now() WHERE id=${item.id} AND user_id=${user}`;
   if(error instanceof Error&&['CONNECTION_UNAVAILABLE','EMPTY_MESSAGE'].includes(error.message))return json(422,{error:error.message});
   if(error instanceof Error&&error.message==='ENCRYPTION_KEY_NOT_CONFIGURED')return json(503,{error:'ENCRYPTION_KEY_NOT_CONFIGURED'});
   if(error instanceof Error&&error.message==='ENCRYPTION_KEY_MUST_BE_32_BYTES_BASE64')return json(503,{error:'ENCRYPTION_KEY_INVALID'});
   return json(502,{error:'TELEGRAM_SEND_FAILED'});
  }
 }catch(error){
  if(error instanceof Error&&error.message==='INVALID_BODY')return json(400,{error:'INVALID_BODY'});
  if(error instanceof Error&&error.message==='DATABASE_NOT_CONFIGURED')return json(503,{error:'DATABASE_NOT_CONFIGURED'});
  return json(500,{error:'SERVER_ERROR'});
 }
};
