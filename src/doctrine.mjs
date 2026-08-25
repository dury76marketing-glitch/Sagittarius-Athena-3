// Trading doctrine copied from the uploaded working system. Do not change
// thresholds here unless the user explicitly changes the original doctrine.

export const PORTFOLIO_CONCEPTS = new Set(['Momentum Hunter', 'Recovery Hunter', 'Wave Surfer', 'Crash Recovery Hunter', 'Dragon Recovery Hunter', 'Golden Dragon Hunter']);
export const FEEDER_CONCEPTS = new Set(['Pegasus', 'Sagittarius', 'Dragon', 'Golden Dragon']);
export const ALL_CONCEPTS = new Set([...PORTFOLIO_CONCEPTS, ...FEEDER_CONCEPTS]);
export const WATCHDOG_MODEL = 'hold-to-settlement';

export const FEEDERS = Object.freeze([
  { name: 'Pegasus', minTradesInPlay: 10, minPriceKey: 'pegasusMinPriceCents', maxPriceKey: 'pegasusMaxPriceCents', dropKey: 'pegasusDropCents' },
  { name: 'Sagittarius', minTradesInPlay: 10, minPriceKey: 'sagittariusMinPriceCents', maxPriceKey: 'sagittariusMaxPriceCents', dropKey: 'sagittariusDropCents' },
]);

export const MOMENTUM = Object.freeze({
  minRiseCents: 2,
  minPullbackCents: 1,
  maxPullbackCents: 12,
  minEntryCents: 76,
  maxEntryCents: 94,
  maxSpreadCents: 3,
  minTimeLeftMs: 3 * 60 * 1000,
});
export const WAVE = Object.freeze({ maxSpreadCents: 3 });
export const RECOVERY = Object.freeze({ minReboundCents: 5, minEntryCents: 76, maxEntryCents: 94 });
export const GOLDEN_DRAGON = Object.freeze({
  version:'GOLDEN-DRAGON-V1', minCrashCents:15, minReboundCents:15, minReclaimRate:0.55,
  stableObservations:5, upwardTicks:3, minRecoveryAgeMs:30_000, maxRecoveryAgeMs:240_000, minTrustScore:72,
  minHistoricalObservations:8, minHistoricalSurvivalRate:0.62,
});

// R31/GFB1 Golden Feed Bus. A Golden Dragon row is a durable reference-only
// approval record, not a continuously re-qualified entry signal. The Golden
// creation doctrine certifies the exact crash episode once; GFB1 then owns the
// downstream hand-off lifecycle. It may become Hunter-active only after the
// shared minimum game-time clock is confirmed, and it is invalidated by an
// exact-episode supersession, a new low through the approved trough, feeder
// disablement, or market finalization. Consumer Hunters retain their own entry
// doctrine and the central createHunter GCA/execution safeguards.
export const GOLDEN_FEED_BUS = Object.freeze({
  version:'GFB1',
  consumers:Object.freeze([
    'Golden Dragon Hunter',
    'Momentum Hunter',
    'Wave Surfer',
    'Crash Recovery Hunter',
    'Dragon Recovery Hunter',
  ]),
  pendingClockState:'PENDING_CLOCK',
  activeState:'ACTIVE',
  supersededState:'SUPERSEDED',
  invalidState:'INVALID',
  disabledState:'DISABLED',
  finalState:'FINAL',
});

const finiteNumber = (v, fallback=0) => Number.isFinite(Number(v)) ? Number(v) : fallback;

