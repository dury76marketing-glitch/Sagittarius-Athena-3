import { FEEDER_CONCEPTS, PORTFOLIO_CONCEPTS, ULTIMATE_STOP_GUARD, STOP_LOSS_WATCHDOG, stopLossWatchdogThresholdsForStakeCents, STOP_GUARD_RECOVERY_LEARNING, ULTIMATE_PROFIT_GUARD, APEX_PROFIT_GUARD, PROTECTED_RUNNER_INTELLIGENCE, PROFIT_LEARNING_INTELLIGENCE, ATHENA_EXIT_INTELLIGENCE, GOLDEN_EYE, ATOMIC_THUNDER, INFINITY_BREAK, AURORA_EXECUTION, POST_EXIT_RESEARCH, LEGACY_STOP_LOSS_CENTS, SCARLET_NEEDLE, calculateAuroraSnapshotFromFeeModel, kalshiGeneralTakerFeeEstimateCents } from './doctrine.mjs';
import { advanceAthenaExitState, athenaExitTelemetry } from './athenaExit.mjs';
import { assessAthenaBrain } from './athena.mjs';
import { classifyDeterministic } from './learning.mjs';

const FINAL_STATUSES = new Set(['finalized', 'settled']);
const TERMINAL_ORDER_STATUSES = new Set(['executed', 'filled', 'canceled', 'cancelled', 'rejected', 'expired']);
const QUOTE_STALE_MS = 10_000;
const AMBIGUOUS_ORDER_GRACE_MS = 10_000;
const LEGACY_ULTIMATE_PROFIT_GUARD_VERSIONS = new Set(['U-PG1', 'U-PG2']);

const n = (v, d = 0) => Number.isFinite(Number(v)) ? Number(v) : d;
const finalMarket = (q) => FINAL_STATUSES.has(String(q?.status || '').toLowerCase()) && Boolean(q?.result);
const terminalOrder = (truth) => TERMINAL_ORDER_STATUSES.has(String(truth?.status || '').toLowerCase());
const remainingCount = (entry) => Math.max(0, n(entry.remainingCount, n(entry.count)));

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function gameMinutesAtHunterEntry(entry) {
  const opened=n(entry?.openedAtMs);
  const frozenStart=n(entry?.entryConfig?.gameClockAuthority?.startTimeMs,n(entry?.gameStartTimeMs));
  if(!(opened>0)||!(frozenStart>0)||opened<frozenStart)return 0;
  return Math.max(0,Math.floor((opened-frozenStart)/60000));
}

function isFrozenAuroraEntry(entry) {
  const aurora=entry?.entryConfig?.aurora;
  return Boolean(aurora?.version===AURORA_EXECUTION.version&&aurora?.frozen===true&&n(aurora.dangerPriceCents)>=0&&n(aurora.stopDistanceCents)>0);
}

function stopLossForEntry(entry) {
  const aurora=entry?.entryConfig?.aurora;
  if(aurora?.version===AURORA_EXECUTION.version&&aurora?.frozen===true&&n(aurora.stopDistanceCents)>0) return n(aurora.stopDistanceCents);
  if (n(entry?.stopLossCents) > 0) return n(entry.stopLossCents);
  // Historical pre-Aurora rows remain protected under their creation-era
  // doctrine even after the editable static stop settings are retired.
  return n(LEGACY_STOP_LOSS_CENTS[entry?.conceptName],14);
}

function stopGuardZone(penetrationCents) {
  const p = Math.max(0, n(penetrationCents));
  if (p <= ULTIMATE_STOP_GUARD.recoveryZoneCents) return 'RECOVERY';
  if (p <= ULTIMATE_STOP_GUARD.stressedZoneCents) return 'STRESSED';
  if (p < ULTIMATE_STOP_GUARD.emergencyExtensionCents) return 'CRITICAL';
  return 'EMERGENCY';
}

function stopGuardWindowFactor(penetrationCents) {
  const p = Math.max(0, n(penetrationCents));
  if (p <= ULTIMATE_STOP_GUARD.warningPenetrationCents) return 1;
  if (p <= ULTIMATE_STOP_GUARD.recoveryZoneCents) return ULTIMATE_STOP_GUARD.warningWindowFactor;
  if (p <= ULTIMATE_STOP_GUARD.stressedZoneCents) return ULTIMATE_STOP_GUARD.stressedWindowFactor;
  return ULTIMATE_STOP_GUARD.criticalWindowFactor;
}

function adaptiveStopGuardWindowMs(profile) {
  const learned = n(profile?.avgRecoveryTimeMs);
  if (learned <= 0) return ULTIMATE_STOP_GUARD.defaultRecoveryWindowMs;
  return clamp(
    learned * ULTIMATE_STOP_GUARD.recoveryWindowMultiplier,
    ULTIMATE_STOP_GUARD.minimumRecoveryWindowMs,
    ULTIMATE_STOP_GUARD.maximumRecoveryWindowMs,
  );
}

function stopGuardState(entry) {
  const state = entry?.stopGuardState;
  return state && typeof state === 'object' && state.version === ULTIMATE_STOP_GUARD.version && n(state.armedAtMs) > 0 ? state : null;
}


function stopLossWatchdogState(entry) {
  const state = entry?.stopGuardState?.watchdog;
  return state && typeof state === 'object' && state.version === STOP_LOSS_WATCHDOG.version && n(state.armedAtMs) > 0 ? state : null;
}

function stopGuardContainerWithWatchdog(entry, watchdog) {
  const current = entry?.stopGuardState && typeof entry.stopGuardState === 'object' ? entry.stopGuardState : {};
  if (current.version === ULTIMATE_STOP_GUARD.version) return { ...current, watchdog:watchdog || current.watchdog || null };
  return watchdog ? { watchdog } : {};
}

function ultimateProfitGuardState(entry) {
  const state = entry?.profitGuardState;
  if (!state || typeof state !== 'object' || n(state.armedAtMs) <= 0) return null;
  if (state.version === ULTIMATE_PROFIT_GUARD.version) return state;
  if (LEGACY_ULTIMATE_PROFIT_GUARD_VERSIONS.has(state.version)) return state;
  return null;
}

function activeApexProfitGuardState(entry) {
  const state = entry?.apexProfitGuardState;
  if (!state || typeof state !== 'object' || state.version !== APEX_PROFIT_GUARD.version || n(state.armedAtMs) <= 0) return null;
  return state;
}

function activeProtectedRunnerState(entry) {
  const state = entry?.profitGuardState;
  if (!state || typeof state !== 'object' || state.version !== PROTECTED_RUNNER_INTELLIGENCE.version) return null;
  return state;
}

function isCommittedProtectedRunnerPhase(phase) {
  return String(phase || '') === 'PRI1_EXIT_COMMITTED';
}

function isProtectedRunnerTradeEntry(entry) {
  if (!entry || FEEDER_CONCEPTS.has(entry.conceptName)) return false;
  return String(entry?.entryConfig?.profitAuthority || '') === PROTECTED_RUNNER_INTELLIGENCE.version
    || activeProtectedRunnerState(entry)?.version === PROTECTED_RUNNER_INTELLIGENCE.version;
}

function isProtectedRunnerR2TradeEntry(entry) {
  if (!isProtectedRunnerTradeEntry(entry)) return false;
  const state = activeProtectedRunnerState(entry);
  const revision = String(entry?.entryConfig?.profitAuthorityRevision || state?.policyRevision || '');
  return revision === PROTECTED_RUNNER_INTELLIGENCE.policyRevision;
}

function activeAthenaExitState(entry) {
  const state = entry?.profitGuardState;
  if (!state || typeof state !== 'object' || state.version !== ATHENA_EXIT_INTELLIGENCE.version) return null;
  return state;
}

function isCommittedAthenaExitPhase(phase) {
  return String(phase || '') === 'X1_EXIT_COMMITTED';
}

function isAthenaExitTradeEntry(entry) {
  if (!entry || FEEDER_CONCEPTS.has(entry.conceptName)) return false;
  return String(entry?.entryConfig?.profitAuthority || '') === ATHENA_EXIT_INTELLIGENCE.version
    || activeAthenaExitState(entry)?.version === ATHENA_EXIT_INTELLIGENCE.version;
}

function isGoldenEyeTradeEntry(entry) {
  if (!entry || FEEDER_CONCEPTS.has(entry.conceptName)) return false;
  return String(entry?.entryConfig?.profitAuthority || '') === GOLDEN_EYE.version;
}

function athenaExitPolicyRevision(entry) {
  const state=activeAthenaExitState(entry);
  return String(entry?.entryConfig?.profitAuthorityRevision || state?.policyRevision || '');
}

function athenaExitPolicyRevisionSupported(entry) {
  return athenaExitPolicyRevision(entry) === ATHENA_EXIT_INTELLIGENCE.policyRevision;
}

function athenaExitBookTimestampFresh(updatedAtMs, nowMs = Date.now()) {
  const ts=n(updatedAtMs);
  const now=n(nowMs);
  if(ts<=0||now<=0)return false;
  const age=now-ts;
  return age>=-ATHENA_EXIT_INTELLIGENCE.maximumFutureBookSkewMs
    && age<=ATHENA_EXIT_INTELLIGENCE.maximumExecutableBookAgeMs;
}

function isCommittedApexProfitGuardPhase(phase) {
  return String(phase || '') === 'APG1_EXIT_COMMITTED';
}

function isLegacyUltimateProfitGuardVersion(version) {
  return LEGACY_ULTIMATE_PROFIT_GUARD_VERSIONS.has(String(version || ''));
}

function isCommittedUltimateProfitGuardPhase(phase) {
  return ['UPG3_EXIT_COMMITTED', 'UPG2_EXIT_COMMITTED', 'UPG1_EXIT_COMMITTED'].includes(String(phase || ''));
}

function isRecoveryUltimateProfitGuardPhase(phase) {
  return ['UPG3_RECOVERY_ZONE', 'UPG3_FAILURE_CONFIRMING', 'UPG3_PROFIT_FLOOR_LOST', 'UPG3_RECLAIMING'].includes(String(phase || ''));
}

function conceptMaxSpread(settings, conceptName) {
  if (conceptName === 'Momentum Hunter') return n(settings.momentumMaxSpreadCents, n(settings.maxSpreadCents, 3));
  if (conceptName === 'Wave Surfer') return n(settings.waveMaxSpreadCents, n(settings.maxSpreadCents, 3));
  if (conceptName === 'Crash Recovery Hunter') return n(settings.crashRecoveryMaxSpreadCents, n(settings.maxSpreadCents, 3));
  if (conceptName === 'Lightning Plasma') return n(settings.lightningPlasmaMaxSpreadCents, n(settings.maxSpreadCents, 3));
  if (conceptName === 'Dragon Recovery Hunter') return n(settings.dragonRecoveryMaxSpreadCents, n(settings.maxSpreadCents, 3));
  if (conceptName === 'Golden Dragon Hunter') return n(settings.goldenDragonHunterMaxSpreadCents, n(settings.maxSpreadCents, 3));
  return n(settings.maxSpreadCents, 3);
}

function totalEntryFee(entry, settings) {
  const stored = n(entry.entryFeeCents);
  if (stored > 0) return stored;
  return n(settings.simFeeCents) * Math.max(0, n(entry.count));
}

function allocatedEntryFee(entry, filled, settings) {
  const original = Math.max(0, n(entry.count));
  if (original <= 0 || filled <= 0) return 0;
  return totalEntryFee(entry, settings) * (filled / original);
}

export function profitGuardDecision(entry, q, settings) {
  const bid = n(q?.yesBid);
  const isFinal = finalMarket(q);
  const resultKnown = Boolean(q?.result);

  if (FEEDER_CONCEPTS.has(entry.conceptName)) {
    if (isFinal) {
      return {
        action: 'close_ghost',
        exitPriceCents: entry.entryPriceCents,
        reason: 'ghost_signal',
        guardState: 'SETTLED',
      };
    }
    if (resultKnown) {
      return {
        action: 'hold_ghost',
        guardState: 'SETTLEMENT_PENDING',
        currentPriceCents: bid > 0 ? bid : entry.currentPriceCents,
        peakPriceCents: Math.max(entry.peakPriceCents || entry.entryPriceCents, bid || 0),
        stopPriceCents: 0,
      };
    }
    return {
      action: 'hold_ghost',
      guardState: 'FEEDER',
      currentPriceCents: bid > 0 ? bid : entry.currentPriceCents,
      peakPriceCents: Math.max(entry.peakPriceCents || entry.entryPriceCents, bid || 0),
      stopPriceCents: 0,
    };
  }

  if (isFinal) {
    const won = String(q.result).toLowerCase() === 'yes';
    return {
      action: 'settlement',
      exitPriceCents: won ? 100 : 0,
      reason: won ? 'settlement_win' : 'settlement_loss',
      guardState: 'SETTLEMENT',
    };
  }
  if (resultKnown) {
    return {
      action: 'hold',
      guardState: 'SETTLEMENT_PENDING',
      currentPriceCents: bid > 0 ? bid : entry.currentPriceCents,
      peakPriceCents: Math.max(entry.peakPriceCents || entry.entryPriceCents, bid || 0),
      stopPriceCents: entry.stopPriceCents || 0,
    };
  }
  if (bid <= 0) return { action: 'hold', guardState: 'WAITING_FOR_BID' };

  const stopLoss = stopLossForEntry(entry);
  const hard = Math.max(0, entry.entryPriceCents - stopLoss);
  if (bid <= hard) {
    // The trigger remains the frozen hard-stop threshold. Execution is handled
    // separately at the real executable bid; a gap through the stop is never
    // paper-filled back at the theoretical threshold.
    return {
      action: 'hard_stop',
      exitPriceCents: hard,
      liveExitPriceCents: bid,
      reason: 'hard_stop_loss',
      guardState: 'HARD_STOP',
      stopPriceCents: hard,
      peakPriceCents: Math.max(entry.peakPriceCents || entry.entryPriceCents, bid),
    };
  }

  const peak = Math.max(entry.peakPriceCents || entry.entryPriceCents, bid);
  return {
    action: 'hold',
    guardState: 'PROTECTED',
    currentPriceCents: bid,
    peakPriceCents: peak,
    stopPriceCents: hard,
    hardStopCents: hard,
  };
}

export class ProfitGuard {
  constructor({ db, kalshi, market, learning, athena = null, getSettings, onOpportunityCompleted = null, onPositionClosed = null }) {
    this.db = db;
    this.kalshi = kalshi;
    this.market = market;
    this.learning = learning;
    // ATHENA-B1 remains frozen entry intelligence. X1 receives only a read-only
    // reference so it can query the already-frozen no-lookahead crash-depth
    // survival surface through the pure assessor without incrementing B1
    // assessment counters or granting B1 any exit authority.
    this.athena = athena;
    this.getSettings = getSettings;
    this.onOpportunityCompleted = typeof onOpportunityCompleted === 'function' ? onOpportunityCompleted : null;
    this.onPositionClosed = typeof onPositionClosed === 'function' ? onPositionClosed : null;
    this.states = new Map();
    // Atomic Thunder confirmation state is process-local and deliberately
    // fail-closed. A restart requires two new distinct fresh-book confirmations
    // and therefore cannot authorize a profit exit from stale memory.
    this.atomicThunderStates = new Map();
    this.entryLocks = new Map();
    // R45 Galactic Explosion can create multiple independently owned logical
    // positions on one broker ticker. Broker inventory is aggregate by ticker,
    // so all LIVE sells on that ticker must be serialized even when their
    // per-entry protection locks are distinct.
    this.tickerExitLocks = new Map();
    this.activeTickers = new Set();
    this.profitLearningQueues = new Map();
    this.profitLearningQueuedAtMs = new Map();
    // R52 PER2: post-exit research is non-authoritative telemetry. Keep the
    // newest state per closed entry and serialize it through the shared bounded
    // low-priority DB lane so restored regret/protection analytics can never
    // recreate the R51 quote->database pressure failure.
    this.postExitRuntimeState = new Map();
    this.postExitPersistencePending = new Map();
    this.postExitPersistenceActive = false;
    this.postExitPersistenceActiveId = null;
    this.postExitPersistenceRetryTimer = null;
    this.postExitPersistenceRetryAtMs = 0;
    this.postExitPersistenceTotalQueued = 0;
    this.postExitPersistenceTotalCoalesced = 0;
    this.postExitPersistenceTotalCompleted = 0;
    this.postExitPersistenceTotalFailed = 0;
    this.postExitPersistenceTotalDropped = 0;
    this.postExitPersistenceMaxObservedPending = 0;
    this.protectionOk = true;
    this.lastError = null;
  }

  getState(id) { return this.states.get(id) || null; }

  pruneRuntimeState(activeEntries = []) {
    const activeIds=new Set((activeEntries||[]).map((e)=>String(e?.id||'')).filter(Boolean));
    for(const id of [...this.states.keys()])if(!activeIds.has(String(id)))this.states.delete(id);
    for(const id of [...this.atomicThunderStates.keys()])if(!activeIds.has(String(id)))this.atomicThunderStates.delete(id);
  }

  pruneProfitLearningTimestamps(recentClosed = []) {
    const keep=new Set([...(recentClosed||[]).map((e)=>String(e?.id||'')).filter(Boolean),...this.states.keys(),...this.profitLearningQueues.keys()]);
    for(const id of [...this.profitLearningQueuedAtMs.keys()])if(!keep.has(String(id)))this.profitLearningQueuedAtMs.delete(id);
  }

  enqueuePostExitPersistence(entryId, patch) {
    const id=String(entryId||'');
    if(!id||!patch||typeof patch!=='object')return false;
    const existing=this.postExitPersistencePending.get(id);
    if(existing){
      this.postExitPersistencePending.set(id,{...existing,...structuredClone(patch)});
      this.postExitPersistenceTotalCoalesced+=1;
      return false;
    }
    if(this.postExitPersistencePending.size>=POST_EXIT_RESEARCH.maximumPendingEntries){
      this.postExitPersistenceTotalDropped+=1;
      this.audit('post_exit_research_backpressure',{entryId:id,pending:this.postExitPersistencePending.size,maximumPending:POST_EXIT_RESEARCH.maximumPendingEntries},'warning').catch(()=>{});
      return false;
    }
    this.postExitPersistencePending.set(id,structuredClone(patch));
    this.postExitPersistenceTotalQueued+=1;
    this.postExitPersistenceMaxObservedPending=Math.max(this.postExitPersistenceMaxObservedPending,this.postExitPersistencePending.size);
    this.pumpPostExitPersistence();
    return true;
  }

  schedulePostExitPersistenceRetry() {
    if(this.postExitPersistenceRetryTimer||!this.postExitPersistencePending.size)return;
    const delay=Math.max(1,this.postExitPersistenceRetryAtMs-Date.now());
    this.postExitPersistenceRetryTimer=setTimeout(()=>{this.postExitPersistenceRetryTimer=null;this.postExitPersistenceRetryAtMs=0;this.pumpPostExitPersistence();},delay);
    this.postExitPersistenceRetryTimer?.unref?.();
  }

  pumpPostExitPersistence() {
    if(this.postExitPersistenceActive||!this.postExitPersistencePending.size)return;
    if(this.postExitPersistenceRetryAtMs>Date.now()){this.schedulePostExitPersistenceRetry();return;}
    const first=this.postExitPersistencePending.entries().next().value;
    if(!first)return;
    const [id,patch]=first;
    this.postExitPersistencePending.delete(id);
    this.postExitPersistenceActive=true;
    this.postExitPersistenceActiveId=id;
    const write=()=>this.db.updateEntry(id,patch);
    const work=typeof this.db?.runLowPriorityPersistence==='function'?()=>this.db.runLowPriorityPersistence(write):write;
    Promise.resolve().then(work).then(()=>{
      this.postExitPersistenceTotalCompleted+=1;
    }).catch((error)=>{
      this.postExitPersistenceTotalFailed+=1;
      const newer=this.postExitPersistencePending.get(id)||{};
      if(this.postExitPersistencePending.size<POST_EXIT_RESEARCH.maximumPendingEntries||this.postExitPersistencePending.has(id)){
        this.postExitPersistencePending.set(id,{...patch,...newer});
        this.postExitPersistenceRetryAtMs=Date.now()+POST_EXIT_RESEARCH.retryCooldownMs;
      }else this.postExitPersistenceTotalDropped+=1;
      this.audit('post_exit_research_persistence_failed',{entryId:id,error:String(error?.message||error)},'warning').catch(()=>{});
    }).finally(()=>{
      this.postExitPersistenceActive=false;
      this.postExitPersistenceActiveId=null;
      if(this.postExitPersistenceRetryAtMs>Date.now())this.schedulePostExitPersistenceRetry();else this.pumpPostExitPersistence();
    });
  }

  async flushPostExitPersistence(timeoutMs = 2000) {
    const deadline=Date.now()+Math.max(0,Number(timeoutMs)||0);
    // Orderly shutdown is a bounded one-shot flush point. If a prior
    // low-priority write is cooling down after a transient failure, cancel the
    // timer and permit one immediate retry rather than guaranteeing loss of the
    // latest post-exit research snapshot when PostgreSQL is about to close.
    if(this.postExitPersistenceRetryTimer){clearTimeout(this.postExitPersistenceRetryTimer);this.postExitPersistenceRetryTimer=null;}
    this.postExitPersistenceRetryAtMs=0;
    while((this.postExitPersistenceActive||this.postExitPersistencePending.size)&&Date.now()<deadline){
      this.pumpPostExitPersistence();
      await new Promise(resolve=>setTimeout(resolve,5));
    }
    return !this.postExitPersistenceActive&&this.postExitPersistencePending.size===0;
  }

  resourceSnapshot() {
    return {
      guardStates:this.states.size,
      atomicThunderStates:this.atomicThunderStates.size,
      entryLocks:this.entryLocks.size,
      tickerExitLocks:this.tickerExitLocks.size,
      activeTickers:this.activeTickers.size,
      profitLearningQueues:this.profitLearningQueues.size,
      profitLearningTimestamps:this.profitLearningQueuedAtMs.size,
      postExitResearchStates:this.postExitRuntimeState.size,
      postExitPersistence:{version:POST_EXIT_RESEARCH.version,maxPending:POST_EXIT_RESEARCH.maximumPendingEntries,active:this.postExitPersistenceActive?1:0,activeEntryId:this.postExitPersistenceActiveId,pending:this.postExitPersistencePending.size,totalQueued:this.postExitPersistenceTotalQueued,totalCoalesced:this.postExitPersistenceTotalCoalesced,totalCompleted:this.postExitPersistenceTotalCompleted,totalFailed:this.postExitPersistenceTotalFailed,totalDropped:this.postExitPersistenceTotalDropped,maxObservedPending:this.postExitPersistenceMaxObservedPending},
    };
  }

  async completeOpportunityEpisode(entry,{closedAtMs=null}={}) {
    const boltId=String(entry?.entryConfig?.athenaFire?.boltId||'');
    if(!boltId||typeof this.db?.opportunityEpisode!=='function'||typeof this.db?.upsertOpportunityEpisode!=='function')return null;
    const prior=await this.db.opportunityEpisode(boltId).catch(()=>null);if(!prior)return null;
    const reason=String(entry?.closeReason||'');const pnl=n(entry?.pnlCents);const mae=n(entry?.maeCents);const targetPerContract=n(entry?.entryConfig?.infinityBreak?.minimumNetPerOriginalContractCents,n(entry?.entryConfig?.athenaFire?.economicTarget?.netPerOriginalContractCents,n(entry?.entryConfig?.economicTarget?.netPerOriginalContractCents,5)));
    let label='EXPIRED_NO_IMPULSE';
    if(reason==='infinity_break')label=mae<=targetPerContract+1e-9?'CLEAN_BOLT':'TOXIC_LATE_BOLT';
    else if(String(entry?.conceptName||'')==='Sagittarius Justice Arrow'&&reason==='athena_x1_exit'&&pnl>0)label='CLEAN_BOLT';
    else if(/aurora|hard_stop|stop_loss|ultimate_stop/i.test(reason)||pnl<0)label='FALSE_BOLT';
    const doneAt=Number(closedAtMs||entry?.closedAtMs||Date.now());
    const outcome={
      version:'ATHENA-OPPORTUNITY-OUTCOME-V1',labelPolicy:'OEL1-ECONOMIC-PATH',closeReason:reason,realizedPnlCents:pnl,maeCents:mae,
      peakPriceCents:n(entry?.peakPriceCents),entryPriceCents:n(entry?.entryPriceCents),exitPriceCents:n(entry?.exitPriceCents),
      timeOpenMs:Math.max(0,doneAt-n(entry?.openedAtMs,doneAt)),infinityBreak:Boolean(reason==='infinity_break'),athenaX1:Boolean(reason==='athena_x1_exit'),auroraExit:/aurora|hard_stop|stop_loss|ultimate_stop/i.test(reason),
      targetNetPerOriginalContractCents:targetPerContract,completedAtMs:doneAt,
    };
    const merged={...prior,outcome,outcomeLabel:label,trackingComplete:true,updatedAtMs:Date.now()};
    await this.db.upsertOpportunityEpisode(merged);
    const completed=await this.db.opportunityEpisode(boltId).catch(()=>merged);
    try{await this.onOpportunityCompleted?.(completed);}catch(error){await this.audit('athena_continuous_learning_callback_failed',{boltId,message:String(error?.message||error)},'warning').catch(()=>{});}
    return completed;
  }

  withEntryLock(id, fn) {
    const running = this.entryLocks.get(id);
    if (running) return running;
    const p = Promise.resolve().then(fn).finally(() => {
      if (this.entryLocks.get(id) === p) this.entryLocks.delete(id);
    });
    this.entryLocks.set(id, p);
    return p;
  }

  async withEntryLockQueued(id, fn) {
    const running = this.entryLocks.get(id);
    if (running) {
      try { await running; } catch {}
      return this.withEntryLockQueued(id, fn);
    }
    return this.withEntryLock(id, fn);
  }

  async withTickerExitLockQueued(ticker, fn) {
    const key=String(ticker||'');
    if(!key)return fn();
    const prior=this.tickerExitLocks.get(key);
    if(prior){try{await prior;}catch{}return this.withTickerExitLockQueued(key,fn);}
    const p=(async()=>{
      let unlock=null;
      try{
        if(typeof this.db.acquireHunterTickerLock==='function'){
          unlock=await this.db.acquireHunterTickerLock(this.getSettings().systemName,`broker:${key}`);
          if(!unlock){await this.audit('live_broker_mutation_ticker_db_lock_busy',{ticker:key,operation:'exit'},'warning');return{closed:false,pending:false,skipped:'ticker_broker_mutation_lock_busy'};}
        }
        return await fn();
      }finally{if(unlock)await unlock().catch(()=>{});}
    })().finally(()=>{if(this.tickerExitLocks.get(key)===p)this.tickerExitLocks.delete(key);});
    this.tickerExitLocks.set(key,p);
    return p;
  }

  async liveTickerOwnershipSnapshot(entry) {
    const s=this.getSettings();
    if(typeof this.kalshi?.getPositions!=='function')return{ok:false,reason:'broker_position_reader_unavailable'};
    const rows=typeof this.db.openHunterEntriesByTicker==='function'?await this.db.openHunterEntriesByTicker(s.systemName,entry.ticker):(typeof this.db.openEntriesByTicker==='function'?await this.db.openEntriesByTicker(s.systemName,entry.ticker):[]);
    const owned=(rows||[]).filter((e)=>PORTFOLIO_CONCEPTS.has(e.conceptName)&&String(e.ownerId||'')===String(s.ownerId||'')&&String(e.mode||'')==='LIVE'&&['open','entry_pending','exit_pending','pending_recovery'].includes(String(e.status||'')));
    const ownedRemaining=owned.reduce((sum,e)=>sum+remainingCount(e),0);
    let positions;
    try{positions=await this.kalshi.getPositions();}catch(error){return{ok:false,reason:'broker_position_read_failed',message:String(error?.message||error)};}
    const broker=(positions||[]).find((p)=>String(p.ticker||p.market_ticker||'')===String(entry.ticker||''));
    const raw=Number(broker?.position_fp??broker?.position??broker?.market_position??0);
    const brokerCount=Number.isFinite(raw)?Math.abs(raw):0;
    if(brokerCount+1e-9<ownedRemaining)return{ok:false,reason:'broker_below_owned_ledger',brokerCount,ownedRemaining,ownedRows:owned.length};
    if(remainingCount(entry)>ownedRemaining+1e-9)return{ok:false,reason:'entry_exceeds_owned_ledger',brokerCount,ownedRemaining,entryRemaining:remainingCount(entry)};
    return{ok:true,brokerCount,ownedRemaining,ownedRows:owned.length};
  }

  setState(entry, state) {
    this.states.set(entry.id, { ...state, updatedAtMs: Date.now() });
  }

  async audit(event, data = {}, level = 'info') {
    await this.db.audit(level, event, data).catch(() => {});
  }

  stopLossWatchdogStakeBasisCents(entry) {
    // Use the immutable original filled exposure, not the mutable remaining
    // quantity and not today's settings. This keeps thresholds stable across
    // settings edits and unavoidable partial exits, and it also handles a
    // partial entry fill according to the capital actually put at risk.
    const entryPrice = n(entry?.entryPriceCents);
    const originalCount = n(entry?.count);
    const actualOriginalNotional = entryPrice > 0 && originalCount > 0 ? entryPrice * originalCount : 0;
    if (actualOriginalNotional > 0) return actualOriginalNotional;
    const frozenStake = n(entry?.entryConfig?.stakeCents);
    if (frozenStake > 0) return frozenStake;
    return STOP_LOSS_WATCHDOG.referenceStakeCents;
  }

  stopLossWatchdogThresholds(entry) {
    return stopLossWatchdogThresholdsForStakeCents(this.stopLossWatchdogStakeBasisCents(entry));
  }

  async stopGuardLearningProfile(entry, bid, penetrationCents, cohort = {}) {
    if (typeof this.learning?.stopGuardProfile !== 'function') return null;
    return this.learning.stopGuardProfile({
      ticker:entry.ticker,
      title:entry.marketTitle || '',
      conceptName:entry.conceptName,
      sourceFeeder:entry.sourceFeeder || null,
      mode:entry.mode || 'SIMULATION',
      entryPriceCents:n(entry.entryPriceCents),
      totalDropCents:n(cohort.triggerDropCents,Math.max(0,n(entry.entryPriceCents)-n(bid))),
      gameMinutes:gameMinutesAtHunterEntry(entry),
      crashBucket:cohort.crashBucket || null,
      penetrationCents,
      minimumObservations:ULTIMATE_STOP_GUARD.minimumLearningObservations,
    }).catch(() => null);
  }


  async stopLossWatchdogLearningProfile(entry, bid, cohort = {}) {
    const fn = this.learning?.lossWatchdogProfile;
    if (typeof fn !== 'function') return null;
    return fn.call(this.learning, {
      ticker:entry.ticker,
      title:entry.marketTitle || '',
      conceptName:entry.conceptName,
      sourceFeeder:entry.sourceFeeder || null,
      mode:entry.mode || 'SIMULATION',
      entryPriceCents:n(entry.entryPriceCents),
      totalDropCents:n(cohort.triggerDropCents,Math.max(0,n(entry.entryPriceCents)-n(bid))),
      gameMinutes:gameMinutesAtHunterEntry(entry),
      crashBucket:cohort.crashBucket || null,
      minimumObservations:STOP_LOSS_WATCHDOG.minimumLearningObservations,
    }).catch(() => null);
  }

  async beginStopGuardLearningEpisode(entry, triggerStage, { triggerPriceCents=0, triggerLossCents=0, dangerLineCents=0, crash=null, coverageKind='causal_from_trigger', atMs=Date.now() } = {}) {
    if (typeof this.learning?.beginStopGuardRecoveryEpisode !== 'function') return null;
    try {
      return await this.learning.beginStopGuardRecoveryEpisode(entry, { triggerStage, triggerPriceCents, triggerLossCents, dangerLineCents, crash, coverageKind, atMs });
    } catch (error) {
      await this.audit('stop_guard_recovery_learning_episode_error', {
        id:entry?.id, ticker:entry?.ticker, concept:entry?.conceptName, triggerStage,
        error:String(error?.message || error), evidenceVersion:STOP_GUARD_RECOVERY_LEARNING.version,
      }, 'warning');
      return null;
    }
  }

  notifyPositionClosed(entry) {
    if (!this.onPositionClosed || !entry?.id) return false;
    const snapshot=structuredClone(entry);
    queueMicrotask(()=>{
      Promise.resolve(this.onPositionClosed(snapshot)).catch((error)=>{
        void this.audit('position_closed_handoff_failed',{id:snapshot.id,ticker:snapshot.ticker,concept:snapshot.conceptName,closeReason:snapshot.closeReason,message:String(error?.message||error)},'error').catch(()=>{});
      });
    });
    return true;
  }

  async verifyFrozenAuroraTouch(entry, q, dangerLineCents) {
    const danger=Math.max(0,n(dangerLineCents));
    const now=Date.now();
    await this.market.ensureFreshBook(entry.ticker, STOP_LOSS_WATCHDOG.maximumBookAgeMs).catch(()=>null);
    const freshQ=this.market.getQuote(entry.ticker)||q;
    const book=this.market.getBook?.(entry.ticker);
    const bookMs=n(book?.updatedAtMs,n(freshQ?.updatedAtMs));
    const ageMs=bookMs>0?now-bookMs:Infinity;
    const bid=n(freshQ?.yesBid),ask=n(freshQ?.yesAsk);
    const bookFresh=Boolean(book&&bookMs>0&&ageMs>=-STOP_LOSS_WATCHDOG.maximumFutureBookSkewMs&&ageMs<=STOP_LOSS_WATCHDOG.maximumBookAgeMs&&!freshQ?.bookInvalid&&bid>0&&ask>0&&bid<=ask);
    const exec=bookFresh?this.market.executableBid?.(entry.ticker,1,1):null;
    const executable=Boolean(exec&&n(exec.filled)>=1&&n(exec.avgCents)>0);
    const executableBidCents=executable?n(exec.avgCents):0;
    const confirmed=Boolean(bookFresh&&executable&&bid<=danger+1e-9&&executableBidCents<=danger+1e-9);
    let reason='verified_executable_touch';
    if(!bookFresh)reason='book_not_fresh_or_valid';
    else if(!executable)reason='no_executable_bid';
    else if(bid>danger+1e-9)reason='fresh_bid_above_danger';
    else if(executableBidCents>danger+1e-9)reason='executable_bid_above_danger';
    return {confirmed,reason,quote:freshQ,bookMs,bookAgeMs:ageMs,bidCents:bid,askCents:ask,executableBidCents,dangerLineCents:danger,verifiedAtMs:now};
  }

  async persistStopLossWatchdog(entry, state, guardState, q, { nonBlocking = false } = {}) {
    const persisted = { ...state, phase:guardState, updatedAtMs:Date.now() };
    const container = stopGuardContainerWithWatchdog(entry, persisted);
    await this.db.updateEntry(entry.id, {
      stopGuardState:container,
      currentPriceCents:n(q?.yesBid, entry.currentPriceCents),
      peakPriceCents:Math.max(n(entry.peakPriceCents, entry.entryPriceCents), n(q?.yesBid)),
      updatedAtMs:Date.now(),
      volume24h:q?.volume24h || entry.volume24h,
    });
    entry.stopGuardState = container;
    entry.currentPriceCents = n(q?.yesBid, entry.currentPriceCents);
    this.setState(entry, {
      action:'hold', guardState,
      stopLossWatchdog:STOP_LOSS_WATCHDOG.version,
      stopLossWatchdogLossCents:n(state.currentLossCents),
      stopLossWatchdogPeakLossCents:n(state.peakLossCents),
      stopLossWatchdogLearningRate:state.profile?.smoothedRecoveryRate ?? null,
      stopLossWatchdogLearningObservations:state.profile?.totalObservations ?? 0,
      stopLossWatchdogLearningSpecificity:state.profile?.specificity ?? null,
      stopLossWatchdogStructureStrong:Boolean(state.structureStrong),
      stopLossWatchdogCrashPhase:String(state.crash?.phase || 'NORMAL'),
      stopLossWatchdogLowerLows:n(state.lowerLowCount),
      stopLossWatchdogConsecutiveDown:n(state.consecutiveDown),
      stopPriceCents:Math.max(0,n(entry.entryPriceCents)-stopLossForEntry(entry,this.getSettings())),
    });
    return nonBlocking
      ? { handled:false, observed:true, result:{ protected:true, action:'stop_loss_watchdog_observation', guardState } }
      : { handled:true, result:{ protected:true, action:'stop_loss_watchdog', guardState } };
  }

