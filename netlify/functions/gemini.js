export async function handler(event){
  if(event.httpMethod!=='POST') return {statusCode:405, body:'Method Not Allowed'};
  try{
    const {prompt, tone, words} = JSON.parse(event.body||'{}');
    if(!prompt) return {statusCode:400, body:JSON.stringify({error:'prompt required'})};
    const keys = Object.keys(process.env).filter(k=>/^GEMINI_API_KEY_\d+$/.test(k)).sort().map(k=>process.env[k]).filter(Boolean);
    if(!keys.length) return {statusCode:500, body:JSON.stringify({error:'کلید GEMINI_API_KEY_1 در Netlify ست نشده'})};
    let last='unknown';
    for(const key of keys){
      try{
        const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key='+key,{
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({contents:[{parts:[{text:`لحن ${tone||'خبری'} حدود ${words||180} کلمه. موضوع: ${prompt}. فارسی روان، بدون لینک جعلی.`}]}]})
        });
        if(r.status===429||r.status===503){ last='quota '+r.status; continue; }
        if(!r.ok){ last='status '+r.status; continue; }
        const j = await r.json();
        const text = j?.candidates?.[0]?.content?.parts?.map(p=>p.text).join('')||'';
        return {statusCode:200, body:JSON.stringify({text})};
      }catch(e){ last=String(e); }
    }
    return {statusCode:502, body:JSON.stringify({error:'همه کلیدها ناموفق: '+last})};
  }catch(e){ return {statusCode:500, body:JSON.stringify({error:String(e)})}; }
}
