import { setTimeout as sleep } from 'node:timers/promises';
import { createHash } from 'node:crypto';
import { env, freshInstallSettings, normalizeStartupExecutionMode, deploymentConfigRecord, EDITABLE_NUMERIC_SETTINGS, EDITABLE_BOOLEAN_SETTINGS, RELEASE } from './config.mjs';
import { Database, LOW_PRIORITY_DB_PERSISTENCE } from './db.mjs';
import { KalshiClient } from './kalshi.mjs';
import { MarketHub } from './market.mjs';
import { LearningEngine, classifyDeterministic } from './learning.mjs';
import { Athena, ATHENA_BRAIN, ATHENA_B2, AthenaCommander } from './athena.mjs';
import { StrategyEngine, activeCosmoSources, lightningPlasmaFieldSelection, anotherDimensionQualification, recoverySignalState } from './strategy.mjs';
import { ProfitGuard } from './profitGuard.mjs';
import { GoldenEye } from './goldenEye.mjs';
import { FEEDER_SIGNAL_INTELLIGENCE } from './feederSignalIntel.mjs';
import { PhoenixCosmoEngine } from './phoenix.mjs';
import { PORTFOLIO_CONCEPTS, ACTIVE_PORTFOLIO_CONCEPTS, RETIRED_PORTFOLIO_CONCEPTS, FEEDER_CONCEPTS, ACTIVE_FEEDER_CONCEPTS, RETIRED_FEEDER_CONCEPTS, SHADOW_ATTACK_CONCEPTS, EXECUTION_ATTACK_DISPLAY, GALACTIC_EXPLOSION, COSMO_ROUTING, LIGHTNING_PLASMA, PHOENIX_COSMO, ATHENA_EXCLAMATION, SCARLET_NEEDLE, CRYSTAL_WALL, GEMINI_UNIVERSE, ANOTHER_DIMENSION, SAGITTARIUS_JUSTICE_ARROW, AURORA_EXECUTION, kalshiGeneralTakerFeeEstimateCents, computeLiveStatus, MOMENTUM, RECOVERY, ULTIMATE_STOP_GUARD, STOP_LOSS_WATCHDOG, STOP_GUARD_RECOVERY_LEARNING, ULTIMATE_PROFIT_GUARD, APEX_PROFIT_GUARD, PROTECTED_RUNNER_INTELLIGENCE, PROFIT_LEARNING_INTELLIGENCE, ATHENA_EXIT_INTELLIGENCE, GOLDEN_EYE, ATOMIC_THUNDER, ATOMIC_THUNDER_BOLT, ATOMIC_THUNDER_PATTERN_GUARDIAN, COSMO_SHADOW_TRADING, ATHENA_COMMANDER, ARAYASHIKI, INFINITY_BREAK, POST_EXIT_RESEARCH } from './doctrine.mjs';
import { GameClockAuthority, GAME_CLOCK_AUTHORITY, isConfirmedGameClockState, isEntryAuthorizedGameClockState } from './gameClock.mjs';
import { AtomicThunderBoltEngine, atomicThunderBoltFeatures } from './opportunity.mjs';

const openLike = (s) => ['open', 'entry_pending', 'exit_pending', 'pending_recovery'].includes(s);
const centsNum = (v) => Number.isFinite(Number(v)) ? Number(v) : 0;
const waitUntil = async (ms) => { if (ms > 0) await sleep(ms); };
const FINAL_STATUSES = new Set(['finalized', 'settled']);
const PROTECTION_BACKUP_MS = 1500;
const GOLD_SAINT_ATTACKS = new Set(['Wave Surfer','Crash Recovery Hunter','Recovery Hunter','Momentum Hunter','Lightning Plasma']);
const stableHash=(value)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const rounded=(v,p=4)=>Number.isFinite(Number(v))?Number(Number(v).toFixed(p)):null;
export const ENTRY_CANDIDATE_FUNNEL = Object.freeze({version:'ECF1',maximumCandidates:512,maximumRecent:80});
export const DATABASE_PRESSURE_ISOLATION = Object.freeze({
  version:'DBPI2',
  referenceSignalSweepMs:30_000,
  stateSnapshotTtlMs:1_500,
  stateDbFanoutMaximum:2,
  entryEvaluationConcurrency:2,
  quoteProtectionConcurrency:3,
  ordinaryPoolReservedHeadroom:3,
  lowPriorityPersistenceConcurrency:LOW_PRIORITY_DB_PERSISTENCE.maximumConcurrency,
  lowPriorityPersistenceMaximumPending:LOW_PRIORITY_DB_PERSISTENCE.maximumPending,
  lowPriorityPersistenceScope:LOW_PRIORITY_DB_PERSISTENCE.scope,
  lowPriorityPersistenceMaximumBatchBytes:LOW_PRIORITY_DB_PERSISTENCE.maximumBatchBytes,
  fsiPersistenceRevision:FEEDER_SIGNAL_INTELLIGENCE.persistenceRevision,
  fsiPersistenceBatchSize:FEEDER_SIGNAL_INTELLIGENCE.persistenceBatchSize,
  quoteProtectionScope:'REAL_HUNTERS_ONLY',
});

export const ENTRY_ADMISSION_CONTROL = Object.freeze({
  version:'EAC3',
  unknownProbeIntervalMs:30_000,
  maximumTrackedEvents:2048,
  preBoltExecutionMarginMs:5_000,
  role:'event_level_prequeue_clock_and_immediate_green_execution_admission',
});

const REFERENCE_SIGNAL_SWEEP_MS = DATABASE_PRESSURE_ISOLATION.referenceSignalSweepMs;
const STATE_SNAPSHOT_TTL_MS = DATABASE_PRESSURE_ISOLATION.stateSnapshotTtlMs;
const STATE_DB_FANOUT_MAX = DATABASE_PRESSURE_ISOLATION.stateDbFanoutMaximum;
const ENTRY_EVALUATION_CONCURRENCY = DATABASE_PRESSURE_ISOLATION.entryEvaluationConcurrency;
const QUOTE_PROTECTION_CONCURRENCY = DATABASE_PRESSURE_ISOLATION.quoteProtectionConcurrency;
const PROTECTION_FRESH_MS = 10_000;
const WS_FRESH_MS = 70_000;
const SCANNER_FRESH_MS = 7 * 60_000;
const DISPLAY_QUOTE_FRESH_MS = 15_000;

// R59/RGM4 is an active trade-priority resource governor. It may compact or
// defer only reconstructable diagnostics/research state. It never shrinks the
// live executable market/protection set, delays Aurora/Infinity/reconciliation,
// rejects Athena FIRE, or changes any trading authority based on memory.
export const RUNTIME_RESOURCE_GOVERNOR = Object.freeze({
  version:'RGM4',
  preferredRssCeilingMiB:425,
  warningRssMiB:450,
  criticalRssMiB:500,
  greenBelowMiB:400,
  compactAtMiB:400,
  pressureAtMiB:450,
  tradePriorityAtMiB:475,
  hardResearchShedAtMiB:490,
  hardCeilingMiB:500,
  sampleIntervalMs:5000,
  // R58 diagnostics showed systems already sitting around 425-448 MiB while
  // only in COMPACT. Begin reconstructable-state compaction at that first
  // pressure tier instead of waiting until 450 MiB. Protected/live/crash
  // tickers are never evicted by LearningEngine's pruning contract.
  crashStateLimits:Object.freeze({GREEN:768,COMPACT:512,PRESSURE:384,TRADE_PRIORITY:320,HARD_RESEARCH_SHED:256}),
  fsiObservationLimits:Object.freeze({GREEN:96,COMPACT:64,PRESSURE:64,TRADE_PRIORITY:64,HARD_RESEARCH_SHED:64}),
  tradingAuthority:false,
});