// R27 GPI2/GPI3: one structural definition is shared by the learning-side
// Golden candidate tracker and the strategy-side qualification boundary. This
// prevents the two stages from silently drifting to different crash/recovery
// thresholds again.
export function goldenDragonStructureSettings(settings = {}) {
  return {
    minCrashCents:Math.max(1,finiteNumber(settings.goldenDragonMinCrashCents,GOLDEN_DRAGON.minCrashCents)),
    minReboundCents:Math.max(0,finiteNumber(settings.goldenDragonMinReboundCents,GOLDEN_DRAGON.minReboundCents)),
    minReclaimRate:Math.max(0,Math.min(1,finiteNumber(settings.goldenDragonMinReclaimRate,GOLDEN_DRAGON.minReclaimRate))),
    stableObservations:Math.max(1,Math.floor(finiteNumber(settings.goldenDragonStableObservations,GOLDEN_DRAGON.stableObservations))),
    upwardTicks:Math.max(1,Math.floor(finiteNumber(settings.goldenDragonUpwardTicks,GOLDEN_DRAGON.upwardTicks))),
  };
}

export function goldenDragonStructureQualifiedAtQuote(signal, q, settings = {}) {
  if (!signal?.episodeId || !q) return {ok:false,reason:'missing_signal_or_quote'};
  const cfg=goldenDragonStructureSettings(settings);
  const bid=finiteNumber(q.yesBid,0), ask=finiteNumber(q.yesAsk,0), depth=Math.max(1,finiteNumber(signal.crashDepthCents,0)), trough=finiteNumber(signal.troughCents,0);
  if (!(bid>0)||!(ask>0)||bid>ask) return {ok:false,reason:'invalid_quote'};
  if (depth + 1e-9 < cfg.minCrashCents) return {ok:false,reason:'crash_depth'};
  if (!(trough>0)||bid<trough) return {ok:false,reason:'new_low'};
  const rebound=Math.max(0,bid-trough), reclaimRate=rebound/depth;
  if (rebound + 1e-9 < cfg.minReboundCents || reclaimRate + 1e-12 < cfg.minReclaimRate) return {ok:false,reason:'rebound_structure',bid,ask,troughCents:trough,crashDepthCents:depth,reboundCents:rebound,reclaimRate};
  if (finiteNumber(signal.stableObservations,0)<cfg.stableObservations) return {ok:false,reason:'stable_observations',bid,ask,troughCents:trough,crashDepthCents:depth,reboundCents:rebound,reclaimRate};
  if (finiteNumber(signal.upwardTicks,0)<cfg.upwardTicks) return {ok:false,reason:'upward_ticks',bid,ask,troughCents:trough,crashDepthCents:depth,reboundCents:rebound,reclaimRate};
  return {ok:true,reason:'qualified',bid,ask,troughCents:trough,crashDepthCents:depth,reboundCents:rebound,reclaimRate,config:cfg};
}
export const DRAGON_RECOVERY = Object.freeze({ minReboundCents:15, minReclaimRate:0.55, stableObservations:5, upwardTicks:3, minEntryCents:27, maxEntryCents:60, maxSpreadCents:3 });
export const GOLDEN_DRAGON_HUNTER = Object.freeze({ version:'GDH1', stakeCents:20000, minEntryCents:55, maxEntryCents:89, stopLossCents:35, maxSpreadCents:3, minTrustScore:80, maxEpisode:2, minReboundCents:15, minReclaimRate:0.55, stableObservations:5, upwardTicks:3 });
export const MAX_HISTORY = 20;
export const POST_EXIT_TRACKING_MS = 4 * 60 * 60 * 1000;
export const RECOVERY_MARKET_DROP_CENTS = 5;

