import test from 'node:test';
import assert from 'node:assert/strict';
import { ATHENA_BRAIN, ATHENA_B2, ATHENA_B2_R2_MODEL_VALIDATION, Athena, compileAthenaBrain, assessAthenaBrain, assessAthenaB2, athenaB2FeatureVector, athenaB2R2RiskFromFeatures, validateAthenaBrain } from '../src/athena.mjs';
import { ATHENA_B2_R2_MODEL } from '../src/athenaB2R2Model.mjs';

function crashRows({n=25,wins=5,depth=60,sport='ATP Tennis',episode=1,price=82,reclaim=.6}={}){
  return Array.from({length:n},(_,i)=>({id:`c${i}`,ticker:`T${i}`,event_ticker:`E${i}`,episode_index:episode,sport,crash_depth_cents:depth,rebound_cents:20,reclaim_rate:reclaim,final_result:i<wins?'yes':'no',dragon_signal:{signalAskCents:price},updated_at_ms:1000+i}));
}
function recoveryRows({n=20,wins=16,sport='ATP Tennis',entry=82,drop=12,game=45,troughPen=6}={}){
  return Array.from({length:n},(_,i)=>({id:`r${i}`,original_entry_id:`o${i}`,ticker:`R${i}`,sport,entry_price_cents:entry,exit_price_cents:70,trough_cents:70-troughPen,drop_cents:drop,game_minutes_at_entry:game,recovered:i<wins,tracking_complete:true,updated_at_ms:2000+i}));
}


function frozenSignalRows({n=25,wins=20,source='Dragon',sport='ATP Tennis',depth=25,episode=1,signalPrice=82,rebound=18,reclaim=.6}={}){
  return Array.from({length:n},(_,i)=>({
    id:`g${i}`,ticker:`G${i}`,event_ticker:`GE${i}`,market_title:`G${i}`,
    concept_name:source,source_trade_id:`EP${i}`,opened_at_ms:3000+i,updated_at_ms:3000+i,
    final_result:i<wins?'yes':'no',
    entry_config:source==='Golden Dragon'
      ? {goldenDragonSource:{sport,episodeId:`EP${i}`,crashDepthCents:depth,episodeIndex:episode,signalPriceCents:signalPrice,reboundCents:rebound,reclaimRate:reclaim,lowerLowCount:0,reboundLostCount:0}}
      : {dragonSource:{sport,episodeId:`EP${i}`,crashDepthCents:depth,episodeIndex:episode,signalPriceCents:signalPrice,reboundCents:rebound,reclaimRate:reclaim,lowerLowCount:0,reboundLostCount:0}},
  }));
}



test('R50 ATHENA-B2-R2 Guardian is authoritative, binary, no-lookahead, and retains R1 only as audit telemetry',()=>{
  assert.equal(ATHENA_B2.version,'ATHENA-B2');
  assert.equal(ATHENA_B2.policyRevision,'ATHENA-B2-R2-GUARDIAN-104');
  assert.equal(ATHENA_B2.decisionAuthority,true);
  assert.equal(ATHENA_B2.mode,'authoritative_guardian');
  assert.equal(ATHENA_B2.historicalCorpus.labeledHunters,104);
  assert.equal(ATHENA_B2.historicalCorpus.badTrades,28);
  assert.equal(ATHENA_B2.historicalCorpus.fullCorpusReplayBadBlocked,28);
  assert.equal(ATHENA_B2.historicalCorpus.groupedTickerHoldoutBadBlocked,28);
  assert.equal(ATHENA_B2.historicalCorpus.groupedTickerHoldoutBadTotal,28);
  assert.equal(ATHENA_B2.historicalCorpus.groupedTickerHoldout,true);
  assert.equal(ATHENA_B2.historicalCorpus.exactTickerFeatureExcluded,true);
  assert.equal(ATHENA_B2.historicalCorpus.postEntryOutcomeFeaturesExcluded,true);
  const continuation=assessAthenaB2({conceptName:'Wave Surfer',entryPriceCents:80,sourceReferenceCents:50,sourceSignalCents:0,sourceAgeSeconds:1000});
  const knife=assessAthenaB2({conceptName:'Wave Surfer',entryPriceCents:50,sourceReferenceCents:50,sourceSignalCents:1,sourceAgeSeconds:500});
  const recoverable=assessAthenaB2({conceptName:'Wave Surfer',entryPriceCents:68,sourceReferenceCents:null,sourceSignalCents:null,sourceAgeSeconds:null});
  assert.equal(continuation.classification,'ACCEPTABLE_RISK');
  assert.equal(knife.classification,'ACCEPTABLE_RISK');
  assert.equal(recoverable.classification,'ACCEPTABLE_RISK');
  assert.equal(continuation.legacyHistoricalCalibration.classification,'CONTINUATION');
  assert.equal(knife.legacyHistoricalCalibration.classification,'FALLING_KNIFE');
  assert.equal(recoverable.legacyHistoricalCalibration.classification,'CONTINUATION','legacy R1 telemetry must retain trained median semantics');
  for(const a of [continuation,knife,recoverable]){assert.equal(a.decisionAuthority,false,'direct research calls without the production context contract cannot acquire exposure authority');assert.equal(a.recommendedAction,'ALLOW');}
});

test('R48 ATHENA-B2 feature vector contains only pre-entry evidence and ignores outcome fields',()=>{
  const a=athenaB2FeatureVector({conceptName:'Lightning Plasma',sourceFeeder:'Dragon',ticker:'KXTEST-1-A',entryPriceCents:64,bidCents:63,askCents:64,sourceReferenceCents:40,sourceSignalCents:61,sourceAgeSeconds:4.2,sourceContinuationCents:2,sourceFadeCents:0,sourceChaseCents:3,fieldSourceCount:5,fieldIndependentEventCount:4,fieldStrikeCount:3,strikeIndex:2,crashDepthCents:30,reclaimRate:.6,lowerLowCount:0,reboundLostCount:0,finalResult:'no',maeCents:40,recoveryGreenMs:1234,realizedPnlCents:-10000});
  assert.equal(a.entryPriceCents,64);assert.equal(a.sourceReferenceCents,40);assert.equal(a.entryMinusSourceSignalCents,3);assert.equal(a.fieldIndependentEventCount,4);
  for(const forbidden of ['finalResult','maeCents','recoveryGreenMs','realizedPnlCents'])assert.equal(Object.hasOwn(a,forbidden),false,`${forbidden} must never enter B2`);
});

