import type {Handler} from '@netlify/functions';
import {db} from './_lib/db';
import {json,parseBody} from './_lib/http';
import {requireUser} from './_lib/auth';
import {trustedMutation} from './_lib/origin';

type Input={id?:unknown;title?:unknown;content?:unknown;connectionId?:unknown;scheduledAt?:unknown;status?:unknown};
const validId=(v:string)=>/^[0-9a-f-]{36}$/i.test(v);
async function ensure(sql:ReturnType<typeof db>){
 await sql`CREATE TABLE IF NOT EXISTS content_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  connection_id uuid,
  title varchar(300) NOT NULL DEFAULT '',
  content text NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'draft',
  scheduled_at timestamptz,
  source_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
 )`;
 await sql`CREATE INDEX IF NOT EXISTS content_queue_user_created_idx ON content_queue(user_id,created_at DESC)`;
}
export const handler:Handler=async event=>{
 try{
  const user=await requireUser(event.headers.cookie);if(!user)return json(401,{error:'UNAUTHENTICATED'});
  const sql=db();await ensure(sql);
  if(event.httpMethod==='GET'){
   const rows=await sql`SELECT q.id,q.title,q.content,q.status,q.scheduled_at AS "scheduledAt",q.created_at AS "createdAt",q.connection_id AS "connectionId",c.name AS "connectionName" FROM content_queue q LEFT JOIN social_connections c ON c.id=q.connection_id AND c.user_id=q.user_id WHERE q.user_id=${user} ORDER BY q.created_at DESC LIMIT 100`;
   return json(200,{items:rows});
  }
  if(!trustedMutation(event))return json(403,{error:'ORIGIN_NOT_ALLOWED'});
  if(event.httpMethod==='POST'){
   const b=parseBody(event.body) as Input;
   const title=typeof b.title==='string'?b.title.trim().slice(0,300):'';
   const content=typeof b.content==='string'?b.content.trim():'';
   const connectionId=typeof b.connectionId==='string'&&b.connectionId?b.connectionId:null;
   const scheduledAt=typeof b.scheduledAt==='string'&&b.scheduledAt?new Date(b.scheduledAt):null;
   if(!content||content.length>20000||title.length>300)return json(400,{error:'INVALID_INPUT'});
   if(connectionId&&!validId(connectionId))return json(400,{error:'INVALID_CONNECTION'});
   if(scheduledAt&&Number.isNaN(scheduledAt.getTime()))return json(400,{error:'INVALID_SCHEDULE'});
   if(connectionId){const c=await sql`SELECT id FROM social_connections WHERE id=${connectionId} AND user_id=${user} AND enabled=true`;if(!c.length)return json(400,{error:'INVALID_CONNECTION'});}
   const status=scheduledAt?'scheduled':'draft';
   const rows=await sql`INSERT INTO content_queue(user_id,connection_id,title,content,status,scheduled_at) VALUES(${user},${connectionId},${title},${content},${status},${scheduledAt?.toISOString()??null}) RETURNING id,title,content,status,scheduled_at AS "scheduledAt",created_at AS "createdAt",connection_id AS "connectionId"`;
   return json(201,{item:rows[0]});
  }
  if(event.httpMethod==='PATCH'){
   const b=parseBody(event.body) as Input;const id=String(b.id??''),status=String(b.status??'');
   if(!validId(id)||!['draft','ready'].includes(status))return json(400,{error:'INVALID_INPUT'});
   const rows=await sql`UPDATE content_queue SET status=${status},updated_at=now() WHERE id=${id} AND user_id=${user} RETURNING id,status`;
   return rows.length?json(200,{item:rows[0]}):json(404,{error:'NOT_FOUND'});
  }
  if(event.httpMethod==='DELETE'){
   const id=event.queryStringParameters?.id;
   if(!id||!validId(id))return json(400,{error:'INVALID_ID'});
   const rows=await sql`DELETE FROM content_queue WHERE id=${id} AND user_id=${user} RETURNING id`;
   return rows.length?json(200,{deleted:true}):json(404,{error:'NOT_FOUND'});
  }
  return json(405,{error:'METHOD_NOT_ALLOWED'});
 }catch(e){
  if(e instanceof Error&&e.message==='DATABASE_NOT_CONFIGURED')return json(503,{error:'DATABASE_NOT_CONFIGURED'});
  if(e instanceof Error&&e.message==='INVALID_BODY')return json(400,{error:'INVALID_BODY'});
  return json(500,{error:'SERVER_ERROR'});
 }
};
