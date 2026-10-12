/** UI-only Persian formatting. Never apply to API keys, URLs, tokens, identifiers or wire payloads. */
export const faNumber = (value: number | bigint) => new Intl.NumberFormat('fa-IR',{useGrouping:false}).format(value);
export const faCount = (value: number | bigint) => new Intl.NumberFormat('fa-IR').format(value);
export const faDate = (value: Date | string | number, timeZone = 'Asia/Tehran') => new Intl.DateTimeFormat('fa-IR-u-ca-persian',{dateStyle:'full',timeZone}).format(new Date(value));
export const faDateTime = (value: Date | string | number, timeZone = 'Asia/Tehran') => new Intl.DateTimeFormat('fa-IR-u-ca-persian',{dateStyle:'full',timeStyle:'short',hourCycle:'h23',timeZone}).format(new Date(value));
export const faTime = (value: Date | string | number, timeZone = 'Asia/Tehran') => new Intl.DateTimeFormat('fa-IR',{hour:'2-digit',minute:'2-digit',hourCycle:'h23',timeZone}).format(new Date(value));
