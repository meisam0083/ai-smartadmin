import type {HandlerEvent} from '@netlify/functions';
/** Browser mutations must originate from the configured site, not an arbitrary third-party page. */
export function trustedMutation(event:HandlerEvent){const expected=process.env.APP_ORIGIN;if(!expected)return false;try{const origin=event.headers.origin;if(!origin)return false;return new URL(origin).origin===new URL(expected).origin}catch{return false}}