  async clearStopLossWatchdog(entry, q, state, reason='recovered_below_reset') {
    const current = entry?.stopGuardState && typeof entry.stopGuardState === 'object' ? entry.stopGuardState : {};
    const container = current.version === ULTIMATE_STOP_GUARD.version ? { ...current } : {};
    delete container.watchdog;
    await this.db.updateEntry(entry.id, {
      stopGuardState:container,
      currentPriceCents:n(q?.yesBid,entry.currentPriceCents),
      updatedAtMs:Date.now(),
    });
    entry.stopGuardState = container;
    await this.audit('slw1_cleared', {
      id:entry.id,ticker:entry.ticker,concept:entry.conceptName,reason,
      currentLossCents:n(state?.currentLossCents),peakLossCents:n(state?.peakLossCents),
      armedAtMs:n(state?.armedAtMs),observations:n(state?.observationCount),
    });
    return { handled:false, cleared:true };
  }

  async handleStopLossWatchdog(entry, q, settings, { observationOnly = false } = {}) {
    if (FEEDER_CONCEPTS.has(entry.conceptName) || Boolean(q?.result) || finalMarket(q)) return { handled:false };
    const bid0=n(q?.yesBid);
    if (bid0<=0) return { handled:false };
    const stopLoss=stopLossForEntry(entry,settings);
    const danger=Math.max(0,n(entry.entryPriceCents)-stopLoss);
    // Once the immutable model stop is touched, SLW1 gets completely out of the
    // way. Standard U-SG1 owns everything from the Danger Line downward.
    if (bid0<=danger || stopGuardState(entry)) return { handled:false };

    const lossThresholds=this.stopLossWatchdogThresholds(entry);
    let state=stopLossWatchdogState(entry);
    const optimisticNet0=this.aggregateExecutableNetCents(entry,remainingCount(entry),bid0,settings);
    const optimisticLoss0=optimisticNet0==null?0:Math.max(0,-optimisticNet0);
    if (!state && optimisticLoss0 + 1e-9 < lossThresholds.wakeLossCents) return { handled:false };

    await this.market.ensureFreshBook(entry.ticker, STOP_LOSS_WATCHDOG.maximumBookAgeMs).catch(() => null);
    const freshQ=this.market.getQuote(entry.ticker)||q;
    const bid=n(freshQ?.yesBid,bid0),ask=n(freshQ?.yesAsk);
    const book=this.market.getBook?.(entry.ticker);
    const bookMs=n(book?.updatedAtMs,n(freshQ?.updatedAtMs));
    const bookAgeMs=bookMs>0?Date.now()-bookMs:Infinity;
    const bookFresh=Boolean(book&&bookMs>0&&bookAgeMs>=-STOP_LOSS_WATCHDOG.maximumFutureBookSkewMs&&bookAgeMs<=STOP_LOSS_WATCHDOG.maximumBookAgeMs&&!freshQ?.bookInvalid&&bid>0&&ask>0&&bid<=ask);
    const count=Math.max(1,remainingCount(entry));
    const optimisticNet=this.aggregateExecutableNetCents(entry,count,bid,settings);
    const optimisticLoss=optimisticNet==null?0:Math.max(0,-optimisticNet);
    const exec=bookFresh?this.market.executableBid?.(entry.ticker,count,1):null;
    const executableFull=Boolean(exec?.full&&n(exec.filled)+1e-9>=count&&n(exec.avgCents)>0);
    const executableNet=executableFull?this.aggregateExecutableNetCents(entry,count,n(exec.avgCents),settings):null;
    const executableLoss=executableNet==null?0:Math.max(0,-executableNet);
    const observedLoss=Math.max(optimisticLoss,executableLoss);

    if (state && observedLoss <= lossThresholds.resetLossCents) return this.clearStopLossWatchdog(entry,freshQ,state);
    if (!state && observedLoss + 1e-9 < lossThresholds.wakeLossCents) return { handled:false };

    const now=Date.now();
    const observedBookMs=Math.max(1,bookMs||n(freshQ?.updatedAtMs,now));
    const currentDrop=Math.max(0,n(entry.entryPriceCents)-bid);
    const refreshProfile=!state||now-n(state.profileUpdatedAtMs)>=60_000;
    const profile=refreshProfile?await this.stopLossWatchdogLearningProfile(entry,bid,{triggerDropCents:state?.recoveryLearningTriggerDropCents??currentDrop,crashBucket:state?.recoveryLearningCrashBucket||null}):(state.profile||null);
    const crash=typeof this.learning?.crashState==='function'?(this.learning.crashState(entry.ticker)||{}):{};

    if(!state){
      state={
        version:STOP_LOSS_WATCHDOG.version,phase:'SLW1_ARMED',armedAtMs:now,lastObservedBookMs:bookFresh?observedBookMs:0,
        observationCount:bookFresh?1:0,lastBidCents:bid,minBidCents:bid,lowerLowCount:0,consecutiveDown:0,
        stableObservations:1,upwardTicks:0,reboundFromTroughCents:0,currentLossCents:observedLoss,peakLossCents:observedLoss,
        optimisticLossCents:optimisticLoss,executableLossCents:executableFull?executableLoss:null,executableFull,bookFresh,
        structureStrong:false,profile,profileUpdatedAtMs:now,
        stakeNormalization:{...lossThresholds},
        recoveryLearningTriggerDropCents:currentDrop,recoveryLearningCrashBucket:String(profile?.crashBucket||'UNKNOWN'),recoveryLearningGameMinutesAtEntry:gameMinutesAtHunterEntry(entry),recoveryLearningEpisodeVersion:null,recoveryLearningCoverageKind:'causal_from_trigger',crash:{phase:String(crash.phase||'NORMAL'),lowerLowCount:n(crash.lowerLowCount),reboundCents:n(crash.reboundCents),stableObservations:n(crash.stableObservations),upwardTicks:n(crash.upwardTicks)},
      };
      await this.audit('slw1_armed',{id:entry.id,ticker:entry.ticker,concept:entry.conceptName,bidCents:bid,currentLossCents:observedLoss,wakeLossCents:lossThresholds.wakeLossCents,stakeBasisCents:lossThresholds.basisStakeCents,stakeNormalizationRevision:lossThresholds.policyRevision,executableFull,learningRate:profile?.smoothedRecoveryRate??null,learningObservations:profile?.totalObservations??0,learningSpecificity:profile?.specificity??null,learningEvidenceVersion:profile?.evidenceVersion??STOP_GUARD_RECOVERY_LEARNING.version});
      const learningEpisode=await this.beginStopGuardLearningEpisode(entry,'SLW1',{triggerPriceCents:executableFull?n(exec.avgCents,bid):bid,triggerLossCents:observedLoss,dangerLineCents:danger,crash,coverageKind:'causal_from_trigger',atMs:now});
      if(learningEpisode) state={...state,recoveryLearningEpisodeVersion:STOP_GUARD_RECOVERY_LEARNING.version,recoveryLearningCoverageKind:learningEpisode.coverageKind||'causal_from_trigger'};
    } else if(bookFresh&&observedBookMs>n(state.lastObservedBookMs)){
      const priorBid=n(state.lastBidCents,bid);
      const newLow=bid<n(state.minBidCents,bid);
      const minBid=Math.min(n(state.minBidCents,bid),bid);
      const lowerLowCount=n(state.lowerLowCount)+(newLow?1:0);
      const consecutiveDown=bid<priorBid?n(state.consecutiveDown)+1:bid>priorBid?0:n(state.consecutiveDown);
      const stableObservations=bid>=priorBid?n(state.stableObservations)+1:0;
      const upwardTicks=bid>priorBid?n(state.upwardTicks)+1:bid<priorBid?0:n(state.upwardTicks);
      state={...state,recoveryLearningTriggerDropCents:state.recoveryLearningTriggerDropCents??currentDrop,recoveryLearningCrashBucket:state.recoveryLearningCrashBucket||String(profile?.crashBucket||'UNKNOWN'),recoveryLearningGameMinutesAtEntry:state.recoveryLearningGameMinutesAtEntry??gameMinutesAtHunterEntry(entry),lastObservedBookMs:observedBookMs,observationCount:n(state.observationCount)+1,lastBidCents:bid,minBidCents:minBid,lowerLowCount,consecutiveDown,stableObservations,upwardTicks,reboundFromTroughCents:Math.max(0,bid-minBid),currentLossCents:observedLoss,peakLossCents:Math.max(n(state.peakLossCents),observedLoss),optimisticLossCents:optimisticLoss,executableLossCents:executableFull?executableLoss:null,executableFull,bookFresh,profile,profileUpdatedAtMs:refreshProfile?now:state.profileUpdatedAtMs,crash:{phase:String(crash.phase||'NORMAL'),lowerLowCount:n(crash.lowerLowCount),reboundCents:n(crash.reboundCents),stableObservations:n(crash.stableObservations),upwardTicks:n(crash.upwardTicks)}};
    } else {
      state={...state,recoveryLearningTriggerDropCents:state.recoveryLearningTriggerDropCents??currentDrop,recoveryLearningCrashBucket:state.recoveryLearningCrashBucket||String(profile?.crashBucket||'UNKNOWN'),recoveryLearningGameMinutesAtEntry:state.recoveryLearningGameMinutesAtEntry??gameMinutesAtHunterEntry(entry),currentLossCents:observedLoss,peakLossCents:Math.max(n(state.peakLossCents),observedLoss),optimisticLossCents:optimisticLoss,executableLossCents:executableFull?executableLoss:null,executableFull,bookFresh,profile,profileUpdatedAtMs:refreshProfile?now:state.profileUpdatedAtMs,crash:{phase:String(crash.phase||'NORMAL'),lowerLowCount:n(crash.lowerLowCount),reboundCents:n(crash.reboundCents),stableObservations:n(crash.stableObservations),upwardTicks:n(crash.upwardTicks)}};
    }

    if(state&&state.recoveryLearningEpisodeVersion!==STOP_GUARD_RECOVERY_LEARNING.version){
      // A native R41 trigger remains causal even if its first persistence write
      // transiently fails. Only states that genuinely predate R41 lack the
      // causal marker and are backfilled as partial_from_upgrade.
      const retryCoverage=state.recoveryLearningCoverageKind==='causal_from_trigger'?'causal_from_trigger':'partial_from_upgrade';
      const migratedEpisode=await this.beginStopGuardLearningEpisode(entry,'SLW1',{triggerPriceCents:executableFull?n(exec?.avgCents,bid):bid,triggerLossCents:observedLoss,dangerLineCents:danger,crash,coverageKind:retryCoverage,atMs:now});
      if(migratedEpisode) state={...state,recoveryLearningEpisodeVersion:STOP_GUARD_RECOVERY_LEARNING.version,recoveryLearningCoverageKind:migratedEpisode.coverageKind||retryCoverage};
    }

    const spreadOk=ask>0&&(ask-bid)<=conceptMaxSpread(settings,entry.conceptName);
    const structureStrong=n(state.reboundFromTroughCents)>=STOP_LOSS_WATCHDOG.minimumReboundCents&&n(state.stableObservations)>=STOP_LOSS_WATCHDOG.minimumStableObservations&&n(state.upwardTicks)>=STOP_LOSS_WATCHDOG.minimumUpwardTicks&&spreadOk;
    const observations=n(profile?.totalObservations);
    const learnedRate=n(profile?.smoothedRecoveryRate,0.5);
    const historicalStrong=observations>=STOP_LOSS_WATCHDOG.minimumLearningObservations&&learnedRate>=STOP_LOSS_WATCHDOG.strongRecoveryRate;
    const historicalWeak=observations>=STOP_LOSS_WATCHDOG.minimumLearningObservations&&learnedRate<=STOP_LOSS_WATCHDOG.weakRecoveryRate;
    const liveDeteriorating=n(state.lowerLowCount)>=STOP_LOSS_WATCHDOG.minimumLowerLowsForDead&&n(state.consecutiveDown)>=STOP_LOSS_WATCHDOG.minimumConsecutiveDownForDead;
    const crashDeteriorating=String(crash.phase||'')==='CRASHING'&&n(crash.lowerLowCount)>=STOP_LOSS_WATCHDOG.crashOverrideLowerLows&&n(crash.reboundCents)<STOP_LOSS_WATCHDOG.minimumReboundCents&&n(crash.upwardTicks)===0;
    state={...state,structureStrong,historicalStrong,historicalWeak,liveDeteriorating,crashDeteriorating};

    if(!bookFresh){
      return this.persistStopLossWatchdog(entry,state,'SLW1_DATA_HOLD',freshQ,{nonBlocking:observationOnly});
    }

    const enoughFresh=n(state.observationCount)>=STOP_LOSS_WATCHDOG.minimumFreshObservations;
    const watchdogAgeMs=Math.max(0,now-n(state.armedAtMs,now));
    const liveOverrideAgeMs=historicalStrong?STOP_LOSS_WATCHDOG.strongHistorySevereGraceMs:STOP_LOSS_WATCHDOG.minimumLiveOverrideAgeMs;
    const weakOverrideAgeMs=historicalWeak?STOP_LOSS_WATCHDOG.weakHistoryGraceMs:liveOverrideAgeMs;
    const learnedDead=enoughFresh&&historicalWeak&&liveDeteriorating&&!structureStrong&&watchdogAgeMs>=STOP_LOSS_WATCHDOG.weakHistoryGraceMs;
    // R41: new Hunter-only history is advisory. Cold-start/unknown evidence is
    // deliberately given the empirically replayed 25-minute recovery window so
    // SLW1 does not collapse back into a disguised tight fixed stop. Strong
    // history may buy five more minutes, while mature weak evidence can shorten
    // the override to five minutes.
    const severeLiveDead=enoughFresh&&observedLoss>=lossThresholds.severeLossCents&&liveDeteriorating&&!structureStrong
      &&watchdogAgeMs>=weakOverrideAgeMs;
    const crashDead=enoughFresh&&observedLoss>=lossThresholds.severeLossCents&&crashDeteriorating&&!structureStrong
      &&watchdogAgeMs>=weakOverrideAgeMs;
    const severeStalled=enoughFresh&&observedLoss>=lossThresholds.severeLossCents&&!structureStrong
      &&n(state.reboundFromTroughCents)<STOP_LOSS_WATCHDOG.minimumReboundCents
      &&watchdogAgeMs>=STOP_LOSS_WATCHDOG.severeStallMs;
    // A near-total executable loss that has remained structurally dead for a
    // long interval must not be kept alive by a prior, even a strong one.
    const catastrophicStalled=enoughFresh&&observedLoss>=lossThresholds.catastrophicLossCents&&!structureStrong
      &&watchdogAgeMs>=STOP_LOSS_WATCHDOG.catastrophicStallMs;
    state={...state,watchdogAgeMs,liveOverrideAgeMs,weakOverrideAgeMs,severeLiveDead,severeStalled,catastrophicStalled};
    if(learnedDead||crashDead||severeLiveDead||severeStalled||catastrophicStalled){
      const reason=learnedDead?'slw1_historical_dead_market'
        :crashDead?'slw1_crash_dead_market'
          :catastrophicStalled?'slw1_catastrophic_stall'
            :severeLiveDead?'slw1_severe_live_deterioration'
              :'slw1_severe_stall';
      const merged={
        version:ULTIMATE_STOP_GUARD.version,phase:'SLW1_EXIT_COMMITTED',armedAtMs:n(state.armedAtMs),dangerLineCents:danger,stopLossCents:stopLoss,
        zone:'EARLY_WATCHDOG',penetrationCents:0,minBidCents:n(state.minBidCents,bid),lastBidCents:bid,lastObservedQuoteMs:n(freshQ?.updatedAtMs,observedBookMs),
        profile,profileUpdatedAtMs:n(state.profileUpdatedAtMs),structureStrong:false,watchdog:state,
      };
      await this.audit('slw1_dead_market_detected',{id:entry.id,ticker:entry.ticker,concept:entry.conceptName,reason,bidCents:bid,currentLossCents:observedLoss,peakLossCents:n(state.peakLossCents),observations:n(state.observationCount),lowerLowCount:n(state.lowerLowCount),consecutiveDown:n(state.consecutiveDown),watchdogAgeMs,historicalStrong,historicalWeak,structureStrong,liveDeteriorating,crashDeteriorating,learningRate:profile?.smoothedRecoveryRate??null,learningObservations:profile?.totalObservations??0,learningEvidenceVersion:profile?.evidenceVersion??STOP_GUARD_RECOVERY_LEARNING.version,crashPhase:String(crash.phase||'NORMAL'),crashLowerLowCount:n(crash.lowerLowCount),observationOnly},'warning');
      if(observationOnly){
        await this.audit('slw1_dead_market_observed_above_aurora',{id:entry.id,ticker:entry.ticker,concept:entry.conceptName,reason,bidCents:bid,dangerLineCents:danger,policy:'OBSERVATION_ONLY_UNTIL_VERIFIED_AURORA_TOUCH'},'warning');
        return this.persistStopLossWatchdog(entry,{...state,deadMarketReason:reason,deadMarketObservedAtMs:now},'SLW1_OBSERVE_ONLY_DEAD',freshQ,{nonBlocking:true});
      }
      return this.commitStopGuardExit(entry,freshQ,merged,reason);
    }

    const recoveryGrace=!structureStrong&&observedLoss>=lossThresholds.severeLossCents&&watchdogAgeMs<weakOverrideAgeMs;
    const guardState=structureStrong?'SLW1_ALIVE':recoveryGrace?(historicalStrong?'SLW1_HISTORY_GRACE':'SLW1_RECOVERY_GRACE'):'SLW1_DANGER';
    return this.persistStopLossWatchdog(entry,state,guardState,freshQ,{nonBlocking:observationOnly});
  }

  async persistStopGuardHold(entry, q, state, guardState) {
    const bid = n(q?.yesBid, n(entry.currentPriceCents));
    const peak = Math.max(n(entry.peakPriceCents, entry.entryPriceCents), bid);
    const persisted = { ...state, phase:guardState, updatedAtMs:Date.now() };
    await this.db.updateEntry(entry.id, {
      currentPriceCents:bid,
      peakPriceCents:peak,
      stopPriceCents:n(state.dangerLineCents),
      stopGuardState:persisted,
      updatedAtMs:Date.now(),
      volume24h:q?.volume24h || entry.volume24h,
    });
    entry.stopGuardState = persisted;
    entry.currentPriceCents = bid;
    entry.peakPriceCents = peak;
    entry.stopPriceCents = n(state.dangerLineCents);
    this.setState(entry, {
      action:'hold',
      guardState,
      currentPriceCents:bid,
      peakPriceCents:peak,
      stopPriceCents:n(state.dangerLineCents),
      hardStopCents:n(state.dangerLineCents),
      stopGuardVersion:ULTIMATE_STOP_GUARD.version,
      stopGuardZone:state.zone,
      stopGuardPenetrationCents:state.penetrationCents,
      stopGuardMinBidCents:state.minBidCents,
      stopGuardReboundCents:state.reboundFromTroughCents,
      stopGuardDeadlineMs:state.deadlineMs,
      stopGuardLearningRate:state.profile?.smoothedRecoveryRate ?? null,
      stopGuardLearningObservations:state.profile?.totalObservations ?? 0,
      stopGuardLearningSpecificity:state.profile?.specificity ?? null,
      stopGuardStructureStrong:Boolean(state.structureStrong),
    });
    return { handled:true, result:{ protected:true, action:'stop_guard', guardState } };
  }

  async commitStopGuardExit(entry, q, state, exitReason) {
    if(isFrozenAuroraEntry(entry)&&!n(state?.auroraTouchVerifiedAtMs)){
      const verification=await this.verifyFrozenAuroraTouch(entry,q,n(state?.dangerLineCents,entry?.entryConfig?.aurora?.dangerPriceCents));
      if(!verification.confirmed){
        await this.audit('aurora_loss_exit_blocked_without_verified_touch',{id:entry.id,ticker:entry.ticker,concept:entry.conceptName,exitReason,dangerLineCents:verification.dangerLineCents,bidCents:verification.bidCents,executableBidCents:verification.executableBidCents,reason:verification.reason},'warning');
        return {handled:true,result:{protected:true,action:'aurora_touch_unverified_hold',guardState:'AURORA_TOUCH_UNVERIFIED'}};
      }
      q=verification.quote||q;
      state={...state,auroraTouchVerifiedAtMs:verification.verifiedAtMs,auroraTouchBookMs:verification.bookMs,auroraTouchBidCents:verification.bidCents,auroraTouchExecutableBidCents:verification.executableBidCents,auroraTouchVerification:'FRESH_EXECUTABLE_BOOK'};
    }
    const bid = n(q?.yesBid, n(entry.currentPriceCents));
    const danger = n(state.dangerLineCents);
    const committedState = {
      ...state,
      phase:'EXIT_COMMITTED',
      exitReason,
      exitCommittedAtMs:Date.now(),
      exitBidCents:bid,
      updatedAtMs:Date.now(),
    };
    await this.db.updateEntry(entry.id, {
      stopGuardState:committedState,
      currentPriceCents:bid,
      stopPriceCents:danger,
      updatedAtMs:Date.now(),
    });
    entry.stopGuardState = committedState;
    const decision = {
      action:'hard_stop',
      exitPriceCents:danger,
      liveExitPriceCents:bid,
      reason:'hard_stop_loss',
      guardState:exitReason === 'emergency_boundary' ? 'USG1_EMERGENCY_EXIT' : 'USG1_EXIT',
      stopPriceCents:danger,
      peakPriceCents:Math.max(n(entry.peakPriceCents, entry.entryPriceCents), bid),
      stopGuardVersion:ULTIMATE_STOP_GUARD.version,
      stopGuardExitReason:exitReason,
      stopGuardZone:state.zone,
      stopGuardPenetrationCents:state.penetrationCents,
      stopGuardLearningRate:state.profile?.smoothedRecoveryRate ?? null,
      stopGuardLearningObservations:state.profile?.totalObservations ?? 0,
    };
    this.setState(entry, decision);
    await this.audit('usg1_exit_committed', {
      id:entry.id, ticker:entry.ticker, concept:entry.conceptName, exitReason,
      dangerLineCents:danger, bidCents:bid, penetrationCents:state.penetrationCents,
      zone:state.zone, armedAtMs:state.armedAtMs, deadlineMs:state.deadlineMs,
      learningRate:state.profile?.smoothedRecoveryRate ?? null,
      learningObservations:state.profile?.totalObservations ?? 0,
      learningSpecificity:state.profile?.specificity ?? null,
      structureStrong:Boolean(state.structureStrong),
    }, exitReason === 'emergency_boundary' ? 'warning' : 'info');
    const out = entry.mode === 'LIVE'
      ? await this.liveExit(entry, decision)
      : await this.simulationExit(entry, decision, q);
    if (out.closed) {
      const fresh = await this.db.entryById(entry.id);
      if (fresh) await this.learning.onHardStop(fresh);
    }
    return { handled:true, result:out };
  }

  async handleUltimateStopGuard(entry, q, settings, rawDecision = null) {
    if (FEEDER_CONCEPTS.has(entry.conceptName) || Boolean(q?.result) || finalMarket(q)) return { handled:false };
    let bid = n(q?.yesBid);
    if (bid <= 0) return { handled:false };

    let state = stopGuardState(entry);
    const stopLoss = stopLossForEntry(entry);
    const configuredDanger = Math.max(0, n(entry.entryPriceCents) - stopLoss);
    const danger = state ? n(state.dangerLineCents, configuredDanger) : configuredDanger;
    const frozenAurora=isFrozenAuroraEntry(entry);
    let touchVerification=null;
    let touched = rawDecision?.action === 'hard_stop' || bid <= danger;
    if(!state&&frozenAurora){
      if(bid>danger+1e-9){
        const watchdog=await this.handleStopLossWatchdog(entry,q,settings,{observationOnly:true});
        if(watchdog.cleared)return watchdog;
        return {handled:false,observed:watchdog.observed===true};
      }
      touchVerification=await this.verifyFrozenAuroraTouch(entry,q,danger);
      if(!touchVerification.confirmed){
        await this.audit('aurora_touch_rejected_unverified',{id:entry.id,ticker:entry.ticker,concept:entry.conceptName,dangerLineCents:danger,observedBidCents:bid,freshBidCents:touchVerification.bidCents,executableBidCents:touchVerification.executableBidCents,bookAgeMs:touchVerification.bookAgeMs,reason:touchVerification.reason},'warning');
        return {handled:true,result:{protected:true,action:'aurora_touch_unverified_hold',guardState:'AURORA_TOUCH_UNVERIFIED'}};
      }
      q=touchVerification.quote||q;
      bid=touchVerification.bidCents;
      touched=true;
    }
    if (!state && !touched) {
      const watchdog = await this.handleStopLossWatchdog(entry, q, settings);
      if (watchdog.handled || watchdog.cleared) return watchdog;
      return { handled:false };
    }

    const now = Date.now();
    const observedMs = Math.max(1, n(q?.updatedAtMs, now));
    const penetrationCents = Math.max(0, danger - bid);
    const zone = stopGuardZone(penetrationCents);
    const currentDropCents=Math.max(0,n(entry.entryPriceCents)-bid);
    const refreshProfile = !state || now - n(state.profileUpdatedAtMs) >= 60_000;
    const profile = refreshProfile
      ? await this.stopGuardLearningProfile(entry,bid,penetrationCents,{triggerDropCents:state?.recoveryLearningTriggerDropCents??currentDropCents,crashBucket:state?.recoveryLearningCrashBucket||null})
      : (state.profile || null);

    if (!state) {
      const baseWindowMs = adaptiveStopGuardWindowMs(profile);
      state = {
        version:ULTIMATE_STOP_GUARD.version,
        phase:'USG1_ARMED',
        armedAtMs:now,
        dangerLineCents:danger,
        stopLossCents:stopLoss,
        baseWindowMs,
        deadlineMs:now + baseWindowMs,
        minBidCents:bid,
        lastBidCents:bid,
        lastObservedQuoteMs:observedMs,
        maxPenetrationCents:penetrationCents,
        penetrationCents,
        zone,
        criticalEnteredAtMs:zone === 'CRITICAL' ? now : null,
        stableObservations:1,
        upwardTicks:0,
        reclaimConfirmations:0,
        extensionUsed:false,
        reboundFromTroughCents:0,
        structureStrong:false,
        profile,
        profileUpdatedAtMs:now,
        recoveryLearningTriggerDropCents:currentDropCents,
        recoveryLearningCrashBucket:String(profile?.crashBucket||'UNKNOWN'),
        recoveryLearningGameMinutesAtEntry:gameMinutesAtHunterEntry(entry),
        recoveryLearningEpisodeVersion:null,
        recoveryLearningCoverageKind:'causal_from_trigger',
        watchdog:stopLossWatchdogState(entry) || entry?.stopGuardState?.watchdog || null,
        ...(touchVerification?.confirmed?{auroraTouchVerifiedAtMs:touchVerification.verifiedAtMs,auroraTouchBookMs:touchVerification.bookMs,auroraTouchBidCents:touchVerification.bidCents,auroraTouchExecutableBidCents:touchVerification.executableBidCents,auroraTouchVerification:'FRESH_EXECUTABLE_BOOK'}:{}),
      };
      await this.audit('usg1_armed', {
        id:entry.id, ticker:entry.ticker, concept:entry.conceptName,
        dangerLineCents:danger, bidCents:bid, penetrationCents,
        baseWindowMs, deadlineMs:state.deadlineMs,
        learningRate:profile?.smoothedRecoveryRate ?? null,
        learningObservations:profile?.totalObservations ?? 0,
        learningSpecificity:profile?.specificity ?? null,
        learningEvidenceVersion:profile?.evidenceVersion ?? STOP_GUARD_RECOVERY_LEARNING.version,
        auroraTouchVerified:frozenAurora?Boolean(state.auroraTouchVerifiedAtMs):null,
      });
      const learningEpisode=await this.beginStopGuardLearningEpisode(entry,'USG1',{triggerPriceCents:bid,triggerLossCents:Math.max(0,-n(this.aggregateExecutableNetCents(entry,Math.max(1,remainingCount(entry)),bid,settings))),dangerLineCents:danger,coverageKind:'causal_from_trigger',atMs:now});
      if(learningEpisode) state={...state,recoveryLearningEpisodeVersion:STOP_GUARD_RECOVERY_LEARNING.version,recoveryLearningCoverageKind:learningEpisode.coverageKind||'causal_from_trigger'};
    } else {
      const previousZone = state.zone;
      const freshObservation = observedMs > n(state.lastObservedQuoteMs);
      let minBid = n(state.minBidCents, bid);
      let stable = n(state.stableObservations, 0);
      let upward = n(state.upwardTicks, 0);
      let reclaim = n(state.reclaimConfirmations, 0);
      if (freshObservation) {
        const priorBid = n(state.lastBidCents, bid);
        if (bid < minBid) minBid = bid;
        stable = bid >= priorBid ? stable + 1 : 0;
        upward = bid > priorBid ? upward + 1 : bid < priorBid ? 0 : upward;
        reclaim = bid >= danger + ULTIMATE_STOP_GUARD.reclaimBufferCents ? reclaim + 1 : 0;
      }
      const maxPenetration = Math.max(n(state.maxPenetrationCents), penetrationCents);
      let deadlineMs = n(state.deadlineMs, n(state.armedAtMs) + n(state.baseWindowMs, ULTIMATE_STOP_GUARD.defaultRecoveryWindowMs));
      if (maxPenetration > n(state.maxPenetrationCents)) {
        const zoneBase = adaptiveStopGuardWindowMs(profile);
        const zoneWindow = Math.max(ULTIMATE_STOP_GUARD.reclaimExtensionMs, zoneBase * stopGuardWindowFactor(penetrationCents));
        deadlineMs = Math.min(deadlineMs, n(state.armedAtMs) + zoneWindow);
      }
      state = {
        ...state,
        deadlineMs,
        minBidCents:minBid,
        lastBidCents:freshObservation ? bid : state.lastBidCents,
        lastObservedQuoteMs:freshObservation ? observedMs : state.lastObservedQuoteMs,
        maxPenetrationCents:maxPenetration,
        penetrationCents,
        zone,
        criticalEnteredAtMs:zone === 'CRITICAL' ? (n(state.criticalEnteredAtMs) || now) : null,
        stableObservations:stable,
        upwardTicks:upward,
        reclaimConfirmations:reclaim,
        reboundFromTroughCents:Math.max(0, bid - minBid),
        profile,
        profileUpdatedAtMs:refreshProfile ? now : state.profileUpdatedAtMs,
        recoveryLearningTriggerDropCents:state.recoveryLearningTriggerDropCents??currentDropCents,
        recoveryLearningCrashBucket:state.recoveryLearningCrashBucket||String(profile?.crashBucket||'UNKNOWN'),
        recoveryLearningGameMinutesAtEntry:state.recoveryLearningGameMinutesAtEntry??gameMinutesAtHunterEntry(entry),
      };
      if (previousZone !== zone) {
        await this.audit('usg1_zone_changed', {
          id:entry.id, ticker:entry.ticker, from:previousZone, to:zone,
          bidCents:bid, penetrationCents, deadlineMs,
          learningRate:profile?.smoothedRecoveryRate ?? null,
          learningObservations:profile?.totalObservations ?? 0,
        });
      }
    }

    if(state&&state.recoveryLearningEpisodeVersion!==STOP_GUARD_RECOVERY_LEARNING.version){
      const retryCoverage=state.recoveryLearningCoverageKind==='causal_from_trigger'?'causal_from_trigger':'partial_from_upgrade';
      const migratedEpisode=await this.beginStopGuardLearningEpisode(entry,'USG1',{triggerPriceCents:bid,triggerLossCents:Math.max(0,-n(this.aggregateExecutableNetCents(entry,Math.max(1,remainingCount(entry)),bid,settings))),dangerLineCents:danger,coverageKind:retryCoverage,atMs:now});
      if(migratedEpisode) state={...state,recoveryLearningEpisodeVersion:STOP_GUARD_RECOVERY_LEARNING.version,recoveryLearningCoverageKind:migratedEpisode.coverageKind||retryCoverage};
    }

    if (observedMs > n(state.lastObservedQuoteMs) && bid >= danger + ULTIMATE_STOP_GUARD.reclaimBufferCents) {
      // This branch is retained for defensive compatibility with a state that
      // was persisted by an earlier R15 build before lastObservedQuoteMs moved.
      state.reclaimConfirmations = n(state.reclaimConfirmations) + 1;
      state.lastObservedQuoteMs = observedMs;
      state.lastBidCents = bid;
    }

    if (n(state.reclaimConfirmations) >= ULTIMATE_STOP_GUARD.reclaimConfirmations) {
      const retainedWatchdog = state.watchdog && state.watchdog.version === STOP_LOSS_WATCHDOG.version ? state.watchdog : null;
      await this.db.updateEntry(entry.id, {
        stopGuardState:retainedWatchdog ? { watchdog:retainedWatchdog } : {},
        currentPriceCents:bid,
        peakPriceCents:Math.max(n(entry.peakPriceCents, entry.entryPriceCents), bid),
        stopPriceCents:danger,
        updatedAtMs:now,
      });
      entry.stopGuardState = retainedWatchdog ? { watchdog:retainedWatchdog } : {};
      await this.audit('usg1_recovered', {
        id:entry.id, ticker:entry.ticker, concept:entry.conceptName,
        dangerLineCents:danger, bidCents:bid, armedAtMs:state.armedAtMs,
        recoveredAfterMs:Math.max(0, now - n(state.armedAtMs)),
        maxPenetrationCents:state.maxPenetrationCents,
      });
      return { handled:false, cleared:true };
    }

    if (zone === 'EMERGENCY') return this.commitStopGuardExit(entry, q, state, 'emergency_boundary');

    let executableFull = false;
    let executableAvgCents = null;
    let spreadOk = (n(q?.yesAsk) - bid) <= conceptMaxSpread(settings, entry.conceptName);
    const qty=Math.max(1,remainingCount(entry));
    const lossThresholds=this.stopLossWatchdogThresholds(entry);
    const optimisticEconomicNet=this.aggregateExecutableNetCents(entry,qty,bid,settings);
    const optimisticEconomicLoss=optimisticEconomicNet==null?0:Math.max(0,-optimisticEconomicNet);
    const retainedWatchdog=state.watchdog&&state.watchdog.version===STOP_LOSS_WATCHDOG.version?state.watchdog:null;
    const economicProbeRequired=optimisticEconomicLoss>=lossThresholds.severeLossCents
      ||n(retainedWatchdog?.peakLossCents)>=lossThresholds.severeLossCents;
    if (zone !== 'RECOVERY' || now >= n(state.deadlineMs) || economicProbeRequired) {
      await this.market.ensureFreshBook(entry.ticker, STOP_LOSS_WATCHDOG.maximumBookAgeMs).catch(() => null);
      const freshQ = this.market.getQuote(entry.ticker) || q;
      const freshBid = n(freshQ?.yesBid, bid);
      spreadOk = n(freshQ?.yesAsk) > 0 && (n(freshQ.yesAsk) - freshBid) <= conceptMaxSpread(settings, entry.conceptName);
      const book=this.market.getBook?.(entry.ticker);
      const bookMs=n(book?.updatedAtMs,n(freshQ?.updatedAtMs));
      const bookAge=bookMs>0?now-bookMs:Infinity;
      const bookFresh=Boolean(book&&bookMs>0&&bookAge>=-STOP_LOSS_WATCHDOG.maximumFutureBookSkewMs&&bookAge<=STOP_LOSS_WATCHDOG.maximumBookAgeMs&&!freshQ?.bookInvalid);
      const exec = bookFresh?this.market.executableBid?.(entry.ticker, qty, 1):null;
      executableFull = Boolean(exec?.full && n(exec.filled) + 1e-9 >= qty && n(exec.avgCents) > 0);
      executableAvgCents = executableFull ? n(exec.avgCents) : null;
    }

    const structureStrong = n(state.reboundFromTroughCents) >= ULTIMATE_STOP_GUARD.minimumReboundCents
      && n(state.stableObservations) >= ULTIMATE_STOP_GUARD.minimumStableObservations
      && n(state.upwardTicks) >= ULTIMATE_STOP_GUARD.minimumUpwardTicks
      && spreadOk
      && (zone === 'RECOVERY' || executableFull);
    state.structureStrong = structureStrong;
    state.executableFull = executableFull;
    state.executableAvgCents = executableAvgCents;

    if(executableFull){
      const executableEconomicNet=this.aggregateExecutableNetCents(entry,qty,executableAvgCents,settings);
      const executableEconomicLoss=executableEconomicNet==null?0:Math.max(0,-executableEconomicNet);
      const lossAgeMs=Math.max(0,now-n(retainedWatchdog?.armedAtMs,state.armedAtMs));
      const watchdogLiveDeteriorating=Boolean(retainedWatchdog?.liveDeteriorating)
        ||(n(retainedWatchdog?.lowerLowCount)>=STOP_LOSS_WATCHDOG.minimumLowerLowsForDead&&n(retainedWatchdog?.consecutiveDown)>=STOP_LOSS_WATCHDOG.minimumConsecutiveDownForDead);
      const historyObservations=n(profile?.totalObservations);const historyRate=n(profile?.smoothedRecoveryRate,0.5);
      const historyStrong=historyObservations>=STOP_LOSS_WATCHDOG.minimumLearningObservations&&historyRate>=STOP_LOSS_WATCHDOG.strongRecoveryRate;
      const historyWeak=historyObservations>=STOP_LOSS_WATCHDOG.minimumLearningObservations&&historyRate<=STOP_LOSS_WATCHDOG.weakRecoveryRate;
      const economicOverrideAgeMs=historyWeak?STOP_LOSS_WATCHDOG.weakHistoryGraceMs:historyStrong?STOP_LOSS_WATCHDOG.strongHistorySevereGraceMs:STOP_LOSS_WATCHDOG.minimumLiveOverrideAgeMs;
      const economicSevereLiveDead=executableEconomicLoss>=lossThresholds.severeLossCents&&!structureStrong&&watchdogLiveDeteriorating
        &&lossAgeMs>=economicOverrideAgeMs;
      const economicSevereStalled=executableEconomicLoss>=lossThresholds.severeLossCents&&!structureStrong
        &&n(state.reboundFromTroughCents)<ULTIMATE_STOP_GUARD.minimumReboundCents&&lossAgeMs>=STOP_LOSS_WATCHDOG.severeStallMs;
      const economicCatastrophicStalled=executableEconomicLoss>=lossThresholds.catastrophicLossCents&&!structureStrong
        &&lossAgeMs>=STOP_LOSS_WATCHDOG.catastrophicStallMs;
      state={...state,executableEconomicLossCents:executableEconomicLoss,lossAgeMs,economicOverrideAgeMs,economicSevereLiveDead,economicSevereStalled,economicCatastrophicStalled,stakeNormalization:{...lossThresholds}};
      if(economicSevereLiveDead||economicSevereStalled||economicCatastrophicStalled){
        const reason=economicCatastrophicStalled?'economic_catastrophic_stall':economicSevereStalled?'economic_severe_stall':'economic_severe_live_deterioration';
        await this.audit('usg1_economic_dead_market_detected',{id:entry.id,ticker:entry.ticker,concept:entry.conceptName,reason,zone,bidCents:bid,executableAvgCents,economicLossCents:executableEconomicLoss,lossAgeMs,structureStrong,watchdogLiveDeteriorating,stakeBasisCents:lossThresholds.basisStakeCents,severeLossCents:lossThresholds.severeLossCents,catastrophicLossCents:lossThresholds.catastrophicLossCents,stakeNormalizationRevision:lossThresholds.policyRevision,learningRate:profile?.smoothedRecoveryRate??null,learningObservations:profile?.totalObservations??0,learningEvidenceVersion:profile?.evidenceVersion??STOP_GUARD_RECOVERY_LEARNING.version},'warning');
        return this.commitStopGuardExit(entry,q,state,reason);
      }
    }

    let criticalProbe = false;
    if (zone === 'CRITICAL') {
      const observations = n(profile?.totalObservations);
      const learnedRate = n(profile?.smoothedRecoveryRate,0.5);
      const historyReady = observations >= ULTIMATE_STOP_GUARD.minimumLearningObservations;
      const historicalWeak = historyReady && learnedRate < ULTIMATE_STOP_GUARD.minimumCriticalRecoveryRate;
      // R41: historical evidence is advisory. Mature weak Hunter-only evidence
      // can accelerate a structurally dead exit, but strong/unknown history can
      // no longer override the bounded live structure grace.
      if (historicalWeak && !structureStrong) return this.commitStopGuardExit(entry, q, state, 'critical_learning_failed');
      if (!structureStrong) {
        const criticalAgeMs = Math.max(0, now - n(state.criticalEnteredAtMs, now));
        if (criticalAgeMs >= ULTIMATE_STOP_GUARD.criticalStructureGraceMs) {
          return this.commitStopGuardExit(entry, q, state, 'critical_structure_failed');
        }
        criticalProbe = true;
      }
    }

    if (now >= n(state.deadlineMs)) {
      const reclaiming = structureStrong && bid > n(state.minBidCents);
      if (!state.extensionUsed && reclaiming) {
        state.extensionUsed = true;
        state.deadlineMs = now + ULTIMATE_STOP_GUARD.reclaimExtensionMs;
        await this.audit('usg1_deadline_extended', {
          id:entry.id, ticker:entry.ticker, zone:state.zone, bidCents:bid,
          reboundCents:state.reboundFromTroughCents, deadlineMs:state.deadlineMs,
        });
      } else {
        return this.commitStopGuardExit(entry, q, state, state.extensionUsed ? 'recovery_extension_expired' : 'recovery_clock_expired');
      }
    }

    const guardState = bid > danger
      ? 'USG1_RECLAIMING'
      : zone === 'RECOVERY'
        ? 'USG1_RECOVERY_ZONE'
        : zone === 'STRESSED'
          ? 'USG1_STRESSED_ZONE'
          : criticalProbe ? 'USG1_CRITICAL_PROBE' : 'USG1_CRITICAL_ZONE';
    return this.persistStopGuardHold(entry, q, state, guardState);
  }

