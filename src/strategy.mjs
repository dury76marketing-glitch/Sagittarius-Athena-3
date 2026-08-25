import { randomUUID } from 'node:crypto';
import {
  FEEDERS,
  MOMENTUM,
  WAVE,
  RECOVERY,
  GOLDEN_DRAGON,
  GOLDEN_FEED_BUS,
  DRAGON_RECOVERY,
  GOLDEN_DRAGON_HUNTER,
  goldenDragonStructureQualifiedAtQuote,
  WATCHDOG_MODEL,
  PORTFOLIO_CONCEPTS,
  FEEDER_CONCEPTS,
  PROTECTED_RUNNER_INTELLIGENCE,
  ATHENA_EXIT_INTELLIGENCE,
  GOLDEN_EYE,
  PROFIT_LEARNING_INTELLIGENCE,
  ATOMIC_THUNDER,
  stableDropEntry,
  estimateTimeLeftMs,
} from './doctrine.mjs';
import { RELEASE } from './config.mjs';
import { authoritativeClockSnapshot, isConfirmedGameClockState, isEntryAuthorizedGameClockState } from './gameClock.mjs';

const nowId = () => randomUUID();
const openLike = (s) => ['open', 'entry_pending', 'exit_pending', 'pending_recovery'].includes(s);
const slotsLeft = (entries, settings) => Math.max(
  0,
  settings.maxPositions - entries.filter((e) => PORTFOLIO_CONCEPTS.has(e.conceptName) && openLike(e.status)).length,
);
const FINAL_MARKET_STATUSES = new Set(['determined', 'finalized', 'settled']);

function crashStructureAtQuote(signal, q, settings) {
  if (!signal?.episodeId || !q) return { ok:false, reason:'missing_signal_or_quote' };
  const bid = Number(q.yesBid || 0);
  const ask = Number(q.yesAsk || 0);
  if (!(bid > 0) || !(ask > 0) || bid > ask) return { ok:false, reason:'invalid_quote' };
  const depth = Math.max(1, Number(signal.crashDepthCents || 0));
  if (depth + 1e-9 < Number(settings.crashRecoveryMinCrashCents)) return { ok:false, reason:'crash_depth' };
  const trough = Number(signal.troughCents || 0);
  if (!(trough > 0) || bid < trough) return { ok:false, reason:'new_low' };
  const rebound = Math.max(0, bid - trough);
  const reclaimRate = rebound / depth;
  const minReclaim = Number(settings.crashRecoveryMinReclaimRate || 0);
  const requiredRebound = Math.max(Number(settings.crashRecoveryMinReboundCents || 0), Math.ceil(depth * minReclaim - 1e-12));
  if (rebound < requiredRebound || reclaimRate + 1e-12 < minReclaim) return { ok:false, reason:'rebound_structure' };
  if (Number(signal.stableObservations || 0) < Number(settings.crashRecoveryStableObservations || 0)) return { ok:false, reason:'stable_observations' };
  if (Number(signal.upwardTicks || 0) < Number(settings.crashRecoveryUpwardTicks || 0)) return { ok:false, reason:'upward_ticks' };
  return { ok:true, bid, ask, troughCents:trough, crashDepthCents:depth, reboundCents:rebound, reclaimRate, requiredReboundCents:requiredRebound };
}

function crashSignalQualifiedAtQuote(signal, q, settings) {
  const base = crashStructureAtQuote(signal, q, settings);
  if (!base.ok) return base;
  if (base.ask < Number(settings.crashRecoveryMinEntryCents) || base.ask > Number(settings.crashRecoveryMaxEntryCents)) return { ...base, ok:false, reason:'entry_band' };
  if (base.ask - base.bid > Number(settings.crashRecoveryMaxSpreadCents)) return { ...base, ok:false, reason:'spread' };
  return base;
}

export function dragonSignalQualifiedAtQuote(signal, q, settings) {
  const base = crashStructureAtQuote(signal, q, settings);
  if (!base.ok) return base;
  const episodeIndex = Number(signal.episodeIndex || 0);
  if (episodeIndex < 1 || episodeIndex > Number(settings.dragonMaxEpisode ?? 2)) return { ...base, ok:false, reason:'episode' };
  if (base.ask < Number(settings.dragonMinSignalPriceCents ?? 84) || base.ask > Number(settings.dragonMaxSignalPriceCents ?? 88)) return { ...base, ok:false, reason:'signal_band' };
  if (base.ask - base.bid > Number(settings.maxSpreadCents ?? 3)) return { ...base, ok:false, reason:'spread' };
  return base;
}

function crashSourceSnapshotFromSignal(signal, validation = null) {
  return {
    version:signal?.version || 'CI1', episodeId:String(signal?.episodeId || ''), episodeIndex:Number(signal?.episodeIndex || 0),
    preCrashPeakCents:Number(signal?.preCrashPeakCents || 0), troughCents:Number(signal?.troughCents || 0),
    crashDepthCents:Number(signal?.crashDepthCents || 0), reboundCents:Number(validation?.reboundCents ?? signal?.reboundCents ?? 0),
    reclaimRate:Number(validation?.reclaimRate ?? signal?.reclaimRate ?? 0), stableObservations:Number(signal?.stableObservations || 0),
    upwardTicks:Number(signal?.upwardTicks || 0), crashStartedAtMs:Number(signal?.crashStartedAtMs || 0),
    troughAtMs:Number(signal?.troughAtMs || 0), reboundConfirmedAtMs:Number(signal?.reboundConfirmedAtMs || 0),
    sport:signal?.sport || 'Unknown',
    lowerLowCount:Number(signal?.lowerLowCount || 0), reboundLostCount:Number(signal?.reboundLostCount || 0),
    validatedBidCents:validation?.bid == null ? null : Number(validation.bid),
    validatedAskCents:validation?.ask == null ? null : Number(validation.ask),
  };
}


export function goldenDragonSignalQualifiedAtQuote(signal, q, settings, learning = null, now = Date.now()) {
  if (!signal?.episodeId || !q) return {ok:false,reason:'missing_signal_or_quote'};
  const structure=goldenDragonStructureQualifiedAtQuote(signal,q,settings);
  const bid=Number(q.yesBid||0), ask=Number(q.yesAsk||0), depth=Math.max(1,Number(signal.crashDepthCents||0)), trough=Number(signal.troughCents||0);
  if (!structure.ok) return structure;
  if (Number(signal.episodeIndex||0)<1 || Number(signal.episodeIndex||0)>Number(settings.goldenDragonMaxEpisode??4)) return {ok:false,reason:'episode'};
  const rebound=Number(structure.reboundCents), reclaimRate=Number(structure.reclaimRate);
  const age=Math.max(0,now-Number(signal.troughAtMs||signal.crashStartedAtMs||now));
  const minAge=Math.max(0,Number(settings.goldenDragonMinRecoveryAgeSeconds??GOLDEN_DRAGON.minRecoveryAgeMs/1000))*1000;
  if (age < minAge) return {ok:false,reason:'recovery_age'};
  const reboundAt=Number(signal.reboundConfirmedAtMs||0);
  const troughAt=Number(signal.troughAtMs||signal.crashStartedAtMs||0);
  if (!(reboundAt>0) || (troughAt>0 && reboundAt<troughAt)) return {ok:false,reason:'recovery_clock_invalid',recoveryAgeMs:age,reboundAtMs:reboundAt,troughAtMs:troughAt};
  const reboundAge=reboundAt>0?Math.max(0,now-reboundAt):Number.POSITIVE_INFINITY;
  const maxRecoveryAge=Math.max(1,Number(settings.goldenDragonMaxRecoveryAgeSeconds??GOLDEN_DRAGON.maxRecoveryAgeMs/1000))*1000;
  if (reboundAge > maxRecoveryAge) return {ok:false,reason:'recovery_stale',recoveryAgeMs:age,reboundAgeMs:reboundAge};
  if (ask<Number(settings.goldenDragonMinSignalPriceCents??27)||ask>Number(settings.goldenDragonMaxSignalPriceCents??95)) return {ok:false,reason:'signal_band'};
  if (ask-bid>Number(settings.maxSpreadCents??3)) return {ok:false,reason:'spread'};
  const profile=learning?.goldenDragonSurvivalProfile?.({...signal,signalPriceCents:ask,validatedAskCents:ask}) || {totalObservations:0,smoothedSurvivalRate:0.5,specificity:'none'};
  if (Number(profile.totalObservations||0)>=GOLDEN_DRAGON.minHistoricalObservations && Number(profile.smoothedSurvivalRate||0)<GOLDEN_DRAGON.minHistoricalSurvivalRate) return {ok:false,reason:'historical_survival',profile};
  const elapsed=confirmedInGameElapsedMinutes(q,now);
  let score=50;
  score += Math.min(15,Math.max(0,(reclaimRate-0.5)*30));
  score += Math.min(10,Math.max(0,(rebound/depth-0.5)*20));
  score += Math.min(6,Math.max(0,Number(signal.stableObservations||0)-Number(structure.config?.stableObservations??GOLDEN_DRAGON.stableObservations))*0.25);
  score += Math.min(6,Math.max(0,Number(signal.upwardTicks||0)-Number(structure.config?.upwardTicks??GOLDEN_DRAGON.upwardTicks))*1.5);
  score += Math.min(8,Math.max(-8,(Number(profile.smoothedSurvivalRate||0.5)-0.5)*20));
  score -= Math.min(12,Math.max(0,Number(signal.episodeIndex||1)-1)*3);
  score -= Math.min(10,Math.max(0,depth-30)*0.4);
  score -= Math.min(12,Number(signal.lowerLowCount||0)*3);
  score -= Math.min(18,Number(signal.reboundLostCount||0)*6);
  if (elapsed!=null && elapsed>=Number(settings.minGameMinutes||0)) score+=4;
  score=Math.max(0,Math.min(100,score));
  const minScore=Number(settings.goldenDragonMinTrustScore??GOLDEN_DRAGON.minTrustScore);
  if (score+1e-9<minScore) return {ok:false,reason:'trust_score',score,profile,bid,ask,troughCents:trough,crashDepthCents:depth,reboundCents:rebound,reclaimRate,recoveryAgeMs:age,reboundAgeMs:reboundAge};
  return {ok:true,reason:'qualified',score,profile,bid,ask,troughCents:trough,crashDepthCents:depth,reboundCents:rebound,reclaimRate,recoveryAgeMs:age,reboundAgeMs:reboundAge};
}

const goldenSignalFromLearning=(learning,ticker)=>typeof learning?.goldenDragonEntrySignal==='function'
  ? learning.goldenDragonEntrySignal(ticker)
  : typeof learning?.crashEntrySignal==='function' ? learning.crashEntrySignal(ticker) : null;

function goldenSourceFromEntry(entry) {
  const source=entry?.entryConfig?.goldenDragonSource;
  if (!source || typeof source !== 'object') return null;
  const episodeId=String(source.episodeId || entry?.sourceTradeId || '');
  if (!episodeId) return null;
  return { ...source, episodeId };
}

export function goldenApprovalSnapshotQualified(source, doctrine = {}) {
  if (!source?.episodeId) return {ok:false,reason:'approval_source_missing'};
  const cfg=(runtimeKey,feederKey,fallback)=>{
    if (Object.hasOwn(doctrine,runtimeKey)) return Number(doctrine[runtimeKey]);
    if (Object.hasOwn(doctrine,feederKey)) return Number(doctrine[feederKey]);
    return Number(fallback);
  };
  const depth=Number(source.crashDepthCents || 0);
  const rebound=Number(source.reboundCents || 0);
  const reclaim=Number(source.reclaimRate || 0);
  const stable=Number(source.stableObservations || 0);
  const upward=Number(source.upwardTicks || 0);
  const trust=Number(source.trustScore || 0);
  const episode=Number(source.episodeIndex || 0);
  const signalPrice=Number(source.signalPriceCents || source.validatedAskCents || 0);
  const bid=Number(source.validatedBidCents || 0);
  const ask=Number(source.validatedAskCents || signalPrice || 0);
  const signalAt=Number(source.signalAtMs||0);
  const troughAt=Number(source.troughAtMs||source.crashStartedAtMs||0);
  const reboundAt=Number(source.reboundConfirmedAtMs||0);
  const minRecoveryAgeMs=Math.max(0,cfg('goldenDragonMinRecoveryAgeSeconds','minRecoveryAgeSeconds',GOLDEN_DRAGON.minRecoveryAgeMs/1000))*1000;
  const maxRecoveryAgeMs=Math.max(1,cfg('goldenDragonMaxRecoveryAgeSeconds','maxRecoveryAgeSeconds',GOLDEN_DRAGON.maxRecoveryAgeMs/1000))*1000;
  if (!(signalAt>0) || !(troughAt>0) || !(reboundAt>0) || reboundAt<troughAt || signalAt<reboundAt) return {ok:false,reason:'approval_recovery_clock'};
  if (signalAt-troughAt+1e-9<minRecoveryAgeMs) return {ok:false,reason:'approval_recovery_too_young'};
  if (signalAt-reboundAt-1e-9>maxRecoveryAgeMs) return {ok:false,reason:'approval_recovery_stale_at_creation'};
  if (!(depth > 0) || depth + 1e-9 < cfg('goldenDragonMinCrashCents','minCrashCents',GOLDEN_DRAGON.minCrashCents)) return {ok:false,reason:'approval_crash_depth'};
  if (rebound + 1e-9 < cfg('goldenDragonMinReboundCents','minReboundCents',GOLDEN_DRAGON.minReboundCents)) return {ok:false,reason:'approval_rebound'};
  if (reclaim + 1e-12 < cfg('goldenDragonMinReclaimRate','minReclaimRate',GOLDEN_DRAGON.minReclaimRate)) return {ok:false,reason:'approval_reclaim'};
  if (stable < cfg('goldenDragonStableObservations','stableObservations',GOLDEN_DRAGON.stableObservations)) return {ok:false,reason:'approval_stability'};
  if (upward < cfg('goldenDragonUpwardTicks','upwardTicks',GOLDEN_DRAGON.upwardTicks)) return {ok:false,reason:'approval_upward_ticks'};
  if (trust + 1e-9 < cfg('goldenDragonMinTrustScore','minTrustScore',GOLDEN_DRAGON.minTrustScore)) return {ok:false,reason:'approval_trust'};
  if (episode < 1 || episode > cfg('goldenDragonMaxEpisode','maxEpisode',4)) return {ok:false,reason:'approval_episode'};
  if (!(signalPrice > 0) || signalPrice < cfg('goldenDragonMinSignalPriceCents','minPriceCents',27) || signalPrice > cfg('goldenDragonMaxSignalPriceCents','maxPriceCents',95)) return {ok:false,reason:'approval_signal_band'};
  if (bid > 0 && ask > 0 && ask - bid > cfg('maxSpreadCents','maxSpreadCents',3)) return {ok:false,reason:'approval_spread'};
  const profile=source.survivalProfile && typeof source.survivalProfile === 'object' ? source.survivalProfile : null;
  if (profile && Number(profile.totalObservations || 0) >= GOLDEN_DRAGON.minHistoricalObservations
      && Number(profile.smoothedSurvivalRate || 0) < GOLDEN_DRAGON.minHistoricalSurvivalRate) {
    return {ok:false,reason:'approval_historical_survival'};
  }
  return {ok:true,reason:'qualified'};
}

function goldenFeedSignalFromEntry(entry, q = null, stateOverride = null) {
  const source=goldenSourceFromEntry(entry);
  if (!source) return null;
  const state=stateOverride && typeof stateOverride === 'object' ? stateOverride : (entry?.feederState || {});
  const bid=Number(q?.yesBid || state.lastBidCents || entry?.currentPriceCents || source.validatedBidCents || 0);
  const ask=Number(q?.yesAsk || state.lastAskCents || source.validatedAskCents || source.signalPriceCents || 0);
  const trough=Number(source.troughCents || 0);
  const depth=Math.max(1,Number(source.crashDepthCents || 0));
  const rebound=Math.max(0,bid-trough);
  const reclaimRate=rebound/depth;
  return {
    ...source,
    version:source.version || GOLDEN_DRAGON.version,
    episodeId:String(source.episodeId),
    reboundCents:rebound,
    reclaimRate,
    stableObservations:Number(state.stableObservations ?? source.stableObservations ?? 0),
    upwardTicks:Number(state.upwardTicks ?? source.upwardTicks ?? 0),
    lastBidCents:bid,
    lastAskCents:ask,
  };
}

function goldenFeedAuthoritySnapshot(entry) {
  const source=goldenSourceFromEntry(entry);
  const state=entry?.feederState && typeof entry.feederState === 'object' ? entry.feederState : {};
  if (!source) return null;
  return {
    version:GOLDEN_FEED_BUS.version,
    feederId:entry.id,
    ticker:entry.ticker,
    eventTicker:entry.eventTicker || entry.ticker,
    episodeId:String(source.episodeId),
    state:String(state.state || ''),
    activatedAtMs:Number(state.activatedAtMs || 0) || null,
    lastObservationAtMs:Number(state.lastObservationAtMs || 0) || null,
    lastBidCents:Number(state.lastBidCents || entry.currentPriceCents || 0),
    lastAskCents:Number(state.lastAskCents || source.validatedAskCents || 0),
    stableObservations:Number(state.stableObservations ?? source.stableObservations ?? 0),
    upwardTicks:Number(state.upwardTicks ?? source.upwardTicks ?? 0),
    creationDoctrine:structuredClone(entry?.entryConfig?.feeder || {}),
    source:structuredClone(source),
  };
}

function isActiveGoldenFeed(entry) {
  return entry?.conceptName==='Golden Dragon'
    && openLike(entry.status)
    && entry?.feederState?.version===GOLDEN_FEED_BUS.version
    && entry?.feederState?.state===GOLDEN_FEED_BUS.activeState;
}

