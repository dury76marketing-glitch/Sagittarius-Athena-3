import test from 'node:test';
import assert from 'node:assert/strict';
import { StrategyEngine, MODEL_ENABLE_KEYS, isModelEnabled, dragonSignalQualifiedAtQuote, goldenDragonSignalQualifiedAtQuote, goldenApprovalSnapshotQualified, goldenFeedContinuity, dragonRecoverySignalQualifiedAtQuote, goldenDragonHunterSignalQualifiedAtQuote, hunterEntryBoundaryQualifiedAtQuote } from '../src/strategy.mjs';
import { originalSettings, freshInstallSettings, sanitizeRuntimeSettings } from '../src/config.mjs';
import { FEEDER_CONCEPTS, PORTFOLIO_CONCEPTS, GOLDEN_FEED_BUS } from '../src/doctrine.mjs';
import { GameClockAuthority } from '../src/gameClock.mjs';
import { ProfitGuard } from '../src/profitGuard.mjs';

const settings=(overrides={})=>({
  ...originalSettings(), systemName:'SAGITTARIUS', ownerId:'dragon-test', mode:'SIMULATION', liveArmed:false,
  dragonEnabled:true, dragonReferenceStakeCents:3000, dragonMinSignalPriceCents:84, dragonMaxSignalPriceCents:88, dragonMaxEpisode:2,
  crashRecoveryMinCrashCents:15, crashRecoveryMinReboundCents:7, crashRecoveryMinReclaimRate:.40,
  crashRecoveryStableObservations:3, crashRecoveryUpwardTicks:2, maxSpreadCents:3,
  ...overrides,
});
const quote=(ticker='D',bid=85,ask=86)=>({ticker,title:ticker,eventTicker:ticker,yesBid:bid,yesAsk:ask,volume24h:10000,status:'active',result:'',updatedAtMs:Date.now()});
const signal=(overrides={})=>({version:'CI1',episodeId:'CRASH:D:1:1',episodeIndex:1,preCrashPeakCents:92,troughCents:70,crashDepthCents:22,reboundCents:15,reclaimRate:15/22,stableObservations:3,upwardTicks:2,crashStartedAtMs:1,troughAtMs:2,reboundConfirmedAtMs:3,sport:'Test',...overrides});
function db(){const rows=[];return{rows,audits:[],async entries(){return rows.map((x)=>structuredClone(x));},async insertEntry(e){rows.push(structuredClone(e));},async audit(level,event,data){this.audits.push({level,event,data});}};}

test('Dragon is a feeder concept, never a real portfolio Hunter',()=>{
  assert.equal(FEEDER_CONCEPTS.has('Dragon'),true);
  assert.equal(PORTFOLIO_CONCEPTS.has('Dragon'),false);
});

test('Dragon V1 qualifies only clean CI1 episode 1-2 signals inside 84-88 with <=3c spread',()=>{
  const s=settings();
  assert.equal(dragonSignalQualifiedAtQuote(signal(),quote('D',85,86),s).ok,true);
  assert.equal(dragonSignalQualifiedAtQuote(signal({episodeIndex:3}),quote('D',85,86),s).reason,'episode');
  assert.equal(dragonSignalQualifiedAtQuote(signal(),quote('D',82,83),s).reason,'signal_band');
  assert.equal(dragonSignalQualifiedAtQuote(signal(),quote('D',84,88),s).reason,'spread');
});

test('Dragon converts one qualifying crash episode into one ghost feeder using trough as reference origin',async()=>{
  const mem=db(); const sig=signal(); let marked=null;
  const st=new StrategyEngine({
    db:mem, kalshi:{}, market:{}, learning:{crashEntrySignal:()=>sig,async markDragonSignal(t,e,d){marked={t,e,d};}},
    getSettings:()=>settings(), getLiveReady:()=>false,
  });
  const q=quote('D',85,86);
  const first=await st.evaluateDragon(new Map([['D',q]]));
  assert.equal(first.length,1);
  const e=first[0];
  assert.equal(e.conceptName,'Dragon');
  assert.equal(e.sourceTradeId,sig.episodeId);
  assert.equal(e.entryPriceCents,70,'Dragon feeder reference origin must be the crash trough');
  assert.equal(e.currentPriceCents,85);
  assert.equal(e.peakPriceCents,85);
  assert.equal(e.stopLossCents,0);
  assert.equal(e.entryOrderId??null,null);
  assert.equal(e.entryConfig.dragonSource.signalPriceCents,86);
  assert.equal(e.entryConfig.dragonSource.referenceOrigin,'crash_trough');
  assert.equal(marked.e,sig.episodeId);
  const again=await st.evaluateDragon(new Map([['D',q]]));
  assert.equal(again.length,0,'same crash episode must never create a second Dragon signal');
});

function dragonFeederRow(overrides={}){
  const now=Date.now();
  return {id:'dragon-feed',systemName:'SAGITTARIUS',ownerId:'dragon-test',conceptName:'Dragon',sourceFeeder:null,sourceTradeId:'CRASH:D:1:1',ticker:'D',eventTicker:'D',marketTitle:'D',mode:'SIMULATION',status:'open',entryPriceCents:70,currentPriceCents:85,peakPriceCents:85,stopPriceCents:0,stopLossCents:0,count:42,remainingCount:42,pnlCents:0,openedAtMs:now-1000,updatedAtMs:now-1000,entryConfig:{referenceStakeCents:3000,feeder:{minPriceCents:84,maxPriceCents:88,dropCents:0,maxEpisode:2,intelligence:'CI1'}},...overrides};
}
function dbWith(initial=[]){const rows=initial.map((x)=>structuredClone(x));return{rows,audits:[],async entries(){return rows.map((x)=>structuredClone(x));},async openEntries(){return rows.filter((e)=>['open','entry_pending','exit_pending','pending_recovery'].includes(e.status)).map((x)=>structuredClone(x));},async insertEntry(e){rows.push(structuredClone(e));},async updateEntry(id,p){const e=rows.find((x)=>x.id===id);if(e)Object.assign(e,structuredClone(p));},async audit(level,event,data){this.audits.push({level,event,data});}};}

test('unchanged Wave Surfer consumes Dragon through the ordinary feeder path',async()=>{
  const mem=dbWith([dragonFeederRow()]);
  const s=settings({momentumHunterEnabled:false,waveSurferEnabled:true,recoveryHunterEnabled:false,crashRecoveryHunterEnabled:false,waveMinEntryCents:84,waveMaxEntryCents:88,waveMinFeederFavorableMoveCents:8,waveMaxSpreadCents:3,waveStakeCents:20000,waveStopCents:35,maxPositions:20});
  const st=new StrategyEngine({db:mem,kalshi:{},market:{},learning:{recoveryRate:async()=>null},getSettings:()=>s,getLiveReady:()=>false});
  let captured=null;
  st.createHunter=async(concept,q,stake,stop,opt)=>{captured={concept,q,stake,stop,opt};return{id:'wave',conceptName:concept,ticker:q.ticker,status:'open',openedAtMs:Date.now(),sourceFeeder:opt.sourceFeeder};};
  const made=await st.evaluateMomentumAndWave(new Map([['D',quote('D',85,86)]]));
  assert.equal(made.length,1);
  assert.equal(captured.concept,'Wave Surfer');
  assert.equal(captured.opt.sourceFeeder,'Dragon');
  assert.equal(captured.stake,20000);
  assert.equal(captured.stop,35);
});

test('unchanged Momentum Hunter consumes Dragon only after its normal rise/pullback conditions exist',async()=>{
  const mem=dbWith([dragonFeederRow({currentPriceCents:84,peakPriceCents:88})]);
  const s=settings({momentumHunterEnabled:true,waveSurferEnabled:false,recoveryHunterEnabled:false,crashRecoveryHunterEnabled:false,momentumMinEntryCents:76,momentumMaxEntryCents:84,momentumMinRiseCents:2,momentumMinPullbackCents:1,momentumMaxPullbackCents:12,momentumMaxSpreadCents:3,momentumMinTimeLeftMinutes:0,momentumStakeCents:20000,momentumHunterStopLossCents:35,maxPositions:20,minGameMinutes:0});
  const st=new StrategyEngine({db:mem,kalshi:{},market:{},learning:{recoveryRate:async()=>null},getSettings:()=>s,getLiveReady:()=>false});
  let captured=null;
  st.createHunter=async(concept,q,stake,stop,opt)=>{captured={concept,q,stake,stop,opt};return{id:'momentum',conceptName:concept,ticker:q.ticker,status:'open',openedAtMs:Date.now(),sourceFeeder:opt.sourceFeeder};};
  const q={...quote('D',83,84),closeTimeMs:Date.now()+3600000,gameStartTimeMs:Date.now()-30*60000,gameClockState:{version:'GCA1',eventTicker:'D',phase:'CONFIRMED',confirmed:true,startTimeMs:Date.now()-30*60000}};
  const made=await st.evaluateMomentumAndWave(new Map([['D',q]]));
  assert.equal(made.length,1);
  assert.equal(captured.concept,'Momentum Hunter');
  assert.equal(captured.opt.sourceFeeder,'Dragon');
  assert.equal(captured.stake,20000);
  assert.equal(captured.stop,35);
});

test('Recovery Hunter remains unchanged: Dragon alone is not a Recovery source',async()=>{
  const mem=dbWith([dragonFeederRow()]);
  const s=settings({recoveryHunterEnabled:true,momentumHunterEnabled:false,waveSurferEnabled:false,crashRecoveryHunterEnabled:false});
  const st=new StrategyEngine({db:mem,kalshi:{},market:{},learning:{},getSettings:()=>s,getLiveReady:()=>false});
  st.createHunter=async()=>{throw new Error('Recovery must not be created from a feeder');};
  const made=await st.evaluateRecovery(new Map([['D',quote('D',85,86)]]));
  assert.deepEqual(made,[]);
});

import { SagittariusEngine, crashPipelineReadyFromState, summarizeGoldenFeeds } from '../src/engine.mjs';
import { Database } from '../src/db.mjs';
import { LearningEngine, advanceCrashState } from '../src/learning.mjs';

test('R27 GPI1 lower low invalidates old rebound clock and a fresh recovery receives a fresh confirmation timestamp',()=>{
  const s=settings({crashRecoveryMinCrashCents:15,crashRecoveryMinReboundCents:7,crashRecoveryMinReclaimRate:.40,crashRecoveryStableObservations:3,crashRecoveryUpwardTicks:2,crashRecoveryEpisodeResetRate:.95});
  const t0=1_000_000;
  let state={
    version:'CI1',ticker:'G',eventTicker:'G',marketTitle:'G',sport:'Test',phase:'REBOUND_CONFIRMED',episodeCount:1,episodeIndex:1,episodeId:'CRASH:G:1:1',
    rollingPeakCents:80,preCrashPeakCents:80,troughCents:50,crashDepthCents:30,crashStartedAtMs:t0-120_000,troughAtMs:t0-90_000,
    reboundConfirmedAtMs:t0-60_000,resetAtMs:null,stableObservations:8,upwardTicks:4,lowerLowCount:0,reboundLostCount:0,reboundCents:15,reclaimRate:.5,entryReady:true,
    lastBidCents:65,lastAskCents:66,lastObservationAtMs:t0-1_000,lastEpisodeId:null,lastResetAtMs:null,pendingEntrySignal:null,finalResult:null,updatedAtMs:t0-1_000,
  };
  let out=advanceCrashState(state,{ticker:'G',eventTicker:'G',title:'G',yesBid:45,yesAsk:46,status:'active'},s,t0);
  assert.equal(out.transition,'NEW_LOW');
  assert.equal(out.state.troughAtMs,t0);
  assert.equal(out.state.reboundConfirmedAtMs,null,'old rebound clock must be destroyed when the trough changes');
  state=out.state;
  out=advanceCrashState(state,{ticker:'G',eventTicker:'G',title:'G',yesBid:49,yesAsk:50,status:'active'},s,t0+1_000); state=out.state;
  out=advanceCrashState(state,{ticker:'G',eventTicker:'G',title:'G',yesBid:53,yesAsk:54,status:'active'},s,t0+2_000); state=out.state;
  out=advanceCrashState(state,{ticker:'G',eventTicker:'G',title:'G',yesBid:57,yesAsk:58,status:'active'},s,t0+3_000); state=out.state;
  out=advanceCrashState(state,{ticker:'G',eventTicker:'G',title:'G',yesBid:61,yesAsk:62,status:'active'},s,t0+4_000);
  assert.equal(out.transition,'REBOUND_CONFIRMED');
  assert.equal(out.state.reboundConfirmedAtMs,t0+4_000);
  assert.ok(out.state.reboundConfirmedAtMs>=out.state.troughAtMs,'current rebound confirmation can never predate current trough');
});

test('R27 GPI1 a lost rebound clears the actionable confirmation clock and reconfirmation gets a new clock',()=>{
  const s=settings({crashRecoveryMinCrashCents:15,crashRecoveryMinReboundCents:7,crashRecoveryMinReclaimRate:.40,crashRecoveryStableObservations:3,crashRecoveryUpwardTicks:2,crashRecoveryEpisodeResetRate:.95});
  const t0=2_000_000;
  const confirmed={
    version:'CI1',ticker:'G',eventTicker:'G',marketTitle:'G',sport:'Test',phase:'REBOUND_CONFIRMED',episodeCount:1,episodeIndex:1,episodeId:'CRASH:G:1:1',
    rollingPeakCents:80,preCrashPeakCents:80,troughCents:50,crashDepthCents:30,crashStartedAtMs:t0-120_000,troughAtMs:t0-90_000,
    reboundConfirmedAtMs:t0-30_000,resetAtMs:null,stableObservations:8,upwardTicks:4,lowerLowCount:0,reboundLostCount:0,reboundCents:15,reclaimRate:.5,entryReady:true,
    lastBidCents:65,lastAskCents:66,lastObservationAtMs:t0-1_000,lastEpisodeId:null,lastResetAtMs:null,pendingEntrySignal:null,finalResult:null,updatedAtMs:t0-1_000,
  };
  let out=advanceCrashState(confirmed,{ticker:'G',eventTicker:'G',title:'G',yesBid:58,yesAsk:59,status:'active'},s,t0);
  assert.equal(out.transition,'REBOUND_LOST');
  assert.equal(out.state.reboundConfirmedAtMs,null);
  assert.equal(out.state.reboundLostCount,1);
  let state=out.state;
  out=advanceCrashState(state,{ticker:'G',eventTicker:'G',title:'G',yesBid:60,yesAsk:61,status:'active'},s,t0+1_000); state=out.state;
  out=advanceCrashState(state,{ticker:'G',eventTicker:'G',title:'G',yesBid:62,yesAsk:63,status:'active'},s,t0+2_000);
  assert.equal(out.transition,'REBOUND_CONFIRMED');
  assert.equal(out.state.reboundConfirmedAtMs,t0+2_000,'reconfirmed recovery must not resurrect the invalidated timestamp');
});

test('R27 GPI2 Golden pending evidence can mature after CI1 reset without mutating the immutable CRH pending snapshot',()=>{
  const s=settings({crashRecoveryMinCrashCents:15,crashRecoveryMinReboundCents:7,crashRecoveryMinReclaimRate:.40,crashRecoveryStableObservations:3,crashRecoveryUpwardTicks:2,crashRecoveryEpisodeResetRate:.80});
  const t0=3_000_000;
  const prior={
    version:'CI1',ticker:'G',eventTicker:'G',marketTitle:'G',sport:'Test',phase:'REBOUND_CONFIRMED',episodeCount:1,episodeIndex:1,episodeId:'CRASH:G:1:1',
    rollingPeakCents:80,preCrashPeakCents:80,troughCents:50,crashDepthCents:30,crashStartedAtMs:t0-120_000,troughAtMs:t0-90_000,
    reboundConfirmedAtMs:t0-20_000,goldenReboundConfirmedAtMs:null,goldenEntryReady:false,resetAtMs:null,stableObservations:3,upwardTicks:2,lowerLowCount:0,reboundLostCount:0,
    reboundCents:20,reclaimRate:20/30,entryReady:true,lastBidCents:70,lastAskCents:71,lastObservationAtMs:t0-1_000,lastEpisodeId:null,lastResetAtMs:null,pendingEntrySignal:null,goldenPendingSignal:null,finalResult:null,updatedAtMs:t0-1_000,
  };
  let out=advanceCrashState(prior,{ticker:'G',eventTicker:'G',title:'G',yesBid:74,yesAsk:75,status:'active'},s,t0);
  assert.equal(out.transition,'EPISODE_RESET');
  assert.equal(out.state.pendingEntrySignal.stableObservations,4);
  assert.equal(out.state.goldenPendingSignal.stableObservations,4);
  assert.equal(out.state.goldenPendingSignal.goldenEntryReady,false,'Golden is still one stable observation short at CI1 reset');
  const immutable=structuredClone(out.state.pendingEntrySignal);
  out=advanceCrashState(out.state,{ticker:'G',eventTicker:'G',title:'G',yesBid:75,yesAsk:76,status:'active'},s,t0+1_000);
  assert.deepEqual(out.state.pendingEntrySignal,immutable,'CRH/Dragon provenance snapshot must remain immutable after reset');
  assert.equal(out.state.goldenPendingSignal.stableObservations,5);
  assert.equal(out.state.goldenPendingSignal.goldenEntryReady,true);
  assert.equal(out.state.goldenPendingSignal.goldenReboundConfirmedAtMs,t0+1_000);
  const learning=new LearningEngine({},'SAGITTARIUS'); learning.crashStates.set('G',out.state);
  assert.equal(learning.crashEntrySignal('G').stableObservations,4,'normal Dragon/CRH must still see the frozen CI1 snapshot');
  const golden=learning.goldenDragonEntrySignal('G');
  assert.equal(golden.stableObservations,5,'Golden must see the independently matured exact-episode candidate');
  assert.equal(golden.reboundConfirmedAtMs,t0+1_000,'Golden freshness must start from Golden confirmation, not the earlier CI1 clock');
  assert.equal(golden.ci1ReboundConfirmedAtMs,t0-20_000);
});

test('R27 GPI2 a new crash invalidates both old pending lanes so no prior episode can authorize a later crash',()=>{
  const s=settings({crashRecoveryEpisodeResetRate:.80});
  const t0=4_000_000;
  const pending={version:'CI1',episodeId:'CRASH:G:1:1',episodeIndex:1,ticker:'G',eventTicker:'G',preCrashPeakCents:80,troughCents:50,crashDepthCents:30,reboundCents:25,reclaimRate:25/30,stableObservations:8,upwardTicks:4,crashStartedAtMs:t0-100_000,troughAtMs:t0-90_000,reboundConfirmedAtMs:t0-40_000,goldenReboundConfirmedAtMs:t0-30_000,goldenEntryReady:true,lastBidCents:75,lastAskCents:76};
  const state={
    version:'CI1',ticker:'G',eventTicker:'G',marketTitle:'G',sport:'Test',phase:'NORMAL',episodeCount:1,episodeIndex:0,episodeId:null,rollingPeakCents:80,preCrashPeakCents:0,troughCents:0,crashDepthCents:0,crashStartedAtMs:null,troughAtMs:null,reboundConfirmedAtMs:null,goldenReboundConfirmedAtMs:null,goldenEntryReady:false,resetAtMs:null,stableObservations:0,upwardTicks:0,lowerLowCount:0,reboundLostCount:0,reboundCents:0,reclaimRate:0,entryReady:false,lastBidCents:80,lastAskCents:81,lastObservationAtMs:t0-1_000,lastEpisodeId:'CRASH:G:1:1',lastResetAtMs:t0-10_000,pendingEntrySignal:structuredClone(pending),goldenPendingSignal:structuredClone(pending),finalResult:null,updatedAtMs:t0-1_000,
  };
  const out=advanceCrashState(state,{ticker:'G',eventTicker:'G',title:'G',yesBid:60,yesAsk:61,status:'active'},s,t0);
  assert.equal(out.transition,'CRASH_STARTED');
  assert.equal(out.state.episodeIndex,2);
  assert.equal(out.state.pendingEntrySignal,null);
  assert.equal(out.state.goldenPendingSignal,null);
});

test('R27 GPI2 Golden can inspect an active crash under its own structure before CI1 exposes a Dragon/CRH entry signal',()=>{
  const s=settings({
    crashRecoveryMinCrashCents:15,crashRecoveryMinReboundCents:15,crashRecoveryMinReclaimRate:.55,crashRecoveryStableObservations:5,crashRecoveryUpwardTicks:3,
    goldenDragonMinCrashCents:15,goldenDragonMinReboundCents:7,goldenDragonMinReclaimRate:.20,goldenDragonStableObservations:2,goldenDragonUpwardTicks:1,
  });
  const t0=5_000_000;
  let state={
    version:'CI1',ticker:'G',eventTicker:'G',marketTitle:'G',sport:'Test',phase:'CRASHING',episodeCount:1,episodeIndex:1,episodeId:'CRASH:G:1:1',rollingPeakCents:80,preCrashPeakCents:80,troughCents:50,crashDepthCents:30,crashStartedAtMs:t0-30_000,troughAtMs:t0-30_000,reboundConfirmedAtMs:null,goldenReboundConfirmedAtMs:null,goldenEntryReady:false,resetAtMs:null,stableObservations:1,upwardTicks:0,lowerLowCount:0,reboundLostCount:0,reboundCents:4,reclaimRate:4/30,entryReady:false,lastBidCents:54,lastAskCents:55,lastObservationAtMs:t0-1_000,lastEpisodeId:null,lastResetAtMs:null,pendingEntrySignal:null,goldenPendingSignal:null,finalResult:null,updatedAtMs:t0-1_000,
  };
  const out=advanceCrashState(state,{ticker:'G',eventTicker:'G',title:'G',yesBid:58,yesAsk:59,status:'active'},s,t0);
  assert.equal(out.state.entryReady,false,'CI1 must remain below its stricter own structure');
  assert.equal(out.state.goldenEntryReady,true,'Golden structure must qualify independently');
  const learning=new LearningEngine({},'SAGITTARIUS'); learning.crashStates.set('G',out.state);
  assert.equal(learning.crashEntrySignal('G'),null);
  const golden=learning.goldenDragonEntrySignal('G');
  assert.equal(golden.episodeId,'CRASH:G:1:1');
  assert.equal(golden.reboundConfirmedAtMs,t0);
});

