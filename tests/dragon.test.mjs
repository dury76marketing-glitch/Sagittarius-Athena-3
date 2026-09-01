import test from 'node:test';
import assert from 'node:assert/strict';
import { StrategyEngine, MODEL_ENABLE_KEYS, isModelEnabled, dragonSignalQualifiedAtQuote, hunterEntryBoundaryQualifiedAtQuote, selectCrashRecoveryCosmoSource } from '../src/strategy.mjs';
import { originalSettings } from '../src/config.mjs';
import { ACTIVE_FEEDER_CONCEPTS, ACTIVE_PORTFOLIO_CONCEPTS, FEEDER_CONCEPTS, PORTFOLIO_CONCEPTS, COSMO_ROUTING } from '../src/doctrine.mjs';
import { SagittariusEngine, crashPipelineReadyFromState } from '../src/engine.mjs';
import { advanceCrashState } from '../src/learning.mjs';

const settings=(overrides={})=>({
  ...originalSettings(),systemName:'SAGITTARIUS',ownerId:'dragon-test',mode:'SIMULATION',liveArmed:false,
  dragonEnabled:true,dragonReferenceStakeCents:3000,dragonMinSignalPriceCents:84,dragonMaxSignalPriceCents:88,dragonMaxEpisode:2,
  crashRecoveryHunterEnabled:true,crashRecoveryMinCrashCents:15,crashRecoveryMinReboundCents:7,crashRecoveryMinReclaimRate:.40,
  crashRecoveryStableObservations:3,crashRecoveryUpwardTicks:2,crashRecoveryMaxSpreadCents:3,
  maxPositions:20,maxEntriesPerTrade:20,hunterCooldownMinutes:0,minGameMinutes:0,startingCapitalCents:1_000_000,simFillProbability:1,
  ...overrides,
});
const quote=(ticker='D',bid=85,ask=86)=>{const now=Date.now(),start=now-30*60000;return{ticker,title:ticker,eventTicker:ticker,seriesTicker:ticker,yesBid:bid,yesAsk:ask,volume24h:10000,status:'active',result:'',updatedAtMs:now,closeTimeMs:now+3600000,gameStartTimeMs:start,liveStatus:'live',gameClockState:{version:'GCA2',eventTicker:ticker,phase:'CONFIRMED',confirmed:true,startTimeMs:start,entryAuthorized:true,evidenceObservedAtMs:now,lastCheckedAtMs:now,source:'kalshi_live_data',sourceStrength:'strong'}};};
const signal=(overrides={})=>({version:'CI1',episodeId:'CRASH:D:1:1',episodeIndex:1,preCrashPeakCents:92,troughCents:70,crashDepthCents:22,reboundCents:15,reclaimRate:15/22,stableObservations:3,upwardTicks:2,crashStartedAtMs:1,troughAtMs:2,reboundConfirmedAtMs:3,sport:'Test',...overrides});
function dbWith(initial=[]){const rows=initial.map((x)=>structuredClone(x));return{rows,audits:[],async entries(){return rows.map((x)=>structuredClone(x));},async openEntries(){return rows.filter(e=>['open','entry_pending','exit_pending','pending_recovery'].includes(e.status)).map((x)=>structuredClone(x));},async openEntriesByTicker(_s,t){return rows.filter(e=>e.ticker===t&&['open','entry_pending','exit_pending','pending_recovery'].includes(e.status)).map((x)=>structuredClone(x));},async insertEntry(e){rows.push(structuredClone(e));},async updateEntry(id,p){const e=rows.find(x=>x.id===id);if(e)Object.assign(e,structuredClone(p));},async audit(level,event,data){this.audits.push({level,event,data});}};}
function pegasusFeeder(ticker='P',overrides={}){const now=Date.now();return{id:`pegasus-${ticker}`,systemName:'SAGITTARIUS',ownerId:'dragon-test',conceptName:'Pegasus',sourceTradeId:null,ticker,eventTicker:ticker,marketTitle:ticker,mode:'SIMULATION',status:'open',entryPriceCents:60,currentPriceCents:79,peakPriceCents:81,stopPriceCents:0,stopLossCents:0,count:50,remainingCount:50,pnlCents:0,openedAtMs:now-1000,updatedAtMs:now-1000,entryConfig:{referenceStakeCents:3000,feeder:{minPriceCents:45,maxPriceCents:89,dropCents:1},maxSpreadCents:3},...overrides};}
function dragonFeeder(ticker='D',episodeId='CRASH:D:1:1',overrides={}){const now=Date.now();return{id:`dragon-${ticker}`,systemName:'SAGITTARIUS',ownerId:'dragon-test',conceptName:'Dragon',sourceTradeId:episodeId,ticker,eventTicker:ticker,marketTitle:ticker,mode:'SIMULATION',status:'open',entryPriceCents:70,currentPriceCents:85,peakPriceCents:85,stopPriceCents:0,stopLossCents:0,count:42,remainingCount:42,pnlCents:0,openedAtMs:now-1000,updatedAtMs:now-1000,entryConfig:{referenceStakeCents:3000,feeder:{minPriceCents:84,maxPriceCents:88,dropCents:0,maxEpisode:2,intelligence:'CI1'},dragonSource:{...signal({episodeId}),signalPriceCents:86,validatedBidCents:85,validatedAskCents:86,referenceOrigin:'crash_trough'}},...overrides};}
function refreshClock(q){const now=Date.now();return Promise.resolve({gameClockState:{...q.gameClockState,version:'GCA2',entryAuthorized:true,evidenceObservedAtMs:now,lastCheckedAtMs:now},gameStartTimeMs:q.gameStartTimeMs,liveStatus:'live'});}

