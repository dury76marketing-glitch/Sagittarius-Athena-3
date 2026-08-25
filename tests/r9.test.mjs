import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { originalSettings, sanitizeRuntimeSettings, RELEASE } from '../src/config.mjs';
import { SagittariusEngine, resolveObservedGameStart } from '../src/engine.mjs';
import { StrategyEngine, confirmedInGameElapsedMinutes } from '../src/strategy.mjs';
import { Database } from '../src/db.mjs';
import {
  GameClockAuthority,
  classifyLiveData,
  countPbpEvents,
  isConfirmedGameClockState,
  isEntryAuthorizedGameClockState,
  selectEventMilestone,
} from '../src/gameClock.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const openLike = (s) => ['open','entry_pending','exit_pending','pending_recovery'].includes(s);
const settings = (overrides={}) => ({
  ...originalSettings(), systemName:'SAGITTARIUS', ownerId:'r10-test', mode:'SIMULATION', liveArmed:false,
  maxPositions:50, maxEntriesPerTrade:50, hunterCooldownMinutes:0, minGameMinutes:0, eventCooldownMinutes:0, simFillProbability:1,
  recoveryMinObservations:5, recoveryMinRate:.7, ...overrides,
});
function confirmedClock(eventTicker,startTimeMs,source='kalshi_live_data'){const now=Date.now();return{version:'GCA1',eventTicker,phase:'CONFIRMED',confirmed:true,startTimeMs,source,sourceStrength:source==='occurrence_passed'?'fallback':'strong',observedAtMs:startTimeMs,entryAuthorized:true,evidenceObservedAtMs:now,lastCheckedAtMs:now};}
function q(ticker='T',bid=89,ask=90,eventTicker=ticker){const now=Date.now();const start=now-30*60000;return{ticker,title:ticker,eventTicker,seriesTicker:ticker,yesBid:bid,yesAsk:ask,recentTrades:20,volume24h:10000,updatedAtMs:now,status:'active',result:'',closeTimeMs:now+2*60*60*1000,occurrenceTimeMs:now-35*60000,gameStartTimeMs:start,gameClockState:confirmedClock(eventTicker,start),liveStatus:'live'};}
function row(overrides={}){const t=Date.now();return{id:'e1',systemName:'SAGITTARIUS',ownerId:'r10-test',conceptName:'Momentum Hunter',ticker:'T',eventTicker:'EV',marketTitle:'T',mode:'SIMULATION',status:'open',entryPriceCents:88,currentPriceCents:88,peakPriceCents:90,stopLossCents:10,count:10,remainingCount:10,pnlCents:0,openedAtMs:t-60000,updatedAtMs:t-1000,...overrides};}
function memoryDb(initial=[]){const rows=new Map(initial.map(x=>[x.id,structuredClone(x)]));return{rows,inserted:[],audits:[],saved:null,async entries(){return[...rows.values()];},async insertEntry(e){const x=structuredClone(e);rows.set(e.id,x);this.inserted.push(x);},async updateEntry(id,p){const e=rows.get(id);if(e)Object.assign(e,structuredClone(p));},async audit(level,event,data){this.audits.push({level,event,data});},async saveSettings(v){this.saved=structuredClone(v);}};}
function strategyFor(s,db=memoryDb()){
  const eventByTicker=new Map();
  const market={
    getHistory:()=>[],
    async refreshTicker(t){return q(t,89,90,eventByTicker.get(t)||t);},
    executableAsk:()=>({filled:1000,full:true,avgCents:90,bestCents:90}),
    executableBid:(_ticker,count)=>({filled:count,full:true,avgCents:89,bestCents:89}),
  };
  const refreshGameClock=async(qq)=>{
    const event=qq.eventTicker||qq.ticker;
    eventByTicker.set(qq.ticker,event);
    const g=qq.gameClockState;
    if(!isConfirmedGameClockState(g,event))return{gameClockState:g||{},gameStartTimeMs:null,liveStatus:qq.liveStatus};
    const now=Date.now();
    return{gameClockState:{...g,entryAuthorized:true,evidenceObservedAtMs:now,lastCheckedAtMs:now},gameStartTimeMs:Number(g.startTimeMs)||null,liveStatus:qq.liveStatus};
  };
  return new StrategyEngine({db,kalshi:{},market,learning:{recoveryRate:async()=>null},getSettings:()=>s,getLiveReady:()=>false,refreshGameClock,random:()=>0});
}

function runtimeDb(initial = originalSettings()) {
  let stored = sanitizeRuntimeSettings(initial);
  return {
    async saveSettings(v) { stored = sanitizeRuntimeSettings(v); },
    async loadSettings(defaults) { return sanitizeRuntimeSettings(stored, defaults); },
    get stored() { return structuredClone(stored); },
  };
}

test('R42 retains Athena B1, Golden Eye GE1-R2, FSI1, DX1 and the hardened safety baseline while adding HELC1', () => {
  assert.equal(RELEASE, 'SAGITTARIUS-R43-ENTRY-QUALITY-COVENANT-2026-08-25');
  assert.equal(originalSettings().minGameMinutes, 20, 'original Base44 min_game_minutes default must be restored');
});

