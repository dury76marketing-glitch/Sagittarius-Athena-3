import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import { originalSettings, sanitizeRuntimeSettings, CANONICAL_NUMERIC_SETTINGS, CANONICAL_BOOLEAN_SETTINGS, RELEASE } from '../src/config.mjs';
import {
  COSMO_SHADOW_TRADING,
  ATOMIC_THUNDER_BOLT,
  ATOMIC_THUNDER_PATTERN_GUARDIAN,
  ARAYASHIKI,
  ATHENA_COMMANDER,
  INFINITY_BREAK,
  AURORA_EXECUTION,
  GEMINI_UNIVERSE,
  ANOTHER_DIMENSION,
  SAGITTARIUS_JUSTICE_ARROW,
  ATHENA_EXIT_INTELLIGENCE,
  SHADOW_ATTACK_CONCEPTS,
  FEEDER_CONCEPTS,
  PORTFOLIO_CONCEPTS,
  calculateAuroraSnapshotFromFeeModel,
} from '../src/doctrine.mjs';
import { cosmoGreenSources, atomicThunderBoltFeatures, atomicThunderBoltDecision, AtomicThunderBoltEngine } from '../src/opportunity.mjs';
import { AthenaCommander } from '../src/athena.mjs';
import { examineArayashikiSurvival } from '../src/arayashiki.mjs';
import { validateAthenaFireCommand, anotherDimensionQualification, StrategyEngine } from '../src/strategy.mjs';
import { verifyAthenaFireCommandHash } from '../src/authority.mjs';
import { ENTRY_ADMISSION_CONTROL, entryChainAdmissionDecision, SagittariusEngine } from '../src/engine.mjs';
import { ProfitGuard } from '../src/profitGuard.mjs';

function settings(overrides={}){
  return {
    ...originalSettings(),systemName:'SAGITTARIUS',ownerId:'r60-test',mode:'SIMULATION',liveArmed:false,engineActive:true,
    simFillProbability:1,simFeeCents:2,startingCapitalCents:1_000_000,maxPositions:20,maxEntriesPerTrade:20,hunterCooldownMinutes:0,
    minGameMinutes:20,maxGameMinutes:70,maxSpreadCents:3,atomicThunderGreenTriggerCents:1,infinityBreakMinNetPerOriginalContractCents:1,
    momentumHunterEnabled:true,momentumStakeCents:20_000,momentumMinEntryCents:35,momentumMaxEntryCents:89,
    waveSurferEnabled:true,waveStakeCents:20_000,waveMinEntryCents:35,waveMaxEntryCents:89,
    recoveryHunterEnabled:false,crashRecoveryHunterEnabled:false,scarletNeedleEnabled:false,athenaExclamationEnabled:false,lightningPlasmaEnabled:false,
    pegasusEnabled:true,dragonEnabled:true,phoenixEnabled:true,
    ...overrides,
  };
}
function quote(ticker='T',bid=55,ask=56,now=Date.now()){
  const start=now-30*60_000;
  return {ticker,eventTicker:ticker,title:ticker,sport:'Tennis',yesBid:bid,yesAsk:ask,volume24h:10_000,status:'active',result:'',updatedAtMs:now,closeTimeMs:now+60*60_000,gameStartTimeMs:start,liveStatus:'live',gameClockState:{version:'GCA2',eventTicker:ticker,phase:'CONFIRMED',confirmed:true,entryAuthorized:true,startTimeMs:start,source:'test',sourceStrength:'strong',evidenceObservedAtMs:now,lastCheckedAtMs:now}};
}
function shadow({id='shadow-1',ticker='T',conceptName='Pegasus',entryPriceCents=54,openedAtMs=Date.now()-10_000,feederState={}}={}){
  return {id,systemName:'SAGITTARIUS',ownerId:'r60-test',conceptName,ticker,eventTicker:ticker,status:'open',entryPriceCents,openedAtMs,updatedAtMs:openedAtMs,feederState,entryConfig:{shadowTrade:{version:COSMO_SHADOW_TRADING.version,brokerOrderAuthority:false,portfolioCapitalAuthority:false,entryPriceCents,openedAtMs}}};
}
function memoryDb(initial=[]){
  const rows=new Map(initial.map(x=>[String(x.id),structuredClone(x)])),episodes=new Map(),audits=[];
  return {
    rows,episodes,audits,
    async entries(){return [...rows.values()].map(x=>structuredClone(x));},
    async athenaEconomicEntries(){return [...rows.values()].filter(x=>!['Pegasus','Dragon','Phoenix'].includes(x.conceptName)).map(x=>structuredClone(x));},
    async opportunityEpisodes(){return [...episodes.values()].map(x=>structuredClone(x));},
    async athenaEconomicOpportunityEpisodes(){return [...episodes.values()].filter(x=>x.trackingComplete===true).map(x=>structuredClone(x));},
    async profitEpisodes(){return[];},async athenaEconomicProfitEpisodes(){return[];},
    async entryById(id){const x=rows.get(String(id));return x?structuredClone(x):null;},
    async entriesByConcept(_systemName,conceptName,{limit=200}={}){return [...rows.values()].filter(x=>x.conceptName===conceptName).sort((a,b)=>Number(b.openedAtMs||0)-Number(a.openedAtMs||0)).slice(0,limit).map(x=>structuredClone(x));},
    async entryByConceptSourceTradeId(_systemName,conceptName,sourceTradeId){const x=[...rows.values()].filter(e=>e.conceptName===conceptName&&String(e.sourceTradeId||'')===String(sourceTradeId||'')&&!e.archived).sort((a,b)=>Number(b.openedAtMs||0)-Number(a.openedAtMs||0))[0];return x?structuredClone(x):null;},
    async insertEntry(e){rows.set(String(e.id),structuredClone(e));return structuredClone(e);},
    async updateEntry(id,p){const x=rows.get(String(id));if(!x)throw new Error('row missing');Object.assign(x,structuredClone(p));return structuredClone(x);},
    async openEntries(){return [...rows.values()].filter(x=>['open','entry_pending','exit_pending','pending_recovery'].includes(x.status)).map(x=>structuredClone(x));},
    async openEntriesByTicker(_s,t){return [...rows.values()].filter(x=>x.ticker===t&&['open','entry_pending','exit_pending','pending_recovery'].includes(x.status)).map(x=>structuredClone(x));},
    async openHunterEntriesByTicker(_s,t){return [...rows.values()].filter(x=>x.ticker===t&&!['Pegasus','Dragon','Phoenix'].includes(x.conceptName)&&['open','entry_pending','exit_pending','pending_recovery'].includes(x.status)).map(x=>structuredClone(x));},
    async upsertOpportunityEpisode(ep){const old=episodes.get(String(ep.id))||{};const next={...structuredClone(old),...structuredClone(ep)};episodes.set(String(ep.id),next);return structuredClone(next);},
    async opportunityEpisode(id){const x=episodes.get(String(id));return x?structuredClone(x):null;},
    async acquireHunterTickerLock(){return async()=>{};},
    async recordAtomicThunderEvent(event){this.atomicEvents??=[];this.atomicEvents.push(structuredClone(event));return true;},
    async audit(level,event,data){audits.push({level,event,data});},
  };
}
function market(q=quote()){
  let current={...q};
  return {
    history:[],
    getHistory(){return this.history.map(x=>structuredClone(x));},getQuote(){return structuredClone(current);},quoteAgeMs(){return 0;},bookAgeMs(){return 0;},
    getBook(){return{updatedAtMs:Date.now(),yesBids:[{priceCents:current.yesBid,count:10_000}],noBids:[{priceCents:100-current.yesAsk,count:10_000}]};},
    async refreshTicker(){current={...current,updatedAtMs:Date.now()};return structuredClone(current);},
    async refreshTickerVerified(){current={...current,updatedAtMs:Date.now()};return{quote:structuredClone(current),marketFresh:true,bookFresh:true,marketObservedAtMs:Date.now(),bookObservedAtMs:Date.now()};},
    async ensureFreshBook(){return this.getBook();},
    executableAsk(_t,count,cap=100){if(current.yesAsk>cap)return{filled:0,full:false,avgCents:0,bestCents:current.yesAsk};return{filled:count,full:true,avgCents:current.yesAsk,bestCents:current.yesAsk};},
    executableBid(_t,count,floor=0){if(current.yesBid<floor)return{filled:0,full:false,avgCents:0,bestCents:current.yesBid};return{filled:count,full:true,avgCents:current.yesBid,bestCents:current.yesBid};},
    setQuote(next){current={...current,...next,updatedAtMs:Date.now()};},
  };
}
function greenBolt(ticker='T',overrides={}){
  const now=Date.now();
  return {version:ATOMIC_THUNDER_BOLT.version,policyRevision:ATOMIC_THUNDER_BOLT.policyRevision,id:`ATG-${ticker}`,fingerprint:`fp-${ticker}`,systemName:'SAGITTARIUS',sourceRelease:RELEASE,ticker,eventTicker:ticker,side:'YES',sport:'Tennis',detectedAtMs:now,expiresAtMs:now+5000,score:90,
    greenTrigger:{version:COSMO_SHADOW_TRADING.version,event:'COSMO_GREEN',shadowTradeId:`shadow-${ticker}`,cosmo:'Pegasus',shadowEntryPriceCents:54,currentExecutableBidCents:55,moveCents:1,requiredMoveCents:1,crossedAtMs:now},
    preBoltClearance:{version:'ATB3',status:'IMMEDIATE_GREEN',firstExamMs:0,finalExamMs:0,researchOnlyLegacyPatternGuardian:true},
    features:{ticker,eventTicker:ticker,bidCents:55,askCents:56,spreadCents:1,sport:'Tennis',gameMinutes:30,cosmoSources:['Pegasus'],cosmoCount:1,greenSources:[{shadowTradeId:`shadow-${ticker}`,conceptName:'Pegasus',green:true,moveCents:1}],greenSourceCount:1,greenTriggerCents:1,strongestGreenMoveCents:1,targetFeasibilityScore:90,eligibleAttacks:[{concept:'Momentum Hunter',display:'Great Horn',minEntryCents:35,maxEntryCents:89,stakeCents:20_000,plannedEntryCents:56,targetFeasible:true,targetFeasibilityScore:90,requiredTargetBidCents:61,requiredGrossMoveCents:5,estimatedEntryFeePerContractCents:2,estimatedExitFeePerContractCents:2}]},...overrides};
}
async function commander(s=settings(),db=memoryDb()){
  const a=new AthenaCommander({db,systemName:s.systemName,sourceRelease:RELEASE,getSettings:()=>s});await a.init();return a;
}

