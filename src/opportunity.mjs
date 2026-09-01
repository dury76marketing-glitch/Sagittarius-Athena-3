import { randomUUID, createHash } from 'node:crypto';
import { ATOMIC_THUNDER_BOLT, ATOMIC_THUNDER_PATTERN_GUARDIAN, COSMO_SHADOW_TRADING, INFINITY_BREAK, LIGHTNING_PLASMA, ATHENA_EXCLAMATION, EXECUTION_ATTACK_DISPLAY, kalshiGeneralTakerFeeEstimateCents } from './doctrine.mjs';

const finite=(v,d=null)=>Number.isFinite(Number(v))?Number(v):d;
const clamp=(v,lo=0,hi=100)=>Math.max(lo,Math.min(hi,Number(v)||0));
const openLike=(s)=>['open','entry_pending','exit_pending','pending_recovery'].includes(String(s||''));

export const COUNTERFACTUAL_PERSISTENCE = Object.freeze({
  version:'ATB-CF-P2-KEYED-BOUNDED',
  maximumConcurrency:2,
  maximumPending:2048,
  retryDelayMs:5_000,
});

function sampleAtOrBefore(history, targetMs){
  let best=null;
  for(const x of history||[]){
    const t=finite(x?.t,0); if(!(t>0)||t>targetMs)continue;
    if(!best||t>finite(best.t,0))best=x;
  }
  return best;
}
function askOf(x){return finite(x?.ask,finite(x?.yesAsk,null));}
function bidOf(x){return finite(x?.bid,finite(x?.yesBid,null));}
function slope(history,now,windowMs){
  const current=[...(history||[])].reverse().find(x=>finite(x?.t,0)<=now&&askOf(x)!=null);
  const prior=sampleAtOrBefore(history,now-windowMs);
  const ca=askOf(current),pa=askOf(prior),ct=finite(current?.t,now),pt=finite(prior?.t,now-windowMs);
  if(ca==null||pa==null||ct<=pt)return 0;
  return (ca-pa)/((ct-pt)/1000);
}

function priceOf(x){return bidOf(x)??askOf(x);}
function recentPricePath(history=[],now=Date.now(),windowMs=ATOMIC_THUNDER_PATTERN_GUARDIAN.lookbackMs){
  const from=now-Math.max(1,Number(windowMs)||1),out=[];
  for(const x of history||[]){
    const t=finite(x?.t,0),p=priceOf(x);
    if(!(t>=from&&t<=now)||p==null)continue;
    const last=out.at(-1);
    if(last&&last.p===p){last.t=t;continue;}
    out.push({t,p});
  }
  return out;
}
function zigzagTurns(points=[],threshold=ATOMIC_THUNDER_PATTERN_GUARDIAN.minimumLegCents){
  if(points.length<2)return points.map(x=>({...x}));
  const z=[{...points[0]}];let direction=0,extreme={...points[0]};
  for(let i=1;i<points.length;i+=1){
    const p=points[i];
    if(direction===0){
      if(p.p>=extreme.p+threshold){direction=1;extreme={...p};}
      else if(p.p<=extreme.p-threshold){direction=-1;extreme={...p};}
      else if(Math.abs(p.p-z[0].p)>Math.abs(extreme.p-z[0].p))extreme={...p};
      continue;
    }
    if(direction>0){
      if(p.p>=extreme.p){extreme={...p};continue;}
      if(extreme.p-p.p>=threshold){z.push(extreme);direction=-1;extreme={...p};}
    }else{
      if(p.p<=extreme.p){extreme={...p};continue;}
      if(p.p-extreme.p>=threshold){z.push(extreme);direction=1;extreme={...p};}
    }
  }
  if(!z.length||z.at(-1).t!==extreme.t)z.push(extreme);
  const last=points.at(-1);if(last&&z.at(-1).t!==last.t)z.push({...last});
  return z;
}
function leg(a,b){return Number(b?.p||0)-Number(a?.p||0);}
export function atomicThunderDangerPattern({history=[],now=Date.now(),windowMs=ATOMIC_THUNDER_PATTERN_GUARDIAN.lookbackMs,crashSignal=null,crashState=null}={}){
  const points=recentPricePath(history,now,windowMs),turns=zigzagTurns(points);
  const reasons=[];const g=ATOMIC_THUNDER_PATTERN_GUARDIAN;
  // HF1: CI1 crash ancestry is part of the pattern surface. A completed/reset
  // crash episode can remain the provenance of the current opportunity even
  // after its original fall has aged out of the raw 120-second quote window.
  // Reuse the same crash/rebound thresholds as the path detector; do not add a
  // score or a separate intelligence gate.
  // R59/CI1-RB1: CI1's >=80% EPISODE_RESET is an evidence-based regime
  // boundary. The immutable pendingEntrySignal is intentionally retained for
  // Dragon/Crash-Recovery provenance, but it must not poison ATB2 forever once
  // CI1 has returned the market to a new NORMAL regime. Active/rebound states
  // remain sticky exactly as before; there is deliberately no time TTL.
  const statePhase=String(crashState?.phase||'');
  const resetBoundaryMs=Math.max(0,finite(crashState?.lastResetAtMs,0));
  const lastEpisodeId=String(crashState?.lastEpisodeId||'');
  const signalEpisodeId=String(crashSignal?.episodeId||'');
  const signalRetiredByReset=statePhase==='NORMAL'&&resetBoundaryMs>0&&signalEpisodeId&&lastEpisodeId&&signalEpisodeId===lastEpisodeId;
  const ancestryCandidates=[signalRetiredByReset?null:crashSignal,crashState].filter(x=>x&&typeof x==='object');
  for(const x of ancestryCandidates){
    const episodeId=String(x?.episodeId||x?.lastEpisodeId||'');
    const depth=Math.max(0,finite(x?.crashDepthCents,0));
    const rebound=Math.max(0,finite(x?.reboundCents,0));
    const reclaim=finite(x?.reclaimRate,depth>0?rebound/depth:0);
    if(episodeId&&depth>=g.materialCrashCents&&rebound>=g.minimumCrashReboundCents&&reclaim>=g.minimumCrashReclaimRatio){
      reasons.push('crash_rebound_ancestry');break;
    }
  }
  // Pattern 1: material fall -> rebound -> lower fall. This captures the
  // repeated failed-recovery geometry found throughout the historical losses.
  for(let i=0;i+3<turns.length;i+=1){
    const a=turns[i],b=turns[i+1],c=turns[i+2],d=turns[i+3];
    if(leg(a,b)<=-g.materialFallCents&&leg(b,c)>=g.materialReboundCents&&leg(c,d)<=-g.materialFallCents&&d.p<b.p){
      reasons.push('fall_rebound_lower_fall');break;
    }
  }
  // Pattern 2: severe crash followed by a meaningful rebound. The user has
  // deliberately classified rebound-after-crash markets as contaminated even
  // before a second failure is observed.
  for(let i=0;i+2<turns.length;i+=1){
    const a=turns[i],b=turns[i+1],c=turns[i+2],depth=-leg(a,b),rebound=leg(b,c);
    if(depth>=g.materialCrashCents&&rebound>=g.minimumCrashReboundCents&&rebound/Math.max(1,depth)>=g.minimumCrashReclaimRatio){
      reasons.push('crash_rebound_market');break;
    }
  }
  // Pattern 3: staircase / falling knife. Count material down legs and require
  // a large net drop without a material recovery that restores the start.
  let downLegs=0,maxRebound=0;
  for(let i=1;i<turns.length;i+=1){const d=leg(turns[i-1],turns[i]);if(d<=-g.minimumLegCents)downLegs+=1;if(d>maxRebound)maxRebound=d;}
  if(points.length>=2&&points[0].p-points.at(-1).p>=g.fallingKnifeNetDropCents&&downLegs>=g.fallingKnifeMinimumDownLegs&&maxRebound<g.materialCrashCents)reasons.push('falling_knife');
  // Pattern 4: repeated oscillating damage (D-U-D-U-D), even if each later
  // trough only equals rather than materially undercuts the prior one.
  if(turns.length>=6){
    for(let i=0;i+5<turns.length;i+=1){
      const ds=[];for(let j=1;j<=5;j+=1)ds.push(leg(turns[i+j-1],turns[i+j]));
      if(ds[0]<=-g.materialFallCents&&ds[1]>=g.materialReboundCents&&ds[2]<=-g.materialFallCents&&ds[3]>=g.materialReboundCents&&ds[4]<=-g.materialFallCents){reasons.push('repeated_fall_rebound_cycle');break;}
    }
  }
  return{contaminated:reasons.length>0,reasons:[...new Set(reasons)],points:points.length,turns:turns.slice(-12),windowMs};
}

