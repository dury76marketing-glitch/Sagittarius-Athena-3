import test from 'node:test';
import assert from 'node:assert/strict';
import { ATHENA_BRAIN, Athena, compileAthenaBrain, assessAthenaBrain, validateAthenaBrain } from '../src/athena.mjs';

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
  const now=Date.now(),start=now-60_000;
  return{ticker,title:ticker,eventTicker:ticker,seriesTicker:ticker,yesBid:80,yesAsk:81,volume24h:1000,status:'active',result:'',updatedAtMs:now,closeTimeMs:now+3600000,gameStartTimeMs:start,liveStatus:'live',gameClockState:{version:'GCA2',eventTicker:ticker,phase:'CONFIRMED',confirmed:true,startTimeMs:start,entryAuthorized:true,evidenceObservedAtMs:now,lastCheckedAtMs:now,source:'kalshi_live_data',sourceStrength:'strong'}};
}
function athenaStrategy(concept,{blocked=true}={}){
  const rows=[];const audits=[];const s={...originalSettings(),systemName:'S',ownerId:'O',mode:'SIMULATION',liveArmed:false,minGameMinutes:0,maxPositions:99,maxEntriesPerTrade:99,hunterCooldownMinutes:0,startingCapitalCents:1_000_000,simFillProbability:1,crashRecoveryHunterEnabled:true,dragonRecoveryHunterEnabled:true,goldenDragonHunterEnabled:true};
  const db={async entries(){return rows;},async openEntries(){return rows.filter(x=>x.status==='open');},async openEntriesByTicker(_s,t){return rows.filter(x=>x.ticker===t&&x.status==='open');},async insertEntry(e){rows.push(structuredClone(e));},async audit(level,event,data){audits.push({level,event,data});}};
  const market={async refreshTicker(ticker){return authorizedQuote(ticker);},executableAsk(){return{filled:100,full:true,avgCents:81,bestCents:81};}};
  let calls=0;const athena={assess(c){calls++;return{version:'ATHENA-B1',brainHash:'h',ready:true,allow:!blocked,blocked,score:blocked?20:80,classification:blocked?'STRONG_NEGATIVE':'FAVORABLE',confidence:'HIGH',evidence:[],assessedAtMs:Date.now()};}};
  const st=new StrategyEngine({db,kalshi:{},market,learning:{},athena,getSettings:()=>s,getLiveReady:()=>false,refreshGameClock:async(q)=>({gameClockState:{...q.gameClockState,entryAuthorized:true,evidenceObservedAtMs:Date.now(),lastCheckedAtMs:Date.now()},gameStartTimeMs:q.gameStartTimeMs,liveStatus:'live'}),random:()=>0});
  st.revalidateHunterEntryDoctrine=async()=>({ok:true});
  return{st,db,s,athena,get calls(){return calls;},audits};
}

test('ATHENA-B1 central boundary is consumed by all six real Hunter concepts and can veto before any fill is persisted',async()=>{
  for(const concept of ['Momentum Hunter','Wave Surfer','Recovery Hunter','Crash Recovery Hunter','Dragon Recovery Hunter','Golden Dragon Hunter']){
    const x=athenaStrategy(concept,{blocked:true});
    const q=authorizedQuote(concept);
    const out=await x.st.createHunter(concept,q,810,35,{});
    assert.equal(out,null,concept);
    assert.equal(x.calls,1,`${concept} did not query Athena exactly once`);
    assert.equal(x.db.entries? (await x.db.entries()).length : -1,0,`${concept} persisted exposure after Athena veto`);
    assert.ok(x.audits.some(a=>a.event==='athena_candidate_assessment'&&a.data.blocked===true));
  }
});