// Doctrine / settings contract.
test('R60 identity freezes the simplified Cosmos GREEN command chain',()=>{
  assert.equal(RELEASE,'SAGITTARIUS-R63-GEMINI-ANOTHER-DIMENSION-LIVE-PARITY-2026-08-31');
  assert.equal(COSMO_SHADOW_TRADING.brokerOrderAuthority,false);assert.equal(COSMO_SHADOW_TRADING.portfolioCapitalAuthority,false);assert.equal(COSMO_SHADOW_TRADING.oneBoltPerShadowTrade,true);
  assert.equal(ATOMIC_THUNDER_BOLT.authority,'SIGNAL_ONLY');assert.equal(ATOMIC_THUNDER_BOLT.entryAuthority,false);assert.equal(ATOMIC_THUNDER_BOLT.orderAuthority,false);
  assert.equal(ATOMIC_THUNDER_PATTERN_GUARDIAN.authority,'RESEARCH_ONLY');assert.equal(ARAYASHIKI.authority,'RESEARCH_ONLY');
  assert.equal(ATHENA_COMMANDER.entryDecisionAuthority,true);assert.equal(ATHENA_COMMANDER.attackSelectionAuthority,true);assert.equal(ATHENA_COMMANDER.attackStrategicRevalidationAllowed,false);
  assert.equal(INFINITY_BREAK.authority,'PROFIT_EXIT');assert.equal(AURORA_EXECUTION.lossAuthority,'U-SG1');
});

test('R60 defaults expose editable GREEN and Infinity targets and retire ATB2 timing authority',()=>{
  const s=originalSettings();assert.equal(s.atomicThunderGreenTriggerCents,1);assert.equal(s.infinityBreakMinNetPerOriginalContractCents,1);
  assert.equal(CANONICAL_NUMERIC_SETTINGS.includes('atomicThunderGreenTriggerCents'),true);assert.equal(CANONICAL_NUMERIC_SETTINGS.includes('infinityBreakMinNetPerOriginalContractCents'),true);
  assert.equal(CANONICAL_NUMERIC_SETTINGS.includes('atomicThunderFirstPatternExamSeconds'),false);assert.equal(CANONICAL_NUMERIC_SETTINGS.includes('atomicThunderFinalPatternExamSeconds'),false);
});

// Cosmos GREEN semantics.
test('R60 GREEN threshold uses fresh executable YES bid minus the exact shadow entry',()=>{
  const c=[shadow({entryPriceCents:54})];assert.equal(cosmoGreenSources(c,54,1)[0].green,false);assert.equal(cosmoGreenSources(c,55,1)[0].green,true);assert.equal(cosmoGreenSources(c,56,2)[0].green,true);assert.equal(cosmoGreenSources(c,55,2)[0].green,false);
});

test('R60 a rising market without a green shadow trade cannot create Atomic Thunder authority',()=>{
  const s=settings(),q=quote('NO-SHADOW',60,61),now=Date.now(),history=[{t:now-10_000,bid:55,ask:56},{t:now,bid:60,ask:61}];
  const f=atomicThunderBoltFeatures({q,history,settings:s,cosmos:[],now});const d=atomicThunderBoltDecision(f,s);assert.equal(d.detected,false);assert.equal(d.reason,'no_cosmo_green_move');
});

test('R60 one green shadow can create a Bolt immediately with zero strategic exam delay',()=>{
  const s=settings(),q=quote(),now=Date.now(),f=atomicThunderBoltFeatures({q,history:[],settings:s,cosmos:[shadow()],now}),d=atomicThunderBoltDecision(f,s);
  assert.equal(f.historySamples,0);assert.equal(f.greenSourceCount,1);assert.equal(d.detected,true);assert.equal(d.reason,'cosmo_green');
});

test('R60 legacy dangerous-pattern geometry is telemetry only and cannot veto a valid GREEN Bolt',()=>{
  const s=settings(),now=Date.now(),q=quote('VOL',55,56,now),history=[{t:now-30_000,bid:65,ask:66},{t:now-20_000,bid:50,ask:51},{t:now-10_000,bid:58,ask:59},{t:now-5_000,bid:53,ask:54},{t:now,bid:55,ask:56}];
  const f=atomicThunderBoltFeatures({q,history,settings:s,cosmos:[shadow({ticker:'VOL',entryPriceCents:54})],now});assert.ok(f.crashDepthCents>0);assert.equal(atomicThunderBoltDecision(f,s).detected,true);
});

// Durable Bolt creation / de-duplication.
test('R60 Atomic Thunder persists Bolt plus exact shadow lineage before emitting authority',async()=>{
  const src=shadow(),db=memoryDb([src]),m=market(quote()),stages=[];const at=new AtomicThunderBoltEngine({market:m,getSettings:()=>settings(),db,systemName:'SAGITTARIUS',sourceRelease:RELEASE,onCandidateStage:e=>stages.push(e)});
  const bolt=await at.detect(quote(),{cosmos:[src]});assert.ok(bolt);assert.equal(bolt.greenTrigger.shadowTradeId,src.id);assert.equal(bolt.preBoltClearance.status,'IMMEDIATE_GREEN');assert.equal(bolt.preBoltClearance.firstExamMs,0);assert.equal(bolt.preBoltClearance.finalExamMs,0);
  const saved=await db.entryById(src.id);assert.equal(saved.feederState.atomicThunderBoltId,bolt.id);assert.equal(saved.feederState.shadowTradeVersion,COSMO_SHADOW_TRADING.version);assert.ok(await db.opportunityEpisode(bolt.id));assert.deepEqual(stages.map(x=>x.stage),['COSMO_GREEN','BOLT']);
});

test('R60 durable shadow Bolt ID prevents duplicate Bolt after process restart',async()=>{
  const src=shadow(),db=memoryDb([src]),m=market(quote());const a=new AtomicThunderBoltEngine({market:m,getSettings:()=>settings(),db,systemName:'SAGITTARIUS',sourceRelease:RELEASE});const first=await a.detect(quote(),{cosmos:[src]});assert.ok(first);
  const durable=await db.entryById(src.id);const b=new AtomicThunderBoltEngine({market:m,getSettings:()=>settings(),db,systemName:'SAGITTARIUS',sourceRelease:RELEASE});assert.equal(await b.detect(quote(),{cosmos:[durable]}),null);
});

test('R60 Atomic Thunder fails closed when shadow lineage cannot be persisted',async()=>{
  const src=shadow(),db=memoryDb([src]);db.updateEntry=async()=>{throw new Error('db unavailable');};const events=[];const at=new AtomicThunderBoltEngine({market:market(quote()),getSettings:()=>settings(),db,systemName:'SAGITTARIUS',sourceRelease:RELEASE,audit:async(e,d)=>events.push({e,d})});
  assert.equal(await at.detect(quote(),{cosmos:[src]}),null);assert.equal(at.summary().detected,0);assert.ok(events.some(x=>x.e==='cosmo_shadow_bolt_link_persistence_failed'));assert.ok(events.some(x=>x.e==='atomic_thunder_bolt_persistence_failed'));
});

// Entry admission has no 30/120 wait.
test('R60 EAC3 admits an authorized GREEN event immediately when the execution margin fits',()=>{
  const now=Date.now(),q=quote('CLOCK',55,56,now);const out=entryChainAdmissionDecision({quote:q,mode:'SIMULATION',minGameMinutes:20,maxGameMinutes:70,now,stage:'ATOMIC_GREEN'});assert.equal(ENTRY_ADMISSION_CONTROL.version,'EAC3');assert.equal(out.action,'ALLOW');assert.equal(out.immediateGreenChain,true);assert.equal(out.executionMarginMs,5000);
});

test('R60 EAC3 still fails closed when the hard max-game execution window is exhausted',()=>{
  const now=Date.now(),q=quote('LATE',55,56,now);q.gameStartTimeMs=now-70*60_000+3000;q.gameClockState={...q.gameClockState,startTimeMs:q.gameStartTimeMs};const out=entryChainAdmissionDecision({quote:q,mode:'SIMULATION',minGameMinutes:20,maxGameMinutes:70,now,stage:'ATOMIC_GREEN'});assert.equal(out.action,'BLOCK');assert.ok(['maximum_game_time_exceeded','execution_window_infeasible'].includes(out.reason));
});

// Athena is direct attack authority; A8 is research only.
test('R60 Athena directly selects and seals the best executable Attack without an A8 certificate',async()=>{
  const s=settings({waveSurferEnabled:false}),db=memoryDb(),a=await commander(s,db),bolt=greenBolt();const d=await a.decide(bolt,{});
  assert.equal(d.decision,'FIRE');assert.equal(d.reason,'cosmo_green_best_attack');assert.equal(d.selectedAttack,'Momentum Hunter');assert.equal(d.survivalCertificate,null);assert.equal(d.fireCommand.survivalCertificate,null);assert.equal(verifyAthenaFireCommandHash(d.fireCommand),true);assert.equal(d.fireCommand.decisionEvidence.historyRole,'RANKING_ONLY_NO_VETO');assert.equal(d.fireCommand.decisionEvidence.predictiveReVetoAllowed,false);
});

test('R60 even an independently research-rejected A8 state cannot re-veto the direct Athena FIRE',async()=>{
  const now=Date.now(),bolt=greenBolt('CRASH',{features:{...greenBolt('CRASH').features,marketObservedAtMs:now,historySamples:8,historyWindowMs:30000,velocity5CentsPerSec:.1,velocity15CentsPerSec:.1,velocity30CentsPerSec:.1,currentUpwardTicks:3,currentLowerLowCount:0,currentCrashDepthCents:0,currentReboundCents:0,currentReclaimRate:0}});
  const research=examineArayashikiSurvival({bolt,context:{crashState:{version:'CI1',phase:'CRASHING',episodeId:'CRASH:NOW',crashStartedAtMs:now-1000,crashDepthCents:10,lastObservationAtMs:now,updatedAtMs:now},cosmos:[]},selectedAttack:'Momentum Hunter',now});assert.equal(research.status,'REJECTED');
  const db=memoryDb(),a=await commander(settings({waveSurferEnabled:false}),db);const d=await a.decide(bolt,{crashState:{phase:'CRASHING'}});assert.equal(d.decision,'FIRE');assert.equal(d.survivalCertificate,null);
});