function economicTargetForAttack({askCents=0,stakeCents=0,settings={}}={}){
  const ask=Math.max(1,finite(askCents,0)),stake=Math.max(1,finite(stakeCents,0));
  const target=Math.max(0.01,finite(settings.infinityBreakMinNetPerOriginalContractCents,INFINITY_BREAK.defaultMinimumNetPerOriginalContractCents));
  const count=Math.max(1,Math.floor(stake/ask));
  let entryFeePerContract=0,exitFeePerContract=0,targetBid=ask+target;
  if(String(settings.mode||'SIMULATION').toUpperCase()==='LIVE'){
    const entryFee=kalshiGeneralTakerFeeEstimateCents({count,priceCents:ask});entryFeePerContract=entryFee/count;
    for(let i=0;i<3;i+=1){
      const px=Math.max(1,Math.min(99,Math.ceil(targetBid)));
      const exitFee=kalshiGeneralTakerFeeEstimateCents({count,priceCents:px});exitFeePerContract=exitFee/count;
      targetBid=ask+target+entryFeePerContract+exitFeePerContract;
    }
  }else{
    entryFeePerContract=Math.max(0,finite(settings.simFeeCents,2));exitFeePerContract=entryFeePerContract;targetBid=ask+target+entryFeePerContract+exitFeePerContract;
  }
  const requiredTargetBidCents=Math.ceil(targetBid-1e-9),requiredGrossMoveCents=requiredTargetBidCents-ask;
  return{targetNetPerOriginalContractCents:target,count,estimatedEntryFeePerContractCents:Number(entryFeePerContract.toFixed(6)),estimatedExitFeePerContractCents:Number(exitFeePerContract.toFixed(6)),requiredTargetBidCents,requiredGrossMoveCents,targetFeasible:requiredTargetBidCents<=99,targetHeadroomCents:Math.max(0,99-ask)};
}
function enabledAttackBands(settings={},askCents=0,{recoveryContext=null,fieldContext=null}={}){
  const rows=[
    ['Momentum Hunter','momentumHunterEnabled','momentumMinEntryCents','momentumMaxEntryCents','momentumStakeCents'],
    ['Wave Surfer','waveSurferEnabled','waveMinEntryCents','waveMaxEntryCents','waveStakeCents'],
    ['Crash Recovery Hunter','crashRecoveryHunterEnabled','crashRecoveryMinEntryCents','crashRecoveryMaxEntryCents','crashRecoveryStakeCents'],
    ['Lightning Plasma','lightningPlasmaEnabled','lightningPlasmaMinEntryCents','lightningPlasmaMaxEntryCents','lightningPlasmaFieldStakeCents'],
    ['Athena Exclamation','athenaExclamationEnabled','athenaExclamationMinEntryCents','athenaExclamationMaxEntryCents','athenaExclamationStakeCents'],
  ];
  return rows.filter(([concept,flag])=>{
    if(settings?.[flag]!==true)return false;
    // Structural eligibility belongs upstream of Athena's economic ranking.
    // Do not let an unavailable specialist make a Bolt appear economically
    // feasible: Crystal Wall needs an eligible recovery source, while Athena
    // Exclamation needs the frozen three-Saint convergence context. These are
    // weapon-shape prerequisites, not restored post-FIRE strategic vetoes.
    if(concept==='Lightning Plasma'){
      const independent=finite(fieldContext?.independentEventCount,0),minCosmos=Math.max(2,finite(fieldContext?.minCosmos,LIGHTNING_PLASMA.minCosmos)),minStrikes=Math.max(2,finite(fieldContext?.minStrikes,LIGHTNING_PLASMA.minStrikes));
      if(fieldContext?.lightningPlasmaQualified!==true||fieldContext?.currentTickerEligible!==true||independent<minCosmos||independent<minStrikes)return false;
    }
    if(concept==='Athena Exclamation'){
      const candidate=fieldContext?.athenaExclamationCandidate||null;
      if(!candidate||finite(candidate?.saintCount,0)<ATHENA_EXCLAMATION.minimumSaints)return false;
    }
    return true;
  }).map(([concept,flag,min,max,stake])=>{
    const minEntryCents=finite(settings[min],0),maxEntryCents=finite(settings[max],100),stakeCents=finite(settings[stake],0);
    const target=economicTargetForAttack({askCents,stakeCents,settings});
    return{concept,display:EXECUTION_ATTACK_DISPLAY[concept]?.name||concept,minEntryCents,maxEntryCents,stakeCents,delayedEntry:false,plannedEntryCents:askCents,...target};
  });
}

