import type {Handler} from '@netlify/functions';
import {db} from './_lib/db';
import {decryptSecret} from './_lib/security';
import {json} from './_lib/http';

export const config={schedule:'*/5 * * * *'};
export const handler:Handler=async()=>{
 let published=0,failed=0;
 try{
  const sql=db();
  const claimed=await sql`UPDATE content_queue SET status='sending',updated_at=now() WHERE id IN (SELECT id FROM content_queue WHERE status='scheduled' AND scheduled_at IS NOT NULL AND scheduled_at<=now() ORDER BY scheduled_at ASC FOR UPDATE SKIP LOCKED LIMIT 10) RETURNING id,user_id,title,content,connection_id`;
  for(const item of claimed as Array<{id:string;user_id:string;title:string;content:string;connection_id:string|null}>){
   try{
    if(!item.connection_id)throw new Error('CONNECTION_UNAVAILABLE');
    const rows=await sql`SELECT account_id,encrypted_credentials FROM social_connections WHERE id=${item.connection_id} AND user_id=${item.user_id} AND platform='telegram' AND enabled=true LIMIT 1`;
    if(!rows.length)throw new Error('CONNECTION_UNAVAILABLE');
    const token=decryptSecret(String(rows[0].encrypted_credentials));
    const message=[item.title?.trim(),item.content?.trim()].filter(Boolean).join('\n\n').slice(0,4096);
    if(!message)throw new Error('EMPTY_MESSAGE');
    const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),12000);
    let response:Response;
    try{response=await fetch('https://api.telegram.org/bot'+token+'/sendMessage',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({chat_id:rows[0].account_id,text:message,disable_web_page_preview:false}),signal:controller.signal})}finally{clearTimeout(timeout)}
    const result=await response.json() as {ok?:boolean;description?:string;result?:{message_id?:number}};
    if(!response.ok||!result.ok)throw new Error('TELEGRAM_SEND_FAILED');
    await sql`UPDATE content_queue SET status='published',updated_at=now() WHERE id=${item.id}`;
    await sql`INSERT INTO audit_events(user_id,action,subject_id,detail) VALUES(${item.user_id},'scheduled_telegram_published',${item.id},${JSON.stringify({messageId:result.result?.message_id??null})}::jsonb)`;
    published++;
   }catch(error){
    await sql`UPDATE content_queue SET status='failed',updated_at=now() WHERE id=${item.id}`;
    await sql`INSERT INTO audit_events(user_id,action,subject_id,detail) VALUES(${item.user_id},'scheduled_telegram_failed',${item.id},${JSON.stringify({reason:error instanceof Error?error.message:'UNKNOWN'})}::jsonb)`;
    failed++;
   }
  }
  return json(200,{ok:true,processed:claimed.length,published,failed});
 }catch(error){
  if(error instanceof Error&&error.message==='DATABASE_NOT_CONFIGURED')return json(503,{error:'DATABASE_NOT_CONFIGURED'});
  return json(500,{error:'SCHEDULER_FAILED'});
 }
};
