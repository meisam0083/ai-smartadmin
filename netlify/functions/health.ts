import type {Handler} from '@netlify/functions';import {json} from './_lib/http';import {db} from './_lib/db';
export const handler:Handler=async()=>{try{const sql=db();await sql`SELECT 1`;return json(200,{status:'ready',database:'connected'})}catch{return json(503,{status:'unavailable',database:'unavailable'})}};