export function cosmoGreenSources(cosmos=[], bidCents=0, thresholdCents=COSMO_SHADOW_TRADING.defaultGreenTriggerCents){
  const bid=finite(bidCents,0),threshold=Math.max(1,Math.floor(finite(thresholdCents,COSMO_SHADOW_TRADING.defaultGreenTriggerCents)));
  return (cosmos||[]).filter(x=>openLike(x?.status)||x?.active===true).map(source=>{
    const entry=finite(source?.entryPriceCents,0),move=bid>0&&entry>0?bid-entry:-Infinity;
    return{shadowTradeId:String(source?.id||''),conceptName:String(source?.conceptName||source?.name||''),ticker:String(source?.ticker||''),eventTicker:String(source?.eventTicker||source?.ticker||''),entryPriceCents:entry,currentExecutableBidCents:bid,moveCents:Number.isFinite(move)?move:null,greenThresholdCents:threshold,green:Number.isFinite(move)&&move+1e-9>=threshold,priorBoltId:source?.feederState?.atomicThunderBoltId||null,openedAtMs:finite(source?.openedAtMs,0)};
  }).filter(x=>x.shadowTradeId&&x.entryPriceCents>0);
}

export function atomicThunderBoltFeatures({q,history=[],settings={},cosmos=[],crashSignal=null,recoveryContext=null,fieldContext=null,now=Date.now()}={}){
  const ask=finite(q?.yesAsk,0),bid=finite(q?.yesBid,0),spread=ask>0&&bid>0?Math.max(0,ask-bid):99;
  const usable=(history||[]).filter(x=>finite(x?.t,0)>0&&askOf(x)!=null).sort((a,b)=>finite(a.t,0)-finite(b.t,0));
  const recent=usable.filter(x=>finite(x.t,0)>=now-120_000);
  const asks=recent.map(askOf).filter(Number.isFinite);
  const currentAsk=ask||asks.at(-1)||0;
  const peak=asks.length?Math.max(...asks):currentAsk;
  const trough=asks.length?Math.min(...asks):currentAsk;
  const peakIndex=asks.indexOf(peak),troughAfterPeak=peakIndex>=0?Math.min(...asks.slice(peakIndex)):trough;
  const crashDepth=Math.max(0,peak-troughAfterPeak);
  const rebound=Math.max(0,currentAsk-troughAfterPeak);
  const reclaim=crashDepth>0?rebound/crashDepth:0;
  const s5=slope(usable,now,5_000),s15=slope(usable,now,15_000),s30=slope(usable,now,30_000),s60=slope(usable,now,60_000);
  const recentMove=(()=>{const p=sampleAtOrBefore(usable,now-30_000);const a=askOf(p);return a==null?0:currentAsk-a;})();
  const recentPeak=asks.slice(-Math.min(asks.length,12));
  const pullback=recentPeak.length?Math.max(0,Math.max(...recentPeak)-currentAsk):0;
  const upwardTicks=usable.slice(-6).reduce((n,x,i,a)=>i&&askOf(x)>askOf(a[i-1])?n+1:n,0);
  const lowerLowCount=usable.slice(-8).reduce((n,x,i,a)=>i&&askOf(x)<askOf(a[i-1])?n+1:n,0);
  const cosmosNames=[...new Set((cosmos||[]).filter(x=>openLike(x?.status)||x?.active===true).map(x=>String(x?.conceptName||x?.name||'')).filter(Boolean))];
  const greenTriggerCents=Math.max(1,Math.floor(finite(settings.atomicThunderGreenTriggerCents,COSMO_SHADOW_TRADING.defaultGreenTriggerCents)));
  const cosmoShadows=cosmoGreenSources(cosmos,bid,greenTriggerCents);
  const greenSources=cosmoShadows.filter(x=>x.green===true);
  const strongestGreenMoveCents=greenSources.length?Math.max(...greenSources.map(x=>finite(x.moveCents,0))):0;
  const externalCrash=crashSignal&&typeof crashSignal==='object'?{
    episodeId:crashSignal.episodeId||null,crashDepthCents:finite(crashSignal.crashDepthCents,crashDepth),troughCents:finite(crashSignal.troughCents,troughAfterPeak),
    reboundCents:finite(crashSignal.reboundCents,rebound),reclaimRate:finite(crashSignal.reclaimRate,reclaim),stableObservations:finite(crashSignal.stableObservations,0),upwardTicks:finite(crashSignal.upwardTicks,upwardTicks),lowerLowCount:finite(crashSignal.lowerLowCount,lowerLowCount),reboundLostCount:finite(crashSignal.reboundLostCount,0),
  }:null;
  const effectiveCrashDepth=externalCrash?.crashDepthCents??crashDepth,effectiveRebound=externalCrash?.reboundCents??rebound;
  const effectiveUpwardTicks=externalCrash?.upwardTicks??upwardTicks;
  // R59/AE1-C1: never synthesize Gold Saint convergence from generic price
  // geometry. Athena Exclamation is structurally eligible only from the real
  // durable AE1 vote/event engine. Likewise Lightning Plasma receives only a
  // field context produced by independently qualified Cosmos, never by active
  // Atomic Thunder Bolts.
  const structuralFieldContext={...(fieldContext||{}),goldSaintCount:finite(fieldContext?.goldSaintCount,0)};
  const bands=enabledAttackBands(settings,currentAsk,{recoveryContext,fieldContext:structuralFieldContext});
  const eligibleBands=bands.filter(b=>{
    if(b.delayedEntry===true)return Number(b.triggerPriceCents)>=Number(b.minEntryCents)&&Number(b.plannedEntryCents)>=Number(b.minEntryCents)&&Number(b.plannedEntryCents)<=Number(b.maxEntryCents);
    return currentAsk>=b.minEntryCents&&currentAsk<=b.maxEntryCents;
  });
  const feasibleBands=eligibleBands.filter(b=>b.targetFeasible!==false);
  const minimumGross=feasibleBands.length?Math.min(...feasibleBands.map(b=>finite(b.requiredGrossMoveCents,99))):null;
  const observedImpulse=Math.max(Math.max(0,recentMove),Math.max(0,rebound),Math.max(0,currentAsk-trough),Math.max(0,s15*15),Math.max(0,s30*30));
  const feasibilityAnchorCents=feasibleBands.length?Math.min(...feasibleBands.map(b=>finite(b.plannedEntryCents,currentAsk))):currentAsk;
  const targetFeasibilityScore=minimumGross==null?0:clamp(35+Math.min(45,(observedImpulse/Math.max(1,minimumGross))*45)+Math.min(20,Math.max(0,99-(feasibilityAnchorCents+minimumGross))));
  for(const b of eligibleBands)b.targetFeasibilityScore=b.targetFeasible?targetFeasibilityScore:0;
  const sourceScore=clamp((cosmosNames.length?12:0)+(spread<=1?12:spread<=2?8:spread<=Number(settings.maxSpreadCents||3)?4:-12)+(Math.max(s5,s15,s30)>0?15:0)+(recentMove>=2?15:recentMove>=1?8:0)+(rebound>=2?12:rebound>=1?6:0)+(upwardTicks>=2?8:0)-(lowerLowCount>=3?12:0));
  const gameMinutes=finite(q?.gameMinutes,finite(q?.confirmedGameMinutes,null));
  return {
    ticker:String(q?.ticker||''),eventTicker:String(q?.eventTicker||q?.ticker||''),side:'YES',sport:String(q?.sport||q?.sportName||'Unknown'),
    bidCents:bid,askCents:currentAsk,spreadCents:spread,historySamples:usable.length,historyWindowMs:usable.length?Math.max(0,now-finite(usable[0].t,now)):0,
    velocity5CentsPerSec:s5,velocity15CentsPerSec:s15,velocity30CentsPerSec:s30,velocity60CentsPerSec:s60,
    accelerationCentsPerSec2:(s15-s30)/15,recentMove30Cents:recentMove,recentPeakCents:peak,recentTroughCents:troughAfterPeak,
    momentumRiseCents:Math.max(0,recentMove),momentumPullbackCents:pullback,waveFavorableMoveCents:Math.max(0,currentAsk-trough),
    crashDepthCents:externalCrash?.crashDepthCents??crashDepth,reboundCents:externalCrash?.reboundCents??rebound,reclaimRate:externalCrash?.reclaimRate??reclaim,
    // Preserve CI1-enriched fields for historical/economic context, but also
    // expose the causal short-window measurements explicitly. A8-R2 and the
    // live Attack-fit layer must use these current-window fields so accumulated
    // crash ancestry cannot silently reacquire a second path veto downstream
    // of ATB2.
    stableObservations:externalCrash?.stableObservations??Math.min(usable.length,8),upwardTicks:externalCrash?.upwardTicks??upwardTicks,lowerLowCount:externalCrash?.lowerLowCount??lowerLowCount,reboundLostCount:externalCrash?.reboundLostCount??0,
    currentUpwardTicks:upwardTicks,currentLowerLowCount:lowerLowCount,currentCrashDepthCents:crashDepth,currentReboundCents:rebound,currentReclaimRate:reclaim,
    crashEpisodeId:externalCrash?.episodeId||null,gameMinutes,cosmoSources:cosmosNames,cosmoCount:cosmosNames.length,
    cosmoShadowTrades:cosmoShadows,greenSources,greenSourceCount:greenSources.length,greenTriggerCents,strongestGreenMoveCents,
    recoveryContext:recoveryContext||null,fieldContext:structuralFieldContext,eligibleAttacks:eligibleBands,sourceScore,
    targetNetPerOriginalContractCents:Math.max(0.01,finite(settings.infinityBreakMinNetPerOriginalContractCents,INFINITY_BREAK.defaultMinimumNetPerOriginalContractCents)),minimumRequiredGrossMoveCents:minimumGross,targetFeasibilityScore,
    marketObservedAtMs:finite(q?.quoteAtMs,finite(q?.updatedAtMs,now)),calculatedAtMs:now,
  };
}