  async refreshProtectionQuote(entry) {
    let q = this.market.getQuote(entry.ticker);
    const age = this.market.quoteAgeMs(entry.ticker);
    const needsRefresh = !q || q.bookInvalid || age > QUOTE_STALE_MS || n(q.yesBid) <= 0 || Boolean(q.result);
    if (needsRefresh) {
      const refreshed = await this.market.refreshTicker(entry.ticker).catch(() => null);
      if (refreshed) q = refreshed;
    }
    if (!q) return null;
    if (!finalMarket(q) && this.market.quoteAgeMs(entry.ticker) > QUOTE_STALE_MS) return null;
    if (q.bookInvalid && !finalMarket(q)) return null;
    return q;
  }

  researchPrice(entry, q, count = remainingCount(entry), { requireFull = false } = {}) {
    if (finalMarket(q)) return String(q.result).toLowerCase() === 'yes' ? 100 : 0;
    const bid = n(q?.yesBid);
    if (bid <= 0) return null;
    // Prefer a full-position executable liquidation VWAP when the native YES
    // book contains enough depth. Otherwise retain the observed best bid rather
    // than fabricating depth that was not present.
    const hasExecutableBook = typeof this.market.executableBid === 'function';
    const exec = this.market.executableBid?.(entry.ticker, Math.max(1, count), 1);
    if (exec?.full && n(exec.avgCents) > 0) return Math.round(n(exec.avgCents));
    if (requireFull && hasExecutableBook) return null;
    return Math.round(bid);
  }

  async updateMae(entry, q) {
    if (FEEDER_CONCEPTS.has(entry.conceptName)) return entry;
    const price = this.researchPrice(entry, q);
    if (price == null) return entry;
    const prior = entry.lowestPriceAfterEntryCents == null ? null : n(entry.lowestPriceAfterEntryCents);
    if (prior != null && price >= prior) return entry;
    const observedAtMs = n(q?.updatedAtMs, Date.now());
    const patch = {
      lowestPriceAfterEntryCents: price,
      maeCents: Math.max(0, n(entry.entryPriceCents) - price),
      maeAtMs: observedAtMs,
    };
    await this.db.updateEntry(entry.id, patch);
    Object.assign(entry, patch);
    return entry;
  }

  minimumPositiveProfitPriceCents(entry, count, settings, minimumNetProfitPerContractCents = ULTIMATE_PROFIT_GUARD.minimumNetProfitPerContractCents) {
    const qty = Math.max(1e-9, n(count));
    const originalQty = Math.max(qty, n(entry.count, qty));
    const entryFee = allocatedEntryFee(entry, qty, settings);
    const expectedExitFee = n(settings.simFeeCents) * qty;
    // The +net covenant belongs to the original Hunter allocation, not merely
    // whatever quantity happens to remain after a partial IOC. Otherwise each
    // partial fill would silently shrink the required total profit and could
    // let the final aggregate trade close below +1c per original contract.
    const requiredNetTotal = n(minimumNetProfitPerContractCents) * originalQty;
    const requiredDelta = (requiredNetTotal - n(entry.pnlCents) + entryFee + expectedExitFee) / qty;
    return clamp(Math.ceil(n(entry.entryPriceCents) + requiredDelta - 1e-9), 0, 100);
  }

  economicBreakEvenPriceCents(entry, count, settings) {
    const qty = Math.max(1e-9, n(count));
    const entryFee = allocatedEntryFee(entry, qty, settings);
    const expectedExitFee = n(settings.simFeeCents) * qty;
    // pnlCents contains any already-realized partial-exit P/L. The remaining
    // liquidation price must therefore cover that accumulated result plus the
    // remaining allocated entry fee and expected exit fee. Ceil is deliberate:
    // a rounded-down cent could label a negative-net liquidation as break-even.
    const requiredDelta = (-n(entry.pnlCents) + entryFee + expectedExitFee) / qty;
    return clamp(Math.ceil(n(entry.entryPriceCents) + requiredDelta - 1e-9), 0, 100);
  }


  aggregateExecutableNetCents(entry, count, executableBidCents, settings) {
    const qty = Math.max(0, n(count));
    if (qty <= 1e-9 || !Number.isFinite(Number(executableBidCents))) return null;
    const entryFee = allocatedEntryFee(entry, qty, settings);
    const expectedExitFee = n(settings.simFeeCents) * qty;
    return n(entry.pnlCents) + (n(executableBidCents) - n(entry.entryPriceCents)) * qty - entryFee - expectedExitFee;
  }

  priceForAggregateNetTargetCents(entry, count, settings, targetNetCents = 0) {
    const qty = Math.max(1e-9, n(count));
    const entryFee = allocatedEntryFee(entry, qty, settings);
    const expectedExitFee = n(settings.simFeeCents) * qty;
    const requiredDelta = (n(targetNetCents) - n(entry.pnlCents) + entryFee + expectedExitFee) / qty;
    return clamp(Math.ceil(n(entry.entryPriceCents) + requiredDelta - 1e-9), 0, 100);
  }


  fullPositionCounterfactualNetCents(entry, priceCents, settings, { settlement = false } = {}) {
    const qty = Math.max(0, n(entry.count));
    if (qty <= 1e-9 || !Number.isFinite(Number(priceCents))) return null;
    const entryFee = totalEntryFee(entry, settings);
    const exitFee = settlement ? 0 : String(entry?.mode||'SIMULATION').toUpperCase()==='LIVE'
      ? Math.max(n(settings.simFeeCents)*qty,kalshiGeneralTakerFeeEstimateCents({count:qty,priceCents:n(priceCents)}))
      : n(settings.simFeeCents) * qty;
    return (n(priceCents) - n(entry.entryPriceCents)) * qty - entryFee - exitFee;
  }

  isProtectedRunnerTrade(entry) {
    return isProtectedRunnerTradeEntry(entry);
  }

  isProtectedRunnerR2Trade(entry) {
    return isProtectedRunnerR2TradeEntry(entry);
  }

  isProtectedRunnerExitDecision(entry, decision) {
    if (String(decision?.reason || '') !== 'protected_runner_intelligence') return false;
    return this.isProtectedRunnerTrade(entry)
      || String(decision?.protectedRunnerIntelligence || '') === PROTECTED_RUNNER_INTELLIGENCE.version;
  }

  isAthenaExitTrade(entry) {
    return isAthenaExitTradeEntry(entry);
  }
  isGoldenEyeTrade(entry) {
    return isGoldenEyeTradeEntry(entry);
  }

  isInfinityBreakTrade(entry) {
    if (!entry || FEEDER_CONCEPTS.has(entry.conceptName)) return false;
    return String(entry?.entryConfig?.infinityBreak?.version || '') === INFINITY_BREAK.version;
  }

  isInfinityBreakExitDecision(entry, decision) {
    if (String(decision?.reason || '') !== 'infinity_break') return false;
    return this.isInfinityBreakTrade(entry) || String(decision?.infinityBreak || '') === INFINITY_BREAK.version;
  }

  isAtomicThunderTrade(entry) {
    if (!entry || FEEDER_CONCEPTS.has(entry.conceptName)) return false;
    return String(entry?.entryConfig?.atomicThunder?.version || '') === ATOMIC_THUNDER.version;
  }

  isAtomicThunderExitDecision(entry, decision) {
    if (this.isInfinityBreakExitDecision(entry,decision)) return true;
    if (String(decision?.reason || '') !== 'atomic_thunder_cashout') return false;
    return this.isAtomicThunderTrade(entry)
      || String(decision?.atomicThunder || '') === ATOMIC_THUNDER.version;
  }

  atomicThunderPolicy(entry, settings = this.getSettings()) {
    if (this.isInfinityBreakTrade(entry)) {
      const frozen=entry?.entryConfig?.infinityBreak||{};
      const scarletHandoff=String(entry?.conceptName||'')==='Scarlet Needle';
      const scarletNet=Number(SCARLET_NEEDLE.handoffInfinityNetPerContractCents||1);
      return {
        enabled:frozen?.enabledAtEntry!==false,
        minimumNetPerOriginalContractCents:Math.max(0.01,scarletHandoff?scarletNet:n(frozen?.minimumNetPerOriginalContractCents,INFINITY_BREAK.defaultMinimumNetPerOriginalContractCents)),
        requiredFreshConfirmations:Math.max(1,Math.floor(n(frozen?.requiredFreshConfirmations,INFINITY_BREAK.defaultRequiredFreshConfirmations))),
        maximumBookAgeMs:Math.max(100,Math.floor(n(frozen?.maximumBookAgeMs,INFINITY_BREAK.defaultMaximumBookAgeMs))),
        confirmationWindowMs:Math.max(250,Math.floor(n(frozen?.confirmationWindowMs,INFINITY_BREAK.defaultConfirmationWindowMs))),
        authority:INFINITY_BREAK.version,policyRevision:INFINITY_BREAK.policyRevision,
      };
    }
    const frozen = entry?.entryConfig?.atomicThunder;
    const enabled = this.isAtomicThunderTrade(entry) && frozen?.enabledAtEntry !== false;
    const minimumNetPerOriginalContractCents = Math.max(0.01, n(frozen?.minimumNetPerOriginalContractCents, ATOMIC_THUNDER.minimumNetPerOriginalContractCents));
    const requiredFreshConfirmations = Math.max(1, Math.floor(n(frozen?.requiredFreshConfirmations, ATOMIC_THUNDER.requiredFreshConfirmations)));
    const maximumBookAgeMs = Math.max(100, Math.floor(n(frozen?.maximumBookAgeMs, ATOMIC_THUNDER.maximumBookAgeMs)));
    const confirmationWindowMs = Math.max(250, Math.floor(n(frozen?.confirmationWindowMs, ATOMIC_THUNDER.confirmationWindowMs)));
    return { enabled, minimumNetPerOriginalContractCents, requiredFreshConfirmations, maximumBookAgeMs, confirmationWindowMs, authority:ATOMIC_THUNDER.version, policyRevision:ATOMIC_THUNDER.policyRevision };
  }

  atomicThunderTargetNetCents(entry, settings = this.getSettings()) {
    const policy = this.atomicThunderPolicy(entry, settings);
    return policy.minimumNetPerOriginalContractCents * Math.max(0, n(entry?.count));
  }

  atomicThunderExitFloorCents(entry, settings = this.getSettings()) {
    return this.priceForAggregateNetTargetCents(entry, remainingCount(entry), settings, this.atomicThunderTargetNetCents(entry, settings));
  }

  async recordAtomicThunderEvent(entry, eventType, data = {}, eventSuffix = '') {
    if (this.isInfinityBreakTrade(entry)) { await this.audit(`infinity_break_${eventType}`,{id:entry?.id||null,ticker:entry?.ticker||null,...(data||{})}).catch(()=>{}); return true; }
    if (typeof this.db?.recordAtomicThunderEvent !== 'function' || !entry?.id) return false;
    const suffix = eventSuffix ? `:${eventSuffix}` : '';
    const systemName = entry.systemName || this.getSettings()?.systemName || 'SAGITTARIUS';
    const eventKey = `${systemName}:${ATOMIC_THUNDER.version}:${entry.id}:${eventType}${suffix}`;
    return this.db.recordAtomicThunderEvent({
      eventKey, systemName, hunterId:entry.id, ticker:entry.ticker, eventType, atMs:Date.now(),
      data:{ version:ATOMIC_THUNDER.version, policyRevision:ATOMIC_THUNDER.policyRevision, ...(data || {}) },
    }).catch(() => false);
  }

  async resetAtomicThunderConfirmation(entry, reason, extra = {}) {
    const prior = this.atomicThunderStates.get(entry.id);
    if (!prior || n(prior.confirmations) <= 0) return;
    this.atomicThunderStates.delete(entry.id);
    await this.recordAtomicThunderEvent(entry, 'confirmation_reset', {
      reason, priorConfirmations:n(prior.confirmations), lastEvidenceMs:n(prior.lastEvidenceMs), ...extra,
    }, `${n(prior.lastEvidenceMs)}:${reason}`);
  }

  atomicThunderTelemetry(entry, assessment = null) {
    const state=this.atomicThunderStates.get(entry?.id)||{},a=assessment||{},isInfinity=this.isInfinityBreakTrade(entry);
    const authority=isInfinity?INFINITY_BREAK.version:ATOMIC_THUNDER.version;
    const revision=isInfinity?INFINITY_BREAK.policyRevision:ATOMIC_THUNDER.policyRevision;
    const prefix=isInfinity?'INFINITY_BREAK':'ATOMIC_THUNDER';
    const out={profitAuthority:authority,profitAuthorityPolicyRevision:revision,profitHarvestState:a.triggered?`${prefix}_READY`:n(state.confirmations)>0?'PROFIT_CONFIRMING':'OBSERVING',profitHarvestConfirmations:n(state.confirmations),profitHarvestRequiredConfirmations:n(a.policy?.requiredFreshConfirmations,n(state.requiredFreshConfirmations,2)),profitHarvestExecutableNetCents:Number.isFinite(Number(a.executableNetCents))?n(a.executableNetCents):null,profitHarvestTargetNetCents:Number.isFinite(Number(a.targetNetCents))?n(a.targetNetCents):null,profitHarvestExitFloorCents:Number.isFinite(Number(a.exitFloorCents))?n(a.exitFloorCents):null,profitHarvestExecutableBidCents:Number.isFinite(Number(a.executableBidCents))?n(a.executableBidCents):null};
    if(isInfinity)return{...out,infinityBreak:INFINITY_BREAK.version,infinityBreakPolicyRevision:INFINITY_BREAK.policyRevision,infinityBreakState:out.profitHarvestState,infinityBreakConfirmations:out.profitHarvestConfirmations,infinityBreakRequiredConfirmations:out.profitHarvestRequiredConfirmations,infinityBreakExecutableNetCents:out.profitHarvestExecutableNetCents,infinityBreakTargetNetCents:out.profitHarvestTargetNetCents,infinityBreakExitFloorCents:out.profitHarvestExitFloorCents,infinityBreakExecutableBidCents:out.profitHarvestExecutableBidCents};
    return{...out,atomicThunder:ATOMIC_THUNDER.version,atomicThunderPolicyRevision:ATOMIC_THUNDER.policyRevision,atomicThunderState:out.profitHarvestState,atomicThunderConfirmations:out.profitHarvestConfirmations,atomicThunderRequiredConfirmations:out.profitHarvestRequiredConfirmations,atomicThunderExecutableNetCents:out.profitHarvestExecutableNetCents,atomicThunderTargetNetCents:out.profitHarvestTargetNetCents,atomicThunderExitFloorCents:out.profitHarvestExitFloorCents,atomicThunderExecutableBidCents:out.profitHarvestExecutableBidCents};
  }

  async evaluateAtomicThunder(entry, q, settings) {
    const policy = this.atomicThunderPolicy(entry, settings);
    if (!policy.enabled) {
      this.atomicThunderStates.delete(entry?.id);
      return { eligible:false, triggered:false, policy, q };
    }

    await this.recordAtomicThunderEvent(entry, 'observing', {
      concept:entry.conceptName, sourceFeeder:entry.sourceFeeder || null,
      minimumNetPerOriginalContractCents:policy.minimumNetPerOriginalContractCents,
      requiredFreshConfirmations:policy.requiredFreshConfirmations,
    });

    const remain = remainingCount(entry);
    if (remain <= 1e-9) return { eligible:true, triggered:false, policy, q, reason:'no_remaining_position' };

    await this.market.ensureFreshBook(entry.ticker, policy.maximumBookAgeMs).catch(() => null);
    const freshQ = this.market.getQuote(entry.ticker) || q;
    const book = this.market.getBook?.(entry.ticker);
    const bookMs = n(book?.updatedAtMs);
    const quoteMs = n(freshQ?.updatedAtMs, bookMs);
    const now = Date.now();
    const bookAgeMs = bookMs > 0 ? now - bookMs : Infinity;
    const quoteAgeMs = quoteMs > 0 ? now - quoteMs : Infinity;
    const bid = n(freshQ?.yesBid);
    const ask = n(freshQ?.yesAsk);
    const validFresh = Boolean(
      book && bookMs > 0 && bookAgeMs >= -STOP_LOSS_WATCHDOG.maximumFutureBookSkewMs && bookAgeMs <= policy.maximumBookAgeMs
      && quoteMs > 0 && quoteAgeMs >= -STOP_LOSS_WATCHDOG.maximumFutureBookSkewMs && quoteAgeMs <= Math.max(1000,policy.maximumBookAgeMs)
      && !freshQ?.bookInvalid && bid > 0 && (ask <= 0 || bid <= ask)
    );
    if (!validFresh) {
      await this.resetAtomicThunderConfirmation(entry, 'stale_or_invalid_book', { bookAgeMs, quoteAgeMs, bidCents:bid });
      if (bid > n(entry.entryPriceCents)) await this.recordAtomicThunderEvent(entry, 'invalid_opportunity_blocked', { reason:'stale_or_invalid_book', bidCents:bid, bookAgeMs, quoteAgeMs }, 'stale_or_invalid_book');
      return { eligible:true, triggered:false, policy, q:freshQ, reason:'stale_or_invalid_book', bookMs, bookAgeMs, quoteAgeMs };
    }

    const targetNetCents = this.atomicThunderTargetNetCents(entry, settings);
    const exitFloorCents = this.atomicThunderExitFloorCents(entry, settings);
    const exec = this.market.executableBid?.(entry.ticker, remain, 1) || null;
    const fullExecutable = Boolean(exec?.full && n(exec?.filled) + 1e-9 >= remain && n(exec?.avgCents) > 0);
    const executableBidCents = fullExecutable ? n(exec.avgCents) : null;
    const executableNetCents = fullExecutable ? this.aggregateExecutableNetCents(entry, remain, executableBidCents, settings) : null;
    const qualifies = fullExecutable && n(executableNetCents, -Infinity) + 1e-9 >= targetNetCents;

    if (!qualifies) {
      const prior = this.atomicThunderStates.get(entry.id);
      if (prior?.confirmations) await this.resetAtomicThunderConfirmation(entry, 'profit_window_lost', { bidCents:bid, exitFloorCents, executableFull:fullExecutable, executableFilled:n(exec?.filled), executableNetCents });
      if (bid > n(entry.entryPriceCents)) {
        const reason = !fullExecutable ? 'insufficient_full_position_depth' : 'fee_adjusted_net_below_threshold';
        await this.recordAtomicThunderEvent(entry, 'invalid_opportunity_blocked', {
          reason, bidCents:bid, exitFloorCents, remaining:remain, executableFilled:n(exec?.filled), executableFull:fullExecutable,
          executableNetCents, targetNetCents,
        }, reason);
      }
      return { eligible:true, triggered:false, policy, q:freshQ, reason:!fullExecutable?'insufficient_full_position_depth':'net_below_threshold', targetNetCents, exitFloorCents, executableNetCents, executableBidCents, fullExecutable, bookMs };
    }

    const prior = this.atomicThunderStates.get(entry.id);
    const distinctEvidence = !prior || bookMs > n(prior.lastEvidenceMs);
    let confirmations = n(prior?.confirmations);
    const withinWindow = Boolean(prior) && now - n(prior?.lastQualifiedAtMs) <= policy.confirmationWindowMs;
    if (!withinWindow) confirmations = 0;
    if (distinctEvidence) confirmations += 1;
    const state = {
      confirmations, requiredFreshConfirmations:policy.requiredFreshConfirmations,
      firstQualifiedAtMs:withinWindow ? n(prior?.firstQualifiedAtMs, now) : now,
      lastQualifiedAtMs:now, lastEvidenceMs:distinctEvidence ? bookMs : n(prior?.lastEvidenceMs, bookMs),
      executableNetCents, targetNetCents, exitFloorCents, executableBidCents,
    };
    this.atomicThunderStates.set(entry.id, state);
    if (confirmations === 1 && distinctEvidence) {
      await this.recordAtomicThunderEvent(entry, 'opportunity_detected', {
        bidCents:bid, executableBidCents, executableNetCents, targetNetCents, exitFloorCents,
        confirmations, requiredFreshConfirmations:policy.requiredFreshConfirmations, bookMs,
      });
    }
    const triggered = confirmations >= policy.requiredFreshConfirmations;
    return { eligible:true, triggered, policy, q:freshQ, targetNetCents, exitFloorCents, executableNetCents, executableBidCents, fullExecutable:true, confirmations, bookMs, state };
  }

  isGoldenEyeExitDecision(entry, decision) {
    if (String(decision?.reason || '') !== 'golden_eye_cashout') return false;
    return this.isGoldenEyeTrade(entry) || String(decision?.goldenEye || '') === GOLDEN_EYE.version;
  }

  goldenEyeBreakEvenPriceCents(entry, settings) {
    return this.priceForAggregateNetTargetCents(entry, remainingCount(entry), settings, 0);
  }

  isProfitLearningTrade(entry) {
    return this.isInfinityBreakTrade(entry) || this.isAtomicThunderTrade(entry) || this.isProtectedRunnerTrade(entry) || this.isAthenaExitTrade(entry) || this.isGoldenEyeTrade(entry);
  }

  isAthenaExitDecision(entry, decision) {
    if (String(decision?.reason || '') !== 'athena_x1_exit') return false;
    return this.isAthenaExitTrade(entry)
      || String(decision?.athenaExitIntelligence || '') === ATHENA_EXIT_INTELLIGENCE.version;
  }

  athenaExitBreakEvenPriceCents(entry, settings) {
    return this.priceForAggregateNetTargetCents(entry, remainingCount(entry), settings, 0);
  }

  async persistAthenaExitState(entry, state) {
    const frozenRevision=athenaExitPolicyRevision(entry);
    const stateRevision=String(state?.policyRevision || frozenRevision || '');
    if((frozenRevision&&frozenRevision!==ATHENA_EXIT_INTELLIGENCE.policyRevision)
      || (stateRevision&&stateRevision!==ATHENA_EXIT_INTELLIGENCE.policyRevision)){
      throw new Error('athena_x1_policy_revision_mismatch');
    }
    const now=Date.now();
    const persisted={...state,version:ATHENA_EXIT_INTELLIGENCE.version,policyRevision:ATHENA_EXIT_INTELLIGENCE.policyRevision,updatedAtMs:now};
    await this.db.updateEntry(entry.id,{profitGuardState:persisted,updatedAtMs:now});
    entry.profitGuardState=persisted;
    return persisted;
  }

  protectedRunnerBreakEvenPriceCents(entry, settings) {
    return this.priceForAggregateNetTargetCents(entry, remainingCount(entry), settings, 0);
  }

  protectedRunnerTelemetry(state, executableBidCents = null, executableNetCents = null, executableFull = null) {
    if (!state) return {};
    const r2 = String(state.policyRevision || '') === PROTECTED_RUNNER_INTELLIGENCE.policyRevision;
    return {
      protectedRunnerIntelligence:PROTECTED_RUNNER_INTELLIGENCE.version,
      protectedRunnerPolicyRevision:r2 ? PROTECTED_RUNNER_INTELLIGENCE.policyRevision : 'PRI1-R1',
      profitLearningIntelligence:PROFIT_LEARNING_INTELLIGENCE.version,
      pri1Armed:true,
      pri1Phase:state.phase || 'PRI1_RUNNER',
      pri1RetentionRatio:n(state.retentionRatio, PROTECTED_RUNNER_INTELLIGENCE.legacyColdStartRetentionRatio),
      pri1RetentionSource:String(state.retentionSource || state.runnerGivebackSource || 'cold_start'),
      pri1RunnerGivebackCents:r2 ? n(state.runnerGivebackCents, PROTECTED_RUNNER_INTELLIGENCE.coldStartRunnerGivebackNetPerContractCents) : null,
      pri1EffectiveRunnerGivebackCents:r2 ? n(state.effectiveRunnerGivebackCents, state.runnerGivebackCents) : null,
      pri1RunnerGivebackSource:r2 ? String(state.runnerGivebackSource || 'cold_start') : null,
      pri1ProfitFloorArmed:r2 ? Boolean(state.profitFloorArmed) : true,
      pri1LateProfitTightened:r2 ? Boolean(state.lateProfitTightened) : false,
      pri1ProfitFloorArmTargetNetCents:r2 ? n(state.profitFloorArmTargetNetCents) : null,
      pri1DataHoldReason:r2 ? (state.dataHoldReason || null) : null,
      pri1PeakExecutableBidCents:n(state.peakExecutableBidCents),
      pri1PeakExecutableNetCents:n(state.peakExecutableNetCents),
      pri1ProtectedNetFloorCents:n(state.protectedNetFloorCents),
      pri1ProtectedPriceFloorCents:n(state.protectedPriceFloorCents),
      pri1BreakEvenPriceCents:n(state.breakEvenPriceCents),
      pri1CapitalLatchTargetNetCents:n(state.capitalLatchTargetNetCents),
      pri1ExecutableBidCents:executableBidCents == null ? n(state.lastExecutableBidCents) : n(executableBidCents),
      pri1ExecutableNetCents:executableNetCents == null ? n(state.lastExecutableNetCents) : n(executableNetCents),
      pri1ExecutableFull:executableFull == null ? Boolean(state.executableFull) : Boolean(executableFull),
      pri1CapitalFloorGapped:Boolean(state.capitalFloorGapped),
      pri1ExitCommitted:isCommittedProtectedRunnerPhase(state.phase),
    };
  }

  async persistProtectedRunnerState(entry, state) {
    const persisted = { ...state, version:PROTECTED_RUNNER_INTELLIGENCE.version, updatedAtMs:Date.now() };
    await this.db.updateEntry(entry.id, { profitGuardState:persisted, updatedAtMs:Date.now() });
    entry.profitGuardState = persisted;
    return persisted;
  }

  queueProfitLearningTask(entry, taskName, task) {
    const id=String(entry?.id||'');if(!id||typeof task!=='function')return false;
    const prior=this.profitLearningQueues.get(id)||Promise.resolve();
    const next=prior.catch(()=>{}).then(task).catch((error)=>{
      void this.audit(`pli1_${String(taskName||'task')}_failed`,{id:entry.id,ticker:entry.ticker,error:String(error?.message||error)},'warning');
      return null;
    }).finally(()=>{if(this.profitLearningQueues.get(id)===next)this.profitLearningQueues.delete(id);});
    this.profitLearningQueues.set(id,next);
    return true;
  }

  queueProfitLearningObservation(entry, observation) {
    if (typeof this.learning?.observeProfitOpportunity !== 'function') return false;
    const id=String(entry?.id||'');if(!id)return false;
    const observedAtMs=Math.max(1,n(observation?.observedAtMs,Date.now()));
    if(observedAtMs<=n(this.profitLearningQueuedAtMs.get(id)))return false;
    this.profitLearningQueuedAtMs.set(id,observedAtMs);
    return this.queueProfitLearningTask(entry,'observation',()=>this.learning.observeProfitOpportunity(entry,{...observation,observedAtMs}));
  }

  async flushProfitLearningEntry(entryId, timeoutMs = 1000) {
    const pending=this.profitLearningQueues.get(String(entryId||''));
    if(!pending)return true;
    const drained=Promise.resolve(pending).then(()=>true,()=>true);
    if(!(Number(timeoutMs)>0))return drained;
    return Promise.race([drained,new Promise((resolve)=>setTimeout(()=>resolve(false),Number(timeoutMs)))]);
  }

  async flushProfitLearningQueues(timeoutMs = 2000) {
    const pending=[...this.profitLearningQueues.values()];
    if(!pending.length)return true;
    const drained=Promise.allSettled(pending).then(()=>true);
    if(!(Number(timeoutMs)>0))return drained;
    return Promise.race([drained,new Promise((resolve)=>setTimeout(()=>resolve(false),Number(timeoutMs)))]);
  }

  athenaExitHistoricalDrawdownEvidence(entry, observedDrawdownCents, sportName='Unknown') {
    const brain=this.athena?.brain;
    const depth=Math.max(0,n(observedDrawdownCents));
    if(!brain||depth<15)return null;
    try{
      const assessment=assessAthenaBrain(brain,{
        conceptName:entry.conceptName,sourceFeeder:entry.sourceFeeder,ticker:entry.ticker,title:entry.marketTitle||'',
        sport:String(sportName||'Unknown'),entryPriceCents:n(entry.entryPriceCents),crashDepthCents:depth,
      });
      const evidence=(assessment?.evidence||[]).find(x=>x?.kind==='crash_depth_survival');
      if(!evidence)return null;
      return{
        available:true,brainHash:String(assessment.brainHash||''),thresholdCents:n(evidence.thresholdCents),
        probability:n(evidence.probability,n(evidence.smoothedRate,.5)),totalObservations:n(evidence.totalObservations),
        wilsonLow:n(evidence.wilsonLow,0),wilsonHigh:n(evidence.wilsonHigh,1),specificity:String(evidence.specificity||'global'),
        strongNegative:n(evidence.totalObservations)>=20&&Number.isFinite(Number(evidence.wilsonHigh))&&n(evidence.wilsonHigh,1)<.5,
      };
    }catch{
      return null;
    }
  }

