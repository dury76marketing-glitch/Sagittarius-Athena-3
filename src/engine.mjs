import { setTimeout as sleep } from 'node:timers/promises';
import { env, freshInstallSettings, deploymentConfigRecord, EDITABLE_NUMERIC_SETTINGS, EDITABLE_BOOLEAN_SETTINGS, RELEASE } from './config.mjs';
import { Database } from './db.mjs';
import { KalshiClient } from './kalshi.mjs';
import { MarketHub } from './market.mjs';
import { LearningEngine } from './learning.mjs';
import { Athena, ATHENA_BRAIN } from './athena.mjs';
import { StrategyEngine } from './strategy.mjs';
import { ProfitGuard } from './profitGuard.mjs';
import { GoldenEye } from './goldenEye.mjs';
import { FeederSignalIntel, FEEDER_SIGNAL_INTELLIGENCE } from './feederSignalIntel.mjs';
import { PORTFOLIO_CONCEPTS, FEEDER_CONCEPTS, computeLiveStatus, MOMENTUM, RECOVERY, GOLDEN_DRAGON, GOLDEN_FEED_BUS, ULTIMATE_STOP_GUARD, STOP_LOSS_WATCHDOG, HARD_ECONOMIC_LOSS_CEILING, STOP_GUARD_RECOVERY_LEARNING, ULTIMATE_PROFIT_GUARD, APEX_PROFIT_GUARD, PROTECTED_RUNNER_INTELLIGENCE, PROFIT_LEARNING_INTELLIGENCE, ATHENA_EXIT_INTELLIGENCE, GOLDEN_EYE } from './doctrine.mjs';
import { GameClockAuthority, GAME_CLOCK_AUTHORITY, isConfirmedGameClockState } from './gameClock.mjs';

const openLike = (s) => ['open', 'entry_pending', 'exit_pending', 'pending_recovery'].includes(s);
const centsNum = (v) => Number.isFinite(Number(v)) ? Number(v) : 0;
const waitUntil = async (ms) => { if (ms > 0) await sleep(ms); };
const FINAL_STATUSES = new Set(['finalized', 'settled']);
const PROTECTION_BACKUP_MS = 1500;
const PROTECTION_FRESH_MS = 10_000;
const WS_FRESH_MS = 70_000;
const SCANNER_FRESH_MS = 7 * 60_000;
const DISPLAY_QUOTE_FRESH_MS = 15_000;

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

// R27 GPI2 orchestration invariant: the quote-driven crash pipeline must wake
// when *either* CI1 has a Dragon/CRH-ready signal or Golden's independently
// tracked exact-episode candidate becomes ready. Golden pending evidence may
// mature after CI1 has reset to NORMAL, so gating solely on state.entryReady
// would silently strand a valid Golden signal until a later full scan.
export function crashPipelineReadyFromState(state, settings = {}) {
  if (!state || typeof state !== 'object') return false;
  if (state.entryReady === true) return true;
  if (settings.goldenDragonEnabled !== true) return false;
  return state.goldenEntryReady === true || state.goldenPendingSignal?.goldenEntryReady === true;
}