export function atomicThunderBoltDecision(features={},settings={}){
  if(!features?.ticker)return{detected:false,reason:'ticker_missing',score:0};
  if(!(features.askCents>0)||!(features.bidCents>0)||features.bidCents>features.askCents)return{detected:false,reason:'invalid_quote',score:0};
  if(!Array.isArray(features.eligibleAttacks)||features.eligibleAttacks.length===0)return{detected:false,reason:'no_enabled_attack_band',score:0};
  const economicallyFeasible=features.eligibleAttacks.filter(x=>x?.targetFeasible!==false);
  if(!economicallyFeasible.length)return{detected:false,reason:'economic_target_unreachable',score:0};
  if(features.spreadCents>Number(settings.maxSpreadCents??3))return{detected:false,reason:'shared_spread_safety',score:0};
  if(!Array.isArray(features.greenSources)||features.greenSources.length===0)return{detected:false,reason:'no_cosmo_green_move',score:0};
  const move=Math.max(0,finite(features.strongestGreenMoveCents,0));
  const direction=Math.max(0,finite(features.velocity5CentsPerSec,0),finite(features.velocity15CentsPerSec,0),finite(features.velocity30CentsPerSec,0));
  const targetFeasibility=clamp(features.targetFeasibilityScore??50);
  const score=clamp(55+Math.min(20,move*5)+Math.min(8,features.greenSourceCount*3)+Math.min(7,direction*35)+targetFeasibility*0.10);
  return{detected:true,reason:'cosmo_green',score:Number(score.toFixed(2))};
}

