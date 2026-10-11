export async function handler(event){
  if(event.httpMethod!=='POST') return {statusCode:405, body:'Method Not Allowed'};
  try{
    const {token, chatId, text} = JSON.parse(event.body||'{}');
    if(!token||!chatId||!text) return {statusCode:400, body:JSON.stringify({error:'token, chatId, text required'})};
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`,{
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({chat_id:chatId, text:text.slice(0,4000)})
    });
    const j = await r.json();
    if(!j.ok) return {statusCode:400, body:JSON.stringify({error:j.description||'telegram error'})};
    return {statusCode:200, body:JSON.stringify({ok:true, message_id:j.result.message_id})};
  }catch(e){ return {statusCode:500, body:JSON.stringify({error:String(e)})}; }
}