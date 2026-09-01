import { FEEDER_CONCEPTS, ACTIVE_FEEDER_CONCEPTS, PORTFOLIO_CONCEPTS } from './doctrine.mjs';

const finite = (v, fallback = null) => Number.isFinite(Number(v)) ? Number(v) : fallback;
const positive = (v, fallback = 0) => Math.max(0, finite(v, fallback) ?? fallback);
const FINAL_STATUSES = new Set(['finalized','settled','determined']);
const HORIZONS_MS = Object.freeze([5_000,15_000,30_000,60_000,120_000,300_000,600_000]);
const REFERENCE_PROFIT_THRESHOLDS_CENTS = Object.freeze([2_500,5_000,10_000,20_000,30_000,50_000]);

export const FEEDER_SIGNAL_INTELLIGENCE = Object.freeze({
  version:'FSI1',
  role:'diagnostic_only_causal_feeder_signal_trajectory_recorder',
  executionAuthority:false,
  entryAuthority:false,
  athenaDecisionAuthority:false,
  analysisStakeCents:20_000,
  maximumObservationsPerSignal:96,
  pressureObservationsPerSignal:64,
  observationRetentionPolicy:'first_stratified_middle_recent_tail_plus_aggregates',
  persistenceIntervalMs:1_000,
  persistenceBatchSize:50,
  maximumPersistenceConcurrency:1,
  persistenceFailureRetryMs:5_000,
  persistenceRevision:'FSI1-P2-BOUNDED-BATCH',
  fastObservationIntervalMs:250,
  mediumObservationAfterMs:60_000,
  mediumObservationIntervalMs:1_000,
  slowObservationAfterMs:5*60_000,
  slowObservationIntervalMs:5_000,
  horizonMs:HORIZONS_MS,
  referenceProfitThresholdsCents:REFERENCE_PROFIT_THRESHOLDS_CENTS,
});

function sourceForEntry(entry = {}) {
  if (entry.conceptName === 'Dragon') return entry.entryConfig?.dragonSource || {};
  if (entry.conceptName === 'Phoenix') return entry.entryConfig?.phoenixSource || {};
  if (entry.conceptName === 'Golden Dragon') return entry.entryConfig?.goldenDragonSource || {};
  return {};
}

function finalPriceFromQuote(q) {
  const status=String(q?.status||'').toLowerCase();
  if (!FINAL_STATUSES.has(status) || !q?.result) return null;
  const result=String(q.result).toLowerCase();
  if (result==='yes') return 100;
  if (result==='no') return 0;
  return null;
}

function economics(entry, q, settings = {}) {
  const source=sourceForEntry(entry);
  const feePerContract=positive(settings.simFeeCents,2);
  const referenceOriginCents=positive(entry.entryPriceCents,0);
  const referenceCount=positive(entry.count,0);
  const referenceStakeCents=positive(entry.entryConfig?.referenceStakeCents,referenceOriginCents*referenceCount);
  const signalAskCents=positive(source.signalAskCents ?? source.signalPriceCents ?? source.validatedAskCents ?? (entry.conceptName === 'Dragon' || entry.conceptName === 'Golden Dragon' ? 0 : entry.entryPriceCents),0)
    || positive(q?.yesAsk,0)
    || positive(entry.currentPriceCents,0)
    || referenceOriginCents;
  const signalBidCents=positive(source.signalBidCents ?? source.validatedBidCents,0)
    || positive(q?.yesBid,0)
    || Math.max(0,signalAskCents-positive(entry.spreadAtEntryCents,0));
  const analysisCount=signalAskCents>0?Math.max(1,Math.floor(FEEDER_SIGNAL_INTELLIGENCE.analysisStakeCents/signalAskCents)):0;
  const referencePnlAtSignalCents=referenceCount>0
    ? (signalBidCents-referenceOriginCents)*referenceCount-2*feePerContract*referenceCount
    : null;
  const signalHypothesisImmediateNetCents=analysisCount>0
    ? (signalBidCents-signalAskCents)*analysisCount-2*feePerContract*analysisCount
    : null;
  return {
    feePerContractCents:feePerContract,
    referenceOriginCents,referenceCount,referenceStakeCents,
    signalBidCents,signalAskCents,analysisStakeCents:FEEDER_SIGNAL_INTELLIGENCE.analysisStakeCents,analysisCount,
    referencePnlAtSignalCents,
    referenceReturnOnStakeAtSignal:referenceStakeCents>0&&referencePnlAtSignalCents!=null?referencePnlAtSignalCents/referenceStakeCents:null,
    signalHypothesisImmediateNetCents,
  };
}

function signalContext(entry,q,econ,now){
  const source=sourceForEntry(entry);
  const gameStart=positive(q?.gameStartTimeMs ?? entry.gameStartTimeMs,0);
  return {
    signalAtMs:positive(source.signalAtMs,0)||positive(entry.openedAtMs,now),
    bidCents:econ.signalBidCents,
    askCents:econ.signalAskCents,
    spreadCents:Math.max(0,econ.signalAskCents-econ.signalBidCents),
    volume24h:positive(q?.volume24h ?? entry.volume24h,0),
    recentTrades:positive(q?.recentTrades,0),
    liveStatus:String(q?.liveStatus||q?.status||''),
    gameStartTimeMs:gameStart||null,
    gameMinutes:gameStart?Math.max(0,now-gameStart)/60_000:null,
    phoenixOriginBidCents:finite(source.originBidCents,null),
    phoenixOriginAskCents:finite(source.originAskCents,null),
    phoenixRiseBidCents:finite(source.riseBidCents,null),
    phoenixRiseAskCents:finite(source.riseAskCents,null),
    phoenixUpTicks:finite(source.upTicks,null),
    phoenixConfirmationCount:finite(source.confirmationCount,null),
    phoenixObservationDurationMs:finite(source.observationDurationMs,null),
    phoenixExpiresAtMs:finite(source.expiresAtMs,null),
  };
}

function crashContext(entry){
  const source=sourceForEntry(entry);
  if (!source || !Object.keys(source).length) return null;
  return {
    version:source.version||null,
    episodeId:String(source.episodeId||entry.sourceTradeId||''),
    episodeIndex:finite(source.episodeIndex,null),
    sport:source.sport||'Unknown',
    preCrashPeakCents:finite(source.preCrashPeakCents,null),
    troughCents:finite(source.troughCents,null),
    crashDepthCents:finite(source.crashDepthCents,null),
    reboundCentsAtSignal:finite(source.reboundCents,null),
    reclaimRateAtSignal:finite(source.reclaimRate,null),
    stableObservationsAtSignal:finite(source.stableObservations,null),
    upwardTicksAtSignal:finite(source.upwardTicks,null),
    lowerLowCountAtSignal:finite(source.lowerLowCount,null),
    reboundLostCountAtSignal:finite(source.reboundLostCount,null),
    crashStartedAtMs:finite(source.crashStartedAtMs,null),
    troughAtMs:finite(source.troughAtMs,null),
    reboundConfirmedAtMs:finite(source.reboundConfirmedAtMs,null),
    trustScore:finite(source.trustScore,null),
    phoenixOriginBidCents:finite(source.originBidCents,null),
    phoenixOriginAskCents:finite(source.originAskCents,null),
    phoenixRiseBidCents:finite(source.riseBidCents,null),
    phoenixRiseAskCents:finite(source.riseAskCents,null),
    phoenixUpTicks:finite(source.upTicks,null),
    phoenixConfirmationCount:finite(source.confirmationCount,null),
    phoenixObservationDurationMs:finite(source.observationDurationMs,null),
    phoenixExpiresAtMs:finite(source.expiresAtMs,null),
    survivalProfile:source.survivalProfile||null,
  };
}

