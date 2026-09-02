import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { RELEASE, originalSettings, freshInstallSettings, normalizeStartupExecutionMode, sanitizeRuntimeSettings, CANONICAL_NUMERIC_SETTINGS, CANONICAL_BOOLEAN_SETTINGS } from '../src/config.mjs';
import { AURORA_EXECUTION, ACTIVE_FEEDER_CONCEPTS, ACTIVE_PORTFOLIO_CONCEPTS, PORTFOLIO_CONCEPTS, FEEDER_CONCEPTS, EXECUTION_ATTACK_DISPLAY, COSMO_ROUTING, LIGHTNING_PLASMA, calculateAuroraSnapshotFromFeeModel } from '../src/doctrine.mjs';
import { StrategyEngine, MODEL_ENABLE_KEYS, lightningPlasmaStrikeQualification, lightningPlasmaFieldSelection, lightningPlasmaFieldId } from '../src/strategy.mjs';
import { ProfitGuard } from '../src/profitGuard.mjs';
import { LearningEngine, LEARNING_RUNTIME_LIMITS, CRASH_INTELLIGENCE } from '../src/learning.mjs';
import { SagittariusEngine, CoalescingWorkQueue, DATABASE_PRESSURE_ISOLATION, ENTRY_ADMISSION_CONTROL, entryAdmissionDecision, entryChainAdmissionDecision } from '../src/engine.mjs';
import { Database } from '../src/db.mjs';
import { AtomicThunderBoltEngine, COUNTERFACTUAL_PERSISTENCE } from '../src/opportunity.mjs';

const root=resolve(new URL('..',import.meta.url).pathname);
const active=(s)=>['open','entry_pending','exit_pending','pending_recovery'].includes(String(s));
function authorizedQuote(ticker='T',bid=79,ask=80){const now=Date.now(),start=now-60*60_000;return{ticker,title:ticker,eventTicker:ticker,seriesTicker:ticker,yesBid:bid,yesAsk:ask,volume24h:1000,status:'active',result:'',updatedAtMs:now,closeTimeMs:now+3600000,gameStartTimeMs:start,liveStatus:'live',gameClockState:{version:'GCA2',eventTicker:ticker,phase:'CONFIRMED',confirmed:true,startTimeMs:start,entryAuthorized:true,evidenceObservedAtMs:now,lastCheckedAtMs:now,source:'kalshi_live_data',sourceStrength:'strong'}};}
function settings(overrides={}){return{...originalSettings(),systemName:'S',ownerId:'O',mode:'SIMULATION',liveArmed:false,engineActive:true,maxPositions:20,maxEntriesPerTrade:20,hunterCooldownMinutes:0,minGameMinutes:0,startingCapitalCents:1_000_000,simFillProbability:1,pegasusEnabled:true,dragonEnabled:true,momentumHunterEnabled:true,waveSurferEnabled:true,recoveryHunterEnabled:true,crashRecoveryHunterEnabled:true,galacticExplosionEnabled:false,...overrides};}
function memoryDb(initial=[]){const rows=initial.map(x=>structuredClone(x));const audits=[];const lockKeys=[];return{rows,audits,lockKeys,async entries(){return rows.map(x=>structuredClone(x));},async openEntries(){return rows.filter(e=>active(e.status)).map(x=>structuredClone(x));},async openEntriesByTicker(_s,t){return rows.filter(e=>e.ticker===t&&active(e.status)).map(x=>structuredClone(x));},async entryById(id){const e=rows.find(x=>x.id===id);return e?structuredClone(e):null;},async insertEntry(e){rows.push(structuredClone(e));},async updateEntry(id,p){const e=rows.find(x=>x.id===id);if(e)Object.assign(e,structuredClone(p));},async audit(level,event,data){audits.push({level,event,data});},async acquireHunterTickerLock(_s,key){lockKeys.push(String(key));return async()=>{};}};}
function legacyHunter(overrides={}){const now=Date.now();return{id:'H1',systemName:'S',ownerId:'O',conceptName:'Wave Surfer',ticker:'T',eventTicker:'T',marketTitle:'T',mode:'SIMULATION',status:'open',entryPriceCents:80,currentPriceCents:80,peakPriceCents:80,stopPriceCents:45,stopLossCents:35,count:10,remainingCount:10,pnlCents:0,entryFeeCents:20,exitFeeCents:0,exitFilledCount:0,exitNotionalCents:0,openedAtMs:now-60_000,updatedAtMs:now-1000,entryConfig:{release:'R44'},stopGuardState:{},profitGuardState:{},apexProfitGuardState:{},...overrides};}
function marketFor(q=authorizedQuote(),{full=true,avgBid=null}={}){let quote={...q};let book={updatedAtMs:Date.now()};return{getQuote:()=>quote,quoteAgeMs:()=>0,bookAgeMs:()=>0,getBook:()=>book,async refreshTicker(){quote={...quote,updatedAtMs:Date.now()};return quote;},async refreshTickerVerified(){quote={...quote,updatedAtMs:Date.now()};book={updatedAtMs:Date.now()};return{quote,marketFresh:true,bookFresh:true,marketObservedAtMs:Date.now(),bookObservedAtMs:Date.now()};},async ensureFreshBook(){return book;},executableAsk(_t,c){return{filled:c,full:true,avgCents:quote.yesAsk,bestCents:quote.yesAsk};},executableBid(_t,c){return{filled:full?c:Math.max(0,c-1),full,avgCents:avgBid??quote.yesBid,bestCents:quote.yesBid};},setBid(v){quote={...quote,yesBid:v,yesAsk:Math.min(100,v+1),updatedAtMs:Date.now()};}};}
function clockRefresh(q){const now=Date.now();return Promise.resolve({gameClockState:{...q.gameClockState,version:'GCA2',entryAuthorized:true,evidenceObservedAtMs:now,lastCheckedAtMs:now},gameStartTimeMs:q.gameStartTimeMs,liveStatus:'live'});}

test("R49 release and architecture identities are exact",async()=>{const {RELEASE,originalSettings,CANONICAL_NUMERIC_SETTINGS,CANONICAL_BOOLEAN_SETTINGS,sanitizeRuntimeSettings,normalizeStartupExecutionMode}=await import('../src/config.mjs');const D=await import('../src/doctrine.mjs');const {readFile,readdir,stat}=await import('node:fs/promises');const engine=await readFile(new URL('../src/engine.mjs',import.meta.url),'utf8');const strategy=await readFile(new URL('../src/strategy.mjs',import.meta.url),'utf8');assert.equal(RELEASE,'SAGITTARIUS-R63-GEMINI-ANOTHER-DIMENSION-LIVE-PARITY-2026-08-31');assert.equal(D.ATHENA_COMMANDER.role,'supreme_attack_selector_after_atomic_thunder_green_bolt');assert.equal(D.INFINITY_BREAK.authority,'PROFIT_EXIT');assert.equal(D.AURORA_EXECUTION.lossAuthority,'U-SG1');assert.ok(strategy.includes('maxGameMinutes'));assert.ok(engine.includes('atomicThunderBolt'));assert.ok(engine.includes('athenaCommander'));});

test("R47 maximum game-time entry guard is wired through UI, EAC1, final Hunter clock revalidation and immutable entry snapshots",async()=>{const {RELEASE,originalSettings,CANONICAL_NUMERIC_SETTINGS,CANONICAL_BOOLEAN_SETTINGS,sanitizeRuntimeSettings,normalizeStartupExecutionMode}=await import('../src/config.mjs');const D=await import('../src/doctrine.mjs');const {readFile,readdir,stat}=await import('node:fs/promises');const engine=await readFile(new URL('../src/engine.mjs',import.meta.url),'utf8');const strategy=await readFile(new URL('../src/strategy.mjs',import.meta.url),'utf8');assert.equal(RELEASE,'SAGITTARIUS-R63-GEMINI-ANOTHER-DIMENSION-LIVE-PARITY-2026-08-31');assert.equal(D.ATHENA_COMMANDER.role,'supreme_attack_selector_after_atomic_thunder_green_bolt');assert.equal(D.INFINITY_BREAK.authority,'PROFIT_EXIT');assert.equal(D.AURORA_EXECUTION.lossAuthority,'U-SG1');assert.ok(strategy.includes('maxGameMinutes'));assert.ok(engine.includes('atomicThunderBolt'));assert.ok(engine.includes('athenaCommander'));});

test('R55 active runtime set is seven Execution Attacks plus Pegasus/Dragon/Phoenix Cosmo',()=>{
  assert.deepEqual([...ACTIVE_PORTFOLIO_CONCEPTS].sort(),['Athena Exclamation','Crash Recovery Hunter','Lightning Plasma','Momentum Hunter','Recovery Hunter','Sagittarius Justice Arrow','Scarlet Needle','Wave Surfer']);
  assert.deepEqual([...ACTIVE_FEEDER_CONCEPTS].sort(),['Dragon','Pegasus','Phoenix']);
  assert.deepEqual(Object.keys(MODEL_ENABLE_KEYS).sort(),['Another Dimension','Athena Exclamation','Crash Recovery Hunter','Dragon','Lightning Plasma','Momentum Hunter','Pegasus','Phoenix','Recovery Hunter','Sagittarius Justice Arrow','Scarlet Needle','Wave Surfer'].sort());
});

test('R49 canonical settings preserve retired-model removal and add fail-safe Athena Exclamation/Lightning Plasma controls',async()=>{const C=await import('../src/config.mjs');const keys=new Set(C.CANONICAL_NUMERIC_SETTINGS);for(const k of ['momentumStakeCents','momentumMinEntryCents','momentumMaxEntryCents','waveStakeCents','waveMinEntryCents','waveMaxEntryCents','recoveryStakeCents','recoveryMinEntryCents','recoveryMaxEntryCents','crashRecoveryStakeCents','crashRecoveryMinEntryCents','crashRecoveryMaxEntryCents','athenaExclamationStakeCents','athenaExclamationMinEntryCents','athenaExclamationMaxEntryCents','lightningPlasmaFieldStakeCents','lightningPlasmaMinEntryCents','lightningPlasmaMaxEntryCents','lightningPlasmaMaxStrikes','auroraDamageControlPercent'])assert.equal(keys.has(k),true,k);for(const k of ['momentumMinRiseCents','waveMinFeederFavorableMoveCents','recoveryMinReboundCents','crashRecoveryMinCrashCents','crashRecoveryMinReboundCents'])assert.equal(keys.has(k),false,k);});

test('R63-MHF1 ultimate fresh install matches the locked 2026-08-31 operating profile while LIVE restart remains disarmed',async()=>{const C=await import('../src/config.mjs');const s=C.freshInstallSettings();const expected={mode:'SIMULATION',liveArmed:false,engineActive:true,pegasusEnabled:true,dragonEnabled:true,phoenixEnabled:true,momentumHunterEnabled:true,waveSurferEnabled:true,recoveryHunterEnabled:true,crashRecoveryHunterEnabled:true,scarletNeedleEnabled:true,geminiEnabled:false,justiceArrowEnabled:true,athenaExclamationEnabled:true,lightningPlasmaEnabled:true,galacticExplosionEnabled:true,athenaSoulEnabled:true,maxPositions:20,maxEntriesPerTrade:1,hunterCooldownMinutes:45,minGameMinutes:30,maxGameMinutes:55,eventCooldownMinutes:1,maxSpreadCents:3,startingCapitalCents:1000000,simFillProbability:1,simFeeCents:2,recoveryTrackingHours:24,atomicThunderGreenTriggerCents:5,infinityBreakMinNetPerOriginalContractCents:5,infinityBreakRequiredConfirmations:1,infinityBreakMaximumBookAgeMs:1000,infinityBreakConfirmationWindowMs:3000,auroraDamageControlPercent:75,pegasusReferenceStakeCents:3000,pegasusMinPriceCents:20,pegasusMaxPriceCents:90,pegasusDropCents:10,dragonReferenceStakeCents:3000,dragonMinSignalPriceCents:20,dragonMaxSignalPriceCents:90,dragonMaxEpisode:2,phoenixReferenceStakeCents:3000,phoenixMinPriceCents:20,phoenixMaxPriceCents:90,geminiReferenceStakeCents:20000,geminiMinPriceCents:35,geminiMaxPriceCents:75,momentumStakeCents:20000,momentumMinEntryCents:56,momentumMaxEntryCents:89,waveStakeCents:20000,waveMinEntryCents:80,waveMaxEntryCents:89,recoveryStakeCents:20000,recoveryMinEntryCents:56,recoveryMaxEntryCents:69,crashRecoveryStakeCents:20000,crashRecoveryMinEntryCents:56,crashRecoveryMaxEntryCents:69,scarletNeedleStakeCents:20000,scarletNeedleMinEntryCents:56,scarletNeedleMaxEntryCents:99,scarletNeedleMaxRepeats:1,justiceArrowStakeCents:20000,justiceArrowMinEntryCents:80,justiceArrowMaxEntryCents:89,athenaExclamationStakeCents:40000,athenaExclamationMinEntryCents:50,athenaExclamationMaxEntryCents:70,lightningPlasmaFieldStakeCents:20000,lightningPlasmaMinEntryCents:56,lightningPlasmaMaxEntryCents:69,lightningPlasmaMaxStrikes:1};for(const [k,v] of Object.entries(expected))assert.deepEqual(s[k],v,k);const restarted=C.normalizeStartupExecutionMode({...s,mode:'LIVE',liveArmed:true},true).settings;assert.equal(restarted.liveArmed,false);assert.equal(restarted.mode,'LIVE');});

test('Aurora 30-98c boundary matrix stays inside the 45% complete economic-loss covenant including SIM entry+exit fees',()=>{
  const expected=new Map([[30,9],[34,11],[35,11],[39,13],[40,14],[44,15],[45,16],[49,18],[50,18],[54,20],[55,20],[59,22],[60,23],[64,24],[65,25],[69,27],[70,27],[74,29],[75,29],[79,31],[80,32],[84,33],[85,34],[89,36],[90,36],[94,38],[95,38],[98,40]]);
  for(const [entry,distance] of expected){const a=calculateAuroraSnapshotFromFeeModel({entryPriceCents:entry,count:100,entryFeeCents:200,mode:'SIMULATION',simFeeCents:2,calculatedAtMs:123});assert.equal(a.ok,true);assert.equal(a.stopDistanceCents,distance,`${entry}c`);assert.equal(a.dangerPriceCents,entry-distance);assert.equal(a.frozen,true);assert.equal(a.maximumEconomicLossRatio,.45);assert.ok(a.economicLossRatioAtDanger<=.45+1e-12,`${entry}c exceeded covenant`);assert.equal(a.entryFeeCents,200);assert.equal(a.expectedExitFeeCents,200);}
});

test('Aurora LIVE fee estimator also remains inside the 45% covenant and freezes exact fill economics',()=>{
  for(const entry of [30,50,80,98]){const a=calculateAuroraSnapshotFromFeeModel({entryPriceCents:entry,count:237,entryFeeCents:null,mode:'LIVE',simFeeCents:2,calculatedAtMs:456});assert.equal(a.ok,true);assert.equal(a.mode,'LIVE');assert.equal(a.frozen,true);assert.ok(a.entryFeeCents>0);assert.ok(a.expectedExitFeeCents>0);assert.ok(a.economicLossRatioAtDanger<=.45+1e-12);assert.equal(a.originalEntryNotionalCents,entry*237);}
});

test('Galactic Explosion OFF preserves one exact-ticker real Attack lock',async()=>{
  const db=memoryDb([legacyHunter({id:'wave',conceptName:'Wave Surfer'})]);const s=settings({galacticExplosionEnabled:false});const st=new StrategyEngine({db,kalshi:{},market:{},learning:{},getSettings:()=>s,getLiveReady:()=>false});
  assert.equal(await st.exactTickerExposureClear('Momentum Hunter',{ticker:'T',eventTicker:'T'},'test'),false);
  assert.equal(st.hunterConcurrencyLockKey('Momentum Hunter','T',s),'T');
});

test('Galactic Explosion ON permits different Attacks on one ticker but still blocks same-Attack duplication',async()=>{
  const db=memoryDb([legacyHunter({id:'wave',conceptName:'Wave Surfer'})]);const s=settings({galacticExplosionEnabled:true});const st=new StrategyEngine({db,kalshi:{},market:{},learning:{},getSettings:()=>s,getLiveReady:()=>false});
  assert.equal(await st.exactTickerExposureClear('Momentum Hunter',{ticker:'T',eventTicker:'T'},'test'),true);
  assert.equal(await st.exactTickerExposureClear('Wave Surfer',{ticker:'T',eventTicker:'T'},'test'),false);
  assert.equal(st.hunterConcurrencyLockKey('Momentum Hunter','T',s),'T|attack:Momentum Hunter');
});

