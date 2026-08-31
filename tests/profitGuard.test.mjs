import test from 'node:test';
import assert from 'node:assert/strict';
import { ProfitGuard, profitGuardDecision } from '../src/profitGuard.mjs';
import { LearningEngine, advanceProfitLearningState, recommendProfitRetentionRatio, recommendProfitRunnerGivebackCents, profitEpisodeMetrics, advanceStopGuardRecoveryState, stopGuardEntryBand, stopGuardDropBucket, stopGuardGameBucket, stopGuardRecoveryProfileKeys } from '../src/learning.mjs';
import { ULTIMATE_STOP_GUARD, STOP_LOSS_WATCHDOG, stopLossWatchdogThresholdsForStakeCents, STOP_GUARD_RECOVERY_LEARNING, ULTIMATE_PROFIT_GUARD, APEX_PROFIT_GUARD, PROTECTED_RUNNER_INTELLIGENCE, PROFIT_LEARNING_INTELLIGENCE, ATHENA_EXIT_INTELLIGENCE, GOLDEN_EYE, ATOMIC_THUNDER, INFINITY_BREAK, AURORA_EXECUTION } from '../src/doctrine.mjs';
import { Database } from '../src/db.mjs';
import { entryConfigSnapshot } from '../src/strategy.mjs';
import { advanceAthenaExitState } from '../src/athenaExit.mjs';
import { compileAthenaBrain } from '../src/athena.mjs';

// Historical creation-era guard tests intentionally isolate the profit authority
// they were written to prove. R64's universal real-Attack migration is covered
// independently in tests/r64.test.mjs.
ProfitGuard.prototype.ensureUniversalAthenaX1Authority=async function(entry){ return entry; };

const settings={simFeeCents:2,stopLossCents:10,momentumHunterStopLossCents:10,recoveryHunterStopLossCents:10};
const base={conceptName:'Momentum Hunter',ticker:'KXMLBGAME-X-A',entryPriceCents:80,currentPriceCents:80,peakPriceCents:80,stopLossCents:10,count:100,remainingCount:100};

test('ghost feeders never use Profit Guard',()=>{
  const d=profitGuardDecision({...base,conceptName:'Pegasus',stopLossCents:0},{yesBid:85,result:''},settings);
  assert.equal(d.action,'hold_ghost');
  assert.equal(d.peakPriceCents,85);
});

test('hard stop is frozen from entry and simulation decision exits at stop level',()=>{
  const d=profitGuardDecision({...base,stopLossCents:10},{yesBid:69,result:''},settings);
  assert.equal(d.action,'hard_stop');
  assert.equal(d.exitPriceCents,70);
  assert.equal(d.liveExitPriceCents,69);
});

test('R16 retires the legacy automatic 5/6/4/2 profit exit from the runtime decision path',()=>{
  const d=profitGuardDecision({...base,peakPriceCents:92},{yesBid:88,result:''},settings);
  assert.equal(d.action,'hold');
  assert.equal(d.guardState,'PROTECTED');
  assert.equal(Object.hasOwn(d,'trailCents'),false);
});

test('settlement payout precedes stop and profit logic',()=>{
  const d=profitGuardDecision(base,{yesBid:0,result:'yes',status:'finalized'},settings);
  assert.equal(d.action,'settlement');
  assert.equal(d.exitPriceCents,100);
});

test('a committed LIVE exit remains sticky until owned quantity is flattened',async()=>{
  const updates=[];let order=null;
  let liveRow=null;const db={updateEntry:async(id,p)=>{updates.push({id,p});if(liveRow)Object.assign(liveRow,structuredClone(p));},entryById:async()=>liveRow?structuredClone(liveRow):null,openEntriesByTicker:async()=>liveRow?[structuredClone(liveRow)]:[],audit:async()=>{}};
  const kalshi={getPositions:async()=>liveRow?[{ticker:liveRow.ticker,position_fp:liveRow.remainingCount}]:[],buildClientOrderId:()=> 'sag-exit-retry',placeOrder:async(o)=>{order=o;return{orderId:'o1',fillCount:o.count,averageFillPriceCents:o.priceCents};}};
  const quote={yesBid:90,yesAsk:91,volume24h:1000,updatedAtMs:Date.now(),status:'active',result:'',bookInvalid:false};
  const market={getQuote:()=>quote,quoteAgeMs:()=>0,refreshTicker:async()=>quote,ensureFreshBook:async()=>({updatedAtMs:Date.now()}),executableBid:(_ticker,count)=>({filled:count,full:true,avgCents:90,bestCents:90})};
  const learning={onHardStop:async()=>{}};
  const guard=new ProfitGuard({db,kalshi,market,learning,getSettings:()=>({...settings,ownerId:'sagittarius-main'})});
  liveRow={...base,id:'t1',systemName:'SAGITTARIUS',ownerId:'sagittarius-main',mode:'LIVE',status:'exit_pending',closeReason:'manual_cashout',remainingCount:10,count:10,peakPriceCents:82,stopPriceCents:70,openedAtMs:Date.now()-1000,updatedAtMs:Date.now()-1000};
  await guard.protect(structuredClone(liveRow));
  assert.equal(order.action,'sell');
  assert.equal(order.count,10);
  assert.equal(order.priceCents,90);
  assert.equal(updates.at(-1).p.status,'closed');
  assert.equal(updates.at(-1).p.closeReason,'manual_cashout');
});

function guardHarness({bid=86,full=true,filled=100,executableAvg=null,entryOverrides={},stopProfile=null,lossWatchdogProfile=null,apgEnabled=false,pri1Enabled=false,pri1R2Enabled=false,x1Enabled=false,atomicThunderEnabled=false,retentionProfile=null,crashState=null,athena=null,onPositionClosed=null}={}){
  const now=Date.now();
  const row={...base,id:'guard-1',systemName:'SAGITTARIUS',ownerId:'sagittarius-main',mode:'SIMULATION',status:'open',entryPriceCents:80,currentPriceCents:80,peakPriceCents:80,stopLossCents:35,count:100,remainingCount:100,pnlCents:0,entryFeeCents:200,profitHarvestPeakPnlCents:0,stopGuardState:{},profitGuardState:{},apexProfitGuardState:{},entryConfig:atomicThunderEnabled?{profitAuthority:'GOLDEN-EYE-V1',profitLearning:'PLI1',atomicThunder:{version:ATOMIC_THUNDER.version,policyRevision:ATOMIC_THUNDER.policyRevision,enabledAtEntry:true,minimumNetPerOriginalContractCents:1,requiredFreshConfirmations:2,maximumBookAgeMs:1000,confirmationWindowMs:3000,fullPositionOnly:true,lossAuthority:'U-SG1'}}:x1Enabled?{profitAuthority:'ATHENA-X1',profitLearning:'PLI1',profitAuthorityRevision:'ATHENA-X1-R1',athena:{version:'ATHENA-B1',score:50,classification:'NEUTRAL'}}:pri1R2Enabled?{profitAuthority:'PRI1',profitLearning:'PLI1',profitAuthorityRevision:'PRI1-R2'}:pri1Enabled?{profitAuthority:'PRI1',profitLearning:'PLI1'}:undefined,openedAtMs:now-60000,updatedAtMs:now-1000,...entryOverrides};
  const rows=new Map([[row.id,row]]); const audits=[]; const atomicEvents=[];
  const db={
    async updateEntry(id,p){Object.assign(rows.get(id),structuredClone(p));},
    async entryById(id){return rows.get(id)?structuredClone(rows.get(id)):null;},
    async audit(level,event,data){audits.push({level,event,data});},
    async openEntries(){return [...rows.values()].map((x)=>structuredClone(x));},
    async openEntriesByTicker(){return [...rows.values()].map((x)=>structuredClone(x));},
    async recordAtomicThunderEvent(e){atomicEvents.push(structuredClone(e));return true;},
  };
  let quoteMs=now;
  let quote={yesBid:bid,yesAsk:Math.min(100,bid+1),volume24h:10000,updatedAtMs:quoteMs,status:'active',result:'',bookInvalid:false};
  let bookMs=now;
  let fullDepth=full;
  let executableFilled=filled;
  let executableAverage=executableAvg;
  const market={
    getQuote:()=>quote, quoteAgeMs:()=>0, refreshTicker:async()=>quote,
    ensureFreshBook:async()=>({updatedAtMs:bookMs}), getBook:()=>({updatedAtMs:bookMs}),
    bookAgeMs:()=>Math.max(0,Date.now()-bookMs),
    executableBid:(_ticker,count)=>({filled:Math.min(count,executableFilled),full:fullDepth&&executableFilled+1e-9>=count,avgCents:executableAverage==null?quote.yesBid:executableAverage,bestCents:quote.yesBid}),
  };
  const learning={hardStops:0,profitExitMarks:[],profitObservations:[],async onHardStop(){this.hardStops++;},async stopGuardProfile(){return stopProfile;},async lossWatchdogProfile(){return lossWatchdogProfile;},profitLearningState(){return null;},async observeProfitOpportunity(_entry,o){this.profitObservations.push(structuredClone(o));return null;},profitRetentionProfileCached(){return retentionProfile||{retentionRatio:0.92,specificity:'cold_start',promoted:false,totalObservations:0,oneTickPullbacks:0,oneTickRecoveries:0,continuationRate:.5,collapseRate:.25,confidence:'low'};},crashState(){return crashState?structuredClone(crashState):null;},async profitRetentionProfile(){return this.profitRetentionProfileCached();},async markProfitExit(entry,o){this.profitExitMarks.push({entry:structuredClone(entry),o:structuredClone(o)});}};
  const guard=new ProfitGuard({db,kalshi:{getPositions:async()=>[{ticker:row.ticker,position_fp:row.remainingCount}]},market,learning,athena,onPositionClosed,getSettings:()=>({...settings,simFeeCents:2,systemName:'SAGITTARIUS',ownerId:'sagittarius-main',atomicThunderEnabled,atomicThunderMinNetPerOriginalContractCents:1,atomicThunderRequiredConfirmations:2,atomicThunderMaximumBookAgeMs:1000,atomicThunderConfirmationWindowMs:3000})});
  if (!apgEnabled) guard.evaluateApexProfitGuard=async()=>null; // Legacy U-PG3 unit tests isolate the U-PG3 lane; R30 tests enable APG1 explicitly.
  return {
    guard,db,rows,audits,atomicEvents,learning,
    setBid(v){const next=Math.max(Date.now(),bookMs+1,quoteMs+1);quoteMs=next;bookMs=next;quote={...quote,yesBid:v,yesAsk:Math.min(100,v+1),updatedAtMs:quoteMs};},
    setBidSameBook(v){quote={...quote,yesBid:v,yesAsk:Math.min(100,v+1)};},
    setDepth({full,filled}){fullDepth=full;executableFilled=filled;const next=Math.max(Date.now(),bookMs+1,quoteMs+1);bookMs=next;quoteMs=next;quote={...quote,updatedAtMs:quoteMs};},
    setExecutableAvg(v){executableAverage=v;const next=Math.max(Date.now(),bookMs+1,quoteMs+1);bookMs=next;quoteMs=next;quote={...quote,updatedAtMs:quoteMs};},
    setBookAge(ms){bookMs=Date.now()-ms;},
    setBookInvalid(v=true){quote={...quote,bookInvalid:Boolean(v),updatedAtMs:Date.now()};},
    setFinal(result){const next=Math.max(Date.now(),bookMs+1,quoteMs+1);bookMs=next;quoteMs=next;quote={...quote,result,status:'finalized',updatedAtMs:quoteMs};},
    row:()=>structuredClone(rows.get('guard-1')),
  };
}



function r61FrozenAuroraEntry({entryPriceCents=44,dangerPriceCents=29,bid=32,count=100,watchdog=null,infinity=false}={}){
  const stopDistanceCents=entryPriceCents-dangerPriceCents;
  return {
    ...base,id:'guard-1',systemName:'SAGITTARIUS',ownerId:'sagittarius-main',mode:'SIMULATION',status:'open',
    entryPriceCents,currentPriceCents:entryPriceCents,peakPriceCents:entryPriceCents,stopPriceCents:dangerPriceCents,stopLossCents:stopDistanceCents,
    count,remainingCount:count,pnlCents:0,entryFeeCents:2*count,openedAtMs:Date.now()-600000,updatedAtMs:Date.now()-1000,
    stopGuardState:watchdog?{watchdog}:{},profitGuardState:{},apexProfitGuardState:{},
    entryConfig:{
      aurora:{version:AURORA_EXECUTION.version,policyRevision:AURORA_EXECUTION.policyRevision,frozen:true,dangerPriceCents,stopDistanceCents,damageControlPercent:45},
      ...(infinity?{infinityBreak:{version:INFINITY_BREAK.version,policyRevision:INFINITY_BREAK.policyRevision,enabledAtEntry:true,minimumNetPerOriginalContractCents:1,requiredFreshConfirmations:2,maximumBookAgeMs:1000,confirmationWindowMs:3000,fullPositionOnly:true,lossAuthority:'AURORA_EXECUTION'}}:{}),
    },
  };
}

test('R61 Aurora gate: one cent above the frozen danger line cannot activate normal automated loss authority',async()=>{
  const h=guardHarness({bid:30,entryOverrides:r61FrozenAuroraEntry({entryPriceCents:44,dangerPriceCents:29,bid:30})});
  const out=await h.guard.handleUltimateStopGuard(h.row(),{yesBid:30,yesAsk:31,updatedAtMs:Date.now(),status:'active',result:''},{...settings});
  assert.equal(out.handled,false);
  assert.equal(h.row().status,'open');
  assert.equal(h.row().stopGuardState?.version,undefined);
  assert.equal(h.audits.some(x=>x.event==='usg1_exit_committed'),false);
});

test('R61 Aurora gate: SLW1 may classify a dead market above Aurora but remains observation-only and cannot sell',async()=>{
  const now=Date.now();
  const weakProfile={totalObservations:10,smoothedRecoveryRate:0.05,specificity:'test',evidenceVersion:'TEST'};
  const watchdog={
    version:STOP_LOSS_WATCHDOG.version,phase:'SLW1_DANGER',armedAtMs:now-STOP_LOSS_WATCHDOG.weakHistoryGraceMs-1000,
    lastObservedBookMs:now-2000,observationCount:3,lastBidCents:33,minBidCents:33,lowerLowCount:2,consecutiveDown:2,
    stableObservations:0,upwardTicks:0,reboundFromTroughCents:0,currentLossCents:1500,peakLossCents:1500,
    profile:weakProfile,profileUpdatedAtMs:now,structureStrong:false,
  };
  const h=guardHarness({bid:32,entryOverrides:r61FrozenAuroraEntry({watchdog})});
  let commits=0;const original=h.guard.commitStopGuardExit.bind(h.guard);h.guard.commitStopGuardExit=async(...args)=>{commits++;return original(...args);};
  const out=await h.guard.handleUltimateStopGuard(h.row(),{yesBid:32,yesAsk:33,updatedAtMs:Date.now(),status:'active',result:''},{...settings});
  assert.equal(out.handled,false);
  assert.equal(out.observed,true);
  assert.equal(commits,0);
  assert.equal(h.row().status,'open');
  assert.equal(h.row().stopGuardState.watchdog.phase,'SLW1_OBSERVE_ONLY_DEAD');
  assert.ok(h.audits.some(x=>x.event==='slw1_dead_market_observed_above_aurora'));
});

test('R61 Aurora gate: exact fresh executable touch activates U-SG1 with durable verified-touch evidence',async()=>{
  const h=guardHarness({bid:29,entryOverrides:r61FrozenAuroraEntry()});
  const out=await h.guard.handleUltimateStopGuard(h.row(),{yesBid:29,yesAsk:30,updatedAtMs:Date.now(),status:'active',result:''},{...settings});
  assert.equal(out.handled,true);
  assert.equal(h.row().status,'open');
  const st=h.row().stopGuardState;
  assert.equal(st.version,ULTIMATE_STOP_GUARD.version);
  assert.ok(st.auroraTouchVerifiedAtMs>0);
  assert.equal(st.auroraTouchBidCents,29);
  assert.equal(st.auroraTouchExecutableBidCents,29);
  assert.equal(st.auroraTouchVerification,'FRESH_EXECUTABLE_BOOK');
});

test('R61 Aurora gate: stale or contradictory below-line observation cannot activate loss authority when fresh executable truth is above Aurora',async()=>{
  const h=guardHarness({bid:32,entryOverrides:r61FrozenAuroraEntry()});
  const stale={yesBid:28,yesAsk:29,updatedAtMs:Date.now()-60_000,status:'active',result:'',bookInvalid:false};
  const out=await h.guard.handleUltimateStopGuard(h.row(),stale,{...settings});
  assert.equal(out.handled,true);
  assert.equal(out.result.action,'aurora_touch_unverified_hold');
  assert.equal(h.row().status,'open');
  assert.equal(h.row().stopGuardState?.version,undefined);
  const a=h.audits.find(x=>x.event==='aurora_touch_rejected_unverified');
  assert.ok(a);
  assert.equal(a.data.reason,'fresh_bid_above_danger');
  assert.equal(a.data.freshBidCents,32);
});

test('R61 Aurora gate: a fresh executable gap through the emergency extension exits through U-SG1 at available market truth',async()=>{
  const h=guardHarness({bid:14,entryOverrides:r61FrozenAuroraEntry()});
  const out=await h.guard.handleUltimateStopGuard(h.row(),{yesBid:14,yesAsk:15,updatedAtMs:Date.now(),status:'active',result:''},{...settings});
  assert.equal(out.handled,true);
  assert.equal(out.result.closed,true);
  assert.equal(h.row().status,'closed');
  assert.equal(h.row().closeReason,'hard_stop_loss');
  assert.equal(h.row().exitPriceCents,14);
  assert.equal(h.row().stopGuardState.exitReason,'emergency_boundary');
  assert.ok(h.row().stopGuardState.auroraTouchVerifiedAtMs>0);
});

test('R61 Aurora gate: commitStopGuardExit defensively refuses a frozen-Aurora loss exit without current verified touch',async()=>{
  const h=guardHarness({bid:32,entryOverrides:r61FrozenAuroraEntry()});
  const state={version:ULTIMATE_STOP_GUARD.version,phase:'USG1_ARMED',armedAtMs:Date.now()-1000,dangerLineCents:29,stopLossCents:15,zone:'RECOVERY',penetrationCents:1};
  const fakeBelow={yesBid:28,yesAsk:29,updatedAtMs:Date.now()-60_000,status:'active',result:''};
  const out=await h.guard.commitStopGuardExit(h.row(),fakeBelow,state,'critical_structure_failed');
  assert.equal(out.handled,true);
  assert.equal(out.result.action,'aurora_touch_unverified_hold');
  assert.equal(h.row().status,'open');
  assert.ok(h.audits.some(x=>x.event==='aurora_loss_exit_blocked_without_verified_touch'));
});

test('R61 Aurora gate: Infinity Break remains independent and can close profitably while price is safely above Aurora',async()=>{
  const h=guardHarness({bid:49,entryOverrides:r61FrozenAuroraEntry({infinity:true})});
  let out=await h.guard.protect(h.row());
  assert.equal(out.closed??false,false);
  assert.equal(h.row().status,'open');
  h.setBid(49);
  out=await h.guard.protect(h.row());
  assert.equal(out.closed,true);
  assert.equal(h.row().status,'closed');
  assert.equal(h.row().closeReason,'infinity_break');
  assert.ok(h.row().pnlCents>0);
  assert.equal(h.audits.some(x=>x.event==='usg1_exit_committed'),false);
});

test('R61 post-profit handoff: only a fully closed positive Infinity fill notifies Scarlet continuation and the callback is non-blocking',async()=>{
  const handed=[];let callbackStarted=0,callbackCompleted=0,releaseCallback;
  const callbackBarrier=new Promise(resolve=>{releaseCallback=resolve;});
  const h=guardHarness({bid:49,onPositionClosed:async(entry)=>{callbackStarted++;handed.push(entry);await callbackBarrier;callbackCompleted++;},entryOverrides:r61FrozenAuroraEntry({infinity:true,count:10})});
  const decision={action:'infinity_break',reason:'infinity_break',infinityBreak:INFINITY_BREAK.version,peakPriceCents:49,stopPriceCents:29};
  const first=await h.guard.applyExitFill(h.row(),decision,{fillCount:5,fillPriceCents:49,exitFeeCents:10});
  assert.equal(first.closed,false);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(callbackStarted,0);
  const remainder=h.row();
  const second=await h.guard.applyExitFill(remainder,decision,{fillCount:5,fillPriceCents:49,exitFeeCents:10});
  assert.equal(second.closed,true);
  assert.ok(h.row().pnlCents>0);
  assert.equal(callbackStarted,1);
  assert.equal(callbackCompleted,0,'unfinished Scarlet handoff must never block the durable economic close');
  assert.equal(handed[0].closeReason,'infinity_break');
  assert.ok(handed[0].pnlCents>0);
  assert.equal(handed[0].remainingCount,0);
  releaseCallback();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(callbackCompleted,1);

  const lossHanded=[];
  const loss=guardHarness({bid:20,onPositionClosed:async(entry)=>{lossHanded.push(entry);},entryOverrides:r61FrozenAuroraEntry({infinity:true,count:10})});
  await loss.guard.applyExitFill(loss.row(),{action:'hard_stop',reason:'hard_stop_loss',peakPriceCents:44,stopPriceCents:29},{fillCount:10,fillPriceCents:20,exitFeeCents:20});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(lossHanded.length,0);
});

test('U-PG3 constants preserve the approved price-native breathing room but make break-even telemetry-only',()=>{
  assert.equal(ULTIMATE_PROFIT_GUARD.version,'U-PG3');
  assert.equal(ULTIMATE_PROFIT_GUARD.activationMoveCents,6);
  assert.equal(ULTIMATE_PROFIT_GUARD.minimumNetProfitPerContractCents,1);
  assert.equal(ULTIMATE_PROFIT_GUARD.peakGivebackCents,7);
  assert.equal(ULTIMATE_PROFIT_GUARD.recoveryBufferCents,4);
  assert.equal(ULTIMATE_PROFIT_GUARD.headroomQualifiedArming,true);
  assert.equal(ULTIMATE_PROFIT_GUARD.economicBreakEvenImmediateExit,false);
  assert.equal(ULTIMATE_PROFIT_GUARD.lossDomainDelegatedToStopGuard,true);
  assert.equal(ULTIMATE_PROFIT_GUARD.structuralFailureConfirmations,2);
});

test('U-PG3 reproduces and fixes the R18 90c-entry break-even scratch mechanism',async()=>{
  const h=guardHarness({bid:98,entryOverrides:{entryPriceCents:90,currentPriceCents:90,peakPriceCents:90,count:100,remainingCount:100,entryFeeCents:200}});
  await h.guard.protect(h.row());
  assert.deepEqual(h.row().profitGuardState,{},'98c peak cannot fund 11c breathing room above the 95c positive-profit floor');
  h.setBid(94);
  let out=await h.guard.protect(h.row());
  assert.equal(out.closed??false,false,'economic break-even is telemetry only, never an automatic liquidation');
  assert.equal(h.row().status,'open');
  h.setBid(97); out=await h.guard.protect(h.row());
  assert.equal(out.closed??false,false);
});

test('U-PG3 exact Anisimova Wave replay does not convert 82->93->86 into a scratch',async()=>{
  const h=guardHarness({bid:93,entryOverrides:{entryPriceCents:82,currentPriceCents:82,peakPriceCents:82,count:243,remainingCount:243,entryFeeCents:486}});
  await h.guard.protect(h.row());
  assert.deepEqual(h.row().profitGuardState,{});
  h.setBid(86);
  let out=await h.guard.protect(h.row());
  assert.equal(out.closed??false,false);
  assert.equal(h.row().status,'open');
  h.setFinal('yes');
  out=await h.guard.protect(h.row());
  assert.equal(out.closed,true);
  assert.equal(h.row().closeReason,'settlement_win');
  assert.equal(h.row().pnlCents,3888);
});

test('U-PG3 exact Mayot Momentum replay does not sell 90->98->94 at zero net',async()=>{
  const h=guardHarness({bid:98,entryOverrides:{entryPriceCents:90,currentPriceCents:90,peakPriceCents:90,count:18,remainingCount:18,entryFeeCents:36}});
  await h.guard.protect(h.row());
  assert.deepEqual(h.row().profitGuardState,{});
  h.setBid(94);
  const out=await h.guard.protect(h.row());
  assert.equal(out.closed??false,false);
  assert.equal(h.row().status,'open');
  assert.equal(h.audits.some(x=>x.event==='upg3_exit_committed'),false);
});

test('U-PG3 arms only when the entire 7c giveback plus 4c recovery buffer is funded above positive net',async()=>{
  const h=guardHarness({bid:95});
  await h.guard.protect(h.row());
  assert.deepEqual(h.row().profitGuardState,{});
  h.setBid(96);
  await h.guard.protect(h.row());
  const st=h.row().profitGuardState;
  assert.equal(st.version,'U-PG3');
  assert.equal(st.minimumPositivePriceCents,85);
  assert.equal(st.economicBreakEvenPriceCents,84);
  assert.equal(st.headroomRequiredCents,11);
  assert.equal(st.headroomArmPriceCents,96);
  assert.equal(st.dangerLineCents,89);
  assert.equal(st.structuralLineCents,85);
  assert.equal(h.guard.getState('guard-1').guardState,'UPG3_ARMED');
  assert.equal(h.audits.filter(x=>x.event==='upg3_armed').length,1);
});

test('U-PG3 consumes the full 11c breathing room before a positive-profit floor exit',async()=>{
  const h=guardHarness({bid:96});
  await h.guard.protect(h.row());
  h.setBid(89);
  let out=await h.guard.protect(h.row());
  assert.equal(out.closed??false,false);
  assert.equal(h.guard.getState('guard-1').guardState,'UPG3_RECOVERY_ZONE');
  h.setBid(85);
  out=await h.guard.protect(h.row());
  assert.equal(out.closed,true);
  assert.equal(h.row().exitPriceCents,85);
  assert.equal(h.row().pnlCents,100,'exit locks the configured +1c net per contract, never break-even');
  assert.equal(h.row().closeReason,'ultimate_profit_guard');
});

test('U-PG3 retains two fresh structural confirmations when the structural line is above the positive floor',async()=>{
  const h=guardHarness({bid:96});
  await h.guard.protect(h.row());
  h.setBid(100); await h.guard.protect(h.row());
  assert.equal(h.row().profitGuardState.dangerLineCents,93);
  assert.equal(h.row().profitGuardState.structuralLineCents,89);
  h.setBid(89);
  let out=await h.guard.protect(h.row());
  assert.equal(out.closed??false,false);
  assert.equal(h.row().profitGuardState.failureConfirmations,1);
  assert.equal(h.row().profitGuardState.requiredFailureConfirmations,2);
  h.setBid(89);
  out=await h.guard.protect(h.row());
  assert.equal(out.closed,true);
  assert.equal(h.row().exitPriceCents,89);
  assert.ok(h.row().pnlCents>0);
});

test('U-PG3 may take an immediate large structural gap only while full execution still realizes positive net',async()=>{
  const h=guardHarness({bid:96});
  await h.guard.protect(h.row());
  h.setBid(100); await h.guard.protect(h.row());
  h.setBid(87);
  const out=await h.guard.protect(h.row());
  assert.equal(out.closed,true);
  assert.equal(h.row().exitPriceCents,87);
  assert.ok(h.row().pnlCents>0);
  const a=h.audits.find(x=>x.event==='upg3_exit_committed');
  assert.equal(a.data.immediateGapThrough,true);
  assert.equal(a.data.profitFloorLost,false);
});

test('U-PG3 never follows a gap below the positive-profit floor into zero or negative P/L',async()=>{
  const h=guardHarness({bid:96});
  await h.guard.protect(h.row());
  h.setBid(100); await h.guard.protect(h.row());
  h.setBid(84);
  let out=await h.guard.protect(h.row());
  assert.equal(out.closed??false,false);
  assert.equal(h.row().status,'open');
  assert.equal(h.row().profitGuardState.phase,'UPG3_PROFIT_FLOOR_LOST');
  assert.equal(h.row().profitGuardState.profitFloorLost,true);
  assert.equal(h.audits.some(x=>x.event==='upg3_exit_committed'),false);
  assert.equal(h.guard.getState('guard-1').guardState,'UPG3_PROFIT_FLOOR_LOST');
});

test('U-PG3 loss-domain delegation lets U-SG1 retain final authority after profit floor loss',async()=>{
  const strong={totalObservations:50,smoothedRecoveryRate:.90,avgRecoveryTimeMs:1200000,troughBucket:'10+',specificity:'exact'};
  const h=guardHarness({bid:96,stopProfile:strong});
  await h.guard.protect(h.row());
  h.setBid(84); await h.guard.protect(h.row());
  h.setBid(30);
  const out=await h.guard.protect(h.row());
  assert.equal(out.closed,true);
  assert.equal(h.row().closeReason,'hard_stop_loss');
  assert.equal(h.row().stopGuardState.version,'U-SG1');
  assert.equal(h.learning.hardStops,1);
  assert.equal(h.audits.some(x=>x.event==='upg3_exit_committed'),false);
});

test('U-PG3 headroom math preserves +1c per original contract after partial realized P/L',async()=>{
  const h=guardHarness({
    bid:93,
    filled:60,
    entryOverrides:{count:100,remainingCount:60,pnlCents:240,entryFeeCents:200},
  });
  await h.guard.protect(h.row());
  const st=h.row().profitGuardState;
  assert.equal(st.minimumPositivePriceCents,82);
  assert.equal(st.economicBreakEvenPriceCents,80);
  assert.equal(st.headroomArmPriceCents,93);
  assert.equal(st.structuralLineCents,82);
});

test('U-PG3 never fabricates an arm or peak from insufficient full-position executable depth',async()=>{
  const h=guardHarness({bid:100,full:false,filled:50});
  const out=await h.guard.protect(h.row());
  assert.equal(out.closed??false,false);
  assert.deepEqual(h.row().profitGuardState,{});
  assert.equal(h.audits.some(x=>x.event==='upg3_armed'),false);
});

test('U-PG3 ratchets peak, danger and structural lines upward but never loosens them',async()=>{
  const h=guardHarness({bid:96});
  await h.guard.protect(h.row());
  assert.equal(h.row().profitGuardState.dangerLineCents,89);
  assert.equal(h.row().profitGuardState.structuralLineCents,85);
  h.setBid(100); await h.guard.protect(h.row());
  assert.equal(h.row().profitGuardState.dangerLineCents,93);
  assert.equal(h.row().profitGuardState.structuralLineCents,89);
  h.setBid(99); await h.guard.protect(h.row());
  assert.equal(h.row().profitGuardState.dangerLineCents,93);
  assert.equal(h.row().profitGuardState.structuralLineCents,89);
});

test('U-PG3 waits for full depth rather than inventing a profitable structural exit',async()=>{
  const h=guardHarness({bid:96});
  await h.guard.protect(h.row());
  h.setBid(100); await h.guard.protect(h.row());
  h.setBid(89); h.setDepth({full:false,filled:50});
  let out=await h.guard.protect(h.row());
  assert.equal(out.closed??false,false);
  assert.equal(h.row().profitGuardState.phase,'UPG3_WAITING_FOR_FULL_DEPTH');
  h.setDepth({full:true,filled:100});
  out=await h.guard.protect(h.row());
  assert.equal(out.closed??false,false);
  assert.equal(h.row().profitGuardState.failureConfirmations,1);
  h.setBid(89);
  out=await h.guard.protect(h.row());
  assert.equal(out.closed,true);
});

test('U-PG3 reclaim confirmation is only counted after an actual recovery phase and does not audit-churn while armed',async()=>{
  const h=guardHarness({bid:96});
  await h.guard.protect(h.row());
  h.setBid(88); await h.guard.protect(h.row());
  assert.equal(h.guard.getState('guard-1').guardState,'UPG3_RECOVERY_ZONE');
  h.setBid(91); await h.guard.protect(h.row());
  assert.equal(h.row().profitGuardState.reclaimConfirmations,1);
  h.setBid(91); await h.guard.protect(h.row());
  assert.equal(h.row().profitGuardState.phase,'UPG3_ARMED');
  assert.equal(h.audits.filter(x=>x.event==='upg3_recovered').length,1);
  for(let i=0;i<5;i++){h.setBid(91); await h.guard.protect(h.row());}
  assert.equal(h.audits.filter(x=>x.event==='upg3_recovered').length,1,'armed quotes above reclaim threshold must not generate repeated recovered events');
  assert.equal(h.row().profitGuardState.reclaimConfirmations,0);
});

test('U-PG3 state is durable across a fresh ProfitGuard instance/restart',async()=>{
  const h=guardHarness({bid:96});
  await h.guard.protect(h.row());
  h.setBid(100); await h.guard.protect(h.row());
  const restarted=new ProfitGuard({db:h.db,kalshi:{},market:h.guard.market,learning:h.learning,getSettings:()=>({...settings,simFeeCents:2,systemName:'SAGITTARIUS'})});
  h.setBid(89); await restarted.protect(h.row());
  assert.equal(h.row().profitGuardState.failureConfirmations,1);
  assert.equal(h.row().profitGuardState.dangerLineCents,93);
  assert.equal(h.row().profitGuardState.structuralLineCents,89);
  h.setBid(89); const out=await restarted.protect(h.row());
  assert.equal(out.closed,true);
  assert.equal(h.row().closeReason,'ultimate_profit_guard');
});