function settingsSnapshot(settings={}){
  // R51 records only canonical operator controls. Predictive Attack thresholds
  // are raw Athena features, not settings or independent authority.
  const keys=[
    'mode','simFeeCents','minGameMinutes','maxGameMinutes','maxSpreadCents','maxPositions','maxEntriesPerTrade','hunterCooldownMinutes',
    'auroraDamageControlPercent','infinityBreakMinNetPerOriginalContractCents',
    'pegasusEnabled','dragonEnabled','phoenixEnabled','momentumHunterEnabled','waveSurferEnabled','recoveryHunterEnabled','crashRecoveryHunterEnabled','athenaExclamationEnabled','lightningPlasmaEnabled','galacticExplosionEnabled',
    'pegasusMinPriceCents','pegasusMaxPriceCents','pegasusDropCents','dragonMinSignalPriceCents','dragonMaxSignalPriceCents','dragonMaxEpisode','phoenixReferenceStakeCents','phoenixMinPriceCents','phoenixMaxPriceCents',
    'momentumStakeCents','momentumMinEntryCents','momentumMaxEntryCents',
    'waveStakeCents','waveMinEntryCents','waveMaxEntryCents',
    'recoveryStakeCents','recoveryMinEntryCents','recoveryMaxEntryCents',
    'crashRecoveryStakeCents','crashRecoveryMinEntryCents','crashRecoveryMaxEntryCents',
    'athenaExclamationStakeCents','athenaExclamationMinEntryCents','athenaExclamationMaxEntryCents',
    'lightningPlasmaFieldStakeCents','lightningPlasmaMinEntryCents','lightningPlasmaMaxEntryCents','lightningPlasmaMaxStrikes',
  ];
  return Object.fromEntries(keys.filter((k)=>settings[k]!==undefined).map((k)=>[k,settings[k]]));
}

export function createFeederSignalIntelState(entry,q=null,settings={},now=Date.now()){
  if (!entry?.id || !ACTIVE_FEEDER_CONCEPTS.has(entry.conceptName)) return null;
  const econ=economics(entry,q,settings);
  const signal=signalContext(entry,q,econ,now);
  const coverageStartedAtMs=now;
  const signalAtMs=signal.signalAtMs||now;
  const coverageGapBeforeTelemetryMs=Math.max(0,coverageStartedAtMs-signalAtMs);
  return {
    version:FEEDER_SIGNAL_INTELLIGENCE.version,
    feederId:String(entry.id),systemName:String(entry.systemName||settings.systemName||''),feederConcept:String(entry.conceptName),
    ticker:String(entry.ticker||''),eventTicker:String(entry.eventTicker||entry.ticker||''),marketTitle:String(entry.marketTitle||''),
    sourceEpisodeId:entry.sourceTradeId==null?null:String(entry.sourceTradeId),
    release:String(entry.entryConfig?.release||''),mode:String(entry.mode||settings.mode||''),
    signalAtMs,coverageStartedAtMs,coverageGapBeforeTelemetryMs,
    trajectoryCoverage:coverageGapBeforeTelemetryMs<=5_000?'causal_from_signal':'partial_from_upgrade',
    trackingComplete:false,completedAtMs:null,finalResult:null,finalPriceCents:null,
    semantics:{
      referencePnl:'hypothetical reference-only PnL from the feeder reference origin; for Dragon/Golden Dragon the origin is the crash trough and is not a tradable signal-time entry',
      normalizedSignalHypothesis:'diagnostic-only $200 hypothetical entered at the observable signal ask; never submits an order',
      milestoneHypothesis:'diagnostic-only $200 hypothetical entered when displayed reference PnL first crosses a configured threshold; used to test whether a large green feeder number predicts future continuation',
      causal:true,hindsightEntryAtTrough:false,
    },
    economics:econ,
    signalContext:signal,
    crashContext:crashContext(entry),
    settingsSnapshot:settingsSnapshot(settings),
    trajectory:{
      observationCount:0,storedObservationCount:0,firstObservedAtMs:null,lastObservedAtMs:null,lastBidCents:null,lastAskCents:null,
      postSignalHighBidCents:null,postSignalHighAtMs:null,postSignalLowBidCents:null,postSignalLowAtMs:null,
      maxExtensionFromSignalAskCents:null,maxDrawdownFromSignalAskCents:null,
      maxReferencePnlCents:null,maxReferencePnlAtMs:null,minReferencePnlCents:null,minReferencePnlAtMs:null,currentReferencePnlCents:null,
      maxNormalizedMarkPnlCents:null,maxNormalizedMarkPnlAtMs:null,minNormalizedMarkPnlCents:null,minNormalizedMarkPnlAtMs:null,currentNormalizedMarkPnlCents:null,
      maxNormalizedExecutablePnlCents:null,maxNormalizedExecutablePnlAtMs:null,minNormalizedExecutablePnlCents:null,minNormalizedExecutablePnlAtMs:null,currentNormalizedExecutablePnlCents:null,
      fullDepthObservationCount:0,bookObservationCount:0,fullDepthRate:null,
      spreadSumCents:0,spreadMaxCents:0,averageSpreadCents:null,
      upMoves:0,downMoves:0,flatMoves:0,directionChanges:0,lastDirection:0,currentUpRun:0,currentDownRun:0,maxConsecutiveUp:0,maxConsecutiveDown:0,
      fellBelowSignal:false,fellBelowReferenceOrigin:false,newLowBelowCrashTrough:false,
      firstProfitThresholdAtMs:{},firstLossThresholdAtMs:{},checkpoints:{},referenceProfitMilestones:{},
    },
    observations:[],updatedAtMs:now,
  };
}

function currentPrices(q){
  const final=finalPriceFromQuote(q);
  const bid=final==null?finite(q?.yesBid,null):final;
  const ask=final==null?finite(q?.yesAsk,null):final;
  return {final,bid,ask};
}

function netForEntry(entryAsk,count,bid,fee){
  if (!(entryAsk>0)||!(count>0)||bid==null) return null;
  return (bid-entryAsk)*count-2*fee*count;
}