test('R27 GPI2 event-driven queue wakes Golden on a Golden-only candidate when normal CI1 entry signal is absent',async()=>{
  const engine=Object.create(SagittariusEngine.prototype);
  engine.running=true;
  engine.settings=settings({engineActive:true,dragonEnabled:false,goldenDragonEnabled:true,goldenDragonHunterEnabled:false,dragonRecoveryHunterEnabled:false,crashRecoveryHunterEnabled:false,mode:'SIMULATION'});
  engine.crashRecoveryEvaluationTimers=new Map(); engine.recoveryPriorityTickers=new Set();
  engine.market={getQuote:()=>quote('G',58,59)};
  engine.learning={crashEntrySignal:()=>null,goldenDragonEntrySignal:()=>signal({ticker:'G',eventTicker:'G'})};
  const calls=[];
  engine.strategy={async evaluateGoldenDragon(_map,opt){calls.push(['golden',opt.onlyTicker]);return[];},async evaluateRecovery(){return[];},async evaluateMomentumAndWave(){return[];}};
  engine.db={async audit(){}}; engine.isLiveReady=()=>false;
  engine.queueCrashRecoveryEvaluation('G');
  await new Promise((r)=>setTimeout(r,620));
  assert.deepEqual(calls,[['golden','G']]);
});

test('R44 fresh install defaults preserve the clean Pegasus -> Wave prospective lane while LIVE stays disarmed and Atomic Thunder is enabled',()=>{
  const s=freshInstallSettings();
  assert.equal(s.liveArmed,false);
  assert.equal(s.pegasusEnabled,true); assert.equal(s.waveSurferEnabled,true);
  assert.equal(s.sagittariusEnabled,false); assert.equal(s.dragonEnabled,false); assert.equal(s.goldenDragonEnabled,false);
  assert.equal(s.momentumHunterEnabled,false); assert.equal(s.recoveryHunterEnabled,false); assert.equal(s.crashRecoveryHunterEnabled,false); assert.equal(s.dragonRecoveryHunterEnabled,false); assert.equal(s.goldenDragonHunterEnabled,false);
  assert.equal(s.goldenEyeEnabled,true); assert.equal(s.goldenEyeLiveEnabled,false); assert.equal(s.atomicThunderEnabled,true);
  assert.equal(s.maxPositions,20); assert.equal(s.maxEntriesPerTrade,3); assert.equal(s.hunterCooldownMinutes,45); assert.equal(s.minGameMinutes,30); assert.equal(s.startingCapitalCents,1_000_000);
  assert.deepEqual({stake:s.pegasusReferenceStakeCents,min:s.pegasusMinPriceCents,max:s.pegasusMaxPriceCents,drop:s.pegasusDropCents},{stake:3000,min:27,max:89,drop:1});
  assert.deepEqual({stake:s.waveStakeCents,min:s.waveMinEntryCents,max:s.waveMaxEntryCents,stop:s.waveStopCents,move:s.waveMinFeederFavorableMoveCents,spread:s.waveMaxSpreadCents},{stake:20000,min:27,max:89,stop:35,move:1,spread:3});
});

test('R27 GPI3 migration keeps older persisted risk concepts fail-safe OFF and preserves legacy Golden structure',()=>{
  const old={...originalSettings(),goldenDragonEnabled:false,goldenDragonHunterEnabled:false};
  delete old.goldenDragonMinCrashCents; delete old.goldenDragonMinReboundCents; delete old.goldenDragonMinReclaimRate; delete old.goldenDragonStableObservations; delete old.goldenDragonUpwardTicks;
  const migrated=sanitizeRuntimeSettings(old,freshInstallSettings());
  assert.equal(migrated.goldenDragonEnabled,false); assert.equal(migrated.goldenDragonHunterEnabled,false);
  assert.deepEqual([migrated.goldenDragonMinCrashCents,migrated.goldenDragonMinReboundCents,migrated.goldenDragonMinReclaimRate,migrated.goldenDragonStableObservations,migrated.goldenDragonUpwardTicks],[15,15,.55,5,3]);
});

test('R27 GPI3 an existing System 6 flood record receives missing Golden structural controls as flood values',()=>{
  const r26={...originalSettings(),goldenDragonEnabled:true,goldenDragonHunterEnabled:true,goldenDragonMaxEpisode:10,goldenDragonMinRecoveryAgeSeconds:3,goldenDragonMaxRecoveryAgeSeconds:420,goldenDragonHunterMinEntryCents:45,goldenDragonHunterMinTrustScore:72};
  for(const key of ['goldenDragonMinCrashCents','goldenDragonMinReboundCents','goldenDragonMinReclaimRate','goldenDragonStableObservations','goldenDragonUpwardTicks']) delete r26[key];
  const migrated=sanitizeRuntimeSettings(r26,freshInstallSettings());
  assert.deepEqual([migrated.goldenDragonMinCrashCents,migrated.goldenDragonMinReboundCents,migrated.goldenDragonMinReclaimRate,migrated.goldenDragonStableObservations,migrated.goldenDragonUpwardTicks],[15,7,.40,3,2]);
  assert.equal(migrated.goldenDragonHunterEnabled,true,'explicit System 6 GDH enablement must be preserved');
});

test('R27 GPI3 Golden qualification consumes its editable structural controls instead of hidden 15/15/.55/5/3 constants',()=>{
  const now=Date.now();
  const sig={episodeId:'CRASH:G:1:1',episodeIndex:1,preCrashPeakCents:70,troughCents:40,crashDepthCents:30,stableObservations:3,upwardTicks:2,troughAtMs:now-30_000,reboundConfirmedAtMs:now-10_000,lowerLowCount:0,reboundLostCount:0};
  const q={...quote('G',48,49),gameStartTimeMs:now-30*60_000,gameClockState:{version:'GCA1',eventTicker:'G',phase:'CONFIRMED',confirmed:true,startTimeMs:now-30*60_000}};
  const learning={goldenDragonSurvivalProfile:()=>({totalObservations:0,smoothedSurvivalRate:.5,specificity:'none'})};
  const flood=settings({goldenDragonMinCrashCents:15,goldenDragonMinReboundCents:7,goldenDragonMinReclaimRate:.20,goldenDragonStableObservations:3,goldenDragonUpwardTicks:2,goldenDragonMinRecoveryAgeSeconds:3,goldenDragonMaxRecoveryAgeSeconds:420,goldenDragonMinTrustScore:0,goldenDragonMaxEpisode:10});
  const strict={...flood,goldenDragonMinReboundCents:15,goldenDragonMinReclaimRate:.55,goldenDragonStableObservations:5,goldenDragonUpwardTicks:3};
  assert.equal(goldenDragonSignalQualifiedAtQuote(sig,q,flood,learning,now).ok,true);
  assert.equal(goldenDragonSignalQualifiedAtQuote(sig,q,strict,learning,now).reason,'rebound_structure');
});

test('R27 GPI4 Golden pipeline telemetry records the latest exact-episode rejection stage and deduplicates reason transitions',async()=>{
  const mem=dbWith();
  const now=Date.now();
  const s=settings({goldenDragonEnabled:true,goldenDragonMinCrashCents:15,goldenDragonMinReboundCents:15,goldenDragonMinReclaimRate:.55,goldenDragonStableObservations:5,goldenDragonUpwardTicks:3,goldenDragonMinRecoveryAgeSeconds:30,goldenDragonMaxRecoveryAgeSeconds:240,goldenDragonMinTrustScore:72,goldenDragonMaxEpisode:4});
  const sig={episodeId:'CRASH:G:1:1',episodeIndex:1,ticker:'G',eventTicker:'G',preCrashPeakCents:70,troughCents:40,crashDepthCents:30,stableObservations:8,upwardTicks:4,troughAtMs:now-90_000,reboundConfirmedAtMs:now-45_000,lowerLowCount:0,reboundLostCount:0,sport:'Test'};
  const st=new StrategyEngine({db:mem,kalshi:{},market:{},learning:{goldenDragonEntrySignal:()=>sig,goldenDragonSurvivalProfile:()=>({totalObservations:20,smoothedSurvivalRate:.8,specificity:'test'})},getSettings:()=>s,getLiveReady:()=>false});
  await st.evaluateGoldenDragon(new Map([['G',quote('G',49,50)]]));
  let summary=st.goldenPipelineSummary();
  assert.equal(summary.trackedEpisodes,1);
  assert.equal(summary.byStage.golden,1);
  assert.equal(summary.byReason.rebound_structure,1);
  const auditCount=mem.audits.filter((x)=>x.event==='golden_pipeline_decision').length;
  await st.evaluateGoldenDragon(new Map([['G',quote('G',49,50)]]));
  assert.equal(mem.audits.filter((x)=>x.event==='golden_pipeline_decision').length,auditCount,'unchanged rejection must not spam audit telemetry');
  await st.evaluateGoldenDragon(new Map([['G',quote('G',64,65)]]));
  summary=st.goldenPipelineSummary();
  assert.equal(summary.byReason.signal_created,1);
  assert.equal(summary.recent[0].reason,'signal_created');
});

test('simulation reset preserves Crash Intelligence state and episode lineage for Dragon',async()=>{
  const engine=Object.create(SagittariusEngine.prototype);
  engine.settings=settings({mode:'SIMULATION'});
  let clearedCrash=false, resetRuntime=false;
  engine.db={
    async archiveSimulation(){return 4;},async clearTrackers(){},async clearCrashMarketStates(){clearedCrash=true;},async saveSettings(){},
  };
  engine.learning={crashLearningSummary:()=>({states:[{ticker:'D',phase:'REBOUND_CONFIRMED'}]}),resetCrashRuntime(){resetRuntime=true;}};
  engine.market={histories:new Map([['D',[]]])};
  engine.crashPriorityTickers=new Set();
  const out=await engine.resetSimulation();
  assert.equal(out,4);
  assert.equal(clearedCrash,false);
  assert.equal(resetRuntime,false);
  assert.equal(engine.crashPriorityTickers.has('D'),true);
  assert.equal(engine.market.histories.size,0,'price history may reset without deleting learned crash lineage');
});

test('Dragon signal telemetry is persisted onto the existing crash episode row without a new subsystem',async()=>{
  const calls=[];
  const db=Object.create(Database.prototype);
  db.pool={async query(sql,args){calls.push({sql,args});return{rows:[],rowCount:1};}};
  await db.markCrashEpisodeDragonSignal('SAGITTARIUS','CRASH:D:1:1',{version:'DRAGON-V1',signalAskCents:86},1234);
  assert.equal(calls.length,1);
  assert.match(calls[0].sql,/dragon_signal=\$3/);
  assert.equal(calls[0].args[1],'CRASH:D:1:1');
  assert.equal(calls[0].args[2].signalAskCents,86);
});

test('LearningEngine writes compact Dragon signal intelligence to the crash episode',async()=>{
  let stored=null;
  const learning=new LearningEngine({async markCrashEpisodeDragonSignal(systemName,episodeId,signal,updatedAtMs){stored={systemName,episodeId,signal,updatedAtMs};}},'SAGITTARIUS');
  await learning.markDragonSignal('D','CRASH:D:1:1',{signalAtMs:1000,signalBidCents:85,signalAskCents:86,gameMinutes:44.5,episodeIndex:1});
  assert.equal(stored.episodeId,'CRASH:D:1:1');
  assert.equal(stored.signal.version,'DRAGON-V1');
  assert.equal(stored.signal.signalAskCents,86);
  assert.equal(stored.signal.gameMinutes,44.5);
});

test('Dragon remains Profit Guard/R13 exempt exactly like the existing ghost feeders',async()=>{
  const mem=dbWith([dragonFeederRow()]);
  const s=settings({maxEntriesPerTrade:9,hunterCooldownMinutes:0,minGameMinutes:0});
  const st=new StrategyEngine({db:mem,kalshi:{},market:{},learning:{},getSettings:()=>s,getLiveReady:()=>false});
  const q={...quote('D',85,86),gameStartTimeMs:Date.now()-30*60000,gameClockState:{version:'GCA1',eventTicker:'D',phase:'CONFIRMED',confirmed:true,startTimeMs:Date.now()-30*60000}};
  assert.equal(await st.hunterEntryPolicy('Wave Surfer',q),true,'Dragon ghost must never consume the exact-ticker Hunter lock');
});

test('Dragon settings persist through the normal authoritative settings API with validation',async()=>{
  const engine=Object.create(SagittariusEngine.prototype);
  engine.settings=settings();
  let saved=null; engine.db={async saveSettings(v){saved=structuredClone(v);}};
  const out=await engine.patchSettings({dragonEnabled:true,dragonReferenceStakeCents:3500,dragonMinSignalPriceCents:83,dragonMaxSignalPriceCents:89,dragonMaxEpisode:3});
  assert.equal(out.dragonEnabled,true);
  assert.equal(saved.dragonReferenceStakeCents,3500);
  await assert.rejects(()=>engine.patchSettings({dragonMaxEpisode:0}),/positive integer/);
  await assert.rejects(()=>engine.patchSettings({dragonMinSignalPriceCents:90,dragonMaxSignalPriceCents:89}),/minimum signal price/);
});

test('event-driven crash queue creates Dragon and wakes normal feeder-driven Hunters even with CRH OFF',async()=>{
  const engine=Object.create(SagittariusEngine.prototype);
  engine.running=true;
  engine.settings=settings({engineActive:true,dragonEnabled:true,crashRecoveryHunterEnabled:false,mode:'SIMULATION'});
  engine.crashRecoveryEvaluationTimers=new Map();
  engine.recoveryPriorityTickers=new Set();
  engine.market={getQuote:()=>quote('D',85,86)};
  engine.learning={crashEntrySignal:()=>signal()};
  const calls=[];
  engine.strategy={
    async evaluateDragon(_map,opt){calls.push(['dragon',opt.onlyTicker]);return[{id:'d'}];},
    async evaluateRecovery(){calls.push(['recovery']);return[];},
    async evaluateCrashRecovery(){calls.push(['crh']);return[];},
    async evaluateMomentumAndWave(){calls.push(['hunters']);return[];},
  };
  engine.db={async audit(){}};
  engine.isLiveReady=()=>false;
  engine.queueCrashRecoveryEvaluation('D');
  await new Promise((r)=>setTimeout(r,620));
  assert.deepEqual(calls,[['dragon','D'],['hunters']]);
});

test('CRH1 hunts only the exact crash episode materialized by Dragon and is attributed back to Dragon',async()=>{
  const mem=dbWith();
  const s=settings({dragonEnabled:true,crashRecoveryHunterEnabled:true,crashRecoveryMinEntryCents:70,crashRecoveryMaxEntryCents:89,crashRecoveryMaxSpreadCents:3,maxPositions:20,minGameMinutes:0});
  const sig=signal();
  const learning={crashEntrySignal:()=>sig,async markDragonSignal(){}};
  const st=new StrategyEngine({db:mem,kalshi:{},market:{},learning,getSettings:()=>s,getLiveReady:()=>false});
  const map=new Map([['D',quote('D',85,86)]]);
  assert.equal((await st.evaluateDragon(map)).length,1);
  let crh=null; st.createHunter=async(concept,q,stake,stop,opt)=>{crh={concept,q,stake,stop,opt};return{id:'crh',conceptName:concept,ticker:q.ticker,status:'open',sourceTradeId:opt.sourceTradeId};};
  const made=await st.evaluateCrashRecovery(map);
  assert.equal(made.length,1);
  assert.equal(crh.concept,'Crash Recovery Hunter');
  assert.equal(crh.opt.sourceFeeder,'Dragon');
  assert.equal(crh.opt.sourceTradeId,sig.episodeId);
  assert.equal(crh.opt.crashSourceSnapshot.huntingGround,'dragon_signal_episode');
  assert.equal(crh.opt.crashSourceSnapshot.dragonEpisodeId,sig.episodeId);
});

test('CRH1 rejects a clean raw CI1 signal when Dragon has not approved that episode',async()=>{
  const mem=dbWith();
  const s=settings({dragonEnabled:true,crashRecoveryHunterEnabled:true,crashRecoveryMinEntryCents:70,crashRecoveryMaxEntryCents:89,crashRecoveryMaxSpreadCents:3,maxPositions:20,minGameMinutes:0});
  const sig=signal();
  const st=new StrategyEngine({db:mem,kalshi:{},market:{},learning:{crashEntrySignal:()=>sig},getSettings:()=>s,getLiveReady:()=>false});
  let calls=0; st.createHunter=async()=>{calls+=1;return{id:'unexpected'};};
  const made=await st.evaluateCrashRecovery(new Map([['D',quote('D',85,86)]]));
  assert.deepEqual(made,[]);
  assert.equal(calls,0);
});

test('CRH1 rejects a later CI1 episode when Dragon approved only an older episode on the same ticker',async()=>{
  const old=dragonFeederRow({sourceTradeId:'CRASH:D:1:1',entryConfig:{referenceStakeCents:3000,feeder:{minPriceCents:84,maxPriceCents:88,dropCents:0,maxEpisode:2,intelligence:'CI1'},dragonSource:{episodeId:'CRASH:D:1:1',signalAtMs:1,signalPriceCents:86}}});
  const mem=dbWith([old]);
  const s=settings({dragonEnabled:true,crashRecoveryHunterEnabled:true,crashRecoveryMinEntryCents:70,crashRecoveryMaxEntryCents:89,crashRecoveryMaxSpreadCents:3,maxPositions:20,minGameMinutes:0});
  const sig=signal({episodeId:'CRASH:D:2:2',episodeIndex:2});
  const st=new StrategyEngine({db:mem,kalshi:{},market:{},learning:{crashEntrySignal:()=>sig},getSettings:()=>s,getLiveReady:()=>false});
  let calls=0; st.createHunter=async()=>{calls+=1;return{id:'unexpected'};};
  const made=await st.evaluateCrashRecovery(new Map([['D',quote('D',85,86)]]));
  assert.deepEqual(made,[]);
  assert.equal(calls,0);
});


test('CRH1 is inert when Dragon is disabled even if an exact historical Dragon ghost and raw CI1 signal exist',async()=>{
  const sig=signal();
  const mem=dbWith([dragonFeederRow({sourceTradeId:sig.episodeId,entryConfig:{referenceStakeCents:3000,feeder:{minPriceCents:84,maxPriceCents:88,dropCents:0,maxEpisode:2,intelligence:'CI1'},dragonSource:{episodeId:sig.episodeId,signalAtMs:1,signalPriceCents:86}}})]);
  const s=settings({dragonEnabled:false,crashRecoveryHunterEnabled:true,crashRecoveryMinEntryCents:70,crashRecoveryMaxEntryCents:89,crashRecoveryMaxSpreadCents:3,maxPositions:20,minGameMinutes:0});
  const st=new StrategyEngine({db:mem,kalshi:{},market:{},learning:{crashEntrySignal:()=>sig},getSettings:()=>s,getLiveReady:()=>false});
  let calls=0; st.createHunter=async()=>{calls+=1;return{id:'unexpected'};};
  const made=await st.evaluateCrashRecovery(new Map([['D',quote('D',85,86)]]));
  assert.deepEqual(made,[]);
  assert.equal(calls,0);
});


test('event-driven crash queue materializes Dragon before Dragon-gated CRH1',async()=>{
  const engine=Object.create(SagittariusEngine.prototype);
  engine.running=true;
  engine.settings=settings({engineActive:true,dragonEnabled:true,crashRecoveryHunterEnabled:true,mode:'SIMULATION'});
  engine.crashRecoveryEvaluationTimers=new Map();
  engine.recoveryPriorityTickers=new Set();
  engine.market={getQuote:()=>quote('D',85,86)};
  engine.learning={crashEntrySignal:()=>signal()};
  const calls=[];
  engine.strategy={
    async evaluateDragon(){calls.push('dragon');return[{id:'dragon'}];},
    async evaluateRecovery(){calls.push('recovery');return[];},
    async evaluateCrashRecovery(){calls.push('crh');return[{id:'crh'}];},
    async evaluateMomentumAndWave(){calls.push('hunters');return[];},
  };
  engine.db={async audit(){}};
  engine.isLiveReady=()=>false;
  engine.queueCrashRecoveryEvaluation('D');
  await new Promise((r)=>setTimeout(r,620));
  assert.deepEqual(calls,['dragon','crh','hunters']);
});