async function mapLimit(items, limit, fn) {
  const rows = Array.from(items || []);
  if (!rows.length) return [];
  const out = new Array(rows.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(Math.floor(Number(limit) || 1), rows.length)) }, async () => {
    while (true) {
      const i = cursor; cursor += 1;
      if (i >= rows.length) return;
      out[i] = await fn(rows[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}


// HF3 bounded coalescing executor. Repeated quote events for the same logical
// work key never create an unbounded chain of promises: while one run is active
// only the latest rerun request is retained. Global concurrency is capped so
// entry evaluation cannot consume every database connection and starve
// protection, reconciliation, diagnostics, or HTTP state requests.
export class CoalescingWorkQueue {
  constructor({ maxConcurrency=4, onError=null }={}) {
    this.maxConcurrency=Math.max(1,Math.floor(Number(maxConcurrency)||1));
    this.onError=typeof onError==='function'?onError:null;
    this.pending=new Map();
    this.active=new Set();
    this.rerun=new Map();
    this.activeCount=0;
    this.totalStarted=0;
    this.totalCoalesced=0;
    this.maxObservedActive=0;
  }
  enqueue(key, task) {
    const k=String(key||'');
    if(!k||typeof task!=='function')return false;
    if(this.active.has(k)){
      this.rerun.set(k,task);
      this.totalCoalesced+=1;
      return true;
    }
    if(this.pending.has(k)){
      this.pending.set(k,task);
      this.totalCoalesced+=1;
      return true;
    }
    this.pending.set(k,task);
    this.pump();
    return true;
  }
  pump() {
    while(this.activeCount<this.maxConcurrency&&this.pending.size){
      const [key,task]=this.pending.entries().next().value;
      this.pending.delete(key);
      this.active.add(key);
      this.activeCount+=1;
      this.totalStarted+=1;
      this.maxObservedActive=Math.max(this.maxObservedActive,this.activeCount);
      void Promise.resolve().then(task).catch(async(error)=>{
        if(this.onError)await this.onError(error,key);
      }).finally(()=>{
        this.active.delete(key);
        this.activeCount=Math.max(0,this.activeCount-1);
        const rerun=this.rerun.get(key);
        if(rerun){this.rerun.delete(key);this.pending.set(key,rerun);}
        this.pump();
      });
    }
  }
  snapshot(){return{maxConcurrency:this.maxConcurrency,active:this.activeCount,pending:this.pending.size,rerun:this.rerun.size,totalStarted:this.totalStarted,totalCoalesced:this.totalCoalesced,maxObservedActive:this.maxObservedActive};}
  isIdle(){return this.activeCount===0&&this.pending.size===0&&this.rerun.size===0;}
}

function brokerPositionCount(p) {
  return Math.abs(Number(p.position_fp ?? p.position ?? p.market_position ?? 0));
}

// Retained as the R14 deterministic fallback primitive and regression oracle.
// R17/GCA1 no longer uses occurrence_datetime as the sole clock authority: it
// first seeks official milestone live evidence and only falls back to this
// conservative rule when occurrence has actually passed. Broad trading
// activity alone can never authorize a Hunter clock.
export function resolveObservedGameStart({ priorStart = 0, liveStatus = 'unknown', occurrenceTimeMs = 0, now = Date.now() } = {}) {
  const prior = Number(priorStart || 0);
  const occurrence = Number(occurrenceTimeMs || 0);
  if (!Number.isFinite(occurrence) || occurrence <= 0 || occurrence > now) return 0;
  if (Number.isFinite(prior) && prior >= occurrence && prior <= now) return prior;
  return String(liveStatus || '').toLowerCase() === 'live' ? now : 0;
}


export function entryAdmissionDecision({ quote=null, mode='SIMULATION', minGameMinutes=0, maxGameMinutes=0, now=Date.now() }={}) {
  const state=quote?.gameClockState&&typeof quote.gameClockState==='object'?quote.gameClockState:{};
  const phase=String(state.phase||'UNKNOWN');
  const minMs=Math.max(0,Number(minGameMinutes||0))*60_000;
  const configuredMaxMinutes=Math.max(0,Number(maxGameMinutes||0));
  const maxMs=configuredMaxMinutes>0?configuredMaxMinutes*60_000:0;
  const t=Number(now);
  if(phase==='FINAL')return{action:'BLOCK',reason:'game_final',nextEligibleAtMs:null};
  if(phase==='CONFLICT')return{action:'BLOCK',reason:'game_clock_conflict',nextEligibleAtMs:null};
  const start=Number(state.startTimeMs||quote?.gameStartTimeMs||0);
  if(phase==='CONFIRMED'&&Number.isFinite(start)&&start>0){
    const nextEligibleAtMs=start+minMs;
    if(Number.isFinite(t)&&t+1e-9<nextEligibleAtMs)return{action:'BLOCK',reason:'minimum_game_time_wait',nextEligibleAtMs,startTimeMs:start};
    const lastEligibleAtMs=maxMs>0?start+maxMs:null;
    if(lastEligibleAtMs!=null&&Number.isFinite(t)&&t-1e-9>lastEligibleAtMs)return{action:'BLOCK',reason:'maximum_game_time_exceeded',nextEligibleAtMs:null,lastEligibleAtMs,startTimeMs:start};
    return{action:'ALLOW',reason:maxMs>0?'confirmed_entry_window':'confirmed_minimum_elapsed',nextEligibleAtMs,startTimeMs:start,lastEligibleAtMs};
  }
  const simStart=Number(state.simulationActivityStartMs||0);
  if(mode==='SIMULATION'&&Number.isFinite(simStart)&&simStart>0){
    const nextEligibleAtMs=simStart+minMs;
    if(Number.isFinite(t)&&t+1e-9<nextEligibleAtMs)return{action:'BLOCK',reason:'simulation_activity_aging_wait',nextEligibleAtMs,startTimeMs:simStart};
    // simulationActivityStartMs is a conservative lower bound. If even that
    // lower bound exceeds the configured maximum, the event is certainly too
    // old and may be rejected before consuming an execution worker.
    const lastEligibleAtMs=maxMs>0?simStart+maxMs:null;
    if(lastEligibleAtMs!=null&&Number.isFinite(t)&&t-1e-9>lastEligibleAtMs)return{action:'BLOCK',reason:'maximum_game_time_exceeded',nextEligibleAtMs:null,lastEligibleAtMs,startTimeMs:simStart};
    // A matured observed-activity lower bound is not exposure authority. It
    // earns one bounded GCA2 probe; only fresh exact-trade evidence may promote
    // the event to CONFIRMED and unlock normal initial-exposure admission.
    return{action:'PROBE',reason:'simulation_activity_due_for_authority_probe',nextEligibleAtMs,startTimeMs:simStart,lastEligibleAtMs};
  }
  return{action:'PROBE',reason:'clock_authority_probe_required',nextEligibleAtMs:null};
}

// EAC3 keeps only the hard game-window proof needed by the immediate
// COSMO_GREEN -> Atomic Thunder -> Athena chain. There is no strategic
// PRE-BOLT waiting clock. A green signal or an already emitted Bolt needs only
// enough remaining game time for the bounded execution margin.
export function entryChainAdmissionDecision({
  quote=null,
  mode='SIMULATION',
  minGameMinutes=0,
  maxGameMinutes=0,
  now=Date.now(),
  stage='ATOMIC_GREEN',
  executionMarginMs=ENTRY_ADMISSION_CONTROL.preBoltExecutionMarginMs,
}={}){
  const normalizedStage=stage==='NEW_PRE_BOLT'||stage==='ACTIVE_PRE_BOLT'?'ATOMIC_GREEN':stage==='POST_ATB2'?'POST_BOLT':String(stage||'ATOMIC_GREEN');
  const base=entryAdmissionDecision({quote,mode,minGameMinutes,maxGameMinutes,now});
  if(base.action!=='ALLOW')return{...base,stage:normalizedStage};
  const maxAt=Number(base.lastEligibleAtMs||0),t=Number(now),margin=Math.max(0,Number(executionMarginMs)||0);
  if(!(maxAt>0))return{...base,stage:normalizedStage,executionMarginMs:margin,preBoltFeasible:true,immediateGreenChain:true};
  const expectedEvent=String(quote?.eventTicker||quote?.ticker||'');
  const freshClock=isEntryAuthorizedGameClockState(quote?.gameClockState,expectedEvent,t);
  if(['ATOMIC_GREEN','POST_BOLT'].includes(normalizedStage)&&!freshClock){
    return{action:'PROBE',reason:normalizedStage==='POST_BOLT'?'post_bolt_clock_authorization_refresh_required':'cosmo_green_clock_authorization_refresh_required',stage:normalizedStage,startTimeMs:base.startTimeMs,lastEligibleAtMs:maxAt,nextEligibleAtMs:base.nextEligibleAtMs};
  }
  const readyAtMs=t+margin;
  if(!(readyAtMs<maxAt))return{action:'BLOCK',reason:'execution_window_infeasible',stage:normalizedStage,startTimeMs:base.startTimeMs,lastEligibleAtMs:maxAt,readyAtMs,executionMarginMs:margin,nextEligibleAtMs:null};
  return{...base,stage:normalizedStage,executionMarginMs:margin,readyAtMs,preBoltFeasible:true,immediateGreenChain:true};
}

// R60-HF1 simulation reset mutation barrier. Reset invalidates the epoch,
// blocks new SIM work, and drains only already-entered entry work before the
// archive boundary. This covers both Cosmos shadow commits and real Attacks.
export class SimulationMutationGate {
  constructor(){this.epoch=0;this.blocked=false;this.active=0;this.waiters=[];}
  capture(){return{epoch:this.epoch,blocked:this.blocked};}
  enter(token){
    if(this.blocked||!token||Number(token.epoch)!==this.epoch)return null;
    this.active+=1;let released=false;
    return()=>{if(released)return;released=true;this.active=Math.max(0,this.active-1);if(this.active===0){const waiters=this.waiters.splice(0);for(const resolve of waiters)resolve();}};
  }
  async blockAndDrain(){
    if(this.blocked)throw new Error('simulation_reset_already_in_progress');
    this.blocked=true;this.epoch+=1;
    if(this.active>0)await new Promise((resolve)=>this.waiters.push(resolve));
    return{epoch:this.epoch,active:this.active};
  }
  release(){this.blocked=false;}
  snapshot(){return{version:'SIM-RESET-GATE-V1',epoch:this.epoch,blocked:this.blocked,active:this.active,waiting:this.waiters.length};}
}

// HF2 crash orchestration is independent of any one Cosmo source. CI1 wakes
// the Starlight lane; any active Cosmo may then nominate the market.
export function crashPipelineReadyFromState(state) {
  return Boolean(state && typeof state === 'object' && state.entryReady === true);
}

export class SagittariusEngine {
  constructor() {
    this.db = new Database(env.databaseUrl);
    this.settings = freshInstallSettings();
    this.credentials = null;
    this.balance = null;
    this.brokerPositions = [];
    this.running = false;
    this.scanRequested = false;
    // HF3: serialize dashboard/settings mutations so rapid one-by-one topology
    // toggles cannot persist out of order across PostgreSQL pool clients.
    this.settingsMutationTail = Promise.resolve();
    this.simulationMutationGate = new SimulationMutationGate();
    this.simulationResetPromise = null;
    this.intelligenceHydration = {legacyAthena:'IDLE',athenaCommander:'IDLE',atomicThunderResearch:'IDLE',lastError:null,startedAtMs:0,completedAtMs:0};
    this.intelligenceHydrationPromise = null;
    this.cyclePromise = null;
    this.protectionLoopPromise = null;
    this.startedAtMs = Date.now();
    this.resourceSampleAtNs = process.hrtime.bigint();
    this.resourceCpuUsage = process.cpuUsage();
    this.resourceGovernorTimer = null;
    this.resourcePressureState = 'GREEN';
    this.resourceResearchDeferred = false;
    this.resourceGovernorTransitions = 0;
    this.resourceGovernorActions = 0;
    this.resourceGovernorLastActionAtMs = 0;
    this.resourceGovernorLastResult = null;
    this.lastFullScanMs = 0;
    this.lastDiscoveryMs = 0;
    this.lastSnapshotMs = 0;
    this.lastReferenceSweepMs = 0;
    this.lastPostExitResearchMs = 0;
    this.lastScanMarkets = [];
    this.lastError = null;
    // HF5: all dashboard/SSE/diagnostic consumers share one bounded state
    // collector. This prevents multiple browser requests from each fanning out
    // large PostgreSQL reads while trading work is active.
    this.stateSnapshotCache = null;
    this.stateSnapshotAtMs = 0;
    this.stateCollectionPromise = null;
    this.stateCollectionCount = 0;
    this.quoteProtectionTimers = new Map();
    this.quoteProtectionQueue = new CoalescingWorkQueue({
      maxConcurrency:QUOTE_PROTECTION_CONCURRENCY,
      onError:async(error,ticker)=>{await this.db.audit('error','profit_guard_quote_backpressure',{ticker,message:String(error?.message||error)}).catch(()=>{});},
    });
    this.entryEvaluationQueue = new CoalescingWorkQueue({
      maxConcurrency:ENTRY_EVALUATION_CONCURRENCY,
      onError:async(error,key)=>{await this.db.audit('error','entry_evaluation_backpressure',{key,message:String(error?.message||error)}).catch(()=>{});},
    });
    this.phoenixSignalQueue = new CoalescingWorkQueue({
      maxConcurrency:1,
      onError:async(error,key)=>{await this.db.audit('warning','phoenix_signal_backpressure',{key,message:String(error?.message||error)}).catch(()=>{});},
    });
    this.entryAdmissionProbeAt = new Map();
    this.entryAdmissionStats = {version:ENTRY_ADMISSION_CONTROL.version,allowed:0,blockedBeforeQueue:0,probeAllowed:0,probeCoalesced:0,byReason:{}};
    // R60/ECF1: one bounded identity follows an opportunity from COSMO_GREEN to
    // OPENED. These maps are telemetry/dedup only; they never grant authority.
    this.entryCandidateFunnel = new Map();
    this.entryCandidateFunnelTotals = {uniqueCandidates:0,byStage:{}};
    this.entryCandidateFunnelRecent = [];
    this.athenaDecisionMemo = new Map();
    this.athenaDecisionInFlight = new Set();
    this.entryDecisionDedupStats = {athenaEvaluated:0,athenaUnchangedSuppressed:0,athenaInFlightSuppressed:0,athenaChangedStateRetries:0};
    this.scarletContinuationInFlight = new Set();
    this.scarletContinuationStats = {version:SCARLET_NEEDLE.version,eligible:0,authorized:0,attempted:0,opened:0,blocked:0,duplicateSuppressed:0,maxRepeatBlocked:0,modeMismatchBlocked:0,lastEvent:null};
    this.scarletContinuationQueue = new CoalescingWorkQueue({
      maxConcurrency:1,
      onError:async(error,key)=>{await this.db.audit('error','scarlet_continuation_queue',{key,message:String(error?.message||error)}).catch(()=>{});},
    });
    this.crystalWallContinuationInFlight = new Set();
    this.crystalWallWatches = new Map();
    this.crystalWallContinuationStats = {version:CRYSTAL_WALL.version,eligible:0,authorized:0,attempted:0,opened:0,blocked:0,watching:0,duplicateSuppressed:0,maxRepeatBlocked:0,selfParentBlocked:0,modeMismatchBlocked:0,lastEvent:null};
    this.crystalWallContinuationQueue = new CoalescingWorkQueue({
      maxConcurrency:1,
      onError:async(error,key)=>{await this.db.audit('error','crystal_wall_continuation_queue',{key,message:String(error?.message||error)}).catch(()=>{});},
    });
    // R63 Gemini shadow universe. Another Dimension is deliberately isolated from
    // the ordinary Cosmo source class: it observes active Cosmos but can never
    // become an Atomic Thunder/Lightning Plasma source. Quote work is memory-only;
    // durable open/close transitions are serialized on one bounded worker.
    this.activeCosmosByTicker = new Map();
    this.anotherDimensionSourcePeaks = new Map();
    this.anotherDimensionOpenByTicker = new Map();
    this.anotherDimensionRecent = new Map();
    this.anotherDimensionRuntime = new Map();
    this.geminiOpenAttemptBookMs = new Map();
    this.anotherDimensionQueue = new CoalescingWorkQueue({
      maxConcurrency:1,
      onError:async(error,key)=>{await this.db.audit('error','another_dimension_queue',{key,message:String(error?.message||error)}).catch(()=>{});},
    });
    this.anotherDimensionStats = {version:ANOTHER_DIMENSION.version,qualified:0,opened:0,profitClosed:0,lossClosed:0,realizedPnlCents:0,blocked:0,lastEvent:null};
    this.justiceArrowInFlight = new Set();
    this.justiceArrowQueue = new CoalescingWorkQueue({
      maxConcurrency:1,
      onError:async(error,key)=>{await this.db.audit('error','justice_arrow_continuation_queue',{key,message:String(error?.message||error)}).catch(()=>{});},
    });
    this.justiceArrowStats = {version:SAGITTARIUS_JUSTICE_ARROW.version,eligible:0,authorized:0,attempted:0,opened:0,blocked:0,duplicateSuppressed:0,modeMismatchBlocked:0,lastEvent:null};
    // R61-HF1: a dashboard settings write is only reported as verified after
    // the persisted PostgreSQL runtime record has been read back and the
    // edited fields match exactly. This telemetry never changes frozen trade
    // economics or grants trading authority.
    this.settingsPersistence = {version:'SETTINGS-PERSISTENCE-R1',lastVerifiedAtMs:0,lastKeys:[],lastValues:{},lastError:null};
    this.protectedTickers = new Set();
    this.goldenEyeTimer = null;
    this.goldenEyeEvaluationPromise = null;
    this.goldenEyeExecutionPromise = null;
    this.goldenEyeRerunRequested = false;
    this.goldenEye = null;
    this.feederSignalIntel = null;
    this.phoenixCosmo = null;
    this.atomicThunderBolt = null;
    this.athenaCommander = null;
    this.legacyAthena = null;
    // R20/RH1 keeps stopped-source tickers subscribed and lets fresh quote
    // events wake Recovery Hunter instead of waiting for the next 5-minute
    // full scan. The set contains only still-eligible hard-stop sources.
    this.recoveryPriorityTickers = new Set();
    this.recoveryEvaluationTimers = new Map();
    // R45 keeps existing active reference-feeder tickers hot so ordinary
    // active Cosmo -> Athena candidates are
    // evaluated from fresh WebSocket quotes instead of only at scan boundaries.
    this.feederPriorityTickers = new Set();
    this.feederHunterEvaluationTimers = new Map();
    this.athenaOpportunityTimers = new Map();
    // R46/LP1 is triggered only when Cosmo materializes, never by the raw quote
    // stream. One sliding quiet timer collects a short burst into a Plasma field
    // without reintroducing HF6/HF7 entry-queue pressure.
    this.lightningPlasmaTimer = null;
    this.lightningPlasmaEvaluationPromise = null;
    this.lightningPlasmaRerunRequested = false;
    // R21/CI1 keeps any active crash episode subscribed through its rebound or
    // terminal/reset transition. CRH1 evaluation is separately debounced and
    // remains subordinate to RH1 on a stopped-source ticker.
    this.crashPriorityTickers = new Set();
    this.crashRecoveryEvaluationTimers = new Map();
    this.reconcileTimer = null;
    this.reconcilePromise = null;
    this.cycleFailureCount = 0;
    this.health = {
      restOk: false,
      websocketOk: false,
      websocketFresh: false,
      reconciliationOk: true,
      protectionOk: true,
      protectionFresh: false,
      goldenEyeOk: true,
      goldenEyeLastError: null,
      scannerFresh: false,
      degraded: true,
      lastRestOkMs: 0,
      lastWsMessageMs: 0,
      lastDiscoveryMs: 0,
      lastProtectionMs: 0,
      lastError: null,
    };
    this.speed = {
      lastLoopMs: 0,
      avgCycleMs: 0,
      maxCycleMs: 0,
      checksCompleted: 0,
      fetchFailures: 0,
      closedThisLoop: 0,
      mode: 'idle',
    };
  }

  queueScarletContinuation(entry) {
    const id=String(entry?.id||'');
    if(!id)return false;
    if(!(this.scarletContinuationQueue instanceof CoalescingWorkQueue)){
      this.scarletContinuationQueue=new CoalescingWorkQueue({maxConcurrency:1,onError:async(error,key)=>{await this.db.audit('error','scarlet_continuation_queue',{key,message:String(error?.message||error)}).catch(()=>{});}});
    }
    return this.scarletContinuationQueue.enqueue(`close:${id}`,()=>this.handleScarletContinuation(entry));
  }

  scarletContinuationRuntime() {
    if(!(this.scarletContinuationInFlight instanceof Set))this.scarletContinuationInFlight=new Set();
    if(!this.scarletContinuationStats||typeof this.scarletContinuationStats!=='object')this.scarletContinuationStats={version:SCARLET_NEEDLE.version,eligible:0,authorized:0,attempted:0,opened:0,blocked:0,duplicateSuppressed:0,maxRepeatBlocked:0,modeMismatchBlocked:0,lastEvent:null};
    return this.scarletContinuationStats;
  }

  async handleScarletContinuation(parentEntry) {
    const stats=this.scarletContinuationRuntime();
    const s=this.settings||{};
    const parentId=String(parentEntry?.id||''),ticker=String(parentEntry?.ticker||'');
    const record=(status,data={})=>{stats.lastEvent={status,atMs:Date.now(),parentEntryId:parentId,ticker,...data};return stats.lastEvent;};
    if(!parentId||!ticker||parentEntry?.status!=='closed'||Number(parentEntry?.remainingCount||0)>1e-9)return {status:'IGNORED',reason:'not_fully_closed'};
    if(!ACTIVE_PORTFOLIO_CONCEPTS.has(String(parentEntry.conceptName||'')))return {status:'IGNORED',reason:'not_active_execution_attack'};
    if(String(parentEntry.closeReason||'')!=='infinity_break'||!(Number(parentEntry.pnlCents||0)>0))return {status:'IGNORED',reason:'not_profitable_infinity_close'};
    if(s.scarletNeedleEnabled!==true)return {status:'IGNORED',reason:'scarlet_disabled'};
    if(String(parentEntry.systemName||'')!==String(s.systemName)||String(parentEntry.ownerId||'')!==String(s.ownerId)){
      stats.blocked+=1;record('BLOCKED',{reason:'owner_or_system_mismatch'});return {status:'BLOCKED',reason:'owner_or_system_mismatch'};
    }
    if(String(parentEntry.mode||'')!==String(s.mode||'')){
      stats.modeMismatchBlocked+=1;stats.blocked+=1;record('BLOCKED',{reason:'mode_changed_since_parent_close'});return {status:'BLOCKED',reason:'mode_changed_since_parent_close'};
    }
    const maxRepeats=Math.max(0,Math.min(SCARLET_NEEDLE.maximumConfigurableRepeats,Math.floor(Number(s.scarletNeedleMaxRepeats??SCARLET_NEEDLE.defaultMaxRepeats))));
    if(maxRepeats<=0)return {status:'IGNORED',reason:'repeat_limit_zero'};
    const priorLineage=parentEntry?.entryConfig?.scarletContinuation&&typeof parentEntry.entryConfig.scarletContinuation==='object'?parentEntry.entryConfig.scarletContinuation:null;
    const repeatIndex=String(parentEntry.conceptName||'')==='Scarlet Needle'?Math.max(1,Math.floor(Number(priorLineage?.repeatIndex||0))+1):1;
    const rootEntryId=String(priorLineage?.rootEntryId||parentId);
    stats.eligible+=1;
    if(repeatIndex>maxRepeats){
      stats.maxRepeatBlocked+=1;record('MAX_REPEATS_REACHED',{repeatIndex,maxRepeats,rootEntryId});
      await this.db.audit('info','scarlet_continuation_max_repeats_reached',{parentEntryId:parentId,rootEntryId,ticker,repeatIndex,maxRepeats}).catch(()=>{});
      return {status:'MAX_REPEATS_REACHED',repeatIndex,maxRepeats};
    }
    const authorizationId=`SCARLET-CONTINUATION:${parentId}:${repeatIndex}`;
    if(this.scarletContinuationInFlight.has(authorizationId)){
      stats.duplicateSuppressed+=1;record('DUPLICATE_SUPPRESSED',{authorizationId,repeatIndex,maxRepeats,rootEntryId,scope:'local'});return {status:'DUPLICATE_SUPPRESSED',reason:'local_in_flight'};
    }
    this.scarletContinuationInFlight.add(authorizationId);
    let unlock=null;
    const baseEpisode=(decision={})=>({id:authorizationId,systemName:s.systemName,sourceRelease:RELEASE,cohortId:String(s.resetTimestampMs||''),ticker,eventTicker:String(parentEntry.eventTicker||ticker),side:'YES',sport:String(parentEntry.sport||'Unknown'),boltAtMs:Number(parentEntry.closedAtMs||Date.now()),boltSnapshot:{version:SCARLET_NEEDLE.version,authority:SCARLET_NEEDLE.strategicEntryAuthority,parentEntryId:parentId,rootEntryId,repeatIndex,maxRepeats},athenaDecision:decision,fireCommand:{},attackSelected:'Scarlet Needle',entryId:null,entryAtMs:null,outcome:{},trackingComplete:false,updatedAtMs:Date.now()});
    const terminal=async(reason,data={})=>{
      stats.blocked+=1;record('BLOCKED',{reason,authorizationId,repeatIndex,maxRepeats,rootEntryId,...data});
      const decision={decision:'BLOCKED',reason,strategicAuthority:false,scarletNeedleContinuation:{version:SCARLET_NEEDLE.version,status:'BLOCKED',terminal:true,authorizationId,parentEntryId:parentId,rootEntryId,repeatIndex,maxRepeats,...data}};
      await this.db.upsertOpportunityEpisode(baseEpisode(decision)).catch(()=>{});
      await this.db.audit('info','scarlet_continuation_blocked',{authorizationId,parentEntryId:parentId,rootEntryId,ticker,repeatIndex,maxRepeats,reason,...data}).catch(()=>{});
      return {status:'BLOCKED',reason,authorizationId,repeatIndex,maxRepeats};
    };
    try{
      if(typeof this.db.acquireHunterTickerLock!=='function')return terminal('continuation_lock_unavailable');
      unlock=await this.db.acquireHunterTickerLock(s.systemName,`scarlet-continuation:${parentId}`);
      if(!unlock){stats.duplicateSuppressed+=1;record('DUPLICATE_SUPPRESSED',{authorizationId,repeatIndex,maxRepeats,rootEntryId,scope:'database_lock'});return {status:'DUPLICATE_SUPPRESSED',reason:'database_lock_busy'};}
      const existing=typeof this.db.opportunityEpisode==='function'?await this.db.opportunityEpisode(authorizationId).catch(()=>null):null;
      const existingStatus=String(existing?.athenaDecision?.scarletNeedleContinuation?.status||existing?.athenaDecision?.decision||'');
      if(existing?.entryId||['OPENED','BLOCKED'].includes(existingStatus)){
        stats.duplicateSuppressed+=1;record('DUPLICATE_SUPPRESSED',{authorizationId,repeatIndex,maxRepeats,rootEntryId,scope:'durable_episode',existingStatus,entryId:existing?.entryId||null});return {status:'DUPLICATE_SUPPRESSED',reason:'durable_authorization_already_consumed',entryId:existing?.entryId||null};
      }
      const authorizedAtMs=Date.now();
      const lineage={version:SCARLET_NEEDLE.version,status:'AUTHORIZED',terminal:false,authorizationId,parentEntryId:parentId,rootEntryId,repeatIndex,maxRepeats,parentConcept:String(parentEntry.conceptName||''),parentCloseReason:String(parentEntry.closeReason||''),parentRealizedPnlCents:Number(parentEntry.pnlCents||0),parentExitPriceCents:Number(parentEntry.exitPriceCents||0),parentClosedAtMs:Number(parentEntry.closedAtMs||0),authorizedAtMs,fullExecutionSafetyRequired:true,normalStrategicDiscoveryBypassed:true};
      await this.db.upsertOpportunityEpisode(baseEpisode({decision:'AUTHORIZED',reason:'profitable_close_authorized_scarlet_continuation',strategicAuthority:false,scarletNeedleContinuation:lineage}));
      stats.authorized+=1;record('AUTHORIZED',{authorizationId,repeatIndex,maxRepeats,rootEntryId});
      const refreshed=typeof this.market?.refreshTickerVerified==='function'?await this.market.refreshTickerVerified(ticker).catch(()=>null):null;
      if(!refreshed?.marketFresh||!refreshed?.bookFresh||!refreshed?.quote)return terminal('fresh_executable_market_unavailable');
      const q={...refreshed.quote,ticker,eventTicker:String(refreshed.quote.eventTicker||refreshed.quote.ticker||ticker)};
      const expectedEvent=String(parentEntry.eventTicker||ticker),status=String(q.status||'').toLowerCase();
      if(String(q.eventTicker||ticker)!==expectedEvent)return terminal('event_identity_mismatch',{expectedEventTicker:expectedEvent,freshEventTicker:q.eventTicker||null});
      if(status!=='active'||Boolean(q.result))return terminal('market_not_active',{status:status||null,result:q.result||null});
      stats.attempted+=1;record('ATTEMPTED',{authorizationId,repeatIndex,maxRepeats,rootEntryId,bidCents:Number(q.yesBid||0),askCents:Number(q.yesAsk||0)});
      const opened=await this.strategy.executeScarletContinuation(q,parentEntry,{authorizationId,rootEntryId,repeatIndex,maxRepeats,authorizedAtMs});
      if(!opened)return terminal('hard_safety_or_execution_blocked');
      stats.opened+=1;record('OPENED',{authorizationId,repeatIndex,maxRepeats,rootEntryId,entryId:opened.id,entryPriceCents:Number(opened.entryPriceCents||0)});
      const openedDecision={decision:'OPENED',reason:'scarlet_continuation_opened',strategicAuthority:false,scarletNeedleContinuation:{...lineage,status:'OPENED',terminal:true,entryId:opened.id,entryAtMs:Number(opened.openedAtMs||Date.now()),entryPriceCents:Number(opened.entryPriceCents||0)}};
      const current=typeof this.db.opportunityEpisode==='function'?await this.db.opportunityEpisode(authorizationId).catch(()=>null):null;
      await this.db.upsertOpportunityEpisode({...baseEpisode(openedDecision),...(current||{}),athenaDecision:openedDecision,fireCommand:structuredClone(opened.entryConfig?.athenaFire||current?.fireCommand||{}),entryId:opened.id,entryAtMs:Number(opened.openedAtMs||Date.now()),attackSelected:'Scarlet Needle',updatedAtMs:Date.now()}).catch(()=>{});
      await this.db.audit('info','scarlet_continuation_opened',{authorizationId,parentEntryId:parentId,rootEntryId,ticker,repeatIndex,maxRepeats,entryId:opened.id,entryPriceCents:Number(opened.entryPriceCents||0),closeToEntryLatencyMs:Math.max(0,Number(opened.openedAtMs||Date.now())-Number(parentEntry.closedAtMs||authorizedAtMs))}).catch(()=>{});
      return {status:'OPENED',authorizationId,repeatIndex,maxRepeats,entry:opened};
    }catch(error){
      await this.db.audit('error','scarlet_continuation_failed',{authorizationId,parentEntryId:parentId,rootEntryId,ticker,repeatIndex,maxRepeats,message:String(error?.message||error)}).catch(()=>{});
      return terminal('continuation_exception',{message:String(error?.message||error)});
    }finally{
      if(unlock)await unlock().catch(()=>{});
      this.scarletContinuationInFlight.delete(authorizationId);
    }
  }

  queueCrystalWallContinuation(entry) {
    const id=String(entry?.id||'');
    if(!id)return false;
    if(!(this.crystalWallContinuationQueue instanceof CoalescingWorkQueue)){
      this.crystalWallContinuationQueue=new CoalescingWorkQueue({maxConcurrency:1,onError:async(error,key)=>{await this.db.audit('error','crystal_wall_continuation_queue',{key,message:String(error?.message||error)}).catch(()=>{});}});
    }
    return this.crystalWallContinuationQueue.enqueue(`close:${id}`,()=>this.handleCrystalWallContinuation(entry));
  }

  queueCrystalWallWatch(ticker) {
    const exact=String(ticker||'');
    if(!exact||!(this.crystalWallWatches instanceof Map))return false;
    const watches=[...this.crystalWallWatches.values()].filter((w)=>String(w?.ticker||'')===exact);
    if(!watches.length)return false;
    if(!(this.crystalWallContinuationQueue instanceof CoalescingWorkQueue)){
      this.crystalWallContinuationQueue=new CoalescingWorkQueue({maxConcurrency:1,onError:async(error,key)=>{await this.db.audit('error','crystal_wall_continuation_queue',{key,message:String(error?.message||error)}).catch(()=>{});}});
    }
    for(const watch of watches)this.crystalWallContinuationQueue.enqueue(`close:${String(watch.parentEntry?.id||watch.authorizationId)}`,()=>this.handleCrystalWallContinuation(watch.parentEntry));
    return true;
  }

  crystalWallContinuationRuntime() {
    if(!(this.crystalWallContinuationInFlight instanceof Set))this.crystalWallContinuationInFlight=new Set();
    if(!(this.crystalWallWatches instanceof Map))this.crystalWallWatches=new Map();
    if(!this.crystalWallContinuationStats||typeof this.crystalWallContinuationStats!=='object')this.crystalWallContinuationStats={version:CRYSTAL_WALL.version,eligible:0,authorized:0,attempted:0,opened:0,blocked:0,watching:0,duplicateSuppressed:0,maxRepeatBlocked:0,selfParentBlocked:0,modeMismatchBlocked:0,lastEvent:null};
    return this.crystalWallContinuationStats;
  }

  async handleCrystalWallContinuation(parentEntry) {
    const stats=this.crystalWallContinuationRuntime();
    const s=this.settings||{};
    const parentId=String(parentEntry?.id||''),ticker=String(parentEntry?.ticker||'');
    const record=(status,data={})=>{stats.lastEvent={status,atMs:Date.now(),parentEntryId:parentId,ticker,...data};return stats.lastEvent;};
    if(!parentId||!ticker||parentEntry?.status!=='closed'||Number(parentEntry?.remainingCount||0)>1e-9)return {status:'IGNORED',reason:'not_fully_closed'};
    if(!ACTIVE_PORTFOLIO_CONCEPTS.has(String(parentEntry.conceptName||'')))return {status:'IGNORED',reason:'not_active_execution_attack'};
    if(String(parentEntry.closeReason||'')!=='hard_stop_loss')return {status:'IGNORED',reason:'not_hard_stop_loss'};
    if(s.recoveryHunterEnabled!==true)return {status:'IGNORED',reason:'crystal_wall_disabled'};
    if(String(parentEntry.conceptName||'')==='Recovery Hunter'){
      stats.selfParentBlocked+=1;record('IGNORED',{reason:'parent_is_crystal_wall'});
      await this.db.audit('info','crystal_wall_self_parent_blocked',{parentEntryId:parentId,ticker}).catch(()=>{});
      return {status:'IGNORED',reason:'parent_is_crystal_wall'};
    }
    if(String(parentEntry.systemName||'')!==String(s.systemName)||String(parentEntry.ownerId||'')!==String(s.ownerId)){
      stats.blocked+=1;record('BLOCKED',{reason:'owner_or_system_mismatch'});return {status:'BLOCKED',reason:'owner_or_system_mismatch'};
    }
    if(String(parentEntry.mode||'')!==String(s.mode||'')){
      stats.modeMismatchBlocked+=1;stats.blocked+=1;record('BLOCKED',{reason:'mode_changed_since_parent_close'});return {status:'BLOCKED',reason:'mode_changed_since_parent_close'};
    }
    const windowMs=Math.max(1,Number(s.recoveryTrackingHours||24))*3600000;
    if(Number(parentEntry.closedAtMs||0)>0 && Date.now()-Number(parentEntry.closedAtMs)>windowMs)return {status:'IGNORED',reason:'tracking_window_elapsed'};
    stats.eligible+=1;
    const authorizationId=`CRYSTAL-WALL-CONTINUATION:${parentId}:1`;
    if(this.crystalWallContinuationInFlight.has(authorizationId)){
      stats.duplicateSuppressed+=1;record('DUPLICATE_SUPPRESSED',{authorizationId,scope:'local'});return {status:'DUPLICATE_SUPPRESSED',reason:'local_in_flight'};
    }
    this.crystalWallContinuationInFlight.add(authorizationId);
    let unlock=null;
    const baseEpisode=(decision={})=>({id:authorizationId,systemName:s.systemName,sourceRelease:RELEASE,cohortId:String(s.resetTimestampMs||''),ticker,eventTicker:String(parentEntry.eventTicker||ticker),side:'YES',sport:String(parentEntry.sport||'Unknown'),boltAtMs:Number(parentEntry.closedAtMs||Date.now()),boltSnapshot:{version:CRYSTAL_WALL.version,authority:CRYSTAL_WALL.strategicEntryAuthority,parentEntryId:parentId,rootEntryId:parentId,repeatIndex:1,maxRepeats:1},athenaDecision:decision,fireCommand:{},attackSelected:'Recovery Hunter',entryId:null,entryAtMs:null,outcome:{},trackingComplete:false,updatedAtMs:Date.now()});
    try{
      if(typeof this.db.acquireHunterTickerLock!=='function')return {status:'BLOCKED',reason:'continuation_lock_unavailable'};
      unlock=await this.db.acquireHunterTickerLock(s.systemName,`crystal-wall-continuation:${parentId}`);
      if(!unlock){stats.duplicateSuppressed+=1;record('DUPLICATE_SUPPRESSED',{authorizationId,scope:'database_lock'});return {status:'DUPLICATE_SUPPRESSED',reason:'database_lock_busy'};}
      const existing=typeof this.db.opportunityEpisode==='function'?await this.db.opportunityEpisode(authorizationId).catch(()=>null):null;
      const existingStatus=String(existing?.athenaDecision?.crystalWallContinuation?.status||existing?.athenaDecision?.decision||'');
      if(existing?.entryId||['OPENED','BLOCKED'].includes(existingStatus)){
        stats.duplicateSuppressed+=1;record('DUPLICATE_SUPPRESSED',{authorizationId,scope:'durable_episode',existingStatus,entryId:existing?.entryId||null});return {status:'DUPLICATE_SUPPRESSED',reason:'durable_authorization_already_consumed',entryId:existing?.entryId||null};
      }
      const authorizedAtMs=Number(existing?.athenaDecision?.crystalWallContinuation?.authorizedAtMs||Date.now());
      const lineage={version:CRYSTAL_WALL.version,status:'AUTHORIZED',terminal:false,authorizationId,parentEntryId:parentId,rootEntryId:parentId,repeatIndex:1,maxRepeats:1,parentConcept:String(parentEntry.conceptName||''),parentCloseReason:String(parentEntry.closeReason||''),parentRealizedPnlCents:Number(parentEntry.pnlCents||0),parentExitPriceCents:Number(parentEntry.exitPriceCents||0),parentClosedAtMs:Number(parentEntry.closedAtMs||0),authorizedAtMs,fullExecutionSafetyRequired:true,normalStrategicDiscoveryBypassed:true,reboundRequired:true};
      if(existingStatus!=='AUTHORIZED'&&existingStatus!=='WATCHING'){
        await this.db.upsertOpportunityEpisode(baseEpisode({decision:'AUTHORIZED',reason:'hard_stop_authorized_crystal_wall_continuation',strategicAuthority:false,crystalWallContinuation:lineage}));
        stats.authorized+=1;record('AUTHORIZED',{authorizationId});
      }
      const watch={authorizationId,parentEntry,authorizedAtMs,ticker,eventTicker:String(parentEntry.eventTicker||ticker)};
      this.crystalWallWatches.set(authorizationId,watch);
      if(this.recoveryPriorityTickers instanceof Set)this.recoveryPriorityTickers.add(ticker);
      return this.attemptCrystalWallContinuation(watch);
    }catch(error){
      await this.db.audit('error','crystal_wall_continuation_failed',{authorizationId,parentEntryId:parentId,ticker,message:String(error?.message||error)}).catch(()=>{});
      stats.blocked+=1;record('BLOCKED',{reason:'continuation_exception',authorizationId});
      return {status:'BLOCKED',reason:'continuation_exception'};
    }finally{
      if(unlock)await unlock().catch(()=>{});
      this.crystalWallContinuationInFlight.delete(authorizationId);
    }
  }

  async attemptCrystalWallContinuation(watch) {
    const stats=this.crystalWallContinuationRuntime();
    const s=this.settings||{};
    const authorizationId=String(watch?.authorizationId||'');
    const parentEntry=watch?.parentEntry;
    const parentId=String(parentEntry?.id||'');
    const ticker=String(watch?.ticker||parentEntry?.ticker||'');
    const record=(status,data={})=>{stats.lastEvent={status,atMs:Date.now(),parentEntryId:parentId,ticker,authorizationId,...data};return stats.lastEvent;};
    if(!authorizationId||!parentId||!ticker)return {status:'IGNORED',reason:'watch_incomplete'};
    const windowMs=Math.max(1,Number(s.recoveryTrackingHours||24))*3600000;
    if(Number(parentEntry.closedAtMs||0)>0 && Date.now()-Number(parentEntry.closedAtMs)>windowMs){
      this.crystalWallWatches.delete(authorizationId);
      stats.blocked+=1;record('BLOCKED',{reason:'tracking_window_elapsed'});
      return {status:'BLOCKED',reason:'tracking_window_elapsed'};
    }
    const existing=typeof this.db.opportunityEpisode==='function'?await this.db.opportunityEpisode(authorizationId).catch(()=>null):null;
    const existingStatus=String(existing?.athenaDecision?.crystalWallContinuation?.status||existing?.athenaDecision?.decision||'');
    if(existing?.entryId||['OPENED','BLOCKED'].includes(existingStatus)){
      this.crystalWallWatches.delete(authorizationId);
      return {status:'DUPLICATE_SUPPRESSED',reason:'durable_authorization_already_consumed',entryId:existing?.entryId||null};
    }
    const refreshed=typeof this.market?.refreshTickerVerified==='function'?await this.market.refreshTickerVerified(ticker).catch(()=>null):null;
    if(!refreshed?.marketFresh||!refreshed?.bookFresh||!refreshed?.quote){
      stats.watching+=1;record('WATCHING',{reason:'fresh_executable_market_unavailable'});
      return {status:'WATCHING',reason:'fresh_executable_market_unavailable'};
    }
    const q={...refreshed.quote,ticker,eventTicker:String(refreshed.quote.eventTicker||refreshed.quote.ticker||ticker)};
    const expectedEvent=String(parentEntry.eventTicker||ticker),status=String(q.status||'').toLowerCase();
    if(String(q.eventTicker||ticker)!==expectedEvent){
      this.crystalWallWatches.delete(authorizationId);stats.blocked+=1;record('BLOCKED',{reason:'event_identity_mismatch'});
      await this.db.upsertOpportunityEpisode({...(existing||{}),id:authorizationId,athenaDecision:{decision:'BLOCKED',reason:'event_identity_mismatch',crystalWallContinuation:{status:'BLOCKED',terminal:true,authorizationId}},updatedAtMs:Date.now()}).catch(()=>{});
      return {status:'BLOCKED',reason:'event_identity_mismatch'};
    }
    if(status!=='active'||Boolean(q.result)){
      this.crystalWallWatches.delete(authorizationId);stats.blocked+=1;record('BLOCKED',{reason:'market_not_active'});
      await this.db.upsertOpportunityEpisode({...(existing||{}),id:authorizationId,athenaDecision:{decision:'BLOCKED',reason:'market_not_active',crystalWallContinuation:{status:'BLOCKED',terminal:true,authorizationId}},updatedAtMs:Date.now()}).catch(()=>{});
      return {status:'BLOCKED',reason:'market_not_active'};
    }
    const signal=recoverySignalState(parentEntry,q,null,s,Number(parentEntry.exitPriceCents||0));
    if(!signal.qualified){
      stats.watching+=1;record('WATCHING',{reason:signal.reason,bidCents:signal.bidCents,troughCents:signal.troughCents,reboundCents:signal.reboundCents});
      await this.db.upsertOpportunityEpisode({...(existing||{}),id:authorizationId,athenaDecision:{decision:'WATCHING',reason:signal.reason,crystalWallContinuation:{status:'WATCHING',terminal:false,authorizationId,reboundCents:signal.reboundCents,troughCents:signal.troughCents}},updatedAtMs:Date.now()}).catch(()=>{});
      return {status:'WATCHING',reason:signal.reason};
    }
    stats.attempted+=1;record('ATTEMPTED',{authorizationId,bidCents:signal.bidCents,askCents:signal.askCents,reboundCents:signal.reboundCents});
    const opened=await this.strategy.executeCrystalWallContinuation(q,parentEntry,{authorizationId,authorizedAtMs:Number(watch.authorizedAtMs||Date.now())});
    if(!opened){
      stats.watching+=1;record('WATCHING',{reason:'hard_safety_or_execution_blocked'});
      return {status:'WATCHING',reason:'hard_safety_or_execution_blocked'};
    }
    this.crystalWallWatches.delete(authorizationId);
    stats.opened+=1;record('OPENED',{authorizationId,entryId:opened.id,entryPriceCents:Number(opened.entryPriceCents||0)});
    const openedDecision={decision:'OPENED',reason:'crystal_wall_continuation_opened',strategicAuthority:false,crystalWallContinuation:{version:CRYSTAL_WALL.version,status:'OPENED',terminal:true,authorizationId,parentEntryId:parentId,rootEntryId:parentId,repeatIndex:1,maxRepeats:1,entryId:opened.id,entryAtMs:Number(opened.openedAtMs||Date.now()),entryPriceCents:Number(opened.entryPriceCents||0)}};
    await this.db.upsertOpportunityEpisode({id:authorizationId,systemName:s.systemName,sourceRelease:RELEASE,cohortId:String(s.resetTimestampMs||''),ticker,eventTicker:String(parentEntry.eventTicker||ticker),side:'YES',sport:String(parentEntry.sport||'Unknown'),athenaDecision:openedDecision,fireCommand:structuredClone(opened.entryConfig?.athenaFire||{}),attackSelected:'Recovery Hunter',entryId:opened.id,entryAtMs:Number(opened.openedAtMs||Date.now()),updatedAtMs:Date.now()}).catch(()=>{});
    await this.db.audit('info','crystal_wall_continuation_opened',{authorizationId,parentEntryId:parentId,ticker,entryId:opened.id,entryPriceCents:Number(opened.entryPriceCents||0),reboundCents:Number(opened.entryConfig?.crystalWallContinuation?.reboundCents||0),closeToEntryLatencyMs:Math.max(0,Number(opened.openedAtMs||Date.now())-Number(parentEntry.closedAtMs||watch.authorizedAtMs||0))}).catch(()=>{});
    return {status:'OPENED',authorizationId,entry:opened};
  }

  rememberAnotherDimension(entry) {
    if(!entry?.id)return;
    if(!(this.anotherDimensionRecent instanceof Map))this.anotherDimensionRecent=new Map();
    if(!(this.anotherDimensionOpenByTicker instanceof Map))this.anotherDimensionOpenByTicker=new Map();
    this.anotherDimensionRecent.delete(String(entry.id));
    this.anotherDimensionRecent.set(String(entry.id),entry);
    while(this.anotherDimensionRecent.size>ANOTHER_DIMENSION.maximumRecentResults){
      const oldest=this.anotherDimensionRecent.keys().next().value;
      this.anotherDimensionRecent.delete(oldest);
    }
    if(openLike(entry.status))this.anotherDimensionOpenByTicker.set(String(entry.ticker),entry);
    else if(this.anotherDimensionOpenByTicker.get(String(entry.ticker))?.id===entry.id)this.anotherDimensionOpenByTicker.delete(String(entry.ticker));
  }

  async hydrateAnotherDimension() {
    this.anotherDimensionOpenByTicker=new Map();
    this.anotherDimensionRecent=new Map();
    this.anotherDimensionRuntime=new Map();
    this.geminiOpenAttemptBookMs=new Map();
    if(typeof this.db?.entriesByConcept!=='function')return;
    const rows=await this.db.entriesByConcept(this.settings.systemName,'Another Dimension',{limit:ANOTHER_DIMENSION.maximumRecentResults}).catch(()=>[]);
    for(const entry of (rows||[]).slice().reverse())this.rememberAnotherDimension(entry);
  }

  anotherDimensionRuntimeState(entry) {
    const id=String(entry?.id||'');
    if(!id)return null;
    if(!(this.anotherDimensionRuntime instanceof Map))this.anotherDimensionRuntime=new Map();
    let state=this.anotherDimensionRuntime.get(id);
    if(!state){
      state={confirmations:0,firstConfirmationAtMs:0,lastBookMs:0,peakPriceCents:Number(entry.entryPriceCents||0),lowestPriceAfterEntryCents:Number(entry.entryPriceCents||0),maeCents:Number(entry.maeCents||0),maeAtMs:entry.maeAtMs||null,lastEvaluation:null};
      this.anotherDimensionRuntime.set(id,state);
    }
    return state;
  }

  evaluateAnotherDimensionExit(entry,q,{now=Date.now(),finalize=false}={}) {
    if(!entry?.id||entry.conceptName!=='Another Dimension'||!openLike(entry.status)||!q)return null;
    const state=this.anotherDimensionRuntimeState(entry);
    const count=Math.max(1,Number(entry.remainingCount??entry.count??0));
    const entryPrice=Number(entry.entryPriceCents||0);
    const entryFee=Number(entry.entryFeeCents||0);
    const bid=Number(q.yesBid||0);
    const required=Math.max(1,Math.floor(Number(entry.entryConfig?.virtualInfinity?.requiredFreshConfirmations??INFINITY_BREAK.defaultRequiredFreshConfirmations)));
    const targetPerContract=Math.max(0.01,Number(entry.entryConfig?.virtualInfinity?.minimumNetPerOriginalContractCents??ANOTHER_DIMENSION.minimumNetPerOriginalContractCents));
    const targetNet=targetPerContract*count;
    const setEvaluation=(extra={})=>{
      state.lastEvaluation={
        universe:'Gemini',attack:'Another Dimension',evaluatedAtMs:now,entryPriceCents:entryPrice,
        currentBidCents:bid,requiredCount:count,confirmations:Number(state.confirmations||0),requiredConfirmations:required,
        targetNetPerOriginalContractCents:targetPerContract,targetNetCents:targetNet,
        ...extra,
      };
      return state.lastEvaluation;
    };
    if(bid>0){
      if(bid>state.peakPriceCents)state.peakPriceCents=bid;
      if(!(state.lowestPriceAfterEntryCents>0)||bid<state.lowestPriceAfterEntryCents){state.lowestPriceAfterEntryCents=bid;state.maeCents=Math.max(0,entryPrice-bid);state.maeAtMs=now;}
    }
    const status=String(q.status||'').toLowerCase();
    if(Boolean(q.result)||FINAL_STATUSES.has(status)){
      const payout=String(q.result||'').toLowerCase()==='yes'?100:0;
      const pnl=(payout-entryPrice)*count-entryFee;
      setEvaluation({action:'CLOSE',holdReason:null,settlement:true,fullPositionExecutable:true,executableCount:count,executableAverageBidCents:payout,executableNetPnlCents:pnl,bookMs:Number(q.updatedAtMs||now)});
      return{action:'CLOSE',closeReason:pnl>0?ANOTHER_DIMENSION.profitableCloseReason:ANOTHER_DIMENSION.lossCloseReason,exitPriceCents:payout,exitAverageCents:payout,exitFeeCents:0,pnlCents:pnl,bookMs:Number(q.updatedAtMs||now),peakPriceCents:state.peakPriceCents,lowestPriceAfterEntryCents:state.lowestPriceAfterEntryCents,maeCents:state.maeCents,maeAtMs:state.maeAtMs,settlement:true};
    }
    const cfg=entry.entryConfig?.virtualInfinity||{};
    const maxBookAge=Math.max(100,Number(cfg.maximumBookAgeMs??INFINITY_BREAK.defaultMaximumBookAgeMs));
    const bookAge=typeof this.market?.bookAgeMs==='function'?this.market.bookAgeMs(entry.ticker,now):Infinity;
    const quoteAge=typeof this.market?.quoteAgeMs==='function'?this.market.quoteAgeMs(entry.ticker,now):Infinity;
    if(bookAge>maxBookAge||quoteAge>maxBookAge||q.bookInvalid){
      setEvaluation({action:'HOLD',holdReason:q.bookInvalid?'invalid_book':'stale_quote_or_book',bookAgeMs:Number.isFinite(bookAge)?bookAge:null,quoteAgeMs:Number.isFinite(quoteAge)?quoteAge:null,maximumBookAgeMs:maxBookAge,fullPositionExecutable:false,executableCount:0,executableAverageBidCents:null,executableNetPnlCents:null});
      return null;
    }
    const executable=this.market?.executableBid?.(entry.ticker,count);
    const executableCount=Math.max(0,Number(executable?.filled||0));
    const fullExecutable=Boolean(executable?.full)&&executableCount+1e-9>=count&&Number.isFinite(Number(executable?.avgCents));
    if(!fullExecutable){
      state.confirmations=0;state.firstConfirmationAtMs=0;state.lastBookMs=0;
      setEvaluation({action:'HOLD',holdReason:'insufficient_full_position_executable_depth',bookAgeMs:bookAge,quoteAgeMs:quoteAge,maximumBookAgeMs:maxBookAge,fullPositionExecutable:false,executableCount,executableAverageBidCents:Number.isFinite(Number(executable?.avgCents))?Number(executable.avgCents):null,executableNetPnlCents:null});
      return null;
    }
    const avgBid=Number(executable.avgCents),bestBid=Number(executable.bestCents??bid);
    const bookMs=Number(this.market?.getBook?.(entry.ticker)?.updatedAtMs||q.updatedAtMs||now);
    const exitFee=String(entry.mode||this.settings.mode||'SIMULATION').toUpperCase()==='LIVE'
      ? kalshiGeneralTakerFeeEstimateCents({count,priceCents:Math.max(0,Math.min(100,avgBid))})
      : Math.max(0,Number(entry.entryConfig?.simFeeCents??this.settings.simFeeCents??0))*count;
    const pnl=(avgBid-entryPrice)*count-entryFee-exitFee;
    const danger=Number(entry.entryConfig?.aurora?.dangerPriceCents??entry.stopPriceCents??0);
    if(danger>0&&bestBid<=danger+1e-9){
      state.confirmations=0;state.firstConfirmationAtMs=0;state.lastBookMs=0;
      setEvaluation({action:'CLOSE',holdReason:null,closeReason:ANOTHER_DIMENSION.lossCloseReason,bookAgeMs:bookAge,quoteAgeMs:quoteAge,bookMs,fullPositionExecutable:true,executableCount,executableAverageBidCents:avgBid,executableBestBidCents:bestBid,executableExitFeeCents:exitFee,executableNetPnlCents:pnl,auroraDangerPriceCents:danger,auroraTouch:true,confirmations:0});
      return{action:'CLOSE',closeReason:ANOTHER_DIMENSION.lossCloseReason,exitPriceCents:Math.round(avgBid),exitAverageCents:avgBid,exitFeeCents:exitFee,pnlCents:pnl,bookMs,peakPriceCents:state.peakPriceCents,lowestPriceAfterEntryCents:state.lowestPriceAfterEntryCents,maeCents:state.maeCents,maeAtMs:state.maeAtMs,auroraTouch:true};
    }
    if(pnl+1e-9<targetNet){
      state.confirmations=0;state.firstConfirmationAtMs=0;state.lastBookMs=0;
      setEvaluation({action:'HOLD',holdReason:'below_plus_one_net_target',bookAgeMs:bookAge,quoteAgeMs:quoteAge,bookMs,fullPositionExecutable:true,executableCount,executableAverageBidCents:avgBid,executableBestBidCents:bestBid,executableExitFeeCents:exitFee,executableNetPnlCents:pnl,auroraDangerPriceCents:danger,confirmations:0});
      return null;
    }
    const windowMs=Math.max(250,Number(cfg.confirmationWindowMs??INFINITY_BREAK.defaultConfirmationWindowMs));
    if(finalize){
      const confirmationFresh=state.confirmations>=required&&state.firstConfirmationAtMs>0&&now-state.firstConfirmationAtMs<=windowMs;
      if(!confirmationFresh){
        setEvaluation({action:'HOLD',holdReason:'profit_confirmation_expired_before_commit',bookAgeMs:bookAge,quoteAgeMs:quoteAge,bookMs,fullPositionExecutable:true,executableCount,executableAverageBidCents:avgBid,executableBestBidCents:bestBid,executableExitFeeCents:exitFee,executableNetPnlCents:pnl,auroraDangerPriceCents:danger,confirmations:Number(state.confirmations||0)});
        return null;
      }
      setEvaluation({action:'CLOSE',holdReason:null,closeReason:ANOTHER_DIMENSION.profitableCloseReason,bookAgeMs:bookAge,quoteAgeMs:quoteAge,bookMs,fullPositionExecutable:true,executableCount,executableAverageBidCents:avgBid,executableBestBidCents:bestBid,executableExitFeeCents:exitFee,executableNetPnlCents:pnl,auroraDangerPriceCents:danger,confirmations:Number(state.confirmations||0),finalRevalidation:true});
      return{action:'CLOSE',closeReason:ANOTHER_DIMENSION.profitableCloseReason,exitPriceCents:Math.round(avgBid),exitAverageCents:avgBid,exitFeeCents:exitFee,pnlCents:pnl,bookMs,peakPriceCents:state.peakPriceCents,lowestPriceAfterEntryCents:state.lowestPriceAfterEntryCents,maeCents:state.maeCents,maeAtMs:state.maeAtMs,confirmations:state.confirmations,finalRevalidation:true};
    }
    if(bookMs===state.lastBookMs){
      setEvaluation({action:'HOLD',holdReason:'waiting_for_fresh_confirmation_book',bookAgeMs:bookAge,quoteAgeMs:quoteAge,bookMs,fullPositionExecutable:true,executableCount,executableAverageBidCents:avgBid,executableBestBidCents:bestBid,executableExitFeeCents:exitFee,executableNetPnlCents:pnl,auroraDangerPriceCents:danger,confirmations:Number(state.confirmations||0)});
      return null;
    }
    if(!state.firstConfirmationAtMs||now-state.firstConfirmationAtMs>windowMs){state.confirmations=1;state.firstConfirmationAtMs=now;}
    else state.confirmations+=1;
    state.lastBookMs=bookMs;
    if(state.confirmations<required){
      setEvaluation({action:'HOLD',holdReason:`profit_confirmation_${state.confirmations}_of_${required}`,bookAgeMs:bookAge,quoteAgeMs:quoteAge,bookMs,fullPositionExecutable:true,executableCount,executableAverageBidCents:avgBid,executableBestBidCents:bestBid,executableExitFeeCents:exitFee,executableNetPnlCents:pnl,auroraDangerPriceCents:danger,confirmations:state.confirmations});
      return null;
    }
    setEvaluation({action:'CLOSE_PENDING_COMMIT',holdReason:null,bookAgeMs:bookAge,quoteAgeMs:quoteAge,bookMs,fullPositionExecutable:true,executableCount,executableAverageBidCents:avgBid,executableBestBidCents:bestBid,executableExitFeeCents:exitFee,executableNetPnlCents:pnl,auroraDangerPriceCents:danger,confirmations:state.confirmations});
    return{action:'CLOSE',closeReason:ANOTHER_DIMENSION.profitableCloseReason,exitPriceCents:Math.round(avgBid),exitAverageCents:avgBid,exitFeeCents:exitFee,pnlCents:pnl,bookMs,peakPriceCents:state.peakPriceCents,lowestPriceAfterEntryCents:state.lowestPriceAfterEntryCents,maeCents:state.maeCents,maeAtMs:state.maeAtMs,confirmations:state.confirmations};
  }

  observeAnotherDimensionQuote(q) {
    if(!q?.ticker||!this.strategy)return;
    const ticker=String(q.ticker);
    const sources=this.activeCosmosByTicker?.get?.(ticker)||[];
    for(const source of sources){
      const id=String(source?.id||'');if(!id)continue;
      if(!(this.anotherDimensionSourcePeaks instanceof Map))this.anotherDimensionSourcePeaks=new Map();
      const prior=Math.max(Number(source.entryPriceCents||0),Number(source.peakPriceCents||0),Number(this.anotherDimensionSourcePeaks.get(id)||0));
      const next=Math.max(prior,Number(q.yesBid||0));
      this.anotherDimensionSourcePeaks.set(id,next);
    }
    const open=this.anotherDimensionOpenByTicker.get(ticker);
    if(open&&openLike(open.status)){
      const decision=this.evaluateAnotherDimensionExit(open,q);
      if(decision?.action==='CLOSE'){
        this.anotherDimensionQueue.enqueue(`close:${open.id}`,async()=>{
          const durable=typeof this.db?.entryById==='function'?await this.db.entryById(open.id).catch(()=>null):open;
          if(!durable||!openLike(durable.status)||durable.conceptName!=='Another Dimension')return;
          // Re-prove the market/book at commit time, but do NOT demand a third
          // book merely because the second qualifying book already completed the
          // configured confirmation sequence. R62 re-ran the normal evaluator on
          // the same book and accidentally canceled every profitable close.
          let freshQ=this.market?.getQuote?.(ticker)||q;
          if(typeof this.market?.refreshTickerVerified==='function'){
            const refreshed=await this.market.refreshTickerVerified(ticker).catch(()=>null);
            if(!refreshed?.marketFresh||!refreshed?.bookFresh||!refreshed?.quote)return;
            freshQ=refreshed.quote;
          }
          const finalDecision=this.evaluateAnotherDimensionExit(durable,freshQ,{finalize:true});
          if(finalDecision?.action!=='CLOSE')return;
          const closed=await this.strategy.closeAnotherDimensionShadow(durable,finalDecision);
          if(closed)this.rememberAnotherDimension(closed);
        });
      }
      return;
    }
    if(this.settings?.geminiEnabled!==true)return;
    if(!sources.length)return;
    // Same visible market book should produce at most one durable Gemini-open
    // attempt. This bounds DB/lock churn without changing the qualification.
    const bookMs=Number(this.market?.getBook?.(ticker)?.updatedAtMs||q.updatedAtMs||0);
    if(bookMs>0&&Number(this.geminiOpenAttemptBookMs?.get?.(ticker)||0)===bookMs)return;
    for(const source of sources){
      const peak=this.anotherDimensionSourcePeaks.get(String(source.id));
      const qualification=anotherDimensionQualification(source,q,this.settings,{sourcePeakCents:peak});
      if(!qualification.ok)continue;
      if(bookMs>0){
        if(!(this.geminiOpenAttemptBookMs instanceof Map))this.geminiOpenAttemptBookMs=new Map();
        this.geminiOpenAttemptBookMs.set(ticker,bookMs);
        while(this.geminiOpenAttemptBookMs.size>2048)this.geminiOpenAttemptBookMs.delete(this.geminiOpenAttemptBookMs.keys().next().value);
      }
      this.anotherDimensionStats.qualified+=1;
      this.anotherDimensionStats.lastEvent={status:'QUALIFIED',atMs:Date.now(),universe:'Gemini',attack:'Another Dimension',sourceTradeId:source.id,ticker,riseCents:qualification.riseCents,pullbackCents:qualification.pullbackCents};
      this.anotherDimensionQueue.enqueue(`open:${ticker}`,async()=>{
        if(this.anotherDimensionOpenByTicker.has(ticker))return;
        const durable=typeof this.db?.entryById==='function'?await this.db.entryById(source.id).catch(()=>null):source;
        if(!durable||!openLike(durable.status)||!ACTIVE_FEEDER_CONCEPTS.has(String(durable.conceptName||'')))return;
        let unlock=null;
        try{
          if(typeof this.db?.acquireHunterTickerLock==='function')unlock=await this.db.acquireHunterTickerLock(this.settings.systemName,`gemini-another-dimension:${ticker}`);
          if(typeof this.db?.acquireHunterTickerLock==='function'&&!unlock){this.anotherDimensionStats.blocked+=1;return;}
          const freshQ=this.market?.getQuote?.(ticker)||q;
          const opened=await this.strategy.createAnotherDimensionShadow(durable,freshQ,{sourcePeakCents:this.anotherDimensionSourcePeaks.get(String(durable.id))});
          if(opened){this.anotherDimensionStats.opened+=1;this.rememberAnotherDimension(opened);this.anotherDimensionStats.lastEvent={status:'OPENED',atMs:Date.now(),universe:'Gemini',attack:'Another Dimension',entryId:opened.id,sourceTradeId:opened.sourceTradeId,ticker};}
        }finally{if(unlock)await unlock().catch(()=>{});}
      });
      break;
    }
  }

  queueJusticeArrowContinuation(entry) {
    const id=String(entry?.id||'');
    if(!id)return false;
    if(!(this.justiceArrowQueue instanceof CoalescingWorkQueue))this.justiceArrowQueue=new CoalescingWorkQueue({maxConcurrency:1,onError:async(error,key)=>{await this.db.audit('error','justice_arrow_continuation_queue',{key,message:String(error?.message||error)}).catch(()=>{});}});
    return this.justiceArrowQueue.enqueue(`close:${id}`,()=>this.handleJusticeArrowContinuation(entry));
  }

  justiceArrowRuntime() {
    if(!(this.justiceArrowInFlight instanceof Set))this.justiceArrowInFlight=new Set();
    if(!this.justiceArrowStats||typeof this.justiceArrowStats!=='object')this.justiceArrowStats={version:SAGITTARIUS_JUSTICE_ARROW.version,eligible:0,authorized:0,attempted:0,opened:0,blocked:0,duplicateSuppressed:0,modeMismatchBlocked:0,lastEvent:null};
    return this.justiceArrowStats;
  }

  async handleJusticeArrowContinuation(parentShadow) {
    const stats=this.justiceArrowRuntime(),s=this.settings||{};
    const parentId=String(parentShadow?.id||''),ticker=String(parentShadow?.ticker||'');
    const record=(status,data={})=>{stats.lastEvent={status,atMs:Date.now(),parentShadowTradeId:parentId,ticker,...data};return stats.lastEvent;};
    if(!parentId||!ticker||parentShadow?.conceptName!=='Another Dimension'||parentShadow?.status!=='closed'||Number(parentShadow?.remainingCount||0)>1e-9)return{status:'IGNORED',reason:'not_completed_another_dimension'};
    if(String(parentShadow.closeReason||'')!==ANOTHER_DIMENSION.profitableCloseReason||!(Number(parentShadow.pnlCents||0)>0))return{status:'IGNORED',reason:'not_profitable_another_dimension_close'};
    if(s.justiceArrowEnabled!==true)return{status:'IGNORED',reason:'justice_arrow_disabled'};
    if(String(parentShadow.systemName||'')!==String(s.systemName)||String(parentShadow.ownerId||'')!==String(s.ownerId)){stats.blocked+=1;record('BLOCKED',{reason:'owner_or_system_mismatch'});return{status:'BLOCKED',reason:'owner_or_system_mismatch'};}
    if(String(parentShadow.mode||'')!==String(s.mode||'')){stats.modeMismatchBlocked+=1;stats.blocked+=1;record('BLOCKED',{reason:'mode_changed_since_shadow_close'});return{status:'BLOCKED',reason:'mode_changed_since_shadow_close'};}
    stats.eligible+=1;
    const authorizationId=`JUSTICE-ARROW:${parentId}:1`;
    if(this.justiceArrowInFlight.has(authorizationId)){stats.duplicateSuppressed+=1;record('DUPLICATE_SUPPRESSED',{authorizationId,scope:'local'});return{status:'DUPLICATE_SUPPRESSED',reason:'local_in_flight'};}
    this.justiceArrowInFlight.add(authorizationId);
    let unlock=null;
    const baseEpisode=(decision={})=>({id:authorizationId,systemName:s.systemName,sourceRelease:RELEASE,cohortId:String(s.resetTimestampMs||''),ticker,eventTicker:String(parentShadow.eventTicker||ticker),side:'YES',sport:String(parentShadow.sport||'Unknown'),boltAtMs:Number(parentShadow.closedAtMs||Date.now()),boltSnapshot:{version:SAGITTARIUS_JUSTICE_ARROW.version,authority:SAGITTARIUS_JUSTICE_ARROW.strategicEntryAuthority,parentShadowTradeId:parentId},athenaDecision:decision,fireCommand:{},attackSelected:'Sagittarius Justice Arrow',entryId:null,entryAtMs:null,outcome:{},trackingComplete:false,updatedAtMs:Date.now()});
    const terminal=async(reason,data={})=>{stats.blocked+=1;record('BLOCKED',{reason,authorizationId,...data});const decision={decision:'BLOCKED',reason,strategicAuthority:false,justiceArrowContinuation:{version:SAGITTARIUS_JUSTICE_ARROW.version,status:'BLOCKED',terminal:true,authorizationId,parentShadowTradeId:parentId,...data}};await this.db.upsertOpportunityEpisode(baseEpisode(decision)).catch(()=>{});await this.db.audit('info','justice_arrow_continuation_blocked',{authorizationId,parentShadowTradeId:parentId,ticker,reason,...data}).catch(()=>{});return{status:'BLOCKED',reason,authorizationId};};
    try{
      if(typeof this.db.acquireHunterTickerLock!=='function')return terminal('continuation_lock_unavailable');
      unlock=await this.db.acquireHunterTickerLock(s.systemName,`justice-arrow:${parentId}`);
      if(!unlock){stats.duplicateSuppressed+=1;record('DUPLICATE_SUPPRESSED',{authorizationId,scope:'database_lock'});return{status:'DUPLICATE_SUPPRESSED',reason:'database_lock_busy'};}
      const existing=typeof this.db.opportunityEpisode==='function'?await this.db.opportunityEpisode(authorizationId).catch(()=>null):null;
      const existingStatus=String(existing?.athenaDecision?.justiceArrowContinuation?.status||existing?.athenaDecision?.decision||'');
      if(existing?.entryId||['OPENED','BLOCKED'].includes(existingStatus)){stats.duplicateSuppressed+=1;record('DUPLICATE_SUPPRESSED',{authorizationId,scope:'durable_episode',existingStatus,entryId:existing?.entryId||null});return{status:'DUPLICATE_SUPPRESSED',reason:'durable_authorization_already_consumed',entryId:existing?.entryId||null};}
      const authorizedAtMs=Date.now();
      const lineage={version:SAGITTARIUS_JUSTICE_ARROW.version,status:'AUTHORIZED',terminal:false,authorizationId,parentShadowTradeId:parentId,parentCloseReason:String(parentShadow.closeReason||''),parentRealizedPnlCents:Number(parentShadow.pnlCents||0),parentExitPriceCents:Number(parentShadow.exitPriceCents||0),parentClosedAtMs:Number(parentShadow.closedAtMs||0),sourceCosmo:String(parentShadow.sourceFeeder||''),sourceCosmoTradeId:String(parentShadow.sourceTradeId||''),authorizedAtMs,fullExecutionSafetyRequired:true,normalStrategicDiscoveryBypassed:true,profitAuthority:ATHENA_EXIT_INTELLIGENCE.version};
      await this.db.upsertOpportunityEpisode(baseEpisode({decision:'AUTHORIZED',reason:'profitable_another_dimension_close_authorized_justice_arrow',strategicAuthority:false,justiceArrowContinuation:lineage}));
      stats.authorized+=1;record('AUTHORIZED',{authorizationId});
      const refreshed=typeof this.market?.refreshTickerVerified==='function'?await this.market.refreshTickerVerified(ticker).catch(()=>null):null;
      if(!refreshed?.marketFresh||!refreshed?.bookFresh||!refreshed?.quote)return terminal('fresh_executable_market_unavailable');
      const q={...refreshed.quote,ticker,eventTicker:String(refreshed.quote.eventTicker||refreshed.quote.ticker||ticker)};
      const expectedEvent=String(parentShadow.eventTicker||ticker),status=String(q.status||'').toLowerCase();
      if(String(q.eventTicker||ticker)!==expectedEvent)return terminal('event_identity_mismatch',{expectedEventTicker:expectedEvent,freshEventTicker:q.eventTicker||null});
      if(status!=='active'||Boolean(q.result))return terminal('market_not_active',{status:status||null,result:q.result||null});
      stats.attempted+=1;record('ATTEMPTED',{authorizationId,bidCents:Number(q.yesBid||0),askCents:Number(q.yesAsk||0)});
      const opened=await this.strategy.executeJusticeArrowContinuation(q,parentShadow,{authorizationId,authorizedAtMs});
      if(!opened)return terminal('hard_safety_or_execution_blocked');
      stats.opened+=1;record('OPENED',{authorizationId,entryId:opened.id,entryPriceCents:Number(opened.entryPriceCents||0)});
      // Durable reverse link keeps the Gemini table traceable to the real
      // Sagittarius Justice Arrow even after restart/state reconstruction.
      const parentDurable=typeof this.db?.entryById==='function'?await this.db.entryById(parentId).catch(()=>null):parentShadow;
      if(parentDurable&&typeof this.db?.updateEntry==='function'){
        const feederState={...(parentDurable.feederState||parentShadow.feederState||{}),universe:'Gemini',justiceArrowEntryId:opened.id,justiceArrowOpenedAtMs:Number(opened.openedAtMs||Date.now()),justiceArrowAuthorizationId:authorizationId};
        await this.db.updateEntry(parentId,{feederState,updatedAtMs:Date.now()}).catch(()=>{});
        this.rememberAnotherDimension({...parentDurable,feederState,updatedAtMs:Date.now()});
      }
      const openedDecision={decision:'OPENED',reason:'justice_arrow_continuation_opened',strategicAuthority:false,justiceArrowContinuation:{...lineage,status:'OPENED',terminal:true,entryId:opened.id,entryAtMs:Number(opened.openedAtMs||Date.now()),entryPriceCents:Number(opened.entryPriceCents||0)}};
      const current=typeof this.db.opportunityEpisode==='function'?await this.db.opportunityEpisode(authorizationId).catch(()=>null):null;
      await this.db.upsertOpportunityEpisode({...baseEpisode(openedDecision),...(current||{}),athenaDecision:openedDecision,fireCommand:structuredClone(opened.entryConfig?.athenaFire||current?.fireCommand||{}),entryId:opened.id,entryAtMs:Number(opened.openedAtMs||Date.now()),attackSelected:'Sagittarius Justice Arrow',updatedAtMs:Date.now()}).catch(()=>{});
      await this.db.audit('info','justice_arrow_continuation_opened',{authorizationId,parentShadowTradeId:parentId,ticker,entryId:opened.id,entryPriceCents:Number(opened.entryPriceCents||0),profitAuthority:opened.entryConfig?.profitAuthority||null}).catch(()=>{});
      return{status:'OPENED',authorizationId,entry:opened};
    }catch(error){await this.db.audit('error','justice_arrow_continuation_failed',{authorizationId,parentShadowTradeId:parentId,ticker,message:String(error?.message||error)}).catch(()=>{});return terminal('continuation_exception',{message:String(error?.message||error)});}
    finally{if(unlock)await unlock().catch(()=>{});this.justiceArrowInFlight.delete(authorizationId);}
  }

  async init() {
    await this.db.init();
    const loadedSettings = await this.db.loadSettings(freshInstallSettings());
    const startupMode = normalizeStartupExecutionMode(loadedSettings, env.allowLiveTrading);
    this.settings = startupMode.settings;
    if (startupMode.recovered) {
      await this.db.saveSettings(this.settings);
      await this.db.audit('warning', 'startup_mode_recovered_to_simulation', {
        release: RELEASE, priorMode:'LIVE', mode:'SIMULATION', reason:startupMode.reason,
        allowLiveTrading:env.allowLiveTrading, engineActive:this.settings.engineActive === true,
      }).catch(() => {});
    }
    await this.db.saveDeploymentConfig(deploymentConfigRecord());
    const stored = await this.db.loadCredentials();
    this.credentials = stored || ((env.kalshiApiKeyId && env.kalshiPrivateKeyPem)
      ? { keyId: env.kalshiApiKeyId, privateKeyPem: env.kalshiPrivateKeyPem }
      : null);
    this.kalshi = new KalshiClient(this.credentials || {}, env.kalshiBaseUrl, env.kalshiFallbackBaseUrl);
    this.gameClock = new GameClockAuthority({
      kalshi: this.kalshi,
      audit: (event, data) => this.db.audit('info', event, data),
    });
    this.learning = new LearningEngine(this.db, this.settings.systemName);
    await this.learning.init();
    this.legacyAthena = new Athena({
      db:this.db, systemName:this.settings.systemName, sourceRelease:RELEASE,
      audit:(event,data)=>this.db.audit('info',event,data),
    });
    // R60-HF1: legacy Athena is research/read-only context. It starts neutral
    // and hydrates after the executable runtime is already alive.
    // R52: Athena-C2 is the single economic strategic entry commander. The R50 Athena
    // object remains loaded only for creation-era/legacy compatibility.
    this.athenaCommander = new AthenaCommander({
      db:this.db, systemName:this.settings.systemName, sourceRelease:RELEASE,
      getSettings:()=>this.settings, legacyAthena:this.legacyAthena,
      audit:(event,data)=>this.db.audit('info',event,data),
    });
    // AthenaCommander can rank immediately from live GREEN geometry using its
    // neutral memory. Historical economic memory is optional enrichment only.
    this.athena = this.athenaCommander;
    this.phoenixCosmo = new PhoenixCosmoEngine({ getSettings:()=>this.settings });
    this.market = new MarketHub({
      kalshi: this.kalshi,
      wsUrl: env.kalshiWsUrl,
      fallbackWsUrl: env.kalshiFallbackWsUrl,
      getCredentials: () => this.credentials,
      onStatus: (ok, ts) => {
        this.health.websocketOk = ok;
        this.health.lastWsMessageMs = ts || this.health.lastWsMessageMs;
        this.recomputeHealth();
      },
      onQuote: (q) => {
        // R55/PC1 Phoenix is a lightweight event-driven observer on the already
        // subscribed market stream. It has no entry/order authority; only a
        // fully confirmed ignition is queued for durable Cosmo materialization.
        try {
          const phoenix=this.phoenixCosmo?.observe?.(q,Date.now());
          if(phoenix?.qualified)this.queuePhoenixSignal(phoenix,q);
        } catch(error) {
          void this.db.audit('warning','phoenix_quote_observer',{ticker:q?.ticker||null,message:String(error?.message||error)}).catch(()=>{});
        }
        try { this.atomicThunderBolt?.observeCounterfactual?.(q,Date.now()); } catch {}
        this.queueQuoteProtection(q?.ticker);
        this.queueGoldenEyeEvaluation(q?.ticker);
        // R59/CI1-F1: update causal crash state before the quote is allowed to
        // wake Atomic Thunder/A8. R58 queued Athena first and only then updated
        // CI1, which let a fresh market quote race a stale crash-state snapshot.
        if (q?.ticker && this.learning) {
          try {
            const observedAtMs=Math.min(Date.now(),Math.max(1,Number(q?.quoteAtMs||q?.updatedAtMs||Date.now())));
            const result=this.learning.observeCrashQuote(q,this.settings,observedAtMs);
            const state = result?.state;
            if (state?.phase === 'CRASHING' || state?.phase === 'REBOUND_CONFIRMED') this.crashPriorityTickers.add(q.ticker);
            else if (state?.phase === 'NORMAL' || state?.phase === 'FINAL') this.crashPriorityTickers.delete(q.ticker);
          } catch(e) {
            void this.db.audit('error','crash_intelligence_quote',{ticker:q.ticker,message:String(e?.message||e)}).catch(()=>{});
          }
        }
        // R63 Gemini / Another Dimension observes the already-cached quote/book state.
        // This call performs no SQL/network I/O on the quote hot path; only a
        // qualified open/close transition is coalesced onto its bounded worker.
        try { this.observeAnotherDimensionQuote(q); } catch(error) {
          void this.db.audit('error','another_dimension_quote_observer',{ticker:q?.ticker||null,message:String(error?.message||error)}).catch(()=>{});
        }
        this.queueAthenaOpportunityEvaluation(q?.ticker);
        if(q?.ticker)this.queueCrystalWallWatch(q.ticker);
      },
      onPrivate: () => this.queueReconcile(),
    });
    // R60 removes FSI1 from the live process. Its historical module/schema stay
    // readable for audits, but quote-rate observation/persistence was redundant
    // with visible Cosmos shadow trades and was the largest reconstructable
    // memory/DB pressure source in R59.
    this.feederSignalIntel = null;
    this.atomicThunderBolt = new AtomicThunderBoltEngine({
      db:this.db, market:this.market, getSettings:()=>this.settings,
      systemName:this.settings.systemName, sourceRelease:RELEASE,
      audit:(event,data)=>this.db.audit('info',event,data),
      onOpportunityCompleted:(episode)=>this.athenaCommander?.learnEpisode?.(episode),
      onCandidateStage:(event)=>this.recordEntryCandidateStage(event),
    });
    // Counterfactual restart hydration is research-only. The authoritative
    // COSMO_GREEN detector is live immediately and does not wait for history.
    this.profitGuard = new ProfitGuard({
      db: this.db,
      kalshi: this.kalshi,
      market: this.market,
      learning: this.learning,
      athena: this.legacyAthena,
      getSettings: () => this.settings,
      onOpportunityCompleted: (episode) => this.athenaCommander?.learnEpisode?.(episode),
      onPositionClosed: (entry) => {
        this.queueScarletContinuation(entry);
        this.queueCrystalWallContinuation(entry);
      },
    });
    this.goldenEye = new GoldenEye({
      db:this.db, market:this.market, getSettings:()=>this.settings,
      audit:(event,data)=>this.db.audit('info',event,data),
    });
    await this.goldenEye.init();
    this.strategy = new StrategyEngine({
      db: this.db,
      kalshi: this.kalshi,
      market: this.market,
      learning: this.learning,
      athena: this.legacyAthena,
      getSettings: () => this.settings,
      getLiveReady: () => this.isLiveReady(),
      refreshGameClock: (q, options) => this.refreshGameClockForQuote(q, options),
      onHunterOpened: (entry) => {
        if (!entry?.ticker) return;
        this.protectedTickers.add(entry.ticker);
        this.invalidateStateSnapshot();
        const wanted = new Set(this.market?.wanted || []);
        wanted.add(entry.ticker);
        this.market?.setWanted?.([...wanted]);
        this.queueGoldenEyeEvaluation(entry.ticker);
      },
      onFeederOpened: (entry) => {
        this.invalidateStateSnapshot();
        if(entry?.ticker)this.feederPriorityTickers.add(entry.ticker);
        if(entry?.ticker&&ACTIVE_FEEDER_CONCEPTS.has(String(entry.conceptName||''))){
          const ticker=String(entry.ticker),rows=this.activeCosmosByTicker.get(ticker)||[];
          if(!rows.some((x)=>String(x.id)===String(entry.id)))this.activeCosmosByTicker.set(ticker,[...rows,entry]);
          this.anotherDimensionSourcePeaks.set(String(entry.id),Math.max(Number(entry.entryPriceCents||0),Number(entry.peakPriceCents||0)));
        }
        this.queueAthenaOpportunityEvaluation(entry?.ticker);
      },
      onShadowAttackOpened: (entry) => {
        this.rememberAnotherDimension(entry);
        this.invalidateStateSnapshot();
        if(entry?.ticker){const wanted=new Set(this.market?.wanted||[]);wanted.add(entry.ticker);this.market?.setWanted?.([...wanted]);}
      },
      onShadowAttackClosed: (entry) => {
        this.rememberAnotherDimension(entry);
        this.anotherDimensionRuntime.delete(String(entry?.id||''));
        if(Number(entry?.pnlCents||0)>0&&String(entry?.closeReason||'')===ANOTHER_DIMENSION.profitableCloseReason){this.anotherDimensionStats.profitClosed+=1;this.queueJusticeArrowContinuation(entry);}
        else if(entry?.status==='closed')this.anotherDimensionStats.lossClosed+=1;
        if(entry?.status==='closed')this.anotherDimensionStats.realizedPnlCents=Number(this.anotherDimensionStats.realizedPnlCents||0)+Number(entry?.pnlCents||0);
        this.anotherDimensionStats.lastEvent={status:'CLOSED',atMs:Date.now(),entryId:entry?.id||null,ticker:entry?.ticker||null,closeReason:entry?.closeReason||null,pnlCents:Number(entry?.pnlCents||0)};
        this.invalidateStateSnapshot();
      },
      onEntryPipeline: (row) => this.recordEntryPipelineCandidateStage(row),
      captureSimulationMutationToken: () => this.simulationMutationGate.capture(),
      enterSimulationMutation: (token) => this.simulationMutationGate.enter(token),
    });
    await this.strategy.init({backgroundResearch:true});
    await this.hydrateAnotherDimension();
    await this.refreshFeederPriorityTickers();
    const trackers = typeof this.db?.trackerHistoryRows==='function'
      ? await this.db.trackerHistoryRows(this.settings.systemName,100)
      : await this.db.trackers(this.settings.systemName,100);
    this.market.hydrateHistories(trackers);
    this.running = true;
    // R54/RGM3 starts only after all trading authorities are hydrated. The
    // first pass immediately compacts non-authoritative startup residue; a
    // detached unref'ed interval keeps pressure governance independent from
    // protection and scanner cadence.
    this.applyResourceGovernance({force:true});
    this.resourceGovernorTimer=setInterval(()=>{try{this.applyResourceGovernance();}catch{}},RUNTIME_RESOURCE_GOVERNOR.sampleIntervalMs);
    this.resourceGovernorTimer.unref?.();
    // R61 Scarlet Needle has no delayed/restart arm state. Post-profit continuation
    // is authorized only by a newly persisted profitable close event.
    this.market.start();
    await this.testConnection().catch((e) => this.recordError('kalshi_connection', e));
    await this.reconcileBroker().catch((e) => this.recordError('reconciliation', e));
    this.protectionLoopPromise = this.protectionLoop();
    this.cyclePromise = this.cycleLoop();
    this.startBackgroundIntelligenceHydration();
    return this;
  }

  startBackgroundIntelligenceHydration(){
    if(this.intelligenceHydrationPromise)return this.intelligenceHydrationPromise;
    const startedAtMs=Date.now();
    this.intelligenceHydration={legacyAthena:'LOADING',athenaCommander:'LOADING',atomicThunderResearch:'LOADING',lastError:null,startedAtMs,completedAtMs:0};
    const legacy=Promise.resolve().then(()=>this.legacyAthena?.init?.()).then(()=>{this.intelligenceHydration={...this.intelligenceHydration,legacyAthena:this.legacyAthena?.loadError?'FAILED':'READY',lastError:this.legacyAthena?.loadError||this.intelligenceHydration.lastError};return this.legacyAthena?.brain||null;}).catch((error)=>{this.intelligenceHydration={...this.intelligenceHydration,legacyAthena:'FAILED',lastError:String(error?.message||error)};return null;});
    const commander=Promise.resolve().then(()=>this.athenaCommander?.refreshLearning?.()).then((memory)=>{this.intelligenceHydration={...this.intelligenceHydration,athenaCommander:'READY'};return memory;}).catch((error)=>{this.intelligenceHydration={...this.intelligenceHydration,athenaCommander:'FAILED',lastError:String(error?.message||error)};return null;});
    const atomic=Promise.resolve().then(()=>this.atomicThunderBolt?.init?.()).then((r)=>{this.intelligenceHydration={...this.intelligenceHydration,atomicThunderResearch:'READY'};return r;}).catch((error)=>{this.intelligenceHydration={...this.intelligenceHydration,atomicThunderResearch:'FAILED',lastError:String(error?.message||error)};return null;});
    const run=Promise.allSettled([legacy,commander,atomic]).then(async()=>{
      this.intelligenceHydration={...this.intelligenceHydration,completedAtMs:Date.now()};
      await this.db.audit('info','background_intelligence_hydration_complete',{release:RELEASE,legacyAthena:this.intelligenceHydration.legacyAthena,athenaCommander:this.intelligenceHydration.athenaCommander,atomicThunderResearch:this.intelligenceHydration.atomicThunderResearch,lastError:this.intelligenceHydration.lastError,tradingBlocked:false}).catch(()=>{});
      return this.intelligenceHydration;
    }).finally(()=>{if(this.intelligenceHydrationPromise===run)this.intelligenceHydrationPromise=null;});
    this.intelligenceHydrationPromise=run;
    return run;
  }

  recomputeHealth() {
    const now = Date.now();
    this.health.protectionOk = this.profitGuard?.protectionOk !== false;
    this.health.protectionFresh = this.health.lastProtectionMs > 0 && now - this.health.lastProtectionMs <= PROTECTION_FRESH_MS;
    const goldenEyeRequired = this.settings?.goldenEyeEnabled === true
      && (this.settings?.mode !== 'LIVE' || this.settings?.goldenEyeLiveEnabled === true);
    this.health.goldenEyeOk = !goldenEyeRequired || this.goldenEye?.healthy !== false;
    this.health.goldenEyeLastError = this.goldenEye?.lastError || null;
    this.health.websocketFresh = this.health.websocketOk && this.health.lastWsMessageMs > 0 && now - this.health.lastWsMessageMs <= WS_FRESH_MS;
    this.health.scannerFresh = this.lastFullScanMs > 0 && now - this.lastFullScanMs <= SCANNER_FRESH_MS;
    this.health.degraded = !(
      this.health.restOk
      && this.health.websocketFresh
      && this.health.reconciliationOk
      && this.health.protectionOk
      && this.health.protectionFresh
      && this.health.goldenEyeOk
      && this.health.scannerFresh
    );
    this.health.lastError = this.lastError;
  }

  recordError(event, e) {
    this.lastError = String(e?.message || e);
    this.health.lastError = this.lastError;
    this.recomputeHealth();
    void this.db.audit('error', event, { message: this.lastError }).catch(() => {});
  }

  markProtection() {
    this.health.lastProtectionMs = Date.now();
    this.recomputeHealth();
  }

  async runProtectionSweep(source = 'backup') {
    try {
      const count = await this.profitGuard.sweep();
      this.protectedTickers = new Set(this.profitGuard.activeTickers || []);
      this.markProtection();
      return count;
    } catch (e) {
      this.recomputeHealth();
      await this.db.audit('error', 'profit_guard_sweep', { source, message: String(e?.message || e) }).catch(() => {});
      throw e;
    }
  }

  async runReferenceSignalSweep(source = 'reference_30s') {
    try {
      await this.strategy?.expirePhoenixSignals?.(Date.now()).catch(async(error)=>{await this.db.audit('warning','phoenix_expiry_sweep',{source,message:String(error?.message||error)}).catch(()=>{});});
      const count=await this.profitGuard.referenceSweep();
      this.lastReferenceSweepMs=Date.now();
      return count;
    } catch(e) {
      await this.db.audit('warning','reference_signal_sweep',{source,message:String(e?.message||e)}).catch(()=>{});
      return 0;
    }
  }

  async runPostExitResearchIfDue(source='post_exit',force=false) {
    const now=Date.now();
    // Post-exit counterfactual research has no protection or entry authority.
    // Under RGM3 pressure it yields completely; forced diagnostic/manual work
    // remains available and ordinary cadence resumes once pressure clears.
    if(!force&&this.resourceResearchDeferred===true)return 0;
    if(!force&&now-this.lastPostExitResearchMs<POST_EXIT_RESEARCH.sweepIntervalMs)return 0;
    // Set the cadence marker before starting the bounded work so overlapping
    // full/fast phases cannot fan out duplicate post-exit market refreshes.
    this.lastPostExitResearchMs=now;
    try{return await this.profitGuard.trackPostExit();}
    catch(error){await this.db.audit('warning','post_exit_research_sweep',{source,message:String(error?.message||error)}).catch(()=>{});return 0;}
  }

  queueQuoteProtection(ticker) {
    if (!ticker || !this.running || !this.profitGuard || !this.protectedTickers.has(ticker)) return;
    if (this.quoteProtectionTimers.has(ticker)) return;
    const timer = setTimeout(() => {
      this.quoteProtectionTimers.delete(ticker);
      const queue=this.quoteProtectionQueue||(this.quoteProtectionQueue=new CoalescingWorkQueue({maxConcurrency:QUOTE_PROTECTION_CONCURRENCY}));
      queue.enqueue(String(ticker), async()=>{
        try {
          await this.profitGuard.protectTicker(ticker);
          this.markProtection();
          await this.learning.trackStopGuardRecovery?.(this.market.quotes,this.settings,this.market,{ticker}).catch(async(error)=>{
            await this.db.audit('warning','stop_guard_recovery_tracking',{ticker,message:String(error?.message||error)}).catch(()=>{});
          });
        } catch (e) {
          await this.db.audit('error', 'profit_guard_quote', { ticker, message: String(e?.message || e) }).catch(() => {});
          this.recomputeHealth();
        }
      });
    }, 125);
    this.quoteProtectionTimers.set(ticker, timer);
  }

  queuePhoenixSignal(qualification,q=null) {
    const ticker=String(qualification?.ticker||q?.ticker||'');
    if(!ticker||!this.running||!this.strategy||!this.referenceSignalGate().allowed)return;
    const simulationToken=this.settings?.mode==='SIMULATION'?this.simulationMutationGate.capture():null;
    const queue=this.phoenixSignalQueue;
    queue.enqueue(`phoenix:${ticker}`,async()=>{
      let releaseSimulationWork=null;
      if(this.settings?.mode==='SIMULATION'){
        releaseSimulationWork=this.simulationMutationGate.enter(simulationToken);
        if(!releaseSimulationWork)return;
      }
      try{
        const live=this.market?.getQuote?.(ticker)||q;
        if(!live)return;
        await this.strategy.materializePhoenixSignal(live,qualification);
      }finally{try{releaseSimulationWork?.();}catch{}}
    });
  }

  queueAthenaOpportunityEvaluation(ticker) {
    if (!ticker || !this.running || !this.strategy || !this.atomicThunderBolt || !this.athenaCommander) return;
    if (!this.entryExecutionGate().allowed) return;
    const simulationToken=this.settings?.mode==='SIMULATION'?this.simulationMutationGate.capture():null;
    // EAC2 is the quote-event authority boundary. R57's scanner path used EAC1
    // but this centralized quote path bypassed it, allowing A8/Athena FIRE to
    // run before a later createHunter() Game Clock rejection. No expensive
    // intelligence is queued unless a current lane is clock-admissible or has
    // earned one bounded authority probe.
    if(!this.shouldQueueInitialExposure(ticker,{allowProbe:true}))return;
    if (this.athenaOpportunityTimers.has(ticker)) return;
    const timer=setTimeout(()=>{
      this.athenaOpportunityTimers.delete(ticker);
      const queue=this.entryEvaluationQueue||(this.entryEvaluationQueue=new CoalescingWorkQueue({maxConcurrency:ENTRY_EVALUATION_CONCURRENCY}));
      queue.enqueue(`athena:${ticker}`,async()=>{
        let releaseSimulationWork=null;
        if(this.settings?.mode==='SIMULATION'){
          releaseSimulationWork=this.simulationMutationGate.enter(simulationToken);
          if(!releaseSimulationWork)return;
        }
        try{
          const q=this.market?.getQuote?.(ticker);if(!q)return;
          await this.evaluateNewGenerationOpportunities(new Map([[ticker,q]]),{onlyTicker:ticker});
        }catch(e){await this.db.audit('error','athena_opportunity_quote_evaluation',{ticker,message:String(e?.message||e)}).catch(()=>{});}
        finally{try{releaseSimulationWork?.();}catch{}}
      });
    },125);
    this.athenaOpportunityTimers.set(ticker,timer);
  }

  async evaluateNewGenerationOpportunities(marketMap,{onlyTicker=null}={}) {
    if (!this.entryExecutionGate().allowed || !this.atomicThunderBolt || !this.athenaCommander || !this.strategy) return [];
    // Telemetry/dedup state is constructor-owned in production, but keep the
    // authority path self-healing for focused harnesses and restart/recovery
    // edges. These maps can only suppress duplicate work; they never authorize
    // an entry.
    if(!(this.athenaDecisionMemo instanceof Map))this.athenaDecisionMemo=new Map();
    if(!(this.athenaDecisionInFlight instanceof Set))this.athenaDecisionInFlight=new Set();
    if(!this.entryDecisionDedupStats||typeof this.entryDecisionDedupStats!=='object')this.entryDecisionDedupStats={athenaEvaluated:0,athenaUnchangedSuppressed:0,athenaInFlightSuppressed:0,athenaChangedStateRetries:0};
    const s=this.settings, now=Date.now();
    // EAC3 defense-in-depth: prove the hard clock/window boundary before any
    // DB fanout, Cosmos GREEN work, or Athena ranking.
    // A PROBE is resolved once through the authoritative GCA2 refresh and then
    // re-evaluated; failure remains upstream and never turns into a post-FIRE
    // Game Clock choke.
    const candidates=[];
    for(const [ticker,original] of marketMap||[]){
      if(onlyTicker&&ticker!==onlyTicker)continue;
      const q=original;if(!q)continue;
      let admission=this.entryChainAdmissionForQuote(q,{lane:'ANY',now:Date.now()});
      if(admission.action==='PROBE'){
        const refreshed=await this.refreshGameClockForQuote(q,{forceFresh:true}).catch(()=>null);
        if(refreshed?.gameClockState)admission=this.entryChainAdmissionForQuote(q,{lane:'ANY',now:Date.now()});
        else admission={action:'BLOCK',reason:'game_clock_probe_failed',stage:admission.stage||null,lane:admission.lane||null};
      }
      if(admission.action!=='ALLOW'){
        await this.db.audit('info','entry_chain_upstream_admission_blocked',{ticker:q.ticker,eventTicker:q.eventTicker||q.ticker,reason:admission.reason,stage:admission.stage||null,lane:admission.lane||null,lastEligibleAtMs:admission.lastEligibleAtMs||null,readyAtMs:admission.readyAtMs||null}).catch(()=>{});
        continue;
      }
      candidates.push(q);
    }
    if(!candidates.length)return[];
    const recoveryCutoff=Date.now()-Math.max(1,Number(s.recoveryTrackingHours||24))*3600000;
    const [openRows,recoveryRows]=await Promise.all([
      (typeof this.db?.openEntries==='function'?this.db.openEntries(s.systemName):this.db.entries(s.systemName,{limit:5000})).catch(()=>[]),
      (typeof this.db?.recoverySourceEntries==='function'?this.db.recoverySourceEntries(s.systemName,{sinceMs:recoveryCutoff}):this.db.entries(s.systemName,{limit:5000})).catch(()=>[]),
    ]);
    const rows=openRows||[];
    const cosmosRows=rows.filter(e=>ACTIVE_FEEDER_CONCEPTS.has(e.conceptName)&&openLike(e.status));
    const recoveryLosses=typeof this.db?.recoverySourceEntries==='function'?(recoveryRows||[]):this.strategy.recoverySourcesFromEntries(recoveryRows||[],s);
    const observations=await this.strategy.recoveryObservationsBySource(recoveryLosses.map((e)=>e.id)).catch(()=>new Map());
    const maxRays=Math.max(1,Math.floor(Number(s.lightningPlasmaMaxStrikes||1)));
    // One ray can never reserve more than its equal share of the operator's
    // total field budget. The DB reservation below authoritatively caps both
    // ray count and aggregate budget across processes.
    const fieldBudgetCents=Math.max(1,Number(s.lightningPlasmaFieldStakeCents||0));
    const rayStakeCents=Math.max(1,Math.floor(fieldBudgetCents/maxRays));
    // R59/LP1-F2: Plasma fields are defined by independently qualified *Cosmos*,
    // never by the number of active Atomic Thunder Bolts. Build one current
    // field from the exact source quotes available in MarketHub/this scan.
    const plasmaMarketMap=new Map();
    for(const source of cosmosRows){const quote=marketMap?.get?.(source.ticker)||this.market?.getQuote?.(source.ticker)||null;if(quote)plasmaMarketMap.set(String(source.ticker),quote);}
    const plasmaField=s.lightningPlasmaEnabled===true?lightningPlasmaFieldSelection(cosmosRows,plasmaMarketMap,s,now):{fieldId:null,sourceCount:0,independentEventCount:0,minCosmos:LIGHTNING_PLASMA.minCosmos,minStrikes:LIGHTNING_PLASMA.minStrikes,maxStrikes:maxRays,qualifies:false,candidates:[]};
    const fieldWindowMs=Math.max(1000,Number(s.lightningPlasmaFieldWindowSeconds??LIGHTNING_PLASMA.fieldWindowMs/1000)*1000);
    const fieldExpiresAtMs=plasmaField.qualifies&&plasmaField.candidates.length?Math.min(...plasmaField.candidates.map(x=>Number(x?.qualification?.observedAtMs||now)+fieldWindowMs)):now;
    const fieldId=plasmaField.fieldId||null;
    const plasmaByTicker=new Map((plasmaField.candidates||[]).map(x=>[String(x?.source?.ticker||''),x]));
    const created=[];
    for(const original of candidates){
      const q={...original};
      // R52: Athena's historical sport profiles are only useful when the live
      // Bolt receives the same deterministic classification. Do this locally
      // with zero database work so quote-rate evaluation cannot create a new
      // pressure path.
      const detectedSport=classifyDeterministic(q.ticker,q.title||q.marketTitle||'')?.sportName||'Unknown';
      if(!q.sport||String(q.sport)==='Unknown')q.sport=detectedSport;
      if(!q.sportName||String(q.sportName)==='Unknown')q.sportName=detectedSport;
      const state=q.gameClockState||{};
      if(isConfirmedGameClockState(state,q.eventTicker||q.ticker)&&Number(state.startTimeMs)>0)q.gameMinutes=Math.max(0,(now-Number(state.startTimeMs))/60000);
      const cosmos=cosmosRows.filter(e=>String(e.ticker||'')===String(q.ticker||''));
      // Keep CI1 current for Dragon/Crash-Recovery specialist context and
      // historical research. It has no veto over the R60 GREEN command path.
      // Use the quote's own observation time, not wall-clock now, so an actually
      // stale quote cannot manufacture a fresh crash-state timestamp.
      if(typeof this.learning?.observeCrashQuote==='function'){
        const observedAtMs=Math.min(Date.now(),Math.max(1,Number(q?.quoteAtMs||q?.updatedAtMs||Date.now())));
        try{this.learning.observeCrashQuote(q,s,observedAtMs);}catch(error){await this.db.audit('warning','ci1_candidate_refresh_failed',{ticker:q.ticker,message:String(error?.message||error)}).catch(()=>{});}
      }
      const crashSignal=typeof this.learning?.crashEntrySignal==='function'?this.learning.crashEntrySignal(q.ticker):null;
      const crashState=typeof this.learning?.crashState==='function'?this.learning.crashState(q.ticker):null;
      const recoverySource=recoveryLosses.filter(e=>String(e.ticker||'')===String(q.ticker||'')).sort((a,b)=>Number(b.closedAtMs||0)-Number(a.closedAtMs||0))[0]||null;
      let recoveryContext=null;
      if(recoverySource){
        const obs=observations.get(String(recoverySource.id))||null;
        const bid=Number(q.yesBid||0),exit=Number(recoverySource.exitPriceCents||0),persisted=Number(obs?.trough_cents||0);
        const trough=[bid,exit,persisted].filter(v=>v>0).reduce((a,b)=>Math.min(a,b),Infinity);
        recoveryContext={eligible:true,sourceTradeId:recoverySource.id,sourceConcept:recoverySource.conceptName,troughCents:Number.isFinite(trough)?trough:exit,reboundCents:Number.isFinite(trough)?Math.max(0,bid-trough):0,observationId:obs?.id||null};
      }
      const plasmaStrike=plasmaByTicker.get(String(q.ticker||''))||null;
      const aeCandidate=this.activeAthenaExclamationCandidate(q.ticker,now);
      const preliminaryFieldContext={version:LIGHTNING_PLASMA.version,fieldId,lightningPlasmaQualified:plasmaField.qualifies===true,currentTickerEligible:Boolean(plasmaStrike),currentEventEligible:Boolean(plasmaStrike),sourceCount:Number(plasmaField.sourceCount||0),cosmoCount:cosmos.length,independentEventCount:Number(plasmaField.independentEventCount||0),minCosmos:Number(plasmaField.minCosmos||LIGHTNING_PLASMA.minCosmos),minStrikes:Number(plasmaField.minStrikes||LIGHTNING_PLASMA.minStrikes),maxRays,rayStakeCents,fieldBudgetCents,expiresAtMs:fieldExpiresAtMs,sourceCosmoId:plasmaStrike?.source?.id||null,athenaExclamationCandidate:aeCandidate,goldSaintCount:Number(aeCandidate?.saintCount||0)};
      // R61 Scarlet Needle no longer participates in the Bolt/retracement lane.
      // These fresh features remain normal Athena context for ordinary Attacks.
      const survivalFeatures=atomicThunderBoltFeatures({q,history:this.market?.getHistory?.(q.ticker)||[],settings:s,cosmos,crashSignal,recoveryContext,fieldContext:preliminaryFieldContext,now});
      const openEntriesOnTicker=(rows||[]).filter(e=>String(e.ticker||'')===String(q.ticker||'')&&openLike(e.status));
      const preTriggerContext={cosmos,crashSignal,crashState,survivalFeatures,recoveryContext,recoverySource,fieldContext:preliminaryFieldContext,openEntriesOnTicker};
      const atbAdmission=await this.resolveEntryChainAdmission(q,{lane:'ATB',forceProbe:true});
      let bolt=null;
      if(atbAdmission.action==='ALLOW')bolt=await this.atomicThunderBolt.detect(q,{cosmos,crashSignal,crashState,recoveryContext,fieldContext:preliminaryFieldContext,now});
      else await this.db.audit('info','atomic_thunder_green_admission_blocked',{ticker:q.ticker,eventTicker:q.eventTicker||q.ticker,reason:atbAdmission.reason,stage:atbAdmission.stage||null,lastEligibleAtMs:atbAdmission.lastEligibleAtMs||null,readyAtMs:atbAdmission.readyAtMs||null}).catch(()=>{});
      if(!bolt)continue;
      // COSMO_GREEN earns only a Bolt, never clock authority. Re-prove fresh
      // GCA2 authorization before Athena so a stale/final event cannot FIRE.
      const postBoltAdmission=await this.resolveEntryChainAdmission(q,{lane:'POST_BOLT',forceProbe:true});
      if(postBoltAdmission.action!=='ALLOW'){
        await this.db.audit('info','post_bolt_clock_admission_blocked',{boltId:bolt.id,ticker:q.ticker,eventTicker:q.eventTicker||q.ticker,reason:postBoltAdmission.reason,lastEligibleAtMs:postBoltAdmission.lastEligibleAtMs||null}).catch(()=>{});
        this.recordEntryCandidateStage({candidateId:this.candidateIdForBolt(bolt),boltId:bolt.id,ticker:q.ticker,eventTicker:q.eventTicker||q.ticker,stage:'POST_BOLT_BLOCKED',status:'BLOCKED',reason:postBoltAdmission.reason});
        continue;
      }
      if(isConfirmedGameClockState(q.gameClockState,q.eventTicker||q.ticker)&&Number(q.gameClockState.startTimeMs)>0)q.gameMinutes=Math.max(0,(Date.now()-Number(q.gameClockState.startTimeMs))/60000);
      const eventAdmission=await this.strategy.hunterEventAdmissionState(q).catch(()=>null);
      if(!eventAdmission){await this.db.audit('warning','post_bolt_event_policy_unavailable',{boltId:bolt.id,ticker:q.ticker}).catch(()=>{});this.recordEntryCandidateStage({candidateId:this.candidateIdForBolt(bolt),boltId:bolt.id,ticker:q.ticker,eventTicker:q.eventTicker||q.ticker,stage:'POST_BOLT_BLOCKED',status:'BLOCKED',reason:'event_policy_unavailable'});continue;}
      if(eventAdmission.eventCapBlocked){await this.db.audit('info','post_bolt_event_cap_blocked',{boltId:bolt.id,ticker:q.ticker,eventTicker:eventAdmission.eventTicker,activeEntries:eventAdmission.activeEntries,maxEntriesPerTrade:eventAdmission.maxEntriesPerTrade}).catch(()=>{});this.recordEntryCandidateStage({candidateId:this.candidateIdForBolt(bolt),boltId:bolt.id,ticker:q.ticker,eventTicker:q.eventTicker||q.ticker,stage:'POST_BOLT_BLOCKED',status:'BLOCKED',reason:'event_entry_cap'});continue;}
      const athenaExclamationEligible=Boolean(preliminaryFieldContext.athenaExclamationCandidate);
      if(eventAdmission.cooldownBlocked&&!athenaExclamationEligible){await this.db.audit('info','post_bolt_cooldown_blocked',{boltId:bolt.id,ticker:q.ticker,eventTicker:eventAdmission.eventTicker,hunterCooldownMinutes:eventAdmission.hunterCooldownMinutes,cooldownScope:eventAdmission.cooldownScope,latestHunterEntryMs:eventAdmission.latestHunterEntryMs}).catch(()=>{});this.recordEntryCandidateStage({candidateId:this.candidateIdForBolt(bolt),boltId:bolt.id,ticker:q.ticker,eventTicker:q.eventTicker||q.ticker,stage:'POST_BOLT_BLOCKED',status:'BLOCKED',reason:'hunter_cooldown'});continue;}
      const fieldContext={...preliminaryFieldContext};
      const commandContext={cosmos,crashSignal,crashState,recoveryContext,recoverySource,fieldContext,entryAdmission:eventAdmission,openEntriesOnTicker};
      const candidateId=this.candidateIdForBolt(bolt),decisionFingerprint=this.athenaStateFingerprint({bolt,q,crashState,cosmos,recoveryContext,fieldContext,eventAdmission,openEntriesOnTicker:commandContext.openEntriesOnTicker});
      const priorDecision=this.athenaDecisionMemo.get(String(bolt.id));
      if(priorDecision?.fingerprint===decisionFingerprint){this.entryDecisionDedupStats.athenaUnchangedSuppressed+=1;continue;}
      if(this.athenaDecisionInFlight.has(String(bolt.id))){this.entryDecisionDedupStats.athenaInFlightSuppressed+=1;continue;}
      if(priorDecision)this.entryDecisionDedupStats.athenaChangedStateRetries+=1;
      this.athenaDecisionInFlight.add(String(bolt.id));this.entryDecisionDedupStats.athenaEvaluated+=1;
      let decision=null;
      try{decision=await this.athenaCommander.decide(bolt,commandContext);this.setBoundedRuntimeMap(this.athenaDecisionMemo,String(bolt.id),{fingerprint:decisionFingerprint,decision:String(decision?.decision||''),reason:String(decision?.reason||''),atMs:Date.now()},ENTRY_CANDIDATE_FUNNEL.maximumCandidates);}
      finally{this.athenaDecisionInFlight.delete(String(bolt.id));}
      this.atomicThunderBolt.noteDecision(bolt,decision);
      if(decision.decision!=='FIRE'){
        this.recordEntryCandidateStage({candidateId,boltId:bolt.id,ticker:q.ticker,eventTicker:q.eventTicker||q.ticker,stage:decision.decision==='WATCH'?'ATHENA_WATCH':'ATHENA_REJECT',status:'BLOCKED',reason:decision.reason||String(decision.decision||'reject').toLowerCase()});
        continue;
      }
      this.recordEntryCandidateStage({candidateId,boltId:bolt.id,ticker:q.ticker,eventTicker:q.eventTicker||q.ticker,stage:'ATHENA_FIRE',status:'PASS',reason:decision.reason||'fire'});
      // AE1 qualifications now originate only from a real Athena-selected Gold
      // Saint. Recording the vote has no authority over the current FIRE and
      // cannot execute a Big Bang by itself; it may form a durable candidate
      // for a future Bolt on this exact ticker.
      if(GOLD_SAINT_ATTACKS.has(String(decision.selectedAttack||''))){
        try{
          if(typeof this.strategy?.athenaExclamation?.recordQualification==='function')await this.strategy.athenaExclamation.recordQualification({conceptName:String(decision.selectedAttack),ticker:q.ticker,eventTicker:q.eventTicker||q.ticker,qualifiedAtMs:Date.now(),priceCents:Number(q.yesAsk||0),bidCents:Number(q.yesBid||0),sourceFeeder:cosmos?.[0]?.conceptName||null,sourceTradeId:cosmos?.[0]?.id||null,gameMinutes:q.gameMinutes??null,qualificationSnapshot:{version:'A3-GOLD-SAINT-Q1',boltId:bolt.id,commandHash:decision.fireCommand?.commandHash||null,selectedAttack:String(decision.selectedAttack),fieldContext:structuredClone(fieldContext)}});
        }catch(error){await this.db.audit('warning','athena_gold_saint_vote_failed',{boltId:bolt.id,ticker:q.ticker,concept:decision.selectedAttack,message:String(error?.message||error)}).catch(()=>{});}
      }
      let plasmaReservation=null;
      if(decision.selectedAttack==='Lightning Plasma'){
        if(fieldContext.lightningPlasmaQualified!==true||fieldContext.currentTickerEligible!==true||!fieldId||Number(fieldExpiresAtMs)<=Date.now()){
          await this.db.audit('info','athena_fire_execution_aborted',{boltId:bolt.id,ticker:q.ticker,concept:'Lightning Plasma',reason:'lightning_plasma_field_no_longer_executable',fieldId,independentEventCount:fieldContext.independentEventCount}).catch(()=>{});
          this.recordEntryCandidateStage({candidateId,boltId:bolt.id,ticker:q.ticker,eventTicker:q.eventTicker||q.ticker,stage:'EXECUTION_BLOCKED',status:'BLOCKED',reason:'lightning_plasma_field_no_longer_executable'});
          continue;
        }
        plasmaReservation=await this.db.reserveLightningPlasmaRay({systemName:s.systemName,fieldId,eventTicker:q.eventTicker||q.ticker,boltId:bolt.id,stakeCents:Number(decision.fireCommand?.stakeCents||rayStakeCents),fieldBudgetCents,maxRays,expiresAtMs:fieldExpiresAtMs}).catch(()=>null);
        if(!plasmaReservation?.ok){
          await this.db.audit('info','athena_fire_execution_aborted',{boltId:bolt.id,ticker:q.ticker,concept:'Lightning Plasma',reason:`lightning_plasma_${plasmaReservation?.reason||'reservation_failed'}`,fieldId,maxRays}).catch(()=>{});
          this.recordEntryCandidateStage({candidateId,boltId:bolt.id,ticker:q.ticker,eventTicker:q.eventTicker||q.ticker,stage:'EXECUTION_BLOCKED',status:'BLOCKED',reason:`lightning_plasma_${plasmaReservation?.reason||'reservation_failed'}`});
          continue;
        }
      }
      this.recordEntryCandidateStage({candidateId,boltId:bolt.id,ticker:q.ticker,eventTicker:q.eventTicker||q.ticker,stage:'EXECUTION_ELIGIBLE',status:'PASS',reason:'fire_and_hard_preconditions_ready'});
      const e=await this.strategy.executeAthenaFire(q,bolt,decision,commandContext);
      if(e){
        created.push(e);this.atomicThunderBolt.consume(bolt.id,q.ticker);
        if(plasmaReservation?.ok)await this.db.linkLightningPlasmaReservation({systemName:s.systemName,fieldId,boltId:bolt.id,entryId:e.id}).catch(()=>{});
      }
    }
    return created;
  }

  queueGoldenEyeEvaluation(ticker) {
    if (!ticker || !this.running || !this.goldenEye || !this.protectedTickers.has(ticker)) return;
    if (this.goldenEyeExecutionPromise) {
      this.goldenEyeRerunRequested = true;
      return;
    }
    if (this.goldenEyeEvaluationPromise) {
      this.goldenEyeRerunRequested = true;
      return;
    }
    if (this.goldenEyeTimer) return;
    this.goldenEyeTimer = setTimeout(() => {
      this.goldenEyeTimer = null;
      void this.runGoldenEyeEvaluation('quote_event').catch(async (e) => {
        this.recomputeHealth();
        await this.db.audit('error','golden_eye_evaluation',{message:String(e?.message||e)}).catch(()=>{});
      });
    }, GOLDEN_EYE.minimumSampleIntervalMs);
  }

  async runGoldenEyeEvaluation(source = 'quote_event') {
    if (!this.goldenEye || this.goldenEyeExecutionPromise) return null;
    if (this.goldenEyeEvaluationPromise) {
      this.goldenEyeRerunRequested = true;
      return this.goldenEyeEvaluationPromise;
    }
    this.goldenEyeEvaluationPromise = (async () => {
      const entries = (typeof this.db.openHunterEntries === 'function'
        ? await this.db.openHunterEntries(this.settings.systemName)
        : (await this.db.openEntries(this.settings.systemName)).filter((e)=>PORTFOLIO_CONCEPTS.has(e.conceptName)))
        .filter((e) => e.status === 'open');
      const observed = await this.goldenEye.observe(entries, Date.now());
      this.recomputeHealth();
      const signal = observed?.signal;
      if (!signal) return observed;

      const hasFrozenGoldenEye = entries.some((e) => String(e?.entryConfig?.profitAuthority || '') === GOLDEN_EYE.version);
      // Current enablement controls new authority assignment, but already-open
      // SIM Hunters whose immutable snapshot delegated profit authority to
      // Golden Eye must remain protected if the operator later toggles the
      // setting. LIVE autonomy remains separately fail-closed.
      const simulationAllowed = this.settings.mode === 'SIMULATION'
        && (this.settings.goldenEyeEnabled === true || hasFrozenGoldenEye);
      const liveAllowed = this.settings.mode === 'LIVE'
        && this.settings.goldenEyeEnabled === true
        && this.settings.goldenEyeLiveEnabled === true
        && this.goldenEye.healthy === true
        && this.isLiveReady();
      if (!simulationAllowed && !liveAllowed) {
        await this.db.audit('info','golden_eye_shadow_signal',{...signal,source,mode:this.settings.mode,enabled:this.settings.goldenEyeEnabled===true,liveEnabled:this.settings.goldenEyeLiveEnabled===true,healthy:this.goldenEye.healthy===true});
        return observed;
      }

      this.goldenEyeExecutionPromise = (async () => {
        const result = await this.manualCashout({ allProfitable:true }, 'golden_eye_cashout');
        await this.goldenEye.noteExecution(signal,result,Date.now());
        this.recomputeHealth();
        await this.db.audit(result.errorCount>0?'warning':'info','golden_eye_cashout',{...signal,source,closedCount:result.closedCount,partialCount:result.partialCount,pendingCount:result.pendingCount,skippedCount:result.skippedCount,errorCount:result.errorCount,totalProfitCents:result.totalProfitCents});
        return result;
      })();
      try { await this.goldenEyeExecutionPromise; } finally { this.goldenEyeExecutionPromise = null; }
      return observed;
    })();
    try {
      return await this.goldenEyeEvaluationPromise;
    } finally {
      this.goldenEyeEvaluationPromise = null;
      if (this.goldenEyeRerunRequested && !this.goldenEyeExecutionPromise && this.running) {
        this.goldenEyeRerunRequested = false;
        queueMicrotask(() => {
          void this.runGoldenEyeEvaluation('quote_rerun').catch(async (e) => {
            this.recomputeHealth();
            await this.db.audit('error','golden_eye_evaluation',{message:String(e?.message||e)}).catch(()=>{});
          });
        });
      }
    }
  }

  setBoundedRuntimeMap(map,key,value,limit=ENTRY_CANDIDATE_FUNNEL.maximumCandidates){
    if(map.has(key))map.delete(key);map.set(key,value);
    while(map.size>limit){const first=map.keys().next().value;map.delete(first);}
  }

  recordEntryCandidateStage(event={}){
    const candidateId=String(event.candidateId||event.preBoltId||'');if(!candidateId)return null;
    // Keep the telemetry hook safe for focused/unit harnesses that construct an
    // Engine from its prototype, and for any future recovery path that invokes
    // the hook before the normal constructor-owned runtime maps are hydrated.
    // These are telemetry/dedup structures only; lazily creating them can never
    // grant trading authority.
    if(!(this.entryCandidateFunnel instanceof Map))this.entryCandidateFunnel=new Map();
    if(!this.entryCandidateFunnelTotals||typeof this.entryCandidateFunnelTotals!=='object')this.entryCandidateFunnelTotals={uniqueCandidates:0,byStage:{}};
    if(!this.entryCandidateFunnelTotals.byStage||typeof this.entryCandidateFunnelTotals.byStage!=='object')this.entryCandidateFunnelTotals.byStage={};
    if(!Array.isArray(this.entryCandidateFunnelRecent))this.entryCandidateFunnelRecent=[];
    if(!this.entryDecisionDedupStats||typeof this.entryDecisionDedupStats!=='object')this.entryDecisionDedupStats={athenaEvaluated:0,athenaUnchangedSuppressed:0,athenaInFlightSuppressed:0,athenaChangedStateRetries:0};
    const stage=String(event.stage||'UNKNOWN'),status=String(event.status||'INFO'),reason=event.reason==null?null:String(event.reason),atMs=Number(event.atMs||Date.now());
    let rec=this.entryCandidateFunnel.get(candidateId);
    if(!rec){rec={candidateId,ticker:String(event.ticker||''),eventTicker:String(event.eventTicker||event.ticker||''),boltId:event.boltId||null,firstAtMs:atMs,lastAtMs:atMs,currentStage:stage,currentStatus:status,currentReason:reason,stages:{}};this.entryCandidateFunnelTotals.uniqueCandidates+=1;}
    rec.ticker=String(event.ticker||rec.ticker||'');rec.eventTicker=String(event.eventTicker||rec.eventTicker||rec.ticker||'');rec.boltId=event.boltId||rec.boltId||null;rec.lastAtMs=atMs;rec.currentStage=stage;rec.currentStatus=status;rec.currentReason=reason;
    if(!rec.stages[stage]){rec.stages[stage]={status,reason,atMs};this.entryCandidateFunnelTotals.byStage[stage]=Number(this.entryCandidateFunnelTotals.byStage[stage]||0)+1;}
    else rec.stages[stage]={...rec.stages[stage],status,reason,lastAtMs:atMs};
    this.setBoundedRuntimeMap(this.entryCandidateFunnel,candidateId,rec);
    this.entryCandidateFunnelRecent.push({candidateId,boltId:rec.boltId,ticker:rec.ticker,eventTicker:rec.eventTicker,stage,status,reason,atMs});
    if(this.entryCandidateFunnelRecent.length>ENTRY_CANDIDATE_FUNNEL.maximumRecent)this.entryCandidateFunnelRecent.splice(0,this.entryCandidateFunnelRecent.length-ENTRY_CANDIDATE_FUNNEL.maximumRecent);
    return rec;
  }

  recordEntryPipelineCandidateStage(row={}){
    const candidateId=String(row?.candidateId||'');if(!candidateId)return;
    if(row.stage==='OPENED'&&row.status==='PASS')this.recordEntryCandidateStage({candidateId,boltId:row.boltId||null,ticker:row.ticker,eventTicker:row.eventTicker,stage:'OPENED',status:'PASS',reason:row.reason||'open',atMs:row.atMs});
    else if(row.status==='BLOCKED')this.recordEntryCandidateStage({candidateId,boltId:row.boltId||null,ticker:row.ticker,eventTicker:row.eventTicker,stage:'EXECUTION_BLOCKED',status:'BLOCKED',reason:row.reason||String(row.stage||'execution').toLowerCase(),atMs:row.atMs});
  }

  entryCandidateFunnelSummary(){
    if(!(this.entryCandidateFunnel instanceof Map))this.entryCandidateFunnel=new Map();
    if(!this.entryCandidateFunnelTotals||typeof this.entryCandidateFunnelTotals!=='object')this.entryCandidateFunnelTotals={uniqueCandidates:0,byStage:{}};
    if(!Array.isArray(this.entryCandidateFunnelRecent))this.entryCandidateFunnelRecent=[];
    if(!this.entryDecisionDedupStats||typeof this.entryDecisionDedupStats!=='object')this.entryDecisionDedupStats={athenaEvaluated:0,athenaUnchangedSuppressed:0,athenaInFlightSuppressed:0,athenaChangedStateRetries:0};
    const currentByStage={},currentByReason={};
    for(const rec of this.entryCandidateFunnel.values()){currentByStage[rec.currentStage]=Number(currentByStage[rec.currentStage]||0)+1;if(rec.currentReason)currentByReason[rec.currentReason]=Number(currentByReason[rec.currentReason]||0)+1;}
    return{version:ENTRY_CANDIDATE_FUNNEL.version,maximumCandidates:ENTRY_CANDIDATE_FUNNEL.maximumCandidates,uniqueCandidates:Number(this.entryCandidateFunnelTotals.uniqueCandidates||0),retainedCandidates:this.entryCandidateFunnel.size,byStage:{...(this.entryCandidateFunnelTotals.byStage||{})},currentByStage,currentByReason,dedup:{...this.entryDecisionDedupStats},recent:this.entryCandidateFunnelRecent.slice().reverse()};
  }

  candidateIdForBolt(bolt){return String(bolt?.preBoltClearance?.preBoltId||bolt?.id||'');}

  activeAthenaExclamationCandidate(ticker,now=Date.now()){
    const ae=this.strategy?.athenaExclamation,id=ae?.activeEventByTicker?.get?.(String(ticker||''));if(!id)return null;
    const event=ae?.events?.get?.(String(id))||null;
    if(!event||Number(event.expiresAtMs||0)<=Number(now)||Number(event.saintCount||0)<ATHENA_EXCLAMATION.minimumSaints)return null;
    return{id:String(event.id),ticker:String(event.ticker||ticker||''),eventTicker:String(event.eventTicker||event.ticker||ticker||''),saintCount:Number(event.saintCount||0),combination:[...(event.combination||[])],createdAtMs:Number(event.createdAtMs||0),expiresAtMs:Number(event.expiresAtMs||0)};
  }

  executionBookState(ticker,requested=1,limitCents=null){
    const count=Math.max(1,Math.floor(Number(requested||1)));
    if(typeof this.market?.executableAsk!=='function')return null;
    try{
      const exec=this.market.executableAsk(String(ticker||''),count,limitCents==null?undefined:Number(limitCents));
      if(!exec)return{requested:count,filled:0,full:false,bestCents:null,avgCents:null};
      return{requested:count,filled:Math.max(0,Math.floor(Number(exec.filled||0))),full:exec.full===true,bestCents:Number.isFinite(Number(exec.bestCents))?Number(exec.bestCents):null,avgCents:Number.isFinite(Number(exec.avgCents))?Number(Number(exec.avgCents).toFixed(4)):null};
    }catch{return null;}
  }

  athenaStateFingerprint({bolt,q,crashState,cosmos=[],recoveryContext=null,fieldContext=null,eventAdmission=null,openEntriesOnTicker=[]}={}){
    const now=Date.now(),f=bolt?.features||{},marketObserved=Number(f.marketObservedAtMs||q?.quoteAtMs||q?.updatedAtMs||0),ciAt=Number(crashState?.lastObservationAtMs||crashState?.updatedAtMs||0);
    const cosmosState=(cosmos||[]).map(x=>[String(x.id||''),String(x.conceptName||''),Number(x.openedAtMs||0),String(x.entryConfig?.dragonSource?.episodeId||''),Number(x.entryConfig?.phoenixSource?.signalAtMs||0)]).sort((a,b)=>String(a[0]).localeCompare(String(b[0])));
    const eligible=(f.eligibleAttacks||[]).map(x=>[String(x.concept||''),Number(x.plannedEntryCents||0),Number(x.requiredTargetBidCents||0),x.targetFeasible!==false]).sort((a,b)=>String(a[0]).localeCompare(String(b[0])));
    const requested=Math.max(1,...(f.eligibleAttacks||[]).map(x=>Math.max(1,Math.floor(Number(x?.count||0)))));
    const executionBook=this.executionBookState(q?.ticker||bolt?.ticker,requested,Number(q?.yesAsk||f.askCents||0));
    return stableHash({boltId:String(bolt?.id||''),bid:Number(q?.yesBid||f.bidCents||0),ask:Number(q?.yesAsk||f.askCents||0),status:String(q?.status||''),result:String(q?.result||''),marketFresh:marketObserved>0&&now-marketObserved<=ARAYASHIKI.maximumMarketAgeMs,historySamples:Number(f.historySamples||0),currentUp:Number(f.currentUpwardTicks??0),currentLower:Number(f.currentLowerLowCount??0),currentCrash:rounded(f.currentCrashDepthCents),currentRebound:rounded(f.currentReboundCents),currentReclaim:rounded(f.currentReclaimRate),move30:rounded(f.recentMove30Cents),v15:rounded(f.velocity15CentsPerSec),v30:rounded(f.velocity30CentsPerSec),eligible,executionBook,crash:{present:!!crashState,fresh:ciAt>0&&now-ciAt<=ARAYASHIKI.maximumCrashStateAgeMs,phase:String(crashState?.phase||''),episodeId:String(crashState?.episodeId||''),lastEpisodeId:String(crashState?.lastEpisodeId||''),lastResetAtMs:Number(crashState?.lastResetAtMs||0),entryReady:crashState?.entryReady===true,bid:Number(crashState?.lastBidCents||0),ask:Number(crashState?.lastAskCents||0),reclaim:rounded(crashState?.reclaimRate)},cosmos:cosmosState,recovery:recoveryContext?{id:String(recoveryContext.sourceTradeId||''),trough:Number(recoveryContext.troughCents||0),rebound:Number(recoveryContext.reboundCents||0)}:null,field:{plasmaId:String(fieldContext?.fieldId||''),plasma:fieldContext?.lightningPlasmaQualified===true,plasmaTicker:fieldContext?.currentTickerEligible===true,independent:Number(fieldContext?.independentEventCount||0),aeId:String(fieldContext?.athenaExclamationCandidate?.id||''),aeSaints:Number(fieldContext?.athenaExclamationCandidate?.saintCount||0)},admission:{eventCap:eventAdmission?.eventCapBlocked===true,cooldownScope:String(eventAdmission?.cooldownScope||''),blockedConcepts:[...(eventAdmission?.cooldownBlockedConcepts||[])].sort(),active:Number(eventAdmission?.activeEntries||0)},open:[...(openEntriesOnTicker||[])].map(x=>String(x.conceptName||'')).sort(),memoryHash:String(this.athenaCommander?.memory?.memoryHash||'')});
  }

  noteEntryAdmission(reason,field){
    const stats=this.entryAdmissionStats||(this.entryAdmissionStats={version:ENTRY_ADMISSION_CONTROL.version,allowed:0,blockedBeforeQueue:0,probeAllowed:0,probeCoalesced:0,byReason:{}});
    stats[field]=Number(stats[field]||0)+1;
    const key=String(reason||'unknown');stats.byReason[key]=Number(stats.byReason[key]||0)+1;
  }

  entryAdmissionSnapshot(){
    const stats=this.entryAdmissionStats||{};
    return{version:ENTRY_ADMISSION_CONTROL.version,role:ENTRY_ADMISSION_CONTROL.role,unknownProbeIntervalMs:ENTRY_ADMISSION_CONTROL.unknownProbeIntervalMs,preBoltExecutionMarginMs:ENTRY_ADMISSION_CONTROL.preBoltExecutionMarginMs,trackedProbeEvents:this.entryAdmissionProbeAt?.size||0,allowed:Number(stats.allowed||0),blockedBeforeQueue:Number(stats.blockedBeforeQueue||0),probeAllowed:Number(stats.probeAllowed||0),probeCoalesced:Number(stats.probeCoalesced||0),byReason:{...(stats.byReason||{})}};
  }

  entryChainAdmissionForQuote(q,{lane='ANY',now=Date.now()}={}){
    const ticker=String(q?.ticker||'');
    const activeBolt=this.atomicThunderBolt?.activeByTicker?.get?.(ticker)||null;
    const activeBoltReady=activeBolt&&Number(activeBolt.expiresAtMs||0)>=Number(now);
    const common={quote:q,mode:this.settings.mode,minGameMinutes:this.settings.minGameMinutes,maxGameMinutes:this.settings.maxGameMinutes,now,executionMarginMs:ENTRY_ADMISSION_CONTROL.preBoltExecutionMarginMs};
    const stage=(lane==='POST_BOLT'||lane==='POST_ATB2')?'POST_BOLT':activeBoltReady?'POST_BOLT':'ATOMIC_GREEN';
    return entryChainAdmissionDecision({...common,stage});
  }

  async resolveEntryChainAdmission(q,{lane='ANY',forceProbe=true}={}){
    let decision=this.entryChainAdmissionForQuote(q,{lane,now:Date.now()});
    if(decision.action==='PROBE'&&forceProbe){
      const refreshed=await this.refreshGameClockForQuote(q,{forceFresh:true}).catch(()=>null);
      if(refreshed?.gameClockState)decision=this.entryChainAdmissionForQuote(q,{lane,now:Date.now()});
      else decision={action:'BLOCK',reason:'game_clock_probe_failed',stage:decision.stage||null,lane};
    }
    return decision;
  }

  shouldQueueInitialExposure(ticker,{allowProbe=true}={}){
    const q=this.market?.getQuote?.(ticker);if(!q)return false;
    const decision=this.entryChainAdmissionForQuote(q,{lane:'ANY',now:Date.now()});
    if(decision.action==='ALLOW'){this.noteEntryAdmission(decision.reason,'allowed');return true;}
    if(decision.action==='BLOCK'){this.noteEntryAdmission(decision.reason,'blockedBeforeQueue');return false;}
    if(!allowProbe){this.noteEntryAdmission(decision.reason,'blockedBeforeQueue');return false;}
    const event=String(q.eventTicker||q.ticker||ticker),now=Date.now(),last=Number(this.entryAdmissionProbeAt.get(event)||0);
    if(last>0&&now-last<ENTRY_ADMISSION_CONTROL.unknownProbeIntervalMs){this.noteEntryAdmission('clock_probe_throttled','probeCoalesced');return false;}
    this.entryAdmissionProbeAt.set(event,now);
    while(this.entryAdmissionProbeAt.size>ENTRY_ADMISSION_CONTROL.maximumTrackedEvents){const first=this.entryAdmissionProbeAt.keys().next().value;this.entryAdmissionProbeAt.delete(first);}
    this.noteEntryAdmission(decision.reason,'probeAllowed');return true;
  }

  admittedInitialExposureMap(marketMap,{allowProbe=false}={}){
    const admitted=new Map();
    for(const [ticker,q] of marketMap||[]){
      const decision=this.entryChainAdmissionForQuote(q,{lane:'ANY',now:Date.now()});
      if(decision.action==='ALLOW'){admitted.set(ticker,q);this.noteEntryAdmission(decision.reason,'allowed');continue;}
      if(decision.action==='PROBE'&&allowProbe&&this.shouldQueueInitialExposure(ticker,{allowProbe:true})){admitted.set(ticker,q);continue;}
      this.noteEntryAdmission(decision.reason,'blockedBeforeQueue');
    }
    return admitted;
  }

  async refreshFeederPriorityTickers() {
    if (!this.db || !this.settings?.systemName) {
      this.feederPriorityTickers = new Set();
      this.activeCosmosByTicker = new Map();
      this.anotherDimensionSourcePeaks = new Map();
      return this.feederPriorityTickers;
    }
    const rows = (typeof this.db.openFeederEntries === 'function'
      ? await this.db.openFeederEntries(this.settings.systemName)
      : await this.db.openEntries(this.settings.systemName).catch(() => [])
    );
    const active=activeCosmoSources(rows || [],this.settings,{now:Date.now()});
    this.feederPriorityTickers = new Set(active.map((e) => e.ticker).filter(Boolean));
    const byTicker=new Map(),activeIds=new Set();
    for(const e of active){
      const ticker=String(e?.ticker||''),id=String(e?.id||'');if(!ticker||!id)continue;
      activeIds.add(id);
      const list=byTicker.get(ticker)||[];list.push(e);byTicker.set(ticker,list);
      const prior=Number(this.anotherDimensionSourcePeaks.get(id)||0);
      this.anotherDimensionSourcePeaks.set(id,Math.max(prior,Number(e.entryPriceCents||0),Number(e.peakPriceCents||0)));
    }
    this.activeCosmosByTicker=byTicker;
    for(const id of [...this.anotherDimensionSourcePeaks.keys()])if(!activeIds.has(id))this.anotherDimensionSourcePeaks.delete(id);
    return this.feederPriorityTickers;
  }

  // R51 compatibility wrappers.  These names are retained only so an older
  // callback cannot accidentally reopen the distributed R50 entry graph.
  // Every real new-generation exposure is routed back through Bolt -> Athena.
  queueLightningPlasmaEvaluation() {
    if (!this.running || this.settings.lightningPlasmaEnabled !== true) return;
    for (const q of this.lastScanMarkets || []) this.queueAthenaOpportunityEvaluation(q?.ticker);
  }

  queueFeederHunterEvaluation(ticker) {
    this.queueAthenaOpportunityEvaluation(ticker);
  }

  async refreshRecoveryPriorityTickers() {
    if (!this.strategy || this.settings.recoveryHunterEnabled === false) {
      this.recoveryPriorityTickers = new Set();
      return this.recoveryPriorityTickers;
    }
    const tickers = await this.strategy.recoveryCandidateTickers().catch(() => []);
    this.recoveryPriorityTickers = new Set(tickers || []);
    return this.recoveryPriorityTickers;
  }

  queueRecoveryEvaluation(ticker) {
    this.queueAthenaOpportunityEvaluation(ticker);
  }

  refreshCrashPriorityTickers() {
    if (!this.learning) {
      this.crashPriorityTickers = new Set();
      return this.crashPriorityTickers;
    }
    const summary = this.learning.crashLearningSummary?.();
    const active = (summary?.states || [])
      .filter((x) => x.phase === 'CRASHING' || x.phase === 'REBOUND_CONFIRMED')
      .map((x) => x.ticker)
      .filter(Boolean);
    this.crashPriorityTickers = new Set(active);
    return this.crashPriorityTickers;
  }

  queueCrashRecoveryEvaluation(ticker) {
    this.queueAthenaOpportunityEvaluation(ticker);
  }

  async protectionLoop() {
    while (this.running) {
      try {
        const now=Date.now();
        if (now - this.health.lastProtectionMs >= 1000) await this.runProtectionSweep('independent_1500ms');
        if (now - this.lastReferenceSweepMs >= REFERENCE_SIGNAL_SWEEP_MS) await this.runReferenceSignalSweep('reference_30s');
      } catch {}
      await sleep(PROTECTION_BACKUP_MS);
    }
  }

  queueReconcile() {
    if (!this.running || this.reconcileTimer) return;
    this.reconcileTimer = setTimeout(() => {
      this.reconcileTimer = null;
      void this.reconcileBroker().catch((e) => this.recordError('private_reconciliation', e));
    }, 150);
  }

  async testConnection() {
    if (!this.credentials) {
      this.health.restOk = false;
      this.recomputeHealth();
      throw new Error('Kalshi credentials are not configured');
    }
    try {
      this.kalshi.setCredentials(this.credentials);
      const r = await this.kalshi.testConnection();
      this.balance = r.balance;
      this.health.restOk = true;
      this.health.lastRestOkMs = Date.now();
      this.lastError = null;
      this.recomputeHealth();
      return r;
    } catch (e) {
      this.health.restOk = false;
      this.recomputeHealth();
      throw e;
    }
  }

  async saveCredentials(keyId, privateKeyPem) {
    const c = {
      keyId: String(keyId || '').trim(),
      privateKeyPem: String(privateKeyPem || '').replace(/\\n/g, '\n').trim(),
    };
    if (!c.keyId || !c.privateKeyPem) throw new Error('Both Kalshi API Key ID and private key PEM are required');
    const old = this.credentials;
    this.credentials = c;
    this.kalshi.setCredentials(c);
    try {
      const test = await this.testConnection();
      await this.db.saveCredentials(c.keyId, c.privateKeyPem);
      this.market.reconnectToken += 1;
      this.market.ws?.close(1000, 'credentials updated');
      return test;
    } catch (e) {
      this.credentials = old;
      this.kalshi.setCredentials(old || {});
      throw e;
    }
  }

  entryExecutionGate() {
    const engineActive = this.settings?.engineActive === true;
    const mode = String(this.settings?.mode || 'SIMULATION').toUpperCase();
    if (!engineActive) return { version:'EMI1', allowed:false, reason:'engine_disabled', engineActive, mode, liveReady:false };
    if (mode === 'SIMULATION' && this.simulationMutationGate?.blocked) return { version:'EMI1', allowed:false, reason:'simulation_reset_in_progress', engineActive, mode, liveReady:false };
    if (mode === 'SIMULATION') return { version:'EMI1', allowed:true, reason:'simulation', engineActive, mode, liveReady:false };
    if (mode !== 'LIVE') return { version:'EMI1', allowed:false, reason:'invalid_mode', engineActive, mode, liveReady:false };
    if (!env.allowLiveTrading) return { version:'EMI1', allowed:false, reason:'live_trading_disabled', engineActive, mode, liveReady:false };
    if (this.settings.liveArmed !== true) return { version:'EMI1', allowed:false, reason:'live_disarmed', engineActive, mode, liveReady:false };
    this.recomputeHealth();
    if (this.health.degraded) return { version:'EMI1', allowed:false, reason:'health_degraded', engineActive, mode, liveReady:false };
    return { version:'EMI1', allowed:true, reason:'live_ready', engineActive, mode, liveReady:true };
  }

  referenceSignalGate() {
    const engineActive = this.settings?.engineActive === true;
    const resetBlocked=this.settings?.mode==='SIMULATION'&&this.simulationMutationGate?.blocked===true;
    return { version:'EMI1', allowed:engineActive&&!resetBlocked, reason:!engineActive?'engine_disabled':resetBlocked?'simulation_reset_in_progress':'engine_active' };
  }

  isLiveReady() {
    this.recomputeHealth();
    return this.settings.mode === 'LIVE'
      && this.settings.liveArmed === true
      && env.allowLiveTrading
      && !this.health.degraded;
  }

  async setMode(mode, confirmation = '') {
    const m = String(mode).toUpperCase() === 'LIVE' ? 'LIVE' : 'SIMULATION';
    if (m === 'LIVE') {
      if (!env.allowLiveTrading) throw new Error('ALLOW_LIVE_TRADING is false');
      if (confirmation !== 'ENABLE LIVE TRADING') throw new Error('Type ENABLE LIVE TRADING to arm real trading');
      await this.testConnection();
      await this.reconcileBroker();
      await this.runProtectionSweep('live_arm_check');
      this.recomputeHealth();
      if (this.health.degraded) throw new Error('System health is not clean enough to arm LIVE');
      this.settings = { ...this.settings, mode: 'LIVE', liveArmed: true };
    } else {
      this.settings = { ...this.settings, mode: 'SIMULATION', liveArmed: false };
    }
    await this.db.saveSettings(this.settings);
    this.invalidateStateSnapshot();
    return this.settings;
  }

  patchSettings(patch) {
    const prior=this.settingsMutationTail||Promise.resolve();
    const run=prior.catch(()=>{}).then(()=>this.applySettingsPatch(patch));
    this.settingsMutationTail=run.catch(()=>{});
    return run;
  }

  async applySettingsPatch(patch) {
    const numeric = new Set(EDITABLE_NUMERIC_SETTINGS);
    const booleans = new Set(EDITABLE_BOOLEAN_SETTINGS);
    const allowed = new Set([...numeric, ...booleans, 'systemName']);
    const unknown = Object.keys(patch || {}).filter((k) => !allowed.has(k));
    if (unknown.length) throw new Error(`Unknown or retired setting: ${unknown.join(', ')}`);

    const next = { ...this.settings };
    for (const k of numeric) {
      if (!Object.hasOwn(patch, k)) continue;
      const v = Number(patch[k]);
      if (!Number.isFinite(v)) throw new Error(`${k} must be numeric`);
      next[k] = v;
    }
    for (const k of booleans) {
      if (!Object.hasOwn(patch, k)) continue;
      const v = patch[k];
      next[k] = typeof v === 'boolean' ? v : /^(1|true|yes|on)$/i.test(String(v));
    }
    if (Object.hasOwn(patch, 'systemName')) {
      const v = String(patch.systemName || '').trim();
      if (!v) throw new Error('systemName cannot be empty');
      next.systemName = v;
    }

    const price=(k)=>{if(next[k]<1||next[k]>99)throw new Error(`${k} must be between 1 and 99 cents`);};
    for(const k of ['pegasusMinPriceCents','pegasusMaxPriceCents','dragonMinSignalPriceCents','dragonMaxSignalPriceCents','phoenixMinPriceCents','phoenixMaxPriceCents','geminiMinPriceCents','geminiMaxPriceCents','momentumMinEntryCents','momentumMaxEntryCents','waveMinEntryCents','waveMaxEntryCents','recoveryMinEntryCents','recoveryMaxEntryCents','crashRecoveryMinEntryCents','crashRecoveryMaxEntryCents','scarletNeedleMinEntryCents','scarletNeedleMaxEntryCents','justiceArrowMinEntryCents','justiceArrowMaxEntryCents','athenaExclamationMinEntryCents','athenaExclamationMaxEntryCents','lightningPlasmaMinEntryCents','lightningPlasmaMaxEntryCents'])price(k);
    for(const [lo,hi,label] of [
      ['pegasusMinPriceCents','pegasusMaxPriceCents','Pegasus'],['dragonMinSignalPriceCents','dragonMaxSignalPriceCents','Dragon'],['phoenixMinPriceCents','phoenixMaxPriceCents','Phoenix'],
      ['momentumMinEntryCents','momentumMaxEntryCents','Great Horn'],['waveMinEntryCents','waveMaxEntryCents','Pegasus Ryu Sei Ken'],
      ['recoveryMinEntryCents','recoveryMaxEntryCents','Crystal Wall'],['crashRecoveryMinEntryCents','crashRecoveryMaxEntryCents','Starlight Extinction'],
      ['geminiMinPriceCents','geminiMaxPriceCents','Gemini'],['scarletNeedleMinEntryCents','scarletNeedleMaxEntryCents','Scarlet Needle'],['justiceArrowMinEntryCents','justiceArrowMaxEntryCents','Sagittarius Justice Arrow'],['athenaExclamationMinEntryCents','athenaExclamationMaxEntryCents','Athena Exclamation'],['lightningPlasmaMinEntryCents','lightningPlasmaMaxEntryCents','Lightning Plasma'],
    ])if(next[lo]>next[hi])throw new Error(`${label} minimum price cannot exceed maximum price`);
    if(next.pegasusDropCents<1||next.pegasusDropCents>99)throw new Error('pegasusDropCents must be between 1 and 99 cents');
    for(const k of ['pegasusReferenceStakeCents','dragonReferenceStakeCents','phoenixReferenceStakeCents','geminiReferenceStakeCents','momentumStakeCents','waveStakeCents','recoveryStakeCents','crashRecoveryStakeCents','scarletNeedleStakeCents','justiceArrowStakeCents','athenaExclamationStakeCents','lightningPlasmaFieldStakeCents','startingCapitalCents'])if(next[k]<=0)throw new Error(`${k} must be greater than zero`);
    next.scarletNeedleMaxRepeats=Math.max(0,Math.min(SCARLET_NEEDLE.maximumConfigurableRepeats,Math.floor(Number(next.scarletNeedleMaxRepeats??SCARLET_NEEDLE.defaultMaxRepeats))));
    if(next.maxPositions<1||!Number.isInteger(next.maxPositions))throw new Error('maxPositions must be a positive integer');
    if(next.maxEntriesPerTrade<1||!Number.isInteger(next.maxEntriesPerTrade))throw new Error('maxEntriesPerTrade must be a positive integer');
    if(next.hunterCooldownMinutes<0)throw new Error('hunterCooldownMinutes cannot be negative');
    if(next.minGameMinutes<0||!Number.isInteger(next.minGameMinutes))throw new Error('minGameMinutes must be a non-negative integer');
    if(next.maxGameMinutes<0||!Number.isInteger(next.maxGameMinutes))throw new Error('maxGameMinutes must be a non-negative integer');
    if(next.maxGameMinutes>0&&next.maxGameMinutes<next.minGameMinutes)throw new Error('maxGameMinutes must be zero (disabled) or greater than or equal to minGameMinutes');
    if(next.eventCooldownMinutes<0)throw new Error('eventCooldownMinutes cannot be negative');
    if(next.maxSpreadCents<0||next.maxSpreadCents>99)throw new Error('maxSpreadCents must be between 0 and 99');
    if(next.simFeeCents<0)throw new Error('simFeeCents cannot be negative');
    if(next.recoveryTrackingHours<=0)throw new Error('recoveryTrackingHours must be greater than zero');
    if(next.atomicThunderGreenTriggerCents<1||next.atomicThunderGreenTriggerCents>99||!Number.isInteger(next.atomicThunderGreenTriggerCents))throw new Error('atomicThunderGreenTriggerCents must be an integer from 1 to 99');
    if(next.dragonMaxEpisode<1||!Number.isInteger(next.dragonMaxEpisode))throw new Error('dragonMaxEpisode must be a positive integer');
    if(next.infinityBreakMinNetPerOriginalContractCents<=0)throw new Error('infinityBreakMinNetPerOriginalContractCents must be greater than zero');
    if(next.infinityBreakRequiredConfirmations<1||!Number.isInteger(next.infinityBreakRequiredConfirmations))throw new Error('infinityBreakRequiredConfirmations must be a positive integer');
    if(next.infinityBreakMaximumBookAgeMs<100)throw new Error('infinityBreakMaximumBookAgeMs must be at least 100ms');
    if(next.infinityBreakConfirmationWindowMs<250)throw new Error('infinityBreakConfirmationWindowMs must be at least 250ms');
    if(next.auroraDamageControlPercent<1||next.auroraDamageControlPercent>95)throw new Error('auroraDamageControlPercent must be between 1 and 95 percent');
    if(next.lightningPlasmaMaxStrikes<1||!Number.isInteger(next.lightningPlasmaMaxStrikes))throw new Error('lightningPlasmaMaxStrikes must be a positive integer');

    const topologyKeys=['pegasusEnabled','dragonEnabled','phoenixEnabled','momentumHunterEnabled','waveSurferEnabled','recoveryHunterEnabled','crashRecoveryHunterEnabled','scarletNeedleEnabled','geminiEnabled','justiceArrowEnabled','athenaExclamationEnabled','lightningPlasmaEnabled','galacticExplosionEnabled'];
    const topologyChanged=topologyKeys.some((k)=>Object.hasOwn(patch||{},k)&&this.settings?.[k]!==next[k]);
    const changedKeys=Object.keys(patch||{});
    try{
      await this.db.saveSettings(next);
      if(typeof this.db.loadSettings!=='function')throw new Error('settings_persistence_readback_unavailable');
      const persisted=await this.db.loadSettings(freshInstallSettings());
      for(const k of changedKeys){
        const expected=next[k],actual=persisted?.[k];
        const matches=typeof expected==='number'?Number(actual)===Number(expected):typeof expected==='boolean'?actual===expected:String(actual??'')===String(expected??'');
        if(!matches)throw new Error(`settings_persistence_verification_failed:${k}:expected=${expected}:actual=${actual}`);
      }
      this.settingsPersistence={version:'SETTINGS-PERSISTENCE-R1',lastVerifiedAtMs:Date.now(),lastKeys:[...changedKeys],lastValues:Object.fromEntries(changedKeys.map((k)=>[k,next[k]])),lastError:null};
    }catch(error){
      this.settingsPersistence={...(this.settingsPersistence||{version:'SETTINGS-PERSISTENCE-R1',lastVerifiedAtMs:0,lastKeys:[],lastValues:{}}),lastError:String(error?.message||error)};
      await this.db.audit?.('error','settings_persistence_verification_failed',{release:RELEASE,changedKeys,message:String(error?.message||error)}).catch(()=>{});
      throw error;
    }
    this.settings = next;
    if(Object.hasOwn(patch||{},'phoenixEnabled')&&next.phoenixEnabled!==true)this.phoenixCosmo?.clear?.();
    this.invalidateStateSnapshot();
    if(topologyChanged){
      // HF3 activation coordination: settings writes remain fast and durable,
      // while the scanner/priority sets are synchronised out-of-band. Multiple
      // one-by-one toggle changes collapse into one requested scan rather than
      // launching an entry storm inside the HTTP PATCH request.
      this.requestScan();
      queueMicrotask(()=>{
        void Promise.allSettled([this.refreshFeederPriorityTickers(),this.refreshRecoveryPriorityTickers()]).catch(()=>{});
        this.refreshCrashPriorityTickers();
      });
      if(typeof this.db.audit==='function')await this.db.audit('info','entry_topology_settings_changed',{release:RELEASE,changed:topologyKeys.filter((k)=>Object.hasOwn(patch||{},k)),galacticExplosionEnabled:next.galacticExplosionEnabled===true,pegasusEnabled:next.pegasusEnabled===true,dragonEnabled:next.dragonEnabled===true,momentumHunterEnabled:next.momentumHunterEnabled===true,waveSurferEnabled:next.waveSurferEnabled===true,recoveryHunterEnabled:next.recoveryHunterEnabled===true,crashRecoveryHunterEnabled:next.crashRecoveryHunterEnabled===true,scarletNeedleEnabled:next.scarletNeedleEnabled===true,geminiEnabled:next.geminiEnabled===true,justiceArrowEnabled:next.justiceArrowEnabled===true,athenaExclamationEnabled:next.athenaExclamationEnabled===true}).catch(()=>{});
    }
    return next;
  }

  async setEngine(active) {
    this.settings = { ...this.settings, engineActive: Boolean(active) };
    await this.db.saveSettings(this.settings);
    this.invalidateStateSnapshot();
    return this.settings;
  }

  requestScan() { this.scanRequested = true; }

  async resetDashboard() {
    this.settings = { ...this.settings, resetTimestampMs: Date.now() };
    await this.db.saveSettings(this.settings);
    this.invalidateStateSnapshot();
    return this.settings;
  }

  async resetSimulation() {
    if (this.settings.mode !== 'SIMULATION') throw new Error('Simulation reset is only allowed in SIMULATION mode');
    if(this.simulationResetPromise)return this.simulationResetPromise;
    const run=(async()=>{
      const before=this.simulationMutationGate.snapshot();
      await this.simulationMutationGate.blockAndDrain();
      try{
        const n = await this.db.archiveSimulation(this.settings.systemName);
        // Performance reset archives economic SIM rows only. The following are
        // intelligence and MUST survive: tracker rows, MarketHub histories,
        // crash/learning state, Atomic Thunder observations and Athena memory.
        this.anotherDimensionOpenByTicker?.clear?.();
        this.anotherDimensionRecent?.clear?.();
        this.anotherDimensionRuntime?.clear?.();
        this.anotherDimensionSourcePeaks?.clear?.();
        this.geminiOpenAttemptBookMs?.clear?.();
        this.activeCosmosByTicker?.clear?.();
        this.refreshCrashPriorityTickers();
        this.settings = { ...this.settings, resetTimestampMs: null };
        await this.db.saveSettings(this.settings);
        this.invalidateStateSnapshot();
        await this.db.audit('info','simulation_reset_completed',{release:RELEASE,archivedEntries:n,intelligencePreserved:true,trackersCleared:false,marketHistoriesCleared:false,athenaMemoryPreserved:true,atomicThunderHistoryPreserved:true,mutationGateBefore:before,mutationGateAtArchive:this.simulationMutationGate.snapshot()}).catch(()=>{});
        return n;
      }finally{this.simulationMutationGate.release();}
    })();
    this.simulationResetPromise=run;
    try{return await run;}finally{if(this.simulationResetPromise===run)this.simulationResetPromise=null;}
  }

  async _reconcileBroker() {
    if (!this.credentials) {
      this.health.reconciliationOk = this.settings.mode !== 'LIVE';
      this.recomputeHealth();
      return this.health.reconciliationOk;
    }
    try {
      const positions = await this.kalshi.getPositions();
      this.brokerPositions = positions;
      const owned = await this.db.liveOpenHunterEntries(this.settings.ownerId);
      const byTicker = new Map();
      for (const p of positions) {
        const t = p.ticker || p.market_ticker;
        const qty = brokerPositionCount(p);
        if (t) byTicker.set(t, (byTicker.get(t) || 0) + qty);
      }
      let ok = true;
      const requiredByTicker=new Map();
      for (const e of owned) {
        // An entry with an ambiguous BUY cannot be inferred from aggregate
        // account quantity. Resolve its exact client-order receipt first.
        if (e.status === 'entry_pending' || e.status === 'pending_recovery') {
          ok = false;
          continue;
        }
        const required=Math.max(0,Number(e.remainingCount ?? e.count ?? 0));
        requiredByTicker.set(e.ticker,(requiredByTicker.get(e.ticker)||0)+required);
      }
      // Galactic Explosion may legitimately create several independently-owned
      // Attacks on one exact ticker. Reconciliation therefore compares the
      // broker quantity against the SUM of this owner's durable rows, never
      // against each row in isolation. Broker overage can belong to another
      // owner/system and is deliberately not claimed by Sagittarius.
      for(const [ticker,required] of requiredByTicker){
        const broker=byTicker.get(ticker)||0;
        if(broker+1e-6<required)ok=false;
      }
      this.health.reconciliationOk = ok;
      this.recomputeHealth();
      return ok;
    } catch (e) {
      this.health.reconciliationOk = false;
      this.recomputeHealth();
      throw e;
    }
  }

  reconcileBroker() {
    if (this.reconcilePromise) return this.reconcilePromise;
    const p = this._reconcileBroker().finally(() => {
      if (this.reconcilePromise === p) this.reconcilePromise = null;
    });
    this.reconcilePromise = p;
    return p;
  }

  async persistTrackers(markets, additionalRequiredTickers = []) {
    // Production GCA2 persists event-clock truth in its dedicated table, so the
    // full tracker-history JSON is unnecessary here. Legacy test adapters that
    // lack gameClockStates keep the old fallback semantics on a bounded set.
    const oldRows = typeof this.db?.gameClockStates==='function'?[]:await this.db.trackers(this.settings.systemName,100);
    const open = await this.db.openEntries(this.settings.systemName);
    const entered = new Set(open.map((e) => e.ticker));
    const recoveryRequired = new Set((additionalRequiredTickers || []).map(String).filter(Boolean));
    const requiredTickers = new Set([...entered, ...recoveryRequired]);
    const bands = [];
    if (this.settings.pegasusEnabled) bands.push([this.settings.pegasusMinPriceCents, this.settings.pegasusMaxPriceCents]);
    if (this.settings.dragonEnabled) bands.push([this.settings.dragonMinSignalPriceCents, this.settings.dragonMaxSignalPriceCents]);
    if (this.settings.waveSurferEnabled) bands.push([this.settings.waveMinEntryCents, this.settings.waveMaxEntryCents]);
    if (this.settings.momentumHunterEnabled) bands.push([this.settings.momentumMinEntryCents ?? MOMENTUM.minEntryCents, this.settings.momentumMaxEntryCents ?? MOMENTUM.maxEntryCents]);
    if (this.settings.geminiEnabled) bands.push([this.settings.geminiMinPriceCents ?? MOMENTUM.minEntryCents, this.settings.geminiMaxPriceCents ?? MOMENTUM.maxEntryCents]);
    if (this.settings.recoveryHunterEnabled) bands.push([this.settings.recoveryMinEntryCents ?? RECOVERY.minEntryCents, this.settings.recoveryMaxEntryCents ?? RECOVERY.maxEntryCents]);
    if (this.settings.crashRecoveryHunterEnabled) bands.push([this.settings.crashRecoveryMinEntryCents, this.settings.crashRecoveryMaxEntryCents]);
    const inBand = (ask) => bands.some(([min,max]) => ask >= min && ask <= max);
    const distance = (ask) => bands.length ? Math.min(...bands.map(([min,max]) => Math.abs(ask - ((min + max) / 2)))) : 0;
    const now = Date.now();
    // Open entries are safety-critical and must never fall out of the clock
    // authority set merely because the discovery list/top-50 tracker ranking
    // changed. Merge current cached quotes for every open ticker, then retain
    // all of those required rows plus the best non-entered observation rows.
    const candidatesByTicker = new Map((markets || []).map((q) => [q.ticker, q]));
    for (const ticker of requiredTickers) {
      if (candidatesByTicker.has(ticker)) continue;
      const cached = this.market?.getQuote?.(ticker);
      if (cached) candidatesByTicker.set(ticker, cached);
    }
    const ranked = [...candidatesByTicker.values()].sort((a, b) => {
      const ae = requiredTickers.has(a.ticker) ? 0 : 1;
      const be = requiredTickers.has(b.ticker) ? 0 : 1;
      if (ae !== be) return ae - be;
      const ab = inBand(a.yesAsk) ? 0 : 1;
      const bb = inBand(b.yesAsk) ? 0 : 1;
      if (ab !== bb) return ab - bb;
      return distance(a.yesAsk) - distance(b.yesAsk);
    });
    const required = ranked.filter((q) => requiredTickers.has(q.ticker));
    const optional = ranked.filter((q) => !requiredTickers.has(q.ticker)).slice(0, Math.max(0, 50 - required.length));
    const selected = [...required, ...optional];
    const keep = new Set([...requiredTickers, ...selected.map((q) => q.ticker)]);

    // Discovery/live classification is deliberately broad and remains useful
    // for feeders. GCA1 is a separate authority plane for exposure-creating
    // Hunters, so compute broad status first and then resolve one shared,
    // persisted event clock for every sibling market in the selected set.
    for (const q of selected) {
      const status = computeLiveStatus({
        tradeCount: q.recentTrades, yesBid: q.yesBid, yesAsk: q.yesAsk,
        prevYesBid: q.prevYesBid || 0, prevYesAsk: q.prevYesAsk || 0,
        occurrenceTimeMs: q.occurrenceTimeMs, closeTimeMs: q.closeTimeMs,
        volume24h: q.volume24h, now,
      });
      q.liveStatus = status;
    }

    if (!this.gameClock) {
      this.gameClock = new GameClockAuthority({
        kalshi: this.kalshi || {},
        audit: (event, data) => this.db.audit?.('info', event, data) || Promise.resolve(),
      });
    }
    const eventTickers = [...new Set(selected.map((q) => q.eventTicker || q.ticker).filter(Boolean))];
    let priorClockStates = new Map();
    if (typeof this.db.gameClockStates === 'function') {
      priorClockStates = await this.db.gameClockStates(this.settings.systemName, eventTickers);
    } else {
      // Test/backward-compatible projection only. R17 production uses the
      // dedicated event authority table so tracker pruning cannot erase truth.
      for (const row of oldRows) {
        const event = row.event_ticker || row.ticker;
        if (!priorClockStates.has(event) && row.game_clock_state?.version === GAME_CLOCK_AUTHORITY.version) {
          priorClockStates.set(event, row.game_clock_state);
        }
      }
    }
    // Resolve the authority plane for the full selected observation set so the
    // first official live observation is captured near real game start, not
    // only after a feeder later becomes attractive. Expensive PBP fallback is
    // reserved for already-open exposure-chain tickers; normal candidates use
    // the lighter milestone + live-data path. Endpoint calls are cached and
    // bounded in KalshiClient, so optional enrichment cannot dominate a scan.
    const gameStatsEventTickers = new Set(selected.filter((q) => entered.has(q.ticker)).map((q) => q.eventTicker || q.ticker));
    const resolvedClockStates = await this.gameClock.resolveBatch(selected, priorClockStates, now, {
      gameStatsEventTickers,
      allowSimulationActivityClock: this.settings.mode === 'SIMULATION',
      minimumElapsedMs: Math.max(0, Number(this.settings.minGameMinutes || 0)) * 60 * 1000,
    });
    const clockStates = new Map(priorClockStates);
    for (const [eventTicker, state] of resolvedClockStates) {
      clockStates.set(eventTicker, state);
      if (typeof this.db.upsertGameClockState === 'function') {
        await this.db.upsertGameClockState(this.settings.systemName, eventTicker, state);
      }
    }

    for (const q of selected) {
      const event = q.eventTicker || q.ticker;
      const state = clockStates.get(event) || null;
      q.gameClockState = state || {};
      q.gameStartTimeMs = isConfirmedGameClockState(state, event) ? Number(state.startTimeMs) : null;
      await this.db.upsertTracker(
        this.settings.systemName,
        q,
        this.market.getHistory(q.ticker),
        [],
        entered.has(q.ticker) ? 'entered' : recoveryRequired.has(q.ticker) ? 'recovery' : 'tracking',
      );
    }
    await this.db.deleteStaleTrackers(this.settings.systemName, [...keep]);
    if (typeof this.db.pruneGameClockStates === 'function') {
      await this.db.pruneGameClockStates(this.settings.systemName, now - 14 * 24 * 60 * 60 * 1000).catch(() => {});
    }
    return new Map((await this.db.trackers(this.settings.systemName, 2000)).map((x) => [x.ticker, x]));
  }

  async refreshGameClockForQuote(candidate, { forceFresh = false } = {}) {
    const ticker = String(candidate?.ticker || '');
    const eventTicker = String(candidate?.eventTicker || ticker);
    if (!ticker || !eventTicker || !this.gameClock) return null;
    // Pre-execution calls force a fresh exact market REST/book observation
    // before resolving the clock. This prevents the weaker occurrence fallback
    // from being authorized by a stale cached activity classification.
    if (forceFresh && typeof this.market?.refreshTicker === 'function') {
      await this.market.refreshTicker(ticker).catch(() => null);
      // Broad scan activity is intentionally not trusted at the executable
      // boundary. Refresh the exact ticker's last-five-minute trades so the
      // occurrence fallback cannot inherit a stale `recentTrades` count.
      const tradeProbe = typeof this.kalshi?.getRecentTradesForTicker === 'function'
        ? await this.kalshi.getRecentTradesForTicker(ticker, 5).catch(() => null)
        : null;
      const refreshedQuote = this.market?.getQuote?.(ticker);
      if (refreshedQuote) {
        refreshedQuote.recentTradesObservedAtMs = tradeProbe ? Number(tradeProbe.observedAtMs || Date.now()) : 0;
        if (tradeProbe) {
          refreshedQuote.recentTrades = Number(tradeProbe.count || 0);
          if (Number(tradeProbe.lastPriceCents || 0) > 0) refreshedQuote.lastPrice = Number(tradeProbe.lastPriceCents);
        }
      }
    }
    const now = Date.now();
    const current = this.market?.getQuote?.(ticker) || candidate;
    if (!current || String(current.eventTicker || current.ticker || '') !== eventTicker) {
      await Promise.resolve(this.db.audit?.('info', 'game_clock_refresh_event_identity_blocked', {
        ticker, eventTicker, freshEventTicker: current ? String(current.eventTicker || current.ticker || '') : null,
      })).catch(() => {});
      return null;
    }
    const siblings = [];
    const seen = new Set();
    const add = (q) => {
      if (!q?.ticker || seen.has(q.ticker)) return;
      if (String(q.eventTicker || q.ticker) !== eventTicker) return;
      seen.add(q.ticker);
      const liveStatus = computeLiveStatus({
        tradeCount: q.recentTrades, yesBid: q.yesBid, yesAsk: q.yesAsk,
        prevYesBid: q.prevYesBid || 0, prevYesAsk: q.prevYesAsk || 0,
        occurrenceTimeMs: q.occurrenceTimeMs, closeTimeMs: q.closeTimeMs,
        volume24h: q.volume24h, now,
      });
      siblings.push({ ...q, liveStatus });
    };
    add(current);
    for (const q of this.lastScanMarkets || []) add(q);
    if (!siblings.length) return null;
    const priorMap = typeof this.db.gameClockStates === 'function'
      ? await this.db.gameClockStates(this.settings.systemName, [eventTicker])
      : new Map();
    const prior = priorMap.get(eventTicker) || candidate?.gameClockState || null;
    const state = await this.gameClock.resolveEvent({
      eventTicker,
      quotes: siblings,
      priorState: prior,
      now,
      allowGameStats: true,
      forceFresh,
      allowSimulationActivityClock: this.settings.mode === 'SIMULATION',
      minimumElapsedMs: Math.max(0, Number(this.settings.minGameMinutes || 0)) * 60 * 1000,
    });
    if (typeof this.db.upsertGameClockState === 'function') {
      await this.db.upsertGameClockState(this.settings.systemName, eventTicker, state);
    }
    const gameStartTimeMs = isConfirmedGameClockState(state, eventTicker) ? Number(state.startTimeMs) : null;
    candidate.gameClockState = state || {};
    candidate.gameStartTimeMs = gameStartTimeMs;
    candidate.liveStatus = siblings.find((q) => q.ticker === ticker)?.liveStatus || candidate.liveStatus;
    const cached = this.market?.getQuote?.(ticker);
    if (cached) {
      cached.gameClockState = state || {};
      cached.gameStartTimeMs = gameStartTimeMs;
      cached.liveStatus = candidate.liveStatus;
    }
    return { gameClockState: state || {}, gameStartTimeMs, liveStatus: candidate.liveStatus };
  }

  async evaluateEntryChain(markets, trackerMap, marketMap) {
    const created=[];
    if(!this.referenceSignalGate().allowed)return created;
    const simulationToken=this.settings?.mode==='SIMULATION'?this.simulationMutationGate.capture():null;
    let releaseSimulationWork=null;
    if(this.settings?.mode==='SIMULATION'){
      releaseSimulationWork=this.simulationMutationGate.enter(simulationToken);
      if(!releaseSimulationWork)return created;
    }
    try{
      // Cosmo Universe remains observation/reference-only and is evaluated first
      // so Athena can consume the newest Pegasus/Dragon context in the same scan.
      // Phoenix is quote-event driven and therefore never adds a second scanner.
      created.push(...await this.strategy.evaluateDragon(marketMap));
      created.push(...await this.strategy.evaluateFeeders(markets,trackerMap));
      await this.refreshFeederPriorityTickers();
      if(this.entryExecutionGate().allowed){
        const admitted=this.admittedInitialExposureMap(marketMap,{allowProbe:false});
        created.push(...await this.evaluateNewGenerationOpportunities(admitted));
      }
      return created;
    }finally{try{releaseSimulationWork?.();}catch{}}
  }

  async fullScan() {
    const start = Date.now();
    this.speed = { ...this.speed, mode: 'fullScan', lastLoopMs: start, checksCompleted: 0, closedThisLoop: 0, fetchFailures: 0 };
    try {
      const open = await this.db.openEntries(this.settings.systemName);
      await this.refreshRecoveryPriorityTickers();
      this.refreshCrashPriorityTickers();
      const priority = [...new Set([...open.map((x) => x.ticker), ...this.recoveryPriorityTickers, ...this.crashPriorityTickers])];
      const markets = await this.market.discover(priority);
      this.lastScanMarkets = markets;
      this.lastDiscoveryMs = Date.now();
      this.health.lastDiscoveryMs = this.lastDiscoveryMs;
      for (const q of markets) this.market.sample(q.ticker, Date.now());
      for (const t of priority) {
        if (markets.some((q) => q.ticker === t)) continue;
        const q = this.market.getQuote(t);
        if (q) this.market.sample(q.ticker, Date.now());
      }
      const trackerMap = await this.persistTrackers(markets, [...new Set([...this.recoveryPriorityTickers, ...this.crashPriorityTickers])]);
      const map = new Map(markets.map((x) => [x.ticker, x]));
      for (const t of priority) {
        if (!map.has(t)) {
          const q = this.market.getQuote(t);
          if (q) map.set(t, q);
        }
      }

      // Recovery is a rescue path, so it gets first claim on capacity/cash.
      // Protection runs before all new exposure; newly stopped sources are then
      // added to the recovery-priority set and evaluated before Momentum/Wave.
      const before = (typeof this.db.openHunterEntries==='function'?await this.db.openHunterEntries(this.settings.systemName):await this.db.openEntries(this.settings.systemName)).filter((e)=>PORTFOLIO_CONCEPTS.has(e.conceptName)).length;
      await this.runProtectionSweep('full_scan');
      const after = (typeof this.db.openHunterEntries==='function'?await this.db.openHunterEntries(this.settings.systemName):await this.db.openEntries(this.settings.systemName)).filter((e)=>PORTFOLIO_CONCEPTS.has(e.conceptName)).length;
      this.speed.closedThisLoop = Math.max(0, before - after);
      await this.refreshRecoveryPriorityTickers();
      await this.learning.trackRecovery(this.market.quotes, this.settings);
      await this.learning.trackStopGuardRecovery?.(this.market.quotes,this.settings,this.market).catch(async(error)=>{
        await this.db.audit('warning','stop_guard_recovery_tracking',{source:'full_scan',message:String(error?.message||error)}).catch(()=>{});
      });
      for (const q of map.values()) await this.learning.observeCrashQuote(q, this.settings);
      this.refreshCrashPriorityTickers();

      const newEntries = await this.evaluateEntryChain(markets, trackerMap, map);

      await this.runPostExitResearchIfDue('full_scan');
      const trackers = await this.db.trackers(this.settings.systemName, 2000);
      await this.learning.learnMarketDrops(trackers, this.market.quotes);
      await this.learning.aggregatePatterns();
      await this.learning.aggregateStopGuardProfiles?.().catch(async(error)=>{
        await this.db.audit('warning','stop_guard_recovery_profile_aggregation',{message:String(error?.message||error)}).catch(()=>{});
      });
      await this.learning.learnDurations(this.market.quotes);
      await this.reconcileBroker().catch(() => {});
      await this.testConnection().catch(() => {});
      await this.snapshot();
      this.lastFullScanMs = Date.now();
      this.speed.lastLoopMs = this.lastFullScanMs;
      this.cycleFailureCount = 0;
      this.recomputeHealth();
      await this.db.audit('info', 'full_scan', { markets: markets.length, newEntries: newEntries.length, ms: Date.now() - start });
      return { markets: markets.length, newEntries: newEntries.length };
    } catch (e) {
      this.speed.fetchFailures = Number(this.speed.fetchFailures || 0) + 1;
      this.recordError('full_scan', e);
      throw e;
    }
  }

  async fastPhase(index) {
    const start = Date.now();
    const timestamps = [];
    let first = true;
    let closed = 0;
    let fail = 0;
    this.speed.mode = 'entryOnly';
    while (Date.now() - start < 50_000 && this.running) {
      const t = Date.now();
      timestamps.push(t);
      try {
        if (first) {
          const trackers = await this.db.trackers(this.settings.systemName, 500);
          const openEntries = await this.db.openEntries(this.settings.systemName);
          await this.refreshRecoveryPriorityTickers();
          this.refreshCrashPriorityTickers();
          const requiredTickers = new Set([...openEntries.map((e) => e.ticker), ...this.recoveryPriorityTickers, ...this.crashPriorityTickers]);
          const requiredTrackers = trackers.filter((tr) => requiredTickers.has(tr.ticker));
          const optionalTrackers = trackers.filter((tr) => !requiredTickers.has(tr.ticker)).slice(0, Math.max(0, 50 - requiredTrackers.length));
          const activeTrackers = [...requiredTrackers, ...optionalTrackers];
          const marketList = [];
          const trackerMap = new Map(trackers.map((x) => [x.ticker, x]));
          for (const tr of activeTrackers) {
            const q = this.market.getQuote(tr.ticker);
            if (q && !q.bookInvalid) {
              q.gameStartTimeMs = Number(tr.game_start_time_ms) || null;
              q.gameClockState = tr.game_clock_state && typeof tr.game_clock_state === 'object' ? tr.game_clock_state : {};
              q.liveStatus = tr.live_status;
              this.market.sample(q.ticker, t);
              marketList.push(q);
            }
          }
          const map = new Map(marketList.map((x) => [x.ticker, x]));
          for (const q of marketList) await this.learning.observeCrashQuote(q, this.settings);
          this.refreshCrashPriorityTickers();
          await this.evaluateEntryChain(marketList, trackerMap, map);
          first = false;
        }
        const before = (typeof this.db.openHunterEntries==='function'?await this.db.openHunterEntries(this.settings.systemName):await this.db.openEntries(this.settings.systemName)).filter((e)=>PORTFOLIO_CONCEPTS.has(e.conceptName)).length;
        await this.runProtectionSweep('fast_phase');
        const after = (typeof this.db.openHunterEntries==='function'?await this.db.openHunterEntries(this.settings.systemName):await this.db.openEntries(this.settings.systemName)).filter((e)=>PORTFOLIO_CONCEPTS.has(e.conceptName)).length;
        closed += Math.max(0, before - after);
      } catch (e) {
        fail += 1;
        await this.db.audit('error', 'fast_phase', { message: String(e?.message || e), loopIndex: index }).catch(() => {});
      }
      const spent = Date.now() - t;
      await waitUntil(Math.max(0, 450 - spent));
    }
    const cycles = timestamps.slice(1).map((x, i) => x - timestamps[i]);
    this.speed = {
      lastLoopMs: Date.now(),
      avgCycleMs: cycles.length ? Math.round(cycles.reduce((a, b) => a + b, 0) / cycles.length) : 0,
      maxCycleMs: cycles.length ? Math.max(...cycles) : 0,
      checksCompleted: timestamps.length,
      fetchFailures: fail,
      closedThisLoop: closed,
      mode: 'entryOnly',
      loopIndex: index,
    };
    await this.runPostExitResearchIfDue('fast_phase');
    await this.learning.trackStopGuardRecovery?.(this.market.quotes,this.settings,this.market).catch(async(error)=>{
      await this.db.audit('warning','stop_guard_recovery_tracking',{source:'fast_phase',message:String(error?.message||error)}).catch(()=>{});
    });
  }

  async cycleLoop() {
    while (this.running) {
      const cycleStart = Date.now();
      let complete = false;
      try {
        await this.fullScan();
        for (let i = 0; i < 3 && this.running; i += 1) await this.fastPhase(i);
        complete = true;
      } catch {
        this.cycleFailureCount += 1;
      }
      if (!this.running) break;
      if (!complete) {
        // A failed full scan retries quickly with bounded backoff instead of
        // sleeping out the entire 5-minute cadence. This is process recovery,
        // not a second concurrent scanner.
        const retryMs = Math.min(10_000 * Math.max(1, this.cycleFailureCount), 60_000);
        const until = Date.now() + retryMs;
        while (this.running && !this.scanRequested && Date.now() < until) await sleep(500);
      } else {
        while (this.running && !this.scanRequested && Date.now() - cycleStart < 300_000) await sleep(500);
      }
      this.scanRequested = false;
    }
  }

  quoteView(entry) {
    const q = this.market?.getQuote(entry.ticker);
    const age = q ? this.market.quoteAgeMs(entry.ticker) : Infinity;
    const status = String(q?.status || '').toLowerCase();
    const final = FINAL_STATUSES.has(status) && Boolean(q?.result);
    if (final) {
      return {
        q,
        priceCents: String(q.result).toLowerCase() === 'yes' ? 100 : 0,
        quoteAgeMs: age,
        dataState: 'FINALIZED',
      };
    }
    if (q && age <= DISPLAY_QUOTE_FRESH_MS && Number(q.yesBid) > 0 && !q.bookInvalid) {
      return { q, priceCents: Number(q.yesBid), quoteAgeMs: age, dataState: 'LIVE' };
    }
    const fallback = Number(entry.currentPriceCents) > 0 ? Number(entry.currentPriceCents) : Number(entry.entryPriceCents);
    const dataState = q?.result ? 'SETTLEMENT_PENDING' : q && Number(q.yesBid) <= 0 ? 'NO_BID' : 'STALE';
    return { q, priceCents: fallback, quoteAgeMs: age, dataState };
  }

  entryFeeRemaining(entry) {
    const original = Math.max(0, Number(entry.count || 0));
    const remaining = Math.max(0, Number(entry.remainingCount ?? original));
    const total = Number(entry.entryFeeCents || 0) > 0
      ? Number(entry.entryFeeCents)
      : Number(this.settings.simFeeCents || 0) * original;
    return original > 0 ? total * (remaining / original) : 0;
  }

  openUnrealized(entry, priceCents) {
    const remaining = Math.max(0, Number(entry.remainingCount ?? entry.count ?? 0));
    const exitFee = Number(this.settings.simFeeCents || 0) * remaining;
    return (Number(priceCents) - Number(entry.entryPriceCents)) * remaining - this.entryFeeRemaining(entry) - exitFee;
  }

  async snapshot() {
    const state = await this.performance();
    await this.db.insertSnapshot({
      systemName: this.settings.systemName,
      createdAtMs: Date.now(),
      portfolioValueCents: state.portfolioValueCents,
      realizedPnlCents: state.hunterRealizedCents,
      unrealizedPnlCents: state.hunterUnrealizedCents,
      hunterRealizedPnlCents: state.hunterRealizedCents,
      hunterUnrealizedPnlCents: state.hunterUnrealizedCents,
      feederRealizedPnlCents: state.feederRealizedCents,
      feederUnrealizedPnlCents: state.feederUnrealizedCents,
      winRate: state.winRate,
      openCount: state.openHunters,
      closedCount: state.closedHunters,
    });
    this.lastSnapshotMs = Date.now();
  }

  async performance({ fullHistory=false }={}) {
    const canUseOperational = !fullHistory
      && typeof this.db?.performanceAggregate === 'function'
      && typeof this.db?.openEntries === 'function'
      && typeof this.db?.recentClosedHunters === 'function'
      && typeof this.db?.conceptStatsAggregate === 'function';
    if (!canUseOperational) {
      const entries = await this.db.entries(this.settings.systemName, { limit: 5000 });
      const reset = this.settings.resetTimestampMs || 0;
      const active = entries.filter((e) => !e.archived);
      const hunters = active.filter((e) => PORTFOLIO_CONCEPTS.has(e.conceptName));
      const closed = hunters.filter((e) => e.status === 'closed' && (!reset || e.closedAtMs >= reset));
      const open = hunters.filter((e) => openLike(e.status));
      const wins = closed.filter((e) => e.pnlCents > 0).length;
      const losses = closed.filter((e) => e.pnlCents < 0).length;
      const scratches = closed.filter((e) => e.pnlCents === 0).length;
      const closedRealized = closed.reduce((sum, e) => sum + Number(e.pnlCents || 0), 0);
      const partialRealized = open.filter((e) => !reset || Number(e.updatedAtMs || 0) >= reset).reduce((sum, e) => sum + Number(e.pnlCents || 0), 0);
      const realized = closedRealized + partialRealized;
      const unrealized = open.reduce((sum, e) => { const v = this.quoteView(e); return sum + this.openUnrealized(e, v.priceCents); }, 0);
      const ghosts = active.filter((e) => FEEDER_CONCEPTS.has(e.conceptName));
      const ghostOpen = ghosts.filter((e) => openLike(e.status));
      const feederUnrealized = ghostOpen.reduce((sum, e) => { const v = this.quoteView(e); const count = Number(e.count || 0); return sum + (v.priceCents - e.entryPriceCents) * count - 2 * Number(this.settings.simFeeCents || 2) * count; }, 0);
      const simulationCashCents = await this.strategy.simulationAvailableCashCents(entries).catch(() => null);
      return {entries,active,hunters,closed,open,wins,losses,scratches,hunterRealizedCents:realized,closedRealizedCents:closedRealized,partialRealizedCents:partialRealized,hunterUnrealizedCents:unrealized,feederRealizedCents:0,feederUnrealizedCents:feederUnrealized,winRate:closed.length?wins/closed.length:0,openHunters:open.length,closedHunters:closed.length,portfolioValueCents:this.settings.startingCapitalCents+realized+unrealized,simulationCashCents,conceptAggregate:null,operationalHistory:false};
    }

    const reset = Number(this.settings.resetTimestampMs || 0);
    const jobs = [
      () => this.db.performanceAggregate(this.settings.systemName,{resetTimestampMs:reset}),
      () => this.db.openEntries(this.settings.systemName),
      () => this.db.recentClosedHunters(this.settings.systemName,{limit:150,resetTimestampMs:reset}),
      () => this.db.conceptStatsAggregate(this.settings.systemName),
    ];
    const [aggregate,openEntries,recentClosed,conceptAggregate] = await mapLimit(jobs,2,(job)=>job());
    const open = (openEntries||[]).filter((e)=>PORTFOLIO_CONCEPTS.has(e.conceptName));
    const ghosts = (openEntries||[]).filter((e)=>FEEDER_CONCEPTS.has(e.conceptName));
    const closed = (recentClosed||[]).filter((e)=>PORTFOLIO_CONCEPTS.has(e.conceptName));
    const active = [...(openEntries||[]),...closed];
    const hunters = [...open,...closed];
    const unrealized = open.reduce((sum,e)=>{const v=this.quoteView(e);return sum+this.openUnrealized(e,v.priceCents);},0);
    const feederUnrealized = ghosts.reduce((sum,e)=>{const v=this.quoteView(e),count=Number(e.count||0);return sum+(v.priceCents-e.entryPriceCents)*count-2*Number(this.settings.simFeeCents||2)*count;},0);
    let reserved=0;
    for(const e of open){
      if(e.mode!=='SIMULATION')continue;
      const originalCount=Math.max(0,Number(e.count||0)),remaining=Math.max(0,Number(e.remainingCount||originalCount));
      const storedEntryFee=Number(e.entryFeeCents||0),totalEntryFee=storedEntryFee>0?storedEntryFee:Number(this.settings.simFeeCents||0)*originalCount;
      reserved+=Number(e.entryPriceCents||0)*remaining+(originalCount>0?totalEntryFee*(remaining/originalCount):0);
    }
    const closedRealized=Number(aggregate?.closed_realized_cents||0),partialRealized=Number(aggregate?.partial_realized_cents||0),realized=closedRealized+partialRealized;
    const simulationCashCents=Number(this.settings.startingCapitalCents||0)+Number(aggregate?.simulation_ledger_pnl_cents||0)-reserved;
    const wins=Number(aggregate?.wins||0),losses=Number(aggregate?.losses||0),scratches=Number(aggregate?.scratches||0),closedHunters=Number(aggregate?.closed_hunters||0),openHunters=Number(aggregate?.open_hunters||open.length);
    return {entries:active,active,hunters,closed,open,wins,losses,scratches,hunterRealizedCents:realized,closedRealizedCents:closedRealized,partialRealizedCents:partialRealized,hunterUnrealizedCents:unrealized,feederRealizedCents:0,feederUnrealizedCents:feederUnrealized,winRate:closedHunters?wins/closedHunters:0,openHunters,closedHunters,portfolioValueCents:this.settings.startingCapitalCents+realized+unrealized,simulationCashCents,conceptAggregate,operationalHistory:true};
  }

  buildAuroraSummary(entries = []) {
    const protectedRows=(entries||[]).filter((e)=>PORTFOLIO_CONCEPTS.has(e.conceptName)&&e?.entryConfig?.aurora?.version===AURORA_EXECUTION.version&&e.entryConfig.aurora.frozen===true);
    const exits=protectedRows.filter((e)=>e.status==='closed'&&['hard_stop_loss','aurora_covenant_fault'].includes(String(e.closeReason||'')));
    const active=protectedRows.filter((e)=>openLike(e.status));
    const avg=(rows,fn)=>rows.length?rows.reduce((sum,e)=>sum+Number(fn(e)||0),0)/rows.length:0;
    let avoided=0,forgone=0,observable=0,finalized=0,finalCapitalPreserved=0;
    for(const e of exits){
      const v=this.quoteView(e);
      if(!['LIVE','FINALIZED'].includes(v.dataState)||e.exitPriceCents==null)continue;
      const qty=Math.max(0,Number(e.count||0));
      const delta=(Number(e.exitPriceCents)-Number(v.priceCents))*qty;
      if(delta>0)avoided+=delta;else if(delta<0)forgone+=-delta;
      observable+=1;
      if(v.dataState==='FINALIZED'){finalized+=1;if(delta>0)finalCapitalPreserved+=delta;}
    }
    const recovered=exits.filter((e)=>Number(e.recoveryToGreenAtMs||0)>0).length;
    const recoveryObserved=exits.filter((e)=>e.researchTrackingComplete===true||Number(e.recoveryToGreenAtMs||0)>0).length;
    const bands={};
    for(const e of protectedRows){
      const band=String(e.entryConfig?.aurora?.entryBand||'unknown');
      const b=bands[band]||(bands[band]={protected:0,active:0,exits:0,realizedPnlCents:0,averageStopDistanceCents:0,_stopTotal:0});
      b.protected+=1;b._stopTotal+=Number(e.entryConfig.aurora.stopDistanceCents||0);
      if(openLike(e.status))b.active+=1;
      if(e.status==='closed'&&['hard_stop_loss','aurora_covenant_fault'].includes(String(e.closeReason||''))){b.exits+=1;b.realizedPnlCents+=Number(e.pnlCents||0);}
    }
    for(const b of Object.values(bands)){b.averageStopDistanceCents=b.protected?b._stopTotal/b.protected:0;delete b._stopTotal;}
    return {
      version:AURORA_EXECUTION.version,policyRevision:AURORA_EXECUTION.policyRevision,damageControlPercent:Number(this.settings.auroraDamageControlPercent??AURORA_EXECUTION.defaultDamageControlPercent),maximumEconomicLossRatio:Number(this.settings.auroraDamageControlPercent??AURORA_EXECUTION.defaultDamageControlPercent)/100,
      protectedHunters:protectedRows.length,activeAuroraPositions:active.length,auroraExits:exits.length,
      averageAuroraStopCents:avg(protectedRows,e=>e.entryConfig.aurora.stopDistanceCents),
      averageEconomicLossRatio:avg(protectedRows,e=>e.entryConfig.aurora.economicLossRatioAtDanger),
      realizedAuroraPnlCents:exits.reduce((sum,e)=>sum+Number(e.pnlCents||0),0),
      averageAuroraLossCents:exits.length?exits.reduce((sum,e)=>sum+Math.min(0,Number(e.pnlCents||0)),0)/exits.length:0,
      recoveredAfterAuroraExit:recovered,recoveryObserved,recoveryRate:recoveryObserved?recovered/recoveryObserved:null,
      falseStopEvidence:recovered,
      counterfactual:{label:'COUNTERFACTUAL',observableExits:observable,finalizedExits:finalized,capitalPreservedCents:finalCapitalPreserved,lossAvoidedCents:avoided,forgoneUpsideCents:forgone,netProtectionValueCents:avoided-forgone,basis:'post_exit_current_or_final_mark_vs_actual_exit_gross_contract_delta'},
      averageTimeToAuroraMs:avg(exits,e=>Math.max(0,Number(e.closedAtMs||0)-Number(e.openedAtMs||0))),entryBands:bands,
    };
  }

  buildInfinityBreakSummary(entries=[]){
    const rows=(entries||[]).filter(e=>PORTFOLIO_CONCEPTS.has(e.conceptName)&&String(e?.entryConfig?.infinityBreak?.version||'')===INFINITY_BREAK.version);
    const closed=rows.filter(e=>e.status==='closed'&&e.closeReason==='infinity_break');
    const active=rows.filter(e=>openLike(e.status));
    const pnl=closed.reduce((sum,e)=>sum+Number(e.pnlCents||0),0);
    return{version:INFINITY_BREAK.version,policyRevision:INFINITY_BREAK.policyRevision,role:INFINITY_BREAK.role,authority:INFINITY_BREAK.authority,positionsObserved:rows.length,activePositions:active.length,breaksExecuted:closed.length,realizedPnlCents:pnl,averageProfitCents:closed.length?pnl/closed.length:0,averageTimeToBreakMs:closed.length?closed.reduce((sum,e)=>sum+Math.max(0,Number(e.closedAtMs||0)-Number(e.openedAtMs||0)),0)/closed.length:0,minimumNetPerOriginalContractCents:Number(this.settings.infinityBreakMinNetPerOriginalContractCents??INFINITY_BREAK.defaultMinimumNetPerOriginalContractCents),requiredFreshConfirmations:Number(this.settings.infinityBreakRequiredConfirmations??INFINITY_BREAK.defaultRequiredFreshConfirmations),maximumBookAgeMs:Number(this.settings.infinityBreakMaximumBookAgeMs??INFINITY_BREAK.defaultMaximumBookAgeMs),confirmationWindowMs:Number(this.settings.infinityBreakConfirmationWindowMs??INFINITY_BREAK.defaultConfirmationWindowMs),fullPositionOnly:true,lossAuthority:INFINITY_BREAK.lossAuthority};
  }

  resourcePressureForRss(rssBytes=0){
    const mib=Math.max(0,Number(rssBytes||0))/(1024*1024);
    if(mib>=RUNTIME_RESOURCE_GOVERNOR.hardResearchShedAtMiB)return 'HARD_RESEARCH_SHED';
    if(mib>=RUNTIME_RESOURCE_GOVERNOR.tradePriorityAtMiB)return 'TRADE_PRIORITY';
    if(mib>=RUNTIME_RESOURCE_GOVERNOR.pressureAtMiB)return 'PRESSURE';
    if(mib>=RUNTIME_RESOURCE_GOVERNOR.compactAtMiB)return 'COMPACT';
    return 'GREEN';
  }

  resourceProtectedCrashTickers(){
    return new Set([
      ...(this.market?.wanted||[]),...(this.protectedTickers||[]),...(this.recoveryPriorityTickers||[]),
      ...(this.crashPriorityTickers||[]),...(this.feederPriorityTickers||[]),
    ].filter(Boolean).map(String));
  }

  applyResourceGovernance({memory=null,force=false}={}){
    const mem=memory&&typeof memory==='object'?memory:process.memoryUsage();
    const rssBytes=Math.max(0,Number(mem.rss||0));
    const next=this.resourcePressureForRss(rssBytes);
    const prior=this.resourcePressureState||'GREEN';
    if(next!==prior)this.resourceGovernorTransitions+=1;
    this.resourcePressureState=next;
    this.resourceResearchDeferred=['PRESSURE','TRADE_PRIORITY','HARD_RESEARCH_SHED'].includes(next);
    const crashLimit=RUNTIME_RESOURCE_GOVERNOR.crashStateLimits[next]||RUNTIME_RESOURCE_GOVERNOR.crashStateLimits.GREEN;
    const fsiLimit=RUNTIME_RESOURCE_GOVERNOR.fsiObservationLimits[next]||RUNTIME_RESOURCE_GOVERNOR.fsiObservationLimits.GREEN;
    const protectedTickers=this.resourceProtectedCrashTickers();
    const crash=this.learning?.compactForMemoryPressure?.({limit:crashLimit,protectedTickers})||null;
    let phoenix=null;
    if(this.phoenixCosmo){const limits={GREEN:1024,COMPACT:768,PRESSURE:512,TRADE_PRIORITY:256,HARD_RESEARCH_SHED:128};phoenix=this.phoenixCosmo.compact?.({maximumStates:limits[next]||512})||null;}
    let fsi=null;
    if(this.feederSignalIntel){
      if(next==='GREEN')this.feederSignalIntel.restoreNormalObservationLimit?.();
      fsi=this.feederSignalIntel.compactForMemoryPressure?.(fsiLimit)||null;
    }
    if(this.resourceResearchDeferred){this.stateSnapshotCache=null;this.stateSnapshotAtMs=0;}
    this.resourceGovernorActions+=1;
    this.resourceGovernorLastActionAtMs=Date.now();
    this.resourceGovernorLastResult={pressureState:next,priorPressureState:prior,rssBytes,crash,phoenix,fsi,researchDeferred:this.resourceResearchDeferred,protectedCrashTickers:protectedTickers.size};
    return this.resourceGovernorLastResult;
  }

  resourceUsageSnapshot() {
    const sampledAtNs=process.hrtime.bigint();
    const cpu=process.cpuUsage();
    const priorAtNs=typeof this.resourceSampleAtNs==='bigint'?this.resourceSampleAtNs:sampledAtNs;
    const priorCpu=this.resourceCpuUsage&&Number.isFinite(Number(this.resourceCpuUsage.user))&&Number.isFinite(Number(this.resourceCpuUsage.system))?this.resourceCpuUsage:cpu;
    const elapsedMicros=Math.max(0,Number(sampledAtNs-priorAtNs)/1000);
    const cpuMicros=Math.max(0,Number(cpu.user)-Number(priorCpu.user)+Number(cpu.system)-Number(priorCpu.system));
    const cpuPercent=elapsedMicros>0?Math.max(0,100*cpuMicros/elapsedMicros):0;
    this.resourceSampleAtNs=sampledAtNs;
    this.resourceCpuUsage=cpu;
    const memory=process.memoryUsage();
    const rssBytes=Math.max(0,Number(memory.rss||0));
    const MiB=1024*1024;
    const status=rssBytes>=RUNTIME_RESOURCE_GOVERNOR.criticalRssMiB*MiB?'HIGH':rssBytes>=RUNTIME_RESOURCE_GOVERNOR.warningRssMiB*MiB?'WATCH':'NORMAL';
    const pressureState=this.resourcePressureForRss(rssBytes);
    return {
      version:RUNTIME_RESOURCE_GOVERNOR.version,status,sampledAtMs:Date.now(),
      preferredRssCeilingMiB:RUNTIME_RESOURCE_GOVERNOR.preferredRssCeilingMiB,
      warningRssMiB:RUNTIME_RESOURCE_GOVERNOR.warningRssMiB,
      criticalRssMiB:RUNTIME_RESOURCE_GOVERNOR.criticalRssMiB,hardCeilingMiB:RUNTIME_RESOURCE_GOVERNOR.hardCeilingMiB,
      pressureState,resourceGovernorTransitions:Number(this.resourceGovernorTransitions||0),resourceGovernorActions:Number(this.resourceGovernorActions||0),resourceGovernorLastActionAtMs:Number(this.resourceGovernorLastActionAtMs||0),resourceGovernorLastResult:this.resourceGovernorLastResult,
      researchDeferred:this.resourceResearchDeferred===true,tradingAuthority:RUNTIME_RESOURCE_GOVERNOR.tradingAuthority,
      authority:'TELEMETRY_AND_NON_AUTHORITY_CACHE_GOVERNANCE',
      cpuPercent,uptimeSeconds:process.uptime(),pid:process.pid,
      memory:{rssBytes,heapUsedBytes:Number(memory.heapUsed||0),heapTotalBytes:Number(memory.heapTotal||0),externalBytes:Number(memory.external||0),arrayBuffersBytes:Number(memory.arrayBuffers||0)},
      queues:{
        entry:this.entryEvaluationQueue?.snapshot?.()||{},
        protection:this.quoteProtectionQueue?.snapshot?.()||{},
        anotherDimension:this.anotherDimensionQueue?.snapshot?.()||{},
        justiceArrow:this.justiceArrowQueue?.snapshot?.()||{},
      },
      entryAdmission:this.entryAdmissionSnapshot?.()||{},
      workload:{version:DATABASE_PRESSURE_ISOLATION.version,entryAdmissionControl:ENTRY_ADMISSION_CONTROL.version,quoteProtectionScope:DATABASE_PRESSURE_ISOLATION.quoteProtectionScope,entryWorkers:ENTRY_EVALUATION_CONCURRENCY,protectionWorkers:QUOTE_PROTECTION_CONCURRENCY,ordinaryPoolReservedHeadroom:DATABASE_PRESSURE_ISOLATION.ordinaryPoolReservedHeadroom,lowPriorityPersistenceConcurrency:DATABASE_PRESSURE_ISOLATION.lowPriorityPersistenceConcurrency,lowPriorityPersistenceMaximumPending:DATABASE_PRESSURE_ISOLATION.lowPriorityPersistenceMaximumPending,lowPriorityPersistenceScope:DATABASE_PRESSURE_ISOLATION.lowPriorityPersistenceScope,lowPriorityPersistenceMaximumBatchBytes:DATABASE_PRESSURE_ISOLATION.lowPriorityPersistenceMaximumBatchBytes,fsiPersistenceRevision:DATABASE_PRESSURE_ISOLATION.fsiPersistenceRevision,fsiPersistenceBatchSize:DATABASE_PRESSURE_ISOLATION.fsiPersistenceBatchSize,referenceSignalSweepIntervalMs:REFERENCE_SIGNAL_SWEEP_MS,lastReferenceSweepMs:this.lastReferenceSweepMs||0,postExitResearchSweepIntervalMs:POST_EXIT_RESEARCH.sweepIntervalMs,postExitResearchMaximumRowsPerSweep:POST_EXIT_RESEARCH.maximumRowsPerSweep,lastPostExitResearchMs:this.lastPostExitResearchMs||0,stateCollectionSingleFlight:true,stateSnapshotTtlMs:STATE_SNAPSHOT_TTL_MS,stateDbFanoutMaximum:STATE_DB_FANOUT_MAX,stateCollectionCount:Number(this.stateCollectionCount||0),stateSnapshotAgeMs:this.stateSnapshotAtMs?Math.max(0,Date.now()-this.stateSnapshotAtMs):null},
      database:this.db?.resourceSnapshot?.()||{},
      market:this.market?.resourceSnapshot?.()||{},
      gameClock:this.gameClock?.resourceSnapshot?.()||{},
      feederSignalIntel:this.feederSignalIntel?.resourceSnapshot?.()||{},
      learning:this.learning?.resourceSnapshot?.()||{},
      strategy:this.strategy?.resourceSnapshot?.()||{},
      shadowAttack:{universe:'Gemini',activeCosmosTickers:Number(this.activeCosmosByTicker?.size||0),sourcePeaks:Number(this.anotherDimensionSourcePeaks?.size||0),anotherDimensionOpen:Number(this.anotherDimensionOpenByTicker?.size||0),anotherDimensionRecent:Number(this.anotherDimensionRecent?.size||0),anotherDimensionRuntime:Number(this.anotherDimensionRuntime?.size||0),openAttemptBookDedup:Number(this.geminiOpenAttemptBookMs?.size||0),maximumRecent:ANOTHER_DIMENSION.maximumRecentResults},
      profitGuard:this.profitGuard?.resourceSnapshot?.()||{},
    };
  }

  invalidateStateSnapshot() { this.stateSnapshotAtMs=0; }

  async state({ force=false }={}) {
    const now=Date.now();
    if(!force&&this.stateSnapshotCache&&now-this.stateSnapshotAtMs<=STATE_SNAPSHOT_TTL_MS)return this.stateSnapshotCache;
    if(this.stateCollectionPromise)return this.stateCollectionPromise;
    const run=this.collectState().then((snapshot)=>{this.stateSnapshotCache=snapshot;this.stateSnapshotAtMs=Date.now();this.stateCollectionCount+=1;return snapshot;});
    this.stateCollectionPromise=run;
    try{return await run;}
    finally{if(this.stateCollectionPromise===run)this.stateCollectionPromise=null;}
  }

  async collectState() {
    this.recomputeHealth();
    // Compact only reconstructable state before building the 2-second SSE
    // snapshot. Protection/execution objects are never touched by RGM3.
    this.applyResourceGovernance();
    const p = await this.performance();
    const entries = p.active;
    // HF5: state is observability, never trading authority. Collect its DB
    // sections with a small fan-out instead of consuming all eight ordinary
    // PostgreSQL clients at once every SSE tick.
    // R54 operational state is intentionally small. Historical/research tables
    // are loaded only by an explicit diagnostics request, never every SSE tick.
    const stateJobs=[
      ()=>typeof this.db.trackerDashboardRows==='function'?this.db.trackerDashboardRows(this.settings.systemName,100):this.db.trackers(this.settings.systemName,100),
      ()=>typeof this.db.trackerSummary==='function'?this.db.trackerSummary(this.settings.systemName):null,
      ()=>this.db.recentAudit(30),
      ()=>this.db.recoveryTrackingCount(this.settings.systemName),
      ()=>typeof this.db.atomicThunderStats==='function'?this.db.atomicThunderStats(this.settings.systemName):{observedHunters:0,opportunitiesDetected:0,harvestsExecuted:0,invalidOpportunitiesBlocked:0,confirmationResets:0,realizedPnlCents:0,averageProfitCents:0,averageTimeToHarvestMs:0,lossesAvoided:0,avoidedLossCents:0,forgoneUpsideCents:0,researchComplete:0,recent:[]},
      ()=>typeof this.db.opportunitySummary==='function'?this.db.opportunitySummary(this.settings.systemName):{total:0,fire:0,watch:0,reject:0,expired:0,clean:0,toxicLate:0,falseBolt:0,expiredNoImpulse:0,complete:0},
    ];
    const [trackers,trackerAggregate,audit,recoveryTracking,atomicThunder,opportunitySummary]=await mapLimit(stateJobs,STATE_DB_FANOUT_MAX,(job)=>job());
    const patterns=[],sports=[],snapshots=[],crashEpisodes=[];
    const crashLearning = this.learning?.crashLearningSummary?.() || { version:'CI1', states:[], totalEpisodes:0, multipleCrashMarkets:0 };
    const profitLearning = this.learning?.profitLearningSummary?.() || { version:PROFIT_LEARNING_INTELLIGENCE.version, tracked:0, complete:0, postExitTracking:0, active:0 };
    const stopGuardRecoveryLearning = await this.learning?.stopGuardRecoverySummary?.().catch(()=>null) || { version:STOP_GUARD_RECOVERY_LEARNING.version, tracked:0, complete:0, recovered:0, decisionEvidenceMode:STOP_GUARD_RECOVERY_LEARNING.decisionEvidenceMode };
    const athena = this.athena?.summary?.() || { version:ATHENA_BRAIN.version, ready:false, adaptiveMode:ATHENA_BRAIN.adaptiveMode, adaptiveDecisionWeight:0 };
    const entryPipeline = this.strategy?.entryPipelineSummary?.() || { version:'EPT1', attempts:0, opened:0, blocked:0, byStage:{}, byReason:{}, recent:[] };
    const entryCandidateFunnel=this.entryCandidateFunnelSummary();
    // R51: Cosmos strengthens Athena intelligence but is never a prerequisite
    // for a Bolt or for an Athena-authorized initial Attack.
    const initialExposureEnabled = [
      this.settings.momentumHunterEnabled === true ? 'Momentum Hunter' : null,
      this.settings.waveSurferEnabled === true ? 'Wave Surfer' : null,
      this.settings.crashRecoveryHunterEnabled === true ? 'Crash Recovery Hunter' : null,
      this.settings.lightningPlasmaEnabled === true ? 'Lightning Plasma' : null,
      this.settings.athenaExclamationEnabled === true ? 'Athena Exclamation' : null,
    ].filter(Boolean);
    const executionGate = this.entryExecutionGate();
    const referenceGate = this.referenceSignalGate();
    const entryPathWarnings = [];
    const enabledGoldSaints=[
      this.settings.waveSurferEnabled===true?'Wave Surfer':null,
      this.settings.crashRecoveryHunterEnabled===true?'Crash Recovery Hunter':null,
      this.settings.recoveryHunterEnabled===true?'Recovery Hunter':null,
      this.settings.momentumHunterEnabled===true?'Momentum Hunter':null,
      this.settings.lightningPlasmaEnabled===true?'Lightning Plasma':null,
    ].filter(Boolean);
    if (this.settings.athenaExclamationEnabled===true && enabledGoldSaints.length<3) entryPathWarnings.push('Athena Exclamation is enabled but fewer than three Gold Saint Attacks are enabled');
    if (this.settings.recoveryHunterEnabled === true) entryPathWarnings.push('Recovery Hunter is follow-on only and requires an eligible stopped Hunter source');
    if (!initialExposureEnabled.length) entryPathWarnings.push('No currently enabled configuration can create an initial real Hunter exposure');
    if (referenceGate.allowed && !executionGate.allowed) entryPathWarnings.push(`Real Hunter execution blocked by ${executionGate.reason}; reference feeders remain active`);
    const entryPathConfiguration = {
      version:'EPC11-R63', authorityChain:'GAME_CLOCK->COSMO_SHADOW->COSMO_GREEN->ATOMIC_THUNDER_BOLT->ATHENA->ATTACK->INFINITY_BREAK/AURORA + PROFIT_CLOSE->SCARLET_NEEDLE->HARD_SAFETY->INFINITY_BREAK/AURORA + COSMO_SHADOW->GEMINI->ANOTHER_DIMENSION->PLUS_ONE_NET_SHADOW_CLOSE->SAGITTARIUS_JUSTICE_ARROW->HARD_SAFETY->ATHENA_X1/AURORA', noBoltNoAttack:true, noBoltNoAttackExceptions:['SCARLET_NEEDLE_POST_PROFIT_CONTINUATION','SAGITTARIUS_JUSTICE_ARROW_POST_SHADOW_WIN','CRYSTAL_WALL_POST_STOP_CONTINUATION'], cosmoGreenRequired:true, initialExposureEnabled, scarletNeedleContinuationEnabled:this.settings.scarletNeedleEnabled===true&&Number(this.settings.scarletNeedleMaxRepeats||0)>0, geminiEnabled:this.settings.geminiEnabled===true, anotherDimensionAttackEnabled:this.settings.geminiEnabled===true, justiceArrowContinuationEnabled:this.settings.justiceArrowEnabled===true, crystalWallContinuationEnabled:this.settings.recoveryHunterEnabled===true, recoveryFollowOnEnabled:this.settings.recoveryHunterEnabled === true, warnings:entryPathWarnings,
      entryModeIsolation:'EMI1', referenceSignalEvaluationActive:referenceGate.allowed,
      realHunterExecutionAuthorized:executionGate.allowed, executionGateReason:executionGate.reason,
    };
    const conceptStats = p.conceptAggregate ? this.buildConceptStatsFromAggregate(p.conceptAggregate) : this.buildConceptStats(entries);
    const auroraExecution = this.buildAuroraSummary(entries);
    const infinityBreak = this.buildInfinityBreakSummary(entries);
    const atomicThunderBolt={...this.atomicThunderBolt?.summary?.(),episodes:opportunitySummary};
    const openHunters = p.open.map((e) => this.decorateEntry(e));
    // R60: the real Attack is the durable forward authority for Cosmos -> Bolt -> FIRE
    // lineage. Reconstruct the reverse dashboard link from sourceTradeId so an
    // interrupted best-effort shadow-row back-link can never hide causality after
    // restart. The newest linked Attack wins when historical rows share a source.
    const realEntryByShadowId = new Map();
    for (const hunter of [...(p.hunters || [])].sort((a,b)=>Number(a.openedAtMs||0)-Number(b.openedAtMs||0))) {
      const sourceId=String(hunter?.sourceTradeId||'');
      if (!sourceId || !PORTFOLIO_CONCEPTS.has(hunter?.conceptName)) continue;
      realEntryByShadowId.set(sourceId,hunter);
    }
    const openFeeders = entries.filter((e) => ACTIVE_FEEDER_CONCEPTS.has(e.conceptName) && openLike(e.status)).map((e) => {
      const decorated=this.decorateEntry(e);
      const linked=realEntryByShadowId.get(String(e.id));
      if (!linked) return decorated;
      return {
        ...decorated,
        athenaSelectedAttack:decorated.athenaSelectedAttack||linked.conceptName||null,
        realEntryId:decorated.realEntryId||linked.id||null,
      };
    });
    const anotherDimensionRows=[...this.anotherDimensionRecent.values()]
      .filter((e)=>!e.archived)
      .sort((a,b)=>Number(b.openedAtMs||0)-Number(a.openedAtMs||0))
      .slice(0,ANOTHER_DIMENSION.maximumRecentResults)
      .map((e)=>{
        const decorated=this.decorateEntry(e);
        const linked=realEntryByShadowId.get(String(e.id));
        return linked?{...decorated,athenaSelectedAttack:'Sagittarius Justice Arrow',realEntryId:linked.id||null}:decorated;
      });
    const cosmoShadowTrades=[...openFeeders]
      .sort((a,b)=>Number(b.openedAtMs||0)-Number(a.openedAtMs||0));
    const geminiTrades=[...anotherDimensionRows];
    // Gemini board statistics are reconstructed from the durable virtual-trade
    // rows rather than process-local counters. A Railway restart therefore
    // cannot make the Gemini table show trades while its W/L/P&L header resets
    // to zero. The table is intentionally capped to the same bounded recent
    // cohort as the rows rendered below.
    const geminiClosed=geminiTrades.filter((e)=>e.status==='closed');
    const geminiSummary={
      version:GEMINI_UNIVERSE.version,policyRevision:GEMINI_UNIVERSE.policyRevision,name:'Gemini',enabled:this.settings.geminiEnabled===true,
      referenceStakeCents:Number(this.settings.geminiReferenceStakeCents||0),minPriceCents:Number(this.settings.geminiMinPriceCents||0),maxPriceCents:Number(this.settings.geminiMaxPriceCents||0),
      brokerOrderAuthority:false,portfolioCapitalAuthority:false,simulationPortfolioCapitalAuthority:false,attack:'Another Dimension',
      total:geminiTrades.length,open:geminiTrades.filter((e)=>openLike(e.status)).length,closed:geminiClosed.length,
      wins:geminiClosed.filter((e)=>Number(e.pnlCents||0)>0).length,losses:geminiClosed.filter((e)=>Number(e.pnlCents||0)<0).length,pnlCents:geminiClosed.reduce((sum,e)=>sum+Number(e.pnlCents||0),0),
      avgEntryCents:geminiTrades.length?geminiTrades.reduce((sum,e)=>sum+Number(e.entryPriceCents||0),0)/geminiTrades.length:0,
      avgCurrentCents:geminiTrades.length?geminiTrades.reduce((sum,e)=>sum+Number(e.currentPriceCents||e.exitPriceCents||e.entryPriceCents||0),0)/geminiTrades.length:0,
    };
    const closedHunters = p.closed.map((e) => this.decorateEntry(e));
    const scanned = this.lastScanMarkets.slice(0, 100);
    const trackerSummary = trackerAggregate || {
      tracked: trackers.length,
      hot: trackers.filter((t) => t.phase === 'hot').length,
      aboutToEnter: trackers.filter((t) => t.phase === 'about_to_enter').length,
      entered: trackers.filter((t) => t.phase === 'entered').length,
      recovery: trackers.filter((t) => t.phase === 'recovery').length,
    };
    const feederSummary = p.conceptAggregate ? this.buildFeederSummaryFromAggregate(p.conceptAggregate) : (()=>{
      const fedHunters=p.hunters.filter((e)=>e.sourceFeeder&&ACTIVE_FEEDER_CONCEPTS.has(e.sourceFeeder));
      const fedClosed=fedHunters.filter((e)=>e.status==='closed'),fedWins=fedClosed.filter((e)=>e.pnlCents>0).length,fedLosses=fedClosed.filter((e)=>e.pnlCents<0).length;
      return{hunters:fedHunters.length,wins:fedWins,losses:fedLosses,scratches:fedClosed.filter((e)=>e.pnlCents===0).length,pnlCents:fedClosed.reduce((sum,e)=>sum+e.pnlCents,0),winRate:fedClosed.length?fedWins/fedClosed.length:0};
    })();
    const resourceUsage=this.resourceUsageSnapshot();
    return {
      settings: { ...this.settings, allowLiveTrading: env.allowLiveTrading, liveReady: this.isLiveReady() },
      athenaExclamation:this.strategy?.athenaExclamation?.summary?.()||null,
      riskControls: {
        resetSafetyVersion:'R60-HF1-SIMULATION-MUTATION-EPOCH-DRAIN',
        simulationResetInProgress:Boolean(this.simulationResetPromise||this.simulationMutationGate?.blocked),
        simulationMutationGate:this.simulationMutationGate?.snapshot?.()||null,
        intelligenceHydration:{...(this.intelligenceHydration||{}),tradingBlocked:false},
        athenaHistoricalMemoryLoad:{...(this.athenaCommander?.memoryLoad||{}),entryAuthorityBlockedUntilLoaded:false},
        historicalIntelligenceBlocksTrading:false,
        settingsPersistence:{...(this.settingsPersistence||{version:'SETTINGS-PERSISTENCE-R1',lastVerifiedAtMs:0,lastKeys:[],lastValues:{},lastError:null})},
        singleRealHunterPerExactTicker: this.settings.galacticExplosionEnabled !== true,
        exactTickerLockScope: this.settings.galacticExplosionEnabled === true ? GALACTIC_EXPLOSION.enabledLockScope : GALACTIC_EXPLOSION.disabledLockScope,
        galacticExplosion: GALACTIC_EXPLOSION.version,
        galacticExplosionEnabled: this.settings.galacticExplosionEnabled === true,
        galacticExplosionSameAttackDuplicatesAllowed: GALACTIC_EXPLOSION.sameAttackDuplicatesAllowed,
        feederSignalsExempt: true,
        entryModeIsolation: 'EMI1',
        entryCandidateFunnelTelemetry:ENTRY_CANDIDATE_FUNNEL.version,
        entryDecisionDeduplication:'BOLT_STATE_FINGERPRINT_V1',
        referenceFeederEvaluationRequiresLiveReady: false,
        realHunterExecutionRequiresLiveReadyInLiveMode: true,
        freshInstallMode: 'SIMULATION',
        gameClockAuthority: GAME_CLOCK_AUTHORITY.version,
        gameClockActivityOnlyAuthorization: false,
        gameClockStrongSources: ['kalshi_live_data', 'kalshi_game_stats'],
        gameClockMilestoneDiscovery: ['related_event_ticker', 'events_with_milestones_exact_primary_or_related'],
        gameClockUnknownCandidateForceFreshBeforeClockGate: true,
        gameClockFallback: 'occurrence_passed_plus_broad_live_or_pbp_current_official_window',
        gameClockPersistenceScope: 'event_ticker',
        gameClockFreshEntryAuthorizationRequired: true,
        gameClockEntryAuthorizationMaxAgeMs: GAME_CLOCK_AUTHORITY.entryAuthorizationMaxAgeMs,
        gameClockSimulationObservedActivityFallback: 'SIMULATION_ONLY',
        gameClockSimulationObservedActivityLiveAuthority: false,
        gameClockSimulationObservedActivityMaximumGapMs: GAME_CLOCK_AUTHORITY.simulationActivityMaxGapMs,
        gameClockMilestoneSeriesBulkCacheMs: GAME_CLOCK_AUTHORITY.seriesMilestoneCacheMs,
        gameClockMilestoneForceRefreshMinIntervalMs: GAME_CLOCK_AUTHORITY.milestoneForceRefreshMinIntervalMs,
        gameClockExactActiveMarketRevalidation: true,
        gameClockFallbackFreshTradeEvidenceRequired: true,
        gameClockPbpEntryAuthorization: 'requires_fresh_exact_trade_plus_current_official_window',
        entryAdmissionControl: ENTRY_ADMISSION_CONTROL.version,
        entryAdmissionRole: ENTRY_ADMISSION_CONTROL.role,
        entryAdmissionUnknownProbeIntervalMs: ENTRY_ADMISSION_CONTROL.unknownProbeIntervalMs,
        entryAdmissionPrequeueMinimumGameTimeGate: true,
        entryAdmissionPrequeueMaximumGameTimeGate: true,
        entryAdmissionImmediateGreenFeasibilityGate: true,
        entryAdmissionPreBoltExecutionMarginMs: ENTRY_ADMISSION_CONTROL.preBoltExecutionMarginMs,
        entryAdmissionPostBoltFreshClockGate: true,
        postFireStrategicCooldownVeto: false,
        entryTimeWindow:'ETW1',
        minimumGameMinutes:Number(this.settings.minGameMinutes||0),
        maximumGameMinutes:Number(this.settings.maxGameMinutes||0),
        ultimateStopGuard: ULTIMATE_STOP_GUARD.version,
        stopLossWatchdog: STOP_LOSS_WATCHDOG.version,
        stopLossWatchdogRole: 'observation_classifier_above_aurora_then_usg1_advisor_after_verified_touch',
        stopLossWatchdogPolicyRevision: STOP_LOSS_WATCHDOG.policyRevision,
        stopLossWatchdogStakeNormalized: STOP_LOSS_WATCHDOG.stakeNormalized,
        stopLossWatchdogStakeBasis: STOP_LOSS_WATCHDOG.stakeBasis,
        stopLossWatchdogReferenceStakeCents: STOP_LOSS_WATCHDOG.referenceStakeCents,
        stopLossWatchdogWakeLossRatio: STOP_LOSS_WATCHDOG.wakeLossRatio,
        stopLossWatchdogResetLossRatio: STOP_LOSS_WATCHDOG.resetLossRatio,
        stopLossWatchdogSevereLossRatio: STOP_LOSS_WATCHDOG.severeLossRatio,
        stopLossWatchdogCatastrophicLossRatio: STOP_LOSS_WATCHDOG.catastrophicLossRatio,
        stopLossWatchdogReferenceWakeLossCents: STOP_LOSS_WATCHDOG.wakeLossCents,
        stopLossWatchdogReferenceResetLossCents: STOP_LOSS_WATCHDOG.resetLossCents,
        stopLossWatchdogReferenceSevereLossCents: STOP_LOSS_WATCHDOG.severeLossCents,
        stopLossWatchdogMaximumBookAgeMs: STOP_LOSS_WATCHDOG.maximumBookAgeMs,
        stopLossWatchdogMaximumFutureBookSkewMs: STOP_LOSS_WATCHDOG.maximumFutureBookSkewMs,
        stopLossWatchdogMinimumLearningObservations: STOP_LOSS_WATCHDOG.minimumLearningObservations,
        stopLossWatchdogLossAuthority: ULTIMATE_STOP_GUARD.version,
        stopLossWatchdogWeakHistoryGraceMs: STOP_LOSS_WATCHDOG.weakHistoryGraceMs,
        stopLossWatchdogMinimumLiveOverrideAgeMs: STOP_LOSS_WATCHDOG.minimumLiveOverrideAgeMs,
        stopLossWatchdogStrongHistorySevereGraceMs: STOP_LOSS_WATCHDOG.strongHistorySevereGraceMs,
        stopLossWatchdogSevereStallMs: STOP_LOSS_WATCHDOG.severeStallMs,
        stopLossWatchdogReferenceCatastrophicLossCents: STOP_LOSS_WATCHDOG.catastrophicLossCents,
        stopLossWatchdogCatastrophicStallMs: STOP_LOSS_WATCHDOG.catastrophicStallMs,
        authorityChain:'GAME_CLOCK->COSMO_SHADOW->COSMO_GREEN->ATOMIC_THUNDER_BOLT->ATHENA->EXECUTION_ATTACK->INFINITY_BREAK/AURORA',
        noBoltNoAttack:true,
        atomicThunderBolt:ATOMIC_THUNDER_BOLT.version,
        atomicThunderBoltAuthority:ATOMIC_THUNDER_BOLT.authority,
        atomicThunderPatternGuardian:ATOMIC_THUNDER_PATTERN_GUARDIAN.version,
        atomicThunderPatternGuardianPolicyRevision:ATOMIC_THUNDER_PATTERN_GUARDIAN.policyRevision,
        atomicThunderPatternGuardianAuthority:'RESEARCH_ONLY',
        atomicThunderGreenTriggerCents:Number(this.settings.atomicThunderGreenTriggerCents??COSMO_SHADOW_TRADING.defaultGreenTriggerCents),
        cosmoShadowTrading:COSMO_SHADOW_TRADING.version,
        cosmoGreenPriceBasis:COSMO_SHADOW_TRADING.greenPriceBasis,
        athenaCommander:ATHENA_COMMANDER.version,
        athenaCommanderAuthority:ATHENA_COMMANDER.authority,
        athenaCommanderRole:ATHENA_COMMANDER.role,
        athenaEconomicObjective:ATHENA_COMMANDER.economicObjective,
        athenaTargetAwareAttackSelection:ATHENA_COMMANDER.targetAwareAttackSelection,
        athenaForcedAttackDiversification:ATHENA_COMMANDER.forcedAttackDiversification,
        athenaMatureNegativeExpectedValueMayFire:ATHENA_COMMANDER.matureNegativeExpectedValueMayFire,
        arayashiki:ARAYASHIKI.version,
        arayashikiPolicyRevision:ARAYASHIKI.policyRevision,
        arayashikiRole:ARAYASHIKI.role,
        arayashikiStrategicAuthority:false,
        arayashikiNoEvidencePolicy:ARAYASHIKI.noEvidencePolicy,
        arayashikiCertificateTtlMs:ARAYASHIKI.certificateTtlMs,
        arayashikiRegimeContinuityRequired:ARAYASHIKI.regimeContinuityRequired,
        arayashikiPostFirePredictiveVeto:ARAYASHIKI.postFirePredictiveVeto,
        attackDoctrineRevalidationRequired:false,
        normalAttackExecutionOnlyAfterAthenaFire:true,
        scarletNeedleStrategicAuthorityException:true,
        gemini:GEMINI_UNIVERSE.version,
        geminiPolicyRevision:GEMINI_UNIVERSE.policyRevision,
        geminiEnabled:this.settings.geminiEnabled===true,
        geminiEntryBand:[Number(this.settings.geminiMinPriceCents),Number(this.settings.geminiMaxPriceCents)],
        geminiReferenceStakeCents:Number(this.settings.geminiReferenceStakeCents),
        geminiBrokerOrderAuthority:false,
        geminiPortfolioCapitalAuthority:false,
        geminiSimulationPortfolioCapitalAuthority:false,
        anotherDimension:ANOTHER_DIMENSION.version,
        anotherDimensionPolicyRevision:ANOTHER_DIMENSION.policyRevision,
        anotherDimensionShadowOnly:true,
        anotherDimensionBrokerOrderAuthority:false,
        anotherDimensionPortfolioCapitalAuthority:false,
        anotherDimensionSimulationPortfolioCapitalAuthority:false,
        anotherDimensionMinimumNetPerOriginalContractCents:Number(ANOTHER_DIMENSION.minimumNetPerOriginalContractCents),
        anotherDimensionRuntime:{...(this.anotherDimensionStats||{}),active:Number(this.anotherDimensionOpenByTicker?.size||0),recent:Number(this.anotherDimensionRecent?.size||0),queue:this.anotherDimensionQueue?.snapshot?.()||{}},
        justiceArrow:SAGITTARIUS_JUSTICE_ARROW.version,
        justiceArrowPolicyRevision:SAGITTARIUS_JUSTICE_ARROW.policyRevision,
        justiceArrowTrigger:SAGITTARIUS_JUSTICE_ARROW.trigger,
        justiceArrowProfitAuthority:ATHENA_EXIT_INTELLIGENCE.version,
        justiceArrowLossAuthority:AURORA_EXECUTION.version,
        justiceArrowContinuation:{...(this.justiceArrowStats||{})},
        infinityBreak:INFINITY_BREAK.version,
        infinityBreakAuthority:INFINITY_BREAK.authority,
        infinityBreakMinimumNetPerOriginalContractCents:Number(this.settings.infinityBreakMinNetPerOriginalContractCents ?? INFINITY_BREAK.minimumNetPerOriginalContractCents),
        infinityBreakRequiredFreshConfirmations:Number(this.settings.infinityBreakRequiredConfirmations ?? INFINITY_BREAK.requiredFreshConfirmations),
        infinityBreakMaximumBookAgeMs:Number(this.settings.infinityBreakMaximumBookAgeMs ?? INFINITY_BREAK.maximumBookAgeMs),
        infinityBreakConfirmationWindowMs:Number(this.settings.infinityBreakConfirmationWindowMs ?? INFINITY_BREAK.confirmationWindowMs),
        noPostEntryTimeBasedForcedExit:true,
        legacyAtomicThunderCompatibilityOnly:true,
        stopDoctrine: 'AURORA_VERIFIED_FROZEN_DANGER_GATE_PLUS_USG1_SLW1_OBSERVER',
        auroraExecution: AURORA_EXECUTION.version,
        auroraPolicyRevision: AURORA_EXECUTION.policyRevision,
        auroraDamageControlPercent: Number(this.settings.auroraDamageControlPercent ?? AURORA_EXECUTION.defaultDamageControlPercent),
        auroraMaximumEconomicLossRatio: Number(this.settings.auroraDamageControlPercent ?? AURORA_EXECUTION.defaultDamageControlPercent)/100,
        auroraFrozenAtEntry: AURORA_EXECUTION.frozenAtEntry,
        auroraTrails: AURORA_EXECUTION.trails,
        auroraNormalAutomatedLossExitGate:AURORA_EXECUTION.normalAutomatedLossExitGate,
        auroraWatchdogAboveDangerLine:AURORA_EXECUTION.watchdogAboveDangerLine,
        stopGuardRecoveryLearning: STOP_GUARD_RECOVERY_LEARNING.version,
        stopGuardRecoveryLearningRole: STOP_GUARD_RECOVERY_LEARNING.role,
        stopGuardRecoveryLearningDecisionEvidenceMode: STOP_GUARD_RECOVERY_LEARNING.decisionEvidenceMode,
        stopGuardRecoveryLearningHunterOnly: true,
        stopGuardRecoveryLearningMarketObserverDecisionAuthority: STOP_GUARD_RECOVERY_LEARNING.marketObserverDecisionAuthority,
        stopGuardLegacyRecoveryPatternDecisionAuthority: STOP_GUARD_RECOVERY_LEARNING.legacyRecoveryPatternDecisionAuthority,
        stopGuardRecoveryDefinition: 'full_position_executable_fee_adjusted_positive_net',
        stopGuardRecoveryMinimumNetPerOriginalContractCents: STOP_GUARD_RECOVERY_LEARNING.minimumNetPerOriginalContractCents,
        stopGuardRecoveryMinimumConfirmations: STOP_GUARD_RECOVERY_LEARNING.minimumPositiveConfirmations,
        stopGuardRecoveryMinimumDurationMs: STOP_GUARD_RECOVERY_LEARNING.minimumPositiveDurationMs,
        stopGuardRecoveryProfileDimensions: ['concept','source_feeder','sport','entry_band','drop_bucket','game_bucket','crash_bucket'],
        stopGuardHistoricalStrongUnlimitedVeto: false,
        feederSignalIntelligence: FEEDER_SIGNAL_INTELLIGENCE.version,
        feederSignalIntelligenceRole: FEEDER_SIGNAL_INTELLIGENCE.role,
        feederSignalIntelligenceDiagnosticsOnly: true,
        feederSignalIntelligenceRuntime: 'DISABLED_R60_SHADOW_TABLE_REPLACES_QUOTE_RATE_FSI',
        feederSignalIntelligenceEntryAuthority: false,
        feederSignalIntelligenceExecutionAuthority: false,
        feederSignalIntelligenceAthenaDecisionAuthority: false,
        feederSignalIntelligenceAnalysisStakeCents: FEEDER_SIGNAL_INTELLIGENCE.analysisStakeCents,
        feederSignalIntelligenceReferenceProfitThresholdsCents: [...FEEDER_SIGNAL_INTELLIGENCE.referenceProfitThresholdsCents],
        stopGuardDangerLine: 'frozen_aurora_or_creation_era_legacy_stop',
        stopGuardEmergencyExtensionCents: ULTIMATE_STOP_GUARD.emergencyExtensionCents,
        stopGuardCriticalMinimumRecoveryRate: ULTIMATE_STOP_GUARD.minimumCriticalRecoveryRate,
        stopGuardCriticalMinimumObservations: ULTIMATE_STOP_GUARD.minimumLearningObservations,
        recoveryHunterContinuity: 'RH1',
        recoveryTickerPriority: true,
        recoveryEventDrivenQuoteEvaluation: true,
        feederHunterEventDrivenQuoteEvaluation: false,
        centralizedAthenaOpportunityEvaluation: true,
        feederHunterPriorityTickerCount: this.feederPriorityTickers.size,
        entryEvaluationBackpressure: this.entryEvaluationQueue?.snapshot?.() || {maxConcurrency:ENTRY_EVALUATION_CONCURRENCY,active:0,pending:0,rerun:0,totalStarted:0,totalCoalesced:0,maxObservedActive:0},
        phoenixSignalBackpressure:this.phoenixSignalQueue?.snapshot?.()||{maxConcurrency:1,active:0,pending:0,rerun:0,totalStarted:0,totalCoalesced:0,maxObservedActive:0},
        quoteProtectionBackpressure: this.quoteProtectionQueue?.snapshot?.() || {maxConcurrency:QUOTE_PROTECTION_CONCURRENCY,active:0,pending:0,rerun:0,totalStarted:0,totalCoalesced:0,maxObservedActive:0},
        databasePressureIsolation:DATABASE_PRESSURE_ISOLATION.version,
        quoteProtectionScope:DATABASE_PRESSURE_ISOLATION.quoteProtectionScope,
        referenceSignalSweepIntervalMs:REFERENCE_SIGNAL_SWEEP_MS,
        stateCollectionSingleFlight:true,
        stateSnapshotTtlMs:STATE_SNAPSHOT_TTL_MS,
        stateDbFanoutMaximum:STATE_DB_FANOUT_MAX,
        ordinaryPoolReservedHeadroom:DATABASE_PRESSURE_ISOLATION.ordinaryPoolReservedHeadroom,
        lowPriorityPersistenceConcurrency:DATABASE_PRESSURE_ISOLATION.lowPriorityPersistenceConcurrency,
        lowPriorityPersistenceMaximumPending:DATABASE_PRESSURE_ISOLATION.lowPriorityPersistenceMaximumPending,
        lowPriorityPersistenceScope:DATABASE_PRESSURE_ISOLATION.lowPriorityPersistenceScope,
        lowPriorityPersistenceMaximumBatchBytes:DATABASE_PRESSURE_ISOLATION.lowPriorityPersistenceMaximumBatchBytes,
        fsiPersistenceRevision:DATABASE_PRESSURE_ISOLATION.fsiPersistenceRevision,
        fsiPersistenceBatchSize:DATABASE_PRESSURE_ISOLATION.fsiPersistenceBatchSize,
        advisoryLockIsolation: 'DEDICATED_LOCK_POOL',
        advisoryLockPoolMaximumConnections: 2,
        resourceGovernor: RUNTIME_RESOURCE_GOVERNOR.version,
        resourceGovernorTradingAuthority: RUNTIME_RESOURCE_GOVERNOR.tradingAuthority,
        resourceGovernorRole:'TRADE_PRIORITY_NON_AUTHORITY_MEMORY_GOVERNANCE',
        resourcePreferredRssCeilingMiB: RUNTIME_RESOURCE_GOVERNOR.preferredRssCeilingMiB,
        resourceWarningRssMiB: RUNTIME_RESOURCE_GOVERNOR.warningRssMiB,
        resourceHardCeilingMiB:RUNTIME_RESOURCE_GOVERNOR.hardCeilingMiB,
        resourcePressureState:this.resourcePressureState,
        resourceResearchDeferred:this.resourceResearchDeferred===true,
        resourceRuntimeCachePolicy: 'active_current_and_safety_priority_only',
        entryPipelineTelemetry: 'EPT1',
        recoveryReboundOrigin: 'post_stop_trough',
        recoveryReboundPrice: 'best_bid',
        recoveryTargetStakeMultiplier: 1,
        recoveryExactConfiguredSizing: true,
        recoveryPriorityTickerCount: this.recoveryPriorityTickers.size,
        crashIntelligence: 'CI1',
        crashRecoveryHunter:'STARLIGHT-EXECUTION-R51',
        crashLearningAlwaysOn:true,
        crashRecoveryModelEnabled:this.settings.crashRecoveryHunterEnabled === true,
        crashFeaturesStrategicAuthority:'ATHENA_ONLY',
        crashRecoveryIndependentQualificationVeto:false,
        crashRecoveryPriorityTickerCount:this.crashPriorityTickers.size,
        crashRecoveryRequiresActiveCosmo:false,
        crashRecoverySourceFeeders:[...COSMO_ROUTING.activeCosmos],
        scarletNeedle:SCARLET_NEEDLE.version,
        scarletNeedleContinuationAuthority:true,
        scarletNeedleTrigger:SCARLET_NEEDLE.trigger,
        scarletNeedleMaxRepeats:Number(this.settings.scarletNeedleMaxRepeats??SCARLET_NEEDLE.defaultMaxRepeats),
        scarletNeedleRetracementTriggerEnabled:false,
        scarletNeedleContinuation:{...(this.scarletContinuationStats||{})},
        noBoltNoAttackExceptions:['SCARLET_NEEDLE_POST_PROFIT_CONTINUATION','SAGITTARIUS_JUSTICE_ARROW_POST_SHADOW_WIN','CRYSTAL_WALL_POST_STOP_CONTINUATION'],
        crystalWall:CRYSTAL_WALL.version,
        crystalWallContinuationAuthority:true,
        crystalWallTrigger:CRYSTAL_WALL.trigger,
        crystalWallContinuation:{...(this.crystalWallContinuationStats||{})},
        cosmoRouting: COSMO_ROUTING.version,
        cosmoRoutingRole: COSMO_ROUTING.role,
        cosmoRoutingInitialEntryConsumers: [...COSMO_ROUTING.currentInitialEntryConsumers],
        cosmoRoutingFollowOnOnlyExceptions: [...COSMO_ROUTING.followOnOnlyExceptions],
        cosmoRoutingFutureInitialEntryDefault: COSMO_ROUTING.defaultFutureInitialEntryConsumer,
        cosmoSourceDoesNotAuthorizeEntry: COSMO_ROUTING.sourceDoesNotAuthorizeEntry,
        athenaExclamation:ATHENA_EXCLAMATION.version,
        athenaExclamationEnabled:this.settings.athenaExclamationEnabled===true,
        athenaExclamationRole:'ATHENA_SUBORDINATE_META_EXECUTION_PATTERN',
        athenaExclamationStrategicAuthority:ATHENA_COMMANDER.version,
        athenaExclamationIndependentPrimeVeto:false,
        athenaExclamationStakeCents:Number(this.settings.athenaExclamationStakeCents),
        athenaExclamationEntryBand:[Number(this.settings.athenaExclamationMinEntryCents),Number(this.settings.athenaExclamationMaxEntryCents)],
        lightningPlasma:LIGHTNING_PLASMA.version,
        lightningPlasmaPolicyRevision:LIGHTNING_PLASMA.policyRevision,
        lightningPlasmaRole:LIGHTNING_PLASMA.role,
        lightningPlasmaSourceCosmos:[...LIGHTNING_PLASMA.sourceCosmos],
        lightningPlasmaFieldBudgetSharedAcrossStrikes:true,
        lightningPlasmaOneStrikePerEvent:true,
        dragonFeeder: 'DRAGON-V1',
        dragonReferenceOnly: true,
        dragonEnabled: this.settings.dragonEnabled === true,
        dragonMinSignalPriceCents: Number(this.settings.dragonMinSignalPriceCents),
        dragonMaxSignalPriceCents: Number(this.settings.dragonMaxSignalPriceCents),
        dragonMaxEpisode: Number(this.settings.dragonMaxEpisode),
        dragonCrashIntelligenceSource: 'CI1',
        phoenixCosmo:PHOENIX_COSMO.version,
        phoenixPolicyRevision:PHOENIX_COSMO.policyRevision,
        phoenixReferenceOnly:true,
        phoenixEnabled:this.settings.phoenixEnabled===true,
        phoenixEntryBand:[Number(this.settings.phoenixMinPriceCents),Number(this.settings.phoenixMaxPriceCents)],
        phoenixMinimumRiseCents:PHOENIX_COSMO.minimumRiseCents,
        phoenixMinimumUpTicks:PHOENIX_COSMO.minimumUpTicks,
        phoenixRequiredFreshConfirmations:PHOENIX_COSMO.requiredFreshConfirmations,
        phoenixSignalTtlMs:PHOENIX_COSMO.signalTtlMs,
        phoenixRuntime:this.phoenixCosmo?.summary?.()||null,
        athenaBrain: ATHENA_BRAIN.version,
        athenaRole: ATHENA_BRAIN.role,
        athenaPlacement: ATHENA_BRAIN.placement,
        athenaB2:ATHENA_B2.version,
        athenaB2PolicyRevision:ATHENA_B2.policyRevision,
        athenaB2Role:ATHENA_B2.role,
        athenaB2Placement:ATHENA_B2.placement,
        athenaB2DecisionAuthority:ATHENA_B2.decisionAuthority,
        athenaB2NewGenerationDecisionAuthority:false,
        athenaB2HistoricalCompatibilityOnly:true,
        athenaB2Mode:ATHENA_B2.mode,
        athenaB2HistoricalLabeledHunters:ATHENA_B2.historicalCorpus.labeledHunters,
        athenaB2HistoricalBadTrades:ATHENA_B2.historicalCorpus.badTrades,
        athenaB2FullCorpusBadBlocked:ATHENA_B2.historicalCorpus.fullCorpusReplayBadBlocked,
        athenaB2FullCorpusBadTotal:ATHENA_B2.historicalCorpus.fullCorpusReplayBadTotal,
        athenaB2FullCorpusGoodAllowed:ATHENA_B2.historicalCorpus.fullCorpusReplayGoodAllowed,
        athenaB2FullCorpusAllowedPnlDollars:ATHENA_B2.historicalCorpus.fullCorpusReplayAllowedPnlDollars,
        athenaB2GroupedTickerHoldoutBadBlocked:ATHENA_B2.historicalCorpus.groupedTickerHoldoutBadBlocked,
        athenaB2GroupedTickerHoldoutBadTotal:ATHENA_B2.historicalCorpus.groupedTickerHoldoutBadTotal,
        athenaB2GroupedTickerHoldoutGoodAllowed:ATHENA_B2.historicalCorpus.groupedTickerHoldoutGoodAllowed,
        athenaB2GroupedTickerHoldoutAllowedPnlDollars:ATHENA_B2.historicalCorpus.groupedTickerHoldoutAllowedPnlDollars,
        athenaB2GuardianThreshold:ATHENA_B2.guardianThreshold,
        athenaB2GuardianModelHash:ATHENA_B2.guardianModelHash,
        athenaB2GuardianModelValid:ATHENA_B2.guardianModelValidation?.ok===true,
        athenaConsumers: ['Athena Exclamation','Momentum Hunter','Wave Surfer','Recovery Hunter','Crash Recovery Hunter','Lightning Plasma'],
        athenaFeedersExcluded: true,
        athenaExitAuthority: false,
        athenaB1ExitAuthority: false,
        athenaExitIntelligence: ATHENA_EXIT_INTELLIGENCE.version,
        athenaExitPolicyRevision: ATHENA_EXIT_INTELLIGENCE.policyRevision,
        athenaExitRole: ATHENA_EXIT_INTELLIGENCE.role,
        athenaExitAppliesTo: 'R36_plus_Hunter_entries_with_ATHENA_X1_snapshot',
        athenaExitFullPositionOnly: ATHENA_EXIT_INTELLIGENCE.fullPositionOnly,
        athenaExitPositionSplitting: ATHENA_EXIT_INTELLIGENCE.positionSplitting,
        athenaExitNoLookahead: ATHENA_EXIT_INTELLIGENCE.noLookahead,
        athenaExitFullExecutableDepthRequired: ATHENA_EXIT_INTELLIGENCE.fullExecutableDepthRequired,
        athenaExitMaximumExecutableBookAgeMs: ATHENA_EXIT_INTELLIGENCE.maximumExecutableBookAgeMs,
        athenaExitMaximumFutureBookSkewMs: ATHENA_EXIT_INTELLIGENCE.maximumFutureBookSkewMs,
        athenaExitHistoricalDrawdownSupportWilsonLow: ATHENA_EXIT_INTELLIGENCE.historicalDrawdownSupportWilsonLow,
        athenaExitPolicyRevisionFailClosed: true,
        athenaExitIntentionalPartialSubmission: false,
        athenaExitLossDomainAuthority: ULTIMATE_STOP_GUARD.version,
        athenaExitLegacyPri1Compatibility: 'creation_time_PRI1_preserved',
        athenaInsufficientEvidencePolicy: ATHENA_BRAIN.insufficientEvidencePolicy,
        athenaBlockPolicy: ATHENA_BRAIN.blockPolicy,
        athenaAdaptiveMode: ATHENA_BRAIN.adaptiveMode,
        athenaAdaptiveDecisionWeight: ATHENA_BRAIN.adaptiveDecisionWeight,
        goldenEye: GOLDEN_EYE.version,
        goldenEyePolicyRevision: GOLDEN_EYE.policyRevision,
        goldenEyeRole: GOLDEN_EYE.role,
        goldenEyeLearningAlwaysOn: GOLDEN_EYE.learningAlwaysOn,
        goldenEyeEnabled: this.settings.goldenEyeEnabled === true,
        goldenEyeLiveEnabled: this.settings.goldenEyeLiveEnabled === true,
        goldenEyeAppliesTo: 'R37_plus_Hunter_entries_with_GOLDEN_EYE_snapshot',
        goldenEyeAllProfitableCashout: GOLDEN_EYE.allProfitableCashout,
        goldenEyePerTradeSelection: GOLDEN_EYE.perTradeSelection,
        goldenEyeMaximumSignalQuoteAgeMs: GOLDEN_EYE.maximumSignalQuoteAgeMs,
        goldenEyeMaximumSignalBookAgeMs: GOLDEN_EYE.maximumSignalBookAgeMs,
        goldenEyeMaximumExecutionBookAgeMs: GOLDEN_EYE.maximumExecutionBookAgeMs,
        goldenEyeMinimumNaturalEpisodes: GOLDEN_EYE.minimumNaturalEpisodes,
        goldenEyeMinimumCollectiveEpisodes: GOLDEN_EYE.minimumCollectiveEpisodes,
        goldenEyeManualTrainingEnabled: true,
        goldenEyeManualBackfillEnabled: true,
        goldenEyeManualBackfillGroupingMs: GOLDEN_EYE.manualBackfillGroupingMs,
        goldenEyeMinimumComparableEpisodes: GOLDEN_EYE.minimumComparableEpisodes,
        goldenEyeMaximumExtensionProbability: GOLDEN_EYE.maximumExtensionProbability,
        goldenEyeUsesManualCashoutExecutionPath: true,
        goldenEyeLossDomainAuthority: ULTIMATE_STOP_GUARD.version,
        goldenEyeLegacyAthenaX1Compatibility: 'creation_time_ATHENA_X1_preserved',
        protectedRunnerIntelligence: PROTECTED_RUNNER_INTELLIGENCE.version,
        protectedRunnerPolicyRevision: PROTECTED_RUNNER_INTELLIGENCE.policyRevision,
        protectedRunnerAppliesTo: 'R33_plus_Hunter_entries_with_PRI1_R2_snapshot',
        protectedRunnerR32Compatibility: 'creation_time_PRI1_R1_preserved',
        protectedRunnerLegacyProfitAuthority: `${APEX_PROFIT_GUARD.version}+${ULTIMATE_PROFIT_GUARD.version}`,
        protectedRunnerCapitalSafeNetPerOriginalContractCents: PROTECTED_RUNNER_INTELLIGENCE.capitalLatchNetPerOriginalContractCents,
        protectedRunnerProfitFloorArmNetPerOriginalContractCents: PROTECTED_RUNNER_INTELLIGENCE.profitFloorArmNetPerOriginalContractCents,
        protectedRunnerColdStartGivebackNetPerContractCents: PROTECTED_RUNNER_INTELLIGENCE.coldStartRunnerGivebackNetPerContractCents,
        protectedRunnerMinimumGivebackNetPerContractCents: PROTECTED_RUNNER_INTELLIGENCE.minimumRunnerGivebackNetPerContractCents,
        protectedRunnerMaximumGivebackNetPerContractCents: PROTECTED_RUNNER_INTELLIGENCE.maximumRunnerGivebackNetPerContractCents,
        protectedRunnerLateProfitTightenAtNetPerOriginalContractCents: PROTECTED_RUNNER_INTELLIGENCE.lateProfitTightenAtNetPerOriginalContractCents,
        protectedRunnerLateProfitGivebackNetPerContractCents: PROTECTED_RUNNER_INTELLIGENCE.lateProfitGivebackNetPerContractCents,
        protectedRunnerLegacyR32ColdStartRetentionRatio: PROTECTED_RUNNER_INTELLIGENCE.legacyColdStartRetentionRatio,
        protectedRunnerFullExecutableDepthRequired: PROTECTED_RUNNER_INTELLIGENCE.fullExecutableDepthRequired,
        protectedRunnerImmediateProtectedFloorExit: PROTECTED_RUNNER_INTELLIGENCE.immediateProtectedFloorExit,
        protectedRunnerLossDomainDelegatedToStopGuard: PROTECTED_RUNNER_INTELLIGENCE.lossDomainDelegatedToStopGuard,
        profitLearningIntelligence: PROFIT_LEARNING_INTELLIGENCE.version,
        profitLearningMinimumProfileObservations: PROFIT_LEARNING_INTELLIGENCE.minimumProfileObservations,
        profitLearningMinimumPullbackObservations: PROFIT_LEARNING_INTELLIGENCE.minimumPullbackObservations,
        profitLearningRunnerGivebackPromotionEnabled: PROFIT_LEARNING_INTELLIGENCE.runnerGivebackPromotionEnabled,
        profitLearningPostExitCounterfactualTracking: true,
        profitLearningShadowPolicies: Object.keys(PROFIT_LEARNING_INTELLIGENCE.shadowPolicies),
        profitLearningShadowPoliciesHaveExecutionAuthority: false,
        apexProfitGuard: APEX_PROFIT_GUARD.version,
        apexProfitGuardActivationMoveCents: APEX_PROFIT_GUARD.activationMoveCents,
        apexProfitGuardPeakGivebackCents: APEX_PROFIT_GUARD.peakGivebackCents,
        apexProfitGuardFailureConfirmations: APEX_PROFIT_GUARD.failureConfirmations,
        apexProfitGuardImmediateGapThroughCents: APEX_PROFIT_GUARD.immediateGapThroughCents,
        apexProfitGuardMinimumNetPerContractCents: APEX_PROFIT_GUARD.minimumNetProfitPerContractCents,
        apexProfitGuardFullExecutableDepthRequired: APEX_PROFIT_GUARD.fullExecutableDepthRequired,
        apexProfitGuardPositiveNetExecutionOnly: APEX_PROFIT_GUARD.positiveNetExecutionOnly,
        apexProfitGuardLossDomainDelegatedToStopGuard: APEX_PROFIT_GUARD.lossDomainDelegatedToStopGuard,
        manualCashoutIsProfitGuardSignal: false,
        ultimateProfitGuard: ULTIMATE_PROFIT_GUARD.version,
        profitGuardActivationMoveCents: ULTIMATE_PROFIT_GUARD.activationMoveCents,
        profitGuardPeakGivebackCents: ULTIMATE_PROFIT_GUARD.peakGivebackCents,
        profitGuardRecoveryBufferCents: ULTIMATE_PROFIT_GUARD.recoveryBufferCents,
        profitGuardMinimumNetPerContractCents: ULTIMATE_PROFIT_GUARD.minimumNetProfitPerContractCents,
        profitGuardHeadroomQualifiedArming: ULTIMATE_PROFIT_GUARD.headroomQualifiedArming,
        profitGuardHeadroomRequiredCents: ULTIMATE_PROFIT_GUARD.peakGivebackCents + ULTIMATE_PROFIT_GUARD.recoveryBufferCents,
        profitGuardEconomicBreakEvenTelemetryOnly: !ULTIMATE_PROFIT_GUARD.economicBreakEvenImmediateExit,
        profitGuardLossDomainDelegatedToStopGuard: ULTIMATE_PROFIT_GUARD.lossDomainDelegatedToStopGuard,
        profitGuardFullExecutableDepthRequired: true,
        activeStatuses: ['open', 'entry_pending', 'exit_pending', 'pending_recovery'],
      },
      health: {
        ...this.health,
        protectionOk: this.profitGuard.protectionOk,
        lastProtectionError: this.profitGuard.lastError,
        startedAtMs: this.startedAtMs,
        lastFullScanMs: this.lastFullScanMs,
        protectionAgeMs: this.health.lastProtectionMs ? Date.now() - this.health.lastProtectionMs : null,
        websocketAgeMs: this.health.lastWsMessageMs ? Date.now() - this.health.lastWsMessageMs : null,
        scannerAgeMs: this.lastFullScanMs ? Date.now() - this.lastFullScanMs : null,
      },
      balance: this.balance,
      brokerContext: this.brokerPositions,
      performance: {
        portfolioValueCents: p.portfolioValueCents,
        realizedCents: p.hunterRealizedCents,
        closedRealizedCents: p.closedRealizedCents,
        partialRealizedCents: p.partialRealizedCents,
        unrealizedCents: p.hunterUnrealizedCents,
        wins: p.wins, losses: p.losses, scratches: p.scratches,
        winRate: p.winRate, open: p.openHunters, closed: p.closedHunters,
        feederUnrealizedCents: p.feederUnrealizedCents,
        simulationCashCents: p.simulationCashCents,
      },
      conceptStats, feederSummary, entryPipeline, entryCandidateFunnel, entryPathConfiguration, auroraExecution, resourceUsage, openHunters, openFeeders, cosmoShadowTrades, gemini:geminiSummary, geminiTrades, anotherDimension:{...(this.anotherDimensionStats||{}),active:Number(this.anotherDimensionOpenByTicker?.size||0),recent:Number(this.anotherDimensionRecent?.size||0)}, justiceArrow:{...(this.justiceArrowStats||{})}, closedHunters,
      trackedMarkets: trackers, trackerSummary, patterns, recoveryTracking, sports,
      crashLearning, crashEpisodes, profitLearning, stopGuardRecoveryLearning, athena, atomicThunderBolt, infinityBreak, legacyAtomicThunder:{ version:ATOMIC_THUNDER.version, policyRevision:ATOMIC_THUNDER.policyRevision, legacyCompatibilityOnly:true, ...atomicThunder }, goldenEye:this.goldenEye?.summary?.() || {version:GOLDEN_EYE.version,ready:false,enabled:false},
      liveMarkets: scanned,
      scanner: { tracked: trackerSummary.tracked, activeMarkets: scanned.length, lastScanMs: this.lastFullScanMs, ...this.speed },
      snapshots, audit,
    };
  }

  decorateEntry(e) {
    const view = this.quoteView(e);
    const guard = this.profitGuard?.getState(e.id);
    const unrealized = openLike(e.status) && PORTFOLIO_CONCEPTS.has(e.conceptName)
      ? this.openUnrealized(e, view.priceCents)
      : 0;
    const isFeeder = FEEDER_CONCEPTS.has(e.conceptName);
    const isShadowAttack = SHADOW_ATTACK_CONCEPTS.has(e.conceptName);
    const isShadow = isFeeder || isShadowAttack;
    const referenceCount = isShadow ? Number(e.count || 0) : 0;
    const shadowPrice=e.status==='closed'&&Number.isFinite(Number(e.exitPriceCents))?Number(e.exitPriceCents):Number(view.priceCents);
    const shadowMoveCents = isShadow ? shadowPrice - Number(e.entryPriceCents) : null;
    let referencePnlCents=null,shadowPnlCents=null;
    if(isFeeder){
      referencePnlCents=(Number(view.priceCents)-Number(e.entryPriceCents))*referenceCount-2*Number(this.settings.simFeeCents||2)*referenceCount;
      shadowPnlCents=shadowMoveCents*referenceCount;
    }else if(isShadowAttack){
      if(e.status==='closed')referencePnlCents=shadowPnlCents=Number(e.pnlCents||0);
      else{
        const exitFee=String(e.mode||this.settings.mode||'SIMULATION').toUpperCase()==='LIVE'
          ? kalshiGeneralTakerFeeEstimateCents({count:referenceCount,priceCents:Math.max(0,Math.min(100,Number(view.priceCents||0)))})
          : Math.max(0,Number(e.entryConfig?.simFeeCents??this.settings.simFeeCents??0))*referenceCount;
        referencePnlCents=shadowPnlCents=shadowMoveCents*referenceCount-Number(e.entryFeeCents||0)-exitFee;
      }
    }
    const favorableMoveCents = isShadow ? Math.max(0, shadowMoveCents) : null;
    const adverseMoveCents = isShadow ? Math.max(0, -shadowMoveCents) : null;
    const greenTriggerCents = isFeeder ? Number(this.settings.atomicThunderGreenTriggerCents||COSMO_SHADOW_TRADING.defaultGreenTriggerCents) : null;
    const atomicThunderBoltId = isFeeder ? (e.feederState?.atomicThunderBoltId||null) : null;
    const shadowState = isFeeder ? (atomicThunderBoltId?'BOLT_SENT':shadowMoveCents>=greenTriggerCents?'GREEN':'TRACKING') : isShadowAttack ? (openLike(e.status)?'ANOTHER_DIMENSION':Number(e.pnlCents||0)>0?'WIN':Number(e.pnlCents||0)<0?'LOSS':'SCRATCH') : null;
    const sourceSignalPrice = e.conceptName === 'Dragon' ? e.entryConfig?.dragonSource?.signalPriceCents : (e.conceptName === 'Phoenix' ? e.entryConfig?.phoenixSource?.signalAskCents : (e.conceptName === 'Golden Dragon' ? e.entryConfig?.goldenDragonSource?.signalPriceCents : null));
    const signalPriceCents = Number.isFinite(Number(sourceSignalPrice)) ? Number(sourceSignalPrice) : null;
    const referenceOriginCents = isShadow ? Number(e.entryPriceCents) : null;
    const referenceOrigin = e.conceptName==='Dragon'?'dragon_signal':(e.conceptName==='Phoenix'?'phoenix_signal':(isShadowAttack?'another_dimension':(isFeeder?'feeder_entry':null)));
    const identity=EXECUTION_ATTACK_DISPLAY[e.conceptName]||null;
    const aurora=e?.entryConfig?.aurora?.version===AURORA_EXECUTION.version&&e.entryConfig.aurora.frozen===true?e.entryConfig.aurora:null;
    const postExit=e?.postExitState&&typeof e.postExitState==='object'?e.postExitState:{};
    const closedPostPrice=e?.status==='closed'&&Number.isFinite(Number(postExit.latestMarketPriceCents))?Number(postExit.latestMarketPriceCents):null;
    const shadowRuntime=isShadowAttack?this.anotherDimensionRuntime?.get?.(String(e.id||'')):null;
    const shadowEvaluation=shadowRuntime?.lastEvaluation||null;
    const shadowPeak=isShadowAttack&&openLike(e.status)?Math.max(Number(e.peakPriceCents||e.entryPriceCents||0),Number(shadowRuntime?.peakPriceCents||0)):Number(e.peakPriceCents||0);
    const shadowLow=isShadowAttack&&openLike(e.status)&&Number(shadowRuntime?.lowestPriceAfterEntryCents)>0?Number(shadowRuntime.lowestPriceAfterEntryCents):e.lowestPriceAfterEntryCents;
    const shadowMae=isShadowAttack&&openLike(e.status)?Number(shadowRuntime?.maeCents??e.maeCents??0):Number(e.maeCents||0);
    const shadowMaeAt=isShadowAttack&&openLike(e.status)?(shadowRuntime?.maeAtMs??e.maeAtMs):e.maeAtMs;
    return {
      ...e,
      ...(isShadowAttack?{peakPriceCents:shadowPeak,lowestPriceAfterEntryCents:shadowLow,maeCents:shadowMae,maeAtMs:shadowMaeAt}:{}),
      currentPriceCents: e?.status==='closed'&&closedPostPrice!=null?closedPostPrice:view.priceCents,
      currentBidCents:Number(view.q?.yesBid||view.priceCents||0)||null,
      currentAskCents:Number(view.q?.yesAsk||0)||null,
      postExitCurrentPriceCents:closedPostPrice,
      postExitDeltaFromExitCents:Number.isFinite(Number(postExit.deltaFromExitCents))?Number(postExit.deltaFromExitCents):null,
      postExitBestPriceCents:Number.isFinite(Number(postExit.bestExecutableBidCents))?Number(postExit.bestExecutableBidCents):null,
      postExitBestDeltaCents:Number.isFinite(Number(postExit.bestDeltaFromExitCents))?Number(postExit.bestDeltaFromExitCents):null,
      postExitMissedUpsideCents:Number.isFinite(Number(postExit.missedUpsideNetCents))?Number(postExit.missedUpsideNetCents):null,
      postExitWorstPriceCents:Number.isFinite(Number(postExit.worstExecutableBidCents))?Number(postExit.worstExecutableBidCents):null,
      postExitWorstDeltaCents:Number.isFinite(Number(postExit.worstDeltaFromExitCents))?Number(postExit.worstDeltaFromExitCents):null,
      postExitLossAvoidedCents:Number.isFinite(Number(postExit.lossAvoidedNetCents))?Number(postExit.lossAvoidedNetCents):null,
      postExitResearchComplete:postExit.researchComplete===true,
      volume24h: view.q?.volume24h ?? e.volume24h,
      unrealizedCents: unrealized,
      positionPnlCents: Number(e.pnlCents || 0) + unrealized,
      referencePnlCents, shadowPnlCents, shadowMoveCents, shadowState, greenTriggerCents, atomicThunderBoltId, athenaSelectedAttack:e.feederState?.athenaSelectedAttack||null, realEntryId:e.feederState?.realEntryId||null, favorableMoveCents, adverseMoveCents, signalPriceCents, referenceOriginCents, referenceOrigin,
      universe:isShadowAttack?'Gemini':null,virtualExecution:isShadowAttack?shadowEvaluation:null,justiceArrowEntryId:isShadowAttack?(e.feederState?.justiceArrowEntryId||null):null,
      executionAttackName:identity?.name||e.conceptName,legacyConceptName:identity?.legacy||e.conceptName,retiredRuntimeConcept:RETIRED_PORTFOLIO_CONCEPTS.has(e.conceptName)||RETIRED_FEEDER_CONCEPTS.has(e.conceptName),aurora,
      quoteAgeMs: Number.isFinite(view.quoteAgeMs) ? view.quoteAgeMs : null,
      dataState: view.dataState,
      gameMinutes: e.gameStartTimeMs ? Math.max(0, Math.round((Date.now() - e.gameStartTimeMs) / 60000)) : null,
      liveStatus: view.q?.liveStatus || view.q?.status || '',
      maeAfterEntryMs: (isShadowAttack?shadowMaeAt:e.maeAtMs) == null ? null : Math.max(0, Number(isShadowAttack?shadowMaeAt:e.maeAtMs) - Number(e.openedAtMs || 0)),
      recoveryToEntryMs: e.recoveryToEntryAtMs == null || e.closedAtMs == null ? null : Math.max(0, Number(e.recoveryToEntryAtMs) - Number(e.closedAtMs)),
      recoveryToGreenMs: e.recoveryToGreenAtMs == null || e.closedAtMs == null ? null : Math.max(0, Number(e.recoveryToGreenAtMs) - Number(e.closedAtMs)),
      profitGuard: guard,
    };
  }

  buildConceptStatsFromAggregate(aggregate={}) {
    const names=['Athena Exclamation','Scarlet Needle','Sagittarius Justice Arrow','Wave Surfer','Crash Recovery Hunter','Recovery Hunter','Momentum Hunter','Lightning Plasma','Pegasus','Dragon','Phoenix'];
    const portfolio=new Map((aggregate.portfolio||[]).map((r)=>[String(r.concept_name||''),r]));
    const signals=new Map((aggregate.signals||[]).map((r)=>[String(r.concept_name||''),r]));
    const linked=new Map((aggregate.linked||[]).map((r)=>[String(r.source_feeder||''),r]));
    const out=[];
    for(const name of names){
      if(ACTIVE_FEEDER_CONCEPTS.has(name)){
        const sig=signals.get(name)||{},link=linked.get(name)||{},closed=Number(link.closed||0),wins=Number(link.wins||0),losses=Number(link.losses||0);
        out.push({name,displayName:name,legacyName:null,total:Number(link.total||0),open:Number(link.open||0),closed,wins,losses,winRate:closed?wins/closed:0,pnlCents:Number(link.pnl_cents||0),avgEntryCents:Math.round(Number(sig.avg_entry_cents||0)),avgCurrentCents:Math.round(Number(sig.avg_current_cents||0)),avgLiquidity:Number(sig.avg_liquidity||0),fedHunters:Number(link.total||0),feederSignals:Number(sig.feeder_signals||0),statsBasis:'fed_hunters'});
      }else{
        const r=portfolio.get(name)||{},closed=Number(r.closed||0),wins=Number(r.wins||0),losses=Number(r.losses||0);
        out.push({name,displayName:EXECUTION_ATTACK_DISPLAY[name]?.name||name,legacyName:EXECUTION_ATTACK_DISPLAY[name]?.legacy||name,total:Number(r.total||0),open:Number(r.open||0),closed,wins,losses,winRate:closed?wins/closed:0,pnlCents:Number(r.pnl_cents||0),avgEntryCents:Math.round(Number(r.avg_entry_cents||0)),avgCurrentCents:Math.round(Number(r.avg_current_cents||0)),avgLiquidity:Number(r.avg_liquidity||0),fedHunters:null});
      }
    }
    return out.sort((a,b)=>b.pnlCents-a.pnlCents);
  }

  buildFeederSummaryFromAggregate(aggregate={}) {
    const rows=(aggregate.linked||[]).filter((r)=>ACTIVE_FEEDER_CONCEPTS.has(String(r.source_feeder||'')));
    const total=rows.reduce((sum,r)=>sum+Number(r.total||0),0),wins=rows.reduce((sum,r)=>sum+Number(r.wins||0),0),losses=rows.reduce((sum,r)=>sum+Number(r.losses||0),0),scratches=rows.reduce((sum,r)=>sum+Number(r.scratches||0),0),pnlCents=rows.reduce((sum,r)=>sum+Number(r.pnl_cents||0),0),closed=wins+losses+scratches;
    return{hunters:total,wins,losses,scratches,pnlCents,winRate:closed?wins/closed:0};
  }

  buildConceptStats(entries) {
    const names = ['Athena Exclamation','Scarlet Needle','Sagittarius Justice Arrow','Wave Surfer','Crash Recovery Hunter','Recovery Hunter','Momentum Hunter','Lightning Plasma','Pegasus','Dragon','Phoenix'];
    const out = [];
    for (const name of names) {
      if (ACTIVE_FEEDER_CONCEPTS.has(name)) {
        const signals = entries.filter((e) => e.conceptName === name);
        const linked = entries.filter((e) => PORTFOLIO_CONCEPTS.has(e.conceptName) && e.sourceFeeder === name);
        const closed = linked.filter((e) => e.status === 'closed');
        const wins = closed.filter((e) => e.pnlCents > 0).length;
        const losses = closed.filter((e) => e.pnlCents < 0).length;
        out.push({
          name, displayName:name, legacyName:null,
          total: linked.length,
          open: linked.filter((e) => openLike(e.status)).length,
          closed: closed.length,
          wins, losses,
          winRate: closed.length ? wins / closed.length : 0,
          pnlCents: closed.reduce((sum, e) => sum + e.pnlCents, 0),
          avgEntryCents: signals.length ? Math.round(signals.reduce((sum, e) => {
            const signal = e.conceptName === 'Dragon' ? e.entryConfig?.dragonSource?.signalPriceCents : (e.conceptName==='Phoenix'?e.entryConfig?.phoenixSource?.signalAskCents:null);
            return sum + (Number.isFinite(Number(signal)) ? Number(signal) : Number(e.entryPriceCents || 0));
          }, 0) / signals.length) : 0,
          avgCurrentCents: signals.length ? Math.round(signals.reduce((sum, e) => sum + this.quoteView(e).priceCents, 0) / signals.length) : 0,
          avgLiquidity: signals.length ? signals.reduce((sum, e) => sum + e.volume24h, 0) / signals.length : 0,
          fedHunters: linked.length,
          feederSignals: signals.length,
          statsBasis: 'fed_hunters',
        });
        continue;
      }
      const rows = entries.filter((e) => e.conceptName === name);
      const closed = rows.filter((e) => e.status === 'closed');
      const wins = closed.filter((e) => e.pnlCents > 0).length;
      const losses = closed.filter((e) => e.pnlCents < 0).length;
      out.push({
        name, displayName:EXECUTION_ATTACK_DISPLAY[name]?.name||name, legacyName:EXECUTION_ATTACK_DISPLAY[name]?.legacy||name,
        total: rows.length,
        open: rows.filter((e) => openLike(e.status)).length,
        closed: closed.length,
        wins, losses,
        winRate: closed.length ? wins / closed.length : 0,
        pnlCents: closed.reduce((sum, e) => sum + e.pnlCents, 0),
        avgEntryCents: rows.length ? Math.round(rows.reduce((sum, e) => sum + e.entryPriceCents, 0) / rows.length) : 0,
        avgCurrentCents: rows.length ? Math.round(rows.reduce((sum, e) => sum + this.quoteView(e).priceCents, 0) / rows.length) : 0,
        avgLiquidity: rows.length ? rows.reduce((sum, e) => sum + e.volume24h, 0) / rows.length : 0,
        fedHunters: null,
      });
    }
    return out.sort((a, b) => b.pnlCents - a.pnlCents);
  }

  async emergencyExit({ entryId } = {}) {
    const id=String(entryId||'').trim();
    if(!id)throw new Error('entryId is required');
    const entry=await this.db.entryById(id);
    if(!entry)throw new Error('Entry not found');
    if(String(entry.systemName||'')!==String(this.settings.systemName||'')||String(entry.ownerId||'')!==String(this.settings.ownerId||'')){
      await this.db.audit('error','emergency_exit_owner_mismatch',{id,ticker:entry.ticker,entrySystemName:entry.systemName,entryOwnerId:entry.ownerId,runtimeSystemName:this.settings.systemName,runtimeOwnerId:this.settings.ownerId}).catch(()=>{});
      throw new Error('Entry is not owned by this SAGITTARIUS runtime');
    }
    if(!PORTFOLIO_CONCEPTS.has(entry.conceptName))throw new Error('Emergency Exit applies only to real Hunter positions');
    if(!openLike(entry.status))return{ok:false,closed:entry.status==='closed',skipped:'position_not_open',status:entry.status};
    if(entry.mode==='LIVE'&&!this.isLiveReady()){
      await this.db.audit('warning','emergency_exit_live_authorization_blocked',{id,ticker:entry.ticker,mode:this.settings.mode,liveArmed:this.settings.liveArmed===true,allowLiveTrading:env.allowLiveTrading,healthDegraded:this.health.degraded});
      return{ok:false,closed:false,skipped:'live_not_authorized'};
    }
    const out=await this.profitGuard.emergencyExit(entry);
    this.invalidateStateSnapshot();
    return{ok:Boolean(out.closed||out.pending),entryId:id,ticker:entry.ticker,conceptName:entry.conceptName,...out};
  }

  async manualCashout({ entryIds = null, allProfitable = false } = {}, reason = 'manual_cashout') {
    const open = (typeof this.db.openHunterEntries==='function'
      ? await this.db.openHunterEntries(this.settings.systemName)
      : (await this.db.openEntries(this.settings.systemName)).filter((e)=>PORTFOLIO_CONCEPTS.has(e.conceptName)))
      .filter((e) => e.status === 'open' && (!entryIds || entryIds.includes(e.id)));
    if (!allProfitable && !Array.isArray(entryIds)) throw new Error('Provide entryIds or allProfitable');
    let manualTrainingContext=null;
    if (reason === 'manual_cashout') {
      manualTrainingContext=await this.goldenEye?.beginManualTraining?.(open,Date.now(),{allProfitable}).catch(async(error)=>{
        await this.db.audit('warning','golden_eye_manual_training_begin_error',{message:String(error?.message||error)}).catch(()=>{});
        return null;
      });
    }
    const rows = await mapLimit(open, reason === 'golden_eye_cashout' ? GOLDEN_EYE.maximumParallelCashouts : Math.min(4, GOLDEN_EYE.maximumParallelCashouts), async (e) => {
      try {
        let q = this.market.getQuote(e.ticker);
        if (!q || this.market.quoteAgeMs(e.ticker) > DISPLAY_QUOTE_FRESH_MS) q = await this.market.refreshTicker(e.ticker).catch(() => null);
        if (!q) return { kind:'skipped', value:{ id:e.id,ticker:e.ticker,reason:'market_data_unavailable' } };
        const out = await this.profitGuard.manualCashout(e, q, { reason });
        if (out.closed) {
          const fresh = await this.db.entryById(e.id);
          const pnlCents = fresh?.pnlCents ?? out.pnlCents ?? 0;
          return { kind:'closed', value:{ id:e.id,ticker:e.ticker,exitPriceCents:fresh?.exitPriceCents ?? q.yesBid,pnlCents,realizedThisActionCents:Number(pnlCents)-Number(e.pnlCents||0) } };
        }
        if (out.reopened && Number(out.filled || 0) > 0) {
          return { kind:'partial', value:{ id:e.id,ticker:e.ticker,filled:Number(out.filled||0),remaining:Number(out.remaining||0),fillPriceCents:Number(out.fillPriceCents||0),realizedThisActionCents:Number(out.pnlCents||0)-Number(e.pnlCents||0) } };
        }
        if (out.pending) return { kind:'pending', value:{ id:e.id,ticker:e.ticker,reason:out.skipped || 'exit_pending' } };
        return { kind:'skipped', value:{ id:e.id,ticker:e.ticker,reason:out.skipped || 'not_closed',netPnlCents:out.netPnlCents } };
      } catch (error) {
        const message=String(error?.message||error||'cashout_error');
        await this.db.audit('error', reason === 'golden_eye_cashout' ? 'golden_eye_cashout_entry_error' : 'manual_cashout_entry_error', {id:e.id,ticker:e.ticker,message}).catch(()=>{});
        return { kind:'error', value:{ id:e.id,ticker:e.ticker,reason:'cashout_error',message } };
      }
    });
    const closed=rows.filter((x)=>x?.kind==='closed').map((x)=>x.value);
    const partial=rows.filter((x)=>x?.kind==='partial').map((x)=>x.value);
    const pending=rows.filter((x)=>x?.kind==='pending').map((x)=>x.value);
    const skipped=rows.filter((x)=>x?.kind==='skipped').map((x)=>x.value);
    const errors=rows.filter((x)=>x?.kind==='error').map((x)=>x.value);
    const totalProfitCents=[...closed,...partial].reduce((sum,x)=>sum+Number(x.realizedThisActionCents||0),0);
    const result={
      closed,partial,pending,skipped,errors,
      closedCount:closed.length,partialCount:partial.length,pendingCount:pending.length,skippedCount:skipped.length,errorCount:errors.length,
      totalProfitCents,reason,
    };
    if (reason === 'manual_cashout' && manualTrainingContext) {
      await this.goldenEye?.completeManualTraining?.(manualTrainingContext,result,Date.now()).catch(async(error)=>{
        await this.db.audit('warning','golden_eye_manual_training_complete_error',{message:String(error?.message||error)}).catch(()=>{});
      });
    }
    this.invalidateStateSnapshot();
    return result;
  }

  athenaBrainDocument() {
    const memory=this.athenaCommander?.memory||null;if(!memory)throw new Error('Athena A3 is not ready');
    return{format:'SAGITTARIUS-ATHENA-A3-ECONOMIC-SURVIVAL-MEMORY',formatVersion:3,exportedAt:new Date().toISOString(),brain:{version:ATHENA_COMMANDER.version,policyRevision:ATHENA_COMMANDER.policyRevision,memory,summary:this.athenaCommander.summary()}};
  }

  async assertAthenaMutationSafe(action='change'){
    if(this.settings.mode!=='SIMULATION'||this.settings.liveArmed===true)throw new Error(`Athena ${action} is allowed only in SIMULATION with LIVE disarmed`);
    if(this.settings.engineActive!==false)throw new Error(`Stop the engine before Athena ${action}`);
    const active=(typeof this.db.openHunterEntries==='function'?await this.db.openHunterEntries(this.settings.systemName):(await this.db.openEntries(this.settings.systemName)).filter(e=>PORTFOLIO_CONCEPTS.has(e.conceptName))).filter(e=>openLike(e.status));
    if(active.length)throw new Error(`Close all active real Hunters before Athena ${action}`);
  }

  async installAthenaBrain(){throw new Error('Athena A3 is database-derived and continuously learned; direct brain import is disabled');}

  async rebuildAthenaBrain(){await this.assertAthenaMutationSafe('rebuild');const memory=await this.athenaCommander.refreshLearning();return{ok:true,athena:this.athenaCommander.summary(),memory};}

  async diagnostics() {
    const base=await this.state();
    // R54: historical observability is explicit/on-demand. The 2-second SSE
    // state never pays these allocations, but a diagnostics download still
    // receives bounded research context for auditability.
    const detailJobs=[
      ()=>typeof this.db.trackerDashboardRows==='function'?this.db.trackerDashboardRows(this.settings.systemName,250):this.db.trackers(this.settings.systemName,250),
      ()=>this.db.patterns(this.settings.systemName),
      ()=>this.db.sportProfiles(),
      ()=>this.db.snapshots(this.settings.systemName,150),
      ()=>this.db.recentAudit(50),
      ()=>typeof this.db.crashEpisodes==='function'?this.db.crashEpisodes(this.settings.systemName,{limit:250}):[],
    ];
    const [trackedMarkets,patterns,sports,snapshots,audit,crashEpisodes]=await mapLimit(detailJobs,STATE_DB_FANOUT_MAX,(job)=>job()).catch(()=>[base.trackedMarkets||[],[],[],[],base.audit||[],[]]);
    const feederSignalIntelligence={version:FEEDER_SIGNAL_INTELLIGENCE.version,role:FEEDER_SIGNAL_INTELLIGENCE.role,runtime:'DISABLED_R60_SHADOW_TABLE_REPLACES_QUOTE_RATE_FSI',healthy:true,records:[],recordsIncluded:0,recordsAvailable:0,summary:{signals:0,tracking:0,complete:0}};
    const boundedBase={...base,trackedMarkets,patterns,sports,snapshots,audit,crashEpisodes,closedHunters:Array.isArray(base.closedHunters)?base.closedHunters.slice(0,150):[]};
    return {...boundedBase,feederSignalIntelligence,diagnosticExport:{version:'DX2',hardMaximumBytes:2_000_000,targetMaximumBytes:1_850_000,serialization:'compact_json',priority:'safety_runtime_performance_open_positions_stop_guard_then_recent_research',operationalStateHistoricalRows:false,onDemandResearch:true,closedHuntersIncluded:boundedBase.closedHunters?.length||0,closedHuntersAvailable:base.closedHunters?.length||0,fsiRecordsIncluded:feederSignalIntelligence?.recordsIncluded||0,fsiRecordsAvailable:feederSignalIntelligence?.recordsAvailable||0}};
  }

  async tradingLogText() {
    const p = await this.performance({fullHistory:true});
    const clean=(value,max=120)=>String(value??'').replace(/[\r\n\t]+/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
    const money=(v)=>`$${(Number(v||0)/100).toFixed(2)}`;
    const c=(v)=>v==null?'-':`${Number(v).toFixed(Number.isInteger(Number(v))?0:2)}c`;
    const ms=(v)=>v==null?'-':`${Math.round(Number(v)/1000)}s`;
    const active=[...p.active].sort((a,b)=>{
      const ao=openLike(a.status)?1:0,bo=openLike(b.status)?1:0;
      if(ao!==bo)return bo-ao;
      return Number(b.updatedAtMs||b.closedAtMs||b.openedAtMs||0)-Number(a.updatedAtMs||a.closedAtMs||a.openedAtMs||0);
    });
    const lines = [
      '=== SAGITTARIUS TRADING LOGS ===',
      `Generated: ${new Date().toISOString()}`,
      `Release: ${RELEASE}`,
      'Format: TLX1 compact analysis log | Server hard cap: 2000000 UTF-8 bytes',
      `Loaded records: ${active.length} | Hunter trades: ${p.hunters.length} | Open Hunters: ${p.open.length} | Closed Hunters: ${p.closed.length}`,
      `Wins: ${p.wins} | Losses: ${p.losses} | Scratches: ${p.scratches} | Realized P&L: ${money(p.hunterRealizedCents)} | Unrealized P&L: ${money(p.hunterUnrealizedCents)}`,
      'Fields: ticker | concept<-source | mode/status/data | entry/ref/signal/current/peak/stop | count/remain | pnl | MAE/low/MAEtime/recoveryEntry/recoveryGreen | postPrice/delta/bestExec/missed/worstExec/saved | reason | opened/closed',
      '',
    ];
    for (const raw of active) {
      const e = this.decorateEntry(raw);
      const hunter=PORTFOLIO_CONCEPTS.has(e.conceptName);
      const shownPnl = hunter && openLike(e.status) ? e.positionPnlCents : e.pnlCents;
      const source=e.sourceFeeder?`<-${clean(e.sourceFeeder,40)}`:'';
      const data=e.quoteAgeMs==null?clean(e.dataState,20):`${clean(e.dataState,20)}:${Math.round(Number(e.quoteAgeMs)/1000)}s`;
      const economics=FEEDER_CONCEPTS.has(e.conceptName) && e.signalPriceCents != null
        ? `sig=${c(e.signalPriceCents)},ref=${c(e.referenceOriginCents)},cur=${c(e.currentPriceCents)},peak=${c(e.peakPriceCents)}`
        : `entry=${c(e.entryPriceCents)},cur=${c(e.currentPriceCents)},peak=${c(e.peakPriceCents)},stop=${c(e.stopPriceCents)}`;
      const research=`mae=${c(e.maeCents)},low=${c(e.lowestPriceAfterEntryCents)},maet=${ms(e.maeAfterEntryMs)},rEntry=${ms(e.recoveryToEntryMs)},rGreen=${ms(e.recoveryToGreenMs)}`;
      const post=e.status==='closed'
        ? `post=${c(e.postExitCurrentPriceCents)},dExit=${c(e.postExitDeltaFromExitCents)},best=${c(e.postExitBestPriceCents)},missed=${e.postExitMissedUpsideCents==null?'-':money(e.postExitMissedUpsideCents)},worst=${c(e.postExitWorstPriceCents)},saved=${e.postExitLossAvoidedCents==null?'-':money(e.postExitLossAvoidedCents)},postDone=${e.postExitResearchComplete?'Y':'N'}`
        : 'post=-';
      lines.push([
        clean(e.ticker,120),
        `${clean(e.conceptName,50)}${source}`,
        `${clean(e.mode,12)}/${clean(e.status,24)}/${data}`,
        economics,
        `qty=${Number(e.count||0)},rem=${Number(e.remainingCount||0)}`,
        `pnl=${money(shownPnl)}`,
        research,
        post,
        `reason=${clean(e.closeReason,80)||'-'}`,
        `open=${Number(e.openedAtMs||0)},close=${Number(e.closedAtMs||0)||'-'}`,
      ].join(' | '));
    }
    return lines.join('\n');
  }

  async shutdown() {
    this.running = false;
    if(this.resourceGovernorTimer)clearInterval(this.resourceGovernorTimer);
    this.resourceGovernorTimer=null;
    for (const timer of this.quoteProtectionTimers.values()) clearTimeout(timer);
    this.quoteProtectionTimers.clear();
    if (this.goldenEyeTimer) clearTimeout(this.goldenEyeTimer);
    this.goldenEyeTimer = null;
    this.goldenEyeRerunRequested = false;
    for (const timer of this.recoveryEvaluationTimers.values()) clearTimeout(timer);
    this.recoveryEvaluationTimers.clear();
    for (const timer of this.feederHunterEvaluationTimers.values()) clearTimeout(timer);
    this.feederHunterEvaluationTimers.clear();
    for(const timer of this.athenaOpportunityTimers.values())clearTimeout(timer);
    this.athenaOpportunityTimers.clear();
    if(this.lightningPlasmaTimer)clearTimeout(this.lightningPlasmaTimer);
    this.lightningPlasmaTimer=null;
    this.lightningPlasmaRerunRequested=false;
    for (const timer of this.crashRecoveryEvaluationTimers.values()) clearTimeout(timer);
    this.crashRecoveryEvaluationTimers.clear();
    this.entryAdmissionProbeAt?.clear?.();
    if (this.reconcileTimer) clearTimeout(this.reconcileTimer);
    this.market?.stop();
    const goldenEyePending=[this.goldenEyeEvaluationPromise,this.goldenEyeExecutionPromise].filter(Boolean);
    if(goldenEyePending.length)await Promise.race([Promise.allSettled(goldenEyePending),sleep(2000)]).catch(()=>{});
    await this.goldenEye?.persist?.(true).catch(()=>{});
    // PLI1 is deliberately off the protection critical path. On orderly
    // shutdown, give already-queued observations a bounded chance to persist
    // before closing PostgreSQL; shutdown can never wait indefinitely on
    // learning I/O.
    await this.profitGuard?.flushProfitLearningQueues?.(2000).catch(()=>false);
    await this.profitGuard?.flushPostExitPersistence?.(2000).catch(()=>false);
    await this.feederSignalIntel?.flush?.(2000).catch(()=>false);
    await this.learning?.flushCrashPersistence?.(2000).catch(()=>false);
    await this.atomicThunderBolt?.flushCounterfactualCompletions?.(2000).catch(()=>false);
    await this.db.close();
  }
}