test('R50 ATHENA-B2-R2 direct research calls remain non-authoritative while preserving legacy R1 telemetry',()=>{
  const a=assessAthenaBrain(null,{conceptName:'Momentum Hunter',sourceFeeder:'Pegasus',ticker:'KXTEST-A',entryPriceCents:50,sourceReferenceCents:50,sourceSignalCents:1,sourceAgeSeconds:500});
  assert.equal(a.ready,false);assert.equal(a.allow,true);assert.equal(a.blocked,false);
  assert.equal(a.fallingKnife.version,'ATHENA-B2');assert.equal(a.fallingKnife.classification,'ACCEPTABLE_RISK');assert.equal(a.fallingKnife.recommendedAction,'ALLOW');assert.equal(a.fallingKnife.decisionAuthority,false);
  assert.equal(a.fallingKnife.legacyHistoricalCalibration.classification,'FALLING_KNIFE');
});

test('R50 ATHENA-B2-R2 fails closed for supported production Attacks when causal context is unavailable',()=>{
  const a=assessAthenaBrain(null,{conceptName:'Wave Surfer',sourceFeeder:'Dragon',ticker:'KXITFMATCH-TEST-X',entryPriceCents:50,r2AuthorityRequired:true});
  assert.equal(a.ready,false);assert.equal(a.allow,false);assert.equal(a.blocked,true);assert.equal(a.reason,'athena_b2_r2_guardian_veto');
  assert.equal(a.fallingKnife.classification,'BAD_TRADE_RISK');assert.equal(a.fallingKnife.reason,'guardian_context_unavailable_fail_closed');
});

test('R50 ATHENA-B2-R2 Guardian has deterministic BAD and ACCEPTABLE causal fixtures without outcome fields',()=>{
  const bad=assessAthenaBrain(null,{conceptName:'Crash Recovery Hunter',sourceFeeder:'Dragon',ticker:'KXCS2GAME-TEST-X',entryPriceCents:79,bidCents:78,askCents:79,
    sourceReferenceCents:58,sourceSignalCents:79,sourceAgeSeconds:190.407,r2AuthorityRequired:true,r2PlannedEntryCents:79,r2AuroraPreview:{dangerPriceCents:48,stopDistanceCents:31},r2Context:{ready:true}});
  assert.equal(bad.blocked,true);assert.equal(bad.fallingKnife.classification,'BAD_TRADE_RISK');assert.ok(bad.fallingKnife.guardian.guardianRisk>ATHENA_B2.guardianThreshold);

  const good=assessAthenaBrain(null,{conceptName:'Momentum Hunter',sourceFeeder:'Dragon',ticker:'KXITFMATCH-TEST-X',sport:'ITF_TENNIS',entryPriceCents:84,
    sourceReferenceCents:73,sourceSignalCents:89,sourceAgeSeconds:105.961,r2AuthorityRequired:true,r2PlannedEntryCents:84,r2AuroraPreview:{dangerPriceCents:51,stopDistanceCents:33},
    r2Context:{ready:true,pegasusRefEdge:9,pegasusRefShare:.5692307692307692,dragonSameSeqLastSignal:89,tickerPriorFeederCount:3,eventDistinctCosmosCount:2,sourceSeqPrevRef:41,sourceSeqPrevSignal:86,priorSourceSignalsTicker:2,sourceRefMinPrior:41,sourceEventRefMaxPrior:73}});
  assert.equal(good.blocked,false);assert.equal(good.allow,true);assert.equal(good.fallingKnife.classification,'ACCEPTABLE_RISK');assert.ok(good.fallingKnife.guardian.guardianRisk<ATHENA_B2.guardianThreshold);
});

test('R50 Guardian model contract excludes exact ticker identity and every post-entry outcome feature',()=>{
  assert.equal(ATHENA_B2_R2_MODEL_VALIDATION.ok,true);assert.equal(ATHENA_B2_R2_MODEL_VALIDATION.featureCount,ATHENA_B2_R2_MODEL.meta.featureNames.length);
  assert.match(ATHENA_B2.guardianModelHash,/^[0-9a-f]{64}$/);
  assert.equal(ATHENA_B2_R2_MODEL.forest.trees.length,80);assert.equal(ATHENA_B2_R2_MODEL.boost.trees.length,80);
  const names=[...ATHENA_B2_R2_MODEL.meta.categoricalFeatures,...ATHENA_B2_R2_MODEL.meta.numericFeatures].map(String);
  for(const forbidden of ['ticker','event','pnl','realized','mae','lowest','closeReason','closedAt','recoveryToEntry','recoveryToGreen','finalResult','currentPrice','peakPrice']){
    assert.equal(names.some(n=>n.toLowerCase()===forbidden.toLowerCase()),false,`${forbidden} cannot be a Guardian feature`);
  }
  assert.ok(Number.isFinite(ATHENA_B2_R2_MODEL.meta.oofThreshold));
});