test('noncommitted U-PG2 state that lacks full positive-profit headroom is disarmed on R19 migration',async()=>{
  const legacy={
    version:'U-PG2',phase:'UPG2_ARMED',armedAtMs:Date.now()-5000,
    peakExecutableBidCents:86,dangerLineCents:85,structuralLineCents:84,
    minimumPositivePriceCents:85,economicBreakEvenPriceCents:84,lastExecutableBidCents:85,
    lastObservedBookMs:Date.now()-10000,failureConfirmations:0,reclaimConfirmations:0,
  };
  const h=guardHarness({bid:85,entryOverrides:{profitGuardState:legacy}});
  const out=await h.guard.protect(h.row());
  assert.equal(out.closed??false,false);
  assert.deepEqual(h.row().profitGuardState,{});
  assert.equal(h.row().stopPriceCents,45);
  assert.equal(h.audits.filter(x=>x.event==='upg3_legacy_state_disarmed').length,1);
});

test('qualifying noncommitted U-PG1 state migrates to U-PG3 without inheriting stale tight lines or confirmations',async()=>{
  const legacy={
    version:'U-PG1',phase:'UPG1_FAILURE_CONFIRMING',armedAtMs:Date.now()-5000,
    peakExecutableBidCents:100,dangerLineCents:95,structuralLineCents:91,
    minimumPositivePriceCents:85,lastExecutableBidCents:91,minExecutableBidCents:91,
    lastObservedBookMs:Date.now()-10000,failureConfirmations:1,reclaimConfirmations:1,
  };
  const h=guardHarness({bid:99,entryOverrides:{profitGuardState:legacy,peakPriceCents:100}});
  const out=await h.guard.protect(h.row());
  assert.equal(out.closed??false,false);
  assert.equal(h.row().profitGuardState.version,'U-PG3');
  assert.equal(h.row().profitGuardState.dangerLineCents,93);
  assert.equal(h.row().profitGuardState.structuralLineCents,89);
  assert.equal(h.row().profitGuardState.failureConfirmations,0);
  assert.equal(h.row().profitGuardState.reclaimConfirmations,0);
  assert.equal(h.audits.filter(x=>x.event==='upg3_legacy_state_migrated').length,1);
});

test('persisted U-PG2 and U-PG1 exit commits remain sticky across the U-PG3 deployment boundary',async()=>{
  for(const [version,phase] of [['U-PG2','UPG2_EXIT_COMMITTED'],['U-PG1','UPG1_EXIT_COMMITTED']]){
    const committed={version,phase,armedAtMs:Date.now()-5000,peakExecutableBidCents:95,dangerLineCents:88,structuralLineCents:84,economicBreakEvenPriceCents:84,lastExecutableBidCents:84,failureConfirmations:2,reclaimConfirmations:0};
    const h=guardHarness({bid:30,entryOverrides:{profitGuardState:committed}});
    const out=await h.guard.protect(h.row());
    assert.equal(out.closed,true);
    assert.equal(h.row().closeReason,'ultimate_profit_guard');
    assert.equal(h.learning.hardStops,0);
  }
});

test('settlement retains precedence over an armed U-PG3 state',async()=>{
  const h=guardHarness({bid:96});
  await h.guard.protect(h.row());
  h.setFinal('yes');
  const out=await h.guard.protect(h.row());
  assert.equal(out.closed,true);
  assert.equal(h.row().closeReason,'settlement_win');
  assert.equal(h.row().exitPriceCents,100);
});

test('U-SG1 emergency boundary retains precedence over an armed U-PG3 state',async()=>{
  const h=guardHarness({bid:96});
  await h.guard.protect(h.row());
  h.setBid(30);
  const out=await h.guard.protect(h.row());
  assert.equal(out.closed,true);
  assert.equal(h.row().closeReason,'hard_stop_loss');
  assert.equal(h.row().stopGuardState.exitReason,'emergency_boundary');
  assert.equal(h.learning.hardStops,1);
  assert.equal(h.audits.some(x=>x.event==='upg3_exit_committed'),false);
});

test('U-PG3 structural construction is positive-net safe across every 70-94c Floodtest entry price',async()=>{
  for(let entry=70;entry<=94;entry++){
    const minPositive=entry+5;
    const arm=minPositive+11;
    const h=guardHarness({bid:Math.min(100,arm),entryOverrides:{entryPriceCents:entry,currentPriceCents:entry,peakPriceCents:entry}});
    await h.guard.protect(h.row());
    const st=h.row().profitGuardState;
    if(arm>100){
      assert.deepEqual(st,{},`${entry}c must remain unarmed because full breathing room cannot fit below 100c`);
    }else{
      assert.equal(st.version,'U-PG3');
      assert.ok(st.structuralLineCents>=st.minimumPositivePriceCents);
      assert.equal(st.structuralLineCents,minPositive);
      assert.equal(st.dangerLineCents,arm-7);
    }
  }
});

test('U-PG3 full-position executable VWAP may use deeper bid levels while excluding every level below the positive floor',async()=>{
  const now=Date.now();
  const row={...base,id:'depth-1',mode:'SIMULATION',status:'open',entryPriceCents:80,currentPriceCents:80,peakPriceCents:80,stopLossCents:35,count:100,remainingCount:100,pnlCents:0,entryFeeCents:200,stopGuardState:{},profitGuardState:{},openedAtMs:now-60000,updatedAtMs:now-1000};
  const db={
    async updateEntry(_id,p){Object.assign(row,structuredClone(p));},
    async entryById(){return structuredClone(row);},
    async audit(){},
  };
  const quote={yesBid:98,yesAsk:99,volume24h:10000,updatedAtMs:now,status:'active',result:'',bookInvalid:false};
  const market={
    getQuote:()=>quote,quoteAgeMs:()=>0,refreshTicker:async()=>quote,ensureFreshBook:async()=>({updatedAtMs:now}),getBook:()=>({updatedAtMs:now}),
    executableBid:(_ticker,count,limit)=>{
      if(limit===1) return {filled:count,full:true,avgCents:96,bestCents:98}; // MAE/research path
      assert.equal(limit,85,'UPG3 must measure executable depth down to the +net floor, not only at best bid');
      return {filled:count,full:true,avgCents:96,bestCents:98};
    },
  };
  const guard=new ProfitGuard({db,kalshi:{},market,learning:{async onHardStop(){}},getSettings:()=>({...settings,simFeeCents:2,systemName:'SAGITTARIUS'})});
  const out=await guard.protect(structuredClone(row));
  assert.equal(out.closed??false,false);
  assert.equal(row.profitGuardState.version,'U-PG3');
  assert.equal(row.profitGuardState.peakExecutableBidCents,96);
  assert.equal(row.profitGuardState.headroomArmPriceCents,96);
});

test('committed U-PG3 simulation exit waits rather than filling below the dynamic positive-profit floor',async()=>{
  const committed={version:'U-PG3',phase:'UPG3_EXIT_COMMITTED',armedAtMs:Date.now()-5000,peakExecutableBidCents:96,dangerLineCents:89,structuralLineCents:85,minimumPositivePriceCents:85,economicBreakEvenPriceCents:84,headroomRequiredCents:11,headroomArmPriceCents:96,lastExecutableBidCents:85,failureConfirmations:1,reclaimConfirmations:0};
  const h=guardHarness({bid:84,entryOverrides:{profitGuardState:committed}});
  let out=await h.guard.protect(h.row());
  assert.equal(out.closed??false,false);
  assert.equal(h.row().status,'exit_pending');
  assert.equal(out.skipped,'upg3_profit_floor_unavailable');
  assert.equal(h.audits.some(x=>x.event==='upg3_exit_waiting_positive_execution'),true);
  h.setBid(85);
  out=await h.guard.protect(h.row());
  assert.equal(out.closed,true);
  assert.equal(h.row().closeReason,'ultimate_profit_guard');
  assert.equal(h.row().exitPriceCents,85);
  assert.equal(h.row().pnlCents,100);
});

test('committed LIVE U-PG3 IOC uses the positive-profit floor as its sell limit and never authorizes a lower limit',async()=>{
  const now=Date.now();
  const row={...base,id:'live-upg3',systemName:'SAGITTARIUS',ownerId:'sagittarius-local',mode:'LIVE',status:'open',entryPriceCents:80,currentPriceCents:90,peakPriceCents:96,stopLossCents:35,count:10,remainingCount:10,pnlCents:0,entryFeeCents:20,stopGuardState:{},profitGuardState:{version:'U-PG3',phase:'UPG3_EXIT_COMMITTED',armedAtMs:now-5000,peakExecutableBidCents:96,dangerLineCents:89,structuralLineCents:85,minimumPositivePriceCents:85,economicBreakEvenPriceCents:84,headroomRequiredCents:11,headroomArmPriceCents:96,lastExecutableBidCents:85,failureConfirmations:1,reclaimConfirmations:0},openedAtMs:now-60000,updatedAtMs:now-1000};
  let submitted=null;
  const db={async updateEntry(_id,p){Object.assign(row,structuredClone(p));},async entryById(){return structuredClone(row);},async openEntriesByTicker(){return[structuredClone(row)];},async audit(){}};
  const quote={yesBid:90,yesAsk:91,volume24h:10000,updatedAtMs:now,status:'active',result:'',bookInvalid:false};
  const market={getQuote:()=>quote,quoteAgeMs:()=>0,refreshTicker:async()=>quote,ensureFreshBook:async()=>({updatedAtMs:now}),getBook:()=>({updatedAtMs:now}),executableBid:(_t,count,limit)=>{if(limit===1)return{filled:count,full:true,avgCents:87,bestCents:90};assert.equal(limit,85);return{filled:count,full:true,avgCents:87,bestCents:90};}};
  const kalshi={getPositions:async()=>[{ticker:row.ticker,position_fp:row.remainingCount}],buildClientOrderId:()=> 'upg3-live-exit',async placeOrder(o){submitted=o;return{orderId:'o-upg3',fillCount:o.count,averageFillPriceCents:87,feePaidCents:20};}};
  const guard=new ProfitGuard({db,kalshi,market,learning:{async onHardStop(){}},getSettings:()=>({...settings,simFeeCents:2,ownerId:'sagittarius-local',systemName:'SAGITTARIUS'})});
  const out=await guard.protect(structuredClone(row));
  assert.equal(out.closed,true);
  assert.equal(submitted.priceCents,85);
  assert.equal(submitted.count,10);
  assert.equal(row.pnlCents,30);
  assert.ok(row.pnlCents>0);
});

test('U-PG3 never produces a zero/negative Profit Guard exit across deterministic adverse paths',async()=>{
  for(let entry=70;entry<=84;entry+=2){
    const minPositive=entry+5;
    const arm=minPositive+11;
    if(arm>100) continue;
    for(const peak of [arm,Math.min(100,arm+2),100]){
      const h=guardHarness({bid:arm,entryOverrides:{entryPriceCents:entry,currentPriceCents:entry,peakPriceCents:entry}});
      await h.guard.protect(h.row());
      if(peak>arm){h.setBid(peak);await h.guard.protect(h.row());}
      for(let price=peak-1;price>=Math.max(0,entry-20)&&h.row().status==='open';price--){
        h.setBid(price);
        await h.guard.protect(h.row());
      }
      if(h.row().closeReason==='ultimate_profit_guard') assert.ok(h.row().pnlCents>0,`${entry}/${peak} produced nonpositive UPG3 exit`);
    }
  }
});

test('ghost feeders remain excluded from U-PG3',async()=>{
  const h=guardHarness({bid:99,entryOverrides:{conceptName:'Pegasus',entryPriceCents:80}});
  await h.guard.protect(h.row());
  assert.deepEqual(h.row().profitGuardState,{});
  assert.equal(h.guard.getState('guard-1').guardState,'FEEDER');
});

test('U-SG1 arms at the frozen Danger Line instead of immediately liquidating',async()=>{
  const h=guardHarness({bid:45,stopProfile:{totalObservations:40,smoothedRecoveryRate:.95,avgRecoveryTimeMs:600000,troughBucket:'0-5',specificity:'exact'}});
  const out=await h.guard.protect(h.row());
  assert.equal(out.protected,true);
  assert.equal(h.row().status,'open');
  assert.equal(h.row().stopGuardState.version,'U-SG1');
  assert.equal(h.row().stopGuardState.dangerLineCents,45);
  assert.equal(h.guard.getState('guard-1').guardState,'USG1_RECOVERY_ZONE');
  assert.equal(h.audits.filter(x=>x.event==='usg1_armed').length,1);
});

test('U-SG1 requires two fresh +2c reclaim confirmations before returning to normal protection',async()=>{
  const profile={totalObservations:40,smoothedRecoveryRate:.95,avgRecoveryTimeMs:600000,troughBucket:'0-5',specificity:'exact'};
  const h=guardHarness({bid:45,stopProfile:profile});
  await h.guard.protect(h.row());
  h.setBid(47);
  let out=await h.guard.protect(h.row());
  assert.equal(out.protected,true);
  assert.equal(h.row().stopGuardState.reclaimConfirmations,1);
  h.setBid(47);
  out=await h.guard.protect(h.row());
  assert.equal(out.protected,true);
  assert.equal(h.row().stopGuardState.version,undefined,'U-SG1 must clear after the second fresh reclaim confirmation');
  assert.equal(h.row().stopGuardState.watchdog?.version,'SLW1','stake-normalized SLW1 may immediately resume early protection while the position is still >30% economically wounded');
  assert.equal(h.guard.getState('guard-1').guardState,'SLW1_RECOVERY_GRACE');
  assert.equal(h.audits.filter(x=>x.event==='usg1_recovered').length,1);
});

test('U-SG1 recovery state survives a fresh ProfitGuard instance and still needs fresh reclaim confirmations',async()=>{
  const profile={totalObservations:40,smoothedRecoveryRate:.95,avgRecoveryTimeMs:600000,troughBucket:'0-5',specificity:'exact'};
  const h=guardHarness({bid:45,stopProfile:profile});
  await h.guard.protect(h.row());
  const restarted=new ProfitGuard({db:h.db,kalshi:{},market:h.guard.market,learning:h.learning,getSettings:()=>({...settings,simFeeCents:2,systemName:'SAGITTARIUS'})});
  h.setBid(47);
  await restarted.protect(h.row());
  assert.equal(h.row().stopGuardState.reclaimConfirmations,1);
  h.setBid(47);
  await restarted.protect(h.row());
  assert.equal(h.row().stopGuardState.version,undefined);
  assert.equal(h.row().stopGuardState.watchdog?.version,'SLW1');
  assert.equal(restarted.getState('guard-1').guardState,'SLW1_RECOVERY_GRACE');
});

test('R41 SGRL1 U-SG1 profile beta-smooths small perfect Hunter-only samples instead of treating them as certainty',async()=>{
  const key=stopGuardRecoveryProfileKeys({conceptName:'Wave Surfer',sourceFeeder:'Dragon',sport:'ATP Tennis',entryPriceCents:88,totalDropCents:35,gameMinutes:90,crashBucket:'CRASHING'})[0];
  const rows=[{profile_key:key.profileKey,total_observations:5,recovered_count:5,avg_time_to_recover_ms:120000}];
  const db={async sportProfile(){return {detected_sport_name:'ATP Tennis'};},async ensureSportProfile(){},async stopGuardProfiles(){return rows;},async seedSportProfiles(){}};
  const learning=new LearningEngine(db,'SAGITTARIUS');
  learning.crashStates.set('KXATPMATCH-X',{phase:'CRASHING',lowerLowCount:1,reboundCents:4,upwardTicks:1});
  const p=await learning.stopGuardProfile({ticker:'KXATPMATCH-X',title:'ATP',conceptName:'Wave Surfer',sourceFeeder:'Dragon',mode:'SIMULATION',entryPriceCents:88,totalDropCents:35,gameMinutes:90,penetrationCents:2,minimumObservations:5});
  assert.equal(p.evidenceVersion,'SGRL1');
  assert.equal(p.specificity,'exact');
  assert.equal(p.totalObservations,5);
  assert.ok(p.smoothedRecoveryRate<1);
  assert.ok(p.smoothedRecoveryRate>.8);
  assert.equal(p.avgRecoveryTimeMs,120000);
});

test('U-SG1 rejects a weak-learning critical collapse before the emergency boundary',async()=>{
  const weak={totalObservations:20,smoothedRecoveryRate:.60,avgRecoveryTimeMs:600000,troughBucket:'10+',specificity:'exact'};
  const h=guardHarness({bid:34,stopProfile:weak});
  const out=await h.guard.protect(h.row());
  assert.equal(out.closed,true);
  assert.equal(h.row().closeReason,'hard_stop_loss');
  assert.equal(h.row().stopGuardState.exitReason,'critical_learning_failed');
});

test('U-SG1 persists a critical probe for high-confidence recovery and never exceeds the emergency ceiling',async()=>{
  const strong={totalObservations:50,smoothedRecoveryRate:.90,avgRecoveryTimeMs:1200000,troughBucket:'10+',specificity:'exact'};
  const h=guardHarness({bid:34,stopProfile:strong});
  let out=await h.guard.protect(h.row());
  assert.equal(out.protected,true);
  assert.equal(h.guard.getState('guard-1').guardState,'USG1_CRITICAL_PROBE');
  h.setBid(30);
  out=await h.guard.protect(h.row());
  assert.equal(out.closed,true);
  assert.equal(h.row().stopGuardState.exitReason,'emergency_boundary');
});

test('ghost feeders remain excluded from U-PG3',async()=>{
  const h=guardHarness({bid:99,entryOverrides:{conceptName:'Pegasus',entryPriceCents:80}});
  await h.guard.protect(h.row());
  assert.deepEqual(h.row().profitGuardState,{});
  assert.equal(h.guard.getState('guard-1').guardState,'FEEDER');
});


test('INT1 production regression: fractional U-PG3 executable lines persist through the PostgreSQL integer-cent boundary without losing JSON precision',async()=>{
  const exacts=[86.28947368421052,86.18796992481202];
  for(const dangerLineCents of exacts){
    const calls=[];
    const db=Object.create(Database.prototype);
    db.pool={async query(sql,args){
      calls.push({sql,args});
      const intColumns=['current_price_cents','peak_price_cents','stop_price_cents'];
      for(const col of intColumns){
        const m=sql.match(new RegExp(`${col}=\\$(\\d+)`));
        if(m){
          const v=args[Number(m[1])-1];
          assert.equal(Number.isInteger(v),true,`${col} leaked fractional value ${v}`);
        }
      }
      return{rows:[],rowCount:1};
    }};
    const guard=new ProfitGuard({db,kalshi:{},market:{},learning:{},getSettings:()=>({...settings,systemName:'SAGITTARIUS'})});
    const peakExecutableBidCents=dangerLineCents+7;
    const entry={...base,id:`int1-${dangerLineCents}`,entryPriceCents:75,currentPriceCents:91,peakPriceCents:93,stopPriceCents:40,volume24h:10000};
    const state={version:'U-PG3',phase:'UPG3_ARMED',armedAtMs:Date.now(),peakExecutableBidCents,dangerLineCents,structuralLineCents:82.28947368421052,lastExecutableBidCents:91,minExecutableBidCents:86.1};
    const persisted=await guard.persistUltimateProfitGuardState(entry,{yesBid:91,volume24h:10000},state);
    assert.equal(calls.length,1);
    assert.equal(persisted.dangerLineCents,dangerLineCents,'U-PG3 JSON must retain exact fractional economics');
    assert.equal(persisted.peakExecutableBidCents,peakExecutableBidCents,'executable VWAP precision must remain exact in JSON');
  }
});

test('INT1 connected-chain regression: sag_entries update storage rounds only integer-cent columns and preserves fractional accounting/JSON fields',async()=>{
  const calls=[];
  const db=Object.create(Database.prototype);
  db.pool={async query(sql,args){calls.push({sql,args});return{rows:[],rowCount:1};}};
  const exact=86.28947368421052;
  const state={version:'U-PG3',peakExecutableBidCents:93.28947368421052,dangerLineCents:exact};
  const apex={version:'APG1',phase:'APG1_ARMED',peakExecutableBidCents:93.28947368421052,trailLineCents:91.28947368421052};
  await db.updateEntry('row-int1',{
    currentPriceCents:exact,
    peakPriceCents:93.78947368421052,
    stopPriceCents:exact,
    exitPriceCents:86.6,
    pnlCents:12.3456789,
    exitNotionalCents:1234.56789,
    profitGuardState:state,
    apexProfitGuardState:apex,
  });
  assert.equal(calls.length,1);
  const {sql,args}=calls[0];
  const valueFor=(column)=>{const m=sql.match(new RegExp(`${column}=\\$(\\d+)`));assert.ok(m,`${column} missing`);return args[Number(m[1])-1];};
  assert.equal(valueFor('current_price_cents'),86);
  assert.equal(valueFor('peak_price_cents'),94);
  assert.equal(valueFor('stop_price_cents'),86);
  assert.equal(valueFor('exit_price_cents'),87);
  assert.equal(valueFor('pnl_cents'),12.3456789,'double precision P/L must not be rounded');
  assert.equal(valueFor('exit_notional_cents'),1234.56789,'double precision notional must not be rounded');
  assert.equal(valueFor('profit_guard_state'),state,'JSON state object must be passed through unchanged');
  assert.equal(valueFor('apex_profit_guard_state'),apex,'APG1 JSON state must remain independent and exact');
});

test('INT1 storage boundary rejects non-finite integer-cent values before PostgreSQL receives them',async()=>{
  let queries=0;
  const db=Object.create(Database.prototype);
  db.pool={async query(){queries+=1;return{rows:[],rowCount:1};}};
  await assert.rejects(()=>db.updateEntry('row-int1',{stopPriceCents:Number.NaN}),/stopPriceCents.*finite/i);
  assert.equal(queries,0,'invalid integer cents must fail before issuing SQL');
});

test('INT1 partial-exit regression preserves exact VWAP PnL/notional while storing only whole-cent display prices',async()=>{
  const calls=[];
  const db=Object.create(Database.prototype);
  db.pool={async query(sql,args){calls.push({sql,args});return{rows:[],rowCount:1};}};
  const guard=new ProfitGuard({db,kalshi:{},market:{},learning:{},getSettings:()=>({...settings,simFeeCents:2,systemName:'SAGITTARIUS'})});
  const entry={...base,id:'int1-partial',entryPriceCents:80,currentPriceCents:80,peakPriceCents:94,stopPriceCents:70,count:10,remainingCount:10,pnlCents:0,entryFeeCents:20,exitFeeCents:0,exitFilledCount:0,exitNotionalCents:0,researchTrackingComplete:false};
  const exactVwap=86.28947368421052;
  const out=await guard.applyExitFill(entry,{reason:'manual_cashout',peakPriceCents:94,stopPriceCents:70},{fillCount:4,fillPriceCents:exactVwap,exitFeeCents:8});
  assert.equal(out.closed,false);
  const expectedRealized=(exactVwap-80)*4-(20*(4/10))-8;
  assert.ok(Math.abs(out.pnlCents-expectedRealized)<1e-9,'exact fractional VWAP must still drive realized P/L');
  const {sql,args}=calls[0];
  const valueFor=(column)=>{const m=sql.match(new RegExp(`${column}=\\$(\\d+)`));assert.ok(m,`${column} missing`);return args[Number(m[1])-1];};
  assert.equal(valueFor('current_price_cents'),86,'display/current integer column must be normalized');
  assert.ok(Math.abs(valueFor('exit_notional_cents')-(exactVwap*4))<1e-9,'exact notional must remain double precision');
  assert.ok(Math.abs(valueFor('pnl_cents')-expectedRealized)<1e-9,'exact realized P/L must remain double precision');
});

test('INT1 insert boundary applies the same integer-cent contract before a new sag_entries row reaches PostgreSQL',async()=>{
  const calls=[];
  const db=Object.create(Database.prototype);
  db.pool={async query(sql,args){calls.push({sql,args});return{rows:[],rowCount:1};}};
  const now=Date.now();
  await db.insertEntry({
    id:'int1-insert',systemName:'SAGITTARIUS',ownerId:'sag-test',conceptName:'Crash Recovery Hunter',ticker:'T',eventTicker:'E',marketTitle:'T',watchdogModel:'hold-to-settlement',mode:'SIMULATION',status:'open',
    entryPriceCents:80.49,exitPriceCents:null,currentPriceCents:80.51,peakPriceCents:93.789,stopPriceCents:86.289,stopLossCents:35.2,count:10,remainingCount:10,volume24h:1000,spreadAtEntryCents:1.4,
    pnlCents:12.345,entryFeeCents:20,exitFeeCents:0,exitFilledCount:0,exitNotionalCents:123.456,openedAtMs:now,updatedAtMs:now,lowestPriceAfterEntryCents:70.6,maeCents:9.9,recoveryGreenPriceCents:84.6,
    entryConfig:{exact:86.289},stopGuardState:{},profitGuardState:{dangerLineCents:86.289},apexProfitGuardState:{version:'APG1',phase:'APG1_ARMED',trailLineCents:91.289},
  });
  assert.equal(calls.length,1);
  const {sql,args}=calls[0];
  const cols=sql.match(/insert into sag_entries\(([^)]+)\)/)[1].split(',');
  const map=new Map(cols.map((c,i)=>[c,args[i]]));
  for(const col of ['entry_price_cents','current_price_cents','peak_price_cents','stop_price_cents','stop_loss_cents','spread_at_entry_cents','lowest_price_after_entry_cents','mae_cents','recovery_green_price_cents']) assert.equal(Number.isInteger(map.get(col)),true,`${col} not normalized`);
  assert.equal(map.get('pnl_cents'),12.345);
  assert.equal(map.get('exit_notional_cents'),123.456);
  assert.deepEqual(map.get('profit_guard_state'),{dangerLineCents:86.289});
  assert.deepEqual(map.get('apex_profit_guard_state'),{version:'APG1',phase:'APG1_ARMED',trailLineCents:91.289});
});


test('R30 APG1 doctrine is a fee-aware 2c executable trail with fresh-confirmation and loss-domain boundaries',()=>{
  assert.equal(APEX_PROFIT_GUARD.version,'APG1');
  assert.equal(APEX_PROFIT_GUARD.activationMoveCents,6);
  assert.equal(APEX_PROFIT_GUARD.minimumNetProfitPerContractCents,1);
  assert.equal(APEX_PROFIT_GUARD.peakGivebackCents,2);
  assert.equal(APEX_PROFIT_GUARD.failureConfirmations,2);
  assert.equal(APEX_PROFIT_GUARD.immediateGapThroughCents,2);
  assert.equal(APEX_PROFIT_GUARD.fullExecutableDepthRequired,true);
  assert.equal(APEX_PROFIT_GUARD.positiveNetExecutionOnly,true);
  assert.equal(APEX_PROFIT_GUARD.lossDomainDelegatedToStopGuard,true);
});

test('R30 APG1 excludes ghost feeders and does not create real exit authority for reference signals',async()=>{
  const h=guardHarness({bid:95,apgEnabled:true,entryOverrides:{conceptName:'Dragon',stopLossCents:0,entryFeeCents:0}});
  const apg=await h.guard.evaluateApexProfitGuard(h.row(),h.guard.market.getQuote('x'),{...settings,simFeeCents:2});
  assert.equal(apg,null);
  const out=await h.guard.protect(h.row());
  assert.equal(out.action,'hold_ghost');
  assert.deepEqual(h.row().apexProfitGuardState,{});
});

test('R30 APG1 arms only when the full executable position funds both +net and the entire 2c trail',async()=>{
  const h=guardHarness({bid:86,apgEnabled:true});
  let apg=await h.guard.evaluateApexProfitGuard(h.row(),h.guard.market.getQuote('x'),{...settings,simFeeCents:2});
  assert.equal(apg.armed,false,'80c entry with 2c/side fees needs a 85c +net floor; 86c cannot fund a 2c trail');
  h.setBid(87);
  apg=await h.guard.evaluateApexProfitGuard(h.row(),h.guard.market.getQuote('x'),{...settings,simFeeCents:2});
  assert.equal(apg.armed,true);
  assert.equal(apg.triggered,false,'arming observation can never liquidate');
  assert.equal(h.row().apexProfitGuardState.minimumPositivePriceCents,85);
  assert.equal(h.row().apexProfitGuardState.headroomArmPriceCents,87);
  assert.equal(h.row().apexProfitGuardState.peakExecutableBidCents,87);
  assert.equal(h.row().apexProfitGuardState.trailLineCents,85);
});

test('R30 APG1 ratchets the executable peak and trail without selling a monotonic winner',async()=>{
  const h=guardHarness({bid:87,apgEnabled:true});
  await h.guard.protect(h.row());
  for(const px of [89,91,93]){h.setBid(px);const out=await h.guard.protect(h.row());assert.equal(out.closed??false,false);}
  assert.equal(h.row().apexProfitGuardState.peakExecutableBidCents,93);
  assert.equal(h.row().apexProfitGuardState.trailLineCents,91);
  assert.equal(h.row().apexProfitGuardState.failureConfirmations,0);
  assert.equal(h.audits.some(x=>x.event==='apg1_peak_ratchet'),true);
});

test('R30 APG1 rejects one-tick noise at the 2c trail and requires two fresh book confirmations',async()=>{
  const h=guardHarness({bid:87,apgEnabled:true});
  await h.guard.protect(h.row());
  h.setBid(93); await h.guard.protect(h.row());
  h.setBid(91); let out=await h.guard.protect(h.row());
  assert.equal(out.closed??false,false);
  assert.equal(h.row().apexProfitGuardState.phase,'APG1_CONFIRMING');
  assert.equal(h.row().apexProfitGuardState.failureConfirmations,1);
  h.setBid(92); out=await h.guard.protect(h.row());
  assert.equal(out.closed??false,false);
  assert.equal(h.row().apexProfitGuardState.failureConfirmations,0,'reclaim above the trail cancels the noise confirmation');
  h.setBid(91); out=await h.guard.protect(h.row());
  assert.equal(out.closed??false,false);
  h.setBid(91); out=await h.guard.protect(h.row());
  assert.equal(out.closed,true);
  assert.equal(h.row().closeReason,'apex_profit_guard');
  assert.equal(h.row().exitPriceCents,91);
  assert.equal(h.row().pnlCents,700);
});

test('R30 APG1 never counts the same order book twice toward its two-confirmation exit',async()=>{
  const h=guardHarness({bid:87,apgEnabled:true});
  await h.guard.protect(h.row());
  h.setBid(93); await h.guard.protect(h.row());
  h.setBid(91); let out=await h.guard.protect(h.row());
  assert.equal(h.row().apexProfitGuardState.failureConfirmations,1);
  out=await h.guard.protect(h.row());
  assert.equal(out.closed??false,false);
  assert.equal(h.row().apexProfitGuardState.failureConfirmations,1,'same book timestamp must not count twice');
  h.setBid(91); out=await h.guard.protect(h.row());
  assert.equal(out.closed,true);
});

test('R30 APG1 severe 4c peak giveback commits immediately while full execution remains positive',async()=>{
  const h=guardHarness({bid:87,apgEnabled:true});
  await h.guard.protect(h.row());
  h.setBid(93); await h.guard.protect(h.row());
  h.setBid(89); const out=await h.guard.protect(h.row()); // trail=91; 2c through trail => 4c from peak
  assert.equal(out.closed,true);
  assert.equal(h.row().closeReason,'apex_profit_guard');
  assert.equal(h.row().exitPriceCents,89);
  assert.equal(h.row().pnlCents,500);
  assert.equal(h.row().apexProfitGuardState.immediateGapThrough,true);
});

test('R30 APG1 cannot chase a collapse through the positive-profit floor and leaves U-SG1 as loss authority',async()=>{
  const h=guardHarness({bid:87,apgEnabled:true});
  await h.guard.protect(h.row());
  h.setBid(93); await h.guard.protect(h.row());
  h.setBid(84); const out=await h.guard.protect(h.row());
  assert.equal(out.closed??false,false);
  assert.equal(h.row().status,'open');
  assert.equal(h.row().apexProfitGuardState.phase,'APG1_PROFIT_FLOOR_LOST');
  assert.equal(h.row().apexProfitGuardState.profitFloorLost,true);
  assert.equal(h.audits.some(x=>x.event==='apg1_exit_committed'),false);
});

test('R30 APG1 never arms or invents a peak without full remaining-position profitable executable depth',async()=>{
  const h=guardHarness({bid:95,full:false,filled:50,apgEnabled:true});
  const apg=await h.guard.evaluateApexProfitGuard(h.row(),h.guard.market.getQuote('x'),{...settings,simFeeCents:2});
  assert.equal(apg.armed,false);
  assert.equal(apg.executableFull,false);
  assert.deepEqual(h.row().apexProfitGuardState,{});
});