test('full and fast scan paths materialize Dragon before CRH1 and diagnostics expose the new hunting ground',async()=>{
  const { readFile }=await import('node:fs/promises');
  const src=await readFile(new URL('../src/engine.mjs',import.meta.url),'utf8');
  const chain=src.slice(src.indexOf('async evaluateEntryChain('),src.indexOf('async fullScan()'));
  const recoveryAt=chain.indexOf('evaluateRecovery(marketMap)');
  const dragonAt=chain.indexOf('evaluateDragon(marketMap)');
  const crhAt=chain.indexOf('evaluateCrashRecovery(marketMap)');
  assert.ok(recoveryAt>=0&&dragonAt>=0&&crhAt>=0&&recoveryAt<dragonAt&&dragonAt<crhAt,'RH1 real-exposure priority must remain first, then Dragon approval, then CRH1');
  const full=src.slice(src.indexOf('async fullScan()'),src.indexOf('async fastPhase(index)'));
  const fast=src.slice(src.indexOf('async fastPhase(index)'),src.indexOf('async cycleLoop()'));
  assert.ok(full.includes('evaluateEntryChain(markets, trackerMap, map)'));
  assert.ok(fast.includes('evaluateEntryChain(marketList, trackerMap, map)'));
  assert.ok(src.includes("crashRecoveryHuntingGround: 'approved_crash_signal_episode'"));
  assert.ok(src.includes('crashRecoveryRequiresApprovedSignal: true'));
  assert.ok(src.includes("crashRecoverySourceFeeders: ['Dragon','Golden Dragon']"));
  assert.ok(src.includes('crashRecoverySameEpisodeRequired: true'));
});


test('R25 Golden Dragon is reference-only while Dragon Recovery Hunter is real exposure',()=>{
  assert.equal(FEEDER_CONCEPTS.has('Golden Dragon'),true);
  assert.equal(PORTFOLIO_CONCEPTS.has('Golden Dragon'),false);
  assert.equal(PORTFOLIO_CONCEPTS.has('Dragon Recovery Hunter'),true);
  assert.equal(FEEDER_CONCEPTS.has('Dragon Recovery Hunter'),false);
});

function strongGoldenSignal(overrides={}){
  const now=Date.now();
  return signal({
    episodeId:'CRASH:G:1:100', episodeIndex:1, preCrashPeakCents:65,
    troughCents:40, crashDepthCents:25, stableObservations:20, upwardTicks:8,
    crashStartedAtMs:now-120000, troughAtMs:now-60000, reboundConfirmedAtMs:now-45000,
    lowerLowCount:0, reboundLostCount:0, sport:'Test', ...overrides,
  });
}
function goldenLearning(sig=strongGoldenSignal(),profile={totalObservations:20,smoothedSurvivalRate:.8,specificity:'test'}){
  return {crashEntrySignal:()=>sig,goldenDragonSurvivalProfile:()=>profile,recoveryRate:async()=>null};
}
function goldenFeederRow(sig=strongGoldenSignal(),overrides={}){
  const now=Date.now();
  const source={
    version:'GOLDEN-DRAGON-V1',episodeId:String(sig.episodeId),episodeIndex:Number(sig.episodeIndex||1),
    preCrashPeakCents:Number(sig.preCrashPeakCents||0),troughCents:Number(sig.troughCents||0),crashDepthCents:Number(sig.crashDepthCents||0),
    reboundCents:Number(sig.reboundCents||0),reclaimRate:Number(sig.reclaimRate||0),stableObservations:Number(sig.stableObservations||0),upwardTicks:Number(sig.upwardTicks||0),
    crashStartedAtMs:Number(sig.crashStartedAtMs||0),troughAtMs:Number(sig.troughAtMs||0),reboundConfirmedAtMs:Number(sig.reboundConfirmedAtMs||0),
    lowerLowCount:Number(sig.lowerLowCount||0),reboundLostCount:Number(sig.reboundLostCount||0),sport:sig.sport||'Test',
    signalAtMs:now-1000,signalPriceCents:64,validatedAskCents:64,validatedBidCents:63,trustScore:85,
    survivalProfile:{totalObservations:20,smoothedSurvivalRate:.8,specificity:'test'},referenceOrigin:'crash_trough',maxEpisode:10,
  };
  const feederState={
    version:GOLDEN_FEED_BUS.version,feederId:'gold-feed',episodeId:String(sig.episodeId),state:GOLDEN_FEED_BUS.activeState,reason:'hunter_feed_active',
    createdAtMs:now-1000,activatedAtMs:now-900,lastValidatedAtMs:now-100,lastObservationAtMs:now-100,
    lastBidCents:63,lastAskCents:64,stableObservations:Number(sig.stableObservations||0),upwardTicks:Number(sig.upwardTicks||0),
    troughCents:Number(sig.troughCents||0),crashDepthCents:Number(sig.crashDepthCents||0),reboundCents:Math.max(0,63-Number(sig.troughCents||0)),
    reclaimRate:Math.max(0,63-Number(sig.troughCents||0))/Math.max(1,Number(sig.crashDepthCents||0)),gameMinutes:30,
  };
  return {id:'gold-feed',systemName:'SAGITTARIUS',ownerId:'dragon-test',conceptName:'Golden Dragon',sourceFeeder:null,sourceTradeId:sig.episodeId,ticker:'G',eventTicker:'G',marketTitle:'G',mode:'SIMULATION',status:'open',entryPriceCents:sig.troughCents,currentPriceCents:63,peakPriceCents:63,stopPriceCents:0,stopLossCents:0,count:75,remainingCount:75,pnlCents:0,openedAtMs:now-1000,updatedAtMs:now-1000,entryConfig:{referenceStakeCents:3000,feeder:{minPriceCents:27,maxPriceCents:95,dropCents:0,maxEpisode:10,intelligence:'GOLDEN-DRAGON-V1',minTrustScore:72},goldenDragonSource:source},feederState,...overrides};
}

test('Golden Dragon requires mature high-trust durable recovery and vetoes weak historical survival',()=>{
  const now=Date.now();
  const s=settings({goldenDragonEnabled:true,goldenDragonMaxEpisode:4,goldenDragonMinSignalPriceCents:27,goldenDragonMaxSignalPriceCents:95,goldenDragonMinTrustScore:72,goldenDragonMinRecoveryAgeSeconds:30,minGameMinutes:0});
  const sig=strongGoldenSignal({troughAtMs:now-60000});
  const q=quote('G',63,64);
  const good=goldenDragonSignalQualifiedAtQuote(sig,q,s,{goldenDragonSurvivalProfile:()=>({totalObservations:20,smoothedSurvivalRate:.8,specificity:'test'})},now);
  assert.equal(good.ok,true);
  assert.ok(good.score>=72);
  const tooYoung=goldenDragonSignalQualifiedAtQuote({...sig,troughAtMs:now-5000},q,s,{goldenDragonSurvivalProfile:()=>({totalObservations:20,smoothedSurvivalRate:.8})},now);
  assert.equal(tooYoung.reason,'recovery_age');
  const weakHistory=goldenDragonSignalQualifiedAtQuote(sig,q,s,{goldenDragonSurvivalProfile:()=>({totalObservations:20,smoothedSurvivalRate:.4,specificity:'test'})},now);
  assert.equal(weakHistory.reason,'historical_survival');
  const stale=goldenDragonSignalQualifiedAtQuote({...sig,troughAtMs:now-360000,reboundConfirmedAtMs:now-300000},q,s,{goldenDragonSurvivalProfile:()=>({totalObservations:20,smoothedSurvivalRate:.8})},now);
  assert.equal(stale.reason,'recovery_stale');
  const impossibleClock=goldenDragonSignalQualifiedAtQuote({...sig,troughAtMs:now-60000,reboundConfirmedAtMs:now-300000},q,s,{goldenDragonSurvivalProfile:()=>({totalObservations:20,smoothedSurvivalRate:.8})},now);
  assert.equal(impossibleClock.reason,'recovery_clock_invalid');
  const repeatedFailure=goldenDragonSignalQualifiedAtQuote({...sig,lowerLowCount:3,reboundLostCount:2},q,s,{goldenDragonSurvivalProfile:()=>({totalObservations:20,smoothedSurvivalRate:.8})},now);
  assert.equal(repeatedFailure.ok,false);
  assert.equal(repeatedFailure.reason,'trust_score');
});

test('Golden Dragon materializes exactly one ghost per approved CI1 episode using the trough as reference origin',async()=>{
  const sig=strongGoldenSignal();
  const mem=dbWith();
  const s=settings({goldenDragonEnabled:true,goldenDragonMaxEpisode:4,goldenDragonMinSignalPriceCents:27,goldenDragonMaxSignalPriceCents:95,goldenDragonMinTrustScore:72,goldenDragonMinRecoveryAgeSeconds:30,minGameMinutes:0});
  const st=new StrategyEngine({db:mem,kalshi:{},market:{},learning:goldenLearning(sig),getSettings:()=>s,getLiveReady:()=>false});
  const map=new Map([['G',quote('G',63,64)]]);
  const first=await st.evaluateGoldenDragon(map);
  assert.equal(first.length,1);
  assert.equal(first[0].conceptName,'Golden Dragon');
  assert.equal(first[0].entryPriceCents,40);
  assert.equal(first[0].sourceTradeId,sig.episodeId);
  assert.equal(first[0].entryConfig.goldenDragonSource.episodeId,sig.episodeId);
  assert.ok(first[0].entryConfig.goldenDragonSource.trustScore>=72);
  assert.equal((await st.evaluateGoldenDragon(map)).length,0);
});

test('Dragon Recovery Hunter requires exact Golden Dragon approval and its own recovery gate',async()=>{
  const sig=strongGoldenSignal();
  const gold=goldenFeederRow(sig);
  const mem=dbWith([gold]);
  const s=settings({goldenDragonEnabled:true,dragonRecoveryHunterEnabled:true,recoveryHunterEnabled:false,dragonRecoveryStakeCents:20000,dragonRecoveryMinEntryCents:27,dragonRecoveryMaxEntryCents:65,dragonRecoveryStopLossCents:35,dragonRecoveryMaxSpreadCents:3,dragonRecoveryMinReboundCents:15,dragonRecoveryMinReclaimRate:.55,dragonRecoveryStableObservations:5,dragonRecoveryUpwardTicks:3,goldenDragonMinTrustScore:72,goldenDragonMinRecoveryAgeSeconds:30,minGameMinutes:0,maxPositions:20});
  const st=new StrategyEngine({db:mem,kalshi:{},market:{},learning:goldenLearning(sig),getSettings:()=>s,getLiveReady:()=>false});
  let captured=null;
  st.createHunter=async(concept,q,stake,stop,opt)=>{captured={concept,q,stake,stop,opt};return{id:'drh',conceptName:concept,ticker:q.ticker,status:'open',sourceFeeder:opt.sourceFeeder,sourceTradeId:opt.sourceTradeId};};
  const made=await st.evaluateDragonRecovery(new Map([['G',quote('G',63,64)]]));
  assert.equal(made.length,1);
  assert.equal(captured.concept,'Dragon Recovery Hunter');
  assert.equal(captured.opt.sourceFeeder,'Golden Dragon');
  assert.equal(captured.opt.sourceTradeId,sig.episodeId);
  assert.equal(captured.stake,20000);
  assert.equal(captured.stop,35);
  assert.equal(captured.opt.dragonRecoverySourceSnapshot.goldenEpisodeId,sig.episodeId);

  const onlyDragon=dbWith([dragonFeederRow({ticker:'G',eventTicker:'G',sourceTradeId:sig.episodeId})]);
  const st2=new StrategyEngine({db:onlyDragon,kalshi:{},market:{},learning:goldenLearning(sig),getSettings:()=>s,getLiveReady:()=>false});
  let calls=0; st2.createHunter=async()=>{calls+=1;return{id:'unexpected'};};
  assert.deepEqual(await st2.evaluateDragonRecovery(new Map([['G',quote('G',63,64)]])),[]);
  assert.equal(calls,0,'Dragon V1 approval must never substitute for Golden Dragon in DRH1');
});

test('R31 GFB1 lets Golden feed Wave while a newer exact crash supersedes the old feed before consumption',async()=>{
  const sig=strongGoldenSignal();
  const mem=dbWith([goldenFeederRow(sig)]);
  const s=settings({goldenDragonEnabled:true,dragonRecoveryHunterEnabled:false,momentumHunterEnabled:false,waveSurferEnabled:true,recoveryHunterEnabled:false,crashRecoveryHunterEnabled:false,waveMinEntryCents:60,waveMaxEntryCents:89,waveMinFeederFavorableMoveCents:7,waveMaxSpreadCents:3,waveStakeCents:20000,waveStopCents:35,goldenDragonMinTrustScore:72,goldenDragonMinRecoveryAgeSeconds:30,minGameMinutes:0,maxPositions:20});
  const st=new StrategyEngine({db:mem,kalshi:{},market:{},learning:goldenLearning(sig),getSettings:()=>s,getLiveReady:()=>false});
  let captured=null; st.createHunter=async(concept,q,stake,stop,opt)=>{captured={concept,q,stake,stop,opt};return{id:'wave-gold',conceptName:concept,ticker:q.ticker,status:'open'};};
  const map=new Map([['G',quote('G',63,64)]]);
  const made=await st.evaluateMomentumAndWave(map);
  assert.equal(made.length,1);
  assert.equal(captured.concept,'Wave Surfer');
  assert.equal(captured.opt.sourceFeeder,'Golden Dragon');
  assert.equal(captured.opt.goldenFeedAuthority.version,'GFB1');

  st.learning=goldenLearning({...sig,episodeId:'CRASH:G:2:200',episodeIndex:2});
  await st.refreshGoldenDragonFeedAuthorities(map);
  assert.equal(mem.rows[0].feederState.state,'SUPERSEDED');
  captured=null;
  const blocked=await st.evaluateMomentumAndWave(map);
  assert.equal(blocked.length,0,'later exact crash must supersede the older Golden feed before a new Hunter can use it');
  assert.equal(captured,null);
});

test('CRH may use an enabled exact Golden Dragon episode, but disabled Golden ghosts cannot shadow Dragon V1',async()=>{
  const sig=strongGoldenSignal({troughCents:40,crashDepthCents:25,stableObservations:20,upwardTicks:8});
  const gold=goldenFeederRow(sig);
  const dragon=dragonFeederRow({ticker:'G',eventTicker:'G',sourceTradeId:sig.episodeId,entryConfig:{referenceStakeCents:3000,feeder:{minPriceCents:40,maxPriceCents:95,dropCents:0,maxEpisode:4,intelligence:'CI1'},dragonSource:{episodeId:sig.episodeId,signalAtMs:1,signalPriceCents:64}}});
  const base={crashRecoveryHunterEnabled:true,crashRecoveryMinEntryCents:60,crashRecoveryMaxEntryCents:89,crashRecoveryMaxSpreadCents:3,crashRecoveryMinReboundCents:10,crashRecoveryMinReclaimRate:.4,crashRecoveryStableObservations:3,crashRecoveryUpwardTicks:3,recoveryHunterEnabled:false,minGameMinutes:0,maxPositions:20,goldenDragonMinTrustScore:72,goldenDragonMinRecoveryAgeSeconds:30};
  const s=settings({...base,dragonEnabled:true,goldenDragonEnabled:true});
  const mem=dbWith([dragon,gold]);
  const st=new StrategyEngine({db:mem,kalshi:{},market:{},learning:goldenLearning(sig),getSettings:()=>s,getLiveReady:()=>false});
  let source=null; st.createHunter=async(_c,_q,_stake,_stop,opt)=>{source=opt.sourceFeeder;return{id:'crh-gold',conceptName:'Crash Recovery Hunter',ticker:'G',status:'open'};};
  assert.equal((await st.evaluateCrashRecovery(new Map([['G',quote('G',63,64)]]))).length,1);
  assert.equal(source,'Golden Dragon');

  const s2=settings({...base,dragonEnabled:true,goldenDragonEnabled:false});
  const st2=new StrategyEngine({db:dbWith([dragon,gold]),kalshi:{},market:{},learning:{crashEntrySignal:()=>sig},getSettings:()=>s2,getLiveReady:()=>false});
  source=null; st2.createHunter=async(_c,_q,_stake,_stop,opt)=>{source=opt.sourceFeeder;return{id:'crh-dragon',conceptName:'Crash Recovery Hunter',ticker:'G',status:'open'};};
  assert.equal((await st2.evaluateCrashRecovery(new Map([['G',quote('G',63,64)]]))).length,1);
  assert.equal(source,'Dragon');
});

test('R25 settings API validates Golden Dragon and Dragon Recovery fields atomically',async()=>{
  const engine=Object.create(SagittariusEngine.prototype);
  engine.settings=settings();
  let saved=null; engine.db={async saveSettings(v){saved=structuredClone(v);}};
  const out=await engine.patchSettings({goldenDragonEnabled:true,dragonRecoveryHunterEnabled:true,goldenDragonReferenceStakeCents:4000,goldenDragonMinSignalPriceCents:25,goldenDragonMaxSignalPriceCents:92,goldenDragonMaxEpisode:4,goldenDragonMinTrustScore:78,goldenDragonMinRecoveryAgeSeconds:45,dragonRecoveryStakeCents:20000,dragonRecoveryMinEntryCents:30,dragonRecoveryMaxEntryCents:64,dragonRecoveryStopLossCents:30,dragonRecoveryMaxSpreadCents:2,dragonRecoveryMinReboundCents:16,dragonRecoveryMinReclaimRate:.6,dragonRecoveryStableObservations:6,dragonRecoveryUpwardTicks:4});
  assert.equal(out.goldenDragonEnabled,true); assert.equal(out.dragonRecoveryHunterEnabled,true); assert.equal(saved.goldenDragonMinTrustScore,78); assert.equal(saved.dragonRecoveryMaxEntryCents,64);
  await assert.rejects(()=>engine.patchSettings({goldenDragonMinTrustScore:101}),/0 and 100/);
  await assert.rejects(()=>engine.patchSettings({goldenDragonMaxEpisode:0}),/positive integer/);
  await assert.rejects(()=>engine.patchSettings({dragonRecoveryMinEntryCents:80,dragonRecoveryMaxEntryCents:65}),/minimum entry/);
  await assert.rejects(()=>engine.patchSettings({dragonRecoveryMinReclaimRate:1.1}),/between 0 and 1/);
  await assert.rejects(()=>engine.patchSettings({dragonRecoveryStableObservations:3,dragonRecoveryUpwardTicks:4}),/cannot exceed/);
});

test('R25 LIVE reconciliation includes Dragon Recovery Hunter and Profit Guard uses DRH model controls',async()=>{
  const {readFile}=await import('node:fs/promises');
  const dbSrc=await readFile(new URL('../src/db.mjs',import.meta.url),'utf8');
  const pgSrc=await readFile(new URL('../src/profitGuard.mjs',import.meta.url),'utf8');
  assert.ok(dbSrc.includes("'Dragon Recovery Hunter'"),'DRH must be present in live owned-Hunter query');
  assert.ok(pgSrc.includes('dragonRecoveryStopLossCents'));
  assert.ok(pgSrc.includes('dragonRecoveryMaxSpreadCents'));
});

test('R26 engine ordering preserves protection/rescue priority, then Dragon/Golden/GDH/DRH/CRH before ordinary feeder Hunters',async()=>{
  const {readFile}=await import('node:fs/promises');
  const src=await readFile(new URL('../src/engine.mjs',import.meta.url),'utf8');
  const chain=src.slice(src.indexOf('async evaluateEntryChain('),src.indexOf('async fullScan()'));
  const recoveryAt=chain.indexOf('evaluateRecovery(marketMap)');
  const dragonAt=chain.indexOf('evaluateDragon(marketMap)');
  const goldenAt=chain.indexOf('evaluateGoldenDragon(marketMap)');
  const gdhAt=chain.indexOf('evaluateGoldenDragonHunter(marketMap)');
  const drhAt=chain.indexOf('evaluateDragonRecovery(marketMap)');
  const crhAt=chain.indexOf('evaluateCrashRecovery(marketMap)');
  const feedersAt=chain.indexOf('evaluateFeeders(markets, trackerMap)');
  const normalAt=chain.indexOf('evaluateMomentumAndWave(marketMap)');
  assert.ok([recoveryAt,dragonAt,goldenAt,gdhAt,drhAt,crhAt,feedersAt,normalAt].every((x)=>x>=0));
  assert.ok(recoveryAt<dragonAt&&dragonAt<goldenAt&&goldenAt<gdhAt&&gdhAt<drhAt&&drhAt<crhAt&&crhAt<feedersAt&&feedersAt<normalAt);
  const full=src.slice(src.indexOf('async fullScan()'),src.indexOf('async fastPhase(index)'));
  const fast=src.slice(src.indexOf('async fastPhase(index)'),src.indexOf('async cycleLoop()'));
  assert.ok(full.indexOf("runProtectionSweep('full_scan')") < full.indexOf('evaluateEntryChain(markets, trackerMap, map)'));
  assert.ok(fast.includes('evaluateEntryChain(marketList, trackerMap, map)'));
});

