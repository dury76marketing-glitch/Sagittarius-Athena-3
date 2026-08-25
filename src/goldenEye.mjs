import { createHash } from 'node:crypto';
import { GOLDEN_EYE, PORTFOLIO_CONCEPTS } from './doctrine.mjs';

const n=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));

export function quantile(values=[], q=0.5){
  const a=(values||[]).map(Number).filter(Number.isFinite).sort((x,y)=>x-y);
  if(!a.length)return 0;
  const qq=clamp(Number(q)||0,0,1);
  const pos=(a.length-1)*qq,lo=Math.floor(pos),hi=Math.ceil(pos);
  if(lo===hi)return a[lo];
  const f=pos-lo;
  return a[lo]*(1-f)+a[hi]*f;
}

function boundedEpisodes(rows=[]){return (rows||[]).slice(-GOLDEN_EYE.maximumCatalogEpisodes);}
function boundedManualEpisodes(rows=[]){return (rows||[]).slice(-GOLDEN_EYE.maximumManualCatalogEpisodes);}
function episodeTime(e){return Math.max(0,n(e?.peakAtMs,n(e?.startedAtMs)));}
function collectiveTrainingEpisodes(state={}){
  return [...boundedEpisodes(state.naturalEpisodes),...boundedManualEpisodes(state.manualEpisodes)]
    .sort((a,b)=>episodeTime(a)-episodeTime(b));
}
function blankState(fingerprint=''){
  return {
    version:GOLDEN_EYE.version,
    policyRevision:GOLDEN_EYE.policyRevision,
    fingerprint,
    samples:0,
    naturalEpisodes:[],
    manualEpisodes:[],
    currentEpisode:null,
    lastSampleAtMs:0,
    lastSeenProfitCents:0,
    lastSignal:null,
    lastExecution:null,
    interventions:0,
    manualActions:0,
    manualBackfilledTrades:0,
    manualBackfillThroughMs:0,
    resets:0,
    discardedEpisodes:0,
    updatedAtMs:0,
  };
}

function normalizeEpisode(value){
  if(!value||typeof value!=='object')return null;
  const peakProfitCents=n(value.peakProfitCents,-1);
  const startedAtMs=n(value.startedAtMs,-1);
  const peakAtMs=n(value.peakAtMs,startedAtMs);
  const samples=Math.max(0,Math.floor(n(value.samples)));
  if(peakProfitCents<0||startedAtMs<0||peakAtMs<0||samples<0)return null;
  return {
    startedAtMs,
    peakAtMs,
    peakProfitCents,
    profitableCountAtPeak:Math.max(0,Math.floor(n(value.profitableCountAtPeak))),
    openCountAtPeak:Math.max(0,Math.floor(n(value.openCountAtPeak))),
    maxJumpCents:Math.max(0,n(value.maxJumpCents)),
    jumpObserved:value.jumpObserved!==false,
    samples,
    intervention:Boolean(value.intervention),
    interventionReason:value.interventionReason==null?null:String(value.interventionReason),
    signaled:Boolean(value.signaled),
    ...(value.endedAtMs==null?{}:{endedAtMs:Math.max(0,n(value.endedAtMs))}),
    ...(value.closeReason==null?{}:{closeReason:String(value.closeReason)}),
  };
}

function normalizeManualEpisode(value){
  const ep=normalizeEpisode(value);
  if(!ep)return null;
  const actionId=String(value?.manualActionId||'').trim();
  if(!actionId)return null;
  const ids=Array.isArray(value?.sourceEntryIds)?value.sourceEntryIds.map(String).filter(Boolean).slice(0,64):[];
  const tickers=Array.isArray(value?.sourceTickers)?value.sourceTickers.map(String).filter(Boolean).slice(0,64):[];
  return {
    ...ep,
    source:'manual_cashout',
    humanLabeled:true,
    manualActionId:actionId,
    realizedProfitCents:Math.max(0,n(value?.realizedProfitCents,ep.peakProfitCents)),
    preClickSeenProfitCents:Math.max(0,n(value?.preClickSeenProfitCents)),
    sourceEntryIds:ids,
    sourceTickers:tickers,
    backfilled:Boolean(value?.backfilled),
    allProfitable:value?.allProfitable!==false,
  };
}

function legacyRevisionSupported(value){
  return value?.version===GOLDEN_EYE.version&&['GE1-R1',GOLDEN_EYE.policyRevision].includes(String(value?.policyRevision||''));
}