function executableSnapshot(market,ticker,count,entryAsk,fee,now){
  if (!market||!(count>0)||typeof market.executableBid!=='function') return null;
  const bookAgeMs=typeof market.bookAgeMs==='function'?finite(market.bookAgeMs(ticker,now),null):null;
  const x=market.executableBid(ticker,count);
  if (!x) return {bookAgeMs,available:false,full:false,filled:0,avgCents:null,netPnlCents:null};
  const filled=positive(x.filled,0),avg=finite(x.avgCents,null);
  return {
    bookAgeMs,available:true,full:Boolean(x.full),filled,avgCents:avg,bestCents:finite(x.bestCents,null),
    netPnlCents:Boolean(x.full)&&avg!=null?netForEntry(entryAsk,count,avg,fee):null,
  };
}

function updateExtreme(obj,maxKey,maxAtKey,minKey,minAtKey,value,atMs){
  if (value==null) return;
  if (obj[maxKey]==null||value>obj[maxKey]){obj[maxKey]=value;obj[maxAtKey]=atMs;}
  if (obj[minKey]==null||value<obj[minKey]){obj[minKey]=value;obj[minAtKey]=atMs;}
}

function maybeCheckpoint(target,elapsedMs,sample){
  for(const horizon of HORIZONS_MS){
    const key=String(horizon);
    if(target[key]||elapsedMs<horizon)continue;
    target[key]={horizonMs:horizon,atMs:sample.atMs,bidCents:sample.bidCents,askCents:sample.askCents,referencePnlCents:sample.referencePnlCents,normalizedMarkPnlCents:sample.normalizedMarkPnlCents,normalizedExecutablePnlCents:sample.normalizedExecutablePnlCents,fullDepth:Boolean(sample.executable?.full)};
  }
}

function updateMilestoneFuture(m,sample){
  const fee=finite(m.feePerContractCents,0)||0;
  const mark=netForEntry(m.hypotheticalEntryAskCents,m.hypotheticalCount,sample.bidCents,fee);
  m.currentMarkNetPnlCents=mark;
  if(mark!=null){
    if(m.maxMarkNetPnlCents==null||mark>m.maxMarkNetPnlCents){m.maxMarkNetPnlCents=mark;m.maxMarkAtMs=sample.atMs;}
    if(m.minMarkNetPnlCents==null||mark<m.minMarkNetPnlCents){m.minMarkNetPnlCents=mark;m.minMarkAtMs=sample.atMs;}
  }
  if(sample.bidCents!=null){m.maxFutureBidCents=m.maxFutureBidCents==null?sample.bidCents:Math.max(m.maxFutureBidCents,sample.bidCents);m.minFutureBidCents=m.minFutureBidCents==null?sample.bidCents:Math.min(m.minFutureBidCents,sample.bidCents);}
  const elapsed=Math.max(0,sample.atMs-m.crossedAtMs);
  for(const horizon of HORIZONS_MS){
    const key=String(horizon);if(m.horizons[key]||elapsed<horizon)continue;
    m.horizons[key]={horizonMs:horizon,atMs:sample.atMs,bidCents:sample.bidCents,askCents:sample.askCents,markNetPnlCents:mark,referencePnlCents:sample.referencePnlCents};
  }
  if(sample.finalResult){m.finalResult=sample.finalResult;m.finalPriceCents=sample.bidCents;m.finalMarkNetPnlCents=mark;m.finalAtMs=sample.atMs;}
}

function maybeReferenceMilestones(state,sample){
  const t=state.trajectory;
  for(const threshold of REFERENCE_PROFIT_THRESHOLDS_CENTS){
    const key=String(threshold);
    if(!t.referenceProfitMilestones[key]&&sample.referencePnlCents!=null&&sample.referencePnlCents>=threshold){
      const ask=positive(sample.askCents,0);const count=ask>0?Math.max(1,Math.floor(FEEDER_SIGNAL_INTELLIGENCE.analysisStakeCents/ask)):0;
      t.referenceProfitMilestones[key]={
        thresholdCents:threshold,crossedAtMs:sample.atMs,signalAgeMs:Math.max(0,sample.atMs-state.signalAtMs),referencePnlCentsAtCross:sample.referencePnlCents,
        referenceReturnOnStakeAtCross:state.economics.referenceStakeCents>0?sample.referencePnlCents/state.economics.referenceStakeCents:null,
        bidCentsAtCross:sample.bidCents,askCentsAtCross:sample.askCents,spreadCentsAtCross:sample.spreadCents,
        hypotheticalStakeCents:FEEDER_SIGNAL_INTELLIGENCE.analysisStakeCents,hypotheticalEntryAskCents:ask,hypotheticalCount:count,feePerContractCents:state.economics.feePerContractCents,
        immediateMarkNetPnlCents:netForEntry(ask,count,sample.bidCents,state.economics.feePerContractCents),
        executableAtCross:sample.executable||null,maxFutureBidCents:sample.bidCents,minFutureBidCents:sample.bidCents,
        currentMarkNetPnlCents:null,maxMarkNetPnlCents:null,minMarkNetPnlCents:null,maxMarkAtMs:null,minMarkAtMs:null,horizons:{},finalResult:null,finalPriceCents:null,finalMarkNetPnlCents:null,finalAtMs:null,
      };
    }
  }
  for(const m of Object.values(t.referenceProfitMilestones))updateMilestoneFuture(m,sample);
}

function compactObservations(rows,maxRows){
  if(rows.length<=maxRows)return rows;
  const first=rows[0];
  // RGM2 keeps a representative middle plus a recent tail. The old fixed
  // 300-row tail consumed the entire budget whenever maxRows<301, silently
  // discarding the middle of the trajectory.
  const tailKeep=Math.min(Math.max(16,Math.floor(maxRows/2)),Math.max(1,maxRows-1));
  const tail=rows.slice(-tailKeep);
  const middle=rows.slice(1,-tailKeep);
  const middleBudget=Math.max(0,maxRows-1-tail.length);
  if(middleBudget===0)return [first,...tail].slice(0,maxRows);
  // Select exactly middleBudget stratified points when enough middle rows
  // exist. A ceil(stride) loop can under-fill the budget (for example 248/256),
  // wasting bounded memory that was deliberately reserved for causal coverage.
  const sampled=[];
  if(middle.length<=middleBudget)sampled.push(...middle);
  else for(let slot=0;slot<middleBudget;slot++){
    const index=Math.min(middle.length-1,Math.floor(slot*middle.length/middleBudget));
    sampled.push(middle[index]);
  }
  return [first,...sampled,...tail].slice(0,maxRows);
}

function observationInterval(state,now){
  const age=Math.max(0,now-state.signalAtMs);
  if(age>=FEEDER_SIGNAL_INTELLIGENCE.slowObservationAfterMs)return FEEDER_SIGNAL_INTELLIGENCE.slowObservationIntervalMs;
  if(age>=FEEDER_SIGNAL_INTELLIGENCE.mediumObservationAfterMs)return FEEDER_SIGNAL_INTELLIGENCE.mediumObservationIntervalMs;
  return FEEDER_SIGNAL_INTELLIGENCE.fastObservationIntervalMs;
}

