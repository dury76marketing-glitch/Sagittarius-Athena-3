import { randomUUID, createHash } from 'node:crypto';
import { ATOMIC_THUNDER_BOLT, ATOMIC_THUNDER_PATTERN_GUARDIAN, SCARLET_NEEDLE, LIGHTNING_PLASMA, ATHENA_EXCLAMATION, EXECUTION_ATTACK_DISPLAY, kalshiGeneralTakerFeeEstimateCents } from './doctrine.mjs';

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
function countDownSteps(points=[]){let n=0;for(let i=1;i<points.length;i+=1)if(points[i].p<points[i-1].p)n+=1;return n;}
function firstMaxIndex(points=[]){if(!points.length)return-1;let idx=0;for(let i=1;i<points.length;i+=1)if(points[i].p>points[idx].p)idx=i;return idx;}
function preBoltUpsideDangerPatterns(points=[],g=ATOMIC_THUNDER_PATTERN_GUARDIAN){
  const reasons=[];
  if(points.length<5)return reasons;
  const peakIndex=firstMaxIndex(points);if(peakIndex<2||peakIndex>=points.length-1)return reasons;
  const peak=points[peakIndex],current=points.at(-1),before=points.slice(0,peakIndex+1),after=points.slice(peakIndex);
  const priorLow=Math.min(...before.slice(0,-1).map(x=>x.p)),priorRise=peak.p-priorLow,drawdown=peak.p-current.p,downSteps=countDownSteps(after);

  // P6 PEAK ENTRY -> NO EXTENSION -> CLIFF.
  // A real ascent establishes the peak, price then spends measurable time in a
  // narrow near-peak stall without extending, and the first material rollover
  // begins before the Bolt. This intentionally works at any price band.
  const nearPeakAfter=after.filter(x=>x.p>=peak.p-g.peakEntryStallBandCents);
  const stallEnd=nearPeakAfter.at(-1);
  const stallMs=stallEnd?Math.max(0,stallEnd.t-peak.t):0;
  if(priorRise>=g.peakEntryMinimumPriorRiseCents&&stallMs>=g.peakEntryMinimumStallMs&&drawdown>=g.peakEntryRolloverDropCents&&downSteps>=g.peakEntryMinimumDownSteps){
    reasons.push('peak_entry_no_extension_cliff');
  }

  // P7 MICRO BREAKOUT -> IMMEDIATE REJECTION -> CLIFF.
  // Require an actually established prior high (multiple touches over time), a
  // small breakout above it, then rejection below that old high with multiple
  // post-peak down steps. A healthy breakout that holds above the old high is
  // deliberately left clear.
  if(peakIndex>=3){
    const prior=points.slice(0,peakIndex),priorHigh=Math.max(...prior.map(x=>x.p));
    const breakout=peak.p-priorHigh;
    const priorTouches=prior.filter(x=>x.p>=priorHigh-g.microBreakoutPriorHighBandCents);
    const touchSpan=priorTouches.length>=2?priorTouches.at(-1).t-priorTouches[0].t:0;
    if(breakout>=g.microBreakoutMinimumCents&&breakout<=g.microBreakoutMaximumCents&&priorTouches.length>=g.microBreakoutPriorHighMinimumTouches&&touchSpan>=g.microBreakoutPriorHighMinimumSpanMs&&drawdown>=g.microBreakoutMinimumGivebackCents&&current.p<=priorHigh-g.microBreakoutPriorHighUndercutCents&&downSteps>=g.microBreakoutMinimumDownSteps){
      reasons.push('micro_breakout_rejection_cliff');
    }
  }

  // P8 EXTENDED HIGH-ZONE EXHAUSTION -> TERMINAL REVERSAL.
  // High price alone is never sufficient. The path must first make a material
  // ascent into the high zone, compress near the top for multiple observations,
  // then reverse materially with repeated lower observations before the Bolt.
  const compressionStart=Math.max(0,peakIndex-g.highZoneCompressionMinimumSamples+1);
  const compression=points.slice(compressionStart,peakIndex+1);
  const compressionRange=compression.length?Math.max(...compression.map(x=>x.p))-Math.min(...compression.map(x=>x.p)):Infinity;
  const compressionSpan=compression.length>=2?compression.at(-1).t-compression[0].t:0;
  if(peak.p>=g.highZoneMinimumCents&&priorRise>=g.highZoneMinimumAscentCents&&compression.length>=g.highZoneCompressionMinimumSamples&&compressionRange<=g.highZoneCompressionBandCents&&compressionSpan>=g.highZoneCompressionMinimumSpanMs&&drawdown>=g.highZoneTerminalReversalCents&&downSteps>=g.highZoneMinimumDownSteps){
    reasons.push('high_zone_exhaustion_terminal_reversal');
  }
  return reasons;
}
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
  // R5/P6-P8: new upside-origin danger families discovered in the five-log
  // 2026-08-29 loss wave. They use only observations available before Bolt
  // emission and therefore add no look-ahead or post-FIRE authority.
  reasons.push(...preBoltUpsideDangerPatterns(points,g));
  return{contaminated:reasons.length>0,reasons:[...new Set(reasons)],points:points.length,turns:turns.slice(-12),windowMs};
}

