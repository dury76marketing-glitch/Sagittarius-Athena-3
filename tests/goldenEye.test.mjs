import test from 'node:test';
import assert from 'node:assert/strict';
import { GOLDEN_EYE } from '../src/doctrine.mjs';
import { GoldenEye, advanceGoldenEyeState, buildManualTrainingEpisodes, evaluateGoldenEyeSignal, goldenEyeFingerprint, goldenEyeStats } from '../src/goldenEye.mjs';

const fp='fp-test';
const baseState=()=>({
  version:GOLDEN_EYE.version,policyRevision:GOLDEN_EYE.policyRevision,fingerprint:fp,
  samples:0,naturalEpisodes:[],manualEpisodes:[],currentEpisode:null,lastSampleAtMs:0,lastSeenProfitCents:0,
  lastSignal:null,lastExecution:null,interventions:0,manualActions:0,manualBackfilledTrades:0,manualBackfillThroughMs:0,resets:0,discardedEpisodes:0,updatedAtMs:0,
});

function step(state,atMs,seenProfitCents,extra={}){
  return advanceGoldenEyeState(state,{atMs,seenProfitCents,profitableCount:seenProfitCents>0?1:0,openCount:1,freshCount:1,fullyExecutableProfitableCount:seenProfitCents>0?1:0,...extra},fp,atMs+100).state;
}
function learnEpisode(state,startAt,peak){
  state=step(state,startAt,Math.max(100,peak-200));
  state=step(state,startAt+100,peak);
  const out=advanceGoldenEyeState(state,{atMs:startAt+200,seenProfitCents:0,profitableCount:0,openCount:1,freshCount:1,fullyExecutableProfitableCount:0},fp,startAt+300);
  assert.ok(out.finalized,'natural episode did not finalize');
  return out.state;
}
function learnedState(peaks){
  let state=baseState(); let t=1_000;
  for(const peak of peaks){state=learnEpisode(state,t,peak);t+=1_000;}
  return {state,t};
}

test('Golden Eye doctrine is global, no-lookahead, all-profitable and never per-trade selective',()=>{
  assert.equal(GOLDEN_EYE.version,'GOLDEN-EYE-V1');
  assert.equal(GOLDEN_EYE.policyRevision,'GE1-R2');
  assert.equal(GOLDEN_EYE.minimumCollectiveEpisodes,8);
  assert.equal(GOLDEN_EYE.allProfitableCashout,true);
  assert.equal(GOLDEN_EYE.perTradeSelection,false);
  assert.equal(GOLDEN_EYE.noLookahead,true);
  assert.ok(GOLDEN_EYE.minimumSampleIntervalMs<=125);
  assert.ok(GOLDEN_EYE.maximumSignalQuoteAgeMs<=1_000);
  assert.ok(GOLDEN_EYE.maximumSignalBookAgeMs<=1_000);
  assert.ok(GOLDEN_EYE.maximumExecutionBookAgeMs<=1_000);
});

test('natural local profit episodes are cataloged only after a subsequent drawdown/zero label',()=>{
  let state=baseState();
  state=step(state,1_000,400);
  state=step(state,1_100,700);
  assert.equal(state.naturalEpisodes.length,0,'current peak must never enter training before future outcome exists');
  const out=advanceGoldenEyeState(state,{atMs:1_200,seenProfitCents:0,profitableCount:0,openCount:1,freshCount:1,fullyExecutableProfitableCount:0},fp,1_300);
  assert.equal(out.state.naturalEpisodes.length,1);
  assert.equal(out.state.naturalEpisodes[0].peakProfitCents,700);
  assert.equal(out.state.naturalEpisodes[0].closeReason,'profit_zero');
});

test('manual or Golden Eye intervention censors the current episode from the natural training catalog',()=>{
  let state=baseState();
  state=step(state,1_000,500);
  state=step(state,1_100,900);
  state.currentEpisode={...state.currentEpisode,intervention:true,interventionReason:'manual_cashout'};
  const out=advanceGoldenEyeState(state,{atMs:1_200,seenProfitCents:0,profitableCount:0,openCount:1,freshCount:1,fullyExecutableProfitableCount:0},fp,1_300);
  assert.equal(out.finalized,null);
  assert.equal(out.state.naturalEpisodes.length,0);
});