test('R25 doctrine fallbacks preserve Golden 240s freshness and DRH 60c ceiling when settings fields are absent',()=>{
  const now=Date.now();
  const base=settings({goldenDragonEnabled:true,goldenDragonMinSignalPriceCents:27,goldenDragonMaxSignalPriceCents:95,goldenDragonMinTrustScore:72,minGameMinutes:0});
  delete base.goldenDragonMaxRecoveryAgeSeconds;
  const sig=strongGoldenSignal({troughAtMs:now-300000,reboundConfirmedAtMs:now-241000});
  const stale=goldenDragonSignalQualifiedAtQuote(sig,quote('G',59,60),base,{goldenDragonSurvivalProfile:()=>({totalObservations:20,smoothedSurvivalRate:.8})},now);
  assert.equal(stale.ok,false);
  assert.equal(stale.reason,'recovery_stale');

  const drh=settings({dragonRecoveryMinEntryCents:27,dragonRecoveryMinReboundCents:15,dragonRecoveryMinReclaimRate:.55,dragonRecoveryStableObservations:5,dragonRecoveryUpwardTicks:3,dragonRecoveryMaxSpreadCents:3});
  delete drh.dragonRecoveryMaxEntryCents;
  const drhSig=strongGoldenSignal({troughCents:40,crashDepthCents:25,stableObservations:8,upwardTicks:5});
  const tooHigh=dragonRecoverySignalQualifiedAtQuote(drhSig,quote('G',60,61),drh);
  assert.equal(tooHigh.ok,false);
  assert.equal(tooHigh.reason,'entry_band');
  const ceiling=dragonRecoverySignalQualifiedAtQuote(drhSig,quote('G',59,60),drh);
  assert.equal(ceiling.ok,true);
});


// R26 boundary-enforcement gate. These tests intentionally live in the existing
// Dragon suite so the compact 26-authored-file deployment contract remains intact.
const r26OpenLike=(s)=>['open','entry_pending','exit_pending','pending_recovery'].includes(s);
function r26Settings(overrides={}){
  return {
    ...originalSettings(), systemName:'SAGITTARIUS', ownerId:'r26-test', mode:'SIMULATION', liveArmed:false,
    engineActive:true, maxPositions:50, maxEntriesPerTrade:50, hunterCooldownMinutes:0, minGameMinutes:0,
    startingCapitalCents:10_000_000, simFillProbability:1,
    pegasusEnabled:true, sagittariusEnabled:true, dragonEnabled:false, goldenDragonEnabled:true,
    momentumHunterEnabled:true, waveSurferEnabled:true, recoveryHunterEnabled:true, crashRecoveryHunterEnabled:true, dragonRecoveryHunterEnabled:true,
    momentumMinEntryCents:70, momentumMaxEntryCents:89, momentumMinRiseCents:4, momentumMinPullbackCents:1, momentumMaxPullbackCents:12, momentumMaxSpreadCents:3, momentumMinTimeLeftMinutes:3,
    waveMinEntryCents:70, waveMaxEntryCents:89, waveMinFeederFavorableMoveCents:7, waveMaxSpreadCents:3,
    recoveryMinEntryCents:27, recoveryMaxEntryCents:65, recoveryMinReboundCents:15,
    goldenDragonMinSignalPriceCents:27, goldenDragonMaxSignalPriceCents:95, goldenDragonMaxEpisode:4, goldenDragonMinTrustScore:72, goldenDragonMinRecoveryAgeSeconds:30, goldenDragonMaxRecoveryAgeSeconds:240,
    ...overrides,
  };
}
function r26Clock(eventTicker,start){const now=Date.now();return{version:'GCA1',eventTicker,phase:'CONFIRMED',confirmed:true,startTimeMs:start,source:'kalshi_live_data',sourceStrength:'strong',observedAtMs:start,entryAuthorized:true,evidenceObservedAtMs:now,lastCheckedAtMs:now};}
function r26Quote(ticker='T',bid=79,ask=80,eventTicker=ticker){const now=Date.now(),start=now-90*60_000;return{ticker,title:ticker,eventTicker,seriesTicker:'KXMLBGAME',yesBid:bid,yesAsk:ask,volume24h:10000,updatedAtMs:now,status:'active',result:'',closeTimeMs:now+2*60*60_000,occurrenceTimeMs:now-100*60_000,gameStartTimeMs:start,gameClockState:r26Clock(eventTicker,start),liveStatus:'live'};}
function r26Db(){const rows=new Map();return{rows,audits:[],inserted:[],async entries(){return[...rows.values()];},async openEntriesByTicker(_s,t){return[...rows.values()].filter(e=>e.ticker===t&&r26OpenLike(e.status));},async insertEntry(e){rows.set(e.id,structuredClone(e));this.inserted.push(structuredClone(e));},async updateEntry(id,p){const e=rows.get(id);if(e)Object.assign(e,structuredClone(p));},async audit(level,event,data){this.audits.push({level,event,data});}};}
function r26Strategy({s=r26Settings(),candidate=r26Quote(),fresh=candidate,learning={recoveryRate:async()=>null},plan=null}={}){
  const d=r26Db();
  const executionPlan=plan || {filled:1000,full:true,avgCents:Number(fresh.yesAsk),bestCents:Number(fresh.yesAsk)};
  const market={async refreshTickerVerified(){return{quote:structuredClone(fresh),marketFresh:true,bookFresh:true};},executableAsk(){return structuredClone(executionPlan);},executableBid(_ticker,count){return{filled:count,full:true,avgCents:Number(fresh.yesBid),bestCents:Number(fresh.yesBid)};}};
  const refreshGameClock=async(qq)=>{const now=Date.now();return{gameClockState:{...qq.gameClockState,entryAuthorized:true,evidenceObservedAtMs:now,lastCheckedAtMs:now,authorizationSource:'kalshi_live_data'},gameStartTimeMs:qq.gameStartTimeMs,liveStatus:'live'};};
  return {d,st:new StrategyEngine({db:d,kalshi:{},market,learning,getSettings:()=>s,getLiveReady:()=>false,refreshGameClock,random:()=>0})};
}
function r26GoldenSignal(overrides={}){const now=Date.now();return{version:'CI1',episodeId:'CRASH:G:1',episodeIndex:1,preCrashPeakCents:70,troughCents:40,crashDepthCents:30,reboundCents:25,reclaimRate:.83,stableObservations:12,upwardTicks:5,crashStartedAtMs:now-90_000,troughAtMs:now-90_000,reboundConfirmedAtMs:now-45_000,sport:'CS2',lowerLowCount:0,reboundLostCount:0,...overrides};}

test('R26 Golden Dragon signal boundary rejects price outside configured signal band before trust can authorize it',()=>{
  const s=r26Settings({goldenDragonMinSignalPriceCents:55,goldenDragonMaxSignalPriceCents:89,goldenDragonMinTrustScore:1});
  const out=goldenDragonSignalQualifiedAtQuote(r26GoldenSignal({troughCents:20}),r26Quote('G',50,52),s,{goldenDragonSurvivalProfile:()=>({totalObservations:100,smoothedSurvivalRate:.99})});
  assert.equal(out.ok,false); assert.equal(out.reason,'signal_band');
});

test('R26 Golden Dragon trust threshold is a hard gate even when structure and signal price are valid',()=>{
  const s=r26Settings({goldenDragonMinSignalPriceCents:27,goldenDragonMaxSignalPriceCents:95,goldenDragonMinTrustScore:99});
  const out=goldenDragonSignalQualifiedAtQuote(r26GoldenSignal(),r26Quote('G',64,65),s,{goldenDragonSurvivalProfile:()=>({totalObservations:20,smoothedSurvivalRate:.7})});
  assert.equal(out.ok,false); assert.equal(out.reason,'trust_score'); assert.ok(out.score<99);
});

test('R26 centralized boundary helper rejects fresh Hunter quotes outside the Hunter own entry band',()=>{
  const out=hunterEntryBoundaryQualifiedAtQuote('Momentum Hunter',r26Quote('M',54,55),r26Settings(),{bestAskCents:55,averagePriceCents:55});
  assert.equal(out.ok,false); assert.equal(out.reason,'entry_band');
});

test('R26 createHunter blocks Momentum when force-fresh market falls below its entry floor',async()=>{
  const s=r26Settings(),candidate=r26Quote('M',79,80),fresh=r26Quote('M',54,55); const {d,st}=r26Strategy({s,candidate,fresh});
  const made=await st.createHunter('Momentum Hunter',candidate,20_000,20,{sourceFeeder:'Pegasus',sourceTradeId:'feed',entryQualificationSnapshot:{version:'MOMENTUM-Q1',feederEntryPriceCents:70,feederPeakPriceCents:84}});
  assert.equal(made,null); assert.equal(d.inserted.length,0); assert.ok(d.audits.some(x=>x.event==='hunter_pre_execution_doctrine_blocked'&&x.data.reason==='entry_band'));
});

test('R26 createHunter rechecks Momentum pullback after fresh book refresh and blocks stale qualification',async()=>{
  const s=r26Settings(),candidate=r26Quote('M2',79,80),fresh=r26Quote('M2',67,70); const {d,st}=r26Strategy({s,candidate,fresh});
  const made=await st.createHunter('Momentum Hunter',candidate,20_000,20,{sourceFeeder:'Pegasus',sourceTradeId:'feed',entryQualificationSnapshot:{version:'MOMENTUM-Q1',feederEntryPriceCents:70,feederPeakPriceCents:84}});
  assert.equal(made,null); assert.ok(d.audits.some(x=>x.event==='hunter_pre_execution_doctrine_blocked'&&x.data.reason==='momentum_pullback'));
});

test('R26 createHunter rechecks Wave favorable move against fresh executable-side bid',async()=>{
  const s=r26Settings(),candidate=r26Quote('W',78,79),fresh=r26Quote('W',75,76); const {d,st}=r26Strategy({s,candidate,fresh});
  const made=await st.createHunter('Wave Surfer',candidate,20_000,35,{sourceFeeder:'Pegasus',sourceTradeId:'feed',entryQualificationSnapshot:{version:'WAVE-Q1',feederEntryPriceCents:70}});
  assert.equal(made,null); assert.ok(d.audits.some(x=>x.event==='hunter_pre_execution_doctrine_blocked'&&x.data.reason==='wave_favorable_move'));
});

test('R26 createHunter rechecks Recovery rebound from frozen post-stop trough after refresh',async()=>{
  const s=r26Settings(),candidate=r26Quote('R',66,67),fresh=r26Quote('R',60,61); const {d,st}=r26Strategy({s,candidate,fresh});
  const made=await st.createHunter('Recovery Hunter',candidate,20_000,35,{sourceTradeId:'loss',recoverySourceSnapshot:{sourceTradeId:'loss',troughCents:50,reboundCents:16}});
  assert.equal(made,null); assert.ok(d.audits.some(x=>x.event==='hunter_pre_execution_doctrine_blocked'&&x.data.reason==='recovery_rebound'));
});

test('R26 createHunter rejects malformed execution depth that exceeds Hunter ceiling',async()=>{
  const s=r26Settings(),candidate=r26Quote('P',79,80),fresh=r26Quote('P',79,80); const {d,st}=r26Strategy({s,candidate,fresh,plan:{filled:1000,full:true,avgCents:92,bestCents:80}});
  const made=await st.createHunter('Momentum Hunter',candidate,20_000,20,{sourceFeeder:'Pegasus',sourceTradeId:'feed',entryQualificationSnapshot:{version:'MOMENTUM-Q1',feederEntryPriceCents:70,feederPeakPriceCents:84}});
  assert.equal(made,null); assert.ok(d.audits.some(x=>x.event==='hunter_pre_execution_doctrine_blocked'&&x.data.reason==='execution_price_band'));
});

test('R26 createHunter fails closed when feeder-driven Hunter reaches execution without qualification provenance',async()=>{
  const s=r26Settings(),candidate=r26Quote('Q',79,80); const {d,st}=r26Strategy({s,candidate,fresh:candidate});
  const made=await st.createHunter('Momentum Hunter',candidate,20_000,20,{sourceFeeder:'Pegasus',sourceTradeId:'feed'});
  assert.equal(made,null); assert.ok(d.audits.some(x=>x.event==='hunter_pre_execution_doctrine_blocked'&&x.data.reason==='qualification_context_missing'));
});

// R26 GDH1 industrial gate: Golden remains research/reference-only; GDH1 is a
// separate, fail-safe-OFF real exposure concept with an exact Golden episode as
// immutable provenance and a tighter executable capital envelope.
test('R26 GDH1 classification is real exposure while Golden Dragon stays reference-only and fail-safe OFF',()=>{
  assert.equal(FEEDER_CONCEPTS.has('Golden Dragon'),true);
  assert.equal(PORTFOLIO_CONCEPTS.has('Golden Dragon'),false);
  assert.equal(PORTFOLIO_CONCEPTS.has('Golden Dragon Hunter'),true);
  assert.equal(FEEDER_CONCEPTS.has('Golden Dragon Hunter'),false);
  const s=originalSettings();
  assert.equal(s.goldenDragonHunterEnabled,false);
  assert.equal(isModelEnabled(s,'Golden Dragon Hunter'),false);
  delete s.goldenDragonHunterEnabled;
  assert.equal(isModelEnabled(s,'Golden Dragon Hunter'),false,'missing GDH setting must fail safe OFF');
  delete s.dragonRecoveryHunterEnabled;
  assert.equal(isModelEnabled(s,'Dragon Recovery Hunter'),false,'missing DRH setting must fail safe OFF');
  delete s.crashRecoveryHunterEnabled;
  assert.equal(isModelEnabled(s,'Crash Recovery Hunter'),false,'missing CRH setting must fail safe OFF');
});

test('R26 GDH1 qualification independently enforces trust, episode, price, rebound, reclaim, stability, upward ticks and spread',()=>{
  const base=r26Settings({
    goldenDragonHunterEnabled:true,
    goldenDragonHunterMinEntryCents:55,goldenDragonHunterMaxEntryCents:89,
    goldenDragonHunterMinTrustScore:80,goldenDragonHunterMaxEpisode:2,
    goldenDragonHunterMinReboundCents:15,goldenDragonHunterMinReclaimRate:.55,
    goldenDragonHunterStableObservations:5,goldenDragonHunterUpwardTicks:3,
    goldenDragonHunterMaxSpreadCents:3,
  });
  const sig=r26GoldenSignal({troughCents:40,crashDepthCents:30,stableObservations:8,upwardTicks:4,episodeIndex:1});
  const gold={ok:true,score:85};
  assert.equal(goldenDragonHunterSignalQualifiedAtQuote(sig,r26Quote('G',64,65),base,gold).ok,true);
  assert.equal(goldenDragonHunterSignalQualifiedAtQuote(sig,r26Quote('G',64,65),base,{ok:true,score:79}).reason,'hunter_trust_score');
  assert.equal(goldenDragonHunterSignalQualifiedAtQuote({...sig,troughCents:30},r26Quote('G',53,54),base,gold).reason,'entry_band');
  assert.equal(goldenDragonHunterSignalQualifiedAtQuote(sig,r26Quote('G',89,90),base,gold).reason,'entry_band');
  assert.equal(goldenDragonHunterSignalQualifiedAtQuote({...sig,episodeIndex:3},r26Quote('G',64,65),base,gold).reason,'episode');
  assert.equal(goldenDragonHunterSignalQualifiedAtQuote(sig,r26Quote('G',39,40),base,gold).reason,'new_low');
  assert.equal(goldenDragonHunterSignalQualifiedAtQuote(sig,r26Quote('G',50,51),base,gold).reason,'rebound');
  assert.equal(goldenDragonHunterSignalQualifiedAtQuote({...sig,crashDepthCents:40},r26Quote('G',60,61),base,gold).reason,'reclaim');
  assert.equal(goldenDragonHunterSignalQualifiedAtQuote({...sig,stableObservations:4},r26Quote('G',64,65),base,gold).reason,'stable_observations');
  assert.equal(goldenDragonHunterSignalQualifiedAtQuote({...sig,upwardTicks:2},r26Quote('G',64,65),base,gold).reason,'upward_ticks');
  assert.equal(goldenDragonHunterSignalQualifiedAtQuote(sig,r26Quote('G',61,65),base,gold).reason,'spread');
});

test('R26 GDH1 evaluator requires an exact persisted Golden approval and cannot substitute Dragon V1',async()=>{
  const sig=strongGoldenSignal({episodeId:'CRASH:G:1:GDH'});
  const gold=goldenFeederRow(sig,{sourceTradeId:sig.episodeId});
  const s=settings({
    goldenDragonEnabled:true,goldenDragonHunterEnabled:true,recoveryHunterEnabled:false,
    goldenDragonHunterStakeCents:20000,goldenDragonHunterMinEntryCents:55,goldenDragonHunterMaxEntryCents:89,
    goldenDragonHunterStopLossCents:35,goldenDragonHunterMaxSpreadCents:3,goldenDragonHunterMinTrustScore:80,
    goldenDragonHunterMaxEpisode:2,goldenDragonHunterMinReboundCents:15,goldenDragonHunterMinReclaimRate:.55,
    goldenDragonHunterStableObservations:5,goldenDragonHunterUpwardTicks:3,
    goldenDragonMinTrustScore:72,goldenDragonMinRecoveryAgeSeconds:30,goldenDragonMaxRecoveryAgeSeconds:240,minGameMinutes:0,maxPositions:20,
  });
  const mem=dbWith([gold]);
  const st=new StrategyEngine({db:mem,kalshi:{},market:{},learning:goldenLearning(sig,{totalObservations:20,smoothedSurvivalRate:.9,specificity:'test'}),getSettings:()=>s,getLiveReady:()=>false});
  let captured=null;
  st.createHunter=async(concept,q,stake,stop,opt)=>{
    captured={concept,q,stake,stop,opt};
    const e={id:'gdh',conceptName:concept,ticker:q.ticker,eventTicker:q.eventTicker,status:'open',sourceFeeder:opt.sourceFeeder,sourceTradeId:opt.sourceTradeId,openedAtMs:Date.now()};
    mem.rows.push(structuredClone(e));
    return e;
  };
  const made=await st.evaluateGoldenDragonHunter(new Map([['G',quote('G',63,64)]]));
  assert.equal(made.length,1);
  assert.equal(captured.concept,'Golden Dragon Hunter');
  assert.equal(captured.opt.sourceFeeder,'Golden Dragon');
  assert.equal(captured.opt.sourceTradeId,sig.episodeId);
  assert.equal(captured.opt.goldenDragonHunterSourceSnapshot.goldenEpisodeId,sig.episodeId);
  assert.equal(captured.opt.goldenDragonHunterSourceSnapshot.gdhVersion,'GDH1');
  assert.equal((await st.evaluateGoldenDragonHunter(new Map([['G',quote('G',63,64)]]))).length,0,'same Golden episode must never create a second GDH');

  const dragonOnly=dbWith([dragonFeederRow({ticker:'G',eventTicker:'G',sourceTradeId:sig.episodeId})]);
  const st2=new StrategyEngine({db:dragonOnly,kalshi:{},market:{},learning:goldenLearning(sig,{totalObservations:20,smoothedSurvivalRate:.9}),getSettings:()=>s,getLiveReady:()=>false});
  let calls=0; st2.createHunter=async()=>{calls+=1;return null;};
  assert.equal((await st2.evaluateGoldenDragonHunter(new Map([['G',quote('G',63,64)]]))).length,0);
  assert.equal(calls,0,'Dragon V1 must never substitute for exact Golden approval');
});

test('R26 GDH1 cannot evaluate when either Golden or GDH is disabled',async()=>{
  const sig=strongGoldenSignal({episodeId:'CRASH:G:1:OFF'}),gold=goldenFeederRow(sig,{sourceTradeId:sig.episodeId});
  for(const overrides of [{goldenDragonEnabled:false,goldenDragonHunterEnabled:true},{goldenDragonEnabled:true,goldenDragonHunterEnabled:false}]){
    const s=settings({...overrides,recoveryHunterEnabled:false,goldenDragonHunterMinTrustScore:80,goldenDragonHunterMinEntryCents:55,goldenDragonHunterMaxEntryCents:89});
    const st=new StrategyEngine({db:dbWith([gold]),kalshi:{},market:{},learning:goldenLearning(sig,{totalObservations:20,smoothedSurvivalRate:.9}),getSettings:()=>s,getLiveReady:()=>false});
    let calls=0; st.createHunter=async()=>{calls+=1;return null;};
    assert.deepEqual(await st.evaluateGoldenDragonHunter(new Map([['G',quote('G',63,64)]])),[]);
    assert.equal(calls,0);
  }
});

function r26GdhContext(sig=r26GoldenSignal(), overrides={}){
  const now=Date.now();
  const source={
    version:'GOLDEN-DRAGON-V1',episodeId:String(sig.episodeId),episodeIndex:Number(sig.episodeIndex||1),
    preCrashPeakCents:Number(sig.preCrashPeakCents||0),troughCents:Number(sig.troughCents||0),crashDepthCents:Number(sig.crashDepthCents||0),
    reboundCents:Number(sig.reboundCents||0),reclaimRate:Number(sig.reclaimRate||0),stableObservations:Number(sig.stableObservations||0),upwardTicks:Number(sig.upwardTicks||0),
    crashStartedAtMs:Number(sig.crashStartedAtMs||0),troughAtMs:Number(sig.troughAtMs||0),reboundConfirmedAtMs:Number(sig.reboundConfirmedAtMs||0),
    lowerLowCount:Number(sig.lowerLowCount||0),reboundLostCount:Number(sig.reboundLostCount||0),sport:sig.sport||'CS2',
    signalAtMs:now-1000,signalPriceCents:65,validatedAskCents:65,validatedBidCents:64,trustScore:90,
    survivalProfile:{totalObservations:40,smoothedSurvivalRate:.95,specificity:'test'},referenceOrigin:'crash_trough',maxEpisode:10,
  };
  return {
    sourceFeeder:'Golden Dragon',sourceTradeId:String(sig.episodeId),
    sourceEntryConfig:{
      referenceStakeCents:3000,
      feeder:{minPriceCents:27,maxPriceCents:95,dropCents:0,maxEpisode:10,intelligence:'GOLDEN-DRAGON-V1',minTrustScore:72,minRecoveryAgeSeconds:30,maxRecoveryAgeSeconds:240},
      goldenDragonSource:source,
    },
    goldenFeedAuthority:{version:GOLDEN_FEED_BUS.version,feederId:'gold-1',ticker:'G',eventTicker:'G',episodeId:String(sig.episodeId),state:GOLDEN_FEED_BUS.activeState,activatedAtMs:now-500,lastObservationAtMs:now-100,lastBidCents:64,lastAskCents:65,stableObservations:Number(sig.stableObservations||0),upwardTicks:Number(sig.upwardTicks||0),source:structuredClone(source)},
    goldenDragonHunterSourceSnapshot:{goldenEpisodeId:String(sig.episodeId),goldenSignalId:'gold-1',goldenTrustScore:90,gdhVersion:'GDH1'},
    ...overrides,
  };
}
function r26GdhLearning(sig, profile={totalObservations:40,smoothedSurvivalRate:.95,specificity:'test'}){
  return {async observeCrashQuote(){},crashEntrySignal:()=>sig,goldenDragonSurvivalProfile:()=>profile,recoveryRate:async()=>null};
}