// R15 U-SG1 Ultimate Stop Guard. The model-owned frozen stop remains the
// immutable Danger Line. U-SG1 adds bounded recovery intelligence below that
// line; it never rewrites the configured stop distance.
// R39 SLW1 Stop Loss Watchdog. This is not a second loss authority. It is an
// early economic-loss wake-up/classification layer inside the U-SG1 domain.
// The frozen model stop remains immutable; SLW1 may only ask U-SG1 to commit
// the existing full-position hard-stop exit path when both historical recovery
// evidence and fresh live deterioration indicate that a deeply losing market is
// likely dead rather than temporarily wounded.
export const STOP_LOSS_WATCHDOG = Object.freeze({
  version: 'SLW1',
  policyRevision: 'SLW1-R3-HARD-ECONOMIC-CEILING',
  // The original R39 values were calibrated on a $200 Hunter. R41-HF1 keeps
  // those exact economics at $200 but expresses them as fractions of the
  // Hunter's immutable original entry notional so $20/$50/$500 trades receive
  // equivalent early-loss intelligence instead of fixed-dollar distortion.
  stakeNormalized: true,
  stakeBasis: 'original_entry_notional',
  referenceStakeCents: 20000,
  wakeLossRatio: 0.30,
  resetLossRatio: 0.20,
  severeLossRatio: 0.45,
  catastrophicLossRatio: 0.90,
  // R42: recovery intelligence is subordinate to a non-negotiable capital
  // budget. The budget scales with immutable original filled notional up to the
  // approved $75 absolute ceiling. It is not a new exit authority: U-SG1 owns
  // the full-position flatten obligation when this covenant is reached.
  hardEconomicLossCeilingEnabled: true,
  hardEconomicLossCeilingRatio: 0.375,
  hardEconomicLossCeilingAbsoluteCents: 7500,
  // Reference-only compatibility values for diagnostics/tests. Runtime loss
  // decisions MUST use stopLossWatchdogThresholdsForStakeCents().
  wakeLossCents: 6000,
  resetLossCents: 4000,
  severeLossCents: 9000,
  maximumBookAgeMs: 1500,
  maximumFutureBookSkewMs: 2000,
  minimumLearningObservations: 5,
  weakRecoveryRate: 0.45,
  strongRecoveryRate: 0.70,
  minimumFreshObservations: 3,
  minimumReboundCents: 2,
  minimumStableObservations: 2,
  minimumUpwardTicks: 1,
  minimumLowerLowsForDead: 2,
  minimumConsecutiveDownForDead: 2,
  crashOverrideLowerLows: 2,
  // R41: the four-system replay showed a real Hiroshima recovery that needed
  // about 23 minutes from its deep trough to regain executable economics,
  // while the pathological Hanshin/YAK/Montagud wounds remained active for
  // roughly 49-61/31 minutes. Therefore fresh deterioration gets a bounded
  // cold-start recovery window instead of becoming a disguised tight stop.
  // Mature weak SGRL1 evidence may shorten that window; mature strong evidence
  // may extend it slightly, but neither can override live structure forever.
  weakHistoryGraceMs: 5 * 60 * 1000,
  minimumLiveOverrideAgeMs: 25 * 60 * 1000,
  strongHistorySevereGraceMs: 30 * 60 * 1000,
  severeStallMs: 30 * 60 * 1000,
  catastrophicLossCents: 18000,
  catastrophicStallMs: 25 * 60 * 1000,
});

export function stopLossWatchdogThresholdsForStakeCents(stakeCents = STOP_LOSS_WATCHDOG.referenceStakeCents) {
  const raw = Number(stakeCents);
  const basisStakeCents = Number.isFinite(raw) && raw > 0 ? raw : STOP_LOSS_WATCHDOG.referenceStakeCents;
  return Object.freeze({
    policyRevision: STOP_LOSS_WATCHDOG.policyRevision,
    stakeBasis: STOP_LOSS_WATCHDOG.stakeBasis,
    basisStakeCents,
    wakeLossCents: basisStakeCents * STOP_LOSS_WATCHDOG.wakeLossRatio,
    resetLossCents: basisStakeCents * STOP_LOSS_WATCHDOG.resetLossRatio,
    severeLossCents: basisStakeCents * STOP_LOSS_WATCHDOG.severeLossRatio,
    catastrophicLossCents: basisStakeCents * STOP_LOSS_WATCHDOG.catastrophicLossRatio,
    hardEconomicLossCeilingCents: Math.min(
      basisStakeCents * STOP_LOSS_WATCHDOG.hardEconomicLossCeilingRatio,
      STOP_LOSS_WATCHDOG.hardEconomicLossCeilingAbsoluteCents,
    ),
  });
}