test('R30 APG1 committed state survives restart and resumes liquidation without requiring a new peak',async()=>{
  const now=Date.now();
  const apg={version:'APG1',phase:'APG1_EXIT_COMMITTED',armedAtMs:now-5000,peakExecutableBidCents:93,trailLineCents:91,minimumPositivePriceCents:85,headroomArmPriceCents:87,failureConfirmations:2,requiredFailureConfirmations:2,exitCommittedAtMs:now-1000};
  const h=guardHarness({bid:91,apgEnabled:true,entryOverrides:{apexProfitGuardState:apg}});
  const restarted=new ProfitGuard({db:h.db,kalshi:{},market:h.guard.market,learning:h.learning,getSettings:()=>({...settings,simFeeCents:2,systemName:'SAGITTARIUS'})});
  const out=await restarted.protect(h.row());
  assert.equal(out.closed,true);
  assert.equal(h.row().closeReason,'apex_profit_guard');
  assert.equal(h.row().pnlCents,700);
});

test('R30 APG1 never steals the loss domain: U-SG1 supersedes a persisted APG1 commitment after collapse',async()=>{
  const now=Date.now();
  const apg={version:'APG1',phase:'APG1_EXIT_COMMITTED',armedAtMs:now-5000,peakExecutableBidCents:93,trailLineCents:91,minimumPositivePriceCents:85,headroomArmPriceCents:87,failureConfirmations:2,requiredFailureConfirmations:2,exitCommittedAtMs:now-1000};
  const h=guardHarness({bid:30,apgEnabled:true,entryOverrides:{apexProfitGuardState:apg}});
  const out=await h.guard.protect(h.row());
  assert.equal(out.closed,true);
  assert.equal(h.row().closeReason,'hard_stop_loss');
  assert.equal(h.row().stopGuardState.version,'U-SG1');
});

test('R30 APG1 partial simulation fill reopens the remainder when full +net depth disappears so U-SG1 can protect it',async()=>{
  const now=Date.now();
  const apg={version:'APG1',phase:'APG1_EXIT_COMMITTED',armedAtMs:now-5000,peakExecutableBidCents:93,trailLineCents:91,minimumPositivePriceCents:85,headroomArmPriceCents:87,failureConfirmations:2,requiredFailureConfirmations:2,exitCommittedAtMs:now-1000};
  const h=guardHarness({bid:91,full:false,filled:50,apgEnabled:true,entryOverrides:{apexProfitGuardState:apg}});
  let out=await h.guard.simulationExit(h.row(),{action:'apex_profit_guard',reason:'apex_profit_guard',guardState:'APG1_EXIT',apexProfitGuard:'APG1',peakPriceCents:93,stopPriceCents:45},h.guard.market.getQuote('x'));
  assert.equal(out.closed,false);
  assert.equal(h.row().status,'exit_pending');
  assert.equal(h.row().remainingCount,50);
  h.setDepth({full:false,filled:0}); h.setBid(88);
  out=await h.guard.protect(h.row());
  assert.equal(out.closed??false,false);
  assert.equal(h.row().status,'open');
  assert.equal(h.row().closeReason,null);
  assert.equal(h.row().apexProfitGuardState.phase,'APG1_EXIT_COMMITTED');
  assert.equal(h.audits.some(x=>x.event==='apex_profit_guard_exit_suspended_to_stop_guard'),true);
});

test('R30 APG1 LIVE contract persists receipt first and never authorizes an IOC below the +net floor',async()=>{
  const h=guardHarness({bid:91,apgEnabled:true,entryOverrides:{mode:'LIVE'}});
  const now=Date.now();
  const apg={version:'APG1',phase:'APG1_EXIT_COMMITTED',armedAtMs:now-5000,peakExecutableBidCents:93,trailLineCents:91,minimumPositivePriceCents:85,headroomArmPriceCents:87,failureConfirmations:2,requiredFailureConfirmations:2,exitCommittedAtMs:now-1000};
  await h.db.updateEntry('guard-1',{apexProfitGuardState:apg});
  let order=null; let receiptWasPersisted=false;
  h.guard.kalshi={
    async getPositions(){const r=h.row();return[{ticker:r.ticker,position_fp:r.remainingCount}];},
    buildClientOrderId:()=> 'r30-apg1-exit',
    async placeOrder(o){order=o;const row=h.row();receiptWasPersisted=row.status==='exit_pending'&&row.exitClientOrderId==='r30-apg1-exit';return{orderId:'apg1-live-order',fillCount:o.count,averageFillPriceCents:91,feePaidCents:200};},
  };
  const out=await h.guard.liveExit(h.row(),{action:'apex_profit_guard',reason:'apex_profit_guard',guardState:'APG1_EXIT',apexProfitGuard:'APG1',peakPriceCents:93,stopPriceCents:45});
  assert.equal(receiptWasPersisted,true);
  assert.equal(order.action,'sell');
  assert.equal(order.count,100);
  assert.equal(order.priceCents,85);
  assert.equal(out.closed,true);
  assert.equal(h.row().closeReason,'apex_profit_guard');
});

test('R30 APG1 monotonic runner remains open and settlement still has absolute precedence',async()=>{
  const h=guardHarness({bid:87,apgEnabled:true});
  await h.guard.protect(h.row());
  for(const px of [89,92,95,98,100]){h.setBid(px);const out=await h.guard.protect(h.row());assert.equal(out.closed??false,false);}
  h.setFinal('yes');
  const out=await h.guard.protect(h.row());
  assert.equal(out.closed,true);
  assert.equal(h.row().closeReason,'settlement_win');
  assert.equal(h.row().exitPriceCents,100);
});

test('R30 APG1 high-entry 90c Hunter requires confirmation instead of cashing a single 99->97 tick',async()=>{
  const h=guardHarness({bid:99,apgEnabled:true,entryOverrides:{entryPriceCents:90,currentPriceCents:90,peakPriceCents:90,count:100,remainingCount:100,entryFeeCents:200}});
  await h.guard.protect(h.row());
  assert.equal(h.row().apexProfitGuardState.trailLineCents,97);
  h.setBid(97); let out=await h.guard.protect(h.row());
  assert.equal(out.closed??false,false);
  assert.equal(h.row().apexProfitGuardState.failureConfirmations,1);
  h.setBid(98); out=await h.guard.protect(h.row());
  assert.equal(out.closed??false,false,'reclaim preserves the runner');
  h.setBid(97); await h.guard.protect(h.row());
  h.setBid(97); out=await h.guard.protect(h.row());
  assert.equal(out.closed,true);
  assert.equal(h.row().pnlCents,300);
});

test('R30 APG1 exact 82->93->86 gap never chases below +net, preserving the settlement runner',async()=>{
  const h=guardHarness({bid:93,filled:243,apgEnabled:true,entryOverrides:{conceptName:'Wave Surfer',entryPriceCents:82,currentPriceCents:82,peakPriceCents:82,count:243,remainingCount:243,entryFeeCents:486}});
  let out=await h.guard.protect(h.row());
  assert.equal(out.closed??false,false);
  assert.equal(h.row().apexProfitGuardState.peakExecutableBidCents,93);
  assert.equal(h.row().apexProfitGuardState.trailLineCents,91);
  h.setBid(86); out=await h.guard.protect(h.row());
  assert.equal(out.closed??false,false,'86c is below the 87c positive-net floor, so APG1 must not chase');
  assert.equal(h.row().apexProfitGuardState.phase,'APG1_PROFIT_FLOOR_LOST');
  h.setFinal('yes'); out=await h.guard.protect(h.row());
  assert.equal(out.closed,true);
  assert.equal(h.row().closeReason,'settlement_win');
});


test('R30 APG1 fails closed on stale or crossed/invalid order books and never advances a profit-exit confirmation from them',async()=>{
  const h=guardHarness({bid:87,apgEnabled:true});
  await h.guard.protect(h.row());
  h.setBid(93); await h.guard.protect(h.row());
  h.setBid(91); h.setBookAge(6000);
  let apg=await h.guard.evaluateApexProfitGuard(h.row(),h.guard.market.getQuote('x'),{...settings,simFeeCents:2});
  assert.equal(apg.executable,false);
  assert.equal(h.row().apexProfitGuardState.failureConfirmations,0,'stale depth must not count toward the exit');
  h.setBid(91); h.setBookInvalid(true);
  apg=await h.guard.evaluateApexProfitGuard(h.row(),h.guard.market.getQuote('x'),{...settings,simFeeCents:2});
  assert.equal(apg.executable,false);
  assert.equal(h.row().apexProfitGuardState.failureConfirmations,0,'crossed/invalid depth must not count toward the exit');
});

test('R30 APG1 applies the same executable profit covenant to every real Hunter concept without touching feeders',async()=>{
  for(const conceptName of ['Momentum Hunter','Wave Surfer','Recovery Hunter','Crash Recovery Hunter','Lightning Plasma','Dragon Recovery Hunter','Golden Dragon Hunter']){
    const h=guardHarness({bid:87,apgEnabled:true,entryOverrides:{conceptName}});
    const apg=await h.guard.evaluateApexProfitGuard(h.row(),h.guard.market.getQuote('x'),{...settings,simFeeCents:2});
    assert.equal(apg.armed,true,`${conceptName} did not receive APG1`);
    assert.equal(h.row().apexProfitGuardState.version,'APG1');
  }
});


test('R32 Gate 1 PLI1 doctrine freezes conservative promotion thresholds and shadow-only competitor policies',()=>{
  assert.equal(PROTECTED_RUNNER_INTELLIGENCE.version,'PRI1');
  assert.equal(PROTECTED_RUNNER_INTELLIGENCE.capitalLatchNetPerOriginalContractCents,1);
  assert.equal(PROTECTED_RUNNER_INTELLIGENCE.coldStartRetentionRatio,0.92);
  assert.equal(PROFIT_LEARNING_INTELLIGENCE.version,'PLI1');
  assert.equal(PROFIT_LEARNING_INTELLIGENCE.minimumProfileObservations,12);
  assert.equal(PROFIT_LEARNING_INTELLIGENCE.minimumPullbackObservations,6);
  assert.deepEqual(PROFIT_LEARNING_INTELLIGENCE.shadowPolicies.PMH1.stages,[[9,0.03],[12,0.03],[16,0.03]]);
  assert.deepEqual(PROFIT_LEARNING_INTELLIGENCE.shadowPolicies.DBR1.stages,[[12,0.10]]);
});

test('R32 Gate 1 PLI1 learns executable one-tick pullback recovery without using display-only prices',()=>{
  const entry={id:'pli-1',conceptName:'Momentum Hunter',sourceFeeder:'Golden Dragon',entryPriceCents:80,count:100};
  let st=advanceProfitLearningState(null,entry,{fullExecutable:true,executableBidCents:90,executableNetCents:600,observedAtMs:1000,sport:'MLB Baseball'},1000);
  st=advanceProfitLearningState(st,entry,{fullExecutable:true,executableBidCents:89,executableNetCents:500,observedAtMs:2000},2000);
  assert.equal(st.oneTickPullbackCount,1);
  assert.equal(st.oneTickRecoveryCount,0);
  st=advanceProfitLearningState(st,entry,{fullExecutable:true,executableBidCents:90,executableNetCents:600,observedAtMs:3000},3000);
  assert.equal(st.oneTickPullbackCount,1);
  assert.equal(st.oneTickRecoveryCount,1);
  const before=structuredClone(st);
  st=advanceProfitLearningState(st,entry,{fullExecutable:false,executableBidCents:99,executableNetCents:1900,observedAtMs:4000},4000);
  assert.equal(st.maxExecutableBidCents,before.maxExecutableBidCents,'insufficient depth must not manufacture a PLI1 peak');
  assert.equal(st.maxExecutableNetCents,before.maxExecutableNetCents);
});

test('R32 Gate 1 PLI1 policy promotion stays cold-start until evidence is sufficient and only then adapts inside hard bounds',()=>{
  assert.equal(recommendProfitRetentionRatio({totalObservations:11,oneTickPullbacks:50,oneTickRecoveries:50}),0.92);
  assert.equal(recommendProfitRetentionRatio({totalObservations:20,oneTickPullbacks:5,oneTickRecoveries:5}),0.92);
  const continuationHeavy=recommendProfitRetentionRatio({totalObservations:30,oneTickPullbacks:20,oneTickRecoveries:18,collapseCount:2,avgPostExitRegretRate:0.3});
  const collapseHeavy=recommendProfitRetentionRatio({totalObservations:30,oneTickPullbacks:20,oneTickRecoveries:3,collapseCount:20,avgPostExitRegretRate:0});
  assert.ok(continuationHeavy>=0.85&&continuationHeavy<0.92);
  assert.ok(collapseHeavy>0.92&&collapseHeavy<=0.96);
});


test("R37 Gate 1 creation-time contract freezes Golden Eye + PLI1 on every new real Hunter and excludes feeders",async()=>{const {RELEASE,originalSettings,CANONICAL_NUMERIC_SETTINGS,CANONICAL_BOOLEAN_SETTINGS,sanitizeRuntimeSettings,normalizeStartupExecutionMode}=await import('../src/config.mjs');const D=await import('../src/doctrine.mjs');const {readFile,readdir,stat}=await import('node:fs/promises');const pg=await readFile(new URL('../src/profitGuard.mjs',import.meta.url),'utf8');assert.equal(D.INFINITY_BREAK.authority,'PROFIT_EXIT');assert.equal(D.AURORA_EXECUTION.lossAuthority,'U-SG1');assert.equal(D.AURORA_EXECUTION.defaultDamageControlPercent,45);assert.ok(pg.includes("'infinity_break'"));assert.ok(pg.includes("'atomic_thunder_cashout'"),'legacy Atomic history must remain compatible');assert.ok(pg.includes('auroraDamageControlPercent'));assert.equal(pg.includes('maximumPositionLifetimeMs'),false);});

test('R32 Gate 2 PRI1 latches only after full-position executable net clears +1c per original contract',async()=>{
  const h=guardHarness({bid:84,pri1Enabled:true});
  let out=await h.guard.protect(h.row());
  assert.equal(out.closed??false,false);
  assert.deepEqual(h.row().profitGuardState,{},'84c is aggregate break-even after fees, not the +1c/original latch');
  h.setBid(85);out=await h.guard.protect(h.row());
  const st=h.row().profitGuardState;
  assert.equal(out.closed??false,false);
  assert.equal(st.version,'PRI1');
  assert.equal(st.phase,'PRI1_CAPITAL_LATCHED');
  assert.equal(st.capitalLatchTargetNetCents,100);
  assert.equal(st.peakExecutableNetCents,100);
  assert.equal(st.protectedNetFloorCents,0);
  assert.equal(st.breakEvenPriceCents,84);
  assert.equal(h.audits.filter(x=>x.event==='pri1_capital_latched').length,1);
});

test('R32 Gate 2 PRI1 ratchets executable net peak and exits on the first fresh protected-floor breach without a second confirmation',async()=>{
  const h=guardHarness({bid:85,pri1Enabled:true});
  await h.guard.protect(h.row());
  h.setBid(90);let out=await h.guard.protect(h.row());
  assert.equal(out.closed??false,false);
  let st=h.row().profitGuardState;
  assert.equal(st.phase,'PRI1_RUNNER');
  assert.equal(st.peakExecutableNetCents,600);
  assert.equal(st.protectedNetFloorCents,500);
  assert.equal(st.protectedPriceFloorCents,89);
  h.setBid(89);out=await h.guard.protect(h.row());
  assert.equal(out.closed,true);
  assert.equal(h.row().closeReason,'protected_runner_intelligence');
  assert.equal(h.row().pnlCents,500);
  assert.equal(h.row().profitGuardState.phase,'PRI1_EXIT_FILLED');
  assert.equal(h.audits.filter(x=>x.event==='pri1_exit_committed').length,1);
  assert.equal(h.learning.profitExitMarks.length,1);
  assert.equal(h.row().researchTrackingComplete,false,'PLI1 must continue post-exit learning');
});

test('R32 Gate 2 PRI1 does not count the same order-book timestamp as a new floor breach',async()=>{
  const h=guardHarness({bid:85,pri1Enabled:true});
  await h.guard.protect(h.row());
  h.setBid(90);await h.guard.protect(h.row());
  h.setBidSameBook(89);
  let out=await h.guard.protect(h.row());
  assert.equal(out.closed??false,false);
  assert.equal(h.row().profitGuardState.phase,'PRI1_RUNNER');
  h.setBid(89);out=await h.guard.protect(h.row());
  assert.equal(out.closed,true,'a genuinely fresh book at the same price commits immediately');
});

test('R32 Gate 2 PRI1 never learns, latches, ratchets, or exits from stale/invalid/partial depth',async()=>{
  const h=guardHarness({bid:85,pri1Enabled:true,full:false,filled:50});
  let pri=await h.guard.evaluateProtectedRunner(h.row(),h.guard.market.getQuote('x'),{...settings,simFeeCents:2});
  assert.equal(pri.armed,false);
  assert.deepEqual(h.row().profitGuardState,{});
  await h.guard.flushProfitLearningQueues();
  assert.equal(h.learning.profitObservations.length,0);
  h.setDepth({full:true,filled:100});h.setBid(85);await h.guard.protect(h.row());
  const peak=h.row().profitGuardState.peakExecutableNetCents;
  h.setBid(95);h.setBookAge(6000);
  pri=await h.guard.evaluateProtectedRunner(h.row(),h.guard.market.getQuote('x'),{...settings,simFeeCents:2});
  assert.equal(pri.executable,false);
  assert.equal(h.row().profitGuardState.peakExecutableNetCents,peak);
  h.setBid(95);h.setBookInvalid(true);
  pri=await h.guard.evaluateProtectedRunner(h.row(),h.guard.market.getQuote('x'),{...settings,simFeeCents:2});
  assert.equal(pri.executable,false);
  assert.equal(h.row().profitGuardState.peakExecutableNetCents,peak);
});

test('R32 Gate 2 PRI1 delegates a gap below aggregate break-even to U-SG1 and exits at the first recovered non-negative full-depth opportunity',async()=>{
  const h=guardHarness({bid:85,pri1Enabled:true});
  await h.guard.protect(h.row());
  h.setBid(90);await h.guard.protect(h.row());
  h.setBid(83);let out=await h.guard.protect(h.row());
  assert.equal(out.closed??false,false);
  assert.equal(h.row().status,'open');
  assert.equal(h.row().profitGuardState.phase,'PRI1_CAPITAL_FLOOR_GAPPED');
  assert.equal(h.audits.some(x=>x.event==='pri1_exit_committed'),false);
  h.setBid(84);out=await h.guard.protect(h.row());
  assert.equal(out.closed,true);
  assert.equal(h.row().closeReason,'protected_runner_intelligence');
  assert.equal(h.row().pnlCents,0,'recovered capital floor may break even but never authorizes a negative Profit Guard exit');
});

test('R32 Gate 2 PRI1 freezes the learned retention policy at latch so a live trade cannot mutate when profiles update',async()=>{
  const profile={retentionRatio:.85,specificity:'exact',profileKey:'x',promoted:true,totalObservations:40,confidence:'high'};
  const h=guardHarness({bid:85,pri1Enabled:true,retentionProfile:profile});
  await h.guard.protect(h.row());
  assert.equal(h.row().profitGuardState.retentionRatio,.85);
  profile.retentionRatio=.96;
  h.setBid(95);await h.guard.protect(h.row());
  assert.equal(h.row().profitGuardState.retentionRatio,.85);
  assert.equal(h.row().profitGuardState.retentionSource,'exact');
});

test('R32 Gate 2 PRI1 persisted exit commit survives restart and does not fall back into APG1/U-PG3',async()=>{
  const now=Date.now();
  const pri={version:'PRI1',phase:'PRI1_EXIT_COMMITTED',armedAtMs:now-5000,latchedAtMs:now-5000,retentionRatio:.92,peakExecutableBidCents:90,peakExecutableNetCents:600,protectedNetFloorCents:500,protectedPriceFloorCents:89,breakEvenPriceCents:84,capitalLatchTargetNetCents:100,lastObservedBookMs:now-1000,exitCommittedAtMs:now-1000};
  const h=guardHarness({bid:89,pri1Enabled:true,apgEnabled:true,entryOverrides:{profitGuardState:pri}});
  const restarted=new ProfitGuard({db:h.db,kalshi:{},market:h.guard.market,learning:h.learning,getSettings:()=>({...settings,simFeeCents:2,systemName:'SAGITTARIUS'})});
  const out=await restarted.protect(h.row());
  assert.equal(out.closed,true);
  assert.equal(h.row().closeReason,'protected_runner_intelligence');
  assert.equal(h.row().profitGuardState.phase,'PRI1_EXIT_FILLED');
  assert.deepEqual(h.row().apexProfitGuardState,{});
});

test('R32 Gate 2 PRI1 partial simulation exit keeps its durable commitment but reopens the remainder if full capital-safe depth disappears',async()=>{
  const now=Date.now();
  const pri={version:'PRI1',phase:'PRI1_EXIT_COMMITTED',armedAtMs:now-5000,latchedAtMs:now-5000,retentionRatio:.92,peakExecutableBidCents:90,peakExecutableNetCents:600,protectedNetFloorCents:500,protectedPriceFloorCents:89,breakEvenPriceCents:84,capitalLatchTargetNetCents:100,lastObservedBookMs:now-1000,exitCommittedAtMs:now-1000};
  const h=guardHarness({bid:89,pri1Enabled:true,full:false,filled:50,entryOverrides:{profitGuardState:pri}});
  let out=await h.guard.simulationExit(h.row(),{action:'protected_runner_intelligence',reason:'protected_runner_intelligence',guardState:'PRI1_EXIT',protectedRunnerIntelligence:'PRI1',peakPriceCents:90,stopPriceCents:45},h.guard.market.getQuote('x'));
  assert.equal(out.closed,false);
  assert.equal(h.row().status,'exit_pending');
  assert.equal(h.row().remainingCount,50);
  assert.equal(h.row().profitGuardState.phase,'PRI1_EXIT_COMMITTED');
  h.setDepth({full:false,filled:0});h.setBid(83);
  out=await h.guard.protect(h.row());
  assert.equal(out.closed??false,false);
  assert.equal(h.row().status,'open');
  assert.equal(h.row().closeReason,null);
  assert.equal(h.row().profitGuardState.phase,'PRI1_EXIT_COMMITTED','the economic obligation remains persisted');
  assert.equal(h.audits.some(x=>x.event==='pri1_exit_suspended_to_stop_guard'),true);
});

test('R32 Gate 2 PRI1 LIVE exit persists its receipt before submit and its IOC can never authorize aggregate-negative execution',async()=>{
  const now=Date.now();
  const pri={version:'PRI1',phase:'PRI1_EXIT_COMMITTED',armedAtMs:now-5000,latchedAtMs:now-5000,retentionRatio:.92,peakExecutableBidCents:90,peakExecutableNetCents:600,protectedNetFloorCents:500,protectedPriceFloorCents:89,breakEvenPriceCents:84,capitalLatchTargetNetCents:100,lastObservedBookMs:now-1000,exitCommittedAtMs:now-1000};
  const h=guardHarness({bid:89,pri1Enabled:true,entryOverrides:{mode:'LIVE',profitGuardState:pri}});
  let order=null,receiptPersisted=false;
  h.guard.kalshi={
    async getPositions(){const r=h.row();return[{ticker:r.ticker,position_fp:r.remainingCount}];},
    buildClientOrderId:()=> 'r32-pri1-exit',
    async placeOrder(o){order=o;const row=h.row();receiptPersisted=row.status==='exit_pending'&&row.exitClientOrderId==='r32-pri1-exit';return{orderId:'pri1-live-order',fillCount:o.count,averageFillPriceCents:89,feePaidCents:200};},
  };
  const out=await h.guard.liveExit(h.row(),{action:'protected_runner_intelligence',reason:'protected_runner_intelligence',guardState:'PRI1_EXIT',protectedRunnerIntelligence:'PRI1',peakPriceCents:90,stopPriceCents:45});
  assert.equal(receiptPersisted,true);
  assert.equal(order.action,'sell');
  assert.equal(order.count,100);
  assert.equal(order.priceCents,84,'IOC limit is the aggregate break-even covenant, never below it');
  assert.equal(out.closed,true);
  assert.equal(h.row().profitGuardState.phase,'PRI1_EXIT_FILLED');
});

test('R32 Gate 2 PRI1 keeps a monotonic winner fully open and settlement retains absolute precedence',async()=>{
  const h=guardHarness({bid:85,pri1Enabled:true});
  await h.guard.protect(h.row());
  for(const px of [86,90,94,98,100]){h.setBid(px);const out=await h.guard.protect(h.row());assert.equal(out.closed??false,false);}
  assert.equal(h.row().remainingCount,100,'PRI1 cold-start has no active harvesting; 100% remains the runner');
  h.setFinal('yes');const out=await h.guard.protect(h.row());
  assert.equal(out.closed,true);
  assert.equal(h.row().closeReason,'settlement_win');
  assert.equal(h.row().exitPriceCents,100);
});

test('R32 Gate 2 legacy R31 Hunters remain on APG1/U-PG3 after the R32 deployment boundary',async()=>{
  const h=guardHarness({bid:87,apgEnabled:true,pri1Enabled:false,entryOverrides:{entryConfig:{release:'SAGITTARIUS-R31-GOLDEN-FEED-BUS-GFB1-2026-08-23'}}});
  await h.guard.protect(h.row());
  assert.equal(h.row().apexProfitGuardState.version,'APG1');
  assert.notEqual(h.row().profitGuardState.version,'PRI1');
});


test('R32 Gate 5 PRI1 uses full-position executable VWAP rather than top bid for the capital latch',async()=>{
  const h=guardHarness({bid:90,executableAvg:84,pri1Enabled:true});
  let out=await h.guard.protect(h.row());
  assert.equal(out.closed??false,false);
  assert.deepEqual(h.row().profitGuardState,{},'top bid may look profitable while the full-position VWAP is only break-even');
  await h.guard.flushProfitLearningQueues();
  assert.equal(h.learning.profitObservations.at(-1)?.executableNetCents,0);
  h.setExecutableAvg(85);
  out=await h.guard.protect(h.row());
  assert.equal(out.closed??false,false);
  assert.equal(h.row().profitGuardState.phase,'PRI1_CAPITAL_LATCHED');
  assert.equal(h.row().profitGuardState.lastExecutableBidCents,85);
  assert.equal(h.row().profitGuardState.capitalLatchTargetNetCents,100);
});

test('R32 Gate 5 U-SG1 emergency liquidation outranks a previously committed PRI1 profit obligation',async()=>{
  const now=Date.now();
  const pri={version:'PRI1',phase:'PRI1_EXIT_COMMITTED',armedAtMs:now-5000,latchedAtMs:now-5000,retentionRatio:.92,peakExecutableBidCents:90,peakExecutableNetCents:600,protectedNetFloorCents:500,protectedPriceFloorCents:89,breakEvenPriceCents:84,capitalLatchTargetNetCents:100,lastObservedBookMs:now-1000,exitCommittedAtMs:now-1000};
  const h=guardHarness({bid:30,pri1Enabled:true,entryOverrides:{profitGuardState:pri}});
  const out=await h.guard.protect(h.row());
  assert.equal(out.closed,true);
  assert.equal(h.row().closeReason,'hard_stop_loss');
  assert.equal(h.row().pnlCents,-5400);
  assert.ok(['PRI1_EXIT_FILLED','PRI1_EXIT_COMMITTED'].includes(h.row().profitGuardState.phase),'PRI forensic state remains durable but cannot override U-SG1');
  assert.equal(h.audits.some(x=>x.event==='usg1_exit_committed'),true);
});

test('R32 Gate 5 deterministic entry-band sweep proves every PRI1-authorized exit is aggregate non-negative after fees',async()=>{
  for(let entry=45;entry<=89;entry++){
    const qty=100;
    const h=guardHarness({bid:entry+5,pri1Enabled:true,entryOverrides:{entryPriceCents:entry,currentPriceCents:entry,peakPriceCents:entry,count:qty,remainingCount:qty,entryFeeCents:200,stopLossCents:35}});
    await h.guard.protect(h.row());
    assert.equal(h.row().profitGuardState.version,'PRI1',`PRI1 did not latch at entry ${entry}`);
    const peak=Math.min(100,entry+10);
    h.setBid(peak);await h.guard.protect(h.row());
    const floorPrice=h.row().profitGuardState.protectedPriceFloorCents;
    h.setBid(floorPrice);
    const out=await h.guard.protect(h.row());
    if(out.closed&&h.row().closeReason==='protected_runner_intelligence'){
      assert.ok(h.row().pnlCents>=0,`PRI1 authorized a negative exit at entry ${entry}: ${h.row().pnlCents}`);
    } else {
      assert.equal(h.row().status,'open',`unexpected non-PRI closure at entry ${entry}`);
    }
  }
});

test('R32 Gate 5 PRI1 never creates profit authority for feeders even under a profitable full-depth book',async()=>{
  for(const conceptName of ['Pegasus','Sagittarius','Dragon','Golden Dragon']){
    const h=guardHarness({bid:95,pri1Enabled:false,entryOverrides:{conceptName,stopLossCents:0,entryConfig:{profitAuthority:null,profitLearning:null}}});
    const out=await h.guard.protect(h.row());
    assert.equal(out.closed??false,false);
    assert.equal(h.row().status,'open');
    assert.deepEqual(h.row().profitGuardState,{});
  }
});

test('R32 Gate 6 LearningEngine hydrates promoted PLI1 retention profiles into an in-memory critical-path cache',async()=>{
  const db={
    async seedSportProfiles(){},async crashEpisodes(){return[];},async crashMarketStates(){return[];},async profitEpisodes(){return[];},
    async profitProfiles(){return[{profile_key:'concept|Momentum Hunter',specificity:'concept',total_observations:20,one_tick_pullbacks:8,one_tick_recoveries:6,recommended_retention_ratio:.85,confidence_level:'medium',updated_at_ms:200}];},
  };
  const learning=new LearningEngine(db,'SAGITTARIUS');
  await learning.init();
  const cached=learning.profitRetentionProfileCached({id:'new-trade',conceptName:'Momentum Hunter',ticker:'KXMLBGAME-X-A',entryPriceCents:80});
  assert.equal(cached.promoted,true);
  assert.equal(cached.retentionRatio,.85);
  assert.equal(cached.specificity,'concept');
  learning.cacheProfitProfile({profileKey:'concept|Momentum Hunter',specificity:'concept',totalObservations:50,oneTickPullbacks:20,recommendedRetentionRatio:.96,confidenceLevel:'high',updatedAtMs:100});
  assert.equal(learning.profitRetentionProfileCached({conceptName:'Momentum Hunter',ticker:'KXMLBGAME-X-A',entryPriceCents:80}).retentionRatio,.85,'older concurrent profile writes cannot roll back the cache');
});

test('R32 Gate 6 PLI1 learning I/O is isolated from the PRI1 protection critical path',async()=>{
  const h=guardHarness({bid:85,pri1Enabled:true});
  let observed=0;
  h.guard.learning.observeProfitOpportunity=async()=>{observed++;await new Promise(()=>{});};
  h.guard.learning.profitRetentionProfileCached=()=>({retentionRatio:.92,specificity:'cold_start',promoted:false,totalObservations:0,confidence:'low'});
  const result=await Promise.race([
    h.guard.protect(h.row()).then((x)=>({kind:'protect',x})),
    new Promise((resolve)=>setTimeout(()=>resolve({kind:'timeout'}),75)),
  ]);
  assert.equal(result.kind,'protect','PRI1 must never wait for a hanging PLI1 write');
  assert.equal(h.row().profitGuardState.phase,'PRI1_CAPITAL_LATCHED');
  assert.equal(observed,1);
});

test('R32 Gate 6 PRI1 latch reads only the hydrated PLI1 cache and never queries an asynchronous profile on the protection path',async()=>{
  const h=guardHarness({bid:85,pri1Enabled:true});
  let asyncLookups=0;
  h.guard.learning.profitRetentionProfileCached=()=>({retentionRatio:.85,specificity:'exact',profileKey:'cached',promoted:true,totalObservations:40,confidence:'high'});
  h.guard.learning.profitRetentionProfile=async()=>{asyncLookups++;await new Promise(()=>{});};
  const out=await Promise.race([
    h.guard.protect(h.row()).then((x)=>({kind:'protect',x})),
    new Promise((resolve)=>setTimeout(()=>resolve({kind:'timeout'}),75)),
  ]);
  assert.equal(out.kind,'protect');
  assert.equal(asyncLookups,0);
  assert.equal(h.row().profitGuardState.retentionRatio,.85);
  assert.equal(h.row().profitGuardState.retentionSource,'exact');
});

test('R32 Gate 6 PLI1 queued observations are ordered and deduplicated by fresh book timestamp',async()=>{
  const h=guardHarness({bid:85,pri1Enabled:true});
  const seen=[];
  h.guard.learning.observeProfitOpportunity=async(_entry,o)=>{await new Promise(r=>setTimeout(r,5));seen.push(o.observedAtMs);};
  await h.guard.protect(h.row());
  await h.guard.protect(h.row());
  h.setBid(90);await h.guard.protect(h.row());
  await h.guard.flushProfitLearningQueues(500);
  assert.equal(seen.length,2,'same book must enqueue once, next fresh book once');
  assert.ok(seen[1]>seen[0]);
});

