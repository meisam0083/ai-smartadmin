import type {Handler} from '@netlify/functions';
import {db} from './_lib/db';
import {json,parseBody} from './_lib/http';
import {requireUser} from './_lib/auth';
import {decryptSecret} from './_lib/security';
import {trustedMutation} from './_lib/origin';

type Input={id?:unknown};
export const handler:Handler=async event=>{
 try{
  const user=await requireUser(event.headers.cookie);
  if(!user)return json(401,{error:'UNAUTHENTICATED'});
  if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});
  if(!trustedMutation(event))return json(403,{error:'ORIGIN_NOT_ALLOWED'});
  const body=parseBody(event.body) as Input;
  const id=String(body.id??'');
  if(!/^[0-9a-f-]{36}$/i.test(id))return json(400,{error:'INVALID_ID'});
  const sql=db();
  const rows=await sql`SELECT name,account_id,encrypted_credentials FROM social_connections WHERE id=${id} AND user_id=${user} AND platform='telegram' AND enabled=true LIMIT 1`;
  if(!rows.length)return json(404,{error:'CONNECTION_UNAVAILABLE'});
  const token=decryptSecret(String(rows[0].encrypted_credentials));
  const text='✅ پیام آزمایشی مدیر هوشمند\n\nاتصال ربات تلگرام با موفقیت کار می‌کند.';
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),12000);
  try{
   const response=await fetch('https://api.telegram.org/bot'+token+'/sendMessage',{
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify({chat_id:rows[0].account_id,text,disable_web_page_preview:true}),
    signal:controller.signal
   });
   const result=await response.json() as {ok?:boolean;description?:string;result?:{message_id?:number}};
   if(!response.ok||!result.ok)return json(502,{error:'TELEGRAM_SEND_FAILED',detail:result.description??'Telegram API rejected the test message'});
   return json(200,{ok:true,messageId:result.result?.message_id??null,connectionName:rows[0].name});
  }finally{clearTimeout(timeout)}
 }catch(error){
  if(error instanceof SyntaxError)return json(400,{error:'INVALID_JSON'});
  if(error instanceof Error&&error.message==='DATABASE_NOT_CONFIGURED')return json(503,{error:'DATABASE_NOT_CONFIGURED'});
  if(error instanceof Error&&error.message==='ENCRYPTION_KEY_NOT_CONFIGURED')return json(503,{error:'ENCRYPTION_KEY_NOT_CONFIGURED'});
  if(error instanceof Error&&error.message==='ENCRYPTION_KEY_MUST_BE_32_BYTES_BASE64')return json(503,{error:'ENCRYPTION_KEY_INVALID'});
  return json(500,{error:'SERVER_ERROR'});
 }
};