export function applyFeederSignalObservation(state,q,market=null,now=Date.now(),maximumObservations=FEEDER_SIGNAL_INTELLIGENCE.maximumObservationsPerSignal){
  if(!state||state.version!==FEEDER_SIGNAL_INTELLIGENCE.version||!q)return {state,stored:false,final:false};
  const {final,bid,ask}=currentPrices(q);if(bid==null||ask==null)return {state,stored:false,final:false};
  const t=state.trajectory,fee=state.economics.feePerContractCents,refCount=state.economics.referenceCount,origin=state.economics.referenceOriginCents;
  const refPnl=refCount>0?(bid-origin)*refCount-2*fee*refCount:null;
  const mark=netForEntry(state.economics.signalAskCents,state.economics.analysisCount,bid,fee);
  const exec=executableSnapshot(market,state.ticker,state.economics.analysisCount,state.economics.signalAskCents,fee,now);
  const execNet=exec?.full?exec.netPnlCents:null;
  const spread=Math.max(0,ask-bid),finalResult=final==null?null:String(q.result||'').toLowerCase();
  const sample={atMs:now,signalAgeMs:Math.max(0,now-state.signalAtMs),quoteUpdatedAtMs:finite(q.updatedAtMs,null),bidCents:bid,askCents:ask,spreadCents:spread,lastPriceCents:finite(q.lastPrice,null),volume24h:finite(q.volume24h,null),recentTrades:finite(q.recentTrades,null),yesBidSize:finite(q.yesBidSize,null),yesAskSize:finite(q.yesAskSize,null),referencePnlCents:refPnl,normalizedMarkPnlCents:mark,normalizedExecutablePnlCents:execNet,executable:exec,liveStatus:String(q.liveStatus||q.status||''),finalResult};
  const priorBid=t.lastBidCents;
  t.observationCount+=1;t.firstObservedAtMs=t.firstObservedAtMs||now;t.lastObservedAtMs=now;t.lastBidCents=bid;t.lastAskCents=ask;t.currentReferencePnlCents=refPnl;t.currentNormalizedMarkPnlCents=mark;t.currentNormalizedExecutablePnlCents=execNet;
  t.spreadSumCents+=spread;t.spreadMaxCents=Math.max(t.spreadMaxCents,spread);t.averageSpreadCents=t.observationCount?t.spreadSumCents/t.observationCount:null;
  if(exec){t.bookObservationCount+=1;if(exec.full)t.fullDepthObservationCount+=1;t.fullDepthRate=t.bookObservationCount?t.fullDepthObservationCount/t.bookObservationCount:null;}
  if(t.postSignalHighBidCents==null||bid>t.postSignalHighBidCents){t.postSignalHighBidCents=bid;t.postSignalHighAtMs=now;}
  if(t.postSignalLowBidCents==null||bid<t.postSignalLowBidCents){t.postSignalLowBidCents=bid;t.postSignalLowAtMs=now;}
  t.maxExtensionFromSignalAskCents=Math.max(0,(t.postSignalHighBidCents??bid)-state.economics.signalAskCents);
  t.maxDrawdownFromSignalAskCents=Math.max(0,state.economics.signalAskCents-(t.postSignalLowBidCents??bid));
  updateExtreme(t,'maxReferencePnlCents','maxReferencePnlAtMs','minReferencePnlCents','minReferencePnlAtMs',refPnl,now);
  updateExtreme(t,'maxNormalizedMarkPnlCents','maxNormalizedMarkPnlAtMs','minNormalizedMarkPnlCents','minNormalizedMarkPnlAtMs',mark,now);
  updateExtreme(t,'maxNormalizedExecutablePnlCents','maxNormalizedExecutablePnlAtMs','minNormalizedExecutablePnlCents','minNormalizedExecutablePnlAtMs',execNet,now);
  if(priorBid!=null){const dir=bid>priorBid?1:bid<priorBid?-1:0;if(dir>0){t.upMoves+=1;t.currentUpRun+=1;t.currentDownRun=0;t.maxConsecutiveUp=Math.max(t.maxConsecutiveUp,t.currentUpRun);}else if(dir<0){t.downMoves+=1;t.currentDownRun+=1;t.currentUpRun=0;t.maxConsecutiveDown=Math.max(t.maxConsecutiveDown,t.currentDownRun);}else{t.flatMoves+=1;}if(dir!==0&&t.lastDirection!==0&&dir!==t.lastDirection)t.directionChanges+=1;if(dir!==0)t.lastDirection=dir;}
  t.fellBelowSignal=t.fellBelowSignal||bid<state.economics.signalAskCents;t.fellBelowReferenceOrigin=t.fellBelowReferenceOrigin||bid<origin;
  const crashTrough=finite(state.crashContext?.troughCents,null);if(crashTrough!=null)t.newLowBelowCrashTrough=t.newLowBelowCrashTrough||bid<crashTrough;
  for(const threshold of [500,1000,2000,4000])if(mark!=null&&mark>=threshold&&t.firstProfitThresholdAtMs[String(threshold)]==null)t.firstProfitThresholdAtMs[String(threshold)]=now;
  for(const threshold of [2000,4000,6000,9000])if(mark!=null&&mark<=-threshold&&t.firstLossThresholdAtMs[String(threshold)]==null)t.firstLossThresholdAtMs[String(threshold)]=now;
  maybeCheckpoint(t.checkpoints,Math.max(0,now-state.signalAtMs),sample);maybeReferenceMilestones(state,sample);
  const elapsedSinceStored=state.observations.length?now-state.observations.at(-1).atMs:Infinity;
  const interval=observationInterval(state,now);
  const material=state.observations.length===0||final!=null||bid===t.postSignalHighBidCents||bid===t.postSignalLowBidCents||elapsedSinceStored>=interval;
  if(material){state.observations.push(sample);const cap=Math.max(16,Math.floor(Number(maximumObservations)||FEEDER_SIGNAL_INTELLIGENCE.maximumObservationsPerSignal));if(state.observations.length>cap)state.observations=compactObservations(state.observations,cap);t.storedObservationCount=state.observations.length;}
  if(final!=null){state.trackingComplete=true;state.completedAtMs=now;state.finalResult=finalResult;state.finalPriceCents=final;}
  state.updatedAtMs=now;return {state,stored:material,final:final!=null,sample};
}