function normalizeGoldenEyeState(value,fingerprint='',nowMs=Date.now()){
  if(!value||typeof value!=='object'||!legacyRevisionSupported(value))return blankState(fingerprint);
  if(fingerprint&&value.fingerprint&&String(value.fingerprint)!==fingerprint)return blankState(fingerprint);
  const naturalEpisodes=boundedEpisodes((Array.isArray(value.naturalEpisodes)?value.naturalEpisodes:[]).map(normalizeEpisode).filter(Boolean));
  const manualEpisodes=boundedManualEpisodes((Array.isArray(value.manualEpisodes)?value.manualEpisodes:[]).map(normalizeManualEpisode).filter(Boolean));
  const currentEpisode=normalizeEpisode(value.currentEpisode);
  const lastSampleAtMs=Math.max(0,n(value.lastSampleAtMs));
  if(lastSampleAtMs>n(nowMs,Date.now())+GOLDEN_EYE.maximumFutureSampleSkewMs)return blankState(fingerprint);
  const lastSignal=value.lastSignal&&typeof value.lastSignal==='object'?structuredClone(value.lastSignal):null;
  const lastExecution=value.lastExecution&&typeof value.lastExecution==='object'?structuredClone(value.lastExecution):null;
  const normalized={
    ...blankState(fingerprint||String(value.fingerprint||'')),
    fingerprint:fingerprint||String(value.fingerprint||''),
    samples:Math.max(0,Math.floor(n(value.samples))),
    naturalEpisodes,
    manualEpisodes,
    currentEpisode,
    lastSampleAtMs,
    lastSeenProfitCents:Math.max(0,n(value.lastSeenProfitCents)),
    lastSignal,
    lastExecution,
    interventions:Math.max(0,Math.floor(n(value.interventions))),
    manualActions:Math.max(0,Math.floor(n(value.manualActions))),
    manualBackfilledTrades:Math.max(0,Math.floor(n(value.manualBackfilledTrades))),
    manualBackfillThroughMs:Math.max(0,n(value.manualBackfillThroughMs)),
    resets:Math.max(0,Math.floor(n(value.resets))),
    discardedEpisodes:Math.max(0,Math.floor(n(value.discardedEpisodes))),
    updatedAtMs:Math.max(0,n(value.updatedAtMs)),
  };
  // A persisted signal without the matching persisted execution is only an
  // observation receipt, not durable authority to suppress future attempts.
  if(normalized.currentEpisode?.signaled&&n(lastSignal?.atMs)>0&&n(lastExecution?.signalAtMs)!==n(lastSignal?.atMs)){
    normalized.currentEpisode={...normalized.currentEpisode,signaled:false};
  }
  return normalized;
}

export function goldenEyeFingerprint(settings={}){
  const keys=[
    'momentumStakeCents','waveStakeCents','recoveryBaseStakeCents','crashRecoveryStakeCents',
    'dragonRecoveryStakeCents','goldenDragonHunterStakeCents','simFeeCents','startingCapitalCents',
    'maxPositions','maxEntriesPerTrade',
  ];
  const body=keys.map((k)=>`${k}:${n(settings?.[k])}`).join('|');
  return createHash('sha256').update(body).digest('hex').slice(0,24);
}

export function buildManualTrainingEpisodes(rows=[], groupingMs=GOLDEN_EYE.manualBackfillGroupingMs){
  const clean=(rows||[])
    .filter((r)=>PORTFOLIO_CONCEPTS.has(r?.conceptName)&&String(r?.closeReason||'')==='manual_cashout'&&n(r?.closedAtMs)>0&&n(r?.pnlCents)>0)
    .sort((a,b)=>n(a.closedAtMs)-n(b.closedAtMs)||String(a.id||'').localeCompare(String(b.id||'')));
  const groups=[];
  for(const row of clean){
    const at=n(row.closedAtMs);
    let g=groups.at(-1);
    if(!g||at-n(g.lastAtMs)>groupingMs){
      g={firstAtMs:at,lastAtMs:at,rows:[]};groups.push(g);
    }
    g.rows.push(row);g.lastAtMs=Math.max(g.lastAtMs,at);
  }
  return groups.map((g)=>{
    const ids=g.rows.map((r)=>String(r.id||'')).filter(Boolean).sort();
    const tickers=g.rows.map((r)=>String(r.ticker||'')).filter(Boolean).sort();
    const realized=g.rows.reduce((sum,r)=>sum+Math.max(0,n(r.pnlCents)),0);
    const digest=createHash('sha256').update(ids.length?ids.join('|'):`${g.firstAtMs}|${tickers.join('|')}|${realized}`).digest('hex').slice(0,16);
    return {
      startedAtMs:g.firstAtMs,peakAtMs:g.firstAtMs,endedAtMs:g.lastAtMs,
      peakProfitCents:realized,realizedProfitCents:realized,preClickSeenProfitCents:0,
      profitableCountAtPeak:g.rows.length,openCountAtPeak:g.rows.length,maxJumpCents:0,jumpObserved:false,samples:1,
      intervention:true,interventionReason:'manual_cashout',signaled:false,closeReason:'manual_cashout_training',
      source:'manual_cashout',humanLabeled:true,manualActionId:`manual-backfill-${g.firstAtMs}-${digest}`,
      sourceEntryIds:ids.slice(0,64),sourceTickers:tickers.slice(0,64),backfilled:true,allProfitable:true,
    };
  }).filter((e)=>e.peakProfitCents>=GOLDEN_EYE.minimumManualTrainingProfitCents);
}