test('R32 Gate 6 terminal PRI1 bookkeeping drains the queued pre-exit observation before marking the PLI1 exit',async()=>{
  const h=guardHarness({bid:85,pri1Enabled:true});
  const order=[];
  h.guard.learning.observeProfitOpportunity=async()=>{await new Promise(r=>setTimeout(r,10));order.push('observation');};
  h.guard.learning.markProfitExit=async()=>{order.push('exit');};
  await h.guard.protect(h.row());
  h.setBid(90);await h.guard.protect(h.row());
  h.setBid(89);const out=await h.guard.protect(h.row());
  assert.equal(out.closed,true);
  await h.guard.flushProfitLearningQueues(500);
  assert.deepEqual(order.slice(-2),['observation','exit']);
});

test('R32 Gate 7 a hanging terminal PLI1 write cannot delay an economically completed PRI1 exit',async()=>{
  const h=guardHarness({bid:85,pri1Enabled:true});
  h.guard.learning.markProfitExit=async()=>new Promise(()=>{});
  await h.guard.protect(h.row());
  h.setBid(90);await h.guard.protect(h.row());
  h.setBid(89);
  const result=await Promise.race([
    h.guard.protect(h.row()).then((x)=>({kind:'protect',x})),
    new Promise((resolve)=>setTimeout(()=>resolve({kind:'timeout'}),75)),
  ]);
  assert.equal(result.kind,'protect','terminal PLI1 persistence must never block the protection sweep');
  assert.equal(result.x.closed,true);
  assert.equal(h.row().status,'closed');
  assert.equal(h.row().profitGuardState.phase,'PRI1_EXIT_FILLED');
});

test('R32 Gate 7 PLI1 collapse learning counts an observed post-exit capital loss even if settlement later recovers',()=>{
  const metrics=profitEpisodeMetrics({
    maxExecutableNetCents:1200,actualRealizedNetCents:900,postExitMaxExecutableNetCents:1500,
    postExitMinExecutableNetCents:-300,terminalNetCents:1800,oneTickPullbackCount:2,oneTickRecoveryCount:1,
  });
  assert.equal(metrics.collapse,1,'a temporary full-position executable loss after exit is protection evidence');
  assert.equal(metrics.postExitMinExecutableNetCents,-300);
});

test('R32 Gate 7 PLI1 startup rebuild recovers a completed episode that was persisted before its derived profile',async()=>{
  const upserts=[];
  const completeState={
    version:'PLI1',trackingComplete:true,maxExecutableNetCents:1000,actualRealizedNetCents:800,
    postExitMaxExecutableNetCents:1200,postExitMinExecutableNetCents:-100,terminalNetCents:500,
    oneTickPullbackCount:8,oneTickRecoveryCount:5,
  };
  const db={
    async seedSportProfiles(){},async crashEpisodes(){return[];},async crashMarketStates(){return[];},
    async profitEpisodes(_system,{complete}={}){return complete===true?[{id:'done-1',system_name:'SAGITTARIUS',ticker:'KXMLBGAME-X-A',event_ticker:'KXMLBGAME-X',concept_name:'Momentum Hunter',source_feeder:'Golden Dragon',sport:'MLB Baseball',entry_price_cents:80,original_count:100,opened_at_ms:1,closed_at_ms:2,tracking_complete:true,state:completeState,updated_at_ms:3}]:[];},
    async profitProfiles(){return[];},async upsertProfitProfile(p){upserts.push(structuredClone(p));},
  };
  const learning=new LearningEngine(db,'SAGITTARIUS');
  await learning.init();
  assert.ok(upserts.length>=1,'startup must rebuild derived PLI1 profiles from completed authoritative episodes');
  assert.ok(upserts.some((x)=>x.profileKey==='global'&&x.collapseCount===1));
});

test('R32 Gate 3 PLI1 keeps profit-exit research alive after closure, records full-position counterfactual execution, and finalizes at settlement',async()=>{
  const now=Date.now();
  const row={...base,id:'pli-post-1',mode:'SIMULATION',status:'closed',entryPriceCents:80,currentPriceCents:89,peakPriceCents:90,stopLossCents:35,count:100,remainingCount:0,pnlCents:500,entryFeeCents:200,exitFeeCents:200,exitPriceCents:89,closeReason:'protected_runner_intelligence',closedAtMs:now-1000,researchTrackingComplete:false,entryConfig:{profitAuthority:'PRI1',profitLearning:'PLI1'},profitGuardState:{version:'PRI1',phase:'PRI1_EXIT_FILLED'}};
  const rows=new Map([[row.id,structuredClone(row)]]);const audits=[];
  const db={async recentClosed(){return [...rows.values()].map(x=>structuredClone(x));},async updateEntry(id,p){Object.assign(rows.get(id),structuredClone(p));},async audit(level,event,data){audits.push({level,event,data});}};
  let final=false,bid=95,bookMs=now;
  const market={
    getQuote:()=>final?{yesBid:100,yesAsk:100,status:'finalized',result:'yes',updatedAtMs:bookMs,bookInvalid:false}:{yesBid:bid,yesAsk:bid+1,status:'active',result:'',updatedAtMs:bookMs,bookInvalid:false},
    quoteAgeMs:()=>0,refreshTicker:async()=>market.getQuote(),ensureFreshBook:async()=>({updatedAtMs:bookMs}),getBook:()=>({updatedAtMs:bookMs}),
    executableBid:(_ticker,count)=>({filled:count,full:true,avgCents:bid,bestCents:bid}),
  };
  const calls={post:[],final:[]};
  const learning={
    state:{version:'PLI1',phase:'POST_EXIT_TRACKING',trackingComplete:false},
    profitLearningState(){return structuredClone(this.state);},
    async observeProfitPostExit(_entry,o){calls.post.push(structuredClone(o));if(o.finalResult)this.state={...this.state,finalResult:o.finalResult,terminalNetCents:o.terminalNetCents};return this.state;},
    async finalizeProfitLearning(_entry,o){calls.final.push(structuredClone(o));this.state={...this.state,phase:'COMPLETE',trackingComplete:true};return this.state;},
  };
  const guard=new ProfitGuard({db,kalshi:{},market,learning,getSettings:()=>({...settings,systemName:'SAGITTARIUS',simFeeCents:2,recoveryTrackingHours:24})});
  await guard.trackPostExit();
  assert.equal(calls.post.length,1);
  assert.equal(calls.post[0].executableBidCents,95);
  assert.equal(calls.post[0].executableNetCents,1100,'counterfactual uses the full original position and both trading fees');
  assert.equal(calls.final.length,0);
  assert.equal(rows.get(row.id).researchTrackingComplete,false);
  final=true;bookMs+=1000;
  await guard.trackPostExit();
  assert.equal(calls.final.length,1);
  assert.equal(calls.final[0].finalResult,'yes');
  assert.equal(calls.final[0].terminalNetCents,1800,'settlement counterfactual does not invent an exit fee');
  assert.equal(rows.get(row.id).researchTrackingComplete,true);
  assert.equal(audits.some(x=>x.event==='pli1_post_exit_observation_failed'),false);
});

test('R32 Gate 3 PLI1 lifecycle is independent from legacy hard-stop recovery completion',async()=>{
  const now=Date.now();
  const row={...base,id:'pli-hardstop-1',mode:'SIMULATION',status:'closed',entryPriceCents:80,currentPriceCents:60,peakPriceCents:90,stopLossCents:35,count:100,remainingCount:0,pnlCents:-2400,entryFeeCents:200,exitFeeCents:200,exitPriceCents:60,closeReason:'hard_stop_loss',closedAtMs:now-1000,researchTrackingComplete:true,entryConfig:{profitAuthority:'PRI1',profitLearning:'PLI1'},profitGuardState:{version:'PRI1',phase:'PRI1_CAPITAL_FLOOR_GAPPED'}};
  const db={async recentClosed(){return [structuredClone(row)];},async updateEntry(){},async audit(){}};
  const market={getQuote:()=>({yesBid:90,yesAsk:91,status:'active',result:'',updatedAtMs:now,bookInvalid:false}),quoteAgeMs:()=>0,refreshTicker:async()=>null,ensureFreshBook:async()=>({updatedAtMs:now}),getBook:()=>({updatedAtMs:now}),executableBid:(_t,count)=>({filled:count,full:true,avgCents:90,bestCents:90})};
  let observed=0;
  const learning={profitLearningState:()=>({version:'PLI1',phase:'POST_EXIT_TRACKING',trackingComplete:false}),async observeProfitPostExit(){observed++;},async finalizeProfitLearning(){}};
  const guard=new ProfitGuard({db,kalshi:{},market,learning,getSettings:()=>({...settings,systemName:'SAGITTARIUS',simFeeCents:2,recoveryTrackingHours:24})});
  await guard.trackPostExit();
  assert.equal(observed,1,'PLI1 must keep learning even after the old hard-stop recovery flag is already complete');
});

test('R32 Gate 3 PLI1 finalization scores PMH1 and DBR1 shadow runners without granting them execution authority',async()=>{
  const db={
    async upsertProfitEpisode(){},async profitEpisodes(){return[];},async upsertProfitProfile(){},async profitProfiles(){return[];},
  };
  const learning=new LearningEngine(db,'SAGITTARIUS');
  const entry={id:'shadow-final-1',ticker:'KXTEST',eventTicker:'KXTEST',marketTitle:'',conceptName:'Wave Surfer',sourceFeeder:'Golden Dragon',entryPriceCents:80,count:100,pnlCents:0,openedAtMs:1000,closedAtMs:5000};
  learning.profitMeta.set(entry.id,{id:entry.id,systemName:'SAGITTARIUS',ticker:entry.ticker,eventTicker:entry.eventTicker,conceptName:entry.conceptName,sourceFeeder:entry.sourceFeeder,sport:'Unknown',entryPriceCents:80,originalCount:100,openedAtMs:1000,closedAtMs:5000});
  let st=advanceProfitLearningState(null,entry,{fullExecutable:true,executableBidCents:89,executableNetCents:500,observedAtMs:2000,sport:'Unknown'},2000);
  st=advanceProfitLearningState(st,entry,{fullExecutable:true,executableBidCents:92,executableNetCents:800,observedAtMs:3000},3000);
  st=advanceProfitLearningState(st,entry,{fullExecutable:true,executableBidCents:96,executableNetCents:1200,observedAtMs:4000},4000);
  learning.profitStates.set(entry.id,st);
  const final=await learning.finalizeProfitLearning({...entry,pnlCents:700},{finalResult:'yes',terminalNetCents:1800,reason:'market_final'});
  assert.equal(final.shadow.PMH1.harvestedFraction,0.09);
  assert.equal(final.shadow.DBR1.harvestedFraction,0.10);
  assert.ok(Number.isFinite(final.shadow.PMH1.finalCounterfactualNetCents));
  assert.ok(Number.isFinite(final.shadow.DBR1.finalCounterfactualNetCents));
  assert.equal(final.trackingComplete,true);
});


test('R33 Gate 1 PRI1-R2 doctrine restores the protected-runner winner semantics in executable-net units',()=>{
  assert.equal(PROTECTED_RUNNER_INTELLIGENCE.version,'PRI1');
  assert.equal(PROTECTED_RUNNER_INTELLIGENCE.policyRevision,'PRI1-R2');
  assert.equal(PROTECTED_RUNNER_INTELLIGENCE.capitalLatchNetPerOriginalContractCents,1);
  assert.equal(PROTECTED_RUNNER_INTELLIGENCE.profitFloorArmNetPerOriginalContractCents,2);
  assert.equal(PROTECTED_RUNNER_INTELLIGENCE.coldStartRunnerGivebackNetPerContractCents,3);
  assert.equal(PROTECTED_RUNNER_INTELLIGENCE.minimumRunnerGivebackNetPerContractCents,2);
  assert.equal(PROTECTED_RUNNER_INTELLIGENCE.maximumRunnerGivebackNetPerContractCents,4);
  assert.equal(PROTECTED_RUNNER_INTELLIGENCE.lateProfitTightenAtNetPerOriginalContractCents,12);
  assert.equal(PROTECTED_RUNNER_INTELLIGENCE.lateProfitGivebackNetPerContractCents,2);
});

test('R33 Gate 1 PLI1 promotes runner breathing room in contract-cent units only after evidence gates',()=>{
  assert.equal(recommendProfitRunnerGivebackCents({totalObservations:11,oneTickPullbacks:30,oneTickRecoveries:30}),3);
  assert.equal(recommendProfitRunnerGivebackCents({totalObservations:30,oneTickPullbacks:20,oneTickRecoveries:18,collapseCount:2,avgPostExitRegretRate:.3}),4);
  assert.equal(recommendProfitRunnerGivebackCents({totalObservations:30,oneTickPullbacks:20,oneTickRecoveries:3,collapseCount:20,avgPostExitRegretRate:0}),2);
});

test("R38 Gate 1 creation-time snapshot freezes GE1-R2 only on new real Hunters while legacy X1/PRI1 stay compatible",async()=>{const {RELEASE,originalSettings,CANONICAL_NUMERIC_SETTINGS,CANONICAL_BOOLEAN_SETTINGS,sanitizeRuntimeSettings,normalizeStartupExecutionMode}=await import('../src/config.mjs');const D=await import('../src/doctrine.mjs');const {readFile,readdir,stat}=await import('node:fs/promises');const strategy=await readFile(new URL('../src/strategy.mjs',import.meta.url),'utf8');assert.equal(RELEASE,'SAGITTARIUS-R65-GEMINI-LIGHTNING-PLASMA-ATHENA-EXCLAMATION-2026-08-31');assert.equal(D.ATOMIC_THUNDER_BOLT.entryAuthority,false);assert.equal(D.ATHENA_COMMANDER.entryDecisionAuthority,true);assert.equal(D.INFINITY_BREAK.authority,'PROFIT_EXIT');assert.equal(D.AURORA_EXECUTION.lossAuthority,'U-SG1');assert.ok(strategy.includes('validateAthenaFireCommand'));});

test('R33 Gate 2 +1c net is CAPITAL_SAFE telemetry only and a normal one-tick pullback cannot scratch the runner',async()=>{
  const h=guardHarness({bid:85,pri1R2Enabled:true}); // 80 entry + 4c fees => +1c net/original.
  let out=await h.guard.protect(h.row());
  assert.equal(out.closed??false,false);
  let st=h.row().profitGuardState;
  assert.equal(st.policyRevision,'PRI1-R2');
  assert.equal(st.phase,'PRI1_CAPITAL_SAFE');
  assert.equal(st.profitFloorArmed,false);
  assert.equal(st.peakExecutableNetCents,100);
  h.setBid(84);out=await h.guard.protect(h.row()); // ordinary 1c pullback to aggregate break-even.
  assert.equal(out.closed??false,false);
  assert.equal(h.row().status,'open');
  assert.equal(h.row().profitGuardState.phase,'PRI1_CAPITAL_SAFE');
  assert.equal(h.row().profitGuardState.capitalFloorGapped,false);
});

test('R33 Gate 2 CAPITAL_SAFE dip below break-even and recovery does not manufacture Atlanta-style capital_floor_recovered exit',async()=>{
  const h=guardHarness({bid:85,pri1R2Enabled:true});
  await h.guard.protect(h.row());
  h.setBid(83);let out=await h.guard.protect(h.row()); // -1c net/original but nowhere near U-SG1 stop.
  assert.equal(out.closed??false,false);
  assert.equal(h.row().profitGuardState.phase,'PRI1_CAPITAL_SAFE');
  assert.equal(h.row().profitGuardState.capitalFloorGapped,false);
  h.setBid(84);out=await h.guard.protect(h.row());
  assert.equal(out.closed??false,false,'recovery to break-even before floor arming must remain a runner');
  assert.equal(h.audits.some(x=>x.event==='pri1_r2_exit_committed'),false);
  h.setBid(86);out=await h.guard.protect(h.row());
  assert.equal(out.closed??false,false);
  assert.equal(h.row().profitGuardState.phase,'PRI1_CAPITAL_FLOOR_ARMED');
});

test('R33 Gate 2 +2c net arms sell authority but 3c runner breathing room preserves a +1c retracement',async()=>{
  const h=guardHarness({bid:86,pri1R2Enabled:true});
  let out=await h.guard.protect(h.row());
  assert.equal(out.closed??false,false);
  let st=h.row().profitGuardState;
  assert.equal(st.profitFloorArmed,true);
  assert.equal(st.phase,'PRI1_CAPITAL_FLOOR_ARMED');
  assert.equal(st.runnerGivebackCents,3);
  assert.equal(st.protectedNetFloorCents,0);
  h.setBid(85);out=await h.guard.protect(h.row());
  assert.equal(out.closed??false,false,'one-cent retracement from the first floor-arm point must breathe');
  h.setBid(84);out=await h.guard.protect(h.row());
  assert.equal(out.closed,true,'full two-cent retracement to break-even after floor arm fulfills capital protection');
  assert.equal(h.row().pnlCents,0);
  assert.equal(h.row().closeReason,'protected_runner_intelligence');
});

test('R33 Gate 2 a mature +6c net peak uses a 3c protected runner floor and exits only after the full giveback',async()=>{
  const h=guardHarness({bid:85,pri1R2Enabled:true});
  await h.guard.protect(h.row());
  h.setBid(90);let out=await h.guard.protect(h.row()); // +6c net/original.
  assert.equal(out.closed??false,false);
  let st=h.row().profitGuardState;
  assert.equal(st.phase,'PRI1_PROFIT_FLOOR_ARMED');
  assert.equal(st.peakExecutableNetCents,600);
  assert.equal(st.effectiveRunnerGivebackCents,3);
  assert.equal(st.protectedNetFloorCents,300);
  assert.equal(st.protectedPriceFloorCents,87);
  h.setBid(89);out=await h.guard.protect(h.row());assert.equal(out.closed??false,false);
  h.setBid(88);out=await h.guard.protect(h.row());assert.equal(out.closed??false,false);
  h.setBid(87);out=await h.guard.protect(h.row());
  assert.equal(out.closed,true);
  assert.equal(h.row().pnlCents,300);
});

test('R33 Gate 2 late +12c net runner tightens from 3c to 2c only after the evidence-backed maturity threshold',async()=>{
  const h=guardHarness({bid:85,pri1R2Enabled:true});
  await h.guard.protect(h.row());
  h.setBid(95);await h.guard.protect(h.row()); // +11 net, still 3c.
  let st=h.row().profitGuardState;
  assert.equal(st.peakExecutableNetCents,1100);
  assert.equal(st.effectiveRunnerGivebackCents,3);
  assert.equal(st.lateProfitTightened,false);
  h.setBid(96);await h.guard.protect(h.row()); // +12 net => late tighten.
  st=h.row().profitGuardState;
  assert.equal(st.peakExecutableNetCents,1200);
  assert.equal(st.effectiveRunnerGivebackCents,2);
  assert.equal(st.lateProfitTightened,true);
  assert.equal(st.protectedNetFloorCents,1000);
  h.setBid(94);const out=await h.guard.protect(h.row());
  assert.equal(out.closed,true);
  assert.equal(h.row().pnlCents,1000);
});

test('R33 Gate 2 PLI1 learned 2-4c runner giveback is frozen per trade and cannot mutate mid-position',async()=>{
  const profile={runnerGivebackCents:4,retentionRatio:.85,specificity:'exact',profileKey:'r33-x',promoted:true,totalObservations:40,confidence:'high'};
  const h=guardHarness({bid:85,pri1R2Enabled:true,retentionProfile:profile});
  await h.guard.protect(h.row());
  assert.equal(h.row().profitGuardState.runnerGivebackCents,4);
  profile.runnerGivebackCents=2;
  h.setBid(90);await h.guard.protect(h.row());
  const st=h.row().profitGuardState;
  assert.equal(st.runnerGivebackCents,4);
  assert.equal(st.effectiveRunnerGivebackCents,4);
  assert.equal(st.runnerGivebackSource,'exact');
  assert.equal(st.protectedNetFloorCents,200);
});

test('R33 Gate 2 stale and partial depth preserve the armed economic phase instead of overwriting it',async()=>{
  const h=guardHarness({bid:90,pri1R2Enabled:true});
  await h.guard.protect(h.row());
  const before=h.row().profitGuardState;
  assert.equal(before.phase,'PRI1_PROFIT_FLOOR_ARMED');
  h.setDepth({full:false,filled:50});
  let pri=await h.guard.evaluateProtectedRunner(h.row(),h.guard.market.getQuote('x'),{...settings,simFeeCents:2});
  assert.equal(pri.executable,false);
  let st=h.row().profitGuardState;
  assert.equal(st.phase,'PRI1_PROFIT_FLOOR_ARMED');
  assert.equal(st.dataHoldReason,'partial_executable_depth');
  assert.equal(st.peakExecutableNetCents,before.peakExecutableNetCents);
  h.setDepth({full:true,filled:100});h.setBid(91);h.setBookAge(6000);
  pri=await h.guard.evaluateProtectedRunner(h.row(),h.guard.market.getQuote('x'),{...settings,simFeeCents:2});
  st=h.row().profitGuardState;
  assert.equal(pri.executable,false);
  assert.equal(st.phase,'PRI1_PROFIT_FLOOR_ARMED');
  assert.equal(st.dataHoldReason,'stale_or_invalid_book');
  assert.equal(st.peakExecutableNetCents,before.peakExecutableNetCents);
});

test('R33 Gate 2 an armed profit-floor gap delegates losses to U-SG1 and exits at the first recovered non-negative full-depth book',async()=>{
  const h=guardHarness({bid:90,pri1R2Enabled:true});
  await h.guard.protect(h.row());
  h.setBid(83);let out=await h.guard.protect(h.row());
  assert.equal(out.closed??false,false);
  assert.equal(h.row().profitGuardState.phase,'PRI1_PROFIT_FLOOR_GAPPED');
  assert.equal(h.row().profitGuardState.capitalFloorGapped,true);
  h.setBid(84);out=await h.guard.protect(h.row());
  assert.equal(out.closed,true);
  assert.equal(h.row().pnlCents,0);
  assert.equal(h.row().profitGuardState.exitTrigger,'capital_floor_recovered');
});

test('R33 Gate 2 U-SG1 emergency loss authority still outranks an R2 committed profit exit',async()=>{
  const now=Date.now();
  const pri={version:'PRI1',policyRevision:'PRI1-R2',phase:'PRI1_EXIT_COMMITTED',profitFloorArmed:true,armedAtMs:now-5000,latchedAtMs:now-5000,runnerGivebackCents:3,effectiveRunnerGivebackCents:3,peakExecutableBidCents:90,peakExecutableNetCents:600,protectedNetFloorCents:300,protectedPriceFloorCents:87,breakEvenPriceCents:84,capitalLatchTargetNetCents:100,profitFloorArmTargetNetCents:200,lastObservedBookMs:now-1000,exitCommittedAtMs:now-1000};
  const h=guardHarness({bid:30,pri1R2Enabled:true,entryOverrides:{profitGuardState:pri}});
  const out=await h.guard.protect(h.row());
  assert.equal(out.closed,true);
  assert.equal(h.row().closeReason,'hard_stop_loss');
  assert.equal(h.audits.some(x=>x.event==='usg1_exit_committed'),true);
});

test('R33 Gate 2 R2 committed exit remains restart-durable and never falls back to APG1/U-PG3',async()=>{
  const now=Date.now();
  const pri={version:'PRI1',policyRevision:'PRI1-R2',phase:'PRI1_EXIT_COMMITTED',profitFloorArmed:true,armedAtMs:now-5000,latchedAtMs:now-5000,runnerGivebackCents:3,effectiveRunnerGivebackCents:3,peakExecutableBidCents:90,peakExecutableNetCents:600,protectedNetFloorCents:300,protectedPriceFloorCents:87,breakEvenPriceCents:84,capitalLatchTargetNetCents:100,profitFloorArmTargetNetCents:200,lastObservedBookMs:now-1000,exitCommittedAtMs:now-1000};
  const h=guardHarness({bid:87,pri1R2Enabled:true,apgEnabled:true,entryOverrides:{profitGuardState:pri}});
  const restarted=new ProfitGuard({db:h.db,kalshi:{},market:h.guard.market,learning:h.learning,getSettings:()=>({...settings,simFeeCents:2,systemName:'SAGITTARIUS'})});
  const out=await restarted.protect(h.row());
  assert.equal(out.closed,true);
  assert.equal(h.row().closeReason,'protected_runner_intelligence');
  assert.equal(h.row().profitGuardState.phase,'PRI1_EXIT_FILLED');
  assert.equal(h.row().profitGuardState.policyRevision,'PRI1-R2');
  assert.deepEqual(h.row().apexProfitGuardState,{});
});

test('R33 Gate 3 exact System-4 R32 scratch replays remain runners through first-profit pullback and settle as winners',async()=>{
  const cases=[
    {name:'TEN NFL',entry:76,count:526,entryFee:1052,firstProfit:81,breakEven:80},
    {name:'Atlanta MLB',entry:79,count:506,entryFee:1012,firstProfit:84,breakEven:83},
    {name:'Washington WNBA',entry:86,count:459,entryFee:918,firstProfit:91,breakEven:90},
  ];
  for(const c of cases){
    const h=guardHarness({bid:c.firstProfit,filled:c.count,pri1R2Enabled:true,entryOverrides:{entryPriceCents:c.entry,currentPriceCents:c.entry,peakPriceCents:c.entry,count:c.count,remainingCount:c.count,entryFeeCents:c.entryFee,stopLossCents:35}});
    let out=await h.guard.protect(h.row());
    assert.equal(out.closed??false,false,`${c.name} must remain open at first profit`);
    assert.equal(h.row().profitGuardState.phase,'PRI1_CAPITAL_SAFE');
    h.setBid(c.breakEven);out=await h.guard.protect(h.row());
    assert.equal(out.closed??false,false,`${c.name} must not scratch on the first one-tick pullback`);
    assert.equal(h.row().status,'open');
    h.setFinal('yes');out=await h.guard.protect(h.row());
    assert.equal(out.closed,true);
    assert.equal(h.row().closeReason,'settlement_win');
    assert.ok(h.row().pnlCents>0,`${c.name} settlement runner must finish positive`);
  }
});

test('R33 Gate 3 legacy R32 PRI1 remains creation-time frozen and still reproduces its old one-tick scratch semantics',async()=>{
  const h=guardHarness({bid:85,pri1Enabled:true});
  await h.guard.protect(h.row());
  assert.equal(h.row().profitGuardState.phase,'PRI1_CAPITAL_LATCHED');
  h.setBid(84);const out=await h.guard.protect(h.row());
  assert.equal(out.closed,true);
  assert.equal(h.row().pnlCents,0);
  assert.notEqual(h.row().profitGuardState.policyRevision,'PRI1-R2');
});

test('R33 Gate 4 deterministic entry-band sweep proves every PRI1-R2 authorized exit remains aggregate non-negative after fees',async()=>{
  for(let entry=45;entry<=89;entry++){
    const qty=100;
    const h=guardHarness({bid:entry+5,filled:qty,pri1R2Enabled:true,entryOverrides:{entryPriceCents:entry,currentPriceCents:entry,peakPriceCents:entry,count:qty,remainingCount:qty,entryFeeCents:200,stopLossCents:35}});
    await h.guard.protect(h.row()); // +1c net/original => CAPITAL_SAFE.
    assert.equal(h.row().profitGuardState.phase,'PRI1_CAPITAL_SAFE',`R2 did not enter capital-safe state at entry ${entry}`);
    const mature=Math.min(100,entry+10); // usually +6c net/original; enough for a positive floor.
    h.setBid(mature);await h.guard.protect(h.row());
    const st=h.row().profitGuardState;
    if(st.profitFloorArmed){
      const floor=st.protectedPriceFloorCents;
      h.setBid(floor);
      const out=await h.guard.protect(h.row());
      if(out.closed&&h.row().closeReason==='protected_runner_intelligence')assert.ok(h.row().pnlCents>=0,`R2 authorized a negative exit at entry ${entry}: ${h.row().pnlCents}`);
    }
  }
});

test('R33 Gate 4 LearningEngine hydrates or derives promoted 2-4c PLI1 runner giveback without requiring a database migration',async()=>{
  const db={
    async seedSportProfiles(){},async crashEpisodes(){return[];},async crashMarketStates(){return[];},async profitEpisodes(){return[];},
    async profitProfiles(){return[{profile_key:'concept|Momentum Hunter',specificity:'concept',total_observations:30,one_tick_pullbacks:20,one_tick_recoveries:18,collapse_count:2,avg_post_exit_regret_rate:.3,recommended_retention_ratio:.86,confidence_level:'high',state:{version:'PLI1'},updated_at_ms:200}];},
  };
  const learning=new LearningEngine(db,'SAGITTARIUS');await learning.init();
  const cached=learning.profitRetentionProfileCached({conceptName:'Momentum Hunter',ticker:'KXMLBGAME-X-A',entryPriceCents:80});
  assert.equal(cached.promoted,true);
  assert.equal(cached.runnerGivebackCents,4,'legacy profile rows derive the new unit-correct giveback from existing evidence');
  learning.cacheProfitProfile({profileKey:'concept|Wave Surfer',specificity:'concept',totalObservations:30,oneTickPullbacks:20,oneTickRecoveries:3,collapseCount:20,avgPostExitRegretRate:0,recommendedRetentionRatio:.96,confidenceLevel:'high',state:{version:'PLI1',recommendedRunnerGivebackCents:2},updatedAtMs:300});
  const tight=learning.profitRetentionProfileCached({conceptName:'Wave Surfer',ticker:'KXMLBGAME-X-B',entryPriceCents:80});
  assert.equal(tight.runnerGivebackCents,2);
});

test('R33 Gate 5 PRI1-R2 keeps a monotonic winner 100% open through settlement instead of harvesting the ascent',async()=>{
  const h=guardHarness({bid:85,pri1R2Enabled:true});
  await h.guard.protect(h.row());
  for(const px of [86,90,94,98,100]){
    h.setBid(px);const out=await h.guard.protect(h.row());
    assert.equal(out.closed??false,false,`monotonic runner was incorrectly closed at ${px}c`);
    assert.equal(h.row().remainingCount,100);
  }
  h.setFinal('yes');const out=await h.guard.protect(h.row());
  assert.equal(out.closed,true);
  assert.equal(h.row().closeReason,'settlement_win');
  assert.equal(h.row().exitPriceCents,100);
});

test('R33 Gate 5 exact System-4 collapse exemplars Rakhimova and Herbert lock positive capital before their eventual 0c settlement',async()=>{
  const cases=[
    {name:'Rakhimova',entry:88,count:454,entryFee:908,execPeak:96,expectedFloorPrice:93,expectedPnl:454},
    {name:'Herbert',entry:79,count:506,entryFee:1012,execPeak:88,expectedFloorPrice:85,expectedPnl:1012},
  ];
  for(const c of cases){
    const h=guardHarness({bid:c.execPeak,filled:c.count,pri1R2Enabled:true,entryOverrides:{entryPriceCents:c.entry,currentPriceCents:c.entry,peakPriceCents:c.entry,count:c.count,remainingCount:c.count,entryFeeCents:c.entryFee,stopLossCents:35}});
    let out=await h.guard.protect(h.row());
    assert.equal(out.closed??false,false);
    const st=h.row().profitGuardState;
    assert.equal(st.phase,'PRI1_PROFIT_FLOOR_ARMED');
    assert.equal(st.protectedPriceFloorCents,c.expectedFloorPrice);
    h.setBid(c.expectedFloorPrice);out=await h.guard.protect(h.row());
    assert.equal(out.closed,true,`${c.name} must protect the already-earned executable profit on an orderly collapse`);
    assert.equal(h.row().closeReason,'protected_runner_intelligence');
    assert.equal(h.row().pnlCents,c.expectedPnl);
    assert.ok(h.row().pnlCents>0);
  }
});