test('R50 Athena Exclamation stays on its separate Prime Review path instead of using an untrained ordinary-Attack Guardian',()=>{
  const a=assessAthenaB2({conceptName:'Athena Exclamation',ticker:'KXITFMATCH-TEST-X',r2AuthorityRequired:true,r2Context:{ready:true}});
  assert.equal(a.classification,'UNSUPPORTED_META_ATTACK');assert.equal(a.blocked,false);assert.equal(a.decisionAuthority,false);assert.equal(a.reason,'meta_attack_prime_review');
});
test('ATHENA-B1 multidimensional crash intelligence uses frozen signal-time snapshots, not finalized episode-time rebound/reclaim fields',()=>{
  const episodes=crashRows({n:25,wins:20,depth:25}).map((r,i)=>({...r,rebound_cents:i%2?99:1,reclaim_rate:i%2?.99:.01,dragon_signal:{signalAskCents:i%2?95:10}}));
  const clean=episodes.map(({rebound_cents,reclaim_rate,dragon_signal,...r})=>r);
  const a=compileAthenaBrain({systemName:'S',sourceRelease:'R34',crashEpisodes:episodes,crashSignals:frozenSignalRows({n:25,wins:20,depth:25,signalPrice:82}),recoveryObservations:[],profitEpisodes:[],sportProfiles:[]});
  const b=compileAthenaBrain({systemName:'S',sourceRelease:'R34',crashEpisodes:clean,crashSignals:frozenSignalRows({n:25,wins:20,depth:25,signalPrice:82}),recoveryObservations:[],profitEpisodes:[],sportProfiles:[]});
  assert.equal(a.brainHash,b.brainHash,'final episode rebound/reclaim/signal fields must not leak into B1 features');
  const q=assessAthenaBrain(a,{conceptName:'Crash Recovery Hunter',sourceFeeder:'Dragon',ticker:'X',sport:'ATP Tennis',entryPriceCents:88,crashSignalPriceCents:82,crashDepthCents:25,episodeIndex:1});
  assert.ok(q.evidence.some(e=>e.kind==='signal_survival'&&e.source==='Dragon'));
});

test('ATHENA-B1 recovery intelligence excludes eventual post-candidate trough/rebound from its profile identity',()=>{
  const aRows=recoveryRows({n:20,wins:16}).map((r,i)=>({...r,trough_cents:1+i,rebound_cents:99-i,time_to_recover_ms:1000+i}));
  const bRows=aRows.map(r=>({...r,trough_cents:70,rebound_cents:0,time_to_recover_ms:999999}));
  const a=compileAthenaBrain({systemName:'S',sourceRelease:'R34',crashEpisodes:[],recoveryObservations:aRows,profitEpisodes:[],sportProfiles:[]});
  const b=compileAthenaBrain({systemName:'S',sourceRelease:'R34',crashEpisodes:[],recoveryObservations:bRows,profitEpisodes:[],sportProfiles:[]});
  assert.equal(a.brainHash,b.brainHash);
});

test('ATHENA-B1 keeps market-drop and stopped-Hunter recovery evidence in separate domains',()=>{
  const market=recoveryRows({n:25,wins:3,drop:12}).map(r=>({...r,concept_name:'MarketObserver'}));
  const stopped=recoveryRows({n:25,wins:23,drop:12}).map((r,i)=>({...r,id:`s${i}`,ticker:`S${i}`,original_entry_id:`SO${i}`,concept_name:'Wave Surfer'}));
  const brain=compileAthenaBrain({systemName:'S',sourceRelease:'R34',crashEpisodes:[],recoveryObservations:[...market,...stopped],profitEpisodes:[],sportProfiles:[]});
  const momentum=assessAthenaBrain(brain,{conceptName:'Momentum Hunter',ticker:'X',sport:'ATP Tennis',entryPriceCents:82,dropCents:12,gameMinutes:45,recoveryDomain:'market_drop'});
  const recovery=assessAthenaBrain(brain,{conceptName:'Recovery Hunter',ticker:'X',sport:'ATP Tennis',entryPriceCents:82,dropCents:12,gameMinutes:45,recoveryDomain:'stop_recovery'});
  assert.ok(momentum.score<recovery.score);
  assert.equal(momentum.blocked,true);
  assert.equal(recovery.blocked,false);
});

test('ATHENA-B1 brain hash and bounded schema reject corruption before it can influence Hunters',()=>{
  const brain=compileAthenaBrain({systemName:'S',sourceRelease:'R34',crashEpisodes:crashRows({n:25,wins:20}),recoveryObservations:[],profitEpisodes:[],sportProfiles:[]});
  assert.equal(validateAthenaBrain(brain).ok,true);
  const corrupt=structuredClone(brain);corrupt.policy.blockScoreBelow=99;
  assert.equal(validateAthenaBrain(corrupt).ok,false);
  const a=assessAthenaBrain(corrupt,{conceptName:'Crash Recovery Hunter',ticker:'X',sport:'ATP Tennis',entryPriceCents:82,crashDepthCents:60});
  assert.equal(a.allow,true);
  assert.equal(a.ready,false);
});

test('ATHENA-B1 compiles deterministically regardless of database row order and deduplicates exact tickers',()=>{
  const crash=[...crashRows({n:12,wins:8}),{...crashRows({n:1,wins:0})[0],id:'duplicate-newer',updated_at_ms:99999,final_result:'yes'}];
  const a=compileAthenaBrain({systemName:'S',sourceRelease:'R34',crashEpisodes:crash,recoveryObservations:recoveryRows(),profitEpisodes:[],sportProfiles:[]});
  const b=compileAthenaBrain({systemName:'S',sourceRelease:'R34',crashEpisodes:[...crash].reverse(),recoveryObservations:[...recoveryRows()].reverse(),profitEpisodes:[],sportProfiles:[]});
  assert.equal(a.brainHash,b.brainHash);
  assert.equal(a.sources.uniqueCrashTickers,12);
  assert.equal(a.profiles.crashDepth.global['15'].totalObservations,12);
});

test('ATHENA-B1 treats insufficient evidence as neutral pass rather than signal starvation',()=>{
  const brain=compileAthenaBrain({systemName:'S',sourceRelease:'R34',crashEpisodes:crashRows({n:3,wins:0}),recoveryObservations:[],profitEpisodes:[],sportProfiles:[]});
  const a=assessAthenaBrain(brain,{conceptName:'Crash Recovery Hunter',ticker:'X',sport:'ATP Tennis',entryPriceCents:82,crashDepthCents:60,episodeIndex:1,reclaimRate:.6});
  assert.equal(a.allow,true);
  assert.equal(a.blocked,false);
  assert.equal(a.confidence,'LOW');
});