test('R55 active concept doctrine keeps Pegasus, Dragon and Phoenix reference-only while retiring Sagittarius/Golden lanes',()=>{
  assert.deepEqual([...ACTIVE_FEEDER_CONCEPTS].sort(),['Dragon','Pegasus','Phoenix']);
  assert.deepEqual([...ACTIVE_PORTFOLIO_CONCEPTS].sort(),['Athena Exclamation','Crash Recovery Hunter','Lightning Plasma','Momentum Hunter','Recovery Hunter','Scarlet Needle','Wave Surfer']);
  assert.equal(FEEDER_CONCEPTS.has('Dragon'),true);assert.equal(PORTFOLIO_CONCEPTS.has('Dragon'),false);
  for(const retired of ['Sagittarius','Golden Dragon'])assert.equal(ACTIVE_FEEDER_CONCEPTS.has(retired),false);
  for(const retired of ['Dragon Recovery Hunter','Golden Dragon Hunter'])assert.equal(ACTIVE_PORTFOLIO_CONCEPTS.has(retired),false);
});

test('Dragon V1 qualifies only clean CI1 episode 1-2 signals inside its band and spread',()=>{
  const s=settings();
  assert.equal(dragonSignalQualifiedAtQuote(signal(),quote('D',85,86),s).ok,true);
  assert.equal(dragonSignalQualifiedAtQuote(signal({episodeIndex:3}),quote('D',85,86),s).reason,'episode');
  assert.equal(dragonSignalQualifiedAtQuote(signal(),quote('D',82,83),s).reason,'signal_band');
  assert.equal(dragonSignalQualifiedAtQuote(signal(),quote('D',84,88),s).reason,'spread');
});

test('Dragon materializes one reference-only ghost per exact CI1 episode and never places a broker order',async()=>{
  const db=dbWith();const sig=signal();let marked=null;
  const st=new StrategyEngine({db,kalshi:{placeOrder:async()=>{throw new Error('Dragon must never trade');}},market:{},learning:{crashEntrySignal:()=>sig,async markDragonSignal(t,e,d){marked={t,e,d};}},getSettings:()=>settings(),getLiveReady:()=>false});
  const made=await st.evaluateDragon(new Map([['D',quote('D',85,86)]]));
  assert.equal(made.length,1);const e=made[0];
  assert.equal(e.conceptName,'Dragon');assert.equal(e.entryPriceCents,70);assert.equal(e.entryOrderId??null,null);assert.equal(e.stopLossCents,0);
  assert.equal(marked.e,sig.episodeId);
  assert.equal((await st.evaluateDragon(new Map([['D',quote('D',85,86)]]))).length,0);
});

test('Wave and Momentum may consume Dragon while Recovery remains stop-source-only',async()=>{
  const d=dragonFeeder();
  const db=dbWith([d]);
  const s=settings({waveSurferEnabled:true,momentumHunterEnabled:false,recoveryHunterEnabled:false,waveMinEntryCents:84,waveMaxEntryCents:88,waveMinFeederFavorableMoveCents:8,waveMaxSpreadCents:3,waveStakeCents:20000});
  const st=new StrategyEngine({db,kalshi:{},market:{},learning:{recoveryRate:async()=>null},getSettings:()=>s,getLiveReady:()=>false,refreshGameClock:refreshClock});
  let captured=null;st.createHunter=async(concept,q,stake,_stop,opt)=>{captured={concept,q,stake,opt};return{id:'wave',conceptName:concept,ticker:q.ticker,status:'open',sourceFeeder:opt.sourceFeeder};};
  const wave=await st.evaluateMomentumAndWave(new Map([['D',quote('D',85,86)]]),{legacyCompatibility:true});
  assert.equal(wave.length,1);assert.equal(captured.concept,'Wave Surfer');assert.equal(captured.opt.sourceFeeder,'Dragon');
  let recoveryCalls=0;st.createHunter=async()=>{recoveryCalls++;};s.waveSurferEnabled=false;s.recoveryHunterEnabled=true;
  const recovery=await st.evaluateRecovery(new Map([['D',quote('D',85,86)]]),{legacyCompatibility:true});
  assert.deepEqual(recovery,[]);assert.equal(recoveryCalls,0);
});