test('a continuity gap discards rather than trains the interrupted episode and resets jump origin',()=>{
  let state=baseState();
  state=step(state,1_000,600);
  state=step(state,1_100,900);
  const at=1_100+GOLDEN_EYE.maximumContinuousSampleGapMs+1;
  const out=advanceGoldenEyeState(state,{atMs:at,seenProfitCents:700,profitableCount:1,openCount:1,freshCount:1,fullyExecutableProfitableCount:1},fp,at+100);
  assert.equal(out.state.naturalEpisodes.length,0);
  assert.equal(out.state.discardedEpisodes,1);
  assert.equal(out.state.currentEpisode.peakProfitCents,700);
  assert.equal(out.state.currentEpisode.maxJumpCents,0,'first observation after a gap must not inherit a stale jump');
});

test('out-of-order and materially future samples are ignored without mutating learned state',()=>{
  let state=baseState();
  state=step(state,2_000,500);
  const frozen=structuredClone(state);
  let out=advanceGoldenEyeState(state,{atMs:1_999,seenProfitCents:900,profitableCount:1,openCount:1},fp,2_100);
  assert.equal(out.ignored,'out_of_order_sample');
  assert.deepEqual(out.state,frozen);
  out=advanceGoldenEyeState(state,{atMs:10_000,seenProfitCents:900,profitableCount:1,openCount:1},fp,1_000);
  assert.equal(out.ignored,'future_sample');
  assert.deepEqual(out.state,frozen);
});

test('settings fingerprint changes reset learned thresholds instead of mixing incompatible stake/capital regimes',()=>{
  let state=learnedState([700,800,900]).state;
  const before=state.resets;
  const out=advanceGoldenEyeState(state,{atMs:10_000,seenProfitCents:500,profitableCount:1,openCount:1},'different-fingerprint',10_100);
  assert.equal(out.state.fingerprint,'different-fingerprint');
  assert.equal(out.state.naturalEpisodes.length,0);
  assert.equal(out.state.resets,before+1);
});

test('catalog remains bounded across long-running learning',()=>{
  let state=baseState();let t=1_000;
  for(let i=0;i<GOLDEN_EYE.maximumCatalogEpisodes+20;i++){state=learnEpisode(state,t,600+(i%20));t+=1_000;}
  assert.equal(state.naturalEpisodes.length,GOLDEN_EYE.maximumCatalogEpisodes);
});

test('Golden Eye cannot signal before the minimum natural episode evidence gate',()=>{
  const {state}=learnedState([700,750,800,850,900,950,1000]);
  const r=evaluateGoldenEyeSignal({...state,currentEpisode:{intervention:false}},{isNewPeak:true,seenProfitCents:900,jumpCents:200});
  assert.equal(r.signal,false);
  assert.equal(r.reason,'learning');
});

test('catalog extension exhaustion triggers on the new executable peak itself without waiting for a reversal tick',()=>{
  let {state,t}=learnedState([700,750,800,820,850,870,900,920]);
  state=step(state,t,400); // below signal-profit floor: establish an active episode without pre-signaling
  const out=advanceGoldenEyeState(state,{atMs:t+100,seenProfitCents:800,profitableCount:2,openCount:2,freshCount:2,fullyExecutableProfitableCount:2},fp,t+200);
  assert.ok(out.signal);
  assert.equal(out.signal.reason,'catalog_extension_exhaustion');
  assert.equal(out.signal.seenProfitCents,800);
});

test('history that repeatedly extends materially beyond the current profit keeps Golden Eye holding',()=>{
  let {state,t}=learnedState([1400,1450,1500,1550,1600,1650,1700,1800]);
  state=step(state,t,700);
  const out=advanceGoldenEyeState(state,{atMs:t+100,seenProfitCents:800,profitableCount:1,openCount:1,freshCount:1,fullyExecutableProfitableCount:1},fp,t+200);
  assert.equal(out.signal,null);
  assert.equal(out.analysis.reason,'continuation_still_supported');
  assert.ok(out.analysis.extensionProbability>GOLDEN_EYE.maximumExtensionProbability);
});