  async evaluateAthenaExit(entry, q, settings) {
    if (!this.isAthenaExitTrade(entry) || FEEDER_CONCEPTS.has(entry.conceptName) || Boolean(q?.result) || finalMarket(q)) return null;
    const count=remainingCount(entry);
    if(count<=1e-9)return null;

    let state=activeAthenaExitState(entry);
    if(!athenaExitPolicyRevisionSupported(entry)){
      await this.audit('athena_x1_policy_revision_mismatch',{
        id:entry.id,ticker:entry.ticker,concept:entry.conceptName,
        frozenRevision:athenaExitPolicyRevision(entry),runtimeRevision:ATHENA_EXIT_INTELLIGENCE.policyRevision,
      },'error');
      return{q,state,armed:Boolean(state),committed:isCommittedAthenaExitPhase(state?.phase),triggered:false,executable:false,executableFull:false,policyMismatch:true,...athenaExitTelemetry(state)};
    }
    await this.market.ensureFreshBook(entry.ticker,5000).catch(()=>null);
    const freshQ=this.market.getQuote(entry.ticker)||q;
    const bid=n(freshQ?.yesBid),ask=n(freshQ?.yesAsk);
    const book=this.market.getBook?.(entry.ticker);
    const nowMs=Date.now();
    const observedBookMs=Math.max(1,n(book?.updatedAtMs,n(freshQ?.updatedAtMs,nowMs)));
    const bookFresh=Boolean(book&&athenaExitBookTimestampFresh(observedBookMs,nowMs)&&!freshQ?.bookInvalid&&bid>0&&ask>0&&bid<=ask);
    const breakEvenPriceCents=this.athenaExitBreakEvenPriceCents(entry,settings);
    const committed=isCommittedAthenaExitPhase(state?.phase);

    if(!bookFresh){
      if(state&&!committed)state=await this.persistAthenaExitState(entry,{...state,executableFull:false,dataHoldReason:'stale_or_invalid_book',breakEvenPriceCents});
      return{q:freshQ,state,armed:Boolean(state),committed,triggered:false,executable:false,executableFull:false,breakEvenPriceCents,...athenaExitTelemetry(state)};
    }
    const exec=this.market.executableBid(entry.ticker,count,0);
    const executableFull=Boolean(exec?.full&&n(exec.filled)+1e-9>=count&&Number.isFinite(Number(exec.avgCents)));
    if(!executableFull){
      if(state&&!committed)state=await this.persistAthenaExitState(entry,{...state,executableFull:false,dataHoldReason:'partial_executable_depth',breakEvenPriceCents});
      return{q:freshQ,state,armed:Boolean(state),committed,triggered:false,executable:false,executableFull:false,breakEvenPriceCents,...athenaExitTelemetry(state)};
    }

    const executableBidCents=n(exec.avgCents);
    const executableNetCents=this.aggregateExecutableNetCents(entry,count,executableBidCents,settings);
    const pliState=typeof this.learning?.profitLearningState==='function'?this.learning.profitLearningState(entry.id):null;
    if(observedBookMs>Math.max(n(pliState?.lastObservedAtMs),n(this.profitLearningQueuedAtMs.get(entry.id)))){
      this.queueProfitLearningObservation(entry,{fullExecutable:true,executableBidCents,executableNetCents,observedAtMs:observedBookMs});
    }

    if(committed){
      const executable=executableNetCents>=-1e-9;
      return{q:freshQ,state,armed:true,committed:true,triggered:executable,executable,executableFull:true,executableBidCents,executableNetCents,breakEvenPriceCents,...athenaExitTelemetry(state)};
    }
    if(observedBookMs<=n(state?.lastObservedBookMs)){
      return{q:freshQ,state,armed:Boolean(state),committed:false,triggered:false,executable:true,executableFull:true,executableBidCents,executableNetCents,breakEvenPriceCents,...athenaExitTelemetry(state)};
    }

    let profile={promoted:false,specificity:'cold_start',totalObservations:0,oneTickPullbacks:0,oneTickRecoveries:0,continuationRate:0.5,collapseRate:0.25};
    if(typeof this.learning?.profitRetentionProfileCached==='function'){
      try{profile={...profile,...this.learning.profitRetentionProfileCached(entry)};}
      catch(error){void this.audit('athena_x1_pli1_profile_cache_failed',{id:entry.id,ticker:entry.ticker,error:String(error?.message||error)},'warning');}
    }
    const crash=typeof this.learning?.crashState==='function'?(this.learning.crashState(entry.ticker)||{}):{};
    const sport=classifyDeterministic(entry.ticker,entry.marketTitle||'');
    const localExecutableDrawdown=Math.max(0,n(state?.peakExecutableBidCents,executableBidCents)-executableBidCents);
    // Historical drawdown survival must describe the current Hunter's own
    // post-entry executable drawdown. CI1 crashDepth can describe the source
    // feeder's pre-entry crash and is already evaluated independently below.
    const observedDrawdownCents=localExecutableDrawdown;
    const historicalDrawdownEvidence=this.athenaExitHistoricalDrawdownEvidence(entry,observedDrawdownCents,sport.sportName);
    const entryAthena=entry?.entryConfig?.athena||{};
    let advanced;
    try{
      advanced=advanceAthenaExitState(state,{
        observation:{observedAtMs:observedBookMs,executableBidCents,executableNetCents,askCents:ask},
        context:{
          entryPriceCents:n(entry.entryPriceCents),originalCount:Math.max(count,n(entry.count,count)),
          gameStartTimeMs:n(entry.gameStartTimeMs),typicalDurationMs:n(sport.typicalDurationMs,120*60_000),
          entryAthenaScore:n(entryAthena.score,50),entryAthenaClassification:String(entryAthena.classification||'UNKNOWN'),
          profile,crash,historicalDrawdownEvidence,nowMs,
        },
      });
    }catch(error){
      await this.audit('athena_x1_evaluation_failed',{id:entry.id,ticker:entry.ticker,error:String(error?.message||error)},'error');
      return{q:freshQ,state,armed:Boolean(state),committed:false,triggered:false,executable:true,executableFull:true,executableBidCents,executableNetCents,breakEvenPriceCents,evaluationError:true,...athenaExitTelemetry(state)};
    }
    const priorPhase=String(state?.phase||'');
    state=await this.persistAthenaExitState(entry,{...advanced.state,executableFull:true,dataHoldReason:null,breakEvenPriceCents});
    if(advanced.newPeak){
      await this.audit('athena_x1_peak_advanced',{id:entry.id,ticker:entry.ticker,concept:entry.conceptName,executableBidCents,executableNetCents,continuationScore:state.continuationScore,recoveryScore:state.recoveryScore,failureScore:state.failureScore});
    }else if(priorPhase!==state.phase&&state.phase==='X1_RECOVERY_WATCH'){
      await this.audit('athena_x1_recovery_watch',{id:entry.id,ticker:entry.ticker,concept:entry.conceptName,pullbackCents:state.pullbackCents,adaptivePullbackCents:state.adaptivePullbackCents,continuationScore:state.continuationScore,recoveryScore:state.recoveryScore,failureScore:state.failureScore});
    }
    if(advanced.decision==='EXIT'){
      await this.audit('athena_x1_exit_committed',{id:entry.id,ticker:entry.ticker,concept:entry.conceptName,reason:state.exitTrigger,executableBidCents,executableNetCents,peakExecutableBidCents:state.peakExecutableBidCents,pullbackCents:state.pullbackCents,continuationScore:state.continuationScore,recoveryScore:state.recoveryScore,failureScore:state.failureScore,crashPhase:state.crash?.phase||'NORMAL',crashDepthCents:n(state.crash?.depthCents),historicalDrawdownThresholdCents:n(state.historicalDrawdown?.thresholdCents),historicalDrawdownProbability:n(state.historicalDrawdown?.probability,.5),historicalDrawdownObservations:n(state.historicalDrawdown?.totalObservations),peakExhaustion:Boolean(state.peakExhaustion)});
    }
    const executable=executableNetCents>=-1e-9;
    return{q:freshQ,state,armed:true,committed:advanced.decision==='EXIT',triggered:advanced.decision==='EXIT'&&executable,executable,executableFull:true,executableBidCents,executableNetCents,breakEvenPriceCents,...athenaExitTelemetry(state)};
  }

  async evaluateProtectedRunnerLegacyR32(entry, q, settings) {
    if (!this.isProtectedRunnerTrade(entry) || FEEDER_CONCEPTS.has(entry.conceptName) || Boolean(q?.result) || finalMarket(q)) return null;
    const count = remainingCount(entry);
    if (count <= 1e-9) return null;

    let state = activeProtectedRunnerState(entry);
    await this.market.ensureFreshBook(entry.ticker, 5000).catch(() => null);
    const freshQ = this.market.getQuote(entry.ticker) || q;
    const bid = n(freshQ?.yesBid);
    const ask = n(freshQ?.yesAsk);
    const book = this.market.getBook?.(entry.ticker);
    const observedBookMs = Math.max(1, n(book?.updatedAtMs, n(freshQ?.updatedAtMs, Date.now())));
    const bookFresh = Boolean(
      book && observedBookMs > 0 && Date.now() - observedBookMs <= 5000
      && !freshQ?.bookInvalid && bid > 0 && (ask <= 0 || bid <= ask)
    );
    const breakEvenPriceCents = this.protectedRunnerBreakEvenPriceCents(entry, settings);
    const originalCount = Math.max(count, n(entry.count, count));
    const capitalLatchTargetNetCents = Math.max(0, PROTECTED_RUNNER_INTELLIGENCE.capitalLatchNetPerOriginalContractCents * originalCount);
    const committed = isCommittedProtectedRunnerPhase(state?.phase);

    if (!bookFresh) {
      if (state && !committed && state.phase !== 'PRI1_CAPITAL_FLOOR_GAPPED') {
        state = await this.persistProtectedRunnerState(entry, {
          ...state, phase:'PRI1_WAITING_FOR_FULL_DEPTH', executableFull:false,
          breakEvenPriceCents, capitalLatchTargetNetCents,
        });
      }
      return { q:freshQ, state, armed:Boolean(state), committed, triggered:false, executable:false, executableFull:false, breakEvenPriceCents, capitalLatchTargetNetCents, ...this.protectedRunnerTelemetry(state, bid, null, false) };
    }

    const exec = this.market.executableBid(entry.ticker, count, 0);
    const executableFull = Boolean(exec?.full && n(exec.filled) + 1e-9 >= count && Number.isFinite(Number(exec.avgCents)));
    if (!executableFull) {
      if (state && !committed && state.phase !== 'PRI1_CAPITAL_FLOOR_GAPPED') {
        state = await this.persistProtectedRunnerState(entry, {
          ...state, phase:'PRI1_WAITING_FOR_FULL_DEPTH', executableFull:false,
          breakEvenPriceCents, capitalLatchTargetNetCents,
        });
      }
      return { q:freshQ, state, armed:Boolean(state), committed, triggered:false, executable:false, executableFull:false, breakEvenPriceCents, capitalLatchTargetNetCents, ...this.protectedRunnerTelemetry(state, null, null, false) };
    }

    const executableBidCents = n(exec.avgCents);
    const executableNetCents = this.aggregateExecutableNetCents(entry, count, executableBidCents, settings);
    const freshObservation = observedBookMs > n(state?.lastObservedBookMs);
    const pliState = typeof this.learning?.profitLearningState === 'function' ? this.learning.profitLearningState(entry.id) : null;
    if (observedBookMs > Math.max(n(pliState?.lastObservedAtMs),n(this.profitLearningQueuedAtMs.get(entry.id)))) {
      this.queueProfitLearningObservation(entry, {
        fullExecutable:true, executableBidCents, executableNetCents, observedAtMs:observedBookMs,
      });
    }

    if (committed) {
      const executable = executableNetCents >= -1e-9;
      return { q:freshQ, state, armed:true, committed:true, triggered:executable, executable, executableFull:true, executableBidCents, executableNetCents, breakEvenPriceCents, capitalLatchTargetNetCents, ...this.protectedRunnerTelemetry(state, executableBidCents, executableNetCents, true) };
    }

    if (!state) {
      if (executableNetCents + 1e-9 < capitalLatchTargetNetCents) {
        return { q:freshQ, state:null, armed:false, committed:false, triggered:false, executable:true, executableFull:true, executableBidCents, executableNetCents, breakEvenPriceCents, capitalLatchTargetNetCents };
      }
      let profile = { retentionRatio:PROTECTED_RUNNER_INTELLIGENCE.coldStartRetentionRatio, specificity:'cold_start', promoted:false, totalObservations:0, confidence:'low' };
      // Risk/profit protection must never wait on learning I/O. PLI1 profiles are
      // hydrated/cached at engine initialization and refreshed after each completed
      // episode. A cache miss deterministically falls back to the frozen cold-start
      // policy; asynchronous learning can update only future trades.
      if (typeof this.learning?.profitRetentionProfileCached === 'function') {
        try { profile = { ...profile, ...this.learning.profitRetentionProfileCached(entry) }; }
        catch (error) { void this.audit('pli1_profile_cache_failed', { id:entry.id, ticker:entry.ticker, error:String(error?.message || error) }, 'warning'); }
      }
      const retentionRatio = clamp(
        n(profile.retentionRatio, PROTECTED_RUNNER_INTELLIGENCE.coldStartRetentionRatio),
        PROTECTED_RUNNER_INTELLIGENCE.minimumRetentionRatio,
        PROTECTED_RUNNER_INTELLIGENCE.maximumRetentionRatio,
      );
      const minimumGivebackNetCents = count * PROTECTED_RUNNER_INTELLIGENCE.minimumExecutionBufferCents;
      const allowedGivebackNetCents = Math.max(minimumGivebackNetCents, executableNetCents * (1 - retentionRatio));
      const protectedNetFloorCents = Math.max(0, executableNetCents - allowedGivebackNetCents);
      const protectedPriceFloorCents = this.priceForAggregateNetTargetCents(entry, count, settings, protectedNetFloorCents);
      state = await this.persistProtectedRunnerState(entry, {
        version:PROTECTED_RUNNER_INTELLIGENCE.version, phase:'PRI1_CAPITAL_LATCHED',
        armedAtMs:Date.now(), latchedAtMs:Date.now(), retentionRatio,
        retentionSource:String(profile.specificity || 'cold_start'), retentionProfileKey:profile.profileKey || null,
        retentionProfileObservations:n(profile.totalObservations), retentionConfidence:String(profile.confidence || 'low'),
        peakExecutableBidCents:executableBidCents, peakExecutableNetCents:executableNetCents,
        protectedNetFloorCents, protectedPriceFloorCents, breakEvenPriceCents,
        capitalLatchTargetNetCents, minimumGivebackNetCents, allowedGivebackNetCents,
        lastExecutableBidCents:executableBidCents, lastExecutableNetCents:executableNetCents,
        lastObservedBookMs:observedBookMs, executableFull:true, capitalFloorGapped:false,
      });
      await this.audit('pri1_capital_latched', {
        id:entry.id, ticker:entry.ticker, concept:entry.conceptName, entryPriceCents:n(entry.entryPriceCents),
        executableBidCents, executableNetCents, capitalLatchTargetNetCents, retentionRatio,
        retentionSource:state.retentionSource, protectedNetFloorCents, protectedPriceFloorCents, breakEvenPriceCents,
      });
      return { q:freshQ, state, armed:true, committed:false, triggered:false, executable:true, executableFull:true, executableBidCents, executableNetCents, breakEvenPriceCents, capitalLatchTargetNetCents, guardState:'PRI1_CAPITAL_LATCHED', ...this.protectedRunnerTelemetry(state, executableBidCents, executableNetCents, true) };
    }

    if (!freshObservation) {
      return { q:freshQ, state, armed:true, committed:false, triggered:false, executable:true, executableFull:true, executableBidCents, executableNetCents, breakEvenPriceCents, capitalLatchTargetNetCents, ...this.protectedRunnerTelemetry(state, executableBidCents, executableNetCents, true) };
    }

    const retentionRatio = clamp(
      n(state.retentionRatio, PROTECTED_RUNNER_INTELLIGENCE.coldStartRetentionRatio),
      PROTECTED_RUNNER_INTELLIGENCE.minimumRetentionRatio,
      PROTECTED_RUNNER_INTELLIGENCE.maximumRetentionRatio,
    );
    const priorPeakNetCents = n(state.peakExecutableNetCents, executableNetCents);
    const peakExecutableNetCents = Math.max(priorPeakNetCents, executableNetCents);
    const priorPeakBidCents = n(state.peakExecutableBidCents, executableBidCents);
    const peakExecutableBidCents = executableNetCents > priorPeakNetCents + 1e-9
      ? executableBidCents
      : Math.max(priorPeakBidCents, executableBidCents);
    const minimumGivebackNetCents = count * PROTECTED_RUNNER_INTELLIGENCE.minimumExecutionBufferCents;
    const allowedGivebackNetCents = Math.max(minimumGivebackNetCents, peakExecutableNetCents * (1 - retentionRatio));
    const protectedNetFloorCents = Math.max(0, n(state.protectedNetFloorCents), peakExecutableNetCents - allowedGivebackNetCents);
    const protectedPriceFloorCents = this.priceForAggregateNetTargetCents(entry, count, settings, protectedNetFloorCents);
    const wasGapped = state.phase === 'PRI1_CAPITAL_FLOOR_GAPPED' || Boolean(state.capitalFloorGapped);
    const floorBreached = executableNetCents <= protectedNetFloorCents + 1e-9;

    if (wasGapped && executableNetCents >= -1e-9) {
      state = await this.persistProtectedRunnerState(entry, {
        ...state, phase:'PRI1_EXIT_COMMITTED', exitCommittedAtMs:Date.now(),
        exitTrigger:'capital_floor_recovered', triggerExecutableBidCents:executableBidCents,
        triggerExecutableNetCents:executableNetCents, peakExecutableBidCents, peakExecutableNetCents,
        protectedNetFloorCents, protectedPriceFloorCents, breakEvenPriceCents, capitalLatchTargetNetCents,
        minimumGivebackNetCents, allowedGivebackNetCents, lastExecutableBidCents:executableBidCents,
        lastExecutableNetCents:executableNetCents, lastObservedBookMs:observedBookMs, executableFull:true, capitalFloorGapped:false,
      });
      await this.audit('pri1_exit_committed', { id:entry.id, ticker:entry.ticker, concept:entry.conceptName, reason:'capital_floor_recovered', executableBidCents, executableNetCents, protectedNetFloorCents, peakExecutableNetCents, retentionRatio });
      return { q:freshQ, state, armed:true, committed:true, triggered:true, executable:true, executableFull:true, executableBidCents, executableNetCents, breakEvenPriceCents, capitalLatchTargetNetCents, ...this.protectedRunnerTelemetry(state, executableBidCents, executableNetCents, true) };
    }

    if (floorBreached && executableNetCents < -1e-9) {
      state = await this.persistProtectedRunnerState(entry, {
        ...state, phase:'PRI1_CAPITAL_FLOOR_GAPPED', capitalFloorGapped:true,
        peakExecutableBidCents, peakExecutableNetCents, protectedNetFloorCents, protectedPriceFloorCents,
        breakEvenPriceCents, capitalLatchTargetNetCents, minimumGivebackNetCents, allowedGivebackNetCents,
        lastExecutableBidCents:executableBidCents, lastExecutableNetCents:executableNetCents,
        lastObservedBookMs:observedBookMs, executableFull:true,
      });
      await this.audit('pri1_capital_floor_gapped', { id:entry.id, ticker:entry.ticker, concept:entry.conceptName, executableBidCents, executableNetCents, protectedNetFloorCents, breakEvenPriceCents }, 'warning');
      return { q:freshQ, state, armed:true, committed:false, triggered:false, executable:false, executableFull:true, executableBidCents, executableNetCents, breakEvenPriceCents, capitalLatchTargetNetCents, capitalFloorGapped:true, ...this.protectedRunnerTelemetry(state, executableBidCents, executableNetCents, true) };
    }

    if (floorBreached) {
      state = await this.persistProtectedRunnerState(entry, {
        ...state, phase:'PRI1_EXIT_COMMITTED', exitCommittedAtMs:Date.now(), exitTrigger:'protected_net_floor',
        triggerExecutableBidCents:executableBidCents, triggerExecutableNetCents:executableNetCents,
        peakExecutableBidCents, peakExecutableNetCents, protectedNetFloorCents, protectedPriceFloorCents,
        breakEvenPriceCents, capitalLatchTargetNetCents, minimumGivebackNetCents, allowedGivebackNetCents,
        lastExecutableBidCents:executableBidCents, lastExecutableNetCents:executableNetCents,
        lastObservedBookMs:observedBookMs, executableFull:true, capitalFloorGapped:false,
      });
      await this.audit('pri1_exit_committed', { id:entry.id, ticker:entry.ticker, concept:entry.conceptName, reason:'protected_net_floor', executableBidCents, executableNetCents, protectedNetFloorCents, peakExecutableNetCents, retentionRatio });
      return { q:freshQ, state, armed:true, committed:true, triggered:true, executable:true, executableFull:true, executableBidCents, executableNetCents, breakEvenPriceCents, capitalLatchTargetNetCents, ...this.protectedRunnerTelemetry(state, executableBidCents, executableNetCents, true) };
    }

    const peakAdvanced = peakExecutableNetCents > priorPeakNetCents + 1e-9;
    state = await this.persistProtectedRunnerState(entry, {
      ...state, phase:'PRI1_RUNNER', retentionRatio, peakExecutableBidCents, peakExecutableNetCents,
      protectedNetFloorCents, protectedPriceFloorCents, breakEvenPriceCents, capitalLatchTargetNetCents,
      minimumGivebackNetCents, allowedGivebackNetCents, lastExecutableBidCents:executableBidCents,
      lastExecutableNetCents:executableNetCents, lastObservedBookMs:observedBookMs, executableFull:true, capitalFloorGapped:false,
    });
    if (peakAdvanced) await this.audit('pri1_peak_ratchet', { id:entry.id, ticker:entry.ticker, concept:entry.conceptName, executableBidCents, executableNetCents, peakExecutableNetCents, protectedNetFloorCents, protectedPriceFloorCents, retentionRatio });
    return { q:freshQ, state, armed:true, committed:false, triggered:false, executable:true, executableFull:true, executableBidCents, executableNetCents, breakEvenPriceCents, capitalLatchTargetNetCents, guardState:'PRI1_RUNNER', ...this.protectedRunnerTelemetry(state, executableBidCents, executableNetCents, true) };
  }


  async evaluateProtectedRunner(entry, q, settings) {
    if (this.isProtectedRunnerR2Trade(entry)) return this.evaluateProtectedRunnerR2(entry, q, settings);
    return this.evaluateProtectedRunnerLegacyR32(entry, q, settings);
  }

  async evaluateProtectedRunnerR2(entry, q, settings) {
    if (!this.isProtectedRunnerR2Trade(entry) || FEEDER_CONCEPTS.has(entry.conceptName) || Boolean(q?.result) || finalMarket(q)) return null;
    const count = remainingCount(entry);
    if (count <= 1e-9) return null;

    let state = activeProtectedRunnerState(entry);
    await this.market.ensureFreshBook(entry.ticker, 5000).catch(() => null);
    const freshQ = this.market.getQuote(entry.ticker) || q;
    const bid = n(freshQ?.yesBid);
    const ask = n(freshQ?.yesAsk);
    const book = this.market.getBook?.(entry.ticker);
    const observedBookMs = Math.max(1, n(book?.updatedAtMs, n(freshQ?.updatedAtMs, Date.now())));
    const bookFresh = Boolean(
      book && observedBookMs > 0 && Date.now() - observedBookMs <= 5000
      && !freshQ?.bookInvalid && bid > 0 && (ask <= 0 || bid <= ask)
    );
    const breakEvenPriceCents = this.protectedRunnerBreakEvenPriceCents(entry, settings);
    const originalCount = Math.max(count, n(entry.count, count));
    const capitalLatchTargetNetCents = Math.max(0, PROTECTED_RUNNER_INTELLIGENCE.capitalLatchNetPerOriginalContractCents * originalCount);
    const profitFloorArmTargetNetCents = Math.max(capitalLatchTargetNetCents, PROTECTED_RUNNER_INTELLIGENCE.profitFloorArmNetPerOriginalContractCents * originalCount);
    const lateProfitTightenTargetNetCents = Math.max(profitFloorArmTargetNetCents, PROTECTED_RUNNER_INTELLIGENCE.lateProfitTightenAtNetPerOriginalContractCents * originalCount);
    const committed = isCommittedProtectedRunnerPhase(state?.phase);

    // R33 data holds are orthogonal to the economic state. R32 replaced the
    // phase with WAITING_FOR_FULL_DEPTH, which erased whether a profit floor
    // had already been armed. Preserve the phase and expose a separate hold
    // reason so restarts and partial books cannot weaken or invent authority.
    if (!bookFresh) {
      if (state && !committed) {
        state = await this.persistProtectedRunnerState(entry, {
          ...state, policyRevision:PROTECTED_RUNNER_INTELLIGENCE.policyRevision,
          executableFull:false, dataHoldReason:'stale_or_invalid_book',
          breakEvenPriceCents, capitalLatchTargetNetCents, profitFloorArmTargetNetCents,
          lateProfitTightenTargetNetCents,
        });
      }
      return { q:freshQ, state, armed:Boolean(state), committed, triggered:false, executable:false, executableFull:false, breakEvenPriceCents, capitalLatchTargetNetCents, profitFloorArmTargetNetCents, ...this.protectedRunnerTelemetry(state, bid, null, false) };
    }

    const exec = this.market.executableBid(entry.ticker, count, 0);
    const executableFull = Boolean(exec?.full && n(exec.filled) + 1e-9 >= count && Number.isFinite(Number(exec.avgCents)));
    if (!executableFull) {
      if (state && !committed) {
        state = await this.persistProtectedRunnerState(entry, {
          ...state, policyRevision:PROTECTED_RUNNER_INTELLIGENCE.policyRevision,
          executableFull:false, dataHoldReason:'partial_executable_depth',
          breakEvenPriceCents, capitalLatchTargetNetCents, profitFloorArmTargetNetCents,
          lateProfitTightenTargetNetCents,
        });
      }
      return { q:freshQ, state, armed:Boolean(state), committed, triggered:false, executable:false, executableFull:false, breakEvenPriceCents, capitalLatchTargetNetCents, profitFloorArmTargetNetCents, ...this.protectedRunnerTelemetry(state, null, null, false) };
    }

    const executableBidCents = n(exec.avgCents);
    const executableNetCents = this.aggregateExecutableNetCents(entry, count, executableBidCents, settings);
    const freshObservation = observedBookMs > n(state?.lastObservedBookMs);
    const pliState = typeof this.learning?.profitLearningState === 'function' ? this.learning.profitLearningState(entry.id) : null;
    if (observedBookMs > Math.max(n(pliState?.lastObservedAtMs), n(this.profitLearningQueuedAtMs.get(entry.id)))) {
      this.queueProfitLearningObservation(entry, {
        fullExecutable:true, executableBidCents, executableNetCents, observedAtMs:observedBookMs,
      });
    }

    if (committed) {
      const executable = executableNetCents >= -1e-9;
      return { q:freshQ, state, armed:true, committed:true, triggered:executable, executable, executableFull:true, executableBidCents, executableNetCents, breakEvenPriceCents, capitalLatchTargetNetCents, profitFloorArmTargetNetCents, ...this.protectedRunnerTelemetry(state, executableBidCents, executableNetCents, true) };
    }

    if (!state) {
      if (executableNetCents + 1e-9 < capitalLatchTargetNetCents) {
        return { q:freshQ, state:null, armed:false, committed:false, triggered:false, executable:true, executableFull:true, executableBidCents, executableNetCents, breakEvenPriceCents, capitalLatchTargetNetCents, profitFloorArmTargetNetCents };
      }
      let profile = {
        runnerGivebackCents:PROTECTED_RUNNER_INTELLIGENCE.coldStartRunnerGivebackNetPerContractCents,
        retentionRatio:PROTECTED_RUNNER_INTELLIGENCE.legacyColdStartRetentionRatio,
        specificity:'cold_start', promoted:false, totalObservations:0, confidence:'low',
      };
      if (typeof this.learning?.profitRetentionProfileCached === 'function') {
        try { profile = { ...profile, ...this.learning.profitRetentionProfileCached(entry) }; }
        catch (error) { void this.audit('pli1_profile_cache_failed', { id:entry.id, ticker:entry.ticker, error:String(error?.message || error) }, 'warning'); }
      }
      const runnerGivebackCents = clamp(
        n(profile.runnerGivebackCents, PROTECTED_RUNNER_INTELLIGENCE.coldStartRunnerGivebackNetPerContractCents),
        PROTECTED_RUNNER_INTELLIGENCE.minimumRunnerGivebackNetPerContractCents,
        PROTECTED_RUNNER_INTELLIGENCE.maximumRunnerGivebackNetPerContractCents,
      );
      const peakExecutableNetCents = executableNetCents;
      const peakExecutableBidCents = executableBidCents;
      const profitFloorArmed = peakExecutableNetCents + 1e-9 >= profitFloorArmTargetNetCents;
      const lateProfitTightened = profitFloorArmed && peakExecutableNetCents + 1e-9 >= lateProfitTightenTargetNetCents;
      const effectiveRunnerGivebackCents = lateProfitTightened
        ? Math.min(runnerGivebackCents, PROTECTED_RUNNER_INTELLIGENCE.lateProfitGivebackNetPerContractCents)
        : runnerGivebackCents;
      const allowedGivebackNetCents = profitFloorArmed ? count * effectiveRunnerGivebackCents : null;
      const protectedNetFloorCents = profitFloorArmed ? Math.max(0, peakExecutableNetCents - allowedGivebackNetCents) : 0;
      const protectedPriceFloorCents = profitFloorArmed ? this.priceForAggregateNetTargetCents(entry, count, settings, protectedNetFloorCents) : breakEvenPriceCents;
      const phase = !profitFloorArmed ? 'PRI1_CAPITAL_SAFE' : protectedNetFloorCents > 1e-9 ? 'PRI1_PROFIT_FLOOR_ARMED' : 'PRI1_CAPITAL_FLOOR_ARMED';
      state = await this.persistProtectedRunnerState(entry, {
        version:PROTECTED_RUNNER_INTELLIGENCE.version, policyRevision:PROTECTED_RUNNER_INTELLIGENCE.policyRevision,
        phase, armedAtMs:Date.now(), latchedAtMs:Date.now(), capitalSafeAtMs:Date.now(),
        profitFloorArmed, ...(profitFloorArmed ? { profitFloorArmedAtMs:Date.now() } : {}),
        runnerGivebackCents, effectiveRunnerGivebackCents,
        runnerGivebackSource:String(profile.specificity || 'cold_start'), runnerGivebackProfileKey:profile.profileKey || null,
        runnerGivebackProfileObservations:n(profile.totalObservations), runnerGivebackConfidence:String(profile.confidence || 'low'),
        // Preserve the old fields for diagnostics/forensics only. They do not
        // control R33 execution.
        retentionRatio:n(profile.retentionRatio, PROTECTED_RUNNER_INTELLIGENCE.legacyColdStartRetentionRatio),
        retentionSource:String(profile.specificity || 'cold_start'), retentionProfileKey:profile.profileKey || null,
        retentionProfileObservations:n(profile.totalObservations), retentionConfidence:String(profile.confidence || 'low'),
        peakExecutableBidCents, peakExecutableNetCents, protectedNetFloorCents, protectedPriceFloorCents,
        breakEvenPriceCents, capitalLatchTargetNetCents, profitFloorArmTargetNetCents, lateProfitTightenTargetNetCents,
        lateProfitTightened, allowedGivebackNetCents,
        lastExecutableBidCents:executableBidCents, lastExecutableNetCents:executableNetCents,
        lastObservedBookMs:observedBookMs, executableFull:true, dataHoldReason:null, capitalFloorGapped:false,
      });
      await this.audit(profitFloorArmed ? 'pri1_r2_profit_floor_armed' : 'pri1_r2_capital_safe', {
        id:entry.id, ticker:entry.ticker, concept:entry.conceptName, entryPriceCents:n(entry.entryPriceCents),
        executableBidCents, executableNetCents, capitalLatchTargetNetCents, profitFloorArmTargetNetCents,
        runnerGivebackCents, runnerGivebackSource:state.runnerGivebackSource,
        protectedNetFloorCents, protectedPriceFloorCents, breakEvenPriceCents,
      });
      return { q:freshQ, state, armed:true, committed:false, triggered:false, executable:true, executableFull:true, executableBidCents, executableNetCents, breakEvenPriceCents, capitalLatchTargetNetCents, profitFloorArmTargetNetCents, guardState:phase, ...this.protectedRunnerTelemetry(state, executableBidCents, executableNetCents, true) };
    }

    if (!freshObservation) {
      return { q:freshQ, state, armed:true, committed:false, triggered:false, executable:true, executableFull:true, executableBidCents, executableNetCents, breakEvenPriceCents, capitalLatchTargetNetCents, profitFloorArmTargetNetCents, ...this.protectedRunnerTelemetry(state, executableBidCents, executableNetCents, true) };
    }

    const runnerGivebackCents = clamp(
      n(state.runnerGivebackCents, PROTECTED_RUNNER_INTELLIGENCE.coldStartRunnerGivebackNetPerContractCents),
      PROTECTED_RUNNER_INTELLIGENCE.minimumRunnerGivebackNetPerContractCents,
      PROTECTED_RUNNER_INTELLIGENCE.maximumRunnerGivebackNetPerContractCents,
    );
    const priorPeakNetCents = n(state.peakExecutableNetCents, executableNetCents);
    const peakExecutableNetCents = Math.max(priorPeakNetCents, executableNetCents);
    const priorPeakBidCents = n(state.peakExecutableBidCents, executableBidCents);
    const peakExecutableBidCents = executableNetCents > priorPeakNetCents + 1e-9
      ? executableBidCents
      : Math.max(priorPeakBidCents, executableBidCents);
    const wasFloorArmed = Boolean(state.profitFloorArmed)
      || ['PRI1_CAPITAL_FLOOR_ARMED','PRI1_PROFIT_FLOOR_ARMED','PRI1_PROFIT_FLOOR_GAPPED'].includes(String(state.phase || ''));
    const profitFloorArmed = wasFloorArmed || peakExecutableNetCents + 1e-9 >= profitFloorArmTargetNetCents;
    const lateProfitTightened = profitFloorArmed && peakExecutableNetCents + 1e-9 >= lateProfitTightenTargetNetCents;
    const effectiveRunnerGivebackCents = lateProfitTightened
      ? Math.min(runnerGivebackCents, PROTECTED_RUNNER_INTELLIGENCE.lateProfitGivebackNetPerContractCents)
      : runnerGivebackCents;
    const allowedGivebackNetCents = profitFloorArmed ? count * effectiveRunnerGivebackCents : null;
    const priorProtectedNetFloorCents = profitFloorArmed ? Math.max(0, n(state.protectedNetFloorCents)) : 0;
    const protectedNetFloorCents = profitFloorArmed
      ? Math.max(0, priorProtectedNetFloorCents, peakExecutableNetCents - allowedGivebackNetCents)
      : 0;
    const protectedPriceFloorCents = profitFloorArmed
      ? this.priceForAggregateNetTargetCents(entry, count, settings, protectedNetFloorCents)
      : breakEvenPriceCents;
    const wasGapped = profitFloorArmed && (state.phase === 'PRI1_PROFIT_FLOOR_GAPPED' || Boolean(state.capitalFloorGapped));
    const floorBreached = profitFloorArmed && executableNetCents <= protectedNetFloorCents + 1e-9;

    // A gap obligation exists only after sell authority has actually armed.
    // Merely reaching CAPITAL_SAFE is telemetry; a dip below zero and recovery
    // cannot create a break-even sell by itself.
    if (wasGapped && executableNetCents >= -1e-9) {
      state = await this.persistProtectedRunnerState(entry, {
        ...state, policyRevision:PROTECTED_RUNNER_INTELLIGENCE.policyRevision,
        phase:'PRI1_EXIT_COMMITTED', exitCommittedAtMs:Date.now(), exitTrigger:'capital_floor_recovered',
        triggerExecutableBidCents:executableBidCents, triggerExecutableNetCents:executableNetCents,
        peakExecutableBidCents, peakExecutableNetCents, profitFloorArmed:true,
        protectedNetFloorCents, protectedPriceFloorCents, breakEvenPriceCents,
        capitalLatchTargetNetCents, profitFloorArmTargetNetCents, lateProfitTightenTargetNetCents,
        runnerGivebackCents, effectiveRunnerGivebackCents, lateProfitTightened, allowedGivebackNetCents,
        lastExecutableBidCents:executableBidCents, lastExecutableNetCents:executableNetCents,
        lastObservedBookMs:observedBookMs, executableFull:true, dataHoldReason:null, capitalFloorGapped:false,
      });
      await this.audit('pri1_r2_exit_committed', { id:entry.id, ticker:entry.ticker, concept:entry.conceptName, reason:'capital_floor_recovered', executableBidCents, executableNetCents, protectedNetFloorCents, peakExecutableNetCents, runnerGivebackCents });
      return { q:freshQ, state, armed:true, committed:true, triggered:true, executable:true, executableFull:true, executableBidCents, executableNetCents, breakEvenPriceCents, capitalLatchTargetNetCents, profitFloorArmTargetNetCents, ...this.protectedRunnerTelemetry(state, executableBidCents, executableNetCents, true) };
    }

    if (floorBreached && executableNetCents < -1e-9) {
      state = await this.persistProtectedRunnerState(entry, {
        ...state, policyRevision:PROTECTED_RUNNER_INTELLIGENCE.policyRevision,
        phase:'PRI1_PROFIT_FLOOR_GAPPED', profitFloorArmed:true, capitalFloorGapped:true,
        peakExecutableBidCents, peakExecutableNetCents, protectedNetFloorCents, protectedPriceFloorCents,
        breakEvenPriceCents, capitalLatchTargetNetCents, profitFloorArmTargetNetCents, lateProfitTightenTargetNetCents,
        runnerGivebackCents, effectiveRunnerGivebackCents, lateProfitTightened, allowedGivebackNetCents,
        lastExecutableBidCents:executableBidCents, lastExecutableNetCents:executableNetCents,
        lastObservedBookMs:observedBookMs, executableFull:true, dataHoldReason:null,
      });
      await this.audit('pri1_r2_profit_floor_gapped', { id:entry.id, ticker:entry.ticker, concept:entry.conceptName, executableBidCents, executableNetCents, protectedNetFloorCents, breakEvenPriceCents }, 'warning');
      return { q:freshQ, state, armed:true, committed:false, triggered:false, executable:false, executableFull:true, executableBidCents, executableNetCents, breakEvenPriceCents, capitalLatchTargetNetCents, profitFloorArmTargetNetCents, capitalFloorGapped:true, ...this.protectedRunnerTelemetry(state, executableBidCents, executableNetCents, true) };
    }

    if (floorBreached) {
      state = await this.persistProtectedRunnerState(entry, {
        ...state, policyRevision:PROTECTED_RUNNER_INTELLIGENCE.policyRevision,
        phase:'PRI1_EXIT_COMMITTED', profitFloorArmed:true, exitCommittedAtMs:Date.now(), exitTrigger:'protected_net_floor',
        triggerExecutableBidCents:executableBidCents, triggerExecutableNetCents:executableNetCents,
        peakExecutableBidCents, peakExecutableNetCents, protectedNetFloorCents, protectedPriceFloorCents,
        breakEvenPriceCents, capitalLatchTargetNetCents, profitFloorArmTargetNetCents, lateProfitTightenTargetNetCents,
        runnerGivebackCents, effectiveRunnerGivebackCents, lateProfitTightened, allowedGivebackNetCents,
        lastExecutableBidCents:executableBidCents, lastExecutableNetCents:executableNetCents,
        lastObservedBookMs:observedBookMs, executableFull:true, dataHoldReason:null, capitalFloorGapped:false,
      });
      await this.audit('pri1_r2_exit_committed', { id:entry.id, ticker:entry.ticker, concept:entry.conceptName, reason:'protected_net_floor', executableBidCents, executableNetCents, protectedNetFloorCents, peakExecutableNetCents, runnerGivebackCents, effectiveRunnerGivebackCents });
      return { q:freshQ, state, armed:true, committed:true, triggered:true, executable:true, executableFull:true, executableBidCents, executableNetCents, breakEvenPriceCents, capitalLatchTargetNetCents, profitFloorArmTargetNetCents, ...this.protectedRunnerTelemetry(state, executableBidCents, executableNetCents, true) };
    }

    const newlyArmed = !wasFloorArmed && profitFloorArmed;
    const peakAdvanced = peakExecutableNetCents > priorPeakNetCents + 1e-9;
    const phase = !profitFloorArmed ? 'PRI1_CAPITAL_SAFE' : protectedNetFloorCents > 1e-9 ? 'PRI1_PROFIT_FLOOR_ARMED' : 'PRI1_CAPITAL_FLOOR_ARMED';
    state = await this.persistProtectedRunnerState(entry, {
      ...state, policyRevision:PROTECTED_RUNNER_INTELLIGENCE.policyRevision,
      phase, profitFloorArmed,
      ...(newlyArmed && !n(state.profitFloorArmedAtMs) ? { profitFloorArmedAtMs:Date.now() } : {}),
      runnerGivebackCents, effectiveRunnerGivebackCents, lateProfitTightened,
      peakExecutableBidCents, peakExecutableNetCents, protectedNetFloorCents, protectedPriceFloorCents,
      breakEvenPriceCents, capitalLatchTargetNetCents, profitFloorArmTargetNetCents, lateProfitTightenTargetNetCents,
      allowedGivebackNetCents, lastExecutableBidCents:executableBidCents, lastExecutableNetCents:executableNetCents,
      lastObservedBookMs:observedBookMs, executableFull:true, dataHoldReason:null, capitalFloorGapped:false,
    });
    if (newlyArmed) await this.audit('pri1_r2_profit_floor_armed', { id:entry.id, ticker:entry.ticker, concept:entry.conceptName, executableBidCents, executableNetCents, protectedNetFloorCents, protectedPriceFloorCents, runnerGivebackCents, effectiveRunnerGivebackCents });
    else if (peakAdvanced) await this.audit('pri1_r2_peak_ratchet', { id:entry.id, ticker:entry.ticker, concept:entry.conceptName, executableBidCents, executableNetCents, peakExecutableNetCents, protectedNetFloorCents, protectedPriceFloorCents, runnerGivebackCents, effectiveRunnerGivebackCents, lateProfitTightened });
    return { q:freshQ, state, armed:true, committed:false, triggered:false, executable:true, executableFull:true, executableBidCents, executableNetCents, breakEvenPriceCents, capitalLatchTargetNetCents, profitFloorArmTargetNetCents, guardState:phase, ...this.protectedRunnerTelemetry(state, executableBidCents, executableNetCents, true) };
  }