test('R26 GDH1 passes the full central execution chain and freezes its own + Golden provenance',async()=>{
  const sig=r26GoldenSignal(),q=r26Quote('G',64,65);
  const s=r26Settings({
    goldenDragonEnabled:true,goldenDragonHunterEnabled:true,recoveryHunterEnabled:false,
    goldenDragonHunterStakeCents:20000,goldenDragonHunterMinEntryCents:55,goldenDragonHunterMaxEntryCents:89,
    goldenDragonHunterStopLossCents:35,goldenDragonHunterMaxSpreadCents:3,goldenDragonHunterMinTrustScore:80,
    goldenDragonHunterMaxEpisode:2,goldenDragonHunterMinReboundCents:15,goldenDragonHunterMinReclaimRate:.55,
    goldenDragonHunterStableObservations:5,goldenDragonHunterUpwardTicks:3,
  });
  const {d,st}=r26Strategy({s,candidate:q,fresh:q,learning:r26GdhLearning(sig)});
  const made=await st.createHunter('Golden Dragon Hunter',q,20000,35,r26GdhContext(sig));
  assert.ok(made);
  assert.equal(d.inserted.length,1);
  assert.equal(made.conceptName,'Golden Dragon Hunter');
  assert.equal(made.sourceFeeder,'Golden Dragon');
  assert.equal(made.sourceTradeId,sig.episodeId);
  assert.equal(made.entryConfig.model.minEntryCents,55);
  assert.equal(made.entryConfig.model.minTrustScore,80);
  assert.equal(made.entryConfig.model.maxEpisode,2);
  assert.equal(made.entryConfig.feeder.minRecoveryAgeSeconds,30);
  assert.equal(made.entryConfig.feeder.maxRecoveryAgeSeconds,240);
  assert.equal(made.entryConfig.goldenDragonHunterSource.goldenEpisodeId,sig.episodeId);
  assert.equal(made.entryConfig.goldenDragonHunterSource.gdhVersion,'GDH1');
  assert.ok(Number(made.entryConfig.goldenDragonHunterSource.goldenTrustScore)>=80);
});

test('R26 GDH1 final execution boundary blocks a fresh price move outside its own band',async()=>{
  const sig=r26GoldenSignal(),candidate=r26Quote('G',64,65),fresh=r26Quote('G',53,54);
  const s=r26Settings({goldenDragonEnabled:true,goldenDragonHunterEnabled:true,goldenDragonHunterMinEntryCents:55,goldenDragonHunterMaxEntryCents:89,goldenDragonHunterMinTrustScore:80,goldenDragonHunterMaxEpisode:2});
  const {d,st}=r26Strategy({s,candidate,fresh,learning:r26GdhLearning(sig)});
  const made=await st.createHunter('Golden Dragon Hunter',candidate,20000,35,r26GdhContext(sig));
  assert.equal(made,null); assert.equal(d.inserted.length,0);
  assert.ok(d.audits.some(x=>x.event==='hunter_pre_execution_doctrine_blocked'&&x.data.reason==='entry_band'));
});

test('R31 GFB1 freezes Golden creation-time trust so transient rescoring cannot revoke an approved GDH feed',async()=>{
  const sig=r26GoldenSignal(),q=r26Quote('G',64,65);
  const s=r26Settings({goldenDragonEnabled:true,goldenDragonHunterEnabled:true,goldenDragonMinTrustScore:72,goldenDragonHunterMinTrustScore:80,goldenDragonHunterMinEntryCents:55,goldenDragonHunterMaxEntryCents:89,goldenDragonHunterMaxEpisode:2});
  const profile={totalObservations:40,smoothedSurvivalRate:.62,specificity:'test'};
  const transient=goldenDragonSignalQualifiedAtQuote(sig,q,s,{goldenDragonSurvivalProfile:()=>profile},Date.now());
  assert.equal(transient.ok,true); assert.ok(transient.score>=72&&transient.score<80,'fixture must prove a transient rescore below GDH threshold');
  const {d,st}=r26Strategy({s,candidate:q,fresh:q,learning:r26GdhLearning(sig,profile)});
  const made=await st.createHunter('Golden Dragon Hunter',q,20000,35,r26GdhContext(sig));
  assert.ok(made,'GFB1 must use the frozen approved trust, not transient Golden rescoring');
  assert.equal(d.inserted.length,1);
  assert.equal(made.entryConfig.goldenFeedAuthority.version,'GFB1');
  assert.equal(made.entryConfig.goldenDragonHunterSource.goldenTrustScore,90);
});

test('R26 GDH1 final Golden revalidation blocks an episode change before any fill',async()=>{
  const expected=r26GoldenSignal({episodeId:'CRASH:G:1'}),current=r26GoldenSignal({episodeId:'CRASH:G:2',episodeIndex:2});
  const q=r26Quote('G',64,65);
  const s=r26Settings({goldenDragonEnabled:true,goldenDragonHunterEnabled:true,goldenDragonHunterMinTrustScore:80,goldenDragonHunterMinEntryCents:55,goldenDragonHunterMaxEntryCents:89,goldenDragonHunterMaxEpisode:2});
  const {d,st}=r26Strategy({s,candidate:q,fresh:q,learning:r26GdhLearning(current)});
  const made=await st.createHunter('Golden Dragon Hunter',q,20000,35,r26GdhContext(expected));
  assert.equal(made,null); assert.equal(d.inserted.length,0);
  assert.ok(d.audits.some(x=>x.event==='golden_feed_authority_blocked'&&x.data.expectedEpisodeId===expected.episodeId&&x.data.reason==='exact_episode_superseded'));
});

test('R26 R13 exact-ticker lock treats GDH1 as a real Hunter and blocks simultaneous exposure',async()=>{
  const sig=r26GoldenSignal(),q=r26Quote('G',64,65);
  const s=r26Settings({goldenDragonEnabled:true,goldenDragonHunterEnabled:true,goldenDragonHunterMinTrustScore:80,goldenDragonHunterMinEntryCents:55,goldenDragonHunterMaxEntryCents:89,goldenDragonHunterMaxEpisode:2});
  const {d,st}=r26Strategy({s,candidate:q,fresh:q,learning:r26GdhLearning(sig)});
  d.rows.set('existing',{id:'existing',systemName:'SAGITTARIUS',ownerId:'r26-test',conceptName:'Momentum Hunter',ticker:'G',eventTicker:'G',status:'open',entryPriceCents:70,count:1,remainingCount:1,openedAtMs:Date.now()-1000,mode:'SIMULATION'});
  const made=await st.createHunter('Golden Dragon Hunter',q,20000,35,r26GdhContext(sig));
  assert.equal(made,null); assert.equal(d.inserted.length,0);
  assert.ok(d.audits.some(x=>x.event==='hunter_exact_ticker_exposure_blocked'&&x.data.existingConcept==='Momentum Hunter'));
});

test('R26 settings API validates GDH1 atomically and enforces its Golden dependency',async()=>{
  const engine=Object.create(SagittariusEngine.prototype);
  engine.settings=originalSettings(); let saved=null; engine.db={async saveSettings(v){saved=structuredClone(v);}};
  await assert.rejects(()=>engine.patchSettings({goldenDragonHunterEnabled:true}),/requires Golden Dragon/);
  const out=await engine.patchSettings({
    goldenDragonEnabled:true,goldenDragonHunterEnabled:true,goldenDragonHunterStakeCents:25000,
    goldenDragonHunterMinEntryCents:56,goldenDragonHunterMaxEntryCents:88,goldenDragonHunterStopLossCents:30,
    goldenDragonHunterMaxSpreadCents:2,goldenDragonHunterMinTrustScore:84,goldenDragonHunterMaxEpisode:2,
    goldenDragonHunterMinReboundCents:16,goldenDragonHunterMinReclaimRate:.6,
    goldenDragonHunterStableObservations:6,goldenDragonHunterUpwardTicks:4,
  });
  assert.equal(out.goldenDragonHunterEnabled,true); assert.equal(saved.goldenDragonHunterStakeCents,25000); assert.equal(saved.goldenDragonHunterMinTrustScore,84);
  await assert.rejects(()=>engine.patchSettings({goldenDragonHunterMinEntryCents:90,goldenDragonHunterMaxEntryCents:89}),/minimum entry/);
  await assert.rejects(()=>engine.patchSettings({goldenDragonHunterMinTrustScore:101}),/0 and 100/);
  await assert.rejects(()=>engine.patchSettings({goldenDragonHunterMaxEpisode:5}),/cannot exceed Golden Dragon/);
  await assert.rejects(()=>engine.patchSettings({goldenDragonHunterMinReclaimRate:1.1}),/between 0 and 1/);
  await assert.rejects(()=>engine.patchSettings({goldenDragonHunterStableObservations:3,goldenDragonHunterUpwardTicks:4}),/cannot exceed/);
  await assert.rejects(()=>engine.patchSettings({goldenDragonEnabled:false}),/requires Golden Dragon/);
});

test('R26 LIVE ownership and Profit Guard classify GDH1 as real exposure with GDH controls',async()=>{
  const {readFile}=await import('node:fs/promises');
  const dbSrc=await readFile(new URL('../src/db.mjs',import.meta.url),'utf8');
  const pgSrc=await readFile(new URL('../src/profitGuard.mjs',import.meta.url),'utf8');
  assert.ok(dbSrc.includes("'Golden Dragon Hunter'"),'GDH1 must be present in LIVE owned-Hunter reconciliation SQL');
  assert.ok(pgSrc.includes('goldenDragonHunterStopLossCents'));
  assert.ok(pgSrc.includes('goldenDragonHunterMaxSpreadCents'));
  const {profitGuardDecision}=await import('../src/profitGuard.mjs');
  const s={...originalSettings(),goldenDragonHunterStopLossCents:35};
  const e={conceptName:'Golden Dragon Hunter',entryPriceCents:70,stopLossCents:0,peakPriceCents:70,count:10,remainingCount:10,entryFeeCents:20,status:'open'};
  const d=profitGuardDecision(e,{yesBid:35,yesAsk:36,status:'active',result:''},s);
  assert.equal(d.action,'hard_stop'); assert.equal(d.stopPriceCents,35);
});

test('R26 diagnostics/UI distinguish Golden signal price from crash-trough reference origin and expose all GDH1 controls',async()=>{
  const engine=Object.create(SagittariusEngine.prototype);
  engine.settings={simFeeCents:2}; engine.profitGuard=null;
  engine.quoteView=()=>({priceCents:70,quoteAgeMs:0,dataState:'LIVE',q:{volume24h:1000,liveStatus:'live'}});
  const decorated=engine.decorateEntry({conceptName:'Golden Dragon',entryPriceCents:40,currentPriceCents:65,count:10,pnlCents:0,status:'open',openedAtMs:Date.now()-1000,entryConfig:{goldenDragonSource:{signalPriceCents:65}}});
  assert.equal(decorated.signalPriceCents,65); assert.equal(decorated.referenceOriginCents,40); assert.equal(decorated.referenceOrigin,'crash_trough');
  const {readFile}=await import('node:fs/promises');
  const app=await readFile(new URL('../public/app.js',import.meta.url),'utf8');
  const html=await readFile(new URL('../public/index.html',import.meta.url),'utf8');
  assert.ok(html.includes('Signal / Ref Origin'));
  assert.ok(app.includes('Signal ${pc(e.signalPriceCents)}'));
  for(const key of ['goldenDragonHunterEnabled','goldenDragonHunterStakeCents','goldenDragonHunterMinEntryCents','goldenDragonHunterMaxEntryCents','goldenDragonHunterStopLossCents','goldenDragonHunterMaxSpreadCents','goldenDragonHunterMinTrustScore','goldenDragonHunterMaxEpisode','goldenDragonHunterMinReboundCents','goldenDragonHunterMinReclaimRate','goldenDragonHunterStableObservations','goldenDragonHunterUpwardTicks']) assert.ok(app.includes(key),`${key} missing from GDH1 UI`);
});

test('R31 GFB1 does not re-run Golden creation-time signal band after approval; Momentum own executable doctrine remains authoritative',async()=>{
  const sig=r26GoldenSignal({episodeId:'CRASH:GM:1'});
  const candidate=r26Quote('GM',79,80),fresh=r26Quote('GM',64,65);
  const s=r26Settings({
    goldenDragonEnabled:true,goldenDragonMinSignalPriceCents:70,goldenDragonMaxSignalPriceCents:95,goldenDragonMinTrustScore:72,
    momentumMinEntryCents:55,momentumMaxEntryCents:89,momentumMinRiseCents:4,momentumMinPullbackCents:1,momentumMaxPullbackCents:12,momentumMinTimeLeftMinutes:0,
  });
  const ctx=r26GdhContext(sig);
  ctx.goldenFeedAuthority.ticker='GM'; ctx.goldenFeedAuthority.eventTicker='GM';
  for(const target of [ctx.sourceEntryConfig.goldenDragonSource,ctx.goldenFeedAuthority.source]){
    target.signalPriceCents=80; target.validatedAskCents=80; target.validatedBidCents=79; target.trustScore=90;
  }
  const {d,st}=r26Strategy({s,candidate,fresh,learning:r26GdhLearning(sig)});
  const made=await st.createHunter('Momentum Hunter',candidate,20000,20,{
    sourceFeeder:'Golden Dragon',sourceTradeId:sig.episodeId,sourceEntryConfig:ctx.sourceEntryConfig,goldenFeedAuthority:ctx.goldenFeedAuthority,
    entryQualificationSnapshot:{version:'MOMENTUM-Q1',feederEntryPriceCents:55,feederPeakPriceCents:75},
  });
  assert.ok(made,'current quote may leave Golden creation band after approval if Momentum own doctrine remains valid');
  assert.equal(d.inserted.length,1);
  assert.equal(d.audits.some(x=>x.event==='golden_feed_authority_blocked'),false);
});

test('R31 GFB1 does not re-run transient Golden trust after approval; frozen certified trust survives consumer execution',async()=>{
  const sig=r26GoldenSignal({episodeId:'CRASH:GT:1'}),q=r26Quote('GT',64,65);
  const s=r26Settings({
    goldenDragonEnabled:true,goldenDragonMinSignalPriceCents:27,goldenDragonMaxSignalPriceCents:95,goldenDragonMinTrustScore:95,
    momentumMinEntryCents:55,momentumMaxEntryCents:89,momentumMinRiseCents:4,momentumMinPullbackCents:1,momentumMaxPullbackCents:12,momentumMinTimeLeftMinutes:0,
  });
  const ctx=r26GdhContext(sig);
  ctx.goldenFeedAuthority.ticker='GT'; ctx.goldenFeedAuthority.eventTicker='GT';
  for(const target of [ctx.sourceEntryConfig.goldenDragonSource,ctx.goldenFeedAuthority.source]) target.trustScore=99;
  const profile={totalObservations:40,smoothedSurvivalRate:.70,specificity:'test'};
  const transient=goldenDragonSignalQualifiedAtQuote(sig,q,s,{goldenDragonSurvivalProfile:()=>profile},Date.now());
  assert.equal(transient.ok,false); assert.equal(transient.reason,'trust_score');
  const {d,st}=r26Strategy({s,candidate:q,fresh:q,learning:r26GdhLearning(sig,profile)});
  const made=await st.createHunter('Momentum Hunter',q,20000,20,{
    sourceFeeder:'Golden Dragon',sourceTradeId:sig.episodeId,sourceEntryConfig:ctx.sourceEntryConfig,goldenFeedAuthority:ctx.goldenFeedAuthority,
    entryQualificationSnapshot:{version:'MOMENTUM-Q1',feederEntryPriceCents:55,feederPeakPriceCents:75},
  });
  assert.ok(made,'frozen approved trust must remain valid even if a later Golden rescore would fail');
  assert.equal(d.inserted.length,1);
});

test('R26 Golden telemetry reports signal price as feeder statistic while preserving crash trough as immutable reference origin',async()=>{
  const engine=Object.create(SagittariusEngine.prototype);
  engine.quoteView=()=>({priceCents:70,q:{volume24h:1000},quoteAgeMs:0,dataState:'LIVE'});
  engine.settings={simFeeCents:2}; engine.profitGuard=null;
  const row={conceptName:'Golden Dragon',entryPriceCents:40,currentPriceCents:70,peakPriceCents:70,volume24h:1000,count:10,remainingCount:10,pnlCents:0,status:'open',openedAtMs:Date.now()-1000,entryConfig:{goldenDragonSource:{signalPriceCents:65,referenceOrigin:'crash_trough'}}};
  const stats=engine.buildConceptStats([row]).find(x=>x.name==='Golden Dragon');
  assert.equal(stats.avgEntryCents,65,'dashboard feeder statistic must represent the Golden signal, not the trough');
  const decorated=engine.decorateEntry(row);
  assert.equal(decorated.signalPriceCents,65); assert.equal(decorated.referenceOriginCents,40);
  engine.performance=async()=>({hunters:[],open:[],closed:[],wins:0,losses:0,scratches:0,hunterRealizedCents:0,active:[row]});
  const text=await engine.tradingLogText();
  assert.match(text,/Signal: 0\.65/); assert.match(text,/Ref origin: 0\.40 \(crash_trough\)/);
});

test('R26 UI mirrors backend fail-safe OFF semantics for all opt-in risk concepts',async()=>{
  const {readFile}=await import('node:fs/promises');
  const app=await readFile(new URL('../public/app.js',import.meta.url),'utf8');
  assert.ok(app.includes("const FAIL_SAFE_OFF_MODELS = new Set(['Dragon','Golden Dragon','Crash Recovery Hunter','Dragon Recovery Hunter','Golden Dragon Hunter'])"));
  assert.ok(app.includes("FAIL_SAFE_OFF_MODELS.has(name) ? s.settings[key] === true : s.settings[key] !== false"));
});

test('R26 DRH remains fail-closed if Golden is disabled by settings patch',async()=>{
  const engine=Object.create(SagittariusEngine.prototype);
  engine.settings=originalSettings(); let saved=false; engine.db={async saveSettings(){saved=true;}};
  await assert.rejects(()=>engine.patchSettings({dragonRecoveryHunterEnabled:true}),/requires Golden Dragon/);
  assert.equal(saved,false);
});

test('R27 GPI1 migration hardening repairs a persisted R26 impossible confirmation clock on the first distinct quote', () => {
  const settings={...originalSettings(),crashRecoveryMinCrashCents:15,crashRecoveryMinReboundCents:7,crashRecoveryMinReclaimRate:0.4,crashRecoveryStableObservations:3,crashRecoveryUpwardTicks:2,crashRecoveryEpisodeResetRate:0.95,goldenDragonMinCrashCents:15,goldenDragonMinReboundCents:7,goldenDragonMinReclaimRate:0.4,goldenDragonStableObservations:3,goldenDragonUpwardTicks:2};
  const oldTrough=1_000_000;
  const freshNow=1_120_000;
  const prior={
    version:'CI1',ticker:'MIG-CLOCK',eventTicker:'MIG-EVENT',marketTitle:'migration clock',sport:'Unknown',phase:'REBOUND_CONFIRMED',episodeCount:1,episodeIndex:1,
    episodeId:'CRASH:MIG-CLOCK:1:900000',rollingPeakCents:49,preCrashPeakCents:49,troughCents:30,crashDepthCents:19,crashStartedAtMs:900_000,troughAtMs:oldTrough,
    reboundConfirmedAtMs:950_000,resetAtMs:null,stableObservations:18,upwardTicks:4,lowerLowCount:2,reboundLostCount:14,reboundCents:15,reclaimRate:15/19,entryReady:true,
    lastBidCents:45,lastAskCents:46,lastObservationAtMs:1_100_000,lastEpisodeId:null,lastResetAtMs:null,pendingEntrySignal:null,finalResult:null,updatedAtMs:1_100_000,
  };
  const out=advanceCrashState(prior,{ticker:'MIG-CLOCK',eventTicker:'MIG-EVENT',title:'migration clock',yesBid:46,yesAsk:47},settings,freshNow);
  assert.equal(out.state.entryReady,true);
  assert.equal(out.state.reboundConfirmedAtMs,freshNow);
  assert.ok(out.state.reboundConfirmedAtMs >= out.state.troughAtMs);
  assert.equal(out.state.goldenReboundConfirmedAtMs,freshNow);
});