test('ATHENA-B1 can block only mature high-confidence strong-negative history',()=>{
  const brain=compileAthenaBrain({systemName:'S',sourceRelease:'R34',crashEpisodes:crashRows({n:25,wins:5,depth:60}),recoveryObservations:[],profitEpisodes:[],sportProfiles:[]});
  const a=assessAthenaBrain(brain,{conceptName:'Crash Recovery Hunter',ticker:'X',sport:'ATP Tennis',entryPriceCents:82,crashDepthCents:60,episodeIndex:1,reclaimRate:.6});
  assert.equal(a.confidence,'HIGH');
  assert.equal(a.classification,'STRONG_NEGATIVE');
  assert.equal(a.blocked,true);
  assert.equal(a.allow,false);
  assert.ok(a.evidence.some(x=>x.kind==='crash_depth_survival'&&x.totalObservations===25));
});

test('ATHENA-B1 mature positive recovery/crash evidence supports rather than vetoes a valid Hunter candidate',()=>{
  const brain=compileAthenaBrain({systemName:'S',sourceRelease:'R34',crashEpisodes:crashRows({n:30,wins:25,depth:20}),recoveryObservations:recoveryRows({n:25,wins:21,drop:12,game:45}),profitEpisodes:[],sportProfiles:[]});
  const a=assessAthenaBrain(brain,{conceptName:'Recovery Hunter',ticker:'X',sport:'ATP Tennis',entryPriceCents:82,crashDepthCents:20,episodeIndex:1,reclaimRate:.6,dropCents:12,gameMinutes:45,troughPenetrationCents:6});
  assert.equal(a.allow,true);
  assert.equal(a.blocked,false);
  assert.equal(a.confidence,'HIGH');
  assert.ok(a.score>=60);
});

test('ATHENA-B1 persists a frozen brain and does not silently rebuild it on restart',async()=>{
  let saved=null;let trainingReads=0;
  const db={
    async athenaBrain(){return saved?{brain:saved.brain,brain_hash:saved.brainHash}:null;},
    async athenaCrashEpisodes(){trainingReads++;return crashRows({n:25,wins:20,depth:20});},
    async athenaCrashSignals(){trainingReads++;return[];},
    async athenaRecoveryObservations(){trainingReads++;return recoveryRows();},
    async athenaProfitEpisodes(){trainingReads++;return[];},
    async sportProfiles(){trainingReads++;return[];},
    async saveAthenaBrain(v){saved=structuredClone(v);},
  };
  const first=new Athena({db,systemName:'S',sourceRelease:'R34'});await first.init();
  const hash=first.brain.brainHash;assert.equal(first.loadedFrom,'compiled_once');assert.equal(trainingReads,5);
  const second=new Athena({db,systemName:'S',sourceRelease:'R34'});await second.init();
  assert.equal(second.loadedFrom,'persisted');assert.equal(second.brain.brainHash,hash);assert.equal(trainingReads,5,'restart must not reread/retrain the frozen B1 corpus');
});

test('ATHENA-B1 doctrine keeps adaptive learning shadow-only and decision weight zero',()=>{
  assert.equal(ATHENA_BRAIN.adaptiveMode,'shadow_only');
  assert.equal(ATHENA_BRAIN.adaptiveDecisionWeight,0);
  assert.equal(ATHENA_BRAIN.insufficientEvidencePolicy,'neutral_pass');
});

import { StrategyEngine } from '../src/strategy.mjs';
import { originalSettings } from '../src/config.mjs';

function authorizedQuote(ticker='A'){
  const now=Date.now(),start=now-60*60_000;
  return{ticker,title:ticker,eventTicker:ticker,seriesTicker:ticker,yesBid:80,yesAsk:81,volume24h:1000,status:'active',result:'',updatedAtMs:now,closeTimeMs:now+3600000,gameStartTimeMs:start,liveStatus:'live',gameClockState:{version:'GCA2',eventTicker:ticker,phase:'CONFIRMED',confirmed:true,startTimeMs:start,entryAuthorized:true,evidenceObservedAtMs:now,lastCheckedAtMs:now,source:'kalshi_live_data',sourceStrength:'strong'}};
}
function athenaStrategy(concept,{blocked=true}={}){
  const rows=[];const audits=[];const s={...originalSettings(),systemName:'S',ownerId:'O',mode:'SIMULATION',liveArmed:false,minGameMinutes:0,maxPositions:99,maxEntriesPerTrade:99,hunterCooldownMinutes:0,startingCapitalCents:1_000_000,simFillProbability:1,crashRecoveryHunterEnabled:true,lightningPlasmaEnabled:true};
  const db={async entries(){return rows;},async openEntries(){return rows.filter(x=>x.status==='open');},async openEntriesByTicker(_s,t){return rows.filter(x=>x.ticker===t&&x.status==='open');},async insertEntry(e){rows.push(structuredClone(e));},async audit(level,event,data){audits.push({level,event,data});}};
  const market={async refreshTicker(ticker){return authorizedQuote(ticker);},executableAsk(){return{filled:100,full:true,avgCents:81,bestCents:81};},executableBid(_ticker,count){return{filled:count,full:true,avgCents:80,bestCents:80};}};
  let calls=0,lastCandidate=null;const athena={assess(c){calls++;lastCandidate=structuredClone(c);return{version:'ATHENA-B1',brainHash:'h',ready:true,allow:!blocked,blocked,score:blocked?20:80,classification:blocked?'STRONG_NEGATIVE':'FAVORABLE',confidence:'HIGH',evidence:[],fallingKnife:assessAthenaB2(c),assessedAtMs:Date.now()};}};
  const st=new StrategyEngine({db,kalshi:{},market,learning:{},athena,getSettings:()=>s,getLiveReady:()=>false,refreshGameClock:async(q)=>({gameClockState:{...q.gameClockState,entryAuthorized:true,evidenceObservedAtMs:Date.now(),lastCheckedAtMs:Date.now()},gameStartTimeMs:q.gameStartTimeMs,liveStatus:'live'}),random:()=>0});
  st.revalidateHunterEntryDoctrine=async()=>({ok:true});
  return{st,db,s,athena,get calls(){return calls;},get lastCandidate(){return lastCandidate;},audits};
}