function summarizeRecords(records=[]){
  const byFeeder={},coverage={},thresholds={};
  for(const threshold of REFERENCE_PROFIT_THRESHOLDS_CENTS)thresholds[String(threshold)]={crossed:0,complete:0,positive60s:0,negative60s:0,positive300s:0,negative300s:0,finalPositive:0,finalNegative:0};
  for(const r of records){
    const key=r.feederConcept||'Unknown';byFeeder[key]=byFeeder[key]||{signals:0,complete:0,withCrashContext:0,causalFromSignal:0};byFeeder[key].signals+=1;if(r.trackingComplete)byFeeder[key].complete+=1;if(r.crashContext)byFeeder[key].withCrashContext+=1;if(r.trajectoryCoverage==='causal_from_signal')byFeeder[key].causalFromSignal+=1;
    coverage[r.trajectoryCoverage||'unknown']=(coverage[r.trajectoryCoverage||'unknown']||0)+1;
    for(const [threshold,m] of Object.entries(r.trajectory?.referenceProfitMilestones||{})){const b=thresholds[threshold]||{crossed:0,complete:0,positive60s:0,negative60s:0,positive300s:0,negative300s:0,finalPositive:0,finalNegative:0};b.crossed+=1;if(r.trackingComplete)b.complete+=1;const h60=m.horizons?.['60000']?.markNetPnlCents;if(h60>0)b.positive60s+=1;else if(h60<0)b.negative60s+=1;const h300=m.horizons?.['300000']?.markNetPnlCents;if(h300>0)b.positive300s+=1;else if(h300<0)b.negative300s+=1;if(m.finalMarkNetPnlCents>0)b.finalPositive+=1;else if(m.finalMarkNetPnlCents<0)b.finalNegative+=1;thresholds[threshold]=b;}
  }
  return {signals:records.length,tracking:records.filter((r)=>!r.trackingComplete).length,complete:records.filter((r)=>r.trackingComplete).length,byFeeder,coverage,referenceProfitThresholdOutcomes:thresholds};
}


const compactMilestone = (m = {}) => ({
  crossedAtMs: finite(m.crossedAtMs,null),
  thresholdCents: finite(m.thresholdCents,null),
  hypotheticalEntryAskCents: finite(m.hypotheticalEntryAskCents,null),
  hypotheticalCount: finite(m.hypotheticalCount,null),
  currentMarkNetPnlCents: finite(m.currentMarkNetPnlCents,null),
  maxMarkNetPnlCents: finite(m.maxMarkNetPnlCents,null),
  minMarkNetPnlCents: finite(m.minMarkNetPnlCents,null),
  finalMarkNetPnlCents: finite(m.finalMarkNetPnlCents,null),
  finalResult: m.finalResult || null,
  horizons: Object.fromEntries(Object.entries(m.horizons || {}).map(([k,h])=>[k,{
    atMs: finite(h?.atMs,null),
    bidCents: finite(h?.bidCents,null),
    askCents: finite(h?.askCents,null),
    markNetPnlCents: finite(h?.markNetPnlCents,null),
    referencePnlCents: finite(h?.referencePnlCents,null),
  }])),
});

export function compactFeederSignalIntelRecord(r = {}) {
  const t=r.trajectory||{};
  const c=r.crashContext||null;
  return {
    version:r.version||FEEDER_SIGNAL_INTELLIGENCE.version,
    feederId:r.feederId||null,feederConcept:r.feederConcept||null,ticker:r.ticker||null,eventTicker:r.eventTicker||null,
    marketTitle:r.marketTitle||null,sourceEpisodeId:r.sourceEpisodeId||null,release:r.release||null,mode:r.mode||null,
    signalAtMs:finite(r.signalAtMs,null),coverageStartedAtMs:finite(r.coverageStartedAtMs,null),coverageGapBeforeTelemetryMs:finite(r.coverageGapBeforeTelemetryMs,null),
    trajectoryCoverage:r.trajectoryCoverage||'unknown',trackingComplete:Boolean(r.trackingComplete),completedAtMs:finite(r.completedAtMs,null),
    finalResult:r.finalResult||null,finalPriceCents:finite(r.finalPriceCents,null),updatedAtMs:finite(r.updatedAtMs,null),
    economics:r.economics||null,signalContext:r.signalContext||null,
    crashContext:c?{
      version:c.version||null,episodeId:c.episodeId||null,episodeIndex:finite(c.episodeIndex,null),sport:c.sport||'Unknown',
      preCrashPeakCents:finite(c.preCrashPeakCents,null),troughCents:finite(c.troughCents,null),crashDepthCents:finite(c.crashDepthCents,null),
      reboundCentsAtSignal:finite(c.reboundCentsAtSignal,null),reclaimRateAtSignal:finite(c.reclaimRateAtSignal,null),
      stableObservationsAtSignal:finite(c.stableObservationsAtSignal,null),upwardTicksAtSignal:finite(c.upwardTicksAtSignal,null),
      lowerLowCountAtSignal:finite(c.lowerLowCountAtSignal,null),reboundLostCountAtSignal:finite(c.reboundLostCountAtSignal,null),
      troughAtMs:finite(c.troughAtMs,null),reboundConfirmedAtMs:finite(c.reboundConfirmedAtMs,null),trustScore:finite(c.trustScore,null),
    }:null,
    settingsSnapshot:r.settingsSnapshot||null,
    trajectory:{
      observationCount:finite(t.observationCount,0),storedObservationCount:finite(t.storedObservationCount,0),firstObservedAtMs:finite(t.firstObservedAtMs,null),lastObservedAtMs:finite(t.lastObservedAtMs,null),
      lastBidCents:finite(t.lastBidCents,null),lastAskCents:finite(t.lastAskCents,null),postSignalHighBidCents:finite(t.postSignalHighBidCents,null),postSignalHighAtMs:finite(t.postSignalHighAtMs,null),postSignalLowBidCents:finite(t.postSignalLowBidCents,null),postSignalLowAtMs:finite(t.postSignalLowAtMs,null),
      maxExtensionFromSignalAskCents:finite(t.maxExtensionFromSignalAskCents,null),maxDrawdownFromSignalAskCents:finite(t.maxDrawdownFromSignalAskCents,null),
      maxReferencePnlCents:finite(t.maxReferencePnlCents,null),minReferencePnlCents:finite(t.minReferencePnlCents,null),currentReferencePnlCents:finite(t.currentReferencePnlCents,null),
      maxNormalizedMarkPnlCents:finite(t.maxNormalizedMarkPnlCents,null),minNormalizedMarkPnlCents:finite(t.minNormalizedMarkPnlCents,null),currentNormalizedMarkPnlCents:finite(t.currentNormalizedMarkPnlCents,null),
      maxNormalizedExecutablePnlCents:finite(t.maxNormalizedExecutablePnlCents,null),minNormalizedExecutablePnlCents:finite(t.minNormalizedExecutablePnlCents,null),currentNormalizedExecutablePnlCents:finite(t.currentNormalizedExecutablePnlCents,null),
      fullDepthObservationCount:finite(t.fullDepthObservationCount,0),bookObservationCount:finite(t.bookObservationCount,0),fullDepthRate:finite(t.fullDepthRate,null),
      averageSpreadCents:finite(t.averageSpreadCents,null),spreadMaxCents:finite(t.spreadMaxCents,null),upMoves:finite(t.upMoves,0),downMoves:finite(t.downMoves,0),flatMoves:finite(t.flatMoves,0),directionChanges:finite(t.directionChanges,0),maxConsecutiveUp:finite(t.maxConsecutiveUp,0),maxConsecutiveDown:finite(t.maxConsecutiveDown,0),
      fellBelowSignal:Boolean(t.fellBelowSignal),fellBelowReferenceOrigin:Boolean(t.fellBelowReferenceOrigin),newLowBelowCrashTrough:Boolean(t.newLowBelowCrashTrough),
      checkpoints:t.checkpoints||{},
      referenceProfitMilestones:Object.fromEntries(Object.entries(t.referenceProfitMilestones||{}).map(([k,m])=>[k,compactMilestone(m)])),
    },
    linkedHunters:Array.isArray(r.linkedHunters)?r.linkedHunters:[],
  };
}