export function goldenEyeStats(state={}){
  const natural=boundedEpisodes(state.naturalEpisodes);
  const manual=boundedManualEpisodes(state.manualEpisodes);
  const eps=collectiveTrainingEpisodes({naturalEpisodes:natural,manualEpisodes:manual});
  const peaks=eps.map((e)=>n(e.peakProfitCents)).filter((x)=>x>0);
  const jumps=eps.filter((e)=>e.jumpObserved!==false).map((e)=>n(e.maxJumpCents)).filter((x)=>x>=0);
  const manualPeaks=manual.map((e)=>n(e.peakProfitCents)).filter((x)=>x>0);
  return {
    episodeCount:eps.length,
    naturalEpisodeCount:natural.length,
    manualEpisodeCount:manual.length,
    peakP50Cents:quantile(peaks,.50),
    peakP75Cents:quantile(peaks,.75),
    peakP90Cents:quantile(peaks,.90),
    maxHistoricalPeakCents:peaks.length?Math.max(...peaks):0,
    manualPeakP50Cents:quantile(manualPeaks,.50),
    manualPeakP75Cents:quantile(manualPeaks,.75),
    jumpP50Cents:quantile(jumps,.50),
    jumpP75Cents:quantile(jumps,.75),
  };
}

function startEpisode(sample){
  return {
    startedAtMs:sample.atMs,
    peakAtMs:sample.atMs,
    peakProfitCents:sample.seenProfitCents,
    profitableCountAtPeak:sample.profitableCount,
    openCountAtPeak:sample.openCount,
    maxJumpCents:Math.max(0,n(sample.jumpCents)),
    samples:1,
    intervention:false,
    interventionReason:null,
    signaled:false,
  };
}

function finalizeEpisode(state,reason,atMs){
  const ep=state.currentEpisode;
  if(!ep)return {state,episode:null};
  const eligible=!ep.intervention
    && n(ep.peakProfitCents)>=GOLDEN_EYE.minimumCatalogPeakProfitCents
    && n(ep.samples)>=GOLDEN_EYE.minimumEpisodeSamples;
  const episode={...ep,endedAtMs:atMs,closeReason:reason};
  const next={...state,currentEpisode:null};
  if(eligible)next.naturalEpisodes=boundedEpisodes([...(state.naturalEpisodes||[]),episode]);
  return {state:next,episode:eligible?episode:null};
}

function discardCurrentEpisode(state,reason,atMs){
  if(!state.currentEpisode)return state;
  return {
    ...state,
    currentEpisode:null,
    lastSeenProfitCents:0,
    discardedEpisodes:n(state.discardedEpisodes)+1,
    updatedAtMs:atMs,
    lastDiscardedEpisode:{
      startedAtMs:n(state.currentEpisode.startedAtMs),
      peakProfitCents:n(state.currentEpisode.peakProfitCents),
      reason,
      discardedAtMs:atMs,
    },
  };
}