test('R27 GPI1 migration hardening cannot freeze an impossible R26 clock into an episode-reset snapshot', () => {
  const settings={...originalSettings(),crashRecoveryMinCrashCents:15,crashRecoveryMinReboundCents:7,crashRecoveryMinReclaimRate:0.4,crashRecoveryStableObservations:3,crashRecoveryUpwardTicks:2,crashRecoveryEpisodeResetRate:0.8,goldenDragonMinCrashCents:15,goldenDragonMinReboundCents:7,goldenDragonMinReclaimRate:0.4,goldenDragonStableObservations:3,goldenDragonUpwardTicks:2};
  const freshNow=2_000_000;
  const prior={
    version:'CI1',ticker:'MIG-RESET',eventTicker:'MIG-RESET-E',marketTitle:'migration reset',sport:'Unknown',phase:'REBOUND_CONFIRMED',episodeCount:1,episodeIndex:1,
    episodeId:'CRASH:MIG-RESET:1:1800000',rollingPeakCents:50,preCrashPeakCents:50,troughCents:30,crashDepthCents:20,crashStartedAtMs:1_800_000,troughAtMs:1_950_000,
    reboundConfirmedAtMs:1_850_000,resetAtMs:null,stableObservations:8,upwardTicks:4,lowerLowCount:1,reboundLostCount:2,reboundCents:15,reclaimRate:0.75,entryReady:true,
    lastBidCents:45,lastAskCents:46,lastObservationAtMs:1_990_000,lastEpisodeId:null,lastResetAtMs:null,pendingEntrySignal:null,finalResult:null,updatedAtMs:1_990_000,
  };
  const out=advanceCrashState(prior,{ticker:'MIG-RESET',eventTicker:'MIG-RESET-E',title:'migration reset',yesBid:47,yesAsk:48},settings,freshNow);
  assert.equal(out.transition,'EPISODE_RESET');
  assert.equal(out.state.pendingEntrySignal.reboundConfirmedAtMs,freshNow);
  assert.ok(out.state.pendingEntrySignal.reboundConfirmedAtMs >= out.state.pendingEntrySignal.troughAtMs);
  assert.equal(out.state.goldenPendingSignal.reboundConfirmedAtMs,freshNow);
});

test('R27 System 6 flood pipeline can produce Golden -> GDH1 simulated exposure end to end when all safety gates are valid', async () => {
  const s={...freshInstallSettings(),systemName:'SAGITTARIUS',ownerId:'r27-flood-e2e',mode:'SIMULATION',liveArmed:false,engineActive:true,simFillProbability:1,minGameMinutes:20,goldenDragonEnabled:true,goldenDragonHunterEnabled:true,pegasusEnabled:false,waveSurferEnabled:false,goldenDragonHunterStakeCents:40000,goldenDragonHunterMinEntryCents:45,goldenDragonHunterMaxEntryCents:89,goldenDragonHunterMinTrustScore:72,goldenDragonHunterMaxEpisode:10,goldenDragonHunterMinReboundCents:7,goldenDragonHunterMinReclaimRate:.55,goldenDragonHunterStableObservations:3,goldenDragonHunterUpwardTicks:2};
  const sig=r26GoldenSignal({
    episodeId:'CRASH:FLOOD:1:1',ticker:'FLOOD',eventTicker:'FLOOD-E',episodeIndex:1,
    preCrashPeakCents:70,troughCents:40,crashDepthCents:30,reboundCents:25,reclaimRate:25/30,
    stableObservations:12,upwardTicks:5,lowerLowCount:0,reboundLostCount:0,sport:'Test',
  });
  const q=r26Quote('FLOOD',88,89,'FLOOD-E');
  const profile={totalObservations:20,smoothedSurvivalRate:.90,specificity:'test'};
  const learning={
    goldenDragonEntrySignal:()=>sig,
    crashEntrySignal:()=>sig,
    goldenDragonSurvivalProfile:()=>profile,
    recoveryRate:async()=>null,
    async markGoldenDragonSignal(){},
  };
  const {d,st}=r26Strategy({s,candidate:q,fresh:q,learning});
  const map=new Map([['FLOOD',q]]);
  const golden=await st.evaluateGoldenDragon(map);
  assert.equal(golden.length,1,'clean flood recovery must materialize one Golden feeder signal');
  assert.equal(golden[0].conceptName,'Golden Dragon');
  assert.equal(golden[0].sourceTradeId,sig.episodeId);
  await st.refreshGoldenDragonFeedAuthorities(map);
  assert.equal(d.rows.get(golden[0].id).feederState.state,'ACTIVE','GFB1 must activate a matured exact Golden approval before consumers run');
  const hunters=await st.evaluateGoldenDragonHunter(map);
  assert.equal(hunters.length,1,'exact Golden approval must be consumable by GDH1');
  assert.equal(hunters[0].conceptName,'Golden Dragon Hunter');
  assert.equal(hunters[0].sourceFeeder,'Golden Dragon');
  assert.equal(hunters[0].sourceTradeId,sig.episodeId);
  assert.equal(hunters[0].mode,'SIMULATION');
  assert.ok(d.inserted.some(x=>x.conceptName==='Golden Dragon'));
  assert.ok(d.inserted.some(x=>x.conceptName==='Golden Dragon Hunter'));
});

test('R27 GPI2 WebSocket wake contract includes Golden-ready active and post-reset pending candidates even when CI1 entryReady is false', () => {
  const on={goldenDragonEnabled:true};
  assert.equal(crashPipelineReadyFromState({entryReady:false,goldenEntryReady:true},on),true);
  assert.equal(crashPipelineReadyFromState({entryReady:false,goldenEntryReady:false,goldenPendingSignal:{goldenEntryReady:true}},on),true);
  assert.equal(crashPipelineReadyFromState({entryReady:true,goldenEntryReady:false},{}),true,'ordinary CI1 readiness must remain sufficient for Dragon/CRH');
  assert.equal(crashPipelineReadyFromState({entryReady:false,goldenEntryReady:true},{goldenDragonEnabled:false}),false,'Golden-only readiness must not wake when Golden is disabled');
});

test('R27 GPI3 rejects a misleading Golden min-crash setting below the upstream CI1 episode floor', async () => {
  const engine=Object.create(SagittariusEngine.prototype);
  engine.settings={...freshInstallSettings(),goldenDragonEnabled:true};
  let saved=false; engine.db={async saveSettings(){saved=true;}};
  await assert.rejects(()=>engine.patchSettings({goldenDragonMinCrashCents:14}),/cannot be below CI1/);
  assert.equal(saved,false);
  const out=await engine.patchSettings({crashRecoveryMinCrashCents:12,goldenDragonMinCrashCents:12});
  assert.equal(out.crashRecoveryMinCrashCents,12); assert.equal(out.goldenDragonMinCrashCents,12); assert.equal(saved,true);
});

test('R27 GPI2 Momentum and Wave revalidate Golden feeders through the Golden signal lane when CI1 entry signal is absent', async () => {
  const sig=strongGoldenSignal({episodeId:'CRASH:G:1:GOLD-LANE'});
  const profile={totalObservations:20,smoothedSurvivalRate:.9,specificity:'test'};
  const learning={goldenDragonEntrySignal:()=>sig,crashEntrySignal:()=>null,goldenDragonSurvivalProfile:()=>profile,recoveryRate:async()=>null};
  const base={...freshInstallSettings(),systemName:'SAGITTARIUS',ownerId:'gold-lane',mode:'SIMULATION',engineActive:true,goldenDragonEnabled:true,goldenDragonHunterEnabled:false,recoveryHunterEnabled:false,crashRecoveryHunterEnabled:false,dragonRecoveryHunterEnabled:false,maxPositions:20,minGameMinutes:0};
  const q0={...r26Quote('G',64,65,'G'),gameStartTimeMs:Date.now()-90*60_000};

  for(const concept of ['Momentum Hunter','Wave Surfer']){
    const mem=dbWith([goldenFeederRow(sig,{currentPriceCents:65,peakPriceCents:70})]);
    const s={...base,momentumHunterEnabled:concept==='Momentum Hunter',waveSurferEnabled:concept==='Wave Surfer',momentumMinEntryCents:55,momentumMaxEntryCents:89,momentumMinRiseCents:2,momentumMinPullbackCents:1,momentumMaxPullbackCents:12,momentumMaxSpreadCents:3,momentumMinTimeLeftMinutes:0,waveMinEntryCents:55,waveMaxEntryCents:89,waveMinFeederFavorableMoveCents:2,waveMaxSpreadCents:3};
    const st=new StrategyEngine({db:mem,kalshi:{},market:{},learning,getSettings:()=>s,getLiveReady:()=>false});
    let captured=null; st.createHunter=async(c,q,stake,stop,opt)=>{captured={c,q,stake,stop,opt};return{id:`${c}-id`,conceptName:c,ticker:q.ticker,status:'open',openedAtMs:Date.now(),sourceFeeder:opt.sourceFeeder};};
    const made=await st.evaluateMomentumAndWave(new Map([['G',q0]]));
    assert.equal(made.length,1,`${concept} must not depend on CI1 crashEntrySignal for a Golden feeder`);
    assert.equal(captured.c,concept); assert.equal(captured.opt.sourceFeeder,'Golden Dragon');
  }
});

test('R27 GPI2 CRH evaluator can consume an exact Golden approval through the Golden signal lane when CI1 entry signal is absent', async () => {
  const sig=strongGoldenSignal({episodeId:'CRASH:G:1:CRH-GOLD'});
  const gold=goldenFeederRow(sig,{sourceTradeId:sig.episodeId});
  const profile={totalObservations:20,smoothedSurvivalRate:.9,specificity:'test'};
  const learning={goldenDragonEntrySignal:()=>sig,crashEntrySignal:()=>null,goldenDragonSurvivalProfile:()=>profile,recoveryRate:async()=>null};
  const s={...freshInstallSettings(),systemName:'SAGITTARIUS',ownerId:'crh-gold',mode:'SIMULATION',engineActive:true,goldenDragonEnabled:true,goldenDragonHunterEnabled:false,crashRecoveryHunterEnabled:true,dragonEnabled:false,recoveryHunterEnabled:false,maxPositions:20,minGameMinutes:0,crashRecoveryMinEntryCents:55,crashRecoveryMaxEntryCents:89,crashRecoveryMinReboundCents:7,crashRecoveryMinReclaimRate:.4,crashRecoveryStableObservations:3,crashRecoveryUpwardTicks:2};
  const mem=dbWith([gold]); const st=new StrategyEngine({db:mem,kalshi:{},market:{},learning,getSettings:()=>s,getLiveReady:()=>false});
  let captured=null; st.createHunter=async(c,q,stake,stop,opt)=>{captured={c,q,stake,stop,opt};return{id:'crh',conceptName:c,ticker:q.ticker,eventTicker:q.eventTicker,status:'open',openedAtMs:Date.now(),sourceFeeder:opt.sourceFeeder};};
  const made=await st.evaluateCrashRecovery(new Map([['G',r26Quote('G',64,65,'G')]]));
  assert.equal(made.length,1); assert.equal(captured.c,'Crash Recovery Hunter'); assert.equal(captured.opt.sourceFeeder,'Golden Dragon'); assert.equal(captured.opt.sourceTradeId,sig.episodeId);
});

test('R27 GPI2 CRH final execution revalidation keeps using Golden canonical signal instead of requiring CI1 entry signal', async () => {
  const sig=r26GoldenSignal({episodeId:'CRASH:G:1:CRH-EXEC'}),q=r26Quote('G',64,65);
  const profile={totalObservations:40,smoothedSurvivalRate:.95,specificity:'test'};
  const learning={goldenDragonEntrySignal:()=>sig,crashEntrySignal:()=>null,goldenDragonSurvivalProfile:()=>profile,recoveryRate:async()=>null,async observeCrashQuote(){}};
  const s={...r26Settings({goldenDragonEnabled:true,dragonEnabled:false,crashRecoveryHunterEnabled:true,goldenDragonHunterEnabled:false,dragonRecoveryHunterEnabled:false,recoveryHunterEnabled:false,crashRecoveryMinEntryCents:55,crashRecoveryMaxEntryCents:89}),goldenDragonMinCrashCents:15,goldenDragonMinReboundCents:7,goldenDragonMinReclaimRate:.4,goldenDragonStableObservations:3,goldenDragonUpwardTicks:2,goldenDragonMinRecoveryAgeSeconds:3,goldenDragonMaxRecoveryAgeSeconds:420,goldenDragonMaxEpisode:10};
  const {d,st}=r26Strategy({s,candidate:q,fresh:q,learning});
  const feed=goldenFeederRow(sig);
  const source=feed.entryConfig;
  const made=await st.createHunter('Crash Recovery Hunter',q,20_000,35,{sourceFeeder:'Golden Dragon',sourceTradeId:sig.episodeId,sourceEntryConfig:source,goldenFeedAuthority:{version:'GFB1',feederId:feed.id,ticker:'G',eventTicker:'G',episodeId:sig.episodeId,state:'ACTIVE',activatedAtMs:Date.now()-1000,lastObservationAtMs:Date.now()-100,lastBidCents:64,lastAskCents:65,stableObservations:sig.stableObservations,upwardTicks:sig.upwardTicks,source:structuredClone(source.goldenDragonSource)},crashSourceSnapshot:{episodeId:sig.episodeId,ticker:'G',eventTicker:'G',troughCents:sig.troughCents,crashDepthCents:sig.crashDepthCents,reboundCents:sig.reboundCents,reclaimRate:sig.reclaimRate,stableObservations:sig.stableObservations,upwardTicks:sig.upwardTicks}});
  assert.ok(made); assert.equal(d.inserted.length,1); assert.equal(made.conceptName,'Crash Recovery Hunter'); assert.equal(made.sourceFeeder,'Golden Dragon');
});

test('R27 GPI3 migration normalizes a persisted Golden crash floor to the actual CI1 detector floor without enabling any model', () => {
  const raw={...originalSettings(),goldenDragonEnabled:true,crashRecoveryMinCrashCents:20,goldenDragonMinCrashCents:15};
  const migrated=sanitizeRuntimeSettings(raw,originalSettings());
  assert.equal(migrated.goldenDragonMinCrashCents,20);
  const off=sanitizeRuntimeSettings({...raw,goldenDragonEnabled:false},originalSettings());
  assert.equal(off.goldenDragonMinCrashCents,15,'disabled Golden may retain a staged value until enable-time validation');
});


test('R28 production-chain simulation completes Golden -> GDH25 -> GCA2 -> executable BUY -> U-SG1 executable SELL -> closed accounting', async () => {
  const now=Date.now();
  const ticker='R28-E2E';
  const eventTicker='R28-EVENT';
  const seriesTicker='R28-SERIES';
  const milestoneId='R28-MILESTONE';
  const signal={
    version:'CI1', episodeId:`CRASH:${ticker}:1:${now-60_000}`, episodeIndex:1,
    preCrashPeakCents:80, troughCents:50, crashDepthCents:30,
    reboundCents:25, reclaimRate:25/30, stableObservations:20, upwardTicks:8,
    crashStartedAtMs:now-90_000, troughAtMs:now-60_000, reboundConfirmedAtMs:now-30_000,
    lowerLowCount:0, reboundLostCount:0, sport:'Test',
  };
  const s={
    ...originalSettings(), systemName:'SAGITTARIUS', ownerId:'r28-e2e', mode:'SIMULATION', liveArmed:false,
    engineActive:true, allowLiveTrading:false, maxPositions:20, maxEntriesPerTrade:1, hunterCooldownMinutes:700,
    minGameMinutes:20, startingCapitalCents:1_000_000, simFillProbability:1, simFeeCents:2,
    pegasusEnabled:false, sagittariusEnabled:false, dragonEnabled:false, goldenDragonEnabled:true,
    momentumHunterEnabled:false, waveSurferEnabled:false, recoveryHunterEnabled:false,
    crashRecoveryHunterEnabled:false, dragonRecoveryHunterEnabled:false, goldenDragonHunterEnabled:true,
    goldenDragonReferenceStakeCents:3000, goldenDragonMinSignalPriceCents:27, goldenDragonMaxSignalPriceCents:95,
    goldenDragonMaxEpisode:10, goldenDragonMinCrashCents:15, goldenDragonMinReboundCents:7,
    goldenDragonMinReclaimRate:.40, goldenDragonStableObservations:3, goldenDragonUpwardTicks:2,
    goldenDragonMinTrustScore:72, goldenDragonMinRecoveryAgeSeconds:3, goldenDragonMaxRecoveryAgeSeconds:840,
    goldenDragonHunterStakeCents:40_000, goldenDragonHunterMinEntryCents:45, goldenDragonHunterMaxEntryCents:89,
    goldenDragonHunterStopLossCents:35, goldenDragonHunterMaxSpreadCents:3,
    goldenDragonHunterMinTrustScore:72, goldenDragonHunterMaxEpisode:10,
    // The user's 25c GDH rebound is intentional and is part of this production-chain proof.
    goldenDragonHunterMinReboundCents:25, goldenDragonHunterMinReclaimRate:.55,
    goldenDragonHunterStableObservations:3, goldenDragonHunterUpwardTicks:2,
  };

  const rows=new Map();
  const audits=[];
  const clockStates=new Map();
  const db={
    async entries(){return [...rows.values()].map((x)=>structuredClone(x));},
    async insertEntry(e){rows.set(e.id,structuredClone(e));},
    async updateEntry(id,patch){const e=rows.get(id); if(e) Object.assign(e,structuredClone(patch));},
    async entryById(id){const e=rows.get(id); return e?structuredClone(e):null;},
    async openEntries(){return [...rows.values()].filter((e)=>r26OpenLike(e.status)&&PORTFOLIO_CONCEPTS.has(e.conceptName)).map((x)=>structuredClone(x));},
    async openEntriesByTicker(_system,t){return [...rows.values()].filter((e)=>e.ticker===t&&r26OpenLike(e.status)).map((x)=>structuredClone(x));},
    async audit(level,event,data){audits.push({level,event,data:structuredClone(data||{})});},
    async gameClockStates(_system,events){return new Map((events||[]).filter((e)=>clockStates.has(e)).map((e)=>[e,structuredClone(clockStates.get(e))]));},
    async upsertGameClockState(_system,event,state){clockStates.set(event,structuredClone(state));},
  };

  let current={
    ticker,eventTicker,seriesTicker,title:'R28 end-to-end',yesBid:88,yesAsk:89,volume24h:50_000,
    status:'active',result:'',updatedAtMs:Date.now(),liveStatus:'live',recentTrades:12,
    recentTradesObservedAtMs:Date.now(),occurrenceTimeMs:now+60*60_000,closeTimeMs:now+3*60*60_000,
    gameStartTimeMs:null,gameClockState:{version:'GCA2',eventTicker,phase:'UNKNOWN',confirmed:false,entryAuthorized:false},
  };
  let bookMs=Date.now();
  const executionCalls=[];
  const market={
    getQuote(t){return t===ticker?current:null;},
    getBook(t){return t===ticker?{updatedAtMs:bookMs}:null;},
    quoteAgeMs(){return 0;},
    async refreshTicker(){return structuredClone(current);},
    async refreshTickerVerified(){return{quote:structuredClone(current),marketFresh:true,bookFresh:true};},
    async ensureFreshBook(){bookMs=Math.max(bookMs+1,Date.now()); return true;},
    executableAsk(t,count,limit){
      if(t!==ticker||Number(current.yesAsk)>Number(limit))return null;
      executionCalls.push({side:'buy',count,priceCents:current.yesAsk});
      return{filled:count,full:true,avgCents:current.yesAsk,bestCents:current.yesAsk};
    },
    executableBid(t,count,floor){
      if(t!==ticker||Number(current.yesBid)<Number(floor))return null;
      executionCalls.push({side:'sell',count,priceCents:current.yesBid});
      return{filled:count,full:true,avgCents:current.yesBid,bestCents:current.yesBid};
    },
  };

  const kalshi={
    async getMilestonesForEvent(){return[];},
    async getMilestonesForSeriesEvent(evt,series){
      assert.equal(evt,eventTicker); assert.equal(series,seriesTicker);
      return[{id:milestoneId,category:'Sports',type:'test_match',primary_event_tickers:[eventTicker],related_event_tickers:[],start_date:new Date(now-2*60*60_000).toISOString(),end_date:new Date(now+2*60*60_000).toISOString()}];
    },
    async getLiveData(id){assert.equal(id,milestoneId);return{milestone_id:milestoneId,details:{status:'in_progress'}};},
    async getGameStats(){return null;},
    async getRecentTradesForTicker(t){assert.equal(t,ticker);return{count:12,lastPriceCents:current.yesBid,observedAtMs:Date.now()};},
  };
  let hardStops=0;
  const learning={
    goldenDragonEntrySignal:()=>signal,
    goldenDragonSurvivalProfile:()=>({totalObservations:20,smoothedSurvivalRate:.8,specificity:'test'}),
    async observeCrashQuote(){return signal;},
    async recoveryRate(){return null;},
    async stopGuardProfile(){return{totalObservations:0,smoothedRecoveryRate:.5,specificity:'none'};},
    async onHardStop(){hardStops+=1;},
  };

  clockStates.set(eventTicker,{
    version:'GCA1',eventTicker,phase:'CONFIRMED',confirmed:true,startTimeMs:now-30*60_000,
    source:'kalshi_live_data',sourceStrength:'strong',observedAtMs:now-30*60_000,
    entryAuthorized:false,evidenceObservedAtMs:null,lastCheckedAtMs:now-60_000,
  });
  const gca=new GameClockAuthority({kalshi,audit:async(event,data)=>db.audit('info',event,data)});
  const engine=Object.create(SagittariusEngine.prototype);
  Object.assign(engine,{market,kalshi,db,settings:s,gameClock:gca,lastScanMarkets:[current]});
  const strategy=new StrategyEngine({db,kalshi,market,learning,getSettings:()=>s,getLiveReady:()=>false,refreshGameClock:(q,opt)=>engine.refreshGameClockForQuote(q,opt),random:()=>0});
  const map=new Map([[ticker,current]]);
  const ghosts=await strategy.evaluateGoldenDragon(map);
  assert.equal(ghosts.length,1,'Golden must materialize the exact approved episode');
  await strategy.refreshGoldenDragonFeedAuthorities(map);
  assert.equal(rows.get(ghosts[0].id).feederState.state,'ACTIVE','matured Golden approval must become an active GFB1 feed before GDH consumes it');
  const hunters=await strategy.evaluateGoldenDragonHunter(map);
  assert.equal(hunters.length,1,'the intentionally strict 25c GDH must survive GCA2 and create exposure');
  const hunter=hunters[0];
  assert.equal(hunter.conceptName,'Golden Dragon Hunter');
  assert.equal(hunter.status,'open');
  assert.equal(hunter.entryPriceCents,89);
  assert.equal(hunter.stopLossCents,35);
  assert.equal(hunter.entryConfig?.model?.minReboundCents ?? hunter.entryConfig?.goldenDragonHunter?.minReboundCents ?? s.goldenDragonHunterMinReboundCents,25);
  assert.equal(hunter.entryConfig?.gameClockAuthority?.version,'GCA2');
  assert.equal(hunter.entryConfig?.gameClockAuthority?.entryAuthorizedAtEntry,true);
  assert.ok(Number(hunter.gameStartTimeMs)>0);
  assert.ok((Date.now()-Number(hunter.gameStartTimeMs))/60_000>=20);
  assert.ok(executionCalls.some((x)=>x.side==='buy'&&x.count===hunter.count&&x.priceCents===89));
  assert.ok(audits.some((x)=>x.event==='golden_dragon_hunter_created'));
  assert.equal(strategy.goldenPipelineSummary().byReason.hunter_created,1);

  // Drive the same persisted Hunter through the real protection machinery.
  // Entry 89 with a 35c frozen stop gives a 54c danger line. Under the restored
  // R41 doctrine this synthetic market gaps directly to 25c, so U-SG1 must
  // commit the emergency-boundary full-position exit immediately.
  current={...current,yesBid:25,yesAsk:26,updatedAtMs:Date.now(),recentTradesObservedAtMs:Date.now()};
  bookMs=Math.max(bookMs+10,Date.now());
  const guard=new ProfitGuard({db,kalshi,market,learning,getSettings:()=>s});
  const persistedOpen=await db.entryById(hunter.id);
  const exit=await guard.protect(persistedOpen);
  assert.equal(exit.closed,true,'U-SG1 must complete the simulated sell, not merely mark exit_pending');
  const closed=await db.entryById(hunter.id);
  assert.equal(closed.status,'closed');
  assert.equal(closed.remainingCount,0);
  assert.equal(closed.closeReason,'hard_stop_loss');
  assert.equal(closed.exitPriceCents,25);
  assert.equal(closed.exitFilledCount,hunter.count);
  assert.equal(closed.exitFeeCents,s.simFeeCents*hunter.count);
  assert.ok(closed.pnlCents<0);
  assert.equal(hardStops,1,'closed hard-stop trade must enter recovery learning exactly once');
  assert.ok(executionCalls.some((x)=>x.side==='sell'&&x.count===hunter.count&&x.priceCents===25),'simulation must execute the full owned quantity on the sell side');
  assert.equal(audits.some((x)=>x.event==='hard_economic_loss_ceiling_triggered'),false);
  assert.ok(audits.some((x)=>x.event==='usg1_exit_committed'&&x.data.exitReason==='emergency_boundary'));
});