function latestActiveGoldenFeeds(entries) {
  const byTicker=new Map();
  for(const entry of entries||[]){
    if(!isActiveGoldenFeed(entry))continue;
    const prior=byTicker.get(entry.ticker);
    if(!prior||Number(entry.openedAtMs||0)>Number(prior.openedAtMs||0))byTicker.set(entry.ticker,entry);
  }
  return [...byTicker.values()];
}

// A persisted Golden approval is durable after creation. Crash intelligence is
// consulted only for exact-episode continuity: it may prove that a newer crash
// superseded the approval, or that state restoration is not yet sufficient to
// prove continuity. It is never used to re-run Golden's creation-time age/trust
// gates. This is the core GFB1 separation between certification and consumption.
export function goldenFeedContinuity(source, learningState = null, currentSignal = null) {
  const episodeId=String(source?.episodeId||'');
  const episodeIndex=Number(source?.episodeIndex||0);
  if(!episodeId||episodeIndex<1)return{ok:false,state:'INVALID',reason:'approval_episode_identity_missing'};
  if(learningState?.phase==='FINAL')return{ok:false,state:GOLDEN_FEED_BUS.finalState,reason:'learning_market_final'};

  const currentId=String(currentSignal?.episodeId||'');
  const currentIndex=Number(currentSignal?.episodeIndex||0);
  if(currentId&&currentId!==episodeId){
    if(currentIndex>episodeIndex)return{ok:false,state:GOLDEN_FEED_BUS.supersededState,reason:'exact_episode_superseded',supersededByEpisodeId:currentId};
    if(currentIndex===episodeIndex)return{ok:false,state:GOLDEN_FEED_BUS.invalidState,reason:'exact_episode_identity_conflict',conflictingEpisodeId:currentId};
  }

  if(learningState&&typeof learningState==='object'){
    const count=Number(learningState.episodeCount||0);
    const activeId=String(learningState.episodeId||'');
    const activeIndex=Number(learningState.episodeIndex||0);
    const lastId=String(learningState.lastEpisodeId||'');
    const pending=learningState.pendingEntrySignal&&typeof learningState.pendingEntrySignal==='object'?learningState.pendingEntrySignal:null;
    const goldenPending=learningState.goldenPendingSignal&&typeof learningState.goldenPendingSignal==='object'?learningState.goldenPendingSignal:null;
    const identities=[
      {id:activeId,index:activeIndex},
      {id:String(pending?.episodeId||''),index:Number(pending?.episodeIndex||0)},
      {id:String(goldenPending?.episodeId||''),index:Number(goldenPending?.episodeIndex||0)},
    ].filter(x=>x.id);
    for(const x of identities){
      if(x.id===episodeId)continue;
      if(x.index>episodeIndex)return{ok:false,state:GOLDEN_FEED_BUS.supersededState,reason:'exact_episode_superseded',supersededByEpisodeId:x.id};
      if(x.index===episodeIndex)return{ok:false,state:GOLDEN_FEED_BUS.invalidState,reason:'exact_episode_identity_conflict',conflictingEpisodeId:x.id};
    }
    if(count>episodeIndex)return{ok:false,state:GOLDEN_FEED_BUS.supersededState,reason:'exact_episode_superseded',supersededByEpisodeId:activeId||lastId||null};
    if(count<episodeIndex)return{ok:false,state:'PENDING_EPISODE',reason:'learning_state_behind_approval'};
    if(count===episodeIndex){
      const continuityProved=currentId===episodeId || identities.some(x=>x.id===episodeId) || lastId===episodeId;
      if(continuityProved)return{ok:true,state:'CONTINUOUS',reason:'exact_episode_retained'};
      return{ok:false,state:'PENDING_EPISODE',reason:'exact_episode_continuity_unproven'};
    }
  }

  // Unit adapters and a narrow startup interval may expose only the canonical
  // signal accessor. Exact identity is enough to prove continuity there; in
  // production LearningEngine restores the full persisted crash state first.
  if(currentId===episodeId)return{ok:true,state:'CONTINUOUS',reason:'exact_episode_current'};
  return{ok:false,state:'PENDING_EPISODE',reason:'learning_state_unavailable'};
}

export function dragonRecoverySignalQualifiedAtQuote(signal,q,settings){
  if(!signal?.episodeId||!q)return{ok:false,reason:'missing_signal_or_quote'};
  const bid=Number(q.yesBid||0),ask=Number(q.yesAsk||0),trough=Number(signal.troughCents||0),depth=Math.max(1,Number(signal.crashDepthCents||0));
  if(!(bid>0)||!(ask>0)||bid>ask)return{ok:false,reason:'invalid_quote'};
  if(!(trough>0)||bid<trough)return{ok:false,reason:'new_low'};
  const rebound=Math.max(0,bid-trough),reclaimRate=rebound/depth;
  if(rebound<Number(settings.dragonRecoveryMinReboundCents??DRAGON_RECOVERY.minReboundCents))return{ok:false,reason:'rebound'};
  if(reclaimRate+1e-12<Number(settings.dragonRecoveryMinReclaimRate??DRAGON_RECOVERY.minReclaimRate))return{ok:false,reason:'reclaim'};
  if(Number(signal.stableObservations||0)<Number(settings.dragonRecoveryStableObservations??DRAGON_RECOVERY.stableObservations))return{ok:false,reason:'stable_observations'};
  if(Number(signal.upwardTicks||0)<Number(settings.dragonRecoveryUpwardTicks??DRAGON_RECOVERY.upwardTicks))return{ok:false,reason:'upward_ticks'};
  if(ask<Number(settings.dragonRecoveryMinEntryCents??DRAGON_RECOVERY.minEntryCents)||ask>Number(settings.dragonRecoveryMaxEntryCents??DRAGON_RECOVERY.maxEntryCents))return{ok:false,reason:'entry_band'};
  if(ask-bid>Number(settings.dragonRecoveryMaxSpreadCents??DRAGON_RECOVERY.maxSpreadCents))return{ok:false,reason:'spread'};
  return{ok:true,bid,ask,troughCents:trough,crashDepthCents:depth,reboundCents:rebound,reclaimRate};
}

export function hunterEntryEnvelope(settings, conceptName) {
  const s = settings || {};
  if (conceptName === 'Momentum Hunter') return {
    minEntryCents:Number(s.momentumMinEntryCents ?? MOMENTUM.minEntryCents),
    maxEntryCents:Number(s.momentumMaxEntryCents ?? MOMENTUM.maxEntryCents),
    maxSpreadCents:Number(s.momentumMaxSpreadCents ?? MOMENTUM.maxSpreadCents),
  };
  if (conceptName === 'Wave Surfer') return {
    minEntryCents:Number(s.waveMinEntryCents),
    maxEntryCents:Number(s.waveMaxEntryCents),
    maxSpreadCents:Number(s.waveMaxSpreadCents ?? WAVE.maxSpreadCents),
  };
  if (conceptName === 'Recovery Hunter') return {
    minEntryCents:Number(s.recoveryMinEntryCents ?? RECOVERY.minEntryCents),
    maxEntryCents:Number(s.recoveryMaxEntryCents ?? RECOVERY.maxEntryCents),
    maxSpreadCents:null,
  };
  if (conceptName === 'Crash Recovery Hunter') return {
    minEntryCents:Number(s.crashRecoveryMinEntryCents),
    maxEntryCents:Number(s.crashRecoveryMaxEntryCents),
    maxSpreadCents:Number(s.crashRecoveryMaxSpreadCents ?? s.maxSpreadCents ?? 3),
  };
  if (conceptName === 'Dragon Recovery Hunter') return {
    minEntryCents:Number(s.dragonRecoveryMinEntryCents ?? DRAGON_RECOVERY.minEntryCents),
    maxEntryCents:Number(s.dragonRecoveryMaxEntryCents ?? DRAGON_RECOVERY.maxEntryCents),
    maxSpreadCents:Number(s.dragonRecoveryMaxSpreadCents ?? DRAGON_RECOVERY.maxSpreadCents),
  };
  if (conceptName === 'Golden Dragon Hunter') return {
    minEntryCents:Number(s.goldenDragonHunterMinEntryCents ?? GOLDEN_DRAGON_HUNTER.minEntryCents),
    maxEntryCents:Number(s.goldenDragonHunterMaxEntryCents ?? GOLDEN_DRAGON_HUNTER.maxEntryCents),
    maxSpreadCents:Number(s.goldenDragonHunterMaxSpreadCents ?? GOLDEN_DRAGON_HUNTER.maxSpreadCents),
  };
  return null;
}

export function hunterEntryBoundaryQualifiedAtQuote(conceptName, q, settings, executionPlan = null) {
  const envelope = hunterEntryEnvelope(settings, conceptName);
  if (!envelope) return { ok:false, reason:'unknown_hunter_concept' };
  const bid = Number(q?.yesBid || 0);
  const ask = Number(q?.yesAsk || 0);
  if (!(bid > 0) || !(ask > 0) || bid > ask) return { ok:false, reason:'invalid_quote', bid, ask, ...envelope };
  if (ask < envelope.minEntryCents || ask > envelope.maxEntryCents) return { ok:false, reason:'entry_band', bid, ask, ...envelope };
  if (Number.isFinite(envelope.maxSpreadCents) && ask - bid > envelope.maxSpreadCents) return { ok:false, reason:'spread', bid, ask, ...envelope };
  if (executionPlan) {
    const bestAsk = Number(executionPlan.bestAskCents);
    const average = Number(executionPlan.averagePriceCents);
    if (!(bestAsk > 0) || !(average > 0)) return { ok:false, reason:'invalid_execution_plan', bid, ask, bestAskCents:bestAsk, averagePriceCents:average, ...envelope };
    if (bestAsk < envelope.minEntryCents || bestAsk > envelope.maxEntryCents || average > envelope.maxEntryCents) {
      return { ok:false, reason:'execution_price_band', bid, ask, bestAskCents:bestAsk, averagePriceCents:average, ...envelope };
    }
  }
  return { ok:true, reason:'qualified', bid, ask, ...envelope };
}

export function goldenDragonHunterSignalQualifiedAtQuote(signal, q, settings, goldenValidation = null) {
  if (!signal?.episodeId || !q) return { ok:false, reason:'missing_signal_or_quote' };
  if (!goldenValidation?.ok) return { ok:false, reason:'golden_not_qualified' };
  const bid=Number(q.yesBid||0), ask=Number(q.yesAsk||0), trough=Number(signal.troughCents||0), depth=Math.max(1,Number(signal.crashDepthCents||0));
  if (!(bid>0) || !(ask>0) || bid>ask) return { ok:false, reason:'invalid_quote' };
  const episodeIndex=Number(signal.episodeIndex||0);
  const maxEpisode=Number(settings.goldenDragonHunterMaxEpisode ?? GOLDEN_DRAGON_HUNTER.maxEpisode);
  if (episodeIndex < 1 || episodeIndex > maxEpisode) return { ok:false, reason:'episode' };
  if (!(trough>0) || bid<trough) return { ok:false, reason:'new_low' };
  const rebound=Math.max(0,bid-trough), reclaimRate=rebound/depth;
  const minRebound=Number(settings.goldenDragonHunterMinReboundCents ?? GOLDEN_DRAGON_HUNTER.minReboundCents);
  const minReclaim=Number(settings.goldenDragonHunterMinReclaimRate ?? GOLDEN_DRAGON_HUNTER.minReclaimRate);
  const stableRequired=Number(settings.goldenDragonHunterStableObservations ?? GOLDEN_DRAGON_HUNTER.stableObservations);
  const upwardRequired=Number(settings.goldenDragonHunterUpwardTicks ?? GOLDEN_DRAGON_HUNTER.upwardTicks);
  if (rebound + 1e-9 < minRebound) return { ok:false, reason:'rebound', reboundCents:rebound, requiredReboundCents:minRebound };
  if (reclaimRate + 1e-12 < minReclaim) return { ok:false, reason:'reclaim', reclaimRate, requiredReclaimRate:minReclaim };
  if (Number(signal.stableObservations||0) < stableRequired) return { ok:false, reason:'stable_observations' };
  if (Number(signal.upwardTicks||0) < upwardRequired) return { ok:false, reason:'upward_ticks' };
  const trustScore=Number(goldenValidation.score||0);
  const minTrustScore=Number(settings.goldenDragonHunterMinTrustScore ?? GOLDEN_DRAGON_HUNTER.minTrustScore);
  if (trustScore + 1e-9 < minTrustScore) return { ok:false, reason:'hunter_trust_score', trustScore, minTrustScore };
  const minEntry=Number(settings.goldenDragonHunterMinEntryCents ?? GOLDEN_DRAGON_HUNTER.minEntryCents);
  const maxEntry=Number(settings.goldenDragonHunterMaxEntryCents ?? GOLDEN_DRAGON_HUNTER.maxEntryCents);
  const maxSpread=Number(settings.goldenDragonHunterMaxSpreadCents ?? GOLDEN_DRAGON_HUNTER.maxSpreadCents);
  if (ask<minEntry || ask>maxEntry) return { ok:false, reason:'entry_band', bid, ask, minEntryCents:minEntry, maxEntryCents:maxEntry };
  if (ask-bid>maxSpread) return { ok:false, reason:'spread', bid, ask, maxSpreadCents:maxSpread };
  return { ok:true, reason:'qualified', bid, ask, troughCents:trough, crashDepthCents:depth, reboundCents:rebound, reclaimRate, trustScore, minTrustScore, episodeIndex };
}

export function recoverySignalState(loss, q, observation, settings, runtimeTroughCents = null) {
  const bid = Number(q?.yesBid || 0);
  const ask = Number(q?.yesAsk || 0);
  const exit = Number(loss?.exitPriceCents || 0);
  const persistedTrough = Number(observation?.trough_cents);
  const priorRuntimeTrough = Number(runtimeTroughCents);
  const troughCandidates = [exit, persistedTrough, priorRuntimeTrough, bid].filter((v) => Number.isFinite(v) && v > 0);
  const trough = troughCandidates.length ? Math.min(...troughCandidates) : 0;
  const rebound = bid > 0 && trough > 0 ? Math.max(0, bid - trough) : 0;
  const minRebound = Number(settings?.recoveryMinReboundCents ?? RECOVERY.minReboundCents);
  const minEntry = Number(settings?.recoveryMinEntryCents ?? RECOVERY.minEntryCents);
  const maxEntry = Number(settings?.recoveryMaxEntryCents ?? RECOVERY.maxEntryCents);
  const status = String(q?.status || '').toLowerCase();
  const final = Boolean(q?.result) || FINAL_MARKET_STATUSES.has(status);
  let reason = 'qualified';
  if (!q || bid <= 0 || ask <= 0) reason = 'quote_unavailable';
  else if (final) reason = 'market_final';
  else if (ask < minEntry || ask > maxEntry) reason = 'outside_entry_band';
  else if (rebound + 1e-9 < minRebound) reason = 'rebound_not_confirmed';
  return { qualified: reason === 'qualified', reason, bidCents:bid, askCents:ask, troughCents:trough, reboundCents:rebound, minReboundCents:minRebound, minEntryCents:minEntry, maxEntryCents:maxEntry };
}


export const MODEL_ENABLE_KEYS = Object.freeze({
  Pegasus: 'pegasusEnabled',
  Sagittarius: 'sagittariusEnabled',
  Dragon: 'dragonEnabled',
  'Golden Dragon': 'goldenDragonEnabled',
  'Momentum Hunter': 'momentumHunterEnabled',
  'Wave Surfer': 'waveSurferEnabled',
  'Recovery Hunter': 'recoveryHunterEnabled',
  'Crash Recovery Hunter': 'crashRecoveryHunterEnabled',
  'Dragon Recovery Hunter': 'dragonRecoveryHunterEnabled',
  'Golden Dragon Hunter': 'goldenDragonHunterEnabled',
});

const FAIL_SAFE_OFF_MODELS = new Set(['Dragon', 'Golden Dragon', 'Crash Recovery Hunter', 'Dragon Recovery Hunter', 'Golden Dragon Hunter']);
export function isModelEnabled(settings, conceptName) {
  const key = MODEL_ENABLE_KEYS[conceptName];
  if (!key) return true;
  return FAIL_SAFE_OFF_MODELS.has(conceptName) ? settings?.[key] === true : settings?.[key] !== false;
}

// R17/GCA1 shared safety gate. A timestamp alone is never authoritative: every
// real Hunter must carry a current GCA1 confirmation proving how that lower-
// bound game clock was established. Feeders remain exempt because they create
// no exposure. Unknown, conflicting, final, legacy, or timestamp-only clocks
// fail closed here before any Hunter order/fill path can run.
export function confirmedInGameElapsedMinutes(q, now = Date.now()) {
  const eventTicker = String(q?.eventTicker || q?.ticker || '');
  if (!eventTicker || !isConfirmedGameClockState(q?.gameClockState, eventTicker)) return null;
  const start = Number(q?.gameStartTimeMs || 0);
  const authorityStart = Number(q?.gameClockState?.startTimeMs || 0);
  if (!Number.isFinite(start) || start <= 0 || start > now) return null;
  if (!Number.isFinite(authorityStart) || authorityStart <= 0 || Math.abs(authorityStart - start) > 1000) return null;
  return Math.max(0, (now - start) / 60000);
}

export function feederReferenceStake(settings, name) {
  if (name === 'Pegasus') return Number(settings.pegasusReferenceStakeCents ?? 3000);
  if (name === 'Sagittarius') return Number(settings.sagittariusReferenceStakeCents ?? 3000);
  if (name === 'Dragon') return Number(settings.dragonReferenceStakeCents ?? 3000);
  if (name === 'Golden Dragon') return Number(settings.goldenDragonReferenceStakeCents ?? 3000);
  return 0;
}

