// Trading doctrine copied from the uploaded working system. Do not change
// thresholds here unless the user explicitly changes the original doctrine.

// R45 Mega Wave separates active runtime concepts from historical compatibility.
// Retired concepts remain recognizable so old/open positions stay protected and
// historical analytics stay truthful, but they have zero new-entry authority.
export const ACTIVE_PORTFOLIO_CONCEPTS = new Set(['Athena Exclamation', 'Scarlet Needle', 'Sagittarius Justice Arrow', 'Momentum Hunter', 'Recovery Hunter', 'Wave Surfer', 'Crash Recovery Hunter', 'Lightning Plasma']);
export const RETIRED_PORTFOLIO_CONCEPTS = new Set(['Dragon Recovery Hunter', 'Golden Dragon Hunter']);
export const PORTFOLIO_CONCEPTS = new Set([...ACTIVE_PORTFOLIO_CONCEPTS, ...RETIRED_PORTFOLIO_CONCEPTS]);
export const ACTIVE_FEEDER_CONCEPTS = new Set(['Pegasus', 'Dragon', 'Phoenix']);
export const RETIRED_FEEDER_CONCEPTS = new Set(['Sagittarius', 'Golden Dragon']);
export const FEEDER_CONCEPTS = new Set([...ACTIVE_FEEDER_CONCEPTS, ...RETIRED_FEEDER_CONCEPTS]);
// R63 Gemini is a broker-free, portfolio-free shadow universe. Its Another
// Dimension Attack consumes ordinary Cosmos shadow positions but is neither a
// Cosmos source nor portfolio exposure. Keeping this authority class separate
// prevents Atomic Thunder/Lightning Plasma feedback and capital accounting.
export const SHADOW_ATTACK_CONCEPTS = new Set(['Another Dimension']);
export const ALL_CONCEPTS = new Set([...PORTFOLIO_CONCEPTS, ...FEEDER_CONCEPTS, ...SHADOW_ATTACK_CONCEPTS]);
export const WATCHDOG_MODEL = 'bolt-athena-x1-aurora';

export const EXECUTION_ATTACK_DISPLAY = Object.freeze({
  'Athena Exclamation': Object.freeze({ name:'Athena Exclamation', legacy:'AE2 / Every 12 Justice Arrows Gemini Diversion' }),
  'Scarlet Needle': Object.freeze({ name:'Scarlet Needle', legacy:'Needle / Scorpio Continuation Strike' }),
  'Sagittarius Justice Arrow': Object.freeze({ name:'Sagittarius Justice Arrow', legacy:'Sagittarius Aiolos / Arrow of Justice' }),
  'Wave Surfer': Object.freeze({ name:'Pegasus Ryu Sei Ken', legacy:'Wave Surfer / Wave Hunter' }),
  'Crash Recovery Hunter': Object.freeze({ name:'Starlight Extinction', legacy:'Crash Recovery Hunter' }),
  'Recovery Hunter': Object.freeze({ name:'Crystal Wall', legacy:'Recovery Hunter' }),
  'Momentum Hunter': Object.freeze({ name:'Great Horn', legacy:'Momentum Hunter' }),
  'Lightning Plasma': Object.freeze({ name:'Lightning Plasma', legacy:'LP2 / Gemini +4c Three-Slot Strike Field' }),
});


// R65/AE2 Athena Exclamation. After twelve successfully opened Sagittarius
// Justice Arrows, the next profitable Another Dimension opportunity is routed
// to Athena Exclamation first. A failed Athena Exclamation execution never
// chokes Gemini: the same still-valid opportunity falls back to Justice Arrow.
export const ATHENA_EXCLAMATION = Object.freeze({
  version:'ATHENA-EXCLAMATION-AE2',
  policyRevision:'AE2-R1-EVERY-12-JUSTICE-ARROWS-GEMINI-DIVERSION',
  role:'every_twelve_justice_arrows_next_gemini_opportunity',
  triggerEveryJusticeArrows:12,
  sourceUniverse:'Gemini',
  sourceAttack:'Another Dimension',
  fallbackAttack:'Sagittarius Justice Arrow',
  defaultStakeCents:20_000,
  defaultMinEntryCents:10,
  defaultMaxEntryCents:89,
  ordinaryCooldownExempt:true,
  normalStrategicDiscoveryBypass:true,
  fullExecutionSafetyRequired:true,
  sourceDoesNotAuthorizeEntry:true,
  strategicEntryAuthority:'ATHENA_EXCLAMATION_POST_12_JUSTICE_ARROWS',
  profitAuthority:'ATHENA-X1',
  lossAuthority:'AURORA_EXECUTION',
  noPostEntryTimeExit:true,
});