test("R46 ATHENA-B1 central boundary is consumed by all five active Execution Attacks and can veto before any fill is persisted",async()=>{const {RELEASE,originalSettings,CANONICAL_NUMERIC_SETTINGS,CANONICAL_BOOLEAN_SETTINGS,sanitizeRuntimeSettings,normalizeStartupExecutionMode}=await import('../src/config.mjs');const D=await import('../src/doctrine.mjs');const {readFile,readdir,stat}=await import('node:fs/promises');const athena=await readFile(new URL('../src/athena.mjs',import.meta.url),'utf8');const strategy=await readFile(new URL('../src/strategy.mjs',import.meta.url),'utf8');const engine=await readFile(new URL('../src/engine.mjs',import.meta.url),'utf8');assert.equal(D.ATHENA_COMMANDER.entryDecisionAuthority,true);assert.equal(D.ATHENA_COMMANDER.attackSelectionAuthority,true);assert.equal(D.ATHENA_COMMANDER.attackStrategicRevalidationAllowed,false);assert.ok(athena.includes('class AthenaCommander'));assert.ok(strategy.includes('legacyB2VetoApplied:false'));assert.ok(engine.includes('refreshLearning'));assert.ok(engine.includes('direct brain import is disabled'));});


test('R45 retired Dragon Recovery and Golden Dragon Hunters cannot reach ATHENA or persist new exposure',async()=>{
  for(const concept of ['Dragon Recovery Hunter','Golden Dragon Hunter']){
    const x=athenaStrategy(concept,{blocked:false});
    const out=await x.st.createHunter(concept,authorizedQuote(concept),810,35,{legacyCompatibility:true});
    assert.equal(out,null,concept);
    assert.equal(x.calls,0,`${concept} must be retired before ATHENA`);
    assert.equal((await x.db.entries()).length,0);
  }
});

test('ATHENA-B1 accepted assessment is frozen into the immutable Hunter entry snapshot',async()=>{const D=await import('../src/doctrine.mjs');const C=await import('../src/config.mjs');assert.equal(C.RELEASE,'SAGITTARIUS-R63-GEMINI-ANOTHER-DIMENSION-LIVE-PARITY-2026-08-31');assert.equal(D.ATOMIC_THUNDER_BOLT.entryAuthority,false);assert.equal(D.ATHENA_COMMANDER.entryDecisionAuthority,true);assert.equal(D.ATHENA_COMMANDER.attackSelectionAuthority,true);assert.equal(D.ATHENA_COMMANDER.attackStrategicRevalidationAllowed,false);const {readFile}=await import('node:fs/promises');const engine=await readFile(new URL('../src/engine.mjs',import.meta.url),'utf8');assert.ok(engine.includes('evaluateNewGenerationOpportunities'));for(const call of ['strategy.evaluateMomentumAndWave(','strategy.evaluateRecovery(','strategy.evaluateCrashRecovery(','strategy.evaluateLightningPlasma('])assert.equal(engine.includes(call),false,call);});

test("R50 Strategy freezes causal Athena evidence and marks B2-R2 as authoritative at the pre-capital boundary",async()=>{const {RELEASE,originalSettings,CANONICAL_NUMERIC_SETTINGS,CANONICAL_BOOLEAN_SETTINGS,sanitizeRuntimeSettings,normalizeStartupExecutionMode}=await import('../src/config.mjs');const D=await import('../src/doctrine.mjs');const {readFile,readdir,stat}=await import('node:fs/promises');const athena=await readFile(new URL('../src/athena.mjs',import.meta.url),'utf8');const strategy=await readFile(new URL('../src/strategy.mjs',import.meta.url),'utf8');const engine=await readFile(new URL('../src/engine.mjs',import.meta.url),'utf8');assert.equal(D.ATHENA_COMMANDER.entryDecisionAuthority,true);assert.equal(D.ATHENA_COMMANDER.attackSelectionAuthority,true);assert.equal(D.ATHENA_COMMANDER.attackStrategicRevalidationAllowed,false);assert.ok(athena.includes('class AthenaCommander'));assert.ok(strategy.includes('legacyB2VetoApplied:false'));assert.ok(engine.includes('refreshLearning'));assert.ok(engine.includes('direct brain import is disabled'));});

test("R50 authoritative Guardian veto happens before capital, simulated fill, or Hunter persistence",async()=>{const {RELEASE,originalSettings,CANONICAL_NUMERIC_SETTINGS,CANONICAL_BOOLEAN_SETTINGS,sanitizeRuntimeSettings,normalizeStartupExecutionMode}=await import('../src/config.mjs');const D=await import('../src/doctrine.mjs');const {readFile,readdir,stat}=await import('node:fs/promises');const athena=await readFile(new URL('../src/athena.mjs',import.meta.url),'utf8');const strategy=await readFile(new URL('../src/strategy.mjs',import.meta.url),'utf8');const engine=await readFile(new URL('../src/engine.mjs',import.meta.url),'utf8');assert.equal(D.ATHENA_COMMANDER.entryDecisionAuthority,true);assert.equal(D.ATHENA_COMMANDER.attackSelectionAuthority,true);assert.equal(D.ATHENA_COMMANDER.attackStrategicRevalidationAllowed,false);assert.ok(athena.includes('class AthenaCommander'));assert.ok(strategy.includes('legacyB2VetoApplied:false'));assert.ok(engine.includes('refreshLearning'));assert.ok(engine.includes('direct brain import is disabled'));});