  isApexProfitGuardExitDecision(entry, decision) {
    if (String(decision?.reason || '') !== 'apex_profit_guard') return false;
    const state = activeApexProfitGuardState(entry);
    return state?.version === APEX_PROFIT_GUARD.version || String(decision?.apexProfitGuard || '') === APEX_PROFIT_GUARD.version;
  }

  apexProfitGuardExitFloorCents(entry, settings) {
    return this.minimumPositiveProfitPriceCents(entry, remainingCount(entry), settings, APEX_PROFIT_GUARD.minimumNetProfitPerContractCents);
  }

  apexProfitGuardTelemetry(state, executableBidCents = null, executableFull = null) {
    if (!state) return {};
    return {
      apexProfitGuard:APEX_PROFIT_GUARD.version,
      apg1Armed:true,
      apg1Phase:state.phase || 'APG1_ARMED',
      apg1PeakExecutableBidCents:n(state.peakExecutableBidCents),
      apg1TrailLineCents:n(state.trailLineCents),
      apg1MinimumPositivePriceCents:n(state.minimumPositivePriceCents),
      apg1HeadroomArmPriceCents:n(state.headroomArmPriceCents),
      apg1ExecutableBidCents:executableBidCents == null ? n(state.lastExecutableBidCents) : n(executableBidCents),
      apg1FailureConfirmations:n(state.failureConfirmations),
      apg1RequiredFailureConfirmations:n(state.requiredFailureConfirmations, APEX_PROFIT_GUARD.failureConfirmations),
      apg1ImmediateGapThrough:Boolean(state.immediateGapThrough),
      apg1ProfitFloorLost:Boolean(state.profitFloorLost),
      apg1ExecutableFull:executableFull == null ? Boolean(state.executableFull) : Boolean(executableFull),
    };
  }

  async persistApexProfitGuardState(entry, state) {
    const persisted = { ...state, version:APEX_PROFIT_GUARD.version, updatedAtMs:Date.now() };
    await this.db.updateEntry(entry.id, {
      apexProfitGuardState:persisted,
      updatedAtMs:Date.now(),
    });
    entry.apexProfitGuardState = persisted;
    return persisted;
  }

  async evaluateApexProfitGuard(entry, q, settings) {
    if (FEEDER_CONCEPTS.has(entry.conceptName) || Boolean(q?.result) || finalMarket(q)) return null;
    const count = remainingCount(entry);
    if (count <= 1e-9) return null;

    let state = activeApexProfitGuardState(entry);
    await this.market.ensureFreshBook(entry.ticker, 5000).catch(() => null);
    const freshQ = this.market.getQuote(entry.ticker) || q;
    const bid = n(freshQ?.yesBid);
    const book = this.market.getBook?.(entry.ticker);
    const observedBookMs = Math.max(1, n(book?.updatedAtMs, n(freshQ?.updatedAtMs, Date.now())));
    const minimumPositivePriceCents = this.minimumPositiveProfitPriceCents(entry, count, settings, APEX_PROFIT_GUARD.minimumNetProfitPerContractCents);
    const headroomArmPriceCents = Math.max(
      n(entry.entryPriceCents) + APEX_PROFIT_GUARD.activationMoveCents,
      minimumPositivePriceCents + APEX_PROFIT_GUARD.peakGivebackCents,
    );
    const committed = isCommittedApexProfitGuardPhase(state?.phase);
    const bookFresh = Boolean(book && observedBookMs > 0 && Date.now() - observedBookMs <= 5000 && !freshQ?.bookInvalid);

    if (bid <= 0 || !bookFresh) {
      if (state && !committed) state = await this.persistApexProfitGuardState(entry, { ...state, phase:'APG1_WAITING_FOR_FULL_DEPTH', executableFull:false, minimumPositivePriceCents, headroomArmPriceCents });
      return { q:freshQ, state, armed:Boolean(state), triggered:committed, committed, executable:false, executableFull:false, minimumPositivePriceCents, headroomArmPriceCents, ...this.apexProfitGuardTelemetry(state, bid, false) };
    }

    if (state && !committed && bid < minimumPositivePriceCents) {
      state = await this.persistApexProfitGuardState(entry, {
        ...state, phase:'APG1_PROFIT_FLOOR_LOST', executableFull:false,
        minimumPositivePriceCents, headroomArmPriceCents, lastExecutableBidCents:bid,
        failureConfirmations:0, requiredFailureConfirmations:APEX_PROFIT_GUARD.failureConfirmations,
        profitFloorLost:true, immediateGapThrough:false, lastObservedBookMs:observedBookMs,
      });
      return { q:freshQ, state, armed:true, triggered:false, committed:false, executable:false, executableFull:false, executableBidCents:bid, minimumPositivePriceCents, headroomArmPriceCents, profitFloorLost:true, ...this.apexProfitGuardTelemetry(state, bid, false) };
    }

    const exec = this.market.executableBid(entry.ticker, count, minimumPositivePriceCents);
    const executableFull = Boolean(exec?.full && n(exec.filled) + 1e-9 >= count && Number.isFinite(Number(exec.avgCents)) && n(exec.avgCents) >= minimumPositivePriceCents);
    if (!executableFull) {
      if (state && !committed) state = await this.persistApexProfitGuardState(entry, { ...state, phase:'APG1_WAITING_FOR_FULL_DEPTH', executableFull:false, minimumPositivePriceCents, headroomArmPriceCents });
      return { q:freshQ, state, armed:Boolean(state), triggered:committed, committed, executable:false, executableFull:false, minimumPositivePriceCents, headroomArmPriceCents, ...this.apexProfitGuardTelemetry(state, null, false) };
    }

    const executableBidCents = n(exec.avgCents);
    if (committed) {
      return { q:freshQ, state, armed:true, triggered:true, committed:true, executable:true, executableFull:true, executableBidCents, minimumPositivePriceCents, headroomArmPriceCents, ...this.apexProfitGuardTelemetry(state, executableBidCents, true) };
    }

    const favorableMoveCents = executableBidCents - n(entry.entryPriceCents);
    if (!state) {
      if (favorableMoveCents + 1e-9 < APEX_PROFIT_GUARD.activationMoveCents || executableBidCents + 1e-9 < headroomArmPriceCents) {
        return { q:freshQ, state:null, armed:false, triggered:false, committed:false, executable:true, executableFull:true, executableBidCents, favorableMoveCents, minimumPositivePriceCents, headroomArmPriceCents };
      }
      const peakExecutableBidCents = executableBidCents;
      const trailLineCents = Math.max(minimumPositivePriceCents, peakExecutableBidCents - APEX_PROFIT_GUARD.peakGivebackCents);
      state = await this.persistApexProfitGuardState(entry, {
        version:APEX_PROFIT_GUARD.version, phase:'APG1_ARMED', armedAtMs:Date.now(),
        peakExecutableBidCents, trailLineCents, minimumPositivePriceCents, headroomArmPriceCents,
        favorableMoveCents, lastExecutableBidCents:executableBidCents, minExecutableBidCents:executableBidCents,
        lastObservedBookMs:observedBookMs, failureConfirmations:0,
        requiredFailureConfirmations:APEX_PROFIT_GUARD.failureConfirmations,
        immediateGapThrough:false, executableFull:true, profitFloorLost:false,
      });
      await this.audit('apg1_armed', {
        id:entry.id, ticker:entry.ticker, concept:entry.conceptName,
        entryPriceCents:n(entry.entryPriceCents), executableBidCents, favorableMoveCents,
        peakExecutableBidCents, trailLineCents, minimumPositivePriceCents, headroomArmPriceCents,
      });
      return { q:freshQ, state, armed:true, triggered:false, committed:false, executable:true, executableFull:true, executableBidCents, guardState:'APG1_ARMED', minimumPositivePriceCents, headroomArmPriceCents, ...this.apexProfitGuardTelemetry(state, executableBidCents, true) };
    }

    const freshObservation = observedBookMs > n(state.lastObservedBookMs);
    const priorPeak = n(state.peakExecutableBidCents, executableBidCents);
    const peakAdvanced = executableBidCents > priorPeak + 1e-9;
    const peakExecutableBidCents = Math.max(priorPeak, executableBidCents);
    const trailLineCents = Math.max(minimumPositivePriceCents, peakExecutableBidCents - APEX_PROFIT_GUARD.peakGivebackCents);
    let failureConfirmations = n(state.failureConfirmations);
    let immediateGapThrough = false;

    if (freshObservation) {
      if (peakAdvanced) {
        failureConfirmations = 0;
      } else if (executableBidCents <= trailLineCents + 1e-9) {
        failureConfirmations += 1;
        immediateGapThrough = executableBidCents <= trailLineCents - APEX_PROFIT_GUARD.immediateGapThroughCents + 1e-9;
      } else {
        failureConfirmations = 0;
      }
    }

    const triggered = executableBidCents >= minimumPositivePriceCents && (
      immediateGapThrough || failureConfirmations >= APEX_PROFIT_GUARD.failureConfirmations
    );
    const phase = triggered ? 'APG1_EXIT_COMMITTED' : failureConfirmations > 0 ? 'APG1_CONFIRMING' : 'APG1_ARMED';
    state = await this.persistApexProfitGuardState(entry, {
      ...state, version:APEX_PROFIT_GUARD.version, phase,
      peakExecutableBidCents, trailLineCents, minimumPositivePriceCents, headroomArmPriceCents,
      favorableMoveCents:Math.max(n(state.favorableMoveCents), peakExecutableBidCents - n(entry.entryPriceCents)),
      lastExecutableBidCents:executableBidCents,
      minExecutableBidCents:Math.min(n(state.minExecutableBidCents, executableBidCents), executableBidCents),
      lastObservedBookMs:freshObservation ? observedBookMs : state.lastObservedBookMs,
      failureConfirmations, requiredFailureConfirmations:APEX_PROFIT_GUARD.failureConfirmations,
      immediateGapThrough, executableFull:true, profitFloorLost:false,
      ...(triggered ? { exitCommittedAtMs:Date.now(), triggerExecutableBidCents:executableBidCents } : {}),
    });

    if (peakAdvanced) await this.audit('apg1_peak_ratchet', { id:entry.id, ticker:entry.ticker, concept:entry.conceptName, peakExecutableBidCents, trailLineCents, executableBidCents, minimumPositivePriceCents });
    if (triggered) await this.audit('apg1_exit_committed', { id:entry.id, ticker:entry.ticker, concept:entry.conceptName, peakExecutableBidCents, trailLineCents, executableBidCents, minimumPositivePriceCents, failureConfirmations, immediateGapThrough });
    else if (failureConfirmations > 0) await this.audit('apg1_failure_confirming', { id:entry.id, ticker:entry.ticker, concept:entry.conceptName, peakExecutableBidCents, trailLineCents, executableBidCents, failureConfirmations, requiredFailureConfirmations:APEX_PROFIT_GUARD.failureConfirmations });

    return { q:freshQ, state, armed:true, triggered, committed:triggered, executable:true, executableFull:true, executableBidCents, guardState:phase, minimumPositivePriceCents, headroomArmPriceCents, immediateGapThrough, ...this.apexProfitGuardTelemetry(state, executableBidCents, true) };
  }

  isUpg3ExitDecision(entry, decision) {
    if (String(decision?.reason || '') !== 'ultimate_profit_guard') return false;
    const persisted = ultimateProfitGuardState(entry);
    // Persisted version is authoritative across deployment boundaries. Legacy
    // U-PG1/U-PG2 commitments must retain their original liquidation semantics
    // and must never be reclassified as U-PG3 merely because current telemetry
    // is rendered by the newer runtime.
    if (persisted?.version) return persisted.version === ULTIMATE_PROFIT_GUARD.version;
    return String(decision?.ultimateProfitGuard || '') === ULTIMATE_PROFIT_GUARD.version;
  }

  upg3ExitFloorCents(entry, settings) {
    return this.minimumPositiveProfitPriceCents(entry, remainingCount(entry), settings);
  }

  async persistUltimateProfitGuardState(entry, q, state) {
    const bid = n(q?.yesBid, n(entry.currentPriceCents));
    const peak = Math.max(n(entry.peakPriceCents, entry.entryPriceCents), bid, n(state.peakExecutableBidCents));
    const persisted = { ...state, updatedAtMs:Date.now() };
    await this.db.updateEntry(entry.id, {
      currentPriceCents:bid,
      peakPriceCents:peak,
      stopPriceCents:n(state.dangerLineCents, entry.stopPriceCents),
      profitGuardState:persisted,
      updatedAtMs:Date.now(),
      volume24h:q?.volume24h || entry.volume24h,
    });
    entry.currentPriceCents = bid;
    entry.peakPriceCents = peak;
    entry.stopPriceCents = n(state.dangerLineCents, entry.stopPriceCents);
    entry.profitGuardState = persisted;
    return persisted;
  }

  async migrateLegacyUltimateProfitGuardState(entry, q, state, count, settings, observedBookMs = Date.now()) {
    if (!state || !isLegacyUltimateProfitGuardVersion(state.version)) return state;
    if (isCommittedUltimateProfitGuardPhase(state.phase)) return state;

    const minimumPositivePriceCents = this.minimumPositiveProfitPriceCents(entry, count, settings);
    const economicBreakEvenPriceCents = this.economicBreakEvenPriceCents(entry, count, settings);
    const headroomRequiredCents = ULTIMATE_PROFIT_GUARD.peakGivebackCents + ULTIMATE_PROFIT_GUARD.recoveryBufferCents;
    const headroomArmPriceCents = minimumPositivePriceCents + headroomRequiredCents;
    const peakExecutableBidCents = Math.max(
      n(state.peakExecutableBidCents, entry.entryPriceCents),
      n(entry.peakPriceCents, entry.entryPriceCents),
      n(entry.entryPriceCents),
    );

    // R18's non-committed U-PG2 state may have armed with only +6c and an
    // immediate break-even boundary. If that historical peak never funded the
    // complete U-PG3 breathing room above the positive-profit floor, the safe
    // migration is to disarm profit protection and restore the frozen model
    // stop. Already committed U-PG1/U-PG2 exits are handled before migration
    // and remain sticky.
    if (headroomArmPriceCents > 100 || peakExecutableBidCents < headroomArmPriceCents) {
      const hardStopCents = Math.max(0, n(entry.entryPriceCents) - stopLossForEntry(entry));
      await this.db.updateEntry(entry.id, {
        profitGuardState:{},
        stopPriceCents:hardStopCents,
        updatedAtMs:Date.now(),
      });
      entry.profitGuardState = {};
      entry.stopPriceCents = hardStopCents;
      await this.audit('upg3_legacy_state_disarmed', {
        id:entry.id, ticker:entry.ticker, concept:entry.conceptName,
        fromVersion:state.version, fromPhase:state.phase,
        peakExecutableBidCents, minimumPositivePriceCents,
        economicBreakEvenPriceCents, headroomRequiredCents,
        headroomArmPriceCents, hardStopCents,
      });
      return null;
    }

    const dangerLineCents = peakExecutableBidCents - ULTIMATE_PROFIT_GUARD.peakGivebackCents;
    const structuralLineCents = Math.max(
      minimumPositivePriceCents,
      peakExecutableBidCents - headroomRequiredCents,
    );
    const migrated = {
      version:ULTIMATE_PROFIT_GUARD.version,
      phase:'UPG3_ARMED',
      armedAtMs:n(state.armedAtMs, Date.now()),
      migratedFromVersion:state.version,
      migratedFromPhase:state.phase,
      migratedAtMs:Date.now(),
      minimumPositivePriceCents,
      economicBreakEvenPriceCents,
      headroomRequiredCents,
      headroomArmPriceCents,
      peakExecutableBidCents,
      dangerLineCents,
      structuralLineCents,
      favorableMoveCents:peakExecutableBidCents - n(entry.entryPriceCents),
      penetrationCents:0,
      lastExecutableBidCents:n(state.lastExecutableBidCents, peakExecutableBidCents),
      minExecutableBidCents:n(state.minExecutableBidCents, peakExecutableBidCents),
      lastObservedBookMs:Math.max(n(state.lastObservedBookMs), n(observedBookMs)),
      failureConfirmations:0,
      reclaimConfirmations:0,
      executableFull:true,
      profitFloorLost:false,
    };
    const persisted = await this.persistUltimateProfitGuardState(entry, q, migrated);
    await this.audit('upg3_legacy_state_migrated', {
      id:entry.id, ticker:entry.ticker, concept:entry.conceptName,
      fromVersion:state.version, fromPhase:state.phase,
      minimumPositivePriceCents, economicBreakEvenPriceCents,
      headroomRequiredCents, headroomArmPriceCents,
      peakExecutableBidCents, dangerLineCents, structuralLineCents,
    });
    return persisted;
  }

  ultimateProfitGuardTelemetry(state, executableBidCents = null) {
    if (!state) return {};
    return {
      ultimateProfitGuard:ULTIMATE_PROFIT_GUARD.version,
      upg3Armed:true,
      upg3PeakExecutableBidCents:n(state.peakExecutableBidCents),
      upg3DangerLineCents:n(state.dangerLineCents),
      upg3StructuralLineCents:n(state.structuralLineCents),
      upg3MinimumPositivePriceCents:n(state.minimumPositivePriceCents),
      upg3EconomicBreakEvenPriceCents:n(state.economicBreakEvenPriceCents),
      upg3HeadroomArmPriceCents:n(state.headroomArmPriceCents),
      upg3ExecutableBidCents:executableBidCents == null ? n(state.lastExecutableBidCents) : n(executableBidCents),
      upg3FavorableMoveCents:n(state.favorableMoveCents),
      upg3PenetrationCents:n(state.penetrationCents),
      upg3FailureConfirmations:n(state.failureConfirmations),
      upg3ReclaimConfirmations:n(state.reclaimConfirmations),
      upg3ProfitFloorLost:Boolean(state.profitFloorLost),
    };
  }

  async evaluateUltimateProfitGuard(entry, q, settings) {
    if (FEEDER_CONCEPTS.has(entry.conceptName) || Boolean(q?.result) || finalMarket(q)) return null;
    const count = remainingCount(entry);
    if (count <= 1e-9) return null;

    let state = ultimateProfitGuardState(entry);
    await this.market.ensureFreshBook(entry.ticker, 5000).catch(() => null);
    const freshQ = this.market.getQuote(entry.ticker) || q;
    const bid = n(freshQ?.yesBid);

    if (isCommittedUltimateProfitGuardPhase(state?.phase)) {
      return {
        q:freshQ, executable:false, armed:true, triggered:true, committed:true, state,
        guardState:String(state.phase || '').includes('UPG1') ? 'UPG1_EXIT_COMMITTED'
          : String(state.phase || '').includes('UPG2') ? 'UPG2_EXIT_COMMITTED'
            : 'UPG3_EXIT_COMMITTED',
        executableBidCents:bid,
        ...this.ultimateProfitGuardTelemetry(state, bid),
      };
    }

    const book = this.market.getBook?.(entry.ticker);
    const observedBookMs = Math.max(1, n(book?.updatedAtMs, n(freshQ?.updatedAtMs, Date.now())));
    if (bid <= 0 || !book) {
      if (state?.version === ULTIMATE_PROFIT_GUARD.version) {
        state = await this.persistUltimateProfitGuardState(entry, freshQ, { ...state, phase:'UPG3_WAITING_FOR_FULL_DEPTH' });
      }
      return { q:freshQ, executable:false, state, armed:Boolean(state), triggered:false };
    }

    const minimumPositivePriceCents = this.minimumPositiveProfitPriceCents(entry, count, settings);
    const economicBreakEvenPriceCents = this.economicBreakEvenPriceCents(entry, count, settings);
    const headroomRequiredCents = ULTIMATE_PROFIT_GUARD.peakGivebackCents + ULTIMATE_PROFIT_GUARD.recoveryBufferCents;
    const headroomArmPriceCents = minimumPositivePriceCents + headroomRequiredCents;
    const now = Date.now();

    if (state && isLegacyUltimateProfitGuardVersion(state.version)) {
      state = await this.migrateLegacyUltimateProfitGuardState(entry, freshQ, state, count, settings, observedBookMs);
    }

    // U-PG3 learns and acts only from the full remaining quantity that is
    // actually executable at or ABOVE the dynamic positive-net floor. Unlike
    // U-PG1/U-PG2, deeper profitable bid levels are allowed to contribute to
    // the liquidation VWAP; depth below the floor is deliberately excluded.
    // This measures the economic object we actually care about instead of
    // requiring the entire position to exist at the single best-bid level.
    if (state?.version === ULTIMATE_PROFIT_GUARD.version && bid < minimumPositivePriceCents) {
      const lost = {
        ...state, phase:'UPG3_PROFIT_FLOOR_LOST', executableFull:false,
        minimumPositivePriceCents, economicBreakEvenPriceCents,
        headroomRequiredCents, headroomArmPriceCents,
        lastExecutableBidCents:bid, profitFloorLost:true,
        failureConfirmations:0, reclaimConfirmations:0,
        lastObservedBookMs:observedBookMs,
      };
      state = await this.persistUltimateProfitGuardState(entry, freshQ, lost);
      return {
        q:freshQ, executable:false, armed:true, triggered:false, state,
        guardState:'UPG3_PROFIT_FLOOR_LOST', executableBidCents:bid,
        profitFloorLost:true, economicBreakEvenTriggered:false,
        ...this.ultimateProfitGuardTelemetry(state, bid),
      };
    }

    const exec = this.market.executableBid(entry.ticker, count, minimumPositivePriceCents);
    const executableFull = Boolean(exec?.full && n(exec.filled) + 1e-9 >= count && n(exec.avgCents) >= minimumPositivePriceCents);
    if (!executableFull) {
      if (state?.version === ULTIMATE_PROFIT_GUARD.version) {
        const waiting = {
          ...state, phase:'UPG3_WAITING_FOR_FULL_DEPTH', executableFull:false,
          minimumPositivePriceCents, economicBreakEvenPriceCents,
          headroomRequiredCents, headroomArmPriceCents,
        };
        state = await this.persistUltimateProfitGuardState(entry, freshQ, waiting);
      }
      return {
        q:freshQ, executable:false, state, armed:Boolean(state), triggered:false,
        minimumPositivePriceCents, economicBreakEvenPriceCents,
        headroomRequiredCents, headroomArmPriceCents,
      };
    }

    const executableBidCents = n(exec.avgCents);
    const favorableMoveCents = executableBidCents - n(entry.entryPriceCents);

    if (!state) {
      const headroomQualified = headroomArmPriceCents <= 100 && executableBidCents >= headroomArmPriceCents;
      if (favorableMoveCents < ULTIMATE_PROFIT_GUARD.activationMoveCents || !headroomQualified) {
        return {
          q:freshQ, executable:true, armed:false, triggered:false,
          executableBidCents, favorableMoveCents, minimumPositivePriceCents,
          economicBreakEvenPriceCents, headroomRequiredCents, headroomArmPriceCents,
          headroomQualified:false,
        };
      }

      const peakExecutableBidCents = executableBidCents;
      const dangerLineCents = peakExecutableBidCents - ULTIMATE_PROFIT_GUARD.peakGivebackCents;
      const structuralLineCents = Math.max(
        minimumPositivePriceCents,
        peakExecutableBidCents - headroomRequiredCents,
      );
      state = {
        version:ULTIMATE_PROFIT_GUARD.version,
        phase:'UPG3_ARMED',
        armedAtMs:now,
        peakExecutableBidCents,
        dangerLineCents,
        structuralLineCents,
        minimumPositivePriceCents,
        economicBreakEvenPriceCents,
        headroomRequiredCents,
        headroomArmPriceCents,
        favorableMoveCents,
        penetrationCents:0,
        lastExecutableBidCents:executableBidCents,
        minExecutableBidCents:executableBidCents,
        lastObservedBookMs:observedBookMs,
        failureConfirmations:0,
        reclaimConfirmations:0,
        executableFull:true,
        profitFloorLost:false,
      };
      state = await this.persistUltimateProfitGuardState(entry, freshQ, state);
      await this.audit('upg3_armed', {
        id:entry.id, ticker:entry.ticker, concept:entry.conceptName,
        entryPriceCents:n(entry.entryPriceCents), executableBidCents,
        favorableMoveCents, peakExecutableBidCents, dangerLineCents,
        structuralLineCents, minimumPositivePriceCents, economicBreakEvenPriceCents,
        headroomRequiredCents, headroomArmPriceCents,
      });
      return {
        q:freshQ, executable:true, armed:true, triggered:false, state,
        guardState:'UPG3_ARMED', executableBidCents,
        ...this.ultimateProfitGuardTelemetry(state, executableBidCents),
      };
    }

    const freshObservation = observedBookMs > n(state.lastObservedBookMs);
    const priorPhase = state.phase;
    const priorPeak = n(state.peakExecutableBidCents, executableBidCents);
    const peakExecutableBidCents = Math.max(priorPeak, executableBidCents);
    const dangerLineCents = Math.max(
      n(state.dangerLineCents),
      peakExecutableBidCents - ULTIMATE_PROFIT_GUARD.peakGivebackCents,
    );
    const structuralLineCents = Math.max(
      n(state.structuralLineCents),
      minimumPositivePriceCents,
      peakExecutableBidCents - headroomRequiredCents,
    );
    const penetrationCents = Math.max(0, dangerLineCents - executableBidCents);
    const profitFloorLost = executableBidCents < minimumPositivePriceCents;
    const priorRecoveryPhase = isRecoveryUltimateProfitGuardPhase(priorPhase);
    let failureConfirmations = n(state.failureConfirmations);
    let reclaimConfirmations = n(state.reclaimConfirmations);
    let phase = 'UPG3_ARMED';

    if (freshObservation) {
      if (profitFloorLost) {
        // Once positive-profit execution is unavailable, U-PG3 has no sell
        // jurisdiction. It stays observable for a possible recovery, while
        // U-SG1 exclusively manages the loss domain.
        failureConfirmations = 0;
        reclaimConfirmations = 0;
      } else if (executableBidCents <= structuralLineCents) {
        failureConfirmations += 1;
        reclaimConfirmations = 0;
      } else if (executableBidCents <= dangerLineCents) {
        failureConfirmations = 0;
        reclaimConfirmations = 0;
      } else if (priorRecoveryPhase && executableBidCents >= dangerLineCents + ULTIMATE_PROFIT_GUARD.reclaimBufferCents) {
        reclaimConfirmations += 1;
        failureConfirmations = 0;
      } else if (priorRecoveryPhase) {
        failureConfirmations = 0;
        reclaimConfirmations = 0;
      } else {
        failureConfirmations = 0;
        reclaimConfirmations = 0;
      }
    }

    // At the exact minimum-positive floor there is no additional profitable
    // cent available for a second confirmation, so the full 11c drawdown itself
    // is sufficient confirmation. Above that floor the original two-fresh-
    // observation structural confirmation remains intact.
    const requiredFailureConfirmations = structuralLineCents <= minimumPositivePriceCents
      ? 1
      : ULTIMATE_PROFIT_GUARD.structuralFailureConfirmations;
    const immediateGapThrough = freshObservation
      && !profitFloorLost
      && executableBidCents >= minimumPositivePriceCents
      && executableBidCents <= structuralLineCents - ULTIMATE_PROFIT_GUARD.immediateGapThroughCents;
    const triggered = !profitFloorLost && (
      immediateGapThrough
      || failureConfirmations >= requiredFailureConfirmations
    );

    if (profitFloorLost) phase = 'UPG3_PROFIT_FLOOR_LOST';
    else if (triggered) phase = 'UPG3_EXIT_TRIGGERED';
    else if (executableBidCents <= structuralLineCents) phase = 'UPG3_FAILURE_CONFIRMING';
    else if (executableBidCents <= dangerLineCents) phase = 'UPG3_RECOVERY_ZONE';
    else if (priorRecoveryPhase && reclaimConfirmations > 0) phase = 'UPG3_RECLAIMING';

    const recovered = priorRecoveryPhase
      && !profitFloorLost
      && reclaimConfirmations >= ULTIMATE_PROFIT_GUARD.reclaimConfirmations;
    if (recovered) {
      phase = 'UPG3_ARMED';
      reclaimConfirmations = 0;
      failureConfirmations = 0;
    }

    state = {
      ...state,
      version:ULTIMATE_PROFIT_GUARD.version,
      phase,
      peakExecutableBidCents,
      dangerLineCents,
      structuralLineCents,
      minimumPositivePriceCents,
      economicBreakEvenPriceCents,
      headroomRequiredCents,
      headroomArmPriceCents,
      favorableMoveCents:Math.max(n(state.favorableMoveCents), peakExecutableBidCents - n(entry.entryPriceCents)),
      penetrationCents,
      lastExecutableBidCents:executableBidCents,
      minExecutableBidCents:Math.min(n(state.minExecutableBidCents, executableBidCents), executableBidCents),
      lastObservedBookMs:freshObservation ? observedBookMs : state.lastObservedBookMs,
      failureConfirmations,
      reclaimConfirmations,
      requiredFailureConfirmations,
      executableFull:true,
      profitFloorLost,
      economicBreakEvenTriggered:false,
    };
    state = await this.persistUltimateProfitGuardState(entry, freshQ, state);

    if (recovered) {
      await this.audit('upg3_recovered', {
        id:entry.id, ticker:entry.ticker, concept:entry.conceptName,
        executableBidCents, dangerLineCents, structuralLineCents,
        minimumPositivePriceCents, economicBreakEvenPriceCents,
        peakExecutableBidCents,
      });
    } else if (priorPhase !== phase) {
      await this.audit('upg3_state_changed', {
        id:entry.id, ticker:entry.ticker, from:priorPhase, to:phase,
        executableBidCents, dangerLineCents, structuralLineCents,
        minimumPositivePriceCents, economicBreakEvenPriceCents,
        profitFloorLost, failureConfirmations, reclaimConfirmations,
        requiredFailureConfirmations,
      });
    }

    return {
      q:freshQ, executable:true, armed:true, triggered, state,
      guardState:phase, executableBidCents, immediateGapThrough,
      profitFloorLost, requiredFailureConfirmations,
      economicBreakEvenTriggered:false,
      ...this.ultimateProfitGuardTelemetry(state, executableBidCents),
    };
  }

  async reconcilePending(entry) {
    if (entry.mode !== 'LIVE' || !entry.entryClientOrderId) return entry;
    const inspected = await this.kalshi.inspectOrderByClientId(
      entry.ticker,
      entry.entryClientOrderId,
      Math.floor(entry.openedAtMs / 1000) - 120,
      2,
    ).catch(() => ({ found: false, authoritative: false, order: null }));

    const truth = inspected.order;
    if (truth?.fillCount > 0) {
      const price = Math.round(truth.averageFillPriceCents ?? entry.entryPriceCents);
      const settings=this.getSettings();
      const fee = Number.isFinite(Number(truth.feePaidCents))
        ? Number(truth.feePaidCents)
        : n(settings.simFeeCents) * truth.fillCount;
      let entryConfig=entry.entryConfig&&typeof entry.entryConfig==='object'?structuredClone(entry.entryConfig):{};
      let stopLossCents=n(entry.stopLossCents);
      let stopPriceCents=n(entry.stopPriceCents);
      let forcedProtectionReason=null;
      if(entryConfig?.auroraPending?.version===AURORA_EXECUTION.version && !(entryConfig?.aurora?.frozen===true)){
        const frozenDamagePercent=n(entryConfig?.auroraDamageControlPercent,n(entryConfig?.athenaFire?.auroraDamageControlPercent,n(settings.auroraDamageControlPercent,AURORA_EXECUTION.defaultDamageControlPercent)));
        const aurora=calculateAuroraSnapshotFromFeeModel({entryPriceCents:price,count:truth.fillCount,entryFeeCents:fee,mode:'LIVE',simFeeCents:n(settings.simFeeCents),damageControlPercent:frozenDamagePercent,calculatedAtMs:Date.now()});
        delete entryConfig.auroraPending;
        if(!aurora.ok){
          // The BUY was durably owned before submission. If the exact broker fill
          // economics cannot satisfy the frozen Aurora damage-control covenant, do not invent a
          // wider stop: persist a tight fail-safe line and commit a full-position
          // protection exit on the next protection step.
          const qty=Math.max(1,n(truth.fillCount,1));
          const maxLoss=price*qty*(frozenDamagePercent/100);
          const emergencyPriceLoss=qty;
          const withinOneCent=(emergencyPriceLoss+fee)<=maxLoss+1e-9;
          entryConfig.auroraFault={version:AURORA_EXECUTION.version,policyRevision:AURORA_EXECUTION.policyRevision,reason:aurora.reason||'reconciled_fee_overrun',detectedAtMs:Date.now(),unprotectable:!withinOneCent};
          stopLossCents=1;
          stopPriceCents=Math.max(0,price-1);
          forcedProtectionReason='aurora_covenant_fault';
          await this.audit('aurora_reconciled_fee_covenant_fault',{id:entry.id,ticker:entry.ticker,reason:entryConfig.auroraFault.reason,entryPriceCents:price,count:truth.fillCount,entryFeeCents:fee,withinOneCent},'error');
        }else{
          stopLossCents=n(aurora.stopDistanceCents);
          stopPriceCents=n(aurora.dangerPriceCents);
          entryConfig.aurora=aurora;
        }
      }
      const patch = {
        status:forcedProtectionReason?'exit_pending':'open',entryPriceCents:price,entryOrderId:truth.orderId,count:truth.fillCount,remainingCount:truth.fillCount,entryFeeCents:fee,
        currentPriceCents:price,peakPriceCents:price,stopLossCents,stopPriceCents,entryConfig,closeReason:forcedProtectionReason,updatedAtMs:Date.now(),
      };
      await this.db.updateEntry(entry.id, patch);
      await this.audit('entry_pending_reconciled_fill', { id:entry.id,ticker:entry.ticker,clientOrderId:entry.entryClientOrderId,fillCount:truth.fillCount,priceCents:price,auroraVersion:entryConfig?.aurora?.version||null,auroraDangerPriceCents:entryConfig?.aurora?.dangerPriceCents??null });
      return { ...entry, ...patch, entryPriceCents: price };
    }

    if (truth && terminalOrder(truth)) {
      await this.db.updateEntry(entry.id, { status: 'rejected', remainingCount: 0, entryOrderId: truth.orderId, updatedAtMs: Date.now() });
      await this.audit('entry_pending_reconciled_unfilled', { id: entry.id, ticker: entry.ticker, clientOrderId: entry.entryClientOrderId, orderId: truth.orderId });
      return { ...entry, status: 'rejected', remainingCount: 0, entryOrderId: truth.orderId };
    }

    if (!truth && inspected.authoritative && Date.now() - n(entry.updatedAtMs, entry.openedAtMs) >= AMBIGUOUS_ORDER_GRACE_MS) {
      await this.db.updateEntry(entry.id, { status: 'rejected', remainingCount: 0, updatedAtMs: Date.now() });
      await this.audit('entry_pending_order_absent', { id: entry.id, ticker: entry.ticker, clientOrderId: entry.entryClientOrderId });
      return { ...entry, status: 'rejected', remainingCount: 0 };
    }
    return entry;
  }