test('R28 production sell-contract proof persists the receipt before broker mutation and sends exact owned quantity as LIVE sell', async () => {
  const now=Date.now();
  const ticker='R28-LIVE-SELL';
  const s={...originalSettings(),systemName:'SAGITTARIUS',ownerId:'r28-live-sell',mode:'LIVE',simFeeCents:2,goldenDragonHunterStopLossCents:35,goldenDragonHunterMaxSpreadCents:3};
  const entry={
    id:'r28-live-hunter',systemName:s.systemName,ownerId:s.ownerId,conceptName:'Golden Dragon Hunter',sourceFeeder:'Golden Dragon',sourceTradeId:'CRASH:R28-LIVE-SELL:1',
    ticker,eventTicker:'R28-LIVE-EVENT',marketTitle:'R28 LIVE sell contract',mode:'LIVE',status:'open',entryPriceCents:76,exitPriceCents:null,currentPriceCents:76,
    peakPriceCents:76,stopPriceCents:0,stopLossCents:35,count:100,remainingCount:100,volume24h:10000,spreadAtEntryCents:1,pnlCents:0,
    entryFeeCents:20,exitFeeCents:0,exitFilledCount:0,exitNotionalCents:0,entryOrderId:'buy-order',entryClientOrderId:null,exitOrderId:null,exitClientOrderId:null,
    gameStartTimeMs:now-40*60000,openedAtMs:now-60_000,updatedAtMs:now-1000,researchTrackingComplete:false,entryConfig:{},stopGuardState:{},profitGuardState:{},
  };
  const rows=new Map([[entry.id,structuredClone(entry)]]); const audits=[]; const orders=[];
  const db={
    async updateEntry(id,p){const e=rows.get(id);if(e)Object.assign(e,structuredClone(p));},
    async entryById(id){const e=rows.get(id);return e?structuredClone(e):null;},
    async audit(level,event,data){audits.push({level,event,data:structuredClone(data||{})});},
  };
  let current={ticker,eventTicker:entry.eventTicker,yesBid:25,yesAsk:26,status:'active',result:'',updatedAtMs:Date.now(),volume24h:10000};
  let bookMs=Date.now();
  const market={
    getQuote(){return structuredClone(current);}, quoteAgeMs(){return 0;}, async refreshTicker(){return structuredClone(current);},
    async ensureFreshBook(){bookMs=Math.max(bookMs+1,Date.now());return true;}, getBook(){return{updatedAtMs:bookMs};},
    executableBid(_t,count,floor){if(current.yesBid<floor)return null;return{filled:count,full:true,avgCents:25,bestCents:25};},
  };
  const kalshi={
    buildClientOrderId(owner,id,kind){return`${owner}:${id}:${kind}`;},
    async placeOrder(order){
      const persisted=rows.get(entry.id);
      assert.equal(persisted.status,'exit_pending','receipt must be durable before broker mutation');
      assert.equal(persisted.exitClientOrderId,order.clientOrderId,'same persisted client id must authorize the mutation');
      orders.push(structuredClone(order));
      return{orderId:'sell-order',fillCount:order.count,averageFillPriceCents:25,feePaidCents:20,ambiguous:false};
    },
  };
  let hardStops=0;
  const learning={async stopGuardProfile(){return{totalObservations:0,smoothedRecoveryRate:.5};},async onHardStop(){hardStops+=1;}};
  const guard=new ProfitGuard({db,kalshi,market,learning,getSettings:()=>s});
  const out=await guard.protect(await db.entryById(entry.id));
  assert.equal(out.closed,true);
  assert.deepEqual(orders,[{ticker,action:'sell',count:100,priceCents:25,clientOrderId:`${s.ownerId}:${entry.id}:exit`}]);
  const closed=await db.entryById(entry.id);
  assert.equal(closed.status,'closed'); assert.equal(closed.remainingCount,0); assert.equal(closed.exitOrderId,'sell-order');
  assert.equal(closed.exitClientOrderId,null); assert.equal(closed.exitPriceCents,25); assert.equal(closed.closeReason,'hard_stop_loss');
  assert.equal(hardStops,1); assert.ok(audits.some((x)=>x.event==='usg1_exit_committed'));
});

test('R28 connected failure-path keeps activity-only future-occurrence candidates fail-closed after the new pre-refresh sequencing', async () => {
  const now=Date.now(),ticker='R28-HOSTILE',eventTicker='R28-HOSTILE-EV';
  const s={...originalSettings(),systemName:'SAGITTARIUS',ownerId:'r28-hostile',mode:'SIMULATION',waveSurferEnabled:true,pegasusEnabled:true,maxPositions:20,maxEntriesPerTrade:1,hunterCooldownMinutes:0,minGameMinutes:20,startingCapitalCents:1_000_000,simFillProbability:1,waveMinEntryCents:80,waveMaxEntryCents:92,waveMinFeederFavorableMoveCents:8,waveMaxSpreadCents:3};
  const rows=[];const audits=[];const clocks=new Map();
  const db={async entries(){return rows.map((x)=>structuredClone(x));},async openEntriesByTicker(){return[];},async insertEntry(e){rows.push(structuredClone(e));},async audit(level,event,data){audits.push({level,event,data});},async gameClockStates(){return new Map(clocks);},async upsertGameClockState(_s,e,state){clocks.set(e,structuredClone(state));}};
  const candidate={ticker,eventTicker,seriesTicker:'R28-HOSTILE-SERIES',title:'hostile pregame activity',yesBid:85,yesAsk:86,volume24h:10000,recentTrades:100,recentTradesObservedAtMs:now,status:'active',result:'',updatedAtMs:now,occurrenceTimeMs:now+90*60_000,closeTimeMs:now+4*60*60_000,liveStatus:'live',gameStartTimeMs:null,gameClockState:{version:'GCA2',eventTicker,phase:'UNKNOWN',confirmed:false,entryAuthorized:false}};
  const market={getQuote(){return candidate;},async refreshTicker(){return candidate;},async refreshTickerVerified(){return{quote:candidate,marketFresh:true,bookFresh:true};},executableAsk(_t,count){return{filled:count,full:true,avgCents:86,bestCents:86};}};
  const kalshi={async getRecentTradesForTicker(){return{count:100,lastPriceCents:85,observedAtMs:Date.now()};},async getMilestonesForEvent(){return[];},async getMilestonesForSeriesEvent(){return[];}};
  const gca=new GameClockAuthority({kalshi,audit:async(event,data)=>db.audit('info',event,data)});
  const engine=Object.create(SagittariusEngine.prototype);Object.assign(engine,{market,kalshi,db,settings:s,gameClock:gca,lastScanMarkets:[candidate]});
  const st=new StrategyEngine({db,kalshi,market,learning:{},getSettings:()=>s,getLiveReady:()=>false,refreshGameClock:(q,opt)=>engine.refreshGameClockForQuote(q,opt),random:()=>0});
  const made=await st.createHunter('Wave Surfer',candidate,20_000,35,{sourceFeeder:'Pegasus',sourceTradeId:'hostile-feed',sourceEntryConfig:{},entryQualificationSnapshot:{version:'WAVE-Q1',feederId:'hostile-feed',feederConcept:'Pegasus',feederEntryPriceCents:76,candidateFavorableMoveCents:9,observedAtMs:now}});
  assert.equal(made,null);assert.equal(rows.length,0);
  assert.ok(audits.some((x)=>x.event==='hunter_clock_revalidation_blocked'&&x.data.entryAuthorized===false));
  assert.equal(clocks.get(eventTicker)?.reason,'activity_only_future_occurrence_blocked');
});

test('R31 GFB1 root-cause repair preserves a Golden approval across recovery-age expiry until the Hunter clock matures', async () => {
  const realNow=Date.now;
  const base=2_000_000_000_000;
  try {
    Date.now=()=>base+60_000;
    const sig=strongGoldenSignal({
      episodeId:'CRASH:G:1:GFB-CLOCK',episodeIndex:1,preCrashPeakCents:70,troughCents:40,crashDepthCents:30,
      reboundCents:23,reclaimRate:23/30,stableObservations:12,upwardTicks:5,
      crashStartedAtMs:base,troughAtMs:base+10_000,reboundConfirmedAtMs:base+30_000,
    });
    const feed=goldenFeederRow(sig);
    feed.feederState={...feed.feederState,state:'PENDING_CLOCK',reason:'min_game_minutes',activatedAtMs:null,gameMinutes:1};
    const mem=dbWith([feed]);
    const s=settings({
      goldenDragonEnabled:true,minGameMinutes:20,goldenDragonMinCrashCents:15,goldenDragonMinReboundCents:15,
      goldenDragonMinReclaimRate:.55,goldenDragonStableObservations:5,goldenDragonUpwardTicks:3,
      goldenDragonMinTrustScore:72,goldenDragonMinRecoveryAgeSeconds:3,goldenDragonMaxRecoveryAgeSeconds:700,
      goldenDragonMaxEpisode:10,goldenDragonMinSignalPriceCents:27,goldenDragonMaxSignalPriceCents:95,
    });
    const learning={goldenDragonEntrySignal:()=>sig,crashEntrySignal:()=>sig,goldenDragonSurvivalProfile:()=>({totalObservations:20,smoothedSurvivalRate:.8,specificity:'test'})};
    const st=new StrategyEngine({db:mem,kalshi:{},market:{},learning,getSettings:()=>s,getLiveReady:()=>false});
    const q1={...quote('G',63,64),gameStartTimeMs:base,gameClockState:r26Clock('G',base),liveStatus:'live'};
    await st.refreshGoldenDragonFeedAuthorities(new Map([['G',q1]]));
    assert.equal(mem.rows[0].feederState.state,'PENDING_CLOCK');

    Date.now=()=>base+20*60_000+1_000;
    const q2={...quote('G',63,64),updatedAtMs:Date.now(),gameStartTimeMs:base,gameClockState:r26Clock('G',base),liveStatus:'live'};
    const oldContinuousGate=goldenDragonSignalQualifiedAtQuote(sig,q2,s,learning,Date.now());
    assert.equal(oldContinuousGate.reason,'recovery_stale','the old continuous Golden gate is provably stale before the legal Hunter clock');
    assert.equal(goldenApprovalSnapshotQualified(mem.rows[0].entryConfig.goldenDragonSource,s).ok,true,'the persisted approval itself remains structurally certified');
    await st.refreshGoldenDragonFeedAuthorities(new Map([['G',q2]]));
    assert.equal(mem.rows[0].feederState.state,'ACTIVE','GFB1 must activate the durable approval after min-game maturity without re-running creation-time age');
    assert.ok(mem.rows[0].feederState.activatedAtMs>=Date.now());
  } finally {
    Date.now=realNow;
  }
});

test('R31 GFB1 preserves R28 GCA2 anti-deadlock: unknown scan clock is force-refreshed before feed activation', async () => {
  const sig=strongGoldenSignal({episodeId:'CRASH:G:1:GFB-GCA'});
  const feed=goldenFeederRow(sig,{feederState:{version:'GFB1',feederId:'gold-feed',episodeId:sig.episodeId,state:'PENDING_CLOCK',reason:'game_clock_unknown'}});
  const mem=dbWith([feed]);
  const s=settings({goldenDragonEnabled:true,minGameMinutes:20,goldenDragonMinCrashCents:15,goldenDragonMinReboundCents:15,goldenDragonMinReclaimRate:.55,goldenDragonStableObservations:5,goldenDragonUpwardTicks:3,goldenDragonMinTrustScore:72,goldenDragonMaxEpisode:10});
  const now=Date.now(),start=now-30*60_000;
  const q={...quote('G',63,64),gameStartTimeMs:null,gameClockState:{version:'GCA2',eventTicker:'G',phase:'UNKNOWN',confirmed:false,entryAuthorized:false},liveStatus:'live'};
  let refreshes=0;
  const st=new StrategyEngine({db:mem,kalshi:{},market:{},learning:goldenLearning(sig),getSettings:()=>s,getLiveReady:()=>false,refreshGameClock:async()=>{refreshes+=1;return{gameStartTimeMs:start,liveStatus:'live',gameClockState:{...r26Clock('G',start),version:'GCA2',entryAuthorized:true}};}});
  await st.refreshGoldenDragonFeedAuthorities(new Map([['G',q]]));
  assert.equal(refreshes,1);
  assert.equal(mem.rows[0].feederState.state,'ACTIVE');
  assert.ok(Number(mem.rows[0].feederState.gameMinutes)>=20);
});

test('R31 GFB1 exact-episode and trough safety remain fail-closed after activation', async () => {
  const sig=strongGoldenSignal({episodeId:'CRASH:G:1:GFB-SAFE',troughCents:40,crashDepthCents:30,reboundCents:23,reclaimRate:23/30});
  const s=settings({goldenDragonEnabled:true,minGameMinutes:0,goldenDragonMinCrashCents:15,goldenDragonMinReboundCents:15,goldenDragonMinReclaimRate:.55,goldenDragonStableObservations:5,goldenDragonUpwardTicks:3,goldenDragonMinTrustScore:72,goldenDragonMaxEpisode:10});
  const feed=goldenFeederRow(sig);
  const mem=dbWith([feed]);
  let current=sig;
  const st=new StrategyEngine({db:mem,kalshi:{},market:{},learning:{...goldenLearning(sig),goldenDragonEntrySignal:()=>current,crashEntrySignal:()=>current},getSettings:()=>s,getLiveReady:()=>false});
  const map=new Map([['G',r26Quote('G',63,64,'G')]]);
  await st.refreshGoldenDragonFeedAuthorities(map);
  assert.equal(mem.rows[0].feederState.state,'ACTIVE');
  current={...sig,episodeId:'CRASH:G:2:GFB-SAFE',episodeIndex:2};
  await st.refreshGoldenDragonFeedAuthorities(map);
  assert.equal(mem.rows[0].feederState.state,'SUPERSEDED');

  const feed2=goldenFeederRow(sig,{id:'gold-feed-2',feederState:{...goldenFeederRow(sig).feederState,feederId:'gold-feed-2',state:'ACTIVE'}});
  const mem2=dbWith([feed2]);
  const st2=new StrategyEngine({db:mem2,kalshi:{},market:{},learning:goldenLearning(sig),getSettings:()=>s,getLiveReady:()=>false});
  await st2.refreshGoldenDragonFeedAuthorities(new Map([['G',r26Quote('G',39,40,'G')]]));
  assert.equal(mem2.rows[0].feederState.state,'INVALID');
  assert.equal(mem2.rows[0].feederState.reason,'approved_trough_broken');
});

test('R31 GFB1 publishes Golden Dragon to every requested feeder-driven Hunter while Recovery Hunter remains stop-rescue-only', () => {
  assert.deepEqual([...GOLDEN_FEED_BUS.consumers],[
    'Golden Dragon Hunter','Momentum Hunter','Wave Surfer','Crash Recovery Hunter','Dragon Recovery Hunter',
  ]);
  assert.equal(GOLDEN_FEED_BUS.consumers.includes('Recovery Hunter'),false,'RH1 must preserve its post-stop rescue identity instead of becoming a direct feeder consumer');
});

test('R31 GFB1 persistence and orchestration contract is durable and runs before every Golden consumer stage', async () => {
  const {readFile}=await import('node:fs/promises');
  const dbSrc=await readFile(new URL('../src/db.mjs',import.meta.url),'utf8');
  const engineSrc=await readFile(new URL('../src/engine.mjs',import.meta.url),'utf8');
  assert.ok(dbSrc.includes("feeder_state jsonb not null default '{}'::jsonb"));
  assert.ok(dbSrc.includes("feederState:'feeder_state'"));
  const queue=engineSrc.slice(engineSrc.indexOf('queueCrashRecoveryEvaluation'),engineSrc.indexOf('async protectionLoop'));
  const chain=engineSrc.slice(engineSrc.indexOf('async evaluateEntryChain('),engineSrc.indexOf('async fullScan()'));
  for(const block of [queue,chain]){
    const golden=block.indexOf('evaluateGoldenDragon');
    const refresh=block.indexOf('refreshGoldenDragonFeedAuthorities');
    const gdh=block.indexOf('evaluateGoldenDragonHunter');
    assert.ok(golden>=0&&refresh>golden&&gdh>refresh,'Golden approval must be persisted/refreshed before GDH and other consumers execute');
  }
  const full=engineSrc.slice(engineSrc.indexOf('async fullScan()'),engineSrc.indexOf('async fastPhase(index)'));
  const fast=engineSrc.slice(engineSrc.indexOf('async fastPhase(index)'),engineSrc.indexOf('async cycleLoop()'));
  assert.ok(full.includes('evaluateEntryChain(markets, trackerMap, map)'));
  assert.ok(fast.includes('evaluateEntryChain(marketList, trackerMap, map)'));
});