// R42 HELC1 Hard Economic Loss Ceiling. This is a capital-preservation
// covenant inside U-SG1, not a competing stop engine. Recovery/history/grace
// logic may operate only while the aggregate fee-adjusted liquidation economics
// remain inside the budget. Once triggered, the existing U-SG1 hard-stop exit
// obligation is durable until the owned quantity is flat or the market is final.
export const HARD_ECONOMIC_LOSS_CEILING = Object.freeze({
  version: 'HELC1',
  policyRevision: 'HELC1-R1-STAKE-RELATIVE-75-ABSOLUTE-CAP',
  role: 'non_negotiable_capital_loss_budget_inside_usg1',
  stakeBasis: 'original_entry_notional',
  lossRatio: 0.375,
  absoluteMaximumLossCents: 7500,
  fullPositionEconomicBasis: 'fee_adjusted_aggregate_liquidation_net',
  recoveryVetoAllowed: false,
  durableFlattenRequired: true,
  lossAuthority: 'U-SG1',
});

export function hardEconomicLossCeilingForStakeCents(stakeCents = STOP_LOSS_WATCHDOG.referenceStakeCents) {
  const raw = Number(stakeCents);
  const basisStakeCents = Number.isFinite(raw) && raw > 0 ? raw : STOP_LOSS_WATCHDOG.referenceStakeCents;
  return Object.freeze({
    version: HARD_ECONOMIC_LOSS_CEILING.version,
    policyRevision: HARD_ECONOMIC_LOSS_CEILING.policyRevision,
    stakeBasis: HARD_ECONOMIC_LOSS_CEILING.stakeBasis,
    basisStakeCents,
    lossRatio: HARD_ECONOMIC_LOSS_CEILING.lossRatio,
    absoluteMaximumLossCents: HARD_ECONOMIC_LOSS_CEILING.absoluteMaximumLossCents,
    maximumLossCents: Math.min(
      basisStakeCents * HARD_ECONOMIC_LOSS_CEILING.lossRatio,
      HARD_ECONOMIC_LOSS_CEILING.absoluteMaximumLossCents,
    ),
  });
}

// R41 SGRL1 Stop Guard Recovery Learning Integrity. Decision evidence is
// Hunter-only and starts at the exact SLW1/U-SG1 protection trigger. A recovery
// is positive only when the complete original quantity is executable after
// fees at >= +1c net per original contract for at least two fresh observations
// spanning one second, or when final settlement itself proves positive net.
// Legacy midpoint-touch recovery patterns and MarketObserver rows remain useful
// for their older research consumers but have zero SGRL1 decision authority.
export const STOP_GUARD_RECOVERY_LEARNING = Object.freeze({
  version: 'SGRL1',
  role: 'hunter_only_full_executable_fee_adjusted_durable_recovery',
  decisionEvidenceMode: 'SIMULATION',
  minimumNetPerOriginalContractCents: 1,
  minimumPositiveConfirmations: 2,
  minimumPositiveDurationMs: 1000,
  maximumBookAgeMs: 1500,
  maximumFutureBookSkewMs: 2000,
  minimumProfileObservations: 5,
  maximumEpisodes: 5000,
  legacyRecoveryPatternDecisionAuthority: false,
  marketObserverDecisionAuthority: false,
});

export const ULTIMATE_STOP_GUARD = Object.freeze({
  version: 'U-SG1',
  recoveryZoneCents: 5,
  stressedZoneCents: 10,
  emergencyExtensionCents: 15,
  reclaimBufferCents: 2,
  reclaimConfirmations: 2,
  minimumLearningObservations: 5,
  minimumCriticalRecoveryRate: 0.70,
  betaPriorAlpha: 1,
  betaPriorBeta: 1,
  recoveryWindowMultiplier: 3,
  minimumRecoveryWindowMs: 10 * 60 * 1000,
  maximumRecoveryWindowMs: 60 * 60 * 1000,
  defaultRecoveryWindowMs: 30 * 60 * 1000,
  warningPenetrationCents: 3,
  warningWindowFactor: 0.50,
  stressedWindowFactor: 0.35,
  criticalWindowFactor: 0.25,
  criticalStructureGraceMs: 2 * 60 * 1000,
  reclaimExtensionMs: 3 * 60 * 1000,
  minimumReboundCents: 2,
  minimumStableObservations: 2,
  minimumUpwardTicks: 1,
});