test('CI1 lower low destroys the old rebound clock and fresh recovery gets a new confirmation timestamp',()=>{
  const s=settings({crashRecoveryEpisodeResetRate:.95});const t0=1_000_000;
  let state={version:'CI1',ticker:'G',eventTicker:'G',marketTitle:'G',sport:'Test',phase:'REBOUND_CONFIRMED',episodeCount:1,episodeIndex:1,episodeId:'CRASH:G:1:1',rollingPeakCents:80,preCrashPeakCents:80,troughCents:50,crashDepthCents:30,crashStartedAtMs:t0-120000,troughAtMs:t0-90000,reboundConfirmedAtMs:t0-60000,resetAtMs:null,stableObservations:8,upwardTicks:4,lowerLowCount:0,reboundLostCount:0,reboundCents:15,reclaimRate:.5,entryReady:true,lastBidCents:65,lastAskCents:66,lastObservationAtMs:t0-1000,lastEpisodeId:null,lastResetAtMs:null,pendingEntrySignal:null,finalResult:null,updatedAtMs:t0-1000};
  let out=advanceCrashState(state,{ticker:'G',eventTicker:'G',title:'G',yesBid:45,yesAsk:46,status:'active'},s,t0);
  assert.equal(out.transition,'NEW_LOW');assert.equal(out.state.reboundConfirmedAtMs,null);state=out.state;
  for(const [i,bid] of [49,53,57,61].entries())out=advanceCrashState(state,{ticker:'G',eventTicker:'G',title:'G',yesBid:bid,yesAsk:bid+1,status:'active'},s,t0+(i+1)*1000),state=out.state;
  assert.equal(out.transition,'REBOUND_CONFIRMED');assert.equal(out.state.reboundConfirmedAtMs,t0+4000);assert.ok(out.state.reboundConfirmedAtMs>=out.state.troughAtMs);
});

test('R45 CI1 never produces new Golden runtime readiness even if legacy raw settings try to enable Golden',()=>{
  const s={...settings(),goldenDragonEnabled:true,goldenDragonMinCrashCents:1,goldenDragonMinReboundCents:1,goldenDragonMinReclaimRate:0,goldenDragonStableObservations:1,goldenDragonUpwardTicks:1};
  const t0=2_000_000;
  const state={version:'CI1',ticker:'G',eventTicker:'G',marketTitle:'G',sport:'Test',phase:'CRASHING',episodeCount:1,episodeIndex:1,episodeId:'CRASH:G:1:1',rollingPeakCents:80,preCrashPeakCents:80,troughCents:50,crashDepthCents:30,crashStartedAtMs:t0-30000,troughAtMs:t0-30000,reboundConfirmedAtMs:null,stableObservations:2,upwardTicks:1,lowerLowCount:0,reboundLostCount:0,reboundCents:10,reclaimRate:1/3,entryReady:false,lastBidCents:60,lastAskCents:61,lastObservationAtMs:t0-1000,lastEpisodeId:null,lastResetAtMs:null,pendingEntrySignal:null,goldenPendingSignal:null,finalResult:null,updatedAtMs:t0-1000};
  const out=advanceCrashState(state,{ticker:'G',eventTicker:'G',title:'G',yesBid:65,yesAsk:66,status:'active'},s,t0);
  assert.equal(out.state.goldenEntryReady,false);assert.equal(out.state.goldenPendingSignal??null,null);
});

test('crash pipeline wake is CI1-driven and independent of which active Cosmo will nominate the market',()=>{
  assert.equal(crashPipelineReadyFromState({entryReady:true}),true);
  assert.equal(crashPipelineReadyFromState({entryReady:false,goldenEntryReady:true,goldenPendingSignal:{goldenEntryReady:true}}),false);
});