test('R60 execution validates sealed Athena authority but never requires survival-certificate evidence',async()=>{
  const s=settings({waveSurferEnabled:false}),db=memoryDb(),a=await commander(s,db),q=quote(),d=await a.decide(greenBolt(),{});const out=validateAthenaFireCommand(d.fireCommand,{concept:'Momentum Hunter',q,settings:s,now:d.decidedAtMs+1});assert.equal(out.ok,true);assert.equal(out.reason,'athena_fire_valid');
});

test('R60 editable Infinity target is frozen into FIRE and changing it before execution fails closed',async()=>{
  const s=settings({waveSurferEnabled:false,infinityBreakMinNetPerOriginalContractCents:2}),db=memoryDb(),a=await commander(s,db),q=quote(),d=await a.decide(greenBolt(),{});assert.equal(d.fireCommand.economicTarget.netPerOriginalContractCents,2);assert.equal(validateAthenaFireCommand(d.fireCommand,{concept:'Momentum Hunter',q,settings:s}).ok,true);
  const changed={...s,infinityBreakMinNetPerOriginalContractCents:3};const invalid=validateAthenaFireCommand(d.fireCommand,{concept:'Momentum Hunter',q,settings:changed});assert.equal(invalid.ok,false);assert.equal(invalid.reason,'athena_economic_target_changed');
});

// Cosmos are real persisted shadow rows but never broker orders/capital.
test('R60 createGhost persists a visible broker-free shadow trade with its own reference stake',async()=>{
  const s=settings(),db=memoryDb(),broker={calls:0,async placeOrder(){this.calls++;throw new Error('must never order');}},st=new StrategyEngine({db,kalshi:broker,market:market(quote()),learning:{},getSettings:()=>s,getLiveReady:()=>false});const e=await st.createGhost('Pegasus',quote('GHOST',54,55),54,null);assert.ok(e);assert.equal(e.conceptName,'Pegasus');assert.equal(e.entryConfig.shadowTrade.version,COSMO_SHADOW_TRADING.version);assert.equal(e.entryConfig.shadowTrade.brokerOrderAuthority,false);assert.equal(e.entryFeeCents,0);assert.equal(broker.calls,0);
});

test('R60 executeAthenaFire follows the exact triggering shadow and writes real-entry lineage back to it',async()=>{
  const s=settings({waveSurferEnabled:false}),trigger=shadow({id:'shadow-T',ticker:'T',conceptName:'Pegasus',entryPriceCents:54}),other=shadow({id:'other-T',ticker:'T',conceptName:'Dragon',entryPriceCents:40,openedAtMs:Date.now()}),db=memoryDb([trigger,other]),a=await commander(s,db),bolt=greenBolt('T',{greenTrigger:{...greenBolt('T').greenTrigger,shadowTradeId:trigger.id,cosmo:'Pegasus'}}),decision=await a.decide(bolt,{});assert.equal(decision.decision,'FIRE');
  const st=new StrategyEngine({db,kalshi:{},market:market(quote()),learning:{},getSettings:()=>s,getLiveReady:()=>false});let captured=null;st.createHunter=async(concept,q,stake,_stop,opt)=>{captured={concept,q,stake,opt};const now=Date.now();const e={id:'real-1',ticker:q.ticker,eventTicker:q.eventTicker,conceptName:concept,status:'open',openedAtMs:now};await db.insertEntry(e);return e;};
  const e=await st.executeAthenaFire(quote(),bolt,decision,{cosmos:[other,trigger]});assert.ok(e);assert.equal(captured.opt.sourceFeeder,'Pegasus');assert.equal(captured.opt.sourceTradeId,trigger.id);const saved=await db.entryById(trigger.id);assert.equal(saved.feederState.realEntryId,e.id);assert.equal(saved.feederState.atomicThunderBoltId,bolt.id);assert.equal(saved.feederState.athenaSelectedAttack,'Momentum Hunter');const untouched=await db.entryById(other.id);assert.equal(untouched.feederState.realEntryId??null,null);
});

test('R60 full deterministic chain runs Cosmos GREEN -> Bolt -> Athena FIRE -> real SIM Attack -> Infinity Break exit',async()=>{
  const s=settings({waveSurferEnabled:false,infinityBreakRequiredConfirmations:2}),src=shadow({id:'shadow-E2E',ticker:'E2E',entryPriceCents:54}),db=memoryDb([src]),m=market(quote('E2E',55,56));
  const atomic=new AtomicThunderBoltEngine({market:m,getSettings:()=>s,db,systemName:s.systemName,sourceRelease:RELEASE});
  const bolt=await atomic.detect(m.getQuote('E2E'),{cosmos:[src]});assert.ok(bolt);assert.equal(bolt.greenTrigger.shadowTradeId,src.id);
  const athena=await commander(s,db),decision=await athena.decide(bolt,{});assert.equal(decision.decision,'FIRE');assert.equal(decision.selectedAttack,'Momentum Hunter');
  const refreshGameClock=async(q)=>{const now=Date.now();return{gameClockState:{...q.gameClockState,version:'GCA2',phase:'CONFIRMED',confirmed:true,entryAuthorized:true,evidenceObservedAtMs:now,lastCheckedAtMs:now,authorizationReason:'r60_e2e_fresh'},gameStartTimeMs:q.gameStartTimeMs,liveStatus:'live'};};
  const st=new StrategyEngine({db,kalshi:{},market:m,learning:{},getSettings:()=>s,getLiveReady:()=>false,refreshGameClock,random:()=>0});
  const real=await st.executeAthenaFire(m.getQuote('E2E'),bolt,decision,{cosmos:[await db.entryById(src.id)]});assert.ok(real);assert.equal(real.conceptName,'Momentum Hunter');assert.equal(real.sourceTradeId,src.id);assert.equal(real.status,'open');assert.equal(real.entryConfig.infinityBreak.minimumNetPerOriginalContractCents,1);
  const learning={async onHardStop(){},async stopGuardProfile(){return null;},async lossWatchdogProfile(){return null;},profitLearningState(){return null;},async observeProfitOpportunity(){return null;},profitRetentionProfileCached(){return{retentionRatio:.92,specificity:'cold_start',promoted:false,totalObservations:0,oneTickPullbacks:0,oneTickRecoveries:0,continuationRate:.5,collapseRate:.25,confidence:'low'};},async profitRetentionProfile(){return this.profitRetentionProfileCached();},async markProfitExit(){}};
  const guard=new ProfitGuard({db,kalshi:{},market:m,learning,getSettings:()=>s});
  m.setQuote({yesBid:61,yesAsk:62});
  let first=await guard.protect(await db.entryById(real.id));assert.equal(first.closed===true,false);
  await new Promise(r=>setTimeout(r,2));m.setQuote({yesBid:59,yesAsk:60});
  const reset=await guard.protect(await db.entryById(real.id));assert.equal(reset.closed===true,false);
  await new Promise(r=>setTimeout(r,2));m.setQuote({yesBid:61,yesAsk:62});
  const second=await guard.protect(await db.entryById(real.id));assert.equal(second.closed,true);
  const closed=await db.entryById(real.id);assert.equal(closed.status,'closed');assert.equal(closed.closeReason,'infinity_break');assert.ok(Number(closed.pnlCents)>0);
  const source=await db.entryById(src.id);assert.equal(source.feederState.atomicThunderBoltId,bolt.id);assert.equal(source.feederState.realEntryId,real.id);
});

test('R60 full deterministic failure path runs executed Attack into the frozen Aurora loss authority',async()=>{
  const s=settings({waveSurferEnabled:false,auroraDamageControlPercent:45}),src=shadow({id:'shadow-AUR',ticker:'AUR',entryPriceCents:54}),db=memoryDb([src]),m=market(quote('AUR',55,56));
  const atomic=new AtomicThunderBoltEngine({market:m,getSettings:()=>s,db,systemName:s.systemName,sourceRelease:RELEASE}),bolt=await atomic.detect(m.getQuote('AUR'),{cosmos:[src]});assert.ok(bolt);
  const athena=await commander(s,db),decision=await athena.decide(bolt,{});assert.equal(decision.decision,'FIRE');
  const refreshGameClock=async(q)=>{const now=Date.now();return{gameClockState:{...q.gameClockState,version:'GCA2',phase:'CONFIRMED',confirmed:true,entryAuthorized:true,evidenceObservedAtMs:now,lastCheckedAtMs:now,authorizationReason:'r60_aurora_fresh'},gameStartTimeMs:q.gameStartTimeMs,liveStatus:'live'};};
  const st=new StrategyEngine({db,kalshi:{},market:m,learning:{},getSettings:()=>s,getLiveReady:()=>false,refreshGameClock,random:()=>0}),real=await st.executeAthenaFire(m.getQuote('AUR'),bolt,decision,{cosmos:[await db.entryById(src.id)]});assert.ok(real);assert.equal(real.entryConfig.aurora.frozen,true);
  const danger=Number(real.entryConfig.aurora.dangerPriceCents);assert.ok(danger>0);m.setQuote({yesBid:Math.max(1,danger-1),yesAsk:Math.max(2,danger)});
  const learning={async onHardStop(){this.hardStops=(this.hardStops||0)+1;},async stopGuardProfile(){return null;},async lossWatchdogProfile(){return null;},profitLearningState(){return null;},async observeProfitOpportunity(){return null;},profitRetentionProfileCached(){return{retentionRatio:.92,specificity:'cold_start',promoted:false,totalObservations:0,oneTickPullbacks:0,oneTickRecoveries:0,continuationRate:.5,collapseRate:.25,confidence:'low'};},async profitRetentionProfile(){return this.profitRetentionProfileCached();},async markProfitExit(){}};
  const guard=new ProfitGuard({db,kalshi:{},market:m,learning,getSettings:()=>s}),out=await guard.protect(await db.entryById(real.id));assert.equal(out.protected,true);assert.equal(out.action,'stop_guard');assert.match(String(out.guardState||''),/^USG1_/);
  const protectedRow=await db.entryById(real.id);assert.equal(protectedRow.status,'open');assert.equal(Number(real.entryConfig.aurora.damageControlPercent),45);assert.equal(Number(real.entryConfig.aurora.dangerPriceCents),danger);
});

