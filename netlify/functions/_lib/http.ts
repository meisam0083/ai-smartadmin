export const json=(statusCode:number,data:unknown,headers:Record<string,string>={})=>({statusCode,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff',...headers},body:JSON.stringify(data)});
export function parseBody(body:string|null,max=16384){if(!body||Buffer.byteLength(body)>max)throw new Error('INVALID_BODY');return JSON.parse(body) as unknown}
export const cookie=(token:string,maxAge:number)=>`smartadmin_session=${token}; HttpOnly; Secure; SameSite=Strict; Path=/api; Max-Age=${maxAge}`;
export function tokenFromCookie(cookieHeader:string|undefined){return cookieHeader?.split(';').map(v=>v.trim()).find(v=>v.startsWith('smartadmin_session='))?.slice('smartadmin_session='.length)}