export class AtomicThunderBoltEngine{
  constructor({market,getSettings,db,systemName='SAGITTARIUS',sourceRelease='',audit=async()=>{},onOpportunityCompleted=null,onCandidateStage=null}={}){
    this.market=market;this.getSettings=getSettings||(()=>({}));this.db=db;this.systemName=systemName;this.sourceRelease=sourceRelease;this.audit=audit;this.onOpportunityCompleted=typeof onOpportunityCompleted==='function'?onOpportunityCompleted:null;this.onCandidateStage=typeof onCandidateStage==='function'?onCandidateStage:null;
    this.activeByTicker=new Map();this.preBolts=new Map();this.patternBlockedByTicker=new Map();this.boltedShadowIds=new Set();this.shadowEpisodes=new Map();this.shadowByTicker=new Map();this.detected=0;this.expired=0;this.lastBolt=null;this.counterfactualCompleted=0;this.preBoltStarted=0;this.preExamPassed=0;this.patternBlocked=0;this.finalExamPassed=0;this.lastPatternBlock=null;
    // R51-HF2: counterfactual completion used to be launched directly from
    // every quote. Multiple quotes could complete the same episode before the
    // first database round-trip removed it, multiplying DB work thousands of
    // times. Completion is now globally bounded and keyed by episode ID.
    this.counterfactualPending=new Map();this.counterfactualActive=new Set();this.counterfactualRetryAt=new Map();this.counterfactualWorkerPromise=null;this.counterfactualRetryTimer=null;
    this.counterfactualTotalQueued=0;this.counterfactualTotalCoalesced=0;this.counterfactualTotalFailed=0;this.counterfactualTotalBackpressure=0;this.counterfactualMaxObservedPending=0;this.counterfactualLastError=null;
  }
  candidateStage(event={}){try{void this.onCandidateStage?.({...event,atMs:Number(event?.atMs||Date.now())});}catch{} }
  indexShadowEpisode(t){
    if(!t?.id||!t?.ticker)return;
    this.shadowEpisodes.set(String(t.id),t);
    const ticker=String(t.ticker),set=this.shadowByTicker.get(ticker)||new Set();set.add(String(t.id));this.shadowByTicker.set(ticker,set);
  }
  deleteShadowEpisode(id){
    const key=String(id||''),t=this.shadowEpisodes.get(key);if(!t)return false;
    this.shadowEpisodes.delete(key);const set=this.shadowByTicker.get(String(t.ticker||''));set?.delete(key);if(set&&set.size===0)this.shadowByTicker.delete(String(t.ticker||''));
    this.counterfactualRetryAt.delete(key);return true;
  }
  async init(now=Date.now()){
    // Restore only very-recent non-FIRE counterfactuals. A longer restart gap
    // destroys the continuous executable-book observation required for a
    // no-lookahead counterfactual label, so such episodes remain explicitly
    // incomplete instead of being guessed.
    if(typeof this.db?.opportunityEpisodes!=='function')return{restored:0,incomplete:0};
    const rows=await this.db.opportunityEpisodes(this.systemName,{limit:2048,trackingComplete:false});
    let restored=0,incomplete=0;const settings=this.getSettings();
    for(const ep of rows||[]){
      const decision=String(ep?.athenaDecision?.decision||'');
      if(ep?.attackSelected==='Scarlet Needle')continue;
      if(!['WATCH','REJECT','EXPIRED'].includes(decision)||ep?.entryId)continue;
      const age=Math.max(0,now-Number(ep.updatedAtMs||ep.boltAtMs||0));
      if(age>ATOMIC_THUNDER_BOLT.maximumOpportunityAgeMs){
        incomplete+=1;
        if(typeof this.db?.upsertOpportunityEpisode==='function')await this.db.upsertOpportunityEpisode({...ep,outcome:{...(ep.outcome||{}),version:'ATHENA-COUNTERFACTUAL-V1',counterfactual:true,trackingIncomplete:true,incompleteReason:'restart_observation_gap',markedAtMs:now},trackingComplete:false,updatedAtMs:now}).catch(()=>{});
        continue;
      }
      const best=ep?.athenaDecision?.ranking?.[0]||null,ask=finite(ep?.boltSnapshot?.features?.askCents,0);
      if(!best||!(ask>0))continue;
      const econ=economicTargetForAttack({askCents:ask,stakeCents:Math.max(1,finite(best.stakeCents,0)),settings});
      const targetBid=finite(best.requiredTargetBidCents,econ.requiredTargetBidCents),gross=Math.max(1,targetBid-ask);
      const count=Math.max(1,Math.floor(Math.max(1,finite(best.stakeCents,0))/ask)),bid=finite(ep?.boltSnapshot?.features?.bidCents,ask);
      if(targetBid>99)continue;
      this.indexShadowEpisode({id:String(ep.id),ticker:String(ep.ticker),startedAtMs:Number(ep.athenaDecision?.decidedAtMs||ep.boltAtMs||now),decision,attackSelected:best.concept||null,entryAskCents:ask,targetBidCents:targetBid,grossTargetCents:gross,count,minBidCents:bid,maxBidCents:bid});
      restored+=1;
    }
    await this.audit('atomic_thunder_bolt_counterfactual_restart',{restored,incomplete}).catch(()=>{});
    return{restored,incomplete};
  }
  async detect(q,{cosmos=[],crashSignal=null,crashState=null,recoveryContext=null,fieldContext=null,now=Date.now()}={}){
    for(const [ticker,active] of [...this.activeByTicker])if(now>Number(active?.expiresAtMs||0)){this.activeByTicker.delete(ticker);this.expired+=1;}
    while(this.activeByTicker.size>=ATOMIC_THUNDER_BOLT.maximumActiveBolts){const first=this.activeByTicker.keys().next().value;this.activeByTicker.delete(first);this.expired+=1;}
    const settings=this.getSettings();
    const history=this.market?.getHistory?.(q?.ticker)||[];
    const features=atomicThunderBoltFeatures({q,history,settings,cosmos,crashSignal,recoveryContext,fieldContext,now});
    const d=atomicThunderBoltDecision(features,settings);
    const ticker=String(features?.ticker||q?.ticker||'');
    if(!ticker)return null;
    const active=this.activeByTicker.get(ticker);
    if(active&&now<=Number(active.expiresAtMs||0)){active.features=features;active.score=d.score??active.score;active.updatedAtMs=now;return active;}
    if(!d.detected)return null;
    const candidates=(features.greenSources||[]).filter(x=>!x.priorBoltId&&!this.boltedShadowIds.has(String(x.shadowTradeId||''))).sort((a,b)=>finite(b.moveCents,0)-finite(a.moveCents,0)||finite(a.openedAtMs,0)-finite(b.openedAtMs,0));
    const trigger=candidates[0]||null;
    if(!trigger)return null;
    if(typeof this.db?.upsertOpportunityEpisode!=='function'||typeof this.db?.updateEntry!=='function'){
      await this.audit('atomic_thunder_bolt_persistence_failed',{ticker,shadowTradeId:trigger.shadowTradeId,reason:'persistence_writer_missing'},'error').catch(()=>{});return null;
    }
    let unlock=null;
    try{
      if(typeof this.db?.acquireHunterTickerLock==='function')unlock=await this.db.acquireHunterTickerLock(this.systemName,`atomic-green:${trigger.shadowTradeId}`);
      if(typeof this.db?.acquireHunterTickerLock==='function'&&!unlock)return null;
      const freshSource=typeof this.db?.entryById==='function'?await this.db.entryById(trigger.shadowTradeId).catch(()=>null):null;
      if(freshSource?.feederState?.atomicThunderBoltId){this.boltedShadowIds.add(String(trigger.shadowTradeId));return null;}
      const deterministic=createHash('sha256').update(`${this.systemName}|COSMO_GREEN|${trigger.shadowTradeId}`).digest('hex');
      const id=`ATG-${deterministic.slice(0,32)}`;
      const greenTrigger={version:COSMO_SHADOW_TRADING.version,event:COSMO_SHADOW_TRADING.atomicThunderEvent,shadowTradeId:trigger.shadowTradeId,cosmo:trigger.conceptName,shadowEntryPriceCents:trigger.entryPriceCents,currentExecutableBidCents:trigger.currentExecutableBidCents,moveCents:trigger.moveCents,requiredMoveCents:trigger.greenThresholdCents,crossedAtMs:now};
      const preBoltClearance={version:'ATB3',policyRevision:ATOMIC_THUNDER_BOLT.policyRevision,status:'IMMEDIATE_GREEN',preBoltId:id,startedAtMs:now,firstExamMs:0,finalExamMs:0,finalExamPassedAtMs:now,contaminated:false,researchOnlyLegacyPatternGuardian:true};
      const core={version:ATOMIC_THUNDER_BOLT.version,policyRevision:ATOMIC_THUNDER_BOLT.policyRevision,id,systemName:this.systemName,sourceRelease:this.sourceRelease,ticker:features.ticker,eventTicker:features.eventTicker,side:'YES',sport:features.sport,detectedAtMs:now,expiresAtMs:now+ATOMIC_THUNDER_BOLT.maximumOpportunityAgeMs,score:d.score,greenTrigger,preBoltClearance,features};
      const fingerprint=createHash('sha256').update(JSON.stringify(core)).digest('hex');
      const bolt={...core,fingerprint,updatedAtMs:now};
      await this.db.upsertOpportunityEpisode({id,systemName:this.systemName,sourceRelease:this.sourceRelease,cohortId:String(settings.resetTimestampMs||''),ticker:features.ticker,eventTicker:features.eventTicker,side:'YES',sport:features.sport,boltAtMs:now,boltSnapshot:bolt,updatedAtMs:now});
      const baseState=freshSource?.feederState&&typeof freshSource.feederState==='object'?freshSource.feederState:{};
      try{await this.db.updateEntry(trigger.shadowTradeId,{feederState:{...baseState,shadowTradeVersion:COSMO_SHADOW_TRADING.version,greenAtMs:now,greenMoveCents:trigger.moveCents,atomicThunderBoltId:id,atomicThunderBoltAtMs:now},updatedAtMs:now});}
      catch(error){await this.audit('cosmo_shadow_bolt_link_persistence_failed',{shadowTradeId:trigger.shadowTradeId,boltId:id,message:String(error?.message||error)},'error').catch(()=>{});throw error;}
      this.boltedShadowIds.add(String(trigger.shadowTradeId));while(this.boltedShadowIds.size>8192)this.boltedShadowIds.delete(this.boltedShadowIds.values().next().value);
      this.activeByTicker.set(features.ticker,bolt);this.detected+=1;this.lastBolt=bolt;
      this.candidateStage({candidateId:id,boltId:id,stage:'COSMO_GREEN',status:'PASS',reason:'shadow_trade_crossed_green_threshold',ticker:features.ticker,eventTicker:features.eventTicker,shadowTradeId:trigger.shadowTradeId,cosmo:trigger.conceptName,moveCents:trigger.moveCents});
      this.candidateStage({candidateId:id,boltId:id,stage:'BOLT',status:'PASS',reason:'immediate_cosmo_green_bolt',ticker:features.ticker,eventTicker:features.eventTicker});
      await this.audit('atomic_thunder_cosmo_green_bolt',{boltId:id,ticker:features.ticker,eventTicker:features.eventTicker,shadowTradeId:trigger.shadowTradeId,cosmo:trigger.conceptName,shadowEntryPriceCents:trigger.entryPriceCents,currentExecutableBidCents:trigger.currentExecutableBidCents,moveCents:trigger.moveCents,greenTriggerCents:trigger.greenThresholdCents,score:d.score,eligibleAttacks:features.eligibleAttacks.map(x=>x.concept)}).catch(()=>{});
      return bolt;
    }catch(error){
      await this.audit('atomic_thunder_bolt_persistence_failed',{ticker,shadowTradeId:trigger.shadowTradeId,message:String(error?.message||error)},'error').catch(()=>{});return null;
    }finally{if(unlock)try{await unlock();}catch{}}
  }
  consume(boltId,ticker){const b=this.activeByTicker.get(String(ticker||''));if(b&&String(b.id)===String(boltId))this.activeByTicker.delete(String(ticker));}
  noteDecision(bolt,decision){
    if(!bolt?.id||decision?.decision==='FIRE')return;
    const settings=this.getSettings();const best=decision?.ranking?.[0]||null;if(!best)return;
    const ask=finite(bolt?.features?.askCents,0);if(!(ask>0))return;
    const econ=economicTargetForAttack({askCents:ask,stakeCents:Math.max(1,finite(best.stakeCents,0)),settings});
    const targetBid=finite(best.requiredTargetBidCents,econ.requiredTargetBidCents),gross=Math.max(1,targetBid-ask);if(targetBid>99)return;
    const stake=Math.max(1,finite(best.stakeCents,0)),count=Math.max(1,Math.floor(stake/ask));
    this.indexShadowEpisode({id:String(bolt.id),ticker:String(bolt.ticker),startedAtMs:Number(decision.decidedAtMs||Date.now()),decision:String(decision.decision||'REJECT'),attackSelected:best.concept||null,entryAskCents:ask,targetBidCents:targetBid,grossTargetCents:gross,count,minBidCents:finite(bolt?.features?.bidCents,ask),maxBidCents:finite(bolt?.features?.bidCents,ask)});
    while(this.shadowEpisodes.size>ATOMIC_THUNDER_BOLT.maximumCounterfactualEpisodes){const first=this.shadowEpisodes.keys().next().value;this.deleteShadowEpisode(first);}
  }
  enqueueCounterfactualCompletion(job){
    const id=String(job?.id||'');if(!id||!this.shadowEpisodes.has(id))return false;
    if(this.counterfactualActive.has(id)||this.counterfactualPending.has(id)){this.counterfactualTotalCoalesced++;return false;}
    if(this.counterfactualPending.size>=COUNTERFACTUAL_PERSISTENCE.maximumPending){this.counterfactualTotalBackpressure++;return false;}
    this.counterfactualPending.set(id,job);this.counterfactualTotalQueued++;this.counterfactualMaxObservedPending=Math.max(this.counterfactualMaxObservedPending,this.counterfactualPending.size);this.pumpCounterfactualCompletions();return true;
  }
  async persistCounterfactualCompletion(job){
    const id=String(job?.id||''),t=this.shadowEpisodes.get(id);if(!t)return true;
    const durableCompletion=async()=>{
      const prior=typeof this.db?.opportunityEpisode==='function'?await this.db.opportunityEpisode(id):null;
      if(!prior||typeof this.db?.upsertOpportunityEpisode!=='function')throw new Error('counterfactual_episode_persistence_unavailable');
      const outcome={version:'ATHENA-COUNTERFACTUAL-V1',decision:job.decision,counterfactual:true,targetBidCents:job.targetBidCents,count:job.count,fullDepthTargetHit:job.hit,minBidCents:job.minBidCents,maxBidCents:job.maxBidCents,elapsedMs:job.elapsedMs,completedAtMs:job.completedAtMs};
      await this.db.upsertOpportunityEpisode({...prior,outcome,outcomeLabel:job.label,trackingComplete:true,updatedAtMs:job.completedAtMs});
      const completed=await this.db.opportunityEpisode(id);
      if(completed)try{await this.onOpportunityCompleted?.(completed);}catch{}
    };
    // Counterfactual learning is never entry/protection authority. In the real
    // Database implementation the complete read-write-read chain therefore
    // shares the same one-wide low-priority lane as FSI/CI1, preserving main
    // pool headroom for trading, reconciliation, scanner, and protection work.
    if(typeof this.db?.runLowPriorityPersistence==='function')await this.db.runLowPriorityPersistence(durableCompletion);
    else await durableCompletion();
    this.deleteShadowEpisode(id);this.counterfactualCompleted+=1;this.counterfactualLastError=null;return true;
  }
  scheduleCounterfactualRetry(){
    if(this.counterfactualRetryTimer||!this.counterfactualPending.size)return;
    let earliest=Infinity;
    for(const id of this.counterfactualPending.keys()){
      const retryAt=Number(this.counterfactualRetryAt.get(id)||0);
      if(retryAt>0)earliest=Math.min(earliest,retryAt);
      else {earliest=Date.now();break;}
    }
    if(!Number.isFinite(earliest))return;
    const delay=Math.max(1,earliest-Date.now());
    this.counterfactualRetryTimer=setTimeout(()=>{this.counterfactualRetryTimer=null;this.pumpCounterfactualCompletions();},delay);
    this.counterfactualRetryTimer.unref?.();
  }
  pumpCounterfactualCompletions(){
    if(this.counterfactualWorkerPromise||!this.counterfactualPending.size)return this.counterfactualWorkerPromise;
    const now=Date.now(),hasDue=[...this.counterfactualPending.keys()].some(id=>Number(this.counterfactualRetryAt.get(id)||0)<=now);
    if(!hasDue){this.scheduleCounterfactualRetry();return null;}
    if(this.counterfactualRetryTimer){clearTimeout(this.counterfactualRetryTimer);this.counterfactualRetryTimer=null;}
    this.counterfactualWorkerPromise=(async()=>{
      const running=new Set();
      const launch=async(id,job)=>{
        this.counterfactualActive.add(id);
        try{await this.persistCounterfactualCompletion(job);}
        catch(error){
          this.counterfactualTotalFailed++;this.counterfactualLastError=String(error?.message||error);
          this.counterfactualRetryAt.set(id,Date.now()+COUNTERFACTUAL_PERSISTENCE.retryDelayMs);
          // Preserve the exact observed completion. A transient DB failure must
          // not require another market quote to recover the learning episode.
          if(this.shadowEpisodes.has(id)&&!this.counterfactualPending.has(id))this.counterfactualPending.set(id,job);
        }finally{this.counterfactualActive.delete(id);}
      };
      while(this.counterfactualPending.size||running.size){
        while(running.size<COUNTERFACTUAL_PERSISTENCE.maximumConcurrency&&this.counterfactualPending.size){
          const now=Date.now();let picked=null;
          for(const pair of this.counterfactualPending.entries()){
            if(Number(this.counterfactualRetryAt.get(pair[0])||0)<=now){picked=pair;break;}
          }
          if(!picked)break;
          const [id,job]=picked;this.counterfactualPending.delete(id);
          let p=null;p=launch(id,job).finally(()=>running.delete(p));running.add(p);
        }
        if(running.size)await Promise.race(running);else break;
      }
    })().finally(()=>{
      this.counterfactualWorkerPromise=null;
      if(this.counterfactualPending.size){
        const now=Date.now(),due=[...this.counterfactualPending.keys()].some(id=>Number(this.counterfactualRetryAt.get(id)||0)<=now);
        if(due)this.pumpCounterfactualCompletions();else this.scheduleCounterfactualRetry();
      }
    });
    return this.counterfactualWorkerPromise;
  }
  observeCounterfactual(q,now=Date.now()){
    const ticker=String(q?.ticker||'');if(!ticker)return 0;let queued=0;
    const ids=[...(this.shadowByTicker.get(ticker)||[])];
    for(const id of ids){
      const t=this.shadowEpisodes.get(id);if(!t)continue;const bid=finite(q?.yesBid,0);if(bid>0){t.minBidCents=Math.min(t.minBidCents,bid);t.maxBidCents=Math.max(t.maxBidCents,bid);}
      const exec=this.market?.executableBid?.(ticker,t.count,1)||null;const full=Boolean(exec?.full&&finite(exec?.filled,0)+1e-9>=t.count&&finite(exec?.avgCents,0)>0);const hit=full&&finite(exec.avgCents,0)+1e-9>=t.targetBidCents;
      const maxHorizon=Math.max(...ATOMIC_THUNDER_BOLT.learningHorizonsMs);if(!hit&&now-t.startedAtMs<maxHorizon)continue;
      if(Number(this.counterfactualRetryAt.get(id)||0)>now)continue;
      const label=hit?'CLEAN_BOLT':(t.entryAskCents-t.minBidCents>=t.grossTargetCents?'FALSE_BOLT':'EXPIRED_NO_IMPULSE');
      if(this.enqueueCounterfactualCompletion({id,decision:t.decision,targetBidCents:t.targetBidCents,count:t.count,hit,minBidCents:t.minBidCents,maxBidCents:t.maxBidCents,elapsedMs:Math.max(0,now-t.startedAtMs),completedAtMs:now,label}))queued+=1;
    }
    return queued;
  }
  async flushCounterfactualCompletions(timeoutMs=2_000){
    const deadline=Date.now()+Math.max(0,Number(timeoutMs)||0);
    while((this.counterfactualPending.size||this.counterfactualWorkerPromise||this.counterfactualActive.size)&&Date.now()<deadline){
      this.pumpCounterfactualCompletions();
      const worker=this.counterfactualWorkerPromise;
      if(!worker){
        const nextRetry=Math.min(...[...this.counterfactualPending.keys()].map(id=>Number(this.counterfactualRetryAt.get(id)||deadline)));
        const wait=Math.max(1,Math.min(deadline-Date.now(),Math.max(1,nextRetry-Date.now())));
        await new Promise(resolve=>setTimeout(resolve,wait));
        continue;
      }
      const remaining=Math.max(0,deadline-Date.now());let timer=null;
      try{await Promise.race([worker,new Promise((resolve)=>{timer=setTimeout(resolve,remaining);})]);}finally{if(timer)clearTimeout(timer);}
    }
    return this.counterfactualPending.size===0&&this.counterfactualActive.size===0&&!this.counterfactualWorkerPromise;
  }
  summary(){const s=this.getSettings();return{version:ATOMIC_THUNDER_BOLT.version,role:ATOMIC_THUNDER_BOLT.role,authority:ATOMIC_THUNDER_BOLT.authority,noBoltNoAttack:true,greenTrigger:{version:COSMO_SHADOW_TRADING.version,event:COSMO_SHADOW_TRADING.atomicThunderEvent,triggerCents:Math.max(1,Math.floor(finite(s.atomicThunderGreenTriggerCents,COSMO_SHADOW_TRADING.defaultGreenTriggerCents))),priceBasis:COSMO_SHADOW_TRADING.greenPriceBasis,oneBoltPerShadowTrade:true,boltedShadowTrades:this.boltedShadowIds.size},patternGuardian:{version:ATOMIC_THUNDER_PATTERN_GUARDIAN.version,policyRevision:ATOMIC_THUNDER_PATTERN_GUARDIAN.policyRevision,authority:'RESEARCH_ONLY',strategicVeto:false,activePreBolts:0,patternBlocked:0},detected:this.detected,expired:this.expired,active:this.activeByTicker.size,counterfactualTracking:this.shadowEpisodes.size,counterfactualCompleted:this.counterfactualCompleted,counterfactualPersistence:{version:COUNTERFACTUAL_PERSISTENCE.version,maxConcurrency:COUNTERFACTUAL_PERSISTENCE.maximumConcurrency,maxPending:COUNTERFACTUAL_PERSISTENCE.maximumPending,active:this.counterfactualActive.size,pending:this.counterfactualPending.size,totalQueued:this.counterfactualTotalQueued,totalCoalesced:this.counterfactualTotalCoalesced,totalFailed:this.counterfactualTotalFailed,totalBackpressure:this.counterfactualTotalBackpressure,maxObservedPending:this.counterfactualMaxObservedPending,lastError:this.counterfactualLastError},lastBolt:this.lastBolt};}
}