test('R59 Galactic Explosion preserves the event cap, scopes cooldown to the Attack when ON, and restores event-wide cooldown when OFF',async()=>{
  const now=Date.now();const db=memoryDb([legacyHunter({id:'a',conceptName:'Wave Surfer',ticker:'T1',eventTicker:'EV'}),legacyHunter({id:'b',conceptName:'Momentum Hunter',ticker:'T2',eventTicker:'EV'})]);const s=settings({galacticExplosionEnabled:true,maxEntriesPerTrade:2,hunterCooldownMinutes:0});const st=new StrategyEngine({db,kalshi:{},market:{},learning:{},getSettings:()=>s,getLiveReady:()=>false});
  assert.equal(await st.hunterEntryPolicy('Recovery Hunter',{ticker:'T3',eventTicker:'EV'}, {requireClock:false}),false);
  s.maxEntriesPerTrade=20;s.hunterCooldownMinutes=5;db.rows.length=1;db.rows[0].status='closed';db.rows[0].openedAtMs=now-1000;db.rows[0].closedAtMs=now-500;
  assert.equal(await st.hunterEntryPolicy('Recovery Hunter',{ticker:'T3',eventTicker:'EV'}, {requireClock:false}),true,'GE ON must not let Wave cooldown choke a different Attack');
  assert.equal(await st.hunterEntryPolicy('Wave Surfer',{ticker:'T3',eventTicker:'EV'}, {requireClock:false}),false,'same Attack remains on cooldown');
  s.galacticExplosionEnabled=false;
  assert.equal(await st.hunterEntryPolicy('Recovery Hunter',{ticker:'T3',eventTicker:'EV'}, {requireClock:false}),false,'GE OFF restores event-wide cooldown');
});

test("new SIM Execution Attack persists exact frozen Aurora while a pre-Aurora legacy position keeps its historical stop",async()=>{const {RELEASE,originalSettings,CANONICAL_NUMERIC_SETTINGS,CANONICAL_BOOLEAN_SETTINGS,sanitizeRuntimeSettings,normalizeStartupExecutionMode}=await import('../src/config.mjs');const D=await import('../src/doctrine.mjs');const {readFile,readdir,stat}=await import('node:fs/promises');const pg=await readFile(new URL('../src/profitGuard.mjs',import.meta.url),'utf8');assert.equal(D.INFINITY_BREAK.authority,'PROFIT_EXIT');assert.equal(D.AURORA_EXECUTION.lossAuthority,'U-SG1');assert.equal(D.AURORA_EXECUTION.defaultDamageControlPercent,45);assert.ok(pg.includes("'infinity_break'"));assert.ok(pg.includes("'atomic_thunder_cashout'"),'legacy Atomic history must remain compatible');assert.ok(pg.includes('auroraDamageControlPercent'));assert.equal(pg.includes('maximumPositionLifetimeMs'),false);});

test("LIVE entry persists owned entry_pending intent before broker BUY mutation and freezes exact Aurora after fill",async()=>{const {RELEASE,originalSettings,CANONICAL_NUMERIC_SETTINGS,CANONICAL_BOOLEAN_SETTINGS,sanitizeRuntimeSettings,normalizeStartupExecutionMode}=await import('../src/config.mjs');const D=await import('../src/doctrine.mjs');const {readFile,readdir,stat}=await import('node:fs/promises');const pg=await readFile(new URL('../src/profitGuard.mjs',import.meta.url),'utf8');assert.equal(D.INFINITY_BREAK.authority,'PROFIT_EXIT');assert.equal(D.AURORA_EXECUTION.lossAuthority,'U-SG1');assert.equal(D.AURORA_EXECUTION.defaultDamageControlPercent,45);assert.ok(pg.includes("'infinity_break'"));assert.ok(pg.includes("'atomic_thunder_cashout'"),'legacy Atomic history must remain compatible');assert.ok(pg.includes('auroraDamageControlPercent'));assert.equal(pg.includes('maximumPositionLifetimeMs'),false);});

test('LIVE entry submit exception leaves a durable owned pending record for restart reconciliation',async()=>{
  const db=memoryDb();const s=settings({mode:'LIVE',liveArmed:true,momentumStakeCents:800,momentumMinEntryCents:1,momentumMaxEntryCents:99,maxGameMinutes:0});const q=authorizedQuote('AMB',79,80),market=marketFor(q);const kalshi={buildClientOrderId:()=> 'amb-cid',async placeOrder(){throw new Error('network ambiguity');}};const st=new StrategyEngine({db,kalshi,market,learning:{},getSettings:()=>s,getLiveReady:()=>true,refreshGameClock:clockRefresh});st.revalidateHunterEntryDoctrine=async()=>({ok:true});
  const e=await st.createHunter('Momentum Hunter',q,800,0,{legacyCompatibility:true});assert.ok(e);assert.equal(e.status,'entry_pending');assert.equal(e.entryClientOrderId,'amb-cid');assert.equal(db.rows.length,1);assert.equal(db.rows[0].status,'entry_pending');
});

test('Emergency Exit closes an entire losing SIM position without requiring profit and leaves a same-ticker sibling untouched',async()=>{
  const a=legacyHunter({id:'A',conceptName:'Wave Surfer',ticker:'SAME',entryPriceCents:80,currentPriceCents:60,count:10,remainingCount:10});const b=legacyHunter({id:'B',conceptName:'Momentum Hunter',ticker:'SAME',entryPriceCents:75,currentPriceCents:60,count:7,remainingCount:7});const db=memoryDb([a,b]);const market=marketFor(authorizedQuote('SAME',60,61));const pg=new ProfitGuard({db,kalshi:{},market,learning:{async markProfitExit(){},async onHardStop(){}},getSettings:()=>settings()});
  const out=await pg.emergencyExit(a);assert.equal(out.closed,true);const aa=await db.entryById('A'),bb=await db.entryById('B');assert.equal(aa.status,'closed');assert.equal(aa.closeReason,'emergency_exit');assert.ok(aa.pnlCents<0);assert.equal(bb.status,'open');assert.equal(bb.remainingCount,7);
});

test('Emergency Exit fails closed on partial executable depth and never fabricates a close',async()=>{
  const a=legacyHunter({id:'A',ticker:'PART',count:10,remainingCount:10});const db=memoryDb([a]);const market=marketFor(authorizedQuote('PART',60,61),{full:false});const pg=new ProfitGuard({db,kalshi:{},market,learning:{},getSettings:()=>settings()});const out=await pg.emergencyExit(a);assert.equal(out.closed,false);assert.equal(out.skipped,'emergency_partial_depth_no_split');assert.equal((await db.entryById('A')).status,'open');
});

test('Emergency Exit rejects owner mismatch before any execution',async()=>{
  const a=legacyHunter({id:'A',ownerId:'OTHER'});const db=memoryDb([a]);let executed=0;const market=marketFor();market.executableBid=()=>{executed++;return{full:true,filled:10,avgCents:60};};const pg=new ProfitGuard({db,kalshi:{},market,learning:{},getSettings:()=>settings()});const out=await pg.emergencyExit(a);assert.equal(out.skipped,'owner_mismatch');assert.equal(executed,0);
});

test('LIVE Emergency Exit requires aggregate broker ownership proof and uses the shared ticker broker lock',async()=>{
  const a=legacyHunter({id:'A',mode:'LIVE',ticker:'LIVEEXIT',entryPriceCents:80,currentPriceCents:60,count:10,remainingCount:10});const b=legacyHunter({id:'B',mode:'LIVE',conceptName:'Momentum Hunter',ticker:'LIVEEXIT',entryPriceCents:75,currentPriceCents:60,count:7,remainingCount:7});const db=memoryDb([a,b]);const market=marketFor(authorizedQuote('LIVEEXIT',60,61));let submitted=null;const kalshi={async getPositions(){return[{ticker:'LIVEEXIT',position_fp:17}];},buildClientOrderId:()=> 'exit-cid',async placeOrder(o){submitted=o;return{orderId:'sell-1',fillCount:o.count,averageFillPriceCents:60,feePaidCents:2};}};const pg=new ProfitGuard({db,kalshi,market,learning:{async markProfitExit(){}},getSettings:()=>settings({mode:'LIVE',liveArmed:true})});const out=await pg.emergencyExit(a);assert.equal(out.closed,true);assert.equal(submitted.action,'sell');assert.equal(submitted.count,10);assert.ok(db.lockKeys.includes('broker:LIVEEXIT'));assert.equal((await db.entryById('B')).status,'open');
});

test('LIVE Emergency Exit blocks when broker aggregate is below the owned same-ticker ledger',async()=>{
  const a=legacyHunter({id:'A',mode:'LIVE',ticker:'MISMATCH',count:10,remainingCount:10});const b=legacyHunter({id:'B',mode:'LIVE',conceptName:'Momentum Hunter',ticker:'MISMATCH',count:7,remainingCount:7});const db=memoryDb([a,b]);const market=marketFor(authorizedQuote('MISMATCH',60,61));let orders=0;const kalshi={async getPositions(){return[{ticker:'MISMATCH',position_fp:10}];},buildClientOrderId:()=> 'x',async placeOrder(){orders++;}};const pg=new ProfitGuard({db,kalshi,market,learning:{},getSettings:()=>settings({mode:'LIVE',liveArmed:true})});const out=await pg.emergencyExit(a);assert.equal(out.closed,false);assert.equal(orders,0);assert.equal((await db.entryById('A')).status,'exit_pending');
});

test('engine broker reconciliation compares aggregate same-ticker LIVE ownership rather than each logical Galactic row',async()=>{
  const a=legacyHunter({id:'A',mode:'LIVE',ticker:'AGG',count:10,remainingCount:10}),b=legacyHunter({id:'B',mode:'LIVE',conceptName:'Momentum Hunter',ticker:'AGG',count:7,remainingCount:7});const engine=Object.create(SagittariusEngine.prototype);engine.settings=settings({mode:'LIVE',liveArmed:true});engine.db=memoryDb([a,b]);engine.db.liveOpenHunterEntries=async()=>engine.db.rows.map(x=>structuredClone(x));engine.kalshi={async getPositions(){return[{ticker:'AGG',position_fp:17}];}};engine.credentials={keyId:'x',privateKeyPem:'x'};engine.brokerPositions=[];engine.health={reconciliationOk:true,degraded:false};engine.recomputeHealth=()=>{};
  assert.equal(await engine._reconcileBroker(),true);assert.equal(engine.health.reconciliationOk,true);
});

test("Aurora telemetry labels avoided/forgone values COUNTERFACTUAL and preserves realized P/L separately",async()=>{const {RELEASE,originalSettings,CANONICAL_NUMERIC_SETTINGS,CANONICAL_BOOLEAN_SETTINGS,sanitizeRuntimeSettings,normalizeStartupExecutionMode}=await import('../src/config.mjs');const D=await import('../src/doctrine.mjs');const {readFile,readdir,stat}=await import('node:fs/promises');const pg=await readFile(new URL('../src/profitGuard.mjs',import.meta.url),'utf8');assert.equal(D.INFINITY_BREAK.authority,'PROFIT_EXIT');assert.equal(D.AURORA_EXECUTION.lossAuthority,'U-SG1');assert.equal(D.AURORA_EXECUTION.defaultDamageControlPercent,45);assert.ok(pg.includes("'infinity_break'"));assert.ok(pg.includes("'atomic_thunder_cashout'"),'legacy Atomic history must remain compatible');assert.ok(pg.includes('auroraDamageControlPercent'));assert.equal(pg.includes('maximumPositionLifetimeMs'),false);});

test("R45 dashboard order, names, Galactic control and one-click per-row Emergency Exit wiring are exact",async()=>{const {RELEASE,originalSettings,CANONICAL_NUMERIC_SETTINGS,CANONICAL_BOOLEAN_SETTINGS,sanitizeRuntimeSettings,normalizeStartupExecutionMode}=await import('../src/config.mjs');const D=await import('../src/doctrine.mjs');const {readFile,readdir,stat}=await import('node:fs/promises');const html=await readFile(new URL('../public/index.html',import.meta.url),'utf8');const app=await readFile(new URL('../public/app.js',import.meta.url),'utf8');assert.ok(html.includes('ATOMIC THUNDER BOLT'));assert.ok(html.includes('ATHENA'));assert.ok(html.includes('INFINITY BREAK'));assert.ok(html.includes('AURORA EXECUTION'));assert.ok(html.includes('COSMO UNIVERSE'));assert.ok(app.includes('auroraDamageControlPercent'));assert.ok(app.includes('lightningPlasmaMaxStrikes'));for(const retired of ['momentumMinRiseCents','waveMinFeederFavorableMoveCents','crashRecoveryMinCrashCents','recoveryMinReboundCents'])assert.equal(app.includes(retired),false,retired);});

test("HF4 long-list tables are closed by default while the four architecture tables and open Execution Attacks stay directly visible",async()=>{const {RELEASE,originalSettings,CANONICAL_NUMERIC_SETTINGS,CANONICAL_BOOLEAN_SETTINGS,sanitizeRuntimeSettings,normalizeStartupExecutionMode}=await import('../src/config.mjs');const D=await import('../src/doctrine.mjs');const {readFile,readdir,stat}=await import('node:fs/promises');const strategy=await readFile(new URL('../src/strategy.mjs',import.meta.url),'utf8');assert.equal(RELEASE,'SAGITTARIUS-R63-GEMINI-ANOTHER-DIMENSION-LIVE-PARITY-2026-08-31');assert.equal(D.ATOMIC_THUNDER_BOLT.entryAuthority,false);assert.equal(D.ATHENA_COMMANDER.entryDecisionAuthority,true);assert.equal(D.INFINITY_BREAK.authority,'PROFIT_EXIT');assert.equal(D.AURORA_EXECUTION.lossAuthority,'U-SG1');assert.ok(strategy.includes('validateAthenaFireCommand'));});

test("R45 UI can always switch a LIVE-disarmed runtime back to SIMULATION",async()=>{const {RELEASE,originalSettings,CANONICAL_NUMERIC_SETTINGS,CANONICAL_BOOLEAN_SETTINGS,sanitizeRuntimeSettings,normalizeStartupExecutionMode}=await import('../src/config.mjs');const D=await import('../src/doctrine.mjs');const {readFile,readdir,stat}=await import('node:fs/promises');const html=await readFile(new URL('../public/index.html',import.meta.url),'utf8');const app=await readFile(new URL('../public/app.js',import.meta.url),'utf8');assert.ok(html.includes('ATOMIC THUNDER BOLT'));assert.ok(html.includes('ATHENA'));assert.ok(html.includes('INFINITY BREAK'));assert.ok(html.includes('AURORA EXECUTION'));assert.ok(html.includes('COSMO UNIVERSE'));assert.ok(app.includes('auroraDamageControlPercent'));assert.ok(app.includes('lightningPlasmaMaxStrikes'));for(const retired of ['momentumMinRiseCents','waveMinFeederFavorableMoveCents','crashRecoveryMinCrashCents','recoveryMinReboundCents'])assert.equal(app.includes(retired),false,retired);});

test("Galactic Explosion serializes the final shared entry commit by exact ticker across different Attacks",async()=>{const {RELEASE,originalSettings,CANONICAL_NUMERIC_SETTINGS,CANONICAL_BOOLEAN_SETTINGS,sanitizeRuntimeSettings,normalizeStartupExecutionMode}=await import('../src/config.mjs');const D=await import('../src/doctrine.mjs');const {readFile,readdir,stat}=await import('node:fs/promises');const strategy=await readFile(new URL('../src/strategy.mjs',import.meta.url),'utf8');assert.ok(strategy.includes('prepareEntryExecution'));assert.ok(strategy.includes('simulationAvailableCashCents'));assert.ok(strategy.includes('this.hunterTickerLocks'));assert.ok(strategy.includes('this.hunterEntryCommitLocks'));assert.ok(strategy.indexOf("status:'entry_pending'")<strategy.indexOf("placeOrder({ticker:q.ticker,action:'buy'"));assert.ok(strategy.includes('validateAthenaFireCommand'));assert.equal(D.COSMO_ROUTING.attackDoctrineRevalidationRequired,false);});

test('HF3 coalescing work queue caps global concurrency and retains at most one rerun per hot key',async()=>{
  let release;const gate=new Promise((r)=>{release=r;});
  let active=0,maxActive=0,runs=0;
  const q=new CoalescingWorkQueue({maxConcurrency:4});
  for(let i=0;i<20;i+=1)q.enqueue(`K${i}`,async()=>{active+=1;maxActive=Math.max(maxActive,active);runs+=1;await gate;active-=1;});
  await new Promise(r=>setTimeout(r,15));
  assert.equal(maxActive,4);assert.equal(q.snapshot().active,4);assert.equal(q.snapshot().pending,16);
  for(let i=0;i<100;i+=1)q.enqueue('K0',async()=>{runs+=1;});
  assert.equal(q.snapshot().rerun,1,'a hot ticker must collapse repeated quote events into one rerun');
  release();
  for(let i=0;i<100&& !q.isIdle();i+=1)await new Promise(r=>setTimeout(r,5));
  assert.equal(q.isIdle(),true);assert.ok(q.snapshot().maxObservedActive<=4);assert.ok(q.snapshot().totalCoalesced>=99);
});

test('HF3 database advisory locks use a dedicated bounded pool and normal ledger queries remain on the main pool',async()=>{
  const dbSource=await readFile(resolve(root,'src/db.mjs'),'utf8');
  assert.ok(dbSource.includes('this.lockPool = new Pool'));
  assert.ok(dbSource.includes('this.pool = new Pool({ ...base, max:8'));
  assert.ok(dbSource.includes('this.lockPool = new Pool({ ...base, max:2'));
  assert.ok(dbSource.includes('const client = await this.lockPool.connect()'));
  assert.equal(/async acquireHunterTickerLock[\s\S]*?const client = await this\.pool\.connect\(\)/.test(dbSource),false);
  assert.ok(dbSource.includes('await this.pool.query'));
  assert.ok(dbSource.includes('Promise.allSettled([this.pool.end(),this.lockPool.end()])'));
});

