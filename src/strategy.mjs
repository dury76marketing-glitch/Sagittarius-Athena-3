import { randomUUID, createHash } from 'node:crypto';
import {
  FEEDERS,
  MOMENTUM,
  WAVE,
  RECOVERY,
  LIGHTNING_PLASMA,
  PHOENIX_COSMO,
  ATHENA_EXCLAMATION as ATHENA_EXCLAMATION_DOCTRINE,
  WATCHDOG_MODEL,
  PORTFOLIO_CONCEPTS,
  ACTIVE_PORTFOLIO_CONCEPTS,
  FEEDER_CONCEPTS,
  ACTIVE_FEEDER_CONCEPTS,
  RETIRED_PORTFOLIO_CONCEPTS,
  RETIRED_FEEDER_CONCEPTS,
  GALACTIC_EXPLOSION,
  COSMO_ROUTING,
  SCARLET_NEEDLE,
  EXECUTION_ATTACK_DISPLAY,
  AURORA_EXECUTION,
  calculateAuroraSnapshotFromFeeModel,
  PROTECTED_RUNNER_INTELLIGENCE,
  ATHENA_EXIT_INTELLIGENCE,
  GOLDEN_EYE,
  PROFIT_LEARNING_INTELLIGENCE,
  ATOMIC_THUNDER,
  INFINITY_BREAK,
  ATHENA_COMMANDER,
  ARAYASHIKI,
  stableDropEntry,
  estimateTimeLeftMs,
} from './doctrine.mjs';
import { RELEASE } from './config.mjs';
import { authoritativeClockSnapshot, isConfirmedGameClockState, isEntryAuthorizedGameClockState } from './gameClock.mjs';
import { AthenaExclamationEngine, ATHENA_EXCLAMATION, athenaExclamationPrimeReview, isGoldSaintConcept } from './athenaExclamation.mjs';
import { verifyAthenaFireCommandHash } from './authority.mjs';
import { phoenixSignalActive, revalidatePhoenixQualification } from './phoenix.mjs';
import { verifyArayashikiCertificate } from './arayashiki.mjs';

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