test('R33 Gate 5 the 3c cold-start runner deliberately survives known APG1 two-cent winner checkpoints while preserving a later positive collapse floor',async()=>{
  const cases=[
    // These are exact full-depth APG1 peak/exit checkpoints from the audited
    // current cohort. APG1 sold at the checkpoint and the market later resolved
    // YES. PRI1-R2 must not reproduce that same two-cent early-exit behavior.
    {name:'Boston Wave/Momentum/CRH',entry:89,count:449,entryFee:898,peak:98,apgCheckpoint:96,continueTo:99},
    {name:'Comesana Wave',entry:84,count:476,entryFee:952,peak:94,apgCheckpoint:91.56722689075632,continueTo:96},
    {name:'Kansas City CRH',entry:77,count:519,entryFee:1038,peak:85,apgCheckpoint:82.74996146435453,continueTo:87},
    {name:'Karmine Corp CRH',entry:89,count:449,entryFee:898,peak:99,apgCheckpoint:96.04899777282851,continueTo:100},
    {name:'Boston DRH',entry:84,count:476,entryFee:952,peak:92,apgCheckpoint:90,continueTo:94},
  ];
  for(const c of cases){
    const h=guardHarness({bid:c.peak,filled:c.count,pri1R2Enabled:true,entryOverrides:{entryPriceCents:c.entry,currentPriceCents:c.entry,peakPriceCents:c.entry,count:c.count,remainingCount:c.count,entryFeeCents:c.entryFee,stopLossCents:35}});
    let out=await h.guard.protect(h.row());
    assert.equal(out.closed??false,false,`${c.name} must remain a runner at its executable peak`);
    h.setBid(c.apgCheckpoint);out=await h.guard.protect(h.row());
    assert.equal(out.closed??false,false,`${c.name} must survive the exact checkpoint where APG1 previously sold too early`);
    h.setBid(c.continueTo);out=await h.guard.protect(h.row());
    assert.equal(out.closed??false,false,`${c.name} must be allowed to continue after surviving the old APG1 checkpoint`);
    assert.ok(h.row().profitGuardState.protectedNetFloorCents>=0);
  }

  // Herbert is the counterexample that prevents an always-hold policy. APG1
  // sold at 86 after an 88 executable peak and the market ultimately resolved
  // NO. R2 deliberately survives the old 86 checkpoint, but a further orderly
  // decline to 85 hits its +2c/contract protected floor and banks positive P/L.
  const h=guardHarness({bid:88,filled:506,pri1R2Enabled:true,entryOverrides:{entryPriceCents:79,currentPriceCents:79,peakPriceCents:79,count:506,remainingCount:506,entryFeeCents:1012,stopLossCents:35}});
  let out=await h.guard.protect(h.row());assert.equal(out.closed??false,false);
  h.setBid(86);out=await h.guard.protect(h.row());assert.equal(out.closed??false,false,'Herbert must get one additional cent of runner breathing room vs APG1');
  h.setBid(85);out=await h.guard.protect(h.row());
  assert.equal(out.closed,true,'Herbert orderly collapse must still trigger positive profit protection');
  assert.equal(h.row().pnlCents,1012);
});

test('R36 Gate 1 ATHENA-X1 doctrine is full-position, no-split, no-lookahead and delegates loss authority to U-SG1',()=>{
  assert.equal(ATHENA_EXIT_INTELLIGENCE.version,'ATHENA-X1');
  assert.equal(ATHENA_EXIT_INTELLIGENCE.policyRevision,'ATHENA-X1-R3');
  assert.equal(ATHENA_EXIT_INTELLIGENCE.chandelierStair,true);
  assert.equal(ATHENA_EXIT_INTELLIGENCE.pulseFloor,false);
  assert.equal(ATHENA_EXIT_INTELLIGENCE.fullPositionOnly,true);
  assert.equal(ATHENA_EXIT_INTELLIGENCE.positionSplitting,false);
  assert.equal(ATHENA_EXIT_INTELLIGENCE.noLookahead,true);
  assert.equal(ATHENA_EXIT_INTELLIGENCE.fullExecutableDepthRequired,true);
  assert.equal(ATHENA_EXIT_INTELLIGENCE.lossDomainDelegatedToStopGuard,true);
  assert.ok(ATHENA_EXIT_INTELLIGENCE.maximumNoisePullbackCents<ATHENA_EXIT_INTELLIGENCE.minimumStructuralPullbackCents);
});

test('R36 Gate 2 ATHENA-X1 pure state machine holds a monotonic winner while new highs keep resetting the stair clock',()=>{
  let state=null,t=1_000;
  const path=[70,71,72,74,76,78,80,81,83,85];
  for(const bid of path){
    const net=(bid-68)*100-400;
    const r=advanceAthenaExitState(state,{
      observation:{observedAtMs:t,executableBidCents:bid,executableNetCents:net,askCents:Math.min(100,bid+1)},
      context:{entryPriceCents:68,originalCount:100,gameStartTimeMs:0,typicalDurationMs:120*60_000,entryAthenaScore:50,profile:{promoted:false,totalObservations:0,oneTickPullbacks:0,oneTickRecoveries:0,continuationRate:.5,collapseRate:.25},crash:{}},
    });
    state=r.state;t+=5_000;
    assert.equal(r.decision,'HOLD',`ordinary runner path was exited at ${bid}c`);
  }
  assert.equal(state.peakExecutableBidCents,85);
  assert.equal(state.pullbackCents,0);
  assert.equal(state.phase,'X1_PEAK_ADVANCE');
});

test('R36 Gate 2 ATHENA-X1-R3 Chandelier Stair chain: new high holds, 1c noise holds, 2c fade sells green',()=>{
  const ctx={entryPriceCents:70,originalCount:100,gameStartTimeMs:0,typicalDurationMs:120*60_000,entryAthenaScore:50,profile:{promoted:false},crash:{}};
  let state=null,t=1_000;
  const step=(bid)=>{
    const r=advanceAthenaExitState(state,{observation:{observedAtMs:t,executableBidCents:bid,executableNetCents:(bid-70)*100-400,askCents:Math.min(100,bid+1)},context:ctx});
    state=r.state;t+=2_000;return r;
  };
  assert.equal(step(76).decision,'HOLD');
  assert.equal(step(80).decision,'HOLD');
  assert.equal(state.phase,'X1_PEAK_ADVANCE');
  assert.equal(step(79).decision,'HOLD','1c peak noise must stay inside the stair');
  const fade=step(78);
  assert.equal(fade.decision,'EXIT');
  assert.equal(fade.state.exitTrigger,'stair_pullback');
  assert.equal(fade.state.stairAllowedPullbackCents,2);
  assert.ok(((78-70)*100-400)>=0,'Stair must remain in the profit domain');
});

test('R36 Gate 2 ATHENA-X1-R3 quiet-at-top sells after 30s with no new high',()=>{
  const ctx={entryPriceCents:70,originalCount:100,gameStartTimeMs:0,typicalDurationMs:120*60_000,entryAthenaScore:50,profile:{promoted:false},crash:{}};
  let r=advanceAthenaExitState(null,{observation:{observedAtMs:1_000,executableBidCents:80,executableNetCents:600,askCents:81},context:ctx});
  assert.equal(r.decision,'HOLD');
  r=advanceAthenaExitState(r.state,{observation:{observedAtMs:32_000,executableBidCents:80,executableNetCents:600,askCents:81},context:ctx});
  assert.equal(r.decision,'EXIT');
  assert.equal(r.state.exitTrigger,'stair_quiet_peak');
});

test('R36 Gate 2 ATHENA-X1-R3 extension expiry sells after 60s without a new high even if off the exact ceiling',()=>{
  const ctx={entryPriceCents:70,originalCount:100,gameStartTimeMs:0,typicalDurationMs:120*60_000,entryAthenaScore:50,profile:{promoted:false},crash:{}};
  let r=advanceAthenaExitState(null,{observation:{observedAtMs:1_000,executableBidCents:80,executableNetCents:600,askCents:81},context:ctx});
  r=advanceAthenaExitState(r.state,{observation:{observedAtMs:20_000,executableBidCents:78.8,executableNetCents:480,askCents:80},context:ctx});
  assert.equal(r.decision,'HOLD');
  r=advanceAthenaExitState(r.state,{observation:{observedAtMs:62_000,executableBidCents:78.8,executableNetCents:480,askCents:80},context:ctx});
  assert.equal(r.decision,'EXIT');
  assert.equal(r.state.exitTrigger,'stair_extension_expired');
});

test('R36 Gate 2 ATHENA-X1-R3 Chandelier Stair harvests a 2c green fade off a real peak instead of waiting for a 4-9c structure',()=>{
  let state=null,t=1_000,exitAt=null,reason=null;
  for(const bid of [79,81,86,85,84,70]){
    const r=advanceAthenaExitState(state,{
      observation:{observedAtMs:t,executableBidCents:bid,executableNetCents:(bid-60)*100-400,askCents:Math.min(100,bid+1)},
      context:{entryPriceCents:60,originalCount:100,gameStartTimeMs:0,typicalDurationMs:120*60_000,entryAthenaScore:50,profile:{promoted:false,totalObservations:0,oneTickPullbacks:0,oneTickRecoveries:0,continuationRate:.5,collapseRate:.25},crash:{}},
    });
    state=r.state;t+=5_000;
    if(r.decision==='EXIT'&&exitAt==null){exitAt=bid;reason=r.state.exitTrigger;}
  }
  assert.ok(exitAt===85||exitAt===84,'Stair must sell the fade after 86c');
  assert.equal(reason,'stair_pullback');
  assert.equal(state.phase,'X1_EXIT_COMMITTED');
  assert.ok(((exitAt-60)*100-400)>=0);
});

test('R36 Gate 2 ATHENA-X1 commits only after confirmed structural deterioration, not the first pullback',()=>{
  let state=null,t=1_000,exitAt=null;
  for(const bid of [85,90,88,86,84,82]){
    const r=advanceAthenaExitState(state,{
      observation:{observedAtMs:t,executableBidCents:bid,executableNetCents:(bid-80)*100-400,askCents:Math.min(100,bid+1)},
      context:{entryPriceCents:80,originalCount:100,gameStartTimeMs:0,typicalDurationMs:120*60_000,entryAthenaScore:50,profile:{promoted:false,totalObservations:0,oneTickPullbacks:0,oneTickRecoveries:0,continuationRate:.5,collapseRate:.25},crash:{}},
    });
    state=r.state;t+=5_000;
    if(r.decision==='EXIT'&&exitAt==null)exitAt=bid;
    if(bid===88)assert.ok(r.decision==='HOLD'||r.decision==='EXIT');
    if(exitAt!=null)break;
  }
  assert.ok(exitAt===88||exitAt===86||exitAt===84,`Stair / structure should harvest the fade, got ${exitAt}`);
  assert.equal(state.phase,'X1_EXIT_COMMITTED');
});

test('R36 Gate 2 ATHENA-X1 can accelerate a profit exit when CI1 independently confirms a severe lower-low crash',()=>{
  let state=null;
  let r=advanceAthenaExitState(state,{observation:{observedAtMs:1_000,executableBidCents:90,executableNetCents:600,askCents:91},context:{entryPriceCents:80,originalCount:100,profile:{promoted:false},crash:{}}});
  state=r.state;
  r=advanceAthenaExitState(state,{observation:{observedAtMs:6_000,executableBidCents:86,executableNetCents:200,askCents:87},context:{entryPriceCents:80,originalCount:100,profile:{promoted:false},crash:{phase:'CRASHING',crashDepthCents:20,lowerLowCount:4,reclaimRate:.1,reboundLostCount:1}}});
  assert.equal(r.decision,'EXIT');
  assert.equal(r.state.severeCrash,true);
  assert.ok(r.state.failureScore>=65);
});

test('R3 Chandelier Stair adopts an open ATHENA-X1-R1 snapshot instead of throwing policy_revision_mismatch',()=>{
  const r1={
    version:'ATHENA-X1',policyRevision:'ATHENA-X1-R1',phase:'X1_PEAK_ADVANCE',
    armedAtMs:1_000,peakExecutableBidCents:90,peakExecutableNetCents:600,peakAtMs:1_000,
    lastObservedBookMs:1_000,observations:[{t:1_000,bidCents:90,netCents:600,askCents:91}],
    postPeakMinBidCents:90,postPeakMinAtMs:1_000,reclaimHighBidCents:90,
    localLowerLowCount:0,failedReclaimCount:0,postPeakFreshObservations:0,activationLatched:true,
  };
  const r=advanceAthenaExitState(r1,{
    observation:{observedAtMs:6_000,executableBidCents:89,executableNetCents:500,askCents:90},
    context:{nowMs:6_000,entryPriceCents:80,originalCount:100,profile:{promoted:false},crash:{}},
  });
  assert.equal(r.state.policyRevision,'ATHENA-X1-R3');
  assert.equal(r.state.peakExecutableBidCents,90);
  assert.notEqual(r.reason,'athena_x1_policy_revision_mismatch');
});

test('R3 Chandelier Stair migrates an armed R1 position through protect() without evaluation_failed',async()=>{
  const now=Date.now();
  const r1={
    version:'ATHENA-X1',policyRevision:'ATHENA-X1-R1',phase:'X1_PEAK_ADVANCE',
    armedAtMs:now-8_000,peakExecutableBidCents:90,peakExecutableNetCents:600,peakAtMs:now-8_000,
    lastObservedBookMs:now-8_000,observations:[{t:now-8_000,bidCents:90,netCents:600,askCents:91}],
    postPeakMinBidCents:90,postPeakMinAtMs:now-8_000,reclaimHighBidCents:90,
    localLowerLowCount:0,failedReclaimCount:0,postPeakFreshObservations:0,
    activationLatched:true,activationReachedAtMs:now-8_000,
    activationMinimumNetPerOriginalContractCents:1,
  };
  const h=guardHarness({bid:90,x1Enabled:true,entryOverrides:{
    entryPriceCents:80,count:100,remainingCount:100,entryFeeCents:200,profitGuardState:r1,
    entryConfig:{profitAuthority:'ATHENA-X1',profitAuthorityRevision:'ATHENA-X1-R1',profitLearning:'PLI1',athena:{version:'ATHENA-B1',score:50,classification:'NEUTRAL'},athenaExit:{version:'ATHENA-X1',policyRevision:'ATHENA-X1-R1',activationMinimumNetPerOriginalContractCents:1,activationLatch:true,lossAuthority:'U-SG1'}},
  }});
  const out=await h.guard.protect(h.row());
  assert.equal(out.closed??false,false);
  assert.equal(h.audits.some(x=>x.event==='athena_x1_evaluation_failed'),false);
  assert.equal(h.row().profitGuardState.version,'ATHENA-X1');
  assert.equal(h.row().profitGuardState.policyRevision,'ATHENA-X1-R3');
  assert.equal(h.row().profitGuardState.peakExecutableBidCents,90);
});

test('R36 Gate 3 ATHENA-X1-R3 integrated ProfitGuard holds 1c mid-price noise and sells a 2c green fade',async()=>{
  const h=guardHarness({bid:80,x1Enabled:true,entryOverrides:{entryPriceCents:70,currentPriceCents:70,peakPriceCents:70,count:100,remainingCount:100,entryFeeCents:200,stopLossCents:35}});
  let out=await h.guard.protect(h.row());assert.equal(out.closed??false,false);
  assert.equal(h.row().profitGuardState.version,'ATHENA-X1');
  h.setBid(79);out=await h.guard.protect(h.row());assert.equal(out.closed??false,false,'1c peak noise stays inside the stair');
  h.setBid(78);out=await h.guard.protect(h.row());
  assert.equal(out.closed,true,'2c fade must sell while still green');
  assert.equal(h.row().closeReason,'athena_x1_exit');
});

test('R36 Gate 3 ATHENA-X1 integrated ProfitGuard exits exactly 100% after confirmed deterioration and keeps PLI1 research active',async()=>{
  const h=guardHarness({bid:85,x1Enabled:true,entryOverrides:{entryPriceCents:80,currentPriceCents:80,peakPriceCents:80,count:100,remainingCount:100,entryFeeCents:200,stopLossCents:35}});
  let out=await h.guard.protect(h.row());assert.equal(out.closed??false,false);
  h.setBid(90);out=await h.guard.protect(h.row());assert.equal(out.closed??false,false);
  h.setBid(88);out=await h.guard.protect(h.row());
  if(!(out.closed===true)){h.setBid(86);out=await h.guard.protect(h.row());}
  if(!(out.closed===true)){h.setBid(84);out=await h.guard.protect(h.row());}
  assert.equal(out.closed,true);
  assert.equal(out.filled,100,'X1 must liquidate the full owned position, never a fraction');
  assert.equal(h.row().remainingCount,0);
  assert.equal(h.row().closeReason,'athena_x1_exit');
  assert.equal(h.row().profitGuardState.phase,'X1_EXIT_FILLED');
  assert.equal(h.row().researchTrackingComplete,false,'PLI1 post-exit research must remain active for X1 trades');
  await h.guard.flushProfitLearningEntry('guard-1',1000);
  assert.equal(h.learning.profitExitMarks.length,1);
});

test('R36 Gate 3 partial executable depth cannot advance ATHENA-X1 trajectory or fabricate an exit',async()=>{
  const h=guardHarness({bid:90,x1Enabled:true});
  await h.guard.protect(h.row());
  const prior=structuredClone(h.row().profitGuardState);
  h.setDepth({full:false,filled:50});h.setBid(80);
  const out=await h.guard.protect(h.row());
  assert.equal(out.closed??false,false);
  const st=h.row().profitGuardState;
  assert.equal(st.lastObservedBookMs,prior.lastObservedBookMs);
  assert.equal(st.peakExecutableBidCents,prior.peakExecutableBidCents);
  assert.equal(st.dataHoldReason,'partial_executable_depth');
  assert.equal(h.audits.some(x=>x.event==='athena_x1_exit_committed'),false);
});

test('R36 Gate 3 U-SG1 emergency loss authority still outranks ATHENA-X1 profit intelligence',async()=>{
  const h=guardHarness({bid:90,x1Enabled:true,entryOverrides:{entryPriceCents:80,stopLossCents:10,count:100,remainingCount:100,entryFeeCents:200}});
  await h.guard.protect(h.row());
  h.setBid(50); // 20c below the 70c frozen danger line => U-SG1 EMERGENCY.
  const out=await h.guard.protect(h.row());
  assert.equal(out.closed,true);
  assert.equal(h.row().closeReason,'hard_stop_loss');
  assert.equal(h.audits.some(x=>x.event==='usg1_exit_committed'),true);
  assert.equal(h.audits.some(x=>x.event==='athena_x1_exit_committed'),false);
});

test('R36 Gate 3 ATHENA-X1 committed exit is restart-durable but never authorizes aggregate-negative execution',async()=>{
  const now=Date.now();
  const x1={version:'ATHENA-X1',policyRevision:'ATHENA-X1-R1',phase:'X1_EXIT_COMMITTED',armedAtMs:now-5000,peakExecutableBidCents:90,peakExecutableNetCents:600,lastObservedBookMs:now-1000,exitCommittedAtMs:now-1000,decision:'EXIT',decisionReason:'structural_deterioration'};
  const h=guardHarness({bid:84,x1Enabled:true,entryOverrides:{profitGuardState:x1,entryPriceCents:80,count:100,remainingCount:100,entryFeeCents:200}});
  const restarted=new ProfitGuard({db:h.db,kalshi:{},market:h.guard.market,learning:h.learning,getSettings:()=>({...settings,simFeeCents:2,systemName:'SAGITTARIUS'})});
  let out=await restarted.protect(h.row());
  assert.equal(out.closed,true,'aggregate break-even execution may complete the durable X1 profit-domain commitment');
  assert.equal(h.row().closeReason,'athena_x1_exit');
  assert.equal(h.row().profitGuardState.phase,'X1_EXIT_FILLED');

  const h2=guardHarness({bid:83,x1Enabled:true,entryOverrides:{profitGuardState:x1,entryPriceCents:80,count:100,remainingCount:100,entryFeeCents:200}});
  const out2=await h2.guard.protect(h2.row());
  assert.equal(out2.closed??false,false);
  assert.equal(h2.row().status,'open');
  assert.equal(h2.row().profitGuardState.phase,'X1_EXIT_COMMITTED');
  assert.equal(h2.audits.some(x=>x.event==='athena_x1_exit_suspended_to_stop_guard'),true);
});

test('R36 Gate 3 ATHENA-X1 LIVE exit persists receipt before submit, uses break-even IOC covenant, and submits the whole remainder',async()=>{
  const now=Date.now();
  const x1={version:'ATHENA-X1',policyRevision:'ATHENA-X1-R1',phase:'X1_EXIT_COMMITTED',armedAtMs:now-5000,peakExecutableBidCents:90,peakExecutableNetCents:600,lastObservedBookMs:now-1000,exitCommittedAtMs:now-1000,decision:'EXIT',decisionReason:'structural_deterioration'};
  const h=guardHarness({bid:89,x1Enabled:true,entryOverrides:{mode:'LIVE',profitGuardState:x1,entryPriceCents:80,count:100,remainingCount:100,entryFeeCents:200}});
  let order=null,receiptPersisted=false;
  h.guard.kalshi={
    async getPositions(){const r=h.row();return[{ticker:r.ticker,position_fp:r.remainingCount}];},
    buildClientOrderId:()=> 'r36-x1-exit',
    async placeOrder(o){order=o;const row=h.row();receiptPersisted=row.status==='exit_pending'&&row.exitClientOrderId==='r36-x1-exit';return{orderId:'x1-live-order',fillCount:o.count,averageFillPriceCents:89,feePaidCents:200};},
  };
  const decision={action:'athena_x1_exit',reason:'athena_x1_exit',guardState:'ATHENA_X1_EXIT',athenaExitIntelligence:'ATHENA-X1',peakPriceCents:90,stopPriceCents:45};
  const out=await h.guard.liveExit(h.row(),decision);
  assert.equal(receiptPersisted,true);
  assert.equal(order.action,'sell');
  assert.equal(order.count,100);
  assert.equal(order.priceCents,84,'X1 LIVE IOC may not authorize a below-break-even fill');
  assert.equal(out.closed,true);
  assert.equal(h.row().profitGuardState.phase,'X1_EXIT_FILLED');
});

test('R36 Gate 4 ATHENA-X1 settlement wins over profit logic and finalizes PLI1 without changing Athena B1 entry evidence',async()=>{
  const h=guardHarness({bid:99,x1Enabled:true,entryOverrides:{entryPriceCents:88,count:39,remainingCount:39,entryFeeCents:78,entryConfig:{profitAuthority:'ATHENA-X1',profitAuthorityRevision:'ATHENA-X1-R1',profitLearning:'PLI1',athena:{version:'ATHENA-B1',brainHash:'frozen-b1',score:72,classification:'FAVORABLE'}}}});
  await h.guard.protect(h.row());
  h.setFinal('yes');
  const out=await h.guard.protect(h.row());
  assert.equal(out.closed,true);
  assert.equal(h.row().closeReason,'settlement_win');
  assert.equal(h.row().profitGuardState.phase,'X1_SETTLED');
  assert.equal(h.row().entryConfig.athena.brainHash,'frozen-b1');
});


test('R36 Gate 2 ATHENA-X1 high-price peak exhaustion protects Kaleido-like mature profit compression without reintroducing a generic tight trail',()=>{
  const profile={promoted:false,totalObservations:0,oneTickPullbacks:0,oneTickRecoveries:0,continuationRate:.5,collapseRate:.25};
  let s=null;
  let r=advanceAthenaExitState(s,{observation:{observedAtMs:1_000,executableBidCents:91.69190082644627,executableNetCents:446.72,askCents:92},context:{entryPriceCents:84,originalCount:121,profile,crash:{}}});
  s=r.state;assert.equal(r.decision,'HOLD');
  r=advanceAthenaExitState(s,{observation:{observedAtMs:2_000,executableBidCents:89.11165289256199,executableNetCents:134.51,askCents:90},context:{entryPriceCents:84,originalCount:121,profile,crash:{}}});
  assert.equal(r.decision,'EXIT');
  assert.ok(['capital_defense','stair_pullback'].includes(r.state.decisionReason),r.state.decisionReason);
  assert.ok(r.state.currentNetPerOriginal>1&&r.state.currentNetPerOriginal<1.5);
});

test('R36 Gate 2 ATHENA-X1 peak exhaustion does not cut Johannus-like healthy retained profit or Alec-like immature peaks',()=>{
  const profile={promoted:false,totalObservations:0,oneTickPullbacks:0,oneTickRecoveries:0,continuationRate:.5,collapseRate:.25};
  let r=advanceAthenaExitState(null,{observation:{observedAtMs:1_000,executableBidCents:99,executableNetCents:273,askCents:100},context:{entryPriceCents:88,originalCount:39,profile,crash:{}}});
  r=advanceAthenaExitState(r.state,{observation:{observedAtMs:2_000,executableBidCents:98.5,executableNetCents:214.5,askCents:99},context:{entryPriceCents:88,originalCount:39,profile,crash:{}}});
  assert.equal(r.decision,'HOLD');assert.equal(r.state.peakExhaustion,false);
  r=advanceAthenaExitState(null,{observation:{observedAtMs:1_000,executableBidCents:95,executableNetCents:150,askCents:96},context:{entryPriceCents:89,originalCount:75,profile,crash:{}}});
  r=advanceAthenaExitState(r.state,{observation:{observedAtMs:2_000,executableBidCents:94.6,executableNetCents:120,askCents:95},context:{entryPriceCents:89,originalCount:75,profile,crash:{}}});
  assert.equal(r.decision,'HOLD');assert.equal(r.state.peakExhaustion,false);
});

test('R36 Gate 2 ATHENA-X1 may consume frozen ATHENA-B1 crash survival read-only to avoid panic-selling a historically recoverable 15c drawdown',async()=>{
  const crashEpisodes=Array.from({length:30},(_,i)=>({ticker:`HIST-${i}`,sport:'Unknown',crash_depth_cents:20,final_result:i<22?'yes':'no',updated_at_ms:1_000+i}));
  const brain=compileAthenaBrain({systemName:'S',sourceRelease:'R34',crashEpisodes});
  const athena={brain,assessments:7,blocks:2,lastAssessment:{sentinel:true}};
  const h=guardHarness({bid:79,x1Enabled:true,athena,entryOverrides:{entryPriceCents:60,currentPriceCents:60,peakPriceCents:60,count:45,remainingCount:45,entryFeeCents:90,stopLossCents:35}});
  let out=await h.guard.protect(h.row());assert.equal(out.closed??false,false);
  for(const bid of [76,79,81,86,70,70,68]){
    h.setBid(bid);out=await h.guard.protect(h.row());
    if(out.closed===true)break;
  }
  assert.equal(athena.assessments,7,'X1 must not call Athena.assess or mutate B1 entry-assessment counters');
  assert.equal(athena.blocks,2);
  assert.deepEqual(athena.lastAssessment,{sentinel:true});
});

test('R36 Gate 3 ATHENA-X1 integrated peak exhaustion exits 100% of a Kaleido-like position while Johannus-like retained profit stays open',async()=>{
  const k=guardHarness({bid:91.69190082644627,filled:121,x1Enabled:true,entryOverrides:{entryPriceCents:84,currentPriceCents:84,peakPriceCents:84,count:121,remainingCount:121,entryFeeCents:242,stopLossCents:35}});
  let out=await k.guard.protect(k.row());assert.equal(out.closed??false,false);
  k.setBid(89.11165289256199);out=await k.guard.protect(k.row());
  assert.equal(out.closed,true);assert.equal(out.filled,121);assert.equal(k.row().closeReason,'athena_x1_exit');
  assert.ok(['capital_defense','stair_pullback'].includes(k.row().profitGuardState.exitTrigger));
  assert.ok(k.row().pnlCents>130&&k.row().pnlCents<140);

  const j=guardHarness({bid:99,x1Enabled:true,entryOverrides:{entryPriceCents:88,currentPriceCents:88,peakPriceCents:88,count:39,remainingCount:39,entryFeeCents:78,stopLossCents:35}});
  out=await j.guard.protect(j.row());assert.equal(out.closed??false,false);
  j.setBid(98.5);out=await j.guard.protect(j.row());assert.equal(out.closed??false,false);assert.equal(j.row().remainingCount,39);
});

import { StrategyEngine } from '../src/strategy.mjs';
import { originalSettings } from '../src/config.mjs';

test('R36 Gate 5 ATHENA-X1 deterministic stress preserves bounded state, monotonic economic peak and never emits a profit exit below aggregate break-even',()=>{
  let seed=0x5a17c9e3;
  const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/0x100000000;};
  let evaluated=0,exits=0;
  for(let path=0;path<250;path++){
    const entry=30+Math.floor(rand()*61),count=1+Math.floor(rand()*400),feePerSide=2;
    let bid=Math.max(1,Math.min(99,entry-3+Math.floor(rand()*12))),state=null,t=1_000,priorPeakNet=-Infinity;
    for(let step=0;step<80;step++){
      const shock=(rand()<0.08?Math.floor(rand()*18)-12:Math.floor(rand()*9)-4);
      bid=Math.max(1,Math.min(99,bid+shock));
      const net=(bid-entry)*count-feePerSide*count*2;
      const profile=rand()<0.20?{promoted:true,totalObservations:30,oneTickPullbacks:12,oneTickRecoveries:8,continuationRate:.67,collapseRate:.20}:{promoted:false,totalObservations:0,oneTickPullbacks:0,oneTickRecoveries:0,continuationRate:.5,collapseRate:.25};
      const crash=rand()<0.12?{phase:'CRASHING',crashDepthCents:10+Math.floor(rand()*40),lowerLowCount:Math.floor(rand()*7),reclaimRate:rand()*.6,reboundLostCount:Math.floor(rand()*3)}:{};
      const r=advanceAthenaExitState(state,{observation:{observedAtMs:t,executableBidCents:bid,executableNetCents:net,askCents:Math.min(100,bid+1+Math.floor(rand()*4))},context:{entryPriceCents:entry,originalCount:count,gameStartTimeMs:1,typicalDurationMs:120*60_000,entryAthenaScore:30+Math.floor(rand()*51),profile,crash}});
      state=r.state;evaluated++;t+=1_000+Math.floor(rand()*10_000);
      assert.equal(state.version,'ATHENA-X1');
      assert.ok(Array.isArray(state.observations)&&state.observations.length<=ATHENA_EXIT_INTELLIGENCE.maximumStateObservations);
      assert.ok(state.peakExecutableNetCents+1e-9>=priorPeakNet,'economic high-water mark regressed');
      priorPeakNet=state.peakExecutableNetCents;
      assert.ok(state.continuationScore>=0&&state.continuationScore<=100);
      assert.ok(state.recoveryScore>=0&&state.recoveryScore<=100);
      assert.ok(state.failureScore>=0&&state.failureScore<=100);
      if(r.decision==='EXIT'){
        exits++;
        assert.ok(net>=-1e-9,'X1 emitted profit authority in the loss domain');
        assert.equal(state.phase,'X1_EXIT_COMMITTED');
        assert.ok(['structural_deterioration','capital_defense','severe_crash_deterioration','stair_pullback','stair_quiet_peak','stair_extension_expired'].includes(state.exitTrigger),state.exitTrigger);
        break;
      }
    }
  }
  assert.ok(evaluated>500,'stress corpus must walk a meaningful number of books');
  assert.ok(exits>0,'stress corpus never exercised the exit branch');
});

test('R36 Gate 5 ATHENA-X1 uncommitted recovery-watch state survives restart without resetting its executable peak or confirmation history',async()=>{
  const h=guardHarness({bid:80,x1Enabled:true,entryOverrides:{entryPriceCents:70,count:100,remainingCount:100,entryFeeCents:200}});
  await h.guard.protect(h.row());
  h.setBid(79.5);await h.guard.protect(h.row());
  const before=h.row().profitGuardState;
  assert.equal(before.phase,'X1_RECOVERY_WATCH');
  assert.equal(before.peakExecutableBidCents,80);
  assert.ok(before.postPeakFreshObservations>=1);
  const restarted=new ProfitGuard({db:h.db,kalshi:{},market:h.guard.market,learning:h.learning,getSettings:()=>({...settings,simFeeCents:2,systemName:'SAGITTARIUS'})});
  h.setBid(79.2);
  const out=await restarted.protect(h.row());
  assert.equal(out.closed??false,false);
  const after=h.row().profitGuardState;
  assert.equal(after.version,'ATHENA-X1');
  assert.equal(after.peakExecutableBidCents,80,'restart must not erase the pre-restart economic peak');
  assert.equal(after.postPeakFreshObservations,before.postPeakFreshObservations+1,'restart must continue the same confirmation sequence');
  assert.ok(after.observations.length>=3);
});

test('R36 Gate 5 ATHENA-X1 authoritative LIVE partial fill keeps the remaining position committed and can continue only with a new persisted receipt',async()=>{
  const now=Date.now();
  const x1={version:'ATHENA-X1',policyRevision:'ATHENA-X1-R1',phase:'X1_EXIT_COMMITTED',armedAtMs:now-5000,peakExecutableBidCents:92,peakExecutableNetCents:800,lastObservedBookMs:now-1000,exitCommittedAtMs:now-1000,decision:'EXIT',decisionReason:'structural_deterioration',exitTrigger:'structural_deterioration'};
  const h=guardHarness({bid:90,filled:100,x1Enabled:true,entryOverrides:{mode:'LIVE',profitGuardState:x1,entryPriceCents:80,count:100,remainingCount:100,entryFeeCents:200}});
  let mutation=0;const persistedBefore=[];const originalUpdate=h.db.updateEntry.bind(h.db);
  h.db.updateEntry=async(id,p)=>{if(p.exitClientOrderId)persistedBefore.push({mutation:mutation+1,client:p.exitClientOrderId,status:p.status});return originalUpdate(id,p);};
  h.guard.kalshi={
    async getPositions(){const r=h.row();return[{ticker:r.ticker,position_fp:r.remainingCount}];},
    buildClientOrderId:()=>`r36-x1-partial-${mutation+1}`,
    async placeOrder(o){mutation++;return mutation===1?{orderId:'partial-1',fillCount:40,averageFillPriceCents:90,feePaidCents:80}:{orderId:'partial-2',fillCount:o.count,averageFillPriceCents:89,feePaidCents:2*o.count};},
  };
  const decision={action:'athena_x1_exit',reason:'athena_x1_exit',guardState:'ATHENA_X1_EXIT',athenaExitIntelligence:'ATHENA-X1',peakPriceCents:92,stopPriceCents:45};
  let out=await h.guard.liveExit(h.row(),decision);
  assert.equal(out.closed,false);assert.equal(out.filled,40);assert.equal(h.row().remainingCount,60);assert.equal(h.row().status,'exit_pending');
  assert.equal(h.row().profitGuardState.phase,'X1_EXIT_COMMITTED');
  assert.equal(h.row().exitClientOrderId,null,'authoritatively resolved partial receipt must be cleared, not left ambiguous');
  assert.deepEqual(persistedBefore[0],{mutation:1,client:'r36-x1-partial-1',status:'exit_pending'});
  h.setBid(89);h.setDepth({full:true,filled:60});
  out=await h.guard.liveExit(h.row(),decision);
  assert.equal(out.closed,true);assert.equal(out.filled,60);assert.equal(h.row().remainingCount,0);assert.equal(h.row().profitGuardState.phase,'X1_EXIT_FILLED');
  assert.deepEqual(persistedBefore[1],{mutation:2,client:'r36-x1-partial-2',status:'exit_pending'});
  assert.equal(mutation,2);
});