export function evaluateGoldenEyeSignal(state,sample){
  const stats=goldenEyeStats(state);
  if(!sample.isNewPeak)return {signal:false,reason:'not_new_peak',stats};
  if(state.currentEpisode?.intervention)return {signal:false,reason:'intervention_episode',stats};
  if(stats.episodeCount<GOLDEN_EYE.minimumCollectiveEpisodes)return {signal:false,reason:'learning',stats};
  const p=n(sample.seenProfitCents);
  if(p<GOLDEN_EYE.minimumSignalProfitCents)return {signal:false,reason:'below_minimum_profit',stats};

  const peaks=collectiveTrainingEpisodes(state).map((e)=>n(e.peakProfitCents)).filter((x)=>x>0);
  const extensionTarget=Math.max(GOLDEN_EYE.minimumExtensionCents,Math.round(p*GOLDEN_EYE.extensionRatio));
  const crossed=peaks.filter((x)=>x>=p).length;
  const extended=peaks.filter((x)=>x>=p+extensionTarget).length;
  const extensionProbability=crossed>0?extended/crossed:null;
  const currentJump=Math.max(0,n(sample.jumpCents));
  const novelExtreme=stats.maxHistoricalPeakCents>0&&p>=stats.maxHistoricalPeakCents*GOLDEN_EYE.novelHighMultiplier;
  const upperPeak=p>=stats.peakP90Cents&&stats.peakP90Cents>0;
  const strongJump=currentJump>=Math.max(GOLDEN_EYE.minimumJumpCents,stats.jumpP50Cents);
  const comparableExhaustion=crossed>=GOLDEN_EYE.minimumComparableEpisodes
    &&extensionProbability!=null
    &&extensionProbability<=GOLDEN_EYE.maximumExtensionProbability;
  const upperQuartileJump=p>=stats.peakP75Cents&&stats.peakP75Cents>0&&strongJump;

  if(comparableExhaustion){
    return {signal:true,reason:'catalog_extension_exhaustion',stats,extensionTargetCents:extensionTarget,crossed,extended,extensionProbability};
  }
  // Never let a generic upper-tail/jump heuristic override mature historical
  // evidence that this exact profit level commonly extends materially higher.
  if(crossed>=GOLDEN_EYE.minimumComparableEpisodes&&extensionProbability!=null&&extensionProbability>GOLDEN_EYE.maximumExtensionProbability){
    return {signal:false,reason:'continuation_still_supported',stats,extensionTargetCents:extensionTarget,crossed,extended,extensionProbability};
  }
  if(novelExtreme&&strongJump){
    return {signal:true,reason:'novel_catalog_high_jump',stats,extensionTargetCents:extensionTarget,crossed,extended,extensionProbability};
  }
  if(upperPeak&&currentJump>=GOLDEN_EYE.minimumJumpCents){
    return {signal:true,reason:'upper_peak_jump',stats,extensionTargetCents:extensionTarget,crossed,extended,extensionProbability};
  }
  if(upperQuartileJump&&currentJump>=stats.jumpP75Cents&&stats.jumpP75Cents>0){
    return {signal:true,reason:'catalog_peak_jump_signature',stats,extensionTargetCents:extensionTarget,crossed,extended,extensionProbability};
  }
  return {signal:false,reason:'continuation_still_supported',stats,extensionTargetCents:extensionTarget,crossed,extended,extensionProbability};
}

function commitGoldenEyeSignal(state,sample,evalResult){
  const atMs=n(sample?.atMs);
  if(!evalResult?.signal||state.currentEpisode?.signaled||atMs-n(state.lastSignal?.atMs)<GOLDEN_EYE.minimumSignalSpacingMs){
    return {state,signal:null};
  }
  const signal={
    version:GOLDEN_EYE.version,
    policyRevision:GOLDEN_EYE.policyRevision,
    atMs,
    seenProfitCents:n(sample.seenProfitCents),
    profitableCount:n(sample.profitableCount),
    openCount:n(sample.openCount),
    freshCount:n(sample.freshCount),
    fullyExecutableProfitableCount:n(sample.fullyExecutableProfitableCount),
    jumpCents:n(sample.jumpCents),
    reason:evalResult.reason,
    extensionProbability:evalResult.extensionProbability,
    extensionTargetCents:evalResult.extensionTargetCents,
    catalogEpisodes:evalResult.stats.episodeCount,
    peakP75Cents:evalResult.stats.peakP75Cents,
    peakP90Cents:evalResult.stats.peakP90Cents,
  };
  return {
    state:{...state,lastSignal:signal,currentEpisode:{...state.currentEpisode,signaled:true}},
    signal,
  };
}