export function feederSettings(settings, name) {
  if (name === 'Pegasus') return {
    minPriceCents: Number(settings.pegasusMinPriceCents),
    maxPriceCents: Number(settings.pegasusMaxPriceCents),
    dropCents: Number(settings.pegasusDropCents),
  };
  if (name === 'Sagittarius') return {
    minPriceCents: Number(settings.sagittariusMinPriceCents),
    maxPriceCents: Number(settings.sagittariusMaxPriceCents),
    dropCents: Number(settings.sagittariusDropCents),
  };
  if (name === 'Dragon') return {
    minPriceCents: Number(settings.dragonMinSignalPriceCents ?? 84),
    maxPriceCents: Number(settings.dragonMaxSignalPriceCents ?? 88),
    dropCents: 0,
    maxEpisode: Number(settings.dragonMaxEpisode ?? 2),
    intelligence: 'CI1',
  };
  if (name === 'Golden Dragon') return {
    minPriceCents: Number(settings.goldenDragonMinSignalPriceCents ?? 27),
    maxPriceCents: Number(settings.goldenDragonMaxSignalPriceCents ?? 95),
    dropCents: 0,
    maxEpisode: Number(settings.goldenDragonMaxEpisode ?? 4),
    intelligence: GOLDEN_DRAGON.version,
    minCrashCents: Number(settings.goldenDragonMinCrashCents ?? GOLDEN_DRAGON.minCrashCents),
    minReboundCents: Number(settings.goldenDragonMinReboundCents ?? GOLDEN_DRAGON.minReboundCents),
    minReclaimRate: Number(settings.goldenDragonMinReclaimRate ?? GOLDEN_DRAGON.minReclaimRate),
    stableObservations: Number(settings.goldenDragonStableObservations ?? GOLDEN_DRAGON.stableObservations),
    upwardTicks: Number(settings.goldenDragonUpwardTicks ?? GOLDEN_DRAGON.upwardTicks),
    minTrustScore: Number(settings.goldenDragonMinTrustScore ?? GOLDEN_DRAGON.minTrustScore),
    minRecoveryAgeSeconds: Number(settings.goldenDragonMinRecoveryAgeSeconds ?? GOLDEN_DRAGON.minRecoveryAgeMs / 1000),
    maxRecoveryAgeSeconds: Number(settings.goldenDragonMaxRecoveryAgeSeconds ?? GOLDEN_DRAGON.maxRecoveryAgeMs / 1000),
  };
  return null;
}

export function entryConfigSnapshot(settings, conceptName, sourceFeeder = null, actualStakeCents = null, sourceEntryConfig = null, gameClockState = null, eventTicker = '') {
  const sourceFeederConfig = sourceEntryConfig?.feeder && typeof sourceEntryConfig.feeder === 'object' ? sourceEntryConfig.feeder : null;
  const feeder = sourceFeederConfig || (sourceFeeder ? feederSettings(settings, sourceFeeder) : null);
  const modelConfig = conceptName === 'Momentum Hunter' ? {
    stakeCents: Number(settings.momentumStakeCents),
    minEntryCents: Number(settings.momentumMinEntryCents),
    maxEntryCents: Number(settings.momentumMaxEntryCents),
    stopCents: Number(settings.momentumHunterStopLossCents),
    minRiseCents: Number(settings.momentumMinRiseCents),
    minPullbackCents: Number(settings.momentumMinPullbackCents),
    maxPullbackCents: Number(settings.momentumMaxPullbackCents),
    maxSpreadCents: Number(settings.momentumMaxSpreadCents),
    minTimeLeftMinutes: Number(settings.momentumMinTimeLeftMinutes),
    learningMinObservations: Number(settings.recoveryMinObservations),
    learningMinRate: Number(settings.recoveryMinRate),
  } : conceptName === 'Wave Surfer' ? {
    stakeCents: Number(settings.waveStakeCents),
    minEntryCents: Number(settings.waveMinEntryCents),
    maxEntryCents: Number(settings.waveMaxEntryCents),
    stopCents: Number(settings.waveStopCents),
    minFeederFavorableMoveCents: Number(settings.waveMinFeederFavorableMoveCents),
    maxSpreadCents: Number(settings.waveMaxSpreadCents),
  } : conceptName === 'Recovery Hunter' ? {
    baseStakeCents: Number(settings.recoveryBaseStakeCents),
    targetStakeCents: Number(settings.recoveryBaseStakeCents) * 2,
    actualStakeCents: Number(actualStakeCents ?? Number(settings.recoveryBaseStakeCents) * 2),
    minEntryCents: Number(settings.recoveryMinEntryCents),
    maxEntryCents: Number(settings.recoveryMaxEntryCents),
    stopCents: Number(settings.recoveryHunterStopLossCents),
    minReboundCents: Number(settings.recoveryMinReboundCents),
  } : conceptName === 'Crash Recovery Hunter' ? {
    stakeCents: Number(settings.crashRecoveryStakeCents),
    minEntryCents: Number(settings.crashRecoveryMinEntryCents),
    maxEntryCents: Number(settings.crashRecoveryMaxEntryCents),
    stopCents: Number(settings.crashRecoveryStopLossCents),
    maxSpreadCents: Number(settings.crashRecoveryMaxSpreadCents),
    minCrashCents: Number(settings.crashRecoveryMinCrashCents),
    minReboundCents: Number(settings.crashRecoveryMinReboundCents),
    minReclaimRate: Number(settings.crashRecoveryMinReclaimRate),
    stableObservations: Number(settings.crashRecoveryStableObservations),
    upwardTicks: Number(settings.crashRecoveryUpwardTicks),
    episodeResetRate: Number(settings.crashRecoveryEpisodeResetRate),
  } : conceptName === 'Dragon Recovery Hunter' ? {
    stakeCents: Number(settings.dragonRecoveryStakeCents),
    minEntryCents: Number(settings.dragonRecoveryMinEntryCents),
    maxEntryCents: Number(settings.dragonRecoveryMaxEntryCents),
    stopCents: Number(settings.dragonRecoveryStopLossCents),
    maxSpreadCents: Number(settings.dragonRecoveryMaxSpreadCents),
    minReboundCents: Number(settings.dragonRecoveryMinReboundCents),
    minReclaimRate: Number(settings.dragonRecoveryMinReclaimRate),
    stableObservations: Number(settings.dragonRecoveryStableObservations),
    upwardTicks: Number(settings.dragonRecoveryUpwardTicks),
  } : conceptName === 'Golden Dragon Hunter' ? {
    stakeCents: Number(settings.goldenDragonHunterStakeCents),
    minEntryCents: Number(settings.goldenDragonHunterMinEntryCents),
    maxEntryCents: Number(settings.goldenDragonHunterMaxEntryCents),
    stopCents: Number(settings.goldenDragonHunterStopLossCents),
    maxSpreadCents: Number(settings.goldenDragonHunterMaxSpreadCents),
    minTrustScore: Number(settings.goldenDragonHunterMinTrustScore),
    maxEpisode: Number(settings.goldenDragonHunterMaxEpisode),
    minReboundCents: Number(settings.goldenDragonHunterMinReboundCents),
    minReclaimRate: Number(settings.goldenDragonHunterMinReclaimRate),
    stableObservations: Number(settings.goldenDragonHunterStableObservations),
    upwardTicks: Number(settings.goldenDragonHunterUpwardTicks),
  } : null;
  const realHunter=PORTFOLIO_CONCEPTS.has(conceptName);
  const goldenEyeAuthority=realHunter
    && settings.goldenEyeEnabled===true
    && (String(settings.mode||'SIMULATION').toUpperCase()!=='LIVE'||settings.goldenEyeLiveEnabled===true);
  return {
    release: RELEASE,
    // Fail-safe creation-time authority: Golden Eye is frozen only when its
    // execution lane is actually enabled for the current mode. Otherwise the
    // validated R36 ATHENA-X1 profit authority remains available instead of
    // creating a Hunter with no autonomous profit exit.
    profitAuthority: realHunter ? (goldenEyeAuthority?GOLDEN_EYE.version:ATHENA_EXIT_INTELLIGENCE.version) : null,
    profitAuthorityRevision: realHunter ? (goldenEyeAuthority?GOLDEN_EYE.policyRevision:ATHENA_EXIT_INTELLIGENCE.policyRevision) : null,
    profitLearning: realHunter ? PROFIT_LEARNING_INTELLIGENCE.version : null,
    conceptName,
    sourceFeeder: sourceFeeder || null,
    modelEnabled: isModelEnabled(settings, conceptName),
    sourceFeederEnabled: sourceFeeder ? isModelEnabled(settings, sourceFeeder) : null,
    feeder: feeder ? {
      minPriceCents: Number(feeder.minPriceCents),
      maxPriceCents: Number(feeder.maxPriceCents),
      dropCents: Number(feeder.dropCents),
      referenceStakeCents: Number(sourceEntryConfig?.referenceStakeCents ?? feederReferenceStake(settings, sourceFeeder)),
      maxSpreadCents: Number(sourceEntryConfig?.maxSpreadCents ?? settings.maxSpreadCents),
      ...(feeder.maxEpisode == null ? {} : { maxEpisode:Number(feeder.maxEpisode) }),
      ...(feeder.intelligence == null ? {} : { intelligence:String(feeder.intelligence) }),
      ...(feeder.minTrustScore == null ? {} : { minTrustScore:Number(feeder.minTrustScore) }),
      ...(feeder.minRecoveryAgeSeconds == null ? {} : { minRecoveryAgeSeconds:Number(feeder.minRecoveryAgeSeconds) }),
      ...(feeder.maxRecoveryAgeSeconds == null ? {} : { maxRecoveryAgeSeconds:Number(feeder.maxRecoveryAgeSeconds) }),
    } : null,
    model: modelConfig,
    sharedHunterLimits: {
      maxPositions: Number(settings.maxPositions),
      maxEntriesPerTrade: Number(settings.maxEntriesPerTrade),
      hunterCooldownMinutes: Number(settings.hunterCooldownMinutes),
      minGameMinutes: Number(settings.minGameMinutes),
    },
    gameClockAuthority: authoritativeClockSnapshot(gameClockState, eventTicker),
    stakeCents: Number(actualStakeCents ?? 0),
    simFillProbability: Number(settings.simFillProbability),
    simFeeCents: Number(settings.simFeeCents),
  };
}

export class StrategyEngine {
  constructor({ db, kalshi, market, learning, athena = null, getSettings, getLiveReady, refreshGameClock = null, onHunterOpened = null, onFeederOpened = null, random = Math.random }) {
    this.db = db;
    this.kalshi = kalshi;
    this.market = market;
    this.learning = learning;
    this.athena = athena;
    this.getSettings = getSettings;
    this.getLiveReady = getLiveReady;
    this.refreshGameClock = typeof refreshGameClock === 'function' ? refreshGameClock : null;
    this.onHunterOpened = typeof onHunterOpened === 'function' ? onHunterOpened : null;
    this.onFeederOpened = typeof onFeederOpened === 'function' ? onFeederOpened : null;
    this.random = random;
    // R13 process-local mutex: the engine is single-process/single-scanner, but
    // this also prevents accidental concurrent createHunter calls from racing
    // each other on the same exact market ticker.
    this.hunterTickerLocks = new Set();
    // R20/RH1 keeps post-stop trough memory hot between five-minute full scans
    // and rate-limits candidate telemetry to state transitions. Persisted
    // recovery observations remain the restart-safe source of truth.
    this.recoveryRuntimeTroughs = new Map();
    this.recoveryAuditStates = new Map();
    // R27 GPI4: latest exact-episode decision state for the Golden pipeline.
    // This is intentionally runtime telemetry (not trading authority): it lets
    // diagnostics distinguish upstream feeder rejection from downstream Hunter
    // execution rejection without changing any safety gate.
    this.goldenPipelineDecisions = new Map();
    // R35/EPT1: bounded in-memory entry-pipeline telemetry. This is diagnostic
    // only and has zero execution authority. It records exactly which safety
    // boundary accepted or rejected each real-Hunter attempt so a future audit
    // does not have to infer the choke point from scattered log events.
    this.entryPipelineAttemptSequence = 0;
    this.entryPipelineEvents = [];
  }

  recordEntryPipeline(attemptId, concept, ticker, stage, status, reason = null, data = {}) {
    // Telemetry payload is intentionally flattened for diagnostics, but reserved
    // pipeline identity fields must be authoritative. Put caller data first so
    // fields such as a Hunter's runtime `status=open` cannot overwrite EPT1's
    // gate result `status=PASS` (a defect caught by the R35 end-to-end test).
    const row = {
      ...data,
      version:'EPT1', attemptId:String(attemptId), concept:String(concept || ''), ticker:String(ticker || ''),
      stage:String(stage || 'UNKNOWN'), status:String(status || 'INFO'), reason:reason == null ? null : String(reason),
      atMs:Date.now(),
    };
    this.entryPipelineEvents.push(row);
    if (this.entryPipelineEvents.length > 500) this.entryPipelineEvents.splice(0, this.entryPipelineEvents.length - 500);
    return row;
  }

  entryPipelineSummary() {
    const rows = [...this.entryPipelineEvents].sort((a,b)=>Number(b.atMs||0)-Number(a.atMs||0));
    const byStage = {}, byReason = {};
    const attempts = new Set();
    let opened = 0, blocked = 0;
    for (const r of rows) {
      attempts.add(r.attemptId);
      const key = `${r.stage}:${r.status}`; byStage[key] = (byStage[key] || 0) + 1;
      if (r.reason) byReason[r.reason] = (byReason[r.reason] || 0) + 1;
      if (r.stage === 'OPENED' && r.status === 'PASS') opened += 1;
      if (r.status === 'BLOCKED') blocked += 1;
    }
    return { version:'EPT1', attempts:attempts.size, opened, blocked, byStage, byReason, recent:rows.slice(0,75) };
  }

  async audit(event, data = {}) {
    await this.db.audit('info', event, data).catch(() => {});
  }

  async goldenPipelineDecision(ticker,episodeId,stage,reason,data={}){
    if(!ticker||!episodeId)return;
    const key=`${ticker}|${episodeId}`;
    const prior=this.goldenPipelineDecisions.get(key);
    const next={ticker:String(ticker),episodeId:String(episodeId),stage:String(stage),reason:String(reason),updatedAtMs:Date.now(),...data};
    this.goldenPipelineDecisions.set(key,next);
    if(this.goldenPipelineDecisions.size>500){const oldest=[...this.goldenPipelineDecisions.entries()].sort((a,b)=>Number(a[1].updatedAtMs)-Number(b[1].updatedAtMs))[0]?.[0];if(oldest)this.goldenPipelineDecisions.delete(oldest);}
    if(!prior||prior.stage!==next.stage||prior.reason!==next.reason) await this.audit('golden_pipeline_decision',next);
  }

  goldenPipelineSummary(){
    const rows=[...this.goldenPipelineDecisions.values()].sort((a,b)=>Number(b.updatedAtMs)-Number(a.updatedAtMs));
    const byStage={},byReason={};
    for(const r of rows){byStage[r.stage]=(byStage[r.stage]||0)+1;byReason[r.reason]=(byReason[r.reason]||0)+1;}
    return{version:'GPI4',trackedEpisodes:rows.length,byStage,byReason,recent:rows.slice(0,25)};
  }