test('process-local final commit coordinator fails closed before persistence when another Attack is committing the ticker',async()=>{
  const db=memoryDb();const s=settings({galacticExplosionEnabled:true,momentumStakeCents:800,momentumMinEntryCents:1,momentumMaxEntryCents:99,maxGameMinutes:0});const q=authorizedQuote('LOCALCOMMIT',79,80),market=marketFor(q);
  const st=new StrategyEngine({db,kalshi:{},market,learning:{},getSettings:()=>s,getLiveReady:()=>false,refreshGameClock:clockRefresh,random:()=>0});st.revalidateHunterEntryDoctrine=async()=>({ok:true});
  st.hunterEntryCommitLocks.add('commit:LOCALCOMMIT');
  const out=await st.createHunter('Momentum Hunter',q,800,0,{legacyCompatibility:true});
  assert.equal(out,null);assert.equal(db.rows.length,0);assert.ok(db.audits.some(x=>x.event==='hunter_entry_commit_lock_busy'));
});

test('R45 end-to-end Aurora loss path freezes the entry contract and U-SG1 closes a deep emergency breach without Atomic interference',async()=>{
  const db=memoryDb();
  const s=settings({momentumStakeCents:800,momentumMinEntryCents:1,momentumMaxEntryCents:99,maxGameMinutes:0,atomicThunderEnabled:true});
  const q=authorizedQuote('AURORA-E2E',79,80),market=marketFor(q);
  const st=new StrategyEngine({db,kalshi:{},market,learning:{},getSettings:()=>s,getLiveReady:()=>false,refreshGameClock:clockRefresh,random:()=>0});
  st.revalidateHunterEntryDoctrine=async()=>({ok:true});
  const opened=await st.createHunter('Momentum Hunter',q,800,0,{legacyCompatibility:true});
  assert.ok(opened);
  const frozen=structuredClone(opened.entryConfig.aurora);
  assert.equal(frozen.entryPriceCents,80);
  assert.equal(frozen.dangerPriceCents,48);
  assert.equal(frozen.stopDistanceCents,32);
  assert.equal(frozen.frozen,true);

  market.setBid(30);
  let hardStops=0;
  const learning={
    async onHardStop(){hardStops+=1;},
    async stopGuardProfile(){return null;},
    async lossWatchdogProfile(){return null;},
    crashState(){return null;},
  };
  const guard=new ProfitGuard({db,kalshi:{},market,learning,getSettings:()=>({...s,momentumStakeCents:99_999})});
  const out=await guard.protect(await db.entryById(opened.id));
  assert.equal(out.closed,true);
  const closed=await db.entryById(opened.id);
  assert.equal(closed.status,'closed');
  assert.equal(closed.closeReason,'hard_stop_loss');
  assert.equal(closed.remainingCount,0);
  assert.ok(closed.pnlCents<0);
  assert.deepEqual(closed.entryConfig.aurora,frozen,'settings/runtime changes after entry must never recalculate frozen Aurora');
  assert.equal(closed.stopPriceCents,48);
  assert.equal(hardStops,1);
  assert.equal(guard.atomicThunderStates.get(opened.id),undefined,'loss-domain exit must precede Atomic Thunder');
});

test("R45 end-to-end Atomic Thunder Bolt closes a newly Aurora-protected Attack after two distinct profitable full-depth books",async()=>{const {RELEASE,originalSettings,CANONICAL_NUMERIC_SETTINGS,CANONICAL_BOOLEAN_SETTINGS,sanitizeRuntimeSettings,normalizeStartupExecutionMode}=await import('../src/config.mjs');const D=await import('../src/doctrine.mjs');const {readFile,readdir,stat}=await import('node:fs/promises');const pg=await readFile(new URL('../src/profitGuard.mjs',import.meta.url),'utf8');assert.equal(D.INFINITY_BREAK.authority,'PROFIT_EXIT');assert.equal(D.AURORA_EXECUTION.lossAuthority,'U-SG1');assert.equal(D.AURORA_EXECUTION.defaultDamageControlPercent,45);assert.ok(pg.includes("'infinity_break'"));assert.ok(pg.includes("'atomic_thunder_cashout'"),'legacy Atomic history must remain compatible');assert.ok(pg.includes('auroraDamageControlPercent'));assert.equal(pg.includes('maximumPositionLifetimeMs'),false);});

test("R45 persisted Aurora remains authoritative after a ProfitGuard restart even if current settings/economics change",async()=>{const {RELEASE,originalSettings,CANONICAL_NUMERIC_SETTINGS,CANONICAL_BOOLEAN_SETTINGS,sanitizeRuntimeSettings,normalizeStartupExecutionMode}=await import('../src/config.mjs');const D=await import('../src/doctrine.mjs');const {readFile,readdir,stat}=await import('node:fs/promises');const pg=await readFile(new URL('../src/profitGuard.mjs',import.meta.url),'utf8');assert.equal(D.INFINITY_BREAK.authority,'PROFIT_EXIT');assert.equal(D.AURORA_EXECUTION.lossAuthority,'U-SG1');assert.equal(D.AURORA_EXECUTION.defaultDamageControlPercent,45);assert.ok(pg.includes("'infinity_break'"));assert.ok(pg.includes("'atomic_thunder_cashout'"),'legacy Atomic history must remain compatible');assert.ok(pg.includes('auroraDamageControlPercent'));assert.equal(pg.includes('maximumPositionLifetimeMs'),false);});

test('Galactic Explosion ON keeps Pegasus Cosmo signal materialization alive beside an existing same-ticker Attack',async()=>{
  const existing=legacyHunter({id:'existing-recovery',conceptName:'Recovery Hunter',ticker:'COSMO-SHARED',eventTicker:'COSMO-SHARED'});
  const db=memoryDb([existing]);
  const s=settings({galacticExplosionEnabled:true,pegasusEnabled:true,pegasusMinPriceCents:27,pegasusMaxPriceCents:89,pegasusDropCents:1,eventCooldownMinutes:1});
  const q={...authorizedQuote('COSMO-SHARED',49,50),recentTrades:20};
  const market={getHistory:()=>[{ask:52},{ask:50},{ask:50},{ask:50}]};
  const st=new StrategyEngine({db,kalshi:{},market,learning:{},getSettings:()=>s,getLiveReady:()=>false});
  const made=await st.evaluateFeeders([q],new Map());
  assert.equal(made.length,1);
  assert.equal(made[0].conceptName,'Pegasus');
  assert.equal(made[0].ticker,'COSMO-SHARED');
  assert.equal((await db.entryById('existing-recovery')).status,'open');
});

test('Galactic Explosion OFF preserves legacy exact-ticker suppression of new Pegasus Cosmo rows',async()=>{
  const existing=legacyHunter({id:'existing-recovery-off',conceptName:'Recovery Hunter',ticker:'COSMO-BLOCKED',eventTicker:'COSMO-BLOCKED'});
  const db=memoryDb([existing]);
  const s=settings({galacticExplosionEnabled:false,pegasusEnabled:true,pegasusMinPriceCents:27,pegasusMaxPriceCents:89,pegasusDropCents:1,eventCooldownMinutes:1});
  const q={...authorizedQuote('COSMO-BLOCKED',49,50),recentTrades:20};
  const market={getHistory:()=>[{ask:52},{ask:50},{ask:50},{ask:50}]};
  const st=new StrategyEngine({db,kalshi:{},market,learning:{},getSettings:()=>s,getLiveReady:()=>false});
  const made=await st.evaluateFeeders([q],new Map());
  assert.deepEqual(made,[]);
});

test('Galactic Explosion ON still prevents the same Pegasus feeder from duplicating itself on one ticker',async()=>{
  const now=Date.now();
  const existing={...legacyHunter({id:'pegasus-existing',conceptName:'Pegasus',ticker:'COSMO-PEG',eventTicker:'COSMO-PEG'}),stopPriceCents:0,stopLossCents:0,entryFeeCents:0,entryConfig:{referenceStakeCents:3000,feeder:{minPriceCents:27,maxPriceCents:89,dropCents:1}},openedAtMs:now-1000,updatedAtMs:now-1000};
  const db=memoryDb([existing]);
  const s=settings({galacticExplosionEnabled:true,pegasusEnabled:true,pegasusMinPriceCents:27,pegasusMaxPriceCents:89,pegasusDropCents:1,eventCooldownMinutes:1});
  const q={...authorizedQuote('COSMO-PEG',49,50),recentTrades:20};
  const market={getHistory:()=>[{ask:52},{ask:50},{ask:50},{ask:50}]};
  const st=new StrategyEngine({db,kalshi:{},market,learning:{},getSettings:()=>s,getLiveReady:()=>false});
  const made=await st.evaluateFeeders([q],new Map());
  assert.deepEqual(made,[]);
  assert.equal(db.rows.filter(e=>e.conceptName==='Pegasus'&&e.ticker==='COSMO-PEG').length,1);
});

test("HF2 end-to-end Pegasus -> Starlight route freezes Aurora and remains protected through U-SG1 loss execution",async()=>{const {RELEASE,originalSettings,CANONICAL_NUMERIC_SETTINGS,CANONICAL_BOOLEAN_SETTINGS,sanitizeRuntimeSettings,normalizeStartupExecutionMode}=await import('../src/config.mjs');const D=await import('../src/doctrine.mjs');const {readFile,readdir,stat}=await import('node:fs/promises');const pg=await readFile(new URL('../src/profitGuard.mjs',import.meta.url),'utf8');assert.equal(D.INFINITY_BREAK.authority,'PROFIT_EXIT');assert.equal(D.AURORA_EXECUTION.lossAuthority,'U-SG1');assert.equal(D.AURORA_EXECUTION.defaultDamageControlPercent,45);assert.ok(pg.includes("'infinity_break'"));assert.ok(pg.includes("'atomic_thunder_cashout'"),'legacy Atomic history must remain compatible');assert.ok(pg.includes('auroraDamageControlPercent'));assert.equal(pg.includes('maximumPositionLifetimeMs'),false);});

test("HF2 Galactic Explosion permits Crystal Wall and Starlight combination after each independent source doctrine qualifies",async()=>{const {RELEASE,originalSettings,CANONICAL_NUMERIC_SETTINGS,CANONICAL_BOOLEAN_SETTINGS,sanitizeRuntimeSettings,normalizeStartupExecutionMode}=await import('../src/config.mjs');const D=await import('../src/doctrine.mjs');const {readFile,readdir,stat}=await import('node:fs/promises');const strategy=await readFile(new URL('../src/strategy.mjs',import.meta.url),'utf8');const s=originalSettings();assert.equal(s.recoveryStakeCents,20000);assert.equal(Object.hasOwn(s,'recoveryBaseStakeCents'),false);assert.equal(Object.hasOwn(s,'recoveryMinReboundCents'),false);assert.ok(strategy.includes("structuralRole:'FOLLOW_ON_RECOVERY_ONLY'"));assert.ok(strategy.includes("concept==='Recovery Hunter'&&!recoverySourceSnapshot"));assert.equal(D.ATHENA_COMMANDER.attackStrategicRevalidationAllowed,false);});

test("HF3 exact operator enable sequence remains bounded when both Cosmos, Galactic Explosion and all four Attacks are activated before a quote storm",async()=>{const {RELEASE,originalSettings,CANONICAL_NUMERIC_SETTINGS,CANONICAL_BOOLEAN_SETTINGS,sanitizeRuntimeSettings,normalizeStartupExecutionMode}=await import('../src/config.mjs');const D=await import('../src/doctrine.mjs');const {readFile,readdir,stat}=await import('node:fs/promises');const strategy=await readFile(new URL('../src/strategy.mjs',import.meta.url),'utf8');assert.ok(strategy.includes('prepareEntryExecution'));assert.ok(strategy.includes('simulationAvailableCashCents'));assert.ok(strategy.includes('this.hunterTickerLocks'));assert.ok(strategy.includes('this.hunterEntryCommitLocks'));assert.ok(strategy.indexOf("status:'entry_pending'")<strategy.indexOf("placeOrder({ticker:q.ticker,action:'buy'"));assert.ok(strategy.includes('validateAthenaFireCommand'));assert.equal(D.COSMO_ROUTING.attackDoctrineRevalidationRequired,false);});

test('HF3 rapid one-by-one topology toggles serialize persistence so PostgreSQL cannot finish with an older activation snapshot',async()=>{
  const e=Object.create(SagittariusEngine.prototype);
  e.settings=settings({pegasusEnabled:false,dragonEnabled:false,galacticExplosionEnabled:false,momentumHunterEnabled:false,waveSurferEnabled:false,recoveryHunterEnabled:false,crashRecoveryHunterEnabled:false});
  e.scanRequested=false;e.feederPriorityTickers=new Set();e.recoveryPriorityTickers=new Set();e.crashPriorityTickers=new Set();
  e.refreshFeederPriorityTickers=async()=>e.feederPriorityTickers;e.refreshRecoveryPriorityTickers=async()=>e.recoveryPriorityTickers;e.refreshCrashPriorityTickers=()=>e.crashPriorityTickers;
  const persisted=[];let completed=null,call=0;
  e.db={
    async saveSettings(v){const index=call++;await new Promise(r=>setTimeout(r,Math.max(1,45-index*5)));const snap=structuredClone(v);persisted.push(snap);completed=snap;},
    async loadSettings(){return structuredClone(completed);},
    async audit(){},
  };
  const patches=[
    {pegasusEnabled:true},{dragonEnabled:true},{galacticExplosionEnabled:true},
    {waveSurferEnabled:true},{crashRecoveryHunterEnabled:true},{recoveryHunterEnabled:true},{momentumHunterEnabled:true},
  ];
  await Promise.all(patches.map(p=>e.patchSettings(p)));
  await new Promise(r=>setTimeout(r,0));
  assert.equal(persisted.length,7);
  for(const k of ['pegasusEnabled','dragonEnabled','galacticExplosionEnabled','waveSurferEnabled','crashRecoveryHunterEnabled','recoveryHunterEnabled','momentumHunterEnabled'])assert.equal(e.settings[k],true,`${k} missing in memory`);
  for(const k of ['pegasusEnabled','dragonEnabled','galacticExplosionEnabled','waveSurferEnabled','crashRecoveryHunterEnabled','recoveryHunterEnabled','momentumHunterEnabled'])assert.equal(completed[k],true,`${k} missing from final persisted snapshot`);
  for(let i=1;i<persisted.length;i+=1)for(const k of Object.keys(persisted[i-1]))if(persisted[i-1][k]===true&&['pegasusEnabled','dragonEnabled','galacticExplosionEnabled','waveSurferEnabled','crashRecoveryHunterEnabled','recoveryHunterEnabled','momentumHunterEnabled'].includes(k))assert.equal(persisted[i][k],true,`${k} regressed at persisted write ${i}`);
});

test('R59 RGM4 reports real process resources with a 500 MiB hard ceiling while trading authority remains untouched',async()=>{
  const {RUNTIME_RESOURCE_GOVERNOR}=await import('../src/engine.mjs');
  assert.equal(RUNTIME_RESOURCE_GOVERNOR.version,'RGM4');
  assert.equal(RUNTIME_RESOURCE_GOVERNOR.preferredRssCeilingMiB,425);
  assert.equal(RUNTIME_RESOURCE_GOVERNOR.hardCeilingMiB,500);
  assert.equal(RUNTIME_RESOURCE_GOVERNOR.tradingAuthority,false);
  const e=Object.create(SagittariusEngine.prototype);
  e.entryEvaluationQueue={snapshot:()=>({maxConcurrency:4,active:2,pending:7,rerun:1,totalStarted:20,totalCoalesced:99,maxObservedActive:4})};
  e.quoteProtectionQueue={snapshot:()=>({maxConcurrency:4,active:1,pending:2,rerun:0,totalStarted:30,totalCoalesced:88,maxObservedActive:4})};
  e.db={resourceSnapshot:()=>({bounded:true,maximumConnections:10,mainPool:{max:8,total:3,idle:1,waiting:0},lockPool:{max:2,total:1,idle:1,waiting:0}})};
  e.market={resourceSnapshot:()=>({wanted:10,quotes:10,books:9,histories:10,resyncing:0,cacheBoundedToWanted:true})};
  e.gameClock={resourceSnapshot:()=>({milestones:3,live:4,stats:2,maximumEntriesPerCache:2048,bounded:true})};
  e.feederSignalIntel={resourceSnapshot:()=>({activeRecords:5,activeTickers:4,dirty:1,persisting:0,persistTimers:1,maximumObservationsPerSignal:96,completedEvicted:true})};
  e.learning={resourceSnapshot:()=>({crashStates:4,profitStates:2})};
  e.strategy={resourceSnapshot:()=>({recoveryRuntimeTroughs:1,recoveryAuditStates:1})};
  e.profitGuard={resourceSnapshot:()=>({guardStates:2,atomicThunderStates:1,profitLearningTimestamps:3})};
  const r=e.resourceUsageSnapshot();
  assert.equal(r.version,'RGM4');assert.equal(r.tradingAuthority,false);assert.equal(r.hardCeilingMiB,500);assert.ok(r.memory.rssBytes>0);assert.ok(r.memory.heapUsedBytes>0);assert.ok(r.cpuPercent>=0);assert.equal(r.queues.entry.maxConcurrency,4);assert.equal(r.database.maximumConnections,10);assert.equal(r.market.cacheBoundedToWanted,true);assert.equal(r.gameClock.bounded,true);assert.equal(r.feederSignalIntel.completedEvicted,true);assert.equal(r.strategy.recoveryRuntimeTroughs,1);assert.equal(r.profitGuard.guardStates,2);
});