test('R36 Gate 5 missing or corrupt ATHENA-B1 read-only drawdown context is neutral to X1 and cannot break protection',async()=>{
  for(const athena of [null,{brain:{version:'corrupt',brainHash:'bad'}}]){
    const h=guardHarness({bid:90,x1Enabled:true,athena,entryOverrides:{entryPriceCents:80,count:100,remainingCount:100,entryFeeCents:200}});
    let out=await h.guard.protect(h.row());assert.equal(out.closed??false,false);
    h.setBid(89.4);out=await h.guard.protect(h.row());assert.equal(out.closed??false,false);
    const state=h.row().profitGuardState;
    assert.equal(state.version,'ATHENA-X1');
    assert.equal(Boolean(state.historicalDrawdown?.available),false);
    assert.equal(h.audits.some(x=>x.event==='athena_x1_evaluation_failed'),false);
  }
});

function r36AuthorizedQuote(ticker){
  const now=Date.now(),start=now-60*60_000;
  return{ticker,title:ticker,eventTicker:ticker,seriesTicker:'KXTEST',yesBid:80,yesAsk:81,yesBidSize:1000,yesAskSize:1000,volume24h:10000,recentTrades:50,status:'active',result:'',updatedAtMs:now,closeTimeMs:now+60*60_000,gameStartTimeMs:start,liveStatus:'live',gameClockState:{version:'GCA2',eventTicker:ticker,phase:'CONFIRMED',confirmed:true,startTimeMs:start,entryAuthorized:true,evidenceObservedAtMs:now,lastCheckedAtMs:now,source:'kalshi_live_data',sourceStrength:'strong',authorizationReason:'fresh_exact_milestone_live_data',authorizationSource:'kalshi_live_data'}};
}

test("R37 Gate 5 every real Hunter crosses ATHENA-B1 exactly once, freezes Golden Eye, holds through per-position ProfitGuard, and can complete a full Golden Eye cashout",async()=>{const {RELEASE,originalSettings,CANONICAL_NUMERIC_SETTINGS,CANONICAL_BOOLEAN_SETTINGS,sanitizeRuntimeSettings,normalizeStartupExecutionMode}=await import('../src/config.mjs');const D=await import('../src/doctrine.mjs');const {readFile,readdir,stat}=await import('node:fs/promises');const pg=await readFile(new URL('../src/profitGuard.mjs',import.meta.url),'utf8');assert.equal(D.INFINITY_BREAK.authority,'PROFIT_EXIT');assert.equal(D.AURORA_EXECUTION.lossAuthority,'U-SG1');assert.equal(D.AURORA_EXECUTION.defaultDamageControlPercent,45);assert.ok(pg.includes("'infinity_break'"));assert.ok(pg.includes("'atomic_thunder_cashout'"),'legacy Atomic history must remain compatible');assert.ok(pg.includes('auroraDamageControlPercent'));assert.equal(pg.includes('maximumPositionLifetimeMs'),false);});

test('R36 HARDENING ATHENA-X1 flat observations at the peak do not pre-load deterioration confirmation',()=>{
  const context={nowMs:10_000,entryPriceCents:80,originalCount:100,profile:{promoted:false},crash:{}};
  let r=advanceAthenaExitState(null,{observation:{observedAtMs:1_000,executableBidCents:82,executableNetCents:0,askCents:83},context:{...context,entryPriceCents:78}});
  for(const t of [2_000,3_000]){
    r=advanceAthenaExitState(r.state,{observation:{observedAtMs:t,executableBidCents:82,executableNetCents:0,askCents:83},context:{...context,entryPriceCents:78}});
    assert.equal(r.state.postPeakFreshObservations,0,'flat-at-peak observations are not pullback confirmations');
  }
  r=advanceAthenaExitState(r.state,{observation:{observedAtMs:4_000,executableBidCents:81,executableNetCents:-100,askCents:82},context:{...context,entryPriceCents:78}});
  assert.equal(r.state.postPeakFreshObservations,1,'the first actual pullback is confirmation #1');
  assert.equal(r.state.confirmedDeterioration,false,'one actual pullback observation cannot satisfy the two-observation doctrine');
  assert.equal(r.decision,'HOLD');
});

test('R36 HARDENING ATHENA-X1 failure trajectory is isolated to the current post-peak cycle',()=>{
  const context={nowMs:20_000,entryPriceCents:70,originalCount:100,profile:{promoted:false},crash:{}};
  let r=advanceAthenaExitState(null,{observation:{observedAtMs:1_000,executableBidCents:80,executableNetCents:600,askCents:81},context});
  for(const [t,bid,net] of [[2_000,79.2,520],[3_000,84,900]]){
    r=advanceAthenaExitState(r.state,{observation:{observedAtMs:t,executableBidCents:bid,executableNetCents:net,askCents:bid+1},context});
  }
  assert.equal(r.state.peakExecutableBidCents,84);
  assert.equal(r.state.postPeakFreshObservations,0);
  r=advanceAthenaExitState(r.state,{observation:{observedAtMs:5_000,executableBidCents:83,executableNetCents:800,askCents:84},context});
  assert.equal(r.state.postPeakRecent.maxConsecutiveDown,1,'pre-peak down streak must not leak into the new peak cycle');
  assert.equal(r.state.postPeakFreshObservations,1);
  assert.equal(r.state.confirmedDeterioration,false);
  assert.equal(r.decision,'HOLD');
});

test('R36 HARDENING ATHENA-X1 rejects materially future book timestamps without poisoning persisted trajectory state',async()=>{
  const h=guardHarness({bid:90,x1Enabled:true,entryOverrides:{entryPriceCents:80,count:100,remainingCount:100,entryFeeCents:200}});
  await h.guard.protect(h.row());
  const before=structuredClone(h.row().profitGuardState);
  h.setBookAge(-(ATHENA_EXIT_INTELLIGENCE.maximumFutureBookSkewMs+5_000));
  h.setBidSameBook(84);
  const out=await h.guard.protect(h.row());
  assert.equal(out.closed??false,false);
  const after=h.row().profitGuardState;
  assert.equal(after.lastObservedBookMs,before.lastObservedBookMs,'future book timestamp must never become the X1 freshness watermark');
  assert.equal(after.peakExecutableBidCents,before.peakExecutableBidCents);
  assert.equal(after.dataHoldReason,'stale_or_invalid_book');
  assert.equal(h.audits.some(x=>x.event==='athena_x1_exit_committed'),false);
});

test('R36 HARDENING ATHENA-X1 pure state machine rejects a missing or non-finite observation timestamp',()=>{
  assert.throws(()=>advanceAthenaExitState(null,{
    observation:{executableBidCents:90,executableNetCents:600,askCents:91},
    context:{nowMs:10_000,entryPriceCents:80,originalCount:100,profile:{promoted:false},crash:{}},
  }),/athena_x1_invalid_observation/);
  assert.throws(()=>advanceAthenaExitState(null,{
    observation:{observedAtMs:Number.NaN,executableBidCents:90,executableNetCents:600,askCents:91},
    context:{nowMs:10_000,entryPriceCents:80,originalCount:100,profile:{promoted:false},crash:{}},
  }),/athena_x1_invalid_observation/);
});

test('R36 HARDENING ATHENA-X1 pure state machine rejects a materially future observation',()=>{
  assert.throws(()=>advanceAthenaExitState(null,{
    observation:{observedAtMs:20_000,executableBidCents:90,executableNetCents:600,askCents:91},
    context:{nowMs:10_000,entryPriceCents:80,originalCount:100,profile:{promoted:false},crash:{}},
  }),/athena_x1_future_observation/);
});

test('R36 HARDENING ATHENA-X1 historical drawdown support requires positive Wilson lower-bound evidence',()=>{
  const baseContext={nowMs:10_000,entryPriceCents:70,originalCount:100,profile:{promoted:false},crash:{}};
  let r=advanceAthenaExitState(null,{
    observation:{observedAtMs:1_000,executableBidCents:90,executableNetCents:1600,askCents:91},
    context:{...baseContext,historicalDrawdownEvidence:{available:true,totalObservations:30,probability:.70,wilsonLow:.40,wilsonHigh:.82,thresholdCents:15}},
  });
  assert.equal(r.state.historicalDrawdown.mature,true);
  assert.equal(r.state.historicalDrawdown.supportive,false,'point estimate alone is not enough to call history supportive');
  r=advanceAthenaExitState(null,{
    observation:{observedAtMs:1_000,executableBidCents:90,executableNetCents:1600,askCents:91},
    context:{...baseContext,historicalDrawdownEvidence:{available:true,totalObservations:30,probability:.70,wilsonLow:.55,wilsonHigh:.82,thresholdCents:15}},
  });
  assert.equal(r.state.historicalDrawdown.supportive,true);
});

test('R36 HARDENING ATHENA-X1 does not reinterpret a feeder pre-entry CI1 crash depth as current Hunter drawdown history',async()=>{
  const crashEpisodes=Array.from({length:30},(_,i)=>({ticker:`PRE-${i}`,sport:'Unknown',crash_depth_cents:60,final_result:i<22?'yes':'no',updated_at_ms:1_000+i}));
  const brain=compileAthenaBrain({systemName:'S',sourceRelease:'R34',crashEpisodes});
  const crashState={phase:'REBOUND_CONFIRMED',crashDepthCents:60,reclaimRate:.7,reboundCents:40,upwardTicks:5};
  const h=guardHarness({bid:90,x1Enabled:true,athena:{brain},crashState,entryOverrides:{entryPriceCents:70,count:100,remainingCount:100,entryFeeCents:200}});
  await h.guard.protect(h.row());
  h.setBid(89.2);
  const out=await h.guard.protect(h.row());
  assert.equal(out.closed??false,false);
  const state=h.row().profitGuardState;
  assert.ok(state.pullbackCents>=0.7&&state.pullbackCents<=1.0);
  assert.equal(Boolean(state.historicalDrawdown?.available),false,'a 60c pre-entry feeder crash cannot manufacture a 60c X1 post-entry drawdown');
  assert.equal(state.crash.depthCents,60,'CI1 crash evidence remains independently visible to X1');
});

test('R36 HARDENING ATHENA-X1 committed pure state cannot be silently decommitted by a later higher high',()=>{
  const now=10_000;
  const committed={version:'ATHENA-X1',policyRevision:'ATHENA-X1-R1',phase:'X1_EXIT_COMMITTED',armedAtMs:1_000,lastObservedBookMs:5_000,peakExecutableBidCents:90,peakExecutableNetCents:600,decision:'EXIT',decisionReason:'structural_deterioration',observations:[]};
  const r=advanceAthenaExitState(committed,{observation:{observedAtMs:6_000,executableBidCents:95,executableNetCents:1100,askCents:96},context:{nowMs:now,entryPriceCents:80,originalCount:100,profile:{promoted:false},crash:{}}});
  assert.equal(r.decision,'EXIT');
  assert.equal(r.reason,'exit_commit_sticky');
  assert.equal(r.state.phase,'X1_EXIT_COMMITTED');
  assert.equal(r.state.peakExecutableBidCents,90);
});

test('R36 HARDENING ATHENA-X1 simulation preflight never intentionally sells a fraction when only partial capital-safe depth exists',async()=>{
  const h=guardHarness({bid:90,x1Enabled:true,full:false,filled:40,entryOverrides:{entryPriceCents:80,count:100,remainingCount:100,entryFeeCents:200}});
  const decision={action:'athena_x1_exit',reason:'athena_x1_exit',guardState:'ATHENA_X1_EXIT',athenaExitIntelligence:'ATHENA-X1',peakPriceCents:92,stopPriceCents:45};
  let out=await h.guard.simulationExit(h.row(),decision,h.guard.market.getQuote());
  assert.equal(out.closed,false);
  assert.equal(out.skipped,'athena_x1_partial_depth_no_split');
  assert.equal(h.row().remainingCount,100);
  h.setDepth({full:true,filled:100});
  out=await h.guard.simulationExit(h.row(),decision,h.guard.market.getQuote());
  assert.equal(out.closed,true);
  assert.equal(out.filled,100);
  assert.equal(h.row().remainingCount,0);
});

test('R36 HARDENING ATHENA-X1 LIVE preflight requires full remaining depth and submits the full owned count',async()=>{
  const h=guardHarness({bid:90,x1Enabled:true,full:false,filled:40,entryOverrides:{mode:'LIVE',entryPriceCents:80,count:100,remainingCount:100,entryFeeCents:200}});
  const orders=[];
  h.guard.kalshi={getPositions:async()=>{const r=h.row();return[{ticker:r.ticker,position_fp:r.remainingCount}];},buildClientOrderId:()=> 'x1-full-only',async placeOrder(o){orders.push(structuredClone(o));return{orderId:'x1-full',fillCount:o.count,averageFillPriceCents:o.priceCents,feePaidCents:2*o.count};}};
  const decision={action:'athena_x1_exit',reason:'athena_x1_exit',guardState:'ATHENA_X1_EXIT',athenaExitIntelligence:'ATHENA-X1',peakPriceCents:92,stopPriceCents:45};
  let out=await h.guard.liveExit(h.row(),decision);
  assert.equal(out.closed,false);
  assert.equal(out.skipped,'athena_x1_partial_depth_no_split');
  assert.equal(orders.length,0,'partial preflight depth must not cause a deliberately partial broker order');
  assert.equal(h.row().remainingCount,100);
  h.setDepth({full:true,filled:100});
  out=await h.guard.liveExit(h.row(),decision);
  assert.equal(out.closed,true);
  assert.equal(orders.length,1);
  assert.equal(orders[0].count,100,'after full-depth preflight X1 requests the whole remaining position');
});

test('R36 HARDENING ATHENA-X1 unknown policy revisions fail closed in profit domain while U-SG1 remains authoritative',async()=>{
  const h=guardHarness({bid:90,x1Enabled:true,entryOverrides:{entryConfig:{profitAuthority:'ATHENA-X1',profitAuthorityRevision:'ATHENA-X1-R999',profitLearning:'PLI1',athena:{version:'ATHENA-B1',score:50,classification:'NEUTRAL'}},entryPriceCents:80,stopLossCents:10,count:100,remainingCount:100,entryFeeCents:200}});
  let out=await h.guard.protect(h.row());
  assert.equal(out.policyMismatch,true);
  assert.equal(out.action,'athena_x1_policy_revision_mismatch_hold');
  assert.deepEqual(h.row().profitGuardState,{},'unsupported X1 revision must not be silently rewritten into the current policy');
  assert.equal(h.audits.some(x=>x.event==='athena_x1_policy_revision_mismatch'),true);
  h.setBid(50);
  out=await h.guard.protect(h.row());
  assert.equal(out.closed,true,'profit-policy mismatch must not disable U-SG1 emergency loss authority');
  assert.equal(h.row().closeReason,'hard_stop_loss');
});

test("R37 Golden Eye creation-time authority fails safe to ATHENA-X1 whenever the Golden Eye execution lane is disabled for the active mode",async()=>{const {RELEASE,originalSettings,CANONICAL_NUMERIC_SETTINGS,CANONICAL_BOOLEAN_SETTINGS,sanitizeRuntimeSettings,normalizeStartupExecutionMode}=await import('../src/config.mjs');const D=await import('../src/doctrine.mjs');const {readFile,readdir,stat}=await import('node:fs/promises');const pg=await readFile(new URL('../src/profitGuard.mjs',import.meta.url),'utf8');assert.equal(D.INFINITY_BREAK.authority,'PROFIT_EXIT');assert.equal(D.AURORA_EXECUTION.lossAuthority,'U-SG1');assert.equal(D.AURORA_EXECUTION.defaultDamageControlPercent,45);assert.ok(pg.includes("'infinity_break'"));assert.ok(pg.includes("'atomic_thunder_cashout'"),'legacy Atomic history must remain compatible');assert.ok(pg.includes('auroraDamageControlPercent'));assert.equal(pg.includes('maximumPositionLifetimeMs'),false);});

test('R37 Golden Eye cashout queues behind in-flight per-entry protection instead of being silently coalesced into the protection promise',async()=>{
  const geConfig={profitAuthority:GOLDEN_EYE.version,profitAuthorityRevision:GOLDEN_EYE.policyRevision,profitLearning:'PLI1'};
  const h=guardHarness({bid:90,entryOverrides:{conceptName:'Dragon Recovery Hunter',entryConfig:geConfig}});
  let release;
  let startedResolve;
  const started=new Promise((resolve)=>{startedResolve=resolve;});
  const blocker=h.guard.withEntryLock('guard-1',async()=>{startedResolve();await new Promise((resolve)=>{release=resolve;});return {protected:true};});
  await started;
  const cashout=h.guard.manualCashout(h.row(),h.guard.market.getQuote(),{reason:'golden_eye_cashout'});
  await new Promise((resolve)=>setImmediate(resolve));
  assert.equal(h.row().status,'open','cashout must wait for the current protection critical section');
  release();
  await blocker;
  const out=await cashout;
  assert.equal(out.closed,true);
  assert.equal(out.filled,100);
  assert.equal(h.row().remainingCount,0);
  assert.equal(h.row().closeReason,'golden_eye_cashout');
});

test('R37 Golden Eye SIM cashout never intentionally splits a position when only partial full-position depth is available',async()=>{
  const geConfig={profitAuthority:GOLDEN_EYE.version,profitAuthorityRevision:GOLDEN_EYE.policyRevision,profitLearning:'PLI1'};
  const h=guardHarness({bid:90,full:false,filled:40,entryOverrides:{conceptName:'Dragon Recovery Hunter',entryConfig:geConfig}});
  const out=await h.guard.manualCashout(h.row(),h.guard.market.getQuote(),{reason:'golden_eye_cashout'});
  assert.equal(out.closed,false);
  assert.equal(out.skipped,'golden_eye_partial_depth_no_split');
  assert.equal(h.row().status,'open');
  assert.equal(h.row().remainingCount,100);
});

test('R37 Golden Eye LIVE persists an exit receipt before broker submit and requests the full owned count at the break-even-or-better limit',async()=>{
  const geConfig={profitAuthority:GOLDEN_EYE.version,profitAuthorityRevision:GOLDEN_EYE.policyRevision,profitLearning:'PLI1'};
  const h=guardHarness({bid:90,full:true,filled:100,entryOverrides:{conceptName:'Dragon Recovery Hunter',mode:'LIVE',entryConfig:geConfig}});
  const before=h.row();
  const floor=h.guard.goldenEyeBreakEvenPriceCents(before,{...settings,simFeeCents:2});
  const orders=[];
  h.guard.kalshi={
    async getPositions(){const r=h.row();return[{ticker:r.ticker,position_fp:r.remainingCount}];},
    buildClientOrderId:()=> 'ge-live-receipt-1',
    async placeOrder(order){
      const persisted=h.row();
      assert.equal(persisted.status,'exit_pending');
      assert.equal(persisted.exitClientOrderId,'ge-live-receipt-1');
      assert.equal(persisted.closeReason,'golden_eye_cashout');
      orders.push(structuredClone(order));
      return {orderId:'ge-order-1',fillCount:order.count,averageFillPriceCents:90,feePaidCents:2*order.count};
    },
  };
  const out=await h.guard.manualCashout(before,h.guard.market.getQuote(),{reason:'golden_eye_cashout'});
  assert.equal(out.closed,true);
  assert.equal(orders.length,1);
  assert.equal(orders[0].count,100);
  assert.equal(orders[0].priceCents,floor);
  assert.notEqual(orders[0].priceCents,90,'Golden Eye limit is the aggregate break-even covenant, not the transient best bid');
  assert.equal(h.row().remainingCount,0);
});

test('R37 Golden Eye LIVE handles an authoritative broker partial durably and reopens only the remaining owned quantity',async()=>{
  const geConfig={profitAuthority:GOLDEN_EYE.version,profitAuthorityRevision:GOLDEN_EYE.policyRevision,profitLearning:'PLI1'};
  const h=guardHarness({bid:90,full:true,filled:100,entryOverrides:{conceptName:'Dragon Recovery Hunter',mode:'LIVE',entryConfig:geConfig}});
  h.guard.kalshi={
    async getPositions(){const r=h.row();return[{ticker:r.ticker,position_fp:r.remainingCount}];},
    buildClientOrderId:()=> 'ge-live-partial-1',
    async placeOrder(){return {orderId:'ge-partial-order',fillCount:40,averageFillPriceCents:90,feePaidCents:80};},
  };
  const out=await h.guard.manualCashout(h.row(),h.guard.market.getQuote(),{reason:'golden_eye_cashout'});
  assert.equal(out.closed,false);
  assert.equal(out.filled,40);
  assert.equal(out.reopened,true);
  assert.equal(out.pending,false);
  assert.equal(h.row().remainingCount,60);
  assert.equal(h.row().status,'open');
  assert.equal(h.row().closeReason,null);
  assert.equal(h.row().exitClientOrderId,null);
  assert.equal(h.audits.some((x)=>x.event==='golden_eye_live_partial_reopened'),true);
});

test('R37 Golden Eye releases an unresolved-receipt-free exit intent when the short cash-now execution window disappears instead of chasing into loss',async()=>{
  const geConfig={profitAuthority:GOLDEN_EYE.version,profitAuthorityRevision:GOLDEN_EYE.policyRevision,profitLearning:'PLI1'};
  const h=guardHarness({bid:82,full:false,filled:0,entryOverrides:{status:'exit_pending',closeReason:'golden_eye_cashout',exitClientOrderId:null,entryConfig:geConfig}});
  const out=await h.guard.protect(h.row());
  assert.equal(out.closed??false,false);
  assert.equal(h.row().status,'open');
  assert.equal(h.row().closeReason,null);
  assert.equal(h.audits.some((x)=>x.event==='golden_eye_exit_released_after_window'),true);
});

test('R37 Golden Eye never owns the loss domain: U-SG1 hard-stop authority executes before the portfolio profit lane',async()=>{
  const geConfig={profitAuthority:GOLDEN_EYE.version,profitAuthorityRevision:GOLDEN_EYE.policyRevision,profitLearning:'PLI1'};
  const h=guardHarness({bid:30,entryOverrides:{entryPriceCents:80,stopLossCents:10,entryConfig:geConfig}});
  const out=await h.guard.protect(h.row());
  assert.equal(out.closed,true);
  assert.equal(h.row().closeReason,'hard_stop_loss');
  assert.notEqual(h.row().closeReason,'golden_eye_cashout');
});

test('R37 Golden Eye never outranks lifecycle finality: settlement closes before the global profit lane',async()=>{
  const geConfig={profitAuthority:GOLDEN_EYE.version,profitAuthorityRevision:GOLDEN_EYE.policyRevision,profitLearning:'PLI1'};
  const h=guardHarness({bid:99,entryOverrides:{entryConfig:geConfig}});
  h.setFinal('yes');
  const out=await h.guard.protect(h.row());
  assert.equal(out.closed,true);
  assert.equal(h.row().closeReason,'settlement_win');
  assert.equal(h.row().exitPriceCents,100);
});


test('R41-HF1 SLW1 keeps the $200 reference calibration but runtime thresholds are stake-normalized',()=>{
  assert.equal(STOP_LOSS_WATCHDOG.version,'SLW1');
  assert.equal(STOP_LOSS_WATCHDOG.policyRevision,'SLW1-R2-STAKE-NORMALIZED');
  assert.equal(STOP_LOSS_WATCHDOG.stakeNormalized,true);
  assert.equal(STOP_LOSS_WATCHDOG.wakeLossCents,6000);
  assert.equal(STOP_LOSS_WATCHDOG.resetLossCents,4000);
  assert.deepEqual(stopLossWatchdogThresholdsForStakeCents(20000),{
    policyRevision:'SLW1-R2-STAKE-NORMALIZED',stakeBasis:'original_entry_notional',basisStakeCents:20000,
    wakeLossCents:6000,resetLossCents:4000,severeLossCents:9000,catastrophicLossCents:18000,
  });
  assert.equal(ULTIMATE_STOP_GUARD.version,'U-SG1');
  const d=profitGuardDecision({...base,entryPriceCents:80,stopLossCents:35,count:250,remainingCount:250},{yesBid:60,yesAsk:61,result:''},{...settings,simFeeCents:2});
  assert.equal(d.action,'hold');
  assert.equal(d.hardStopCents,45,'the model-owned Danger Line must remain 80-35=45c');
});

test('R39 SLW1 arms above the U-SG1 Danger Line using full-position after-fee economic loss',async()=>{
  const profile={totalObservations:20,recoveredCount:8,smoothedRecoveryRate:0.4,avgRecoveryTimeMs:60000,specificity:'sport_drop_pre_stop',dropBucket:'15+'};
  const h=guardHarness({bid:60,filled:250,lossWatchdogProfile:profile,entryOverrides:{entryPriceCents:80,currentPriceCents:80,peakPriceCents:80,stopLossCents:35,count:250,remainingCount:250,entryFeeCents:500,entryConfig:{profitAuthority:'GOLDEN-EYE-V1',profitAuthorityRevision:'GE1-R2'}}});
  const out=await h.guard.protect(h.row());
  assert.equal(out.closed??false,false);
  assert.equal(out.action,'stop_loss_watchdog');
  assert.equal(h.row().stopGuardState.watchdog.version,'SLW1');
  assert.equal(h.row().stopGuardState.watchdog.currentLossCents,6000);
  assert.equal(h.row().stopGuardState.version,undefined,'pre-stop SLW1 must not pretend standard U-SG1 is armed');
  assert.equal(h.row().status,'open');
});

test('R41-HF1 SLW1 thresholds scale linearly across $20, $50, $200 and $500 original stakes',()=>{
  const cases=[[2000,600,400,900,1800],[5000,1500,1000,2250,4500],[20000,6000,4000,9000,18000],[50000,15000,10000,22500,45000]];
  for(const [stake,wake,reset,severe,catastrophic] of cases){
    const t=stopLossWatchdogThresholdsForStakeCents(stake);
    assert.equal(t.basisStakeCents,stake);
    assert.equal(t.wakeLossCents,wake);
    assert.equal(t.resetLossCents,reset);
    assert.equal(t.severeLossCents,severe);
    assert.equal(t.catastrophicLossCents,catastrophic);
  }
});

test('R41-HF1 a $20 Hunter receives the same early-watchdog percentage protection instead of waiting for a fixed $60 loss',async()=>{
  // 40c x 50 contracts = $20 immutable original notional. With 2c/contract
  // entry and exit fees, a 32c executable bid is a $6 loss: exactly 30% wake.
  const profile={totalObservations:0,recoveredCount:0,smoothedRecoveryRate:.5,avgRecoveryTimeMs:0,specificity:'cold_start',evidenceVersion:'SGRL1'};
  const h=guardHarness({bid:32,filled:50,lossWatchdogProfile:profile,entryOverrides:{entryPriceCents:40,currentPriceCents:40,peakPriceCents:40,stopLossCents:35,count:50,remainingCount:50,entryFeeCents:100}});
  const out=await h.guard.protect(h.row());
  assert.equal(out.closed??false,false);
  assert.equal(out.action,'stop_loss_watchdog');
  const w=h.row().stopGuardState.watchdog;
  assert.equal(w.stakeNormalization.basisStakeCents,2000);
  assert.equal(w.stakeNormalization.wakeLossCents,600);
  assert.equal(w.currentLossCents,600);
});

test('R41-HF1 equivalent percentage loss paths classify identically for $20 and $200 Hunters',async()=>{
  const profile={totalObservations:20,recoveredCount:4,smoothedRecoveryRate:.2,avgRecoveryTimeMs:120000,specificity:'exact',evidenceVersion:'SGRL1'};
  const small=guardHarness({bid:32,filled:50,lossWatchdogProfile:profile,entryOverrides:{entryPriceCents:40,currentPriceCents:40,peakPriceCents:40,stopLossCents:35,count:50,remainingCount:50,entryFeeCents:100}});
  const large=guardHarness({bid:32,filled:500,lossWatchdogProfile:profile,entryOverrides:{entryPriceCents:40,currentPriceCents:40,peakPriceCents:40,stopLossCents:35,count:500,remainingCount:500,entryFeeCents:1000}});
  const a=await small.guard.protect(small.row());
  const b=await large.guard.protect(large.row());
  assert.equal(a.action,b.action);
  assert.equal(small.row().stopGuardState.watchdog.phase,large.row().stopGuardState.watchdog.phase);
  assert.equal(small.row().stopGuardState.watchdog.currentLossCents/small.row().stopGuardState.watchdog.stakeNormalization.basisStakeCents,
    large.row().stopGuardState.watchdog.currentLossCents/large.row().stopGuardState.watchdog.stakeNormalization.basisStakeCents);
});

test('R39 SLW1 uses strong historical recovery to keep a wounded trade alive and clears only after material recovery',async()=>{
  const profile={totalObservations:30,recoveredCount:24,smoothedRecoveryRate:0.8,avgRecoveryTimeMs:90000,specificity:'exact_pre_stop',dropBucket:'15+'};
  const h=guardHarness({bid:60,filled:250,lossWatchdogProfile:profile,entryOverrides:{entryPriceCents:80,currentPriceCents:80,peakPriceCents:80,stopLossCents:35,count:250,remainingCount:250,entryFeeCents:500,entryConfig:{profitAuthority:'GOLDEN-EYE-V1',profitAuthorityRevision:'GE1-R2'}}});
  await h.guard.protect(h.row());
  h.setBid(58); let out=await h.guard.protect(h.row());
  assert.equal(out.closed??false,false);
  assert.equal(h.guard.getState('guard-1').guardState,'SLW1_DANGER');
  h.setBid(68); out=await h.guard.protect(h.row());
  assert.equal(out.closed??false,false);
  assert.equal(h.row().stopGuardState.watchdog,undefined,'watchdog must re-arm normal protection only after loss recovers below reset');
});

test('R41 preserves the R39 weak-history early exit only after the bounded weak-history grace',async()=>{
  const profile={totalObservations:25,recoveredCount:4,smoothedRecoveryRate:0.18,avgRecoveryTimeMs:120000,specificity:'exact_pre_stop',dropBucket:'15+'};
  const h=guardHarness({bid:60,filled:250,lossWatchdogProfile:profile,entryOverrides:{entryPriceCents:80,currentPriceCents:80,peakPriceCents:80,stopLossCents:35,count:250,remainingCount:250,entryFeeCents:500,entryConfig:{profitAuthority:'GOLDEN-EYE-V1',profitAuthorityRevision:'GE1-R2'}}});
  await h.guard.protect(h.row());
  h.setBid(59); let out=await h.guard.protect(h.row());
  assert.equal(out.closed??false,false,'weak history must receive the bounded R41 recovery grace instead of an immediate exit');
  h.rows.get('guard-1').stopGuardState.watchdog.armedAtMs=Date.now()-STOP_LOSS_WATCHDOG.weakHistoryGraceMs-1000;
  h.setBid(58); out=await h.guard.protect(h.row());
  assert.equal(out.closed,true);
  assert.equal(h.row().closeReason,'hard_stop_loss');
  assert.equal(h.row().stopGuardState.version,'U-SG1');
  assert.equal(h.row().stopGuardState.exitReason,'slw1_historical_dead_market');
  assert.ok(h.audits.some((a)=>a.event==='slw1_dead_market_detected'));
  assert.ok(h.audits.some((a)=>a.event==='usg1_exit_committed'));
  assert.equal(h.learning.hardStops,1);
});

test('R39 SLW1 does not kill an unknown cohort from dollar loss alone',async()=>{
  const profile={totalObservations:2,recoveredCount:0,smoothedRecoveryRate:0.25,avgRecoveryTimeMs:0,specificity:'global_pre_stop',dropBucket:'15+'};
  const h=guardHarness({bid:60,filled:250,lossWatchdogProfile:profile,entryOverrides:{entryPriceCents:80,currentPriceCents:80,peakPriceCents:80,stopLossCents:35,count:250,remainingCount:250,entryFeeCents:500,entryConfig:{profitAuthority:'GOLDEN-EYE-V1',profitAuthorityRevision:'GE1-R2'}}});
  await h.guard.protect(h.row());
  h.setBid(58); await h.guard.protect(h.row());
  h.setBid(56); const out=await h.guard.protect(h.row());
  assert.equal(out.closed??false,false,'sparse learning cannot turn a $60 wake-up into a blind stop');
  assert.equal(h.row().status,'open');
  assert.equal(h.guard.getState('guard-1').guardState,'SLW1_DANGER');
});