// R19 U-PG3 Maximum-Profit Headroom Guard. The R18 floodtest proved that
// economic break-even must be an accounting boundary, not an automatic sell
// instruction: U-PG2 compressed the intended 7c + 4c breathing room into a
// two-cent post-arm retracement on high-price Hunters. U-PG3 restores strict
// module jurisdiction. It may liquidate only while the whole remaining position
// can still realize the configured positive net profit. Before arming, the
// executable peak must fund the entire 7c giveback plus 4c recovery buffer above
// that positive-profit floor. If the market later gaps below the profit floor,
// U-PG3 suspends instead of converting itself into a stop-loss; U-SG1 retains
// exclusive authority over the loss domain. Economic break-even remains visible
// telemetry only and is never itself a liquidation trigger.
export const ULTIMATE_PROFIT_GUARD = Object.freeze({
  version: 'U-PG3',
  activationMoveCents: 6,
  minimumNetProfitPerContractCents: 1,
  peakGivebackCents: 7,
  recoveryBufferCents: 4,
  headroomQualifiedArming: true,
  economicBreakEvenImmediateExit: false,
  lossDomainDelegatedToStopGuard: true,
  reclaimBufferCents: 2,
  reclaimConfirmations: 2,
  structuralFailureConfirmations: 2,
  immediateGapThroughCents: 2,
});


// R30 APG1 Apex Profit Guard. This is a profit-only executable high-water
// protector placed ahead of U-PG3. It arms only after the full remaining
// position can fund both the positive-net covenant and a 2c peak trail. A
// normal exit requires two fresh order-book observations through that trail;
// a 4c total peak giveback (2c through the trail) is treated as a severe gap
// and can commit immediately while the full position is still +net executable.
// APG1 never gains authority below the positive-profit floor: U-SG1 remains
// the exclusive loss-domain guard.
export const APEX_PROFIT_GUARD = Object.freeze({
  version: 'APG1',
  activationMoveCents: 6,
  minimumNetProfitPerContractCents: 1,
  peakGivebackCents: 2,
  failureConfirmations: 2,
  immediateGapThroughCents: 2,
  fullExecutableDepthRequired: true,
  positiveNetExecutionOnly: true,
  lossDomainDelegatedToStopGuard: true,
});


// R33 PRI1-R2 Protected Runner Intelligence. R32 proved that the first
// fee-adjusted profitable tick cannot simultaneously be the capital milestone
// and an active trailing exit: with a 1c minimum execution buffer that made
// the initial protected floor exactly break-even and converted ordinary 1c
// noise into a full-position scratch. PRI1-R2 restores the original winner
// concept as a true protected runner:
//   1) +1c net/original contract is CAPITAL_SAFE telemetry only;
//   2) sell authority is not created until +2c net/original contract;
//   3) the cold-start runner uses a 3c executable-net giveback, so early
//      winners have real breathing room instead of a one-tick trail;
//   4) only very mature +12c net/original peaks tighten to a 2c giveback;
//   5) PLI1 may promote only a bounded 2-4c cohort giveback, frozen per trade.
// The floor is always aggregate full-position executable net P/L after fees.
// If executable depth gaps below zero after a floor is armed, PRI1-R2 never
// chases into the loss domain; U-SG1 remains the sole loss authority and the
// missed profit obligation resumes on the first full-depth non-negative book.
export const PROTECTED_RUNNER_INTELLIGENCE = Object.freeze({
  version: 'PRI1',
  policyRevision: 'PRI1-R2',
  capitalLatchNetPerOriginalContractCents: 1,
  profitFloorArmNetPerOriginalContractCents: 2,
  coldStartRunnerGivebackNetPerContractCents: 3,
  minimumRunnerGivebackNetPerContractCents: 2,
  maximumRunnerGivebackNetPerContractCents: 4,
  lateProfitTightenAtNetPerOriginalContractCents: 12,
  lateProfitGivebackNetPerContractCents: 2,
  fullExecutableDepthRequired: true,
  immediateProtectedFloorExit: true,
  lossDomainDelegatedToStopGuard: true,

  // R32 compatibility only. Existing R32 positions keep their creation-time
  // doctrine and therefore still need these values while they close naturally.
  legacyColdStartRetentionRatio: 0.92,
  coldStartRetentionRatio: 0.92,
  minimumRetentionRatio: 0.85,
  maximumRetentionRatio: 0.96,
  minimumExecutionBufferCents: 1,
});