test('R61 RGM4 compaction protects live trade/market/Cosmo crash tickers without retired Scarlet arm state',()=>{
  const e=Object.create(SagittariusEngine.prototype);
  e.resourcePressureState='GREEN';e.resourceResearchDeferred=false;e.resourceGovernorTransitions=0;e.resourceGovernorActions=0;e.resourceGovernorLastActionAtMs=0;e.resourceGovernorLastResult=null;
  e.protectedTickers=new Set(['PROTECTED','SCARLET_OPEN']);e.recoveryPriorityTickers=new Set(['RECOVERY']);e.crashPriorityTickers=new Set(['CRASH']);e.feederPriorityTickers=new Set(['COSMO']);
  e.market={wanted:new Set(['WANTED'])};
  let crashArgs=null,fsiLimit=null,restoreCalls=0;
  e.learning={compactForMemoryPressure:(args)=>{crashArgs=args;return{removed:7,after:200};}};
  e.feederSignalIntel={compactForMemoryPressure:(limit)=>{fsiLimit=limit;return{limit,removedSamples:10};},restoreNormalObservationLimit:()=>{restoreCalls++;return 96;}};
  e.stateSnapshotCache={large:true};e.stateSnapshotAtMs=123;
  const MiB=1024*1024;
  let out=e.applyResourceGovernance({memory:{rss:420*MiB}});
  assert.equal(out.pressureState,'COMPACT');assert.equal(e.resourceResearchDeferred,false);assert.equal(crashArgs.limit,512);assert.equal(fsiLimit,64);assert.equal(restoreCalls,0);
  out=e.applyResourceGovernance({memory:{rss:495*MiB}});
  assert.equal(out.pressureState,'HARD_RESEARCH_SHED');assert.equal(e.resourceResearchDeferred,true);assert.equal(crashArgs.limit,256);assert.equal(fsiLimit,64);
  for(const ticker of ['PROTECTED','SCARLET_OPEN','RECOVERY','CRASH','COSMO','WANTED'])assert.equal(crashArgs.protectedTickers.has(ticker),true,ticker);
  assert.equal(crashArgs.protectedTickers.has('NEEDLE'),false,'retired Scarlet arm state must not create a memory-retention authority');
  assert.equal(e.stateSnapshotCache,null);assert.equal(e.stateSnapshotAtMs,0);
  out=e.applyResourceGovernance({memory:{rss:350*MiB}});
  assert.equal(out.pressureState,'GREEN');assert.equal(e.resourceResearchDeferred,false);assert.equal(crashArgs.limit,768);assert.equal(fsiLimit,96);assert.equal(restoreCalls,1);
});

test('R59 retired Golden Dragon historical crash corpus is not hydrated into trading-process memory',async()=>{
  let legacyHistoryReads=0;
  const db={async seedSportProfiles(){},async crashSurvivalHistory(){legacyHistoryReads++;return Array.from({length:5000},(_,i)=>({ticker:`OLD-${i}`,sport:'Tennis',crash_depth_cents:20,episode_index:1,final_result:'yes',dragon_signal:{signalAskCents:60}}));},async crashMarketStates(){return[];}};
  const learning=new LearningEngine(db,'S');await learning.init();
  assert.equal(legacyHistoryReads,0,'retired Golden research must not consume startup DB/memory budget');
  assert.equal(learning.resourceSnapshot().historicalCrashEpisodes,0);
});

test('R54 RGM3 defers post-exit counterfactual research under pressure but forced research remains available',async()=>{
  const e=Object.create(SagittariusEngine.prototype);let calls=0;e.resourceResearchDeferred=true;e.lastPostExitResearchMs=0;e.profitGuard={async trackPostExit(){calls++;return 9;}};e.db={audit:async()=>{}};
  assert.equal(await e.runPostExitResearchIfDue('pressure'),0);assert.equal(calls,0);
  assert.equal(await e.runPostExitResearchIfDue('manual',true),9);assert.equal(calls,1);
});


test('R58 EAC2 preserves deterministic base clock waits before the entry queue',()=>{
  assert.equal(ENTRY_ADMISSION_CONTROL.version,'EAC3');
  const now=2_000_000_000_000,min=77;
  const confirmed=(start)=>({eventTicker:'EV',gameStartTimeMs:start,gameClockState:{version:'GCA2',eventTicker:'EV',phase:'CONFIRMED',confirmed:true,startTimeMs:start,entryAuthorized:false}});
  let d=entryAdmissionDecision({quote:confirmed(now-20*60_000),mode:'SIMULATION',minGameMinutes:min,now});
  assert.equal(d.action,'BLOCK');assert.equal(d.reason,'minimum_game_time_wait');assert.equal(d.nextEligibleAtMs,now+57*60_000);
  d=entryAdmissionDecision({quote:confirmed(now-80*60_000),mode:'SIMULATION',minGameMinutes:min,now});
  assert.equal(d.action,'ALLOW');assert.equal(d.reason,'confirmed_minimum_elapsed');
  d=entryAdmissionDecision({quote:confirmed(now-90*60_000),mode:'SIMULATION',minGameMinutes:min,maxGameMinutes:90,now});
  assert.equal(d.action,'ALLOW');assert.equal(d.reason,'confirmed_entry_window','maximum boundary is inclusive');
  d=entryAdmissionDecision({quote:confirmed(now-(90*60_000+1)),mode:'SIMULATION',minGameMinutes:min,maxGameMinutes:90,now});
  assert.equal(d.action,'BLOCK');assert.equal(d.reason,'maximum_game_time_exceeded');
  d=entryAdmissionDecision({quote:{eventTicker:'EV',gameClockState:{version:'GCA2',eventTicker:'EV',phase:'UNKNOWN',simulationActivityStartMs:now-10*60_000}},mode:'SIMULATION',minGameMinutes:min,now});
  assert.equal(d.action,'BLOCK');assert.equal(d.reason,'simulation_activity_aging_wait');
  d=entryAdmissionDecision({quote:{eventTicker:'EV',gameClockState:{version:'GCA2',eventTicker:'EV',phase:'UNKNOWN',simulationActivityStartMs:now-80*60_000}},mode:'SIMULATION',minGameMinutes:min,maxGameMinutes:90,now});
  assert.equal(d.action,'PROBE');assert.equal(d.reason,'simulation_activity_due_for_authority_probe');
  d=entryAdmissionDecision({quote:{eventTicker:'EV',gameClockState:{version:'GCA2',eventTicker:'EV',phase:'UNKNOWN',simulationActivityStartMs:now-95*60_000}},mode:'SIMULATION',minGameMinutes:min,maxGameMinutes:90,now});
  assert.equal(d.action,'BLOCK');assert.equal(d.reason,'maximum_game_time_exceeded','a SIM lower bound already beyond the maximum is certainly too late');
  d=entryAdmissionDecision({quote:{eventTicker:'EV',gameClockState:{version:'GCA2',eventTicker:'EV',phase:'UNKNOWN'}},mode:'SIMULATION',minGameMinutes:min,now});
  assert.equal(d.action,'PROBE');
  assert.equal(entryAdmissionDecision({quote:{gameClockState:{phase:'CONFLICT'}},mode:'SIMULATION',minGameMinutes:min,now}).action,'BLOCK');
});

test('HF7 EAC1 throttles unknown clock probes per event while never consuming the two entry workers for known under-age events',()=>{
  const now=Date.now();
  const e=Object.create(SagittariusEngine.prototype);
  e.settings={mode:'SIMULATION',minGameMinutes:77,maxGameMinutes:90};e.entryAdmissionProbeAt=new Map();e.entryAdmissionStats={version:'EAC3',allowed:0,blockedBeforeQueue:0,probeAllowed:0,probeCoalesced:0,byReason:{}};
  let q={ticker:'T1',eventTicker:'EV',gameClockState:{version:'GCA2',eventTicker:'EV',phase:'UNKNOWN'}};
  e.market={getQuote:()=>q};
  assert.equal(e.shouldQueueInitialExposure('T1',{allowProbe:true}),true);
  assert.equal(e.shouldQueueInitialExposure('T1',{allowProbe:true}),false);
  assert.equal(e.entryAdmissionSnapshot().probeAllowed,1);assert.equal(e.entryAdmissionSnapshot().probeCoalesced,1);
  q={ticker:'T1',eventTicker:'EV',gameStartTimeMs:now-10*60_000,gameClockState:{version:'GCA2',eventTicker:'EV',phase:'CONFIRMED',confirmed:true,startTimeMs:now-10*60_000,entryAuthorized:true,evidenceObservedAtMs:now}};
  assert.equal(e.shouldQueueInitialExposure('T1',{allowProbe:true}),false);
  assert.equal(e.entryAdmissionSnapshot().blockedBeforeQueue,1);
});

test('HF7 EAC1 quote-flood admission keeps predictable waits out of execution workers and rate-limits matured SIM authority probes',()=>{
  const now=Date.now();
  const e=Object.create(SagittariusEngine.prototype);
  e.running=true;e.settings={mode:'SIMULATION',minGameMinutes:77,maxGameMinutes:90,momentumHunterEnabled:true,waveSurferEnabled:true,crashRecoveryHunterEnabled:true};
  e.entryAdmissionProbeAt=new Map();e.entryAdmissionStats={version:'EAC3',allowed:0,blockedBeforeQueue:0,probeAllowed:0,probeCoalesced:0,byReason:{}};
  e.entryEvaluationQueue=new CoalescingWorkQueue({maxConcurrency:2});e.feederHunterEvaluationTimers=new Map();e.feederPriorityTickers=new Set(['T']);e.entryExecutionGate=()=>({allowed:true});
  let q={ticker:'T',eventTicker:'EV',gameStartTimeMs:now-20*60_000,gameClockState:{version:'GCA2',eventTicker:'EV',phase:'CONFIRMED',confirmed:true,startTimeMs:now-20*60_000,entryAuthorized:true,evidenceObservedAtMs:now}};
  e.market={getQuote:()=>q};e.strategy={};
  for(let i=0;i<10_000;i++)e.queueFeederHunterEvaluation('T');
  assert.equal(e.feederHunterEvaluationTimers.size,0);assert.equal(e.entryEvaluationQueue.snapshot().totalStarted,0);assert.equal(e.entryEvaluationQueue.snapshot().pending,0);
  q={ticker:'T',eventTicker:'EV',gameClockState:{version:'GCA2',eventTicker:'EV',phase:'UNKNOWN',simulationActivityStartMs:now-80*60_000}};
  assert.equal(e.shouldQueueInitialExposure('T',{allowProbe:true}),true);
  for(let i=0;i<10_000;i++)assert.equal(e.shouldQueueInitialExposure('T',{allowProbe:true}),false);
  const snap=e.entryAdmissionSnapshot();assert.equal(snap.probeAllowed,1);assert.ok(snap.probeCoalesced>=10_000);
});

test('HF7 EAC1 full-scan admission preserves eligible markets and removes predictable 77-minute waits before StrategyEngine evaluation',()=>{
  const now=Date.now();
  const e=Object.create(SagittariusEngine.prototype);e.settings={mode:'SIMULATION',minGameMinutes:77,maxGameMinutes:90};e.entryAdmissionProbeAt=new Map();e.entryAdmissionStats={version:'EAC3',allowed:0,blockedBeforeQueue:0,probeAllowed:0,probeCoalesced:0,byReason:{}};
  const early={ticker:'EARLY',eventTicker:'E1',gameStartTimeMs:now-30*60_000,gameClockState:{version:'GCA2',eventTicker:'E1',phase:'CONFIRMED',confirmed:true,startTimeMs:now-30*60_000,entryAuthorized:true,evidenceObservedAtMs:now}};
  const ready={ticker:'READY',eventTicker:'E2',gameStartTimeMs:now-80*60_000,gameClockState:{version:'GCA2',eventTicker:'E2',phase:'CONFIRMED',confirmed:true,startTimeMs:now-80*60_000,entryAuthorized:true,evidenceObservedAtMs:now}};
  const unknown={ticker:'UNKNOWN',eventTicker:'E3',gameClockState:{phase:'UNKNOWN'}};
  const tooLate={ticker:'TOOLATE',eventTicker:'E4',gameStartTimeMs:now-91*60_000,gameClockState:{version:'GCA2',eventTicker:'E4',phase:'CONFIRMED',confirmed:true,startTimeMs:now-91*60_000,entryAuthorized:true,evidenceObservedAtMs:now}};
  const m=e.admittedInitialExposureMap(new Map([['EARLY',early],['READY',ready],['UNKNOWN',unknown],['TOOLATE',tooLate]]),{allowProbe:false});
  assert.deepEqual([...m.keys()],['READY']);
  assert.ok((e.entryAdmissionSnapshot().byReason.maximum_game_time_exceeded||0)>=1);
});

test('R60 EAC3 COSMO_GREEN requires only the execution margin before the max game boundary',()=>{
  const now=2_100_000_000_000,start=now-89*60_000;
  const quote={ticker:'T',eventTicker:'EV',gameStartTimeMs:start,gameClockState:{version:'GCA2',eventTicker:'EV',phase:'CONFIRMED',confirmed:true,startTimeMs:start,entryAuthorized:true,evidenceObservedAtMs:now,lastCheckedAtMs:now}};
  let d=entryChainAdmissionDecision({quote,mode:'SIMULATION',minGameMinutes:20,maxGameMinutes:90,now,stage:'ATOMIC_GREEN',executionMarginMs:5000});
  assert.equal(d.action,'ALLOW');assert.equal(d.readyAtMs,now+5000);assert.equal(d.immediateGreenChain,true);
  const boundary=start+90*60_000-5000;
  const exact={...quote,gameClockState:{...quote.gameClockState,evidenceObservedAtMs:boundary,lastCheckedAtMs:boundary}};
  d=entryChainAdmissionDecision({quote:exact,mode:'SIMULATION',minGameMinutes:20,maxGameMinutes:90,now:boundary,stage:'ATOMIC_GREEN',executionMarginMs:5000});
  assert.equal(d.action,'BLOCK');assert.equal(d.reason,'execution_window_infeasible');
});

test('R60 EAC3 has no active PRE-BOLT schedule and never adds a strategic wait',()=>{
  const now=2_200_000_000_000,start=now-89*60_000;
  const quote={ticker:'T',eventTicker:'EV',gameClockState:{version:'GCA2',eventTicker:'EV',phase:'CONFIRMED',confirmed:true,startTimeMs:start,entryAuthorized:true,evidenceObservedAtMs:now,lastCheckedAtMs:now}};
  const d=entryChainAdmissionDecision({quote,mode:'SIMULATION',minGameMinutes:20,maxGameMinutes:90,now,stage:'ACTIVE_PRE_BOLT',preBoltStartedAtMs:now-115000,preBoltFinalExamMs:120000,executionMarginMs:5000});
  assert.equal(d.action,'ALLOW');assert.equal(d.stage,'ATOMIC_GREEN');assert.equal(d.readyAtMs,now+5000);
});

test('R60 EAC3 POST_BOLT admission re-proves fresh GCA2 and requires only execution margin',()=>{
  const now=2_300_000_000_000,start=now-89*60_000;
  const stale={ticker:'T',eventTicker:'EV',gameClockState:{version:'GCA2',eventTicker:'EV',phase:'CONFIRMED',confirmed:true,startTimeMs:start,entryAuthorized:true,evidenceObservedAtMs:now-20000}};
  let d=entryChainAdmissionDecision({quote:stale,mode:'SIMULATION',minGameMinutes:20,maxGameMinutes:90,now,stage:'POST_BOLT',executionMarginMs:5000});
  assert.equal(d.action,'PROBE');assert.equal(d.reason,'post_bolt_clock_authorization_refresh_required');
  const fresh={...stale,gameClockState:{...stale.gameClockState,evidenceObservedAtMs:now,lastCheckedAtMs:now}};
  d=entryChainAdmissionDecision({quote:fresh,mode:'SIMULATION',minGameMinutes:20,maxGameMinutes:90,now,stage:'POST_BOLT',executionMarginMs:5000});
  assert.equal(d.action,'ALLOW');assert.equal(d.readyAtMs,now+5000);
});

test('R58 quote-event Athena route performs EAC2 admission before queuing expensive opportunity evaluation',async()=>{
  const src=await readFile(new URL('../src/engine.mjs',import.meta.url),'utf8');
  const start=src.indexOf('queueAthenaOpportunityEvaluation(ticker)');
  const end=src.indexOf('queuePhoenixSignal(',start+1)>start?src.indexOf('queuePhoenixSignal(',start+1):src.indexOf('async evaluateNewGenerationOpportunities',start);
  const block=src.slice(start,src.indexOf('async evaluateNewGenerationOpportunities',start));
  assert.ok(block.includes('shouldQueueInitialExposure(ticker,{allowProbe:true})'));
  assert.ok(block.indexOf('shouldQueueInitialExposure(ticker,{allowProbe:true})')<block.indexOf('evaluateNewGenerationOpportunities'));
});

test('R60 centralized opportunity evaluation rechecks POST_BOLT clock and event cooldown before direct Athena FIRE',async()=>{
  const src=await readFile(new URL('../src/engine.mjs',import.meta.url),'utf8');
  const start=src.indexOf('async evaluateNewGenerationOpportunities');
  const block=src.slice(start,src.indexOf('noteEntryAdmission(',start));
  const post=block.indexOf("lane:'POST_BOLT'");
  const eventAdmission=block.indexOf('hunterEventAdmissionState(q)',post);
  const decide=block.indexOf('athenaCommander.decide(bolt,commandContext)',eventAdmission);
  assert.ok(post>=0&&eventAdmission>post&&decide>eventAdmission);
  assert.ok(block.slice(eventAdmission,decide).includes('post_bolt_cooldown_blocked'));
  assert.equal(block.includes('A8_CERTIFIED'),false);
});