  async applyExitFill(entry, decision, { fillCount, fillPriceCents, exitFeeCents = 0, orderId = null, clearClientId = true }) {
    const s = this.getSettings();
    const filled = Math.max(0, Math.min(remainingCount(entry), n(fillCount)));
    if (filled <= 0) return { closed: false, remaining: remainingCount(entry), filled: 0 };
    const px = Math.max(0, Math.min(100, n(fillPriceCents)));
    const remaining = Math.max(0, remainingCount(entry) - filled);
    const entryFeeShare = allocatedEntryFee(entry, filled, s);
    const realized = (px - n(entry.entryPriceCents)) * filled - entryFeeShare - n(exitFeeCents);
    const pnl = n(entry.pnlCents) + realized;
    const exitFilledCount = n(entry.exitFilledCount) + filled;
    const exitNotionalCents = n(entry.exitNotionalCents) + px * filled;
    const averageExit = exitFilledCount > 0 ? Math.round(exitNotionalCents / exitFilledCount) : px;
    const closedAtMs = remaining <= 1e-9 ? Date.now() : null;
    const profitLearningTrade = this.isProfitLearningTrade(entry);
    const pri1Exit = this.isProtectedRunnerExitDecision(entry, decision);
    const x1Exit = this.isAthenaExitDecision(entry, decision);
    const goldenEyeExit = this.isGoldenEyeExitDecision(entry, decision);
    const atomicThunderExit = this.isAtomicThunderExitDecision(entry, decision);
    let nextPri1State = null;
    let nextX1State = null;
    if (pri1Exit) {
      const prior = activeProtectedRunnerState(entry) || {};
      nextPri1State = {
        ...prior, version:PROTECTED_RUNNER_INTELLIGENCE.version,
        phase:remaining <= 1e-9 ? 'PRI1_EXIT_FILLED' : 'PRI1_EXIT_COMMITTED',
        exitFilledCount, exitVwapCents:averageExit, realizedNetCents:pnl,
        remainingCount:remaining, lastFillPriceCents:px, lastFillCount:filled,
        exitOrderId:orderId || entry.exitOrderId || null,
        ...(remaining <= 1e-9 ? { exitFilledAtMs:closedAtMs } : {}),
        updatedAtMs:Date.now(),
      };
    }
    if (x1Exit) {
      const prior = activeAthenaExitState(entry) || {};
      nextX1State = {
        ...prior, version:ATHENA_EXIT_INTELLIGENCE.version, policyRevision:athenaExitPolicyRevision(entry)||ATHENA_EXIT_INTELLIGENCE.policyRevision,
        phase:remaining <= 1e-9 ? 'X1_EXIT_FILLED' : 'X1_EXIT_COMMITTED',
        exitFilledCount, exitVwapCents:averageExit, realizedNetCents:pnl,
        remainingCount:remaining, lastFillPriceCents:px, lastFillCount:filled,
        exitOrderId:orderId || entry.exitOrderId || null,
        ...(remaining <= 1e-9 ? { exitFilledAtMs:closedAtMs } : {}),
        updatedAtMs:Date.now(),
      };
    }
    const patch = {
      status: remaining <= 1e-9 ? 'closed' : 'exit_pending',
      remainingCount: remaining,
      pnlCents: pnl,
      exitFeeCents: n(entry.exitFeeCents) + n(exitFeeCents),
      exitFilledCount,
      exitNotionalCents,
      exitPriceCents: averageExit,
      currentPriceCents: px,
      peakPriceCents: decision.peakPriceCents ?? entry.peakPriceCents,
      stopPriceCents: decision.stopPriceCents ?? entry.stopPriceCents,
      exitOrderId: orderId || entry.exitOrderId,
      exitClientOrderId: clearClientId ? null : entry.exitClientOrderId,
      closeReason: decision.reason,
      closedAtMs,
      // Every R32 Hunter remains research-active after a non-terminal exit so
      // PLI1 can measure post-exit executable opportunity and regret. Legacy
      // rows keep the pre-R32 lifecycle unchanged.
      researchTrackingComplete: remaining <= 1e-9
        ? (profitLearningTrade ? false : decision.reason !== 'hard_stop_loss')
        : Boolean(entry.researchTrackingComplete),
      ...(nextX1State ? { profitGuardState:nextX1State } : nextPri1State ? { profitGuardState:nextPri1State } : {}),
      updatedAtMs: Date.now(),
    };
    await this.db.updateEntry(entry.id, patch);

    const closedEntry = { ...entry, ...patch };
    if(remaining<=1e-9)await this.completeOpportunityEpisode(closedEntry,{closedAtMs}).catch(()=>{});
    if (profitLearningTrade && remaining <= 1e-9 && typeof this.learning?.markProfitExit === 'function') {
      // Economic truth is already durable above. Keep all PLI1 I/O off the
      // protection critical path while preserving per-entry ordering behind the
      // final pre-exit observation. Shutdown and post-exit research drain this
      // queue with bounded waits.
      this.queueProfitLearningTask(closedEntry,'exit_mark',()=>this.learning.markProfitExit(closedEntry,{
        realizedNetCents:pnl, exitVwapCents:averageExit, closedAtMs, closeReason:decision.reason,
      }));
    }
    if (pri1Exit) {
      await this.audit(remaining <= 1e-9 ? 'pri1_exit_filled' : 'pri1_exit_partial', {
        id:entry.id, ticker:entry.ticker, concept:entry.conceptName, filled, remaining,
        fillPriceCents:px, exitVwapCents:averageExit, realizedNetCents:pnl,
      });
    }
    if (x1Exit) {
      await this.audit(remaining <= 1e-9 ? 'athena_x1_exit_filled' : 'athena_x1_exit_partial', {
        id:entry.id, ticker:entry.ticker, concept:entry.conceptName, filled, remaining,
        fillPriceCents:px, exitVwapCents:averageExit, realizedNetCents:pnl,
      });
    }
    if (goldenEyeExit) {
      await this.audit(remaining <= 1e-9 ? 'golden_eye_exit_filled' : 'golden_eye_exit_partial', {
        id:entry.id, ticker:entry.ticker, concept:entry.conceptName, filled, remaining,
        fillPriceCents:px, exitVwapCents:averageExit, realizedNetCents:pnl,
      });
    }
    if (atomicThunderExit) {
      const infinityBreakExit = this.isInfinityBreakTrade(entry);
      const eventType = remaining <= 1e-9 ? 'harvest_executed' : 'harvest_partial';
      await this.recordAtomicThunderEvent(closedEntry, eventType, {
        concept:entry.conceptName, sourceFeeder:entry.sourceFeeder || null, filled, remaining,
        fillPriceCents:px, exitVwapCents:averageExit, realizedNetCents:pnl,
        timeToHarvestMs:closedAtMs ? Math.max(0, closedAtMs - n(entry.openedAtMs)) : null,
        targetNetCents:n(decision.atomicThunderTargetNetCents),
        executableNetCents:n(decision.atomicThunderExecutableNetCents),
      });
      await this.audit(infinityBreakExit
        ? (remaining <= 1e-9 ? 'infinity_break_filled' : 'infinity_break_partial')
        : (remaining <= 1e-9 ? 'atomic_thunder_harvest_filled' : 'atomic_thunder_harvest_partial'), {
        id:entry.id, ticker:entry.ticker, concept:entry.conceptName, filled, remaining,
        fillPriceCents:px, exitVwapCents:averageExit, realizedNetCents:pnl,
      });
      if (remaining <= 1e-9) this.atomicThunderStates.delete(entry.id);
    }
    if(remaining<=1e-9&&pnl>0&&this.isInfinityBreakExitDecision(closedEntry,decision))this.notifyPositionClosed(closedEntry);
    return { closed: remaining <= 1e-9, remaining, filled, fillPriceCents: px, pnlCents: pnl, patch };
  }

  async closeAtSettlement(entry, decision) {
    const s = this.getSettings();
    const remain = remainingCount(entry);
    const payout = n(decision.exitPriceCents);
    const closedAtMs = Date.now();
    const x1Trade = this.isAthenaExitTrade(entry);
    const profitLearningTrade = this.isProfitLearningTrade(entry);
    const priorPri1 = activeProtectedRunnerState(entry);
    const settlementPri1State = priorPri1 ? {
      ...priorPri1, version:PROTECTED_RUNNER_INTELLIGENCE.version, phase:'PRI1_SETTLED',
      settlementPriceCents:payout, settlementReason:decision.reason, settledAtMs:closedAtMs, updatedAtMs:closedAtMs,
    } : null;
    const priorX1 = activeAthenaExitState(entry);
    const settlementX1State = x1Trade ? {
      ...(priorX1 || {}), version:ATHENA_EXIT_INTELLIGENCE.version, policyRevision:athenaExitPolicyRevision(entry)||ATHENA_EXIT_INTELLIGENCE.policyRevision, phase:'X1_SETTLED',
      settlementPriceCents:payout, settlementReason:decision.reason, settledAtMs:closedAtMs, updatedAtMs:closedAtMs,
    } : null;

    if (remain <= 1e-9) {
      const patch = {
        status:'closed', remainingCount:0, closeReason:decision.reason, researchTrackingComplete:true,
        closedAtMs, updatedAtMs:closedAtMs, ...(settlementX1State ? { profitGuardState:settlementX1State } : settlementPri1State ? { profitGuardState:settlementPri1State } : {}),
      };
      await this.db.updateEntry(entry.id, patch);
      const closedEntry={...entry,...patch};
      await this.completeOpportunityEpisode(closedEntry,{closedAtMs}).catch(()=>{});
      if(profitLearningTrade){
        this.queueProfitLearningTask(closedEntry,'settlement_finalize',async()=>{
          if(typeof this.learning?.markProfitExit==='function')await this.learning.markProfitExit(closedEntry,{realizedNetCents:n(closedEntry.pnlCents),exitVwapCents:payout,closedAtMs,closeReason:decision.reason});
          if(typeof this.learning?.finalizeProfitLearning==='function')await this.learning.finalizeProfitLearning(closedEntry,{finalResult:payout>=100?'yes':'no',terminalNetCents:n(closedEntry.pnlCents),reason:'market_final'});
        });
      }
      return { closed:true, exitPrice:payout };
    }
    const entryFeeShare = allocatedEntryFee(entry, remain, s);
    const realized = (payout - n(entry.entryPriceCents)) * remain - entryFeeShare;
    const pnl = n(entry.pnlCents) + realized;
    const filledTotal = n(entry.exitFilledCount) + remain;
    const notional = n(entry.exitNotionalCents) + payout * remain;
    const averageExit = filledTotal > 0 ? Math.round(notional / filledTotal) : payout;
    const patch = {
      status:'closed', remainingCount:0, pnlCents:pnl,
      exitFilledCount:filledTotal, exitNotionalCents:notional, exitPriceCents:averageExit,
      currentPriceCents:payout,
      peakPriceCents:Math.max(n(entry.peakPriceCents, entry.entryPriceCents), payout),
      stopPriceCents:decision.stopPriceCents ?? entry.stopPriceCents,
      exitClientOrderId:null, closeReason:decision.reason, researchTrackingComplete:true,
      closedAtMs, updatedAtMs:closedAtMs, ...(settlementX1State ? { profitGuardState:settlementX1State } : settlementPri1State ? { profitGuardState:settlementPri1State } : {}),
    };
    await this.db.updateEntry(entry.id, patch);
    const closedEntry={...entry,...patch};
    await this.completeOpportunityEpisode(closedEntry,{closedAtMs}).catch(()=>{});
    if(profitLearningTrade){
      this.queueProfitLearningTask(closedEntry,'settlement_finalize',async()=>{
        if(typeof this.learning?.markProfitExit==='function')await this.learning.markProfitExit(closedEntry,{realizedNetCents:pnl,exitVwapCents:averageExit,closedAtMs,closeReason:decision.reason});
        if(typeof this.learning?.finalizeProfitLearning==='function')await this.learning.finalizeProfitLearning(closedEntry,{finalResult:payout>=100?'yes':'no',terminalNetCents:pnl,reason:'market_final'});
      });
    }
    return { closed:true, exitPrice:payout, pnlCents:pnl };
  }

  async simulationExit(entry, decision, q) {
    const s = this.getSettings();
    const goldenEyeExitPre = this.isGoldenEyeExitDecision(entry, decision);
    const atomicThunderExitPre = this.isAtomicThunderExitDecision(entry, decision);
    const atomicPolicyPre = atomicThunderExitPre ? this.atomicThunderPolicy(entry, s) : null;
    const requiredBookAgeMs = atomicThunderExitPre ? atomicPolicyPre.maximumBookAgeMs : goldenEyeExitPre ? GOLDEN_EYE.maximumExecutionBookAgeMs : 5000;
    await this.market.ensureFreshBook(entry.ticker, requiredBookAgeMs).catch(() => null);
    const freshQ = this.market.getQuote(entry.ticker) || q;
    const book = this.market.getBook(entry.ticker);
    const bookMs = n(book?.updatedAtMs);
    if (entry.exitAttemptBookMs && bookMs > 0 && bookMs <= n(entry.exitAttemptBookMs)) {
      this.setState(entry, { ...decision, action: 'committed_exit', guardState: 'EXIT_PENDING_BOOK_REFRESH' });
      return { closed: false, pending: true, remaining: remainingCount(entry), skipped: 'waiting_for_book_refresh' };
    }
    const bid = n(freshQ?.yesBid);
    const upg3Exit = this.isUpg3ExitDecision(entry, decision);
    const apexExit = this.isApexProfitGuardExitDecision(entry, decision);
    const pri1Exit = this.isProtectedRunnerExitDecision(entry, decision);
    const x1Exit = this.isAthenaExitDecision(entry, decision);
    const goldenEyeExit = goldenEyeExitPre;
    const atomicThunderExit = atomicThunderExitPre;
    const infinityBreakExit = atomicThunderExit && this.isInfinityBreakTrade(entry);
    const emergencyExit = String(decision?.reason||'') === 'emergency_exit';
    const auroraCovenantFaultExit = String(decision?.reason||'') === 'aurora_covenant_fault';
    const atomicPolicy = atomicThunderExit ? this.atomicThunderPolicy(entry, s) : null;
    const profitProtectedExit = upg3Exit || apexExit || pri1Exit || x1Exit || goldenEyeExit || atomicThunderExit;
    const fullPositionExit = atomicThunderExit || x1Exit || goldenEyeExit || emergencyExit || auroraCovenantFaultExit;
    if (atomicThunderExit && (!book || bookMs <= 0 || Date.now() - bookMs > atomicPolicy.maximumBookAgeMs || freshQ?.bookInvalid)) {
      await this.audit(infinityBreakExit?'infinity_break_exit_waiting_executable_book':'atomic_thunder_exit_waiting_executable_book', { id:entry.id, ticker:entry.ticker, mode:'SIMULATION', bidCents:bid, remaining:remainingCount(entry), reason:'stale_or_invalid_book' }, 'warning');
      return { closed:false, pending:false, remaining:remainingCount(entry), skipped:infinityBreakExit?'infinity_break_stale_book':'atomic_thunder_stale_book' };
    }
    if (pri1Exit && (!book || bookMs <= 0 || Date.now() - bookMs > 5000 || freshQ?.bookInvalid)) {
      await this.audit('pri1_exit_waiting_capital_execution', { id:entry.id, ticker:entry.ticker, mode:'SIMULATION', bidCents:bid, remaining:remainingCount(entry), reason:'stale_or_invalid_book' });
      return { closed:false, pending:false, remaining:remainingCount(entry), skipped:'pri1_stale_book' };
    }
    if (x1Exit && (!book || !athenaExitBookTimestampFresh(bookMs) || freshQ?.bookInvalid)) {
      await this.audit('athena_x1_exit_waiting_capital_execution', { id:entry.id, ticker:entry.ticker, mode:'SIMULATION', bidCents:bid, remaining:remainingCount(entry), reason:'stale_or_invalid_book' });
      return { closed:false, pending:false, remaining:remainingCount(entry), skipped:'athena_x1_stale_book' };
    }
    if (goldenEyeExit && (!book || bookMs <= 0 || Date.now() - bookMs > GOLDEN_EYE.maximumExecutionBookAgeMs || freshQ?.bookInvalid)) {
      await this.audit('golden_eye_exit_waiting_executable_book', { id:entry.id, ticker:entry.ticker, mode:'SIMULATION', bidCents:bid, remaining:remainingCount(entry), reason:'stale_or_invalid_book' });
      return { closed:false, pending:false, remaining:remainingCount(entry), skipped:'golden_eye_stale_book' };
    }
    if (apexExit && (!book || bookMs <= 0 || Date.now() - bookMs > 5000 || freshQ?.bookInvalid)) {
      await this.audit('apex_profit_guard_exit_waiting_positive_execution', { id:entry.id, ticker:entry.ticker, mode:'SIMULATION', bidCents:bid, remaining:remainingCount(entry), reason:'stale_or_invalid_book' });
      return { closed:false, pending:false, remaining:remainingCount(entry), skipped:'apex_profit_guard_stale_book' };
    }
    if (bid <= 0 || !book) {
      if (atomicThunderExit) {
        await this.audit(infinityBreakExit?'infinity_break_exit_waiting_executable_book':'atomic_thunder_exit_waiting_executable_book', { id:entry.id, ticker:entry.ticker, mode:'SIMULATION', bidCents:bid, remaining:remainingCount(entry), reason:'no_executable_bid' });
        return { closed:false, pending:false, remaining:remainingCount(entry), skipped:infinityBreakExit?'infinity_break_no_executable_bid':'atomic_thunder_no_executable_bid' };
      }
      if (goldenEyeExit) {
        await this.audit('golden_eye_exit_waiting_executable_book', { id:entry.id, ticker:entry.ticker, mode:'SIMULATION', bidCents:bid, remaining:remainingCount(entry), reason:'no_executable_bid' });
        return { closed:false, pending:false, remaining:remainingCount(entry), skipped:'golden_eye_no_executable_bid' };
      }
      if (pri1Exit) {
        await this.audit('pri1_exit_waiting_capital_execution', { id:entry.id, ticker:entry.ticker, mode:'SIMULATION', bidCents:bid, remaining:remainingCount(entry), reason:'no_executable_bid' });
        return { closed:false, pending:false, remaining:remainingCount(entry), skipped:'pri1_no_executable_bid' };
      }
      if (x1Exit) {
        await this.audit('athena_x1_exit_waiting_capital_execution', { id:entry.id, ticker:entry.ticker, mode:'SIMULATION', bidCents:bid, remaining:remainingCount(entry), reason:'no_executable_bid' });
        return { closed:false, pending:false, remaining:remainingCount(entry), skipped:'athena_x1_no_executable_bid' };
      }
      if (apexExit) {
        await this.audit('apex_profit_guard_exit_waiting_positive_execution', { id:entry.id, ticker:entry.ticker, mode:'SIMULATION', bidCents:bid, remaining:remainingCount(entry), reason:'no_executable_bid' });
        return { closed:false, pending:false, remaining:remainingCount(entry), skipped:'apex_profit_guard_no_executable_bid' };
      }
      await this.db.updateEntry(entry.id, {
        status: 'exit_pending', closeReason: decision.reason,
        peakPriceCents: decision.peakPriceCents ?? entry.peakPriceCents,
        stopPriceCents: decision.stopPriceCents ?? entry.stopPriceCents,
        exitAttemptBookMs: bookMs || entry.exitAttemptBookMs || 0,
        updatedAtMs: Date.now(),
      });
      return { closed: false, pending: true, remaining: remainingCount(entry), skipped: 'no_executable_bid' };
    }
    const exitFloorCents = profitProtectedExit ? (atomicThunderExit ? this.atomicThunderExitFloorCents(entry, s) : goldenEyeExit ? this.goldenEyeBreakEvenPriceCents(entry, s) : x1Exit ? this.athenaExitBreakEvenPriceCents(entry, s) : pri1Exit ? this.protectedRunnerBreakEvenPriceCents(entry, s) : apexExit ? this.apexProfitGuardExitFloorCents(entry, s) : this.upg3ExitFloorCents(entry, s)) : bid;
    if (profitProtectedExit && bid < exitFloorCents) {
      if (atomicThunderExit) {
        await this.audit(infinityBreakExit?'infinity_break_exit_window_lost':'atomic_thunder_exit_window_lost', { id:entry.id, ticker:entry.ticker, mode:'SIMULATION', bidCents:bid, profitFloorCents:exitFloorCents, remaining:remainingCount(entry) }, 'warning');
        return { closed:false, pending:false, remaining:remainingCount(entry), skipped:infinityBreakExit?'infinity_break_profit_floor_unavailable':'atomic_thunder_profit_floor_unavailable' };
      }
      if (goldenEyeExit) {
        await this.audit('golden_eye_exit_waiting_positive_execution', { id:entry.id, ticker:entry.ticker, mode:'SIMULATION', bidCents:bid, breakEvenPriceCents:exitFloorCents, remaining:remainingCount(entry), reason:'capital_floor_unavailable' });
        return { closed:false, pending:false, remaining:remainingCount(entry), skipped:'golden_eye_capital_floor_unavailable' };
      }
      if (x1Exit) {
        await this.audit('athena_x1_exit_suspended_to_stop_guard', {
          id:entry.id, ticker:entry.ticker, mode:'SIMULATION', bidCents:bid,
          breakEvenPriceCents:exitFloorCents, remaining:remainingCount(entry), reason:'capital_floor_unavailable',
        }, 'warning');
        return { closed:false, pending:false, remaining:remainingCount(entry), skipped:'athena_x1_capital_floor_unavailable' };
      }
      if (pri1Exit) {
        await this.audit('pri1_exit_suspended_to_stop_guard', {
          id:entry.id, ticker:entry.ticker, mode:'SIMULATION', bidCents:bid,
          breakEvenPriceCents:exitFloorCents, remaining:remainingCount(entry), reason:'capital_floor_unavailable',
        }, 'warning');
        return { closed:false, pending:false, remaining:remainingCount(entry), skipped:'pri1_capital_floor_unavailable' };
      }
      if (apexExit) {
        await this.audit('apex_profit_guard_exit_waiting_positive_execution', {
          id:entry.id, ticker:entry.ticker, mode:'SIMULATION', bidCents:bid,
          minimumPositivePriceCents:exitFloorCents, remaining:remainingCount(entry), reason:'profit_floor_unavailable',
        });
        return { closed:false, pending:false, remaining:remainingCount(entry), skipped:'apex_profit_guard_profit_floor_unavailable' };
      }
      await this.db.updateEntry(entry.id, {
        status: 'exit_pending', closeReason: decision.reason,
        peakPriceCents: decision.peakPriceCents ?? entry.peakPriceCents,
        stopPriceCents: decision.stopPriceCents ?? entry.stopPriceCents,
        exitAttemptBookMs: bookMs,
        updatedAtMs: Date.now(),
      });
      await this.audit('upg3_exit_waiting_positive_execution', {
        id:entry.id, ticker:entry.ticker, mode:'SIMULATION', bidCents:bid,
        minimumPositivePriceCents:exitFloorCents, remaining:remainingCount(entry),
      });
      return { closed:false, pending:true, remaining:remainingCount(entry), skipped:'upg3_profit_floor_unavailable' };
    }
    const exec = this.market.executableBid(entry.ticker, remainingCount(entry), exitFloorCents);
    if (!exec || exec.filled <= 0) {
      if (atomicThunderExit) {
        await this.audit(infinityBreakExit?'infinity_break_exit_waiting_executable_book':'atomic_thunder_exit_waiting_executable_book', { id:entry.id, ticker:entry.ticker, mode:'SIMULATION', bidCents:bid, profitFloorCents:exitFloorCents, remaining:remainingCount(entry), reason:'no_executable_bid' });
        return { closed:false, pending:false, remaining:remainingCount(entry), skipped:infinityBreakExit?'infinity_break_no_executable_bid':'atomic_thunder_no_executable_bid' };
      }
      if (goldenEyeExit) {
        await this.audit('golden_eye_exit_waiting_executable_book', { id:entry.id, ticker:entry.ticker, mode:'SIMULATION', bidCents:bid, breakEvenPriceCents:exitFloorCents, remaining:remainingCount(entry), reason:'no_executable_bid' });
        return { closed:false, pending:false, remaining:remainingCount(entry), skipped:'golden_eye_no_executable_bid' };
      }
      if (x1Exit) {
        await this.audit('athena_x1_exit_waiting_capital_execution', { id:entry.id, ticker:entry.ticker, mode:'SIMULATION', bidCents:bid, breakEvenPriceCents:exitFloorCents, remaining:remainingCount(entry), reason:'no_executable_bid' });
        return { closed:false, pending:false, remaining:remainingCount(entry), skipped:'athena_x1_no_executable_bid' };
      }
      if (pri1Exit) {
        await this.audit('pri1_exit_waiting_capital_execution', { id:entry.id, ticker:entry.ticker, mode:'SIMULATION', bidCents:bid, breakEvenPriceCents:exitFloorCents, remaining:remainingCount(entry), reason:'no_executable_bid' });
        return { closed:false, pending:false, remaining:remainingCount(entry), skipped:'pri1_no_executable_bid' };
      }
      if (apexExit) {
        await this.audit('apex_profit_guard_exit_waiting_positive_execution', { id:entry.id, ticker:entry.ticker, mode:'SIMULATION', bidCents:bid, minimumPositivePriceCents:exitFloorCents, remaining:remainingCount(entry), reason:'no_executable_bid' });
        return { closed:false, pending:false, remaining:remainingCount(entry), skipped:'apex_profit_guard_no_executable_bid' };
      }
      await this.db.updateEntry(entry.id, {
        status: 'exit_pending', closeReason: decision.reason,
        peakPriceCents: decision.peakPriceCents ?? entry.peakPriceCents,
        stopPriceCents: decision.stopPriceCents ?? entry.stopPriceCents,
        exitAttemptBookMs: bookMs,
        updatedAtMs: Date.now(),
      });
      await this.audit('sim_exit_no_executable_bid', { id: entry.id, ticker: entry.ticker, reason: decision.reason, bidCents: bid, remaining: remainingCount(entry) });
      return { closed: false, pending: true, remaining: remainingCount(entry), skipped: 'no_executable_bid' };
    }
    if (fullPositionExit && (!exec.full || n(exec.filled) + 1e-9 < remainingCount(entry))) {
      const depthEvent = emergencyExit ? 'emergency_exit_waiting_full_position_depth' : atomicThunderExit ? (infinityBreakExit?'infinity_break_exit_waiting_full_position_depth':'atomic_thunder_exit_waiting_full_position_depth') : goldenEyeExit ? 'golden_eye_exit_waiting_full_position_depth' : 'athena_x1_exit_waiting_full_position_depth';
      await this.audit(depthEvent, {id:entry.id,ticker:entry.ticker,mode:'SIMULATION',bidCents:bid,remaining:remainingCount(entry),executableFilled:n(exec.filled),executableFull:Boolean(exec.full)}, 'warning');
      return { closed:false,pending:false,remaining:remainingCount(entry),skipped:emergencyExit?'emergency_partial_depth_no_split':atomicThunderExit?(infinityBreakExit?'infinity_break_partial_depth_no_split':'atomic_thunder_partial_depth_no_split'):goldenEyeExit?'golden_eye_partial_depth_no_split':'athena_x1_partial_depth_no_split' };
    }
    const executionCount=fullPositionExit?remainingCount(entry):n(exec.filled);
    const fee = n(s.simFeeCents) * executionCount;
    const result = await this.applyExitFill(entry, decision, {
      fillCount: executionCount,
      fillPriceCents: exec.avgCents ?? bid,
      exitFeeCents: fee,
      clearClientId: true,
    });
    await this.db.updateEntry(entry.id, { exitAttemptBookMs: bookMs, updatedAtMs: Date.now() });
    if (!result.closed) await this.audit('sim_exit_partial', { id: entry.id, ticker: entry.ticker, reason: decision.reason, filled: result.filled, remaining: result.remaining, averageFillPriceCents: result.fillPriceCents });
    return { ...result, pending: !result.closed };
  }

  async reconcileExistingExitIntent(entry, decision) {
    const inspected = await this.kalshi.inspectOrderByClientId(
      entry.ticker,
      entry.exitClientOrderId,
      Math.floor(n(entry.updatedAtMs, entry.openedAtMs) / 1000) - 120,
      2,
    ).catch(() => ({ found: false, authoritative: false, order: null }));
    const truth = inspected.order;
    if (truth?.fillCount > 0) {
      const exitFee = Number.isFinite(Number(truth.feePaidCents))
        ? Number(truth.feePaidCents)
        : n(this.getSettings().simFeeCents) * truth.fillCount;
      return this.applyExitFill(entry, decision, {
        fillCount: truth.fillCount,
        fillPriceCents: truth.averageFillPriceCents ?? entry.currentPriceCents,
        exitFeeCents: exitFee,
        orderId: truth.orderId,
        clearClientId: true,
      });
    }
    if (truth && terminalOrder(truth)) {
      await this.db.updateEntry(entry.id, { exitOrderId: truth.orderId, exitClientOrderId: null, status: 'exit_pending', updatedAtMs: Date.now() });
      await this.audit('live_exit_ioc_unfilled', { id: entry.id, ticker: entry.ticker, clientOrderId: entry.exitClientOrderId, orderId: truth.orderId, reason: decision.reason });
      return { closed: false, pending: true, remaining: remainingCount(entry), retryLater: true };
    }
    if (!truth && inspected.authoritative && Date.now() - n(entry.updatedAtMs, entry.openedAtMs) >= AMBIGUOUS_ORDER_GRACE_MS) {
      await this.db.updateEntry(entry.id, { exitClientOrderId: null, status: 'exit_pending', updatedAtMs: Date.now() });
      await this.audit('live_exit_order_absent', { id: entry.id, ticker: entry.ticker, clientOrderId: entry.exitClientOrderId, reason: decision.reason }, 'warning');
      return { closed: false, pending: true, remaining: remainingCount(entry), retryLater: true };
    }
    this.setState(entry, { ...decision, action: 'committed_exit', guardState: 'EXIT_PENDING_RECONCILIATION' });
    return { closed: false, pending: true, remaining: remainingCount(entry), ambiguous: true };
  }

  async liveExit(entry, decision) {
    return this.withTickerExitLockQueued(entry.ticker,()=>this._liveExit(entry,decision));
  }