test('a novel historical high requires a real positive jump signature before it can fire',()=>{
  const learned=learnedState([700,750,800,820,850,870,900,1000]);
  let state=step(learned.state,learned.t,1050);
  let out=advanceGoldenEyeState(state,{atMs:learned.t+100,seenProfitCents:1060,profitableCount:1,openCount:1,freshCount:1,fullyExecutableProfitableCount:1},fp,learned.t+200);
  assert.equal(out.signal,null,'tiny drift above prior max is not a jump event');
  state=step(learned.state,learned.t,100);
  out=advanceGoldenEyeState(state,{atMs:learned.t+100,seenProfitCents:1100,profitableCount:1,openCount:1,freshCount:1,fullyExecutableProfitableCount:1},fp,learned.t+200);
  assert.ok(out.signal);
  assert.equal(out.signal.reason,'novel_catalog_high_jump');
});

test('Golden Eye sample measures only fresh full-position executable positive net profit and excludes feeders/stale/partial/losing books',()=>{
  const now=50_000;
  const entries=[
    {id:'good',conceptName:'Wave Surfer',status:'open',ticker:'GOOD',entryPriceCents:60,count:10,remainingCount:10,entryFeeCents:20},
    {id:'loss',conceptName:'Momentum Hunter',status:'open',ticker:'LOSS',entryPriceCents:80,count:10,remainingCount:10,entryFeeCents:20},
    {id:'partial',conceptName:'Recovery Hunter',status:'open',ticker:'PART',entryPriceCents:60,count:10,remainingCount:10,entryFeeCents:20},
    {id:'stale',conceptName:'Wave Surfer',status:'open',ticker:'STALE',entryPriceCents:60,count:10,remainingCount:10,entryFeeCents:20},
    {id:'feed',conceptName:'Pegasus',status:'open',ticker:'FEED',entryPriceCents:40,count:10,remainingCount:10,entryFeeCents:0},
  ];
  const quotes={GOOD:{yesBid:80,bookInvalid:false},LOSS:{yesBid:70,bookInvalid:false},PART:{yesBid:90,bookInvalid:false},STALE:{yesBid:90,bookInvalid:false},FEED:{yesBid:99,bookInvalid:false}};
  const market={
    getQuote:t=>quotes[t],quoteAgeMs:t=>t==='STALE'?GOLDEN_EYE.maximumSignalQuoteAgeMs+1:0,bookAgeMs:t=>t==='STALE'?GOLDEN_EYE.maximumSignalBookAgeMs+1:0,
    executableBid(t,count){if(t==='PART')return{filled:5,full:false,avgCents:90};if(t==='GOOD')return{filled:count,full:true,avgCents:79};if(t==='LOSS')return{filled:count,full:true,avgCents:70};return{filled:count,full:true,avgCents:90};},
  };
  const ge=new GoldenEye({db:{},market,getSettings:()=>({systemName:'S',simFeeCents:2})});
  const sample=ge.sample(entries,now);
  assert.equal(sample.openCount,4,'feeders are outside the Hunter portfolio');
  assert.equal(sample.freshCount,3);
  assert.equal(sample.fullyExecutableProfitableCount,1);
  assert.deepEqual(sample.profitableEntryIds,['good']);
  assert.equal(sample.seenProfitCents,150);
});

test('Golden Eye persistence failures are fail-closed and visible in health telemetry',async()=>{
  const db={goldenEyeState:async()=>null,saveGoldenEyeState:async()=>{throw new Error('db down');}};
  const ge=new GoldenEye({db,market:{},getSettings:()=>({systemName:'S',simFeeCents:2})});
  await assert.rejects(()=>ge.init(),/db down/);
  assert.equal(ge.healthy,false);
  assert.match(ge.lastError,/db down/);
  assert.equal(ge.summary().ready,false);
});

test('fingerprint is deterministic and sensitive to portfolio economics',()=>{
  const a=goldenEyeFingerprint({waveStakeCents:20_000,simFeeCents:2,maxPositions:20});
  const b=goldenEyeFingerprint({waveStakeCents:20_000,simFeeCents:2,maxPositions:20});
  const c=goldenEyeFingerprint({waveStakeCents:40_000,simFeeCents:2,maxPositions:20});
  assert.equal(a,b);assert.notEqual(a,c);
});