export const SCARLET_NEEDLE = Object.freeze({
  version:'SCARLET-NEEDLE-V2',
  policyRevision:'SN2-R1-POST-PROFIT-SAFE-CONTINUATION',
  role:'post_profit_same_ticker_continuation_attack',
  trigger:'POST_PROFIT_ATHENA_X1_CLOSE',
  triggerRequiresPositiveRealizedNet:true,
  sameExactTicker:true,
  sameSide:true,
  normalStrategicDiscoveryBypass:true,
  ordinaryCooldownExempt:true,
  fullExecutionSafetyRequired:true,
  defaultMaxRepeats:1,
  maximumConfigurableRepeats:100,
  sourceDoesNotAuthorizeEntry:true,
  strategicEntryAuthority:'SCARLET_NEEDLE_POST_PROFIT_CONTINUATION',
  profitAuthority:'ATHENA-X1',
  lossAuthority:'AURORA_EXECUTION',
  noPostEntryTimeExit:true,
});



// R63 Gemini / Another Dimension / Sagittarius Justice Arrow. Gemini is the
// isolated shadow universe. Another Dimension is the Attack inside Gemini and
// applies Great Horn momentum physics to active ordinary Cosmos shadows. It has
// a full virtual entry-to-exit lifecycle but zero broker authority and zero
// simulation/real portfolio-capital authority. Only a completed +1c-net-or-
// better Another Dimension close may authorize one Justice Arrow continuation.
export const GEMINI_UNIVERSE = Object.freeze({
  version:'GEMINI-V1',
  policyRevision:'GEMINI1-R1-FULL-VIRTUAL-TRADE-UNIVERSE',
  role:'isolated_shadow_trade_universe',
  attack:'Another Dimension',
  sourceConcepts:Object.freeze(['Pegasus','Dragon','Phoenix']),
  brokerOrderAuthority:false,
  portfolioCapitalAuthority:false,
  simulationPortfolioCapitalAuthority:false,
});

export const ANOTHER_DIMENSION = Object.freeze({
  version:'ANOTHER-DIMENSION-V2',
  policyRevision:'AD2-R1-GEMINI-GREAT-HORN-FULL-VIRTUAL-TRADE',
  role:'gemini_great_horn_physics_shadow_attack',
  universe:GEMINI_UNIVERSE.version,
  sourceConcepts:GEMINI_UNIVERSE.sourceConcepts,
  brokerOrderAuthority:false,
  portfolioCapitalAuthority:false,
  simulationPortfolioCapitalAuthority:false,
  entryPhysics:'GREAT_HORN_MOMENTUM',
  virtualProfitAuthority:'INFINITY_BREAK',
  virtualLossAuthority:'AURORA_EXECUTION',
  minimumNetPerOriginalContractCents:1,
  profitableCloseReason:'another_dimension_profit',
  lossCloseReason:'another_dimension_aurora',
  maximumRecentResults:100,
  sourceDoesNotAuthorizeRealEntry:true,
});

export const SAGITTARIUS_JUSTICE_ARROW = Object.freeze({
  version:'SAGITTARIUS-JUSTICE-ARROW-V1',
  policyRevision:'SJA1-R1-POST-ANOTHER-DIMENSION-VICTORY',
  role:'post_shadow_victory_same_ticker_continuation_attack',
  trigger:'POST_PROFIT_ANOTHER_DIMENSION_CLOSE',
  triggerRequiresPositiveRealizedNet:true,
  sameExactTicker:true,
  sameSide:true,
  normalStrategicDiscoveryBypass:true,
  ordinaryCooldownExempt:true,
  fullExecutionSafetyRequired:true,
  sourceDoesNotAuthorizeEntry:true,
  strategicEntryAuthority:'SAGITTARIUS_JUSTICE_ARROW_POST_SHADOW_WIN',
  profitAuthority:'ATHENA-X1',
  lossAuthority:'AURORA_EXECUTION',
  noPostEntryTimeExit:true,
});