export function advanceGoldenEyeState(inputState,sample,fingerprint='',nowMs=Date.now()){
  const atMs=n(sample?.atMs);
  const now=n(nowMs,Date.now());
  if(atMs<=0||!Number.isFinite(atMs))throw new Error('GoldenEye sample timestamp must be finite and positive');
  let state=inputState&&inputState.version===GOLDEN_EYE.version?structuredClone(inputState):blankState(fingerprint);
  if(state.policyRevision!==GOLDEN_EYE.policyRevision)state=blankState(fingerprint);
  if(fingerprint&&state.fingerprint&&state.fingerprint!==fingerprint){
    state={...blankState(fingerprint),resets:n(state.resets)+1};
  }else if(fingerprint&&!state.fingerprint)state.fingerprint=fingerprint;

  if(sample?.complete===false){
    return {state,signal:null,ignored:'incomplete_market_coverage',finalized:null};
  }
  if(atMs>now+GOLDEN_EYE.maximumFutureSampleSkewMs){
    return {state,signal:null,ignored:'future_sample',finalized:null};
  }
  if(state.lastSampleAtMs&&atMs<state.lastSampleAtMs){
    const regression=state.lastSampleAtMs-atMs;
    return {state,signal:null,ignored:regression>GOLDEN_EYE.maximumClockRegressionMs?'clock_regression':'out_of_order_sample',finalized:null};
  }

  let finalized=null;
  if(state.lastSampleAtMs&&atMs-state.lastSampleAtMs>GOLDEN_EYE.maximumContinuousSampleGapMs){
    state=discardCurrentEpisode(state,'sample_gap',atMs);
    state.lastSampleAtMs=0;
    state.lastSeenProfitCents=0;
  }

  const seen=Math.max(0,n(sample.seenProfitCents));
  const previous=Math.max(0,n(state.lastSeenProfitCents));
  const jump=state.lastSampleAtMs?seen-previous:0;
  const enriched={...sample,seenProfitCents:seen,jumpCents:jump};
  state.samples=n(state.samples)+1;
  state.lastSampleAtMs=atMs;
  state.lastSeenProfitCents=seen;

  if(seen<=0){
    const f=finalizeEpisode(state,'profit_zero',atMs);state=f.state;finalized=f.episode;
    state.updatedAtMs=atMs;
    return {state,signal:null,finalized};
  }

  if(!state.currentEpisode){
    state.currentEpisode=startEpisode(enriched);
    // Fast peak windows can be a single executable book update. Once the
    // natural catalog is mature, the first positive sample of a new episode
    // is itself a valid new peak and must be eligible to fire immediately;
    // waiting for a second quote would recreate the exact 1-2 second miss
    // Golden Eye is designed to eliminate.
    const evalResult=evaluateGoldenEyeSignal(state,{...enriched,isNewPeak:true});
    const committed=commitGoldenEyeSignal(state,{...enriched,isNewPeak:true},evalResult);
    state=committed.state;
    state.updatedAtMs=atMs;
    return {state,signal:committed.signal,finalized:null,analysis:evalResult};
  }

  let ep={
    ...state.currentEpisode,
    samples:n(state.currentEpisode.samples)+1,
    maxJumpCents:Math.max(n(state.currentEpisode.maxJumpCents),Math.max(0,jump)),
  };
  const isNewPeak=seen>n(ep.peakProfitCents);
  if(isNewPeak){
    ep.peakProfitCents=seen;
    ep.peakAtMs=atMs;
    ep.profitableCountAtPeak=n(sample.profitableCount);
    ep.openCountAtPeak=n(sample.openCount);
  }
  state.currentEpisode=ep;

  const drawdown=n(ep.peakProfitCents)-seen;
  const drawdownThreshold=Math.max(GOLDEN_EYE.episodeDrawdownMinimumCents,Math.round(n(ep.peakProfitCents)*GOLDEN_EYE.episodeDrawdownRatio));
  if(drawdown>=drawdownThreshold){
    const f=finalizeEpisode(state,'local_peak_drawdown',atMs);state=f.state;finalized=f.episode;
    state.currentEpisode=startEpisode(enriched);
    state.updatedAtMs=atMs;
    return {state,signal:null,finalized};
  }

  const evalResult=evaluateGoldenEyeSignal(state,{...enriched,isNewPeak});
  const committed=commitGoldenEyeSignal(state,{...enriched,isNewPeak},evalResult);
  state=committed.state;
  state.updatedAtMs=atMs;
  return {state,signal:committed.signal,finalized,analysis:evalResult};
}

export class GoldenEye{
  constructor({db,market,getSettings,audit}={}){
    this.db=db;
    this.market=market;
    this.getSettings=getSettings;
    this.audit=audit;
    this.state=blankState('');
    this.lastPersistAtMs=0;
    this.initialized=false;
    this.healthy=true;
    this.lastError=null;
  }

  recordError(error){
    this.healthy=false;
    this.lastError=String(error?.message||error||'golden_eye_error');
  }

  clearError(){this.healthy=true;this.lastError=null;}

  async init(){
    const settings=this.getSettings?.()||{};
    const fingerprint=goldenEyeFingerprint(settings);
    try{
      const stored=await this.db.goldenEyeState(settings.systemName);
      this.state=normalizeGoldenEyeState(stored?.state,fingerprint,Date.now());
      await this.backfillManualTraining();
      this.initialized=true;
      await this.persist(true);
      this.clearError();
      return this.summary();
    }catch(error){
      this.recordError(error);
      throw error;
    }
  }