  // R31/GFB1: convert persisted Golden Dragon reference signals into a durable
  // downstream feed authority. The feeder's creation-time recovery-age and
  // upward-tick gates are intentionally NOT re-run here: they already certified
  // the stored approval. GFB1 waits for the shared Hunter clock, tracks fresh
  // quote structure for consumer models, and fails closed if the exact crash
  // episode is superseded or its approved trough is broken.
  async refreshGoldenDragonFeedAuthorities(marketMap,{onlyTicker=null}={}) {
    const s=this.getSettings();
    const entries=await this.db.entries(s.systemName,{limit:5000});
    const rows=entries.filter((e)=>e.conceptName==='Golden Dragon'&&openLike(e.status)&&(!onlyTicker||e.ticker===onlyTicker));
    const out=[];
    const now=Date.now();
    const terminalStates=new Set([
      GOLDEN_FEED_BUS.supersededState,
      GOLDEN_FEED_BUS.invalidState,
      GOLDEN_FEED_BUS.disabledState,
      GOLDEN_FEED_BUS.finalState,
    ]);
    for(const entry of rows){
      const source=goldenSourceFromEntry(entry);
      const prior=entry.feederState&&typeof entry.feederState==='object'?entry.feederState:{};
      const q=marketMap.get(entry.ticker)||this.market?.getQuote?.(entry.ticker)||null;
      const episodeId=String(source?.episodeId||entry.sourceTradeId||'');
      let state={
        version:GOLDEN_FEED_BUS.version,
        feederId:entry.id,
        episodeId,
        state:String(prior.state||GOLDEN_FEED_BUS.pendingClockState),
        reason:String(prior.reason||'initializing'),
        createdAtMs:Number(prior.createdAtMs||entry.openedAtMs||now),
        activatedAtMs:Number(prior.activatedAtMs||0)||null,
        terminalAtMs:Number(prior.terminalAtMs||0)||null,
        lastValidatedAtMs:now,
        lastObservationAtMs:Number(prior.lastObservationAtMs||source?.signalAtMs||entry.openedAtMs||0),
        lastBidCents:Number(prior.lastBidCents||source?.validatedBidCents||entry.currentPriceCents||0),
        lastAskCents:Number(prior.lastAskCents||source?.validatedAskCents||source?.signalPriceCents||0),
        stableObservations:Number(prior.stableObservations??source?.stableObservations??0),
        upwardTicks:Number(prior.upwardTicks??source?.upwardTicks??0),
        troughCents:Number(source?.troughCents||0),
        crashDepthCents:Number(source?.crashDepthCents||0),
        reboundCents:Number(prior.reboundCents??source?.reboundCents??0),
        reclaimRate:Number(prior.reclaimRate??source?.reclaimRate??0),
        gameMinutes:prior.gameMinutes==null?null:Number(prior.gameMinutes),
      };
      const previousState=String(state.state||'');
      const previousReason=String(state.reason||'');

      // Terminal feed decisions are irreversible. A superseded or invalidated
      // approval can never become a zombie authority after a restart, settings
      // toggle, quote recovery, or learning-state churn.
      if(prior.version===GOLDEN_FEED_BUS.version&&terminalStates.has(previousState)){
        state={...state,state:previousState,reason:previousReason||'terminal_state_retained',terminalAtMs:Number(prior.terminalAtMs||prior.lastValidatedAtMs||now)};
      }else if(!isModelEnabled(s,'Golden Dragon')){
        state={...state,state:GOLDEN_FEED_BUS.disabledState,reason:'golden_disabled',terminalAtMs:now};
      }else if(!source||!episodeId){
        state={...state,state:GOLDEN_FEED_BUS.invalidState,reason:'approval_source_missing',terminalAtMs:now};
      }else if(!q){
        state={...state,state:'PENDING_DATA',reason:'market_missing'};
      }else if(FINAL_MARKET_STATUSES.has(String(q.status||'').toLowerCase())||Boolean(q.result)){
        state={...state,state:GOLDEN_FEED_BUS.finalState,reason:'market_final',terminalAtMs:now};
      }else{
        // Validate the persisted approval against the doctrine that created it,
        // not today's mutable dashboard settings. Runtime setting edits apply to
        // future Golden signals; they cannot retroactively revoke certified feed
        // authority. This is required for restart and configuration durability.
        const frozenDoctrine=entry?.entryConfig?.feeder&&typeof entry.entryConfig.feeder==='object'?entry.entryConfig.feeder:{};
        const approval=goldenApprovalSnapshotQualified(source,frozenDoctrine);
        const currentSignal=goldenSignalFromLearning(this.learning,entry.ticker);
        const learningState=typeof this.learning?.crashState==='function'?this.learning.crashState(entry.ticker):null;
        const continuity=goldenFeedContinuity(source,learningState,currentSignal);
        const bid=Number(q.yesBid||0),ask=Number(q.yesAsk||0);
        const observedAtMs=Number(q.updatedAtMs||q.bookObservedAtMs||now);
        if(observedAtMs>Number(state.lastObservationAtMs||0)&&bid>0&&ask>0&&bid<=ask){
          const priorBid=Number(state.lastBidCents||source.validatedBidCents||bid);
          state={
            ...state,
            lastObservationAtMs:observedAtMs,
            lastBidCents:bid,
            lastAskCents:ask,
            stableObservations:Number(state.stableObservations||0)+1,
            upwardTicks:bid>priorBid?Number(state.upwardTicks||0)+1:bid<priorBid?0:Number(state.upwardTicks||0),
            reboundCents:Math.max(0,bid-Number(source.troughCents||0)),
            reclaimRate:Math.max(0,bid-Number(source.troughCents||0))/Math.max(1,Number(source.crashDepthCents||0)),
          };
        }
        let elapsed=confirmedInGameElapsedMinutes(q,now);
        // Preserve the R28/GCA2 anti-deadlock invariant: an UNKNOWN scan-time
        // clock is not a final feeder rejection. GFB1 may request a force-fresh
        // authority lookup so a valid Golden approval can mature without first
        // having to enter createHunter(). createHunter still performs its own
        // mandatory independent force-fresh authorization before exposure.
        if(elapsed==null && this.refreshGameClock){
          const refreshed=await this.refreshGameClock(q,{forceFresh:true}).catch(()=>null);
          if(refreshed?.gameClockState){
            q.gameClockState=refreshed.gameClockState;
            q.gameStartTimeMs=refreshed.gameStartTimeMs??null;
            q.liveStatus=refreshed.liveStatus||q.liveStatus;
            elapsed=confirmedInGameElapsedMinutes(q,Date.now());
          }
        }
        state.gameMinutes=elapsed==null?null:Number(elapsed);

        if(!approval.ok){
          state={...state,state:GOLDEN_FEED_BUS.invalidState,reason:approval.reason,terminalAtMs:now};
        }else if(Number(q.yesBid||0)>0&&Number(q.yesBid)<Number(source.troughCents||0)){
          state={...state,state:GOLDEN_FEED_BUS.invalidState,reason:'approved_trough_broken',terminalAtMs:now};
        }else if(continuity.state===GOLDEN_FEED_BUS.finalState){
          state={...state,state:GOLDEN_FEED_BUS.finalState,reason:continuity.reason,terminalAtMs:now};
        }else if(continuity.state===GOLDEN_FEED_BUS.supersededState){
          state={...state,state:GOLDEN_FEED_BUS.supersededState,reason:continuity.reason,terminalAtMs:now,supersededByEpisodeId:continuity.supersededByEpisodeId||null};
        }else if(continuity.state===GOLDEN_FEED_BUS.invalidState){
          state={...state,state:GOLDEN_FEED_BUS.invalidState,reason:continuity.reason,terminalAtMs:now,conflictingEpisodeId:continuity.conflictingEpisodeId||null};
        }else if(!continuity.ok){
          state={...state,state:'PENDING_EPISODE',reason:continuity.reason};
        }else if(elapsed==null||elapsed+1e-9<Math.max(0,Number(s.minGameMinutes??20))){
          state={...state,state:GOLDEN_FEED_BUS.pendingClockState,reason:elapsed==null?'game_clock_unknown':'min_game_minutes'};
        }else{
          state={...state,state:GOLDEN_FEED_BUS.activeState,reason:'hunter_feed_active',activatedAtMs:Number(state.activatedAtMs||now)};
        }
      }

      entry.feederState=state;
      if(state.state!==previousState||state.reason!==previousReason||Number(state.lastObservationAtMs||0)!==Number(prior.lastObservationAtMs||0)){
        await this.db.updateEntry(entry.id,{feederState:state,updatedAtMs:now});
      }
      if(state.state!==previousState||state.reason!==previousReason){
        await this.audit('golden_feed_state_changed',{ticker:entry.ticker,eventTicker:entry.eventTicker||entry.ticker,feederId:entry.id,episodeId,from:previousState||null,to:state.state,reason:state.reason,gameMinutes:state.gameMinutes});
      }
      out.push(entry);
    }
    return out;
  }

  async simulationAvailableCashCents() {
    const s = this.getSettings();
    const entries = await this.db.entries(s.systemName, { limit: 5000 });
    const hunters = entries.filter((e) => e.mode === 'SIMULATION' && PORTFOLIO_CONCEPTS.has(e.conceptName));
    const fee = Number(s.simFeeCents || 0);
    let realized = 0;
    let reserved = 0;
    for (const e of hunters) {
      realized += Number(e.pnlCents || 0);
      if (!openLike(e.status)) continue;
      const originalCount = Math.max(0, Number(e.count || 0));
      const remaining = Math.max(0, Number(e.remainingCount || originalCount));
      const storedEntryFee = Number(e.entryFeeCents || 0);
      const totalEntryFee = storedEntryFee > 0 ? storedEntryFee : fee * originalCount;
      const remainingEntryFee = originalCount > 0 ? totalEntryFee * (remaining / originalCount) : 0;
      reserved += Number(e.entryPriceCents || 0) * remaining + remainingEntryFee;
    }
    return Number(s.startingCapitalCents || 0) + realized - reserved;
  }

  recoverySourcesFromEntries(entries, settings = this.getSettings()) {
    const now = Date.now();
    const windowMs = Math.max(1, Number(settings.recoveryTrackingHours || 24)) * 3600000;
    const cutoff = now - windowMs;
    const existingSourceIds = new Set(entries
      .filter((e) => e.conceptName === 'Recovery Hunter' && e.sourceTradeId)
      .map((e) => String(e.sourceTradeId)));
    return entries.filter((e) => e.status === 'closed'
      && e.closeReason === 'hard_stop_loss'
      && Number(e.exitPriceCents) > 0
      && Number(e.closedAtMs || 0) >= cutoff
      && !existingSourceIds.has(String(e.id)));
  }

  async recoveryCandidateTickers() {
    const s = this.getSettings();
    if (!isModelEnabled(s, 'Recovery Hunter')) return [];
    const entries = await this.db.entries(s.systemName, { limit: 5000 });
    return [...new Set(this.recoverySourcesFromEntries(entries, s).map((e) => e.ticker).filter(Boolean))];
  }

  async recoveryObservationsBySource() {
    if (typeof this.db.recoveryObservations !== 'function') return new Map();
    const s = this.getSettings();
    const rows = await this.db.recoveryObservations(s.systemName, { limit: 5000 }).catch(() => []);
    const map = new Map();
    for (const row of rows || []) {
      const source = String(row?.original_entry_id || '');
      if (!source || map.has(source)) continue;
      map.set(source, row);
    }
    return map;
  }

  async noteRecoveryCandidate(loss, data) {
    const sourceTradeId = String(loss?.id || '');
    if (!sourceTradeId) return;
    const signature = [
      data.reason, data.troughCents, Math.floor(Number(data.reboundCents || 0)),
      data.targetStakeCents, data.actualStakeCents, data.capitalCapped,
    ].map((v) => v == null ? '' : String(v)).join('|');
    if (this.recoveryAuditStates.get(sourceTradeId) === signature) return;
    this.recoveryAuditStates.set(sourceTradeId, signature);
    await this.audit('recovery_candidate_state', {
      sourceTradeId, ticker:loss.ticker, sourceConcept:loss.conceptName, sourceExitPriceCents:Number(loss.exitPriceCents || 0),
      ...data,
    });
  }

  async createGhost(name, q, entryPrice, gameStartTimeMs, options = {}) {
    const s = this.getSettings();
    if (!isModelEnabled(s, name)) {
      await this.audit('model_entry_disabled', { concept: name, ticker: q.ticker, kind: 'feeder' });
      return null;
    }
    // Ghost feeders are reference-only. Their reference stake exists only to
    // visualize hypothetical P/L; Hunter eligibility and sizing never read it.
    const feederStake = feederReferenceStake(s, name);
    const count = Math.max(1, Math.floor(feederStake / Math.max(1, entryPrice)));
    const now = Date.now();
    const currentPriceCents = Number(options.currentPriceCents ?? entryPrice);
    const peakPriceCents = Math.max(Number(options.peakPriceCents ?? currentPriceCents), currentPriceCents, Number(entryPrice));
    const e = {
      id: nowId(), systemName: s.systemName, ownerId: s.ownerId, conceptName: name,
      sourceFeeder: null, sourceTradeId: options.sourceTradeId || null, ticker: q.ticker,
      eventTicker: q.eventTicker || q.ticker, marketTitle: q.title || q.ticker,
      watchdogModel: WATCHDOG_MODEL, mode: s.mode, status: 'open',
      entryPriceCents: entryPrice, exitPriceCents: null, currentPriceCents,
      peakPriceCents, stopPriceCents: 0, stopLossCents: 0,
      count, remainingCount: count, volume24h: q.volume24h || 0,
      spreadAtEntryCents: q.yesAsk - q.yesBid, pnlCents: 0,
      entryFeeCents: 0, exitFeeCents: 0, exitFilledCount: 0, exitNotionalCents: 0,
      gameStartTimeMs: Number(q.gameStartTimeMs) || Number(gameStartTimeMs) || null, openedAtMs: now, updatedAtMs: now,
      entryConfig: {
        release: RELEASE, conceptName: name, feeder: feederSettings(s, name), referenceStakeCents: feederStake,
        maxSpreadCents: Number(s.maxSpreadCents), ...(options.entryConfigExtra || {}),
      },
      feederState: options.feederState && typeof options.feederState === 'object' ? structuredClone(options.feederState) : {},
    };
    await this.db.insertEntry(e);
    // FSI1 is diagnostics-only. Feeder creation must never depend on telemetry
    // persistence, so registration is fire-and-forget and isolated from the
    // reference feeder / Hunter execution path.
    try { this.onFeederOpened?.(e); } catch {}
    return e;
  }

  async prepareEntryExecution(q, requested) {
    // Execution confirmation is deliberately separate from signal doctrine.
    // The original candidate limit remains q.yesAsk. We only ask whether the
    // same IOC order would actually have executable ask depth now. Production
    // MarketHub also proves that BOTH the exact market lifecycle and book were
    // freshly fetched; a cached quote/book cannot masquerade as revalidation.
    let freshMarket = null;
    if (typeof this.market.refreshTickerVerified === 'function') {
      const refreshed = await this.market.refreshTickerVerified(q.ticker).catch(() => null);
      if (!refreshed?.marketFresh || !refreshed?.bookFresh) {
        await this.audit('hunter_entry_freshness_blocked', {
          ticker: q.ticker,
          eventTicker: q.eventTicker || q.ticker,
          marketFresh: Boolean(refreshed?.marketFresh),
          bookFresh: Boolean(refreshed?.bookFresh),
        });
        return null;
      }
      freshMarket = refreshed.quote || null;
    } else {
      // Backward-compatible adapter for isolated unit fakes. The deployed
      // engine uses MarketHub.refreshTickerVerified and regression tests assert
      // that production method remains present.
      freshMarket = await this.market.refreshTicker(q.ticker).catch(() => null);
    }
    const exec = this.market.executableAsk(q.ticker, requested, q.yesAsk);
    if (!exec || exec.filled <= 0) return null;
    const count = Math.floor(Math.min(requested, exec.filled) + 1e-9);
    if (count <= 0) return null;
    const exact = this.market.executableAsk(q.ticker, count, q.yesAsk);
    if (!exact || exact.filled + 1e-9 < count) return null;
    return { count, averagePriceCents: Number(exact.avgCents ?? q.yesAsk), bestAskCents: Number(exact.bestCents ?? q.yesAsk), freshMarket };
  }


  async activeHunterTickerExposure(ticker) {
    const s = this.getSettings();
    const rows = typeof this.db.openEntriesByTicker === 'function'
      ? await this.db.openEntriesByTicker(s.systemName, ticker)
      : (await this.db.entries(s.systemName, { limit: 5000 }))
        .filter((e) => e.ticker === ticker && openLike(e.status));
    return rows.filter((e) => PORTFOLIO_CONCEPTS.has(e.conceptName) && openLike(e.status));
  }

  async exactTickerExposureClear(concept, q, stage = 'policy') {
    const active = await this.activeHunterTickerExposure(q.ticker);
    if (!active.length) return true;
    const existing = active
      .slice()
      .sort((a, b) => Number(a.openedAtMs || 0) - Number(b.openedAtMs || 0))[0];
    await this.audit('hunter_exact_ticker_exposure_blocked', {
      concept,
      ticker: q.ticker,
      eventTicker: q.eventTicker || q.ticker,
      stage,
      activeHuntersOnTicker: active.length,
      existingHunterId: existing?.id || null,
      existingConcept: existing?.conceptName || null,
      existingStatus: existing?.status || null,
      existingSourceFeeder: existing?.sourceFeeder || null,
      existingSourceTradeId: existing?.sourceTradeId || null,
      existingOpenedAtMs: Number(existing?.openedAtMs || 0) || null,
    });
    return false;
  }

  async hunterEntryPolicy(concept, q, { requireClock = true } = {}) {
    const s = this.getSettings();
    if (requireClock) {
      const minGameMinutes = Math.max(0, Number(s.minGameMinutes ?? 20));
      const elapsedMinutes = confirmedInGameElapsedMinutes(q);
      if (elapsedMinutes == null) {
        await this.audit('hunter_in_game_time_unknown', { concept, ticker:q?.ticker || null, eventTicker:q?.eventTicker || q?.ticker || null, minGameMinutes });
        return false;
      }
      if (elapsedMinutes + 1e-9 < minGameMinutes) {
        await this.audit('hunter_min_game_minutes_blocked', { concept, ticker:q?.ticker || null, eventTicker:q?.eventTicker || q?.ticker || null, minGameMinutes, elapsedMinutes });
        return false;
      }
    }
    // R13 invariant: one simultaneous real Hunter per exact ticker. Feeders
    // are reference-only and do not consume this lock. The lock remains active
    // through entry_pending/exit_pending/pending_recovery and clears only when
    // every real Hunter on the ticker is closed.
    if (!(await this.exactTickerExposureClear(concept, q, 'policy'))) return false;

    const entries = await this.db.entries(s.systemName, { limit: 5000 });
    const event = q.eventTicker || q.ticker;
    const hunters = entries.filter((e) => PORTFOLIO_CONCEPTS.has(e.conceptName));
    const activeSameEvent = hunters.filter((e) => openLike(e.status) && (e.eventTicker || e.ticker) === event);
    const maxEntries = Math.max(1, Math.floor(Number(s.maxEntriesPerTrade ?? s.maxPositions ?? 1)));
    if (activeSameEvent.length >= maxEntries) {
      await this.audit('hunter_entry_trade_cap_blocked', { concept, ticker:q.ticker, eventTicker:event, activeEntries:activeSameEvent.length, maxEntriesPerTrade:maxEntries });
      return false;
    }
    const cooldownMinutes = Math.max(0, Number(s.hunterCooldownMinutes ?? 0));
    if (cooldownMinutes > 0) {
      const cutoff = Date.now() - cooldownMinutes * 60000;
      const latest = hunters
        .filter((e) => e.status !== 'rejected' && (e.eventTicker || e.ticker) === event)
        .reduce((m, e) => Math.max(m, Number(e.openedAtMs || 0)), 0);
      if (latest >= cutoff) {
        await this.audit('hunter_entry_cooldown_blocked', { concept, ticker:q.ticker, eventTicker:event, hunterCooldownMinutes:cooldownMinutes, latestHunterEntryMs:latest });
        return false;
      }
    }
    return true;
  }