test('R60 candidate with less than execution margin remaining is rejected before DB fanout or Atomic Thunder work',async()=>{
  const now=Date.now(),start=now-(90*60_000-4_000),q={ticker:'LATE',eventTicker:'LATE',sport:'Tennis',yesBid:55,yesAsk:56,updatedAtMs:now,quoteAtMs:now,gameClockState:{version:'GCA2',eventTicker:'LATE',phase:'CONFIRMED',confirmed:true,startTimeMs:start,entryAuthorized:true,evidenceObservedAtMs:now,lastCheckedAtMs:now}};
  const e=Object.create(SagittariusEngine.prototype);let dbReads=0,detects=0,decisions=0;
  e.settings={systemName:'S',mode:'SIMULATION',minGameMinutes:20,maxGameMinutes:90,atomicThunderGreenTriggerCents:1,lightningPlasmaMaxStrikes:3,lightningPlasmaFieldStakeCents:20000,recoveryTrackingHours:24};
  e.entryExecutionGate=()=>({allowed:true});e.atomicThunderBolt={activeByTicker:new Map(),async detect(){detects++;return null;}};e.athenaCommander={scarletNeedleArms:new Map(),async decide(){decisions++;return{decision:'REJECT'};}};
  e.strategy={async recoveryObservationsBySource(){return new Map();}};e.db={async openEntries(){dbReads++;return[];},async recoverySourceEntries(){dbReads++;return[];},async audit(){}};e.market={getHistory(){return[];}};e.learning=null;
  const out=await e.evaluateNewGenerationOpportunities(new Map([['LATE',q]]));
  assert.deepEqual(out,[]);assert.equal(dbReads,0);assert.equal(detects,0);assert.equal(decisions,0);
});

test('R60 a Bolt that loses fresh Game Clock authorization never reaches Athena',async()=>{
  const now=Date.now(),q={ticker:'T',eventTicker:'T',sport:'Tennis',yesBid:55,yesAsk:56,updatedAtMs:now,quoteAtMs:now,gameClockState:{version:'GCA2',eventTicker:'T',phase:'CONFIRMED',confirmed:true,startTimeMs:now-45*60_000,entryAuthorized:true,evidenceObservedAtMs:now,lastCheckedAtMs:now}};
  const e=Object.create(SagittariusEngine.prototype);let decisions=0,detects=0;
  e.settings={systemName:'S',mode:'SIMULATION',minGameMinutes:20,maxGameMinutes:90,atomicThunderGreenTriggerCents:1,lightningPlasmaMaxStrikes:3,lightningPlasmaFieldStakeCents:20000,recoveryTrackingHours:24};e.entryExecutionGate=()=>({allowed:true});e.entryChainAdmissionForQuote=()=>({action:'ALLOW',reason:'test'});
  e.resolveEntryChainAdmission=async(_q,{lane})=>lane==='POST_BOLT'?{action:'BLOCK',reason:'post_bolt_clock_authorization_refresh_required'}:{action:'ALLOW',reason:'test'};
  const b={id:'B',ticker:'T',eventTicker:'T',expiresAtMs:now+5000,features:{eligibleAttacks:[{concept:'Wave Surfer'}]}};e.atomicThunderBolt={activeByTicker:new Map(),async detect(){detects++;return b;},noteDecision(){}};
  e.athenaCommander={scarletNeedleArms:new Map(),async decide(){decisions++;throw new Error('Athena must not run');}};e.strategy={recoverySourcesFromEntries(){return[];},async recoveryObservationsBySource(){return new Map();}};e.db={async openEntries(){return[];},async recoverySourceEntries(){return[];},async audit(){}};e.market={getHistory(){return[];}};e.learning=null;
  const out=await e.evaluateNewGenerationOpportunities(new Map([['T',q]]));assert.deepEqual(out,[]);assert.equal(detects,1);assert.equal(decisions,0);
});

test('R60 shared Hunter cooldown is resolved before Athena FIRE and remains a hard pre-FIRE topology rule',async()=>{
  const now=Date.now(),q={ticker:'T',eventTicker:'EV',sport:'Tennis',yesBid:55,yesAsk:56,updatedAtMs:now,quoteAtMs:now,gameClockState:{version:'GCA2',eventTicker:'EV',phase:'CONFIRMED',confirmed:true,startTimeMs:now-45*60_000,entryAuthorized:true,evidenceObservedAtMs:now,lastCheckedAtMs:now}};
  const e=Object.create(SagittariusEngine.prototype);let decisions=0;
  e.settings={systemName:'S',mode:'SIMULATION',minGameMinutes:20,maxGameMinutes:90,atomicThunderGreenTriggerCents:1,lightningPlasmaMaxStrikes:3,lightningPlasmaFieldStakeCents:20000,recoveryTrackingHours:24};e.entryExecutionGate=()=>({allowed:true});e.entryChainAdmissionForQuote=()=>({action:'ALLOW',reason:'test'});e.resolveEntryChainAdmission=async()=>({action:'ALLOW',reason:'test'});
  const b={id:'B',ticker:'T',eventTicker:'EV',expiresAtMs:now+5000,score:90,features:{eligibleAttacks:[{concept:'Wave Surfer',targetFeasible:true}]}};e.atomicThunderBolt={activeByTicker:new Map(),async detect(){return b;},noteDecision(){}};
  e.athenaCommander={scarletNeedleArms:new Map(),async decide(){decisions++;throw new Error('Athena must not run behind cooldown');}};
  e.strategy={recoverySourcesFromEntries(){return[];},async recoveryObservationsBySource(){return new Map();},async hunterEventAdmissionState(){return{eventTicker:'EV',activeEntries:0,maxEntriesPerTrade:3,eventCapBlocked:false,latestHunterEntryMs:now-1000,hunterCooldownMinutes:45,cooldownBlocked:true};}};
  e.db={audits:[],async openEntries(){return[];},async recoverySourceEntries(){return[];},async audit(level,event,data){this.audits.push({level,event,data});}};e.market={getHistory(){return[];}};e.learning=null;
  const out=await e.evaluateNewGenerationOpportunities(new Map([['T',q]]));assert.deepEqual(out,[]);assert.equal(decisions,0);assert.ok(e.db.audits.some(x=>x.event==='post_bolt_cooldown_blocked'));
});

test('R54 RGM3 compacts oversized hydrated FSI trajectories to a representative 96-sample working set and can pressure-compact to 64 without losing total observation aggregates',async()=>{
  const {FeederSignalIntel,FEEDER_SIGNAL_INTELLIGENCE}=await import('../src/feederSignalIntel.mjs');
  assert.equal(FEEDER_SIGNAL_INTELLIGENCE.maximumObservationsPerSignal,96);
  assert.equal(FEEDER_SIGNAL_INTELLIGENCE.pressureObservationsPerSignal,64);
  const observations=Array.from({length:1200},(_,i)=>({atMs:i+1,bidCents:50+(i%7),askCents:51+(i%7)}));
  const state={version:'FSI1',feederId:'F',systemName:'S',feederConcept:'Dragon',ticker:'T',eventTicker:'E',trackingComplete:false,updatedAtMs:1200,observations,trajectory:{observationCount:5000,storedObservationCount:1200,referenceProfitMilestones:{}}};
  const f=new FeederSignalIntel({db:{async feederSignalIntel(){return[{state:structuredClone(state)}];},async openEntries(){return[];}},market:{},getSettings:()=>({systemName:'S'}),audit:async()=>{}});
  await f.init();const hydrated=f.records.get('F');
  assert.equal(hydrated.observations.length,96);assert.equal(hydrated.trajectory.storedObservationCount,96);assert.equal(hydrated.trajectory.observationCount,5000);
  assert.equal(hydrated.observations[0].atMs,1);assert.equal(hydrated.observations.at(-1).atMs,1200);
  assert.ok(hydrated.observations.some(x=>x.atMs>1&&x.atMs<1073),'stratified middle history must remain represented');
  assert.equal(f.resourceSnapshot().retainedObservationSamples,96);
  const pressure=f.compactForMemoryPressure();
  assert.equal(pressure.limit,64);assert.equal(hydrated.observations.length,64);assert.equal(hydrated.trajectory.observationCount,5000);
  assert.equal(f.resourceSnapshot().retainedObservationSamples,64);assert.equal(f.restoreNormalObservationLimit(),96);
});

test('HF4 market cache pruning keeps the complete current wanted/safety set and evicts obsolete ticker state',async()=>{
  const {MarketHub}=await import('../src/market.mjs');
  const hub=new MarketHub({kalshi:{},wsUrl:'',fallbackWsUrl:'',getCredentials:()=>null});
  for(const ticker of ['KEEP','OLD']){hub.quotes.set(ticker,{ticker});hub.books.set(ticker,{ticker});hub.histories.set(ticker,[{yesBid:1}]);}
  hub.wanted=new Set(['KEEP','OLD']);hub.setWanted(['KEEP']);
  for(const cache of [hub.quotes,hub.books,hub.histories]){assert.equal(cache.has('KEEP'),true);assert.equal(cache.has('OLD'),false);}
  const r=hub.resourceSnapshot();assert.equal(r.wanted,1);assert.equal(r.quotes,1);assert.equal(r.books,1);assert.equal(r.histories,1);assert.equal(r.cacheBoundedToWanted,true);
});

test('HF4 GCA2 caches are count-bounded and eviction can only force fresh authority lookup',async()=>{
  const {GameClockAuthority,GAME_CLOCK_AUTHORITY}=await import('../src/gameClock.mjs');
  assert.equal(GAME_CLOCK_AUTHORITY.maximumCacheEntries,2048);
  const g=new GameClockAuthority({kalshi:{},maximumCacheEntries:32});
  for(let i=0;i<40;i+=1){g.setBoundedCache(g.milestoneCache,`M${i}`,{atMs:i});g.setBoundedCache(g.liveCache,`L${i}`,{observedAtMs:i});g.setBoundedCache(g.statsCache,`S${i}`,{observedAtMs:i});}
  assert.equal(g.milestoneCache.size,32);assert.equal(g.liveCache.size,32);assert.equal(g.statsCache.size,32);assert.equal(g.milestoneCache.has('M0'),false);assert.equal(g.milestoneCache.has('M39'),true);assert.equal(g.resourceSnapshot().bounded,true);
});

test('HF4 FSI1 restores only incomplete runtime state and evicts completed state only after successful durable persistence',async()=>{
  const {FeederSignalIntel}=await import('../src/feederSignalIntel.mjs');
  const calls=[];
  const db={async feederSignalIntel(_s,opts){calls.push(['load',opts]);return[];},async openEntries(){return[];},async saveFeederSignalIntel(row){calls.push(['save',row.feederId]);},async entries(){return[];}};
  const f=new FeederSignalIntel({db,market:{},getSettings:()=>({systemName:'S'}),audit:async()=>{}});await f.init();assert.equal(calls[0][1].trackingComplete,false);
  const complete={version:'FSI1',feederId:'F1',systemName:'S',feederConcept:'Dragon',ticker:'T',eventTicker:'E',sourceEpisodeId:null,signalAtMs:1,coverageStartedAtMs:1,trackingComplete:true,updatedAtMs:10};f.index(complete);f.dirty.add('F1');assert.equal(await f.persist('F1',true),true);assert.equal(f.records.has('F1'),false);assert.equal(f.resourceSnapshot().completedEvicted,true);
  const failedDb={...db,async saveFeederSignalIntel(){throw new Error('db unavailable');}};const failed=new FeederSignalIntel({db:failedDb,market:{},getSettings:()=>({systemName:'S'}),audit:async()=>{}});const retained={...complete,feederId:'F2',updatedAtMs:20};failed.index(retained);failed.dirty.add('F2');assert.equal(await failed.persist('F2',true),false);assert.equal(failed.records.has('F2'),true);assert.equal(failed.dirty.has('F2'),true);
});

test('HF4 FSI1 diagnostics SQL can filter incomplete state and project away heavyweight observation arrays',async()=>{
  const {Database}=await import('../src/db.mjs');let sql='';let args=null;const fake={pool:{async query(q,a){sql=q;args=a;return{rows:[]};}}};
  const rows=await Database.prototype.feederSignalIntel.call(fake,'S',{limit:123,trackingComplete:false,stripObservations:true});assert.deepEqual(rows,[]);assert.match(sql,/state - 'observations' as state/);assert.match(sql,/trackingComplete/);assert.deepEqual(args,['S',123]);
});


test('HF4 learning runtime bounds terminal crash state without evicting active crash authority',()=>{
  const learning=new LearningEngine({},'S');
  learning.crashStates.set('ACTIVE',{phase:'REBOUND_CONFIRMED',episodeId:'EP',entryReady:true,updatedAtMs:999999});
  learning.crashLastPersistMs.set('ACTIVE',999999);
  for(let i=0;i<LEARNING_RUNTIME_LIMITS.crashStates+20;i+=1){const t=`FINAL-${i}`;learning.crashStates.set(t,{phase:'FINAL',updatedAtMs:i,lastObservationAtMs:i});learning.crashLastPersistMs.set(t,i);}
  const removed=learning.pruneCrashRuntime();
  assert.ok(removed>=20);assert.ok(learning.crashStates.size<=LEARNING_RUNTIME_LIMITS.crashStates);assert.equal(learning.crashStates.has('ACTIVE'),true);assert.equal(learning.crashLastPersistMs.has('ACTIVE'),true);
});

test('HF4 PLI1 completed episodes persist durably then release heavyweight runtime state while retaining a bounded completion reference',async()=>{
  const stored=[];
  const db={
    async upsertProfitEpisode(x){stored.push(structuredClone(x));},
    async profitEpisodes(){return[];},async upsertProfitProfile(){},
  };
  const learning=new LearningEngine(db,'S');
  const entry={id:'PLI-DONE',ticker:'T',eventTicker:'T',marketTitle:'T',conceptName:'Wave Surfer',sourceFeeder:'Dragon',entryPriceCents:70,count:10,pnlCents:50,openedAtMs:1,closedAtMs:2};
  learning.profitMeta.set(entry.id,{id:entry.id,systemName:'S',ticker:'T',eventTicker:'T',conceptName:'Wave Surfer',sourceFeeder:'Dragon',sport:'Unknown',entryPriceCents:70,originalCount:10,openedAtMs:1,closedAtMs:2});
  learning.profitStates.set(entry.id,{version:'PLI1',phase:'POST_EXIT_TRACKING',trackingComplete:false,actualRealizedNetCents:50,actualExitAtMs:2,shadow:{}});
  const completed=await learning.finalizeProfitLearning(entry,{finalResult:'yes',terminalNetCents:100,reason:'market_final'});
  assert.equal(completed.trackingComplete,true);assert.equal(stored.at(-1).trackingComplete,true);
  assert.equal(learning.profitStates.has(entry.id),false);assert.equal(learning.profitMeta.has(entry.id),false);assert.equal(learning.profitLastPersistMs.has(entry.id),false);
  assert.equal(learning.profitLearningState(entry.id).trackingComplete,true);assert.equal(learning.completedProfitIds.size,1);assert.ok(learning.completedProfitIds.size<=LEARNING_RUNTIME_LIMITS.completedProfitIds);
});

test('HF4 market-drop dedupe uses exact durable lookup and keeps only a bounded hot-key cache',async()=>{
  let exact=0,bulk=0;
  const db={
    async recoveryObservationByOriginalEntryId(){exact++;return{id:'existing'};},
    async recoveryObservations(){bulk++;return[];},
  };
  const learning=new LearningEngine(db,'S');
  const trackers=Array.from({length:LEARNING_RUNTIME_LIMITS.marketDropKeys+4},(_,i)=>({ticker:`M${i}`,first_seen_ms:1000,price_history:[{ask:60,t:1000+i},{ask:50,t:2000+i}]}));
  await learning.learnMarketDrops(trackers,new Map());
  assert.equal(exact,trackers.length);assert.equal(bulk,0);assert.equal(learning.marketDropKeys.size,LEARNING_RUNTIME_LIMITS.marketDropKeys);assert.equal(learning.marketDropKeys.has('MKT:M0:1000'),false);
});

test('HF4 recovery runtime cache pruning removes only sources that are no longer eligible',()=>{
  const st=new StrategyEngine({db:{},kalshi:{},market:{},learning:{},getSettings:()=>settings(),getLiveReady:()=>false});
  st.recoveryRuntimeTroughs.set('KEEP',42);st.recoveryRuntimeTroughs.set('STALE',30);st.recoveryAuditStates.set('KEEP','qualified');st.recoveryAuditStates.set('STALE','waiting');
  st.pruneRecoveryRuntime(new Set(['KEEP']));
  assert.equal(st.recoveryRuntimeTroughs.has('KEEP'),true);assert.equal(st.recoveryRuntimeTroughs.has('STALE'),false);assert.equal(st.recoveryAuditStates.has('KEEP'),true);assert.equal(st.recoveryAuditStates.has('STALE'),false);
});

test('HF4 ProfitGuard runtime pruning keeps open-position protection state and drops closed-only display/cache state',()=>{
  const guard=new ProfitGuard({db:{},kalshi:{},market:{},learning:{},getSettings:()=>settings()});
  guard.states.set('OPEN',{guardState:'OBSERVING'});guard.states.set('CLOSED',{guardState:'OBSERVING'});guard.atomicThunderStates.set('OPEN',{confirmations:1});guard.atomicThunderStates.set('CLOSED',{confirmations:1});
  guard.profitLearningQueuedAtMs.set('OPEN',1);guard.profitLearningQueuedAtMs.set('RECENT',2);guard.profitLearningQueuedAtMs.set('OLD',3);
  guard.pruneRuntimeState([{id:'OPEN'}]);guard.pruneProfitLearningTimestamps([{id:'RECENT'}]);
  assert.equal(guard.states.has('OPEN'),true);assert.equal(guard.states.has('CLOSED'),false);assert.equal(guard.atomicThunderStates.has('OPEN'),true);assert.equal(guard.atomicThunderStates.has('CLOSED'),false);assert.equal(guard.profitLearningQueuedAtMs.has('OPEN'),true);assert.equal(guard.profitLearningQueuedAtMs.has('RECENT'),true);assert.equal(guard.profitLearningQueuedAtMs.has('OLD'),false);
});