test('Golden Eye summary exposes learned peak/jump distribution without future-only fields',()=>{
  const state=learnedState([600,700,800,900,1000,1100,1200,1300]).state;
  const stats=goldenEyeStats(state);
  assert.equal(stats.episodeCount,8);
  assert.ok(stats.peakP90Cents>=stats.peakP75Cents);
  assert.ok(stats.maxHistoricalPeakCents>=stats.peakP90Cents);
});

test('incomplete market coverage cannot manufacture a zero-profit episode or train a false peak',()=>{
  let state=baseState();
  state=step(state,1_000,600);
  state=step(state,1_100,900);
  const before=structuredClone(state);
  const out=advanceGoldenEyeState(state,{atMs:1_200,seenProfitCents:0,profitableCount:0,openCount:2,freshCount:1,observableCount:1,fullyExecutableProfitableCount:0,complete:false},fp,1_300);
  assert.equal(out.ignored,'incomplete_market_coverage');
  assert.equal(out.finalized,null);
  assert.deepEqual(out.state,before);
});

test('mature continuation evidence outranks a generic high-profit jump heuristic',()=>{
  const peaks=[100,100,100,100,100,2100,2500,3000];
  const {state}=learnedState(peaks);
  const r=evaluateGoldenEyeSignal({...state,currentEpisode:{intervention:false}},{isNewPeak:true,seenProfitCents:2100,jumpCents:500});
  assert.equal(r.crossed,3);
  assert.ok(r.extensionProbability>GOLDEN_EYE.maximumExtensionProbability);
  assert.equal(r.signal,false);
  assert.equal(r.reason,'continuation_still_supported');
});

test('an unexecuted Golden Eye signal re-arms immediately instead of censoring the episode',async()=>{
  const settings={systemName:'S',simFeeCents:2,waveStakeCents:20_000,maxPositions:20,maxEntriesPerTrade:1};
  const db={async goldenEyeState(){return null;},async saveGoldenEyeState(){}};
  const ge=new GoldenEye({db,market:{},getSettings:()=>settings});
  ge.initialized=true;
  ge.state={...baseState(),fingerprint:goldenEyeFingerprint(settings),lastSignal:{atMs:2_000},currentEpisode:{startedAtMs:1_000,peakAtMs:2_000,peakProfitCents:900,profitableCountAtPeak:1,openCountAtPeak:1,maxJumpCents:300,samples:4,intervention:false,interventionReason:null,signaled:true}};
  await ge.noteExecution({atMs:2_000,seenProfitCents:900},{closedCount:0,partialCount:0,pendingCount:0,skippedCount:1,errorCount:0,totalProfitCents:0},2_050);
  assert.equal(ge.state.currentEpisode.signaled,false);
  assert.equal(ge.state.currentEpisode.intervention,false);
  assert.equal(ge.state.lastSignal,null);
  assert.equal(ge.state.interventions,0);
});

test('a successful Golden Eye cashout starts the residual portfolio from a clean observation baseline',async()=>{
  const settings={systemName:'S',simFeeCents:2,waveStakeCents:20_000,maxPositions:20,maxEntriesPerTrade:1};
  const db={async goldenEyeState(){return null;},async saveGoldenEyeState(){}};
  const ge=new GoldenEye({db,market:{},getSettings:()=>settings});
  ge.initialized=true;
  ge.state={...baseState(),fingerprint:goldenEyeFingerprint(settings),lastSampleAtMs:2_000,lastSeenProfitCents:900,lastSignal:{atMs:2_000},currentEpisode:{startedAtMs:1_000,peakAtMs:2_000,peakProfitCents:900,profitableCountAtPeak:2,openCountAtPeak:2,maxJumpCents:300,samples:4,intervention:false,interventionReason:null,signaled:true}};
  await ge.noteExecution({atMs:2_000,seenProfitCents:900},{closedCount:1,partialCount:0,pendingCount:0,skippedCount:1,errorCount:0,totalProfitCents:500},2_050);
  assert.equal(ge.state.currentEpisode,null);
  assert.equal(ge.state.lastSeenProfitCents,0);
  assert.equal(ge.state.lastSampleAtMs,0);
  assert.equal(ge.state.interventions,1);
  assert.equal(ge.state.lastExecution.closedCount,1);
});