// PLI1 Profit Learning Intelligence. Learning is immediate, but execution
// policy promotion is deliberately conservative: profiles are updated after
// every completed trade. PRI1-R2 may use a cohort-specific 2-4c executable-net
// runner giveback only after enough completed trades and one-tick pullback
// observations exist. The legacy retention ratio remains stored for R32
// compatibility/telemetry but does not control new R33 execution. PMH1 and
// DBR1 remain shadow policies; they never place orders.
export const PROFIT_LEARNING_INTELLIGENCE = Object.freeze({
  version: 'PLI1',
  minimumProfileObservations: 12,
  minimumPullbackObservations: 6,
  persistenceIntervalMs: 5_000,
  maximumTimelinePoints: 240,
  coldStartRetentionRatio: PROTECTED_RUNNER_INTELLIGENCE.coldStartRetentionRatio,
  coldStartRunnerGivebackNetPerContractCents: PROTECTED_RUNNER_INTELLIGENCE.coldStartRunnerGivebackNetPerContractCents,
  runnerGivebackPromotionEnabled: true,
  shadowPolicies: Object.freeze({
    PMH1: Object.freeze({ stages: Object.freeze([[9, 0.03], [12, 0.03], [16, 0.03]]) }),
    DBR1: Object.freeze({ stages: Object.freeze([[12, 0.10]]) }),
  }),
});


// R36 ATHENA-X1 Adaptive Peak & Continuation Exit Intelligence. X1 is a
// full-position profit authority only. It never creates exposure, never splits
// a position, and never enters the loss domain. U-SG1 remains the exclusive
// loss authority. X1 evaluates only fresh full-position executable books and
// decision-time/past evidence. A normal small pullback can never be sufficient
// by itself: an exit requires confirmed structural deterioration after a
// meaningful profitable peak, weak recovery evidence, and non-negative
// executable economics. Existing PRI1 positions retain their creation-time
// authority until they close naturally.
export const ATHENA_EXIT_INTELLIGENCE = Object.freeze({
  version:'ATHENA-X1',
  policyRevision:'ATHENA-X1-R1',
  role:'adaptive_full_position_peak_continuation_profit_authority',
  fullPositionOnly:true,
  positionSplitting:false,
  noLookahead:true,
  fullExecutableDepthRequired:true,
  maximumExecutableBookAgeMs:5_000,
  maximumFutureBookSkewMs:2_000,
  lossDomainDelegatedToStopGuard:true,
  minimumPeakNetPerOriginalContractCents:2,
  capitalDefensePeakNetPerOriginalContractCents:3,
  capitalDefenseCurrentNetPerOriginalContractCents:1.5,
  capitalDefenseMinimumPeakPriceCents:85,
  capitalDefenseMinimumCurrentPriceCents:85,
  capitalDefenseMinimumRunupCents:6,
  capitalDefenseMinimumPullbackCents:2,
  capitalDefenseMinimumErasedRunupRatio:0.30,
  minimumStructuralPullbackCents:4,
  maximumNoisePullbackCents:3,
  maximumAdaptivePullbackCents:9,
  minimumFreshPostPeakObservations:2,
  recentObservationWindow:6,
  maximumStateObservations:24,
  minimumExitFailureScore:72,
  maximumExitRecoveryScore:45,
  maximumExitContinuationScore:48,
  capitalDefenseFailureScore:58,
  severeCrashDepthCents:20,
  severeCrashLowerLows:3,
  historicalMinimumObservations:12,
  historicalMinimumPullbacks:6,
  historicalDrawdownMinimumObservations:20,
  historicalDrawdownSupportProbability:0.55,
  historicalDrawdownSupportWilsonLow:0.50,
});