export function hunterEntryEnvelope(settings, conceptName) {
  const s=settings||{};
  const sharedMaxSpreadCents=Number(s.maxSpreadCents??3);
  if(conceptName==='Athena Exclamation')return{minEntryCents:Number(s.athenaExclamationMinEntryCents),maxEntryCents:Number(s.athenaExclamationMaxEntryCents),maxSpreadCents:sharedMaxSpreadCents};
  if(conceptName==='Momentum Hunter')return{minEntryCents:Number(s.momentumMinEntryCents),maxEntryCents:Number(s.momentumMaxEntryCents),maxSpreadCents:sharedMaxSpreadCents};
  if(conceptName==='Wave Surfer')return{minEntryCents:Number(s.waveMinEntryCents),maxEntryCents:Number(s.waveMaxEntryCents),maxSpreadCents:sharedMaxSpreadCents};
  if(conceptName==='Recovery Hunter')return{minEntryCents:Number(s.recoveryMinEntryCents),maxEntryCents:Number(s.recoveryMaxEntryCents),maxSpreadCents:sharedMaxSpreadCents};
  if(conceptName==='Crash Recovery Hunter')return{minEntryCents:Number(s.crashRecoveryMinEntryCents),maxEntryCents:Number(s.crashRecoveryMaxEntryCents),maxSpreadCents:sharedMaxSpreadCents};
  if(conceptName==='Scarlet Needle')return{minEntryCents:Number(s.scarletNeedleMinEntryCents),maxEntryCents:Number(s.scarletNeedleMaxEntryCents),maxSpreadCents:sharedMaxSpreadCents};
  if(conceptName==='Lightning Plasma')return{minEntryCents:Number(s.lightningPlasmaMinEntryCents),maxEntryCents:Number(s.lightningPlasmaMaxEntryCents),maxSpreadCents:sharedMaxSpreadCents};
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



export function attackConfiguredStakeCents(settings,concept){
  if(concept==='Momentum Hunter')return Number(settings?.momentumStakeCents||0);
  if(concept==='Wave Surfer')return Number(settings?.waveStakeCents||0);
  if(concept==='Recovery Hunter')return Number(settings?.recoveryStakeCents||0);
  if(concept==='Crash Recovery Hunter')return Number(settings?.crashRecoveryStakeCents||0);
  if(concept==='Scarlet Needle')return Number(settings?.scarletNeedleStakeCents||0);
  if(concept==='Athena Exclamation')return Number(settings?.athenaExclamationStakeCents||0);
  if(concept==='Lightning Plasma')return Number(settings?.lightningPlasmaFieldStakeCents||0);
  return 0;
}

export function validateAthenaFireCommand(command,{concept,q,settings,now=Date.now()}={}){
  if(!command||typeof command!=='object')return{ok:false,reason:'athena_fire_required'};
  if(!verifyAthenaFireCommandHash(command))return{ok:false,reason:'athena_fire_hash_invalid'};
  if(String(command.version)!==String(ATHENA_COMMANDER.version))return{ok:false,reason:'athena_fire_version_invalid'};
  if(String(command.systemName||'')!==String(settings?.systemName||''))return{ok:false,reason:'athena_fire_system_mismatch'};
  if(String(command.selectedAttack||'')!==String(concept||''))return{ok:false,reason:'athena_fire_attack_mismatch'};
  if(String(command.ticker||'')!==String(q?.ticker||''))return{ok:false,reason:'athena_fire_ticker_mismatch'};
  // R56: execution never recomputes a predictive survival opinion after FIRE.
  // It only verifies the frozen Arayashiki certificate sealed inside Athena's
  // command, exactly like command hash/expiry validation.
  const survival=verifyArayashikiCertificate(command.survivalCertificate,now);
  if(!survival.ok)return{ok:false,reason:survival.reason};
  if(String(command.survivalCertificate?.boltId||'')!==String(command.boltId||''))return{ok:false,reason:'arayashiki_bolt_mismatch'};
  if(String(command.survivalCertificate?.ticker||'')!==String(command.ticker||''))return{ok:false,reason:'arayashiki_ticker_mismatch'};
  const certifiedAttack=String(command.survivalCertificate?.selectedAttack||'');
  if(certifiedAttack&&certifiedAttack!==String(command.selectedAttack||''))return{ok:false,reason:'arayashiki_attack_mismatch'};
  const expectedEvent=String(q?.eventTicker||q?.ticker||'');if(String(command.eventTicker||command.ticker||'')!==expectedEvent)return{ok:false,reason:'athena_fire_event_mismatch'};
  const decided=Number(command.decidedAtMs||0),expires=Number(command.expiresAtMs||0);
  if(!(decided>0)||decided>Number(now)+2_000)return{ok:false,reason:'athena_fire_time_invalid'};
  if(!(expires>=decided)||Number(now)>expires)return{ok:false,reason:'athena_fire_expired'};
  const envelope=hunterEntryEnvelope(settings,concept);if(!envelope)return{ok:false,reason:'unknown_attack'};
  const configuredStake=attackConfiguredStakeCents(settings,concept);const commandedStake=Number(command.stakeCents||0);if(!(configuredStake>0)||!(commandedStake>0))return{ok:false,reason:'athena_fire_stake_invalid',expectedStakeCents:configuredStake};
  if(concept==='Lightning Plasma'){if(Math.abs(Number(command.fieldBudgetCents)-configuredStake)>1e-9||commandedStake-configuredStake>1e-9)return{ok:false,reason:'athena_fire_plasma_budget_mismatch',expectedFieldBudgetCents:configuredStake};const maxRays=Math.max(1,Math.floor(Number(settings?.lightningPlasmaMaxStrikes||1)));if(Number(command.maxRays)!==maxRays)return{ok:false,reason:'athena_fire_plasma_rays_changed',expectedMaxRays:maxRays};}
  else if(Math.abs(commandedStake-configuredStake)>1e-9)return{ok:false,reason:'athena_fire_stake_mismatch',expectedStakeCents:configuredStake};
  if(Number(command.operatorMinEntryCents)!==Number(envelope.minEntryCents)||Number(command.operatorMaxEntryCents)!==Number(envelope.maxEntryCents))return{ok:false,reason:'athena_fire_operator_band_changed'};
  const ask=Number(q?.yesAsk||0),bid=Number(q?.yesBid||0),maxAuthorized=Number(command.authorizedMaxEntryCents||0);
  if(!(ask>0)||!(bid>0)||bid>ask)return{ok:false,reason:'invalid_quote'};
  if(ask<envelope.minEntryCents||ask>envelope.maxEntryCents)return{ok:false,reason:'entry_band'};
  if(!(maxAuthorized>=envelope.minEntryCents)||ask>maxAuthorized)return{ok:false,reason:'athena_strike_price_exceeded',authorizedMaxEntryCents:maxAuthorized};
  const sharedSpread=Number(settings?.maxSpreadCents??3);if(ask-bid>sharedSpread)return{ok:false,reason:'shared_spread_safety'};
  if(Number(command.maxSpreadCents)>sharedSpread+1e-9)return{ok:false,reason:'athena_fire_spread_authority_invalid'};
  const commandedTarget=Number(command?.economicTarget?.netPerOriginalContractCents);const configuredTarget=Number(settings?.infinityBreakMinNetPerOriginalContractCents??INFINITY_BREAK.defaultMinimumNetPerOriginalContractCents);
  if(!(commandedTarget>0)||!Number.isFinite(commandedTarget))return{ok:false,reason:'athena_economic_target_missing'};
  if(Math.abs(commandedTarget-configuredTarget)>1e-9)return{ok:false,reason:'athena_economic_target_changed',commandedTargetNetPerOriginalContractCents:commandedTarget,configuredTargetNetPerOriginalContractCents:configuredTarget};
  if(Number(command?.economicTarget?.requiredTargetBidCents)>99)return{ok:false,reason:'athena_economic_target_unreachable'};
  if(concept==='Recovery Hunter'&&!command?.decisionEvidence?.recoveryContext&&!command?.recoveryContext)return{ok:false,reason:'crystal_wall_recovery_context_missing'};
  if(concept==='Athena Exclamation'){
    const candidate=command?.decisionEvidence?.fieldContext?.athenaExclamationCandidate||null;
    if(!candidate?.id||String(candidate.ticker||'')!==String(q?.ticker||'')||Number(candidate.saintCount||0)<ATHENA_EXCLAMATION.minimumSaints||Number(candidate.expiresAtMs||0)<=Number(now))return{ok:false,reason:'three_saints_candidate_missing_or_expired',eventId:candidate?.id||null,saintCount:Number(candidate?.saintCount||0)};
  }
  return{ok:true,reason:'athena_fire_valid',envelope,stakeCents:commandedStake,configuredStakeCents:configuredStake,authorizedMaxEntryCents:maxAuthorized,economicTargetNetPerOriginalContractCents:commandedTarget};
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


export function activeCosmoSources(entries, settings, { ticker = null, now = Date.now() } = {}) {
  const wantedTicker = ticker == null ? null : String(ticker);
  return (entries || [])
    .filter((e) => ACTIVE_FEEDER_CONCEPTS.has(e?.conceptName) && isModelEnabled(settings, e.conceptName) && openLike(e?.status))
    .filter((e) => e?.conceptName !== 'Phoenix' || phoenixSignalActive(e, settings, now))
    .filter((e) => wantedTicker == null || String(e?.ticker || '') === wantedTicker);
}

export function selectCrashRecoveryCosmoSource(entries, settings, ticker, episodeId = '') {
  const sources = activeCosmoSources(entries, settings, { ticker });
  if (!sources.length) return null;
  const episode = String(episodeId || '');
  // Preserve the strongest causal lineage when Dragon materialized this exact
  // crash episode. Otherwise any active Cosmo may nominate the market. Newest
  // source wins deterministically, with stable concept/id tie-breaks.
  const exactDragon = episode ? sources
    .filter((e) => e.conceptName === 'Dragon' && String(e.sourceTradeId || '') === episode)
    .sort((a,b) => Number(b.openedAtMs || 0)-Number(a.openedAtMs || 0) || String(a.id||'').localeCompare(String(b.id||'')))[0] : null;
  if (exactDragon) return exactDragon;
  return sources.slice().sort((a,b) =>
    Number(b.openedAtMs || 0)-Number(a.openedAtMs || 0)
    || String(a.conceptName||'').localeCompare(String(b.conceptName||''))
    || String(a.id||'').localeCompare(String(b.id||''))
  )[0] || null;
}

export const MODEL_ENABLE_KEYS = Object.freeze({
  Pegasus: 'pegasusEnabled',
  Dragon: 'dragonEnabled',
  Phoenix: 'phoenixEnabled',
  'Momentum Hunter': 'momentumHunterEnabled',
  'Wave Surfer': 'waveSurferEnabled',
  'Recovery Hunter': 'recoveryHunterEnabled',
  'Crash Recovery Hunter': 'crashRecoveryHunterEnabled',
  'Scarlet Needle': 'scarletNeedleEnabled',
  'Athena Exclamation': 'athenaExclamationEnabled',
  'Lightning Plasma': 'lightningPlasmaEnabled',
});

const FAIL_SAFE_OFF_MODELS = new Set(['Dragon', 'Phoenix', 'Crash Recovery Hunter', 'Scarlet Needle', 'Athena Exclamation', 'Lightning Plasma']);
export function isModelEnabled(settings, conceptName) {
  if (RETIRED_PORTFOLIO_CONCEPTS.has(conceptName) || RETIRED_FEEDER_CONCEPTS.has(conceptName)) return false;
  const key = MODEL_ENABLE_KEYS[conceptName];
  if (!key) return false;
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
  if (name === 'Dragon') return Number(settings.dragonReferenceStakeCents ?? 3000);
  if (name === 'Phoenix') return Number(settings.phoenixReferenceStakeCents ?? 3000);
  return 0;
}

export function feederSettings(settings, name) {
  if (name === 'Pegasus') return {
    minPriceCents: Number(settings.pegasusMinPriceCents),
    maxPriceCents: Number(settings.pegasusMaxPriceCents),
    dropCents: Number(settings.pegasusDropCents),
  };
  if (name === 'Dragon') return {
    minPriceCents: Number(settings.dragonMinSignalPriceCents ?? 84),
    maxPriceCents: Number(settings.dragonMaxSignalPriceCents ?? 88),
    dropCents: 0,
    maxEpisode: Number(settings.dragonMaxEpisode ?? 2),
    intelligence: 'CI1',
  };
  if (name === 'Phoenix') return {
    minPriceCents: Number(settings.phoenixMinPriceCents ?? PHOENIX_COSMO.defaultMinPriceCents),
    maxPriceCents: Number(settings.phoenixMaxPriceCents ?? PHOENIX_COSMO.defaultMaxPriceCents),
    dropCents: 0,
    intelligence: PHOENIX_COSMO.version,
  };
  return null;
}

export function entryConfigSnapshot(settings, conceptName, sourceFeeder = null, actualStakeCents = null, sourceEntryConfig = null, gameClockState = null, eventTicker = '') {
  const sourceFeederConfig=sourceEntryConfig?.feeder&&typeof sourceEntryConfig.feeder==='object'?sourceEntryConfig.feeder:null;
  const feeder=sourceFeederConfig||(sourceFeeder?feederSettings(settings,sourceFeeder):null);
  const attackMap={
    'Momentum Hunter':{stake:Number(settings.momentumStakeCents),min:Number(settings.momentumMinEntryCents),max:Number(settings.momentumMaxEntryCents)},
    'Wave Surfer':{stake:Number(settings.waveStakeCents),min:Number(settings.waveMinEntryCents),max:Number(settings.waveMaxEntryCents)},
    'Recovery Hunter':{stake:Number(settings.recoveryStakeCents),min:Number(settings.recoveryMinEntryCents),max:Number(settings.recoveryMaxEntryCents),structuralRole:'FOLLOW_ON_RECOVERY_ONLY'},
    'Crash Recovery Hunter':{stake:Number(settings.crashRecoveryStakeCents),min:Number(settings.crashRecoveryMinEntryCents),max:Number(settings.crashRecoveryMaxEntryCents)},
    'Scarlet Needle':{stake:Number(settings.scarletNeedleStakeCents),min:Number(settings.scarletNeedleMinEntryCents),max:Number(settings.scarletNeedleMaxEntryCents),structuralRole:'ATHENA_DELAYED_RETRACEMENT_ONLY',triggerDropCents:SCARLET_NEEDLE.triggerDropCents},
    'Athena Exclamation':{stake:Number(settings.athenaExclamationStakeCents),min:Number(settings.athenaExclamationMinEntryCents),max:Number(settings.athenaExclamationMaxEntryCents),structuralRole:'ATHENA_SUBORDINATE_META_EXECUTION'},
    'Lightning Plasma':{stake:Number(settings.lightningPlasmaFieldStakeCents),min:Number(settings.lightningPlasmaMinEntryCents),max:Number(settings.lightningPlasmaMaxEntryCents),maxStrikes:Math.max(1,Math.floor(Number(settings.lightningPlasmaMaxStrikes)||1)),fieldBudgetSharedAcrossStrikes:true,oneStrikePerEvent:true},
  };
  const attack=attackMap[conceptName]||null;
  return {
    release:RELEASE,
    authorityChain:'ATOMIC_THUNDER_BOLT->ARAYASHIKI->ATHENA->ATTACK->INFINITY_BREAK',
    strategicEntryAuthority:ATHENA_COMMANDER.version,
    profitAuthority:PORTFOLIO_CONCEPTS.has(conceptName)?INFINITY_BREAK.version:null,
    profitAuthorityRevision:PORTFOLIO_CONCEPTS.has(conceptName)?INFINITY_BREAK.policyRevision:null,
    lossAuthority:PORTFOLIO_CONCEPTS.has(conceptName)?AURORA_EXECUTION.lossAuthority:null,
    conceptName,sourceFeeder:sourceFeeder||null,modelEnabled:isModelEnabled(settings,conceptName),sourceFeederEnabled:sourceFeeder?isModelEnabled(settings,sourceFeeder):null,
    feeder:feeder?{minPriceCents:Number(feeder.minPriceCents),maxPriceCents:Number(feeder.maxPriceCents),dropCents:Number(feeder.dropCents),referenceStakeCents:Number(sourceEntryConfig?.referenceStakeCents??feederReferenceStake(settings,sourceFeeder)),maxSpreadCents:Number(sourceEntryConfig?.maxSpreadCents??settings.maxSpreadCents),...(feeder.maxEpisode==null?{}:{maxEpisode:Number(feeder.maxEpisode)}),...(feeder.intelligence==null?{}:{intelligence:String(feeder.intelligence)})}:null,
    model:attack?{stakeCents:Number(actualStakeCents??attack.stake),configuredStakeCents:Number(attack.stake),minEntryCents:Number(attack.min),maxEntryCents:Number(attack.max),...(attack.structuralRole?{structuralRole:attack.structuralRole}:{}),...(attack.triggerDropCents?{triggerDropCents:Number(attack.triggerDropCents),triggerEditable:false}:{}),...(attack.maxStrikes?{maxStrikes:attack.maxStrikes,fieldBudgetSharedAcrossStrikes:true,oneStrikePerEvent:true}:{}),stopProtection:'Aurora Execution',stopPolicy:AURORA_EXECUTION.version}:null,
    sharedHunterLimits:{maxPositions:Number(settings.maxPositions),maxEntriesPerTrade:Number(settings.maxEntriesPerTrade),hunterCooldownMinutes:Number(settings.hunterCooldownMinutes),minGameMinutes:Number(settings.minGameMinutes),maxGameMinutes:Number(settings.maxGameMinutes||0),maxSpreadCents:Number(settings.maxSpreadCents)},
    gameClockAuthority:authoritativeClockSnapshot(gameClockState,eventTicker),stakeCents:Number(actualStakeCents??0),simFillProbability:Number(settings.simFillProbability),simFeeCents:Number(settings.simFeeCents),
  };
}

export function cosmoSourceSignalPriceCents(entry) {
  if (!entry || !ACTIVE_FEEDER_CONCEPTS.has(entry.conceptName)) return 0;
  if (entry.conceptName === 'Dragon') return Number(entry.entryConfig?.dragonSource?.signalPriceCents || 0) || 0;
  if (entry.conceptName === 'Phoenix') return Number(entry.entryConfig?.phoenixSource?.signalAskCents || entry.entryPriceCents || 0) || 0;
  return Number(entry.entryPriceCents || 0) || 0;
}

export function lightningPlasmaSourceObservedAtMs(entry) {
  if (!entry || !ACTIVE_FEEDER_CONCEPTS.has(entry.conceptName)) return 0;
  if (entry.conceptName === 'Dragon') {
    return Number(entry.entryConfig?.dragonSource?.signalAtMs || entry.openedAtMs || 0) || 0;
  }
  if (entry.conceptName === 'Phoenix') {
    return Number(entry.entryConfig?.phoenixSource?.signalAtMs || entry.openedAtMs || 0) || 0;
  }
  return Number(entry.openedAtMs || 0) || 0;
}

export function lightningPlasmaSourceAnchorCents(entry) {
  if (!entry || !ACTIVE_FEEDER_CONCEPTS.has(entry.conceptName)) return 0;
  if (entry.conceptName === 'Dragon') {
    return Number(entry.entryConfig?.dragonSource?.signalPriceCents || 0) || 0;
  }
  if (entry.conceptName === 'Phoenix') {
    return Number(entry.entryConfig?.phoenixSource?.signalAskCents || entry.entryPriceCents || 0) || 0;
  }
  return Number(entry.entryPriceCents || 0) || 0;
}

export function lightningPlasmaStrikeQualification(source, quote, settings, now = Date.now()) {
  const observedAtMs = lightningPlasmaSourceObservedAtMs(source);
  const anchorCents = lightningPlasmaSourceAnchorCents(source);
  const bid = Number(quote?.yesBid || 0);
  const ask = Number(quote?.yesAsk || 0);
  const minEntryCents = Number(settings?.lightningPlasmaMinEntryCents ?? LIGHTNING_PLASMA.minEntryCents);
  const maxEntryCents = Number(settings?.lightningPlasmaMaxEntryCents ?? LIGHTNING_PLASMA.maxEntryCents);
  const maxSpreadCents = Number(settings?.lightningPlasmaMaxSpreadCents ?? LIGHTNING_PLASMA.maxSpreadCents);
  const maxFadeCents = Math.max(0, Number(settings?.lightningPlasmaMaxSourceFadeCents ?? LIGHTNING_PLASMA.maxSourceFadeCents));
  const maxChaseCents = Math.max(0, Number(settings?.lightningPlasmaMaxChaseCents ?? LIGHTNING_PLASMA.maxChaseCents));
  const windowMs = Math.max(1000, Number(settings?.lightningPlasmaFieldWindowSeconds ?? LIGHTNING_PLASMA.fieldWindowMs / 1000) * 1000);
  const ageMs = Math.max(0, Number(now) - observedAtMs);
  const base = { observedAtMs, anchorCents, bidCents:bid, askCents:ask, ageMs, minEntryCents, maxEntryCents, maxSpreadCents, maxFadeCents, maxChaseCents };
  if (!source || !ACTIVE_FEEDER_CONCEPTS.has(source.conceptName) || !openLike(source.status)) return { ...base, ok:false, reason:'inactive_cosmo_source' };
  if (!(observedAtMs > 0) || ageMs > windowMs) return { ...base, ok:false, reason:'cosmo_source_stale' };
  if (!(anchorCents > 0)) return { ...base, ok:false, reason:'cosmo_anchor_missing' };
  if (!(bid > 0) || !(ask > 0) || bid > ask) return { ...base, ok:false, reason:'invalid_quote' };
  if (ask < minEntryCents || ask > maxEntryCents) return { ...base, ok:false, reason:'entry_band' };
  const spreadCents = ask - bid;
  if (spreadCents > maxSpreadCents) return { ...base, ok:false, reason:'spread', spreadCents };
  const fadeCents = Math.max(0, anchorCents - bid);
  if (fadeCents > maxFadeCents) return { ...base, ok:false, reason:'source_faded', fadeCents };
  const chaseCents = Math.max(0, ask - anchorCents);
  if (chaseCents > maxChaseCents) return { ...base, ok:false, reason:'source_overextended', chaseCents };
  const continuationCents = bid - anchorCents;
  // High score means fresh, narrow and still confirming the source. This score
  // only ranks independently eligible strikes; it never grants entry authority.
  const score = 100
    + Math.max(-10, Math.min(20, continuationCents * 4))
    + Math.max(0, (maxSpreadCents - spreadCents) * 4)
    - Math.min(25, ageMs / Math.max(1, windowMs) * 25)
    - Math.max(0, chaseCents - 1) * 3;
  return { ...base, ok:true, reason:'qualified', spreadCents, fadeCents, chaseCents, continuationCents, score };
}

export function lightningPlasmaFieldId(sources = []) {
  const identity = (sources || []).map((x) => `${String(x.id || '')}:${lightningPlasmaSourceObservedAtMs(x)}`).sort().join('|');
  if (!identity) return null;
  return `LP1-${createHash('sha256').update(identity).digest('hex').slice(0, 16)}`;
}

export function lightningPlasmaFieldSelection(entries, marketMap, settings, now = Date.now()) {
  const windowMs = Math.max(1000, Number(settings?.lightningPlasmaFieldWindowSeconds ?? LIGHTNING_PLASMA.fieldWindowMs / 1000) * 1000);
  const minCosmos = Math.max(2, Math.floor(Number(settings?.lightningPlasmaMinCosmos ?? LIGHTNING_PLASMA.minCosmos)));
  const minStrikes = Math.max(2, Math.floor(Number(settings?.lightningPlasmaMinStrikes ?? LIGHTNING_PLASMA.minStrikes)));
  const maxStrikes = Math.max(minStrikes, Math.floor(Number(settings?.lightningPlasmaMaxStrikes ?? LIGHTNING_PLASMA.maxStrikes)));
  const eligibleSources = activeCosmoSources(entries, settings)
    .filter((e) => {
      const observed = lightningPlasmaSourceObservedAtMs(e);
      return observed > 0 && Number(now) - observed <= windowMs;
    });
  // One source per event prevents a Plasma field from concentrating multiple
  // mutually related outcomes from the same event. Choose the strongest fresh
  // strike candidate deterministically inside each event.
  const byEvent = new Map();
  for (const source of eligibleSources) {
    const quote = marketMap?.get?.(source.ticker);
    if (!quote) continue;
    const qualification = lightningPlasmaStrikeQualification(source, quote, settings, now);
    if (!qualification.ok) continue;
    const eventTicker = String(source.eventTicker || quote.eventTicker || source.ticker || '');
    if (!eventTicker) continue;
    const row = { source, quote, qualification, eventTicker };
    const prior = byEvent.get(eventTicker);
    if (!prior
        || Number(row.qualification.score) > Number(prior.qualification.score)
        || (Number(row.qualification.score) === Number(prior.qualification.score) && lightningPlasmaSourceObservedAtMs(source) > lightningPlasmaSourceObservedAtMs(prior.source))
        || (Number(row.qualification.score) === Number(prior.qualification.score) && lightningPlasmaSourceObservedAtMs(source) === lightningPlasmaSourceObservedAtMs(prior.source) && String(source.id || '').localeCompare(String(prior.source.id || '')) < 0)) {
      byEvent.set(eventTicker, row);
    }
  }
  const candidates = [...byEvent.values()].sort((a,b) =>
    Number(b.qualification.score) - Number(a.qualification.score)
    || lightningPlasmaSourceObservedAtMs(b.source) - lightningPlasmaSourceObservedAtMs(a.source)
    || String(a.source.ticker || '').localeCompare(String(b.source.ticker || ''))
  );
  return {
    version: LIGHTNING_PLASMA.version,
    // A Plasma identity is defined only by independently qualified strikes.
    // Unqualified/stale Cosmos must not churn the field identity or cooldown.
    fieldId: lightningPlasmaFieldId(candidates.map((x)=>x.source)),
    sourceCount: eligibleSources.length,
    independentEventCount: candidates.length,
    minCosmos,
    minStrikes,
    maxStrikes,
    qualifies: candidates.length >= minCosmos && candidates.length >= minStrikes,
    candidates: candidates.slice(0, maxStrikes),
  };
}


const ATHENA_R2_FEEDER_CONTEXT_LIMIT = 4096;
function athenaR2FeederSignal(entry){
  if(String(entry?.conceptName||'')==='Dragon')return Number(entry?.entryConfig?.dragonSource?.signalPriceCents||0)||0;
  return 0;
}
function athenaR2Latest(rows=[]){return rows.length?rows[rows.length-1]:null;}
function athenaR2SequenceFeatures(rows=[],prefix=''){
  const xs=[...rows].sort((a,b)=>Number(a.openedAtMs||0)-Number(b.openedAtMs||0));const out={};out[`${prefix}Count`]=xs.length;
  if(!xs.length)return out;
  const last=xs[xs.length-1],prev=xs.length>1?xs[xs.length-2]:null,first=xs[0];
  const interval=prev?(Number(last.openedAtMs)-Number(prev.openedAtMs))/1000:null;
  const span=xs.length>1?(Number(last.openedAtMs)-Number(first.openedAtMs))/1000:0;
  const lastRef=Number(last.entryPriceCents||0),prevRef=prev?Number(prev.entryPriceCents||0):null,firstRef=Number(first.entryPriceCents||0);
  const lastSignal=athenaR2FeederSignal(last),prevSignal=prev?athenaR2FeederSignal(prev):null,firstSignal=athenaR2FeederSignal(first);
  Object.assign(out,{
    [`${prefix}LastRef`]:lastRef,[`${prefix}PrevRef`]:prevRef,[`${prefix}FirstRef`]:firstRef,
    [`${prefix}RefDelta1`]:prev?lastRef-prevRef:0,[`${prefix}RefDeltaTotal`]:lastRef-firstRef,[`${prefix}RefRate1`]:prev&&interval>0?(lastRef-prevRef)/(interval/60):0,
    [`${prefix}LastSignal`]:lastSignal,[`${prefix}PrevSignal`]:prevSignal,[`${prefix}FirstSignal`]:firstSignal,
    [`${prefix}SignalDelta1`]:prev?lastSignal-prevSignal:0,[`${prefix}SignalDeltaTotal`]:lastSignal-firstSignal,[`${prefix}SignalRate1`]:prev&&interval>0?(lastSignal-prevSignal)/(interval/60):0,
    [`${prefix}Interval1Sec`]:interval,[`${prefix}SpanSec`]:span,
  });
  return out;
}
function athenaR2ModelSettings(settings={},concept=''){
  const out={
    minGameMinutesSetting:Number(settings.minGameMinutes??0),maxGameMinutesSetting:Number(settings.maxGameMinutes??0),
    atomicThunderTarget:Number(settings.atomicThunderMinNetPerOriginalContractCents??1),maxPositionsSetting:Number(settings.maxPositions??0),
    pegasusDrop:Number(settings.pegasusDropCents??0),dragonMaxEpisode:Number(settings.dragonMaxEpisode??0),
    modelMinEntry:null,modelMaxEntry:null,modelMaxSpread:null,modelRise:null,modelMinPullback:null,modelMaxPullback:null,modelFavorable:null,
    modelCrash:null,modelRebound:null,modelReclaim:null,modelStable:null,modelUpTicks:null,modelFieldWindow:null,modelMinCosmos:null,modelMinStrikes:null,modelMaxStrikes:null,modelChase:null,modelFade:null,
  };
  if(concept==='Wave Surfer')Object.assign(out,{modelMinEntry:Number(settings.waveMinEntryCents),modelMaxEntry:Number(settings.waveMaxEntryCents),modelMaxSpread:Number(settings.waveMaxSpreadCents),modelFavorable:Number(settings.waveMinFeederFavorableMoveCents)});
  else if(concept==='Momentum Hunter')Object.assign(out,{modelMinEntry:Number(settings.momentumMinEntryCents),modelMaxEntry:Number(settings.momentumMaxEntryCents),modelMaxSpread:Number(settings.momentumMaxSpreadCents),modelRise:Number(settings.momentumMinRiseCents),modelMinPullback:Number(settings.momentumMinPullbackCents),modelMaxPullback:Number(settings.momentumMaxPullbackCents)});
  else if(concept==='Crash Recovery Hunter')Object.assign(out,{modelMinEntry:Number(settings.crashRecoveryMinEntryCents),modelMaxEntry:Number(settings.crashRecoveryMaxEntryCents),modelMaxSpread:Number(settings.crashRecoveryMaxSpreadCents),modelCrash:Number(settings.crashRecoveryMinCrashCents),modelRebound:Number(settings.crashRecoveryMinReboundCents),modelReclaim:Number(settings.crashRecoveryMinReclaimRate),modelStable:Number(settings.crashRecoveryStableObservations),modelUpTicks:Number(settings.crashRecoveryUpwardTicks)});
  else if(concept==='Recovery Hunter')Object.assign(out,{modelMinEntry:Number(settings.recoveryMinEntryCents),modelMaxEntry:Number(settings.recoveryMaxEntryCents),modelRebound:Number(settings.recoveryMinReboundCents)});
  else if(concept==='Lightning Plasma')Object.assign(out,{modelMinEntry:Number(settings.lightningPlasmaMinEntryCents),modelMaxEntry:Number(settings.lightningPlasmaMaxEntryCents),modelMaxSpread:Number(settings.lightningPlasmaMaxSpreadCents),modelFieldWindow:Number(settings.lightningPlasmaFieldWindowSeconds),modelMinCosmos:Number(settings.lightningPlasmaMinCosmos),modelMinStrikes:Number(settings.lightningPlasmaMinStrikes),modelMaxStrikes:Number(settings.lightningPlasmaMaxStrikes),modelChase:Number(settings.lightningPlasmaMaxChaseCents),modelFade:Number(settings.lightningPlasmaMaxSourceFadeCents)});
  return out;
}

export class StrategyEngine {
  constructor({ db, kalshi, market, learning, athena = null, getSettings, getLiveReady, refreshGameClock = null, onHunterOpened = null, onFeederOpened = null, onEntryPipeline = null, random = Math.random }) {
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
    this.onEntryPipeline = typeof onEntryPipeline === 'function' ? onEntryPipeline : null;
    this.random = random;
    // R13 process-local mutex: the engine is single-process/single-scanner, but
    // this also prevents accidental concurrent createHunter calls from racing
    // each other on the same exact market ticker.
    this.hunterTickerLocks = new Set();
    // R45 Galactic Explosion keeps different Attacks eligible on one ticker,
    // but their final capital/event-cap/persistence commit must still serialize
    // on that exact ticker. This coordinator is intentionally separate from
    // the exposure lock: it prevents a concurrent cross-Attack race without
    // restoring the old one-Hunter-per-ticker prohibition.
    this.hunterEntryCommitLocks = new Set();
    // R20/RH1 keeps post-stop trough memory hot between five-minute full scans
    // and rate-limits candidate telemetry to state transitions. Persisted
    // recovery observations remain the restart-safe source of truth.
    this.recoveryRuntimeTroughs = new Map();
    this.recoveryAuditStates = new Map();
    // R35/EPT1: bounded in-memory entry-pipeline telemetry. This is diagnostic
    // only and has zero execution authority. It records exactly which safety
    // boundary accepted or rejected each real-Hunter attempt so a future audit
    // does not have to infer the choke point from scattered log events.
    this.entryPipelineAttemptSequence = 0;
    this.entryPipelineEvents = [];
    this.lightningPlasmaTelemetry = { fieldsObserved:0, fieldsQualified:0, fieldsCooldownBlocked:0, strikeAttempts:0, strikesOpened:0, lastFieldId:null, lastFieldAtMs:0 };
    this.phoenixSignalLocks = new Set();
    this.athenaR2FeederHistory = [];
    this.athenaR2ContextReady = typeof this.db?.entries !== 'function';
    this.athenaExclamation = new AthenaExclamationEngine({ db:this.db, getSettings:()=>this.getSettings(), audit:(event,data)=>this.audit(event,data) });
  }

  recordAthenaR2FeederContext(entry){
    if(!entry||!['Pegasus','Dragon'].includes(String(entry.conceptName||''))||!entry.ticker)return;
    const conceptName=String(entry.conceptName||''),signalPriceCents=conceptName==='Dragon'?athenaR2FeederSignal(entry):0;
    // R50/RGM2: retain only the causal fields consumed by the Guardian. Full
    // feeder rows can contain large diagnostic/learning snapshots and are not
    // needed for pre-entry risk reconstruction.
    const row={id:String(entry.id||''),conceptName,ticker:String(entry.ticker||''),eventTicker:String(entry.eventTicker||entry.ticker||''),entryPriceCents:Number(entry.entryPriceCents||0),openedAtMs:Number(entry.openedAtMs||0),entryConfig:conceptName==='Dragon'?{dragonSource:{signalPriceCents}}:{}};
    this.athenaR2FeederHistory.push(row);
    this.athenaR2FeederHistory.sort((a,b)=>Number(a.openedAtMs||0)-Number(b.openedAtMs||0));
    if(this.athenaR2FeederHistory.length>ATHENA_R2_FEEDER_CONTEXT_LIMIT)this.athenaR2FeederHistory.splice(0,this.athenaR2FeederHistory.length-ATHENA_R2_FEEDER_CONTEXT_LIMIT);
  }
  async hydrateAthenaR2FeederContext(){
    if(typeof this.db?.entries!=='function'){this.athenaR2ContextReady=true;return;}
    const s=this.getSettings();const rows=typeof this.db?.athenaR2FeederContextRows==='function'?await this.db.athenaR2FeederContextRows(s.systemName,{limit:ATHENA_R2_FEEDER_CONTEXT_LIMIT}):await this.db.entries(s.systemName,{limit:5000});
    this.athenaR2FeederHistory=[];for(const e of [...rows].sort((a,b)=>Number(a.openedAtMs||0)-Number(b.openedAtMs||0)))this.recordAthenaR2FeederContext(e);
    this.athenaR2ContextReady=true;
  }
  buildAthenaR2Context({ticker,eventTicker,sourceFeeder,concept,settings,now=Date.now()}={}){
    const exact=String(ticker||''),event=String(eventTicker||exact),source=String(sourceFeeder||'NONE');
    const prior=this.athenaR2FeederHistory.filter((e)=>Number(e.openedAtMs||0)<=Number(now));
    const same=prior.filter((e)=>String(e.ticker||'')===exact),ev=prior.filter((e)=>String(e.eventTicker||e.ticker||'')===event),opp=ev.filter((e)=>String(e.ticker||'')!==exact);
    const out={ready:this.athenaR2ContextReady===true};
    for(const type of ['Pegasus','Dragon']){
      const low=type.toLowerCase();const stRows=same.filter((e)=>e.conceptName===type),otRows=opp.filter((e)=>e.conceptName===type);const st=athenaR2Latest(stRows),ot=athenaR2Latest(otRows);
      out[`${low}SamePresent`]=st?1:0;out[`${low}OppPresent`]=ot?1:0;
      out[`${low}SameRef`]=st?Number(st.entryPriceCents||0):null;out[`${low}SameSignal`]=st?athenaR2FeederSignal(st):null;out[`${low}SameAgeSec`]=st?(Number(now)-Number(st.openedAtMs||0))/1000:null;
      out[`${low}OppRef`]=ot?Number(ot.entryPriceCents||0):null;out[`${low}OppSignal`]=ot?athenaR2FeederSignal(ot):null;out[`${low}OppAgeSec`]=ot?(Number(now)-Number(ot.openedAtMs||0))/1000:null;
      out[`${low}SameCount`]=stRows.length;out[`${low}OppCount`]=otRows.length;
      if(st&&ot){const sr=Number(st.entryPriceCents||0),or=Number(ot.entryPriceCents||0),ss=athenaR2FeederSignal(st),os=athenaR2FeederSignal(ot);out[`${low}RefEdge`]=sr-or;out[`${low}SignalEdge`]=ss-os;out[`${low}RefShare`]=(sr+or)>0?sr/(sr+or):.5;}
      else{out[`${low}RefEdge`]=null;out[`${low}SignalEdge`]=null;out[`${low}RefShare`]=null;}
      Object.assign(out,athenaR2SequenceFeatures(stRows,`${low}SameSeq`),athenaR2SequenceFeatures(otRows,`${low}OppSeq`));
    }
    const ps=athenaR2Latest(same.filter((e)=>e.conceptName==='Pegasus')),ds=athenaR2Latest(same.filter((e)=>e.conceptName==='Dragon'));
    if(ps&&ds){out.sameCosmosRefGap=Number(ds.entryPriceCents||0)-Number(ps.entryPriceCents||0);out.sameCosmosSignalVsPegRef=athenaR2FeederSignal(ds)-Number(ps.entryPriceCents||0);out.cosmosAgreementAgeGapSec=Math.abs(Number(ps.openedAtMs||0)-Number(ds.openedAtMs||0))/1000;}
    else{out.sameCosmosRefGap=null;out.sameCosmosSignalVsPegRef=null;out.cosmosAgreementAgeGapSec=null;}
    out.eventPriorFeederCount=ev.length;out.tickerPriorFeederCount=same.length;out.eventDistinctTickerCount=new Set(ev.map((e)=>String(e.ticker||''))).size;out.eventDistinctCosmosCount=new Set(ev.map((e)=>String(e.conceptName||''))).size;
    const sourceRows=source==='Pegasus'||source==='Dragon'?same.filter((e)=>e.conceptName===source):[];const sourceEventRows=source==='Pegasus'||source==='Dragon'?ev.filter((e)=>e.conceptName===source):[];
    Object.assign(out,athenaR2SequenceFeatures(sourceRows,'sourceSeq'));
    const refs=sourceRows.map((e)=>Number(e.entryPriceCents||0));const eventRefs=sourceEventRows.map((e)=>Number(e.entryPriceCents||0));const first=sourceRows[0]||null;
    out.priorSourceSignalsTicker=sourceRows.length;out.priorSourceSignalsEvent=sourceEventRows.length;out.sourceRefRangePrior=refs.length?Math.max(...refs)-Math.min(...refs):null;out.sourceRefMinPrior=refs.length?Math.min(...refs):null;out.sourceRefMaxPrior=refs.length?Math.max(...refs):null;
    out.sourceEventRefRangePrior=eventRefs.length?Math.max(...eventRefs)-Math.min(...eventRefs):null;out.sourceEventRefMinPrior=eventRefs.length?Math.min(...eventRefs):null;out.sourceEventRefMaxPrior=eventRefs.length?Math.max(...eventRefs):null;out.sourceFirstAgeSec=first?(Number(now)-Number(first.openedAtMs||0))/1000:null;
    Object.assign(out,athenaR2ModelSettings(settings,concept));
    return out;
  }
  async init(){
    await this.athenaExclamation?.init?.().catch(()=>{});
    try{await this.hydrateAthenaR2FeederContext();await this.audit('athena_b2_r2_context_hydrated',{feeders:this.athenaR2FeederHistory.length,limit:ATHENA_R2_FEEDER_CONTEXT_LIMIT});}
    catch(e){this.athenaR2ContextReady=false;await this.audit('athena_b2_r2_context_hydration_failed',{error:String(e?.message||e),policy:'fail_closed_supported_concepts'},'error').catch(()=>{});}
    return this;
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
    try{this.onEntryPipeline?.(row);}catch{}
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


  pruneRecoveryRuntime(eligibleSourceIds = new Set()) {
    const keep=eligibleSourceIds instanceof Set?eligibleSourceIds:new Set(eligibleSourceIds||[]);
    let removed=0;
    for(const id of [...this.recoveryRuntimeTroughs.keys()])if(!keep.has(String(id))){this.recoveryRuntimeTroughs.delete(id);removed++;}
    for(const id of [...this.recoveryAuditStates.keys()])if(!keep.has(String(id)))this.recoveryAuditStates.delete(id);
    return removed;
  }

  resourceSnapshot() {
    return {
      hunterTickerLocks:this.hunterTickerLocks.size,
      hunterEntryCommitLocks:this.hunterEntryCommitLocks.size,
      recoveryRuntimeTroughs:this.recoveryRuntimeTroughs.size,
      recoveryAuditStates:this.recoveryAuditStates.size,
      entryPipelineEvents:this.entryPipelineEvents.length,
      entryPipelineEventLimit:500,
      lightningPlasma:{...this.lightningPlasmaTelemetry},
      athenaExclamation:this.athenaExclamation?.summary?.()||null,
    };
  }

  async audit(event, data = {}) {
    await this.db.audit('info', event, data).catch(() => {});
  }

  async observeGoldSaintQualification(concept, q, {sourceFeeder=null,sourceTradeId=null,qualificationSnapshot=null,legacyCompatibility=false}={}) {
    if (legacyCompatibility !== true) return { vote:null, candidate:null, entry:null, legacyOnly:true };
    if (!isGoldSaintConcept(concept) || !q?.ticker) return { vote:null, candidate:null, entry:null };
    const s=this.getSettings();
    const bid=Number(q.yesBid||0),ask=Number(q.yesAsk||0);
    const status=String(q.status||'active').toLowerCase();
    if (!(bid>0) || !(ask>0) || bid>ask || status!=='active' || Boolean(q.result)) return { vote:null, candidate:null, entry:null };
    const gameMinutes=confirmedInGameElapsedMinutes(q);
    const sharedMin=Math.max(0,Number(s.minGameMinutes??20));
    const sharedMax=Math.max(0,Number(s.maxGameMinutes??0));
    // A Saint vote is an independently qualified Attack doctrine observation,
    // not an exposure grant. Require a confirmed in-game clock when available
    // here; the eventual Big Bang still force-refreshes GCA2 and the full book.
    if (gameMinutes==null || gameMinutes+1e-9<sharedMin || (sharedMax>0&&gameMinutes-1e-9>sharedMax)) return { vote:null, candidate:null, entry:null };
    const result=await this.athenaExclamation.recordQualification({
      conceptName:concept,ticker:q.ticker,eventTicker:q.eventTicker||q.ticker,qualifiedAtMs:Date.now(),
      priceCents:ask,bidCents:bid,sourceFeeder,sourceTradeId,gameMinutes,qualificationSnapshot,
    });
    if (!result?.candidate || s.athenaExclamationEnabled!==true) return { ...result, entry:null };
    const entry=await this.executeAthenaExclamationCandidate(result.candidate,q);
    return { ...result, entry };
  }

  async executeAthenaExclamationCandidate(candidate,q) {
    const s=this.getSettings();
    if (s.athenaExclamationEnabled!==true || !candidate?.id || !q?.ticker) return null;
    // The Exclamation has its own stake but never bypasses the shared portfolio
    // cap. This check is repeated by the ordinary event/capital path later.
    const entries=typeof this.db?.openEntries==='function'?await this.db.openEntries(s.systemName):await this.db.entries(s.systemName,{limit:5000});
    if (slotsLeft(entries.filter((e)=>openLike(e.status)),s)<=0) {
      await this.athenaExclamation.markDecision(candidate.id,{status:'EXECUTION_BLOCKED',review:{reason:'max_positions'}});
      await this.audit('athena_exclamation_execution_blocked',{id:candidate.id,ticker:candidate.ticker,reason:'max_positions'});
      return null;
    }
    const saints=(candidate.saints||[]).slice().sort((a,b)=>Number(a.lastQualifiedAtMs||a.firstQualifiedAtMs||0)-Number(b.lastQualifiedAtMs||b.firstQualifiedAtMs||0));
    const first=saints[0]||{},third=saints[Math.min(2,saints.length-1)]||{};
    const snapshot={
      version:'AE1-Q1',policyRevision:ATHENA_EXCLAMATION.policyRevision,eventId:candidate.id,
      candidate:structuredClone(candidate),minimumSaints:ATHENA_EXCLAMATION.minimumSaints,
      firstVoteAtMs:Number(candidate.firstVoteAtMs||0),thirdVoteAtMs:Number(candidate.thirdVoteAtMs||0),
      convergenceSpanMs:Number(candidate.convergenceSpanMs||0),saintCount:Number(candidate.saintCount||saints.length),
      combination:[...(candidate.combination||[])],firstSaintPriceCents:Number(first.priceCents||0),
      thirdSaintPriceCents:Number(third.priceCents||0),observedAtMs:Date.now(),
    };
    const entry=await this.createHunter('Athena Exclamation',q,Number(s.athenaExclamationStakeCents||ATHENA_EXCLAMATION_DOCTRINE.defaultStakeCents),0,{
      sourceTradeId:candidate.id,entryQualificationSnapshot:snapshot,legacyCompatibility:true,
    });
    if(entry){
      await this.athenaExclamation.markDecision(candidate.id,{status:'EXECUTED',entryId:entry.id,review:entry.entryConfig?.athenaExclamation?.primeReview||null});
      await this.audit('athena_exclamation_executed',{id:candidate.id,entryId:entry.id,ticker:entry.ticker,entryPriceCents:entry.entryPriceCents,count:entry.count,combination:candidate.combination});
      return entry;
    }
    const current=this.athenaExclamation.events.get(String(candidate.id));
    if(current?.status==='CANDIDATE'||current?.status==='QUALIFIED')await this.athenaExclamation.markDecision(candidate.id,{status:'EXECUTION_BLOCKED',review:current.review||{reason:'entry_pipeline_blocked'}});
    return null;
  }

  // R45: Golden Dragon feeder / Golden Dragon Hunter / Dragon Recovery
  // Hunter runtime production paths are removed. Historical database records
  // remain readable through diagnostics/Athena, but StrategyEngine exposes no
  // callable creation or feed-authority lifecycle for those retired concepts.

  async simulationAvailableCashCents(entriesOverride = null) {
    const s = this.getSettings();
    // HF5: callers that already loaded the ledger (dashboard/state collection)
    // may reuse it. Entry authorization still calls this without an override and
    // therefore performs its own fresh durable read before spending capital.
    if(!Array.isArray(entriesOverride)&&typeof this.db?.simulationCashAggregate==='function'){const a=await this.db.simulationCashAggregate(s.systemName,{simFeeCents:Number(s.simFeeCents||0)});return Number(s.startingCapitalCents||0)+Number(a.realizedCents||0)-Number(a.reservedCents||0);}
    const entries = Array.isArray(entriesOverride) ? entriesOverride : await this.db.entries(s.systemName, { limit: 5000 });
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
    const cutoff=Date.now()-Math.max(1,Number(s.recoveryTrackingHours||24))*3600000;
    const entries=typeof this.db?.recoverySourceEntries==='function'?await this.db.recoverySourceEntries(s.systemName,{sinceMs:cutoff}):await this.db.entries(s.systemName,{limit:5000});
    const sources=typeof this.db?.recoverySourceEntries==='function'?entries:this.recoverySourcesFromEntries(entries,s);
    return [...new Set(sources.map((e) => e.ticker).filter(Boolean))];
  }

  async recoveryObservationsBySource(sourceIds=null) {
    const s = this.getSettings();
    const ids=Array.isArray(sourceIds)?[...new Set(sourceIds.map(String).filter(Boolean))]:null;
    if(ids&&typeof this.db?.recoveryObservationsByOriginalEntryIds==='function'){const rows=await this.db.recoveryObservationsByOriginalEntryIds(s.systemName,ids).catch(()=>[]);const map=new Map();for(const row of rows||[]){const source=String(row?.original_entry_id||'');if(!source||map.has(source))continue;map.set(source,row);}return map;}
    if (typeof this.db.recoveryObservations !== 'function') return new Map();
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
    this.recordAthenaR2FeederContext(e);
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


  hunterConcurrencyLockKey(concept,ticker,settings=this.getSettings()) {
    const exact=String(ticker||'');
    if(!exact)return '';
    return settings?.galacticExplosionEnabled===true ? `${exact}|attack:${String(concept||'')}` : exact;
  }

  async activeHunterTickerExposure(ticker) {
    const s = this.getSettings();
    const rows = typeof this.db.openHunterEntriesByTicker === 'function'
      ? await this.db.openHunterEntriesByTicker(s.systemName, ticker)
      : typeof this.db.openEntriesByTicker === 'function'
        ? await this.db.openEntriesByTicker(s.systemName, ticker)
        : (await this.db.entries(s.systemName, { limit: 5000 }))
          .filter((e) => e.ticker === ticker && openLike(e.status));
    return rows.filter((e) => PORTFOLIO_CONCEPTS.has(e.conceptName) && openLike(e.status));
  }

  async exactTickerExposureClear(concept, q, stage = 'policy') {
    const s=this.getSettings();
    const active = await this.activeHunterTickerExposure(q.ticker);
    const conflicts=s.galacticExplosionEnabled===true
      ? active.filter((e)=>e.conceptName===concept)
      : active;
    if (!conflicts.length) return true;
    const existing = conflicts
      .slice()
      .sort((a, b) => Number(a.openedAtMs || 0) - Number(b.openedAtMs || 0))[0];
    await this.audit('hunter_exact_ticker_exposure_blocked', {
      concept, ticker:q.ticker, eventTicker:q.eventTicker || q.ticker, stage,
      galacticExplosionEnabled:s.galacticExplosionEnabled===true,
      lockScope:s.galacticExplosionEnabled===true?GALACTIC_EXPLOSION.enabledLockScope:GALACTIC_EXPLOSION.disabledLockScope,
      activeHuntersOnTicker:active.length, conflictingHunters:conflicts.length,
      existingHunterId: existing?.id || null, existingConcept: existing?.conceptName || null,
      existingStatus: existing?.status || null, existingSourceFeeder: existing?.sourceFeeder || null,
      existingSourceTradeId: existing?.sourceTradeId || null, existingOpenedAtMs: Number(existing?.openedAtMs || 0) || null,
    });
    return false;
  }

  async hunterEventAdmissionState(q,{concept=null}={}){
    const s=this.getSettings(),event=q?.eventTicker||q?.ticker;
    let activeEntries=0,latestHunterEntryMs=0,latestByConcept={};
    if(typeof this.db?.hunterEventPolicySnapshot==='function'){
      const snap=await this.db.hunterEventPolicySnapshot(s.systemName,event);
      activeEntries=Number(snap?.activeEntries||0);latestHunterEntryMs=Number(snap?.latestHunterEntryMs||0);latestByConcept={...(snap?.latestByConcept||{})};
    }else{
      const entries=await this.db.entries(s.systemName,{limit:5000});const hunters=entries.filter((e)=>PORTFOLIO_CONCEPTS.has(e.conceptName));
      const eventHunters=hunters.filter((e)=>(e.eventTicker||e.ticker)===event);
      activeEntries=eventHunters.filter((e)=>openLike(e.status)).length;
      for(const e of eventHunters){if(e.status==='rejected')continue;const name=String(e.conceptName||'');if(!name)continue;latestByConcept[name]=Math.max(Number(latestByConcept[name]||0),Number(e.openedAtMs||0));}
      latestHunterEntryMs=eventHunters.filter((e)=>e.status!=='rejected').reduce((m,e)=>Math.max(m,Number(e.openedAtMs||0)),0);
    }
    const maxEntriesPerTrade=Math.max(1,Math.floor(Number(s.maxEntriesPerTrade??s.maxPositions??1)));
    const hunterCooldownMinutes=Math.max(0,Number(s.hunterCooldownMinutes??0));
    const cooldownCutoffMs=Date.now()-hunterCooldownMinutes*60_000;
    const sharedCooldownBlocked=hunterCooldownMinutes>0&&latestHunterEntryMs>=cooldownCutoffMs;
    const cooldownBlockedConcepts=Object.entries(latestByConcept).filter(([,at])=>hunterCooldownMinutes>0&&Number(at||0)>=cooldownCutoffMs).map(([name])=>String(name));
    const attackLatestEntryMs=concept?Number(latestByConcept[String(concept)]||0):0;
    const attackCooldownBlocked=Boolean(concept)&&hunterCooldownMinutes>0&&attackLatestEntryMs>=cooldownCutoffMs;
    const cooldownScope=s.galacticExplosionEnabled===true?'attack':'event';
    const cooldownBlocked=cooldownScope==='attack'?(concept?attackCooldownBlocked:false):sharedCooldownBlocked;
    return{eventTicker:event,activeEntries,maxEntriesPerTrade,eventCapBlocked:activeEntries>=maxEntriesPerTrade,latestHunterEntryMs,latestByConcept,hunterCooldownMinutes,cooldownScope,sharedCooldownBlocked,attackLatestEntryMs,attackCooldownBlocked,cooldownBlockedConcepts,cooldownBlocked};
  }

  async hunterEntryPolicyDecision(concept, q, { requireClock = true, includeCooldown = true, stage = 'policy' } = {}) {
    const s = this.getSettings();
    if (requireClock) {
      const minGameMinutes = Math.max(0, Number(s.minGameMinutes ?? 20));
      const maxGameMinutes = Math.max(0, Number(s.maxGameMinutes ?? 0));
      const elapsedMinutes = confirmedInGameElapsedMinutes(q);
      if (elapsedMinutes == null) {
        await this.audit('hunter_in_game_time_unknown', { concept, ticker:q?.ticker || null, eventTicker:q?.eventTicker || q?.ticker || null, minGameMinutes, maxGameMinutes, stage });
        return {ok:false,reason:'game_clock_unknown',elapsedMinutes:null,minGameMinutes,maxGameMinutes};
      }
      if (elapsedMinutes + 1e-9 < minGameMinutes) {
        await this.audit('hunter_min_game_minutes_blocked', { concept, ticker:q?.ticker || null, eventTicker:q?.eventTicker || q?.ticker || null, minGameMinutes, maxGameMinutes, elapsedMinutes, stage });
        return {ok:false,reason:'minimum_game_time',elapsedMinutes,minGameMinutes,maxGameMinutes};
      }
      if (maxGameMinutes > 0 && elapsedMinutes - 1e-9 > maxGameMinutes) {
        await this.audit('hunter_max_game_minutes_blocked', { concept, ticker:q?.ticker || null, eventTicker:q?.eventTicker || q?.ticker || null, minGameMinutes, maxGameMinutes, elapsedMinutes, stage });
        return {ok:false,reason:'maximum_game_time',elapsedMinutes,minGameMinutes,maxGameMinutes};
      }
    }
    // Galactic Explosion topology is a hard exposure invariant, not a second
    // strategic opinion. It remains valid after FIRE and is returned with an
    // exact reason instead of the old generic STATIC_POLICY label.
    if (!(await this.exactTickerExposureClear(concept, q, stage))) return {ok:false,reason:'ticker_lock'};

    const eventState=await this.hunterEventAdmissionState(q,{concept}),event=eventState.eventTicker;
    if (eventState.eventCapBlocked) {
      await this.audit('hunter_entry_trade_cap_blocked', { concept, ticker:q.ticker, eventTicker:event, activeEntries:eventState.activeEntries, maxEntriesPerTrade:eventState.maxEntriesPerTrade, stage });
      return {ok:false,reason:'event_entry_cap',...eventState};
    }
    if (includeCooldown && concept !== 'Athena Exclamation' && eventState.cooldownBlocked) {
      await this.audit('hunter_entry_cooldown_blocked', { concept, ticker:q.ticker, eventTicker:event, hunterCooldownMinutes:eventState.hunterCooldownMinutes, cooldownScope:eventState.cooldownScope, latestHunterEntryMs:eventState.latestHunterEntryMs, attackLatestEntryMs:eventState.attackLatestEntryMs, stage });
      return {ok:false,reason:'hunter_cooldown',...eventState};
    }
    return {ok:true,reason:'qualified',...eventState,cooldownApplied:includeCooldown};
  }

  async hunterEntryPolicy(concept, q, { requireClock = true } = {}) {
    return (await this.hunterEntryPolicyDecision(concept,q,{requireClock,includeCooldown:true,stage:'legacy_policy'})).ok;
  }

  async revalidateHunterEntryDoctrine(concept, executionQuote, executionPlan, settings, {
    sourceFeeder = null,
    sourceTradeId = null,
    recoverySourceSnapshot = null,
    crashSourceSnapshot = null,
    entryQualificationSnapshot = null,
  } = {}) {
    const boundary = hunterEntryBoundaryQualifiedAtQuote(concept, executionQuote, settings, executionPlan);
    if (!boundary.ok) return boundary;

    if (concept === 'Athena Exclamation') {
      const snap=entryQualificationSnapshot;
      if (snap?.version!=='AE1-Q1' || !snap.candidate || String(snap.candidate.ticker||'')!==String(executionQuote.ticker||'')) return { ...boundary, ok:false, reason:'qualification_context_missing' };
      const saints=Array.isArray(snap.candidate.saints)?snap.candidate.saints:[];
      const distinct=new Set(saints.map((x)=>String(x.conceptName||'')).filter(isGoldSaintConcept));
      if(distinct.size<ATHENA_EXCLAMATION.minimumSaints)return { ...boundary,ok:false,reason:'three_saints_missing',saintCount:distinct.size };
      const windowMs=Math.max(1,Number(settings.athenaExclamationConvergenceWindowMinutes??ATHENA_EXCLAMATION.defaultConvergenceWindowMinutes))*60_000;
      const firstAt=Number(snap.firstVoteAtMs||snap.candidate.firstVoteAtMs||0),thirdAt=Number(snap.thirdVoteAtMs||snap.candidate.thirdVoteAtMs||0);
      if(!(firstAt>0)||!(thirdAt>=firstAt)||thirdAt-firstAt>windowMs||Date.now()-firstAt>windowMs)return { ...boundary,ok:false,reason:'convergence_window_expired' };
      return { ...boundary,saintCount:distinct.size,convergenceSpanMs:thirdAt-firstAt,eventId:snap.eventId||snap.candidate.id||null };
    }

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
      if (!sourceFeeder || !ACTIVE_FEEDER_CONCEPTS.has(sourceFeeder) || !sourceTradeId || !crashSourceSnapshot?.episodeId || !crashSourceSnapshot?.cosmoSourceId) {
        return { ...boundary, ok:false, reason:'qualification_context_missing' };
      }
      return boundary;
    }

    if (concept === 'Lightning Plasma') {
      const snap=entryQualificationSnapshot;
      if (!sourceFeeder || !ACTIVE_FEEDER_CONCEPTS.has(sourceFeeder) || !sourceTradeId || snap?.version !== 'LP1-Q1' || String(snap.sourceId || '') !== String(sourceTradeId)) {
        return { ...boundary, ok:false, reason:'qualification_context_missing' };
      }
      const expiresAtMs=Number(snap.fieldExpiresAtMs || 0);
      if (!(expiresAtMs > 0) || Date.now() > expiresAtMs) return { ...boundary, ok:false, reason:'plasma_field_expired' };
      const anchor=Number(snap.sourceAnchorCents || 0);
      if (!(anchor > 0)) return { ...boundary, ok:false, reason:'qualification_context_invalid' };
      const bid=Number(executionQuote.yesBid || 0), ask=Number(executionQuote.yesAsk || 0);
      const fade=Math.max(0,anchor-bid);
      const chase=Math.max(0,ask-anchor);
      const maxFade=Math.max(0,Number(settings.lightningPlasmaMaxSourceFadeCents ?? LIGHTNING_PLASMA.maxSourceFadeCents));
      const maxChase=Math.max(0,Number(settings.lightningPlasmaMaxChaseCents ?? LIGHTNING_PLASMA.maxChaseCents));
      if (fade > maxFade) return { ...boundary, ok:false, reason:'plasma_source_faded', fadeCents:fade, maxFadeCents:maxFade };
      if (chase > maxChase) return { ...boundary, ok:false, reason:'plasma_source_overextended', chaseCents:chase, maxChaseCents:maxChase };
      return { ...boundary, fadeCents:fade, chaseCents:chase, fieldId:snap.fieldId || null };
    }

    return { ...boundary, ok:false, reason:'unknown_hunter_concept' };
  }

  async createHunter(concept, q, stakeCents, _legacyStopLossCents = 0, { sourceFeeder = null, sourceTradeId = null, sourceEntryConfig = null, recoverySourceSnapshot = null, crashSourceSnapshot = null, entryQualificationSnapshot = null, athenaFireCommand = null, legacyCompatibility = false } = {}) {
    const s = this.getSettings();
    const exactTicker = String(q?.ticker || '');
    if (!exactTicker) return null;
    const tickerLockKey = this.hunterConcurrencyLockKey(concept, exactTicker, s);
    const pipelineAttemptId = `${Date.now()}-${++this.entryPipelineAttemptSequence}`;
    const candidateId=String(athenaFireCommand?.decisionEvidence?.preBoltClearance?.preBoltId||entryQualificationSnapshot?.preBoltClearance?.preBoltId||athenaFireCommand?.boltId||entryQualificationSnapshot?.boltId||'');
    const boltId=String(athenaFireCommand?.boltId||entryQualificationSnapshot?.boltId||'');
    const trace = (stage, status, reason = null, data = {}) => this.recordEntryPipeline(pipelineAttemptId, concept, exactTicker, stage, status, reason, {candidateId:candidateId||null,boltId:boltId||null,eventTicker:q?.eventTicker||q?.ticker||null,...data});
    trace('RECEIVED','PASS',null,{eventTicker:String(q?.eventTicker || exactTicker),sourceFeeder:sourceFeeder || null,galacticExplosionEnabled:s.galacticExplosionEnabled===true,concurrencyLockKey:tickerLockKey});
    // EMI1 defense-in-depth: Engine scheduling is the primary mode boundary,
    // but createHunter itself must independently fail closed before any market
    // refresh, capital work, or broker mutation if LIVE is not currently armed.
    if (s.mode === 'LIVE' && !this.getLiveReady()) {
      trace('MODE_AUTHORIZATION','BLOCKED','live_not_ready');
      await this.audit('hunter_entry_mode_authorization_blocked',{concept,ticker:exactTicker,eventTicker:q?.eventTicker || exactTicker,mode:s.mode});
      return null;
    }
    if (s.mode !== 'LIVE' && s.mode !== 'SIMULATION') {
      trace('MODE_AUTHORIZATION','BLOCKED','invalid_mode',{mode:s.mode});
      return null;
    }
    trace('MODE_AUTHORIZATION','PASS',s.mode === 'LIVE' ? 'live_ready' : 'simulation');
    if (this.hunterTickerLocks.has(tickerLockKey)) {
      trace('LOCAL_TICKER_LOCK','BLOCKED','local_ticker_lock_busy');
      await this.audit('hunter_exact_ticker_lock_busy', { concept, ticker: exactTicker, eventTicker: q?.eventTicker || exactTicker });
      return null;
    }
    this.hunterTickerLocks.add(tickerLockKey);
    let dbEntryCommitUnlock = null;
    let localEntryCommitKey = null;
    const releaseEntryCommitLock = async () => {
      if (dbEntryCommitUnlock) {
        const unlock=dbEntryCommitUnlock;dbEntryCommitUnlock=null;
        await unlock();
      }
      if (localEntryCommitKey) {
        this.hunterEntryCommitLocks.delete(localEntryCommitKey);
        localEntryCommitKey=null;
      }
    };
    try {
      // HF3: do not hold a session advisory-lock connection across the long
      // market/clock/Athena qualification path. The process-local Attack/ticker
      // lock prevents duplicate work in this process; cross-process uniqueness
      // is authoritatively rechecked under the short exact-ticker commit lock
      // immediately before persistence.
      if (!isModelEnabled(s, concept)) {
      trace('MODEL_ENABLEMENT','BLOCKED','model_disabled');
      await this.audit('model_entry_disabled', { concept, ticker: q.ticker, kind: 'hunter' });
      return null;
      }
      const newGenerationEntry=legacyCompatibility!==true;
      let fireValidation=null;
      if(newGenerationEntry){
        fireValidation=validateAthenaFireCommand(athenaFireCommand,{concept,q,settings:s,now:Date.now()});
        if(!fireValidation.ok){
          trace('ATHENA_FIRE','BLOCKED',fireValidation.reason,fireValidation);
          await this.audit('athena_fire_execution_blocked',{concept,ticker:q.ticker,eventTicker:q.eventTicker||q.ticker,reason:fireValidation.reason,boltId:athenaFireCommand?.boltId||null});
          return null;
        }
        if(Math.abs(Number(stakeCents)-Number(fireValidation.stakeCents))>1e-9){
          trace('ATHENA_FIRE','BLOCKED','attack_stake_not_commanded',{stakeCents,commandedStakeCents:fireValidation.stakeCents});
          return null;
        }
        trace('ATHENA_FIRE','PASS','command_verified',{boltId:athenaFireCommand.boltId,authorizedMaxEntryCents:fireValidation.authorizedMaxEntryCents});
      }
      if (legacyCompatibility===true && sourceFeeder && !isModelEnabled(s, sourceFeeder)) {
      trace('SOURCE_ENABLEMENT','BLOCKED','source_feeder_disabled',{sourceFeeder});
      await this.audit('model_source_feeder_disabled', { concept, sourceFeeder, ticker: q.ticker });
      return null;
      }
      trace('MODEL_ENABLEMENT','PASS');
      // R58 FIRE/execution boundary: a sealed Athena command may be aborted by
      // hard exposure topology, but never by the old shared strategic cooldown.
      // Legacy paths keep the historical policy. Exact subreasons are surfaced
      // so a future choke cannot hide behind generic STATIC_POLICY telemetry.
      const preExecutionPolicy=await this.hunterEntryPolicyDecision(concept,q,{requireClock:false,includeCooldown:!newGenerationEntry,stage:newGenerationEntry?'post_fire_preflight':'legacy_preflight'});
      if(!preExecutionPolicy.ok){trace(newGenerationEntry?'EXECUTION_POLICY':'STATIC_POLICY','BLOCKED',preExecutionPolicy.reason,preExecutionPolicy);return null;}
      trace(newGenerationEntry?'EXECUTION_POLICY':'STATIC_POLICY','PASS',preExecutionPolicy.reason,preExecutionPolicy);

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
      const executionMaxGameMinutes = Math.max(0, Number(s.maxGameMinutes ?? 0));
      const entryAuthorityFresh = isEntryAuthorizedGameClockState(q.gameClockState, q.eventTicker || q.ticker, executionNow);
      const maximumExceeded=executionMaxGameMinutes>0&&executionElapsed!=null&&executionElapsed-1e-9>executionMaxGameMinutes;
      if (!entryAuthorityFresh || executionElapsed == null || executionElapsed + 1e-9 < executionMinGameMinutes || maximumExceeded) {
        const clockBlockReason=!entryAuthorityFresh?(q.gameClockState?.reason||'entry_authority_not_fresh'):executionElapsed==null?'elapsed_unknown':maximumExceeded?'maximum_game_time':'minimum_game_time';
        trace('GAME_CLOCK','BLOCKED',clockBlockReason,{phase:q.gameClockState?.phase || 'UNKNOWN',entryAuthorized:Boolean(q.gameClockState?.entryAuthorized),elapsedMinutes:executionElapsed,minGameMinutes:executionMinGameMinutes,maxGameMinutes:executionMaxGameMinutes});
        await this.audit('hunter_clock_revalidation_blocked', {
          concept, ticker: q.ticker, eventTicker: q.eventTicker || q.ticker,
          minGameMinutes: executionMinGameMinutes, maxGameMinutes:executionMaxGameMinutes, elapsedMinutes: executionElapsed,
          phase: q.gameClockState?.phase || 'UNKNOWN', reason: q.gameClockState?.reason || null,
          entryAuthorized: Boolean(q.gameClockState?.entryAuthorized),
          evidenceObservedAtMs: Number(q.gameClockState?.evidenceObservedAtMs || 0) || null,
        });
        return null;
      }
      trace('GAME_CLOCK','PASS',q.gameClockState?.authorizationReason || q.gameClockState?.reason || 'authorized',{elapsedMinutes:executionElapsed,minGameMinutes:executionMinGameMinutes,maxGameMinutes:executionMaxGameMinutes});

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

      // R51 authority inversion: Athena has already decided the market thesis.
      // The Attack may now abort only because the exact FIRE envelope or a hard
      // execution/safety invariant no longer holds. Legacy creation paths keep
      // their old doctrine revalidation behind an explicit compatibility flag.
      if(newGenerationEntry){
        const freshFire=validateAthenaFireCommand(athenaFireCommand,{concept,q:executionQuote,settings:s,now:Date.now()});
        if(!freshFire.ok){
          trace('FIRE_EXECUTION_ENVELOPE','BLOCKED',freshFire.reason,freshFire);
          await this.audit('athena_fire_fresh_execution_blocked',{concept,ticker:q.ticker,eventTicker:expectedEventTicker,boltId:athenaFireCommand?.boltId||null,reason:freshFire.reason});
          return null;
        }
        const boundary=hunterEntryBoundaryQualifiedAtQuote(concept,executionQuote,s,plan);
        if(!boundary.ok){trace('FIRE_EXECUTION_ENVELOPE','BLOCKED',boundary.reason,boundary);return null;}
        const authorizedMax=Number(athenaFireCommand.authorizedMaxEntryCents||0);
        if(Number(plan.bestAskCents||executionQuote.yesAsk)>authorizedMax+1e-9||Number(plan.averagePriceCents||0)>authorizedMax+1e-9){
          trace('FIRE_EXECUTION_ENVELOPE','BLOCKED','athena_strike_price_exceeded',{authorizedMaxEntryCents:authorizedMax,bestAskCents:Number(plan.bestAskCents||0),averagePriceCents:Number(plan.averagePriceCents||0)});
          await this.audit('athena_fire_price_moved_beyond_authorization',{concept,ticker:q.ticker,boltId:athenaFireCommand?.boltId||null,authorizedMaxEntryCents:authorizedMax,bestAskCents:Number(plan.bestAskCents||0),averagePriceCents:Number(plan.averagePriceCents||0)});
          return null;
        }
        if(concept==='Recovery Hunter'&&!recoverySourceSnapshot){trace('FIRE_EXECUTION_ENVELOPE','BLOCKED','crystal_wall_recovery_source_missing');return null;}
        trace('FIRE_EXECUTION_ENVELOPE','PASS','athena_command_still_executable',{boltId:athenaFireCommand.boltId});
      }else{
        const doctrineValidation=await this.revalidateHunterEntryDoctrine(concept,executionQuote,plan,s,{sourceFeeder,sourceTradeId,recoverySourceSnapshot,crashSourceSnapshot,entryQualificationSnapshot});
        if(!doctrineValidation.ok){trace('DOCTRINE','BLOCKED',doctrineValidation.reason||'doctrine');return null;}
        trace('DOCTRINE','PASS','legacy_compatibility');
      }

      // R51: the durable Athena FIRE command is the sole strategic entry
      // authority. R50 B1/B2 remains historical/legacy compatibility only and
      // is never allowed to re-veto a new-generation FIRE command.
      let athenaAssessment=null;
      let athenaExclamationReview=null;
      if(newGenerationEntry){
        athenaAssessment={version:ATHENA_COMMANDER.version,policyRevision:ATHENA_COMMANDER.policyRevision,decision:'FIRE',strategicAuthority:true,boltId:athenaFireCommand.boltId,commandHash:athenaFireCommand.commandHash,selectedAttack:concept,ranking:structuredClone(athenaFireCommand.ranking||[]),decisionEvidence:structuredClone(athenaFireCommand.decisionEvidence||{}),survivalCertificate:structuredClone(athenaFireCommand.survivalCertificate||null),survivalAuthority:ARAYASHIKI.version,legacyB2VetoApplied:false,decidedAtMs:Number(athenaFireCommand.decidedAtMs)};
        trace('ATHENA','PASS','supreme_fire_authority',{boltId:athenaFireCommand.boltId,selectedAttack:concept});
      }else if(this.athena&&typeof this.athena.assess==='function'){
        athenaAssessment=this.athena.assess({conceptName:concept,sourceFeeder,ticker:q.ticker,title:executionQuote.title||q.title||q.ticker,entryPriceCents:Number(executionQuote.yesAsk||0),bidCents:Number(executionQuote.yesBid||0),askCents:Number(executionQuote.yesAsk||0),gameMinutes:confirmedInGameElapsedMinutes(q,Date.now())||0});
        if(athenaAssessment.blocked){trace('ATHENA','BLOCKED',athenaAssessment.reason||'legacy_athena_veto');return null;}
        trace('ATHENA','PASS','legacy_compatibility');
      }

      // R45 Galactic Explosion shared-commit boundary. Different Attacks may
      // legitimately coexist on one exact ticker, but shared event caps,
      // simulation cash, durable intent persistence and broker mutation must
      // never be decided concurrently from the same stale ledger
      // view. Serialize only this final commit window; the earlier structural
      // qualification/exposure lock remains concept-scoped when GE is ON.
      localEntryCommitKey = `commit:${exactTicker}`;
      if (this.hunterEntryCommitLocks.has(localEntryCommitKey)) {
        trace('ENTRY_COMMIT_LOCK','BLOCKED','local_entry_commit_lock_busy');
        await this.audit('hunter_entry_commit_lock_busy',{concept,ticker:exactTicker,eventTicker:expectedEventTicker});
        return null;
      }
      this.hunterEntryCommitLocks.add(localEntryCommitKey);
      if (typeof this.db.acquireHunterTickerLock === 'function') {
        dbEntryCommitUnlock = await this.db.acquireHunterTickerLock(s.systemName, localEntryCommitKey);
        if (!dbEntryCommitUnlock) {
          trace('ENTRY_COMMIT_LOCK','BLOCKED','db_entry_commit_lock_busy');
          await this.audit('hunter_entry_commit_db_lock_busy',{concept,ticker:exactTicker,eventTicker:expectedEventTicker});
          return null;
        }
      }
      trace('ENTRY_COMMIT_LOCK','PASS');

      // The market refresh itself may consume time. Authorization is deliberately
      // short-lived; recheck its freshness at the last executable boundary.
      const finalNow = Date.now();
      const finalElapsed = confirmedInGameElapsedMinutes(q, finalNow);
      const finalMaximumExceeded=executionMaxGameMinutes>0&&finalElapsed!=null&&finalElapsed-1e-9>executionMaxGameMinutes;
      if (!isEntryAuthorizedGameClockState(q.gameClockState, expectedEventTicker, finalNow)
          || finalElapsed == null || finalElapsed + 1e-9 < executionMinGameMinutes || finalMaximumExceeded) {
        trace('FINAL_CLOCK','BLOCKED',finalMaximumExceeded?'maximum_game_time':'authorization_expired',{elapsedMinutes:finalElapsed,minGameMinutes:executionMinGameMinutes,maxGameMinutes:executionMaxGameMinutes});
        await this.audit('hunter_clock_authorization_expired_before_execution', {
          concept, ticker: q.ticker, eventTicker: expectedEventTicker,
          minGameMinutes:executionMinGameMinutes,maxGameMinutes:executionMaxGameMinutes,elapsedMinutes:finalElapsed,
          reason:finalMaximumExceeded?'maximum_game_time':'authorization_expired',
          evidenceObservedAtMs: Number(q.gameClockState?.evidenceObservedAtMs || 0) || null,
        });
        return null;
      }
      trace('FINAL_CLOCK','PASS');
      // Re-run only the hard exposure topology under the exact-ticker commit
      // coordinator for new-generation FIRE. Cooldown is not execution safety
      // and cannot reacquire strategic veto authority after Athena.
      const finalEntryPolicy=await this.hunterEntryPolicyDecision(concept,q,{requireClock:false,includeCooldown:!newGenerationEntry,stage:newGenerationEntry?'post_fire_commit':'legacy_commit'});
      if(!finalEntryPolicy.ok){trace('FINAL_ENTRY_POLICY','BLOCKED',finalEntryPolicy.reason,finalEntryPolicy);return null;}
      trace('FINAL_ENTRY_POLICY','PASS',finalEntryPolicy.reason,finalEntryPolicy);

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
      const plannedCount = Math.max(1, Number(plan.count || 0));
      const plannedEntry = Math.round(Number(plan.averagePriceCents || executionQuote.yesAsk || q.yesAsk));
      const simFeePerContract = Math.max(0, Number(s.simFeeCents || 0));
      const preflightEntryFeeCents = s.mode==='LIVE' ? null : simFeePerContract * plannedCount;
      const auroraPreflight = calculateAuroraSnapshotFromFeeModel({
        entryPriceCents:plannedEntry,count:plannedCount,entryFeeCents:preflightEntryFeeCents,
        mode:s.mode,simFeeCents:simFeePerContract,damageControlPercent:Number(s.auroraDamageControlPercent??45),calculatedAtMs:now,
      });
      if(!auroraPreflight.ok){
        trace('AURORA','BLOCKED',auroraPreflight.reason || 'aurora_preflight_failed');
        await this.audit('aurora_entry_preflight_blocked',{concept,ticker:q.ticker,eventTicker:expectedEventTicker,reason:auroraPreflight.reason,entryPriceCents:plannedEntry,count:plannedCount,entryFeeCents:auroraPreflight.entryFeeCents??preflightEntryFeeCents,expectedExitFeeCents:auroraPreflight.expectedExitFeeCents??null});
        return null;
      }
      trace('AURORA','PASS','preflight',{stopDistanceCents:auroraPreflight.stopDistanceCents,dangerPriceCents:auroraPreflight.dangerPriceCents,economicLossRatioAtDanger:auroraPreflight.economicLossRatioAtDanger});

      const frozenEntryConfig = entryConfigSnapshot(s, concept, sourceFeeder, stakeCents, sourceEntryConfig, q.gameClockState, q.eventTicker || q.ticker);
      if (recoverySourceSnapshot && typeof recoverySourceSnapshot === 'object') frozenEntryConfig.recoverySource = structuredClone(recoverySourceSnapshot);
      if (crashSourceSnapshot && typeof crashSourceSnapshot === 'object') frozenEntryConfig.crashRecoverySource = structuredClone(crashSourceSnapshot);
      if (entryQualificationSnapshot && typeof entryQualificationSnapshot === 'object') frozenEntryConfig.entryQualification = structuredClone(entryQualificationSnapshot);
      if (athenaAssessment && typeof athenaAssessment === 'object') frozenEntryConfig.athena = structuredClone(athenaAssessment);
      if (concept==='Athena Exclamation') frozenEntryConfig.athenaExclamation={
        version:ATHENA_EXCLAMATION.version,policyRevision:ATHENA_EXCLAMATION.policyRevision,
        candidate:structuredClone(entryQualificationSnapshot?.athenaExclamationCandidate||entryQualificationSnapshot?.fieldContext?.athenaExclamationCandidate||entryQualificationSnapshot?.candidate||null),
        primeReview:structuredClone(athenaExclamationReview),
      };
      frozenEntryConfig.strategyIdentity = {
        internalConcept:concept,
        displayName:EXECUTION_ATTACK_DISPLAY[concept]?.name || concept,
        legacyName:EXECUTION_ATTACK_DISPLAY[concept]?.legacy || concept,
      };
      frozenEntryConfig.galacticExplosion = {
        version:GALACTIC_EXPLOSION.version,
        enabledAtEntry:s.galacticExplosionEnabled===true,
        lockScope:s.galacticExplosionEnabled===true?GALACTIC_EXPLOSION.enabledLockScope:GALACTIC_EXPLOSION.disabledLockScope,
      };
      frozenEntryConfig.athenaFire=structuredClone(athenaFireCommand);
      const frozenEconomicTargetNet=Number(athenaFireCommand?.economicTarget?.netPerOriginalContractCents??s.infinityBreakMinNetPerOriginalContractCents??INFINITY_BREAK.defaultMinimumNetPerOriginalContractCents);
      frozenEntryConfig.economicTarget=structuredClone(athenaFireCommand?.economicTarget||{version:'ATHENA-A3-ECONOMIC-TARGET-V1',netPerOriginalContractCents:frozenEconomicTargetNet});
      frozenEntryConfig.infinityBreak={
        version:INFINITY_BREAK.version,policyRevision:INFINITY_BREAK.policyRevision,enabledAtEntry:true,
        minimumNetPerOriginalContractCents:frozenEconomicTargetNet,
        requiredFreshConfirmations:Math.max(1,Math.floor(Number(s.infinityBreakRequiredConfirmations??INFINITY_BREAK.defaultRequiredFreshConfirmations))),
        maximumBookAgeMs:Math.max(100,Math.floor(Number(s.infinityBreakMaximumBookAgeMs??INFINITY_BREAK.defaultMaximumBookAgeMs))),
        confirmationWindowMs:Math.max(250,Math.floor(Number(s.infinityBreakConfirmationWindowMs??INFINITY_BREAK.defaultConfirmationWindowMs))),
        fullPositionOnly:true,lossAuthority:'U-SG1',
      };
      frozenEntryConfig.auroraDamageControlPercent=Number(s.auroraDamageControlPercent??45);


      const makeEntry = ({status='open',entryPriceCents=plannedEntry,count=plannedCount,entryFeeCents=preflightEntryFeeCents,entryOrderId=null,entryClientOrderId=null,aurora=null,entryConfig=frozenEntryConfig}={}) => ({
        id, systemName:s.systemName, ownerId:s.ownerId, conceptName:concept,
        sourceFeeder, sourceTradeId, ticker:q.ticker, eventTicker:q.eventTicker || q.ticker,
        marketTitle:executionQuote.title || q.title || q.ticker, watchdogModel:WATCHDOG_MODEL, mode:s.mode, status,
        entryPriceCents, exitPriceCents:null, currentPriceCents:entryPriceCents, peakPriceCents:entryPriceCents,
        stopPriceCents:aurora?.dangerPriceCents ?? 0, stopLossCents:aurora?.stopDistanceCents ?? 0,
        count, remainingCount:count, volume24h:executionQuote.volume24h || q.volume24h || 0,
        spreadAtEntryCents:Number(executionQuote.yesAsk)-Number(executionQuote.yesBid), pnlCents:0,
        entryFeeCents, exitFeeCents:0, exitFilledCount:0, exitNotionalCents:0,
        entryOrderId, entryClientOrderId,
        gameStartTimeMs:Number(q.gameStartTimeMs)||null, openedAtMs:now, updatedAtMs:Date.now(),
        lowestPriceAfterEntryCents:null, maeCents:0, maeAtMs:null,
        recoveryToEntryAtMs:null, recoveryToGreenAtMs:null, recoveryGreenPriceCents:null,
        researchTrackingComplete:false, entryConfig,
      });

      if(s.mode==='SIMULATION'){
        const count=plannedCount;
        const entry=plannedEntry;
        const entryFeeCents=simFeePerContract*count;
        const aurora=calculateAuroraSnapshotFromFeeModel({entryPriceCents:entry,count,entryFeeCents,mode:'SIMULATION',simFeeCents:simFeePerContract,damageControlPercent:Number(s.auroraDamageControlPercent??45),calculatedAtMs:now});
        if(!aurora.ok){
          trace('AURORA','BLOCKED',aurora.reason || 'aurora_exact_failed');
          await this.audit('aurora_simulation_exact_blocked',{concept,ticker:q.ticker,reason:aurora.reason,entryPriceCents:entry,count});
          return null;
        }
        const config={...frozenEntryConfig,aurora};
        const e=makeEntry({status:'open',entryPriceCents:entry,count,entryFeeCents,aurora,entryConfig:config});
        await this.db.insertEntry(e);
        try{this.onHunterOpened?.(e);}catch{}
        trace('PERSISTENCE','PASS','simulation_open_persisted',{hunterId:e.id,status:e.status});
        trace('OPENED','PASS',e.status,{hunterId:e.id,entryPriceCents:e.entryPriceCents,count:e.count,auroraDangerPriceCents:aurora.dangerPriceCents});
        return e;
      }

      // R45 LIVE entry durability: persist the exact owned entry intent before
      // any broker BUY can occur. A crash/network ambiguity after submission is
      // therefore recoverable by entryClientOrderId instead of becoming an
      // unowned broker position.
      if(!this.getLiveReady()){trace('EXECUTION','BLOCKED','live_not_ready');return null;}
      const entryClientOrderId=this.kalshi.buildClientOrderId(s.ownerId,id,'entry');
      const pendingConfig={...frozenEntryConfig,auroraPending:{version:AURORA_EXECUTION.version,preflight:auroraPreflight,exactFillRequired:true}};
      let e=makeEntry({status:'entry_pending',entryPriceCents:plannedEntry,count:plannedCount,entryFeeCents:0,entryClientOrderId,entryConfig:pendingConfig});
      await this.db.insertEntry(e);
      trace('PERSISTENCE','PASS','live_entry_intent_persisted',{hunterId:e.id,status:e.status,entryClientOrderId});
      // The durable entry_pending row is now the shared ledger truth. Release
      // the short commit lock BEFORE waiting for the broker-mutation lock so a
      // LIVE entry never nests two session advisory locks from the bounded lock
      // pool. Same-Attack/event/capital checks remain protected by the durable
      // row while broker mutation is serialized separately by exact ticker.
      await releaseEntryCommitLock();

      // Serialize all LIVE broker mutations on the exact ticker, regardless of
      // Galactic Explosion attack identity. This is separate from the exposure
      // lock: different Attacks may coexist, but a BUY and SELL on the same
      // aggregate broker position must never race across processes.
      let brokerMutationUnlock=null;
      if(typeof this.db.acquireHunterTickerLock==='function'){
        brokerMutationUnlock=await this.db.acquireHunterTickerLock(s.systemName,`broker:${q.ticker}`);
        if(!brokerMutationUnlock){
          const patch={status:'rejected',remainingCount:0,closeReason:'broker_mutation_lock_busy',updatedAtMs:Date.now()};
          await this.db.updateEntry(id,patch);e={...e,...patch};
          await this.audit('live_broker_mutation_ticker_db_lock_busy',{id,ticker:q.ticker,concept,operation:'entry'},'warning');
          trace('EXECUTION','BLOCKED','ticker_broker_mutation_lock_busy',{hunterId:id});
          return null;
        }
      }
      let result;
      try{
        result=await this.kalshi.placeOrder({ticker:q.ticker,action:'buy',count:plannedCount,priceCents:q.yesAsk,clientOrderId:entryClientOrderId});
      }catch(error){
        await this.audit('live_entry_submit_exception_pending_reconciliation',{id,ticker:q.ticker,concept,clientOrderId:entryClientOrderId,message:String(error?.message||error)},'warning');
        trace('EXECUTION','PASS','live_submit_exception_pending_reconciliation',{hunterId:id});
        return e;
      }finally{
        if(brokerMutationUnlock){
          try{await brokerMutationUnlock();}catch(error){await this.audit('live_broker_mutation_ticker_db_unlock_failed',{id,ticker:q.ticker,concept,operation:'entry',message:String(error?.message||error)},'error');}
        }
      }
      const entryOrderId=result?.orderId||null;
      if(Number(result?.fillCount)>0){
        const count=Number(result.fillCount);
        const entry=Math.round(Number(result.averageFillPriceCents ?? q.yesAsk));
        const entryFeeCents=Number.isFinite(Number(result.feePaidCents))?Number(result.feePaidCents):Number(auroraPreflight.entryFeeCents||0);
        let aurora=calculateAuroraSnapshotFromFeeModel({entryPriceCents:entry,count,entryFeeCents,mode:'LIVE',simFeeCents:simFeePerContract,damageControlPercent:Number(s.auroraDamageControlPercent??45),calculatedAtMs:Date.now()});
        if(!aurora.ok){
          // The BUY is already durably owned. If the actual fill/fee economics
          // cannot produce any Aurora line inside the 45% covenant, do not
          // fabricate a stop snapshot. Persist the fault and immediately create
          // a durable full-position flattening obligation. U-SG1/protection
          // then retries safe execution until the owned quantity is closed.
          const config={...frozenEntryConfig,auroraFault:{version:AURORA_EXECUTION.version,policyRevision:AURORA_EXECUTION.policyRevision,reason:aurora.reason||'exact_fill_fee_overrun',unprotectable:true,detectedAtMs:Date.now()}};
          const patch={status:'exit_pending',entryPriceCents:entry,currentPriceCents:entry,peakPriceCents:entry,stopPriceCents:Math.max(0,entry-1),stopLossCents:1,count,remainingCount:count,entryFeeCents,entryOrderId,entryClientOrderId,entryConfig:config,closeReason:'aurora_covenant_fault',updatedAtMs:Date.now()};
          await this.db.updateEntry(id,patch);
          e={...e,...patch};
          try{this.onHunterOpened?.(e);}catch{}
          await this.audit('aurora_live_exact_fee_covenant_unprotectable',{id,ticker:q.ticker,concept,reason:aurora.reason,entryPriceCents:entry,count,entryFeeCents},'error');
          trace('AURORA','BLOCKED','live_exact_fee_covenant_unprotectable',{hunterId:id});
          return e;
        }
        const config={...frozenEntryConfig,aurora};
        const patch={status:'open',entryPriceCents:entry,currentPriceCents:entry,peakPriceCents:entry,stopPriceCents:aurora.dangerPriceCents,stopLossCents:aurora.stopDistanceCents,count,remainingCount:count,entryFeeCents,entryOrderId,entryClientOrderId,entryConfig:config,updatedAtMs:Date.now()};
        await this.db.updateEntry(id,patch);
        e={...e,...patch};
        try{this.onHunterOpened?.(e);}catch{}
        trace('EXECUTION','PASS','live_fill',{orderId:entryOrderId,count});
        trace('OPENED','PASS','open',{hunterId:e.id,entryPriceCents:entry,count,auroraDangerPriceCents:aurora.dangerPriceCents});
        return e;
      }
      if(result?.ambiguous){
        const patch={entryOrderId,status:'entry_pending',updatedAtMs:Date.now()};
        await this.db.updateEntry(id,patch);e={...e,...patch};
        trace('EXECUTION','PASS','live_ambiguous_pending',{orderId:entryOrderId,hunterId:id});
        return e;
      }
      await this.db.updateEntry(id,{status:'rejected',remainingCount:0,entryOrderId,closeReason:'entry_ioc_unfilled',updatedAtMs:Date.now()});
      trace('EXECUTION','BLOCKED','live_ioc_unfilled',{orderId:entryOrderId});
      await this.audit('live_entry_ioc_unfilled',{id,concept,ticker:q.ticker,orderId:entryOrderId,count:plannedCount,limitCents:q.yesAsk});
      return null;
    } finally {
      try {
        await releaseEntryCommitLock();
      } catch (e) {
        await this.audit('hunter_entry_commit_db_unlock_failed', { concept, ticker: exactTicker, message: String(e?.message || e) });
      }
      this.hunterTickerLocks.delete(tickerLockKey);
    }
  }

  async executeAthenaFire(q, bolt, decision, context = {}) {
    const s = this.getSettings();
    const command = decision?.fireCommand;
    if (decision?.decision !== 'FIRE' || !command) return null;
    const concept = String(command.selectedAttack || '');
    const pre = validateAthenaFireCommand(command,{concept,q,settings:s,now:Date.now()});
    if (!pre.ok) {
      await this.audit('athena_fire_execution_aborted',{boltId:bolt?.id||command.boltId||null,ticker:q?.ticker||null,concept,reason:pre.reason,stage:'pre_execution'});
      return null;
    }
    const cosmos = Array.isArray(context.cosmos) ? context.cosmos : [];
    const source = cosmos.slice().sort((a,b)=>Number(b?.openedAtMs||0)-Number(a?.openedAtMs||0))[0] || null;
    let sourceFeeder = source?.conceptName || null;
    let recoverySourceSnapshot = null;
    let sourceTradeId = source?.id || null;
    let athenaExclamationCandidate = null;
    if (concept === 'Recovery Hunter') {
      const r = context.recoverySource || null;
      if (!r?.id) {
        await this.audit('athena_fire_execution_aborted',{boltId:bolt?.id||null,ticker:q?.ticker||null,concept,reason:'crystal_wall_recovery_source_missing',stage:'structural_eligibility'});
        return null;
      }
      sourceTradeId = r.id;
      const rc = context.recoveryContext || command?.decisionEvidence?.recoveryContext || {};
      recoverySourceSnapshot = {
        sourceTradeId:r.id,sourceConcept:r.conceptName||null,sourceEntryPriceCents:Number(r.entryPriceCents||0),sourceExitPriceCents:Number(r.exitPriceCents||0),
        sourceDropCents:Math.max(0,Number(r.entryPriceCents||0)-Number(r.exitPriceCents||0)),sourceClosedAtMs:Number(r.closedAtMs||0),
        troughCents:Number(rc.troughCents||r.exitPriceCents||0),reboundCents:Number(rc.reboundCents||0),observationId:rc.observationId||null,
        structuralEligibility:true,athenaSelected:true,
      };
    }
    if (concept === 'Athena Exclamation') {
      const frozenField=context.fieldContext||command?.decisionEvidence?.fieldContext||null;
      const candidate=frozenField?.athenaExclamationCandidate||null,saintCount=Number(candidate?.saintCount||0);
      if(!candidate?.id||String(candidate.ticker||'')!==String(q?.ticker||'')||!(saintCount>=ATHENA_EXCLAMATION.minimumSaints)||Number(candidate.expiresAtMs||0)<=Date.now()){
        await this.audit('athena_fire_execution_aborted',{boltId:bolt?.id||null,ticker:q?.ticker||null,concept,reason:'three_saints_candidate_missing_or_expired',stage:'structural_eligibility',saintCount,eventId:candidate?.id||null});
        return null;
      }
      // R59/AE1-HF1: the candidate is durable strategic context, not merely an
      // in-memory field hint. Re-read the authoritative event immediately before
      // execution so another Railway process cannot consume the same Big Bang
      // and leave this process holding a stale local candidate.
      if(typeof this.db?.activeAthenaExclamationEvent==='function'){
        let durableCandidate=null;
        try{durableCandidate=await this.db.activeAthenaExclamationEvent(s.systemName,String(q.ticker),Date.now());}
        catch(error){await this.audit('athena_fire_execution_aborted',{boltId:bolt?.id||null,ticker:q?.ticker||null,concept,reason:'athena_exclamation_durable_candidate_unavailable',stage:'structural_eligibility',eventId:candidate.id,message:String(error?.message||error)});return null;}
        if(!durableCandidate||String(durableCandidate.id)!==String(candidate.id)){
          await this.audit('athena_fire_execution_aborted',{boltId:bolt?.id||null,ticker:q?.ticker||null,concept,reason:'athena_exclamation_candidate_consumed_or_replaced',stage:'structural_eligibility',eventId:candidate.id,durableEventId:durableCandidate?.id||null});
          return null;
        }
      }
      athenaExclamationCandidate=structuredClone(candidate);
      sourceFeeder=null;
      sourceTradeId=String(candidate.id);
    }
    const entryQualificationSnapshot = {
      version:'ATHENA-A3-FIRE-Q1',boltId:bolt?.id||command.boltId,commandHash:command.commandHash,selectedAttack:concept,
      operatorBand:{minEntryCents:Number(command.operatorMinEntryCents),maxEntryCents:Number(command.operatorMaxEntryCents)},
      authorizedMaxEntryCents:Number(command.authorizedMaxEntryCents),observedFeatures:structuredClone(command?.decisionEvidence?.features||{}),
      preBoltClearance:structuredClone(command?.decisionEvidence?.preBoltClearance||bolt?.preBoltClearance||null),
      fieldContext:structuredClone(context.fieldContext||command?.decisionEvidence?.fieldContext||null),
      athenaExclamationCandidate:structuredClone(athenaExclamationCandidate),
      arayashiki:structuredClone(command?.survivalCertificate||null),
      scarletNeedle:concept==='Scarlet Needle'?structuredClone(command?.decisionEvidence?.scarletNeedle||null):null,observedAtMs:Date.now(),
    };
    const e = await this.createHunter(concept,q,Number(command.stakeCents),0,{
      sourceFeeder,sourceTradeId,sourceEntryConfig:sourceFeeder?source?.entryConfig||null:null,recoverySourceSnapshot,
      crashSourceSnapshot:context.crashSignal?structuredClone(context.crashSignal):null,entryQualificationSnapshot,athenaFireCommand:command,legacyCompatibility:false,
    });
    if(e&&concept==='Athena Exclamation'&&athenaExclamationCandidate?.id&&typeof this.athenaExclamation?.markDecision==='function'){
      const marked=await this.athenaExclamation.markDecision(String(athenaExclamationCandidate.id),{status:'EXECUTED',entryId:e.id,review:{reason:'athena_fire_executed',boltId:bolt?.id||command.boltId,commandHash:command.commandHash}}).catch(()=>null);
      if(marked?.persistenceOk===false)await this.audit('athena_exclamation_execution_consumption_persistence_failed',{id:athenaExclamationCandidate.id,entryId:e.id,ticker:e.ticker}).catch(()=>{});
    }
    if (e && typeof this.db?.upsertOpportunityEpisode === 'function') {
      await this.db.upsertOpportunityEpisode({id:bolt?.id||command.boltId,systemName:s.systemName,sourceRelease:RELEASE,cohortId:String(s.resetTimestampMs||''),ticker:e.ticker,eventTicker:e.eventTicker,side:'YES',sport:bolt?.sport||bolt?.features?.sport||'Unknown',boltAtMs:Number(bolt?.detectedAtMs||command.decidedAtMs),boltSnapshot:bolt||{},athenaDecision:decision,fireCommand:command,attackSelected:concept,entryId:e.id,entryAtMs:Number(e.openedAtMs||Date.now()),updatedAtMs:Date.now()}).catch(()=>{});
    }
    return e;
  }

  async materializePhoenixSignal(q, qualification, now=Date.now()) {
    const s=this.getSettings(),ticker=String(q?.ticker||qualification?.ticker||'');
    if(!ticker||!isModelEnabled(s,'Phoenix'))return null;
    const localKey=`Phoenix|${ticker}`;
    if(this.phoenixSignalLocks.has(localKey))return null;
    this.phoenixSignalLocks.add(localKey);
    let unlock=null;
    try{
      const current=this.market?.getQuote?.(ticker)||q;
      const at=Number.isFinite(Number(now))?Number(now):Date.now();
      const valid=revalidatePhoenixQualification(qualification,current,s,at);
      if(!valid.ok){await this.audit('phoenix_materialization_blocked',{ticker,reason:valid.reason,signalId:qualification?.signalId||null});return null;}
      if(typeof this.db?.acquireCosmoSignalLock==='function'){
        unlock=await this.db.acquireCosmoSignalLock(s.systemName,'Phoenix',ticker);
        if(!unlock){await this.audit('phoenix_materialization_lock_busy',{ticker,signalId:qualification?.signalId||null});return null;}
      }
      const open=typeof this.db?.openEntriesByTicker==='function'?await this.db.openEntriesByTicker(s.systemName,ticker):[];
      for(const e of open||[]){
        if(e.conceptName!=='Phoenix')continue;
        if(phoenixSignalActive(e,s,at))return null;
        await this.db.updateEntry?.(e.id,{status:'closed',closeReason:'phoenix_signal_expired',closedAtMs:at,updatedAtMs:at});
      }
      const source={...structuredClone(qualification),materializedAtMs:at,expiresAtMs:Number(qualification.expiresAtMs||at+PHOENIX_COSMO.signalTtlMs)};
      const entry=await this.createGhost('Phoenix',current,Number(source.signalAskCents),Number(current?.gameStartTimeMs)||null,{
        sourceTradeId:String(source.signalId),currentPriceCents:Number(current?.yesBid||source.signalBidCents),peakPriceCents:Number(current?.yesBid||source.signalBidCents),entryConfigExtra:{phoenixSource:source},feederState:{phase:'PHOENIX',expiresAtMs:source.expiresAtMs},
      });
      if(entry)await this.audit('phoenix_cosmo_qualified',{id:entry.id,ticker,eventTicker:entry.eventTicker,signalId:source.signalId,originBidCents:source.originBidCents,originAskCents:source.originAskCents,signalBidCents:source.signalBidCents,signalAskCents:source.signalAskCents,riseBidCents:source.riseBidCents,upTicks:source.upTicks,confirmationCount:source.confirmationCount,observationDurationMs:source.observationDurationMs,expiresAtMs:source.expiresAtMs});
      return entry;
    }finally{
      if(unlock)try{await unlock();}catch(error){await this.audit('phoenix_cosmo_unlock_failed',{ticker,message:String(error?.message||error)}).catch(()=>{});}
      this.phoenixSignalLocks.delete(localKey);
    }
  }

  async expirePhoenixSignals(now=Date.now()) {
    const s=this.getSettings();
    if(typeof this.db?.expirePhoenixSignals!=='function')return[];
    const forceAll=!isModelEnabled(s,'Phoenix');
    const task=()=>this.db.expirePhoenixSignals(s.systemName,Number(now),{forceAll});
    const expired=typeof this.db?.runLowPriorityPersistence==='function'?await this.db.runLowPriorityPersistence(task):await task();
    if(expired?.length)await this.audit('phoenix_cosmo_expired',{count:expired.length,tickers:expired.slice(0,32).map(x=>x.ticker),forceAll});
    return expired||[];
  }

  async evaluateFeeders(markets, trackerMap) {
    const s = this.getSettings();
    const cutoff = Date.now() - (s.eventCooldownMinutes ?? 5) * 60000;
    const all = typeof this.db?.feederEvaluationContext==='function'?await this.db.feederEvaluationContext(s.systemName,{sinceMs:cutoff}):await this.db.entries(s.systemName,{limit:5000});
    const open = all.filter((e) => openLike(e.status));
    // EMI1: active Cosmo feeders are reference-only observers. Hunter capacity
    // must never suppress feeder learning or signal materialization. Real
    // Hunters continue to enforce maxPositions independently through slotsLeft.
    const recentTickers = new Set(all.filter((e) => e.status !== 'rejected' && e.openedAtMs >= cutoff).map((e) => e.ticker));
    const openTickers = new Set(open.map((e) => e.ticker));
    const recentKeys = new Set(all
      .filter((e) => e.status !== 'rejected' && e.openedAtMs >= cutoff)
      .map((e) => `${e.conceptName}|${e.ticker}`));
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
        const key = `${f.name}|${q.ticker}`;
        // Galactic Explosion opens the exact market to independently qualified
        // Execution Attacks. Reference-only Cosmo signals must therefore remain
        // observable even when another Attack or the other feeder already owns
        // a row on the ticker. The same feeder still cannot duplicate itself.
        if (s.galacticExplosionEnabled === true) {
          if (openKeys.has(key) || recentKeys.has(key)) continue;
        } else if (openTickers.has(q.ticker) || recentTickers.has(q.ticker)) {
          break;
        }
        if (q.yesAsk - q.yesBid > (s.maxSpreadCents ?? 3)) break;
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
        recentKeys.add(key);
        openTickers.add(q.ticker);
        recentTickers.add(q.ticker);
        lastByConceptEvent.set(`${f.name}|${q.eventTicker || q.ticker}`, Date.now());
        break;
      }
    }
    return created;
  }

  async evaluateDragon(marketMap, { onlyTicker = null } = {}) {
    const s = this.getSettings();
    if (!isModelEnabled(s, 'Dragon')) return [];
    const existingEpisodes = new Set(typeof this.db?.sourceTradeIdsByConcept==='function'
      ? await this.db.sourceTradeIdsByConcept(s.systemName,'Dragon')
      : (await this.db.entries(s.systemName,{limit:5000})).filter((e)=>e.conceptName==='Dragon'&&e.sourceTradeId).map((e)=>String(e.sourceTradeId)));
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


  // R45 retired-model invariant: there are no StrategyEngine evaluation
  // methods for Golden Dragon, Golden Dragon Hunter, or Dragon Recovery Hunter.

  async evaluateMomentumAndWave(marketMap,{legacyCompatibility=false}={}) {
    if (legacyCompatibility !== true) return [];
    const s = this.getSettings();
    const entries = await this.db.entries(s.systemName, { limit: 5000 });
    const open = entries.filter((e) => openLike(e.status));
    let capacity = slotsLeft(open, s);
    // Turning a feeder OFF is immediate for new downstream entries: existing
    // ghost records remain visible/reference-only, but they cannot feed a new
    // Hunter until that feeder model is enabled again.
    const feeders = activeCosmoSources(open, s);
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
      const momentumQualification={
        version:'MOMENTUM-Q1', feederId:feeder.id, feederConcept:feeder.conceptName,
        feederEntryPriceCents:Number(feeder.entryPriceCents), sourceOpenedAtMs:Number(feeder.openedAtMs||0),
        sourceSignalPriceCents:cosmoSourceSignalPriceCents(feeder),
        feederPeakPriceCents:Number(feeder.peakPriceCents || feeder.entryPriceCents),
        candidatePullbackCents:Number(pull), observedAtMs:Date.now(),
      };
      const ae=await this.observeGoldSaintQualification('Momentum Hunter',q,{sourceFeeder:feeder.conceptName,sourceTradeId:feeder.id,qualificationSnapshot:momentumQualification,legacyCompatibility:true});
      if(ae.entry){created.push(ae.entry);capacity=Math.max(0,capacity-1);continue;}
      if(capacity<=0)continue;
      const e = await this.createHunter('Momentum Hunter', q, stake, 0, {
        sourceFeeder: feeder.conceptName,
        sourceTradeId: feeder.id,
        sourceEntryConfig: feeder.entryConfig || null,
        entryQualificationSnapshot: momentumQualification,
        legacyCompatibility:true,
      });
      if (e) { created.push(e); capacity -= 1; }
    }

    if (!isModelEnabled(s, 'Wave Surfer')) return created;
    const after = [...entries, ...created];
    const waves = after.filter((e) => e.conceptName === 'Wave Surfer');
    for (const feeder of feeders) {
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
      const waveQualification={
        version:'WAVE-Q1', feederId:feeder.id, feederConcept:feeder.conceptName,
        feederEntryPriceCents:Number(feeder.entryPriceCents), sourceOpenedAtMs:Number(feeder.openedAtMs||0),
        sourceSignalPriceCents:cosmoSourceSignalPriceCents(feeder),
        candidateFavorableMoveCents:Number(favorableMoveCents), observedAtMs:Date.now(),
      };
      const ae=await this.observeGoldSaintQualification('Wave Surfer',q,{sourceFeeder:feeder.conceptName,sourceTradeId:feeder.id,qualificationSnapshot:waveQualification,legacyCompatibility:true});
      if(ae.entry){created.push(ae.entry);capacity=Math.max(0,capacity-1);continue;}
      if(capacity<=0)continue;
      const e = await this.createHunter('Wave Surfer', q, Number(s.waveStakeCents ?? 20000), 0, {
        sourceFeeder: feeder.conceptName,
        sourceTradeId: feeder.id,
        sourceEntryConfig: feeder.entryConfig || null,
        entryQualificationSnapshot: waveQualification,
        legacyCompatibility:true,
      });
      if (e) { created.push(e); capacity -= 1; }
    }
    return created;
  }

  async lightningPlasmaCandidateTickers(now = Date.now()) {
    const s=this.getSettings();
    if (!isModelEnabled(s,'Lightning Plasma')) return [];
    const entries=await this.db.entries(s.systemName,{limit:5000});
    const windowMs=Math.max(1000,Number(s.lightningPlasmaFieldWindowSeconds ?? LIGHTNING_PLASMA.fieldWindowMs/1000)*1000);
    const sources=activeCosmoSources(entries,s).filter((e)=>{
      const observed=lightningPlasmaSourceObservedAtMs(e);
      return observed>0&&Number(now)-observed<=windowMs;
    });
    const events=new Set(sources.map((e)=>String(e.eventTicker||e.ticker||'')).filter(Boolean));
    const minCosmos=Math.max(2,Math.floor(Number(s.lightningPlasmaMinCosmos ?? LIGHTNING_PLASMA.minCosmos)));
    if (sources.length < minCosmos || events.size < minCosmos) return [];
    return [...new Set(sources.map((e)=>e.ticker).filter(Boolean))];
  }

  async evaluateLightningPlasma(marketMap, { now = Date.now(), legacyCompatibility=false } = {}) {
    if (legacyCompatibility !== true) return [];
    const s=this.getSettings();
    if (!isModelEnabled(s,'Lightning Plasma')) return [];
    const entries=await this.db.entries(s.systemName,{limit:5000});
    const open=entries.filter((e)=>openLike(e.status));
    let capacity=slotsLeft(open,s);
    const minStrikes=Math.max(2,Math.floor(Number(s.lightningPlasmaMinStrikes ?? LIGHTNING_PLASMA.minStrikes)));
    this.lightningPlasmaTelemetry.fieldsObserved+=1;
    const field=lightningPlasmaFieldSelection(open,marketMap,s,now);
    if (!field.qualifies) return [];

    const cooldownMs=Math.max(0,Number(s.lightningPlasmaFieldCooldownSeconds ?? LIGHTNING_PLASMA.fieldCooldownMs/1000)*1000);
    const latestPlasma=entries.filter((e)=>e.conceptName==='Lightning Plasma'&&e.status!=='rejected')
      .reduce((m,e)=>Math.max(m,Number(e.openedAtMs||0)),0);
    if (cooldownMs>0&&latestPlasma>0&&Number(now)-latestPlasma<cooldownMs){
      this.lightningPlasmaTelemetry.fieldsCooldownBlocked+=1;
      await this.audit('lightning_plasma_field_cooldown',{fieldId:field.fieldId,latestPlasmaAtMs:latestPlasma,cooldownMs});
      return [];
    }

    const usedSourceIds=new Set(entries.filter((e)=>e.conceptName==='Lightning Plasma'&&e.sourceTradeId).map((e)=>String(e.sourceTradeId)));
    // Gold-Saint observation is independent of current portfolio capacity. A
    // fully qualified LP field can contribute a Saint vote even when ordinary
    // strike capacity is exhausted; Athena Exclamation itself still obeys the
    // shared max-position/capital gates before exposure.
    const selectedForVotes=field.candidates.filter((x)=>!usedSourceIds.has(String(x.source.id||''))).slice(0,field.maxStrikes);
    if (selectedForVotes.length<minStrikes) return [];
    const fieldStake=Math.max(1,Math.floor(Number(s.lightningPlasmaFieldStakeCents ?? LIGHTNING_PLASMA.fieldStakeCents)));
    const voteStrikeStake=Math.max(1,Math.floor(fieldStake/selectedForVotes.length));
    const ordinarySelected=capacity>=minStrikes?selectedForVotes.slice(0,Math.min(field.maxStrikes,capacity)):[];
    const strikeStake=ordinarySelected.length?Math.floor(fieldStake/ordinarySelected.length):0;
    const windowMs=Math.max(1000,Number(s.lightningPlasmaFieldWindowSeconds ?? LIGHTNING_PLASMA.fieldWindowMs/1000)*1000);
    const fieldExpiresAtMs=Math.min(...selectedForVotes.map((x)=>lightningPlasmaSourceObservedAtMs(x.source)+windowMs));
    if (!(fieldExpiresAtMs > Number(now))) return [];
    this.lightningPlasmaTelemetry.fieldsQualified+=1;
    this.lightningPlasmaTelemetry.lastFieldId=field.fieldId;
    this.lightningPlasmaTelemetry.lastFieldAtMs=Number(now);
    await this.audit('lightning_plasma_field_qualified',{
      fieldId:field.fieldId,sourceCount:field.sourceCount,independentEventCount:field.independentEventCount,
      selectedStrikes:selectedForVotes.length,ordinaryExecutableStrikes:ordinarySelected.length,fieldStakeCents:fieldStake,strikeStakeCents:strikeStake||null,
      sourceCosmos:selectedForVotes.map((x)=>({id:x.source.id,concept:x.source.conceptName,ticker:x.source.ticker,eventTicker:x.eventTicker,score:x.qualification.score})),
    });
    const created=[];
    for(let i=0;i<selectedForVotes.length;i+=1){
      const x=selectedForVotes[i];
      const observedAtMs=lightningPlasmaSourceObservedAtMs(x.source);
      const anchorCents=lightningPlasmaSourceAnchorCents(x.source);
      const qualification={
        version:'LP1-Q1',policyRevision:LIGHTNING_PLASMA.policyRevision,fieldId:field.fieldId,
        fieldObservedAtMs:Number(now),fieldExpiresAtMs,fieldSourceCount:field.sourceCount,
        fieldIndependentEventCount:field.independentEventCount,fieldStrikeCount:selectedForVotes.length,strikeIndex:i+1,
        fieldStakeCents:fieldStake,strikeStakeCents:ordinarySelected.includes(x)?strikeStake:voteStrikeStake,sourceId:x.source.id,sourceConcept:x.source.conceptName,
        sourceObservedAtMs:observedAtMs,sourceAnchorCents:anchorCents,sourceReferenceCents:Number(x.source.entryPriceCents||0),
        sourceSignalPriceCents:cosmoSourceSignalPriceCents(x.source)||anchorCents,sourceScore:Number(x.qualification.score),
        sourceBidCents:Number(x.quote.yesBid||0),sourceAskCents:Number(x.quote.yesAsk||0),
        sourceContinuationCents:Number(x.qualification.continuationCents||0),sourceFadeCents:Number(x.qualification.fadeCents||0),
        sourceChaseCents:Number(x.qualification.chaseCents||0),oneStrikePerEvent:true,
      };
      const ae=await this.observeGoldSaintQualification('Lightning Plasma',x.quote,{sourceFeeder:x.source.conceptName,sourceTradeId:x.source.id,qualificationSnapshot:qualification,legacyCompatibility:true});
      if(ae.entry){created.push(ae.entry);capacity=Math.max(0,capacity-1);continue;}
      if(!ordinarySelected.includes(x)||capacity<=0)continue;
      this.lightningPlasmaTelemetry.strikeAttempts+=1;
      const e=await this.createHunter('Lightning Plasma',x.quote,strikeStake,0,{
        sourceFeeder:x.source.conceptName,
        sourceTradeId:x.source.id,
        sourceEntryConfig:x.source.entryConfig||null,
        entryQualificationSnapshot:qualification,legacyCompatibility:true,
      });
      if(e){created.push(e);capacity=Math.max(0,capacity-1);this.lightningPlasmaTelemetry.strikesOpened+=1;}
    }
    await this.audit('lightning_plasma_field_execution',{
      fieldId:field.fieldId,attempted:ordinarySelected.length,opened:created.filter((e)=>e.conceptName==='Lightning Plasma').length,
      openedIds:created.map((e)=>e.id),openedTickers:created.map((e)=>e.ticker),
    });
    return created;
  }

  async evaluateRecovery(marketMap, { onlyTicker = null, legacyCompatibility=false } = {}) {
    if (legacyCompatibility !== true) return [];
    const s = this.getSettings();
    if (!isModelEnabled(s, 'Recovery Hunter')) { this.pruneRecoveryRuntime(new Set()); return []; }
    const entries = await this.db.entries(s.systemName, { limit: 5000 });
    const allLosses = this.recoverySourcesFromEntries(entries, s);
    this.pruneRecoveryRuntime(new Set(allLosses.map((e)=>String(e.id))));
    const open = entries.filter((e) => openLike(e.status));
    let capacity = slotsLeft(open, s);
    const losses = allLosses
      .filter((e) => !onlyTicker || e.ticker === onlyTicker)
      .sort((a, b) => Number(a.closedAtMs || 0) - Number(b.closedAtMs || 0));
    if (!losses.length) return [];
    const observations = await this.recoveryObservationsBySource();
    const created = [];

    for (const loss of losses) {
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
      const recoveryQualification={version:'RECOVERY-Q1',sourceTradeId:loss.id,troughCents:signal.troughCents,reboundCents:signal.reboundCents,requiredReboundCents:signal.minReboundCents,sourceEntryPriceCents:Number(loss.entryPriceCents||0),sourceExitPriceCents:Number(loss.exitPriceCents||0),observedAtMs:Date.now()};
      const ae=await this.observeGoldSaintQualification('Recovery Hunter',q,{sourceTradeId:loss.id,qualificationSnapshot:recoveryQualification,legacyCompatibility:true});
      if(ae.entry){created.push(ae.entry);capacity=Math.max(0,capacity-1);this.recoveryAuditStates.set(String(loss.id),'athena_exclamation');continue;}
      if(capacity<=0){await this.noteRecoveryCandidate(loss,{...signal,reason:'portfolio_capacity_blocked_after_saint_vote',targetStakeCents,actualStakeCents:targetStakeCents,availableCashCents});continue;}
      const e = await this.createHunter('Recovery Hunter', q, targetStakeCents, 0, {
        sourceTradeId:loss.id,
        recoverySourceSnapshot,legacyCompatibility:true,
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

  async evaluateCrashRecovery(marketMap, { onlyTicker = null, legacyCompatibility=false } = {}) {
    if (legacyCompatibility !== true) return [];
    const s = this.getSettings();
    if (!isModelEnabled(s, 'Crash Recovery Hunter')) return [];
    const entries = await this.db.entries(s.systemName, { limit:5000 });
    const open = entries.filter((e) => openLike(e.status));
    let capacity = slotsLeft(open, s);

    const created = [];
    const tickers = onlyTicker ? [onlyTicker] : [...marketMap.keys()];
    const existingEpisodes = new Set(entries
      .filter((e) => e.conceptName === 'Crash Recovery Hunter')
      .map((e) => String(e.entryConfig?.crashRecoverySource?.episodeId || e.sourceTradeId || ''))
      .filter(Boolean));

    for (const ticker of tickers) {
      const q=marketMap.get(ticker);
      if(!q||typeof this.learning?.crashEntrySignal!=='function') continue;
      const signal=this.learning.crashEntrySignal(ticker);
      const episodeId=String(signal?.episodeId||'');
      if(!signal||!episodeId||existingEpisodes.has(episodeId))continue;

      // HF2: Starlight no longer requires a Dragon approval. Any currently
      // active Cosmo on the exact ticker may nominate the opportunity. The
      // crash episode itself is still independently proven by Starlight below
      // and again at the force-fresh execution boundary in createHunter().
      const cosmoSource=selectCrashRecoveryCosmoSource(open,s,ticker,episodeId);
      if(!cosmoSource)continue;
      const validation=crashSignalQualifiedAtQuote(signal,q,s);
      if(!validation.ok) continue;

      const dragonSource=cosmoSource.conceptName==='Dragon'?(cosmoSource.entryConfig?.dragonSource||{}):{};
      const exactDragonEpisode=cosmoSource.conceptName==='Dragon'&&String(cosmoSource.sourceTradeId||'')===episodeId;
      const crashSourceSnapshot={
        ...crashSourceSnapshotFromSignal(signal,validation),
        huntingGround:'active_cosmo_plus_independent_crash_episode',
        cosmoRouteVersion:COSMO_ROUTING.version,
        cosmoSourceId:cosmoSource.id||null,
        cosmoSourceConcept:cosmoSource.conceptName||null,
        cosmoSourceOpenedAtMs:Number(cosmoSource.openedAtMs||0)||null,
        cosmoSourceTradeId:cosmoSource.sourceTradeId||null,
        dragonSignalId:exactDragonEpisode?(cosmoSource.id||null):null,
        dragonEpisodeId:exactDragonEpisode?episodeId:null,
        dragonSignalAtMs:exactDragonEpisode?(Number(dragonSource.signalAtMs||cosmoSource.openedAtMs||0)||null):null,
        dragonSignalPriceCents:exactDragonEpisode?(Number(dragonSource.signalPriceCents||0)||null):null,
      };
      const crashQualification={version:'CRASH-RECOVERY-Q1',episodeId,cosmoSourceId:cosmoSource.id||null,sourceFeeder:cosmoSource.conceptName,crashDepthCents:Number(signal.crashDepthCents||0),reboundCents:Number(validation.reboundCents||0),reclaimRate:Number(validation.reclaimRate||0),observedAtMs:Date.now()};
      const ae=await this.observeGoldSaintQualification('Crash Recovery Hunter',q,{sourceFeeder:cosmoSource.conceptName,sourceTradeId:episodeId,qualificationSnapshot:crashQualification,legacyCompatibility:true});
      if(ae.entry){created.push(ae.entry);capacity=Math.max(0,capacity-1);existingEpisodes.add(episodeId);continue;}
      if(capacity<=0)continue;
      const e=await this.createHunter('Crash Recovery Hunter',q,Number(s.crashRecoveryStakeCents||20000),0,{
        sourceFeeder:cosmoSource.conceptName,sourceTradeId:episodeId,sourceEntryConfig:cosmoSource.entryConfig||null,crashSourceSnapshot,legacyCompatibility:true,
      });
      if(!e)continue;
      created.push(e);capacity-=1;existingEpisodes.add(episodeId);
      await this.audit('crash_recovery_hunter_created',{
        id:e.id,ticker:e.ticker,eventTicker:e.eventTicker,episodeId,sourceFeeder:cosmoSource.conceptName,
        cosmoRouteVersion:COSMO_ROUTING.version,cosmoSourceId:cosmoSource.id||null,
        dragonSignalId:exactDragonEpisode?(cosmoSource.id||null):null,entryPriceCents:e.entryPriceCents,count:e.count,
        crashDepthCents:signal.crashDepthCents,troughCents:signal.troughCents,reboundCents:validation.reboundCents,reclaimRate:validation.reclaimRate,
      });
    }
    return created;
  }
}