  async revalidateHunterEntryDoctrine(concept, executionQuote, executionPlan, settings, {
    sourceFeeder = null,
    sourceTradeId = null,
    recoverySourceSnapshot = null,
    crashSourceSnapshot = null,
    dragonRecoverySourceSnapshot = null,
    goldenDragonHunterSourceSnapshot = null,
    entryQualificationSnapshot = null,
  } = {}) {
    const boundary = hunterEntryBoundaryQualifiedAtQuote(concept, executionQuote, settings, executionPlan);
    if (!boundary.ok) return boundary;

    if (concept === 'Momentum Hunter') {
      if (!sourceFeeder || !sourceTradeId || entryQualificationSnapshot?.version !== 'MOMENTUM-Q1') return { ...boundary, ok:false, reason:'qualification_context_missing' };
      const feederEntry = Number(entryQualificationSnapshot.feederEntryPriceCents || 0);
      const feederPeak = Math.max(Number(entryQualificationSnapshot.feederPeakPriceCents || 0), feederEntry);
      if (!(feederEntry > 0) || !(feederPeak > 0)) return { ...boundary, ok:false, reason:'qualification_context_invalid' };
      const rise = feederPeak - feederEntry;
      const pullback = feederPeak - Number(executionQuote.yesBid || 0);
      const minRise = Number(settings.momentumMinRiseCents ?? MOMENTUM.minRiseCents);
      const minPullback = Number(settings.momentumMinPullbackCents ?? MOMENTUM.minPullbackCents);
      const maxPullback = Number(settings.momentumMaxPullbackCents ?? MOMENTUM.maxPullbackCents);
      if (rise + 1e-9 < minRise) return { ...boundary, ok:false, reason:'momentum_rise', riseCents:rise, minRiseCents:minRise };
      if (pullback + 1e-9 < minPullback || pullback - 1e-9 > maxPullback) return { ...boundary, ok:false, reason:'momentum_pullback', pullbackCents:pullback, minPullbackCents:minPullback, maxPullbackCents:maxPullback };
      const minTimeLeftMs = Number(settings.momentumMinTimeLeftMinutes ?? (MOMENTUM.minTimeLeftMs / 60000)) * 60000;
      const timeLeftMs = estimateTimeLeftMs(executionQuote, Date.now());
      if (timeLeftMs < minTimeLeftMs) return { ...boundary, ok:false, reason:'momentum_time_left', timeLeftMs, minTimeLeftMs };
      const elapsed = confirmedInGameElapsedMinutes(executionQuote);
      if (elapsed == null) return { ...boundary, ok:false, reason:'momentum_game_clock' };
      if (typeof this.learning?.recoveryRate === 'function') {
        const rec = await this.learning.recoveryRate(
          executionQuote.ticker,
          executionQuote.title || executionQuote.ticker,
          Number(executionQuote.yesAsk),
          pullback,
          elapsed,
          Number(settings.recoveryMinObservations ?? 5),
        );
        if (rec && rec.confidence !== 'low' && Number(rec.recoveryRate) < Number(settings.recoveryMinRate ?? 0.7)) {
          return { ...boundary, ok:false, reason:'momentum_recovery_learning', recoveryRate:Number(rec.recoveryRate), minimumRecoveryRate:Number(settings.recoveryMinRate ?? 0.7) };
        }
      }
      return { ...boundary, riseCents:rise, pullbackCents:pullback, timeLeftMs };
    }

    if (concept === 'Wave Surfer') {
      if (!sourceFeeder || !sourceTradeId || entryQualificationSnapshot?.version !== 'WAVE-Q1') return { ...boundary, ok:false, reason:'qualification_context_missing' };
      const feederEntry = Number(entryQualificationSnapshot.feederEntryPriceCents || 0);
      if (!(feederEntry > 0)) return { ...boundary, ok:false, reason:'qualification_context_invalid' };
      const favorableMove = Number(executionQuote.yesBid || 0) - feederEntry;
      const required = Number(settings.waveMinFeederFavorableMoveCents || 0);
      if (favorableMove + 1e-9 < required) return { ...boundary, ok:false, reason:'wave_favorable_move', favorableMoveCents:favorableMove, requiredFavorableMoveCents:required };
      return { ...boundary, favorableMoveCents:favorableMove };
    }

    if (concept === 'Recovery Hunter') {
      if (!sourceTradeId || !recoverySourceSnapshot || !(Number(recoverySourceSnapshot.troughCents) > 0)) return { ...boundary, ok:false, reason:'qualification_context_missing' };
      const rebound = Number(executionQuote.yesBid || 0) - Number(recoverySourceSnapshot.troughCents);
      const required = Number(settings.recoveryMinReboundCents ?? RECOVERY.minReboundCents);
      if (rebound + 1e-9 < required) return { ...boundary, ok:false, reason:'recovery_rebound', reboundCents:rebound, requiredReboundCents:required };
      return { ...boundary, reboundCents:rebound };
    }

    if (concept === 'Crash Recovery Hunter') {
      if (!sourceFeeder || !sourceTradeId || !crashSourceSnapshot?.episodeId) return { ...boundary, ok:false, reason:'qualification_context_missing' };
      return boundary;
    }

    if (concept === 'Dragon Recovery Hunter') {
      if (sourceFeeder !== 'Golden Dragon' || !sourceTradeId || !dragonRecoverySourceSnapshot?.goldenEpisodeId) return { ...boundary, ok:false, reason:'qualification_context_missing' };
      return boundary;
    }

    if (concept === 'Golden Dragon Hunter') {
      if (sourceFeeder !== 'Golden Dragon' || !sourceTradeId || !goldenDragonHunterSourceSnapshot?.goldenEpisodeId) return { ...boundary, ok:false, reason:'qualification_context_missing' };
      return boundary;
    }

    return { ...boundary, ok:false, reason:'unknown_hunter_concept' };
  }