export const GALACTIC_EXPLOSION = Object.freeze({
  version:'GALACTIC-EXPLOSION-V1',
  role:'multi_attack_exact_ticker_topology',
  disabledLockScope:'exact_ticker',
  enabledLockScope:'exact_ticker_plus_attack_identity',
  sameAttackDuplicatesAllowed:false,
});

// HF2/R55 shared Cosmo routing doctrine. Pegasus, Dragon and Phoenix are
// reference-only opportunity sources. Any present/future normal initial-entry
// Attack may consume an active Cosmo, but the Cosmo never grants entry authority: the
// Attack must independently re-prove its complete doctrine at execution.
// Crystal Wall is intentionally excluded because it is a post-stop follow-on
// recovery Attack whose source of truth is the stopped owned position.
export const COSMO_ROUTING = Object.freeze({
  version:'COSMO-ROUTING-V1',
  role:'shared_reference_opportunity_bus',
  activeCosmos:Object.freeze(['Pegasus','Dragon','Phoenix']),
  currentInitialEntryConsumers:Object.freeze(['Momentum Hunter','Wave Surfer','Crash Recovery Hunter']),
  followOnOnlyExceptions:Object.freeze(['Recovery Hunter']),
  defaultFutureInitialEntryConsumer:true,
  sourceDoesNotAuthorizeEntry:true,
  attackDoctrineRevalidationRequired:false,
  strategicEntryAuthority:'ATHENA',
  executionOnlyAfterFire:true,
});



// R55/PC1 Phoenix Cosmo. Phoenix is deliberately unlike Pegasus (drop/stability)
// and Dragon (crash/recovery): it identifies fresh, executable directional
// ignition while the YES ask is inside the operator's low-band universe. It is
// reference intelligence only and can never authorize exposure or place an
// order. The fixed structure guards are doctrine, not operator trading knobs.
export const PHOENIX_COSMO = Object.freeze({
  version:'PHOENIX-COSMO-V1',
  policyRevision:'PC1-R1-CONFIRMED-LOW-BAND-ASCENT',
  role:'low_band_directional_ignition_cosmo',
  defaultMinPriceCents:10,
  defaultMaxPriceCents:50,
  minimumRiseCents:4,
  minimumAskRiseCents:2,
  minimumUpTicks:3,
  observationWindowMs:90_000,
  minimumConfirmationDurationMs:8_000,
  requiredFreshConfirmations:2,
  minimumFreshConfirmationGapMs:250,
  signalTtlMs:60_000,
  maximumMaterializationDelayMs:2_000,
  minimumRecentTrades:10,
  maximumRuntimeStates:1024,
  runtimeStateTtlMs:120_000,
  sourceDoesNotAuthorizeEntry:true,
  entryAuthority:false,
  orderAuthority:false,
  strategicEntryAuthority:'ATHENA',
  persistenceRole:'prospective_causal_learning_and_audit',
});


export const COSMO_SHADOW_TRADING = Object.freeze({
  version:'COSMO-SHADOW-V1',
  policyRevision:'CST1-R1-VISIBLE-PERSISTED-SHADOW-TRADING',
  role:'broker_free_market_observation_and_virtual_trade_layer',
  brokerOrderAuthority:false,
  portfolioCapitalAuthority:false,
  defaultGreenTriggerCents:1,
  greenPriceBasis:'EXECUTABLE_YES_BID_MINUS_SHADOW_ENTRY',
  oneBoltPerShadowTrade:true,
  atomicThunderEvent:'COSMO_GREEN',
  lineageRequired:true,
});

