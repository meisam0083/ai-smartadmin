import { useEffect, useState } from 'react';

type Conn = { id:number; name:string; token:string; chatId:string; active:boolean };
type QItem = { id:number; text:string; status:string; time:string };

const faNum = (n:any) => String(n).replace(/[0-9]/g, (d:any) => '۰۱۲۳۴۵۶۷۸۹'[d]);

export default function App(){
  const [tab, setTab] = useState('dash');
  const [topic, setTopic] = useState('');
  const [tone, setTone] = useState('خبری');
  const [words, setWords] = useState(180);
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);
  const [health, setHealth] = useState<any>(null);
  const [conns, setConns] = useState<Conn[]>(()=>{ try{return JSON.parse(localStorage.getItem('sa_conns')||'[]')}catch{return[]} });
  const [queue, setQueue] = useState<QItem[]>(()=>{ try{return JSON.parse(localStorage.getItem('sa_queue')||'[]')}catch{return[]} });
  const [rssUrl, setRssUrl] = useState('');
  const [city, setCity] = useState('تهران');
  const [weather, setWeather] = useState('');
  const [cName, setCName] = useState('');
  const [cToken, setCToken] = useState('');
  const [cChat, setCChat] = useState('');

  useEffect(()=>{ fetch('/api/health').then(r=>r.json()).then(setHealth).catch(()=>setHealth({status:'local'})); },[]);
  useEffect(()=>{ localStorage.setItem('sa_conns', JSON.stringify(conns)); },[conns]);
  useEffect(()=>{ localStorage.setItem('sa_queue', JSON.stringify(queue)); },[queue]);

  async function generate(){
    if(!topic.trim()) return alert('موضوع را بنویسید');
    setLoading(true);
    try{
      const r = await fetch('/api/gemini',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prompt:topic,tone,words})});
      const j = await r.json();
      if(!r.ok) throw new Error(j.error||'خطای سرور');
      setResult(j.text);
    }catch(e:any){ alert('خطا: '+e.message); }finally{ setLoading(false); }
  }

  function addQueue(){
    if(!result) return alert('اول تولید کن');
    const item:QItem = {id:Date.now(), text:result, status:'آماده', time:new Date().toLocaleString('fa-IR')};
    setQueue([item,...queue]);
    alert('✓ به صف انتشار اضافه شد');
  }

  async function sendTelegram(q:QItem){
    const active = conns.find(c=>c.active) || conns[0];
    if(!active) return alert('اول در تب اتصال‌ها یک ربات اضافه و فعال کن');
    try{
      const r = await fetch('/api/telegram',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:active.token, chatId:active.chatId, text:q.text})});
      const j = await r.json();
      if(!r.ok) throw new Error(j.error||'ارسال ناموفق');
      setQueue(queue.map(x=>x.id===q.id?{...x,status:'منتشرشده'}:x));
      alert('منتشر شد');
    }catch(e:any){ alert('خطا: '+e.message); }
  }

  function saveConn(){
    if(!cName||!cToken||!cChat) return alert('نام، توکن و چت‌آیدی لازم است');
    setConns([...conns,{id:Date.now(),name:cName,token:cToken,chatId:cChat,active:conns.length===0}]);
    setCName('');setCToken('');setCChat('');
  }

  async function loadRss(){
    if(!rssUrl) return alert('آدرس RSS بده');
    try{
      const r = await fetch(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(rssUrl)}`);
      const j = await r.json();
      const items = (j.items||[]).slice(0,5);
      if(!items.length) return alert('خبری پیدا نشد');
      setResult(items.map((it:any)=>`📰 ${it.title}\n${(it.description||'').replace(/<[^>]+>/g,'').slice(0,300)}\n🔗 منبع: ${it.link}`).join('\n\n---\n\n'));
      setTab('create');
    }catch{ alert('خطا در خواندن RSS'); }
  }

  async function loadWeather(){
    try{
      const g = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=fa&format=json`).then(r=>r.json());
      if(!g.results?.length) return setWeather('شهر پیدا نشد');
      const {latitude, longitude, name, country} = g.results[0];
      const w = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&timezone=Asia%2FTehran`).then(r=>r.json());
      setWeather(`${name} (${country}) — دما ${faNum(w.current.temperature_2m)} درجه، رطوبت ${faNum(w.current.relative_humidity_2m)}٪، باد ${faNum(w.current.wind_speed_10m)}`);
    }catch{ setWeather('خطا در آب‌وهوا'); }
  }

  const today = new Date().toLocaleDateString('fa-IR');

  return(
    <div className="min-h-screen p-3 max-w-3xl mx-auto space-y-3">
      <header className="card flex justify-between items-center">
        <b>مدیر هوشمند شبکه‌های اجتماعی</b>
        <span className="text-xs opacity-70">{today} | {health?faNum(JSON.stringify(health.status||'ok')):'...'}</span>
      </header>

      <div className="flex gap-2 flex-wrap">
        {[['dash','داشبورد'],['create','تولید محتوا'],['rss','اخبار و RSS'],['queue','صف ('+faNum(queue.length)+')'],['conns','اتصال‌ها'],['cal','تقویم'],['moti','انگیزشی'],['weather','آب‌وهوا']].map(([k,l])=>(
          <button key={k} onClick={()=>setTab(k)} className={'tab'+(tab===k?' active':'')}>{l}</button>
        ))}
      </div>

      {tab==='dash' && <div className="grid grid-cols-2 gap-2">
        <div className="card">منابع فعال<div className="text-2xl font-bold">{faNum(1)}</div></div>
        <div className="card">اتصال‌ها<div className="text-2xl font-bold">{faNum(conns.length)}</div></div>
        <div className="card">صف<div className="text-2xl font-bold">{faNum(queue.length)}</div></div>
        <div className="card">منتشرشده<div className="text-2xl font-bold">{faNum(queue.filter(q=>q.status==='منتشرشده').length)}</div></div>
        <div className="card col-span-2 text-xs leading-6">زمان‌بند Netlify حداقل {faNum(1)} دقیقه است. واحد ثانیه در UI هست ولی سرور به {faNum(60)} ثانیه گرد می‌کند. دیتابیس پایدار نیاز به DATABASE_URL دارد.</div>
      </div>}

      {tab==='create' && <div className="card space-y-2">
        <textarea value={topic} onChange={e=>setTopic(e.target.value)} placeholder="موضوع..." rows={3} />
        <div className="flex gap-2">
          <select value={tone} onChange={e=>setTone(e.target.value)}><option>خبری</option><option>تبلیغاتی</option><option>آموزشی</option><option>انگیزشی</option></select>
          <input type="number" value={words} onChange={e=>setWords(Number(e.target.value))} placeholder="کلمات" />
        </div>
        <button className="btn" disabled={loading} onClick={generate}>{loading?'در حال تولید...':'تولید با Gemini'}</button>
        {result && <><div className="border rounded-xl p-3 whitespace-pre-wrap leading-8 text-sm">{result}</div><button className="btn" onClick={addQueue}>افزودن به صف</button></>}
      </div>}

      {tab==='rss' && <div className="card space-y-2">
        <input value={rssUrl} onChange={e=>setRssUrl(e.target.value)} placeholder="https://.../rss" dir="ltr" />
        <button className="btn" onClick={loadRss}>خواندن RSS</button>
        <p className="text-xs opacity-60">خروجی در تب تولید محتوا نمایش داده می‌شود. بررسی خودکار و سقف انتشار در فانکشن scheduler سمت سرور است.</p>
      </div>}

      {tab==='queue' && <div className="space-y-2">{queue.length===0?<div className="card text-sm">صف خالی است</div>:queue.map(q=>(
        <div key={q.id} className="card text-sm space-y-2"><div className="whitespace-pre-wrap leading-7">{q.text.slice(0,500)}</div>
        <div className="flex gap-2 items-center"><span className="text-xs bg-slate-100 rounded px-2 py-1">{q.status} | {q.time}</span>
        <button className="btn" onClick={()=>sendTelegram(q)}>انتشار در تلگرام</button>
        <button className="tab" onClick={()=>setQueue(queue.filter(x=>x.id!==q.id))}>حذف</button></div></div>))}</div>}

      {tab==='conns' && <div className="card space-y-2">
        <input value={cName} onChange={e=>setCName(e.target.value)} placeholder="نام اتصال" />
        <input value={cToken} onChange={e=>setCToken(e.target.value)} placeholder="Bot Token" dir="ltr" />
        <input value={cChat} onChange={e=>setCChat(e.target.value)} placeholder="Chat ID مثل @channel یا -100..." dir="ltr" />
        <button className="btn" onClick={saveConn}>ذخیره اتصال</button>
        {conns.map(c=>(<div key={c.id} className="border rounded-xl p-2 text-sm flex justify-between"><span>{c.name} | {c.chatId} | {c.active?'فعال':'غیرفعال'}</span><button className="tab" onClick={()=>setConns(conns.map(x=>({...x,active:x.id===c.id})))}>فعال کن</button></div>))}
        <p className="text-xs opacity-60">توکن فقط برای ارسال به سرور فرستاده می‌شود و در گیت ذخیره نمی‌شود. بله و اینستاگرام نیاز به API رسمی جدا دارند.</p>
      </div>}

      {tab==='cal' && <div className="card text-sm leading-8">📅 تقویم و مناسبت‌های روز<br/>🌤 امروز {today}<br/>🇮🇷 تاریخ شمسی: {today}<br/>🌍 میلادی: {new Date().toLocaleDateString('en-GB')}<br/>#تقویم_روز #مناسبت_های_روز<br/>مناسبت‌ها به API معتبر تقویم نیاز دارند، بدون API مناسبت ساختگی نشان نمی‌دهم.</div>}

      {tab==='moti' && <div className="card space-y-2"><p className="text-sm">پیام انگیزشی مستقل از تقویم با Gemini</p><button className="btn" onClick={()=>{setTopic('یک پیام انگیزشی کوتاه فارسی برای شروع روز'); setTab('create');}}>ساخت انگیزشی</button></div>}

      {tab==='weather' && <div className="card space-y-2">
        <input value={city} onChange={e=>setCity(e.target.value)} placeholder="نام شهر" />
        <button className="btn" onClick={loadWeather}>جست‌وجوی آب‌وهوا</button>
        {weather && <div className="text-sm">{weather}</div>}
      </div>}
    </div>
  );
}