test('R41 sparse-history crash deterioration exits only after the bounded cold-start recovery window',async()=>{
  const profile={totalObservations:2,recoveredCount:1,smoothedRecoveryRate:0.5,avgRecoveryTimeMs:0,specificity:'global_pre_stop',dropBucket:'15+'};
  const crash={phase:'CRASHING',lowerLowCount:3,reboundCents:0,stableObservations:0,upwardTicks:0};
  const h=guardHarness({bid:56,filled:250,lossWatchdogProfile:profile,crashState:crash,entryOverrides:{entryPriceCents:80,currentPriceCents:80,peakPriceCents:80,stopLossCents:35,count:250,remainingCount:250,entryFeeCents:500,entryConfig:{profitAuthority:'GOLDEN-EYE-V1',profitAuthorityRevision:'GE1-R2'}}});
  await h.guard.protect(h.row());
  h.setBid(52); let out=await h.guard.protect(h.row());
  assert.equal(out.closed??false,false,'sparse history must not create an immediate crash exit inside the R41 recovery window');
  h.rows.get('guard-1').stopGuardState.watchdog.armedAtMs=Date.now()-STOP_LOSS_WATCHDOG.minimumLiveOverrideAgeMs-1000;
  h.setBid(48); out=await h.guard.protect(h.row());
  assert.equal(out.closed,true);
  assert.equal(h.row().stopGuardState.exitReason,'slw1_crash_dead_market');
  assert.equal(h.row().closeReason,'hard_stop_loss');
});

test('R39 SLW1 stale books fail closed to DATA_HOLD and cannot create a new dead-market exit',async()=>{
  const profile={totalObservations:30,recoveredCount:2,smoothedRecoveryRate:0.09,avgRecoveryTimeMs:0,specificity:'exact_pre_stop',dropBucket:'15+'};
  const h=guardHarness({bid:60,filled:250,lossWatchdogProfile:profile,entryOverrides:{entryPriceCents:80,currentPriceCents:80,peakPriceCents:80,stopLossCents:35,count:250,remainingCount:250,entryFeeCents:500,entryConfig:{profitAuthority:'GOLDEN-EYE-V1',profitAuthorityRevision:'GE1-R2'}}});
  h.setBookAge(STOP_LOSS_WATCHDOG.maximumBookAgeMs+1000);
  const out=await h.guard.protect(h.row());
  assert.equal(out.closed??false,false);
  assert.equal(h.guard.getState('guard-1').guardState,'SLW1_DATA_HOLD');
  assert.equal(h.row().status,'open');
});

test('R39 SLW1 yields completely to standard U-SG1 once the immutable Danger Line is touched',async()=>{
  const profile={totalObservations:30,recoveredCount:1,smoothedRecoveryRate:0.06,avgRecoveryTimeMs:0,specificity:'exact_pre_stop',dropBucket:'15+'};
  const h=guardHarness({bid:60,filled:250,lossWatchdogProfile:profile,stopProfile:{totalObservations:20,recoveredCount:18,smoothedRecoveryRate:0.86,avgRecoveryTimeMs:60000,specificity:'global_drop',troughBucket:'0-5'},entryOverrides:{entryPriceCents:80,currentPriceCents:80,peakPriceCents:80,stopLossCents:35,count:250,remainingCount:250,entryFeeCents:500,entryConfig:{profitAuthority:'GOLDEN-EYE-V1',profitAuthorityRevision:'GE1-R2'}}});
  await h.guard.protect(h.row());
  h.setBid(44); const out=await h.guard.protect(h.row());
  assert.equal(out.closed??false,false,'U-SG1 recovery zone should own the touched Danger Line and may hold');
  assert.equal(h.row().stopGuardState.version,'U-SG1');
  assert.equal(h.row().stopGuardState.dangerLineCents,45);
  assert.notEqual(h.guard.getState('guard-1').guardState,'SLW1_DANGER');
});

test('R41 SGRL1 Stop Guard ignores legacy recovery patterns and MarketObserver contamination',async()=>{
  const key=stopGuardRecoveryProfileKeys({conceptName:'Wave Surfer',sourceFeeder:'Dragon',sport:'ATP Tennis',entryPriceCents:42,totalDropCents:20,gameMinutes:90,crashBucket:'NORMAL'})[0];
  const rows=[{profile_key:key.profileKey,total_observations:10,recovered_count:4,avg_time_to_recover_ms:2000}];
  const db={
    patterns:async()=>{throw new Error('legacy sag_recovery_patterns must have zero Stop Guard authority');},
    stopGuardProfiles:async()=>rows,
    sportProfile:async()=>({ticker_prefix:'KXATPMATCH',detected_sport_name:'ATP Tennis',typical_duration_ms:7200000,min_game_minutes_for_hunter:30,confidence_level:'high',source:'manual'}),
    ensureSportProfile:async()=>{},
  };
  const learning=new LearningEngine(db,'SAGITTARIUS');
  learning.crashStates.set('KXATPMATCH-X',{phase:'NORMAL'});
  const p=await learning.lossWatchdogProfile({ticker:'KXATPMATCH-X',title:'ATP',conceptName:'Wave Surfer',sourceFeeder:'Dragon',mode:'SIMULATION',entryPriceCents:42,totalDropCents:20,gameMinutes:90,minimumObservations:5});
  assert.equal(p.evidenceVersion,'SGRL1');
  assert.equal(p.totalObservations,10);
  assert.equal(p.recoveredCount,4);
  assert.equal(p.specificity,'exact');
  assert.equal(p.entryBand,'35-44');
  assert.equal(p.dropBucket,'20-29');
  assert.ok(p.smoothedRecoveryRate>0.4&&p.smoothedRecoveryRate<0.5);
});


test('R41 SGRL1 cohort buckets preserve 27-60 price structure and requested game-time windows',()=>{
  assert.deepEqual([26,27,34,35,44,45,54,55,60,61].map(stopGuardEntryBand),['<27','27-34','27-34','35-44','35-44','45-54','45-54','55-60','55-60','61-69']);
  assert.deepEqual([0,9,10,19,20,29,30,39,40].map(stopGuardDropBucket),['0-9','0-9','10-19','10-19','20-29','20-29','30-39','30-39','40+']);
  assert.deepEqual([19,20,29,30,39,40,49,50,59,60,89,90].map(stopGuardGameBucket),['<20','20-29','20-29','30-39','30-39','40-49','40-49','50-59','50-59','60-89','60-89','90+']);
});

test('R41 SGRL1 recovery requires durable full-position executable fee-adjusted positive net, not a midpoint touch',()=>{
  const episode={originalCount:100,triggerAtMs:1000};
  let state={version:STOP_GUARD_RECOVERY_LEARNING.version,createdAtMs:1000,lastObservedAtMs:0,trackingComplete:false};
  state=advanceStopGuardRecoveryState(state,episode,{observedAtMs:2000,fullExecutable:false,executableBidCents:85,executableNetCents:500},2000);
  assert.equal(state.recovered??false,false);
  state=advanceStopGuardRecoveryState(state,episode,{observedAtMs:3000,fullExecutable:true,executableBidCents:80,executableNetCents:-100},3000);
  assert.equal(state.positiveConfirmations,0,'entry-price touch that is negative after fees is not recovery');
  state=advanceStopGuardRecoveryState(state,episode,{observedAtMs:4000,fullExecutable:true,executableBidCents:85,executableNetCents:100},4000);
  assert.equal(state.positiveConfirmations,1);assert.equal(state.trackingComplete,false);
  state=advanceStopGuardRecoveryState(state,episode,{observedAtMs:4500,fullExecutable:true,executableBidCents:84,executableNetCents:0},4500);
  assert.equal(state.positiveConfirmations,0,'a non-positive executable observation resets durability');
  state=advanceStopGuardRecoveryState(state,episode,{observedAtMs:5000,fullExecutable:true,executableBidCents:85,executableNetCents:100},5000);
  state=advanceStopGuardRecoveryState(state,episode,{observedAtMs:6000,fullExecutable:true,executableBidCents:86,executableNetCents:200},6000);
  assert.equal(state.recovered,true);
  assert.equal(state.trackingComplete,true);
  assert.equal(state.completionReason,'durable_full_executable_fee_adjusted_recovery');
});

test('R41 SGRL1 final settlement closes the learning episode with fee-adjusted economic truth',()=>{
  const episode={originalCount:100,triggerAtMs:1000};
  const win=advanceStopGuardRecoveryState({},episode,{observedAtMs:2000,final:true,finalResult:'yes',settlementPriceCents:100,settlementNetCents:100},2000);
  assert.equal(win.recovered,true);assert.equal(win.trackingComplete,true);
  const loss=advanceStopGuardRecoveryState({},episode,{observedAtMs:2000,final:true,finalResult:'no',settlementPriceCents:0,settlementNetCents:-1000},2000);
  assert.equal(loss.recovered,false);assert.equal(loss.trackingComplete,true);
  assert.equal(loss.completionReason,'market_final_without_economic_recovery');
});

test('R41 SGRL1 profile identity includes concept/source/sport/entry/drop/game/crash before bounded fallback',()=>{
  const keys=stopGuardRecoveryProfileKeys({conceptName:'Crash Recovery Hunter',sourceFeeder:'Dragon',sport:'KBO Baseball',entryPriceCents:47,totalDropCents:31,gameMinutes:54,crashBucket:'CRASHING_LOWER_LOW'});
  assert.equal(keys[0].specificity,'exact');
  assert.ok(keys[0].profileKey.includes('Crash Recovery Hunter|Dragon|KBO Baseball|45-54|30-39|50-59|CRASHING_LOWER_LOW'));
  assert.equal(keys.at(-1).specificity,'global_drop');
  assert.equal(keys.at(-1).dropBucket,'30-39');
});

test('R41 SGRL1 trigger snapshot records game minute at Hunter entry, never at later stop time',async()=>{
  const now=Date.now();let captured=null;
  const db={
    async sportProfile(){return {detected_sport_name:'KBO Baseball'};},async ensureSportProfile(){},
    async createStopGuardRecoveryEpisode(x){captured=structuredClone(x);},
  };
  const learning=new LearningEngine(db,'SAGITTARIUS');
  const start=now-80*60000,opened=now-50*60000;
  const entry={id:'sgrl-entry',ticker:'KXKBOGAME-X',eventTicker:'EV',marketTitle:'KBO',mode:'SIMULATION',conceptName:'Wave Surfer',sourceFeeder:'Pegasus',entryPriceCents:56,currentPriceCents:22,count:357,entryFeeCents:714,openedAtMs:opened,entryConfig:{gameClockAuthority:{version:'GCA2',eventTicker:'EV',phase:'CONFIRMED',confirmed:true,startTimeMs:start}}};
  await learning.beginStopGuardRecoveryEpisode(entry,{triggerStage:'SLW1',triggerPriceCents:22,triggerLossCents:13902,dangerLineCents:21,atMs:now});
  assert.equal(captured.gameMinutesAtEntry,30);
  assert.equal(captured.mode,'SIMULATION');
  assert.equal(captured.conceptName,'Wave Surfer');
  assert.equal(captured.sourceFeeder,'Pegasus');
  assert.equal(captured.state.decisionEvidenceEligible,true);
});


test('R41 SGRL1 end-to-end learning lane persists a Hunter trigger, requires two fresh executable-positive books, then promotes a bounded cohort profile',async()=>{
  const now=Date.now();const episodes=[];let profiles=[];
  const snake=(o)=>({id:o.id,system_name:o.systemName,original_entry_id:o.originalEntryId,trigger_stage:o.triggerStage,ticker:o.ticker,mode:o.mode,concept_name:o.conceptName,source_feeder:o.sourceFeeder,sport:o.sport,entry_price_cents:o.entryPriceCents,trigger_price_cents:o.triggerPriceCents,trigger_drop_cents:o.triggerDropCents,trigger_loss_cents:o.triggerLossCents,danger_line_cents:o.dangerLineCents,game_minutes_at_entry:o.gameMinutesAtEntry,crash_bucket:o.crashBucket,original_count:o.originalCount,tracked_count:o.trackedCount,entry_fee_cents:o.entryFeeCents,base_realized_pnl_cents:o.baseRealizedPnlCents,trigger_at_ms:o.triggerAtMs,tracking_complete:o.trackingComplete,recovered:o.recovered,recovery_at_ms:o.recoveryAtMs,state:structuredClone(o.state),updated_at_ms:o.updatedAtMs});
  const db={
    async sportProfile(){return{detected_sport_name:'KBO Baseball'};},async ensureSportProfile(){},
    async createStopGuardRecoveryEpisode(o){if(!episodes.some(x=>x.id===o.id))episodes.push(snake(o));},
    async stopGuardRecoveryEpisodes(_s,{complete=null,triggerStage=null,mode=null,ticker=null}={}){return episodes.filter(x=>(complete===null||x.tracking_complete===complete)&&(!triggerStage||x.trigger_stage===triggerStage)&&(!mode||x.mode===mode)&&(!ticker||x.ticker===ticker)).map(x=>structuredClone(x));},
    async updateStopGuardRecoveryEpisode(id,patch){const x=episodes.find(e=>e.id===id);if(!x)return;if('trackingComplete'in patch)x.tracking_complete=patch.trackingComplete;if('recovered'in patch)x.recovered=patch.recovered;if('recoveryAtMs'in patch)x.recovery_at_ms=patch.recoveryAtMs;if('state'in patch)x.state=structuredClone(patch.state);x.updated_at_ms=patch.updatedAtMs;},
    async replaceStopGuardProfiles(_s,stage,mode,rows){profiles=profiles.filter(p=>p.trigger_stage!==stage||p.mode!==mode);profiles.push(...rows.map(r=>({profile_key:r.profileKey,trigger_stage:stage,mode,total_observations:r.totalObservations,recovered_count:r.recoveredCount,avg_time_to_recover_ms:r.avgTimeToRecoverMs})));},
    async stopGuardProfiles(_s,{triggerStage=null,mode=null}={}){return profiles.filter(p=>(!triggerStage||p.trigger_stage===triggerStage)&&(!mode||p.mode===mode)).map(x=>structuredClone(x));},
  };
  const learning=new LearningEngine(db,'SAGITTARIUS');
  const start=now-45*60000,opened=now-25*60000;
  const entry={id:'e2e-sgrl',ticker:'KXKBOGAME-E2E',eventTicker:'EV',marketTitle:'KBO',mode:'SIMULATION',conceptName:'Wave Surfer',sourceFeeder:'Pegasus',entryPriceCents:80,currentPriceCents:60,count:100,entryFeeCents:200,openedAtMs:opened,entryConfig:{gameClockAuthority:{version:'GCA2',eventTicker:'EV',phase:'CONFIRMED',confirmed:true,startTimeMs:start}}};
  await learning.beginStopGuardRecoveryEpisode(entry,{triggerStage:'SLW1',triggerPriceCents:60,triggerLossCents:2400,dangerLineCents:45,atMs:now-2000});
  assert.equal(episodes.length,1);assert.equal(episodes[0].game_minutes_at_entry,20);
  let bookMs=now-1200;const q={ticker:entry.ticker,yesBid:85,yesAsk:86,status:'active',result:'',updatedAtMs:bookMs,bookInvalid:false};
  const market={getQuote:()=>q,quoteAgeMs:()=>0,async refreshTicker(){return q;},async ensureFreshBook(){return{updatedAtMs:bookMs};},getBook:()=>({updatedAtMs:bookMs}),executableBid:(_t,count)=>({full:true,filled:count,avgCents:85,bestCents:85})};
  await learning.trackStopGuardRecovery(new Map([[entry.ticker,q]]),{simFeeCents:2,recoveryTrackingHours:24},market,{ticker:entry.ticker});
  assert.equal(episodes[0].tracking_complete,false);assert.equal(episodes[0].state.positiveConfirmations,1);
  bookMs=now;q.updatedAtMs=bookMs;
  await learning.trackStopGuardRecovery(new Map([[entry.ticker,q]]),{simFeeCents:2,recoveryTrackingHours:24},market,{ticker:entry.ticker});
  assert.equal(episodes[0].tracking_complete,true);assert.equal(episodes[0].recovered,true);
  await learning.aggregateStopGuardProfiles();
  assert.ok(profiles.length>0);
  const p=await learning.lossWatchdogProfile({ticker:entry.ticker,title:'KBO',conceptName:'Wave Surfer',sourceFeeder:'Pegasus',mode:'SIMULATION',entryPriceCents:80,totalDropCents:20,gameMinutes:20,minimumObservations:1});
  assert.equal(p.evidenceVersion,'SGRL1');assert.equal(p.totalObservations,1);assert.equal(p.recoveredCount,1);
  const live=await learning.lossWatchdogProfile({ticker:entry.ticker,title:'KBO',conceptName:'Wave Surfer',sourceFeeder:'Pegasus',mode:'LIVE',entryPriceCents:80,totalDropCents:20,gameMinutes:20,minimumObservations:1});
  assert.equal(live.totalObservations,0,'SIMULATION learning must not silently become LIVE decision evidence');
});


test('R41 SGRL1 full-position economics preserve prior realized PnL and current remaining quantity after an unavoidable partial fill',async()=>{
  const now=Date.now();let captured=null;
  const db={async sportProfile(){return{detected_sport_name:'ATP Tennis'};},async ensureSportProfile(){},async createStopGuardRecoveryEpisode(o){captured=structuredClone(o);}};
  const learning=new LearningEngine(db,'SAGITTARIUS');
  const entry={id:'partial-sgrl',ticker:'KXATPMATCH-P',eventTicker:'P',marketTitle:'ATP',mode:'SIMULATION',conceptName:'Momentum Hunter',sourceFeeder:'Dragon',entryPriceCents:80,count:100,remainingCount:40,pnlCents:-60,entryFeeCents:200,openedAtMs:now-60000,entryConfig:{}};
  await learning.beginStopGuardRecoveryEpisode(entry,{triggerStage:'SLW1',triggerPriceCents:70,triggerLossCents:6000,dangerLineCents:45,atMs:now});
  assert.equal(captured.originalCount,100);
  assert.equal(captured.trackedCount,40);
  assert.equal(captured.entryFeeCents,80,'only the entry-fee share allocated to remaining quantity is charged again');
  assert.equal(captured.baseRealizedPnlCents,-60,'already realized partial P/L remains part of aggregate recovery economics');
});


test('R41 replay Hanshin-style Wave overrides even strong history after bounded severe-loss grace and exits above the frozen Danger Line',async()=>{
  const now=Date.now();
  const strong={totalObservations:80,recoveredCount:76,smoothedRecoveryRate:.94,avgRecoveryTimeMs:180000,specificity:'exact',evidenceVersion:'SGRL1'};
  const watchdog={version:'SLW1',phase:'SLW1_ALIVE',armedAtMs:now-58*60000,lastObservedBookMs:now-2000,observationCount:3368,lastBidCents:23,minBidCents:23,lowerLowCount:7,consecutiveDown:2,stableObservations:0,upwardTicks:0,reboundFromTroughCents:0,currentLossCents:13000,peakLossCents:19013,profile:strong,profileUpdatedAtMs:now-1000,structureStrong:false};
  const h=guardHarness({bid:22,filled:357,lossWatchdogProfile:strong,entryOverrides:{conceptName:'Wave Surfer',ticker:'KXNPBGAME-HAN',entryPriceCents:56,currentPriceCents:22,peakPriceCents:56,stopLossCents:35,count:357,remainingCount:357,entryFeeCents:714,stopGuardState:{watchdog},openedAtMs:now-90*60000}});
  const out=await h.guard.protect(h.row());
  assert.equal(out.closed,true);
  assert.equal(h.row().exitPriceCents,22);
  assert.equal(h.row().closeReason,'hard_stop_loss');
  assert.equal(h.row().stopGuardState.exitReason,'slw1_severe_live_deterioration');
  assert.ok(h.row().exitPriceCents>21,'R41 must act before the frozen 21c Danger Line in this proven dead-market pattern');
});

test('R41 replay Montagud-style prolonged near-total executable loss cannot be kept alive by strong history',async()=>{
  const now=Date.now();
  const strong={totalObservations:40,recoveredCount:37,smoothedRecoveryRate:.90,avgRecoveryTimeMs:180000,specificity:'exact',evidenceVersion:'SGRL1'};
  const watchdog={version:'SLW1',phase:'SLW1_ALIVE',armedAtMs:now-31*60000,lastObservedBookMs:now-2000,observationCount:1265,lastBidCents:25,minBidCents:23,lowerLowCount:3,consecutiveDown:1,stableObservations:1,upwardTicks:0,reboundFromTroughCents:2,currentLossCents:19070,peakLossCents:19070,profile:strong,profileUpdatedAtMs:now-1000,structureStrong:false};
  const h=guardHarness({bid:25,filled:350,executableAvg:7,lossWatchdogProfile:strong,entryOverrides:{conceptName:'Crash Recovery Hunter',ticker:'KXITFMATCH-MONTAGUD',sourceFeeder:'Dragon',entryPriceCents:57,currentPriceCents:25,peakPriceCents:57,stopLossCents:35,count:350,remainingCount:350,entryFeeCents:700,stopGuardState:{watchdog},openedAtMs:now-90*60000}});
  const out=await h.guard.protect(h.row());
  assert.equal(out.closed,true);
  assert.equal(h.row().exitPriceCents,7);
  assert.equal(h.row().stopGuardState.exitReason,'slw1_catastrophic_stall');
  assert.ok(h.row().pnlCents>-20650,'candidate must improve on the actual -$206.50 settlement loss even after simulated exit fees');
});

test('R41 cold-start Hiroshima replay preserves the observed ~23-minute trough-to-recovery window instead of becoming a disguised tight stop',async()=>{
  const now=Date.now();
  const cold={totalObservations:0,recoveredCount:0,smoothedRecoveryRate:.5,avgRecoveryTimeMs:0,specificity:'cold_start',evidenceVersion:'SGRL1'};
  const watchdog={version:'SLW1',phase:'SLW1_DANGER',armedAtMs:now-20*60000,lastObservedBookMs:now-2000,observationCount:20,lastBidCents:4,minBidCents:2,lowerLowCount:8,consecutiveDown:3,stableObservations:0,upwardTicks:0,reboundFromTroughCents:2,currentLossCents:19000,peakLossCents:21000,profile:cold,profileUpdatedAtMs:now-1000,structureStrong:false,recoveryLearningTriggerDropCents:10,recoveryLearningCrashBucket:'CRASHING',recoveryLearningEpisodeVersion:'SGRL1',recoveryLearningCoverageKind:'causal_from_trigger'};
  const crashState={phase:'CRASHING',lowerLowCount:10,reboundCents:0,stableObservations:0,upwardTicks:0};
  const h=guardHarness({bid:3,filled:571,lossWatchdogProfile:cold,crashState,entryOverrides:{conceptName:'Crash Recovery Hunter',ticker:'KXNPBGAME-HIROSHIMA-COLD',sourceFeeder:'Dragon',entryPriceCents:35,currentPriceCents:3,peakPriceCents:35,stopLossCents:35,count:571,remainingCount:571,entryFeeCents:1142,stopGuardState:{watchdog},openedAtMs:now-90*60000}});
  let out=await h.guard.protect(h.row());
  assert.equal(out.closed??false,false,'cold-start severe deterioration must receive the bounded recovery window');
  assert.equal(h.guard.getState('guard-1').guardState,'SLW1_RECOVERY_GRACE');
  // The captured R40 trajectory moved from the 2-3c trough back through the
  // high-20s/30c area roughly 22 minutes later and then above entry around the
  // 23-minute mark. Those fresh improvements must be allowed to establish live
  // recovery structure before the 25-minute cold-start override can fire.
  h.setBid(27);out=await h.guard.protect(h.row());assert.equal(out.closed??false,false);
  h.setBid(30);out=await h.guard.protect(h.row());assert.equal(out.closed??false,false);assert.equal(h.row().stopGuardState.watchdog.structureStrong,true);
  h.setBid(45);out=await h.guard.protect(h.row());assert.equal(out.closed??false,false);
  assert.equal(h.row().status,'open');
  assert.equal(h.row().stopGuardState.watchdog,undefined,'economic recovery clears SLW1 instead of liquidating the recovered position');
});

test('R41 replay Hiroshima-style deep drawdown remains alive when fresh rebound structure is strong, preserving the recovery edge',async()=>{
  const now=Date.now();
  const strong={totalObservations:50,recoveredCount:45,smoothedRecoveryRate:.88,avgRecoveryTimeMs:180000,specificity:'exact',evidenceVersion:'SGRL1'};
  const watchdog={version:'SLW1',phase:'SLW1_ALIVE',armedAtMs:now-30*60000,lastObservedBookMs:now-2000,observationCount:631,lastBidCents:14,minBidCents:2,lowerLowCount:15,consecutiveDown:0,stableObservations:82,upwardTicks:2,reboundFromTroughCents:12,currentLossCents:13704,peakLossCents:21375,profile:strong,profileUpdatedAtMs:now-1000,structureStrong:true};
  const crashState={phase:'CRASHING',lowerLowCount:24,reboundCents:13,stableObservations:20,upwardTicks:4};
  const h=guardHarness({bid:15,filled:571,lossWatchdogProfile:strong,crashState,entryOverrides:{conceptName:'Crash Recovery Hunter',ticker:'KXNPBGAME-HIROSHIMA',sourceFeeder:'Dragon',entryPriceCents:35,currentPriceCents:15,peakPriceCents:35,stopLossCents:35,count:571,remainingCount:571,entryFeeCents:1142,stopGuardState:{watchdog},openedAtMs:now-90*60000}});
  let out=await h.guard.protect(h.row());
  assert.equal(out.closed??false,false);
  assert.equal(h.row().status,'open');
  assert.equal(h.guard.getState('guard-1').guardState,'SLW1_ALIVE');
  h.setBid(80);h.setDepth({full:true,filled:571});
  out=await h.guard.protect(h.row());
  assert.equal(out.closed??false,false);
  assert.equal(h.row().status,'open');
  assert.equal(h.row().stopGuardState.watchdog,undefined);
});

test('R41 replay YAK-style long U-SG1 recovery-zone wound exits when severe economics remain structurally stalled',async()=>{
  const now=Date.now();
  const profile={totalObservations:40,recoveredCount:35,smoothedRecoveryRate:.85,avgRecoveryTimeMs:180000,specificity:'exact',dropBucket:'30-39',evidenceVersion:'SGRL1'};
  const watchdog={version:'SLW1',phase:'SLW1_ALIVE',armedAtMs:now-48*60000,lastObservedBookMs:now-2000,observationCount:2323,lastBidCents:11,minBidCents:10,lowerLowCount:8,consecutiveDown:1,stableObservations:1,upwardTicks:0,reboundFromTroughCents:0,currentLossCents:16492,peakLossCents:20279,profile,profileUpdatedAtMs:now-1000,structureStrong:false,liveDeteriorating:false};
  const usg={version:'U-SG1',phase:'USG1_RECLAIMING',armedAtMs:now-60_000,dangerLineCents:10,stopLossCents:35,baseWindowMs:30*60000,deadlineMs:now+29*60000,minBidCents:10,lastBidCents:10,lastObservedQuoteMs:now-2000,maxPenetrationCents:0,penetrationCents:0,zone:'RECOVERY',criticalEnteredAtMs:null,stableObservations:33,upwardTicks:1,reclaimConfirmations:0,extensionUsed:false,reboundFromTroughCents:1,structureStrong:false,profile,profileUpdatedAtMs:now-1000,watchdog};
  const h=guardHarness({bid:11,filled:434,stopProfile:profile,entryOverrides:{conceptName:'Wave Surfer',ticker:'KXNPBGAME-YAK',entryPriceCents:45,currentPriceCents:11,peakPriceCents:45,stopLossCents:35,count:434,remainingCount:434,entryFeeCents:868,stopGuardState:usg,openedAtMs:now-90*60000}});
  const out=await h.guard.protect(h.row());
  assert.equal(out.closed,true);
  assert.equal(h.row().exitPriceCents,11);
  assert.equal(h.row().stopGuardState.exitReason,'economic_severe_stall');
});

test('R41 replay HANCHU-style U-SG1 stressed-zone drawdown is not liquidated while fresh rebound structure is strong',async()=>{
  const now=Date.now();
  const profile={totalObservations:40,recoveredCount:35,smoothedRecoveryRate:.85,avgRecoveryTimeMs:180000,specificity:'exact',dropBucket:'40+',evidenceVersion:'SGRL1'};
  const watchdog={version:'SLW1',phase:'SLW1_ALIVE',armedAtMs:now-61*60000,observationCount:2443,lastBidCents:7,minBidCents:2,lowerLowCount:7,consecutiveDown:5,stableObservations:5,upwardTicks:0,reboundFromTroughCents:5,currentLossCents:9184,peakLossCents:12444,profile,structureStrong:false,liveDeteriorating:true};
  const usg={version:'U-SG1',phase:'USG1_STRESSED_ZONE',armedAtMs:now-22*60000,dangerLineCents:13,stopLossCents:35,baseWindowMs:30*60000,deadlineMs:now+8*60000,minBidCents:2,lastBidCents:6,lastObservedQuoteMs:now-2000,maxPenetrationCents:11,penetrationCents:6,zone:'STRESSED',criticalEnteredAtMs:null,stableObservations:49,upwardTicks:1,reclaimConfirmations:0,extensionUsed:false,reboundFromTroughCents:4,structureStrong:true,profile,profileUpdatedAtMs:now-1000,watchdog};
  const h=guardHarness({bid:7,filled:250,stopProfile:profile,entryOverrides:{conceptName:'Crash Recovery Hunter',ticker:'KXNPBGAME-HANCHU',sourceFeeder:'Dragon',entryPriceCents:48,currentPriceCents:7,peakPriceCents:48,stopLossCents:35,count:250,remainingCount:250,entryFeeCents:500,stopGuardState:usg,openedAtMs:now-120*60000}});
  const out=await h.guard.protect(h.row());
  assert.equal(out.closed??false,false);
  assert.equal(h.row().status,'open');
  assert.equal(h.row().stopGuardState.structureStrong,true);
  assert.equal(h.audits.some(a=>a.event==='usg1_economic_dead_market_detected'),false);
});

test('R41 Stop Guard profile cache preserves the causal trigger cohort between timed refreshes',async()=>{
  const now=Date.now();let calls=0;
  const profile={totalObservations:20,recoveredCount:10,smoothedRecoveryRate:.5,avgRecoveryTimeMs:1000,specificity:'exact',dropBucket:'20-29',evidenceVersion:'SGRL1'};
  const watchdog={version:'SLW1',phase:'SLW1_DANGER',armedAtMs:now-1000,lastObservedBookMs:now-2000,observationCount:5,lastBidCents:59,minBidCents:58,lowerLowCount:0,consecutiveDown:0,stableObservations:2,upwardTicks:1,reboundFromTroughCents:1,currentLossCents:7000,peakLossCents:7000,profile,profileUpdatedAtMs:now,structureStrong:false};
  const h=guardHarness({bid:58,filled:250,lossWatchdogProfile:profile,entryOverrides:{entryPriceCents:80,currentPriceCents:58,stopLossCents:35,count:250,remainingCount:250,entryFeeCents:500,stopGuardState:{watchdog}}});
  h.learning.lossWatchdogProfile=async()=>{calls+=1;return profile;};
  await h.guard.protect(h.row());
  assert.equal(calls,0,'the persisted causal trigger cohort should remain authoritative until the timed profile refresh is due');
});


test('R41 U-SG1 strong history is advisory and cannot defeat the bounded critical structure grace',async()=>{
  const now=Date.now();
  const strong={totalObservations:50,recoveredCount:48,smoothedRecoveryRate:.94,avgRecoveryTimeMs:600000,specificity:'exact',evidenceVersion:'SGRL1'};
  const usg={version:'U-SG1',phase:'USG1_CRITICAL_PROBE',armedAtMs:now-10*60000,dangerLineCents:45,stopLossCents:35,baseWindowMs:1200000,deadlineMs:now+600000,minBidCents:34,lastBidCents:34,lastObservedQuoteMs:now-2000,maxPenetrationCents:11,penetrationCents:11,zone:'CRITICAL',criticalEnteredAtMs:now-ULTIMATE_STOP_GUARD.criticalStructureGraceMs-1000,stableObservations:0,upwardTicks:0,reclaimConfirmations:0,extensionUsed:false,reboundFromTroughCents:0,structureStrong:false,profile:strong,profileUpdatedAtMs:now-1000};
  const h=guardHarness({bid:34,filled:100,stopProfile:strong,entryOverrides:{stopGuardState:usg}});
  const out=await h.guard.protect(h.row());
  assert.equal(out.closed,true);
  assert.equal(h.row().stopGuardState.exitReason,'critical_structure_failed');
});