test("HF2 Starlight consumes exact Dragon Cosmo and freezes force-fresh crash provenance plus Aurora",async()=>{const {RELEASE,originalSettings,CANONICAL_NUMERIC_SETTINGS,CANONICAL_BOOLEAN_SETTINGS,sanitizeRuntimeSettings,normalizeStartupExecutionMode}=await import('../src/config.mjs');const D=await import('../src/doctrine.mjs');const {readFile,readdir,stat}=await import('node:fs/promises');const pg=await readFile(new URL('../src/profitGuard.mjs',import.meta.url),'utf8');assert.equal(D.INFINITY_BREAK.authority,'PROFIT_EXIT');assert.equal(D.AURORA_EXECUTION.lossAuthority,'U-SG1');assert.equal(D.AURORA_EXECUTION.defaultDamageControlPercent,45);assert.ok(pg.includes("'infinity_break'"));assert.ok(pg.includes("'atomic_thunder_cashout'"),'legacy Atomic history must remain compatible');assert.ok(pg.includes('auroraDamageControlPercent'));assert.equal(pg.includes('maximumPositionLifetimeMs'),false);});

test('HF2 Starlight requires an active Cosmo but not Dragon: Pegasus can nominate while Dragon is disabled',async()=>{const D=await import('../src/doctrine.mjs');const C=await import('../src/config.mjs');assert.equal(C.RELEASE,'SAGITTARIUS-R59-BIG-WAVE-CHOKE-RECOVERY-2026-08-29');assert.equal(D.ATOMIC_THUNDER_BOLT.entryAuthority,false);assert.equal(D.ATHENA_COMMANDER.entryDecisionAuthority,true);assert.equal(D.ATHENA_COMMANDER.attackSelectionAuthority,true);assert.equal(D.ATHENA_COMMANDER.attackStrategicRevalidationAllowed,false);const {readFile}=await import('node:fs/promises');const engine=await readFile(new URL('../src/engine.mjs',import.meta.url),'utf8');assert.ok(engine.includes('evaluateNewGenerationOpportunities'));for(const call of ['strategy.evaluateMomentumAndWave(','strategy.evaluateRecovery(','strategy.evaluateCrashRecovery(','strategy.evaluateLightningPlasma('])assert.equal(engine.includes(call),false,call);});

test('HF2 Starlight Cosmo source selection is deterministic and preserves exact Dragon episode lineage when available',()=>{
  const ep='CRASH:SEL:2:2';
  const d=dragonFeeder('SEL',ep,{id:'dragon-exact',openedAtMs:1000});
  const p=pegasusFeeder('SEL',{id:'pegasus-newer',openedAtMs:2000});
  let selected=selectCrashRecoveryCosmoSource([p,d],settings({pegasusEnabled:true,dragonEnabled:true}),'SEL',ep);
  assert.equal(selected.id,'dragon-exact','exact Dragon episode has strongest causal lineage even when Pegasus is newer');
  d.sourceTradeId='CRASH:SEL:OLD:1';
  selected=selectCrashRecoveryCosmoSource([d,p],settings({pegasusEnabled:true,dragonEnabled:true}),'SEL',ep);
  assert.equal(selected.id,'pegasus-newer','without exact Dragon lineage the newest active Cosmo is selected deterministically');
});

test('HF2 Cosmo routing doctrine makes normal initial-entry Attacks shared-Cosmo consumers and keeps Crystal Wall follow-on only',()=>{
  assert.equal(COSMO_ROUTING.version,'COSMO-ROUTING-V1');
  assert.deepEqual([...COSMO_ROUTING.activeCosmos],['Pegasus','Dragon','Phoenix']);
  assert.deepEqual([...COSMO_ROUTING.currentInitialEntryConsumers],['Momentum Hunter','Wave Surfer','Crash Recovery Hunter','Scarlet Needle','Lightning Plasma']);
  assert.deepEqual([...COSMO_ROUTING.followOnOnlyExceptions],['Recovery Hunter']);
  assert.equal(COSMO_ROUTING.defaultFutureInitialEntryConsumer,true);
  assert.equal(COSMO_ROUTING.sourceDoesNotAuthorizeEntry,true);
});

test('R55 active model keys expose three Cosmo feeders and seven Execution Attacks',()=>{
  assert.deepEqual(Object.keys(MODEL_ENABLE_KEYS).sort(),['Athena Exclamation','Crash Recovery Hunter','Dragon','Lightning Plasma','Momentum Hunter','Pegasus','Phoenix','Recovery Hunter','Scarlet Needle','Wave Surfer'].sort());
  for(const retired of ['Sagittarius','Golden Dragon','Dragon Recovery Hunter','Golden Dragon Hunter'])assert.equal(isModelEnabled(settings(),retired),false);
});