test('Shared/System Settings contains only the explicitly approved shared controls', async () => {
  const app = await readFile(resolve(root, 'public/app.js'), 'utf8');
  const sharedBlock = app.match(/const SETTINGS = \[([\s\S]*?)\n\];/)?.[1] || '';
  const expected = ['maxPositions','maxEntriesPerTrade','hunterCooldownMinutes','minGameMinutes','eventCooldownMinutes','maxSpreadCents','startingCapitalCents','simFillProbability','simFeeCents','recoveryTrackingHours'];
  for (const key of expected) assert.ok(sharedBlock.includes(`'${key}'`), `${key} missing from Shared/System Settings`);
  const allKeys=[...sharedBlock.matchAll(/\['([^']+)'/g)].map(m=>m[1]);
  assert.deepEqual(allKeys,expected,'Shared/System Settings contains a model-specific or unapproved field');
});

test('every feeder/Hunter owns all of its editable customization fields in the Entry Models board', async () => {
  const app = await readFile(resolve(root, 'public/app.js'), 'utf8');
  const modelBlock = app.match(/const MODEL_FIELDS = \{([\s\S]*?)\n\};/)?.[1] || '';
  const required={
    Pegasus:['pegasusReferenceStakeCents','pegasusMinPriceCents','pegasusMaxPriceCents','pegasusDropCents'],
    Sagittarius:['sagittariusReferenceStakeCents','sagittariusMinPriceCents','sagittariusMaxPriceCents','sagittariusDropCents'],
    Dragon:['dragonReferenceStakeCents','dragonMinSignalPriceCents','dragonMaxSignalPriceCents','dragonMaxEpisode'],
    GoldenDragon:['goldenDragonReferenceStakeCents','goldenDragonMinSignalPriceCents','goldenDragonMaxSignalPriceCents','goldenDragonMaxEpisode','goldenDragonMinTrustScore','goldenDragonMinRecoveryAgeSeconds','goldenDragonMaxRecoveryAgeSeconds'],
    Momentum:['momentumStakeCents','momentumMinEntryCents','momentumMaxEntryCents','momentumHunterStopLossCents','momentumMinRiseCents','momentumMinPullbackCents','momentumMaxPullbackCents','momentumMaxSpreadCents','momentumMinTimeLeftMinutes','recoveryMinObservations','recoveryMinRate'],
    Wave:['waveStakeCents','waveMinEntryCents','waveMaxEntryCents','waveStopCents','waveMinFeederFavorableMoveCents','waveMaxSpreadCents'],
    Recovery:['recoveryBaseStakeCents','recoveryMinEntryCents','recoveryMaxEntryCents','recoveryHunterStopLossCents','recoveryMinReboundCents'],
    CrashRecovery:['crashRecoveryStakeCents','crashRecoveryMinEntryCents','crashRecoveryMaxEntryCents','crashRecoveryStopLossCents','crashRecoveryMaxSpreadCents','crashRecoveryMinCrashCents','crashRecoveryMinReboundCents','crashRecoveryMinReclaimRate','crashRecoveryStableObservations','crashRecoveryUpwardTicks','crashRecoveryEpisodeResetRate'],
    DragonRecovery:['dragonRecoveryStakeCents','dragonRecoveryMinEntryCents','dragonRecoveryMaxEntryCents','dragonRecoveryStopLossCents','dragonRecoveryMaxSpreadCents','dragonRecoveryMinReboundCents','dragonRecoveryMinReclaimRate','dragonRecoveryStableObservations','dragonRecoveryUpwardTicks'],
    GoldenDragonHunter:['goldenDragonHunterStakeCents','goldenDragonHunterMinEntryCents','goldenDragonHunterMaxEntryCents','goldenDragonHunterStopLossCents','goldenDragonHunterMaxSpreadCents','goldenDragonHunterMinTrustScore','goldenDragonHunterMaxEpisode','goldenDragonHunterMinReboundCents','goldenDragonHunterMinReclaimRate','goldenDragonHunterStableObservations','goldenDragonHunterUpwardTicks'],
  };
  for(const [model,keys] of Object.entries(required)) for(const key of keys) assert.ok(modelBlock.includes(key),`${model} is missing ${key}`);
  for(const legacy of ['feederStakeCents','hunterStakeCents','stakeCents']) assert.equal(modelBlock.includes(`'${legacy}'`),false,`${legacy} remains a competing model control`);
});

test('R9 shared stake values migrate once into independent model-owned settings and legacy keys disappear',()=>{
  const migrated=sanitizeRuntimeSettings({
    systemName:'SAGITTARIUS',ownerId:'legacy-r9',mode:'SIMULATION',
    feederStakeCents:3100,hunterStakeCents:21000,stakeCents:22000,
    pegasusMinPriceCents:80,pegasusMaxPriceCents:94,pegasusDropCents:2,
    sagittariusMinPriceCents:80,sagittariusMaxPriceCents:94,sagittariusDropCents:3,
  });
  assert.equal(migrated.pegasusReferenceStakeCents,3100);
  assert.equal(migrated.sagittariusReferenceStakeCents,3100);
  assert.equal(migrated.momentumStakeCents,21000);
  assert.equal(migrated.recoveryBaseStakeCents,21000);
  assert.equal(migrated.waveStakeCents,22000);
  for(const legacy of ['feederStakeCents','hunterStakeCents','stakeCents']) assert.equal(Object.hasOwn(migrated,legacy),false);
});

test('custom model-owned values persist through the API and simulated database restart without snapping back', async () => {
  const db=runtimeDb();
  const engine=Object.create(SagittariusEngine.prototype);
  engine.settings=sanitizeRuntimeSettings({...originalSettings(),systemName:'SAGITTARIUS',ownerId:'r10-test',mode:'SIMULATION'});
  engine.db=db;
  const patch={
    pegasusReferenceStakeCents:3500,pegasusMinPriceCents:81,pegasusMaxPriceCents:93,pegasusDropCents:4,
    sagittariusReferenceStakeCents:4500,sagittariusMinPriceCents:82,sagittariusMaxPriceCents:92,sagittariusDropCents:5,
    momentumStakeCents:17500,momentumMinEntryCents:78,momentumMaxEntryCents:91,momentumHunterStopLossCents:13,momentumMinRiseCents:3,momentumMinPullbackCents:2,momentumMaxPullbackCents:10,momentumMaxSpreadCents:2,momentumMinTimeLeftMinutes:4,recoveryMinObservations:9,recoveryMinRate:.82,
    waveStakeCents:18500,waveMinEntryCents:85,waveMaxEntryCents:91,waveStopCents:16,waveMinFeederFavorableMoveCents:6,waveMaxSpreadCents:2,
    recoveryBaseStakeCents:12500,recoveryMinEntryCents:79,recoveryMaxEntryCents:90,recoveryHunterStopLossCents:12,recoveryMinReboundCents:7,
    crashRecoveryStakeCents:19000,crashRecoveryMinEntryCents:71,crashRecoveryMaxEntryCents:88,crashRecoveryStopLossCents:34,crashRecoveryMaxSpreadCents:2,
    crashRecoveryMinCrashCents:16,crashRecoveryMinReboundCents:8,crashRecoveryMinReclaimRate:.45,crashRecoveryStableObservations:4,crashRecoveryUpwardTicks:3,crashRecoveryEpisodeResetRate:.85,
    maxEntriesPerTrade:3,hunterCooldownMinutes:2,minGameMinutes:12,
  };
  await engine.patchSettings(patch);
  const restarted=await db.loadSettings(originalSettings());
  for(const [k,v] of Object.entries(patch)) assert.equal(restarted[k],v,`${k} reverted after restart`);
  await assert.rejects(()=>engine.patchSettings({stakeCents:999}),/Unknown or retired setting/);
  await assert.rejects(()=>engine.patchSettings({feederStakeCents:999}),/Unknown or retired setting/);
  await assert.rejects(()=>engine.patchSettings({hunterStakeCents:999}),/Unknown or retired setting/);
  await assert.rejects(()=>engine.patchSettings({crashRecoveryStableObservations:2,crashRecoveryUpwardTicks:3}),/cannot exceed/);
});

test('Pegasus and Sagittarius reference stakes are independent and remain display-only',async()=>{
  const db=memoryDb();
  const s=settings({pegasusReferenceStakeCents:3000,sagittariusReferenceStakeCents:6000});
  const st=strategyFor(s,db);
  const p=await st.createGhost('Pegasus',q('P',89,90),90,null);
  const g=await st.createGhost('Sagittarius',q('S',89,90),90,null);
  assert.equal(p.count,33);
  assert.equal(g.count,66);
  assert.equal(p.entryOrderId??null,null);
  assert.equal(g.entryOrderId??null,null);
});

test('shared max entries per trade caps simultaneous Hunter entries on one event only',async()=>{
  const active=[row({id:'a',conceptName:'Momentum Hunter',ticker:'A1',eventTicker:'EV'}),row({id:'b',conceptName:'Wave Surfer',ticker:'A2',eventTicker:'EV'})];
  const db=memoryDb(active);
  const s=settings({maxEntriesPerTrade:2,hunterCooldownMinutes:0});
  const st=strategyFor(s,db);
  assert.equal(await st.hunterEntryPolicy('Recovery Hunter',q('A',80,81,'EV')),false);
  assert.equal(db.audits.at(-1).event,'hunter_entry_trade_cap_blocked');
  assert.equal(await st.hunterEntryPolicy('Recovery Hunter',q('B',80,81,'OTHER')),true,'unrelated events must not share the per-trade cap');
});

test('shared Hunter cooldown applies across Hunter models on the same event and can be disabled with zero',async()=>{
  const recent=row({id:'a',conceptName:'Momentum Hunter',status:'closed',ticker:'A',eventTicker:'EV',openedAtMs:Date.now()-30000,closedAtMs:Date.now()-1000});
  const db=memoryDb([recent]);
  const s=settings({hunterCooldownMinutes:2,maxEntriesPerTrade:8});
  const st=strategyFor(s,db);
  assert.equal(await st.hunterEntryPolicy('Wave Surfer',q('A',80,81,'EV')),false);
  assert.equal(db.audits.at(-1).event,'hunter_entry_cooldown_blocked');
  s.hunterCooldownMinutes=0;
  assert.equal(await st.hunterEntryPolicy('Wave Surfer',q('A',80,81,'EV')),true);
});

test('R13 exact ticker lock blocks a second real Hunter even when event cap and cooldown would allow it',async()=>{
  const existing=row({id:'mom',conceptName:'Momentum Hunter',ticker:'LOCK',eventTicker:'EV',status:'open',sourceFeeder:'Pegasus'});
  const db=memoryDb([existing]);
  const s=settings({maxEntriesPerTrade:3,hunterCooldownMinutes:0,minGameMinutes:0});
  const st=strategyFor(s,db);
  assert.equal(await st.hunterEntryPolicy('Wave Surfer',q('LOCK',91,92,'EV')),false);
  const a=db.audits.at(-1);
  assert.equal(a.event,'hunter_exact_ticker_exposure_blocked');
  assert.equal(a.data.existingHunterId,'mom');
  assert.equal(a.data.existingConcept,'Momentum Hunter');
  assert.equal(a.data.activeHuntersOnTicker,1);
});

test('R13 exact ticker lock treats pending entry/exit/recovery as exposure and clears only after close',async()=>{
  for(const status of ['entry_pending','exit_pending','pending_recovery']){
    const db=memoryDb([row({id:`x-${status}`,conceptName:'Wave Surfer',ticker:'LOCK2',eventTicker:'EV2',status})]);
    const s=settings({maxEntriesPerTrade:9,hunterCooldownMinutes:0,minGameMinutes:0});
    const st=strategyFor(s,db);
    assert.equal(await st.hunterEntryPolicy('Recovery Hunter',q('LOCK2',80,81,'EV2')),false,status);
    assert.equal(db.audits.at(-1).event,'hunter_exact_ticker_exposure_blocked');
  }
  const closed=row({id:'closed',conceptName:'Momentum Hunter',ticker:'LOCK2',eventTicker:'EV2',status:'closed',closedAtMs:Date.now()-1});
  const db=memoryDb([closed]);
  const s=settings({maxEntriesPerTrade:9,hunterCooldownMinutes:0,minGameMinutes:0});
  const st=strategyFor(s,db);
  assert.equal(await st.hunterEntryPolicy('Recovery Hunter',q('LOCK2',80,81,'EV2')),true,'closed Hunter must release ticker');
});

test('R13 feeders never consume the exact ticker Hunter lock',async()=>{
  const feeder=row({id:'feed',conceptName:'Pegasus',ticker:'FEEDLOCK',eventTicker:'FEV',status:'open'});
  const db=memoryDb([feeder]);
  const s=settings({maxEntriesPerTrade:9,hunterCooldownMinutes:0,minGameMinutes:0});
  const st=strategyFor(s,db);
  assert.equal(await st.hunterEntryPolicy('Momentum Hunter',q('FEEDLOCK',80,81,'FEV')),true);
});

test('R13 lock is last-moment authoritative before executable fill or broker order',async()=>{
  const existing=row({id:'existing-live',conceptName:'Momentum Hunter',ticker:'BROKERLOCK',eventTicker:'BEV',status:'open',mode:'LIVE'});
  const db=memoryDb([existing]);
  const s=settings({mode:'LIVE',liveArmed:true,maxEntriesPerTrade:9,hunterCooldownMinutes:0,minGameMinutes:0});
  let refreshes=0,orders=0;
  const market={async refreshTicker(){refreshes+=1;return q('BROKERLOCK',90,91,'BEV');},executableAsk:()=>({filled:10,full:true,avgCents:91,bestCents:91})};
  const kalshi={buildClientOrderId:()=> 'cid',placeOrder:async()=>{orders+=1;return{fillCount:1,averageFillPriceCents:91,orderId:'o'};}};
  const st=new StrategyEngine({db,kalshi,market,learning:{},getSettings:()=>s,getLiveReady:()=>true,random:()=>0});
  const made=await st.createHunter('Wave Surfer',q('BROKERLOCK',90,91,'BEV'),20000,35,{sourceFeeder:'Pegasus'});
  assert.equal(made,null);
  assert.equal(refreshes,0,'ticker lock must fire before book refresh/order work');
  assert.equal(orders,0,'ticker lock must fire before LIVE broker order');
  assert.equal(db.audits.at(-1).event,'hunter_exact_ticker_exposure_blocked');
});

test('R13 PostgreSQL advisory-lock contention fails closed before any book refresh or broker order',async()=>{
  const db=memoryDb();
  db.acquireHunterTickerLock=async()=>null;
  const s=settings({mode:'LIVE',liveArmed:true,maxEntriesPerTrade:9,hunterCooldownMinutes:0,minGameMinutes:0});
  let refreshes=0,orders=0;
  const market={async refreshTicker(){refreshes+=1;return q('DBLOCK',90,91,'DBEV');},executableAsk:()=>({filled:10,full:true,avgCents:91,bestCents:91})};
  const kalshi={buildClientOrderId:()=> 'cid',placeOrder:async()=>{orders+=1;return{fillCount:1,averageFillPriceCents:91,orderId:'o'};}};
  const st=new StrategyEngine({db,kalshi,market,learning:{},getSettings:()=>s,getLiveReady:()=>true,random:()=>0});
  assert.equal(await st.createHunter('Momentum Hunter',q('DBLOCK',90,91,'DBEV'),20000,35),null);
  assert.equal(refreshes,0);
  assert.equal(orders,0);
  assert.equal(db.audits.at(-1).event,'hunter_exact_ticker_db_lock_busy');
  const dbSource=await readFile(resolve(root,'src/db.mjs'),'utf8');
  assert.ok(dbSource.includes('pg_try_advisory_lock'));
  assert.ok(dbSource.includes('pg_advisory_unlock'));
});

test('R13 process-local mutex prevents concurrent same-ticker Hunter creation races',async()=>{
  const db=memoryDb();
  const s=settings({startingCapitalCents:10_000_000,maxEntriesPerTrade:9,hunterCooldownMinutes:0,minGameMinutes:0,simFillProbability:1});
  let releaseRefresh;
  const gate=new Promise(r=>{releaseRefresh=r;});
  let clockCalls=0;
  const market={
    async refreshTicker(){return q('RACE',90,91,'REV');},
    executableAsk:()=>({filled:10,full:true,avgCents:91,bestCents:91}),
    executableBid:(_ticker,count)=>({filled:count,full:true,avgCents:90,bestCents:90}),
  };
  const refreshGameClock=async(qq)=>{
    clockCalls+=1;
    if(clockCalls===1) await gate;
    const now=Date.now();
    return{gameClockState:{...qq.gameClockState,entryAuthorized:true,evidenceObservedAtMs:now,lastCheckedAtMs:now},gameStartTimeMs:qq.gameStartTimeMs,liveStatus:qq.liveStatus};
  };
  const st=new StrategyEngine({db,kalshi:{},market,learning:{},getSettings:()=>s,getLiveReady:()=>false,refreshGameClock,random:()=>0});
  const first=st.createHunter('Momentum Hunter',q('RACE',90,91,'REV'),910,35,{sourceFeeder:'Pegasus',sourceTradeId:'feed-race',entryQualificationSnapshot:{version:'MOMENTUM-Q1',feederEntryPriceCents:80,feederPeakPriceCents:95}});
  await new Promise(r=>setTimeout(r,0));
  const second=await st.createHunter('Wave Surfer',q('RACE',90,91,'REV'),910,35);
  assert.equal(second,null);
  assert.equal(db.audits.at(-1).event,'hunter_exact_ticker_lock_busy');
  releaseRefresh();
  const made=await first;
  assert.ok(made);
  assert.equal(db.inserted.length,1);
});

test('RH1 engine keeps stopped-source tickers in the required tracker set and marks them as recovery watch',async()=>{
  const now=Date.now();
  const ticker='RECOVERY-PRIORITY'; const event='RECOVERY-PRIORITY-EV';
  const stored=[];
  const db={
    async trackers(){return[];}, async openEntries(){return[];},
    async gameClockStates(){return new Map();}, async upsertGameClockState(){},
    async upsertTracker(_s,qv,_h,_c,phase){stored.push({ticker:qv.ticker,phase});},
    async deleteStaleTrackers(){}, async pruneGameClockStates(){},
  };
  const cached=q(ticker,69,70,event);
  const engine=Object.create(SagittariusEngine.prototype);
  engine.settings=settings({recoveryHunterEnabled:true,recoveryMinEntryCents:70,recoveryMaxEntryCents:94});
  engine.db=db; engine.market={getHistory:()=>[],getQuote:(t)=>t===ticker?cached:null}; engine.kalshi={};
  engine.gameClock={resolveBatch:async(rows)=>new Map(rows.map((x)=>[x.eventTicker||x.ticker,{version:'GCA1',eventTicker:x.eventTicker||x.ticker,phase:'UNKNOWN',confirmed:false,startTimeMs:null}]))};
  await engine.persistTrackers([], [ticker]);
  assert.deepEqual(stored,[{ticker,phase:'recovery'}]);
});

test('R21 full-scan ordering gives RH1 first claim, CRH1 second claim, then feeder-driven Hunters',async()=>{
  const src=await readFile(resolve(root,'src/engine.mjs'),'utf8');
  const full=src.slice(src.indexOf('async fullScan()'),src.indexOf('async fastPhase('));
  const protectAt=full.indexOf("runProtectionSweep('full_scan')");
  const recoveryAt=full.indexOf('strategy.evaluateRecovery(map)');
  const crashAt=full.indexOf('strategy.evaluateCrashRecovery(map)');
  const feedersAt=full.indexOf('strategy.evaluateFeeders(markets, trackerMap)');
  const momentumAt=full.indexOf('strategy.evaluateMomentumAndWave(map)');
  assert.ok(protectAt>=0&&recoveryAt>protectAt&&crashAt>recoveryAt&&feedersAt>crashAt&&momentumAt>crashAt);
  assert.ok(src.includes('recoveryPriorityTickers'));
  assert.ok(src.includes('crashPriorityTickers'));
  assert.ok(src.includes('queueRecoveryEvaluation'));
  assert.ok(src.includes('queueCrashRecoveryEvaluation'));
});

test('diagnostics expose GCA1, R13 ticker locking, U-SG1 and U-PG3 as active invariants',async()=>{
  const engineSource=await readFile(resolve(root,'src/engine.mjs'),'utf8');
  const app=await readFile(resolve(root,'public/app.js'),'utf8');
  assert.ok(engineSource.includes('singleRealHunterPerExactTicker: true'));
  assert.ok(engineSource.includes('gameClockAuthority: GAME_CLOCK_AUTHORITY.version'));
  assert.ok(engineSource.includes('gameClockActivityOnlyAuthorization: false'));
  assert.ok(engineSource.includes("gameClockPersistenceScope: 'event_ticker'"));
  assert.ok(engineSource.includes('ultimateStopGuard: ULTIMATE_STOP_GUARD.version'));
  assert.ok(engineSource.includes('ultimateProfitGuard: ULTIMATE_PROFIT_GUARD.version'));
  assert.ok(engineSource.includes('profitGuardHeadroomQualifiedArming: ULTIMATE_PROFIT_GUARD.headroomQualifiedArming'));
  assert.ok(engineSource.includes('profitGuardEconomicBreakEvenTelemetryOnly: !ULTIMATE_PROFIT_GUARD.economicBreakEvenImmediateExit'));
  assert.ok(engineSource.includes('profitGuardLossDomainDelegatedToStopGuard: ULTIMATE_PROFIT_GUARD.lossDomainDelegatedToStopGuard'));
  assert.ok(engineSource.includes('profitGuardFullExecutableDepthRequired: true'));
  assert.ok(engineSource.includes("recoveryHunterContinuity: 'RH1'"));
  assert.ok(engineSource.includes("recoveryReboundOrigin: 'post_stop_trough'"));
  assert.ok(engineSource.includes('recoveryExactConfiguredSizing: true'));
  assert.ok(engineSource.includes("crashIntelligence: 'CI1'"));
  assert.ok(engineSource.includes("crashRecoveryHunter: 'CRH1'"));
  assert.ok(engineSource.includes('crashRecoveryDefersToRecoveryHunter: true'));
  assert.ok(app.includes('Crash Recovery Hunter'));
  assert.ok(app.includes('Exact ticker Hunter lock: ON'));
  assert.ok(app.includes('never silently changes the configured Recovery size'));
});

test('R38 keeps PRI1-R2 diagnostics as legacy compatibility while README declares Golden Eye manual learning as the active profit authority',async()=>{
  const engineSource=await readFile(resolve(root,'src/engine.mjs'),'utf8');
  const app=await readFile(resolve(root,'public/app.js'),'utf8');
  const readme=await readFile(resolve(root,'README.md'),'utf8');
  for(const marker of [
    'protectedRunnerIntelligence: PROTECTED_RUNNER_INTELLIGENCE.version',
    'protectedRunnerPolicyRevision: PROTECTED_RUNNER_INTELLIGENCE.policyRevision',
    "protectedRunnerAppliesTo: 'R33_plus_Hunter_entries_with_PRI1_R2_snapshot'",
    'protectedRunnerCapitalSafeNetPerOriginalContractCents: PROTECTED_RUNNER_INTELLIGENCE.capitalLatchNetPerOriginalContractCents',
    'protectedRunnerProfitFloorArmNetPerOriginalContractCents: PROTECTED_RUNNER_INTELLIGENCE.profitFloorArmNetPerOriginalContractCents',
    'protectedRunnerColdStartGivebackNetPerContractCents: PROTECTED_RUNNER_INTELLIGENCE.coldStartRunnerGivebackNetPerContractCents',
    'protectedRunnerLateProfitTightenAtNetPerOriginalContractCents: PROTECTED_RUNNER_INTELLIGENCE.lateProfitTightenAtNetPerOriginalContractCents',
    'protectedRunnerFullExecutableDepthRequired: PROTECTED_RUNNER_INTELLIGENCE.fullExecutableDepthRequired',
    'protectedRunnerLossDomainDelegatedToStopGuard: PROTECTED_RUNNER_INTELLIGENCE.lossDomainDelegatedToStopGuard',
    'profitLearningIntelligence: PROFIT_LEARNING_INTELLIGENCE.version',
    'profitLearningRunnerGivebackPromotionEnabled: PROFIT_LEARNING_INTELLIGENCE.runnerGivebackPromotionEnabled',
    'profitLearningPostExitCounterfactualTracking: true',
    'profitLearningShadowPoliciesHaveExecutionAuthority: false',
    'crashLearning, crashEpisodes, profitLearning',
  ]) assert.ok(engineSource.includes(marker), `${marker} missing from diagnostics`);
  assert.ok(app.includes("g.protectedRunnerIntelligence || 'PRI1'"));
  assert.ok(app.includes("g.profitLearningIntelligence || 'PLI1'"));
  assert.ok(app.includes('pri1ProtectedNetFloorCents'));
  assert.ok(app.includes('PROFIT FLOOR GAPPED → U-SG1'));
  assert.ok(app.includes('pri1EffectiveRunnerGivebackCents'));
  assert.ok(app.includes('PRI1-R2'));
  assert.ok(readme.includes('Golden Eye Manual Learning'));
  assert.ok(readme.includes('GOLDEN-EYE-V1 / GE1-R2'));
  assert.ok(readme.includes('manual cash-out'));
  assert.ok(readme.includes('U-SG1 remains the exclusive loss-domain authority'));
});

test('dashboard keeps unsaved model/shared drafts safe and verifies persistence against runtime state', async () => {
  const app = await readFile(resolve(root, 'public/app.js'), 'utf8');
  for (const marker of ['MODEL_DRAFTS','GENERAL_DRAFTS','patchSettingsVerified','did not persist','reverted after save']) assert.ok(app.includes(marker), `${marker} protection missing`);
  assert.ok(app.includes("$('conceptBody').oninput"));
  assert.ok(app.includes("$('settingsForm').oninput"));
});

test('Momentum runtime consumes the values shown under the Momentum row',async()=>{
  const f=row({id:'f',conceptName:'Pegasus',ticker:'M',eventTicker:'MEV',entryPriceCents:82,currentPriceCents:86,peakPriceCents:90,gameStartTimeMs:Date.now()-30*60000,entryConfig:{referenceStakeCents:3000,feeder:{minPriceCents:80,maxPriceCents:94,dropCents:2}}});
  const db=memoryDb([f]);
  const s=settings({waveSurferEnabled:false,recoveryHunterEnabled:false,momentumStakeCents:12345,momentumMinEntryCents:90,momentumMaxEntryCents:94,momentumHunterStopLossCents:13,momentumMinRiseCents:2,momentumMinPullbackCents:1,momentumMaxPullbackCents:12,momentumMaxSpreadCents:2,momentumMinTimeLeftMinutes:0});
  const st=strategyFor(s,db); let captured=null;
  st.createHunter=async(concept,qq,stake,stop,opt)=>{captured={concept,stake,stop,opt};return row({id:'made',conceptName:concept,ticker:qq.ticker,eventTicker:qq.eventTicker,sourceFeeder:opt.sourceFeeder});};
  assert.equal((await st.evaluateMomentumAndWave(new Map([['M',q('M',85,86,'MEV')]]))).length,0,'Momentum min entry must be authoritative');
  s.momentumMinEntryCents=86;
  const made=await st.evaluateMomentumAndWave(new Map([['M',q('M',85,86,'MEV')]]));
  assert.equal(made.length,1);
  assert.equal(captured.stake,12345);
  assert.equal(captured.stop,13);
});

test('R17 hydrates a feeder clock only from the current confirmed GCA1 tracker authority before Momentum evaluation',async()=>{
  const f=row({id:'f-null-clock',conceptName:'Pegasus',ticker:'MC',eventTicker:'MCEV',entryPriceCents:82,currentPriceCents:86,peakPriceCents:90,gameStartTimeMs:null,entryConfig:{referenceStakeCents:3000,feeder:{minPriceCents:80,maxPriceCents:94,dropCents:2}}});
  const db=memoryDb([f]);
  const s=settings({waveSurferEnabled:false,recoveryHunterEnabled:false,momentumMinEntryCents:86,momentumMaxEntryCents:94,momentumMinTimeLeftMinutes:0,minGameMinutes:20});
  const st=strategyFor(s,db);
  st.createHunter=async(concept,qq,_stake,_stop,opt)=>row({id:'made-clock',conceptName:concept,ticker:qq.ticker,eventTicker:qq.eventTicker,sourceFeeder:opt.sourceFeeder});
  const live=q('MC',85,86,'MCEV'); live.gameStartTimeMs=Date.now()-25*60000; live.gameClockState=confirmedClock('MCEV',live.gameStartTimeMs);
  const made=await st.evaluateMomentumAndWave(new Map([['MC',live]]));
  assert.equal(made.length,1);
  assert.equal(db.rows.get('f-null-clock').gameStartTimeMs,live.gameStartTimeMs,'existing feeder must inherit only the newly confirmed observed-live start');
});

test('Wave runtime consumes its model-owned stake, band, spread, stop and feeder-move controls',async()=>{
  const f=row({id:'f',conceptName:'Pegasus',ticker:'W',eventTicker:'WEV',entryPriceCents:80,currentPriceCents:88,peakPriceCents:89,gameStartTimeMs:Date.now()-30*60000,entryConfig:{referenceStakeCents:3000,feeder:{minPriceCents:80,maxPriceCents:94,dropCents:2}}});
  const db=memoryDb([f]);
  const s=settings({momentumHunterEnabled:false,recoveryHunterEnabled:false,waveStakeCents:23456,waveMinEntryCents:86,waveMaxEntryCents:92,waveStopCents:16,waveMinFeederFavorableMoveCents:8,waveMaxSpreadCents:0});
  const st=strategyFor(s,db); let captured=null;
  st.createHunter=async(concept,qq,stake,stop,opt)=>{captured={concept,stake,stop,opt};return row({id:'made',conceptName:concept,ticker:qq.ticker,eventTicker:qq.eventTicker,sourceFeeder:opt.sourceFeeder});};
  assert.equal((await st.evaluateMomentumAndWave(new Map([['W',q('W',88,89,'WEV')]]))).length,0,'Wave model max spread must be authoritative');
  s.waveMaxSpreadCents=1;
  const made=await st.evaluateMomentumAndWave(new Map([['W',q('W',88,89,'WEV')]]));
  assert.equal(made.length,1);
  assert.equal(captured.stake,23456);
  assert.equal(captured.stop,16);
});

test('Recovery runtime consumes its model-owned base stake, entry band, rebound and stop',async()=>{
  const stopped=row({id:'loss',conceptName:'Momentum Hunter',ticker:'R',eventTicker:'REV',status:'closed',closeReason:'hard_stop_loss',exitPriceCents:70,closedAtMs:Date.now()-60000,remainingCount:0});
  const db=memoryDb([stopped]);
  const s=settings({momentumHunterEnabled:false,waveSurferEnabled:false,recoveryHunterEnabled:true,recoveryBaseStakeCents:3456,recoveryMinEntryCents:76,recoveryMaxEntryCents:90,recoveryHunterStopLossCents:12,recoveryMinReboundCents:7});
  const st=strategyFor(s,db); let captured=null;
  st.createHunter=async(concept,qq,stake,stop,opt)=>{captured={concept,stake,stop,opt};return row({id:'made',conceptName:concept,ticker:qq.ticker,eventTicker:qq.eventTicker,sourceTradeId:opt.sourceTradeId});};
  assert.equal((await st.evaluateRecovery(new Map([['R',q('R',75,76,'REV')]]))).length,0,'Recovery rebound must be authoritative');
  s.recoveryMinReboundCents=5;
  const made=await st.evaluateRecovery(new Map([['R',q('R',75,76,'REV')]]));
  assert.equal(made.length,1);
  assert.equal(captured.stake,6912,'Recovery actual stake must remain 2x its editable base stake');
  assert.equal(captured.stop,12);
});


test('Minimum Minutes In-Game uses a confirmed elapsed-time boundary and unknown time fails closed',async()=>{
  const now=1_800_000_000_000;
  assert.equal(confirmedInGameElapsedMinutes({eventTicker:'EV',gameStartTimeMs:now-20*60000,gameClockState:confirmedClock('EV',now-20*60000)},now),20);
  assert.equal(confirmedInGameElapsedMinutes({gameStartTimeMs:now-20*60000},now),null,'timestamp-only legacy clocks must not authorize exposure');
  assert.equal(confirmedInGameElapsedMinutes({gameStartTimeMs:null},now),null);
  assert.equal(confirmedInGameElapsedMinutes({eventTicker:'EV',gameStartTimeMs:now+1000,gameClockState:confirmedClock('EV',now+1000)},now),null);

  const db=memoryDb();
  const s=settings({minGameMinutes:20,maxEntriesPerTrade:8,hunterCooldownMinutes:0});
  const st=strategyFor(s,db);
  const tooEarly=q('EARLY',88,89,'EV1'); tooEarly.gameStartTimeMs=Date.now()-19*60000; tooEarly.gameClockState=confirmedClock('EV1',tooEarly.gameStartTimeMs);
  assert.equal(await st.hunterEntryPolicy('Momentum Hunter',tooEarly),false);
  assert.equal(db.audits.at(-1).event,'hunter_min_game_minutes_blocked');
  const unknown=q('UNKNOWN',88,89,'EV2'); unknown.gameStartTimeMs=null; unknown.gameClockState={version:'GCA1',eventTicker:'EV2',phase:'UNKNOWN',confirmed:false};
  assert.equal(await st.hunterEntryPolicy('Wave Surfer',unknown),false);
  assert.equal(db.audits.at(-1).event,'hunter_in_game_time_unknown');
  const passed=q('PASSED',88,89,'EV3'); passed.gameStartTimeMs=Date.now()-20*60000-1000; passed.gameClockState=confirmedClock('EV3',passed.gameStartTimeMs);
  assert.equal(await st.hunterEntryPolicy('Recovery Hunter',passed),true);
});

test('GCA1 enforces the exact 40-minute boundary without rounding early',async()=>{
  const now=1_800_000_000_000;
  const db=memoryDb();
  const s=settings({minGameMinutes:40,maxEntriesPerTrade:8,hunterCooldownMinutes:0});
  const st=strategyFor(s,db);
  const before=q('B3999',88,89,'B3999-EV'); before.gameStartTimeMs=now-(40*60000-1); before.gameClockState=confirmedClock('B3999-EV',before.gameStartTimeMs);
  const exact=q('B4000',88,89,'B4000-EV'); exact.gameStartTimeMs=now-40*60000; exact.gameClockState=confirmedClock('B4000-EV',exact.gameStartTimeMs);
  const originalNow=Date.now;
  Date.now=()=>now;
  try{
    assert.equal(await st.hunterEntryPolicy('Momentum Hunter',before),false);
    assert.equal(await st.hunterEntryPolicy('Momentum Hunter',exact),true);
  }finally{Date.now=originalNow;}
});

test('the shared in-game guard applies centrally to every real Hunter concept',async()=>{
  const s=settings({minGameMinutes:20,maxEntriesPerTrade:50,hunterCooldownMinutes:0,startingCapitalCents:10_000_000,crashRecoveryHunterEnabled:true,dragonRecoveryHunterEnabled:true});
  for(const [i,concept] of ['Momentum Hunter','Wave Surfer','Recovery Hunter','Crash Recovery Hunter','Dragon Recovery Hunter','Golden Dragon Hunter'].entries()){
    const db=memoryDb();
    const st=strategyFor(s,db);
    const early=q(`E${i}`,88,89,`EE${i}`); early.gameStartTimeMs=Date.now()-10*60000; early.gameClockState=confirmedClock(`EE${i}`,early.gameStartTimeMs);
    assert.equal(await st.hunterEntryPolicy(concept,early),false,`${concept} bypassed the shared early-game block`);
    const mature=q(`M${i}`,88,89,`ME${i}`); mature.gameStartTimeMs=Date.now()-25*60000; mature.gameClockState=confirmedClock(`ME${i}`,mature.gameStartTimeMs);
    assert.equal(await st.hunterEntryPolicy(concept,mature),true,`${concept} did not pass after the shared threshold`);
  }
});

test('feeders remain free to create reference signals before Minimum Minutes In-Game',async()=>{
  const s=settings({minGameMinutes:20,pegasusEnabled:true,sagittariusEnabled:false,maxSpreadCents:3});
  const db=memoryDb();
  const market={
    getHistory:()=>[{ask:90},{ask:90},{ask:88},{ask:88},{ask:88}],
    async refreshTicker(t){return q(t,87,88);},
    executableAsk:()=>({filled:1000,full:true,avgCents:88,bestCents:88}),
  };
  const st=new StrategyEngine({db,kalshi:{},market,learning:{recoveryRate:async()=>null},getSettings:()=>s,getLiveReady:()=>false,random:()=>0});
  const candidate=q('FEED',87,88,'FEV'); candidate.gameStartTimeMs=null; candidate.gameClockState={}; candidate.occurrenceTimeMs=Date.now()+5*60000;
  const made=await st.evaluateFeeders([candidate],new Map([['FEED',{game_start_time_ms:null}]]));
  assert.equal(made.length,1);
  assert.equal(made[0].conceptName,'Pegasus');
  assert.equal(made[0].gameStartTimeMs,null);
});

test('GCA1 live-data parser accepts only explicit game-state evidence and never treats generic active as live',()=>{
  assert.equal(classifyLiveData({details:{status:'in_progress'}}).classification,'live');
  assert.equal(classifyLiveData({details:{game:{status:'halftime'}}}).classification,'live');
  assert.equal(classifyLiveData({details:{status:'scheduled'}}).classification,'pregame');
  assert.equal(classifyLiveData({details:{status:'final'}}).classification,'final');
  assert.equal(classifyLiveData({details:{status:'active'}}).classification,'unknown','exchange/activity language must not become game evidence');
  assert.equal(classifyLiveData({details:{player:{status:'live'}}}).classification,'unknown','unscoped nested status must not authorize the game clock');
  assert.equal(classifyLiveData({details:{game:{status:'in_progress'},match:{status:'scheduled'}}}).classification,'conflict');
});

test('GCA1 milestone selection requires one unambiguous atomic Sports/Esports milestone for the exact event',()=>{
  const event='EV';
  const selected=selectEventMilestone([
    {id:'tournament',category:'Sports',type:'tennis_tournament',related_event_tickers:[event],primary_event_tickers:[]},
    {id:'match',category:'Sports',type:'tennis_match',related_event_tickers:[event],primary_event_tickers:[event]},
  ],event);
  assert.equal(selected.milestone.id,'match');
  const ambiguous=selectEventMilestone([
    {id:'a',category:'Sports',type:'tennis_match',related_event_tickers:[event],primary_event_tickers:[event]},
    {id:'b',category:'Sports',type:'tennis_match',related_event_tickers:[event],primary_event_tickers:[event]},
  ],event);
  assert.equal(ambiguous.milestone,null);
  assert.equal(ambiguous.reason,'ambiguous_atomic_milestone');
});

test('GCA1 hostile R12 case: heavy price/trade activity with future occurrence cannot manufacture Hunter time',async()=>{
  const now=1_800_000_000_000;
  const kalshi={
    async getMilestonesForEvent(){return[];},
    async getLiveData(){return null;},
    async getGameStats(){return null;},
  };
  const authority=new GameClockAuthority({kalshi,now:()=>now});
  const market=q('HOSTILE',88,89,'HOSTILE-EV');
  market.liveStatus='live'; market.recentTrades=250; market.occurrenceTimeMs=now+3*60*60*1000;
  market.gameStartTimeMs=null; market.gameClockState={};
  const state=await authority.resolveEvent({eventTicker:market.eventTicker,quotes:[market],now});
  assert.equal(state.phase,'UNKNOWN');
  assert.equal(state.reason,'activity_only_future_occurrence_blocked');
  assert.equal(state.startTimeMs,null);
});

test('GCA1 fixes the R16 starvation case when exact official milestone live data proves the game is in progress',async()=>{
  const now=1_800_000_000_000;
  const event='STARVE-EV';
  const kalshi={
    async getMilestonesForEvent(){return[{id:'m1',category:'Sports',type:'tennis_match',primary_event_tickers:[event],related_event_tickers:[event],start_date:new Date(now-60*60000).toISOString()}];},
    async getLiveData(){return{type:'tennis',milestone_id:'m1',details:{match:{status:'in_progress'}}};},
    async getGameStats(){return null;},
  };
  const authority=new GameClockAuthority({kalshi,now:()=>now});
  const market=q('STARVE',88,89,event);
  market.liveStatus='live'; market.recentTrades=131; market.occurrenceTimeMs=now+2*60*60*1000;
  const state=await authority.resolveEvent({eventTicker:event,quotes:[market],now});
  assert.equal(state.phase,'CONFIRMED');
  assert.equal(state.source,'kalshi_live_data');
  assert.equal(state.startTimeMs,now,'first strong observation is the conservative lower bound');
  assert.equal(state.occurrenceConflict,true,'future occurrence is recorded as conflicting metadata, not allowed to veto stronger official live evidence');
});

test('GCA1 explicit official pregame/delayed evidence overrides activity and remains fail-closed',async()=>{
  const now=1_800_000_000_000;
  const event='PRE-EV';
  for(const status of ['scheduled','delayed']){
    const authority=new GameClockAuthority({kalshi:{
      async getMilestonesForEvent(){return[{id:`m-${status}`,category:'Sports',type:'tennis_match',primary_event_tickers:[event],related_event_tickers:[event]}];},
      async getLiveData(){return{milestone_id:`m-${status}`,details:{status}};},
      async getGameStats(){return null;},
    },now:()=>now});
    const market=q(`PRE-${status}`,88,89,event); market.liveStatus='live'; market.occurrenceTimeMs=now-60*60000;
    const state=await authority.resolveEvent({eventTicker:event,quotes:[market],now});
    assert.equal(state.phase,'UNKNOWN');
    assert.equal(state.reason,'official_live_data_pregame');
  }
});

test('GCA1 uses nonempty official play-by-play as strong start evidence when live-data status is unavailable',async()=>{
  const now=1_800_000_000_000;
  const event='PBP-EV';
  const stats={pbp:{periods:[{events:[{id:'play-1'}]}]}};
  assert.equal(countPbpEvents(stats),1);
  const authority=new GameClockAuthority({kalshi:{
    async getMilestonesForEvent(){return[{id:'pbp',category:'Sports',type:'basketball_game',primary_event_tickers:[event],related_event_tickers:[event]}];},
    async getLiveData(){return{details:{}};},
    async getGameStats(){return stats;},
  },now:()=>now});
  const market=q('PBP',88,89,event); market.liveStatus='live'; market.occurrenceTimeMs=now+90*60000;
  const state=await authority.resolveEvent({eventTicker:event,quotes:[market],now});
  assert.equal(state.phase,'CONFIRMED');
  assert.equal(state.source,'kalshi_game_stats');
});

test('GCA1 keeps the proven R14 fallback when occurrence has passed and broad live evidence exists',async()=>{
  const now=1_800_000_000_000;
  const authority=new GameClockAuthority({kalshi:{async getMilestonesForEvent(){return[];}},now:()=>now});
  const market=q('FALLBACK',88,89,'FALLBACK-EV'); market.liveStatus='live'; market.occurrenceTimeMs=now-1000;
  const state=await authority.resolveEvent({eventTicker:market.eventTicker,quotes:[market],now});
  assert.equal(state.phase,'CONFIRMED');
  assert.equal(state.source,'occurrence_passed');
  assert.equal(state.startTimeMs,now);
});

test('GCA1 confirmed event state survives restart/API outage but legacy timestamp-only state cannot',async()=>{
  const now=1_800_000_000_000;
  const event='RESTART-EV';
  const prior=confirmedClock(event,now-45*60000,'kalshi_live_data');
  const authority=new GameClockAuthority({kalshi:{
    async getMilestonesForEvent(){throw new Error('offline');},
  },now:()=>now});
  const market=q('RESTART',88,89,event); market.liveStatus='live'; market.occurrenceTimeMs=now+60*60000;
  const retained=await authority.resolveEvent({eventTicker:event,quotes:[market],priorState:prior,now});
  assert.equal(retained.phase,'CONFIRMED');
  assert.equal(retained.startTimeMs,prior.startTimeMs);
  assert.equal(retained.reason,'persisted_confirmed_start_retained');
  assert.equal(isConfirmedGameClockState(retained),true);
  assert.equal(isConfirmedGameClockState({gameStartTimeMs:prior.startTimeMs}),false);
});

test('GCA1 blocks contradictory official pregame after a previously confirmed start instead of silently rolling back or entering',async()=>{
  const now=1_800_000_000_000;
  const event='CONFLICT-EV';
  const prior=confirmedClock(event,now-45*60000,'kalshi_live_data');
  const authority=new GameClockAuthority({kalshi:{
    async getMilestonesForEvent(){return[{id:'c',category:'Sports',type:'tennis_match',primary_event_tickers:[event],related_event_tickers:[event]}];},
    async getLiveData(){return{milestone_id:'c',details:{status:'scheduled'}};},
    async getGameStats(){return null;},
  },now:()=>now});
  const state=await authority.resolveEvent({eventTicker:event,quotes:[q('C',88,89,event)],priorState:prior,now});
  assert.equal(state.phase,'CONFLICT');
  assert.equal(state.confirmed,false);
  assert.equal(state.startTimeMs,prior.startTimeMs,'forensics keep the old lower bound without authorizing it');
});

test('GCA1 fails closed on sibling occurrence disagreement and terminal event evidence',async()=>{
  const now=1_800_000_000_000;
  const authority=new GameClockAuthority({kalshi:{async getMilestonesForEvent(){return[];}},now:()=>now});
  const a=q('SIDE-A',88,89,'SAME-EV'); const b=q('SIDE-B',11,12,'SAME-EV');
  a.liveStatus='live'; b.liveStatus='live'; a.occurrenceTimeMs=now-60*60000; b.occurrenceTimeMs=now-30*60000;
  const conflict=await authority.resolveEvent({eventTicker:'SAME-EV',quotes:[a,b],now});
  assert.equal(conflict.phase,'CONFLICT');
  const terminal=q('FINAL',99,100,'FINAL-EV'); terminal.status='finalized'; terminal.result='yes';
  const final=await authority.resolveEvent({eventTicker:'FINAL-EV',quotes:[terminal],now});
  assert.equal(final.phase,'FINAL');
  assert.equal(final.confirmed,false);
});

test('GCA1 engine projection persists one event authority state and gives sibling tickers the identical lower-bound clock',async()=>{
  const now=Date.now();
  const rows=[]; const stateStore=new Map(); const audits=[];
  const event='SIB-EV';
  const db={
    async trackers(){return rows;}, async openEntries(){return[];},
    async gameClockStates(){return new Map(stateStore);},
    async upsertGameClockState(_s,e,state){stateStore.set(e,structuredClone(state));},
    async audit(level,eventName,data){audits.push({level,event:eventName,data});},
    async upsertTracker(_system,qv,_history,_concepts,phase){rows.push({ticker:qv.ticker,event_ticker:qv.eventTicker,game_start_time_ms:qv.gameStartTimeMs,game_clock_state:structuredClone(qv.gameClockState),phase});},
    async deleteStaleTrackers(){}, async pruneGameClockStates(){},
  };
  const kalshi={
    async getMilestonesForEvent(){return[{id:'sib',category:'Sports',type:'tennis_match',primary_event_tickers:[event],related_event_tickers:[event]}];},
    async getLiveData(){return{milestone_id:'sib',details:{status:'in_progress'}};}, async getGameStats(){return null;},
  };
  const engine=Object.create(SagittariusEngine.prototype);
  engine.settings=settings({minGameMinutes:40}); engine.db=db; engine.kalshi=kalshi; engine.market={getHistory:()=>[]};
  engine.gameClock=new GameClockAuthority({kalshi,audit:(eventName,data)=>db.audit('info',eventName,data),now:()=>now});
  const a=q('SIB-A',88,89,event); const b=q('SIB-B',11,12,event);
  a.occurrenceTimeMs=now+120*60000; b.occurrenceTimeMs=a.occurrenceTimeMs;
  await engine.persistTrackers([a,b]);
  assert.equal(a.gameStartTimeMs,b.gameStartTimeMs);
  assert.equal(a.gameClockState.phase,'CONFIRMED');
  assert.equal(stateStore.get(event).startTimeMs,a.gameStartTimeMs);
  assert.ok(audits.some(x=>x.event==='game_clock_authority_confirmed'));
});

test('R14 sanitizes inherited R12/R13 pre-occurrence clocks instead of preserving false elapsed time',()=>{
  const now=Date.now();
  const occurrence=now+60*60000;
  assert.equal(resolveObservedGameStart({priorStart:now-6*3600000,liveStatus:'live',occurrenceTimeMs:occurrence,now}),0);
  const passed=now-10*60000;
  assert.equal(resolveObservedGameStart({priorStart:passed-60_000,liveStatus:'live',occurrenceTimeMs:passed,now}),now,'pre-occurrence persisted start is discarded once occurrence passes');
  assert.equal(resolveObservedGameStart({priorStart:passed+1_000,liveStatus:'live',occurrenceTimeMs:passed,now}),passed+1_000,'valid post-occurrence start remains stable');
  assert.equal(resolveObservedGameStart({priorStart:0,liveStatus:'pre-match',occurrenceTimeMs:passed,now}),0);
  assert.equal(resolveObservedGameStart({priorStart:0,liveStatus:'unknown',occurrenceTimeMs:passed,now}),0);
  assert.equal(resolveObservedGameStart({priorStart:0,liveStatus:'live',occurrenceTimeMs:0,now}),0,'missing official occurrence remains fail-closed');
});


test('R17 preserves the shared in-game setting and persists tracker plus event-level GCA1 authority state',async()=>{
  const db=runtimeDb();
  const engine=Object.create(SagittariusEngine.prototype);
  engine.settings=sanitizeRuntimeSettings({...originalSettings(),systemName:'SAGITTARIUS',ownerId:'r11-test',mode:'SIMULATION'});
  engine.db=db;
  await engine.patchSettings({minGameMinutes:27});
  assert.equal((await db.loadSettings(originalSettings())).minGameMinutes,27);
  await assert.rejects(()=>engine.patchSettings({minGameMinutes:-1}),/non-negative integer/);
  await assert.rejects(()=>engine.patchSettings({minGameMinutes:2.5}),/non-negative integer/);
  const dbSource=await readFile(resolve(root,'src/db.mjs'),'utf8');
  assert.ok(dbSource.includes('game_start_time_ms=excluded.game_start_time_ms'));
  assert.ok(dbSource.includes('game_clock_state=excluded.game_clock_state'));
  assert.ok(dbSource.includes('create table if not exists sag_game_clock_authority'));
  assert.ok(dbSource.includes('async upsertGameClockState'));
  assert.equal(dbSource.includes('game_start_time_ms=coalesce(sag_trackers.game_start_time_ms,excluded.game_start_time_ms)'),false);
});

test('R19 preserves both Guard state machines and exposes U-PG3 headroom/profit-floor telemetry without changing persistence schema',async()=>{
  const dbSource=await readFile(resolve(root,'src/db.mjs'),'utf8');
  const app=await readFile(resolve(root,'public/app.js'),'utf8');
  assert.ok(dbSource.includes('profit_harvest_peak_pnl_cents double precision not null default 0'),'legacy column remains migration-compatible');
  assert.ok(dbSource.includes("profitHarvestPeakPnlCents:'profit_harvest_peak_pnl_cents'"));
  assert.ok(dbSource.includes("stopGuardState:'stop_guard_state'"));
  assert.ok(dbSource.includes("profitGuardState:'profit_guard_state'"));
  assert.ok(dbSource.includes("stop_guard_state jsonb not null default '{}'::jsonb"));
  assert.ok(dbSource.includes("profit_guard_state jsonb not null default '{}'::jsonb"));
  assert.ok(app.includes('UPG3_ARMED'));
  assert.ok(app.includes('UPG3_PROFIT_FLOOR_LOST'));
  assert.ok(app.includes('USG1_RECOVERY_ZONE'));
  assert.ok(app.includes('upg3PeakExecutableBidCents'));
  assert.ok(app.includes('upg3DangerLineCents'));
  assert.ok(app.includes('upg3StructuralLineCents'));
  assert.ok(app.includes('upg3MinimumPositivePriceCents'));
  assert.ok(app.includes('upg3HeadroomArmPriceCents'));
  assert.ok(app.includes('upg3EconomicBreakEvenPriceCents'));
  assert.equal(app.includes('PROFIT_HARVEST_ARMED'),false,'retired runtime Harvest UI must not remain authoritative');
});

test('future Hunter concepts cannot bypass the shared Minimum Minutes In-Game policy',async()=>{
  const db=memoryDb();
  const s=settings({minGameMinutes:20,maxEntriesPerTrade:8,hunterCooldownMinutes:0});
  const st=strategyFor(s,db);
  const early=q('FUTURE',88,89,'FUTURE-EV'); early.gameStartTimeMs=Date.now()-5*60000; early.gameClockState=confirmedClock('FUTURE-EV',early.gameStartTimeMs);
  assert.equal(await st.hunterEntryPolicy('Future Hunter',early),false);
  assert.equal(db.audits.at(-1).event,'hunter_min_game_minutes_blocked');
});


test('Recovery may reuse only an R17 GCA1 source snapshot while all legacy timestamp-only stops remain closed',async()=>{
  const now=Date.now();
  const start=now-30*60000;
  const r17Loss=row({id:'r17-loss',conceptName:'Momentum Hunter',ticker:'RR',eventTicker:'RREV',status:'closed',closeReason:'hard_stop_loss',exitPriceCents:70,closedAtMs:now-60000,remainingCount:0,gameStartTimeMs:start,entryConfig:{release:RELEASE,sharedHunterLimits:{minGameMinutes:20},gameClockAuthority:confirmedClock('RREV',start)}});
  const db=memoryDb([r17Loss]);
  const s=settings({minGameMinutes:20,momentumHunterEnabled:false,waveSurferEnabled:false,recoveryHunterEnabled:true,recoveryBaseStakeCents:10000,recoveryMinReboundCents:5,recoveryMinEntryCents:76,recoveryMaxEntryCents:94,startingCapitalCents:10_000_000});
  const st=strategyFor(s,db);
  const rq=q('RR',75,76,'RREV'); rq.gameStartTimeMs=null; rq.gameClockState={};
  const made=await st.evaluateRecovery(new Map([['RR',rq]]));
  assert.equal(made.length,1,'R17 source authority should remain reusable for Recovery when current tracker time is unavailable');

  const legacy=row({id:'legacy-loss',conceptName:'Momentum Hunter',ticker:'LR',eventTicker:'LREV',status:'closed',closeReason:'hard_stop_loss',exitPriceCents:70,closedAtMs:now-60000,remainingCount:0,gameStartTimeMs:now-30*60000,entryConfig:{release:'SAGITTARIUS-R16-UPG1-ULTIMATE-PROFIT-GUARD-2026-08-19',sharedHunterLimits:{minGameMinutes:20}}});
  const db2=memoryDb([legacy]);
  const st2=strategyFor(s,db2);
  const lq=q('LR',75,76,'LREV'); lq.gameStartTimeMs=null; lq.gameClockState={};
  const blocked=await st2.evaluateRecovery(new Map([['LR',lq]]));
  assert.equal(blocked.length,0,'legacy source without GCA1 provenance must fail closed');
  assert.ok(db2.audits.some((x)=>x.event==='hunter_clock_revalidation_blocked'),'legacy source must fail closed after the mandatory fresh authority attempt');
  assert.equal(db2.audits.at(-1).event,'recovery_candidate_state');
});

test('GCA1 malformed live-data containers and cross-event authority cannot authorize Hunter exposure',()=>{
  assert.equal(classifyLiveData({details:[{status:'in_progress'}]}).classification,'unknown','malformed root arrays must fail closed');
  const now=Date.now();
  const start=now-45*60000;
  const qv=q('EVENT-A-TICKER',88,89,'EVENT-A');
  qv.gameStartTimeMs=start;
  qv.gameClockState=confirmedClock('EVENT-B',start);
  assert.equal(confirmedInGameElapsedMinutes(qv,now),null,'authority for a different event must never authorize this ticker');
});

test('GCA1 strong official live evidence overrides fallible sibling occurrence disagreement but records the conflict',async()=>{
  const now=1_800_000_000_000;
  const event='OCC-MISMATCH-EV';
  const authority=new GameClockAuthority({kalshi:{
    async getMilestonesForEvent(){return[{id:'occ-live',category:'Sports',type:'tennis_match',primary_event_tickers:[event],related_event_tickers:[event]}];},
    async getLiveData(){return{milestone_id:'occ-live',details:{match:{status:'in_progress'}}};},
    async getGameStats(){return null;},
  },now:()=>now});
  const a=q('OCC-A',88,89,event); const b=q('OCC-B',11,12,event);
  a.liveStatus='live'; b.liveStatus='live'; a.occurrenceTimeMs=now+60*60000; b.occurrenceTimeMs=now+100*60000;
  const state=await authority.resolveEvent({eventTicker:event,quotes:[a,b],now});
  assert.equal(state.phase,'CONFIRMED');
  assert.equal(state.source,'kalshi_live_data');
  assert.equal(state.occurrenceConflict,true);
  assert.equal(state.startTimeMs,now);
});

test('GCA1 unresolved conflicts are restart-sticky, while new strong official live evidence may resolve them only from a fresh conservative now',async()=>{
  const t0=1_800_000_000_000;
  const event='STICKY-CONFLICT-EV';
  const prior={version:'GCA1',eventTicker:event,phase:'CONFLICT',confirmed:false,startTimeMs:t0-60*60000,source:'kalshi_live_data',sourceStrength:'strong',observedAtMs:t0-60*60000,lastCheckedAtMs:t0,reason:'official_pregame_after_confirmed_start',evidence:{}};
  const gapAuthority=new GameClockAuthority({kalshi:{async getMilestonesForEvent(){throw new Error('offline');}},now:()=>t0+60_000});
  const market=q('SC',88,89,event); market.liveStatus='live'; market.occurrenceTimeMs=t0-10*60000;
  const retained=await gapAuthority.resolveEvent({eventTicker:event,quotes:[market],priorState:prior,now:t0+60_000});
  assert.equal(retained.phase,'CONFLICT');
  assert.equal(retained.confirmed,false);
  assert.equal(retained.reason,'persisted_conflict_retained');

  const t1=t0+5*60000;
  const recoveredAuthority=new GameClockAuthority({kalshi:{
    async getMilestonesForEvent(){return[{id:'resolved',category:'Sports',type:'tennis_match',primary_event_tickers:[event],related_event_tickers:[event]}];},
    async getLiveData(){return{milestone_id:'resolved',details:{status:'in_progress'}};},
    async getGameStats(){return null;},
  },now:()=>t1});
  const resolved=await recoveredAuthority.resolveEvent({eventTicker:event,quotes:[market],priorState:retained,now:t1});
  assert.equal(resolved.phase,'CONFIRMED');
  assert.equal(resolved.startTimeMs,t1,'resolving a conflict must never reuse/backdate the disputed start');
});

test('GCA1 FINAL is terminal across restart and cannot be reopened by later live-looking API data',async()=>{
  const now=1_800_000_000_000;
  const event='STICKY-FINAL-EV';
  const prior={version:'GCA1',eventTicker:event,phase:'FINAL',confirmed:false,startTimeMs:now-60*60000,source:'kalshi_live_data',sourceStrength:'strong',observedAtMs:now-60*60000,lastCheckedAtMs:now-1000,reason:'official_live_data_final',evidence:{}};
  let calls=0;
  const authority=new GameClockAuthority({kalshi:{
    async getMilestonesForEvent(){calls+=1;return[{id:'late',category:'Sports',type:'tennis_match',primary_event_tickers:[event],related_event_tickers:[event]}];},
    async getLiveData(){return{details:{status:'in_progress'}};},
  },now:()=>now});
  const market=q('FINAL-STICKY',88,89,event); market.result=''; market.status='active';
  const state=await authority.resolveEvent({eventTicker:event,quotes:[market],priorState:prior,now});
  assert.equal(state.phase,'FINAL');
  assert.equal(state.confirmed,false);
  assert.equal(state.reason,'persisted_final_retained');
  assert.equal(calls,0,'terminal authority should not make reopening network calls');
});

test('GCA1 occurrence fallback becomes conflict if the same occurrence later moves into the future, and weak fallback cannot clear it',async()=>{
  const t0=1_800_000_000_000;
  const event='FALLBACK-MOVE-EV';
  const authority=new GameClockAuthority({kalshi:{async getMilestonesForEvent(){return[];}},now:()=>t0});
  const market=q('FBM',88,89,event); market.liveStatus='live'; market.occurrenceTimeMs=t0-1000;
  const first=await authority.resolveEvent({eventTicker:event,quotes:[market],now:t0});
  assert.equal(first.source,'occurrence_passed');
  market.occurrenceTimeMs=t0+60*60000;
  const conflict=await authority.resolveEvent({eventTicker:event,quotes:[market],priorState:first,now:t0+1000});
  assert.equal(conflict.phase,'CONFLICT');
  assert.equal(conflict.reason,'fallback_occurrence_moved_future');
  market.occurrenceTimeMs=t0-1000;
  const stillConflict=await authority.resolveEvent({eventTicker:event,quotes:[market],priorState:conflict,now:t0+2000});
  assert.equal(stillConflict.phase,'CONFLICT');
  assert.equal(stillConflict.reason,'persisted_conflict_retained');
});

test('R17 persistTrackers never drops an open feeder/Hunter ticker from the authority set when it falls outside discovery top-50',async()=>{
  const now=Date.now();
  const openTicker='OPEN-PRIORITY'; const event='OPEN-PRIORITY-EV';
  const openEntry=row({id:'open-priority-entry',conceptName:'Sagittarius',ticker:openTicker,eventTicker:event,status:'open'});
  const trackerRows=[]; const clockStates=new Map();
  const db={
    async trackers(){return trackerRows;},
    async openEntries(){return[openEntry];},
    async gameClockStates(){return new Map(clockStates);},
    async upsertGameClockState(_s,e,state){clockStates.set(e,structuredClone(state));},
    async upsertTracker(_s,qv,_h,_c,phase){trackerRows.push({ticker:qv.ticker,event_ticker:qv.eventTicker,game_start_time_ms:qv.gameStartTimeMs,game_clock_state:structuredClone(qv.gameClockState),phase,last_scan_ms:now});},
    async deleteStaleTrackers(){}, async pruneGameClockStates(){}, async audit(){},
  };
  const cached=q(openTicker,88,89,event); cached.occurrenceTimeMs=now+60*60000;
  const market={getHistory:()=>[],getQuote:(ticker)=>ticker===openTicker?cached:null};
  const kalshi={
    async getMilestonesForEvent(ev){return ev===event?[{id:'priority-live',category:'Sports',type:'tennis_match',primary_event_tickers:[event],related_event_tickers:[event]}]:[];},
    async getLiveData(){return{milestone_id:'priority-live',details:{status:'in_progress'}};}, async getGameStats(){return null;},
  };
  const engine=Object.create(SagittariusEngine.prototype);
  engine.settings=settings({sagittariusEnabled:true}); engine.db=db; engine.market=market; engine.kalshi=kalshi;
  engine.gameClock=new GameClockAuthority({kalshi,now:()=>now});
  const discovery=[];
  for(let i=0;i<80;i++) discovery.push(q(`DISC-${i}`,88,89,`DISC-EV-${i}`));
  await engine.persistTrackers(discovery);
  const tracked=trackerRows.find((x)=>x.ticker===openTicker);
  assert.ok(tracked,'open ticker missing from discovery must still be persisted');
  assert.equal(tracked.game_clock_state.phase,'CONFIRMED');
  assert.equal(cached.gameClockState.phase,'CONFIRMED','cached priority quote must receive authority for immediate strategy use');
});

test('R17 last-moment GCA revalidation can veto a candidate after executable-book refresh before any simulated fill',async()=>{
  const now=Date.now();
  const db=memoryDb();
  const s=settings({minGameMinutes:40,simFillProbability:1,startingCapitalCents:10_000_000});
  let refreshCalls=0;
  const market={
    async refreshTicker(){return q('LM',88,89,'LM-EV');},
    getQuote(){return q('LM',88,89,'LM-EV');},
    executableAsk(){return{filled:1000,full:true,avgCents:89,bestCents:89};},
  };
  const st=new StrategyEngine({
    db,kalshi:{},market,learning:{recoveryRate:async()=>null},getSettings:()=>s,getLiveReady:()=>false,random:()=>0,
    refreshGameClock:async()=>{refreshCalls+=1;return{gameClockState:{version:'GCA1',eventTicker:'LM-EV',phase:'CONFLICT',confirmed:false,startTimeMs:now-50*60000,reason:'official_live_data_conflict'},gameStartTimeMs:null,liveStatus:'live'};},
  });
  const candidate=q('LM',88,89,'LM-EV'); candidate.gameStartTimeMs=now-50*60000; candidate.gameClockState=confirmedClock('LM-EV',candidate.gameStartTimeMs);
  const made=await st.createHunter('Wave Surfer',candidate,20000,35);
  assert.equal(made,null);
  assert.equal(refreshCalls,1);
  assert.equal(db.inserted.length,0);
  assert.ok(db.audits.some((x)=>x.event==='hunter_clock_revalidation_blocked'));
});

test('R17 event-level GCA1 database methods preserve JSON state by system/event and prune only by age',async()=>{
  const calls=[];
  const db=Object.create(Database.prototype);
  db.pool={async query(sql,args){calls.push({sql,args});if(sql.startsWith('select event_ticker'))return{rows:[{event_ticker:'EV1',state:{version:'GCA1',eventTicker:'EV1',phase:'CONFIRMED',confirmed:true,startTimeMs:123},last_updated_ms:456}]};return{rows:[],rowCount:1};}};
  const states=await db.gameClockStates('SAGITTARIUS',['EV1','EV1','EV2']);
  assert.equal(states.get('EV1').phase,'CONFIRMED');
  assert.deepEqual(calls[0].args,['SAGITTARIUS',['EV1','EV2']]);
  await db.upsertGameClockState('SAGITTARIUS','EV1',{version:'GCA1',phase:'CONFLICT'});
  assert.ok(calls[1].sql.includes('on conflict(system_name,event_ticker) do update'));
  assert.equal(calls[1].args[0],'SAGITTARIUS'); assert.equal(calls[1].args[1],'EV1');
  await db.pruneGameClockStates('SAGITTARIUS',1000);
  assert.ok(calls[2].sql.includes('last_updated_ms<$2'));
  assert.deepEqual(calls[2].args,['SAGITTARIUS',1000]);
});

test('GCA1 parser scopes lifecycle to whole-event containers and fails closed on contradictory terminal evidence',()=>{
  assert.equal(classifyLiveData({details:{period:{status:'complete'},game:{status:'in_progress'}}}).classification,'live','completed period must not finalize a live game');
  assert.equal(classifyLiveData({details:{period:{status:'complete'}}}).classification,'unknown','period-only status is not whole-game authority');
  assert.equal(classifyLiveData({details:{data:{status:'in_progress'}}}).classification,'unknown','generic data containers are too ambiguous to authorize exposure');
  assert.equal(classifyLiveData({details:{is_live:false}}).classification,'pregame');
  assert.equal(classifyLiveData({details:{started:false}}).classification,'pregame');
  for(const status of ['paused','suspended']) assert.equal(classifyLiveData({details:{status}}).classification,'pregame');
  for(const status of ['canceled','cancelled','abandoned']) assert.equal(classifyLiveData({details:{status}}).classification,'final');
  assert.equal(classifyLiveData({details:{game:{status:'in_progress'},match:{status:'final'}}}).classification,'conflict','mixed final/live evidence must not become sticky FINAL');
});

test('GCA1 rejects live-data milestone identity mismatches and does not trust identity-less positive live data',async()=>{
  const now=1_800_000_000_000;
  const event='IDENTITY-EV';
  const market=q('IDENTITY',88,89,event); market.liveStatus='live'; market.occurrenceTimeMs=now+60*60000;
  const mismatch=new GameClockAuthority({kalshi:{
    async getMilestonesForEvent(){return[{id:'m1',category:'Sports',type:'tennis_match',primary_event_tickers:[event],related_event_tickers:[event]}];},
    async getLiveData(){return{milestone_id:'m2',details:{status:'in_progress'}};},
    async getGameStats(){return null;},
  },now:()=>now});
  const conflict=await mismatch.resolveEvent({eventTicker:event,quotes:[market],now,forceFresh:true});
  assert.equal(conflict.phase,'CONFLICT');
  assert.equal(conflict.reason,'official_live_data_milestone_mismatch');
  assert.equal(conflict.entryAuthorized,false);

  const missing=new GameClockAuthority({kalshi:{
    async getMilestonesForEvent(){return[{id:'m1',category:'Sports',type:'tennis_match',primary_event_tickers:[event],related_event_tickers:[event]}];},
    async getLiveData(){return{details:{status:'in_progress'}};},
    async getGameStats(){return null;},
  },now:()=>now});
  const unknown=await missing.resolveEvent({eventTicker:event,quotes:[market],now,forceFresh:true});
  assert.equal(unknown.phase,'UNKNOWN');
  assert.equal(unknown.reason,'live_data_identity_missing_no_other_authority');
  assert.equal(unknown.entryAuthorized,false);
});

test('GCA1 persists start provenance across an evidence outage but never persists permission to create exposure',async()=>{
  const now=1_800_000_000_000;
  const event='AUTH-GAP-EV';
  const prior=confirmedClock(event,now-45*60000,'kalshi_live_data');
  const authority=new GameClockAuthority({kalshi:{async getMilestonesForEvent(){throw new Error('offline');}},now:()=>now});
  const market=q('AUTH-GAP',88,89,event); market.occurrenceTimeMs=now+60*60000; market.liveStatus='live'; market.recentTradesObservedAtMs=0;
  const retained=await authority.resolveEvent({eventTicker:event,quotes:[market],priorState:prior,now,forceFresh:true});
  assert.equal(retained.phase,'CONFIRMED');
  assert.equal(retained.startTimeMs,prior.startTimeMs);
  assert.equal(isConfirmedGameClockState(retained,event),true);
  assert.equal(retained.entryAuthorized,false);
  assert.equal(isEntryAuthorizedGameClockState(retained,event,now),false);
  assert.equal(retained.authorizationSource,null);
});

test('GCA1 forceFresh bypasses both milestone and live-data caches before entry authorization',async()=>{
  let now=1_800_000_000_000;
  const event='FORCE-FRESH-EV';
  let live='scheduled'; let milestoneCalls=0; let liveCalls=0;
  const authority=new GameClockAuthority({kalshi:{
    async getMilestonesForEvent(){milestoneCalls+=1;return[{id:'ff',category:'Sports',type:'tennis_match',primary_event_tickers:[event],related_event_tickers:[event]}];},
    async getLiveData(){liveCalls+=1;return{milestone_id:'ff',details:{status:live}};},
    async getGameStats(){return null;},
  },now:()=>now});
  const market=q('FF',88,89,event); market.occurrenceTimeMs=now+60*60000; market.liveStatus='live';
  const first=await authority.resolveEvent({eventTicker:event,quotes:[market],now});
  assert.equal(first.reason,'official_live_data_pregame');
  live='in_progress'; now+=1000;
  const cached=await authority.resolveEvent({eventTicker:event,quotes:[market],now});
  assert.equal(cached.reason,'official_live_data_pregame','ordinary resolution must honor the short cache');
  const fresh=await authority.resolveEvent({eventTicker:event,quotes:[market],now,forceFresh:true});
  assert.equal(fresh.phase,'CONFIRMED');
  assert.equal(fresh.entryAuthorized,true);
  assert.equal(milestoneCalls,2,'forceFresh must bypass milestone selection cache as well as live-data cache');
  assert.equal(liveCalls,2);
});

test('GCA1 records first strong start at response completion time and never backdates to request start',async()=>{
  let now=1_800_000_000_000;
  const requestedAt=now;
  const event='RESPONSE-TIME-EV';
  const authority=new GameClockAuthority({kalshi:{
    async getMilestonesForEvent(){return[{id:'rt',category:'Sports',type:'tennis_match',primary_event_tickers:[event],related_event_tickers:[event]}];},
    async getLiveData(){now+=5000;return{milestone_id:'rt',details:{status:'in_progress'}};},
    async getGameStats(){return null;},
  },now:()=>now});
  const market=q('RT',88,89,event); market.occurrenceTimeMs=requestedAt+60*60000; market.liveStatus='live';
  const state=await authority.resolveEvent({eventTicker:event,quotes:[market],now:requestedAt,forceFresh:true});
  assert.equal(state.startTimeMs,requestedAt+5000);
  assert.equal(state.evidenceObservedAtMs,requestedAt+5000);
});

test('GCA1 PBP is restart-safe start provenance but cannot alone authorize a new Hunter after the game may have ended',async()=>{
  const now=1_800_000_000_000;
  const event='PBP-PROVENANCE-EV';
  const authority=new GameClockAuthority({kalshi:{
    async getMilestonesForEvent(){return[{id:'pbp-only',category:'Sports',type:'basketball_game',primary_event_tickers:[event],related_event_tickers:[event]}];},
    async getLiveData(){return{milestone_id:'pbp-only',details:{}};},
    async getGameStats(){return{pbp:{periods:[{events:[{id:'historical-play'}]}]}};},
  },now:()=>now});
  const market=q('PBP-ONLY',88,89,event); market.occurrenceTimeMs=now+60*60000; market.liveStatus='live'; market.recentTradesObservedAtMs=now;
  const state=await authority.resolveEvent({eventTicker:event,quotes:[market],now,allowGameStats:true,forceFresh:true});
  assert.equal(state.phase,'CONFIRMED');
  assert.equal(state.source,'kalshi_game_stats');
  assert.equal(state.reason,'official_pbp_start_provenance_only');
  assert.equal(state.entryAuthorized,false);
  assert.equal(isEntryAuthorizedGameClockState(state,event,now),false);
});

test('GCA1 occurrence fallback separates broad start provenance from fresh exact-trade entry authorization and can reauthorize a persisted start',async()=>{
  const now=1_800_000_000_000;
  const event='FRESH-FALLBACK-EV';
  const authority=new GameClockAuthority({kalshi:{async getMilestonesForEvent(){return[];}},now:()=>now});
  const market=q('FBF',88,89,event); market.occurrenceTimeMs=now-60*60000; market.liveStatus='live'; market.recentTrades=20; market.recentTradesObservedAtMs=0;
  const provenance=await authority.resolveEvent({eventTicker:event,quotes:[market],now,forceFresh:true});
  assert.equal(provenance.phase,'CONFIRMED');
  assert.equal(provenance.entryAuthorized,false,'stale scanner trade counts must not be relabeled as current authority');
  assert.equal(provenance.reason,'occurrence_passed_broad_live_provenance_only');
  market.recentTradesObservedAtMs=now+1000;
  const reauthorized=await authority.resolveEvent({eventTicker:event,quotes:[market],priorState:provenance,now:now+1000,forceFresh:true});
  assert.equal(reauthorized.startTimeMs,provenance.startTimeMs,'fresh authorization must not reset accumulated in-game provenance');
  assert.equal(reauthorized.entryAuthorized,true);
  assert.equal(reauthorized.authorizationSource,'occurrence_passed_fresh_trade_activity');
  assert.equal(isEntryAuthorizedGameClockState(reauthorized,event,now+1000),true);
});

test('R17 exact market lifecycle revalidation blocks inactive, disputed, and cross-event markets after fresh clock authorization',async()=>{
  const now=Date.now();
  for(const [label,fresh] of [
    ['inactive',{status:'inactive',eventTicker:'LIFE-EV',result:''}],
    ['disputed',{status:'disputed',eventTicker:'LIFE-EV',result:''}],
    ['cross-event',{status:'active',eventTicker:'OTHER-EV',result:''}],
  ]){
    const db=memoryDb();
    const s=settings({minGameMinutes:40,simFillProbability:1,startingCapitalCents:10_000_000});
    const candidate=q(`LIFE-${label}`,88,89,'LIFE-EV'); candidate.gameStartTimeMs=now-50*60000; candidate.gameClockState=confirmedClock('LIFE-EV',candidate.gameStartTimeMs);
    const market={
      async refreshTicker(){return{...q(candidate.ticker,88,89,fresh.eventTicker),status:fresh.status,result:fresh.result};},
      executableAsk(){return{filled:1000,full:true,avgCents:89,bestCents:89};},
    };
    const st=new StrategyEngine({db,kalshi:{},market,learning:{},getSettings:()=>s,getLiveReady:()=>false,random:()=>0,
      refreshGameClock:async(qq)=>{const t=Date.now();return{gameClockState:{...qq.gameClockState,entryAuthorized:true,evidenceObservedAtMs:t,lastCheckedAtMs:t,authorizationSource:'kalshi_live_data'},gameStartTimeMs:qq.gameStartTimeMs,liveStatus:'live'};}});
    const made=await st.createHunter('Wave Surfer',candidate,20000,35);
    assert.equal(made,null,`${label} market reached the fill path`);
    assert.equal(db.inserted.length,0);
    assert.ok(db.audits.some((x)=>x.event==='hunter_entry_lifecycle_revalidation_blocked'));
  }
});

test('R17 createHunter fails closed when force-fresh authority is unavailable or stale before any fill',async()=>{
  const now=Date.now();
  const s=settings({minGameMinutes:40,simFillProbability:1,startingCapitalCents:10_000_000});
  const candidate=q('NO-CLOCK-REFRESH',88,89,'NO-CLOCK-REFRESH-EV'); candidate.gameStartTimeMs=now-50*60000; candidate.gameClockState=confirmedClock(candidate.eventTicker,candidate.gameStartTimeMs);
  let fillChecks=0;
  const market={async refreshTicker(){return q(candidate.ticker,88,89,candidate.eventTicker);},executableAsk(){fillChecks+=1;return{filled:1000,full:true,avgCents:89,bestCents:89};}};
  const db=memoryDb();
  const noRefresh=new StrategyEngine({db,kalshi:{},market,learning:{},getSettings:()=>s,getLiveReady:()=>false,random:()=>0});
  assert.equal(await noRefresh.createHunter('Momentum Hunter',structuredClone(candidate),20000,35),null);
  assert.equal(db.audits.at(-1).event,'hunter_clock_refresh_unavailable');
  assert.equal(fillChecks,0);

  const db2=memoryDb();
  const stale=new StrategyEngine({db:db2,kalshi:{},market,learning:{},getSettings:()=>s,getLiveReady:()=>false,random:()=>0,
    refreshGameClock:async(qq)=>({gameClockState:{...qq.gameClockState,entryAuthorized:true,evidenceObservedAtMs:Date.now()-60_000,lastCheckedAtMs:Date.now(),authorizationSource:'kalshi_live_data'},gameStartTimeMs:qq.gameStartTimeMs,liveStatus:'live'})});
  assert.equal(await stale.createHunter('Momentum Hunter',structuredClone(candidate),20000,35),null);
  assert.equal(db2.audits.at(-1).event,'hunter_clock_revalidation_blocked');
  assert.equal(fillChecks,0);
});


test('R26 migration from an R25 persisted record preserves prior controls while adding GDH1 fail-safe OFF defaults',()=>{
  const r25={
    ...originalSettings(),
    systemName:'SAGITTARIUS',ownerId:'r25-upgrade',mode:'SIMULATION',
    goldenDragonEnabled:true,dragonRecoveryHunterEnabled:true,
    momentumMinEntryCents:55,momentumMaxEntryCents:89,momentumMinRiseCents:7,
  };
  for(const key of ['goldenDragonHunterEnabled','goldenDragonHunterStakeCents','goldenDragonHunterMinEntryCents','goldenDragonHunterMaxEntryCents','goldenDragonHunterStopLossCents','goldenDragonHunterMaxSpreadCents','goldenDragonHunterMinTrustScore','goldenDragonHunterMaxEpisode','goldenDragonHunterMinReboundCents','goldenDragonHunterMinReclaimRate','goldenDragonHunterStableObservations','goldenDragonHunterUpwardTicks']) delete r25[key];
  const migrated=sanitizeRuntimeSettings(r25,originalSettings());
  assert.equal(migrated.goldenDragonEnabled,true);
  assert.equal(migrated.dragonRecoveryHunterEnabled,true);
  assert.equal(migrated.momentumMinEntryCents,55);
  assert.equal(migrated.momentumMaxEntryCents,89);
  assert.equal(migrated.momentumMinRiseCents,7);
  assert.equal(migrated.goldenDragonHunterEnabled,false,'new real-exposure concept must not auto-enable during R25 -> R26 migration');
  assert.equal(migrated.goldenDragonHunterStakeCents,20000);
  assert.equal(migrated.goldenDragonHunterMinEntryCents,55);
  assert.equal(migrated.goldenDragonHunterMaxEntryCents,89);
  assert.equal(migrated.goldenDragonHunterMinTrustScore,80);
  assert.equal(migrated.goldenDragonHunterMaxEpisode,2);
});

test('R28 unknown scan-time clock cannot deadlock before mandatory force-fresh authority refresh',async()=>{
  const now=Date.now();
  const db=memoryDb();
  const s=settings({minGameMinutes:20,simFillProbability:1,startingCapitalCents:10_000_000,waveSurferEnabled:true,waveMinEntryCents:86,waveMaxEntryCents:92,waveMinFeederFavorableMoveCents:8,waveMaxSpreadCents:3});
  const candidate=q('R28-SEQ',89,90,'R28-SEQ-EV');
  candidate.gameClockState={version:'GCA1',eventTicker:candidate.eventTicker,phase:'UNKNOWN',confirmed:false,startTimeMs:null};
  candidate.gameStartTimeMs=null;
  let refreshCalls=0;
  const market={
    async refreshTicker(){return{...q(candidate.ticker,89,90,candidate.eventTicker),status:'active',result:''};},
    executableAsk(){return{filled:1000,full:true,avgCents:90,bestCents:90};},
    executableBid(_ticker,count){return{filled:count,full:true,avgCents:89,bestCents:89};},
  };
  const st=new StrategyEngine({db,kalshi:{},market,learning:{},getSettings:()=>s,getLiveReady:()=>false,random:()=>0,
    refreshGameClock:async()=>{refreshCalls+=1;const start=Date.now()-30*60000;const clock=confirmedClock(candidate.eventTicker,start,'kalshi_live_data');return{gameClockState:clock,gameStartTimeMs:start,liveStatus:'live'};}});
  const made=await st.createHunter('Wave Surfer',candidate,20000,35,{
    sourceFeeder:'Pegasus',sourceTradeId:'feed-r28',sourceEntryConfig:{feeder:{minPriceCents:80,maxPriceCents:94,dropCents:2}},
    entryQualificationSnapshot:{version:'WAVE-Q1',feederId:'feed-r28',feederConcept:'Pegasus',feederEntryPriceCents:80,candidateFavorableMoveCents:9,observedAtMs:now},
  });
  assert.ok(made,'force-fresh authority must be allowed to rescue an UNKNOWN scan-time clock');
  assert.equal(made.conceptName,'Wave Surfer');
  assert.equal(refreshCalls,1);
  assert.equal(db.audits.some((x)=>x.event==='hunter_in_game_time_unknown'),false,'pre-refresh UNKNOWN must not be treated as a terminal policy decision');
});

test('R28 GCA2 exact-event milestone discovery falls back from related-event filter to primary-event membership',async()=>{
  const now=1_800_000_000_000;
  const event='PRIMARY-ONLY-EV';
  const authority=new GameClockAuthority({kalshi:{
    async getMilestonesForEvent(){return[];},
    async getMilestonesForSeriesEvent(ev,series){assert.equal(ev,event);assert.equal(series,'SERIES-PO');return[{id:'po',category:'Sports',type:'soccer_match',primary_event_tickers:[event],related_event_tickers:[],start_date:new Date(now-60*60000).toISOString(),end_date:new Date(now+60*60000).toISOString()}];},
    async getLiveData(){return{milestone_id:'po',details:{status:'in_progress'}};},
    async getGameStats(){return null;},
  },now:()=>now});
  const market=q('PO',60,61,event);market.seriesTicker='SERIES-PO';market.occurrenceTimeMs=now+2*60*60000;market.liveStatus='live';
  const state=await authority.resolveEvent({eventTicker:event,quotes:[market],now,forceFresh:true});
  assert.equal(state.phase,'CONFIRMED');
  assert.equal(state.entryAuthorized,true);
  assert.equal(state.source,'kalshi_live_data');
  assert.equal(state.milestoneId,'po');
  assert.equal(state.milestoneDiscoverySource,'series_events_with_milestones');
  assert.equal(state.occurrenceConflict,true);
});

test('R28 GCA2 PBP plus fresh exact activity authorizes inside the official milestone window even when occurrence is session-like future metadata',async()=>{
  const now=1_800_000_000_000;
  const event='PBP-CURRENT-EV';
  const authority=new GameClockAuthority({kalshi:{
    async getMilestonesForEvent(){return[{id:'pbp-current',category:'Sports',type:'soccer_match',primary_event_tickers:[event],related_event_tickers:[event],start_date:new Date(now-60*60000).toISOString(),end_date:new Date(now+60*60000).toISOString()}];},
    async getLiveData(){return{milestone_id:'pbp-current',details:{}};},
    async getGameStats(){return{pbp:{periods:[{events:[{id:'play'}]}]}};},
  },now:()=>now});
  const market=q('PBP-CURRENT',60,61,event);market.occurrenceTimeMs=now+2*60*60000;market.liveStatus='live';market.recentTrades=12;market.recentTradesObservedAtMs=now;
  const state=await authority.resolveEvent({eventTicker:event,quotes:[market],now,allowGameStats:true,forceFresh:true});
  assert.equal(state.phase,'CONFIRMED');
  assert.equal(state.source,'kalshi_game_stats');
  assert.equal(state.entryAuthorized,true);
  assert.equal(state.authorizationSource,'kalshi_game_stats_plus_exact_trade');
  assert.equal(state.reason,'official_pbp_current_window_authorized');
  assert.equal(state.occurrenceConflict,true);
  assert.equal(isEntryAuthorizedGameClockState(state,event,now),true);
});