function economicTargetForAttack({askCents=0,stakeCents=0,settings={}}={}){
  const ask=Math.max(1,finite(askCents,0)),stake=Math.max(1,finite(stakeCents,0));
  const target=Math.max(0.01,finite(settings.infinityBreakMinNetPerOriginalContractCents,5));
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
    ['Scarlet Needle','scarletNeedleEnabled','scarletNeedleMinEntryCents','scarletNeedleMaxEntryCents','scarletNeedleStakeCents'],
    ['Recovery Hunter','recoveryHunterEnabled','recoveryMinEntryCents','recoveryMaxEntryCents','recoveryStakeCents'],
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
    if(concept==='Recovery Hunter'&&recoveryContext?.eligible!==true)return false;
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
    if(concept==='Scarlet Needle'){
      const signalReferenceCents=finite(askCents,0);
      const triggerPriceCents=Math.max(0,signalReferenceCents-SCARLET_NEEDLE.triggerDropCents);
      const plannedEntryCents=Math.min(triggerPriceCents,maxEntryCents);
      const target=economicTargetForAttack({askCents:Math.max(1,plannedEntryCents),stakeCents,settings});
      return{concept,display:EXECUTION_ATTACK_DISPLAY[concept]?.name||concept,minEntryCents,maxEntryCents,stakeCents,delayedEntry:true,triggerDropCents:SCARLET_NEEDLE.triggerDropCents,signalReferenceCents,triggerPriceCents,plannedEntryCents,...target};
    }
    const target=economicTargetForAttack({askCents,stakeCents,settings});
    return{concept,display:EXECUTION_ATTACK_DISPLAY[concept]?.name||concept,minEntryCents,maxEntryCents,stakeCents,delayedEntry:false,plannedEntryCents:askCents,...target};
  });
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
    recoveryContext:recoveryContext||null,fieldContext:structuralFieldContext,eligibleAttacks:eligibleBands,sourceScore,
    targetNetPerOriginalContractCents:Math.max(0.01,finite(settings.infinityBreakMinNetPerOriginalContractCents,5)),minimumRequiredGrossMoveCents:minimumGross,targetFeasibilityScore,
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
  if(features.historySamples<ATOMIC_THUNDER_BOLT.minimumHistorySamples)return{detected:false,reason:'insufficient_history',score:0};
  const directional=Math.max(features.velocity5CentsPerSec,features.velocity15CentsPerSec,features.velocity30CentsPerSec)>0;
  const movement=Math.max(Math.abs(features.recentMove30Cents),features.reboundCents,features.momentumRiseCents,features.waveFavorableMoveCents);
  const structural=features.cosmoCount>0||features.crashDepthCents>=2||features.recoveryContext?.eligible===true||Number(features.fieldContext?.independentEventCount||0)>=2;
  if(movement<1&&!directional&&!structural)return{detected:false,reason:'no_short_horizon_impulse',score:features.sourceScore||0};
  const targetFeasibility=clamp(features.targetFeasibilityScore??50);
  const score=clamp(28+(features.sourceScore||0)*0.38+Math.min(13,movement*2.5)+Math.min(8,features.cosmoCount*3)+targetFeasibility*0.22-Math.min(15,features.lowerLowCount*3));
  return{detected:true,reason:'opportunity_nominated',score:Number(score.toFixed(2))};
}