  async createHunter(concept, q, stakeCents, stopLossCents, { sourceFeeder = null, sourceTradeId = null, sourceEntryConfig = null, recoverySourceSnapshot = null, crashSourceSnapshot = null, dragonRecoverySourceSnapshot = null, goldenDragonHunterSourceSnapshot = null, goldenFeedAuthority = null, entryQualificationSnapshot = null } = {}) {
    const s = this.getSettings();
    const tickerLockKey = String(q?.ticker || '');
    if (!tickerLockKey) return null;
    const pipelineAttemptId = `${Date.now()}-${++this.entryPipelineAttemptSequence}`;
    const trace = (stage, status, reason = null, data = {}) => this.recordEntryPipeline(pipelineAttemptId, concept, tickerLockKey, stage, status, reason, data);
    trace('RECEIVED','PASS',null,{eventTicker:String(q?.eventTicker || tickerLockKey),sourceFeeder:sourceFeeder || null});
    // EMI1 defense-in-depth: Engine scheduling is the primary mode boundary,
    // but createHunter itself must independently fail closed before any market
    // refresh, capital work, or broker mutation if LIVE is not currently armed.
    if (s.mode === 'LIVE' && !this.getLiveReady()) {
      trace('MODE_AUTHORIZATION','BLOCKED','live_not_ready');
      await this.audit('hunter_entry_mode_authorization_blocked',{concept,ticker:tickerLockKey,eventTicker:q?.eventTicker || tickerLockKey,mode:s.mode});
      return null;
    }
    if (s.mode !== 'LIVE' && s.mode !== 'SIMULATION') {
      trace('MODE_AUTHORIZATION','BLOCKED','invalid_mode',{mode:s.mode});
      return null;
    }
    trace('MODE_AUTHORIZATION','PASS',s.mode === 'LIVE' ? 'live_ready' : 'simulation');
    if (this.hunterTickerLocks.has(tickerLockKey)) {
      trace('LOCAL_TICKER_LOCK','BLOCKED','local_ticker_lock_busy');
      await this.audit('hunter_exact_ticker_lock_busy', { concept, ticker: tickerLockKey, eventTicker: q?.eventTicker || tickerLockKey });
      return null;
    }
    this.hunterTickerLocks.add(tickerLockKey);
    let dbTickerUnlock = null;
    try {
      if (typeof this.db.acquireHunterTickerLock === 'function') {
        dbTickerUnlock = await this.db.acquireHunterTickerLock(s.systemName, tickerLockKey);
        if (!dbTickerUnlock) {
          trace('DB_TICKER_LOCK','BLOCKED','db_ticker_lock_busy');
          await this.audit('hunter_exact_ticker_db_lock_busy', { concept, ticker: tickerLockKey, eventTicker: q?.eventTicker || tickerLockKey });
          return null;
        }
        trace('DB_TICKER_LOCK','PASS');
      }
      if (!isModelEnabled(s, concept)) {
      trace('MODEL_ENABLEMENT','BLOCKED','model_disabled');
      await this.audit('model_entry_disabled', { concept, ticker: q.ticker, kind: 'hunter' });
      return null;
      }
      if (sourceFeeder && !isModelEnabled(s, sourceFeeder)) {
      trace('SOURCE_ENABLEMENT','BLOCKED','source_feeder_disabled',{sourceFeeder});
      await this.audit('model_source_feeder_disabled', { concept, sourceFeeder, ticker: q.ticker });
      return null;
      }
      trace('MODEL_ENABLEMENT','PASS');
      // R28/GCA2 sequencing invariant: cheap/static exposure controls run first,
      // but an UNKNOWN clock must never be rejected before the mandatory
      // force-fresh authority lookup that is capable of proving it. The old
      // order created a deadlock: unconfirmed candidates were discarded before
      // current milestone/live/PBP evidence could ever be requested.
      if (!(await this.hunterEntryPolicy(concept, q, { requireClock:false }))) { trace('STATIC_POLICY','BLOCKED','static_policy'); return null; }
      trace('STATIC_POLICY','PASS');

      // GCA2 has two separate truths: a persisted lower-bound start proves
      // elapsed time, but ONLY fresh entry authorization may create exposure.
      // Every real Hunter path therefore requires an Engine-owned force-fresh
      // authority refresh immediately before execution. There is no optional
      // bypass for tests, future concepts, simulation, or LIVE.
      if (!this.refreshGameClock) {
        trace('GAME_CLOCK','BLOCKED','clock_refresh_unavailable');
        await this.audit('hunter_clock_refresh_unavailable', { concept, ticker: q.ticker, eventTicker: q.eventTicker || q.ticker });
        return null;
      }
      const refreshed = await this.refreshGameClock(q, { forceFresh: true }).catch(() => null);
      if (!refreshed?.gameClockState) {
        trace('GAME_CLOCK','BLOCKED','clock_refresh_failed');
        await this.audit('hunter_clock_refresh_failed_closed', { concept, ticker: q.ticker, eventTicker: q.eventTicker || q.ticker });
        return null;
      }
      q.gameClockState = refreshed.gameClockState;
      q.gameStartTimeMs = refreshed.gameStartTimeMs ?? null;
      q.liveStatus = refreshed.liveStatus || q.liveStatus;
      const executionNow = Date.now();
      const executionElapsed = confirmedInGameElapsedMinutes(q, executionNow);
      const executionMinGameMinutes = Math.max(0, Number(s.minGameMinutes ?? 20));
      const entryAuthorityFresh = isEntryAuthorizedGameClockState(q.gameClockState, q.eventTicker || q.ticker, executionNow);
      if (!entryAuthorityFresh || executionElapsed == null || executionElapsed + 1e-9 < executionMinGameMinutes) {
        trace('GAME_CLOCK','BLOCKED',q.gameClockState?.reason || (executionElapsed == null ? 'elapsed_unknown' : 'minimum_game_time'),{phase:q.gameClockState?.phase || 'UNKNOWN',entryAuthorized:Boolean(q.gameClockState?.entryAuthorized),elapsedMinutes:executionElapsed,minGameMinutes:executionMinGameMinutes});
        await this.audit('hunter_clock_revalidation_blocked', {
          concept, ticker: q.ticker, eventTicker: q.eventTicker || q.ticker,
          minGameMinutes: executionMinGameMinutes, elapsedMinutes: executionElapsed,
          phase: q.gameClockState?.phase || 'UNKNOWN', reason: q.gameClockState?.reason || null,
          entryAuthorized: Boolean(q.gameClockState?.entryAuthorized),
          evidenceObservedAtMs: Number(q.gameClockState?.evidenceObservedAtMs || 0) || null,
        });
        return null;
      }
      trace('GAME_CLOCK','PASS',q.gameClockState?.authorizationReason || q.gameClockState?.reason || 'authorized',{elapsedMinutes:executionElapsed});

      // Refresh market + orderbook AFTER the authority call so execution depth,
      // exact event identity and lifecycle are newer than the evidence request.
      const requested = Math.max(1, Math.floor(stakeCents / Math.max(1, q.yesAsk)));
      const plan = await this.prepareEntryExecution(q, requested);
      if (!plan) {
        trace('EXECUTABLE_BOOK','BLOCKED','no_executable_ask',{requested});
        await this.audit('entry_no_executable_ask', { concept, ticker: q.ticker, requested, limitCents: q.yesAsk, mode: s.mode });
        return null;
      }
      trace('EXECUTABLE_BOOK','PASS',null,{requested,filledCount:Number(plan.count||0),averagePriceCents:Number(plan.averagePriceCents||0)});
      const freshMarket = plan.freshMarket || this.market?.getQuote?.(q.ticker);
      const expectedEventTicker = String(q.eventTicker || q.ticker);
      const freshEventTicker = String(freshMarket?.eventTicker || freshMarket?.ticker || '');
      const freshStatus = String(freshMarket?.status || '').toLowerCase();
      if (!freshMarket || freshEventTicker !== expectedEventTicker || freshStatus !== 'active' || Boolean(freshMarket?.result)) {
        const lifecycleReason = !freshMarket ? 'fresh_market_missing' : freshEventTicker !== expectedEventTicker ? 'event_identity_mismatch' : freshStatus !== 'active' ? 'market_not_active' : 'market_result_present';
        trace('LIFECYCLE','BLOCKED',lifecycleReason);
        await this.audit('hunter_entry_lifecycle_revalidation_blocked', {
          concept, ticker: q.ticker, eventTicker: expectedEventTicker,
          freshEventTicker: freshEventTicker || null,
          status: freshStatus || null, result: freshMarket?.result || null,
          reason: !freshMarket ? 'fresh_market_missing'
            : freshEventTicker !== expectedEventTicker ? 'event_identity_mismatch'
              : freshStatus !== 'active' ? 'market_not_active'
                : 'market_result_present',
        });
        return null;
      }
      trace('LIFECYCLE','PASS');

      const executionQuote = {
        ...q,
        ...freshMarket,
        ticker:q.ticker,
        eventTicker:expectedEventTicker,
        gameStartTimeMs:q.gameStartTimeMs,
        gameClockState:q.gameClockState,
        liveStatus:q.liveStatus,
      };

      // R26 hard invariant: every real Hunter must re-prove its own executable
      // entry doctrine AFTER the force-fresh market/book refresh. Upstream
      // qualification is intentionally insufficient because price, spread,
      // pullback/rebound and other dynamic conditions can change while GCA1 and
      // execution depth are refreshed. Missing qualification provenance fails
      // closed, preventing createHunter() from becoming an alternate bypass.
      const doctrineValidation = await this.revalidateHunterEntryDoctrine(concept, executionQuote, plan, s, {
        sourceFeeder, sourceTradeId, recoverySourceSnapshot, crashSourceSnapshot,
        dragonRecoverySourceSnapshot, goldenDragonHunterSourceSnapshot, entryQualificationSnapshot,
      });
      if (!doctrineValidation.ok) {
        trace('DOCTRINE','BLOCKED',doctrineValidation.reason || 'doctrine');
        await this.audit('hunter_pre_execution_doctrine_blocked', {
          concept, ticker:q.ticker, eventTicker:expectedEventTicker,
          reason:doctrineValidation.reason,
          bidCents:Number(executionQuote.yesBid || 0), askCents:Number(executionQuote.yesAsk || 0),
          minEntryCents:doctrineValidation.minEntryCents ?? null,
          maxEntryCents:doctrineValidation.maxEntryCents ?? null,
          maxSpreadCents:doctrineValidation.maxSpreadCents ?? null,
        });
        return null;
      }
      trace('DOCTRINE','PASS');

      // CRH1 gets one additional model-specific execution boundary. A crash
      // signal is price-structural and can be invalidated by the very REST/book
      // refresh used for execution (new low, lost reclaim, widened spread, or a
      // new crash episode). Re-observe that fresh quote, require the SAME episode
      // to remain actionable, and freeze the fresh validation values. Other
      // Hunter concepts are deliberately untouched by this check.
      let goldenExecutionSignal=null;
      if (sourceFeeder === 'Golden Dragon') {
        const expectedGoldenEpisode = String(sourceEntryConfig?.goldenDragonSource?.episodeId || goldenFeedAuthority?.episodeId || '');
        const authoritySource=goldenFeedAuthority?.source&&typeof goldenFeedAuthority.source==='object'?goldenFeedAuthority.source:null;
        const frozenDoctrine=goldenFeedAuthority?.creationDoctrine&&typeof goldenFeedAuthority.creationDoctrine==='object'
          ? goldenFeedAuthority.creationDoctrine
          : sourceEntryConfig?.feeder&&typeof sourceEntryConfig.feeder==='object' ? sourceEntryConfig.feeder : {};
        const approval=goldenApprovalSnapshotQualified(authoritySource,frozenDoctrine);
        if (goldenFeedAuthority?.version!==GOLDEN_FEED_BUS.version
            || goldenFeedAuthority?.state!==GOLDEN_FEED_BUS.activeState
            || !expectedGoldenEpisode
            || String(goldenFeedAuthority?.episodeId||'')!==expectedGoldenEpisode
            || String(goldenFeedAuthority?.ticker||q.ticker)!==String(q.ticker)
            || !approval.ok) {
          const specialReason=approval.ok?'authority_not_active':approval.reason;
          trace('SPECIAL_DOCTRINE','BLOCKED',specialReason,{sourceFeeder,expectedEpisodeId:expectedGoldenEpisode});
          await this.audit('golden_feed_authority_blocked',{concept,ticker:q.ticker,eventTicker:expectedEventTicker,expectedEpisodeId:expectedGoldenEpisode,authorityEpisodeId:goldenFeedAuthority?.episodeId||null,authorityState:goldenFeedAuthority?.state||null,reason:specialReason});
          return null;
        }

        // Re-observe the force-fresh executable quote in CI1 before consuming
        // Golden authority. This does not re-run Golden creation doctrine; it
        // exists only so a crash that began after feed activation can supersede
        // the older exact episode at the last possible boundary.
        if (typeof this.learning?.observeCrashQuote === 'function') {
          await this.learning.observeCrashQuote(freshMarket, s, Date.now()).catch(() => null);
        }
        const currentGoldenSignal=goldenSignalFromLearning(this.learning,q.ticker);
        const learningState=typeof this.learning?.crashState==='function'?this.learning.crashState(q.ticker):null;
        const continuity=goldenFeedContinuity(authoritySource,learningState,currentGoldenSignal);
        if(!continuity.ok){
          trace('SPECIAL_DOCTRINE','BLOCKED',continuity.reason,{sourceFeeder,expectedEpisodeId:expectedGoldenEpisode,currentEpisodeId:currentGoldenSignal?.episodeId||null});
          await this.audit('golden_feed_authority_blocked',{
            concept,ticker:q.ticker,eventTicker:expectedEventTicker,expectedEpisodeId:expectedGoldenEpisode,
            currentEpisodeId:currentGoldenSignal?.episodeId||null,reason:continuity.reason,
            supersededByEpisodeId:continuity.supersededByEpisodeId||null,
          });
          return null;
        }
        if (Number(freshMarket.yesBid||0)>0 && Number(freshMarket.yesBid)<Number(authoritySource.troughCents||0)) {
          trace('SPECIAL_DOCTRINE','BLOCKED','approved_trough_broken',{sourceFeeder,expectedEpisodeId:expectedGoldenEpisode});
          await this.audit('golden_feed_authority_blocked',{concept,ticker:q.ticker,eventTicker:expectedEventTicker,expectedEpisodeId:expectedGoldenEpisode,reason:'approved_trough_broken',bidCents:Number(freshMarket.yesBid||0),troughCents:Number(authoritySource.troughCents||0)});
          return null;
        }
        const authorityState={
          stableObservations:Number(goldenFeedAuthority.stableObservations??authoritySource.stableObservations??0),
          upwardTicks:Number(goldenFeedAuthority.upwardTicks??authoritySource.upwardTicks??0),
          lastBidCents:Number(goldenFeedAuthority.lastBidCents||authoritySource.validatedBidCents||0),
          lastAskCents:Number(goldenFeedAuthority.lastAskCents||authoritySource.validatedAskCents||0),
        };
        const freshBid=Number(freshMarket.yesBid||0),freshAsk=Number(freshMarket.yesAsk||0);
        if(freshBid>0&&freshAsk>0&&freshBid<=freshAsk){
          const priorBid=Number(authorityState.lastBidCents||freshBid);
          authorityState.stableObservations+=1;
          authorityState.upwardTicks=freshBid>priorBid?authorityState.upwardTicks+1:freshBid<priorBid?0:authorityState.upwardTicks;
          authorityState.lastBidCents=freshBid;authorityState.lastAskCents=freshAsk;
        }
        goldenExecutionSignal=goldenFeedSignalFromEntry({entryConfig:{goldenDragonSource:authoritySource},currentPriceCents:freshBid,feederState:authorityState},freshMarket,authorityState);
        const goldenValidation={ok:true,reason:'approved_feed',score:Number(authoritySource.trustScore||0),profile:authoritySource.survivalProfile||null};
        if (concept === 'Dragon Recovery Hunter') {
          const drhValidation = dragonRecoverySignalQualifiedAtQuote(goldenExecutionSignal, freshMarket, s);
          if (!drhValidation.ok) {
            trace('SPECIAL_DOCTRINE','BLOCKED',drhValidation.reason,{sourceFeeder,expectedEpisodeId:expectedGoldenEpisode});
            await this.audit('dragon_recovery_pre_execution_revalidation_blocked',{ticker:q.ticker,eventTicker:expectedEventTicker,expectedEpisodeId:expectedGoldenEpisode,reason:drhValidation.reason});
            return null;
          }
          dragonRecoverySourceSnapshot={...(dragonRecoverySourceSnapshot||{}),...crashSourceSnapshotFromSignal(goldenExecutionSignal,drhValidation),goldenTrustScore:goldenValidation.score,goldenProfile:goldenValidation.profile};
        }
        if (concept === 'Golden Dragon Hunter') {
          const gdhValidation = goldenDragonHunterSignalQualifiedAtQuote(goldenExecutionSignal, freshMarket, s, goldenValidation);
          if (!gdhValidation.ok) {
            trace('SPECIAL_DOCTRINE','BLOCKED',gdhValidation.reason,{sourceFeeder,expectedEpisodeId:expectedGoldenEpisode,trustScore:goldenValidation.score});
            await this.audit('golden_dragon_hunter_pre_execution_revalidation_blocked',{ticker:q.ticker,eventTicker:expectedEventTicker,expectedEpisodeId:expectedGoldenEpisode,reason:gdhValidation.reason,trustScore:goldenValidation.score});
            return null;
          }
          goldenDragonHunterSourceSnapshot={...(goldenDragonHunterSourceSnapshot||{}),...crashSourceSnapshotFromSignal(goldenExecutionSignal,gdhValidation),goldenEpisodeId:expectedGoldenEpisode,goldenTrustScore:goldenValidation.score,goldenProfile:goldenValidation.profile};
        }
      }

      if (concept === 'Crash Recovery Hunter' && crashSourceSnapshot?.episodeId) {
        if (sourceFeeder !== 'Golden Dragon' && typeof this.learning?.observeCrashQuote === 'function') {
          await this.learning.observeCrashQuote(freshMarket, s, Date.now()).catch(() => null);
        }
        const freshSignal = sourceFeeder === 'Golden Dragon'
          ? goldenExecutionSignal
          : (typeof this.learning?.crashEntrySignal === 'function' ? this.learning.crashEntrySignal(q.ticker) : null);
        const validation = crashSignalQualifiedAtQuote(freshSignal, freshMarket, s);
        if (!freshSignal || String(freshSignal.episodeId || '') !== String(crashSourceSnapshot.episodeId || '') || !validation.ok) {
          const specialReason=validation.reason || 'episode_changed';
          trace('SPECIAL_DOCTRINE','BLOCKED',specialReason,{sourceFeeder,expectedEpisodeId:String(crashSourceSnapshot.episodeId || ''),currentEpisodeId:freshSignal?.episodeId || null});
          await this.audit('crash_recovery_pre_execution_revalidation_blocked', {
            ticker:q.ticker, eventTicker:expectedEventTicker, expectedEpisodeId:String(crashSourceSnapshot.episodeId || ''),
            currentEpisodeId:freshSignal?.episodeId || null, reason:specialReason,
            bidCents:Number(freshMarket?.yesBid || 0), askCents:Number(freshMarket?.yesAsk || 0),
          });
          return null;
        }
        const dragonHuntingContext = {
          huntingGround: crashSourceSnapshot.huntingGround || null,
          dragonSignalId: crashSourceSnapshot.dragonSignalId || null,
          dragonEpisodeId: crashSourceSnapshot.dragonEpisodeId || null,
          dragonSignalAtMs: crashSourceSnapshot.dragonSignalAtMs || null,
          dragonSignalPriceCents: crashSourceSnapshot.dragonSignalPriceCents || null,
        };
        crashSourceSnapshot = {
          ...crashSourceSnapshotFromSignal(freshSignal, validation),
          ...dragonHuntingContext,
        };
      }

      // R34/ATHENA-B1: all real Hunters pass through one shared historical
      // intelligence boundary after their fresh structural doctrine has been
      // re-proven and before capital can be committed. Feeders never reach
      // createHunter(). Sparse/unknown Athena evidence is neutral; only a
      // mature high-confidence STRONG_NEGATIVE assessment can veto exposure.
      let athenaAssessment = null;
      if (this.athena && typeof this.athena.assess === 'function') {
        const feederCrash = sourceEntryConfig?.goldenDragonSource || sourceEntryConfig?.dragonSource || null;
        const crashContext = goldenDragonHunterSourceSnapshot || dragonRecoverySourceSnapshot || crashSourceSnapshot || feederCrash || {};
        const gameMinutes = confirmedInGameElapsedMinutes(q, Date.now());
        const momentumPullback = entryQualificationSnapshot?.version === 'MOMENTUM-Q1'
          ? Math.max(0, Number(entryQualificationSnapshot.feederPeakPriceCents || 0) - Number(executionQuote.yesBid || 0)) : 0;
        const recoveryDrop = Number(recoverySourceSnapshot?.sourceDropCents || 0);
        const recoveryDomain = concept === 'Momentum Hunter' ? 'market_drop' : concept === 'Recovery Hunter' ? 'stop_recovery' : null;
        const athenaDrop = recoveryDomain === 'market_drop' ? momentumPullback : recoveryDomain === 'stop_recovery' ? recoveryDrop : 0;
        athenaAssessment = this.athena.assess({
          conceptName:concept, sourceFeeder, ticker:q.ticker, title:executionQuote.title || q.title || q.ticker,
          sport:String(crashContext?.sport || 'Unknown'), entryPriceCents:Number(executionQuote.yesAsk || 0),
          gameMinutes:gameMinutes == null ? 0 : Number(gameMinutes),
          crashDepthCents:Number(crashContext?.crashDepthCents || 0), episodeIndex:Number(crashContext?.episodeIndex || 0),
          crashSignalPriceCents:Number(crashContext?.signalPriceCents || crashContext?.dragonSignalPriceCents || crashContext?.validatedAskCents || executionQuote.yesAsk || 0),
          reclaimRate:Number(crashContext?.reclaimRate || 0), reboundCents:Number(crashContext?.reboundCents || 0),
          recoveryDomain, dropCents:athenaDrop,
        });
        await this.audit('athena_candidate_assessment',{concept,ticker:q.ticker,sourceFeeder,score:athenaAssessment.score,classification:athenaAssessment.classification,confidence:athenaAssessment.confidence,blocked:Boolean(athenaAssessment.blocked),brainHash:athenaAssessment.brainHash,evidence:athenaAssessment.evidence});
        if (athenaAssessment.blocked) { trace('ATHENA','BLOCKED',athenaAssessment.reason || 'athena_veto',{score:athenaAssessment.score,classification:athenaAssessment.classification,confidence:athenaAssessment.confidence}); return null; }
        trace('ATHENA','PASS',athenaAssessment.reason || 'assessment',{score:athenaAssessment.score,classification:athenaAssessment.classification,confidence:athenaAssessment.confidence});
      } else {
        trace('ATHENA','PASS','neutral_unavailable');
      }

      // The market refresh itself may consume time. Authorization is deliberately
      // short-lived; recheck its freshness at the last executable boundary.
      const finalNow = Date.now();
      const finalElapsed = confirmedInGameElapsedMinutes(q, finalNow);
      if (!isEntryAuthorizedGameClockState(q.gameClockState, expectedEventTicker, finalNow)
          || finalElapsed == null || finalElapsed + 1e-9 < executionMinGameMinutes) {
        trace('FINAL_CLOCK','BLOCKED','authorization_expired',{elapsedMinutes:finalElapsed});
        await this.audit('hunter_clock_authorization_expired_before_execution', {
          concept, ticker: q.ticker, eventTicker: expectedEventTicker,
          evidenceObservedAtMs: Number(q.gameClockState?.evidenceObservedAtMs || 0) || null,
        });
        return null;
      }
      trace('FINAL_CLOCK','PASS');
      // Recheck after executable-book and clock/lifecycle refresh and immediately
      // before any fill/order path. This keeps both R13 and GCA1 authoritative.
      if (!(await this.exactTickerExposureClear(concept, q, 'pre_execution'))) { trace('R13_EXPOSURE','BLOCKED','exact_ticker_exposure'); return null; }
      trace('R13_EXPOSURE','PASS');

      if (s.mode === 'SIMULATION') {
      const available = await this.simulationAvailableCashCents();
      const estimatedEntryFee = Number(s.simFeeCents || 0) * plan.count;
      const required = plan.averagePriceCents * plan.count + estimatedEntryFee;
      if (available + 1e-9 < required) {
        trace('CAPITAL','BLOCKED','simulation_cash',{availableCents:available,requiredCents:required});
        await this.audit('sim_entry_blocked_cash', { concept, ticker: q.ticker, availableCents: available, requiredCents: required, count: plan.count });
        return null;
      }
      trace('CAPITAL','PASS',null,{availableCents:available,requiredCents:required});
      const probability = Math.max(0, Math.min(1, Number(s.simFillProbability ?? 1)));
      if (this.random() >= probability) {
        trace('EXECUTION','BLOCKED','simulation_ioc_rejected',{probability});
        await this.audit('sim_entry_ioc_rejected', { concept, ticker: q.ticker, probability, count: plan.count, limitCents: q.yesAsk });
        return null;
      }
      trace('EXECUTION','PASS','simulation_fill');
      }

      const id = nowId();
      const now = Date.now();
      let count = plan.count;
      let entry = Math.round(plan.averagePriceCents);
      let status = 'open';
      let entryOrderId = null;
      let entryClientOrderId = null;
      let entryFeeCents = Number(s.simFeeCents || 0) * count;

      if (s.mode === 'LIVE') {
      if (!this.getLiveReady()) { trace('EXECUTION','BLOCKED','live_not_ready'); return null; }
      entryClientOrderId = this.kalshi.buildClientOrderId(s.ownerId, id, 'entry');
      const result = await this.kalshi.placeOrder({
        ticker: q.ticker,
        action: 'buy',
        count: plan.count,
        priceCents: q.yesAsk,
        clientOrderId: entryClientOrderId,
      });
      entryOrderId = result.orderId;
      if (result.fillCount > 0) {
        count = result.fillCount;
        entry = Math.round(result.averageFillPriceCents ?? q.yesAsk);
        entryFeeCents = Number.isFinite(Number(result.feePaidCents)) ? Number(result.feePaidCents) : Number(s.simFeeCents || 0) * count;
        status = 'open';
      } else if (result.ambiguous) {
        status = 'entry_pending';
        count = plan.count;
        entry = q.yesAsk;
        entryFeeCents = 0;
      } else {
        trace('EXECUTION','BLOCKED','live_ioc_unfilled',{orderId:result.orderId || null});
        await this.audit('live_entry_ioc_unfilled', { concept, ticker: q.ticker, orderId: result.orderId, count: plan.count, limitCents: q.yesAsk });
        return null;
      }
      trace('EXECUTION','PASS',status === 'entry_pending' ? 'live_ambiguous_pending' : 'live_fill',{orderId:entryOrderId || null,count});
      }

      const frozenEntryConfig = entryConfigSnapshot(s, concept, sourceFeeder, stakeCents, sourceEntryConfig, q.gameClockState, q.eventTicker || q.ticker);
      if (recoverySourceSnapshot && typeof recoverySourceSnapshot === 'object') frozenEntryConfig.recoverySource = structuredClone(recoverySourceSnapshot);
      if (crashSourceSnapshot && typeof crashSourceSnapshot === 'object') frozenEntryConfig.crashRecoverySource = structuredClone(crashSourceSnapshot);
      if (dragonRecoverySourceSnapshot && typeof dragonRecoverySourceSnapshot === 'object') frozenEntryConfig.dragonRecoverySource = structuredClone(dragonRecoverySourceSnapshot);
      if (goldenDragonHunterSourceSnapshot && typeof goldenDragonHunterSourceSnapshot === 'object') frozenEntryConfig.goldenDragonHunterSource = structuredClone(goldenDragonHunterSourceSnapshot);
      if (goldenFeedAuthority && typeof goldenFeedAuthority === 'object') frozenEntryConfig.goldenFeedAuthority = structuredClone(goldenFeedAuthority);
      if (entryQualificationSnapshot && typeof entryQualificationSnapshot === 'object') frozenEntryConfig.entryQualification = structuredClone(entryQualificationSnapshot);
      if (athenaAssessment && typeof athenaAssessment === 'object') frozenEntryConfig.athena = structuredClone(athenaAssessment);
      frozenEntryConfig.atomicThunder = {
        version:ATOMIC_THUNDER.version, policyRevision:ATOMIC_THUNDER.policyRevision,
        enabledAtEntry:Boolean(s.atomicThunderEnabled),
        minimumNetPerOriginalContractCents:Number(s.atomicThunderMinNetPerOriginalContractCents ?? ATOMIC_THUNDER.minimumNetPerOriginalContractCents),
        requiredFreshConfirmations:Math.max(1,Math.floor(Number(s.atomicThunderRequiredConfirmations ?? ATOMIC_THUNDER.requiredFreshConfirmations))),
        maximumBookAgeMs:Math.max(100,Math.floor(Number(s.atomicThunderMaximumBookAgeMs ?? ATOMIC_THUNDER.maximumBookAgeMs))),
        confirmationWindowMs:Math.max(250,Math.floor(Number(s.atomicThunderConfirmationWindowMs ?? ATOMIC_THUNDER.confirmationWindowMs))),
        fullPositionOnly:true, lossAuthority:'U-SG1',
      };
      const e = {
      id, systemName: s.systemName, ownerId: s.ownerId, conceptName: concept,
      sourceFeeder, sourceTradeId, ticker: q.ticker, eventTicker: q.eventTicker || q.ticker,
      marketTitle: executionQuote.title || q.title || q.ticker, watchdogModel: WATCHDOG_MODEL, mode: s.mode, status,
      entryPriceCents: entry, exitPriceCents: null, currentPriceCents: entry,
      peakPriceCents: entry, stopPriceCents: 0, stopLossCents,
      count, remainingCount: count, volume24h: executionQuote.volume24h || q.volume24h || 0,
      spreadAtEntryCents: Number(executionQuote.yesAsk) - Number(executionQuote.yesBid), pnlCents: 0,
      entryFeeCents, exitFeeCents: 0, exitFilledCount: 0, exitNotionalCents: 0,
      entryOrderId, entryClientOrderId,
      gameStartTimeMs: Number(q.gameStartTimeMs) || null, openedAtMs: now, updatedAtMs: now,
      lowestPriceAfterEntryCents: null, maeCents: 0, maeAtMs: null,
      recoveryToEntryAtMs: null, recoveryToGreenAtMs: null, recoveryGreenPriceCents: null,
      researchTrackingComplete: false,
      entryConfig: frozenEntryConfig,
      };
      await this.db.insertEntry(e);
      if (e.status === 'open') {
        try { this.onHunterOpened?.(e); } catch {}
      }
      trace('PERSISTENCE','PASS',null,{hunterId:e.id,status:e.status});
      trace('OPENED','PASS',e.status,{hunterId:e.id,entryPriceCents:e.entryPriceCents,count:e.count});
      return e;
    } finally {
      if (dbTickerUnlock) {
        try {
          await dbTickerUnlock();
        } catch (e) {
          await this.audit('hunter_exact_ticker_db_unlock_failed', { concept, ticker: tickerLockKey, message: String(e?.message || e) });
        }
      }
      this.hunterTickerLocks.delete(tickerLockKey);
    }
  }