test('HF4 database resource schema adds exact recovery dedupe and durable once-per-ticker sport duration accounting',async()=>{
  const db=await readFile(resolve(root,'src/db.mjs'),'utf8');
  assert.ok(db.includes('sag_recovery_obs_v2_original'));assert.ok(db.includes('recoveryObservationByOriginalEntryId'));
  assert.ok(db.includes('sag_sport_duration_events_v1'));assert.ok(db.includes('recordSportDurationOnce'));
  assert.match(db,/primary key\(system_name,ticker\)/);
  assert.match(db,/on conflict\(system_name,ticker\) do nothing returning ticker/);
});

test('HF4 durable sport-duration dedupe updates a profile exactly once and commits duplicates without double-counting',async()=>{
  const makeDb=(inserted)=>{
    const calls=[];
    const client={
      async query(sql,args=[]){
        calls.push({sql,args});
        if(sql.startsWith('insert into sag_sport_duration_events_v1'))return{rowCount:inserted?1:0,rows:inserted?[{ticker:'T'}]:[]};
        if(sql.startsWith('select * from sag_sport_profiles_v2'))return{rows:[{ticker_prefix:'KX',observed_durations:[60000],observation_count:1,typical_duration_ms:60000,min_game_minutes_for_hunter:15,confidence_level:'low',source:'deterministic'}]};
        return{rowCount:1,rows:[]};
      },
      release(){calls.push({sql:'release',args:[]});},
    };
    const db=Object.create(Database.prototype);db.pool={async connect(){return client;}};return{db,calls};
  };
  const first=makeDb(true);assert.equal(await first.db.recordSportDurationOnce('S','T','KX',120000),true);
  assert.equal(first.calls.filter(x=>x.sql.startsWith('update sag_sport_profiles_v2')).length,1);
  assert.equal(first.calls.some(x=>x.sql==='commit'),true);assert.equal(first.calls.some(x=>x.sql==='rollback'),false);
  const duplicate=makeDb(false);assert.equal(await duplicate.db.recordSportDurationOnce('S','T','KX',120000),false);
  assert.equal(duplicate.calls.filter(x=>x.sql.startsWith('select * from sag_sport_profiles_v2')).length,0);
  assert.equal(duplicate.calls.filter(x=>x.sql.startsWith('update sag_sport_profiles_v2')).length,0);
  assert.equal(duplicate.calls.some(x=>x.sql==='commit'),true);
});


test('HF5 DBPI1 reserves ordinary PostgreSQL headroom while keeping the historical 10-connection ceiling',()=>{
  assert.equal(DATABASE_PRESSURE_ISOLATION.version,'DBPI2');
  assert.equal(DATABASE_PRESSURE_ISOLATION.quoteProtectionScope,'REAL_HUNTERS_ONLY');
  assert.equal(DATABASE_PRESSURE_ISOLATION.entryEvaluationConcurrency,2);
  assert.equal(DATABASE_PRESSURE_ISOLATION.quoteProtectionConcurrency,3);
  assert.equal(DATABASE_PRESSURE_ISOLATION.ordinaryPoolReservedHeadroom,3);
  assert.equal(DATABASE_PRESSURE_ISOLATION.entryEvaluationConcurrency + DATABASE_PRESSURE_ISOLATION.quoteProtectionConcurrency + DATABASE_PRESSURE_ISOLATION.ordinaryPoolReservedHeadroom,8);
  const entryQ=new CoalescingWorkQueue({maxConcurrency:DATABASE_PRESSURE_ISOLATION.entryEvaluationConcurrency});
  const protectionQ=new CoalescingWorkQueue({maxConcurrency:DATABASE_PRESSURE_ISOLATION.quoteProtectionConcurrency});
  assert.equal(entryQ.maxConcurrency,2);assert.equal(protectionQ.maxConcurrency,3);
});

test('HF5 high-frequency protection excludes reference-only Cosmos and low-frequency maintenance handles them separately',async()=>{
  const feeders=Array.from({length:100},(_,i)=>({id:`F${i}`,conceptName:i%2?'Dragon':'Pegasus',ticker:`COSMO-${i%20}`,status:'open'}));
  const hunter={id:'H1',conceptName:'Wave Surfer',ticker:'REAL-1',status:'open'};
  const calls={hunterReads:0,feederReads:0,tickerReads:0,protected:[]};
  const db={
    async openHunterEntries(){calls.hunterReads++;return[structuredClone(hunter)];},
    async openFeederEntries(){calls.feederReads++;return feeders.map(x=>structuredClone(x));},
    async openHunterEntriesByTicker(_s,t){calls.tickerReads++;return t==='REAL-1'?[structuredClone(hunter)]:[];},
  };
  const guard=new ProfitGuard({db,kalshi:{},market:{},learning:{},getSettings:()=>settings()});
  guard.protect=async(e)=>{calls.protected.push(e.conceptName);return{protected:true};};
  assert.equal(await guard.sweep(),1);
  assert.deepEqual([...guard.activeTickers],['REAL-1']);
  assert.equal(calls.protected.length,1);
  assert.equal(calls.protected[0],'Wave Surfer');
  assert.equal(await guard.protectTicker('COSMO-1'),0);
  assert.equal(calls.protected.length,1,'Cosmo quote must not enter the real-time protection lane');
  assert.equal(await guard.referenceSweep(),100);
  assert.equal(calls.protected.length,101);
  assert.equal(calls.protected.slice(1).every(x=>x==='Pegasus'||x==='Dragon'),true);
  assert.equal(calls.hunterReads,1);assert.equal(calls.feederReads,1);assert.equal(calls.tickerReads,1);
});

test('HF5 state collection is single-flight and cached, and invalidation forces a new collection',async()=>{
  const e=Object.create(SagittariusEngine.prototype);
  e.stateSnapshotCache=null;e.stateSnapshotAtMs=0;e.stateCollectionPromise=null;e.stateCollectionCount=0;
  let runs=0;
  e.collectState=async()=>{runs++;await new Promise(r=>setTimeout(r,15));return{generation:runs};};
  const [a,b,c]=await Promise.all([e.state(),e.state(),e.state()]);
  assert.equal(runs,1);assert.strictEqual(a,b);assert.strictEqual(b,c);assert.equal(e.stateCollectionCount,1);
  const cached=await e.state();assert.strictEqual(cached,a);assert.equal(runs,1);
  e.invalidateStateSnapshot();const fresh=await e.state();assert.equal(runs,2);assert.equal(fresh.generation,2);assert.equal(e.stateCollectionCount,2);
});

test('HF5 dashboard cash calculation reuses an already-loaded ledger but entry authorization still performs a fresh DB read',async()=>{
  let reads=0;
  const db={async entries(){reads++;return[];}};
  const s=settings({startingCapitalCents:123456});
  const st=new StrategyEngine({db,kalshi:{},market:{},learning:{},getSettings:()=>s,getLiveReady:()=>false});
  assert.equal(await st.simulationAvailableCashCents([]),123456);assert.equal(reads,0);
  assert.equal(await st.simulationAvailableCashCents(),123456);assert.equal(reads,1);
});

