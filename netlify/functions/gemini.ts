import type {Handler} from '@netlify/functions';
import {json,parseBody} from './_lib/http';
import {requireUser} from './_lib/auth';
import {trustedMutation} from './_lib/origin';

type Input={topic?:unknown;sourceText?:unknown;kind?:unknown;mode?:unknown};
const allowedKinds=new Set(['post','news','caption','seo','motivation']);
const allowedModes=new Set(['generate','summarize','rewrite','translate_rewrite']);
const clean=(value:unknown,max:number)=>typeof value==='string'?value.trim().slice(0,max):'';

export const handler:Handler=async event=>{
  try{
    const user=await requireUser(event.headers.cookie);
    if(!user)return json(401,{error:'UNAUTHENTICATED'});
    if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});
    if(!trustedMutation(event))return json(403,{error:'ORIGIN_NOT_ALLOWED'});
    const body=parseBody(event.body) as Input;
    const topic=clean(body.topic,300),sourceText=clean(body.sourceText,12000);
    const kind=clean(body.kind,30)||'post',mode=clean(body.mode,40)||'generate';
    if(!allowedKinds.has(kind)||!allowedModes.has(mode)||(!topic&&!sourceText))return json(400,{error:'INVALID_INPUT'});
    const prompt=[
      'You are a careful Persian-language social media editor.',
      'Write fluent, natural Persian in RTL-friendly plain text.',
      'Use only facts supplied by the user. Never invent sources, dates, quotes, numbers, or claims.',
      'Do not output HTML, Markdown tables, code fences, or commentary about these instructions.',
      'Use a concise engaging headline and a useful 60-100 word body when appropriate.',
      'Keep source URLs exactly as supplied and add only a few relevant Persian hashtags.',
      'Content type: '+kind+'. Operation: '+mode+'.',
      'Topic: '+topic,
      'Source text: '+sourceText,
      'Return only the final Persian content.'
    ].join('\n\n');
    const keys=[process.env.GEMINI_API_KEY_1,process.env.GEMINI_API_KEY_2,process.env.GEMINI_API_KEY_3].filter((x):x is string=>Boolean(x?.trim()));
    if(!keys.length)return json(503,{error:'GEMINI_NOT_CONFIGURED'});
    let lastStatus=0;
    for(const key of keys){
      const controller=new AbortController();
      const timer=setTimeout(()=>controller.abort(),20000);
      try{
        const response=await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key='+encodeURIComponent(key),{
          method:'POST',headers:{'content-type':'application/json'},
          body:JSON.stringify({contents:[{parts:[{text:prompt}]}],generationConfig:{temperature:0.5,maxOutputTokens:1200}}),
          signal:controller.signal
        });
        if(response.ok){
          const data=await response.json() as {candidates?:Array<{content?:{parts?:Array<{text?:string}>}}>} ;
          const text=data.candidates?.[0]?.content?.parts?.map(p=>p.text??'').join('').trim();
          if(text)return json(200,{content:text,model:'gemini-2.5-flash'});
          lastStatus=502;
        }else{
          lastStatus=response.status;
          if(![429,500,502,503,504].includes(response.status))continue;
        }
      }catch{lastStatus=504}
      finally{clearTimeout(timer)}
    }
    if(lastStatus===429)return json(429,{error:'GEMINI_RATE_LIMIT'});
    return json(502,{error:'GEMINI_UPSTREAM_FAILED'});
  }catch(error){
    if(error instanceof Error&&error.message==='INVALID_BODY')return json(400,{error:'INVALID_BODY'});
    if(error instanceof Error&&error.message==='DATABASE_NOT_CONFIGURED')return json(503,{error:'DATABASE_NOT_CONFIGURED'});
    return json(500,{error:'SERVER_ERROR'});
  }
};