function diagnosticPriority(r={}){
  const linked=Array.isArray(r.linkedHunters)?r.linkedHunters.length:0;
  const milestones=Object.keys(r.trajectory?.referenceProfitMilestones||{}).length;
  return linked*1_000_000 + (r.trackingComplete?0:500_000) + (r.trajectoryCoverage==='causal_from_signal'?250_000:0) + milestones*10_000 + positive(r.updatedAtMs,0)/1e15;
}

export class FeederSignalIntel {
  constructor({db,market,getSettings,audit=async()=>{}}={}){
    this.db=db;this.market=market;this.getSettings=getSettings||(()=>({}));this.audit=audit;
    this.records=new Map();this.byTicker=new Map();this.dirty=new Set();
    // HF6/FSI1-P2: one global scheduler + one bounded batch writer replaces
    // hundreds of per-record timers and unbounded Promise.all persistence.
    this.persistTimer=null;this.persistQueue=[];this.persistQueued=new Set();this.persistPromises=new Map();this.persistWaiters=new Map();this.persistWorkerPromise=null;
    this.persistActive=0;this.totalPersistBatches=0;this.totalPersistedRecords=0;this.totalPersistFailures=0;this.totalPersistCoalesced=0;this.maxObservedPersistActive=0;this.maxObservedDirty=0;
    this.healthy=true;this.lastError=null;
    this.maximumObservationsPerSignal=FEEDER_SIGNAL_INTELLIGENCE.maximumObservationsPerSignal;
  }
  index(state){
    if(!state?.feederId||!state.ticker)return;
    if(Array.isArray(state.observations)&&state.observations.length>this.maximumObservationsPerSignal){
      state.observations=compactObservations(state.observations,this.maximumObservationsPerSignal);
      if(state.trajectory&&typeof state.trajectory==='object')state.trajectory.storedObservationCount=state.observations.length;
    }
    this.records.set(state.feederId,state);
    if(!state.trackingComplete){const set=this.byTicker.get(state.ticker)||new Set();set.add(state.feederId);this.byTicker.set(state.ticker,set);}
  }
  evictCompleted(id){
    const key=String(id||''),state=this.records.get(key);if(!state?.trackingComplete)return false;
    this.dirty.delete(key);this.persistQueued.delete(key);
    const set=this.byTicker.get(state.ticker);set?.delete(key);if(set&&set.size===0)this.byTicker.delete(state.ticker);
    this.records.delete(key);return true;
  }
  resourceSnapshot(){
    return{
      activeRecords:this.records.size,activeTickers:this.byTicker.size,dirty:this.dirty.size,
      persisting:this.persistActive,persistTimers:this.persistTimer?1:0,persistenceQueue:this.persistQueue.length,
      persistenceBatchSize:FEEDER_SIGNAL_INTELLIGENCE.persistenceBatchSize,
      maximumPersistenceConcurrency:FEEDER_SIGNAL_INTELLIGENCE.maximumPersistenceConcurrency,
      persistenceRevision:FEEDER_SIGNAL_INTELLIGENCE.persistenceRevision,
      totalPersistBatches:this.totalPersistBatches,totalPersistedRecords:this.totalPersistedRecords,totalPersistFailures:this.totalPersistFailures,
      totalPersistCoalesced:this.totalPersistCoalesced,maxObservedPersistActive:this.maxObservedPersistActive,maxObservedDirty:this.maxObservedDirty,
      maximumObservationsPerSignal:this.maximumObservationsPerSignal,normalMaximumObservationsPerSignal:FEEDER_SIGNAL_INTELLIGENCE.maximumObservationsPerSignal,
      observationRetentionPolicy:FEEDER_SIGNAL_INTELLIGENCE.observationRetentionPolicy,
      retainedObservationSamples:[...this.records.values()].reduce((sum,r)=>sum+(Array.isArray(r?.observations)?r.observations.length:0),0),completedEvicted:true,
    };
  }
  async init(){
    try{
      const rows=await this.db.feederSignalIntel?.(this.getSettings().systemName,{limit:5000,trackingComplete:false})||[];
      for(const row of rows){const state=row.state&&typeof row.state==='object'?row.state:null;if(state?.version===FEEDER_SIGNAL_INTELLIGENCE.version&&!state.trackingComplete)this.index(state);}
      const open=await this.db.openEntries(this.getSettings().systemName).catch(()=>[]);
      for(const entry of open.filter((e)=>ACTIVE_FEEDER_CONCEPTS.has(e.conceptName)))await this.register(entry,{backfill:true});
      return this.summary();
    }catch(e){this.healthy=false;this.lastError=String(e?.message||e);await this.audit('feeder_signal_intel_init_error',{message:this.lastError}).catch(()=>{});return this.summary();}
  }
  async register(entry,{backfill=false}={}){
    if(!entry?.id||!ACTIVE_FEEDER_CONCEPTS.has(entry.conceptName))return null;
    const existing=this.records.get(String(entry.id));if(existing)return existing;
    const q=this.market?.getQuote?.(entry.ticker)||null;
    const state=createFeederSignalIntelState(entry,q,this.getSettings(),Date.now());if(!state)return null;
    if(backfill&&state.coverageGapBeforeTelemetryMs>5_000)state.trajectoryCoverage='partial_from_upgrade';
    this.index(state);if(q)applyFeederSignalObservation(state,q,this.market,Date.now(),this.maximumObservationsPerSignal);
    this.markDirty(state.feederId);this.schedulePersist();
    // FSI has no decision authority: durability is asynchronous and may never
    // block feeder creation or Hunter evaluation.
    return state;
  }
  markDirty(id){if(!id)return;this.dirty.add(String(id));this.maxObservedDirty=Math.max(this.maxObservedDirty,this.dirty.size);}
  observeQuote(q,now=Date.now()){
    const ids=[...(this.byTicker.get(String(q?.ticker||''))||[])];
    for(const id of ids){
      const state=this.records.get(id);if(!state)continue;
      try{
        const out=applyFeederSignalObservation(state,q,this.market,now,this.maximumObservationsPerSignal);this.markDirty(id);this.schedulePersist();
        if(out.final){const set=this.byTicker.get(state.ticker);set?.delete(id);if(set&&set.size===0)this.byTicker.delete(state.ticker);}
      }catch(e){this.healthy=false;this.lastError=String(e?.message||e);void this.audit('feeder_signal_intel_observation_error',{feederId:id,ticker:q?.ticker,message:this.lastError}).catch(()=>{});}
    }
  }
  compactForMemoryPressure(limit=FEEDER_SIGNAL_INTELLIGENCE.pressureObservationsPerSignal){
    const cap=Math.max(16,Math.min(FEEDER_SIGNAL_INTELLIGENCE.maximumObservationsPerSignal,Math.floor(Number(limit)||FEEDER_SIGNAL_INTELLIGENCE.pressureObservationsPerSignal)));
    this.maximumObservationsPerSignal=cap;
    let compactedRecords=0,removedSamples=0;
    for(const state of this.records.values()){
      if(!Array.isArray(state?.observations)||state.observations.length<=cap)continue;
      const before=state.observations.length;
      state.observations=compactObservations(state.observations,cap);
      if(state.trajectory&&typeof state.trajectory==='object')state.trajectory.storedObservationCount=state.observations.length;
      compactedRecords++;removedSamples+=Math.max(0,before-state.observations.length);
    }
    return {limit:cap,compactedRecords,removedSamples,records:this.records.size};
  }
  restoreNormalObservationLimit(){
    this.maximumObservationsPerSignal=FEEDER_SIGNAL_INTELLIGENCE.maximumObservationsPerSignal;
    return this.maximumObservationsPerSignal;
  }