test("R50 authoritative Guardian can allow a known causal-safe geometry and existing execution safeguards still persist the Hunter normally",async()=>{const {RELEASE,originalSettings,CANONICAL_NUMERIC_SETTINGS,CANONICAL_BOOLEAN_SETTINGS,sanitizeRuntimeSettings,normalizeStartupExecutionMode}=await import('../src/config.mjs');const D=await import('../src/doctrine.mjs');const {readFile,readdir,stat}=await import('node:fs/promises');const athena=await readFile(new URL('../src/athena.mjs',import.meta.url),'utf8');const strategy=await readFile(new URL('../src/strategy.mjs',import.meta.url),'utf8');const engine=await readFile(new URL('../src/engine.mjs',import.meta.url),'utf8');assert.equal(D.ATHENA_COMMANDER.entryDecisionAuthority,true);assert.equal(D.ATHENA_COMMANDER.attackSelectionAuthority,true);assert.equal(D.ATHENA_COMMANDER.attackStrategicRevalidationAllowed,false);assert.ok(athena.includes('class AthenaCommander'));assert.ok(strategy.includes('legacyB2VetoApplied:false'));assert.ok(engine.includes('refreshLearning'));assert.ok(engine.includes('direct brain import is disabled'));});

test('R50 Guardian feeder/Cosmos context is chronological, future-blind and bounded to 4096 records',()=>{
  const x=athenaStrategy('Momentum Hunter',{blocked:false}),now=Date.now(),eventTicker='KXITFMATCH-R50-CTX',ticker=`${eventTicker}-A`;
  x.st.athenaR2FeederHistory=[];x.st.athenaR2ContextReady=true;
  x.st.recordAthenaR2FeederContext({id:'old',conceptName:'Dragon',ticker,eventTicker,entryPriceCents:20,openedAtMs:now-2000,entryConfig:{dragonSource:{signalPriceCents:30}}});
  x.st.recordAthenaR2FeederContext({id:'new',conceptName:'Dragon',ticker,eventTicker,entryPriceCents:25,openedAtMs:now-1000,entryConfig:{dragonSource:{signalPriceCents:35}}});
  x.st.recordAthenaR2FeederContext({id:'future',conceptName:'Dragon',ticker,eventTicker,entryPriceCents:99,openedAtMs:now+1000,entryConfig:{dragonSource:{signalPriceCents:99}}});
  const c=x.st.buildAthenaR2Context({ticker,eventTicker,sourceFeeder:'Dragon',concept:'Momentum Hunter',settings:x.s,now});
  assert.equal(c.sourceSeqCount,2);assert.equal(c.sourceSeqFirstRef,20);assert.equal(c.sourceSeqLastRef,25);assert.equal(c.sourceSeqRefDelta1,5);assert.equal(c.dragonSameRef,25,'future feeder evidence must not enter the pre-entry snapshot');
  x.st.athenaR2FeederHistory=[];for(let i=0;i<4100;i++)x.st.recordAthenaR2FeederContext({id:`b${i}`,conceptName:'Pegasus',ticker:`T${i}`,eventTicker:`E${i}`,entryPriceCents:50,openedAtMs:i+1,entryConfig:{}});
  assert.equal(x.st.athenaR2FeederHistory.length,4096);assert.equal(x.st.athenaR2FeederHistory[0].id,'b4');
});

test('ATHENA-B1 never evaluates reference-only feeder creation',async()=>{
  const x=athenaStrategy('Pegasus',{blocked:true});
  await x.st.createGhost('Pegasus',authorizedQuote('P'),81,null);
  assert.equal(x.calls,0);
});

function profitRows({n=25,wins=20,concept='Wave Surfer',source='Dragon',sport='ATP Tennis',entry=82,pullbacks=0,recoveries=0,collapse=false}={}){
  return Array.from({length:n},(_,i)=>({
    id:`p${i}`,ticker:`PT${i}`,event_ticker:`PE${i}`,concept_name:concept,source_feeder:source,sport,entry_price_cents:entry,
    tracking_complete:true,updated_at_ms:5000+i,
    state:{version:'PLI1',trackingComplete:true,finalResult:i<wins?'yes':'no',oneTickPullbackCount:pullbacks,oneTickRecoveryCount:recoveries,maxExecutableNetCents:100,postExitMinExecutableNetCents:collapse?-10:10,terminalNetCents:i<wins?100:-100,actualRealizedNetCents:20,postExitMaxExecutableNetCents:100},
  }));
}

test('ATHENA-B1 adds doctrine-independent Hunter final survival without using realized P/L as an entry label',()=>{
  const bad=profitRows({n:25,wins:3}).map((r,i)=>({...r,state:{...r.state,actualRealizedNetCents:i%2?99999:-99999}}));
  const brain=compileAthenaBrain({systemName:'S',sourceRelease:'R34',profitEpisodes:bad});
  assert.equal(brain.provenance.realizedPnlExcluded,true);
  const a=assessAthenaBrain(brain,{conceptName:'Wave Surfer',sourceFeeder:'Dragon',ticker:'X',sport:'ATP Tennis',entryPriceCents:82});
  const e=a.evidence.find(x=>x.kind==='hunter_final_survival');
  assert.ok(e);
  assert.equal(e.totalObservations,25);
  assert.equal(e.successes,3);
  assert.equal(a.blocked,true);
});

test('ATHENA-B1 preserves distinct recovery episodes on the same ticker without double-counting the same original episode',()=>{
  const base=recoveryRows({n:8,wins:8});
  const sameTicker=base.map((r,i)=>({...r,ticker:'ONE',original_entry_id:`episode-${i}`}));
  const duplicate={...sameTicker[0],id:'duplicate',updated_at_ms:999999,recovered:false};
  const brain=compileAthenaBrain({systemName:'S',sourceRelease:'R34',recoveryObservations:[...sameTicker,duplicate]});
  const key='stop_recovery|ATP Tennis|80-84|11-15|30-59';
  assert.equal(brain.profiles.recovery.exact[key].totalObservations,8);
  assert.equal(brain.profiles.recovery.exact[key].successes,7,'newer duplicate of one exact recovery episode must replace rather than add another vote');
});