  async evaluateFeeders(markets, trackerMap) {
    const s = this.getSettings();
    const all = await this.db.entries(s.systemName, { limit: 5000 });
    const open = all.filter((e) => openLike(e.status));
    // EMI1: Pegasus/Sagittarius are reference-only observers. Hunter capacity
    // must never suppress feeder learning or signal materialization. Real
    // Hunters continue to enforce maxPositions independently through slotsLeft.
    const cutoff = Date.now() - (s.eventCooldownMinutes ?? 5) * 60000;
    const recentTickers = new Set(all.filter((e) => e.status !== 'rejected' && e.openedAtMs >= cutoff).map((e) => e.ticker));
    const openTickers = new Set(open.map((e) => e.ticker));
    const openKeys = new Set(open.map((e) => `${e.conceptName}|${e.ticker}`));
    const lastByConceptEvent = new Map();
    for (const e of all) {
      const key = `${e.conceptName}|${e.eventTicker || e.ticker}`;
      if (!lastByConceptEvent.has(key) || e.openedAtMs > lastByConceptEvent.get(key)) lastByConceptEvent.set(key, e.openedAtMs);
    }
    const created = [];
    for (const q of markets) {
      const history = this.market.getHistory(q.ticker);
      for (const f of FEEDERS) {
        if (!isModelEnabled(s, f.name)) continue;
        if (q.recentTrades < (f.minTradesInPlay || 10)) continue;
        if (openTickers.has(q.ticker) || recentTickers.has(q.ticker)) break;
        if (q.yesAsk - q.yesBid > (s.maxSpreadCents ?? 3)) break;
        const key = `${f.name}|${q.ticker}`;
        if (openKeys.has(key)) continue;
        const last = lastByConceptEvent.get(`${f.name}|${q.eventTicker || q.ticker}`);
        if (last != null && last >= cutoff) continue;
        const fs = feederSettings(s, f.name);
        const price = stableDropEntry(history, fs.dropCents, fs.minPriceCents, fs.maxPriceCents);
        if (price == null) continue;
        const tr = trackerMap.get(q.ticker);
        const e = await this.createGhost(f.name, q, price, Number(tr?.game_start_time_ms) || null);
        if (!e) continue;
        created.push(e);
        openKeys.add(key);
        openTickers.add(q.ticker);
        lastByConceptEvent.set(`${f.name}|${q.eventTicker || q.ticker}`, Date.now());
        break;
      }
    }
    return created;
  }

  async evaluateDragon(marketMap, { onlyTicker = null } = {}) {
    const s = this.getSettings();
    if (!isModelEnabled(s, 'Dragon')) return [];
    const entries = await this.db.entries(s.systemName, { limit: 5000 });
    const existingEpisodes = new Set(entries
      .filter((e) => e.conceptName === 'Dragon' && e.sourceTradeId)
      .map((e) => String(e.sourceTradeId)));
    const tickers = onlyTicker ? [onlyTicker] : [...marketMap.keys()];
    const created = [];
    for (const ticker of tickers) {
      const signal = typeof this.learning?.crashEntrySignal === 'function' ? this.learning.crashEntrySignal(ticker) : null;
      if (!signal?.episodeId || existingEpisodes.has(String(signal.episodeId))) continue;
      const q = marketMap.get(ticker);
      if (!q) continue;
      const validation = dragonSignalQualifiedAtQuote(signal, q, s);
      if (!validation.ok) continue;
      const dragonSource = {
        ...crashSourceSnapshotFromSignal(signal, validation),
        signalPriceCents:Number(validation.ask),
        signalAtMs:Date.now(),
        referenceOrigin:'crash_trough',
        maxEpisode:Number(s.dragonMaxEpisode ?? 2),
      };
      const e = await this.createGhost('Dragon', q, Number(validation.troughCents), Number(q.gameStartTimeMs) || null, {
        sourceTradeId:String(signal.episodeId),
        currentPriceCents:Number(validation.bid),
        peakPriceCents:Number(validation.bid),
        entryConfigExtra:{ dragonSource },
      });
      if (!e) continue;
      created.push(e);
      existingEpisodes.add(String(signal.episodeId));
      if (typeof this.learning?.markDragonSignal === 'function') {
        await this.learning.markDragonSignal(ticker, String(signal.episodeId), {
          signalAtMs:dragonSource.signalAtMs,
          signalBidCents:Number(validation.bid), signalAskCents:Number(validation.ask),
          gameMinutes:confirmedInGameElapsedMinutes(q),
          episodeIndex:Number(signal.episodeIndex || 0),
        }).catch(() => {});
      }
      await this.audit('dragon_signal_created', {
        id:e.id, ticker:e.ticker, eventTicker:e.eventTicker, episodeId:signal.episodeId,
        episodeIndex:Number(signal.episodeIndex || 0), referenceTroughCents:Number(validation.troughCents),
        signalBidCents:Number(validation.bid), signalAskCents:Number(validation.ask),
        crashDepthCents:Number(signal.crashDepthCents || 0), reboundCents:Number(validation.reboundCents), reclaimRate:Number(validation.reclaimRate),
      });
    }
    return created;
  }


  async evaluateGoldenDragon(marketMap,{onlyTicker=null}={}){
    const s=this.getSettings(); if(!isModelEnabled(s,'Golden Dragon'))return[];
    const entries=await this.db.entries(s.systemName,{limit:5000});
    const existing=new Set(entries.filter((e)=>e.conceptName==='Golden Dragon'&&e.sourceTradeId).map((e)=>String(e.sourceTradeId)));
    const tickers=onlyTicker?[onlyTicker]:[...marketMap.keys()],created=[];
    for(const ticker of tickers){
      const signal=goldenSignalFromLearning(this.learning,ticker); if(!signal?.episodeId)continue;
      const episodeId=String(signal.episodeId); if(existing.has(episodeId)){await this.goldenPipelineDecision(ticker,episodeId,'golden','already_materialized');continue;}
      const q=marketMap.get(ticker); if(!q){await this.goldenPipelineDecision(ticker,episodeId,'golden','market_missing');continue;}
      const validation=goldenDragonSignalQualifiedAtQuote(signal,q,s,this.learning,Date.now()); if(!validation.ok){await this.goldenPipelineDecision(ticker,episodeId,'golden',validation.reason,{bidCents:Number(q.yesBid||0),askCents:Number(q.yesAsk||0),trustScore:Number.isFinite(Number(validation.score))?Number(validation.score):null,reboundCents:Number.isFinite(Number(validation.reboundCents))?Number(validation.reboundCents):null,reclaimRate:Number.isFinite(Number(validation.reclaimRate))?Number(validation.reclaimRate):null,recoveryAgeMs:Number.isFinite(Number(validation.recoveryAgeMs))?Number(validation.recoveryAgeMs):null,reboundAgeMs:Number.isFinite(Number(validation.reboundAgeMs))?Number(validation.reboundAgeMs):null,survivalObservations:Number(validation.profile?.totalObservations||0),survivalRate:Number.isFinite(Number(validation.profile?.smoothedSurvivalRate))?Number(validation.profile.smoothedSurvivalRate):null,survivalSpecificity:validation.profile?.specificity||null});continue;}
      const source={...crashSourceSnapshotFromSignal(signal,validation),episodeId:String(signal.episodeId),signalPriceCents:Number(validation.ask),signalAtMs:Date.now(),referenceOrigin:'crash_trough',trustScore:Number(validation.score),survivalProfile:validation.profile,maxEpisode:Number(s.goldenDragonMaxEpisode??4),version:GOLDEN_DRAGON.version};
      const e=await this.createGhost('Golden Dragon',q,Number(validation.troughCents),Number(q.gameStartTimeMs)||null,{
        sourceTradeId:String(signal.episodeId),currentPriceCents:Number(validation.bid),peakPriceCents:Number(validation.bid),entryConfigExtra:{goldenDragonSource:source},
        feederState:{
          version:GOLDEN_FEED_BUS.version,feederId:null,episodeId:String(signal.episodeId),state:GOLDEN_FEED_BUS.pendingClockState,reason:'awaiting_feed_refresh',
          createdAtMs:Date.now(),activatedAtMs:null,lastValidatedAtMs:Date.now(),lastObservationAtMs:Number(q.updatedAtMs||source.signalAtMs||Date.now()),
          lastBidCents:Number(validation.bid),lastAskCents:Number(validation.ask),stableObservations:Number(source.stableObservations||0),upwardTicks:Number(source.upwardTicks||0),
          troughCents:Number(source.troughCents||0),crashDepthCents:Number(source.crashDepthCents||0),reboundCents:Number(source.reboundCents||0),reclaimRate:Number(source.reclaimRate||0),gameMinutes:null,
        },
      });
      if(e?.feederState)e.feederState.feederId=e.id;
      if(!e){await this.goldenPipelineDecision(ticker,episodeId,'golden','ghost_create_failed');continue;} created.push(e); existing.add(episodeId);
      await this.goldenPipelineDecision(ticker,episodeId,'golden','signal_created',{signalAskCents:Number(validation.ask),trustScore:Number(validation.score)});
      await this.audit('golden_dragon_signal_created',{id:e.id,ticker:e.ticker,eventTicker:e.eventTicker,episodeId:signal.episodeId,trustScore:validation.score,survivalRate:validation.profile?.smoothedSurvivalRate??null,survivalObservations:validation.profile?.totalObservations??0,signalBidCents:validation.bid,signalAskCents:validation.ask});
    }
    return created;
  }

  async evaluateGoldenDragonHunter(marketMap,{onlyTicker=null}={}){
    const s=this.getSettings();
    if(!isModelEnabled(s,'Golden Dragon Hunter') || !isModelEnabled(s,'Golden Dragon')) return [];
    const entries=await this.db.entries(s.systemName,{limit:5000});
    const open=entries.filter((e)=>openLike(e.status));
    let capacity=slotsLeft(open,s); if(capacity<=0)return[];
    const existingEpisodes=new Set(entries.filter((e)=>e.conceptName==='Golden Dragon Hunter'&&e.sourceTradeId).map((e)=>String(e.sourceTradeId)));
    const recoveryPriority=isModelEnabled(s,'Recovery Hunter')?new Set(this.recoverySourcesFromEntries(entries,s).map((e)=>e.ticker)):new Set();
    const feeds=latestActiveGoldenFeeds(entries).filter((e)=>!onlyTicker||e.ticker===onlyTicker);
    const created=[];
    for(const golden of feeds){
      if(capacity<=0)break;
      const source=goldenSourceFromEntry(golden); const episodeId=String(source?.episodeId||'');
      if(!episodeId||existingEpisodes.has(episodeId))continue;
      const q=marketMap.get(golden.ticker); if(!q)continue;
      const signal=goldenFeedSignalFromEntry(golden,q); if(!signal)continue;
      const gd={ok:true,reason:'approved_feed',score:Number(source.trustScore||0),profile:source.survivalProfile||null};
      const gdh=goldenDragonHunterSignalQualifiedAtQuote(signal,q,s,gd); if(!gdh.ok){await this.goldenPipelineDecision(golden.ticker,episodeId,'gdh',gdh.reason,{bidCents:Number(q.yesBid||0),askCents:Number(q.yesAsk||0),goldenTrustScore:Number(gd.score),reboundCents:Number.isFinite(Number(gdh.reboundCents))?Number(gdh.reboundCents):null,reclaimRate:Number.isFinite(Number(gdh.reclaimRate))?Number(gdh.reclaimRate):null});continue;}
      if(recoveryPriority.has(golden.ticker)){await this.audit('golden_dragon_hunter_deferred_to_recovery_hunter',{ticker:golden.ticker,eventTicker:q.eventTicker||q.ticker,episodeId});continue;}
      const authority=goldenFeedAuthoritySnapshot(golden);
      const snapshot={...crashSourceSnapshotFromSignal(signal,gdh),goldenSignalId:golden.id||null,goldenEpisodeId:episodeId,goldenSignalAtMs:Number(source.signalAtMs||golden.openedAtMs||0)||null,goldenTrustScore:Number(gd.score),goldenProfile:gd.profile,gdhVersion:GOLDEN_DRAGON_HUNTER.version,goldenFeedBusVersion:GOLDEN_FEED_BUS.version};
      const e=await this.createHunter('Golden Dragon Hunter',q,Number(s.goldenDragonHunterStakeCents??GOLDEN_DRAGON_HUNTER.stakeCents),Number(s.goldenDragonHunterStopLossCents??GOLDEN_DRAGON_HUNTER.stopLossCents),{sourceFeeder:'Golden Dragon',sourceTradeId:episodeId,sourceEntryConfig:golden.entryConfig||null,goldenDragonHunterSourceSnapshot:snapshot,goldenFeedAuthority:authority});
      if(!e){await this.goldenPipelineDecision(golden.ticker,episodeId,'execution','hunter_creation_blocked');continue;}
      created.push(e);capacity-=1;existingEpisodes.add(episodeId);
      await this.goldenPipelineDecision(golden.ticker,episodeId,'execution','hunter_created',{hunterId:e.id,entryPriceCents:e.entryPriceCents});
      await this.audit('golden_dragon_hunter_created',{id:e.id,ticker:e.ticker,eventTicker:e.eventTicker,episodeId,entryPriceCents:e.entryPriceCents,count:e.count,goldenTrustScore:gd.score,reboundCents:gdh.reboundCents,reclaimRate:gdh.reclaimRate,episodeIndex:gdh.episodeIndex,goldenFeedBusVersion:GOLDEN_FEED_BUS.version});
    }
    return created;
  }

  async evaluateDragonRecovery(marketMap,{onlyTicker=null}={}){
    const s=this.getSettings(); if(!isModelEnabled(s,'Dragon Recovery Hunter')||!isModelEnabled(s,'Golden Dragon'))return[];
    const entries=await this.db.entries(s.systemName,{limit:5000}),open=entries.filter((e)=>openLike(e.status)); let capacity=slotsLeft(open,s); if(capacity<=0)return[];
    const existing=new Set(entries.filter((e)=>e.conceptName==='Dragon Recovery Hunter'&&e.sourceTradeId).map((e)=>String(e.sourceTradeId)));
    const recoveryPriority=isModelEnabled(s,'Recovery Hunter')?new Set(this.recoverySourcesFromEntries(entries,s).map((e)=>e.ticker)):new Set();
    const feeds=latestActiveGoldenFeeds(entries).filter((e)=>!onlyTicker||e.ticker===onlyTicker),created=[];
    for(const golden of feeds){
      if(capacity<=0)break;
      const source=goldenSourceFromEntry(golden),episodeId=String(source?.episodeId||''); if(!episodeId||existing.has(episodeId))continue;
      const q=marketMap.get(golden.ticker); if(!q)continue;
      const signal=goldenFeedSignalFromEntry(golden,q); if(!signal)continue;
      const dr=dragonRecoverySignalQualifiedAtQuote(signal,q,s); if(!dr.ok)continue;
      if(recoveryPriority.has(golden.ticker)){await this.audit('dragon_recovery_deferred_to_recovery_hunter',{ticker:golden.ticker,eventTicker:q.eventTicker||q.ticker,episodeId});continue;}
      const authority=goldenFeedAuthoritySnapshot(golden);
      const snapshot={...crashSourceSnapshotFromSignal(signal,dr),goldenSignalId:golden.id||null,goldenEpisodeId:episodeId,goldenSignalAtMs:Number(source.signalAtMs||golden.openedAtMs||0)||null,goldenTrustScore:Number(source.trustScore||0),goldenProfile:source.survivalProfile||null,goldenFeedBusVersion:GOLDEN_FEED_BUS.version};
      const e=await this.createHunter('Dragon Recovery Hunter',q,Number(s.dragonRecoveryStakeCents||20000),Number(s.dragonRecoveryStopLossCents||35),{sourceFeeder:'Golden Dragon',sourceTradeId:episodeId,sourceEntryConfig:golden.entryConfig||null,dragonRecoverySourceSnapshot:snapshot,goldenFeedAuthority:authority});
      if(!e)continue;created.push(e);capacity-=1;existing.add(episodeId);await this.audit('dragon_recovery_hunter_created',{id:e.id,ticker:e.ticker,eventTicker:e.eventTicker,episodeId,entryPriceCents:e.entryPriceCents,count:e.count,goldenTrustScore:Number(source.trustScore||0),reboundCents:dr.reboundCents,reclaimRate:dr.reclaimRate,goldenFeedBusVersion:GOLDEN_FEED_BUS.version});
    }
    return created;
  }