  async _liveExit(entry, decision) {
    const s = this.getSettings();
    const remain = remainingCount(entry);
    if (remain <= 1e-9) return { closed: true, exitPrice: decision.liveExitPriceCents };

    if (entry.exitClientOrderId) return this.reconcileExistingExitIntent(entry, decision);

    const goldenEyeExitPre = this.isGoldenEyeExitDecision(entry, decision);
    const atomicThunderExitPre = this.isAtomicThunderExitDecision(entry, decision);
    const atomicPolicyPre = atomicThunderExitPre ? this.atomicThunderPolicy(entry, s) : null;
    const requiredBookAgeMs = atomicThunderExitPre ? atomicPolicyPre.maximumBookAgeMs : goldenEyeExitPre ? GOLDEN_EYE.maximumExecutionBookAgeMs : 5000;
    await this.market.ensureFreshBook(entry.ticker, requiredBookAgeMs).catch(() => null);
    const q = this.market.getQuote(entry.ticker);
    const bid = n(q?.yesBid);
    const upg3Exit = this.isUpg3ExitDecision(entry, decision);
    const apexExit = this.isApexProfitGuardExitDecision(entry, decision);
    const pri1Exit = this.isProtectedRunnerExitDecision(entry, decision);
    const x1Exit = this.isAthenaExitDecision(entry, decision);
    const goldenEyeExit = goldenEyeExitPre;
    const atomicThunderExit = atomicThunderExitPre;
    const infinityBreakExit = atomicThunderExit && this.isInfinityBreakTrade(entry);
    const emergencyExit = String(decision?.reason||'') === 'emergency_exit';
    const auroraCovenantFaultExit = String(decision?.reason||'') === 'aurora_covenant_fault';
    const atomicPolicy = atomicThunderExit ? this.atomicThunderPolicy(entry, s) : null;
    const profitProtectedExit = upg3Exit || apexExit || pri1Exit || x1Exit || goldenEyeExit || atomicThunderExit;
    const fullPositionExit = atomicThunderExit || x1Exit || goldenEyeExit || emergencyExit || auroraCovenantFaultExit;
    const exitBook = this.market.getBook?.(entry.ticker);
    const exitBookMs = n(exitBook?.updatedAtMs);
    if (atomicThunderExit && (!exitBook || exitBookMs <= 0 || Date.now() - exitBookMs > atomicPolicy.maximumBookAgeMs || q?.bookInvalid)) {
      await this.audit(infinityBreakExit?'infinity_break_exit_waiting_executable_book':'atomic_thunder_exit_waiting_executable_book', { id:entry.id, ticker:entry.ticker, mode:'LIVE', bidCents:bid, remaining:remain, reason:'stale_or_invalid_book' }, 'warning');
      return { closed:false, pending:false, remaining:remain, skipped:infinityBreakExit?'infinity_break_stale_book':'atomic_thunder_stale_book' };
    }
    if (pri1Exit && (!exitBook || exitBookMs <= 0 || Date.now() - exitBookMs > 5000 || q?.bookInvalid)) {
      await this.audit('pri1_exit_waiting_capital_execution', { id:entry.id, ticker:entry.ticker, mode:'LIVE', bidCents:bid, remaining:remain, reason:'stale_or_invalid_book' }, 'warning');
      return { closed:false, pending:false, remaining:remain, skipped:'pri1_stale_book' };
    }
    if (x1Exit && (!exitBook || !athenaExitBookTimestampFresh(exitBookMs) || q?.bookInvalid)) {
      await this.audit('athena_x1_exit_waiting_capital_execution', { id:entry.id, ticker:entry.ticker, mode:'LIVE', bidCents:bid, remaining:remain, reason:'stale_or_invalid_book' }, 'warning');
      return { closed:false, pending:false, remaining:remain, skipped:'athena_x1_stale_book' };
    }
    if (goldenEyeExit && (!exitBook || exitBookMs <= 0 || Date.now() - exitBookMs > GOLDEN_EYE.maximumExecutionBookAgeMs || q?.bookInvalid)) {
      await this.audit('golden_eye_exit_waiting_executable_book', { id:entry.id, ticker:entry.ticker, mode:'LIVE', bidCents:bid, remaining:remain, reason:'stale_or_invalid_book' }, 'warning');
      return { closed:false, pending:false, remaining:remain, skipped:'golden_eye_stale_book' };
    }
    if (apexExit && (!exitBook || exitBookMs <= 0 || Date.now() - exitBookMs > 5000 || q?.bookInvalid)) {
      await this.audit('apex_profit_guard_exit_waiting_positive_execution', { id:entry.id, ticker:entry.ticker, mode:'LIVE', bidCents:bid, remaining:remain, reason:'stale_or_invalid_book' }, 'warning');
      return { closed:false, pending:false, remaining:remain, skipped:'apex_profit_guard_stale_book' };
    }
    if (bid <= 0) {
      if (atomicThunderExit) {
        await this.audit(infinityBreakExit?'infinity_break_exit_waiting_executable_book':'atomic_thunder_exit_waiting_executable_book', { id:entry.id, ticker:entry.ticker, mode:'LIVE', bidCents:bid, remaining:remain, reason:'no_bid' });
        return { closed:false, pending:false, remaining:remain, skipped:infinityBreakExit?'infinity_break_no_bid':'atomic_thunder_no_bid' };
      }
      if (goldenEyeExit) {
        await this.audit('golden_eye_exit_waiting_executable_book', { id:entry.id, ticker:entry.ticker, mode:'LIVE', bidCents:bid, remaining:remain, reason:'no_bid' });
        return { closed:false, pending:false, remaining:remain, skipped:'golden_eye_no_bid' };
      }
      if (x1Exit) {
        await this.audit('athena_x1_exit_waiting_capital_execution', { id:entry.id, ticker:entry.ticker, mode:'LIVE', bidCents:bid, remaining:remain, reason:'no_bid' });
        return { closed:false, pending:false, remaining:remain, skipped:'athena_x1_no_bid' };
      }
      if (pri1Exit) {
        await this.audit('pri1_exit_waiting_capital_execution', { id:entry.id, ticker:entry.ticker, mode:'LIVE', bidCents:bid, remaining:remain, reason:'no_bid' });
        return { closed:false, pending:false, remaining:remain, skipped:'pri1_no_bid' };
      }
      if (apexExit) {
        await this.audit('apex_profit_guard_exit_waiting_positive_execution', { id:entry.id, ticker:entry.ticker, mode:'LIVE', bidCents:bid, remaining:remain, reason:'no_bid' });
        return { closed:false, pending:false, remaining:remain, skipped:'apex_profit_guard_no_bid' };
      }
      await this.db.updateEntry(entry.id, {
        status: 'exit_pending', closeReason: decision.reason,
        peakPriceCents: decision.peakPriceCents ?? entry.peakPriceCents,
        stopPriceCents: decision.stopPriceCents ?? entry.stopPriceCents,
        updatedAtMs: Date.now(),
      });
      return { closed: false, pending: true, remaining: remain, skipped: 'no_bid' };
    }

    const exitFloorCents = profitProtectedExit ? (atomicThunderExit ? this.atomicThunderExitFloorCents(entry, s) : goldenEyeExit ? this.goldenEyeBreakEvenPriceCents(entry, s) : x1Exit ? this.athenaExitBreakEvenPriceCents(entry, s) : pri1Exit ? this.protectedRunnerBreakEvenPriceCents(entry, s) : apexExit ? this.apexProfitGuardExitFloorCents(entry, s) : this.upg3ExitFloorCents(entry, s)) : bid;
    if (profitProtectedExit && bid < exitFloorCents) {
      if (atomicThunderExit) {
        await this.audit(infinityBreakExit?'infinity_break_exit_window_lost':'atomic_thunder_exit_window_lost', { id:entry.id, ticker:entry.ticker, mode:'LIVE', bidCents:bid, profitFloorCents:exitFloorCents, remaining:remain }, 'warning');
        return { closed:false, pending:false, remaining:remain, skipped:infinityBreakExit?'infinity_break_profit_floor_unavailable':'atomic_thunder_profit_floor_unavailable' };
      }
      if (goldenEyeExit) {
        await this.audit('golden_eye_exit_waiting_positive_execution', { id:entry.id, ticker:entry.ticker, mode:'LIVE', bidCents:bid, breakEvenPriceCents:exitFloorCents, remaining:remain, reason:'capital_floor_unavailable' }, 'warning');
        return { closed:false, pending:false, remaining:remain, skipped:'golden_eye_capital_floor_unavailable' };
      }
      if (x1Exit) {
        await this.audit('athena_x1_exit_suspended_to_stop_guard', {
          id:entry.id, ticker:entry.ticker, mode:'LIVE', bidCents:bid,
          breakEvenPriceCents:exitFloorCents, remaining:remain, reason:'capital_floor_unavailable',
        }, 'warning');
        return { closed:false, pending:false, remaining:remain, skipped:'athena_x1_capital_floor_unavailable' };
      }
      if (pri1Exit) {
        await this.audit('pri1_exit_suspended_to_stop_guard', {
          id:entry.id, ticker:entry.ticker, mode:'LIVE', bidCents:bid,
          breakEvenPriceCents:exitFloorCents, remaining:remain, reason:'capital_floor_unavailable',
        }, 'warning');
        return { closed:false, pending:false, remaining:remain, skipped:'pri1_capital_floor_unavailable' };
      }
      if (apexExit) {
        await this.audit('apex_profit_guard_exit_waiting_positive_execution', {
          id:entry.id, ticker:entry.ticker, mode:'LIVE', bidCents:bid,
          minimumPositivePriceCents:exitFloorCents, remaining:remain, reason:'profit_floor_unavailable',
        }, 'warning');
        return { closed:false, pending:false, remaining:remain, skipped:'apex_profit_guard_profit_floor_unavailable' };
      }
      await this.db.updateEntry(entry.id, {
        status:'exit_pending', closeReason:decision.reason,
        peakPriceCents:decision.peakPriceCents ?? entry.peakPriceCents,
        stopPriceCents:decision.stopPriceCents ?? entry.stopPriceCents,
        updatedAtMs:Date.now(),
      });
      await this.audit('upg3_exit_waiting_positive_execution', {
        id:entry.id, ticker:entry.ticker, mode:'LIVE', bidCents:bid,
        minimumPositivePriceCents:exitFloorCents, remaining:remain,
      }, 'warning');
      return { closed:false, pending:true, remaining:remain, skipped:'upg3_profit_floor_unavailable' };
    }

    const exec = this.market.executableBid(entry.ticker, remain, exitFloorCents);
    if (fullPositionExit && exec && n(exec.filled) > 0 && (!exec.full || n(exec.filled) + 1e-9 < remain)) {
      const depthEvent = emergencyExit ? 'emergency_exit_waiting_full_position_depth' : atomicThunderExit ? (infinityBreakExit?'infinity_break_exit_waiting_full_position_depth':'atomic_thunder_exit_waiting_full_position_depth') : goldenEyeExit ? 'golden_eye_exit_waiting_full_position_depth' : 'athena_x1_exit_waiting_full_position_depth';
      await this.audit(depthEvent, {id:entry.id,ticker:entry.ticker,mode:'LIVE',bidCents:bid,remaining:remain,executableFilled:n(exec.filled),executableFull:Boolean(exec.full)}, 'warning');
      return { closed:false,pending:false,remaining:remain,skipped:emergencyExit?'emergency_partial_depth_no_split':atomicThunderExit?(infinityBreakExit?'infinity_break_partial_depth_no_split':'atomic_thunder_partial_depth_no_split'):goldenEyeExit?'golden_eye_partial_depth_no_split':'athena_x1_partial_depth_no_split' };
    }
    const submitCount = fullPositionExit && exec?.full && n(exec.filled) + 1e-9 >= remain ? remain : Math.max(0, n(exec?.filled));
    if (submitCount <= 0) {
      if (atomicThunderExit) {
        await this.audit(infinityBreakExit?'infinity_break_exit_waiting_executable_book':'atomic_thunder_exit_waiting_executable_book', { id:entry.id, ticker:entry.ticker, mode:'LIVE', bidCents:bid, profitFloorCents:exitFloorCents, remaining:remain, reason:'no_executable_bid' }, 'warning');
        return { closed:false, pending:false, remaining:remain, skipped:infinityBreakExit?'infinity_break_no_executable_bid':'atomic_thunder_no_executable_bid' };
      }
      if (goldenEyeExit) {
        await this.audit('golden_eye_exit_waiting_executable_book', { id:entry.id, ticker:entry.ticker, mode:'LIVE', bidCents:bid, breakEvenPriceCents:exitFloorCents, remaining:remain, reason:'no_executable_bid' }, 'warning');
        return { closed:false, pending:false, remaining:remain, skipped:'golden_eye_no_executable_bid' };
      }
      if (x1Exit) {
        await this.audit('athena_x1_exit_waiting_capital_execution', { id:entry.id, ticker:entry.ticker, mode:'LIVE', bidCents:bid, breakEvenPriceCents:exitFloorCents, remaining:remain, reason:'no_executable_bid' }, 'warning');
        return { closed:false, pending:false, remaining:remain, skipped:'athena_x1_no_executable_bid' };
      }
      if (pri1Exit) {
        await this.audit('pri1_exit_waiting_capital_execution', { id:entry.id, ticker:entry.ticker, mode:'LIVE', bidCents:bid, breakEvenPriceCents:exitFloorCents, remaining:remain, reason:'no_executable_bid' }, 'warning');
        return { closed:false, pending:false, remaining:remain, skipped:'pri1_no_executable_bid' };
      }
      if (apexExit) {
        await this.audit('apex_profit_guard_exit_waiting_positive_execution', { id:entry.id, ticker:entry.ticker, mode:'LIVE', bidCents:bid, minimumPositivePriceCents:exitFloorCents, remaining:remain, reason:'no_executable_bid' }, 'warning');
        return { closed:false, pending:false, remaining:remain, skipped:'apex_profit_guard_no_executable_bid' };
      }
      await this.db.updateEntry(entry.id, {
        status: 'exit_pending', closeReason: decision.reason,
        peakPriceCents: decision.peakPriceCents ?? entry.peakPriceCents,
        stopPriceCents: decision.stopPriceCents ?? entry.stopPriceCents,
        updatedAtMs: Date.now(),
      });
      await this.audit('live_exit_no_executable_bid', { id: entry.id, ticker: entry.ticker, reason: decision.reason, bidCents: bid, remaining: remain }, 'warning');
      return { closed: false, pending: true, remaining: remain, skipped: 'no_executable_bid' };
    }

    // R45 ownership/reconciliation boundary. Kalshi exposes aggregate ticker
    // inventory, while Galactic Explosion may have several logical SAGITTARIUS
    // rows on that ticker. Prove the aggregate broker inventory still covers
    // every active SAGITTARIUS-owned row before selling this row's quantity.
    const ownership=await this.liveTickerOwnershipSnapshot(entry);
    if(!ownership.ok){
      await this.audit('live_exit_ownership_reconciliation_blocked',{id:entry.id,ticker:entry.ticker,concept:entry.conceptName,reason:ownership.reason,brokerCount:ownership.brokerCount??null,ownedRemaining:ownership.ownedRemaining??null,entryRemaining:remain,message:ownership.message||null},'error');
      await this.db.updateEntry(entry.id,{status:'exit_pending',closeReason:decision.reason,updatedAtMs:Date.now()});
      return{closed:false,pending:true,remaining:remain,skipped:ownership.reason};
    }

    const client = this.kalshi.buildClientOrderId(this.getSettings().ownerId, entry.id, 'exit');
    // Persist the exact mutation receipt BEFORE sending. If the process dies
    // after the broker accepts the order, restart reconciliation has the one
    // client order ID it must resolve and cannot blindly duplicate the sell.
    await this.db.updateEntry(entry.id, {
      status: 'exit_pending', exitClientOrderId: client, closeReason: decision.reason,
      peakPriceCents: decision.peakPriceCents ?? entry.peakPriceCents,
      stopPriceCents: decision.stopPriceCents ?? entry.stopPriceCents,
      updatedAtMs: Date.now(),
    });
    const submitted = { ...entry, status: 'exit_pending', exitClientOrderId: client, closeReason: decision.reason, updatedAtMs: Date.now() };
    // A committed U-PG3 exit is submitted with the dynamic +net floor as
    // its IOC limit. This lets the order sweep all executable bids at or above
    // the profitable floor while making it impossible for our own limit price
    // to authorize a below-floor fill. Legacy/Stop-Guard exits retain the
    // original best-bid limit semantics.
    const orderLimitCents = profitProtectedExit ? exitFloorCents : bid;
    const r = await this.kalshi.placeOrder({ ticker: entry.ticker, action: 'sell', count: submitCount, priceCents: orderLimitCents, clientOrderId: client });
    if (r.fillCount > 0) {
      const exitFee = Number.isFinite(Number(r.feePaidCents)) ? Number(r.feePaidCents) : n(s.simFeeCents) * r.fillCount;
      const applied = await this.applyExitFill(submitted, decision, {
        fillCount: r.fillCount,
        fillPriceCents: r.averageFillPriceCents ?? bid,
        exitFeeCents: exitFee,
        orderId: r.orderId,
        clearClientId: true,
      });
      if ((atomicThunderExit || goldenEyeExit) && !applied.closed && applied.remaining > 0) {
        await this.db.updateEntry(entry.id, { status:'open', closeReason:null, exitClientOrderId:null, updatedAtMs:Date.now() });
        await this.audit(atomicThunderExit ? (infinityBreakExit?'infinity_break_live_partial_reopened':'atomic_thunder_live_partial_reopened') : 'golden_eye_live_partial_reopened', { id:entry.id,ticker:entry.ticker,filled:applied.filled,remaining:applied.remaining,fillPriceCents:applied.fillPriceCents }, 'warning');
        return { ...applied, pending:false, reopened:true };
      }
      return applied;
    }
    if (r.ambiguous) {
      await this.db.updateEntry(entry.id, { exitOrderId: r.orderId, status: 'exit_pending', updatedAtMs: submitted.updatedAtMs });
      this.setState(entry, { ...decision, action: 'committed_exit', guardState: 'EXIT_PENDING_RECONCILIATION' });
      return { closed: false, pending: true, remaining: remain, ambiguous: true };
    }

    await this.db.updateEntry(entry.id, { exitOrderId: r.orderId, exitClientOrderId: null, status: 'exit_pending', updatedAtMs: Date.now() });
    await this.audit('live_exit_ioc_unfilled', { id: entry.id, ticker: entry.ticker, clientOrderId: client, orderId: r.orderId, reason: decision.reason });
    return { closed: false, pending: true, remaining: remain, retryLater: true };
  }

  async _protect(entry) {
    const s = this.getSettings();
    if (entry.status === 'entry_pending') entry = await this.reconcilePending(entry);
    if (!['open', 'exit_pending'].includes(entry.status)) return { protected: false, status: entry.status };

    const q = await this.refreshProtectionQuote(entry);
    if (!q) {
      this.setState(entry, { action: 'hold', guardState: 'MARKET_DATA_STALE' });
      return { protected: false, stale: true };
    }

    entry = await this.updateMae(entry, q);

    // Finalization cannot bypass an unresolved LIVE exit receipt. An ambiguous
    // sell may already have filled before the lifecycle event; reconcile that
    // exact client ID first so settlement accounting cannot double-count it.
    if (entry.mode === 'LIVE' && entry.exitClientOrderId && finalMarket(q)) {
      const pendingDecision = {
        action: 'committed_exit', reason: entry.closeReason || 'exit_pending',
        guardState: 'EXIT_PENDING_RECONCILIATION', stopPriceCents: entry.stopPriceCents,
        peakPriceCents: entry.peakPriceCents,
      };
      const reconciled = await this.reconcileExistingExitIntent(entry, pendingDecision);
      if (reconciled.ambiguous) {
        this.setState(entry, { ...pendingDecision, guardState: 'SETTLEMENT_PENDING_EXIT_RECONCILIATION' });
        return reconciled;
      }
      const fresh = await this.db.entryById(entry.id);
      if (!fresh || fresh.status === 'closed') return { closed: true };
      entry = fresh;
    }

    // Atomic Thunder is a cash-now profit opportunity, never a durable license
    // to chase a remainder below its fee-adjusted target. If an IOC is terminal
    // or unfilled and no broker receipt remains, reopen immediately when the
    // full-position profit covenant disappears. U-SG1 then regains the normal
    // loss path while Atomic Thunder waits for a newly confirmed profit window.
    if (entry.status === 'exit_pending' && (entry.closeReason === 'atomic_thunder_cashout' || entry.closeReason === 'infinity_break') && !entry.exitClientOrderId && !finalMarket(q)) {
      const infinityBreakPending = entry.closeReason === 'infinity_break' || this.isInfinityBreakTrade(entry);
      const atPolicy = this.atomicThunderPolicy(entry, s);
      await this.market.ensureFreshBook(entry.ticker, atPolicy.maximumBookAgeMs).catch(() => null);
      const atFloor = this.atomicThunderExitFloorCents(entry, s);
      const atQ = this.market.getQuote(entry.ticker) || q;
      const atBid = n(atQ?.yesBid);
      const atBook = this.market.getBook?.(entry.ticker);
      const atBookMs = n(atBook?.updatedAtMs);
      const atBookFresh = Boolean(atBook && atBookMs > 0 && Date.now() - atBookMs <= atPolicy.maximumBookAgeMs && !atQ?.bookInvalid);
      const atExec = atBookFresh && atBid >= atFloor
        ? this.market.executableBid(entry.ticker, remainingCount(entry), atFloor)
        : null;
      const atNet = atExec?.full ? this.aggregateExecutableNetCents(entry, remainingCount(entry), n(atExec.avgCents), s) : null;
      const atTarget = this.atomicThunderTargetNetCents(entry, s);
      if (!atExec?.full || n(atExec.filled) + 1e-9 < remainingCount(entry) || n(atNet, -Infinity) + 1e-9 < atTarget) {
        await this.db.updateEntry(entry.id, { status:'open', closeReason:null, exitOrderId:null, updatedAtMs:Date.now() });
        entry.status = 'open';
        entry.closeReason = null;
        entry.exitOrderId = null;
        this.atomicThunderStates.delete(entry.id);
        await this.audit(infinityBreakPending?'infinity_break_exit_released_after_window':'atomic_thunder_exit_released_after_window', {
          id:entry.id, ticker:entry.ticker, concept:entry.conceptName, bidCents:atBid,
          profitFloorCents:atFloor, targetNetCents:atTarget, executableNetCents:atNet,
          remaining:remainingCount(entry), executableFull:Boolean(atExec?.full),
        }, 'warning');
      }
    }

    // Golden Eye is a cash-now opportunity, not a durable permission to chase
    // price downward. If an IOC has no unresolved broker receipt and the whole
    // remainder is no longer executable at aggregate break-even, release the
    // intent immediately so U-SG1 keeps exclusive loss-domain authority.
    if (entry.status === 'exit_pending' && entry.closeReason === 'golden_eye_cashout' && !entry.exitClientOrderId && !finalMarket(q)) {
      await this.market.ensureFreshBook(entry.ticker, GOLDEN_EYE.maximumExecutionBookAgeMs).catch(() => null);
      const geFloor = this.goldenEyeBreakEvenPriceCents(entry, s);
      const geQ = this.market.getQuote(entry.ticker) || q;
      const geBid = n(geQ?.yesBid);
      const geBook = this.market.getBook?.(entry.ticker);
      const geBookMs = n(geBook?.updatedAtMs);
      const geBookFresh = Boolean(geBook && geBookMs > 0 && Date.now() - geBookMs <= GOLDEN_EYE.maximumExecutionBookAgeMs && !geQ?.bookInvalid);
      const geExec = geBookFresh && geBid >= geFloor
        ? this.market.executableBid(entry.ticker, remainingCount(entry), geFloor)
        : null;
      if (!geExec?.full || n(geExec.filled) + 1e-9 < remainingCount(entry)) {
        await this.db.updateEntry(entry.id, { status:'open', closeReason:null, updatedAtMs:Date.now() });
        entry.status = 'open';
        entry.closeReason = null;
        await this.audit('golden_eye_exit_released_after_window', {
          id:entry.id, ticker:entry.ticker, concept:entry.conceptName, bidCents:geBid,
          breakEvenPriceCents:geFloor, remaining:remainingCount(entry), executableFull:Boolean(geExec?.full),
        }, 'warning');
      }
    }

    // ATHENA-X1 exit commitments are durable but remain strictly profit-domain
    // obligations. A partial/unfilled IOC never grants authority to sell the
    // remainder below aggregate break-even. Reopen the remainder when that
    // executable covenant disappears so U-SG1 can retain exclusive loss-domain
    // authority; the X1 commitment remains persisted and resumes on recovery.
    if (entry.status === 'exit_pending' && entry.closeReason === 'athena_x1_exit' && !entry.exitClientOrderId && !finalMarket(q)) {
      await this.market.ensureFreshBook(entry.ticker, 5000).catch(() => null);
      const x1Floor = this.athenaExitBreakEvenPriceCents(entry, s);
      const x1Q = this.market.getQuote(entry.ticker) || q;
      const x1Bid = n(x1Q?.yesBid);
      const x1Book = this.market.getBook?.(entry.ticker);
      const x1BookFresh = Boolean(x1Book && athenaExitBookTimestampFresh(n(x1Book.updatedAtMs)) && !x1Q?.bookInvalid);
      const x1Exec = x1BookFresh && x1Bid >= x1Floor
        ? this.market.executableBid(entry.ticker, remainingCount(entry), x1Floor)
        : null;
      if (!x1Exec?.full) {
        await this.db.updateEntry(entry.id, { status:'open', closeReason:null, updatedAtMs:Date.now() });
        entry.status = 'open';
        entry.closeReason = null;
        await this.audit('athena_x1_exit_suspended_to_stop_guard', {
          id:entry.id, ticker:entry.ticker, concept:entry.conceptName, bidCents:x1Bid,
          breakEvenPriceCents:x1Floor, remaining:remainingCount(entry), executableFull:Boolean(x1Exec?.full),
        }, 'warning');
      }
    }

    // PRI1 exit commitments are durable, but the capital covenant never gives
    // the Profit Guard permission to sell a remainder at aggregate negative
    // net. If a partial/unfilled IOC leaves no unresolved broker receipt and
    // full break-even depth has disappeared, reopen the remainder while keeping
    // the PRI1 commitment persisted. The next protection pass therefore gives
    // U-SG1 normal loss-domain authority; PRI1 resumes the committed exit as
    // soon as full non-negative executable depth returns.
    if (entry.status === 'exit_pending' && entry.closeReason === 'protected_runner_intelligence' && !entry.exitClientOrderId && !finalMarket(q)) {
      await this.market.ensureFreshBook(entry.ticker, 5000).catch(() => null);
      const priFloor = this.protectedRunnerBreakEvenPriceCents(entry, s);
      const priQ = this.market.getQuote(entry.ticker) || q;
      const priBid = n(priQ?.yesBid);
      const priBook = this.market.getBook?.(entry.ticker);
      const priBookFresh = Boolean(priBook && n(priBook.updatedAtMs) > 0 && Date.now() - n(priBook.updatedAtMs) <= 5000 && !priQ?.bookInvalid);
      const priExec = priBookFresh && priBid >= priFloor
        ? this.market.executableBid(entry.ticker, remainingCount(entry), priFloor)
        : null;
      if (!priExec?.full) {
        await this.db.updateEntry(entry.id, { status:'open', closeReason:null, updatedAtMs:Date.now() });
        entry.status = 'open';
        entry.closeReason = null;
        await this.audit('pri1_exit_suspended_to_stop_guard', {
          id:entry.id, ticker:entry.ticker, concept:entry.conceptName, bidCents:priBid,
          breakEvenPriceCents:priFloor, remaining:remainingCount(entry), executableFull:Boolean(priExec?.full),
        }, 'warning');
      }
    }

    // APG1 uses a durable profit intent but never lets that intent become a
    // loss-domain sell. After a confirmed terminal/unfilled or partial IOC has
    // no unresolved broker client ID, temporarily reopen the remaining quantity
    // when the whole remainder can no longer be liquidated at positive net.
    // The APG1 commit stays persisted and will resume on renewed positive depth;
    // reopening also lets U-SG1 retain authority if the position collapses.
    if (entry.status === 'exit_pending' && entry.closeReason === 'apex_profit_guard' && !entry.exitClientOrderId && !finalMarket(q)) {
      await this.market.ensureFreshBook(entry.ticker, 5000).catch(() => null);
      const apexFloor = this.apexProfitGuardExitFloorCents(entry, s);
      const apexBid = n((this.market.getQuote(entry.ticker) || q)?.yesBid);
      const apexBook = this.market.getBook?.(entry.ticker);
      const apexBookFresh = Boolean(apexBook && n(apexBook.updatedAtMs) > 0 && Date.now() - n(apexBook.updatedAtMs) <= 5000 && !(this.market.getQuote(entry.ticker) || q)?.bookInvalid);
      const apexExec = apexBookFresh && apexBid >= apexFloor
        ? this.market.executableBid(entry.ticker, remainingCount(entry), apexFloor)
        : null;
      if (!apexExec?.full) {
        await this.db.updateEntry(entry.id, { status:'open', closeReason:null, updatedAtMs:Date.now() });
        entry.status = 'open';
        entry.closeReason = null;
        await this.audit('apex_profit_guard_exit_suspended_to_stop_guard', {
          id:entry.id, ticker:entry.ticker, concept:entry.conceptName,
          bidCents:apexBid, minimumPositivePriceCents:apexFloor,
          remaining:remainingCount(entry), executableFull:Boolean(apexExec?.full),
        }, 'warning');
      }
    }

    // Once an exit is committed, a later price recovery must never silently
    // cancel it. Both SIM and LIVE continue the same durable obligation until
    // remaining quantity reaches zero or the market finalizes.
    if (entry.status === 'exit_pending' && entry.closeReason && !finalMarket(q)) {
      const committed = {
        action: 'committed_exit',
        exitPriceCents: n(q.yesBid, entry.currentPriceCents),
        liveExitPriceCents: n(q.yesBid, entry.currentPriceCents),
        reason: entry.closeReason,
        atomicThunder: entry.closeReason === 'atomic_thunder_cashout' ? ATOMIC_THUNDER.version : null,
        atomicThunderPolicyRevision: entry.closeReason === 'atomic_thunder_cashout' ? ATOMIC_THUNDER.policyRevision : null,
        goldenEye: entry.closeReason === 'golden_eye_cashout' ? GOLDEN_EYE.version : null,
        goldenEyePolicyRevision: entry.closeReason === 'golden_eye_cashout' ? GOLDEN_EYE.policyRevision : null,
        guardState: n(q.yesBid) > 0 ? 'EXIT_PENDING' : 'EXIT_PENDING_NO_BID',
        stopPriceCents: entry.stopPriceCents,
        peakPriceCents: entry.peakPriceCents,
      };
      this.setState(entry, committed);
      const out = entry.mode === 'LIVE'
        ? await this.liveExit(entry, committed)
        : await this.simulationExit(entry, committed, q);
      if (out.closed && entry.closeReason === 'hard_stop_loss') {
        const fresh = await this.db.entryById(entry.id);
        if (fresh) await this.learning.onHardStop(fresh);
      }
      return out;
    }

    let d = profitGuardDecision(entry, q, s);

    if (d.action === 'hold_ghost') {
      this.setState(entry, d);
      await this.db.updateEntry(entry.id, {
        currentPriceCents: d.currentPriceCents,
        peakPriceCents: d.peakPriceCents,
        stopPriceCents: 0,
        updatedAtMs: Date.now(),
        volume24h: q.volume24h || entry.volume24h,
      });
      return { protected: true, action: d.action };
    }
    if (d.action === 'close_ghost') {
      this.setState(entry, d);
      await this.db.updateEntry(entry.id, {
        status: 'closed', remainingCount: 0,
        exitPriceCents: entry.entryPriceCents, currentPriceCents: entry.entryPriceCents,
        pnlCents: 0, closeReason: 'ghost_signal',
        closedAtMs: Date.now(), updatedAtMs: Date.now(),
      });
      return { closed: true, action: d.action };
    }
    if (d.action === 'settlement') {
      this.setState(entry, d);
      return this.closeAtSettlement(entry, d);
    }

    // U-PG3 commits are durable even across a crash/restart that happens in
    // the narrow interval after the profit decision is persisted but before
    // the exit path has marked the row exit_pending. Settlement still wins,
    // but no later Stop Guard state or price recovery may cancel this sell.
    // Legacy U-PG1/U-PG2 commits are also honored exactly once after deployment
    // so an upgrade cannot silently cancel an already-committed liquidation.
    const persistedProfitCommit = ultimateProfitGuardState(entry);
    if (isCommittedUltimateProfitGuardPhase(persistedProfitCommit?.phase)) {
      const committed = {
        ...this.ultimateProfitGuardTelemetry(persistedProfitCommit, n(q?.yesBid)),
        action:'committed_exit',
        exitPriceCents:n(q?.yesBid, entry.currentPriceCents),
        liveExitPriceCents:n(q?.yesBid, entry.currentPriceCents),
        reason:'ultimate_profit_guard',
        guardState:String(persistedProfitCommit.phase || '').includes('UPG1') ? 'UPG1_EXIT_COMMITTED' : String(persistedProfitCommit.phase || '').includes('UPG2') ? 'UPG2_EXIT_COMMITTED' : 'UPG3_EXIT_COMMITTED',
        stopPriceCents:n(persistedProfitCommit.dangerLineCents, entry.stopPriceCents),
        peakPriceCents:Math.max(n(entry.peakPriceCents, entry.entryPriceCents), n(persistedProfitCommit.peakExecutableBidCents)),
      };
      this.setState(entry, committed);
      return entry.mode === 'LIVE'
        ? this.liveExit(entry, committed)
        : this.simulationExit(entry, committed, q);
    }

    const stopGuardFirst = await this.handleUltimateStopGuard(entry, q, s, d);
    if (stopGuardFirst.handled) return stopGuardFirst.result;
    if (stopGuardFirst.cleared) d = profitGuardDecision(entry, q, s);
    if (d.action === 'hard_stop') {
      if(isFrozenAuroraEntry(entry)){
        const verification=await this.verifyFrozenAuroraTouch(entry,q,n(entry?.entryConfig?.aurora?.dangerPriceCents,entry.stopPriceCents));
        if(!verification.confirmed){
          await this.audit('aurora_direct_hard_stop_blocked_without_verified_touch',{id:entry.id,ticker:entry.ticker,concept:entry.conceptName,dangerLineCents:verification.dangerLineCents,bidCents:verification.bidCents,executableBidCents:verification.executableBidCents,reason:verification.reason},'warning');
          return {protected:true,action:'aurora_touch_unverified_hold'};
        }
      }
      // Defensive fail-safe only: every ordinary hard-stop touch is intercepted
      // by U-SG1 above. If a future incompatible decision bypasses U-SG1, retain
      // the original immediate liquidation behavior rather than fail open.
      this.setState(entry, d);
      const out = entry.mode === 'LIVE' ? await this.liveExit(entry, d) : await this.simulationExit(entry, d, q);
      if (out.closed) {
        const fresh = await this.db.entryById(entry.id);
        if (fresh) await this.learning.onHardStop(fresh);
      }
      return out;
    }

    // R45 Atomic Thunder owns the individual profit domain for new Aurora-protected
    // Execution Attacks. Loss protection and settlement have already run above. While
    // Atomic Thunder is enabled for the frozen entry, Golden Eye and all legacy
    // profit authorities are research-only for this Hunter and cannot race the
    // first independently confirmed full-position net-profit harvest.
    if ((this.isInfinityBreakTrade(entry) || this.isAtomicThunderTrade(entry)) && this.atomicThunderPolicy(entry, s).enabled) {
      const at = await this.evaluateAtomicThunder(entry, q, s);
      const atQ = at?.q || q;
      if (at?.triggered) {
        const meta = this.atomicThunderTelemetry(entry, at);
        const pd = {
          ...d, ...meta,
          action:this.isInfinityBreakTrade(entry)?'infinity_break':'atomic_thunder_cashout', reason:this.isInfinityBreakTrade(entry)?'infinity_break':'atomic_thunder_cashout',
          guardState:this.isInfinityBreakTrade(entry)?'INFINITY_BREAK_EXIT':'ATOMIC_THUNDER_EXIT',
          exitPriceCents:n(atQ?.yesBid, entry.currentPriceCents),
          liveExitPriceCents:n(atQ?.yesBid, entry.currentPriceCents),
          ...(this.isInfinityBreakTrade(entry)?{infinityBreak:INFINITY_BREAK.version,infinityBreakPolicyRevision:INFINITY_BREAK.policyRevision}:{atomicThunder:ATOMIC_THUNDER.version,atomicThunderPolicyRevision:ATOMIC_THUNDER.policyRevision}),
          stopPriceCents:n(d.hardStopCents,d.stopPriceCents),
          peakPriceCents:Math.max(n(entry.peakPriceCents,entry.entryPriceCents),n(atQ?.yesBid)),
        };
        this.setState(entry,pd);
        await this.audit(this.isInfinityBreakTrade(entry)?'infinity_break_committed':'atomic_thunder_harvest_committed', {
          id:entry.id,ticker:entry.ticker,concept:entry.conceptName,sourceFeeder:entry.sourceFeeder||null,
          executableNetCents:n(at.executableNetCents),targetNetCents:n(at.targetNetCents),
          executableBidCents:n(at.executableBidCents),profitFloorCents:n(at.exitFloorCents),
          confirmations:n(at.confirmations),requiredFreshConfirmations:n(at.policy?.requiredFreshConfirmations),
          fullPositionOnly:true,lossAuthority:this.isInfinityBreakTrade(entry)?INFINITY_BREAK.lossAuthority:ATOMIC_THUNDER.lossAuthority,
        });
        const out = entry.mode === 'LIVE' ? await this.liveExit(entry,pd) : await this.simulationExit(entry,pd,atQ);
        if (!out.closed && !out.pending) this.atomicThunderStates.delete(entry.id);
        return out;
      }
      const meta = this.atomicThunderTelemetry(entry,at);
      const hold = {
        ...d,...meta,action:'hold',guardState:meta.atomicThunderState,
        stopPriceCents:n(d.hardStopCents,d.stopPriceCents),
      };
      this.setState(entry,hold);
      await this.db.updateEntry(entry.id,{
        currentPriceCents:n(atQ?.yesBid,entry.currentPriceCents),
        peakPriceCents:Math.max(n(entry.peakPriceCents,entry.entryPriceCents),n(atQ?.yesBid)),
        stopPriceCents:n(d.hardStopCents,d.stopPriceCents),
        updatedAtMs:Date.now(),volume24h:atQ?.volume24h||entry.volume24h,
      });
      return { protected:true, action:'hold', profitAuthority:this.isInfinityBreakTrade(entry)?INFINITY_BREAK.version:ATOMIC_THUNDER.version, ...(this.isInfinityBreakTrade(entry)?{infinityBreak:meta}:{atomicThunder:meta}) };
    }

    // R37 Golden Eye owns the profit domain for new R37 Hunters at the
    // portfolio level. Per-position protection intentionally does not run any
    // trailing/forecast profit exit here: settlement and U-SG1 have already
    // executed above, while Golden Eye watches the aggregate cash-now signal
    // independently from the quote event loop. This prevents ATHENA-X1/APG1/
    // U-PG3 from racing the global Golden Eye cashout on new R37 positions.
    if (this.isGoldenEyeTrade(entry)) {
      const gd = {
        ...d, action:'hold', guardState:'GOLDEN_EYE_PORTFOLIO_GUARD',
        goldenEye:GOLDEN_EYE.version, goldenEyePolicyRevision:GOLDEN_EYE.policyRevision,
        stopPriceCents:n(d.hardStopCents,d.stopPriceCents),
      };
      this.setState(entry,gd);
      await this.db.updateEntry(entry.id,{
        currentPriceCents:n(q.yesBid,entry.currentPriceCents),
        peakPriceCents:Math.max(n(entry.peakPriceCents,entry.entryPriceCents),n(q.yesBid)),
        stopPriceCents:n(d.hardStopCents,d.stopPriceCents),
        updatedAtMs:Date.now(),volume24h:q.volume24h||entry.volume24h,
      });
      return { protected:true, action:'hold', profitAuthority:GOLDEN_EYE.version };
    }

    // R36 ATHENA-X1 is the sole profit authority for new R36 Hunters whose
    // immutable creation snapshot freezes profitAuthority=ATHENA-X1. Athena B1
    // remains entry-only and untouched. U-SG1 has already run above, so X1 can
    // reason about 100% of a profitable position without ever acquiring loss-
    // domain authority or bypassing settlement/execution safeguards.
    if (this.isAthenaExitTrade(entry)) {
      const x1 = await this.evaluateAthenaExit(entry, q, s);
      const x1Quote = x1?.q || q;
      d = profitGuardDecision(entry, x1Quote, s);
      if (d.action === 'settlement') {
        this.setState(entry, d);
        return this.closeAtSettlement(entry, d);
      }
      const stopGuardX1 = await this.handleUltimateStopGuard(entry, x1Quote, s, d);
      if (stopGuardX1.handled) return stopGuardX1.result;
      if (stopGuardX1.cleared) d = profitGuardDecision(entry, x1Quote, s);
      if (d.action === 'hard_stop') {
        this.setState(entry, d);
        const out = entry.mode === 'LIVE' ? await this.liveExit(entry, d) : await this.simulationExit(entry, d, x1Quote);
        if (out.closed) {
          const fresh = await this.db.entryById(entry.id);
          if (fresh) await this.learning.onHardStop(fresh);
        }
        return out;
      }
      if(x1?.policyMismatch){
        const mismatchDecision={...d,action:'hold',guardState:'ATHENA_X1_POLICY_REVISION_MISMATCH_HOLD',stopPriceCents:n(d.hardStopCents,d.stopPriceCents)};
        this.setState(entry,mismatchDecision);
        await this.db.updateEntry(entry.id,{currentPriceCents:n(x1Quote?.yesBid,entry.currentPriceCents),updatedAtMs:Date.now()});
        return {protected:true,action:'athena_x1_policy_revision_mismatch_hold',policyMismatch:true};
      }

      const x1Meta = x1?.state ? athenaExitTelemetry(x1.state) : {};
      if (x1?.committed) {
        const xd = {
          ...d, ...x1Meta, action:'athena_x1_exit',
          exitPriceCents:n(x1Quote?.yesBid, entry.currentPriceCents),
          liveExitPriceCents:n(x1Quote?.yesBid, entry.currentPriceCents),
          reason:'athena_x1_exit',
          guardState:x1.executable ? 'ATHENA_X1_EXIT' : 'ATHENA_X1_EXIT_COMMITTED_WAITING_CAPITAL_DEPTH',
          stopPriceCents:n(d.hardStopCents, d.stopPriceCents),
          peakPriceCents:Math.max(n(entry.peakPriceCents, entry.entryPriceCents), n(x1.state?.peakExecutableBidCents)),
        };
        this.setState(entry, xd);
        if (!x1.executable) {
          await this.audit('athena_x1_exit_suspended_to_stop_guard', {
            id:entry.id,ticker:entry.ticker,concept:entry.conceptName,
            bidCents:n(x1Quote?.yesBid),breakEvenPriceCents:n(x1.breakEvenPriceCents),
            remaining:remainingCount(entry),reason:'committed_profit_exit_not_executable_non_negative',
          }, 'warning');
          return { protected:true, action:'athena_x1_wait', pending:false, skipped:'waiting_for_non_negative_full_depth' };
        }
        return entry.mode === 'LIVE' ? this.liveExit(entry, xd) : this.simulationExit(entry, xd, x1Quote);
      }

      const displayDecision={
        ...d,...x1Meta,
        guardState:x1?.state?.phase||d.guardState||'ATHENA_X1_TRACKING',
        stopPriceCents:n(d.hardStopCents,d.stopPriceCents),
        peakPriceCents:Math.max(n(d.peakPriceCents,entry.entryPriceCents),n(x1?.state?.peakExecutableBidCents)),
      };
      this.setState(entry,displayDecision);
      if(d.action==='hold'){
        await this.db.updateEntry(entry.id,{
          currentPriceCents:displayDecision.currentPriceCents??(n(x1Quote.yesBid)>0?x1Quote.yesBid:entry.currentPriceCents),
          peakPriceCents:displayDecision.peakPriceCents??entry.peakPriceCents,
          stopPriceCents:n(d.hardStopCents,d.stopPriceCents),updatedAtMs:Date.now(),volume24h:x1Quote.volume24h||entry.volume24h,
        });
      }
      return { protected:true, action:d.action, profitAuthority:ATHENA_EXIT_INTELLIGENCE.version };
    }

    // PRI1 is the sole profit authority for Hunters whose creation-time
    // entryConfig froze profitAuthority=PRI1. New R33 Hunters additionally
    // freeze policyRevision=PRI1-R2; R32 PRI1-R1 positions retain their exact
    // legacy creation-time behavior, while R30/R31 positions retain APG1/U-PG3.
    // U-SG1 is always evaluated first and remains the exclusive loss authority.
    if (this.isProtectedRunnerTrade(entry)) {
      const pri = await this.evaluateProtectedRunner(entry, q, s);
      const priQuote = pri?.q || q;
      d = profitGuardDecision(entry, priQuote, s);
      if (d.action === 'settlement') {
        this.setState(entry, d);
        return this.closeAtSettlement(entry, d);
      }
      const stopGuardPri = await this.handleUltimateStopGuard(entry, priQuote, s, d);
      if (stopGuardPri.handled) return stopGuardPri.result;
      if (stopGuardPri.cleared) d = profitGuardDecision(entry, priQuote, s);
      if (d.action === 'hard_stop') {
        this.setState(entry, d);
        const out = entry.mode === 'LIVE' ? await this.liveExit(entry, d) : await this.simulationExit(entry, d, priQuote);
        if (out.closed) {
          const fresh = await this.db.entryById(entry.id);
          if (fresh) await this.learning.onHardStop(fresh);
        }
        return out;
      }

      const priMeta = pri?.armed
        ? this.protectedRunnerTelemetry(pri.state, pri.executableBidCents, pri.executableNetCents, pri.executableFull)
        : {};
      if (pri?.triggered) {
        const pd = {
          ...d, ...priMeta, action:'protected_runner_intelligence',
          exitPriceCents:n(priQuote?.yesBid, entry.currentPriceCents),
          liveExitPriceCents:n(priQuote?.yesBid, entry.currentPriceCents),
          reason:'protected_runner_intelligence',
          guardState:pri.executable ? 'PRI1_EXIT' : 'PRI1_EXIT_COMMITTED_WAITING_CAPITAL_DEPTH',
          stopPriceCents:n(d.hardStopCents, d.stopPriceCents),
          peakPriceCents:Math.max(n(entry.peakPriceCents, entry.entryPriceCents), n(pri.state?.peakExecutableBidCents)),
        };
        this.setState(entry, pd);
        if (!pri.executable) {
          return { protected:true, action:'protected_runner_wait', pending:false, skipped:'waiting_for_non_negative_full_depth' };
        }
        return entry.mode === 'LIVE' ? this.liveExit(entry, pd) : this.simulationExit(entry, pd, priQuote);
      }

      const displayDecision = {
        ...d, ...priMeta,
        guardState:pri?.state?.phase || d.guardState || 'PROTECTED',
        stopPriceCents:n(d.hardStopCents, d.stopPriceCents),
        peakPriceCents:Math.max(n(d.peakPriceCents, entry.entryPriceCents), n(pri?.state?.peakExecutableBidCents)),
      };
      this.setState(entry, displayDecision);
      if (d.action === 'hold') {
        await this.db.updateEntry(entry.id, {
          currentPriceCents:displayDecision.currentPriceCents ?? (n(priQuote.yesBid) > 0 ? priQuote.yesBid : entry.currentPriceCents),
          peakPriceCents:displayDecision.peakPriceCents ?? entry.peakPriceCents,
          stopPriceCents:n(d.hardStopCents, d.stopPriceCents),
          updatedAtMs:Date.now(), volume24h:priQuote.volume24h || entry.volume24h,
        });
        return { protected:true, action:d.action, profitAuthority:PROTECTED_RUNNER_INTELLIGENCE.version };
      }
      return { protected:true, action:d.action, profitAuthority:PROTECTED_RUNNER_INTELLIGENCE.version };
    }

    // R30 APG1 adds a fee-aware, full-depth executable 2c high-water capture lane.
    // It is deliberately evaluated after U-SG1 so profit capture can never
    // supersede the stop/loss domain, and before U-PG3 so a meaningful
    // executable peak can be protected without waiting for U-PG3's much
    // wider 11c structural breathing room. APG1 and U-PG3 persist independently.
    const apex = await this.evaluateApexProfitGuard(entry, q, s);
    const apexQuote = apex?.q || q;
    d = profitGuardDecision(entry, apexQuote, s);
    if (d.action === 'settlement') {
      this.setState(entry, d);
      return this.closeAtSettlement(entry, d);
    }
    const stopGuardApex = await this.handleUltimateStopGuard(entry, apexQuote, s, d);
    if (stopGuardApex.handled) return stopGuardApex.result;
    if (stopGuardApex.cleared) d = profitGuardDecision(entry, apexQuote, s);
    if (d.action === 'hard_stop') {
      this.setState(entry, d);
      const out = entry.mode === 'LIVE' ? await this.liveExit(entry, d) : await this.simulationExit(entry, d, apexQuote);
      if (out.closed) {
        const fresh = await this.db.entryById(entry.id);
        if (fresh) await this.learning.onHardStop(fresh);
      }
      return out;
    }

    const apexMeta = apex?.armed
      ? this.apexProfitGuardTelemetry(apex.state, apex.executableBidCents, apex.executableFull)
      : {};
    if (apex?.triggered) {
      const pd = {
        ...d,
        ...apexMeta,
        action:'apex_profit_guard',
        exitPriceCents:n(apexQuote?.yesBid, entry.currentPriceCents),
        liveExitPriceCents:n(apexQuote?.yesBid, entry.currentPriceCents),
        reason:'apex_profit_guard',
        guardState:apex.executable ? 'APG1_EXIT' : 'APG1_EXIT_COMMITTED_WAITING_POSITIVE_DEPTH',
        stopPriceCents:entry.stopPriceCents,
        peakPriceCents:Math.max(n(entry.peakPriceCents, entry.entryPriceCents), n(apex.state?.peakExecutableBidCents)),
      };
      this.setState(entry, pd);
      if (!apex.executable) {
        return { protected:true, action:'apex_profit_guard_wait', pending:false, skipped:'waiting_for_full_positive_depth' };
      }
      return entry.mode === 'LIVE' ? this.liveExit(entry, pd) : this.simulationExit(entry, pd, apexQuote);
    }

    // R19 U-PG3 remains the wide fallback: it may harvest only while
    // the full remaining position can still realize positive net profit. The
    // executable peak must first fund the complete configured 7c giveback plus
    // 4c recovery buffer above that floor. Economic break-even is telemetry
    // only. If positive-profit execution disappears, U-PG3 suspends and U-SG1
    // remains the sole loss-domain authority.
    const upg = await this.evaluateUltimateProfitGuard(entry, q, s);
    const decisionQuote = upg?.q || q;
    d = profitGuardDecision(entry, decisionQuote, s);
    if (d.action === 'settlement') {
      this.setState(entry, d);
      return this.closeAtSettlement(entry, d);
    }
    const stopGuardFresh = await this.handleUltimateStopGuard(entry, decisionQuote, s, d);
    if (stopGuardFresh.handled) return stopGuardFresh.result;
    if (stopGuardFresh.cleared) d = profitGuardDecision(entry, decisionQuote, s);
    if (d.action === 'hard_stop') {
      this.setState(entry, d);
      const out = entry.mode === 'LIVE' ? await this.liveExit(entry, d) : await this.simulationExit(entry, d, decisionQuote);
      if (out.closed) {
        const fresh = await this.db.entryById(entry.id);
        if (fresh) await this.learning.onHardStop(fresh);
      }
      return out;
    }

    const upgMeta = upg?.armed ? this.ultimateProfitGuardTelemetry(upg.state, upg.executableBidCents) : {};
    if (upg?.triggered) {
      const committedState = {
        ...(upg.state || {}),
        phase:'UPG3_EXIT_COMMITTED',
        exitCommittedAtMs:Date.now(),
        exitExecutableBidCents:n(upg.executableBidCents, n(decisionQuote?.yesBid)),
        updatedAtMs:Date.now(),
      };
      await this.db.updateEntry(entry.id, { profitGuardState:committedState, updatedAtMs:Date.now() });
      entry.profitGuardState = committedState;
      const pd = {
        ...d,
        ...apexMeta,
        ...upgMeta,
        action:'ultimate_profit_guard',
        exitPriceCents:n(decisionQuote?.yesBid),
        liveExitPriceCents:n(decisionQuote?.yesBid),
        reason:'ultimate_profit_guard',
        guardState:'UPG3_EXIT',
        stopPriceCents:n(committedState.dangerLineCents, entry.stopPriceCents),
        peakPriceCents:Math.max(n(entry.peakPriceCents, entry.entryPriceCents), n(committedState.peakExecutableBidCents)),
      };
      this.setState(entry, pd);
      await this.audit('upg3_exit_committed', {
        id:entry.id, ticker:entry.ticker, concept:entry.conceptName,
        executableBidCents:n(upg.executableBidCents, n(decisionQuote?.yesBid)),
        peakExecutableBidCents:n(committedState.peakExecutableBidCents),
        dangerLineCents:n(committedState.dangerLineCents),
        structuralLineCents:n(committedState.structuralLineCents),
        minimumPositivePriceCents:n(committedState.minimumPositivePriceCents),
        economicBreakEvenPriceCents:n(committedState.economicBreakEvenPriceCents),
        headroomArmPriceCents:n(committedState.headroomArmPriceCents),
        failureConfirmations:n(committedState.failureConfirmations),
        requiredFailureConfirmations:n(committedState.requiredFailureConfirmations),
        immediateGapThrough:Boolean(upg.immediateGapThrough),
        profitFloorLost:Boolean(upg.profitFloorLost),
      });
      return entry.mode === 'LIVE' ? this.liveExit(entry, pd) : this.simulationExit(entry, pd, decisionQuote);
    }

    const displayDecision = upg?.armed && d.action === 'hold'
      ? {
          ...d,
          ...apexMeta,
          ...upgMeta,
          guardState:upg.guardState || upg.state?.phase || 'UPG3_ARMED',
          stopPriceCents:upg.state?.phase === 'UPG3_PROFIT_FLOOR_LOST' ? n(d.hardStopCents, d.stopPriceCents) : n(upg.state?.dangerLineCents, d.stopPriceCents),
          peakPriceCents:Math.max(n(d.peakPriceCents, entry.entryPriceCents), n(upg.state?.peakExecutableBidCents)),
        }
      : { ...d, ...apexMeta };
    this.setState(entry, displayDecision);
    if (d.action === 'hold') {
      await this.db.updateEntry(entry.id, {
        currentPriceCents: displayDecision.currentPriceCents ?? (n(decisionQuote.yesBid) > 0 ? decisionQuote.yesBid : entry.currentPriceCents),
        peakPriceCents: displayDecision.peakPriceCents ?? entry.peakPriceCents,
        stopPriceCents: displayDecision.stopPriceCents ?? entry.stopPriceCents,
        updatedAtMs: Date.now(), volume24h: decisionQuote.volume24h || entry.volume24h,
      });
      return { protected: true, action: d.action };
    }

  }