test('restart sanitizes poisoned future state and re-arms a persisted signal that has no matching execution receipt',async()=>{
  const settings={systemName:'S',simFeeCents:2,waveStakeCents:20_000,maxPositions:20,maxEntriesPerTrade:1};
  const fingerprint=goldenEyeFingerprint(settings);
  const now=Date.now();
  let stored={...baseState(),fingerprint,lastSampleAtMs:now+GOLDEN_EYE.maximumFutureSampleSkewMs+10_000,naturalEpisodes:[{bad:true}]};
  const saved=[];
  const db={async goldenEyeState(){return{state:structuredClone(stored)};},async saveGoldenEyeState(_s,state){saved.push(structuredClone(state));}};
  const ge=new GoldenEye({db,market:{},getSettings:()=>settings});
  await ge.init();
  assert.equal(ge.state.lastSampleAtMs,0);
  assert.equal(ge.state.naturalEpisodes.length,0);

  stored={...baseState(),fingerprint,lastSampleAtMs:now,lastSeenProfitCents:900,lastSignal:{atMs:now},lastExecution:null,currentEpisode:{startedAtMs:now-500,peakAtMs:now,peakProfitCents:900,profitableCountAtPeak:1,openCountAtPeak:1,maxJumpCents:200,samples:4,intervention:false,interventionReason:null,signaled:true}};
  const ge2=new GoldenEye({db,market:{},getSettings:()=>settings});
  await ge2.init();
  assert.equal(ge2.state.currentEpisode.signaled,false,'unexecuted persisted signal must be retryable after restart');
  assert.ok(saved.length>=2);
});

test('sample completeness is false when a potentially profitable Hunter lacks full executable depth',()=>{
  const now=80_000;
  const entry={id:'partial',conceptName:'Wave Surfer',status:'open',ticker:'PART',entryPriceCents:60,count:10,remainingCount:10,entryFeeCents:20};
  const q={yesBid:90,bookInvalid:false};
  const market={getQuote:()=>q,quoteAgeMs:()=>0,bookAgeMs:()=>0,executableBid:()=>({filled:5,full:false,avgCents:90})};
  const ge=new GoldenEye({db:{},market,getSettings:()=>({systemName:'S',simFeeCents:2})});
  const sample=ge.sample([entry],now);
  assert.equal(sample.seenProfitCents,0);
  assert.equal(sample.complete,false);
  assert.equal(sample.observableCount,0);
});

test('R37 FAST-PEAK Golden Eye catalogs a one-observation executable spike after the subsequent natural collapse',()=>{
  let state=baseState();
  state=step(state,1_000,900);
  assert.equal(state.currentEpisode.samples,1);
  const out=advanceGoldenEyeState(state,{atMs:1_100,seenProfitCents:0,profitableCount:0,openCount:1,freshCount:1,fullyExecutableProfitableCount:0,complete:true},fp,1_200);
  assert.ok(out.finalized,'a genuine single-book peak must not be discarded merely because it lasted one observation');
  assert.equal(out.finalized.peakProfitCents,900);
  assert.equal(out.finalized.samples,1);
});

test('R37 FAST-PEAK Golden Eye may fire on the first positive executable sample of a new mature episode instead of waiting for a second quote',()=>{
  let {state,t}=learnedState([700,750,800,820,850,870,900,920]);
  // Establish a complete zero-profit sample so the next quote is a measured
  // jump from zero rather than an unknown continuity-gap origin.
  let zero=advanceGoldenEyeState(state,{atMs:t,seenProfitCents:0,profitableCount:0,openCount:1,freshCount:1,fullyExecutableProfitableCount:0,complete:true},fp,t+50);
  state=zero.state;
  const out=advanceGoldenEyeState(state,{atMs:t+100,seenProfitCents:800,profitableCount:2,openCount:2,freshCount:2,fullyExecutableProfitableCount:2,complete:true},fp,t+150);
  assert.ok(out.signal,'the first executable spike can be the only peak quote available');
  assert.equal(out.signal.seenProfitCents,800);
  assert.equal(out.signal.jumpCents,800);
  assert.equal(out.signal.reason,'catalog_extension_exhaustion');
});