export function summarizeGoldenFeeds(entries = []) {
  const rows=(entries||[]).filter((e)=>e?.conceptName==='Golden Dragon'&&e?.feederState?.version===GOLDEN_FEED_BUS.version);
  const byState={},byReason={};
  for(const e of rows){
    const state=String(e.feederState?.state||'UNKNOWN');
    const reason=String(e.feederState?.reason||'unknown');
    byState[state]=(byState[state]||0)+1;
    byReason[reason]=(byReason[reason]||0)+1;
  }
  const recent=[...rows].sort((a,b)=>Number(b.feederState?.lastValidatedAtMs||b.updatedAtMs||0)-Number(a.feederState?.lastValidatedAtMs||a.updatedAtMs||0)).slice(0,25).map((e)=>({
    feederId:e.id,ticker:e.ticker,eventTicker:e.eventTicker||e.ticker,episodeId:String(e.feederState?.episodeId||e.sourceTradeId||''),
    state:String(e.feederState?.state||'UNKNOWN'),reason:String(e.feederState?.reason||'unknown'),gameMinutes:e.feederState?.gameMinutes==null?null:Number(e.feederState.gameMinutes),
    activatedAtMs:Number(e.feederState?.activatedAtMs||0)||null,lastValidatedAtMs:Number(e.feederState?.lastValidatedAtMs||0)||null,
  }));
  return {version:GOLDEN_FEED_BUS.version,total:rows.length,active:Number(byState[GOLDEN_FEED_BUS.activeState]||0),byState,byReason,recent};
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
    this.cyclePromise = null;
    this.protectionLoopPromise = null;
    this.startedAtMs = Date.now();
    this.lastFullScanMs = 0;
    this.lastDiscoveryMs = 0;
    this.lastSnapshotMs = 0;
    this.lastScanMarkets = [];
    this.lastError = null;
    this.quoteProtectionTimers = new Map();
    this.protectedTickers = new Set();
    this.goldenEyeTimer = null;
    this.goldenEyeEvaluationPromise = null;
    this.goldenEyeExecutionPromise = null;
    this.goldenEyeRerunRequested = false;
    this.goldenEye = null;
    this.feederSignalIntel = null;
    // R20/RH1 keeps stopped-source tickers subscribed and lets fresh quote
    // events wake Recovery Hunter instead of waiting for the next 5-minute
    // full scan. The set contains only still-eligible hard-stop sources.
    this.recoveryPriorityTickers = new Set();
    this.recoveryEvaluationTimers = new Map();
    // R35/FQ1 keeps existing reference-feeder tickers hot so ordinary
    // Pegasus/Sagittarius/Dragon/Golden -> Momentum/Wave candidates are
    // evaluated from fresh WebSocket quotes instead of only at scan boundaries.
    this.feederPriorityTickers = new Set();
    this.feederHunterEvaluationTimers = new Map();
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

  async init() {
    await this.db.init();
    this.settings = await this.db.loadSettings(freshInstallSettings());
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
    this.athena = new Athena({
      db:this.db, systemName:this.settings.systemName, sourceRelease:RELEASE,
      audit:(event,data)=>this.db.audit('info',event,data),
    });
    await this.athena.init();
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
        // FSI1 observes the same fresh quote stream but has no entry/exit authority.
        // Telemetry failure is isolated and can never block protection or execution.
        try { this.feederSignalIntel?.observeQuote?.(q); } catch {}
        this.queueQuoteProtection(q?.ticker);
        this.queueGoldenEyeEvaluation(q?.ticker);
        this.queueRecoveryEvaluation(q?.ticker);
        this.queueFeederHunterEvaluation(q?.ticker);
        if (q?.ticker && this.learning) {
          void this.learning.observeCrashQuote(q, this.settings).then((result) => {
            const state = result?.state;
            if (state?.phase === 'CRASHING' || state?.phase === 'REBOUND_CONFIRMED') this.crashPriorityTickers.add(q.ticker);
            else if (state?.phase === 'NORMAL' || state?.phase === 'FINAL') this.crashPriorityTickers.delete(q.ticker);
            if (crashPipelineReadyFromState(state, this.settings)) this.queueCrashRecoveryEvaluation(q.ticker);
          }).catch((e) => this.db.audit('error', 'crash_intelligence_quote', { ticker:q.ticker, message:String(e?.message || e) }).catch(() => {}));
        }
      },
      onPrivate: () => this.queueReconcile(),
    });
    this.feederSignalIntel = new FeederSignalIntel({
      db:this.db, market:this.market, getSettings:()=>this.settings,
      audit:(event,data)=>this.db.audit('warning',event,data),
    });
    await this.feederSignalIntel.init().catch(async(e)=>{
      await this.db.audit('warning','feeder_signal_intel_init_error',{message:String(e?.message||e)}).catch(()=>{});
    });
    this.profitGuard = new ProfitGuard({
      db: this.db,
      kalshi: this.kalshi,
      market: this.market,
      learning: this.learning,
      athena: this.athena,
      getSettings: () => this.settings,
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
      athena: this.athena,
      getSettings: () => this.settings,
      getLiveReady: () => this.isLiveReady(),
      refreshGameClock: (q, options) => this.refreshGameClockForQuote(q, options),
      onHunterOpened: (entry) => {
        if (!entry?.ticker) return;
        this.protectedTickers.add(entry.ticker);
        const wanted = new Set(this.market?.wanted || []);
        wanted.add(entry.ticker);
        this.market?.setWanted?.([...wanted]);
        this.queueGoldenEyeEvaluation(entry.ticker);
      },
      onFeederOpened: (entry) => {
        void this.feederSignalIntel?.register?.(entry).catch(async(error)=>{
          await this.db.audit('warning','feeder_signal_intel_register_error',{feederId:entry?.id,ticker:entry?.ticker,message:String(error?.message||error)}).catch(()=>{});
        });
      },
    });
    await this.refreshFeederPriorityTickers();
    const trackers = await this.db.trackers(this.settings.systemName, 2000);
    this.market.hydrateHistories(trackers);
    this.running = true;
    this.market.start();
    await this.testConnection().catch((e) => this.recordError('kalshi_connection', e));
    await this.reconcileBroker().catch((e) => this.recordError('reconciliation', e));
    this.protectionLoopPromise = this.protectionLoop();
    this.cyclePromise = this.cycleLoop();
    return this;
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

  queueQuoteProtection(ticker) {
    if (!ticker || !this.running || !this.profitGuard || !this.protectedTickers.has(ticker)) return;
    if (this.quoteProtectionTimers.has(ticker)) return;
    const timer = setTimeout(async () => {
      this.quoteProtectionTimers.delete(ticker);
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
    }, 125);
    this.quoteProtectionTimers.set(ticker, timer);
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
      const entries = (await this.db.openEntries(this.settings.systemName))
        .filter((e) => PORTFOLIO_CONCEPTS.has(e.conceptName) && e.status === 'open');
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

  async refreshFeederPriorityTickers() {
    if (!this.db || !this.settings?.systemName) {
      this.feederPriorityTickers = new Set();
      return this.feederPriorityTickers;
    }
    const rows = await this.db.openEntries(this.settings.systemName).catch(() => []);
    this.feederPriorityTickers = new Set((rows || [])
      .filter((e) => FEEDER_CONCEPTS.has(e.conceptName) && openLike(e.status))
      .map((e) => e.ticker)
      .filter(Boolean));
    return this.feederPriorityTickers;
  }

  queueFeederHunterEvaluation(ticker) {
    if (!ticker || !this.running || !this.strategy || !this.feederPriorityTickers.has(ticker)) return;
    if (!this.settings.engineActive || !(this.settings.mode === 'SIMULATION' || this.isLiveReady())) return;
    if (this.settings.momentumHunterEnabled !== true && this.settings.waveSurferEnabled !== true) return;
    if (this.feederHunterEvaluationTimers.has(ticker)) return;
    const timer = setTimeout(async () => {
      this.feederHunterEvaluationTimers.delete(ticker);
      try {
        const q = this.market?.getQuote?.(ticker);
        if (!q || !this.feederPriorityTickers.has(ticker)) return;
        await this.strategy.evaluateMomentumAndWave(new Map([[ticker, q]]));
      } catch (e) {
        await this.db.audit('error', 'feeder_hunter_quote_evaluation', { ticker, message:String(e?.message || e) }).catch(() => {});
      }
    }, 250);
    this.feederHunterEvaluationTimers.set(ticker, timer);
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
    if (!ticker || !this.running || !this.strategy || !this.recoveryPriorityTickers.has(ticker)) return;
    if (!this.settings.engineActive || !(this.settings.mode === 'SIMULATION' || this.isLiveReady())) return;
    if (this.recoveryEvaluationTimers.has(ticker)) return;
    const timer = setTimeout(async () => {
      this.recoveryEvaluationTimers.delete(ticker);
      try {
        const q = this.market?.getQuote?.(ticker);
        if (!q) return;
        const made = await this.strategy.evaluateRecovery(new Map([[ticker, q]]), { onlyTicker:ticker });
        if (made.length) await this.refreshRecoveryPriorityTickers();
      } catch (e) {
        await this.db.audit('error', 'recovery_quote_evaluation', { ticker, message:String(e?.message || e) }).catch(() => {});
      }
    }, 350);
    this.recoveryEvaluationTimers.set(ticker, timer);
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
    if (!ticker || !this.running || !this.strategy) return;
    // R25: the crash quote queue stays active when either Dragon V1 or Golden
    // Dragon can materialize an approved CI1 episode for downstream Hunters.
    if (!Boolean(this.settings.dragonEnabled) && !Boolean(this.settings.goldenDragonEnabled)) return;
    if (!this.settings.engineActive || !(this.settings.mode === 'SIMULATION' || this.isLiveReady())) return;
    const hasCandidate=()=>Boolean(
      (this.settings.dragonEnabled === true && this.learning?.crashEntrySignal?.(ticker)) ||
      (this.settings.goldenDragonEnabled === true && (this.learning?.goldenDragonEntrySignal?.(ticker) || this.learning?.crashEntrySignal?.(ticker)))
    );
    if (!hasCandidate()) return;
    if (this.crashRecoveryEvaluationTimers.has(ticker)) return;
    const timer = setTimeout(async () => {
      this.crashRecoveryEvaluationTimers.delete(ticker);
      try {
        const q = this.market?.getQuote?.(ticker);
        if (!q || !hasCandidate()) return;
        const map = new Map([[ticker, q]]);
        // Dragon is a reference-only consumer of the same CI1 signal. Creating
        // the ghost never consumes R13 exposure. Existing Hunter doctrines then
        // inspect it through the normal feeder path.
        if (this.settings.dragonEnabled === true) await this.strategy.evaluateDragon(map, { onlyTicker:ticker });
        if (this.settings.goldenDragonEnabled === true) await this.strategy.evaluateGoldenDragon?.(map, { onlyTicker:ticker });
        if (this.settings.goldenDragonEnabled === true) await this.strategy.refreshGoldenDragonFeedAuthorities?.(map, { onlyTicker:ticker });
        // RH1 always gets first claim if this exact ticker has a still-eligible
        // stopped-source rescue. If RH1 creates exposure, R13 also protects the
        // ticker from a simultaneous CRH1 or feeder-driven Hunter order.
        if (this.recoveryPriorityTickers.has(ticker)) {
          const rescued = await this.strategy.evaluateRecovery(map, { onlyTicker:ticker });
          if (rescued.length) {
            await this.refreshRecoveryPriorityTickers();
            return;
          }
        }
        if (this.settings.goldenDragonHunterEnabled === true) await this.strategy.evaluateGoldenDragonHunter?.(map, { onlyTicker:ticker });
        if (this.settings.dragonRecoveryHunterEnabled === true) await this.strategy.evaluateDragonRecovery?.(map, { onlyTicker:ticker });
        if (this.settings.crashRecoveryHunterEnabled === true) await this.strategy.evaluateCrashRecovery(map, { onlyTicker:ticker });
        // If CRH is disabled (the intended Dragon comparison lane), Wave and
        // Momentum can react immediately to the newly-created Dragon signal.
        await this.strategy.evaluateMomentumAndWave(map);
      } catch (e) {
        await this.db.audit('error', 'crash_recovery_quote_evaluation', { ticker, message:String(e?.message || e) }).catch(() => {});
      }
    }, 500);
    this.crashRecoveryEvaluationTimers.set(ticker, timer);
  }

  async protectionLoop() {
    while (this.running) {
      try {
        if (Date.now() - this.health.lastProtectionMs >= 1000) await this.runProtectionSweep('independent_1500ms');
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
    return this.settings;
  }

  async patchSettings(patch) {
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

    const price = (k) => { if (next[k] < 1 || next[k] > 99) throw new Error(`${k} must be between 1 and 99 cents`); };
    for (const k of ['pegasusMinPriceCents','pegasusMaxPriceCents','sagittariusMinPriceCents','sagittariusMaxPriceCents','momentumMinEntryCents','momentumMaxEntryCents','waveMinEntryCents','waveMaxEntryCents','recoveryMinEntryCents','recoveryMaxEntryCents','crashRecoveryMinEntryCents','crashRecoveryMaxEntryCents','dragonMinSignalPriceCents','dragonMaxSignalPriceCents','goldenDragonMinSignalPriceCents','goldenDragonMaxSignalPriceCents','dragonRecoveryMinEntryCents','dragonRecoveryMaxEntryCents','goldenDragonHunterMinEntryCents','goldenDragonHunterMaxEntryCents']) price(k);
    if (next.pegasusMinPriceCents > next.pegasusMaxPriceCents) throw new Error('Pegasus minimum price cannot exceed maximum price');
    if (next.sagittariusMinPriceCents > next.sagittariusMaxPriceCents) throw new Error('Sagittarius minimum price cannot exceed maximum price');
    if (next.momentumMinEntryCents > next.momentumMaxEntryCents) throw new Error('Momentum minimum entry cannot exceed maximum entry');
    if (next.waveMinEntryCents > next.waveMaxEntryCents) throw new Error('Wave minimum entry cannot exceed maximum entry');
    if (next.recoveryMinEntryCents > next.recoveryMaxEntryCents) throw new Error('Recovery minimum entry cannot exceed maximum entry');
    if (next.crashRecoveryMinEntryCents > next.crashRecoveryMaxEntryCents) throw new Error('Crash Recovery minimum entry cannot exceed maximum entry');
    if (next.dragonMinSignalPriceCents > next.dragonMaxSignalPriceCents) throw new Error('Dragon minimum signal price cannot exceed maximum signal price');
    if (next.goldenDragonMinSignalPriceCents > next.goldenDragonMaxSignalPriceCents) throw new Error('Golden Dragon minimum signal price cannot exceed maximum signal price');
    if (next.dragonRecoveryMinEntryCents > next.dragonRecoveryMaxEntryCents) throw new Error('Dragon Recovery minimum entry cannot exceed maximum entry');
    if (next.goldenDragonHunterMinEntryCents > next.goldenDragonHunterMaxEntryCents) throw new Error('Golden Dragon Hunter minimum entry cannot exceed maximum entry');
    for (const k of ['pegasusDropCents','sagittariusDropCents','waveStopCents','momentumHunterStopLossCents','recoveryHunterStopLossCents','crashRecoveryStopLossCents','crashRecoveryMinCrashCents','goldenDragonMinCrashCents','dragonRecoveryStopLossCents','goldenDragonHunterStopLossCents']) {
      if (next[k] < 1 || next[k] > 99) throw new Error(`${k} must be between 1 and 99 cents`);
    }
    for (const k of ['momentumMinRiseCents','momentumMinPullbackCents','momentumMaxPullbackCents','momentumMaxSpreadCents','waveMaxSpreadCents','recoveryMinReboundCents','crashRecoveryMaxSpreadCents','crashRecoveryMinReboundCents','goldenDragonMinReboundCents','dragonRecoveryMaxSpreadCents','dragonRecoveryMinReboundCents','goldenDragonHunterMaxSpreadCents','goldenDragonHunterMinReboundCents']) {
      if (next[k] < 0 || next[k] > 99) throw new Error(`${k} must be between 0 and 99 cents`);
    }
    if (next.waveMinFeederFavorableMoveCents < 0 || next.waveMinFeederFavorableMoveCents > 99) throw new Error('Wave minimum feeder favorable move must be between 0 and 99 cents');
    for (const k of ['pegasusReferenceStakeCents','sagittariusReferenceStakeCents','momentumStakeCents','waveStakeCents','recoveryBaseStakeCents','crashRecoveryStakeCents','dragonReferenceStakeCents','goldenDragonReferenceStakeCents','dragonRecoveryStakeCents','goldenDragonHunterStakeCents','startingCapitalCents']) if (next[k] <= 0) throw new Error(`${k} must be greater than zero`);
    if (next.maxPositions < 1 || !Number.isInteger(next.maxPositions)) throw new Error('maxPositions must be a positive integer');
    if (next.maxEntriesPerTrade < 1 || !Number.isInteger(next.maxEntriesPerTrade)) throw new Error('maxEntriesPerTrade must be a positive integer');
    if (next.hunterCooldownMinutes < 0) throw new Error('hunterCooldownMinutes cannot be negative');
    if (next.minGameMinutes < 0 || !Number.isInteger(next.minGameMinutes)) throw new Error('minGameMinutes must be a non-negative integer');
    if (next.eventCooldownMinutes < 0) throw new Error('eventCooldownMinutes cannot be negative');
    if (next.maxSpreadCents < 0 || next.maxSpreadCents > 99) throw new Error('maxSpreadCents must be between 0 and 99');
    if (next.simFillProbability < 0 || next.simFillProbability > 1) throw new Error('simFillProbability must be between 0 and 1');
    if (next.simFeeCents < 0) throw new Error('simFeeCents cannot be negative');
    if (next.recoveryMinObservations < 0 || !Number.isInteger(next.recoveryMinObservations)) throw new Error('recoveryMinObservations must be a non-negative integer');
    if (next.recoveryMinRate < 0 || next.recoveryMinRate > 1) throw new Error('recoveryMinRate must be between 0 and 1');
    if (next.momentumMinPullbackCents > next.momentumMaxPullbackCents) throw new Error('Momentum minimum pullback cannot exceed maximum pullback');
    if (next.momentumMinTimeLeftMinutes < 0) throw new Error('momentumMinTimeLeftMinutes cannot be negative');
    if (next.recoveryTrackingHours <= 0) throw new Error('recoveryTrackingHours must be greater than zero');
    if (next.crashRecoveryMinReclaimRate < 0 || next.crashRecoveryMinReclaimRate > 1) throw new Error('crashRecoveryMinReclaimRate must be between 0 and 1');
    if (next.crashRecoveryEpisodeResetRate < next.crashRecoveryMinReclaimRate || next.crashRecoveryEpisodeResetRate > 1) throw new Error('crashRecoveryEpisodeResetRate must be between the minimum reclaim rate and 1');
    if (next.crashRecoveryStableObservations < 1 || !Number.isInteger(next.crashRecoveryStableObservations)) throw new Error('crashRecoveryStableObservations must be a positive integer');
    if (next.crashRecoveryUpwardTicks < 1 || !Number.isInteger(next.crashRecoveryUpwardTicks)) throw new Error('crashRecoveryUpwardTicks must be a positive integer');
    if (next.crashRecoveryUpwardTicks > next.crashRecoveryStableObservations) throw new Error('crashRecoveryUpwardTicks cannot exceed crashRecoveryStableObservations');
    if (next.dragonMaxEpisode < 1 || !Number.isInteger(next.dragonMaxEpisode)) throw new Error('dragonMaxEpisode must be a positive integer');
    if (next.goldenDragonMaxEpisode < 1 || !Number.isInteger(next.goldenDragonMaxEpisode)) throw new Error('goldenDragonMaxEpisode must be a positive integer');
    if (next.goldenDragonEnabled === true && next.goldenDragonMinCrashCents < next.crashRecoveryMinCrashCents) throw new Error('goldenDragonMinCrashCents cannot be below CI1 crashRecoveryMinCrashCents because Golden consumes CI1 crash episodes');
    if (next.goldenDragonMinReclaimRate < 0 || next.goldenDragonMinReclaimRate > 1) throw new Error('goldenDragonMinReclaimRate must be between 0 and 1');
    if (next.goldenDragonStableObservations < 1 || !Number.isInteger(next.goldenDragonStableObservations)) throw new Error('goldenDragonStableObservations must be a positive integer');
    if (next.goldenDragonUpwardTicks < 1 || !Number.isInteger(next.goldenDragonUpwardTicks)) throw new Error('goldenDragonUpwardTicks must be a positive integer');
    if (next.goldenDragonUpwardTicks > next.goldenDragonStableObservations) throw new Error('goldenDragonUpwardTicks cannot exceed goldenDragonStableObservations');
    if (next.goldenDragonMinTrustScore < 0 || next.goldenDragonMinTrustScore > 100) throw new Error('goldenDragonMinTrustScore must be between 0 and 100');
    if (next.goldenDragonMinRecoveryAgeSeconds < 0) throw new Error('goldenDragonMinRecoveryAgeSeconds cannot be negative');
    if (next.goldenDragonMaxRecoveryAgeSeconds <= 0) throw new Error('goldenDragonMaxRecoveryAgeSeconds must be greater than zero');
    if (next.goldenDragonMinRecoveryAgeSeconds * 1000 >= next.goldenDragonMaxRecoveryAgeSeconds * 1000) throw new Error('Golden Dragon minimum recovery age must be below maximum recovery age');
    if (next.dragonRecoveryMinReclaimRate < 0 || next.dragonRecoveryMinReclaimRate > 1) throw new Error('dragonRecoveryMinReclaimRate must be between 0 and 1');
    if (next.dragonRecoveryStableObservations < 1 || !Number.isInteger(next.dragonRecoveryStableObservations)) throw new Error('dragonRecoveryStableObservations must be a positive integer');
    if (next.dragonRecoveryUpwardTicks < 1 || !Number.isInteger(next.dragonRecoveryUpwardTicks)) throw new Error('dragonRecoveryUpwardTicks must be a positive integer');
    if (next.dragonRecoveryUpwardTicks > next.dragonRecoveryStableObservations) throw new Error('dragonRecoveryUpwardTicks cannot exceed dragonRecoveryStableObservations');
    if (next.goldenDragonHunterMinTrustScore < 0 || next.goldenDragonHunterMinTrustScore > 100) throw new Error('goldenDragonHunterMinTrustScore must be between 0 and 100');
    if (next.goldenDragonHunterMaxEpisode < 1 || !Number.isInteger(next.goldenDragonHunterMaxEpisode)) throw new Error('goldenDragonHunterMaxEpisode must be a positive integer');
    if (next.goldenDragonHunterMaxEpisode > next.goldenDragonMaxEpisode) throw new Error('Golden Dragon Hunter max episode cannot exceed Golden Dragon max episode');
    if (next.goldenDragonHunterMinReclaimRate < 0 || next.goldenDragonHunterMinReclaimRate > 1) throw new Error('goldenDragonHunterMinReclaimRate must be between 0 and 1');
    if (next.goldenDragonHunterStableObservations < 1 || !Number.isInteger(next.goldenDragonHunterStableObservations)) throw new Error('goldenDragonHunterStableObservations must be a positive integer');
    if (next.goldenDragonHunterUpwardTicks < 1 || !Number.isInteger(next.goldenDragonHunterUpwardTicks)) throw new Error('goldenDragonHunterUpwardTicks must be a positive integer');
    if (next.goldenDragonHunterUpwardTicks > next.goldenDragonHunterStableObservations) throw new Error('goldenDragonHunterUpwardTicks cannot exceed goldenDragonHunterStableObservations');
    if (next.goldenDragonHunterEnabled && !next.goldenDragonEnabled) throw new Error('Golden Dragon Hunter requires Golden Dragon to be enabled');
    if (next.dragonRecoveryHunterEnabled && !next.goldenDragonEnabled) throw new Error('Dragon Recovery Hunter requires Golden Dragon to be enabled');

    this.settings = next;
    await this.db.saveSettings(next);
    return next;
  }

  async setEngine(active) {
    this.settings = { ...this.settings, engineActive: Boolean(active) };
    await this.db.saveSettings(this.settings);
    return this.settings;
  }

  requestScan() { this.scanRequested = true; }

  async resetDashboard() {
    this.settings = { ...this.settings, resetTimestampMs: Date.now() };
    await this.db.saveSettings(this.settings);
    return this.settings;
  }

  async resetSimulation() {
    if (this.settings.mode !== 'SIMULATION') throw new Error('Simulation reset is only allowed in SIMULATION mode');
    const n = await this.db.archiveSimulation(this.settings.systemName);
    await this.db.clearTrackers(this.settings.systemName);
    // Crash Intelligence is learning state, not simulation P/L. Preserve it
    // across performance resets so Dragon episode numbering and historical
    // context cannot restart mid-market.
    this.refreshCrashPriorityTickers();
    this.market.histories.clear();
    this.settings = { ...this.settings, resetTimestampMs: null };
    await this.db.saveSettings(this.settings);
    return n;
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
      for (const e of owned) {
        // An entry with an ambiguous broker mutation is never made "owned" by
        // unrelated aggregate account quantity. Exact client-order truth must
        // resolve it first in Profit Guard.
        if (e.status === 'entry_pending' || e.status === 'pending_recovery') {
          ok = false;
          continue;
        }
        const broker = byTicker.get(e.ticker) || 0;
        if (broker + 1e-6 < (e.remainingCount || e.count)) ok = false;
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
    const oldRows = await this.db.trackers(this.settings.systemName, 2000);
    const old = new Map(oldRows.map((x) => [x.ticker, x]));
    const open = await this.db.openEntries(this.settings.systemName);
    const entered = new Set(open.map((e) => e.ticker));
    const recoveryRequired = new Set((additionalRequiredTickers || []).map(String).filter(Boolean));
    const requiredTickers = new Set([...entered, ...recoveryRequired]);
    const bands = [];
    if (this.settings.pegasusEnabled) bands.push([this.settings.pegasusMinPriceCents, this.settings.pegasusMaxPriceCents]);
    if (this.settings.sagittariusEnabled) bands.push([this.settings.sagittariusMinPriceCents, this.settings.sagittariusMaxPriceCents]);
    if (this.settings.dragonEnabled) bands.push([this.settings.dragonMinSignalPriceCents, this.settings.dragonMaxSignalPriceCents]);
    if (this.settings.waveSurferEnabled) bands.push([this.settings.waveMinEntryCents, this.settings.waveMaxEntryCents]);
    if (this.settings.momentumHunterEnabled) bands.push([this.settings.momentumMinEntryCents ?? MOMENTUM.minEntryCents, this.settings.momentumMaxEntryCents ?? MOMENTUM.maxEntryCents]);
    if (this.settings.recoveryHunterEnabled) bands.push([this.settings.recoveryMinEntryCents ?? RECOVERY.minEntryCents, this.settings.recoveryMaxEntryCents ?? RECOVERY.maxEntryCents]);
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
    const resolvedClockStates = await this.gameClock.resolveBatch(selected, priorClockStates, now, { gameStatsEventTickers });
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
    const state = await this.gameClock.resolveEvent({ eventTicker, quotes: siblings, priorState: prior, now, allowGameStats: true, forceFresh });
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
      const before = (await this.db.openEntries(this.settings.systemName)).length;
      await this.runProtectionSweep('full_scan');
      const after = (await this.db.openEntries(this.settings.systemName)).length;
      this.speed.closedThisLoop = Math.max(0, before - after);
      await this.refreshRecoveryPriorityTickers();
      await this.learning.trackRecovery(this.market.quotes, this.settings);
      await this.learning.trackStopGuardRecovery?.(this.market.quotes,this.settings,this.market).catch(async(error)=>{
        await this.db.audit('warning','stop_guard_recovery_tracking',{source:'full_scan',message:String(error?.message||error)}).catch(()=>{});
      });
      for (const q of map.values()) await this.learning.observeCrashQuote(q, this.settings);
      this.refreshCrashPriorityTickers();

      const newEntries = [];
      if (this.settings.engineActive && (this.settings.mode === 'SIMULATION' || this.isLiveReady())) {
        newEntries.push(...await this.strategy.evaluateRecovery(map));
        // R24 ordering invariant: Dragon must materialize an exact approved
        // episode before CRH1 can hunt it in the same scan.
        newEntries.push(...await this.strategy.evaluateDragon(map));
        newEntries.push(...await this.strategy.evaluateGoldenDragon(map));
        await this.strategy.refreshGoldenDragonFeedAuthorities?.(map);
        newEntries.push(...await this.strategy.evaluateGoldenDragonHunter(map));
        newEntries.push(...await this.strategy.evaluateDragonRecovery(map));
        newEntries.push(...await this.strategy.evaluateCrashRecovery(map));
        newEntries.push(...await this.strategy.evaluateFeeders(markets, trackerMap));
        await this.refreshFeederPriorityTickers();
        newEntries.push(...await this.strategy.evaluateMomentumAndWave(map));
      }

      await this.profitGuard.trackPostExit();
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
          if (this.settings.engineActive && (this.settings.mode === 'SIMULATION' || this.isLiveReady())) {
            await this.strategy.evaluateRecovery(map);
            // R24 ordering invariant: Dragon approval precedes CRH1 evaluation.
            await this.strategy.evaluateDragon(map);
            await this.strategy.evaluateGoldenDragon(map);
            await this.strategy.refreshGoldenDragonFeedAuthorities?.(map);
            await this.strategy.evaluateGoldenDragonHunter(map);
            await this.strategy.evaluateDragonRecovery(map);
            await this.strategy.evaluateCrashRecovery(map);
            await this.strategy.evaluateFeeders(marketList, trackerMap);
            await this.refreshFeederPriorityTickers();
            await this.strategy.evaluateMomentumAndWave(map);
          }
          first = false;
        }
        const before = (await this.db.openEntries(this.settings.systemName)).length;
        await this.runProtectionSweep('fast_phase');
        const after = (await this.db.openEntries(this.settings.systemName)).length;
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
    await this.profitGuard.trackPostExit();
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

  async performance() {
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
    const partialRealized = open
      .filter((e) => !reset || Number(e.updatedAtMs || 0) >= reset)
      .reduce((sum, e) => sum + Number(e.pnlCents || 0), 0);
    const realized = closedRealized + partialRealized;
    const unrealized = open.reduce((sum, e) => {
      const v = this.quoteView(e);
      return sum + this.openUnrealized(e, v.priceCents);
    }, 0);
    const ghosts = active.filter((e) => FEEDER_CONCEPTS.has(e.conceptName));
    const ghostOpen = ghosts.filter((e) => openLike(e.status));
    const feederUnrealized = ghostOpen.reduce((sum, e) => {
      const v = this.quoteView(e);
      const count = Number(e.count || 0);
      return sum + (v.priceCents - e.entryPriceCents) * count - 2 * Number(this.settings.simFeeCents || 2) * count;
    }, 0);
    const simulationCashCents = await this.strategy.simulationAvailableCashCents().catch(() => null);
    return {
      entries, active, hunters, closed, open, wins, losses, scratches,
      hunterRealizedCents: realized,
      closedRealizedCents: closedRealized,
      partialRealizedCents: partialRealized,
      hunterUnrealizedCents: unrealized,
      feederRealizedCents: 0,
      feederUnrealizedCents: feederUnrealized,
      winRate: closed.length ? wins / closed.length : 0,
      openHunters: open.length,
      closedHunters: closed.length,
      portfolioValueCents: this.settings.startingCapitalCents + realized + unrealized,
      simulationCashCents,
    };
  }

  async state() {
    this.recomputeHealth();
    const p = await this.performance();
    const entries = p.active;
    const [trackers, patterns, sports, snapshots, audit, recoveryTracking, crashEpisodes] = await Promise.all([
      this.db.trackers(this.settings.systemName, 500),
      this.db.patterns(this.settings.systemName),
      this.db.sportProfiles(),
      this.db.snapshots(this.settings.systemName, 500),
      this.db.recentAudit(50),
      this.db.recoveryTrackingCount(this.settings.systemName),
      typeof this.db.crashEpisodes === 'function' ? this.db.crashEpisodes(this.settings.systemName, { limit:500 }) : [],
    ]);
    const crashLearning = this.learning?.crashLearningSummary?.() || { version:'CI1', states:[], totalEpisodes:0, multipleCrashMarkets:0 };
    const profitLearning = this.learning?.profitLearningSummary?.() || { version:PROFIT_LEARNING_INTELLIGENCE.version, tracked:0, complete:0, postExitTracking:0, active:0 };
    const stopGuardRecoveryLearning = await this.learning?.stopGuardRecoverySummary?.().catch(()=>null) || { version:STOP_GUARD_RECOVERY_LEARNING.version, tracked:0, complete:0, recovered:0, decisionEvidenceMode:STOP_GUARD_RECOVERY_LEARNING.decisionEvidenceMode };
    const athena = this.athena?.summary?.() || { version:ATHENA_BRAIN.version, ready:false, adaptiveMode:ATHENA_BRAIN.adaptiveMode, adaptiveDecisionWeight:0 };
    const goldenPipeline = this.strategy?.goldenPipelineSummary?.() || { version:'GPI4', trackedEpisodes:0, byStage:{}, byReason:{}, recent:[] };
    const entryPipeline = this.strategy?.entryPipelineSummary?.() || { version:'EPT1', attempts:0, opened:0, blocked:0, byStage:{}, byReason:{}, recent:[] };
    const feederEnabled = this.settings.pegasusEnabled === true || this.settings.sagittariusEnabled === true || this.settings.dragonEnabled === true || this.settings.goldenDragonEnabled === true;
    const initialExposureEnabled = [
      this.settings.momentumHunterEnabled === true && feederEnabled ? 'Momentum Hunter' : null,
      this.settings.waveSurferEnabled === true && feederEnabled ? 'Wave Surfer' : null,
      this.settings.crashRecoveryHunterEnabled === true && (this.settings.dragonEnabled === true || this.settings.goldenDragonEnabled === true) ? 'Crash Recovery Hunter' : null,
      this.settings.dragonRecoveryHunterEnabled === true && this.settings.goldenDragonEnabled === true ? 'Dragon Recovery Hunter' : null,
      this.settings.goldenDragonHunterEnabled === true && this.settings.goldenDragonEnabled === true ? 'Golden Dragon Hunter' : null,
    ].filter(Boolean);
    const entryPathWarnings = [];
    if (this.settings.crashRecoveryHunterEnabled === true && this.settings.dragonEnabled !== true && this.settings.goldenDragonEnabled !== true) entryPathWarnings.push('Crash Recovery Hunter enabled but both approved source feeders Dragon and Golden Dragon are disabled');
    if (this.settings.recoveryHunterEnabled === true) entryPathWarnings.push('Recovery Hunter is follow-on only and requires an eligible stopped Hunter source');
    if (!initialExposureEnabled.length) entryPathWarnings.push('No currently enabled configuration can create an initial real Hunter exposure');
    const entryPathConfiguration = { version:'EPC1', initialExposureEnabled, recoveryFollowOnEnabled:this.settings.recoveryHunterEnabled === true, warnings:entryPathWarnings };
    const goldenFeedSummary = summarizeGoldenFeeds(entries);
    const conceptStats = this.buildConceptStats(entries);
    const openHunters = p.open.map((e) => this.decorateEntry(e));
    const openFeeders = entries.filter((e) => FEEDER_CONCEPTS.has(e.conceptName) && openLike(e.status)).map((e) => this.decorateEntry(e));
    const closedHunters = p.closed.map((e) => this.decorateEntry(e));
    const scanned = this.lastScanMarkets.slice(0, 100);
    const trackerSummary = {
      tracked: trackers.length,
      hot: trackers.filter((t) => t.phase === 'hot').length,
      aboutToEnter: trackers.filter((t) => t.phase === 'about_to_enter').length,
      entered: trackers.filter((t) => t.phase === 'entered').length,
      recovery: trackers.filter((t) => t.phase === 'recovery').length,
    };
    const fedHunters = p.hunters.filter((e) => e.sourceFeeder && FEEDER_CONCEPTS.has(e.sourceFeeder));
    const fedClosed = fedHunters.filter((e) => e.status === 'closed');
    const fedWins = fedClosed.filter((e) => e.pnlCents > 0).length;
    const fedLosses = fedClosed.filter((e) => e.pnlCents < 0).length;
    const feederSummary = {
      hunters: fedHunters.length,
      wins: fedWins,
      losses: fedLosses,
      scratches: fedClosed.filter((e) => e.pnlCents === 0).length,
      pnlCents: fedClosed.reduce((sum, e) => sum + e.pnlCents, 0),
      winRate: fedClosed.length ? fedWins / fedClosed.length : 0,
    };
    return {
      settings: { ...this.settings, allowLiveTrading: env.allowLiveTrading, liveReady: this.isLiveReady() },
      riskControls: {
        singleRealHunterPerExactTicker: true,
        exactTickerLockScope: 'owned_hunters_only',
        feederSignalsExempt: true,
        gameClockAuthority: GAME_CLOCK_AUTHORITY.version,
        gameClockActivityOnlyAuthorization: false,
        gameClockStrongSources: ['kalshi_live_data', 'kalshi_game_stats'],
        gameClockMilestoneDiscovery: ['related_event_ticker', 'events_with_milestones_exact_primary_or_related'],
        gameClockUnknownCandidateForceFreshBeforeClockGate: true,
        gameClockFallback: 'occurrence_passed_plus_broad_live_or_pbp_current_official_window',
        gameClockPersistenceScope: 'event_ticker',
        gameClockFreshEntryAuthorizationRequired: true,
        gameClockEntryAuthorizationMaxAgeMs: GAME_CLOCK_AUTHORITY.entryAuthorizationMaxAgeMs,
        gameClockExactActiveMarketRevalidation: true,
        gameClockFallbackFreshTradeEvidenceRequired: true,
        gameClockPbpEntryAuthorization: 'requires_fresh_exact_trade_plus_current_official_window',
        ultimateStopGuard: ULTIMATE_STOP_GUARD.version,
        stopLossWatchdog: STOP_LOSS_WATCHDOG.version,
        stopLossWatchdogRole: 'early_economic_loss_classifier_inside_usg1',
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
        hardEconomicLossCeiling: HARD_ECONOMIC_LOSS_CEILING.version,
        hardEconomicLossCeilingPolicyRevision: HARD_ECONOMIC_LOSS_CEILING.policyRevision,
        hardEconomicLossCeilingRole: HARD_ECONOMIC_LOSS_CEILING.role,
        hardEconomicLossCeilingStakeBasis: HARD_ECONOMIC_LOSS_CEILING.stakeBasis,
        hardEconomicLossCeilingRatio: HARD_ECONOMIC_LOSS_CEILING.lossRatio,
        hardEconomicLossCeilingAbsoluteMaximumCents: HARD_ECONOMIC_LOSS_CEILING.absoluteMaximumLossCents,
        hardEconomicLossCeilingEconomicBasis: HARD_ECONOMIC_LOSS_CEILING.fullPositionEconomicBasis,
        hardEconomicLossCeilingRecoveryVetoAllowed: HARD_ECONOMIC_LOSS_CEILING.recoveryVetoAllowed,
        hardEconomicLossCeilingDurableFlattenRequired: HARD_ECONOMIC_LOSS_CEILING.durableFlattenRequired,
        hardEconomicLossCeilingLossAuthority: HARD_ECONOMIC_LOSS_CEILING.lossAuthority,
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
        feederSignalIntelligenceEntryAuthority: false,
        feederSignalIntelligenceExecutionAuthority: false,
        feederSignalIntelligenceAthenaDecisionAuthority: false,
        feederSignalIntelligenceAnalysisStakeCents: FEEDER_SIGNAL_INTELLIGENCE.analysisStakeCents,
        feederSignalIntelligenceReferenceProfitThresholdsCents: [...FEEDER_SIGNAL_INTELLIGENCE.referenceProfitThresholdsCents],
        stopGuardDangerLine: 'frozen_model_stop',
        stopGuardEmergencyExtensionCents: ULTIMATE_STOP_GUARD.emergencyExtensionCents,
        stopGuardCriticalMinimumRecoveryRate: ULTIMATE_STOP_GUARD.minimumCriticalRecoveryRate,
        stopGuardCriticalMinimumObservations: ULTIMATE_STOP_GUARD.minimumLearningObservations,
        recoveryHunterContinuity: 'RH1',
        recoveryTickerPriority: true,
        recoveryEventDrivenQuoteEvaluation: true,
        feederHunterEventDrivenQuoteEvaluation: true,
        feederHunterPriorityTickerCount: this.feederPriorityTickers.size,
        entryPipelineTelemetry: 'EPT1',
        recoveryReboundOrigin: 'post_stop_trough',
        recoveryReboundPrice: 'best_bid',
        recoveryTargetStakeMultiplier: 2,
        recoveryExactConfiguredSizing: true,
        recoveryPriorityTickerCount: this.recoveryPriorityTickers.size,
        crashIntelligence: 'CI1',
        crashRecoveryHunter: 'CRH1',
        crashLearningAlwaysOn: true,
        crashRecoveryModelEnabled: this.settings.crashRecoveryHunterEnabled === true,
        crashRecoveryMinCrashCents: Number(this.settings.crashRecoveryMinCrashCents),
        crashRecoveryMinReboundCents: Number(this.settings.crashRecoveryMinReboundCents),
        crashRecoveryMinReclaimRate: Number(this.settings.crashRecoveryMinReclaimRate),
        crashRecoveryStableObservations: Number(this.settings.crashRecoveryStableObservations),
        crashRecoveryUpwardTicks: Number(this.settings.crashRecoveryUpwardTicks),
        crashRecoveryEpisodeResetRate: Number(this.settings.crashRecoveryEpisodeResetRate),
        crashRecoveryPriorityTickerCount: this.crashPriorityTickers.size,
        crashRecoveryDefersToRecoveryHunter: true,
        crashRecoveryHuntingGround: 'approved_crash_signal_episode',
        crashRecoveryRequiresApprovedSignal: true,
        crashRecoverySameEpisodeRequired: true,
        crashRecoverySourceFeeders: ['Dragon','Golden Dragon'],
        dragonFeeder: 'DRAGON-V1',
        dragonReferenceOnly: true,
        dragonEnabled: this.settings.dragonEnabled === true,
        dragonMinSignalPriceCents: Number(this.settings.dragonMinSignalPriceCents),
        dragonMaxSignalPriceCents: Number(this.settings.dragonMaxSignalPriceCents),
        dragonMaxEpisode: Number(this.settings.dragonMaxEpisode),
        dragonCrashIntelligenceSource: 'CI1',
        goldenDragonFeeder: 'GOLDEN-DRAGON-V1',
        goldenDragonReferenceOnly: true,
        goldenDragonEnabled: this.settings.goldenDragonEnabled === true,
        goldenDragonMinSignalPriceCents: Number(this.settings.goldenDragonMinSignalPriceCents),
        goldenDragonMaxSignalPriceCents: Number(this.settings.goldenDragonMaxSignalPriceCents),
        goldenDragonMaxEpisode: Number(this.settings.goldenDragonMaxEpisode),
        goldenDragonMinCrashCents: Number(this.settings.goldenDragonMinCrashCents),
        goldenDragonCrashEpisodeSourceMinCents: Number(this.settings.crashRecoveryMinCrashCents),
        goldenDragonRecoveryAgeOrigin: 'trough_at_ms',
        goldenDragonMaxRecoveryAgeOrigin: 'rebound_confirmed_at_ms',
        goldenDragonMinReboundCents: Number(this.settings.goldenDragonMinReboundCents),
        goldenDragonMinReclaimRate: Number(this.settings.goldenDragonMinReclaimRate),
        goldenDragonStableObservations: Number(this.settings.goldenDragonStableObservations),
        goldenDragonUpwardTicks: Number(this.settings.goldenDragonUpwardTicks),
        goldenDragonMinTrustScore: Number(this.settings.goldenDragonMinTrustScore),
        goldenDragonHistoricalSurvivalVetoMinObservations: Number(GOLDEN_DRAGON.minHistoricalObservations),
        goldenDragonHistoricalSurvivalVetoMinimumRate: Number(GOLDEN_DRAGON.minHistoricalSurvivalRate),
        goldenDragonMinRecoveryAgeSeconds: Number(this.settings.goldenDragonMinRecoveryAgeSeconds),
        goldenDragonMaxRecoveryAgeSeconds: Number(this.settings.goldenDragonMaxRecoveryAgeSeconds),
        goldenFeedBus: GOLDEN_FEED_BUS.version,
        goldenFeedAuthorityPersistence: 'sag_entries.feeder_state',
        goldenFeedConsumers: [...GOLDEN_FEED_BUS.consumers],
        goldenFeedActivation: 'confirmed_min_game_time',
        goldenRecoveryAgeScope: 'signal_creation_only',
        goldenFeedExactEpisodeRequired: true,
        goldenFeedApprovedTroughBreachInvalidates: true,
        goldenFeedTransientGoldenRequalificationRequired: false,
        goldenDragonHunter: 'GDH1',
        goldenDragonHunterEnabled: this.settings.goldenDragonHunterEnabled === true,
        goldenDragonHunterRequiresGoldenDragon: true,
        goldenDragonHunterMinEntryCents: Number(this.settings.goldenDragonHunterMinEntryCents),
        goldenDragonHunterMaxEntryCents: Number(this.settings.goldenDragonHunterMaxEntryCents),
        goldenDragonHunterMinTrustScore: Number(this.settings.goldenDragonHunterMinTrustScore),
        goldenDragonHunterMaxEpisode: Number(this.settings.goldenDragonHunterMaxEpisode),
        goldenDragonHunterPreExecutionDoctrineRevalidation: true,
        dragonRecoveryHunter: 'DRH1',
        dragonRecoveryHunterEnabled: this.settings.dragonRecoveryHunterEnabled === true,
        dragonRecoveryHuntingGround: 'golden_dragon_signal_episode',
        dragonRecoveryRequiresGoldenDragon: true,
        athenaBrain: ATHENA_BRAIN.version,
        athenaRole: ATHENA_BRAIN.role,
        athenaPlacement: ATHENA_BRAIN.placement,
        athenaConsumers: ['Momentum Hunter','Wave Surfer','Recovery Hunter','Crash Recovery Hunter','Dragon Recovery Hunter','Golden Dragon Hunter'],
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
      conceptStats, feederSummary, goldenPipeline, goldenFeedSummary, entryPipeline, entryPathConfiguration, openHunters, openFeeders, closedHunters,
      trackedMarkets: trackers, trackerSummary, patterns, recoveryTracking, sports,
      crashLearning, crashEpisodes, profitLearning, stopGuardRecoveryLearning, athena, goldenEye:this.goldenEye?.summary?.() || {version:GOLDEN_EYE.version,ready:false,enabled:false},
      liveMarkets: scanned,
      scanner: { tracked: trackers.length, activeMarkets: scanned.length, lastScanMs: this.lastFullScanMs, ...this.speed },
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
    const referenceCount = isFeeder ? Number(e.count || 0) : 0;
    const referencePnlCents = isFeeder
      ? (Number(view.priceCents) - Number(e.entryPriceCents)) * referenceCount - 2 * Number(this.settings.simFeeCents || 2) * referenceCount
      : null;
    const favorableMoveCents = isFeeder ? Math.max(0, Number(view.priceCents) - Number(e.entryPriceCents)) : null;
    const adverseMoveCents = isFeeder ? Math.max(0, Number(e.entryPriceCents) - Number(view.priceCents)) : null;
    const sourceSignalPrice = e.conceptName === 'Golden Dragon'
      ? e.entryConfig?.goldenDragonSource?.signalPriceCents
      : e.conceptName === 'Dragon' ? e.entryConfig?.dragonSource?.signalPriceCents : null;
    const signalPriceCents = Number.isFinite(Number(sourceSignalPrice)) ? Number(sourceSignalPrice) : null;
    const referenceOriginCents = isFeeder ? Number(e.entryPriceCents) : null;
    const referenceOrigin = isFeeder && ['Dragon','Golden Dragon'].includes(e.conceptName) ? 'crash_trough' : (isFeeder ? 'feeder_entry' : null);
    return {
      ...e,
      currentPriceCents: view.priceCents,
      volume24h: view.q?.volume24h ?? e.volume24h,
      unrealizedCents: unrealized,
      positionPnlCents: Number(e.pnlCents || 0) + unrealized,
      referencePnlCents, favorableMoveCents, adverseMoveCents, signalPriceCents, referenceOriginCents, referenceOrigin,
      quoteAgeMs: Number.isFinite(view.quoteAgeMs) ? view.quoteAgeMs : null,
      dataState: view.dataState,
      gameMinutes: e.gameStartTimeMs ? Math.max(0, Math.round((Date.now() - e.gameStartTimeMs) / 60000)) : null,
      liveStatus: view.q?.liveStatus || view.q?.status || '',
      maeAfterEntryMs: e.maeAtMs == null ? null : Math.max(0, Number(e.maeAtMs) - Number(e.openedAtMs || 0)),
      recoveryToEntryMs: e.recoveryToEntryAtMs == null || e.closedAtMs == null ? null : Math.max(0, Number(e.recoveryToEntryAtMs) - Number(e.closedAtMs)),
      recoveryToGreenMs: e.recoveryToGreenAtMs == null || e.closedAtMs == null ? null : Math.max(0, Number(e.recoveryToGreenAtMs) - Number(e.closedAtMs)),
      profitGuard: guard,
    };
  }

  buildConceptStats(entries) {
    const names = ['Golden Dragon Hunter', 'Dragon Recovery Hunter', 'Crash Recovery Hunter', 'Wave Surfer', 'Recovery Hunter', 'Momentum Hunter', 'Golden Dragon', 'Dragon', 'Pegasus', 'Sagittarius'];
    const out = [];
    for (const name of names) {
      if (FEEDER_CONCEPTS.has(name)) {
        const signals = entries.filter((e) => e.conceptName === name);
        const linked = entries.filter((e) => PORTFOLIO_CONCEPTS.has(e.conceptName) && e.sourceFeeder === name);
        const closed = linked.filter((e) => e.status === 'closed');
        const wins = closed.filter((e) => e.pnlCents > 0).length;
        const losses = closed.filter((e) => e.pnlCents < 0).length;
        out.push({
          name,
          total: linked.length,
          open: linked.filter((e) => openLike(e.status)).length,
          closed: closed.length,
          wins, losses,
          winRate: closed.length ? wins / closed.length : 0,
          pnlCents: closed.reduce((sum, e) => sum + e.pnlCents, 0),
          avgEntryCents: signals.length ? Math.round(signals.reduce((sum, e) => {
            const signal = e.conceptName === 'Golden Dragon' ? e.entryConfig?.goldenDragonSource?.signalPriceCents : e.conceptName === 'Dragon' ? e.entryConfig?.dragonSource?.signalPriceCents : null;
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
        name,
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

  async manualCashout({ entryIds = null, allProfitable = false } = {}, reason = 'manual_cashout') {
    const open = (await this.db.openEntries(this.settings.systemName))
      .filter((e) => PORTFOLIO_CONCEPTS.has(e.conceptName) && e.status === 'open' && (!entryIds || entryIds.includes(e.id)));
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
    return result;
  }

  athenaBrainDocument() {
    const brain = this.athena?.exportBrain?.() || null;
    if (!brain) throw new Error('Athena B1 is not ready');
    return { format:'SAGITTARIUS-ATHENA-BRAIN', formatVersion:1, exportedAt:new Date().toISOString(), brain };
  }

  async assertAthenaMutationSafe(action = 'change') {
    if (this.settings.mode !== 'SIMULATION' || this.settings.liveArmed === true) throw new Error(`Athena ${action} is allowed only in SIMULATION with LIVE disarmed`);
    if (this.settings.engineActive !== false) throw new Error(`Stop the engine before Athena ${action}`);
    const active = (await this.db.openEntries(this.settings.systemName)).filter((e) => PORTFOLIO_CONCEPTS.has(e.conceptName) && openLike(e.status));
    if (active.length) throw new Error(`Close all active real Hunters before Athena ${action}`);
  }

  async installAthenaBrain(payload) {
    await this.assertAthenaMutationSafe('import');
    if (!this.athena?.installBrain) throw new Error('Athena runtime is unavailable');
    return { ok:true, athena:await this.athena.installBrain(payload) };
  }

  async rebuildAthenaBrain() {
    await this.assertAthenaMutationSafe('rebuild');
    if (!this.athena?.rebuildFromDatabase) throw new Error('Athena rebuild is unavailable');
    return { ok:true, athena:await this.athena.rebuildFromDatabase() };
  }

  async diagnostics() {
    const base=await this.state();
    let feederSignalIntelligence=null;
    try { feederSignalIntelligence=await this.feederSignalIntel?.diagnostics?.({recordLimit:400}); }
    catch(error){
      feederSignalIntelligence={version:FEEDER_SIGNAL_INTELLIGENCE.version,role:FEEDER_SIGNAL_INTELLIGENCE.role,healthy:false,error:String(error?.message||error),records:[],summary:{signals:0,tracking:0,complete:0}};
      await this.db.audit('warning','feeder_signal_intel_diagnostics_error',{message:String(error?.message||error)}).catch(()=>{});
    }
    const boundedBase={...base,closedHunters:Array.isArray(base.closedHunters)?base.closedHunters.slice(0,250):[]};
    return {...boundedBase,feederSignalIntelligence,diagnosticExport:{version:'DX1',hardMaximumBytes:5_000_000,targetMaximumBytes:4_750_000,serialization:'compact_json',priority:'safety_runtime_performance_open_positions_stop_guard_then_recent_research',closedHuntersIncluded:boundedBase.closedHunters?.length||0,closedHuntersAvailable:base.closedHunters?.length||0,fsiRecordsIncluded:feederSignalIntelligence?.recordsIncluded||0,fsiRecordsAvailable:feederSignalIntelligence?.recordsAvailable||0}};
  }

  async tradingLogText() {
    const p = await this.performance();
    const lines = [
      '=== SAGITTARIUS TRADING LOGS ===',
      `Generated: ${new Date().toISOString()}`,
      `Total Hunter trades: ${p.hunters.length} | Open: ${p.open.length} | Closed: ${p.closed.length}`,
      `Wins: ${p.wins} | Losses: ${p.losses} | Scratches: ${p.scratches} | Realized P&L: $${(p.hunterRealizedCents / 100).toFixed(2)}`,
      '',
    ];
    for (const raw of p.active) {
      const e = this.decorateEntry(raw);
      const shownPnl = PORTFOLIO_CONCEPTS.has(e.conceptName) && openLike(e.status) ? e.positionPnlCents : e.pnlCents;
      lines.push(
        `--- ${e.ticker} ---`,
        `Concept: ${e.conceptName}${e.sourceFeeder ? ` <- ${e.sourceFeeder}` : ''}`,
        `Mode: ${e.mode} | Status: ${e.status} | Data: ${e.dataState}${e.quoteAgeMs == null ? '' : ` (${Math.round(e.quoteAgeMs / 1000)}s)`}`,
        FEEDER_CONCEPTS.has(e.conceptName) && e.signalPriceCents != null
          ? `Signal: ${(e.signalPriceCents / 100).toFixed(2)} | Ref origin: ${(e.referenceOriginCents / 100).toFixed(2)} (${e.referenceOrigin || 'reference'}) | Current: ${(e.currentPriceCents / 100).toFixed(2)} | Peak: ${(e.peakPriceCents / 100).toFixed(2)}`
          : `Entry: ${(e.entryPriceCents / 100).toFixed(2)} | Current: ${(e.currentPriceCents / 100).toFixed(2)} | Peak: ${(e.peakPriceCents / 100).toFixed(2)} | Stop: ${(e.stopPriceCents / 100).toFixed(2)}`,
        `Count: ${e.count} | Remaining: ${e.remainingCount} | P&L: $${(Number(shownPnl || 0) / 100).toFixed(2)}`,
        `Research: lowest ${e.lowestPriceAfterEntryCents == null ? '-' : `${e.lowestPriceAfterEntryCents}c`} | MAE ${Number(e.maeCents || 0)}c | MAE time ${e.maeAfterEntryMs == null ? '-' : `${Math.round(e.maeAfterEntryMs / 1000)}s`} | recovery->entry ${e.recoveryToEntryMs == null ? '-' : `${Math.round(e.recoveryToEntryMs / 1000)}s`} | recovery->green ${e.recoveryToGreenMs == null ? '-' : `${Math.round(e.recoveryToGreenMs / 1000)}s`}`,
        `Reason: ${e.closeReason || ''}`,
        '',
      );
    }
    return lines.join('\n');
  }

  async shutdown() {
    this.running = false;
    for (const timer of this.quoteProtectionTimers.values()) clearTimeout(timer);
    this.quoteProtectionTimers.clear();
    if (this.goldenEyeTimer) clearTimeout(this.goldenEyeTimer);
    this.goldenEyeTimer = null;
    this.goldenEyeRerunRequested = false;
    for (const timer of this.recoveryEvaluationTimers.values()) clearTimeout(timer);
    this.recoveryEvaluationTimers.clear();
    for (const timer of this.feederHunterEvaluationTimers.values()) clearTimeout(timer);
    this.feederHunterEvaluationTimers.clear();
    for (const timer of this.crashRecoveryEvaluationTimers.values()) clearTimeout(timer);
    this.crashRecoveryEvaluationTimers.clear();
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
    await this.feederSignalIntel?.flush?.(2000).catch(()=>false);
    await this.db.close();
  }
}