  protect(entry) { return this.withEntryLock(entry.id, () => this._protect(entry)); }

  async protectTicker(ticker) {
    const s = this.getSettings();
    // HF5: quote-driven protection is capital-risk work. Reference-only Cosmos
    // must never consume this high-priority lane or its database bandwidth.
    const entries = typeof this.db.openHunterEntriesByTicker === 'function'
      ? await this.db.openHunterEntriesByTicker(s.systemName, ticker)
      : (await this.db.openEntriesByTicker(s.systemName, ticker)).filter((e)=>PORTFOLIO_CONCEPTS.has(e.conceptName));
    for (const e of entries) await this.protect(e);
    return entries.length;
  }

  async emergencyExit(entry, q = null) {
    return this.withEntryLockQueued(entry.id, async () => {
      const settings=this.getSettings();
      let current=typeof this.db.entryById==='function' ? await this.db.entryById(entry.id) : entry;
      current=current||entry;
      if(!current||FEEDER_CONCEPTS.has(current.conceptName))return{closed:false,skipped:'not_real_hunter'};
      if(String(current.systemName||'')!==String(settings.systemName||'')||String(current.ownerId||'')!==String(settings.ownerId||'')){
        await this.audit('emergency_exit_owner_mismatch',{id:current.id,ticker:current.ticker,entrySystemName:current.systemName,entryOwnerId:current.ownerId,runtimeSystemName:settings.systemName,runtimeOwnerId:settings.ownerId},'error');
        return{closed:false,skipped:'owner_mismatch'};
      }
      if(current.status==='entry_pending'){
        current=await this.reconcilePending(current);
        if(current.status==='entry_pending')return{closed:false,pending:true,skipped:'entry_pending_reconciliation'};
      }
      if(['closed','rejected'].includes(String(current.status)))return{closed:current.status==='closed',skipped:'position_not_open',status:current.status};
      if(!['open','exit_pending'].includes(String(current.status)))return{closed:false,skipped:'position_not_actionable',status:current.status};

      // Never stack a second broker SELL on top of an unresolved mutation. The
      // operator command has highest non-settlement precedence, but ownership
      // safety requires resolving the exact outstanding client order first.
      if(current.mode==='LIVE'&&current.exitClientOrderId){
        const prior={action:'committed_exit',reason:current.closeReason||'exit_pending',guardState:'EXIT_PENDING_RECONCILIATION',stopPriceCents:current.stopPriceCents,peakPriceCents:current.peakPriceCents};
        const reconciled=await this.reconcileExistingExitIntent(current,prior);
        if(reconciled?.ambiguous)return{...reconciled,pending:true,skipped:'existing_exit_reconciliation'};
        const fresh=await this.db.entryById(current.id);
        if(!fresh||fresh.status==='closed')return{closed:true,reconciledExistingExit:true};
        current=fresh;
      }

      let quote=q;
      if(!quote||this.market.quoteAgeMs(current.ticker)>5000||n(quote.yesBid)<=0||quote.bookInvalid){
        quote=await this.market.refreshTicker(current.ticker).catch(()=>null);
      }
      if(!quote||finalMarket(quote))return{closed:false,skipped:finalMarket(quote)?'market_finality_has_priority':'market_data_unavailable'};
      if(n(quote.yesBid)<=0||quote.bookInvalid)return{closed:false,skipped:'no_valid_bid'};
      await this.market.ensureFreshBook(current.ticker,5000).catch(()=>null);
      quote=this.market.getQuote(current.ticker)||quote;
      const book=this.market.getBook?.(current.ticker);
      const bookAge=this.market.bookAgeMs?.(current.ticker)??Infinity;
      if(!book||bookAge>5000||quote?.bookInvalid)return{closed:false,skipped:'stale_or_invalid_book'};
      const remain=remainingCount(current);
      if(!(remain>0))return{closed:false,skipped:'no_remaining_quantity'};
      const exec=this.market.executableBid(current.ticker,remain);
      if(!exec||!exec.full||n(exec.filled)+1e-9<remain){
        await this.audit('emergency_exit_waiting_full_position_depth',{id:current.id,ticker:current.ticker,concept:current.conceptName,remaining:remain,executableFilled:n(exec?.filled),executableFull:Boolean(exec?.full)},'warning');
        return{closed:false,pending:false,skipped:'emergency_partial_depth_no_split',remaining:remain,executableFilled:n(exec?.filled)};
      }
      const decision={
        action:'emergency_exit',reason:'emergency_exit',guardState:'EMERGENCY_EXIT_COMMITTED',
        exitPriceCents:n(quote.yesBid),liveExitPriceCents:n(quote.yesBid),
        stopPriceCents:current.stopPriceCents,peakPriceCents:Math.max(n(current.peakPriceCents,current.entryPriceCents),n(quote.yesBid)),
      };
      await this.audit('emergency_exit_requested',{id:current.id,ticker:current.ticker,concept:current.conceptName,mode:current.mode,remaining:remain,executableBidCents:n(exec.avgCents,quote.yesBid),bookAgeMs:bookAge});
      this.setState(current,decision);
      const out=current.mode==='LIVE'?await this.liveExit(current,decision):await this.simulationExit(current,decision,quote);
      await this.audit(out.closed?'emergency_exit_completed':'emergency_exit_not_completed',{id:current.id,ticker:current.ticker,concept:current.conceptName,mode:current.mode,closed:Boolean(out.closed),pending:Boolean(out.pending),skipped:out.skipped||null,remaining:out.remaining??null},out.closed?'info':'warning');
      return{...out,pending:Boolean(out.pending)};
    });
  }

  async manualCashout(entry, q, { reason = 'manual_cashout' } = {}) {
    return this.withEntryLockQueued(entry.id, async () => {
      const exitReason = reason === 'golden_eye_cashout' ? 'golden_eye_cashout' : 'manual_cashout';
      const goldenEyeExit = exitReason === 'golden_eye_cashout';
      if (goldenEyeExit && (this.isInfinityBreakTrade(entry)||this.isAtomicThunderTrade(entry)) && this.atomicThunderPolicy(entry, this.getSettings()).enabled) {
        const infinityBreakPriority=this.isInfinityBreakTrade(entry);
        await this.audit(infinityBreakPriority?'golden_eye_cashout_skipped_infinity_break_priority':'golden_eye_cashout_skipped_atomic_thunder_priority', { id:entry.id,ticker:entry.ticker,concept:entry.conceptName,...(infinityBreakPriority?{infinityBreak:INFINITY_BREAK.version}:{atomicThunder:ATOMIC_THUNDER.version}) });
        return { closed:false, skipped:infinityBreakPriority?'infinity_break_has_priority':'atomic_thunder_has_priority' };
      }
      const maximumBookAgeMs = goldenEyeExit ? GOLDEN_EYE.maximumExecutionBookAgeMs : QUOTE_STALE_MS;
      let current = q;
      if (!current || this.market.quoteAgeMs(entry.ticker) > maximumBookAgeMs || n(current.yesBid) <= 0) current = await this.market.refreshTicker(entry.ticker).catch(() => null);
      if (!current || n(current.yesBid) <= 0 || current.bookInvalid) return { closed:false, skipped:'no_bid' };
      await this.market.ensureFreshBook(entry.ticker, goldenEyeExit ? GOLDEN_EYE.maximumExecutionBookAgeMs : 5000).catch(() => null);
      current = this.market.getQuote(entry.ticker) || current;
      const book = this.market.getBook?.(entry.ticker);
      const bookAge = this.market.bookAgeMs?.(entry.ticker) ?? Infinity;
      if (goldenEyeExit && (!book || bookAge > GOLDEN_EYE.maximumExecutionBookAgeMs || current.bookInvalid)) return { closed:false, skipped:'golden_eye_stale_book' };
      const s = this.getSettings();
      const remain = remainingCount(entry);
      const floor = goldenEyeExit ? this.goldenEyeBreakEvenPriceCents(entry, s) : n(current.yesBid);
      const exec = this.market.executableBid(entry.ticker, remain, floor);
      if (!exec || exec.filled <= 0) return { closed:false, skipped:'no_executable_bid' };
      if (goldenEyeExit && (!exec.full || n(exec.filled) + 1e-9 < remain)) return { closed:false, skipped:'golden_eye_partial_depth_no_split' };
      const fillCount = goldenEyeExit ? remain : n(exec.filled);
      const entryFee = allocatedEntryFee(entry, fillCount, s);
      const expectedExitFee = n(s.simFeeCents) * fillCount;
      const net = (n(exec.avgCents, current.yesBid) - entry.entryPriceCents) * fillCount - entryFee - expectedExitFee;
      if (net <= 0) return { closed:false, skipped:'not_profitable', netPnlCents:net };
      const decision = {
        action:exitReason,
        exitPriceCents:current.yesBid,
        liveExitPriceCents:current.yesBid,
        reason:exitReason,
        guardState:goldenEyeExit ? 'GOLDEN_EYE_CASHOUT' : 'MANUAL_CASHOUT',
        goldenEye:goldenEyeExit ? GOLDEN_EYE.version : null,
        goldenEyePolicyRevision:goldenEyeExit ? GOLDEN_EYE.policyRevision : null,
        goldenEyeBreakEvenPriceCents:goldenEyeExit ? floor : null,
        goldenEyeExecutableNetCents:goldenEyeExit ? net : null,
        stopPriceCents:entry.stopPriceCents,
        peakPriceCents:Math.max(entry.peakPriceCents || entry.entryPriceCents,current.yesBid),
      };
      this.setState(entry,decision);
      const out=entry.mode==='LIVE'?await this.liveExit(entry,decision):await this.simulationExit(entry,decision,current);
      return { ...out, pending:Boolean(out.pending) };
    });
  }

  async sweep() {
    try {
      this.protectionOk = true;
      this.lastError = null;
      const s = this.getSettings();
      // HF5: the 1.5s safety sweep is strictly for real owned positions. Before
      // HF5 every open Pegasus/Dragon reference row was updated here and also on
      // quote events, creating a database write storm with no capital-safety value.
      const entries = typeof this.db.openHunterEntries === 'function'
        ? await this.db.openHunterEntries(s.systemName)
        : (await this.db.openEntries(s.systemName)).filter((e)=>PORTFOLIO_CONCEPTS.has(e.conceptName));
      this.pruneRuntimeState(entries);
      this.activeTickers = new Set(entries.map((e) => e.ticker));
      for (const e of entries) await this.protect(e);
      return entries.length;
    } catch (e) {
      this.protectionOk = false;
      this.lastError = String(e?.message || e);
      throw e;
    }
  }

  async referenceSweep() {
    // Cosmos remain fully tracked and settle/close normally, but reference-only
    // persistence is deliberately low-frequency and can never mark real-position
    // protection healthy. This preserves research while removing quote-rate DB IO.
    const s=this.getSettings();
    const entries=typeof this.db.openFeederEntries==='function'
      ? await this.db.openFeederEntries(s.systemName)
      : (await this.db.openEntries(s.systemName)).filter((e)=>FEEDER_CONCEPTS.has(e.conceptName));
    for(const e of entries)await this.protect(e);
    return entries.length;
  }

  async trackPostExit() {
    const s = this.getSettings();
    const now = Date.now();
    const researchWindowMs = Math.max(1, n(s.recoveryTrackingHours, 24)) * 3600000;
    const researchCut = now - researchWindowMs;
    // Post-exit evidence is part of durable learning, not the visible current
    // simulation cohort. Continue the bounded research window across a Reset
    // Simulation archive boundary so resetting statistics never amputates the
    // economic path that was already being observed for a just-closed trade.
    const closed = typeof this.db?.recentClosedForResearch==='function'
      ? await this.db.recentClosedForResearch(s.systemName,researchCut-POST_EXIT_RESEARCH.completionGraceMs,POST_EXIT_RESEARCH.maximumRowsPerSweep)
      : await this.db.recentClosed(s.systemName, POST_EXIT_RESEARCH.maximumRowsPerSweep);
    this.pruneProfitLearningTimestamps(closed);
    const keepIds=new Set((closed||[]).map(e=>String(e?.id||'')).filter(Boolean));
    for(const id of [...this.postExitRuntimeState.keys()])if(!keepIds.has(String(id)))this.postExitRuntimeState.delete(id);
    const tickerContexts=new Map();

    const marketContext=async(e)=>{
      const ticker=String(e?.ticker||'');
      if(tickerContexts.has(ticker))return tickerContexts.get(ticker);
      let q=this.market.getQuote(ticker);
      if(!q||this.market.quoteAgeMs(ticker)>30_000)q=await this.market.refreshTicker(ticker).catch(()=>q);
      if(!q){const none={q:null,isFinal:false,finalPayout:null,displayPrice:null,book:null,bookMs:0,bookFresh:false};tickerContexts.set(ticker,none);return none;}
      const isFinal=finalMarket(q),finalPayout=isFinal?(String(q.result).toLowerCase()==='yes'?100:0):null;
      let book=null,bookMs=0,bookFresh=false;
      if(!isFinal){
        try{await this.market.ensureFreshBook?.(ticker,5000);}catch{}
        q=this.market.getQuote(ticker)||q;
        book=this.market.getBook?.(ticker)||null;
        bookMs=n(book?.updatedAtMs,n(q?.updatedAtMs));
        bookFresh=Boolean(book&&bookMs>0&&Date.now()-bookMs<=5000&&!q?.bookInvalid&&n(q?.yesBid)>0);
      }
      const displayPrice=isFinal?finalPayout:(n(q?.yesBid)>0&&n(q?.yesAsk)>0?(n(q.yesBid)+n(q.yesAsk))/2:(n(q?.yesBid)||n(q?.yesAsk)||null));
      const ctx={q,isFinal,finalPayout,displayPrice,book,bookMs,bookFresh};tickerContexts.set(ticker,ctx);return ctx;
    };

    for (const e of closed) {
      if (!e.closedAtMs) continue;
      const isHunter=!FEEDER_CONCEPTS.has(e.conceptName);
      const isHardStop = e.closeReason === 'hard_stop_loss';
      const profitLearningTrade = this.isProfitLearningTrade(e);
      if (profitLearningTrade) {
        const learningDrained = await this.flushProfitLearningEntry(e.id, 250).catch(()=>false);
        if (!learningDrained) continue;
      }
      const pliState = profitLearningTrade && typeof this.learning?.profitLearningState === 'function'
        ? this.learning.profitLearningState(e.id)
        : null;
      const pliComplete = Boolean(pliState?.trackingComplete);
      if(pliComplete)this.profitLearningQueuedAtMs.delete(String(e.id));
      const needsPliResearch = profitLearningTrade && !pliComplete && e.closedAtMs >= researchCut;
      const needsRecoveryResearch = isHardStop && !e.researchTrackingComplete && e.closedAtMs >= researchCut;
      const researchExpired = e.closedAtMs < researchCut;
      const persistedPost=e.postExitState&&typeof e.postExitState==='object'?e.postExitState:{};
      const priorPost=this.postExitRuntimeState.get(String(e.id))||persistedPost;
      const postComplete=priorPost?.researchComplete===true;
      const needsPostExitResearch=isHunter&&!postComplete&&!researchExpired;
      const needsPostExitCompletion=isHunter&&!postComplete&&researchExpired;

      if (!profitLearningTrade && !isHardStop && !e.researchTrackingComplete) {
        await this.db.updateEntry(e.id, { researchTrackingComplete:true, updatedAtMs:now });
      }

      if (!needsPliResearch && !needsRecoveryResearch && !needsPostExitResearch) {
        if (isHardStop && !e.researchTrackingComplete && researchExpired) {
          await this.db.updateEntry(e.id, { researchTrackingComplete:true, updatedAtMs:now });
        }
        if (profitLearningTrade && !pliComplete && researchExpired && typeof this.learning?.finalizeProfitLearning === 'function') {
          try { await this.learning.finalizeProfitLearning(e, { reason:'research_window_complete' }); }
          catch (error) { await this.audit('pli1_post_exit_finalize_failed', { id:e.id, ticker:e.ticker, error:String(error?.message || error) }, 'warning'); }
        }
        if(needsPostExitCompletion){
          const state={...priorPost,version:POST_EXIT_RESEARCH.version,policyRevision:POST_EXIT_RESEARCH.policyRevision,exitPriceCents:n(e.exitPriceCents),actualRealizedPnlCents:n(e.pnlCents),researchComplete:true,completionReason:'research_window_complete',completedAtMs:now,lastPersistedAtMs:now,economicBasis:'full_position_executable_after_exit'};
          this.postExitRuntimeState.set(String(e.id),state);
          this.enqueuePostExitPersistence(e.id,{postExitState:state,updatedAtMs:now});
        }
        continue;
      }

      const ctx=await marketContext(e);
      const q=ctx.q;
      if (!q) {
        if (profitLearningTrade && !pliComplete && now - e.closedAtMs >= researchWindowMs && typeof this.learning?.finalizeProfitLearning === 'function') {
          try { await this.learning.finalizeProfitLearning(e, { reason:'research_window_complete_no_quote' }); }
          catch (error) { await this.audit('pli1_post_exit_finalize_failed', { id:e.id, ticker:e.ticker, error:String(error?.message || error) }, 'warning'); }
        }
        continue;
      }

      const {isFinal,finalPayout,displayPrice,bookMs,bookFresh}=ctx;
      const patch = {};
      let executableBidCents=null,executableNetCents=null,executableObservedAtMs=null;
      if(isHunter){
        if(isFinal){
          executableBidCents=finalPayout;
          executableNetCents=this.fullPositionCounterfactualNetCents(e,finalPayout,s,{settlement:true});
          executableObservedAtMs=Math.max(n(q?.updatedAtMs,now),n(e.closedAtMs));
        }else if(bookFresh&&typeof this.market.executableBid==='function'){
          const qty=Math.max(1,n(e.count));
          const exec=this.market.executableBid(e.ticker,qty,1);
          if(exec?.full&&n(exec.filled)+1e-9>=qty&&Number.isFinite(Number(exec.avgCents))){
            executableBidCents=n(exec.avgCents);
            executableNetCents=this.fullPositionCounterfactualNetCents(e,executableBidCents,s);
            executableObservedAtMs=bookMs;
          }
        }
      }

      if(needsPostExitResearch){
        const exitPrice=n(e.exitPriceCents);
        const actualPnl=n(e.pnlCents);
        const state={...priorPost,version:POST_EXIT_RESEARCH.version,policyRevision:POST_EXIT_RESEARCH.policyRevision,economicBasis:'full_position_executable_after_exit',exitPriceCents:exitPrice,actualRealizedPnlCents:actualPnl,researchWindowHours:Math.max(1,n(s.recoveryTrackingHours,24)),latestObservedAtMs:Math.max(n(q?.updatedAtMs,now),n(e.closedAtMs)),latestMarketPriceCents:displayPrice,deltaFromExitCents:displayPrice==null?null:Number((displayPrice-exitPrice).toFixed(6))};
        let newExtreme=false;
        if(executableBidCents!=null&&executableNetCents!=null){
          state.latestExecutableBidCents=executableBidCents;state.latestExecutableNetCents=executableNetCents;state.latestExecutableAtMs=executableObservedAtMs;
          if(state.bestExecutableNetCents==null||executableNetCents>n(state.bestExecutableNetCents)+1e-9){state.bestExecutableNetCents=executableNetCents;state.bestExecutableBidCents=executableBidCents;state.bestObservedAtMs=executableObservedAtMs;newExtreme=true;}
          if(state.worstExecutableNetCents==null||executableNetCents<n(state.worstExecutableNetCents)-1e-9){state.worstExecutableNetCents=executableNetCents;state.worstExecutableBidCents=executableBidCents;state.worstObservedAtMs=executableObservedAtMs;newExtreme=true;}
        }
        if(state.bestExecutableNetCents!=null){state.missedUpsideNetCents=Math.max(0,n(state.bestExecutableNetCents)-actualPnl);state.bestDeltaFromExitCents=state.bestExecutableBidCents==null?null:Number((n(state.bestExecutableBidCents)-exitPrice).toFixed(6));}
        if(state.worstExecutableNetCents!=null){state.lossAvoidedNetCents=Math.max(0,actualPnl-n(state.worstExecutableNetCents));state.worstDeltaFromExitCents=state.worstExecutableBidCents==null?null:Number((n(state.worstExecutableBidCents)-exitPrice).toFixed(6));}
        if(isFinal){state.finalized=true;state.finalResult=String(q.result||'').toLowerCase();state.finalPayoutCents=finalPayout;state.researchComplete=true;state.completionReason='market_final';state.completedAtMs=now;}
        const priorPersist=n(priorPost?.lastPersistedAtMs,0),due=now-priorPersist>=POST_EXIT_RESEARCH.persistenceIntervalMs;
        const changedDisplay=state.latestMarketPriceCents!==priorPost?.latestMarketPriceCents||state.deltaFromExitCents!==priorPost?.deltaFromExitCents;
        const changedExecutable=state.latestExecutableBidCents!==priorPost?.latestExecutableBidCents||state.latestExecutableNetCents!==priorPost?.latestExecutableNetCents;
        const terminalChanged=state.researchComplete===true&&priorPost?.researchComplete!==true;
        const first=priorPost?.version!==POST_EXIT_RESEARCH.version;
        if(first||newExtreme||terminalChanged||(due&&(changedDisplay||changedExecutable))){
          state.lastPersistedAtMs=now;
          this.enqueuePostExitPersistence(e.id,{currentPriceCents:displayPrice==null?e.currentPriceCents:displayPrice,postExitState:state,updatedAtMs:now});
        }
        this.postExitRuntimeState.set(String(e.id),state);
      }

      if (needsRecoveryResearch) {
        const price = this.researchPrice(e, q, Math.max(1, n(e.count)), { requireFull:true });
        if (price != null) {
          const observedAtMs = Math.max(n(e.closedAtMs), n(q?.updatedAtMs, now));
          if (e.recoveryToEntryAtMs == null && price >= n(e.entryPriceCents)) patch.recoveryToEntryAtMs = observedAtMs;
          const entryFee = n(e.entryFeeCents) > 0 ? n(e.entryFeeCents) : n(s.simFeeCents) * n(e.count);
          const exitFee = n(s.simFeeCents) * n(e.count);
          const hypotheticalNet = (price - n(e.entryPriceCents)) * n(e.count) - entryFee - exitFee;
          if (e.recoveryToGreenAtMs == null && hypotheticalNet > 0) {
            patch.recoveryToGreenAtMs = observedAtMs;
            patch.recoveryGreenPriceCents = price;
            patch.researchTrackingComplete = true;
          }
        }
        if (isFinal || now - e.closedAtMs >= researchWindowMs) patch.researchTrackingComplete = true;
      }

      if (needsPliResearch) {
        try {
          if (isFinal) {
            if (typeof this.learning?.observeProfitPostExit === 'function') {
              await this.learning.observeProfitPostExit(e, { executableBidCents:finalPayout, executableNetCents, observedAtMs:executableObservedAtMs, finalResult:String(q.result || '').toLowerCase(), terminalNetCents:executableNetCents });
            }
            if (typeof this.learning?.finalizeProfitLearning === 'function') {
              await this.learning.finalizeProfitLearning(e, { finalResult:String(q.result || '').toLowerCase(), terminalNetCents:executableNetCents, reason:'market_final' });
            }
            if (!isHardStop) patch.researchTrackingComplete = true;
          } else {
            if (executableBidCents!=null&&executableNetCents!=null&&typeof this.learning?.observeProfitPostExit === 'function') {
              await this.learning.observeProfitPostExit(e, { executableBidCents, executableNetCents, observedAtMs:executableObservedAtMs });
            }
            if (now - e.closedAtMs >= researchWindowMs && typeof this.learning?.finalizeProfitLearning === 'function') {
              await this.learning.finalizeProfitLearning(e, { reason:'research_window_complete' });
              if (!isHardStop) patch.researchTrackingComplete = true;
            }
          }
        } catch (error) {
          await this.audit('pli1_post_exit_observation_failed', { id:e.id, ticker:e.ticker, error:String(error?.message || error) }, 'warning');
        }
      }

      if (Object.keys(patch).length) {
        patch.updatedAtMs = now;
        await this.db.updateEntry(e.id, patch);
      }
    }
    return closed.length;
  }
}