// R37 GOLDEN-EYE global profit-opportunity intelligence. Golden Eye does not
// predict individual markets and does not wait for a post-peak reversal. It
// continuously catalogs natural portfolio-level profit surges, learns the
// historical probability that a currently observed aggregate profit level
// extends materially higher, and can invoke the existing all-profitable manual
// cash-out path on the same fresh quote event that creates a learned cash-now
// opportunity. Learning is always on. Autonomous LIVE execution is fail-closed
// behind its own explicit setting in addition to the normal LIVE arming/health
// covenant. New R37 Hunters delegate only the profit domain to Golden Eye;
// U-SG1 remains the exclusive loss authority and settlement still outranks all
// profit logic.
export const GOLDEN_EYE = Object.freeze({
  version:'GOLDEN-EYE-V1',
  policyRevision:'GE1-R2',
  role:'global_portfolio_profit_spike_catalog_and_cash_now_authority',
  learningAlwaysOn:true,
  allProfitableCashout:true,
  perTradeSelection:false,
  noLookahead:true,
  maximumSignalQuoteAgeMs:1_000,
  maximumSignalBookAgeMs:1_000,
  maximumExecutionBookAgeMs:1_000,
  minimumSampleIntervalMs:100,
  maximumContinuousSampleGapMs:5_000,
  maximumClockRegressionMs:250,
  maximumFutureSampleSkewMs:2_000,
  persistenceIntervalMs:2_000,
  maximumCatalogEpisodes:256,
  maximumManualCatalogEpisodes:256,
  manualBackfillGroupingMs:2_000,
  minimumManualTrainingProfitCents:1,
  minimumEpisodeSamples:1,
  minimumCatalogPeakProfitCents:100,
  episodeDrawdownMinimumCents:300,
  episodeDrawdownRatio:0.30,
  minimumNaturalEpisodes:8,
  minimumCollectiveEpisodes:8,
  minimumComparableEpisodes:3,
  minimumSignalProfitCents:500,
  minimumExtensionCents:300,
  extensionRatio:0.15,
  maximumExtensionProbability:0.30,
  novelHighMultiplier:1.05,
  minimumJumpCents:100,
  minimumSignalSpacingMs:500,
  maximumParallelCashouts:8,
});


const DERIVATIVE_SERIES_KEYWORDS = [
  'SPREAD','TOTAL','HRDERBY','3PT','DERBY','GAMETO','ANYSET',
  '1H','2H','1Q','2Q','3Q','4Q','1P','2P','3P','HTOTAL','QTOTAL',
];
const DERIVATIVE_TITLE_KEYWORDS = [
  'wins by over','wins by more than','win by','home run','homerun',
  'first half','1st half','second half','2nd half','first quarter','1st quarter',
  'second quarter','2nd quarter','third quarter','3rd quarter','fourth quarter','4th quarter',
  'first period','1st period','second period','2nd period','third period','3rd period',
  'first inning','1st inning','sixth inning','7th inning','inning','overtime','extra innings',
  'total runs','total points','total goals','total maps','over ','under ','most ','first to ','last to ',
  'exact score','exact result','correct score','number of ','how many ','win map','win set','win round',
  'player to score','first scorer','last scorer','anytime scorer','first basket','first goal',
];

export function isMatchDecisionMarket(m) {
  const title = String(m?.title || '').toLowerCase();
  const series = String(m?.seriesTicker || m?.series_ticker || m?.ticker || '').toUpperCase();
  if (String(m?.ticker || '').toUpperCase().startsWith('KXMV')) return false;
  if (DERIVATIVE_SERIES_KEYWORDS.some((k) => series.includes(k))) return false;
  if (DERIVATIVE_TITLE_KEYWORDS.some((k) => title.includes(k))) return false;
  if (title.includes('win the') || title.includes('win this')) return true;
  if (series.includes('MATCH') || series.includes('GAME')) return true;
  return false;
}