export class AtomicThunderBoltEngine{
  constructor({market,getSettings,db,systemName='SAGITTARIUS',sourceRelease='',audit=async()=>{},onOpportunityCompleted=null,onCandidateStage=null}={}){
    this.market=market;this.getSettings=getSettings||(()=>({}));this.db=db;this.systemName=systemName;this.sourceRelease=sourceRelease;this.audit=audit;this.onOpportunityCompleted=typeof onOpportunityCompleted==='function'?onOpportunityCompleted:null;this.onCandidateStage=typeof onCandidateStage==='function'?onCandidateStage:null;
    this.activeByTicker=new Map();this.preBolts=new Map();this.patternBlockedByTicker=new Map();this.shadowEpisodes=new Map();this.shadowByTicker=new Map();this.detected=0;this.expired=0;this.lastBolt=null;this.counterfactualCompleted=0;this.preBoltStarted=0;this.preExamPassed=0;this.patternBlocked=0;this.finalExamPassed=0;this.lastPatternBlock=null;
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
      if(ep?.attackSelected==='Scarlet Needle'||ep?.athenaDecision?.scarletNeedle?.version===SCARLET_NEEDLE.version)continue;
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
    // Bound active signal memory independently from scanner cardinality.
    for(const [ticker,active] of [...this.activeByTicker])if(now>Number(active?.expiresAtMs||0)){this.activeByTicker.delete(ticker);this.expired+=1;}
    while(this.activeByTicker.size>=ATOMIC_THUNDER_BOLT.maximumActiveBolts){const first=this.activeByTicker.keys().next().value;this.activeByTicker.delete(first);this.expired+=1;}
    while(this.preBolts.size>=ATOMIC_THUNDER_PATTERN_GUARDIAN.maximumActivePreBolts){const first=this.preBolts.keys().next().value;this.preBolts.delete(first);}
    while(this.patternBlockedByTicker.size>=ATOMIC_THUNDER_PATTERN_GUARDIAN.maximumActivePreBolts){const first=this.patternBlockedByTicker.keys().next().value;this.patternBlockedByTicker.delete(first);}
    const settings=this.getSettings();
    const configuredFirstExamMs=Math.max(1,Math.floor(finite(settings.atomicThunderFirstPatternExamSeconds,30)))*1000;
    const configuredFinalExamMs=Math.max(configuredFirstExamMs+1000,Math.floor(finite(settings.atomicThunderFinalPatternExamSeconds,120))*1000);
    const history=this.market?.getHistory?.(q?.ticker)||[];
    const features=atomicThunderBoltFeatures({q,history,settings,cosmos,crashSignal,recoveryContext,fieldContext,now});
    const d=atomicThunderBoltDecision(features,settings);
    const ticker=String(features?.ticker||q?.ticker||'');
    if(!ticker)return null;
    const active=this.activeByTicker.get(ticker);
    if(active&&now<=Number(active.expiresAtMs||0)){active.features=features;active.score=d.score??active.score;active.updatedAtMs=now;return active;}
    let pre=this.preBolts.get(ticker);
    let blocked=this.patternBlockedByTicker.get(ticker);
    // R59/ATB2-R4: contamination is sticky for the damaged market regime, but
    // never forever. A real CI1 EPISODE_RESET is a causal regime boundary and
    // therefore ends the old blocked opportunity even when the broad Atomic
    // Thunder nomination never briefly toggles false. This is deliberately not
    // a TTL: only an observed regime transition (or nomination reset below) may
    // release the marker.
    const currentRegimeResetAtMs=finite(crashState?.lastResetAtMs,0);
    const blockedRegimeResetAtMs=finite(blocked?.regimeResetAtMs,0);
    if(blocked&&currentRegimeResetAtMs>Math.max(blockedRegimeResetAtMs,finite(blocked?.atMs,0))){
      this.patternBlockedByTicker.delete(ticker);
      this.candidateStage({candidateId:blocked.id,stage:'REGIME_RESET',status:'PASS',reason:'ci1_episode_reset_new_regime',ticker,eventTicker:features.eventTicker});
      await this.audit('atomic_thunder_pattern_block_released_new_regime',{candidateId:blocked.id,ticker,eventTicker:features.eventTicker,blockedAtMs:blocked.atMs||null,priorRegimeResetAtMs:blockedRegimeResetAtMs||null,newRegimeResetAtMs:currentRegimeResetAtMs}).catch(()=>{});
      blocked=null;
    }
    // A contamination kill is sticky for the current Atomic Thunder opportunity.
    // The ticker may start a new PRE-BOLT only after the underlying nomination
    // resets OR a proven CI1 regime boundary above, preventing simple
    // crash/rebound rehabilitation while allowing a genuinely new regime.
    if(!d.detected){
      if(blocked)this.patternBlockedByTicker.delete(ticker);
      if(pre&&now-pre.startedAtMs>=Number(pre.finalExamMs||configuredFinalExamMs))this.preBolts.delete(ticker);
      return null;
    }
    const patternWindowMs=Number(pre?.patternLookbackMs||configuredFinalExamMs);
    const pattern=atomicThunderDangerPattern({history,now,windowMs:patternWindowMs,crashSignal,crashState});
    if(pattern.contaminated){
      if(pre)this.preBolts.delete(ticker);
      if(!blocked){
        const marker={id:pre?.id||randomUUID(),ticker,atMs:now,regimeResetAtMs:currentRegimeResetAtMs||0,reasons:pattern.reasons,preBoltAgeMs:pre?Math.max(0,now-pre.startedAtMs):0};
        this.patternBlockedByTicker.set(ticker,marker);this.patternBlocked+=1;this.lastPatternBlock=marker;
        if(!pre)this.candidateStage({candidateId:marker.id,stage:'UNIQUE_OPPORTUNITY',status:'PASS',reason:'atomic_thunder_opportunity_nominated',ticker,eventTicker:features.eventTicker});
        this.candidateStage({candidateId:marker.id,stage:'PATTERN_BLOCKED',status:'BLOCKED',reason:pattern.reasons[0]||'dangerous_price_path',reasons:pattern.reasons,ticker,eventTicker:features.eventTicker});
        await this.audit('atomic_thunder_pre_bolt_pattern_blocked',{ticker,eventTicker:features.eventTicker,reasons:pattern.reasons,preBoltAgeMs:marker.preBoltAgeMs}).catch(()=>{});
      }
      return null;
    }
    if(blocked)return null;
    // Preserve the existing durable-Bolt fail-closed invariant before we spend
    // the configured qualification interval observing a candidate. If the writer is unavailable there
    // can never be an executable Bolt, so the PRE-BOLT is not started.
    if(typeof this.db?.upsertOpportunityEpisode!=='function'){
      await this.audit('atomic_thunder_bolt_persistence_failed',{ticker,reason:'persistence_writer_missing'},'error').catch(()=>{});
      return null;
    }
    pre=this.preBolts.get(ticker);
    if(!pre){
      pre={id:randomUUID(),ticker,eventTicker:features.eventTicker,startedAtMs:now,firstExamMs:configuredFirstExamMs,finalExamMs:configuredFinalExamMs,patternLookbackMs:configuredFinalExamMs,preExamPassed:false,features,score:d.score,updatedAtMs:now};this.preBolts.set(ticker,pre);this.preBoltStarted+=1;
      this.candidateStage({candidateId:pre.id,stage:'UNIQUE_OPPORTUNITY',status:'PASS',reason:'atomic_thunder_opportunity_nominated',ticker,eventTicker:features.eventTicker});
      this.candidateStage({candidateId:pre.id,stage:'PRE_BOLT',status:'PASS',reason:'pre_bolt_started',ticker,eventTicker:features.eventTicker});
      await this.audit('atomic_thunder_pre_bolt_started',{preBoltId:pre.id,ticker,eventTicker:features.eventTicker,score:d.score,firstExamMs:pre.firstExamMs,finalExamMs:pre.finalExamMs}).catch(()=>{});
      return null;
    }
    pre.features=features;pre.score=d.score;pre.updatedAtMs=now;
    const age=Math.max(0,now-pre.startedAtMs);
    if(!pre.preExamPassed&&age>=Number(pre.firstExamMs||configuredFirstExamMs)){
      pre.preExamPassed=true;pre.preExamPassedAtMs=now;this.preExamPassed+=1;
      this.candidateStage({candidateId:pre.id,stage:'FIRST_EXAM_PASS',status:'PASS',reason:'first_pattern_exam_clear',ticker,eventTicker:features.eventTicker});
      await this.audit('atomic_thunder_pre_bolt_first_exam_passed',{preBoltId:pre.id,ticker,eventTicker:features.eventTicker,ageMs:age,firstExamMs:pre.firstExamMs}).catch(()=>{});
    }
    if(age<Number(pre.finalExamMs||configuredFinalExamMs))return null;
    this.preBolts.delete(ticker);this.finalExamPassed+=1;
    this.candidateStage({candidateId:pre.id,stage:'FINAL_EXAM_PASS',status:'PASS',reason:'final_pattern_exam_clear',ticker,eventTicker:features.eventTicker});
    // Only after the configured final pattern-clear examination do we materialize
    // the existing five-second executable Bolt consumed by Arayashiki/Athena.
    const id=randomUUID();
    const preBoltClearance={version:ATOMIC_THUNDER_PATTERN_GUARDIAN.version,policyRevision:ATOMIC_THUNDER_PATTERN_GUARDIAN.policyRevision,status:'CLEARED',preBoltId:pre.id,startedAtMs:pre.startedAtMs,firstExamMs:pre.firstExamMs,firstExamPassedAtMs:pre.preExamPassedAtMs||null,finalExamMs:pre.finalExamMs,finalExamPassedAtMs:now,patternLookbackMs:pre.patternLookbackMs,contaminated:false};
    const core={version:ATOMIC_THUNDER_BOLT.version,policyRevision:ATOMIC_THUNDER_BOLT.policyRevision,id,systemName:this.systemName,sourceRelease:this.sourceRelease,ticker:features.ticker,eventTicker:features.eventTicker,side:'YES',sport:features.sport,detectedAtMs:now,expiresAtMs:now+ATOMIC_THUNDER_BOLT.maximumOpportunityAgeMs,score:d.score,preBoltClearance,features};
    const fingerprint=createHash('sha256').update(JSON.stringify(core)).digest('hex');
    const bolt={...core,fingerprint,updatedAtMs:now};
    if(typeof this.db?.upsertOpportunityEpisode!=='function'){
      this.candidateStage({candidateId:pre.id,stage:'BOLT',status:'BLOCKED',reason:'persistence_writer_missing',ticker,eventTicker:features.eventTicker});
      await this.audit('atomic_thunder_bolt_persistence_failed',{boltId:id,ticker:features.ticker,reason:'persistence_writer_missing'},'error').catch(()=>{});
      return null;
    }
    try{
      await this.db.upsertOpportunityEpisode({id,systemName:this.systemName,sourceRelease:this.sourceRelease,cohortId:String(settings.resetTimestampMs||''),ticker:features.ticker,eventTicker:features.eventTicker,side:'YES',sport:features.sport,boltAtMs:now,boltSnapshot:bolt,updatedAtMs:now});
    }catch(error){
      this.candidateStage({candidateId:pre.id,stage:'BOLT',status:'BLOCKED',reason:'persistence_failed',ticker,eventTicker:features.eventTicker});
      await this.audit('atomic_thunder_bolt_persistence_failed',{boltId:id,ticker:features.ticker,message:String(error?.message||error)},'error').catch(()=>{});
      return null;
    }
    this.activeByTicker.set(features.ticker,bolt);this.detected+=1;this.lastBolt=bolt;
    this.candidateStage({candidateId:pre.id,boltId:id,stage:'BOLT',status:'PASS',reason:'bolt_emitted',ticker:features.ticker,eventTicker:features.eventTicker});
    await this.audit('atomic_thunder_bolt_detected',{boltId:id,preBoltId:pre.id,ticker:features.ticker,eventTicker:features.eventTicker,score:d.score,askCents:features.askCents,gameMinutes:features.gameMinutes,eligibleAttacks:features.eligibleAttacks.map(x=>x.concept)}).catch(()=>{});
    return bolt;
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
  summary(){const s=this.getSettings();return{version:ATOMIC_THUNDER_BOLT.version,role:ATOMIC_THUNDER_BOLT.role,authority:ATOMIC_THUNDER_BOLT.authority,noBoltNoAttack:true,patternGuardian:{version:ATOMIC_THUNDER_PATTERN_GUARDIAN.version,policyRevision:ATOMIC_THUNDER_PATTERN_GUARDIAN.policyRevision,mappedFamilies:ATOMIC_THUNDER_PATTERN_GUARDIAN.mappedFamilies,firstExamSeconds:Math.max(1,Math.floor(finite(s.atomicThunderFirstPatternExamSeconds,30))),finalExamSeconds:Math.max(2,Math.floor(finite(s.atomicThunderFinalPatternExamSeconds,120))),timingFrozenPerPreBolt:true,activePreBolts:this.preBolts.size,blockedAwaitingSignalReset:this.patternBlockedByTicker.size,preBoltStarted:this.preBoltStarted,preExamPassed:this.preExamPassed,patternBlocked:this.patternBlocked,finalExamPassed:this.finalExamPassed,lastPatternBlock:this.lastPatternBlock},detected:this.detected,expired:this.expired,active:this.activeByTicker.size,counterfactualTracking:this.shadowEpisodes.size,counterfactualCompleted:this.counterfactualCompleted,counterfactualPersistence:{version:COUNTERFACTUAL_PERSISTENCE.version,maxConcurrency:COUNTERFACTUAL_PERSISTENCE.maximumConcurrency,maxPending:COUNTERFACTUAL_PERSISTENCE.maximumPending,active:this.counterfactualActive.size,pending:this.counterfactualPending.size,totalQueued:this.counterfactualTotalQueued,totalCoalesced:this.counterfactualTotalCoalesced,totalFailed:this.counterfactualTotalFailed,totalBackpressure:this.counterfactualTotalBackpressure,maxObservedPending:this.counterfactualMaxObservedPending,lastError:this.counterfactualLastError},lastBolt:this.lastBolt};}
}