test('R38 manual cashout backfill groups the 13 historical profitable manual exits into 11 human-labeled cash-now episodes totaling $111.99',()=>{
  const rows=[
    [1787599124388,'a','SUR',2160],[1787599124391,'b','RIS',644],[1787599678074,'c','GAR',952],
    [1787599767468,'d','SCH',357],[1787599791536,'e','DEN',310],[1787599989569,'f','MAJ',4],
    [1787600156533,'g','SAM',1490],[1787600179752,'h','HOL',1212],[1787600374418,'i','CHO',552],
    [1787600954124,'j','AKL',327],[1787601631830,'k','BON',1344],[1787601631849,'l','GUE',1315],
    [1787601645409,'m','AND',532],
  ].map(([closedAtMs,id,ticker,pnlCents])=>({id,ticker,conceptName:'Wave Surfer',status:'closed',closeReason:'manual_cashout',closedAtMs,pnlCents}));
  const episodes=buildManualTrainingEpisodes(rows);
  assert.equal(episodes.length,11);
  assert.equal(episodes.reduce((sum,e)=>sum+e.realizedProfitCents,0),11199);
  assert.ok(episodes.every((e)=>e.humanLabeled&&e.source==='manual_cashout'&&e.backfilled));
  assert.equal(episodes[0].profitableCountAtPeak,2,'same manual click is one portfolio-level training label');
});

test('R38 migration preserves GE1-R1 natural learning and automatically imports prior manual cashouts into the collective',async()=>{
  const settings={systemName:'S',simFeeCents:2,waveStakeCents:20_000,maxPositions:20,maxEntriesPerTrade:3};
  const fingerprint=goldenEyeFingerprint(settings);
  const legacy={...baseState(),policyRevision:'GE1-R1',fingerprint,naturalEpisodes:[{startedAtMs:1000,peakAtMs:1100,peakProfitCents:800,profitableCountAtPeak:1,openCountAtPeak:1,maxJumpCents:200,samples:2,intervention:false,signaled:false,endedAtMs:1200,closeReason:'profit_zero'}]};
  const rows=[
    {id:'m1',ticker:'A',conceptName:'Wave Surfer',status:'closed',closeReason:'manual_cashout',closedAtMs:2000,pnlCents:700},
    {id:'m2',ticker:'B',conceptName:'Momentum Hunter',status:'closed',closeReason:'manual_cashout',closedAtMs:2001,pnlCents:500},
  ];
  const saved=[];
  const db={
    async goldenEyeState(){return{state:legacy};},
    async manualCashoutTrainingRows(){return rows;},
    async saveGoldenEyeState(_s,state){saved.push(structuredClone(state));},
  };
  const ge=new GoldenEye({db,market:{},getSettings:()=>settings});
  await ge.init();
  const sum=ge.summary();
  assert.equal(ge.state.policyRevision,'GE1-R2');
  assert.equal(sum.naturalEpisodes,1);
  assert.equal(sum.manualEpisodes,1);
  assert.equal(sum.collectiveEpisodes,2);
  assert.equal(ge.state.manualBackfilledTrades,2);
  assert.equal(ge.state.manualEpisodes[0].realizedProfitCents,1200);
  assert.ok(saved.length>=1);
});

test('R38 runtime manual Cash Out writes an exact human label into the collective while censoring the natural episode',async()=>{
  const settings={systemName:'S',simFeeCents:2,waveStakeCents:20_000,maxPositions:20,maxEntriesPerTrade:3};
  const market={
    getQuote:()=>({yesBid:80,bookInvalid:false}),quoteAgeMs:()=>0,bookAgeMs:()=>0,
    executableBid:(_t,count)=>({filled:count,full:true,avgCents:80}),
  };
  const db={async goldenEyeState(){return null;},async saveGoldenEyeState(){}};
  const ge=new GoldenEye({db,market,getSettings:()=>settings});
  ge.initialized=true;ge.state={...baseState(),fingerprint:goldenEyeFingerprint(settings),lastSampleAtMs:900,lastSeenProfitCents:100};
  const entry={id:'e1',ticker:'T',conceptName:'Wave Surfer',status:'open',entryPriceCents:60,count:10,remainingCount:10,entryFeeCents:20};
  const ctx=await ge.beginManualTraining([entry],1000,{allProfitable:true});
  await ge.completeManualTraining(ctx,{closed:[{id:'e1',ticker:'T',realizedThisActionCents:150}],partial:[],closedCount:1,partialCount:0,pendingCount:0,skippedCount:0,errorCount:0,totalProfitCents:150},1010);
  assert.equal(ge.state.manualEpisodes.length,1);
  assert.equal(ge.state.manualEpisodes[0].realizedProfitCents,150);
  assert.equal(ge.state.manualEpisodes[0].preClickSeenProfitCents,160);
  assert.equal(ge.state.manualEpisodes[0].maxJumpCents,60);
  assert.equal(ge.state.currentEpisode,null);
  assert.equal(ge.summary().collectiveEpisodes,1);
});