export function stableDropEntry(history, thresholdCents, min=80, max=94) {
  if (!Array.isArray(history) || history.length < 4) return null;
  const asks = history.map((p) => typeof p === 'number' ? p : Number(p.ask)).filter(Number.isFinite);
  if (asks.length < 4) return null;
  const peak = Math.max(...asks);
  const current = asks.at(-1);
  if (peak - current < thresholdCents) return null;
  if (asks.indexOf(peak) === asks.length - 1) return null;
  const recent = asks.slice(-3);
  if (Math.max(...recent) - Math.min(...recent) > 1) return null;
  if (current < min || current > max) return null;
  return current;
}

export function holdToSettlementTrail(entryPrice, peakBid) {
  const totalMove = 100 - entryPrice;
  if (totalMove <= 0) return 2;
  const pct = (peakBid - entryPrice) / totalMove;
  if (pct >= 0.80) return 2;
  if (pct >= 0.60) return 4;
  if (pct >= 0.30) return 6;
  return 5;
}

const TYPICAL_DURATION_MS = Object.freeze({
  ATP:120*60e3, WTA:100*60e3, NBA:150*60e3, WNBA:130*60e3, NHL:150*60e3,
  NFL:200*60e3, NCAAF:200*60e3, NCAAB:130*60e3, MLB:200*60e3, SOCCER:120*60e3, UFC:30*60e3,
});
export function detectSportKey(seriesTicker='') {
  const s = String(seriesTicker).toUpperCase();
  for (const k of Object.keys(TYPICAL_DURATION_MS)) if (s.includes(k)) return k;
  return null;
}
export function estimateTimeLeftMs(market, now=Date.now(), learnedDurationMs=null) {
  let closeBased = market.closeTimeMs > 0 ? Math.max(0, market.closeTimeMs - now) : Infinity;
  let sportBased = Infinity;
  if (market.occurrenceTimeMs > 0) {
    const fixed = TYPICAL_DURATION_MS[detectSportKey(market.seriesTicker)] || null;
    const duration = learnedDurationMs || fixed;
    if (duration) sportBased = Math.max(0, market.occurrenceTimeMs + duration - now);
  }
  const result = Math.min(closeBased, sportBased);
  return result === Infinity ? 0 : result;
}

export function extractEventTicker(ticker='') {
  const t = String(ticker);
  const hit = t.match(/^(.+)-T[\d.]+$/);
  if (hit) return hit[1];
  const parts = t.split('-');
  if (parts.length > 2) return parts.slice(0, -1).join('-');
  return t;
}

// Discovery/feeders only. This intentionally broad classifier may call a
// heavily traded pre-match market "live" and therefore MUST NOT authorize an
// exposure-creating Hunter clock. R17/GCA1 owns that separate decision.
export function computeLiveStatus({tradeCount=0,yesBid=0,yesAsk=0,prevYesBid=0,prevYesAsk=0,occurrenceTimeMs=0,closeTimeMs=0,volume24h=0,liveDataExists=false,now=Date.now()}) {
  if (liveDataExists) return 'live';
  if (tradeCount >= 3) return 'live';
  const moved=(prevYesBid>0&&Math.abs(yesBid-prevYesBid)>=2)||(prevYesAsk>0&&Math.abs(yesAsk-prevYesAsk)>=2);
  const closesSoon=closeTimeMs>0&&closeTimeMs<now+3*24*3600000;
  if (moved&&closesSoon) return 'live';
  if (volume24h>=5000&&occurrenceTimeMs>0&&occurrenceTimeMs<now) return 'live';
  if (tradeCount===0&&!moved&&occurrenceTimeMs>now&&closeTimeMs>now) return 'pre-match';
  if (occurrenceTimeMs>now&&closeTimeMs>now) return 'pre-match';
  return 'unknown';
}