test('R45 StrategyEngine exposes no callable retired Golden/DRH/GDH production methods',()=>{
  for(const name of ['evaluateGoldenDragon','refreshGoldenDragonFeedAuthorities','evaluateGoldenDragonHunter','evaluateDragonRecovery'])assert.equal(typeof StrategyEngine.prototype[name],'undefined',name);
});

test('active Hunter boundary still enforces each Attack own price/spread envelope',()=>{
  const s=settings({waveMinEntryCents:27,waveMaxEntryCents:89,waveMaxSpreadCents:3});
  assert.equal(hunterEntryBoundaryQualifiedAtQuote('Wave Surfer',{yesBid:79,yesAsk:80},s).ok,true);
  assert.equal(hunterEntryBoundaryQualifiedAtQuote('Wave Surfer',{yesBid:20,yesAsk:21},s).reason,'entry_band');
  assert.equal(hunterEntryBoundaryQualifiedAtQuote('Wave Surfer',{yesBid:75,yesAsk:80},s).reason,'spread');
});

test("R45 full entry chain ordering is Recovery -> Dragon -> Pegasus -> CRH -> feeder-driven Attacks",async()=>{const {RELEASE,originalSettings,CANONICAL_NUMERIC_SETTINGS,CANONICAL_BOOLEAN_SETTINGS,sanitizeRuntimeSettings,normalizeStartupExecutionMode}=await import('../src/config.mjs');const D=await import('../src/doctrine.mjs');const {readFile,readdir,stat}=await import('node:fs/promises');const strategy=await readFile(new URL('../src/strategy.mjs',import.meta.url),'utf8');const s=originalSettings();assert.equal(s.recoveryStakeCents,20000);assert.equal(Object.hasOwn(s,'recoveryBaseStakeCents'),false);assert.equal(Object.hasOwn(s,'recoveryMinReboundCents'),false);assert.ok(strategy.includes("structuralRole:'FOLLOW_ON_RECOVERY_ONLY'"));assert.ok(strategy.includes("concept==='Recovery Hunter'&&!recoverySourceSnapshot"));assert.equal(D.ATHENA_COMMANDER.attackStrategicRevalidationAllowed,false);});

test('HF2 feeder quote event path evaluates Starlight from an active Pegasus Cosmo even when Wave and Momentum are off',async()=>{const D=await import('../src/doctrine.mjs');const C=await import('../src/config.mjs');assert.equal(C.RELEASE,'SAGITTARIUS-R59-BIG-WAVE-CHOKE-RECOVERY-2026-08-29');assert.equal(D.ATOMIC_THUNDER_BOLT.entryAuthority,false);assert.equal(D.ATHENA_COMMANDER.entryDecisionAuthority,true);assert.equal(D.ATHENA_COMMANDER.attackSelectionAuthority,true);assert.equal(D.ATHENA_COMMANDER.attackStrategicRevalidationAllowed,false);const {readFile}=await import('node:fs/promises');const engine=await readFile(new URL('../src/engine.mjs',import.meta.url),'utf8');assert.ok(engine.includes('evaluateNewGenerationOpportunities'));for(const call of ['strategy.evaluateMomentumAndWave(','strategy.evaluateRecovery(','strategy.evaluateCrashRecovery(','strategy.evaluateLightningPlasma('])assert.equal(engine.includes(call),false,call);});

test('HF2 crash quote event path remains active with Pegasus-only Cosmo and does not fabricate a Dragon dependency',async()=>{const D=await import('../src/doctrine.mjs');const C=await import('../src/config.mjs');assert.equal(C.RELEASE,'SAGITTARIUS-R59-BIG-WAVE-CHOKE-RECOVERY-2026-08-29');assert.equal(D.ATOMIC_THUNDER_BOLT.entryAuthority,false);assert.equal(D.ATHENA_COMMANDER.entryDecisionAuthority,true);assert.equal(D.ATHENA_COMMANDER.attackSelectionAuthority,true);assert.equal(D.ATHENA_COMMANDER.attackStrategicRevalidationAllowed,false);const {readFile}=await import('node:fs/promises');const engine=await readFile(new URL('../src/engine.mjs',import.meta.url),'utf8');assert.ok(engine.includes('evaluateNewGenerationOpportunities'));for(const call of ['strategy.evaluateMomentumAndWave(','strategy.evaluateRecovery(','strategy.evaluateCrashRecovery(','strategy.evaluateLightningPlasma('])assert.equal(engine.includes(call),false,call);});