// Exit roles remain separated.
test('R60 Aurora remains configurable and freezes the chosen loss envelope at entry economics',()=>{
  const a=calculateAuroraSnapshotFromFeeModel({entryPriceCents:80,count:100,entryFeeCents:200,mode:'SIMULATION',simFeeCents:2,damageControlPercent:70,calculatedAtMs:1});const b=calculateAuroraSnapshotFromFeeModel({entryPriceCents:80,count:100,entryFeeCents:200,mode:'SIMULATION',simFeeCents:2,damageControlPercent:45,calculatedAtMs:2});assert.equal(a.ok,true);assert.equal(a.frozen,true);assert.equal(a.damageControlPercent,70);assert.equal(b.damageControlPercent,45);assert.ok(a.dangerPriceCents<b.dangerPriceCents);
});

// Static authority and UI/deployment proof.
test('R60 source contains no strategic Arayashiki call between Bolt and Athena or FIRE and execution',async()=>{
  const [athena,strategy]=await Promise.all([readFile(new URL('../src/athena.mjs',import.meta.url),'utf8'),readFile(new URL('../src/strategy.mjs',import.meta.url),'utf8')]);const decide=athena.slice(athena.indexOf('async decide(bolt'),athena.indexOf('summary(){',athena.indexOf('async decide(bolt')));assert.equal(decide.includes('examineArayashikiSurvival'),false);const validate=strategy.slice(strategy.indexOf('export function validateAthenaFireCommand'),strategy.indexOf('export function recoverySignalState'));assert.equal(validate.includes('verifyArayashikiCertificate'),false);
});

test('R60 dashboard exposes one unified foldable Cosmos shadow table with ALL/Pegasus/Dragon/Phoenix filters and GREEN lineage',async()=>{
  const [html,app,engine]=await Promise.all([readFile(new URL('../public/index.html',import.meta.url),'utf8'),readFile(new URL('../public/app.js',import.meta.url),'utf8'),readFile(new URL('../src/engine.mjs',import.meta.url),'utf8')]);for(const x of ['COSMO SHADOW TRADES','cosmoShadowFilter','ALL','PEGASUS','DRAGON','PHOENIX'])assert.ok(html.includes(x),x);for(const x of ['shadowMoveCents','shadowPnlCents','atomicThunderBoltId','athenaSelectedAttack','realEntryId','atomicThunderGreenTriggerCents'])assert.ok(app.includes(x),x);assert.ok(html.includes('<details'));assert.ok(!/COSMO SHADOW TRADES[^]*?<details open/.test(html));assert.ok(engine.includes('realEntryByShadowId'));assert.ok(engine.includes("const sourceId=String(hunter?.sourceTradeId||'')"));
});

test('R60 Railway source package remains compact, source-started, and healthcheck-safe',async()=>{
  const root=new URL('../',import.meta.url),pkg=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8')),rail=JSON.parse(await readFile(new URL('../railway.json',import.meta.url),'utf8'));assert.equal(pkg.scripts.start,'node src/index.mjs');assert.equal(rail.build.buildCommand,'npm test && npm run check');assert.equal(rail.deploy.startCommand,'npm start');assert.equal(rail.deploy.healthcheckPath,'/health');
  async function walk(u){let out=[];for(const ent of await readdir(u,{withFileTypes:true})){if(['node_modules','.git','package-lock.json'].includes(ent.name))continue;const x=new URL(ent.name+(ent.isDirectory()?'/':''),u);if(ent.isDirectory())out.push(...await walk(x));else out.push(x);}return out;}const all=await walk(root);assert.equal(all.length,46);
});

// R63 Gemini / Another Dimension / Sagittarius Justice Arrow + live-parity SIM.
test('R63 doctrine separates Another Dimension shadow authority from Cosmos and portfolio exposure while Justice Arrow is a real ATHENA-X1 Attack',()=>{
  assert.equal(SHADOW_ATTACK_CONCEPTS.has('Another Dimension'),true);
  assert.equal(FEEDER_CONCEPTS.has('Another Dimension'),false);
  assert.equal(PORTFOLIO_CONCEPTS.has('Another Dimension'),false);
  assert.equal(PORTFOLIO_CONCEPTS.has('Sagittarius Justice Arrow'),true);
  assert.equal(GEMINI_UNIVERSE.attack,'Another Dimension');
  assert.equal(GEMINI_UNIVERSE.brokerOrderAuthority,false);
  assert.equal(GEMINI_UNIVERSE.portfolioCapitalAuthority,false);
  assert.equal(GEMINI_UNIVERSE.simulationPortfolioCapitalAuthority,false);
  assert.equal(ANOTHER_DIMENSION.brokerOrderAuthority,false);
  assert.equal(ANOTHER_DIMENSION.portfolioCapitalAuthority,false);
  assert.equal(ANOTHER_DIMENSION.simulationPortfolioCapitalAuthority,false);
  assert.equal(ANOTHER_DIMENSION.minimumNetPerOriginalContractCents,1);
  assert.equal(ANOTHER_DIMENSION.entryPhysics,'GREAT_HORN_MOMENTUM');
  assert.equal(SAGITTARIUS_JUSTICE_ARROW.trigger,'POST_PROFIT_ANOTHER_DIMENSION_CLOSE');
  assert.equal(SAGITTARIUS_JUSTICE_ARROW.profitAuthority,ATHENA_EXIT_INTELLIGENCE.version);
  assert.equal(SAGITTARIUS_JUSTICE_ARROW.lossAuthority,'AURORA_EXECUTION');
});

test('R63 migrates the deployed R62 shadow-universe settings into Gemini without changing the operator band/stake and retires random SIM fill probability',()=>{
  const defaults=originalSettings();
  const migrated=sanitizeRuntimeSettings({systemName:'SAGITTARIUS',ownerId:'r62-owner',mode:'SIMULATION',engineActive:true,anotherDimensionEnabled:true,momentumStakeCents:23_456,momentumMinEntryCents:41,momentumMaxEntryCents:87,simFillProbability:0.75},defaults);
  assert.equal(migrated.geminiEnabled,true);assert.equal(migrated.geminiReferenceStakeCents,23_456);assert.equal(migrated.geminiMinPriceCents,41);assert.equal(migrated.geminiMaxPriceCents,87);assert.equal(migrated.simFillProbability,1);
  assert.equal(Object.hasOwn(migrated,'anotherDimensionEnabled'),false);
});

test('R63 Gemini owns its own price band independently of the real Great Horn Attack band',()=>{
  const s=settings({geminiEnabled:true,geminiReferenceStakeCents:20_000,geminiMinPriceCents:40,geminiMaxPriceCents:60,momentumMinEntryCents:75,momentumMaxEntryCents:89,maxSpreadCents:3});
  const source={...shadow({id:'gemini-band-source',ticker:'GBAND',conceptName:'Pegasus',entryPriceCents:45}),mode:'SIMULATION',ownerId:s.ownerId,systemName:s.systemName,peakPriceCents:45};
  let out=anotherDimensionQualification(source,quote('GBAND',49,50),s,{sourcePeakCents:50});assert.equal(out.ok,true);assert.equal(out.minEntryCents,40);assert.equal(out.maxEntryCents,60);
  out=anotherDimensionQualification(source,quote('GBAND',74,75),s,{sourcePeakCents:75});assert.equal(out.ok,false);assert.equal(out.reason,'entry_band');
});

test('R63 Another Dimension qualification is exactly Great Horn momentum geometry on an active Cosmos shadow',()=>{
  const s=settings({geminiEnabled:true,geminiReferenceStakeCents:20_000,geminiMinPriceCents:35,geminiMaxPriceCents:89,maxSpreadCents:3});
  const source={...shadow({id:'cosmo-ad-q',ticker:'ADQ',conceptName:'Pegasus',entryPriceCents:70}),mode:'SIMULATION',ownerId:s.ownerId,systemName:s.systemName,peakPriceCents:70};
  let q=quote('ADQ',74,75);
  let out=anotherDimensionQualification(source,q,s,{sourcePeakCents:75});
  assert.equal(out.ok,true);assert.equal(out.riseCents,5);assert.equal(out.pullbackCents,1);
  out=anotherDimensionQualification(source,{...q,yesBid:71,yesAsk:75},s,{sourcePeakCents:75});assert.equal(out.ok,false);assert.equal(out.reason,'spread');
  out=anotherDimensionQualification(source,q,{...s,geminiEnabled:false},{sourcePeakCents:75});assert.equal(out.ok,false);assert.equal(out.reason,'gemini_disabled');
  out=anotherDimensionQualification({...source,conceptName:'Another Dimension'},q,s,{sourcePeakCents:75});assert.equal(out.ok,false);assert.equal(out.reason,'inactive_cosmo_source');
});

test('R63 Another Dimension opens a durable zero-capital shadow Attack and duplicate source lineage cannot open twice',async()=>{
  const s=settings({geminiEnabled:true,geminiReferenceStakeCents:20_000,geminiMinPriceCents:35,geminiMaxPriceCents:89,maxSpreadCents:3,auroraDamageControlPercent:45});
  const source={...shadow({id:'cosmo-ad-open',ticker:'ADOPEN',conceptName:'Pegasus',entryPriceCents:70}),mode:'SIMULATION',ownerId:s.ownerId,systemName:s.systemName,peakPriceCents:70};
  const db=memoryDb([source]),m=market(quote('ADOPEN',74,75));let brokerOrders=0;
  const st=new StrategyEngine({db,kalshi:{async placeOrder(){brokerOrders++;throw new Error('shadow must never place broker orders');}},market:m,learning:{},getSettings:()=>s,getLiveReady:()=>false,random:()=>0});
  const opened=await st.createAnotherDimensionShadow(source,m.getQuote('ADOPEN'),{sourcePeakCents:75});
  assert.ok(opened);assert.equal(opened.conceptName,'Another Dimension');assert.equal(opened.sourceTradeId,source.id);assert.equal(opened.sourceFeeder,'Pegasus');assert.equal(opened.entryConfig.shadowAttack.brokerOrderAuthority,false);assert.equal(opened.entryConfig.shadowAttack.portfolioCapitalAuthority,false);assert.equal(opened.entryConfig.shadowAttack.simulationPortfolioCapitalAuthority,false);assert.equal(opened.entryConfig.universe.name,'Gemini');assert.equal(opened.entryConfig.universe.simulationPortfolioCapitalAuthority,false);assert.equal(opened.entryConfig.greatHornQualification.ok,true);assert.equal(opened.entryConfig.virtualInfinity.version,INFINITY_BREAK.version);assert.equal(opened.entryConfig.virtualInfinity.minimumNetPerOriginalContractCents,1);assert.equal(opened.entryConfig.simFeeCents,2);assert.equal(opened.entryConfig.aurora.frozen,true);assert.equal(brokerOrders,0);
  const duplicate=await st.createAnotherDimensionShadow(source,m.getQuote('ADOPEN'),{sourcePeakCents:75});assert.equal(duplicate,null);assert.equal(brokerOrders,0);
});

