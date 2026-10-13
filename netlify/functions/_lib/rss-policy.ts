// Shared, deterministic RSS selection rules. No post is fabricated to fill a quota.
export type PublicationMode='limited'|'all'|'manual';
export type FeedCandidate={guid:string;title:string;link:string;published?:string};
export type FeedPolicy={publicationMode:PublicationMode;limit:number;windowValue:number;windowUnit:'minutes'|'hours'|'days'};
export function windowMilliseconds(policy:FeedPolicy){
 const unit={minutes:60000,hours:3600000,days:86400000}[policy.windowUnit];
 if(!unit||!Number.isSafeInteger(policy.windowValue)||policy.windowValue<1)throw new Error('INVALID_WINDOW');
 return policy.windowValue*unit;
}
export function selectFeedCandidates(candidates:FeedCandidate[],alreadySeen:Set<string>,policy:FeedPolicy,publishedInWindow:number){
 const unique:FeedCandidate[]=[];const keys=new Set<string>();
 for(const candidate of candidates){
  const key=(candidate.guid||candidate.link||'').trim();
  if(!key||!candidate.title.trim()||alreadySeen.has(key)||keys.has(key))continue;
  keys.add(key);unique.push(candidate);
 }
 if(policy.publicationMode==='manual')return {publish:[] as FeedCandidate[],review:unique};
 if(policy.publicationMode==='all')return {publish:unique,review:[] as FeedCandidate[]};
 if(policy.publicationMode!=='limited'||!Number.isSafeInteger(policy.limit)||policy.limit<1)throw new Error('INVALID_LIMIT');
 const available=Math.max(0,policy.limit-publishedInWindow);
 return {publish:unique.slice(0,available),review:unique.slice(available)};
}