test('R31 GFB1 terminal superseded and invalid feed states are irreversible and cannot zombie-reactivate', async () => {
  const sig=strongGoldenSignal({episodeId:'CRASH:G:1:GFB-LATCH',episodeIndex:1,troughCents:40,crashDepthCents:30,reboundCents:24,reclaimRate:.8});
  const s=settings({goldenDragonEnabled:true,minGameMinutes:0,goldenDragonMinCrashCents:15,goldenDragonMinReboundCents:15,goldenDragonMinReclaimRate:.55,goldenDragonStableObservations:5,goldenDragonUpwardTicks:3,goldenDragonMinTrustScore:72,goldenDragonMaxEpisode:10});
  for (const terminal of ['SUPERSEDED','INVALID']) {
    const feed=goldenFeederRow(sig,{id:`gold-${terminal}`,feederState:{...goldenFeederRow(sig).feederState,feederId:`gold-${terminal}`,state:terminal,reason:terminal==='SUPERSEDED'?'exact_episode_superseded':'approved_trough_broken',terminalAtMs:Date.now()-5000}});
    const mem=dbWith([feed]);
    const st=new StrategyEngine({db:mem,kalshi:{},market:{},learning:goldenLearning(sig),getSettings:()=>s,getLiveReady:()=>false});
    await st.refreshGoldenDragonFeedAuthorities(new Map([['G',r26Quote('G',70,71,'G')]]));
    assert.equal(mem.rows[0].feederState.state,terminal);
    assert.equal(mem.rows[0].feederState.reason,feed.feederState.reason);
    assert.equal(mem.rows[0].feederState.activatedAtMs,feed.feederState.activatedAtMs);
  }
});

test('R31 GFB1 freezes the Golden creation doctrine so later stricter settings cannot retroactively revoke a certified feed', async () => {
  const sig=strongGoldenSignal({episodeId:'CRASH:G:1:GFB-FROZEN',episodeIndex:1,troughCents:40,crashDepthCents:20,reboundCents:15,reclaimRate:.75,stableObservations:5,upwardTicks:3});
  const frozen={minPriceCents:27,maxPriceCents:95,maxEpisode:10,intelligence:'GOLDEN-DRAGON-V1',minCrashCents:15,minReboundCents:15,minReclaimRate:.55,stableObservations:5,upwardTicks:3,minTrustScore:72,minRecoveryAgeSeconds:3,maxRecoveryAgeSeconds:700};
  const feed=goldenFeederRow(sig,{entryConfig:{referenceStakeCents:3000,feeder:frozen,goldenDragonSource:{...goldenFeederRow(sig).entryConfig.goldenDragonSource,episodeId:sig.episodeId,episodeIndex:1,troughCents:40,crashDepthCents:20,reboundCents:15,reclaimRate:.75,stableObservations:5,upwardTicks:3,signalPriceCents:64,validatedAskCents:64,validatedBidCents:63,trustScore:85}}});
  feed.feederState={...feed.feederState,state:'PENDING_CLOCK',reason:'min_game_minutes'};
  const mem=dbWith([feed]);
  const current=settings({goldenDragonEnabled:true,minGameMinutes:0,goldenDragonMinCrashCents:35,goldenDragonMinReboundCents:35,goldenDragonMinReclaimRate:.90,goldenDragonStableObservations:20,goldenDragonUpwardTicks:10,goldenDragonMinTrustScore:95,goldenDragonMaxEpisode:2,goldenDragonMinSignalPriceCents:70,goldenDragonMaxSignalPriceCents:89});
  assert.equal(goldenApprovalSnapshotQualified(feed.entryConfig.goldenDragonSource,current).ok,false,'today\'s stricter settings would reject the historical approval if wrongly re-applied');
  assert.equal(goldenApprovalSnapshotQualified(feed.entryConfig.goldenDragonSource,frozen).ok,true,'the frozen creation doctrine must still certify the persisted approval');
  const st=new StrategyEngine({db:mem,kalshi:{},market:{},learning:goldenLearning(sig),getSettings:()=>current,getLiveReady:()=>false});
  await st.refreshGoldenDragonFeedAuthorities(new Map([['G',r26Quote('G',63,64,'G')]]));
  assert.equal(mem.rows[0].feederState.state,'ACTIVE');
  assert.equal(mem.rows[0].feederState.reason,'hunter_feed_active');
});

test('R31 GFB1 survives process restart from persisted crash state even when no transient Golden signal accessor remains', async () => {
  const sig=strongGoldenSignal({episodeId:'CRASH:G:1:GFB-RESTART',episodeIndex:1,troughCents:40,crashDepthCents:25,reboundCents:20,reclaimRate:.8,stableObservations:8,upwardTicks:4});
  const feed=goldenFeederRow(sig);
  feed.feederState={...feed.feederState,state:'PENDING_CLOCK',reason:'min_game_minutes',activatedAtMs:null};
  const persistedState={
    version:'CI1',ticker:'G',eventTicker:'G',marketTitle:'G',sport:'Test',phase:'NORMAL',episodeCount:1,episodeIndex:0,episodeId:null,
    rollingPeakCents:63,preCrashPeakCents:0,troughCents:0,crashDepthCents:0,crashStartedAtMs:null,troughAtMs:null,reboundConfirmedAtMs:null,goldenReboundConfirmedAtMs:null,
    goldenEntryReady:false,resetAtMs:null,stableObservations:0,upwardTicks:0,lowerLowCount:0,reboundLostCount:0,reboundCents:0,reclaimRate:0,entryReady:false,lastBidCents:63,lastAskCents:64,
    lastObservationAtMs:Date.now()-1000,lastEpisodeId:sig.episodeId,lastResetAtMs:Date.now()-2000,pendingEntrySignal:null,goldenPendingSignal:null,finalResult:null,updatedAtMs:Date.now()-1000,
  };
  const learningDb={
    async seedSportProfiles(){},
    async crashEpisodes(){return[];},
    async crashMarketStates(){return[{ticker:'G',event_ticker:'G',market_title:'G',sport:'Test',episode_count:1,updated_at_ms:String(Date.now()-1000),state:structuredClone(persistedState)}];},
  };
  const learning=new LearningEngine(learningDb,'SAGITTARIUS');
  await learning.init();
  assert.equal(learning.goldenDragonEntrySignal('G'),null,'restart state intentionally has no transient current Golden signal');
  assert.deepEqual(goldenFeedContinuity(feed.entryConfig.goldenDragonSource,learning.crashState('G'),null),{ok:true,state:'CONTINUOUS',reason:'exact_episode_retained'});

  const mem=dbWith([feed]);
  const s=settings({goldenDragonEnabled:true,minGameMinutes:20,goldenDragonMaxRecoveryAgeSeconds:1});
  const st=new StrategyEngine({db:mem,kalshi:{},market:{},learning,getSettings:()=>s,getLiveReady:()=>false});
  const start=Date.now()-30*60_000;
  await st.refreshGoldenDragonFeedAuthorities(new Map([['G',{...r26Quote('G',63,64,'G'),gameStartTimeMs:start,gameClockState:r26Clock('G',start)}]]));
  assert.equal(mem.rows[0].feederState.state,'ACTIVE','restart must preserve the certified feed authority instead of depending on an ephemeral current Golden signal');
});

test('R31 GFB1 last executable boundary blocks a Golden-fed Hunter if the force-fresh quote reveals a newer crash episode', async () => {
  const first=r26GoldenSignal({episodeId:'CRASH:G:1:GFB-RACE',episodeIndex:1,troughCents:40,crashDepthCents:30,reboundCents:25,reclaimRate:25/30,stableObservations:12,upwardTicks:5});
  const second={...first,episodeId:'CRASH:G:2:GFB-RACE',episodeIndex:2,troughCents:50,crashDepthCents:20,reboundCents:10,reclaimRate:.5};
  let current=first;
  const learning={
    recoveryRate:async()=>null,
    goldenDragonEntrySignal:()=>current,
    crashEntrySignal:()=>current,
    crashState:()=>({version:'CI1',ticker:'G',eventTicker:'G',phase:'CRASHING',episodeCount:current.episodeIndex,episodeIndex:current.episodeIndex,episodeId:current.episodeId,lastEpisodeId:current.episodeIndex>1?first.episodeId:null}),
    async observeCrashQuote(){current=second;},
  };
  const s=r26Settings({goldenDragonEnabled:true,momentumHunterEnabled:true,momentumMinEntryCents:70,momentumMaxEntryCents:89,momentumMinRiseCents:4,momentumMinPullbackCents:1,momentumMaxPullbackCents:12,momentumMinTimeLeftMinutes:0,minGameMinutes:0});
  const candidate=r26Quote('G',79,80,'G');
  const {d,st}=r26Strategy({s,candidate,fresh:candidate,learning});
  const feed=goldenFeederRow(first,{ticker:'G',eventTicker:'G'});
  const authority={version:'GFB1',feederId:feed.id,ticker:'G',eventTicker:'G',episodeId:first.episodeId,state:'ACTIVE',activatedAtMs:Date.now()-1000,lastObservationAtMs:Date.now()-100,lastBidCents:79,lastAskCents:80,stableObservations:first.stableObservations,upwardTicks:first.upwardTicks,creationDoctrine:structuredClone(feed.entryConfig.feeder),source:structuredClone(feed.entryConfig.goldenDragonSource)};
  const made=await st.createHunter('Momentum Hunter',candidate,20_000,35,{sourceFeeder:'Golden Dragon',sourceTradeId:feed.id,sourceEntryConfig:feed.entryConfig,goldenFeedAuthority:authority,entryQualificationSnapshot:{version:'MOMENTUM-Q1',feederId:feed.id,feederConcept:'Golden Dragon',feederEntryPriceCents:70,feederPeakPriceCents:84,candidatePullbackCents:5,observedAtMs:Date.now()}});
  assert.equal(made,null);
  assert.equal(d.inserted.length,0);
  assert.ok(d.audits.some((x)=>x.event==='golden_feed_authority_blocked'&&x.data.reason==='exact_episode_superseded'&&x.data.supersededByEpisodeId===second.episodeId));
});

test('R31 GFB1 certified System Six reproduction: old Golden freshness window cannot overlap the 20-minute Hunter authorization window', () => {
  const feederSignalAt=1787512687582;
  const reboundConfirmedAt=1787512682946;
  const confirmedGameStart=1787512688232;
  const observedCreateBlock=1787512722371;
  const nextCrashEpisodeAt=1787512732492;
  const maxRecoveryAgeMs=700_000;
  const minGameMs=20*60_000;
  const elapsedAtBlock=(observedCreateBlock-confirmedGameStart)/60_000;
  assert.ok(elapsedAtBlock>=0&&elapsedAtBlock<1,'the observed execution attempt is deterministically below the 20-minute Hunter floor');
  const oldGoldenExpiry=reboundConfirmedAt+maxRecoveryAgeMs;
  const firstLegalHunterAt=confirmedGameStart+minGameMs;
  assert.ok(oldGoldenExpiry<firstLegalHunterAt,'R30 continuous Golden requalification expires before Hunter entry can become legal');
  assert.equal(firstLegalHunterAt-oldGoldenExpiry,505286,'the non-overlap is 505,286 ms (8.421433 minutes)');
  assert.ok(nextCrashEpisodeAt<firstLegalHunterAt,'the exact approved episode is superseded long before the legal Hunter window');
  assert.ok(nextCrashEpisodeAt>feederSignalAt,'the feeder itself was created before supersession');

  const s=settings({minGameMinutes:20,goldenDragonEnabled:true,goldenDragonMinSignalPriceCents:27,goldenDragonMaxSignalPriceCents:95,goldenDragonMaxEpisode:10,goldenDragonMinCrashCents:25,goldenDragonMinReboundCents:30,goldenDragonMinReclaimRate:.4,goldenDragonStableObservations:3,goldenDragonUpwardTicks:2,goldenDragonMinTrustScore:72,goldenDragonMinRecoveryAgeSeconds:3,goldenDragonMaxRecoveryAgeSeconds:700});
  const sig=strongGoldenSignal({episodeId:'CRASH:KXARGNACBGAME-26AUG22CATAFM-AFM:2:1787512676816',episodeIndex:2,preCrashPeakCents:54,troughCents:18,crashDepthCents:36,reboundCents:36,reclaimRate:1,stableObservations:6,upwardTicks:4,lowerLowCount:1,reboundLostCount:0,crashStartedAtMs:1787512676816,troughAtMs:1787512676829,reboundConfirmedAtMs:reboundConfirmedAt, sport:'Unknown'});
  const q={...quote('KXARGNACBGAME-26AUG22CATAFM-AFM',54,57),eventTicker:'KXARGNACBGAME-26AUG22CATAFM',gameStartTimeMs:confirmedGameStart,gameClockState:{version:'GCA2',eventTicker:'KXARGNACBGAME-26AUG22CATAFM',phase:'CONFIRMED',confirmed:true,startTimeMs:confirmedGameStart,source:'occurrence_passed',sourceStrength:'fallback'},liveStatus:'live'};
  const oldGate=goldenDragonSignalQualifiedAtQuote(sig,q,s,{goldenDragonSurvivalProfile:()=>({totalObservations:21,smoothedSurvivalRate:.72,specificity:'sport_crash_episode'})},firstLegalHunterAt);
  assert.equal(oldGate.ok,false);
  assert.equal(oldGate.reason,'recovery_stale','R30 cannot consume this persisted approval at the first legal Hunter time because it reruns creation-time Golden freshness');
});

test('R31 GFB1 diagnostics expose durable feed lifecycle counts and recent exact-episode state', () => {
  const sig=strongGoldenSignal({episodeId:'CRASH:G:1:GFB-DIAG'});
  const active=goldenFeederRow(sig,{id:'g-active',feederState:{...goldenFeederRow(sig).feederState,feederId:'g-active',state:'ACTIVE',reason:'hunter_feed_active',gameMinutes:30,lastValidatedAtMs:200}});
  const pending=goldenFeederRow({...sig,episodeId:'CRASH:H:1:GFB-DIAG'},{id:'g-pending',ticker:'H',eventTicker:'H',sourceTradeId:'CRASH:H:1:GFB-DIAG',feederState:{...goldenFeederRow(sig).feederState,feederId:'g-pending',episodeId:'CRASH:H:1:GFB-DIAG',state:'PENDING_CLOCK',reason:'min_game_minutes',gameMinutes:8,lastValidatedAtMs:300}});
  const out=summarizeGoldenFeeds([active,pending,{conceptName:'Momentum Hunter'}]);
  assert.equal(out.version,'GFB1'); assert.equal(out.total,2); assert.equal(out.active,1);
  assert.deepEqual(out.byState,{ACTIVE:1,PENDING_CLOCK:1});
  assert.equal(out.byReason.hunter_feed_active,1); assert.equal(out.byReason.min_game_minutes,1);
  assert.equal(out.recent[0].feederId,'g-pending'); assert.equal(out.recent[0].episodeId,'CRASH:H:1:GFB-DIAG');
});

test('R31 GFB1 persisted approval self-validates creation-time recovery age without reapplying age at consumption time', () => {
  const now=Date.now();
  const sig=strongGoldenSignal({episodeId:'CRASH:G:1:GFB-AGE',troughAtMs:now-60_000,reboundConfirmedAtMs:now-45_000});
  const feed=goldenFeederRow(sig);
  const frozen={...feed.entryConfig.feeder,minRecoveryAgeSeconds:3,maxRecoveryAgeSeconds:700};
  assert.equal(goldenApprovalSnapshotQualified(feed.entryConfig.goldenDragonSource,frozen).ok,true);
  const staleAtCreation={...feed.entryConfig.goldenDragonSource,signalAtMs:Number(feed.entryConfig.goldenDragonSource.reboundConfirmedAtMs)+701_000};
  assert.equal(goldenApprovalSnapshotQualified(staleAtCreation,frozen).reason,'approval_recovery_stale_at_creation');
  const tooYoungAtCreation={...feed.entryConfig.goldenDragonSource,signalAtMs:Number(feed.entryConfig.goldenDragonSource.troughAtMs)+2_000,reboundConfirmedAtMs:Number(feed.entryConfig.goldenDragonSource.troughAtMs)+1_000};
  assert.equal(goldenApprovalSnapshotQualified(tooYoungAtCreation,frozen).reason,'approval_recovery_too_young');
});



test('R44 removal of HELC1 no longer rejects a Hunter solely because entry fee economics would have consumed the former hard ceiling',async()=>{
  const s=r26Settings({momentumMinEntryCents:27,momentumMaxEntryCents:89,momentumMinRiseCents:2,momentumMinPullbackCents:1,momentumMaxPullbackCents:12,simFeeCents:2,minGameMinutes:0,atomicThunderEnabled:true});
  const candidate=r26Quote('R44-NO-HELC',49,50),fresh=r26Quote('R44-NO-HELC',50,50);
  const {d,st}=r26Strategy({s,candidate,fresh,plan:{filled:2000,full:true,avgCents:50,bestCents:50}});
  const made=await st.createHunter('Momentum Hunter',candidate,100_000,35,{sourceFeeder:'Pegasus',sourceTradeId:'feed',entryQualificationSnapshot:{version:'MOMENTUM-Q1',feederEntryPriceCents:45,feederPeakPriceCents:52}});
  assert.ok(made,'former HELC1 entry-side rejection must be absent in R44');
  assert.equal(d.audits.some(x=>x.event==='hunter_entry_helc_feasibility_blocked'),false);
  const summary=st.entryPipelineSummary();
  assert.equal(Object.keys(summary.byStage).some(k=>k.startsWith('HELC_ENTRY_FEASIBILITY:')),false);
});

test('R44 removal of HELC1 does not require sell-side full exitability as an entry gate',async()=>{
  const s=r26Settings({momentumMinEntryCents:27,momentumMaxEntryCents:89,momentumMinRiseCents:2,momentumMinPullbackCents:1,momentumMaxPullbackCents:12,simFeeCents:2,minGameMinutes:0,atomicThunderEnabled:true});
  const candidate=r26Quote('R44-NO-HELC-DEPTH',49,50),fresh=r26Quote('R44-NO-HELC-DEPTH',49,50);
  const {d,st}=r26Strategy({s,candidate,fresh,plan:{filled:400,full:true,avgCents:50,bestCents:50}});
  st.market.executableBid=(_ticker,count)=>({filled:Math.min(10,count),full:false,avgCents:49,bestCents:49});
  const made=await st.createHunter('Momentum Hunter',candidate,20_000,35,{sourceFeeder:'Pegasus',sourceTradeId:'feed',entryQualificationSnapshot:{version:'MOMENTUM-Q1',feederEntryPriceCents:45,feederPeakPriceCents:52}});
  assert.ok(made,'pre-R42 entry doctrine must not add a new sell-depth veto');
  assert.equal(d.audits.some(x=>x.event==='hunter_entry_helc_feasibility_blocked'),false);
});

test('R44 removal of EQC1 no longer imposes an independent 30-minute R43 maturity gate',async()=>{
  const s=r26Settings({momentumMinEntryCents:27,momentumMaxEntryCents:89,momentumMinRiseCents:2,momentumMinPullbackCents:1,momentumMaxPullbackCents:12,simFeeCents:2,minGameMinutes:0,atomicThunderEnabled:true});
  const candidate=r26Quote('R44-NO-EQC-EARLY',49,50),fresh=r26Quote('R44-NO-EQC-EARLY',49,50);
  const start=Date.now()-29*60_000;
  candidate.gameStartTimeMs=start; candidate.gameClockState=r26Clock(candidate.eventTicker,start);
  fresh.gameStartTimeMs=start; fresh.gameClockState=r26Clock(fresh.eventTicker,start);
  const {d,st}=r26Strategy({s,candidate,fresh,plan:{filled:400,full:true,avgCents:50,bestCents:50}});
  const made=await st.createHunter('Momentum Hunter',candidate,20_000,35,{sourceFeeder:'Pegasus',sourceTradeId:'feed',entryQualificationSnapshot:{version:'MOMENTUM-Q1',feederEntryPriceCents:45,feederPeakPriceCents:52}});
  assert.ok(made,'editable shared minGameMinutes=0 must govern after EQC1 removal');
  assert.equal(d.audits.some(x=>x.event==='hunter_entry_r43_quality_blocked'),false);
  const summary=st.entryPipelineSummary();
  assert.equal(Object.keys(summary.byStage).some(k=>k.startsWith('R43_ENTRY_QUALITY:')),false);
});

test('R44 freezes Atomic Thunder profit-harvest policy into every new real Hunter entry without changing feeder ownership',async()=>{
  const s=r26Settings({momentumMinEntryCents:27,momentumMaxEntryCents:89,momentumMinRiseCents:2,momentumMinPullbackCents:1,momentumMaxPullbackCents:12,simFeeCents:2,minGameMinutes:0,atomicThunderEnabled:true,atomicThunderMinNetPerOriginalContractCents:1,atomicThunderRequiredConfirmations:2,atomicThunderMaximumBookAgeMs:1000,atomicThunderConfirmationWindowMs:3000});
  const candidate=r26Quote('R44-AT-SNAPSHOT',49,50),fresh=r26Quote('R44-AT-SNAPSHOT',49,50);
  const {st}=r26Strategy({s,candidate,fresh,plan:{filled:400,full:true,avgCents:50,bestCents:50}});
  const made=await st.createHunter('Momentum Hunter',candidate,20_000,35,{sourceFeeder:'Pegasus',sourceTradeId:'feed',entryQualificationSnapshot:{version:'MOMENTUM-Q1',feederEntryPriceCents:45,feederPeakPriceCents:52}});
  assert.ok(made);
  assert.equal(made.entryConfig.atomicThunder.version,'ATOMIC-THUNDER-V1');
  assert.equal(made.entryConfig.atomicThunder.enabledAtEntry,true);
  assert.equal(made.entryConfig.atomicThunder.minimumNetPerOriginalContractCents,1);
  assert.equal(made.entryConfig.atomicThunder.requiredFreshConfirmations,2);
  assert.equal(made.entryConfig.atomicThunder.fullPositionOnly,true);
  assert.equal(made.entryConfig.atomicThunder.lossAuthority,'U-SG1');
  assert.equal(Object.hasOwn(made.entryConfig,'entryQualityCovenant'),false);
});