test('R63 Another Dimension virtual exit requires fresh full depth and confirmations, while its frozen Aurora line remains immediate loss authority',async()=>{
  const s=settings({geminiEnabled:true,geminiReferenceStakeCents:20_000,geminiMinPriceCents:35,geminiMaxPriceCents:89,maxSpreadCents:3,auroraDamageControlPercent:45,infinityBreakRequiredConfirmations:2,infinityBreakConfirmationWindowMs:3000});
  const source={...shadow({id:'cosmo-ad-exit',ticker:'ADEXIT',conceptName:'Pegasus',entryPriceCents:70}),mode:'SIMULATION',ownerId:s.ownerId,systemName:s.systemName,peakPriceCents:70};
  const db=memoryDb([source]),m=market(quote('ADEXIT',74,75)),st=new StrategyEngine({db,kalshi:{},market:m,learning:{},getSettings:()=>s,getLiveReady:()=>false,random:()=>0});
  const opened=await st.createAnotherDimensionShadow(source,m.getQuote('ADEXIT'),{sourcePeakCents:75});assert.ok(opened);
  const e=Object.create(SagittariusEngine.prototype);e.anotherDimensionRuntime=new Map();e.market=m;e.settings=s;
  m.setQuote({yesBid:80,yesAsk:81});
  let d=e.evaluateAnotherDimensionExit(opened,m.getQuote('ADEXIT'));assert.equal(d,null,'first profitable full-depth book is only confirmation one');
  await new Promise(r=>setTimeout(r,2));m.setQuote({yesBid:80,yesAsk:81});d=e.evaluateAnotherDimensionExit(opened,m.getQuote('ADEXIT'));assert.ok(d);assert.equal(d.closeReason,ANOTHER_DIMENSION.profitableCloseReason);assert.ok(d.pnlCents>0);
  const profitClosed=await st.closeAnotherDimensionShadow(opened,d);assert.equal(profitClosed.status,'closed');assert.ok(profitClosed.pnlCents>0);

  const source2={...source,id:'cosmo-ad-loss',ticker:'ADLOSS',eventTicker:'ADLOSS'};await db.insertEntry(source2);const m2=market(quote('ADLOSS',74,75));const st2=new StrategyEngine({db,kalshi:{},market:m2,learning:{},getSettings:()=>s,getLiveReady:()=>false,random:()=>0});const lossOpen=await st2.createAnotherDimensionShadow(source2,m2.getQuote('ADLOSS'),{sourcePeakCents:75});assert.ok(lossOpen);
  const e2=Object.create(SagittariusEngine.prototype);e2.anotherDimensionRuntime=new Map();e2.market=m2;e2.settings=s;const danger=Number(lossOpen.entryConfig.aurora.dangerPriceCents);m2.setQuote({yesBid:Math.max(1,danger),yesAsk:Math.max(2,danger+1)});const loss=e2.evaluateAnotherDimensionExit(lossOpen,m2.getQuote('ADLOSS'));assert.ok(loss);assert.equal(loss.closeReason,ANOTHER_DIMENSION.lossCloseReason);assert.equal(loss.auroraTouch,true);
});

test('R63 profitable Another Dimension confirmation survives same-book commit revalidation and therefore cannot lose the Justice Arrow trigger',async()=>{
  const s=settings({geminiEnabled:true,geminiReferenceStakeCents:20_000,geminiMinPriceCents:35,geminiMaxPriceCents:89,maxSpreadCents:3,auroraDamageControlPercent:45,infinityBreakRequiredConfirmations:2,infinityBreakConfirmationWindowMs:3000});
  const source={...shadow({id:'gemini-commit-source',ticker:'GCOMMIT',conceptName:'Pegasus',entryPriceCents:70}),mode:s.mode,ownerId:s.ownerId,systemName:s.systemName,peakPriceCents:70};
  const db=memoryDb([source]);let current=quote('GCOMMIT',74,75),bookMs=1000;
  const m={...market(current),getQuote(){return structuredClone(current);},getBook(){return{updatedAtMs:bookMs,yesBids:[{priceCents:current.yesBid,count:10000}],noBids:[{priceCents:100-current.yesAsk,count:10000}]};},quoteAgeMs(){return 0;},bookAgeMs(){return 0;},executableAsk(_t,count,cap=100){return current.yesAsk<=cap?{filled:count,full:true,avgCents:current.yesAsk,bestCents:current.yesAsk}:{filled:0,full:false,avgCents:0,bestCents:current.yesAsk};},executableBid(_t,count){return{filled:count,full:true,avgCents:current.yesBid,bestCents:current.yesBid};},async refreshTickerVerified(){return{quote:structuredClone(current),marketFresh:true,bookFresh:true};},set(next,ms){current={...current,...next,updatedAtMs:ms};bookMs=ms;}};
  const st=new StrategyEngine({db,kalshi:{},market:m,learning:{},getSettings:()=>s,getLiveReady:()=>false,random:()=>1});
  const ad=await st.createAnotherDimensionShadow(source,m.getQuote(),{sourcePeakCents:75});assert.ok(ad);
  const engine=Object.create(SagittariusEngine.prototype);engine.settings=s;engine.market=m;engine.db=db;engine.strategy=st;engine.anotherDimensionRuntime=new Map();engine.anotherDimensionOpenByTicker=new Map([[ad.ticker,ad]]);engine.anotherDimensionRecent=new Map([[ad.id,ad]]);engine.anotherDimensionSourcePeaks=new Map();engine.geminiOpenAttemptBookMs=new Map();engine.anotherDimensionStats={version:ANOTHER_DIMENSION.version,qualified:0,opened:1,profitClosed:0,lossClosed:0,realizedPnlCents:0,blocked:0,lastEvent:null};let queued=null;engine.anotherDimensionQueue={enqueue(key,task){queued={key,task};return true;}};engine.rememberAnotherDimension=SagittariusEngine.prototype.rememberAnotherDimension.bind(engine);
  m.set({yesBid:80,yesAsk:81},2000);engine.observeAnotherDimensionQuote(m.getQuote());assert.equal(queued,null);assert.equal(engine.anotherDimensionRuntime.get(ad.id).confirmations,1);
  m.set({yesBid:80,yesAsk:81},3000);engine.observeAnotherDimensionQuote(m.getQuote());assert.ok(queued);assert.equal(queued.key,`close:${ad.id}`);assert.equal(engine.anotherDimensionRuntime.get(ad.id).confirmations,2);
  // The queued commit intentionally sees the SAME 3000ms book. R62 incorrectly
  // treated this as a duplicate confirmation and canceled the close.
  await queued.task();const durable=await db.entryById(ad.id);assert.equal(durable.status,'closed');assert.equal(durable.closeReason,ANOTHER_DIMENSION.profitableCloseReason);assert.ok(durable.pnlCents>0);
});

test('R63 full shadow-to-real simulation opens Justice Arrow only from a profitable Another Dimension close and freezes ATHENA-X1 with no Infinity snapshot',async()=>{
  const s=settings({geminiEnabled:true,geminiReferenceStakeCents:20_000,geminiMinPriceCents:35,geminiMaxPriceCents:89,simFillProbability:0,justiceArrowEnabled:true,justiceArrowStakeCents:20_000,justiceArrowMinEntryCents:70,justiceArrowMaxEntryCents:89,maxSpreadCents:3,auroraDamageControlPercent:45,galacticExplosionEnabled:true});
  const source={...shadow({id:'cosmo-r62-e2e',ticker:'R62E2E',conceptName:'Pegasus',entryPriceCents:70}),mode:'SIMULATION',ownerId:s.ownerId,systemName:s.systemName,peakPriceCents:70};
  const db=memoryDb([source]),m=market(quote('R62E2E',74,75));
  const refreshGameClock=async(q)=>{const now=Date.now();return{gameClockState:{...q.gameClockState,version:'GCA2',phase:'CONFIRMED',confirmed:true,entryAuthorized:true,evidenceObservedAtMs:now,lastCheckedAtMs:now,authorizationReason:'r62_justice_fresh'},gameStartTimeMs:q.gameStartTimeMs,liveStatus:'live'};};
  const st=new StrategyEngine({db,kalshi:{},market:m,learning:{},getSettings:()=>s,getLiveReady:()=>false,refreshGameClock,random:()=>1});
  const ad=await st.createAnotherDimensionShadow(source,m.getQuote('R62E2E'),{sourcePeakCents:75});assert.ok(ad);
  const virtual=Object.create(SagittariusEngine.prototype);virtual.anotherDimensionRuntime=new Map();virtual.market=m;virtual.settings=s;
  m.setQuote({yesBid:80,yesAsk:81});let vd=virtual.evaluateAnotherDimensionExit(ad,m.getQuote('R62E2E'));assert.equal(vd,null);await new Promise(r=>setTimeout(r,2));m.setQuote({yesBid:80,yesAsk:81});vd=virtual.evaluateAnotherDimensionExit(ad,m.getQuote('R62E2E'));assert.ok(vd);const closedAd=await st.closeAnotherDimensionShadow(ad,vd);assert.ok(closedAd.pnlCents>0);
  m.setQuote({yesBid:75,yesAsk:76});
  const engine=Object.create(SagittariusEngine.prototype);engine.settings=s;engine.db=db;engine.market=m;engine.strategy=st;engine.justiceArrowInFlight=new Set();engine.justiceArrowStats={version:SAGITTARIUS_JUSTICE_ARROW.version,eligible:0,authorized:0,attempted:0,opened:0,blocked:0,duplicateSuppressed:0,modeMismatchBlocked:0,lastEvent:null};engine.invalidateStateSnapshot=()=>{};
  const out=await engine.handleJusticeArrowContinuation(closedAd);assert.equal(out.status,'OPENED');const arrow=out.entry;assert.equal(arrow.conceptName,'Sagittarius Justice Arrow');assert.equal(arrow.sourceFeeder,'Another Dimension');assert.equal(arrow.sourceTradeId,closedAd.id);assert.equal(arrow.entryConfig.profitAuthority,ATHENA_EXIT_INTELLIGENCE.version);assert.equal(arrow.entryConfig.profitAuthorityRevision,ATHENA_EXIT_INTELLIGENCE.policyRevision);assert.equal(arrow.entryConfig.infinityBreak,undefined);assert.equal(arrow.entryConfig.athenaExit.version,ATHENA_EXIT_INTELLIGENCE.version);assert.equal(arrow.entryConfig.aurora.frozen,true);assert.equal(arrow.entryConfig.justiceArrowContinuation.parentShadowTradeId,closedAd.id);
  const linkedParent=await db.entryById(closedAd.id);assert.equal(linkedParent.feederState.justiceArrowEntryId,arrow.id);assert.equal(linkedParent.feederState.universe,'Gemini');
  const again=await engine.handleJusticeArrowContinuation(closedAd);assert.equal(again.status,'DUPLICATE_SUPPRESSED');assert.equal(engine.justiceArrowStats.opened,1);

  const losing={...closedAd,id:'ad-loss-no-arrow',pnlCents:-100,closeReason:ANOTHER_DIMENSION.lossCloseReason};const ignored=await engine.handleJusticeArrowContinuation(losing);assert.equal(ignored.status,'IGNORED');assert.equal(ignored.reason,'not_profitable_another_dimension_close');
});