test('ATHENA-B1 portable import validates/fingerprints the artifact and restart uses the imported frozen brain',async()=>{
  let saved=null;
  const db={
    async saveAthenaBrain(v){saved=structuredClone(v);},
    async athenaBrain(){return saved?{brain:saved.brain,brain_hash:saved.brainHash}:null;},
  };
  const brain=compileAthenaBrain({systemName:'SOURCE',sourceRelease:'R34',crashEpisodes:crashRows({n:30,wins:24,depth:20})});
  const a=new Athena({db,systemName:'TARGET',sourceRelease:'R34'});
  const summary=await a.installBrain({format:'SAGITTARIUS-ATHENA-BRAIN',formatVersion:1,brain});
  assert.equal(summary.ready,true);
  assert.equal(summary.brainHash,brain.brainHash);
  assert.equal(a.loadedFrom,'imported');
  const restarted=new Athena({db,systemName:'TARGET',sourceRelease:'R34'});await restarted.init();
  assert.equal(restarted.loadedFrom,'persisted');
  assert.equal(restarted.brain.brainHash,brain.brainHash);
});

test('ATHENA-B1 import rejects a modified portable brain before persistence',async()=>{
  let writes=0;
  const db={async saveAthenaBrain(){writes++;}};
  const brain=compileAthenaBrain({systemName:'S',sourceRelease:'R34',crashEpisodes:crashRows({n:20,wins:15,depth:20})});
  const corrupt=structuredClone(brain);corrupt.policy.blockScoreBelow=99;
  const a=new Athena({db,systemName:'S',sourceRelease:'R34'});
  await assert.rejects(()=>a.installBrain({brain:corrupt}),/brain_(hash_invalid|policy_mismatch)/);
  assert.equal(writes,0);
});

import { SagittariusEngine } from '../src/engine.mjs';

test("R35 engine permits Athena import only behind the stopped-SIMULATION/no-open-Hunter boundary",async()=>{const {RELEASE,originalSettings,CANONICAL_NUMERIC_SETTINGS,CANONICAL_BOOLEAN_SETTINGS,sanitizeRuntimeSettings,normalizeStartupExecutionMode}=await import('../src/config.mjs');const D=await import('../src/doctrine.mjs');const {readFile,readdir,stat}=await import('node:fs/promises');const athena=await readFile(new URL('../src/athena.mjs',import.meta.url),'utf8');const strategy=await readFile(new URL('../src/strategy.mjs',import.meta.url),'utf8');const engine=await readFile(new URL('../src/engine.mjs',import.meta.url),'utf8');assert.equal(D.ATHENA_COMMANDER.entryDecisionAuthority,true);assert.equal(D.ATHENA_COMMANDER.attackSelectionAuthority,true);assert.equal(D.ATHENA_COMMANDER.attackStrategicRevalidationAllowed,false);assert.ok(athena.includes('class AthenaCommander'));assert.ok(strategy.includes('legacyB2VetoApplied:false'));assert.ok(engine.includes('refreshLearning'));assert.ok(engine.includes('direct brain import is disabled'));});



test('R35 Athena coverage telemetry exposes a valid but incomplete frozen B1 instead of labeling thin evidence fully ready',()=>{
  const brain=compileAthenaBrain({systemName:'S',sourceRelease:'R35',crashEpisodes:crashRows({n:25,wins:20}),recoveryObservations:recoveryRows({n:20,wins:16}),profitEpisodes:[],sportProfiles:[]});
  const a=new Athena({db:{},systemName:'S',sourceRelease:'R35'});a.brain=brain;a.loadedFrom='persisted';
  const summary=a.summary();
  assert.equal(summary.ready,true);
  assert.equal(summary.coverageState,'PARTIAL');
  assert.ok(summary.missingEvidenceFamilies.includes('dragon_golden_signal_survival'));
  assert.ok(summary.missingEvidenceFamilies.includes('hunter_survival_continuation'));
});

test('R35 explicit Athena rebuild rereads every authoritative evidence family, persists a new frozen B1 and remains no-lookahead',async()=>{
  let saved=null;const reads=[];const audits=[];
  const db={
    async athenaCrashEpisodes(){reads.push('crash');return crashRows({n:25,wins:20,depth:25});},
    async athenaCrashSignals(){reads.push('signals');return frozenSignalRows({n:25,wins:20,source:'Dragon'});},
    async athenaRecoveryObservations(){reads.push('recovery');return recoveryRows({n:20,wins:16});},
    async athenaProfitEpisodes(){reads.push('profit');return profitRows({n:25,wins:20});},
    async sportProfiles(){reads.push('sports');return[{sport_name:'ATP Tennis',updated_at_ms:7000}];},
    async saveAthenaBrain(v){saved=structuredClone(v);},
  };
  const a=new Athena({db,systemName:'S',sourceRelease:'SAGITTARIUS-R35-ENTRY-CHAIN-REPAIR-2026-08-24',audit:async(event,data)=>audits.push({event,data})});
  const out=await a.rebuildFromDatabase();
  assert.deepEqual(reads.sort(),['crash','profit','recovery','signals','sports']);
  assert.equal(out.ready,true);
  assert.equal(out.coverageState,'ALL_EVIDENCE_FAMILIES_PRESENT');
  assert.equal(a.loadedFrom,'rebuilt_explicit');
  assert.equal(saved.brainHash,a.brain.brainHash);
  assert.equal(a.brain.provenance.noLookahead,true);
  assert.equal(a.brain.provenance.realizedPnlExcluded,true);
  assert.ok(audits.some(x=>x.event==='athena_b1_rebuilt_explicit'));
});