  async backfillManualTraining(){
    if(typeof this.db?.manualCashoutTrainingRows!=='function')return {rows:0,episodes:0};
    const settings=this.getSettings?.()||{};
    const afterMs=Math.max(0,n(this.state.manualBackfillThroughMs));
    const rows=await this.db.manualCashoutTrainingRows(settings.systemName,{afterMs,limit:5000});
    if(!Array.isArray(rows)||!rows.length)return {rows:0,episodes:0};
    const episodes=buildManualTrainingEpisodes(rows);
    const existing=new Set((this.state.manualEpisodes||[]).map((e)=>String(e.manualActionId||'')));
    let added=0;
    for(const episode of episodes){
      if(existing.has(episode.manualActionId))continue;
      this.state.manualEpisodes=boundedManualEpisodes([...(this.state.manualEpisodes||[]),episode]);
      existing.add(episode.manualActionId);added+=1;
    }
    const maxClosedAtMs=Math.max(afterMs,...rows.map((r)=>n(r.closedAtMs)));
    this.state.manualBackfillThroughMs=maxClosedAtMs;
    this.state.manualBackfilledTrades=n(this.state.manualBackfilledTrades)+rows.filter((r)=>n(r.pnlCents)>0).length;
    this.state.updatedAtMs=Date.now();
    if(added>0)await this.audit?.('golden_eye_manual_training_backfill',{rows:rows.length,episodesAdded:added,manualEpisodes:this.state.manualEpisodes.length,collectiveEpisodes:goldenEyeStats(this.state).episodeCount,throughMs:maxClosedAtMs});
    return {rows:rows.length,episodes:added};
  }

  entryProfit(entry,exec,settings){
    const remaining=Math.max(0,n(entry.remainingCount,n(entry.count)));
    const filled=Math.max(0,Math.min(remaining,n(exec?.filled)));
    if(filled<=0)return 0;
    const original=Math.max(0,n(entry.count));
    const totalEntryFee=n(entry.entryFeeCents)>0?n(entry.entryFeeCents):n(settings.simFeeCents)*original;
    const allocatedEntryFee=original>0?totalEntryFee*(filled/original):0;
    const exitFee=n(settings.simFeeCents)*filled;
    return (n(exec?.avgCents)-n(entry.entryPriceCents))*filled-allocatedEntryFee-exitFee;
  }

  sample(entries=[],atMs=Date.now()){
    const settings=this.getSettings?.()||{};
    let seenProfitCents=0,profitableCount=0,freshCount=0,openCount=0,observableCount=0,fullyExecutableProfitableCount=0;
    const profitableEntryIds=[];
    for(const e of entries||[]){
      if(!PORTFOLIO_CONCEPTS.has(e.conceptName)||e.status!=='open')continue;
      openCount+=1;
      const q=this.market?.getQuote?.(e.ticker);
      const quoteAge=q?this.market.quoteAgeMs(e.ticker,atMs):Infinity;
      if(!q||quoteAge>GOLDEN_EYE.maximumSignalQuoteAgeMs||q.bookInvalid)continue;
      freshCount+=1;
      const remaining=Math.max(0,n(e.remainingCount,n(e.count)));
      if(remaining<=0){observableCount+=1;continue;}
      // If even the best current bid cannot yield positive net P&L, deeper bid
      // levels cannot make the position profitable. We can safely classify that
      // Hunter without requiring full sell depth. A potentially profitable
      // Hunter, however, must have a fresh full-position executable book or the
      // whole portfolio sample is incomplete and cannot train/signal.
      const optimistic=this.entryProfit(e,{filled:remaining,avgCents:n(q.yesBid)},settings);
      if(optimistic<=0){observableCount+=1;continue;}
      const bookAge=this.market.bookAgeMs?.(e.ticker,atMs)??Infinity;
      if(bookAge>GOLDEN_EYE.maximumSignalBookAgeMs)continue;
      const exec=this.market?.executableBid?.(e.ticker,remaining,1);
      if(!exec||!exec.full||n(exec.filled)+1e-9<remaining)continue;
      observableCount+=1;
      const pnl=this.entryProfit(e,exec,settings);
      if(pnl>0){
        seenProfitCents+=pnl;
        profitableCount+=1;
        fullyExecutableProfitableCount+=1;
        profitableEntryIds.push(e.id);
      }
    }
    const complete=observableCount===openCount;
    return {atMs,seenProfitCents,profitableCount,openCount,freshCount,observableCount,fullyExecutableProfitableCount,profitableEntryIds,complete};
  }