  async evaluateMomentumAndWave(marketMap) {
    const s = this.getSettings();
    const entries = await this.db.entries(s.systemName, { limit: 5000 });
    const open = entries.filter((e) => openLike(e.status));
    let capacity = slotsLeft(open, s);
    if (capacity <= 0) return [];
    // Turning a feeder OFF is immediate for new downstream entries: existing
    // ghost records remain visible/reference-only, but they cannot feed a new
    // Hunter until that feeder model is enabled again.
    const feeders = open.filter((e) => FEEDER_CONCEPTS.has(e.conceptName)
      && isModelEnabled(s, e.conceptName)
      && (e.conceptName !== 'Golden Dragon' || isActiveGoldenFeed(e)));
    // GCA1 may confirm the event after a reference-only feeder was created.
    // Hydrate the feeder clock only from a current confirmed authority state;
    // never from a timestamp-only tracker or broad market activity.
    for (const feeder of feeders) {
      const q = marketMap.get(feeder.ticker);
      const observedStart = Number(q?.gameStartTimeMs || 0);
      if (!feeder.gameStartTimeMs && observedStart > 0 && isConfirmedGameClockState(q?.gameClockState, q?.eventTicker || q?.ticker)) {
        feeder.gameStartTimeMs = observedStart;
        await this.db.updateEntry(feeder.id, { gameStartTimeMs: observedStart, updatedAtMs: Date.now() });
      }
    }
    const created = [];

    const momentum = entries.filter((e) => e.conceptName === 'Momentum Hunter');
    if (isModelEnabled(s, 'Momentum Hunter')) for (const feeder of feeders) {
      if (capacity <= 0) break;
      if ((feeder.peakPriceCents || feeder.entryPriceCents) - feeder.entryPriceCents < Number(s.momentumMinRiseCents ?? MOMENTUM.minRiseCents)) continue;
      if (momentum.some((e) => e.ticker === feeder.ticker && e.openedAtMs > feeder.openedAtMs)) continue;
      const q = marketMap.get(feeder.ticker);
      if (!q) continue;
      const pull = (feeder.peakPriceCents || feeder.entryPriceCents) - (feeder.currentPriceCents ?? feeder.entryPriceCents);
      if (pull < Number(s.momentumMinPullbackCents ?? MOMENTUM.minPullbackCents) || pull > Number(s.momentumMaxPullbackCents ?? MOMENTUM.maxPullbackCents)) continue;
      if (q.yesAsk < Number(s.momentumMinEntryCents ?? MOMENTUM.minEntryCents) || q.yesAsk > Number(s.momentumMaxEntryCents ?? MOMENTUM.maxEntryCents) || q.yesAsk - q.yesBid > Number(s.momentumMaxSpreadCents ?? MOMENTUM.maxSpreadCents)) continue;
      const timeLeft = estimateTimeLeftMs(q, Date.now());
      if (timeLeft < Number(s.momentumMinTimeLeftMinutes ?? (MOMENTUM.minTimeLeftMs / 60000)) * 60000) continue;
      const elapsed = confirmedInGameElapsedMinutes(q);
      // R28: an unknown scan-time clock is not a final rejection. createHunter()
      // performs the force-fresh GCA2 refresh and Momentum's executable-boundary
      // doctrine re-runs recovery learning with the authoritative elapsed time.
      // If we already have a confirmed clock, keep the cheap early filter.
      if (elapsed != null) {
        const rec = await this.learning.recoveryRate(feeder.ticker, feeder.marketTitle, q.yesAsk, pull, elapsed, s.recoveryMinObservations ?? 5);
        if (rec && rec.confidence !== 'low' && rec.recoveryRate < (s.recoveryMinRate ?? 0.7)) continue;
      }
      const stake = Number(s.momentumStakeCents ?? 20000);
      const e = await this.createHunter('Momentum Hunter', q, stake, s.momentumHunterStopLossCents ?? 10, {
        sourceFeeder: feeder.conceptName,
        sourceTradeId: feeder.id,
        sourceEntryConfig: feeder.entryConfig || null,
        goldenFeedAuthority: feeder.conceptName === 'Golden Dragon' ? goldenFeedAuthoritySnapshot(feeder) : null,
        entryQualificationSnapshot: {
          version:'MOMENTUM-Q1', feederId:feeder.id, feederConcept:feeder.conceptName,
          feederEntryPriceCents:Number(feeder.entryPriceCents),
          feederPeakPriceCents:Number(feeder.peakPriceCents || feeder.entryPriceCents),
          candidatePullbackCents:Number(pull), observedAtMs:Date.now(),
        },
      });
      if (e) { created.push(e); capacity -= 1; }
    }

    if (capacity <= 0 || !isModelEnabled(s, 'Wave Surfer')) return created;
    const after = [...entries, ...created];
    const waves = after.filter((e) => e.conceptName === 'Wave Surfer');
    for (const feeder of feeders) {
      if (capacity <= 0) break;
      if (waves.some((e) => e.ticker === feeder.ticker && e.openedAtMs > feeder.openedAtMs)) continue;
      const q = marketMap.get(feeder.ticker);
      if (!q || q.yesBid <= 0 || q.yesAsk <= 0) continue;
      // R8: feeders provide price context only. Wave qualification is based on
      // the market's favorable move from the feeder reference entry, never on
      // the feeder's hypothetical stake, contract count, fees, or dollar P/L.
      const favorableMoveCents = Number(q.yesBid) - Number(feeder.entryPriceCents);
      const minWave = Number(s.waveMinEntryCents);
      const maxWave = Number(s.waveMaxEntryCents);
      const minFeederMove = Number(s.waveMinFeederFavorableMoveCents);
      if (favorableMoveCents < minFeederMove || q.yesAsk < minWave || q.yesAsk > maxWave || q.yesAsk - q.yesBid > Number(s.waveMaxSpreadCents ?? WAVE.maxSpreadCents)) continue;
      const stop = Number(s.waveStopCents);
      const e = await this.createHunter('Wave Surfer', q, Number(s.waveStakeCents ?? 20000), stop, {
        sourceFeeder: feeder.conceptName,
        sourceTradeId: feeder.id,
        sourceEntryConfig: feeder.entryConfig || null,
        goldenFeedAuthority: feeder.conceptName === 'Golden Dragon' ? goldenFeedAuthoritySnapshot(feeder) : null,
        entryQualificationSnapshot: {
          version:'WAVE-Q1', feederId:feeder.id, feederConcept:feeder.conceptName,
          feederEntryPriceCents:Number(feeder.entryPriceCents),
          candidateFavorableMoveCents:Number(favorableMoveCents), observedAtMs:Date.now(),
        },
      });
      if (e) { created.push(e); capacity -= 1; }
    }
    return created;
  }

  async evaluateRecovery(marketMap, { onlyTicker = null } = {}) {
    const s = this.getSettings();
    if (!isModelEnabled(s, 'Recovery Hunter')) return [];
    const entries = await this.db.entries(s.systemName, { limit: 5000 });
    const open = entries.filter((e) => openLike(e.status));
    let capacity = slotsLeft(open, s);
    if (capacity <= 0) return [];
    const losses = this.recoverySourcesFromEntries(entries, s)
      .filter((e) => !onlyTicker || e.ticker === onlyTicker)
      .sort((a, b) => Number(a.closedAtMs || 0) - Number(b.closedAtMs || 0));
    if (!losses.length) return [];
    const observations = await this.recoveryObservationsBySource();
    const created = [];

    for (const loss of losses) {
      if (capacity <= 0) break;
      let q = marketMap.get(loss.ticker);
      if (!q) {
        q = await this.market.refreshTicker(loss.ticker).catch(() => null);
        if (q) marketMap.set(loss.ticker, q);
      }
      const observation = observations.get(String(loss.id)) || null;
      const runtimeTrough = this.recoveryRuntimeTroughs.get(String(loss.id));
      const signal = recoverySignalState(loss, q, observation, s, runtimeTrough);
      if (signal.troughCents > 0) this.recoveryRuntimeTroughs.set(String(loss.id), signal.troughCents);

      // The learning table is already the durable post-stop research ledger.
      // Persist a newly observed lower trough immediately so a restart cannot
      // forget the rebound origin between full scans.
      if (observation && signal.troughCents > 0 && (Number(observation.trough_cents || 0) <= 0 || signal.troughCents < Number(observation.trough_cents))) {
        if (typeof this.db.updateRecoveryObservation === 'function') {
          await this.db.updateRecoveryObservation(observation.id, {
            troughCents:signal.troughCents, reboundCents:0, updatedAtMs:Date.now(),
          }).catch(() => {});
        }
        observation.trough_cents = signal.troughCents;
      }

      if (!signal.qualified) {
        await this.noteRecoveryCandidate(loss, signal);
        continue;
      }

      // A stopped R17+ Hunter may donate its immutable GCA1 start provenance.
      // New exposure still must pass createHunter's force-fresh GCA1 entry
      // authorization and exact lifecycle revalidation immediately before fill.
      const sourceAuthority = loss.entryConfig?.gameClockAuthority;
      if (!isConfirmedGameClockState(q?.gameClockState, q?.eventTicker || q?.ticker)
          && isConfirmedGameClockState(sourceAuthority, loss.eventTicker || loss.ticker)) {
        q = {
          ...q,
          gameStartTimeMs:Number(sourceAuthority.startTimeMs),
          gameClockState:structuredClone(sourceAuthority),
        };
        marketMap.set(loss.ticker, q);
      }

      // Recovery keeps exact doctrine sizing: 2x the editable base stake. The
      // user has intentionally reduced the base to $100 for the next cohort,
      // so the target Recovery exposure is $200. We do NOT silently downsize a
      // Recovery for buying-power reasons; createHunter remains the single
      // authoritative execution/cash gate and will emit sim_entry_blocked_cash
      // if the exact executable plan cannot be funded.
      const targetStakeCents = Number(s.recoveryBaseStakeCents ?? 20000) * 2;
      const availableCashCents = s.mode === 'SIMULATION' ? await this.simulationAvailableCashCents() : null;
      await this.noteRecoveryCandidate(loss, {
        ...signal, reason:'entry_attempt', targetStakeCents, actualStakeCents:targetStakeCents,
        availableCashCents,
      });
      const recoverySourceSnapshot = {
        sourceTradeId:loss.id, sourceConcept:loss.conceptName, sourceEntryPriceCents:Number(loss.entryPriceCents || 0),
        sourceExitPriceCents:Number(loss.exitPriceCents || 0), sourceDropCents:Math.max(0,Number(loss.entryPriceCents || 0)-Number(loss.exitPriceCents || 0)),
        sourceClosedAtMs:Number(loss.closedAtMs || 0), troughCents:signal.troughCents, reboundCents:signal.reboundCents,
        requiredReboundCents:signal.minReboundCents, targetStakeCents, actualStakeCents:targetStakeCents,
        availableCashCents, observationId:observation?.id || null,
      };
      const e = await this.createHunter('Recovery Hunter', q, targetStakeCents, s.recoveryHunterStopLossCents ?? 10, {
        sourceTradeId:loss.id,
        recoverySourceSnapshot,
      });
      if (e) {
        created.push(e);
        capacity -= 1;
        this.recoveryAuditStates.set(String(loss.id), 'entered');
        await this.audit('recovery_entry_created', {
          id:e.id, sourceTradeId:loss.id, ticker:loss.ticker, sourceConcept:loss.conceptName,
          entryPriceCents:e.entryPriceCents, count:e.count, targetStakeCents, actualStakeCents:e.entryConfig?.model?.actualStakeCents ?? targetStakeCents,
          troughCents:signal.troughCents, reboundCents:signal.reboundCents,
        });
      } else {
        await this.noteRecoveryCandidate(loss, { ...signal, reason:'entry_pipeline_blocked', targetStakeCents, actualStakeCents:targetStakeCents, availableCashCents });
      }
    }
    return created;
  }

  async evaluateCrashRecovery(marketMap, { onlyTicker = null } = {}) {
    const s = this.getSettings();
    // R31/GFB1: CRH1 keeps its own crash/rebound doctrine. Dragon still feeds
    // from CI1's current approved exact episode. Golden Dragon now feeds from a
    // durable ACTIVE GFB1 approval, so transient Golden creation-time gates do
    // not silently revoke an already-certified feeder signal.
    if (!isModelEnabled(s, 'Crash Recovery Hunter') || (!isModelEnabled(s, 'Dragon') && !isModelEnabled(s, 'Golden Dragon'))) return [];
    const entries = await this.db.entries(s.systemName, { limit:5000 });
    const open = entries.filter((e) => openLike(e.status));
    let capacity = slotsLeft(open, s);
    if (capacity <= 0) return [];

    const created = [];
    const tickers = onlyTicker ? [onlyTicker] : [...marketMap.keys()];
    const existingEpisodes = new Set(entries
      .filter((e) => e.conceptName === 'Crash Recovery Hunter' && e.sourceTradeId)
      .map((e) => String(e.sourceTradeId)));
    const dragonApprovals = new Map(entries
      .filter((e)=>e.conceptName==='Dragon'&&e.sourceTradeId&&isModelEnabled(s,'Dragon'))
      .map((e)=>[String(e.sourceTradeId),e]));
    const activeGoldenByTicker = new Map(latestActiveGoldenFeeds(entries).map((e)=>[e.ticker,e]));
    const recoveryPriority = isModelEnabled(s, 'Recovery Hunter')
      ? new Set(this.recoverySourcesFromEntries(entries, s).map((e) => e.ticker))
      : new Set();

    for (const ticker of tickers) {
      if (capacity <= 0) break;
      const q=marketMap.get(ticker);
      if(!q) continue;
      const candidates=[];

      if(isModelEnabled(s,'Golden Dragon')){
        const golden=activeGoldenByTicker.get(ticker)||null;
        const source=goldenSourceFromEntry(golden);
        const signal=golden ? goldenFeedSignalFromEntry(golden,q) : null;
        if(golden&&source&&signal){
          candidates.push({sourceFeeder:'Golden Dragon',approval:golden,episodeId:String(source.episodeId),signal,goldenFeedAuthority:goldenFeedAuthoritySnapshot(golden)});
        }
      }

      if(isModelEnabled(s,'Dragon')&&typeof this.learning?.crashEntrySignal==='function'){
        const signal=this.learning.crashEntrySignal(ticker);
        const episodeId=String(signal?.episodeId||'');
        const approval=episodeId?dragonApprovals.get(episodeId):null;
        if(signal&&approval&&approval.ticker===ticker){
          candidates.push({sourceFeeder:'Dragon',approval,episodeId,signal,goldenFeedAuthority:null});
        }
      }

      for(const candidate of candidates){
        if(capacity<=0||existingEpisodes.has(candidate.episodeId)) continue;
        const {sourceFeeder,approval,episodeId,signal}=candidate;
        const validation=crashSignalQualifiedAtQuote(signal,q,s);
        if(!validation.ok) continue;

        // RH1 is the specific rescue path for a Sagittarius-owned stopped trade.
        // CRH1 remains a separate crash-recovery path. When both could claim the
        // same exact ticker, RH1 keeps deterministic first priority.
        if(recoveryPriority.has(ticker)){
          await this.audit('crash_recovery_deferred_to_recovery_hunter',{ticker,eventTicker:q.eventTicker||q.ticker,episodeId,dragonSignalId:approval.id||null,sourceFeeder});
          continue;
        }

        const feederSource=approval.entryConfig?.goldenDragonSource||approval.entryConfig?.dragonSource||{};
        const crashSourceSnapshot={
          ...crashSourceSnapshotFromSignal(signal,validation),
          huntingGround:sourceFeeder==='Golden Dragon'?'golden_feed_bus_episode':'dragon_signal_episode',
          dragonSignalId:approval.id||null,dragonEpisodeId:episodeId,
          dragonSignalAtMs:Number(feederSource.signalAtMs||approval.openedAtMs||0)||null,
          dragonSignalPriceCents:Number(feederSource.signalPriceCents||0)||null,
          goldenFeedBusVersion:sourceFeeder==='Golden Dragon'?GOLDEN_FEED_BUS.version:null,
        };
        const e=await this.createHunter('Crash Recovery Hunter',q,Number(s.crashRecoveryStakeCents||20000),Number(s.crashRecoveryStopLossCents||35),{
          sourceFeeder,sourceTradeId:episodeId,sourceEntryConfig:approval.entryConfig||null,crashSourceSnapshot,
          goldenFeedAuthority:candidate.goldenFeedAuthority,
        });
        if(!e)continue;
        created.push(e);capacity-=1;existingEpisodes.add(episodeId);
        await this.audit('crash_recovery_hunter_created',{id:e.id,ticker:e.ticker,eventTicker:e.eventTicker,episodeId,sourceFeeder,dragonSignalId:approval.id||null,entryPriceCents:e.entryPriceCents,count:e.count,crashDepthCents:signal.crashDepthCents,troughCents:signal.troughCents,reboundCents:validation.reboundCents,reclaimRate:validation.reclaimRate,goldenFeedBusVersion:sourceFeeder==='Golden Dragon'?GOLDEN_FEED_BUS.version:null});
        break;
      }
    }
    return created;
  }
}