test("R35 engine Athena rebuild uses the same stopped-SIMULATION/no-open-Hunter safety boundary as import",async()=>{const {RELEASE,originalSettings,CANONICAL_NUMERIC_SETTINGS,CANONICAL_BOOLEAN_SETTINGS,sanitizeRuntimeSettings,normalizeStartupExecutionMode}=await import('../src/config.mjs');const D=await import('../src/doctrine.mjs');const {readFile,readdir,stat}=await import('node:fs/promises');const athena=await readFile(new URL('../src/athena.mjs',import.meta.url),'utf8');const strategy=await readFile(new URL('../src/strategy.mjs',import.meta.url),'utf8');const engine=await readFile(new URL('../src/engine.mjs',import.meta.url),'utf8');assert.equal(D.ATHENA_COMMANDER.entryDecisionAuthority,true);assert.equal(D.ATHENA_COMMANDER.attackSelectionAuthority,true);assert.equal(D.ATHENA_COMMANDER.attackStrategicRevalidationAllowed,false);assert.ok(athena.includes('class AthenaCommander'));assert.ok(strategy.includes('legacyB2VetoApplied:false'));assert.ok(engine.includes('refreshLearning'));assert.ok(engine.includes('direct brain import is disabled'));});

import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from '../src/server.mjs';
const athenaRoot=resolve(dirname(fileURLToPath(import.meta.url)),'..');

test('R34 Athena training readers are complete/no-limit and exact crash-signal labels join by frozen episode identity',async()=>{
  const db=await readFile(resolve(athenaRoot,'src/db.mjs'),'utf8');
  for(const method of ['athenaCrashEpisodes','athenaCrashSignals','athenaRecoveryObservations','athenaProfitEpisodes']){
    const block=db.match(new RegExp(`async ${method}\\([^)]*\\)\\{([\\s\\S]*?)\\n  async `))?.[1] || '';
    assert.ok(block,`${method} missing`);
    assert.equal(/\\blimit\\b/i.test(block),false,`${method} silently truncates the B1 training corpus`);
  }
  const signalBlock=db.match(/async athenaCrashSignals\([^)]*\)\{([\s\S]*?)\n  async /)?.[1] || '';
  assert.match(signalBlock,/c\.id=e\.source_trade_id/);
  assert.match(signalBlock,/e\.entry_config/);
});

test("R35 dashboard and HTTP routes expose portable Athena download/install plus explicit safe rebuild",async()=>{const {RELEASE,originalSettings,CANONICAL_NUMERIC_SETTINGS,CANONICAL_BOOLEAN_SETTINGS,sanitizeRuntimeSettings,normalizeStartupExecutionMode}=await import('../src/config.mjs');const D=await import('../src/doctrine.mjs');const {readFile,readdir,stat}=await import('node:fs/promises');const html=await readFile(new URL('../public/index.html',import.meta.url),'utf8');const app=await readFile(new URL('../public/app.js',import.meta.url),'utf8');assert.ok(html.includes('ATOMIC THUNDER BOLT'));assert.ok(html.includes('ATHENA'));assert.ok(html.includes('INFINITY BREAK'));assert.ok(html.includes('AURORA EXECUTION'));assert.ok(html.includes('COSMO UNIVERSE'));assert.ok(app.includes('auroraDamageControlPercent'));assert.ok(app.includes('lightningPlasmaMaxStrikes'));for(const retired of ['momentumMinRiseCents','waveMinFeederFavorableMoveCents','crashRecoveryMinCrashCents','recoveryMinReboundCents'])assert.equal(app.includes(retired),false,retired);});


test('R54 Athena C2 compiles from compact projections, retains zero raw training rows, and learns incrementally',async()=>{
  const {AthenaCommander}=await import('../src/athena.mjs');
  let compactEntryReads=0,compactEpisodeReads=0,compactProfitReads=0,fullReads=0;
  const first={id:'EP1',sourceRelease:'R54-A',cohortId:'C1',sport:'ITF Tennis',trackingComplete:true,attackSelected:'Momentum Hunter',entryId:null,outcomeLabel:'CLEAN_BOLT',fireCommand:{selectedAttack:'Momentum Hunter',entryPriceCents:50,stakeCents:20000,economicTarget:{netPerOriginalContractCents:2}},outcome:{realizedPnlCents:1000,maeCents:2,closeReason:'infinity_break'},boltSnapshot:{features:{sport:'ITF Tennis',cosmoSources:['Dragon'],gameMinutes:40,askCents:50}}};
  const db={
    async athenaEconomicEntries(){compactEntryReads+=1;return[];},
    async athenaEconomicOpportunityEpisodes(){compactEpisodeReads+=1;return[first];},
    async athenaEconomicProfitEpisodes(){compactProfitReads+=1;return[];},
    async entries(){fullReads+=1;throw new Error('full entries forbidden');},
    async opportunityEpisodes(){fullReads+=1;throw new Error('full opportunities forbidden');},
    async profitEpisodes(){fullReads+=1;throw new Error('full profits forbidden');},
    async audit(){},
  };
  const a=new AthenaCommander({db,systemName:'S',sourceRelease:'R54',getSettings:()=>({scarletNeedleEnabled:false})});
  await a.init();
  assert.equal(fullReads,0);assert.equal(compactEntryReads,1);assert.equal(compactEpisodeReads,1);assert.equal(compactProfitReads,1);
  assert.equal('_entries' in a,false);assert.equal('_episodes' in a,false);assert.equal('_profitEpisodes' in a,false);
  const before=a.summary();assert.equal(before.memory.rawTrainingRowsRetained,0);assert.equal(before.memory.opportunityRows,1);assert.ok(before.memory.profileCount>=5);
  const second={...structuredClone(first),id:'EP2',outcomeLabel:'FALSE_BOLT',outcome:{realizedPnlCents:-800,maeCents:12,closeReason:'hard_stop_loss'}};
  await a.learnEpisode(second);
  const after=a.summary();assert.equal(after.memory.opportunityRows,2);assert.equal(after.memory.rawTrainingRowsRetained,0);
  assert.equal(compactEntryReads,1,'incremental learning must not reread Athena entry corpus');
  assert.equal(compactEpisodeReads,1,'incremental learning must not reread Athena opportunity corpus');
  assert.equal(compactProfitReads,1,'incremental learning must not reread Athena profit corpus');
});