test('R63 Justice Arrow ignores the one-cent Infinity opportunity, runs ATHENA-X1 upward, then exits the full position on confirmed deterioration',async()=>{
  const s=settings({justiceArrowEnabled:true,justiceArrowMinEntryCents:70,justiceArrowMaxEntryCents:89,galacticExplosionEnabled:true,auroraDamageControlPercent:45});
  const db=memoryDb(),m=market(quote('JAX1',69,70));
  const parent={id:'ad-parent-x1',systemName:s.systemName,ownerId:s.ownerId,conceptName:'Another Dimension',sourceFeeder:'Pegasus',sourceTradeId:'cosmo-x1',ticker:'JAX1',eventTicker:'JAX1',marketTitle:'JAX1',mode:'SIMULATION',status:'closed',entryPriceCents:75,exitPriceCents:80,currentPriceCents:80,peakPriceCents:80,count:266,remainingCount:0,pnlCents:266,entryFeeCents:532,exitFeeCents:532,closeReason:ANOTHER_DIMENSION.profitableCloseReason,openedAtMs:Date.now()-60_000,closedAtMs:Date.now()-1_000,updatedAtMs:Date.now()-1_000,entryConfig:{shadowAttack:{version:ANOTHER_DIMENSION.version}}};await db.insertEntry(parent);
  const refreshGameClock=async(q)=>{const now=Date.now();return{gameClockState:{...q.gameClockState,version:'GCA2',phase:'CONFIRMED',confirmed:true,entryAuthorized:true,evidenceObservedAtMs:now,lastCheckedAtMs:now,authorizationReason:'r62_x1_fresh'},gameStartTimeMs:q.gameStartTimeMs,liveStatus:'live'};};
  const st=new StrategyEngine({db,kalshi:{},market:m,learning:{},getSettings:()=>s,getLiveReady:()=>false,refreshGameClock,random:()=>0});const arrow=await st.executeJusticeArrowContinuation(m.getQuote('JAX1'),parent,{authorizationId:'JUSTICE-ARROW:ad-parent-x1:1',authorizedAtMs:Date.now()});assert.ok(arrow);assert.equal(arrow.entryPriceCents,70);assert.equal(arrow.entryConfig.profitAuthority,'ATHENA-X1');assert.equal(arrow.entryConfig.infinityBreak,undefined);
  const learning={async onHardStop(){},async stopGuardProfile(){return null;},async lossWatchdogProfile(){return null;},profitLearningState(){return null;},async observeProfitOpportunity(){return null;},profitRetentionProfileCached(){return{retentionRatio:.92,specificity:'cold_start',promoted:false,totalObservations:0,oneTickPullbacks:0,oneTickRecoveries:0,continuationRate:.5,collapseRate:.25,confidence:'low'};},async profitRetentionProfile(){return this.profitRetentionProfileCached();},async markProfitExit(){}};
  const guard=new ProfitGuard({db,kalshi:{},market:m,learning,getSettings:()=>s});
  m.setQuote({yesBid:75,yesAsk:76});let out=await guard.protect(await db.entryById(arrow.id));assert.equal(out.closed??false,false,'Justice Arrow must not use current Infinity +1 net harvest');let row=await db.entryById(arrow.id);assert.equal(row.status,'open');assert.equal(row.profitGuardState.version,'ATHENA-X1');
  let closedAt=null;
  for(const bid of [90,75,89]){await new Promise(r=>setTimeout(r,2));m.setQuote({yesBid:bid,yesAsk:Math.min(100,bid+1)});out=await guard.protect(await db.entryById(arrow.id));if(out.closed===true){closedAt=bid;break;}}
  assert.equal(closedAt,89,'ATHENA-X1 must close the full position on the second distinct qualifying profit spike');const closed=await db.entryById(arrow.id);assert.equal(closed.closeReason,'athena_x1_exit');assert.equal(closed.remainingCount,0);assert.ok(closed.pnlCents>0);
});
test('R63 complete Gemini chain runs Cosmos -> Another Dimension -> durable +1c win callback -> Justice Arrow -> ATHENA-X1 profit exit',async()=>{
  const s=settings({geminiEnabled:true,geminiReferenceStakeCents:20_000,geminiMinPriceCents:35,geminiMaxPriceCents:89,justiceArrowEnabled:true,justiceArrowStakeCents:20_000,justiceArrowMinEntryCents:70,justiceArrowMaxEntryCents:89,simFillProbability:0,galacticExplosionEnabled:true,auroraDamageControlPercent:45});
  const source={...shadow({id:'gemini-chain-source',ticker:'GCHAIN',conceptName:'Pegasus',entryPriceCents:70}),mode:'SIMULATION',ownerId:s.ownerId,systemName:s.systemName,peakPriceCents:70};
  const db=memoryDb([source]),m=market(quote('GCHAIN',74,75));
  const refreshGameClock=async(q)=>{const now=Date.now();return{gameClockState:{...q.gameClockState,version:'GCA2',phase:'CONFIRMED',confirmed:true,entryAuthorized:true,evidenceObservedAtMs:now,lastCheckedAtMs:now,authorizationReason:'r63_complete_gemini_chain'},gameStartTimeMs:q.gameStartTimeMs,liveStatus:'live'};};
  let justicePromise=null,chainEngine=null;
  const st=new StrategyEngine({db,kalshi:{},market:m,learning:{},getSettings:()=>s,getLiveReady:()=>false,refreshGameClock,random:()=>1,onShadowAttackClosed:(closed)=>{justicePromise=chainEngine.handleJusticeArrowContinuation(closed);}});
  chainEngine=Object.create(SagittariusEngine.prototype);chainEngine.settings=s;chainEngine.db=db;chainEngine.market=m;chainEngine.strategy=st;chainEngine.justiceArrowInFlight=new Set();chainEngine.justiceArrowStats={version:SAGITTARIUS_JUSTICE_ARROW.version,eligible:0,authorized:0,attempted:0,opened:0,blocked:0,duplicateSuppressed:0,modeMismatchBlocked:0,lastEvent:null};chainEngine.invalidateStateSnapshot=()=>{};chainEngine.rememberAnotherDimension=()=>{};

  const qualification=anotherDimensionQualification(source,m.getQuote('GCHAIN'),s,{sourcePeakCents:75});assert.equal(qualification.ok,true);
  const ad=await st.createAnotherDimensionShadow(source,m.getQuote('GCHAIN'),{sourcePeakCents:75});assert.ok(ad);assert.equal(ad.entryConfig.universe.name,'Gemini');assert.equal(ad.entryConfig.universe.simulationPortfolioCapitalAuthority,false);
  const virtual=Object.create(SagittariusEngine.prototype);virtual.anotherDimensionRuntime=new Map();virtual.market=m;virtual.settings=s;
  m.setQuote({yesBid:80,yesAsk:81});let decision=virtual.evaluateAnotherDimensionExit(ad,m.getQuote('GCHAIN'));assert.equal(decision,null);await new Promise(r=>setTimeout(r,2));m.setQuote({yesBid:80,yesAsk:81});decision=virtual.evaluateAnotherDimensionExit(ad,m.getQuote('GCHAIN'));assert.ok(decision);decision=virtual.evaluateAnotherDimensionExit(ad,m.getQuote('GCHAIN'),{finalize:true});assert.ok(decision);assert.equal(decision.closeReason,ANOTHER_DIMENSION.profitableCloseReason);
  const closedAd=await st.closeAnotherDimensionShadow(ad,decision);assert.ok(closedAd.pnlCents>0);assert.ok(justicePromise,'durable profitable Gemini close must dispatch Justice Arrow');
  const handoff=await justicePromise;assert.equal(handoff.status,'OPENED');const arrow=handoff.entry;assert.equal(arrow.conceptName,'Sagittarius Justice Arrow');assert.equal(arrow.sourceFeeder,'Another Dimension');assert.equal(arrow.sourceTradeId,closedAd.id);assert.equal(arrow.entryConfig.profitAuthority,'ATHENA-X1');assert.equal(arrow.entryConfig.infinityBreak,undefined);assert.equal(arrow.entryConfig.aurora.frozen,true);

  const learning={async onHardStop(){},async stopGuardProfile(){return null;},async lossWatchdogProfile(){return null;},profitLearningState(){return null;},async observeProfitOpportunity(){return null;},profitRetentionProfileCached(){return{retentionRatio:.92,specificity:'cold_start',promoted:false,totalObservations:0,oneTickPullbacks:0,oneTickRecoveries:0,continuationRate:.5,collapseRate:.25,confidence:'low'};},async profitRetentionProfile(){return this.profitRetentionProfileCached();},async markProfitExit(){}};
  const guard=new ProfitGuard({db,kalshi:{},market:m,learning,getSettings:()=>s});
  m.setQuote({yesBid:86,yesAsk:87});let out=await guard.protect(await db.entryById(arrow.id));assert.equal(out.closed??false,false,'Justice Arrow must ignore first +1c-net Infinity-style opportunity');
  let closedAt=null;for(const bid of [96,86,95]){await new Promise(r=>setTimeout(r,2));m.setQuote({yesBid:bid,yesAsk:Math.min(100,bid+1)});out=await guard.protect(await db.entryById(arrow.id));if(out.closed===true){closedAt=bid;break;}}
  assert.equal(closedAt,95,'ATHENA-X1 must finish the Gemini-to-Justice chain on the second distinct profit spike');const finalArrow=await db.entryById(arrow.id);assert.equal(finalArrow.status,'closed');assert.equal(finalArrow.closeReason,'athena_x1_exit');assert.ok(finalArrow.pnlCents>0);assert.equal(finalArrow.remainingCount,0);
});