test('R38 manual labels participate in Golden Eye signal decisions instead of being telemetry-only',()=>{
  const {state}=learnedState([1400]);
  const before=evaluateGoldenEyeSignal({...state,currentEpisode:{intervention:false}},{isNewPeak:true,seenProfitCents:800,jumpCents:200});
  assert.equal(before.reason,'learning');
  state.manualEpisodes=buildManualTrainingEpisodes(Array.from({length:8},(_,i)=>({
    id:`m${i}`,ticker:`M${i}`,conceptName:'Wave Surfer',status:'closed',closeReason:'manual_cashout',closedAtMs:10_000+i*10_000,pnlCents:760+(i%4)*30,
  })));
  const stats=goldenEyeStats(state);
  assert.equal(stats.naturalEpisodeCount,1);
  assert.equal(stats.manualEpisodeCount,8);
  assert.equal(stats.episodeCount,9);
  const r=evaluateGoldenEyeSignal({...state,currentEpisode:{intervention:false}},{isNewPeak:true,seenProfitCents:800,jumpCents:200});
  assert.equal(r.stats.episodeCount,9);
  assert.ok(r.signal,'human cash-now labels must be able to promote an otherwise-unready state into a learned cash-now decision');
});
test('R37 Golden Eye deterministic 20k-transition stress keeps learning bounded and never signals on a non-peak, incomplete, pre-evidence or below-floor sample',()=>{
  let seed=0x37c0ffee;
  const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/0x100000000;};
  let state=baseState();
  let t=1_000,profit=0,signals=0,completeSamples=0;
  for(let i=0;i<20_000;i++){
    // Repeated natural spike/collapse patterns with occasional incomplete books.
    if(i%37===0)profit=0;
    else if(rand()<0.10)profit=Math.max(0,profit-Math.floor(rand()*1200));
    else profit=Math.max(0,Math.min(6_000,profit+Math.floor(rand()*900)-250));
    const complete=rand()>=0.01;
    const beforeEpisodes=state.naturalEpisodes.length;
    const priorPeak=state.currentEpisode?.peakProfitCents??0;
    const out=advanceGoldenEyeState(state,{atMs:t,seenProfitCents:profit,profitableCount:profit>0?1:0,openCount:1,freshCount:complete?1:0,observableCount:complete?1:0,fullyExecutableProfitableCount:complete&&profit>0?1:0,complete},fp,t+50);
    if(complete)completeSamples++;
    if(out.signal){
      signals++;
      assert.ok(out.signal.seenProfitCents>=GOLDEN_EYE.minimumSignalProfitCents);
      assert.ok(out.signal.catalogEpisodes>=GOLDEN_EYE.minimumNaturalEpisodes);
      assert.ok(out.signal.seenProfitCents>priorPeak||!priorPeak,'signal may occur only on the executable episode high-water update');
    }
    if(!complete){
      assert.equal(out.ignored,'incomplete_market_coverage');
      assert.equal(out.state.naturalEpisodes.length,beforeEpisodes,'incomplete books cannot teach the catalog');
    }
    state=out.state;
    assert.ok(state.naturalEpisodes.length<=GOLDEN_EYE.maximumCatalogEpisodes);
    assert.ok(Number.isFinite(state.lastSeenProfitCents));
    assert.ok(Number.isFinite(state.samples));
    t+=100;
  }
  assert.ok(completeSamples>19_000);
  assert.ok(state.samples>19_000);
  assert.ok(state.naturalEpisodes.length>0);
  assert.ok(signals>0,'stress corpus never exercised Golden Eye signal authority');
});