  schedulePersist(delayMs=FEEDER_SIGNAL_INTELLIGENCE.persistenceIntervalMs){
    if(!this.dirty.size||this.persistTimer)return;
    const delay=Math.max(0,Number(delayMs)||0);
    this.persistTimer=setTimeout(()=>{this.persistTimer=null;this.queueDirtySnapshot();},delay);
    this.persistTimer.unref?.();
  }
  queueDirtySnapshot(){
    for(const id of [...this.dirty])this.enqueuePersistId(id);
    this.startPersistWorker();
  }
  enqueuePersistId(id){
    const key=String(id||'');if(!key||!this.records.has(key))return false;
    if(this.persistQueued.has(key)||this.persistPromises.has(key)){this.totalPersistCoalesced++;return false;}
    this.persistQueued.add(key);this.persistQueue.push(key);return true;
  }
  addPersistWaiter(id,targetUpdatedAt){
    const key=String(id),target=Number(targetUpdatedAt||0);
    return new Promise((resolve)=>{const list=this.persistWaiters.get(key)||[];list.push({target,resolve});this.persistWaiters.set(key,list);});
  }
  resolvePersistWaiters(id,success,persistedUpdatedAt=Infinity){
    const key=String(id),list=this.persistWaiters.get(key)||[];if(!list.length)return;
    const keep=[];
    for(const waiter of list){if(!success||waiter.target<=persistedUpdatedAt)waiter.resolve(Boolean(success));else keep.push(waiter);}
    if(keep.length)this.persistWaiters.set(key,keep);else this.persistWaiters.delete(key);
  }
  async persistBatch(ids){
    const batch=[];
    for(const id of ids){
      this.persistQueued.delete(id);
      const state=this.records.get(id);if(!state){this.resolvePersistWaiters(id,false);continue;}
      this.dirty.delete(id);
      const snapshot=structuredClone(state),persistedUpdatedAt=Number(snapshot.updatedAtMs||Date.now());
      batch.push({id,state:snapshot,persistedUpdatedAt,row:{feederId:snapshot.feederId,systemName:snapshot.systemName,conceptName:snapshot.feederConcept,ticker:snapshot.ticker,eventTicker:snapshot.eventTicker,sourceEpisodeId:snapshot.sourceEpisodeId,signalAtMs:snapshot.signalAtMs,coverageStartedAtMs:snapshot.coverageStartedAtMs,state:snapshot,updatedAtMs:persistedUpdatedAt}});
    }
    if(!batch.length)return true;
    this.persistActive++;this.maxObservedPersistActive=Math.max(this.maxObservedPersistActive,this.persistActive);this.totalPersistBatches++;
    const writePromise=(async()=>{
      if(typeof this.db?.saveFeederSignalIntelBatch==='function')await this.db.saveFeederSignalIntelBatch(batch.map((x)=>x.row));
      else if(typeof this.db?.saveFeederSignalIntel==='function')for(const item of batch)await this.db.saveFeederSignalIntel(item.row);
      else return false;
      return true;
    })();
    for(const item of batch)this.persistPromises.set(item.id,writePromise);
    try{
      const ok=await writePromise;if(ok===false)throw new Error('feeder signal persistence unavailable');
      this.healthy=true;this.lastError=null;this.totalPersistedRecords+=batch.length;
      for(const item of batch){
        const current=this.records.get(item.id);
        if(Number(current?.updatedAtMs||0)>item.persistedUpdatedAt)this.markDirty(item.id);
        this.resolvePersistWaiters(item.id,true,item.persistedUpdatedAt);
        if(current?.trackingComplete===true&&Number(current.updatedAtMs||0)<=item.persistedUpdatedAt)this.evictCompleted(item.id);
      }
      return true;
    }catch(e){
      this.healthy=false;this.lastError=String(e?.message||e);this.totalPersistFailures++;
      for(const item of batch){this.markDirty(item.id);this.resolvePersistWaiters(item.id,false,item.persistedUpdatedAt);}
      await this.audit('feeder_signal_intel_persist_error',{feederIds:batch.map((x)=>x.id).slice(0,50),count:batch.length,message:this.lastError}).catch(()=>{});
      return false;
    }finally{
      for(const item of batch)if(this.persistPromises.get(item.id)===writePromise)this.persistPromises.delete(item.id);
      this.persistActive=Math.max(0,this.persistActive-1);
      // A force waiter that arrived while this batch was in flight may target
      // a newer in-memory version. Requeue that ID immediately behind the
      // current batch rather than making an operator/shutdown flush wait for
      // the normal one-second cadence.
      for(const item of batch)if(this.dirty.has(item.id)&&this.persistWaiters.has(item.id))this.enqueuePersistId(item.id);
    }
  }
  startPersistWorker(){
    if(this.persistWorkerPromise||!this.persistQueue.length)return this.persistWorkerPromise;
    this.persistWorkerPromise=(async()=>{
      while(this.persistQueue.length){
        const ids=this.persistQueue.splice(0,FEEDER_SIGNAL_INTELLIGENCE.persistenceBatchSize);
        const ok=await this.persistBatch(ids);
        if(!ok)break; // fail cool; do not hammer a saturated/unavailable DB
      }
    })().finally(()=>{
      this.persistWorkerPromise=null;
      if(this.persistQueue.length||this.dirty.size)this.schedulePersist(this.healthy?FEEDER_SIGNAL_INTELLIGENCE.persistenceIntervalMs:FEEDER_SIGNAL_INTELLIGENCE.persistenceFailureRetryMs);
    });
    return this.persistWorkerPromise;
  }
  persist(id,force=false){
    if(!this.db?.saveFeederSignalIntel&&!this.db?.saveFeederSignalIntelBatch)return Promise.resolve(false);
    const key=String(id||''),state=this.records.get(key);if(!state)return Promise.resolve(false);
    if(!force&&!this.dirty.has(key)&&!this.persistPromises.has(key)&&!this.persistQueued.has(key))return Promise.resolve(false);
    const target=Number(state.updatedAtMs||0),wait=this.addPersistWaiter(key,target);
    if(!this.persistPromises.has(key)){if(force)this.markDirty(key);this.enqueuePersistId(key);this.startPersistWorker();}
    return wait;
  }
  async flush(timeoutMs=2_000){
    if(this.persistTimer){clearTimeout(this.persistTimer);this.persistTimer=null;}
    const waitBounded=async(promise)=>{
      let timer=null;
      try{return Boolean(await Promise.race([promise,new Promise((r)=>{timer=setTimeout(()=>r(false),Math.max(0,timeoutMs));})]));}
      finally{if(timer)clearTimeout(timer);}
    };
    const ids=[...new Set([...this.dirty,...this.persistPromises.keys(),...this.persistQueued])];
    if(!ids.length){if(!this.persistWorkerPromise)return true;return waitBounded(this.persistWorkerPromise.then(()=>true));}
    // Build the whole flush cohort before starting the worker so a large
    // shutdown backlog is written in full batches instead of a first 1-row
    // query followed by N batches. Active IDs keep their current in-flight
    // write and receive a target-version waiter without duplication.
    const waits=[];
    for(const id of ids){
      const state=this.records.get(id);if(!state)continue;
      const target=Number(state.updatedAtMs||0);waits.push(this.addPersistWaiter(id,target));
      if(!this.persistPromises.has(id)){this.markDirty(id);this.enqueuePersistId(id);}
    }
    this.startPersistWorker();
    return waitBounded(Promise.all(waits).then((results)=>results.every(Boolean)));
  }
  summary(){const rows=[...this.records.values()];return {version:FEEDER_SIGNAL_INTELLIGENCE.version,healthy:this.healthy,lastError:this.lastError,...summarizeRecords(rows)};}
  async diagnostics({recordLimit=400}={}){
    // Diagnostics must observe current memory, not force a write storm before
    // reading. A normal bounded background drain is sufficient for durability.
    if(this.dirty.size)this.schedulePersist();
    const settings=this.getSettings();
    const rows=await this.db.feederSignalIntel?.(settings.systemName,{limit:5000,stripObservations:true})||[];
    const byId=new Map();
    for(const row of rows){const state=row.state;if(state?.version===FEEDER_SIGNAL_INTELLIGENCE.version)byId.set(String(state.feederId||row.feeder_id||''),state);}
    for(const state of this.records.values()){
      if(state?.version!==FEEDER_SIGNAL_INTELLIGENCE.version)continue;
      const key=String(state.feederId||''),prior=byId.get(key);
      if(!prior||Number(state.updatedAtMs||0)>=Number(prior.updatedAtMs||0)){
        // Diagnostics never need raw trajectory samples. Avoid cloning the
        // in-memory observation ring into a second large object graph merely to
        // strip it again at serialization time.
        const compact={...structuredClone({...state,observations:[]})};
        byId.set(key,compact);
      }
    }
    const records=[...byId.values()];
    const entries=typeof this.db.feederSignalLinkedHunters==='function'
      ? await this.db.feederSignalLinkedHunters(settings.systemName,{limit:20_000}).catch(()=>[])
      : await this.db.entries(settings.systemName,{limit:20_000,includeArchived:true}).catch(()=>[]);
    const huntersByTicker=new Map();
    for(const e of entries){if(!PORTFOLIO_CONCEPTS.has(e.conceptName))continue;const list=huntersByTicker.get(e.ticker)||[];list.push(e);huntersByTicker.set(e.ticker,list);}
    const enriched=records.map((r)=>{
      const linked=(huntersByTicker.get(r.ticker)||[]).filter((e)=>(e.sourceTradeId!=null&&String(e.sourceTradeId)===String(r.feederId))||(String(e.entryConfig?.crashRecoverySource?.cosmoSourceId||'')===String(r.feederId))||(r.sourceEpisodeId&&e.sourceFeeder===r.feederConcept&&String(e.sourceTradeId||'')===String(r.sourceEpisodeId))).map((e)=>({id:e.id,conceptName:e.conceptName,sourceFeeder:e.sourceFeeder,status:e.status,mode:e.mode,entryPriceCents:e.entryPriceCents,openedAtMs:e.openedAtMs,closedAtMs:e.closedAtMs,closeReason:e.closeReason,pnlCents:e.pnlCents,maeCents:e.maeCents,lowestPriceAfterEntryCents:e.lowestPriceAfterEntryCents,release:e.entryConfig?.release||null,profitAuthority:e.entryConfig?.profitAuthority||null,athena:e.entryConfig?.athena?{version:e.entryConfig.athena.version||null,brainHash:e.entryConfig.athena.brainHash||null,classification:e.entryConfig.athena.classification||null,confidence:e.entryConfig.athena.confidence||null,score:e.entryConfig.athena.score??null}:null}));
      return {...r,linkedHunters:linked};
    });
    const limit=Math.max(0,Math.min(1000,Math.floor(Number(recordLimit)||0)));
    const selected=[...enriched].sort((a,b)=>diagnosticPriority(b)-diagnosticPriority(a)||positive(b.updatedAtMs,0)-positive(a.updatedAtMs,0)).slice(0,limit).map(compactFeederSignalIntelRecord);
    return {version:FEEDER_SIGNAL_INTELLIGENCE.version,role:FEEDER_SIGNAL_INTELLIGENCE.role,executionAuthority:false,entryAuthority:false,athenaDecisionAuthority:false,analysisStakeCents:FEEDER_SIGNAL_INTELLIGENCE.analysisStakeCents,referenceProfitThresholdsCents:[...REFERENCE_PROFIT_THRESHOLDS_CENTS],horizonMs:[...HORIZONS_MS],summary:summarizeRecords(enriched),records:selected,recordsAvailable:enriched.length,recordsIncluded:selected.length,recordsOmitted:Math.max(0,enriched.length-selected.length),recordsCompact:true,rawObservationsIncluded:false,recordPriority:'linked_hunter_then_active_then_causal_then_milestones_then_recent'};
  }
}
