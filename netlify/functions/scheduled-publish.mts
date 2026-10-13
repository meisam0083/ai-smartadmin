import type {Config} from '@netlify/functions';
import {db} from './_lib/db';
import {decryptSecret} from './_lib/security';

// Netlify invokes this on its schedule, independently of the browser.
// One item per invocation; never automatically retry an ambiguous Telegram outcome.
export default async function(){
 const sql=db();
 await sql`ALTER TABLE content_queue ADD COLUMN IF NOT EXISTS published_at timestamptz`;
 await sql`ALTER TABLE content_queue ADD COLUMN IF NOT EXISTS telegram_message_id text`;
 await sql`ALTER TABLE content_queue ADD COLUMN IF NOT EXISTS last_error text`;
 const claimed=await sql`UPDATE content_queue SET status='sending',updated_at=now(),last_error=NULL
 WHERE id=(SELECT id FROM content_queue WHERE status='scheduled' AND scheduled_at<=now()
 AND connection_id IS NOT NULL ORDER BY scheduled_at ASC,id ASC LIMIT 1 FOR UPDATE SKIP LOCKED)
 AND status='scheduled' RETURNING id,user_id,title,content,connection_id`;
 if(!claimed.length)return;
 const item=claimed[0] as {id:string;user_id:string;title:string;content:string;connection_id:string};
 try{
  const connections=await sql`SELECT account_id,encrypted_credentials FROM social_connections
   WHERE id=${item.connection_id} AND user_id=${item.user_id} AND platform='telegram' AND enabled=true LIMIT 1`;
  if(!connections.length)throw new Error('CONNECTION_UNAVAILABLE');
  const token=decryptSecret(String(connections[0].encrypted_credentials));
  const message=[item.title?.trim(),item.content?.trim()].filter(Boolean).join('\n\n');
  if(!message||message.length>4096)throw new Error('INVALID_MESSAGE_LENGTH');
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),15000);
  let response:Response;
  try{
   response=await fetch('https://api.telegram.org/bot'+token+'/sendMessage',{
    method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({chat_id:connections[0].account_id,text:message,disable_web_page_preview:false}),
    signal:controller.signal
   });
  }finally{clearTimeout(timer)}
  const result=await response.json() as {ok?:boolean;description?:string;result?:{message_id?:number}};
  if(!response.ok||!result.ok)throw new Error('TELEGRAM_SEND_FAILED: '+String(result.description??response.status).slice(0,200));
  await sql`UPDATE content_queue SET status='published',published_at=now(),
   telegram_message_id=${String(result.result?.message_id??'')},last_error=NULL,updated_at=now()
   WHERE id=${item.id} AND status='sending'`;
 }catch(error){
  // Do not retry automatically: a network timeout may occur after Telegram has sent the message.
  const reason=error instanceof Error?error.message:'UNKNOWN_SEND_ERROR';
  await sql`UPDATE content_queue SET status='failed',last_error=${reason.slice(0,250)},updated_at=now()
   WHERE id=${item.id} AND status='sending'`;
 }
}
export const config:Config={schedule:'*/15 * * * *'};