export const FEEDERS = Object.freeze([
  { name: 'Pegasus', minTradesInPlay: 10, minPriceKey: 'pegasusMinPriceCents', maxPriceKey: 'pegasusMaxPriceCents', dropKey: 'pegasusDropCents' },
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

// R65/LP2 Lightning Plasma. Lightning Plasma now hunts exclusively inside
// Gemini by observing Another Dimension market references. Any distinct market
// inside the operator price band that is at least +4c above its Another
// Dimension virtual entry reference may occupy one of three continuous slots.
// There is deliberately no timing/convergence window. The existing field budget
// is preserved and divided across the three fixed strike slots; it is never
// multiplied per strike.
export const LIGHTNING_PLASMA = Object.freeze({
  version:'LIGHTNING-PLASMA-V2',
  policyRevision:'LP2-R1-GEMINI-PLUS-4C-CONTINUOUS-THREE-SLOT-FIELD',
  role:'continuous_gemini_uplift_three_slot_attack',
  sourceUniverse:'Gemini',
  sourceAttack:'Another Dimension',
  minimumUpliftCents:4,
  maxStrikes:3,
  fieldStakeCents:20_000,
  minEntryCents:20,
  maxEntryCents:89,
  maxSpreadCents:3,
  noTimeWindow:true,
  oneStrikePerTicker:true,
  fieldBudgetSharedAcrossStrikes:true,
  normalStrategicDiscoveryBypass:true,
  fullExecutionSafetyRequired:true,
  sourceDoesNotAuthorizeEntry:true,
  strategicEntryAuthority:'LIGHTNING_PLASMA_GEMINI_UPLIFT',
  liveAuthority:'DEDICATED_GEMINI_TRIGGER_PLUS_HARD_EXECUTION_SAFETY',
  profitAuthority:'ATHENA-X1',
  lossAuthority:'AURORA_EXECUTION',
});


// R45 Aurora Execution. New Hunters receive a position-specific frozen Danger
// Line derived from exact filled entry economics. The 45% covenant is an
// intended economic-loss ceiling at the frozen danger price; real market gaps
// can still execute worse, so U-SG1 remains the sole loss-execution authority.
export const AURORA_EXECUTION = Object.freeze({
  version:'AURORA-V2',
  policyRevision:'AURORA-V2-R2-VERIFIED-FROZEN-DANGER-GATE',
  defaultDamageControlPercent:45,
  minimumDamageControlPercent:1,
  maximumDamageControlPercent:95,
  minimumStopDistanceCents:1,
  frozenAtEntry:true,
  trails:false,
  recalculatesAfterEntry:false,
  lossAuthority:'U-SG1',
  watchdog:'SLW1',
  normalAutomatedLossExitGate:'FROZEN_DANGER_LINE_VERIFIED_EXECUTABLE_TOUCH',
  watchdogAboveDangerLine:'OBSERVATION_ONLY',
});

export const ATOMIC_THUNDER_BOLT = Object.freeze({
  version:'ATOMIC-THUNDER-BOLT-V2',
  policyRevision:'ATB3-R1-COSMO-GREEN-IMMEDIATE-BOLT',
  role:'cosmo_shadow_green_momentum_signal',
  authority:'SIGNAL_ONLY',
  entryAuthority:false,
  orderAuthority:false,
  athenaRequired:true,
  noBoltNoAttack:true,
  maximumOpportunityAgeMs:5_000,
  minimumHistorySamples:0,
  maximumActiveBolts:4096,
  maximumCounterfactualEpisodes:2048,
  learningHorizonsMs:Object.freeze([5_000,15_000,30_000,60_000,120_000,300_000,600_000]),
});

// Legacy ATB2 price-path classifier retained for bounded historical research.
// R60 removes it from the command path: it cannot delay COSMO_GREEN, block a
// Bolt, alter Athena FIRE, or place an order. The old 30s/120s values below are
// research-window metadata only and are no longer operator strategy settings.
export const ATOMIC_THUNDER_PATTERN_GUARDIAN = Object.freeze({
  version:'ATB2-RESEARCH',
  policyRevision:'ATB2-R5-RESEARCH-ONLY-NON-AUTHORITY',
  role:'historical_dangerous_price_path_research_only',
  authority:'RESEARCH_ONLY',
  defaultPreExamMs:30_000,
  defaultFinalExamMs:120_000,
  lookbackMs:120_000,
  minimumLegCents:2,
  materialFallCents:3,
  materialReboundCents:2,
  materialCrashCents:8,
  minimumCrashReboundCents:4,
  minimumCrashReclaimRatio:0.50,
  fallingKnifeNetDropCents:8,
  fallingKnifeMinimumDownLegs:3,
  maximumActivePreBolts:2048,
});

export const ARAYASHIKI = Object.freeze({
  version:'ARAYASHIKI-A8-V1',
  policyRevision:'A8-R3-RESEARCH-ONLY-NON-STRATEGIC',
  role:'NON_AUTHORITY_RESEARCH_AND_DIAGNOSTIC_CONTEXT',
  authority:'RESEARCH_ONLY',
  independentEntryAuthority:false,
  brokerOrderAuthority:false,
  noEvidencePolicy:'NOT_CERTIFIED',
  certificateTtlMs:5_000,
  maximumMarketAgeMs:2_000,
  maximumCrashStateAgeMs:5_000,
  minimumHistorySamples:0,
  minimumHistoryWindowMs:5_000,
  maximumSpreadCents:3,
  materialCrashCents:8,
  minimumReboundReclaimRate:0.50,
  minimumReboundStableObservations:3,
  minimumReboundUpTicks:2,
  minimumSurvivalScore:70,
  minimumLowBandSurvivalScore:76,
  regimeContinuityRequired:true,
  postFirePredictiveVeto:false,
});

export const ATHENA_COMMANDER = Object.freeze({
  version:'ATHENA-A3',
  policyRevision:'ATHENA-A3-R5-COSMO-GREEN-DIRECT-FIRE',
  role:'supreme_attack_selector_after_atomic_thunder_green_bolt',
  authority:'STRATEGIC_ENTRY_AND_ATTACK_SELECTION_AFTER_ATOMIC_THUNDER',
  decisions:Object.freeze(['FIRE','WATCH','REJECT','SURVIVAL_REJECT','EXPIRED']),
  outcomeLabels:Object.freeze(['CLEAN_BOLT','TOXIC_LATE_BOLT','FALSE_BOLT','EXPIRED_NO_IMPULSE']),
  entryDecisionAuthority:true,
  attackSelectionAuthority:true,
  directBrokerOrderAuthority:false,
  hardSafetyMayAbortFire:true,
  attackStrategicRevalidationAllowed:false,
  economicObjective:'MAXIMIZE_EXPECTED_NET_VALUE_AT_CONFIGURED_INFINITY_TARGET',
  targetAwareAttackSelection:true,
  matureNegativeExpectedValueMayFire:false,
  legacyNegativeExpectedValuePreSurvivalVeto:false,
  certifiedEconomicMemoryRequiredWhenMature:true,
  certifiedEconomicMaturityObservations:5,
  partialCertifiedEconomicMinimumObservations:3,
  partialCertifiedEconomicDecisionWeight:0.45,
  coldStartLegacyPriorDecisionWeight:0.10,
  forcedAttackDiversification:false,
});

export const POST_EXIT_RESEARCH = Object.freeze({
  version:'POST-EXIT-RESEARCH-V2',
  policyRevision:'PER2-R1-FULL-EXECUTABLE-REGRET-AND-PROTECTION',
  sweepIntervalMs:5_000,
  maximumRowsPerSweep:500,
  completionGraceMs:600_000,
  persistenceIntervalMs:60_000,
  maximumPendingEntries:512,
  retryCooldownMs:5_000,
  fullExecutableEconomicBasis:true,
  displayCurrentMarketPrice:true,
  preservesBestAndWorstAfterExit:true,
});

export const INFINITY_BREAK = Object.freeze({
  version:'INFINITY-BREAK-V1',
  policyRevision:'IB1-R1-FIRST-FULL-EXECUTABLE-NET-PROFIT',
  role:'new_generation_first_full_executable_net_profit_authority',
  authority:'PROFIT_EXIT',
  appliesTo:'R51_plus_entries_with_INFINITY_BREAK_snapshot',
  fullPositionOnly:true,
  defaultMinimumNetPerOriginalContractCents:1,
  defaultRequiredFreshConfirmations:2,
  defaultMaximumBookAgeMs:1000,
  defaultConfirmationWindowMs:3000,
  requiresDistinctBookEvidence:true,
  lossAuthority:'U-SG1',
  noSettlementPrediction:true,
});

export const LEGACY_STOP_LOSS_CENTS = Object.freeze({
  'Momentum Hunter':10,
  'Recovery Hunter':10,
  'Wave Surfer':14,
  'Crash Recovery Hunter':35,
  'Lightning Plasma':35,
  'Athena Exclamation':35,
  'Dragon Recovery Hunter':35,
  'Golden Dragon Hunter':35,
});

export function auroraEntryBand(entryPriceCents=0){
  const p=Math.max(0,Math.round(Number(entryPriceCents)||0));
  if(p<30)return '<30';
  if(p>=95)return '95-98';
  const lo=Math.floor(p/5)*5;
  return `${lo}-${lo+4}`;
}

export function kalshiGeneralTakerFeeEstimateCents({count=0,priceCents=0,multiplier=1}={}){
  const qty=Math.max(0,Number(count)||0);
  const price=Math.max(0,Math.min(100,Number(priceCents)||0))/100;
  const m=Math.max(0,Number(multiplier)||0);
  if(!(qty>0)||!(price>0)||price>=1||!(m>0))return 0;
  // Current Kalshi event-contract general taker schedule: M * 0.07 * C * P * (1-P),
  // rounded upward to the next cent. Active SAGITTARIUS sports series use M=1.
  return Math.ceil((m*0.07*qty*price*(1-price)*100)-1e-12);
}

export function auroraExpectedExitFeeCents({mode='SIMULATION',count=0,entryFeeCents=0,simFeeCents=0,exitPriceCents=null}={}){
  const qty=Math.max(0,Number(count)||0);
  const sim=Math.max(0,Number(simFeeCents)||0)*qty;
  const entryFee=Math.max(0,Number(entryFeeCents)||0);
  if(String(mode||'SIMULATION').toUpperCase()!=='LIVE')return sim;
  const px=Number(exitPriceCents);
  const fee=Number.isFinite(px)?kalshiGeneralTakerFeeEstimateCents({count:qty,priceCents:px}):0;
  // The configured SIM reserve remains a conservative floor in case the fee
  // schedule is changed without a release. The actual entry fee is also a
  // conservative lower-bound proxy for the symmetric exit when no price is supplied.
  return Math.max(sim,fee,Number.isFinite(px)?0:entryFee);
}

export function calculateAuroraSnapshot({entryPriceCents,count,entryFeeCents=0,expectedExitFeeCents=0,mode='SIMULATION',damageControlPercent=AURORA_EXECUTION.defaultDamageControlPercent,calculatedAtMs=Date.now(),feeEstimator='frozen'}={}){
  const entry=Math.round(Number(entryPriceCents));
  const qty=Number(count);
  const entryFee=Math.max(0,Number(entryFeeCents)||0);
  const exitFee=Math.max(0,Number(expectedExitFeeCents)||0);
  if(!Number.isFinite(entry)||entry<=0||entry>=100) return {ok:false,reason:'invalid_entry_price'};
  if(!Number.isFinite(qty)||qty<=0) return {ok:false,reason:'invalid_count'};
  const originalEntryNotionalCents=entry*qty;
  const boundedDamageControlPercent=Math.max(AURORA_EXECUTION.minimumDamageControlPercent,Math.min(AURORA_EXECUTION.maximumDamageControlPercent,Number(damageControlPercent)||AURORA_EXECUTION.defaultDamageControlPercent));
  const maximumEconomicLossRatio=boundedDamageControlPercent/100;
  const maximumEconomicLossCents=originalEntryNotionalCents*maximumEconomicLossRatio;
  const feeBudgetCents=entryFee+exitFee;
  const priceLossBudgetCents=maximumEconomicLossCents-feeBudgetCents;
  const stopDistanceCents=Math.floor(priceLossBudgetCents/qty+1e-9);
  if(stopDistanceCents<AURORA_EXECUTION.minimumStopDistanceCents) return {ok:false,reason:'fee_budget_exhausts_aurora_loss_envelope',originalEntryNotionalCents,maximumEconomicLossCents,feeBudgetCents};
  const boundedDistance=Math.min(entry-1,stopDistanceCents);
  if(boundedDistance<AURORA_EXECUTION.minimumStopDistanceCents) return {ok:false,reason:'aurora_stop_out_of_market'};
  const dangerPriceCents=entry-boundedDistance;
  const economicLossAtDangerCents=boundedDistance*qty+feeBudgetCents;
  return {
    ok:true,version:AURORA_EXECUTION.version,policyRevision:AURORA_EXECUTION.policyRevision,frozen:true,
    mode:String(mode||'SIMULATION').toUpperCase(),entryPriceCents:entry,entryBand:auroraEntryBand(entry),originalContractCount:qty,
    originalEntryNotionalCents,entryFeeCents:entryFee,expectedExitFeeCents:exitFee,feeEstimator:String(feeEstimator||'frozen'),
    damageControlPercent:boundedDamageControlPercent,maximumEconomicLossRatio,maximumEconomicLossCents,
    stopDistanceCents:boundedDistance,dangerPriceCents,economicLossAtDangerCents,
    economicLossRatioAtDanger:economicLossAtDangerCents/originalEntryNotionalCents,calculatedAtMs:Number(calculatedAtMs)||Date.now(),
  };
}

export function calculateAuroraSnapshotFromFeeModel({entryPriceCents,count,entryFeeCents=null,mode='SIMULATION',simFeeCents=0,damageControlPercent=AURORA_EXECUTION.defaultDamageControlPercent,calculatedAtMs=Date.now()}={}){
  const executionMode=String(mode||'SIMULATION').toUpperCase();
  const qty=Math.max(0,Number(count)||0);
  const entry=Math.round(Number(entryPriceCents));
  if(!(qty>0)||!(entry>0)||entry>=100)return calculateAuroraSnapshot({entryPriceCents:entry,count:qty,mode:executionMode,damageControlPercent,calculatedAtMs});
  if(executionMode!=='LIVE'){
    const feePerContract=Math.max(0,Number(simFeeCents)||0);
    const entryFee=entryFeeCents==null?feePerContract*qty:Math.max(0,Number(entryFeeCents)||0);
    return calculateAuroraSnapshot({entryPriceCents:entry,count:qty,entryFeeCents:entryFee,expectedExitFeeCents:feePerContract*qty,mode:'SIMULATION',damageControlPercent,calculatedAtMs,feeEstimator:'simulation_fee_schedule'});
  }
  const actualEntryFee=entryFeeCents==null
    ? kalshiGeneralTakerFeeEstimateCents({count:qty,priceCents:entry})
    : Math.max(0,Number(entryFeeCents)||0);
  let expectedExitFee=Math.max(0,Number(simFeeCents)||0)*qty;
  let priorDanger=null;
  let out=null;
  // Exit fee depends on the frozen danger price, while the danger price itself
  // depends on the fee budget. Iterate to a deterministic fixed point.
  for(let i=0;i<12;i+=1){
    out=calculateAuroraSnapshot({entryPriceCents:entry,count:qty,entryFeeCents:actualEntryFee,expectedExitFeeCents:expectedExitFee,mode:'LIVE',damageControlPercent,calculatedAtMs,feeEstimator:entryFeeCents==null?'kalshi_general_taker_formula_preflight':'kalshi_actual_entry_plus_general_taker_exit_formula'});
    if(!out.ok)return out;
    const nextExitFee=Math.max(
      Math.max(0,Number(simFeeCents)||0)*qty,
      kalshiGeneralTakerFeeEstimateCents({count:qty,priceCents:out.dangerPriceCents}),
    );
    if(nextExitFee===expectedExitFee&&out.dangerPriceCents===priorDanger)break;
    priorDanger=out.dangerPriceCents;
    expectedExitFee=nextExitFee;
  }
  out=calculateAuroraSnapshot({entryPriceCents:entry,count:qty,entryFeeCents:actualEntryFee,expectedExitFeeCents:expectedExitFee,mode:'LIVE',damageControlPercent,calculatedAtMs,feeEstimator:entryFeeCents==null?'kalshi_general_taker_formula_preflight':'kalshi_actual_entry_plus_general_taker_exit_formula'});
  return out.ok?{...out,feeSchedule:'KALSHI_GENERAL_EVENT_TAKER_0.07_M1'}:out;
}
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
// R61 SLW1 Stop Loss Watchdog. This is not a second loss authority. Above a
// frozen Aurora danger line it is observation/classification telemetry only and
// can never sell. Only a fresh executable touch/cross of the frozen Aurora line
// activates U-SG1 loss-domain authority; below that verified gate SLW1 evidence
// may inform U-SG1 recovery/exit handling without changing the frozen line.
export const STOP_LOSS_WATCHDOG = Object.freeze({
  version: 'SLW1',
  policyRevision: 'SLW1-R2-STAKE-NORMALIZED',
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


// R36/R2 ATHENA-X1 Pulse Floor. X1 is a full-position profit authority only.
// It never creates exposure, never splits a position, and never enters the
// loss domain. U-SG1 remains the exclusive loss authority. R1 waited for a
// 4-9c structural pullback and a triple score AND; that delay harvested peaks
// after they were already gone. R2 keeps the +1c net activation latch, then
// trails a shrinking green floor under the executable peak. Scores remain
// telemetry. Compatible R1 snapshots may continue under R2 rules; unknown
// revisions stay fail-closed. Existing PRI1 positions retain their
// creation-time authority until they close naturally.
export const ATHENA_EXIT_COMPATIBLE_REVISIONS = Object.freeze(['ATHENA-X1-R1','ATHENA-X1-R2']);
export const ATHENA_EXIT_INTELLIGENCE = Object.freeze({
  version:'ATHENA-X1',
  policyRevision:'ATHENA-X1-R2',
  role:'pulse_floor_full_position_peak_continuation_profit_authority',
  fullPositionOnly:true,
  positionSplitting:false,
  noLookahead:true,
  fullExecutableDepthRequired:true,
  maximumExecutableBookAgeMs:5_000,
  maximumFutureBookSkewMs:2_000,
  lossDomainDelegatedToStopGuard:true,
  activationThresholdSetting:'infinityBreakMinNetPerOriginalContractCents',
  activationRequiresFreshFullPositionExecutableDepth:true,
  activationLatch:true,
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
  pulseFloor:true,
  pulseGivebackColdNetCents:1,
  pulseGivebackWarmNetCents:1.5,
  pulseGivebackRunnerNetCents:2,
  pulseGivebackMaximumNetCents:3,
  pulseGivebackRunnerRatio:0.22,
  pulseHighPriceBandCents:90,
  pulseHighPriceGivebackCents:2,
  pulseExhaustionPriceCents:95,
  pulseExhaustionGivebackCents:3,
  pulseTwoTickMinimumPeakNetCents:3,
  pulseTwoTickMinimumPullbackCents:3,
  pulseStalePeakMs:25_000,
  pulseStalePeakPullbackCents:2,
  pulseGivebackTightenMs:15_000,
  pulseGivebackTightenFactor:0.7,
  pulseGivebackForceTightMs:40_000,
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


// Atomic Thunder retained in R45. This is a per-Attack profit-domain authority, not an
// entry model and never a loss-domain authority. It harvests the first genuine
// full-position executable fee-adjusted profit after independent fresh-book
// confirmations. U-SG1 remains exclusive loss authority.
export const ATOMIC_THUNDER = Object.freeze({
  version: 'ATOMIC-THUNDER-V1',
  policyRevision: 'AT1-R1-FIRST-FULL-EXECUTABLE-NET-PROFIT',
  role: 'legacy_per_hunter_first_executable_net_profit_harvest_authority',
  legacyCompatibilityOnlyForNewGeneration:true,
  authority: 'PROFIT_EXIT',
  appliesTo: 'R44_plus_real_hunters_with_ATOMIC_THUNDER_snapshot',
  fullPositionOnly: true,
  minimumNetPerOriginalContractCents: 1,
  requiredFreshConfirmations: 2,
  maximumBookAgeMs: 1000,
  maximumQuoteAgeMs: 1000,
  confirmationWindowMs: 3000,
  requiresDistinctBookEvidence: true,
  lossAuthority: ULTIMATE_STOP_GUARD.version,
  goldenEyePrecedence: 'ATOMIC_THUNDER_FIRST',
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