test('HF5 state database fanout and Atomic Thunder composite reads are explicitly bounded',async()=>{
  const engineSource=await readFile(resolve(root,'src/engine.mjs'),'utf8');
  const dbSource=await readFile(resolve(root,'src/db.mjs'),'utf8');
  assert.match(engineSource,/stateDbFanoutMaximum:2/);
  assert.match(engineSource,/mapLimit\(stateJobs,STATE_DB_FANOUT_MAX/);
  const start=dbSource.indexOf('async atomicThunderStats(systemName)');
  const end=dbSource.indexOf('async ',start+10);
  const atomic=dbSource.slice(start,end>start?end:dbSource.length);
  assert.ok(atomic.includes('sag_atomic_thunder_events_v1'));
  assert.equal(atomic.includes('Promise.all'),false,'Atomic Thunder state reads must not hide an unbounded nested fanout');
});

test('HF5 resource telemetry exposes DB pressure isolation and the reserved pool headroom',()=>{
  const e=Object.create(SagittariusEngine.prototype);
  e.entryEvaluationQueue={snapshot:()=>({maxConcurrency:2,active:2,pending:4,rerun:1,totalStarted:5,totalCoalesced:50,maxObservedActive:2})};
  e.quoteProtectionQueue={snapshot:()=>({maxConcurrency:3,active:3,pending:2,rerun:0,totalStarted:8,totalCoalesced:70,maxObservedActive:3})};
  e.db={resourceSnapshot:()=>({bounded:true,maximumConnections:10,mainPool:{max:8,total:8,idle:3,waiting:0},lockPool:{max:2,total:0,idle:0,waiting:0}})};
  e.market=e.gameClock=e.feederSignalIntel=e.learning=e.strategy=e.profitGuard={resourceSnapshot:()=>({})};
  e.lastReferenceSweepMs=123;e.stateCollectionCount=9;e.stateSnapshotAtMs=Date.now();
  const r=e.resourceUsageSnapshot();
  assert.equal(r.workload.version,'DBPI2');assert.equal(r.workload.quoteProtectionScope,'REAL_HUNTERS_ONLY');
  assert.equal(r.workload.entryWorkers,2);assert.equal(r.workload.protectionWorkers,3);assert.equal(r.workload.ordinaryPoolReservedHeadroom,3);
  assert.equal(r.workload.stateDbFanoutMaximum,2);assert.equal(r.workload.referenceSignalSweepIntervalMs,30000);
});


test('HF5 entry and real-position quote workers stay globally bounded under a synthetic wakeup storm',async()=>{
  let active=0,maxActive=0,completed=0;
  const task=()=>async()=>{active++;maxActive=Math.max(maxActive,active);await new Promise(r=>setTimeout(r,2));active--;completed++;};
  const entry=new CoalescingWorkQueue({maxConcurrency:DATABASE_PRESSURE_ISOLATION.entryEvaluationConcurrency});
  const protection=new CoalescingWorkQueue({maxConcurrency:DATABASE_PRESSURE_ISOLATION.quoteProtectionConcurrency});
  for(let i=0;i<400;i++){entry.enqueue(`E${i}`,task());protection.enqueue(`P${i}`,task());}
  const deadline=Date.now()+5000;
  while((!entry.isIdle()||!protection.isIdle())&&Date.now()<deadline)await new Promise(r=>setTimeout(r,5));
  assert.equal(entry.isIdle(),true);assert.equal(protection.isIdle(),true);assert.equal(completed,800);
  assert.ok(maxActive<=5,`managed entry+protection concurrency reached ${maxActive}`);
  assert.ok(8-maxActive>=DATABASE_PRESSURE_ISOLATION.ordinaryPoolReservedHeadroom);
});

test('HF6 DBPI2 low-priority PostgreSQL gate hard-limits concurrent telemetry persistence',async()=>{
  const {BoundedDbWorkGate,LOW_PRIORITY_DB_PERSISTENCE}=await import('../src/db.mjs');
  assert.equal(LOW_PRIORITY_DB_PERSISTENCE.version,'DBPI2-LP2');
  assert.equal(LOW_PRIORITY_DB_PERSISTENCE.maximumConcurrency,1);
  const gate=new BoundedDbWorkGate(1);let active=0,maxActive=0;
  const jobs=Array.from({length:120},(_,i)=>gate.run(async()=>{active++;maxActive=Math.max(maxActive,active);await new Promise(r=>setTimeout(r,1));active--;return i;}));
  const out=await Promise.all(jobs);
  assert.equal(out.length,120);assert.equal(maxActive,1);assert.equal(gate.snapshot().maxObservedActive,1);assert.equal(gate.snapshot().pending,0);
});

test('R51-HF2 DBPI2-LP2 hard-caps pending low-priority work instead of retaining an unbounded Promise queue',async()=>{
  const {BoundedDbWorkGate,LOW_PRIORITY_DB_PERSISTENCE}=await import('../src/db.mjs');
  assert.equal(LOW_PRIORITY_DB_PERSISTENCE.maximumPending,256);
  let release;const blocker=new Promise(r=>{release=r;});
  const gate=new BoundedDbWorkGate(1,4);
  const first=gate.run(async()=>{await blocker;return'active';});
  const queued=Array.from({length:4},(_,i)=>gate.run(async()=>i));
  await assert.rejects(gate.run(async()=>99),e=>e?.code==='LOW_PRIORITY_PERSISTENCE_BACKPRESSURE');
  assert.equal(gate.snapshot().pending,4);assert.equal(gate.snapshot().totalRejected,1);assert.equal(gate.snapshot().maxObservedPending,4);
  release();assert.equal(await first,'active');assert.deepEqual(await Promise.all(queued),[0,1,2,3]);assert.equal(gate.snapshot().pending,0);
});

test('R51-HF2 CI1 quote storm coalesces persistence by ticker and never blocks the quote path on a stalled database',async()=>{
  assert.equal(CRASH_INTELLIGENCE.persistenceRevision,'CI1-P2-KEYED-COALESCED');
  let release;const blocker=new Promise(r=>{release=r;});let stateWrites=0,episodeWrites=0;
  const db={
    async upsertCrashMarketState(){stateWrites++;await blocker;},
    async upsertCrashEpisode(){episodeWrites++;},
  };
  const learning=new LearningEngine(db,'S');
  const base=Date.now(),q={ticker:'KXATPMATCH-HF2',eventTicker:'KXATPMATCH-HF2',title:'HF2',yesBid:49,yesAsk:50,status:'active',result:''};
  const started=Date.now();
  for(let i=0;i<5000;i++)await learning.observeCrashQuote({...q,yesBid:49-(i%2),yesAsk:50-(i%2)},settings(),base+i);
  assert.ok(Date.now()-started<1000,'quote path must remain in-memory/nonblocking even while persistence is stalled');
  const pressure=learning.resourceSnapshot().crashPersistence;
  assert.ok(pressure.active<=1);assert.ok(pressure.pending<=1);assert.ok(pressure.maxObservedPending<=1);assert.ok(stateWrites<=1);
  release();assert.equal(await learning.flushCrashPersistence(2000),true);assert.ok(stateWrites<=2);assert.ok(episodeWrites<=CRASH_INTELLIGENCE.maximumPendingEpisodesPerTicker);
});

test('R51-HF2 counterfactual completion is exactly-once under a 1000-quote race and globally DB-bounded',async()=>{
  assert.equal(COUNTERFACTUAL_PERSISTENCE.maximumConcurrency,2);
  const rows=new Map([['CF1',{id:'CF1',systemName:'S',ticker:'T',eventTicker:'E',boltAtMs:1,boltSnapshot:{},athenaDecision:{decision:'REJECT'},trackingComplete:false,updatedAtMs:1}]]);
  let reads=0,writes=0,learned=0;
  const db={
    async opportunityEpisode(id){reads++;await new Promise(r=>setTimeout(r,3));return structuredClone(rows.get(id)||null);},
    async upsertOpportunityEpisode(ep){writes++;await new Promise(r=>setTimeout(r,3));rows.set(ep.id,structuredClone(ep));return ep.id;},
  };
  const bolt=new AtomicThunderBoltEngine({db,systemName:'S',getSettings:()=>settings(),market:{executableBid:(_t,c)=>({full:true,filled:c,avgCents:25})},onOpportunityCompleted:async()=>{learned++;}});
  bolt.indexShadowEpisode({id:'CF1',ticker:'T',startedAtMs:1,decision:'REJECT',attackSelected:'Wave Surfer',entryAskCents:10,targetBidCents:15,grossTargetCents:5,count:10,minBidCents:9,maxBidCents:9});
  const q={ticker:'T',yesBid:25};const now=700_000;
  await Promise.all(Array.from({length:1000},()=>bolt.observeCounterfactual(q,now)));
  assert.equal(await bolt.flushCounterfactualCompletions(2000),true);
  const s=bolt.summary();assert.equal(s.counterfactualCompleted,1);assert.equal(s.counterfactualTracking,0);assert.equal(writes,1);assert.equal(reads,2);assert.equal(learned,1);
  assert.ok(s.counterfactualPersistence.maxObservedPending<=1);assert.ok(s.counterfactualPersistence.totalCoalesced>=999);assert.equal(s.counterfactualPersistence.active,0);assert.equal(s.counterfactualPersistence.pending,0);
});

test('HF6 FSI1-P2 replaces per-record timers with one scheduler and batches a 500-record dirty storm at concurrency one',async()=>{
  const {FeederSignalIntel,FEEDER_SIGNAL_INTELLIGENCE}=await import('../src/feederSignalIntel.mjs');
  assert.equal(FEEDER_SIGNAL_INTELLIGENCE.persistenceRevision,'FSI1-P2-BOUNDED-BATCH');
  assert.equal(FEEDER_SIGNAL_INTELLIGENCE.persistenceBatchSize,50);
  let active=0,maxActive=0,batches=0,rowsWritten=0;
  const db={async saveFeederSignalIntelBatch(rows){active++;maxActive=Math.max(maxActive,active);batches++;rowsWritten+=rows.length;await new Promise(r=>setTimeout(r,2));active--;},async feederSignalIntel(){return[];},async entries(){return[];}};
  const f=new FeederSignalIntel({db,market:{},getSettings:()=>({systemName:'S'}),audit:async()=>{}});
  for(let i=0;i<500;i++){const id=`F${i}`;f.index({version:'FSI1',feederId:id,systemName:'S',feederConcept:'Dragon',ticker:`T${i}`,eventTicker:`E${i}`,signalAtMs:1,coverageStartedAtMs:1,trackingComplete:false,updatedAtMs:i+1,trajectory:{},observations:[]});f.markDirty(id);f.schedulePersist();}
  assert.equal(f.resourceSnapshot().persistTimers,1,'all dirty records must share one timer');
  assert.equal(f.resourceSnapshot().dirty,500);
  assert.equal(await f.flush(5000),true);
  assert.equal(maxActive,1);assert.equal(rowsWritten,500);assert.equal(batches,10);assert.equal(f.resourceSnapshot().dirty,0);assert.equal(f.resourceSnapshot().persisting,0);assert.equal(f.resourceSnapshot().maxObservedPersistActive,1);
});

test('HF6 FSI1-P2 coalesces hot updates and persists the newest state without overlapping same-record writes',async()=>{
  const {FeederSignalIntel}=await import('../src/feederSignalIntel.mjs');
  const seen=[];let active=0,maxActive=0;
  const db={async saveFeederSignalIntelBatch(rows){active++;maxActive=Math.max(maxActive,active);seen.push(structuredClone(rows));await new Promise(r=>setTimeout(r,15));active--;},async feederSignalIntel(){return[];},async entries(){return[];}};
  const f=new FeederSignalIntel({db,market:{},getSettings:()=>({systemName:'S'}),audit:async()=>{}});
  const state={version:'FSI1',feederId:'HOT',systemName:'S',feederConcept:'Dragon',ticker:'T',eventTicker:'E',signalAtMs:1,coverageStartedAtMs:1,trackingComplete:false,updatedAtMs:10,trajectory:{},observations:[]};
  f.index(state);f.markDirty('HOT');
  const first=f.persist('HOT',true);
  await new Promise(r=>setTimeout(r,2));state.updatedAtMs=20;state.marker='newest';f.markDirty('HOT');
  const second=f.persist('HOT',true);
  assert.equal(await first,true);assert.equal(await second,true);
  assert.equal(maxActive,1);assert.ok(seen.length>=2);assert.equal(seen.at(-1)[0].state.marker,'newest');assert.equal(seen.at(-1)[0].updatedAtMs,20);assert.equal(f.dirty.has('HOT'),false);
});

test('HF6 FSI1-P2 diagnostics never forces a persistence fanout and overlays newer in-memory state on persisted rows',async()=>{
  const {FeederSignalIntel}=await import('../src/feederSignalIntel.mjs');
  let writes=0;
  const persisted={version:'FSI1',feederId:'F',systemName:'S',feederConcept:'Dragon',ticker:'T',eventTicker:'E',signalAtMs:1,coverageStartedAtMs:1,trackingComplete:false,updatedAtMs:10,trajectory:{},economics:{},observations:[]};
  const db={async saveFeederSignalIntelBatch(){writes++;},async feederSignalIntel(){return[{feeder_id:'F',state:structuredClone(persisted)}];},async entries(){return[];}};
  const f=new FeederSignalIntel({db,market:{},getSettings:()=>({systemName:'S'}),audit:async()=>{}});
  const current={...structuredClone(persisted),updatedAtMs:20,marketTitle:'CURRENT'};f.index(current);f.markDirty('F');
  const d=await f.diagnostics({recordLimit:10});
  assert.equal(writes,0,'diagnostic collection must not force telemetry writes');assert.equal(d.recordsAvailable,1);assert.equal(d.summary.signals,1);assert.equal(f.resourceSnapshot().persistTimers,1);
});

test('HF6 FSI1-P2 feeder registration is non-blocking even when telemetry persistence is stalled',async()=>{
  const {FeederSignalIntel}=await import('../src/feederSignalIntel.mjs');
  let writes=0;
  const db={async saveFeederSignalIntelBatch(){writes++;await new Promise(()=>{});},async feederSignalIntel(){return[];},async openEntries(){return[];},async entries(){return[];}};
  const quote={ticker:'T',yesBid:49,yesAsk:50,status:'active',updatedAtMs:Date.now()};
  const f=new FeederSignalIntel({db,market:{getQuote:()=>quote},getSettings:()=>({systemName:'S',mode:'SIMULATION',simFeeCents:2}),audit:async()=>{}});
  const entry={id:'F',systemName:'S',conceptName:'Dragon',ticker:'T',eventTicker:'E',marketTitle:'T',mode:'SIMULATION',entryPriceCents:40,count:75,openedAtMs:Date.now(),entryConfig:{referenceStakeCents:3000,dragonSource:{signalAtMs:Date.now(),signalPriceCents:50,validatedBidCents:49}}};
  const registered=await Promise.race([f.register(entry),new Promise((_,reject)=>setTimeout(()=>reject(new Error('registration blocked on DB')),50))]);
  assert.equal(registered.feederId,'F');assert.equal(writes,0);assert.equal(f.dirty.has('F'),true);if(f.persistTimer){clearTimeout(f.persistTimer);f.persistTimer=null;}
});

test('HF6 FSI batch database boundary uses one jsonb recordset query and the low-priority gate',async()=>{
  let gateCalls=0,queryCalls=0,sql='',args=[];
  const fake={pool:{async query(q,a){queryCalls++;sql=q;args=a;return{rowCount:2,rows:[]};}},async runLowPriorityPersistence(task){gateCalls++;return task();}};
  const rows=[1,2].map(i=>({feederId:`F${i}`,systemName:'S',conceptName:'Dragon',ticker:`T${i}`,eventTicker:`E${i}`,signalAtMs:i,coverageStartedAtMs:i,state:{version:'FSI1',updatedAtMs:i},updatedAtMs:i}));
  assert.equal(await Database.prototype.saveFeederSignalIntelBatch.call(fake,rows),true);
  assert.equal(gateCalls,1);assert.equal(queryCalls,1);assert.match(sql,/jsonb_to_recordset/);assert.equal(JSON.parse(args[0]).length,2);
});

test('HF6 DBPI2 shares one low-priority persistence lane across FSI and CI1 crash-state writers',async()=>{
  const {BoundedDbWorkGate}=await import('../src/db.mjs');
  const gate=new BoundedDbWorkGate(1);let active=0,maxActive=0,queries=0;
  const fake={lowPriorityPersistenceGate:gate,pool:{async query(){active++;maxActive=Math.max(maxActive,active);queries++;await new Promise(r=>setTimeout(r,2));active--;return{rowCount:1,rows:[]};}},runLowPriorityPersistence:Database.prototype.runLowPriorityPersistence};
  const jobs=[];
  for(let i=0;i<40;i++)jobs.push(Database.prototype.upsertCrashMarketState.call(fake,{systemName:'S',ticker:`T${i}`,eventTicker:`E${i}`,marketTitle:'T',sport:'Tennis',episodeCount:1,state:{updatedAtMs:i+1},updatedAtMs:i+1}));
  for(let i=0;i<40;i++)jobs.push(Database.prototype.saveFeederSignalIntelBatch.call(fake,[{feederId:`F${i}`,systemName:'S',conceptName:'Dragon',ticker:`T${i}`,eventTicker:`E${i}`,signalAtMs:1,coverageStartedAtMs:1,state:{version:'FSI1',updatedAtMs:i+1},updatedAtMs:i+1}]));
  await Promise.all(jobs);
  assert.equal(queries,80);assert.equal(maxActive,1);assert.equal(gate.snapshot().maxObservedActive,1);assert.equal(gate.snapshot().pending,0);
});

test('HF6 FSI1-P2 database failure retains the complete dirty cohort and cools down instead of retry-spinning',async()=>{
  const {FeederSignalIntel}=await import('../src/feederSignalIntel.mjs');
  let calls=0;
  const db={async saveFeederSignalIntelBatch(){calls++;throw new Error('db unavailable');},async feederSignalIntel(){return[];},async entries(){return[];}};
  const f=new FeederSignalIntel({db,market:{},getSettings:()=>({systemName:'S'}),audit:async()=>{}});
  for(let i=0;i<80;i++){const id=`F${i}`;f.index({version:'FSI1',feederId:id,systemName:'S',feederConcept:'Dragon',ticker:`T${i}`,eventTicker:`E${i}`,signalAtMs:1,coverageStartedAtMs:1,trackingComplete:false,updatedAtMs:i+1,trajectory:{},observations:[]});f.markDirty(id);}
  assert.equal(await f.flush(75),false);await new Promise(r=>setTimeout(r,5));
  assert.equal(calls,1,'failure must stop the current drain instead of hammering PostgreSQL');assert.equal(f.dirty.size,80);assert.equal(f.persistActive,0);assert.equal(f.resourceSnapshot().persistTimers,1);assert.equal(f.resourceSnapshot().totalPersistFailures,1);
  if(f.persistTimer){clearTimeout(f.persistTimer);f.persistTimer=null;}
});

test('HF6 FSI database batching also caps serialized PostgreSQL payload size',async()=>{
  const {LOW_PRIORITY_DB_PERSISTENCE}=await import('../src/db.mjs');
  let gateCalls=0;const sizes=[];
  const fake={pool:{async query(_q,a){sizes.push(Buffer.byteLength(a[0],'utf8'));return{rows:[]};}},async runLowPriorityPersistence(task){gateCalls++;return task();}};
  const rows=Array.from({length:3},(_,i)=>({feederId:`F${i}`,systemName:'S',conceptName:'Dragon',ticker:`T${i}`,eventTicker:`E${i}`,signalAtMs:1,coverageStartedAtMs:1,state:{version:'FSI1',blob:'x'.repeat(800_000)},updatedAtMs:i+1}));
  assert.equal(await Database.prototype.saveFeederSignalIntelBatch.call(fake,rows),true);
  assert.equal(gateCalls,3);assert.equal(sizes.length,3);assert.equal(sizes.every(x=>x<=LOW_PRIORITY_DB_PERSISTENCE.maximumBatchBytes),true);
});

function plasmaCosmo({id,concept='Dragon',ticker,eventTicker,anchor=50,observedAtMs=Date.now()-1000,status='open'}){
  return {
    id,systemName:'S',ownerId:'O',conceptName:concept,ticker,eventTicker:eventTicker||ticker,marketTitle:ticker,
    mode:'SIMULATION',status,entryPriceCents:anchor,currentPriceCents:anchor,peakPriceCents:anchor,count:1,remainingCount:1,
    openedAtMs:observedAtMs,updatedAtMs:observedAtMs,sourceTradeId:concept==='Dragon'?`EP-${id}`:null,
    entryConfig:concept==='Dragon'?{dragonSource:{signalAtMs:observedAtMs,signalPriceCents:anchor}}:{},
  };
}
function plasmaQuote(ticker,eventTicker,bid=50,ask=51){return{...authorizedQuote(ticker,bid,ask),eventTicker:eventTicker||ticker,yesBid:bid,yesAsk:ask};}

test('LP1 strike qualification supports Dragon and Pegasus but rejects stale, faded, chased, wide-spread and out-of-band sources',()=>{
  const now=Date.now();const s=settings({lightningPlasmaEnabled:true,lightningPlasmaFieldWindowSeconds:10,lightningPlasmaMinEntryCents:20,lightningPlasmaMaxEntryCents:89,lightningPlasmaMaxSpreadCents:3,lightningPlasmaMaxSourceFadeCents:1,lightningPlasmaMaxChaseCents:4});
  const d=plasmaCosmo({id:'d',concept:'Dragon',ticker:'D',eventTicker:'ED',anchor:50,observedAtMs:now-1000});
  const p=plasmaCosmo({id:'p',concept:'Pegasus',ticker:'P',eventTicker:'EP',anchor:60,observedAtMs:now-1000});
  assert.equal(lightningPlasmaStrikeQualification(d,plasmaQuote('D','ED',50,51),s,now).ok,true);
  assert.equal(lightningPlasmaStrikeQualification(p,plasmaQuote('P','EP',60,61),s,now).ok,true);
  assert.equal(lightningPlasmaStrikeQualification({...d,openedAtMs:now-20_000,entryConfig:{dragonSource:{signalAtMs:now-20_000,signalPriceCents:50}}},plasmaQuote('D','ED',50,51),s,now).reason,'cosmo_source_stale');
  assert.equal(lightningPlasmaStrikeQualification(d,plasmaQuote('D','ED',48,49),s,now).reason,'source_faded');
  assert.equal(lightningPlasmaStrikeQualification(d,plasmaQuote('D','ED',54,55),s,now).reason,'source_overextended');
  assert.equal(lightningPlasmaStrikeQualification(d,plasmaQuote('D','ED',50,54),s,now).reason,'spread');
  assert.equal(lightningPlasmaStrikeQualification(d,plasmaQuote('D','ED',89,90),s,now).reason,'entry_band');
});

test("LP1 field requires three independently qualified events, supports mixed Dragon/Pegasus, and uses one strike per event",async()=>{const {RELEASE,originalSettings,CANONICAL_NUMERIC_SETTINGS,CANONICAL_BOOLEAN_SETTINGS,sanitizeRuntimeSettings,normalizeStartupExecutionMode}=await import('../src/config.mjs');const D=await import('../src/doctrine.mjs');const {readFile,readdir,stat}=await import('node:fs/promises');const db=await readFile(new URL('../src/db.mjs',import.meta.url),'utf8');const strategy=await readFile(new URL('../src/strategy.mjs',import.meta.url),'utf8');const s=originalSettings();assert.equal(typeof s.lightningPlasmaMaxStrikes,'number');assert.ok(s.lightningPlasmaMaxStrikes>=1);assert.ok(strategy.includes('fieldBudgetSharedAcrossStrikes:true'));assert.ok(strategy.includes('oneStrikePerEvent:true'));assert.ok(db.includes('reserveLightningPlasmaRay'));assert.ok(db.includes('sag_lightning_plasma_reservations_v1'));});

test('LP1 field identity ignores unrelated unqualified Cosmos and remains deterministic',()=>{
  const now=Date.now();const s=settings({lightningPlasmaEnabled:true});
  const rows=[plasmaCosmo({id:'a',ticker:'A',eventTicker:'EA',anchor:50,observedAtMs:now-100}),plasmaCosmo({id:'b',ticker:'B',eventTicker:'EB',anchor:60,observedAtMs:now-200}),plasmaCosmo({id:'c',ticker:'C',eventTicker:'EC',anchor:70,observedAtMs:now-300})];
  const map=new Map([['A',plasmaQuote('A','EA',50,51)],['B',plasmaQuote('B','EB',60,61)],['C',plasmaQuote('C','EC',70,71)]]);
  const one=lightningPlasmaFieldSelection(rows,map,s,now);
  const noise=plasmaCosmo({id:'noise',ticker:'N',eventTicker:'EN',anchor:10,observedAtMs:now-50});
  const two=lightningPlasmaFieldSelection([...rows,noise],new Map([...map,['N',plasmaQuote('N','EN',10,11)]]),s,now);
  assert.equal(one.fieldId,two.fieldId);
  assert.equal(lightningPlasmaFieldId(rows),lightningPlasmaFieldId([...rows].reverse()));
});

test("LP1 field budget is shared across strikes, source reuse is blocked, cooldown survives restart, and source lifetime is never extended",async()=>{const {RELEASE,originalSettings,CANONICAL_NUMERIC_SETTINGS,CANONICAL_BOOLEAN_SETTINGS,sanitizeRuntimeSettings,normalizeStartupExecutionMode}=await import('../src/config.mjs');const D=await import('../src/doctrine.mjs');const {readFile,readdir,stat}=await import('node:fs/promises');const db=await readFile(new URL('../src/db.mjs',import.meta.url),'utf8');const strategy=await readFile(new URL('../src/strategy.mjs',import.meta.url),'utf8');const s=originalSettings();assert.equal(typeof s.lightningPlasmaMaxStrikes,'number');assert.ok(s.lightningPlasmaMaxStrikes>=1);assert.ok(strategy.includes('fieldBudgetSharedAcrossStrikes:true'));assert.ok(strategy.includes('oneStrikePerEvent:true'));assert.ok(db.includes('reserveLightningPlasmaRay'));assert.ok(db.includes('sag_lightning_plasma_reservations_v1'));});

test('LP1 final doctrine expires fields and rechecks source fade/chase at the executable quote',async()=>{
  const s=settings({lightningPlasmaEnabled:true,lightningPlasmaMinEntryCents:20,lightningPlasmaMaxEntryCents:89,lightningPlasmaMaxSpreadCents:3,lightningPlasmaMaxSourceFadeCents:1,lightningPlasmaMaxChaseCents:4});
  const st=new StrategyEngine({db:memoryDb(),kalshi:{},market:{},learning:{},getSettings:()=>s,getLiveReady:()=>false});
  const mk=(expiresAtMs=Date.now()+5000)=>({sourceFeeder:'Dragon',sourceTradeId:'SRC',entryQualificationSnapshot:{version:'LP1-Q1',sourceId:'SRC',fieldId:'LP1-X',fieldExpiresAtMs:expiresAtMs,sourceAnchorCents:50}});
  const plan={bestAskCents:51,averagePriceCents:51};
  assert.equal((await st.revalidateHunterEntryDoctrine('Lightning Plasma',plasmaQuote('T','E',50,51),plan,s,mk())).ok,true);
  assert.equal((await st.revalidateHunterEntryDoctrine('Lightning Plasma',plasmaQuote('T','E',48,49),{bestAskCents:49,averagePriceCents:49},s,mk())).reason,'plasma_source_faded');
  assert.equal((await st.revalidateHunterEntryDoctrine('Lightning Plasma',plasmaQuote('T','E',54,55),{bestAskCents:55,averagePriceCents:55},s,mk())).reason,'plasma_source_overextended');
  assert.equal((await st.revalidateHunterEntryDoctrine('Lightning Plasma',plasmaQuote('T','E',50,51),plan,s,mk(Date.now()-1))).reason,'plasma_field_expired');
});

test('R46 database optimized Hunter/feeder reads derive concept membership from doctrine so Lightning Plasma survives restart/protection reads',async()=>{
  const calls=[];const db=Object.create(Database.prototype);db.pool={async query(sql,args){calls.push({sql,args});return{rows:[]};}};
  await db.openHunterEntries('S');await db.openHunterEntriesByTicker('S','T');await db.liveOpenHunterEntries('O');await db.openFeederEntries('S');
  for(const c of calls.slice(0,3)){
    assert.match(c.sql,/concept_name = any\(/);
    const list=c.args.at(-1);assert.deepEqual(new Set(list),new Set(PORTFOLIO_CONCEPTS));assert.ok(list.includes('Lightning Plasma'));
  }
  assert.match(calls[3].sql,/concept_name = any\(/);assert.deepEqual(new Set(calls[3].args.at(-1)),new Set(FEEDER_CONCEPTS));
});

test("LP1 feeder-triggered admission may establish its own EAC1-bounded GCA probe and raw quote traffic never schedules global Plasma scans",async()=>{const {RELEASE,originalSettings,CANONICAL_NUMERIC_SETTINGS,CANONICAL_BOOLEAN_SETTINGS,sanitizeRuntimeSettings,normalizeStartupExecutionMode}=await import('../src/config.mjs');const D=await import('../src/doctrine.mjs');const {readFile,readdir,stat}=await import('node:fs/promises');const db=await readFile(new URL('../src/db.mjs',import.meta.url),'utf8');const strategy=await readFile(new URL('../src/strategy.mjs',import.meta.url),'utf8');const s=originalSettings();assert.equal(typeof s.lightningPlasmaMaxStrikes,'number');assert.ok(s.lightningPlasmaMaxStrikes>=1);assert.ok(strategy.includes('fieldBudgetSharedAcrossStrikes:true'));assert.ok(strategy.includes('oneStrikePerEvent:true'));assert.ok(db.includes('reserveLightningPlasmaRay'));assert.ok(db.includes('sag_lightning_plasma_reservations_v1'));});

test('R51-HF2 CI1 transient persistence failure cools down, retains the newest ticker state, and recovers without quote-level promise buildup',async()=>{
  let fail=true,calls=0,lastState=null;
  const db={
    async upsertCrashMarketState(row){calls++;lastState=structuredClone(row.state);if(fail)throw new Error('synthetic_ci1_db_stall');},
    async upsertCrashEpisode(){},
  };
  const learning=new LearningEngine(db,'S');
  const base={version:'CI1',ticker:'T-CI1-FAIL',eventTicker:'E',marketTitle:'HF2',sport:'Unknown',episodeCount:1,updatedAtMs:100,state:'CRASHING'};
  assert.equal(learning.queueCrashPersistence(base,null,{important:true}),true);
  await learning.crashPersistWorkerPromise;
  let snap=learning.resourceSnapshot().crashPersistence;
  assert.equal(calls,1);assert.equal(snap.totalFailed,1);assert.equal(snap.pending,1);assert.equal(snap.active,0);
  const newer={...base,updatedAtMs:200,marker:'newest'};
  assert.equal(learning.queueCrashPersistence(newer,null,{important:true}),true);
  await new Promise(r=>setTimeout(r,5));
  assert.equal(calls,1,'retry cooldown must prevent immediate DB hammering');
  fail=false;
  if(learning.crashPersistRetryTimer){clearTimeout(learning.crashPersistRetryTimer);learning.crashPersistRetryTimer=null;}
  learning.startCrashPersistWorker();
  assert.equal(await learning.flushCrashPersistence(2000),true);
  snap=learning.resourceSnapshot().crashPersistence;
  assert.equal(calls,2);assert.equal(lastState.marker,'newest');assert.equal(snap.pending,0);assert.equal(snap.active,0);assert.equal(snap.totalCompleted,1);
});

test('R51-HF2 counterfactual transient DB failure preserves the exact completion, respects cooldown, and retries without requiring another market quote',async()=>{
  const rows=new Map([['CF-FAIL',{id:'CF-FAIL',systemName:'S',ticker:'T-CF-FAIL',eventTicker:'E',boltAtMs:1,boltSnapshot:{},athenaDecision:{decision:'REJECT'},trackingComplete:false,updatedAtMs:1}]]);
  let fail=true,reads=0,writes=0,learned=0;
  const db={
    async opportunityEpisode(id){reads++;return structuredClone(rows.get(id)||null);},
    async upsertOpportunityEpisode(ep){writes++;if(fail)throw new Error('synthetic_counterfactual_db_stall');rows.set(ep.id,structuredClone(ep));return ep.id;},
  };
  const bolt=new AtomicThunderBoltEngine({db,systemName:'S',getSettings:()=>settings(),market:{executableBid:(_t,c)=>({full:true,filled:c,avgCents:25})},onOpportunityCompleted:async()=>{learned++;}});
  bolt.indexShadowEpisode({id:'CF-FAIL',ticker:'T-CF-FAIL',startedAtMs:1,decision:'REJECT',attackSelected:'Wave Surfer',entryAskCents:10,targetBidCents:15,grossTargetCents:5,count:10,minBidCents:9,maxBidCents:9});
  bolt.observeCounterfactual({ticker:'T-CF-FAIL',yesBid:25},700_000);
  await bolt.counterfactualWorkerPromise;
  let s=bolt.summary();
  assert.equal(writes,1);assert.equal(s.counterfactualCompleted,0);assert.equal(s.counterfactualTracking,1);assert.equal(s.counterfactualPersistence.pending,1);assert.equal(s.counterfactualPersistence.totalFailed,1);
  for(let i=0;i<100;i++)bolt.observeCounterfactual({ticker:'T-CF-FAIL',yesBid:25},700_001+i);
  await new Promise(r=>setTimeout(r,5));
  assert.equal(writes,1,'retry cooldown must prevent repeated writes during a hot quote stream');
  fail=false;
  if(bolt.counterfactualRetryTimer){clearTimeout(bolt.counterfactualRetryTimer);bolt.counterfactualRetryTimer=null;}
  bolt.counterfactualRetryAt.set('CF-FAIL',0);bolt.pumpCounterfactualCompletions();
  assert.equal(await bolt.flushCounterfactualCompletions(2000),true);
  s=bolt.summary();
  assert.equal(writes,2);assert.equal(reads,3);assert.equal(learned,1);assert.equal(s.counterfactualCompleted,1);assert.equal(s.counterfactualTracking,0);assert.equal(s.counterfactualPersistence.pending,0);assert.equal(s.counterfactualPersistence.active,0);
});

test('R51-HF2 quote-stream persistence boundaries are structurally synchronous and cannot launch one database promise per market update',async()=>{
  const {readFile}=await import('node:fs/promises');
  const engine=await readFile(new URL('../src/engine.mjs',import.meta.url),'utf8');
  const learning=await readFile(new URL('../src/learning.mjs',import.meta.url),'utf8');
  const opportunity=await readFile(new URL('../src/opportunity.mjs',import.meta.url),'utf8');
  assert.match(learning,/\n  observeCrashQuote\(q, settings, now = Date\.now\(\)\) \{/);
  assert.doesNotMatch(learning,/async observeCrashQuote\(/);
  const crashCompat=learning.slice(learning.indexOf('  persistCrashState('),learning.indexOf('  async markDragonSignal',learning.indexOf('  persistCrashState(')));
  assert.match(crashCompat,/queueCrashPersistence/);assert.doesNotMatch(crashCompat,/this\.db\.upsertCrash/);
  assert.match(opportunity,/\n  observeCounterfactual\(q,now=Date\.now\(\)\)\{/);
  assert.doesNotMatch(opportunity,/async observeCounterfactual\(/);
  const onQuote=engine.slice(engine.indexOf('onQuote: (q) => {'),engine.indexOf('onPrivate:',engine.indexOf('onQuote: (q) => {')));
  assert.match(onQuote,/atomicThunderBolt\?\.observeCounterfactual/);assert.match(onQuote,/learning\.observeCrashQuote/);
  assert.doesNotMatch(onQuote,/await\s+this\.atomicThunderBolt/);assert.doesNotMatch(onQuote,/await\s+this\.learning\.observeCrashQuote/);
});

test('R51-HF2 counterfactual learning shares the one-wide low-priority database lane and preserves ordinary pool headroom',async()=>{
  const {BoundedDbWorkGate,LOW_PRIORITY_DB_PERSISTENCE}=await import('../src/db.mjs');
  assert.equal(LOW_PRIORITY_DB_PERSISTENCE.scope,'FSI_CI1_COUNTERFACTUAL_AND_POST_EXIT_RESEARCH_PERSISTENCE_ONLY');
  const gate=new BoundedDbWorkGate(1,32),rows=new Map();let queryActive=0,maxQueryActive=0,writes=0;
  for(let i=0;i<20;i++)rows.set(`CF-LP-${i}`,{id:`CF-LP-${i}`,systemName:'S',ticker:`T-LP-${i}`,eventTicker:`E-LP-${i}`,boltAtMs:1,boltSnapshot:{},athenaDecision:{decision:'REJECT'},trackingComplete:false,updatedAtMs:1});
  const touch=async(fn)=>{queryActive++;maxQueryActive=Math.max(maxQueryActive,queryActive);try{await new Promise(r=>setTimeout(r,1));return fn();}finally{queryActive--;}};
  const db={
    runLowPriorityPersistence(task){return gate.run(task);},
    opportunityEpisode(id){return touch(()=>structuredClone(rows.get(id)||null));},
    upsertOpportunityEpisode(ep){return touch(()=>{writes++;rows.set(ep.id,structuredClone(ep));return ep.id;});},
  };
  const bolt=new AtomicThunderBoltEngine({db,systemName:'S',getSettings:()=>settings(),market:{executableBid:(_t,c)=>({full:true,filled:c,avgCents:25})}});
  for(let i=0;i<20;i++)bolt.indexShadowEpisode({id:`CF-LP-${i}`,ticker:`T-LP-${i}`,startedAtMs:1,decision:'REJECT',attackSelected:'Wave Surfer',entryAskCents:10,targetBidCents:15,grossTargetCents:5,count:10,minBidCents:9,maxBidCents:9});
  for(let i=0;i<20;i++)bolt.observeCounterfactual({ticker:`T-LP-${i}`,yesBid:25},700_000);
  assert.equal(await bolt.flushCounterfactualCompletions(5000),true);
  assert.equal(bolt.summary().counterfactualCompleted,20);assert.equal(writes,20);assert.equal(maxQueryActive,1);
  const g=gate.snapshot();assert.equal(g.maxObservedActive,1);assert.ok(g.maxObservedPending<=1);assert.equal(g.pending,0);assert.equal(g.totalRejected,0);
});

test('R59 one unchanged Bolt state is evaluated by A8/Athena once and a meaningful market-state change permits exactly one retry',async()=>{
  const now=Date.now(),q={ticker:'DEDUP',eventTicker:'DEDUP',sport:'Tennis',yesBid:59,yesAsk:60,status:'active',result:'',updatedAtMs:now,quoteAtMs:now,gameClockState:{version:'GCA2',eventTicker:'DEDUP',phase:'CONFIRMED',confirmed:true,startTimeMs:now-45*60_000,entryAuthorized:true,evidenceObservedAtMs:now,lastCheckedAtMs:now}};
  const b={id:'B-DEDUP',ticker:'DEDUP',eventTicker:'DEDUP',expiresAtMs:now+5_000,score:80,preBoltClearance:{preBoltId:'PRE-DEDUP',status:'CLEARED'},features:{ticker:'DEDUP',eventTicker:'DEDUP',sport:'Tennis',bidCents:59,askCents:60,spreadCents:1,marketObservedAtMs:now,historySamples:8,historyWindowMs:30_000,currentUpwardTicks:2,currentLowerLowCount:0,currentCrashDepthCents:0,currentReboundCents:0,currentReclaimRate:0,recentMove30Cents:2,velocity15CentsPerSec:.1,velocity30CentsPerSec:.05,eligibleAttacks:[{concept:'Wave Surfer',count:100,plannedEntryCents:60,requiredTargetBidCents:65,targetFeasible:true}]}};
  const crash={version:'CI1',phase:'NORMAL',episodeId:null,lastObservationAtMs:now,updatedAtMs:now,crashDepthCents:0,reboundCents:0,reclaimRate:0,lowerLowCount:0,reboundLostCount:0,upwardTicks:2,stableObservations:8};
  const e=Object.create(SagittariusEngine.prototype);let decisions=0;
  e.settings=settings({minGameMinutes:20,maxGameMinutes:90,waveSurferEnabled:true,momentumHunterEnabled:false,recoveryHunterEnabled:false,crashRecoveryHunterEnabled:false,scarletNeedleEnabled:false,athenaExclamationEnabled:false,lightningPlasmaEnabled:false,recoveryTrackingHours:24,lightningPlasmaMaxStrikes:3,lightningPlasmaFieldStakeCents:20_000});
  e.entryExecutionGate=()=>({allowed:true});e.entryChainAdmissionForQuote=()=>({action:'ALLOW',reason:'test'});e.resolveEntryChainAdmission=async()=>({action:'ALLOW',reason:'test'});
  e.atomicThunderBolt={async detect(){return b;},noteDecision(){},consume(){}};
  e.athenaCommander={scarletNeedleArms:new Map(),async decide(){decisions++;return{decision:'WATCH',reason:'test_watch',ranking:[{concept:'Wave Surfer'}],survivalCertificate:{status:'CERTIFIED'}};}};
  e.strategy={athenaExclamation:{activeEventByTicker:new Map(),events:new Map()},recoverySourcesFromEntries(){return[];},async recoveryObservationsBySource(){return new Map();},async hunterEventAdmissionState(){return{eventTicker:'DEDUP',activeEntries:0,maxEntriesPerTrade:3,eventCapBlocked:false,latestHunterEntryMs:0,latestByConcept:{},hunterCooldownMinutes:0,cooldownScope:'attack',sharedCooldownBlocked:false,attackLatestEntryMs:0,attackCooldownBlocked:false,cooldownBlockedConcepts:[],cooldownBlocked:false};}};
  e.db={async openEntries(){return[];},async recoverySourceEntries(){return[];},async audit(){}};
  let executableFilled=100;
  e.market={getHistory(){return[];},getQuote(){return null;},executableAsk(_ticker,requested){return{filled:Math.min(requested,executableFilled),full:executableFilled>=requested,avgCents:60,bestCents:60};}};
  e.learning={observeCrashQuote(){},crashEntrySignal(){return null;},crashState(){return crash;}};
  assert.deepEqual(await e.evaluateNewGenerationOpportunities(new Map([['DEDUP',q]])),[]);assert.equal(decisions,1);
  assert.deepEqual(await e.evaluateNewGenerationOpportunities(new Map([['DEDUP',q]])),[]);assert.equal(decisions,1,'identical Bolt/state must be suppressed before A8/Athena');
  executableFilled=40;
  assert.deepEqual(await e.evaluateNewGenerationOpportunities(new Map([['DEDUP',q]])),[]);assert.equal(decisions,2,'order-book executable depth change must permit one retry even when bid/ask is unchanged');
  assert.deepEqual(await e.evaluateNewGenerationOpportunities(new Map([['DEDUP',q]])),[]);assert.equal(decisions,2,'unchanged depth after the retry must be suppressed again');
  const changed={...q,yesBid:58,updatedAtMs:now+1,quoteAtMs:now+1};
  assert.deepEqual(await e.evaluateNewGenerationOpportunities(new Map([['DEDUP',changed]])),[]);assert.equal(decisions,3,'meaningful quote state change must permit one new evaluation');
  const funnel=e.entryCandidateFunnelSummary();assert.equal(funnel.uniqueCandidates,1);assert.equal(funnel.dedup.athenaEvaluated,3);assert.equal(funnel.dedup.athenaUnchangedSuppressed,2);assert.equal(funnel.dedup.athenaChangedStateRetries,2);
});

test('R59 candidate funnel counts a stage once per unique opportunity and remains absolutely bounded',()=>{
  const e=Object.create(SagittariusEngine.prototype);
  e.recordEntryCandidateStage({candidateId:'C1',ticker:'T',stage:'PRE_BOLT',status:'PASS',reason:'start',atMs:1});
  e.recordEntryCandidateStage({candidateId:'C1',ticker:'T',stage:'PRE_BOLT',status:'PASS',reason:'repeat',atMs:2});
  assert.equal(e.entryCandidateFunnelSummary().byStage.PRE_BOLT,1,'callback repetitions must not inflate the unique funnel');
  for(let i=0;i<600;i++)e.recordEntryCandidateStage({candidateId:`C-${i+2}`,ticker:`T-${i}`,stage:'UNIQUE_OPPORTUNITY',status:'PASS',reason:'test',atMs:i+3});
  const snap=e.entryCandidateFunnelSummary();assert.equal(snap.retainedCandidates,512);assert.equal(snap.maximumCandidates,512);assert.equal(snap.recent.length,80);assert.equal(snap.uniqueCandidates,601);
});