  async observe(entries=[],atMs=Date.now()){
    if(!this.initialized)await this.init();
    const settings=this.getSettings?.()||{};
    const fingerprint=goldenEyeFingerprint(settings);
    try{
      const sample=this.sample(entries,atMs);
      const out=advanceGoldenEyeState(this.state,sample,fingerprint,Date.now());
      this.state=out.state;
      if(out.finalized)await this.audit?.('golden_eye_episode_finalized',{
        peakProfitCents:out.finalized.peakProfitCents,
        maxJumpCents:out.finalized.maxJumpCents,
        reason:out.finalized.closeReason,
        catalogEpisodes:this.state.naturalEpisodes.length,
      });
      if(out.signal)await this.audit?.('golden_eye_signal',out.signal);
      await this.persist(Boolean(out.finalized||out.signal));
      this.clearError();
      return {...out,sample,summary:this.summary()};
    }catch(error){
      this.recordError(error);
      throw error;
    }
  }

  markIntervention(reason='manual_cashout',atMs=Date.now()){
    if(this.state.currentEpisode)this.state.currentEpisode={...this.state.currentEpisode,intervention:true,interventionReason:reason};
    this.state.interventions=n(this.state.interventions)+1;
    this.state.updatedAtMs=atMs;
  }

  async beginManualTraining(entries=[],atMs=Date.now(),{allProfitable=true}={}){
    if(!this.initialized)await this.init();
    const sample=this.sample(entries,atMs);
    const previous=Math.max(0,n(this.state.lastSeenProfitCents));
    const jump=this.state.lastSampleAtMs?Math.max(0,n(sample.seenProfitCents)-previous):0;
    const actionId=`manual-runtime-${atMs}-${createHash('sha256').update((entries||[]).map((e)=>String(e?.id||'')).sort().join('|')).digest('hex').slice(0,12)}`;
    this.markIntervention('manual_cashout',atMs);
    await this.persist(true);
    return {actionId,atMs,allProfitable:Boolean(allProfitable),sample:{...sample,jumpCents:jump}};
  }

  async completeManualTraining(context,result,atMs=Date.now()){
    const acted=[...(result?.closed||[]),...(result?.partial||[])];
    const realized=Math.max(0,n(result?.totalProfitCents));
    if(acted.length>0&&realized>=GOLDEN_EYE.minimumManualTrainingProfitCents){
      const sample=context?.sample||{};
      const sourceIds=acted.map((x)=>String(x?.id||'')).filter(Boolean).sort();
      const sourceTickers=acted.map((x)=>String(x?.ticker||'')).filter(Boolean).sort();
      const episode={
        startedAtMs:n(context?.atMs,atMs),peakAtMs:n(context?.atMs,atMs),endedAtMs:atMs,
        peakProfitCents:Math.max(realized,Math.max(0,n(sample.seenProfitCents))),
        realizedProfitCents:realized,preClickSeenProfitCents:Math.max(0,n(sample.seenProfitCents)),
        profitableCountAtPeak:Math.max(acted.length,n(sample.profitableCount)),openCountAtPeak:Math.max(acted.length,n(sample.openCount)),
        maxJumpCents:Math.max(0,n(sample.jumpCents)),jumpObserved:Boolean(sample.complete),samples:1,
        intervention:true,interventionReason:'manual_cashout',signaled:false,closeReason:'manual_cashout_training',
        source:'manual_cashout',humanLabeled:true,manualActionId:String(context?.actionId||`manual-runtime-${atMs}`),
        sourceEntryIds:sourceIds.slice(0,64),sourceTickers:sourceTickers.slice(0,64),backfilled:false,allProfitable:context?.allProfitable!==false,
      };
      const existing=new Set((this.state.manualEpisodes||[]).map((e)=>String(e.manualActionId||'')));
      if(!existing.has(episode.manualActionId))this.state.manualEpisodes=boundedManualEpisodes([...(this.state.manualEpisodes||[]),episode]);
      this.state.manualActions=n(this.state.manualActions)+1;
      this.state.manualBackfillThroughMs=Math.max(n(this.state.manualBackfillThroughMs),atMs);
      await this.audit?.('golden_eye_manual_training_label',{manualActionId:episode.manualActionId,realizedProfitCents:realized,preClickSeenProfitCents:episode.preClickSeenProfitCents,closedCount:n(result?.closedCount),partialCount:n(result?.partialCount),manualEpisodes:this.state.manualEpisodes.length,collectiveEpisodes:goldenEyeStats(this.state).episodeCount});
    }
    this.state.currentEpisode=null;
    this.state.lastSeenProfitCents=0;
    this.state.lastSampleAtMs=0;
    this.state.updatedAtMs=atMs;
    await this.persist(true);
    return this.summary();
  }