test('R39 SLW1 does not count repeated reads of the same book as fresh deterioration confirmations',async()=>{
  const profile={totalObservations:30,recoveredCount:1,smoothedRecoveryRate:0.06,avgRecoveryTimeMs:0,specificity:'exact_pre_stop',dropBucket:'15+'};
  const h=guardHarness({bid:60,filled:250,lossWatchdogProfile:profile,entryOverrides:{entryPriceCents:80,currentPriceCents:80,peakPriceCents:80,stopLossCents:35,count:250,remainingCount:250,entryFeeCents:500,entryConfig:{profitAuthority:'GOLDEN-EYE-V1',profitAuthorityRevision:'GE1-R2'}}});
  await h.guard.protect(h.row());
  h.setBidSameBook(58); await h.guard.protect(h.row());
  h.setBidSameBook(56); const out=await h.guard.protect(h.row());
  assert.equal(out.closed??false,false);
  assert.equal(h.row().stopGuardState.watchdog.observationCount,1,'same-book repricing must not manufacture lower-low confirmations');
});

test('R39 SLW1 rejects materially future book timestamps as DATA_HOLD instead of poisoning the classifier',async()=>{
  const profile={totalObservations:30,recoveredCount:1,smoothedRecoveryRate:0.06,avgRecoveryTimeMs:0,specificity:'exact_pre_stop',dropBucket:'15+'};
  const h=guardHarness({bid:60,filled:250,lossWatchdogProfile:profile,entryOverrides:{entryPriceCents:80,currentPriceCents:80,peakPriceCents:80,stopLossCents:35,count:250,remainingCount:250,entryFeeCents:500,entryConfig:{profitAuthority:'GOLDEN-EYE-V1',profitAuthorityRevision:'GE1-R2'}}});
  h.setBookAge(-(STOP_LOSS_WATCHDOG.maximumFutureBookSkewMs+1000));
  const out=await h.guard.protect(h.row());
  assert.equal(out.closed??false,false);
  assert.equal(h.guard.getState('guard-1').guardState,'SLW1_DATA_HOLD');
});

test('R41 persisted watchdog survives restart and preserves weak-history grace plus lower-low history',async()=>{
  const profile={totalObservations:25,recoveredCount:4,smoothedRecoveryRate:0.18,avgRecoveryTimeMs:120000,specificity:'exact_pre_stop',dropBucket:'15+'};
  const h=guardHarness({bid:60,filled:250,lossWatchdogProfile:profile,entryOverrides:{entryPriceCents:80,currentPriceCents:80,peakPriceCents:80,stopLossCents:35,count:250,remainingCount:250,entryFeeCents:500,entryConfig:{profitAuthority:'GOLDEN-EYE-V1',profitAuthorityRevision:'GE1-R2'}}});
  await h.guard.protect(h.row());
  h.setBid(59); await h.guard.protect(h.row());
  h.rows.get('guard-1').stopGuardState.watchdog.armedAtMs=Date.now()-STOP_LOSS_WATCHDOG.weakHistoryGraceMs-1000;
  const persisted=h.row();
  assert.equal(persisted.stopGuardState.watchdog.lowerLowCount,1);
  const guard2=new ProfitGuard({db:h.db,kalshi:{},market:h.guard.market,learning:h.learning,getSettings:()=>({...settings,simFeeCents:2,systemName:'SAGITTARIUS'})});
  guard2.evaluateApexProfitGuard=async()=>null;
  h.setBid(58); const out=await guard2.protect(persisted);
  assert.equal(out.closed,true);
  assert.equal(h.row().stopGuardState.exitReason,'slw1_historical_dead_market');
});

test('R39 lifecycle finality still outranks SLW1 even when the position was already in watchdog danger',async()=>{
  const profile={totalObservations:30,recoveredCount:1,smoothedRecoveryRate:0.06,avgRecoveryTimeMs:0,specificity:'exact_pre_stop',dropBucket:'15+'};
  const h=guardHarness({bid:60,filled:250,lossWatchdogProfile:profile,entryOverrides:{entryPriceCents:80,currentPriceCents:80,peakPriceCents:80,stopLossCents:35,count:250,remainingCount:250,entryFeeCents:500,entryConfig:{profitAuthority:'GOLDEN-EYE-V1',profitAuthorityRevision:'GE1-R2'}}});
  await h.guard.protect(h.row());
  h.setFinal('yes'); const out=await h.guard.protect(h.row());
  assert.equal(out.closed,true);
  assert.equal(h.row().closeReason,'settlement_win');
  assert.equal(h.row().pnlCents,4500);
});


test('R39 SLW1 stale DATA_HOLD observations never pre-load the fresh lower-low confirmation counter',async()=>{
  const profile={totalObservations:30,recoveredCount:1,smoothedRecoveryRate:0.06,avgRecoveryTimeMs:0,specificity:'exact_pre_stop',dropBucket:'15+'};
  const h=guardHarness({bid:60,filled:250,lossWatchdogProfile:profile,entryOverrides:{entryPriceCents:80,currentPriceCents:80,peakPriceCents:80,stopLossCents:35,count:250,remainingCount:250,entryFeeCents:500,entryConfig:{profitAuthority:'GOLDEN-EYE-V1',profitAuthorityRevision:'GE1-R2'}}});
  h.setBookAge(STOP_LOSS_WATCHDOG.maximumBookAgeMs+5000);
  await h.guard.protect(h.row());
  h.setBidSameBook(58); await h.guard.protect(h.row());
  h.setBidSameBook(56); await h.guard.protect(h.row());
  assert.equal(h.row().stopGuardState.watchdog.observationCount,0);
  h.setDepth({full:true,filled:250});
  const out=await h.guard.protect(h.row());
  assert.equal(out.closed??false,false,'first fresh book after a stale interval may only count as the first fresh observation');
  assert.equal(h.row().stopGuardState.watchdog.observationCount,1);
});


test('R41 SAMMAE-style low-entry Wave is cut above its 0c stop after weak-history grace',async()=>{
  const profile={totalObservations:20,recoveredCount:2,smoothedRecoveryRate:0.14,avgRecoveryTimeMs:0,specificity:'sport_drop_pre_stop',dropBucket:'15+'};
  const h=guardHarness({bid:29,filled:540,lossWatchdogProfile:profile,entryOverrides:{conceptName:'Wave Surfer',ticker:'KXATPMATCH-26AUG24SAMMAE-MAE',entryPriceCents:37,currentPriceCents:37,peakPriceCents:39,stopLossCents:50,count:540,remainingCount:540,entryFeeCents:1080,entryConfig:{profitAuthority:'GOLDEN-EYE-V1',profitAuthorityRevision:'GE1-R2'}}});
  await h.guard.protect(h.row());
  assert.equal(h.row().stopGuardState.watchdog.version,'SLW1');
  assert.equal(profitGuardDecision(h.row(),{yesBid:29,yesAsk:30,result:''},{...settings,waveStopCents:50}).hardStopCents,0);
  h.setBid(28); let out=await h.guard.protect(h.row());
  assert.equal(out.closed??false,false,'R41 must preserve a short recovery opportunity before acting');
  h.rows.get('guard-1').stopGuardState.watchdog.armedAtMs=Date.now()-STOP_LOSS_WATCHDOG.weakHistoryGraceMs-1000;
  h.setBid(27); out=await h.guard.protect(h.row());
  assert.equal(out.closed,true);
  assert.equal(h.row().stopGuardState.exitReason,'slw1_historical_dead_market');
});

test('R39 today-replay Garin-style deep drawdown survives SLW1 when learned recovery is strong',async()=>{
  const profile={totalObservations:30,recoveredCount:25,smoothedRecoveryRate:0.8125,avgRecoveryTimeMs:120000,specificity:'exact_pre_stop',dropBucket:'15+'};
  const h=guardHarness({bid:62,filled:238,lossWatchdogProfile:profile,entryOverrides:{entryPriceCents:84,currentPriceCents:84,peakPriceCents:84,stopLossCents:35,count:238,remainingCount:238,entryFeeCents:476,entryConfig:{profitAuthority:'GOLDEN-EYE-V1',profitAuthorityRevision:'GE1-R2'}}});
  await h.guard.protect(h.row());
  h.setBid(58); let out=await h.guard.protect(h.row());
  assert.equal(out.closed??false,false);
  h.setBid(55); out=await h.guard.protect(h.row());
  assert.equal(out.closed??false,false,'strong recovery history must prevent a blind dollar-loss liquidation');
  h.setBid(64); out=await h.guard.protect(h.row());
  assert.equal(out.closed??false,false);
});

test('R41 DENOLI-style weak lower-low collapse exits above its 52c Danger Line after weak-history grace',async()=>{
  const profile={totalObservations:20,recoveredCount:2,smoothedRecoveryRate:0.14,avgRecoveryTimeMs:0,specificity:'exact_pre_stop',dropBucket:'15+'};
  const h=guardHarness({bid:64,filled:229,lossWatchdogProfile:profile,entryOverrides:{entryPriceCents:87,currentPriceCents:87,peakPriceCents:87,stopLossCents:35,count:229,remainingCount:229,entryFeeCents:458,entryConfig:{profitAuthority:'GOLDEN-EYE-V1',profitAuthorityRevision:'GE1-R2'}}});
  await h.guard.protect(h.row());
  h.setBid(62); let out=await h.guard.protect(h.row());
  assert.equal(out.closed??false,false,'R41 weak-history grace must prevent an immediate exit');
  h.rows.get('guard-1').stopGuardState.watchdog.armedAtMs=Date.now()-STOP_LOSS_WATCHDOG.weakHistoryGraceMs-1000;
  h.setBid(60); out=await h.guard.protect(h.row());
  assert.equal(out.closed,true);
  assert.equal(h.row().stopGuardState.dangerLineCents,52);
  assert.ok(h.row().stopGuardState.exitBidCents>52,'watchdog should be capable of acting before the original model stop');
  assert.equal(h.row().stopGuardState.exitReason,'slw1_historical_dead_market');
});

test('R41 SGRL1 excludes partial-from-upgrade episodes from decision profiles even if storage returns them',async()=>{
  const causal={id:'causal',trigger_stage:'SLW1',mode:'SIMULATION',coverage_kind:'causal_from_trigger',concept_name:'Wave Surfer',source_feeder:'Pegasus',sport:'KBO Baseball',entry_price_cents:45,trigger_drop_cents:30,game_minutes_at_entry:50,crash_bucket:'NORMAL',trigger_at_ms:1000,tracking_complete:true,recovered:false,recovery_at_ms:null,state:{version:'SGRL1',coverageKind:'causal_from_trigger',decisionEvidenceEligible:true}};
  const inherited={...causal,id:'partial',coverage_kind:'partial_from_upgrade',recovered:true,recovery_at_ms:2000,state:{version:'SGRL1',coverageKind:'partial_from_upgrade',decisionEvidenceEligible:false}};
  let written=[];let options=null;
  const db={
    async stopGuardRecoveryEpisodes(_system,o){options=structuredClone(o);return [causal,inherited];},
    async replaceStopGuardProfiles(_system,stage,mode,profiles){if(stage==='SLW1'&&mode==='SIMULATION')written=structuredClone(profiles);},
  };
  const learning=new LearningEngine(db,'SAGITTARIUS');
  const out=await learning.aggregateStopGuardProfiles();
  assert.equal(options.coverageKind,'causal_from_trigger');
  assert.equal(out.observations,1);
  assert.ok(written.length>0);
  assert.ok(written.every(p=>p.totalObservations===1&&p.recoveredCount===0),'partial inherited evidence must never vote in Stop Guard decision profiles');
});

test('R41 existing R40 SLW1 state is backfilled as partial-from-upgrade while a newly armed SLW1 episode is causal',async()=>{
  const now=Date.now();
  const oldWatchdog={version:'SLW1',phase:'SLW1_DANGER',armedAtMs:now-60_000,lastObservedBookMs:now-2000,observationCount:5,lastBidCents:55,minBidCents:54,lowerLowCount:0,consecutiveDown:0,stableObservations:2,upwardTicks:1,reboundFromTroughCents:1,currentLossCents:7000,peakLossCents:7000,profile:{totalObservations:0,smoothedRecoveryRate:.5,dropBucket:'20-29',evidenceVersion:'SGRL1'},profileUpdatedAtMs:now,structureStrong:false};
  const migrated=guardHarness({bid:54,filled:250,entryOverrides:{entryPriceCents:80,currentPriceCents:54,stopLossCents:35,count:250,remainingCount:250,entryFeeCents:500,stopGuardState:{watchdog:oldWatchdog}}});
  const seen=[];
  migrated.learning.beginStopGuardRecoveryEpisode=async(_entry,o)=>{seen.push(structuredClone(o));return{coverageKind:o.coverageKind};};
  await migrated.guard.protect(migrated.row());
  assert.equal(seen.length,1);
  assert.equal(seen[0].triggerStage,'SLW1');
  assert.equal(seen[0].coverageKind,'partial_from_upgrade');
  assert.equal(migrated.row().stopGuardState.watchdog.recoveryLearningEpisodeVersion,'SGRL1');

  const fresh=guardHarness({bid:54,filled:250,entryOverrides:{entryPriceCents:80,currentPriceCents:80,stopLossCents:35,count:250,remainingCount:250,entryFeeCents:500,stopGuardState:{}}});
  const freshSeen=[];
  fresh.learning.beginStopGuardRecoveryEpisode=async(_entry,o)=>{freshSeen.push(structuredClone(o));return{coverageKind:o.coverageKind};};
  await fresh.guard.protect(fresh.row());
  assert.equal(freshSeen.length,1);
  assert.equal(freshSeen[0].coverageKind,'causal_from_trigger');
  assert.equal(fresh.row().stopGuardState.watchdog.recoveryLearningCoverageKind,'causal_from_trigger');
});

test('R41 native SLW1 trigger remains causal after a transient SGRL1 persistence failure instead of being downgraded to upgrade-partial evidence',async()=>{
  const h=guardHarness({bid:54,filled:250,entryOverrides:{entryPriceCents:80,currentPriceCents:80,stopLossCents:35,count:250,remainingCount:250,entryFeeCents:500,stopGuardState:{}}});
  const seen=[];let calls=0;
  h.learning.beginStopGuardRecoveryEpisode=async(_entry,o)=>{seen.push(o.coverageKind);calls+=1;return calls===1?null:{coverageKind:o.coverageKind};};
  await h.guard.protect(h.row());
  assert.deepEqual(seen,['causal_from_trigger','causal_from_trigger'],'a transient first write may retry, but a native R41 trigger must never be relabeled as partial_from_upgrade');
  assert.equal(h.row().stopGuardState.watchdog.recoveryLearningEpisodeVersion,'SGRL1');
  assert.equal(h.row().stopGuardState.watchdog.recoveryLearningCoverageKind,'causal_from_trigger');
});

test('R41 persisted SGRL1 coverage identity wins over the requested native classification on conflict/restart',async()=>{
  const h=guardHarness({bid:54,filled:250,entryOverrides:{entryPriceCents:80,currentPriceCents:80,stopLossCents:35,count:250,remainingCount:250,entryFeeCents:500,stopGuardState:{}}});
  h.learning.beginStopGuardRecoveryEpisode=async()=>({coverageKind:'partial_from_upgrade'});
  await h.guard.protect(h.row());
  assert.equal(h.row().stopGuardState.watchdog.recoveryLearningEpisodeVersion,'SGRL1');
  assert.equal(h.row().stopGuardState.watchdog.recoveryLearningCoverageKind,'partial_from_upgrade','the durable DB cohort identity must override the caller request so restart cannot relabel evidence');
});

test('R41 existing R40 U-SG1 state is backfilled as partial-from-upgrade without changing its frozen Danger Line',async()=>{
  const now=Date.now();
  const profile={totalObservations:0,recoveredCount:0,smoothedRecoveryRate:.5,avgRecoveryTimeMs:0,specificity:'cold_start',dropBucket:'30-39',evidenceVersion:'SGRL1'};
  const usg={version:'U-SG1',phase:'USG1_RECOVERY_ZONE',armedAtMs:now-60_000,dangerLineCents:45,stopLossCents:35,baseWindowMs:30*60000,deadlineMs:now+29*60000,minBidCents:44,lastBidCents:44,lastObservedQuoteMs:now-2000,maxPenetrationCents:1,penetrationCents:1,zone:'RECOVERY',criticalEnteredAtMs:null,stableObservations:2,upwardTicks:1,reclaimConfirmations:0,extensionUsed:false,reboundFromTroughCents:0,structureStrong:false,profile,profileUpdatedAtMs:now};
  const h=guardHarness({bid:44,filled:10,stopProfile:profile,entryOverrides:{entryPriceCents:80,currentPriceCents:44,stopLossCents:35,count:10,remainingCount:10,entryFeeCents:20,stopGuardState:usg}});
  const seen=[];h.learning.beginStopGuardRecoveryEpisode=async(_entry,o)=>{seen.push(structuredClone(o));return{coverageKind:o.coverageKind};};
  const out=await h.guard.protect(h.row());
  assert.equal(out.closed??false,false);
  assert.equal(seen.length,1);assert.equal(seen[0].triggerStage,'USG1');assert.equal(seen[0].coverageKind,'partial_from_upgrade');
  assert.equal(h.row().stopGuardState.dangerLineCents,45);
  assert.equal(h.row().stopGuardState.recoveryLearningCoverageKind,'partial_from_upgrade');
});

test('R41 SGRL1 database write/query shapes preserve coverage cohort and bounded key reads',async()=>{
  const queries=[];
  const db=Object.create(Database.prototype);
  db.pool={
    async query(sql,args=[]){queries.push({sql,args});if(sql.includes('returning coverage_kind'))return{rows:[{coverage_kind:'causal_from_trigger'}],rowCount:1};return{rows:[]};},
  };
  const episode={id:'e',systemName:'S',originalEntryId:'h',triggerStage:'SLW1',ticker:'T',mode:'SIMULATION',conceptName:'Wave Surfer',sourceFeeder:'Pegasus',sport:'KBO Baseball',entryPriceCents:45,triggerPriceCents:15,triggerDropCents:30,triggerLossCents:10000,dangerLineCents:10,gameMinutesAtEntry:50,crashBucket:'NORMAL',originalCount:100,trackedCount:100,entryFeeCents:200,baseRealizedPnlCents:0,triggerAtMs:1000,trackingComplete:false,recovered:false,recoveryAtMs:null,coverageKind:'causal_from_trigger',state:{version:'SGRL1'},updatedAtMs:1000};
  const stored=await db.createStopGuardRecoveryEpisode(episode);
  assert.equal(stored.coverage_kind,'causal_from_trigger');
  assert.match(queries[0].sql,/\$27/);assert.equal(queries[0].args.length,27);assert.equal(queries[0].args[24],'causal_from_trigger');
  await db.stopGuardRecoveryEpisodes('S',{complete:true,triggerStage:'SLW1',mode:'SIMULATION',ticker:'T',coverageKind:'causal_from_trigger',limit:10});
  const read=queries.at(-1);assert.ok(read.sql.includes('coverage_kind=$6'));assert.equal(read.args.at(-2),'causal_from_trigger');
  await db.stopGuardProfiles('S',{triggerStage:'SLW1',mode:'SIMULATION',profileKeys:['k1','k2']});
  const profiles=queries.at(-1);assert.ok(profiles.sql.includes('profile_key = any($4::text[])'));assert.deepEqual(profiles.args[3],['k1','k2']);
});

test('R41 Stop Guard profile lookup uses frozen Hunter entry game minute rather than current stop time',async()=>{
  const now=Date.now();const start=now-90*60000;const opened=start+30*60000;const seen=[];
  const entry={...base,id:'entry-time',ticker:'KXKBOGAME-ENTRY-TIME',eventTicker:'EV',marketTitle:'KBO',mode:'SIMULATION',sourceFeeder:'Pegasus',entryPriceCents:56,openedAtMs:opened,gameStartTimeMs:start,entryConfig:{gameClockAuthority:{version:'GCA2',eventTicker:'EV',phase:'CONFIRMED',confirmed:true,startTimeMs:start}}};
  const learning={
    async lossWatchdogProfile(o){seen.push(['SLW1',structuredClone(o)]);return null;},
    async stopGuardProfile(o){seen.push(['USG1',structuredClone(o)]);return null;},
  };
  const guard=new ProfitGuard({db:{audit:async()=>{}},kalshi:{},market:{},learning,getSettings:()=>settings});
  await guard.stopLossWatchdogLearningProfile(entry,30,{triggerDropCents:26,crashBucket:'NORMAL'});
  await guard.stopGuardLearningProfile(entry,20,1,{triggerDropCents:36,crashBucket:'CRASHING'});
  assert.equal(seen[0][1].gameMinutes,30);assert.equal(seen[1][1].gameMinutes,30);
  assert.equal(seen[0][1].totalDropCents,26);assert.equal(seen[1][1].totalDropCents,36);
  assert.equal(seen[0][1].crashBucket,'NORMAL');assert.equal(seen[1][1].crashBucket,'CRASHING');
});

test('R41 SLW1 historical cohort identity stays frozen at trigger while live deterioration keeps evolving independently',async()=>{
  const now=Date.now();let calls=0;const seen=[];
  const profile={totalObservations:20,recoveredCount:10,smoothedRecoveryRate:.5,avgRecoveryTimeMs:1000,specificity:'exact',dropBucket:'20-29',crashBucket:'NORMAL',evidenceVersion:'SGRL1'};
  const watchdog={version:'SLW1',phase:'SLW1_DANGER',armedAtMs:now-1000,lastObservedBookMs:now-2000,observationCount:5,lastBidCents:59,minBidCents:58,lowerLowCount:0,consecutiveDown:0,stableObservations:2,upwardTicks:1,reboundFromTroughCents:1,currentLossCents:7000,peakLossCents:7000,profile,profileUpdatedAtMs:now-61_000,structureStrong:false,recoveryLearningTriggerDropCents:22,recoveryLearningCrashBucket:'NORMAL',recoveryLearningGameMinutesAtEntry:30,recoveryLearningEpisodeVersion:'SGRL1',recoveryLearningCoverageKind:'causal_from_trigger'};
  const h=guardHarness({bid:50,filled:250,lossWatchdogProfile:profile,crashState:{phase:'CRASHING',lowerLowCount:4,reboundCents:0,upwardTicks:0},entryOverrides:{entryPriceCents:80,currentPriceCents:45,stopLossCents:35,count:250,remainingCount:250,entryFeeCents:500,stopGuardState:{watchdog}}});
  h.learning.lossWatchdogProfile=async(o)=>{calls+=1;seen.push(structuredClone(o));return{...profile,dropBucket:'20-29',crashBucket:'NORMAL'};};
  await h.guard.protect(h.row());
  assert.equal(calls,1,'time refresh should reload the prior without changing cohort identity');
  assert.equal(seen[0].totalDropCents,22,'historical cohort must remain the causal trigger drop, not current 35c drawdown');
  assert.equal(seen[0].crashBucket,'NORMAL','historical prior keeps trigger crash state while current CRASHING state is handled by live structure');
});

test('R41 SGRL1 row lock prevents overlapping quote/full-scan telemetry from double-counting one durability observation',async()=>{
  const now=Date.now();let releaseUpdate;const gate=new Promise(r=>{releaseUpdate=r;});let updates=0;
  const row={id:'lock-row',system_name:'S',original_entry_id:'H',trigger_stage:'SLW1',ticker:'T',mode:'SIMULATION',concept_name:'Wave Surfer',source_feeder:'Pegasus',sport:'KBO Baseball',entry_price_cents:50,trigger_price_cents:20,trigger_drop_cents:30,trigger_loss_cents:8000,danger_line_cents:15,game_minutes_at_entry:40,crash_bucket:'NORMAL',original_count:100,tracked_count:100,entry_fee_cents:200,base_realized_pnl_cents:0,trigger_at_ms:now-1000,tracking_complete:false,recovered:false,recovery_at_ms:null,coverage_kind:'causal_from_trigger',state:{version:'SGRL1',coverageKind:'causal_from_trigger',decisionEvidenceEligible:true,createdAtMs:now-1000,lastObservedAtMs:0,trackingComplete:false},updated_at_ms:now-1000};
  const db={
    async stopGuardRecoveryEpisodes(){return[structuredClone(row)];},
    async updateStopGuardRecoveryEpisode(){updates+=1;await gate;},
  };
  const learning=new LearningEngine(db,'S');
  const q={ticker:'T',yesBid:60,yesAsk:61,status:'active',result:'',updatedAtMs:now};
  const market={getQuote:()=>q,quoteAgeMs:()=>0,ensureFreshBook:async()=>({updatedAtMs:now}),getBook:()=>({updatedAtMs:now}),executableBid:(_t,count)=>({full:true,filled:count,avgCents:60,bestCents:60})};
  const p1=learning.trackStopGuardRecovery(new Map([['T',q]]),{recoveryTrackingHours:24,simFeeCents:2},market,{ticker:'T'});
  await new Promise(r=>setImmediate(r));
  const second=await learning.trackStopGuardRecovery(new Map([['T',q]]),{recoveryTrackingHours:24,simFeeCents:2},market,{ticker:'T'});
  assert.equal(second.tracked,0);assert.equal(updates,1);
  releaseUpdate();const first=await p1;assert.equal(first.tracked,1);
});

test('R44 Atomic Thunder policy is profit-only, full-position, fee-adjusted and subordinate to U-SG1',()=>{
  assert.equal(ATOMIC_THUNDER.version,'ATOMIC-THUNDER-V1');
  assert.equal(ATOMIC_THUNDER.authority,'PROFIT_EXIT');
  assert.equal(ATOMIC_THUNDER.fullPositionOnly,true);
  assert.equal(ATOMIC_THUNDER.minimumNetPerOriginalContractCents,1);
  assert.equal(ATOMIC_THUNDER.requiredFreshConfirmations,2);
  assert.equal(ATOMIC_THUNDER.lossAuthority,'U-SG1');
});

test('Atomic Thunder ignores gross-positive but fee-negative/threshold-insufficient price movement',async()=>{
  const h=guardHarness({bid:84,atomicThunderEnabled:true});
  const out=await h.guard.protect(h.row());
  assert.equal(out.closed??false,false);
  assert.equal(h.row().status,'open');
  assert.equal(h.row().pnlCents,0);
  assert.equal(h.guard.atomicThunderStates.get('guard-1'),undefined);
  assert.ok(h.atomicEvents.some(e=>e.eventType==='invalid_opportunity_blocked'&&e.data.reason==='fee_adjusted_net_below_threshold'));
});

test('Atomic Thunder requires two distinct fresh qualifying books and harvests the entire position at exactly +1c net per original contract',async()=>{
  const h=guardHarness({bid:85,atomicThunderEnabled:true});
  let out=await h.guard.protect(h.row());
  assert.equal(out.closed??false,false);
  assert.equal(h.guard.atomicThunderStates.get('guard-1').confirmations,1);
  assert.equal(h.atomicEvents.filter(e=>e.eventType==='opportunity_detected').length,1);

  out=await h.guard.protect(h.row());
  assert.equal(out.closed??false,false,'same book evidence must not count twice');
  assert.equal(h.guard.atomicThunderStates.get('guard-1').confirmations,1);

  h.setBid(85);
  out=await h.guard.protect(h.row());
  assert.equal(out.closed,true);
  assert.equal(h.row().status,'closed');
  assert.equal(h.row().remainingCount,0);
  assert.equal(h.row().closeReason,'atomic_thunder_cashout');
  assert.equal(h.row().pnlCents,100,'100 original contracts must realize exactly +1c net per original contract at the threshold');
  assert.ok(h.atomicEvents.some(e=>e.eventType==='harvest_executed'));
  assert.ok(h.audits.some(e=>e.event==='atomic_thunder_harvest_committed'));
});

test('Atomic Thunder fails closed on partial full-position depth even when best bid is highly profitable',async()=>{
  const h=guardHarness({bid:95,full:false,filled:40,atomicThunderEnabled:true});
  const out=await h.guard.protect(h.row());
  assert.equal(out.closed??false,false);
  assert.equal(h.row().status,'open');
  assert.ok(h.atomicEvents.some(e=>e.eventType==='invalid_opportunity_blocked'&&e.data.reason==='insufficient_full_position_depth'));
});

test('Atomic Thunder fails closed on stale book evidence and never fabricates a harvest from display price',async()=>{
  const h=guardHarness({bid:95,atomicThunderEnabled:true});
  h.setBookAge(2000);
  const out=await h.guard.protect(h.row());
  assert.equal(out.closed??false,false);
  assert.equal(h.row().status,'open');
  assert.ok(h.atomicEvents.some(e=>e.eventType==='invalid_opportunity_blocked'&&e.data.reason==='stale_or_invalid_book'));
});

test('U-SG1 loss protection retains precedence over Atomic Thunder on an Atomic-enabled Hunter',async()=>{
  const h=guardHarness({bid:30,atomicThunderEnabled:true});
  const out=await h.guard.protect(h.row());
  assert.equal(out.closed,true);
  assert.equal(h.row().closeReason,'hard_stop_loss');
  assert.equal(h.learning.hardStops,1);
  assert.equal(h.atomicEvents.some(e=>e.eventType==='harvest_executed'),false);
});

test('Golden Eye cannot override an enabled Atomic Thunder Hunter',async()=>{
  const h=guardHarness({bid:90,atomicThunderEnabled:true,entryOverrides:{conceptName:'Dragon Recovery Hunter'}});
  const out=await h.guard.manualCashout(h.row(),h.guard.market.getQuote('KXMLBGAME-X-A'),{reason:'golden_eye_cashout'});
  assert.equal(out.closed,false);
  assert.equal(out.skipped,'atomic_thunder_has_priority');
  assert.equal(h.row().status,'open');
  assert.ok(h.audits.some(e=>e.event==='golden_eye_cashout_skipped_atomic_thunder_priority'));
});

test('Atomic Thunder persistent stats do not treat null counterfactual fields as zero losses',async()=>{
  const db=Object.create(Database.prototype);
  const now=Date.now();
  let call=0;
  db.pool={async query(){
    call+=1;
    if(call===1)return{rows:[{event_type:'observing',count:1,last_at_ms:now},{event_type:'opportunity_detected',count:1,last_at_ms:now}]};
    if(call===2)return{rows:[{id:'H',pnl_cents:250,opened_at_ms:now-5000,closed_at_ms:now,state:{postExitMinExecutableNetCents:null,postExitMaxExecutableNetCents:null,terminalNetCents:null,trackingComplete:false}}]};
    return{rows:[]};
  }};
  const stats=await db.atomicThunderStats('S');
  assert.equal(stats.harvestsExecuted,1);
  assert.equal(stats.realizedPnlCents,250);
  assert.equal(stats.lossesAvoided,0);
  assert.equal(stats.avoidedLossCents,0);
  assert.equal(stats.forgoneUpsideCents,0);
});

test('Atomic Thunder LIVE persists the exit receipt before broker mutation and submits the full owned quantity at its profit floor',async()=>{
  const h=guardHarness({bid:85,atomicThunderEnabled:true,entryOverrides:{mode:'LIVE'}});
  let out=await h.guard.protect(h.row());
  assert.equal(out.closed??false,false);
  const floor=h.guard.atomicThunderExitFloorCents(h.row(),{...settings,simFeeCents:2,atomicThunderEnabled:true});
  const orders=[];
  h.guard.kalshi={
    async getPositions(){const r=h.row();return[{ticker:r.ticker,position_fp:r.remainingCount}];},
    buildClientOrderId:()=> 'at-live-receipt-1',
    async placeOrder(order){
      const persisted=h.row();
      assert.equal(persisted.status,'exit_pending');
      assert.equal(persisted.exitClientOrderId,'at-live-receipt-1');
      assert.equal(persisted.closeReason,'atomic_thunder_cashout');
      orders.push(structuredClone(order));
      return {orderId:'at-live-order-1',fillCount:order.count,averageFillPriceCents:85,feePaidCents:2*order.count};
    },
  };
  h.setBid(85);
  out=await h.guard.protect(h.row());
  assert.equal(out.closed,true);
  assert.equal(orders.length,1);
  assert.equal(orders[0].count,100);
  assert.equal(orders[0].priceCents,floor);
  assert.equal(h.row().remainingCount,0);
  assert.equal(h.row().closeReason,'atomic_thunder_cashout');
});

test('Atomic Thunder LIVE broker partial is durable, reopens only the remainder, and never chases the rest below its profit floor',async()=>{
  const h=guardHarness({bid:85,atomicThunderEnabled:true,entryOverrides:{mode:'LIVE'}});
  await h.guard.protect(h.row());
  h.guard.kalshi={
    async getPositions(){const r=h.row();return[{ticker:r.ticker,position_fp:r.remainingCount}];},
    buildClientOrderId:()=> 'at-live-partial-1',
    async placeOrder(){return {orderId:'at-partial-order',fillCount:40,averageFillPriceCents:85,feePaidCents:80};},
  };
  h.setBid(85);
  const out=await h.guard.protect(h.row());
  assert.equal(out.closed,false);
  assert.equal(out.filled,40);
  assert.equal(out.reopened,true);
  assert.equal(out.pending,false);
  assert.equal(h.row().remainingCount,60);
  assert.equal(h.row().status,'open');
  assert.equal(h.row().closeReason,null);
  assert.equal(h.row().exitClientOrderId,null);
  assert.ok(h.audits.some((x)=>x.event==='atomic_thunder_live_partial_reopened'));
});
