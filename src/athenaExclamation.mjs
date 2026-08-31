import { ATHENA_EXCLAMATION as DOCTRINE, ANOTHER_DIMENSION } from './doctrine.mjs';

export const ATHENA_EXCLAMATION = DOCTRINE;
const finite=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;

// Historical compatibility only. AE2 has no Gold-Saint convergence authority.
export function isGoldSaintConcept(){ return false; }

export function athenaExclamationCycleArmed(justiceArrowCount=0){
  return Math.max(0,Math.floor(finite(justiceArrowCount,0))) >= ATHENA_EXCLAMATION.triggerEveryJusticeArrows;
}

// AE2's dedicated Gemini review contains only structural facts that are safe to
// inspect before the normal createHunter hard-execution railway revalidates the
// exact market, clock, depth, ownership, exposure, capital and LIVE/SIM state.
export function athenaExclamationPrimeReview({parentShadow,quote,executionPlan,settings={},cycleState=null}={}){
  const reasons=[];
  if(parentShadow?.conceptName!=='Another Dimension'||parentShadow?.status!=='closed'||Number(parentShadow?.remainingCount||0)>1e-9)reasons.push('completed_another_dimension_required');
  if(String(parentShadow?.closeReason||'')!==ANOTHER_DIMENSION.profitableCloseReason||!(Number(parentShadow?.pnlCents||0)>0))reasons.push('profitable_another_dimension_required');
  if(cycleState?.armed!==true)reasons.push('twelve_justice_arrows_not_reached');
  const ticker=String(quote?.ticker||''),parentTicker=String(parentShadow?.ticker||'');
  if(!ticker||ticker!==parentTicker)reasons.push('ticker_mismatch');
  const bid=finite(quote?.yesBid,0),ask=finite(quote?.yesAsk,0);
  if(!(bid>0)||!(ask>0)||bid>ask)reasons.push('invalid_quote');
  const min=finite(settings.athenaExclamationMinEntryCents,ATHENA_EXCLAMATION.defaultMinEntryCents);
  const max=finite(settings.athenaExclamationMaxEntryCents,ATHENA_EXCLAMATION.defaultMaxEntryCents);
  if(ask<min||ask>max)reasons.push('entry_band');
  const avg=finite(executionPlan?.averagePriceCents,ask),best=finite(executionPlan?.bestAskCents,ask);
  if(!(avg>0)||!(best>0)||best<min||best>max||avg>max)reasons.push('execution_price_band');
  return {version:ATHENA_EXCLAMATION.version,policyRevision:ATHENA_EXCLAMATION.policyRevision,ok:reasons.length===0,reasons,ticker,bidCents:bid,askCents:ask,minEntryCents:min,maxEntryCents:max,justiceArrowCount:Number(cycleState?.justiceArrowCount||0),armed:cycleState?.armed===true};
}

// Compatibility shell for old imports. It deliberately has no trading authority.
export class AthenaExclamationEngine {
  constructor(){this.counters={legacyVotesIgnored:0};}
  async init(){return this.summary();}
  async recordQualification(){this.counters.legacyVotesIgnored+=1;return{recorded:false,candidate:null,reason:'ae1_three_saint_convergence_retired'};}
  async markDecision(){return null;}
  summary(){return{version:ATHENA_EXCLAMATION.version,policyRevision:ATHENA_EXCLAMATION.policyRevision,role:ATHENA_EXCLAMATION.role,triggerEveryJusticeArrows:ATHENA_EXCLAMATION.triggerEveryJusticeArrows,legacyThreeSaintAuthority:false,...this.counters};}
}
