export async function handler(){
  return { statusCode:200, body: JSON.stringify({
    status:'ok',
    db: process.env.DATABASE_URL ? 'connected' : 'not-configured',
    gemini: Object.keys(process.env).some(k=>k.startsWith('GEMINI_API_KEY_')) ? 'keys-found' : 'no-keys',
    scheduler: 'netlify-1min-min'
  })};
}