test('R63 shared SIM execution uses visible IOC depth deterministically, so Scarlet is not randomly rejected after hard safety passes',async()=>{
  const s=settings({scarletNeedleEnabled:true,scarletNeedleStakeCents:20_000,scarletNeedleMinEntryCents:70,scarletNeedleMaxEntryCents:89,simFillProbability:0,galacticExplosionEnabled:true});
  const parent={id:'scarlet-parent-r63',systemName:s.systemName,ownerId:s.ownerId,conceptName:'Crash Recovery Hunter',ticker:'SCAR63',eventTicker:'SCAR63',marketTitle:'SCAR63',mode:s.mode,status:'closed',remainingCount:0,entryPriceCents:75,exitPriceCents:84,pnlCents:500,closeReason:'infinity_break',closedAtMs:Date.now()-1000,openedAtMs:Date.now()-60_000,entryConfig:{side:'YES'}};
  const db=memoryDb([parent]),m=market(quote('SCAR63',84,85));
  const refreshGameClock=async(q)=>{const now=Date.now();return{gameClockState:{...q.gameClockState,phase:'CONFIRMED',confirmed:true,entryAuthorized:true,evidenceObservedAtMs:now,lastCheckedAtMs:now},gameStartTimeMs:q.gameStartTimeMs,liveStatus:'live'};};
  const st=new StrategyEngine({db,kalshi:{},market:m,learning:{},getSettings:()=>s,getLiveReady:()=>false,refreshGameClock,random:()=>1});
  const opened=await st.executeScarletContinuation(m.getQuote('SCAR63'),parent,{authorizationId:'SCARLET-CONTINUATION:scarlet-parent-r63:1',rootEntryId:parent.id,repeatIndex:1,maxRepeats:3,authorizedAtMs:Date.now()});
  assert.ok(opened);assert.equal(opened.conceptName,'Scarlet Needle');assert.equal(opened.status,'open');
  const source=await readFile(new URL('../src/strategy.mjs',import.meta.url),'utf8');assert.equal(source.includes('simulation_ioc_rejected'),false);assert.ok(source.includes("simulation_visible_ioc_fill"));
});

test('R63 complete Scarlet continuation chain runs profitable real Infinity parent -> Scarlet authorization -> deterministic SIM entry -> Infinity profit exit',async()=>{
  const s=settings({scarletNeedleEnabled:true,scarletNeedleStakeCents:20_000,scarletNeedleMinEntryCents:70,scarletNeedleMaxEntryCents:89,scarletNeedleMaxRepeats:3,simFillProbability:0,galacticExplosionEnabled:true,infinityBreakRequiredConfirmations:2});
  const parent={id:'scarlet-full-parent-r63',systemName:s.systemName,ownerId:s.ownerId,conceptName:'Crash Recovery Hunter',ticker:'SCARFULL',eventTicker:'SCARFULL',marketTitle:'SCARFULL',mode:s.mode,status:'closed',remainingCount:0,entryPriceCents:75,exitPriceCents:84,pnlCents:500,closeReason:'infinity_break',closedAtMs:Date.now()-1000,openedAtMs:Date.now()-60_000,entryConfig:{side:'YES'}};
  const db=memoryDb([parent]),m=market(quote('SCARFULL',84,85));
  const refreshGameClock=async(q)=>{const now=Date.now();return{gameClockState:{...q.gameClockState,version:'GCA2',phase:'CONFIRMED',confirmed:true,entryAuthorized:true,evidenceObservedAtMs:now,lastCheckedAtMs:now,authorizationReason:'r63_complete_scarlet_chain'},gameStartTimeMs:q.gameStartTimeMs,liveStatus:'live'};};
  const st=new StrategyEngine({db,kalshi:{},market:m,learning:{},getSettings:()=>s,getLiveReady:()=>false,refreshGameClock,random:()=>1});
  const engine=Object.create(SagittariusEngine.prototype);engine.settings=s;engine.db=db;engine.market=m;engine.strategy=st;engine.scarletContinuationInFlight=new Set();engine.scarletContinuationStats=null;engine.invalidateStateSnapshot=()=>{};
  const handoff=await engine.handleScarletContinuation(parent);assert.equal(handoff.status,'OPENED');const scarlet=handoff.entry;assert.ok(scarlet);assert.equal(scarlet.conceptName,'Scarlet Needle');assert.equal(scarlet.entryConfig.profitAuthority,INFINITY_BREAK.version);assert.equal(scarlet.entryConfig.aurora.frozen,true);
  const learning={async onHardStop(){},async stopGuardProfile(){return null;},async lossWatchdogProfile(){return null;},profitLearningState(){return null;},async observeProfitOpportunity(){return null;},profitRetentionProfileCached(){return{retentionRatio:.92,specificity:'cold_start',promoted:false,totalObservations:0,oneTickPullbacks:0,oneTickRecoveries:0,continuationRate:.5,collapseRate:.25,confidence:'low'};},async profitRetentionProfile(){return this.profitRetentionProfileCached();},async markProfitExit(){}};
  const guard=new ProfitGuard({db,kalshi:{},market:m,learning,getSettings:()=>s});
  m.setQuote({yesBid:90,yesAsk:91});let out=await guard.protect(await db.entryById(scarlet.id));assert.equal(out.closed??false,false);await new Promise(r=>setTimeout(r,2));m.setQuote({yesBid:89,yesAsk:90});out=await guard.protect(await db.entryById(scarlet.id));assert.equal(out.closed??false,false);await new Promise(r=>setTimeout(r,2));m.setQuote({yesBid:90,yesAsk:91});out=await guard.protect(await db.entryById(scarlet.id));assert.equal(out.closed,true);const closed=await db.entryById(scarlet.id);assert.equal(closed.status,'closed');assert.equal(closed.closeReason,'infinity_break');assert.ok(closed.pnlCents>0);assert.equal(closed.remainingCount,0);
});

test('R63 dashboard exposes Gemini as the shadow universe, Another Dimension as its full virtual Attack, and Justice Arrow as an Execution Attack',async()=>{
  const [html,app]=await Promise.all([readFile(new URL('../public/index.html',import.meta.url),'utf8'),readFile(new URL('../public/app.js',import.meta.url),'utf8')]);
  assert.ok(app.includes("legacy:'Sagittarius Justice Arrow'"));assert.ok(app.includes("legacy:'Gemini'"));assert.equal(html.includes('data-cosmo-filter="Another Dimension"'),false);assert.ok(html.includes('/app.js?v=R63GEMINI1'));assert.equal(html.includes('/app.js?v=R62ADJA1'),false);assert.ok(html.includes('GEMINI — ANOTHER DIMENSION TRADES'));assert.ok(html.includes('Virtual +1c Profit Authority'));assert.ok(html.includes('<th>Profit Authority</th>'));assert.ok(html.includes('ATHENA-X1 with the same two-distinct-spike close doctrine'));assert.ok(app.includes('GEMINI / ANOTHER DIMENSION COMPLETED +1c NET WIN'));assert.ok(app.includes("e.entryConfig?.profitAuthority||e.entryConfig?.infinityBreak?.version"));
});

test('R63 Gemini and Justice Arrow settings migrate safely and PostgreSQL readback verifies the independent controls',async()=>{
  const defaults=originalSettings();
  assert.equal(defaults.geminiEnabled,false);assert.equal(defaults.justiceArrowEnabled,false);
  assert.equal(CANONICAL_BOOLEAN_SETTINGS.includes('geminiEnabled'),true);assert.equal(CANONICAL_BOOLEAN_SETTINGS.includes('anotherDimensionEnabled'),false);assert.equal(CANONICAL_BOOLEAN_SETTINGS.includes('justiceArrowEnabled'),true);
  assert.equal(CANONICAL_NUMERIC_SETTINGS.includes('geminiReferenceStakeCents'),true);assert.equal(CANONICAL_NUMERIC_SETTINGS.includes('geminiMinPriceCents'),true);assert.equal(CANONICAL_NUMERIC_SETTINGS.includes('geminiMaxPriceCents'),true);assert.equal(CANONICAL_NUMERIC_SETTINGS.includes('justiceArrowStakeCents'),true);assert.equal(CANONICAL_NUMERIC_SETTINGS.includes('justiceArrowMinEntryCents'),true);assert.equal(CANONICAL_NUMERIC_SETTINGS.includes('justiceArrowMaxEntryCents'),true);
  const legacy=sanitizeRuntimeSettings({systemName:'SAGITTARIUS',ownerId:'r62-owner',mode:'SIMULATION',engineActive:true},defaults);
  assert.equal(legacy.geminiEnabled,false);assert.equal(legacy.justiceArrowEnabled,false,'old persisted deployments must not silently enable a new real Attack');

  let persisted={...settings()};
  const db={
    async saveSettings(next){persisted=structuredClone(next);},
    async loadSettings(){return structuredClone(persisted);},
    async audit(){},
  };
  const engine=Object.create(SagittariusEngine.prototype);engine.settings={...persisted};engine.db=db;engine.settingsPersistence={version:'SETTINGS-PERSISTENCE-R1',lastVerifiedAtMs:0,lastKeys:[],lastValues:{},lastError:null};engine.invalidateStateSnapshot=()=>{};engine.requestScan=()=>{};engine.refreshFeederPriorityTickers=async()=>{};engine.refreshRecoveryPriorityTickers=async()=>{};engine.refreshCrashPriorityTickers=()=>{};
  const out=await engine.applySettingsPatch({geminiEnabled:true,geminiReferenceStakeCents:21000,geminiMinPriceCents:40,geminiMaxPriceCents:87,justiceArrowEnabled:true,justiceArrowStakeCents:23456,justiceArrowMinEntryCents:71,justiceArrowMaxEntryCents:88});
  assert.equal(out.geminiEnabled,true);assert.equal(out.geminiReferenceStakeCents,21000);assert.equal(out.geminiMinPriceCents,40);assert.equal(out.geminiMaxPriceCents,87);assert.equal(out.justiceArrowEnabled,true);assert.equal(out.justiceArrowStakeCents,23456);assert.equal(out.justiceArrowMinEntryCents,71);assert.equal(out.justiceArrowMaxEntryCents,88);
  assert.equal(persisted.justiceArrowStakeCents,23456);assert.equal(engine.settingsPersistence.lastError,null);assert.deepEqual(new Set(engine.settingsPersistence.lastKeys),new Set(['geminiEnabled','geminiReferenceStakeCents','geminiMinPriceCents','geminiMaxPriceCents','justiceArrowEnabled','justiceArrowStakeCents','justiceArrowMinEntryCents','justiceArrowMaxEntryCents']));
});