test('ATHENA-B1 accepted assessment is frozen into the immutable Hunter entry snapshot',async()=>{
  const x=athenaStrategy('Momentum Hunter',{blocked:false});
  const e=await x.st.createHunter('Momentum Hunter',authorizedQuote('M'),810,35,{});
  assert.ok(e);
  assert.equal(e.entryConfig.athena.version,'ATHENA-B1');
  assert.equal(e.entryConfig.athena.brainHash,'h');
  assert.equal(e.entryConfig.athena.classification,'FAVORABLE');
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

test('R35 engine permits Athena import only behind the stopped-SIMULATION/no-open-Hunter boundary',async()=>{
  const brain=compileAthenaBrain({systemName:'SOURCE',sourceRelease:'R34',crashEpisodes:crashRows({n:20,wins:15,depth:20})});
  let installs=0;
  const base={settings:{mode:'SIMULATION',liveArmed:false,engineActive:false,systemName:'S'},db:{async openEntries(){return[];}},athena:{async installBrain(){installs++;return{brainHash:brain.brainHash};}},assertAthenaMutationSafe:SagittariusEngine.prototype.assertAthenaMutationSafe};
  const ok=await SagittariusEngine.prototype.installAthenaBrain.call(base,{brain});
  assert.equal(ok.ok,true);assert.equal(installs,1);
  await assert.rejects(()=>SagittariusEngine.prototype.installAthenaBrain.call({...base,settings:{...base.settings,engineActive:true}},{brain}),/Stop the engine/);
  await assert.rejects(()=>SagittariusEngine.prototype.installAthenaBrain.call({...base,settings:{...base.settings,mode:'LIVE'}},{brain}),/only in SIMULATION/);
  const active={...base,db:{async openEntries(){return[{conceptName:'Wave Surfer',status:'open'}];}}};
  await assert.rejects(()=>SagittariusEngine.prototype.installAthenaBrain.call(active,{brain}),/Close all active real Hunters/);
});



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

test('R35 engine Athena rebuild uses the same stopped-SIMULATION/no-open-Hunter safety boundary as import',async()=>{
  let rebuilds=0;
  const make=(settings={mode:'SIMULATION',liveArmed:false,engineActive:false,systemName:'S'},active=[])=>({
    settings,db:{async openEntries(){return active;}},
    athena:{async rebuildFromDatabase(){rebuilds++;return{ready:true,brainHash:'rebuilt'};}},
    assertAthenaMutationSafe:SagittariusEngine.prototype.assertAthenaMutationSafe,
  });
  const ok=await SagittariusEngine.prototype.rebuildAthenaBrain.call(make());
  assert.equal(ok.ok,true);assert.equal(rebuilds,1);
  await assert.rejects(()=>SagittariusEngine.prototype.rebuildAthenaBrain.call(make({mode:'SIMULATION',liveArmed:false,engineActive:true,systemName:'S'})),/Stop the engine/);
  await assert.rejects(()=>SagittariusEngine.prototype.rebuildAthenaBrain.call(make({mode:'LIVE',liveArmed:false,engineActive:false,systemName:'S'})),/only in SIMULATION/);
  await assert.rejects(()=>SagittariusEngine.prototype.rebuildAthenaBrain.call(make(undefined,[{conceptName:'Wave Surfer',status:'open'}])),/Close all active real Hunters/);
});

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

test('R35 dashboard and HTTP routes expose portable Athena download/install plus explicit safe rebuild',async()=>{
  const html=await readFile(resolve(athenaRoot,'public/index.html'),'utf8');
  const app=await readFile(resolve(athenaRoot,'public/app.js'),'utf8');
  assert.ok(html.includes('/api/athena/download'));
  assert.ok(html.includes('athenaFileInput'));
  assert.ok(app.includes("post('/api/athena/install'"));
  assert.ok(html.includes('athenaRebuildBtn'));
  assert.ok(app.includes("post('/api/athena/rebuild'"));
  const brain=compileAthenaBrain({systemName:'S',sourceRelease:'R34',crashEpisodes:crashRows({n:20,wins:15,depth:20})});
  let installed=null;
  let rebuilt=0;
  const engine={athenaBrainDocument(){return{format:'SAGITTARIUS-ATHENA-BRAIN',formatVersion:1,brain};},async installAthenaBrain(v){installed=v;return{ok:true,athena:{brainHash:brain.brainHash}};},async rebuildAthenaBrain(){rebuilt++;return{ok:true,athena:{brainHash:'rebuilt',coverageState:'PARTIAL'}};},health:{degraded:false}};
  const runtime={engine,boot:{status:'ready'}};
  const server=startServer(runtime,0,athenaRoot);await new Promise(r=>server.once('listening',r));
  try{
    const port=server.address().port;
    const dl=await fetch(`http://127.0.0.1:${port}/api/athena/download`);assert.equal(dl.status,200);assert.match(dl.headers.get('content-disposition')||'',/ATHENA-B1/);const doc=await dl.json();assert.equal(doc.brain.brainHash,brain.brainHash);
    const up=await fetch(`http://127.0.0.1:${port}/api/athena/install`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(doc)});assert.equal(up.status,200);assert.equal((await up.json()).athena.brainHash,brain.brainHash);assert.equal(installed.brain.brainHash,brain.brainHash);
    const rb=await fetch(`http://127.0.0.1:${port}/api/athena/rebuild`,{method:'POST'});assert.equal(rb.status,200);assert.equal((await rb.json()).athena.brainHash,'rebuilt');assert.equal(rebuilt,1);
  }finally{await new Promise(r=>server.close(r));}
});