  async noteExecution(signal,result,atMs=Date.now()){
    const acted=n(result?.closedCount)+n(result?.partialCount)+n(result?.pendingCount);
    if(acted>0){
      // The portfolio composition changed because Golden Eye acted. Censor the
      // pre-action episode, then start the residual portfolio from a clean
      // baseline on the next observation instead of suppressing future signals.
      this.state.interventions=n(this.state.interventions)+1;
      this.state.currentEpisode=null;
      this.state.lastSeenProfitCents=0;
      this.state.lastSampleAtMs=0;
    }else if(this.state.currentEpisode){
      // A signal that could not execute is not an intervention. Re-arm the
      // current episode so a later fresh executable peak can retry.
      this.state.currentEpisode={...this.state.currentEpisode,signaled:false};
      this.state.lastSignal=null;
    }
    this.state.lastExecution={
      atMs,
      signalAtMs:n(signal?.atMs),
      seenProfitCents:n(signal?.seenProfitCents),
      closedCount:n(result?.closedCount),
      partialCount:n(result?.partialCount),
      pendingCount:n(result?.pendingCount),
      skippedCount:n(result?.skippedCount),
      errorCount:n(result?.errorCount),
      totalProfitCents:n(result?.totalProfitCents),
    };
    this.state.updatedAtMs=atMs;
    await this.persist(true);
  }

  async persist(force=false){
    const now=Date.now();
    if(!force&&now-this.lastPersistAtMs<GOLDEN_EYE.persistenceIntervalMs)return false;
    const settings=this.getSettings?.()||{};
    try{
      await this.db.saveGoldenEyeState(settings.systemName,this.state);
      this.lastPersistAtMs=now;
      this.clearError();
      return true;
    }catch(error){
      this.recordError(error);
      throw error;
    }
  }

  summary(){
    const stats=goldenEyeStats(this.state);
    return {
      version:GOLDEN_EYE.version,
      policyRevision:GOLDEN_EYE.policyRevision,
      role:GOLDEN_EYE.role,
      learningAlwaysOn:true,
      enabled:this.getSettings?.()?.goldenEyeEnabled===true,
      liveEnabled:this.getSettings?.()?.goldenEyeLiveEnabled===true,
      healthy:this.healthy,
      lastError:this.lastError,
      ready:this.healthy&&stats.episodeCount>=GOLDEN_EYE.minimumCollectiveEpisodes,
      samples:n(this.state.samples),
      naturalEpisodes:stats.naturalEpisodeCount,
      manualEpisodes:stats.manualEpisodeCount,
      collectiveEpisodes:stats.episodeCount,
      currentSeenProfitCents:n(this.state.lastSeenProfitCents),
      currentEpisodePeakCents:n(this.state.currentEpisode?.peakProfitCents),
      lastSampleAtMs:n(this.state.lastSampleAtMs)||null,
      peakP50Cents:stats.peakP50Cents,
      peakP75Cents:stats.peakP75Cents,
      peakP90Cents:stats.peakP90Cents,
      maxHistoricalPeakCents:stats.maxHistoricalPeakCents,
      manualPeakP50Cents:stats.manualPeakP50Cents,
      manualPeakP75Cents:stats.manualPeakP75Cents,
      jumpP50Cents:stats.jumpP50Cents,
      jumpP75Cents:stats.jumpP75Cents,
      minimumNaturalEpisodes:GOLDEN_EYE.minimumNaturalEpisodes,
      minimumCollectiveEpisodes:GOLDEN_EYE.minimumCollectiveEpisodes,
      minimumComparableEpisodes:GOLDEN_EYE.minimumComparableEpisodes,
      maximumExtensionProbability:GOLDEN_EYE.maximumExtensionProbability,
      extensionRatio:GOLDEN_EYE.extensionRatio,
      lastSignal:this.state.lastSignal||null,
      lastExecution:this.state.lastExecution||null,
      fingerprint:this.state.fingerprint||null,
      resets:n(this.state.resets),
      interventions:n(this.state.interventions),
      manualActions:n(this.state.manualActions),
      manualBackfilledTrades:n(this.state.manualBackfilledTrades),
      manualBackfillThroughMs:n(this.state.manualBackfillThroughMs)||null,
      discardedEpisodes:n(this.state.discardedEpisodes),
    };
  }
}