test('R63 Justice Arrow authority fails closed on owner or mode mismatch before any market or execution action',async()=>{
  const s=settings({justiceArrowEnabled:true});
  const base={id:'ad-authority-parent',systemName:s.systemName,ownerId:s.ownerId,conceptName:'Another Dimension',ticker:'JAUTH',eventTicker:'JAUTH',mode:s.mode,status:'closed',remainingCount:0,pnlCents:100,closeReason:ANOTHER_DIMENSION.profitableCloseReason,closedAtMs:Date.now()};
  const engine=Object.create(SagittariusEngine.prototype);engine.settings=s;engine.justiceArrowInFlight=new Set();engine.justiceArrowStats={version:SAGITTARIUS_JUSTICE_ARROW.version,eligible:0,authorized:0,attempted:0,opened:0,blocked:0,duplicateSuppressed:0,modeMismatchBlocked:0,lastEvent:null};
  engine.db=new Proxy({}, {get(){throw new Error('DB must not be reached before authority isolation rejects');}});engine.market=new Proxy({}, {get(){throw new Error('market must not be reached before authority isolation rejects');}});engine.strategy=new Proxy({}, {get(){throw new Error('strategy must not be reached before authority isolation rejects');}});
  let out=await engine.handleJusticeArrowContinuation({...base,ownerId:'other-owner'});assert.equal(out.status,'BLOCKED');assert.equal(out.reason,'owner_or_system_mismatch');
  out=await engine.handleJusticeArrowContinuation({...base,id:'ad-mode-parent',mode:'LIVE'});assert.equal(out.status,'BLOCKED');assert.equal(out.reason,'mode_changed_since_shadow_close');assert.equal(engine.justiceArrowStats.modeMismatchBlocked,1);
});

test('R63 Another Dimension quote observer stays memory-only and queues durable work behind a bounded single worker',async()=>{
  const s=settings({geminiEnabled:true,geminiReferenceStakeCents:20_000,geminiMinPriceCents:35,geminiMaxPriceCents:89,maxSpreadCents:3});
  const source={...shadow({id:'ad-hot-path-source',ticker:'ADHOT',conceptName:'Pegasus',entryPriceCents:70}),systemName:s.systemName,ownerId:s.ownerId,mode:s.mode,peakPriceCents:70};
  const q=quote('ADHOT',74,75);let queued=null;
  const engine=Object.create(SagittariusEngine.prototype);engine.settings=s;engine.strategy={};engine.market=market(q);engine.activeCosmosByTicker=new Map([['ADHOT',[source]]]);engine.anotherDimensionSourcePeaks=new Map([[source.id,75]]);engine.anotherDimensionOpenByTicker=new Map();engine.anotherDimensionRuntime=new Map();engine.anotherDimensionRecent=new Map();engine.geminiOpenAttemptBookMs=new Map();engine.anotherDimensionStats={version:ANOTHER_DIMENSION.version,qualified:0,opened:0,profitClosed:0,lossClosed:0,realizedPnlCents:0,blocked:0,lastEvent:null};
  engine.anotherDimensionQueue={maxConcurrency:1,enqueue(key,task){queued={key,task};return true;},snapshot(){return{maxConcurrency:1};}};
  engine.db=new Proxy({}, {get(){throw new Error('quote observer must not touch SQL before queued transition runs');}});
  engine.observeAnotherDimensionQuote(q);
  assert.ok(queued);assert.equal(queued.key,'open:ADHOT');assert.equal(typeof queued.task,'function');assert.equal(engine.anotherDimensionStats.qualified,1);assert.equal(engine.anotherDimensionQueue.snapshot().maxConcurrency,1);assert.equal(ANOTHER_DIMENSION.maximumRecentResults,100);
  const sourceText=await readFile(new URL('../src/engine.mjs',import.meta.url),'utf8');assert.ok(sourceText.includes('this.anotherDimensionQueue = new CoalescingWorkQueue({\n      maxConcurrency:1'));assert.ok(sourceText.includes('this.justiceArrowQueue = new CoalescingWorkQueue({\n      maxConcurrency:1'));assert.ok(sourceText.includes('geminiOpenAttemptBookMs'));assert.equal(sourceText.includes('simulation_ioc_rejected'),false);
});

test('R63 Gemini same-book admission deduplicates quote storms before durable work and keeps the runtime map bounded',()=>{
  const s=settings({geminiEnabled:true,geminiReferenceStakeCents:20_000,geminiMinPriceCents:35,geminiMaxPriceCents:89,maxSpreadCents:3});
  const source={...shadow({id:'gemini-storm-source',ticker:'GSTORM',conceptName:'Pegasus',entryPriceCents:70}),systemName:s.systemName,ownerId:s.ownerId,mode:s.mode,peakPriceCents:70};
  const fixedMs=Date.now(),q=quote('GSTORM',74,75,fixedMs);let enqueues=0;
  const stableMarket=market(q);stableMarket.getBook=()=>({updatedAtMs:fixedMs,yesBids:[{priceCents:74,count:10_000}],noBids:[{priceCents:25,count:10_000}]});
  const engine=Object.create(SagittariusEngine.prototype);engine.settings=s;engine.strategy={};engine.market=stableMarket;engine.activeCosmosByTicker=new Map([['GSTORM',[source]]]);engine.anotherDimensionSourcePeaks=new Map([[source.id,75]]);engine.anotherDimensionOpenByTicker=new Map();engine.anotherDimensionRuntime=new Map();engine.anotherDimensionRecent=new Map();engine.geminiOpenAttemptBookMs=new Map();engine.anotherDimensionStats={version:ANOTHER_DIMENSION.version,qualified:0,opened:0,profitClosed:0,lossClosed:0,realizedPnlCents:0,blocked:0,lastEvent:null};engine.anotherDimensionQueue={enqueue(){enqueues+=1;return true;}};
  for(let i=0;i<10_000;i++)engine.observeAnotherDimensionQuote(q);
  assert.equal(enqueues,1);assert.equal(engine.anotherDimensionStats.qualified,1);assert.equal(engine.geminiOpenAttemptBookMs.size,1);assert.ok(engine.geminiOpenAttemptBookMs.size<=2048);
});

test('R63 Justice Arrow refuses a profitable shadow authority when the fresh executable ask is outside its own operator band',async()=>{
  const s=settings({justiceArrowEnabled:true,justiceArrowMinEntryCents:70,justiceArrowMaxEntryCents:89,galacticExplosionEnabled:true});
  const parent={id:'ad-band-parent',systemName:s.systemName,ownerId:s.ownerId,conceptName:'Another Dimension',sourceFeeder:'Pegasus',sourceTradeId:'cosmo-band',ticker:'JABAND',eventTicker:'JABAND',marketTitle:'JABAND',mode:s.mode,status:'closed',entryPriceCents:65,exitPriceCents:69,currentPriceCents:69,peakPriceCents:69,count:100,remainingCount:0,pnlCents:100,entryFeeCents:200,exitFeeCents:200,closeReason:ANOTHER_DIMENSION.profitableCloseReason,openedAtMs:Date.now()-60_000,closedAtMs:Date.now()-1000,updatedAtMs:Date.now()-1000,entryConfig:{shadowAttack:{version:ANOTHER_DIMENSION.version}}};
  const db=memoryDb([parent]),m=market(quote('JABAND',68,69));
  const refreshGameClock=async(q)=>({gameClockState:{...q.gameClockState,phase:'CONFIRMED',confirmed:true,entryAuthorized:true,evidenceObservedAtMs:Date.now(),lastCheckedAtMs:Date.now()},gameStartTimeMs:q.gameStartTimeMs,liveStatus:'live'});
  const st=new StrategyEngine({db,kalshi:{},market:m,learning:{},getSettings:()=>s,getLiveReady:()=>false,refreshGameClock,random:()=>0});
  const opened=await st.executeJusticeArrowContinuation(m.getQuote('JABAND'),parent,{authorizationId:'JUSTICE-ARROW:ad-band-parent:1',authorizedAtMs:Date.now()});assert.equal(opened,null);assert.equal((await db.openEntries()).some(e=>e.conceptName==='Sagittarius Justice Arrow'),false);
});

test('R63 completed Justice Arrow ATHENA-X1 profit is persisted as a successful opportunity rather than expired telemetry',async()=>{
  const s=settings({justiceArrowEnabled:true});const db=memoryDb();const authorizationId='JUSTICE-ARROW:ad-outcome-parent:1';
  await db.upsertOpportunityEpisode({id:authorizationId,systemName:s.systemName,sourceRelease:RELEASE,ticker:'JAOUT',eventTicker:'JAOUT',attackSelected:'Sagittarius Justice Arrow',trackingComplete:false,updatedAtMs:Date.now()});
  const entry={id:'justice-outcome',systemName:s.systemName,ownerId:s.ownerId,conceptName:'Sagittarius Justice Arrow',ticker:'JAOUT',eventTicker:'JAOUT',mode:'SIMULATION',status:'closed',entryPriceCents:70,exitPriceCents:84,currentPriceCents:84,peakPriceCents:90,count:100,remainingCount:0,pnlCents:1000,maeCents:2,openedAtMs:Date.now()-60_000,closedAtMs:Date.now(),closeReason:'athena_x1_exit',entryConfig:{profitAuthority:'ATHENA-X1',athenaFire:{boltId:authorizationId,economicTarget:{netPerOriginalContractCents:2}},economicTarget:{netPerOriginalContractCents:2}}};
  const guard=new ProfitGuard({db,kalshi:{},market:{},learning:{},getSettings:()=>s});const completed=await guard.completeOpportunityEpisode(entry,{closedAtMs:entry.closedAtMs});
  assert.equal(completed.outcomeLabel,'CLEAN_BOLT');assert.equal(completed.outcome.athenaX1,true);assert.equal(completed.outcome.infinityBreak,false);assert.equal(completed.outcome.targetNetPerOriginalContractCents,2);assert.equal(completed.outcome.realizedPnlCents,1000);
});
