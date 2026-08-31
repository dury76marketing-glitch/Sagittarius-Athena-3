import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { originalSettings, sanitizeRuntimeSettings, RELEASE } from '../src/config.mjs';
import { SagittariusEngine, resolveObservedGameStart } from '../src/engine.mjs';
import { StrategyEngine, confirmedInGameElapsedMinutes, entryConfigSnapshot } from '../src/strategy.mjs';
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

test("R45 Mega Wave retains Athena B1, Golden Eye GE1-R2, FSI1 and the R41 loss machinery under Aurora",async()=>{const {RELEASE,originalSettings,CANONICAL_NUMERIC_SETTINGS,CANONICAL_BOOLEAN_SETTINGS,sanitizeRuntimeSettings,normalizeStartupExecutionMode}=await import('../src/config.mjs');const D=await import('../src/doctrine.mjs');const {readFile,readdir,stat}=await import('node:fs/promises');const pg=await readFile(new URL('../src/profitGuard.mjs',import.meta.url),'utf8');assert.equal(D.INFINITY_BREAK.authority,'PROFIT_EXIT');assert.equal(D.AURORA_EXECUTION.lossAuthority,'U-SG1');assert.equal(D.AURORA_EXECUTION.defaultDamageControlPercent,45);assert.ok(pg.includes("'infinity_break'"));assert.ok(pg.includes("'atomic_thunder_cashout'"),'legacy Atomic history must remain compatible');assert.ok(pg.includes('auroraDamageControlPercent'));assert.equal(pg.includes('maximumPositionLifetimeMs'),false);});

test('Shared/System Settings contains only the explicitly approved shared controls',async()=>{const {readFile}=await import('node:fs/promises');const app=await readFile(new URL('../public/app.js',import.meta.url),'utf8');for(const k of ['maxPositions','maxEntriesPerTrade','hunterCooldownMinutes','minGameMinutes','maxGameMinutes','eventCooldownMinutes','maxSpreadCents','startingCapitalCents','simFeeCents','recoveryTrackingHours'])assert.ok(app.includes(`['${k}'`)||app.includes(`['${k}',`),k);for(const retired of ['momentumMinRiseCents','waveMinFeederFavorableMoveCents','crashRecoveryMinCrashCents','simFillProbability'])assert.equal(app.includes(retired),false,retired);});

test('every active Execution Attack and Cosmo feeder owns its editable fields while static stops and retired concepts are absent',async()=>{const {readFile}=await import('node:fs/promises');const app=await readFile(new URL('../public/app.js',import.meta.url),'utf8');for(const k of ['momentumStakeCents','momentumMinEntryCents','momentumMaxEntryCents','waveStakeCents','recoveryStakeCents','crashRecoveryStakeCents','athenaExclamationStakeCents','lightningPlasmaFieldStakeCents','pegasusReferenceStakeCents','dragonReferenceStakeCents'])assert.ok(app.includes(k),k);assert.equal(app.includes('lightningPlasmaMaxStrikes'),false,'LP2 fixed three-slot doctrine is not editable');for(const retired of ['waveStopLossCents','momentumMinRiseCents','recoveryMinReboundCents','crashRecoveryMinCrashCents'])assert.equal(app.includes(retired),false,retired);});

test('R45 still migrates legacy shared stake aliases into surviving active models and removes retired aliases/concepts',async()=>{const C=await import('../src/config.mjs');const s=C.sanitizeRuntimeSettings({hunterStakeCents:21000,stakeCents:22000,feederStakeCents:3100,recoveryBaseStakeCents:11000});assert.equal(s.momentumStakeCents,21000);assert.equal(s.waveStakeCents,22000);assert.equal(s.pegasusReferenceStakeCents,3100);assert.equal(s.recoveryStakeCents,22000);for(const k of ['hunterStakeCents','stakeCents','feederStakeCents','recoveryBaseStakeCents'])assert.equal(Object.hasOwn(s,k),false,k);});

test('active model-owned values and Galactic Explosion persist while retired/static-stop settings are rejected',async()=>{const C=await import('../src/config.mjs');const s=C.sanitizeRuntimeSettings({...C.originalSettings(),waveStakeCents:12345,waveMinEntryCents:51,waveMaxEntryCents:59,galacticExplosionEnabled:true,waveMinFeederFavorableMoveCents:99,waveVirtualProfitCents:99});assert.equal(s.waveStakeCents,12345);assert.equal(s.waveMinEntryCents,51);assert.equal(s.waveMaxEntryCents,59);assert.equal(s.galacticExplosionEnabled,true);assert.equal(Object.hasOwn(s,'waveMinFeederFavorableMoveCents'),false);assert.equal(Object.hasOwn(s,'waveVirtualProfitCents'),false);});

test('Pegasus and Dragon reference stakes are independent and remain display-only',async()=>{
  const db=memoryDb();const s=settings({pegasusReferenceStakeCents:3000,dragonEnabled:true,dragonReferenceStakeCents:6000});const st=strategyFor(s,db);
  const p=await st.createGhost('Pegasus',q('P',89,90),90,null);const d=await st.createGhost('Dragon',q('D',59,60),60,null,{sourceTradeId:'CI1:D:1'});
  assert.equal(p.count,33);assert.equal(d.count,100);assert.equal(p.entryOrderId??null,null);assert.equal(d.entryOrderId??null,null);
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
  const made=await st.createHunter('Wave Surfer',q('BROKERLOCK',90,91,'BEV'),20000,35,{legacyCompatibility:true,sourceFeeder:'Pegasus'});
  assert.equal(made,null);
  assert.equal(refreshes,0,'ticker lock must fire before book refresh/order work');
  assert.equal(orders,0,'ticker lock must fire before LIVE broker order');
  assert.equal(db.audits.at(-1).event,'hunter_exact_ticker_exposure_blocked');
});

test('HF3 PostgreSQL advisory-lock contention fails closed at the final commit boundary without starving qualification or reaching broker mutation',async()=>{
  const db=memoryDb();
  db.acquireHunterTickerLock=async(_system,key)=>String(key)==='commit:DBLOCK'?null:async()=>{};
  const s=settings({mode:'LIVE',liveArmed:true,maxEntriesPerTrade:9,hunterCooldownMinutes:0,minGameMinutes:0,momentumMinEntryCents:80,momentumMaxEntryCents:95});
  let refreshes=0,orders=0;
  const qq=q('DBLOCK',90,91,'DBEV');
  const market={getQuote:()=>qq,async refreshTickerVerified(){refreshes+=1;return{quote:qq,marketFresh:true,bookFresh:true};},executableAsk:(_t,count)=>({filled:count,full:true,avgCents:91,bestCents:91})};
  const kalshi={buildClientOrderId:()=> 'cid',placeOrder:async()=>{orders+=1;return{fillCount:1,averageFillPriceCents:91,orderId:'o'};}};
  const refreshGameClock=async(x)=>{const now=Date.now();return{gameClockState:{...x.gameClockState,entryAuthorized:true,evidenceObservedAtMs:now,lastCheckedAtMs:now},gameStartTimeMs:x.gameStartTimeMs,liveStatus:'live'};};
  const st=new StrategyEngine({db,kalshi,market,learning:{},getSettings:()=>s,getLiveReady:()=>true,refreshGameClock,random:()=>0});
  st.revalidateHunterEntryDoctrine=async()=>({ok:true});
  assert.equal(await st.createHunter('Momentum Hunter',qq,20000,0,{legacyCompatibility:true}),null);
  assert.ok(refreshes>0,'HF3 deliberately postpones the cross-process advisory lock until after expensive qualification');
  assert.equal(orders,0,'commit-lock contention must still block before LIVE broker mutation');
  assert.equal(db.inserted.length,0,'commit-lock contention must block before durable entry intent');
  assert.ok(db.audits.some(x=>x.event==='hunter_entry_commit_db_lock_busy'));
  const dbSource=await readFile(resolve(root,'src/db.mjs'),'utf8');
  assert.ok(dbSource.includes('pg_try_advisory_lock'));
  assert.ok(dbSource.includes('pg_advisory_unlock'));
  assert.ok(dbSource.includes('const client = await this.lockPool.connect()'));
});

test('R13 process-local mutex prevents concurrent same-ticker Hunter creation races',async()=>{
  const db=memoryDb();
  const s=settings({startingCapitalCents:10_000_000,maxEntriesPerTrade:9,hunterCooldownMinutes:0,minGameMinutes:0,simFillProbability:1,momentumMinEntryCents:1,momentumMaxEntryCents:99,waveMinEntryCents:1,waveMaxEntryCents:99});
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
  const first=st.createHunter('Momentum Hunter',q('RACE',90,91,'REV'),910,35,{legacyCompatibility:true,sourceFeeder:'Pegasus',sourceTradeId:'feed-race',entryQualificationSnapshot:{version:'MOMENTUM-Q1',feederEntryPriceCents:80,feederPeakPriceCents:95}});
  await new Promise(r=>setTimeout(r,0));
  const second=await st.createHunter('Wave Surfer',q('RACE',90,91,'REV'),910,35,{legacyCompatibility:true});
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

test('R45 entry-chain ordering gives Recovery first claim, builds Cosmo signals, then CRH and feeder-driven Attacks',async()=>{const D=await import('../src/doctrine.mjs');const C=await import('../src/config.mjs');assert.equal(C.RELEASE,'SAGITTARIUS-R65-GEMINI-LIGHTNING-PLASMA-ATHENA-EXCLAMATION-2026-08-31');assert.equal(D.ATOMIC_THUNDER_BOLT.entryAuthority,false);assert.equal(D.ATHENA_COMMANDER.entryDecisionAuthority,true);assert.equal(D.ATHENA_COMMANDER.attackSelectionAuthority,true);assert.equal(D.ATHENA_COMMANDER.attackStrategicRevalidationAllowed,false);const {readFile}=await import('node:fs/promises');const engine=await readFile(new URL('../src/engine.mjs',import.meta.url),'utf8');assert.ok(engine.includes('evaluateNewGenerationOpportunities'));for(const call of ['strategy.evaluateMomentumAndWave(','strategy.evaluateRecovery(','strategy.evaluateCrashRecovery(','strategy.evaluateLightningPlasma('])assert.equal(engine.includes(call),false,call);});

test('R45 diagnostics expose GCA2, Galactic Explosion lock scope, Aurora, U-SG1/SLW1 and profit authority invariants',async()=>{const {readFile}=await import('node:fs/promises');const D=await import('../src/doctrine.mjs');const engine=await readFile(new URL('../src/engine.mjs',import.meta.url),'utf8');assert.equal(D.AURORA_EXECUTION.lossAuthority,'U-SG1');assert.equal(D.INFINITY_BREAK.authority,'PROFIT_EXIT');assert.equal(D.GALACTIC_EXPLOSION.enabledLockScope,'exact_ticker_plus_attack_identity');for(const k of ['auroraDamageControlPercent','infinityBreak','atomicThunderBolt','athena'])assert.ok(engine.includes(k),k);});

test('R45 preserves PRI1/PLI1 legacy diagnostics and Golden Eye manual learning while the Mega UI uses unified guard state display',async()=>{const {readFile}=await import('node:fs/promises');const app=await readFile(new URL('../public/app.js',import.meta.url),'utf8');const pg=await readFile(new URL('../src/profitGuard.mjs',import.meta.url),'utf8');assert.ok(app.includes('renderInfinity'));assert.ok(app.includes('renderAurora'));assert.ok(pg.includes("'infinity_break'"));assert.ok(pg.includes("'atomic_thunder_cashout'"));assert.ok(pg.includes('legacy'));});

test('dashboard keeps unsaved Attack/Cosmo/shared drafts safe and verifies persistence against runtime state',async()=>{const {readFile}=await import('node:fs/promises');const app=await readFile(new URL('../public/app.js',import.meta.url),'utf8');assert.ok(app.includes('const drafts=new Map()'));assert.ok(app.includes('drafts.has(key)?drafts.get(key):value'));assert.ok(app.includes('patchSettingsVerified'));assert.ok(app.includes('did not persist exactly'));});

test('Momentum runtime consumes active model values while its retired static stop cannot regain authority',async()=>{
  const f=row({id:'f',conceptName:'Pegasus',ticker:'M',eventTicker:'MEV',entryPriceCents:82,currentPriceCents:86,peakPriceCents:90,gameStartTimeMs:Date.now()-30*60000,entryConfig:{referenceStakeCents:3000,feeder:{minPriceCents:80,maxPriceCents:94,dropCents:2}}});const db=memoryDb([f]);
  const s=settings({waveSurferEnabled:false,recoveryHunterEnabled:false,momentumStakeCents:12345,momentumMinEntryCents:90,momentumMaxEntryCents:94,momentumHunterStopLossCents:99,momentumMinRiseCents:2,momentumMinPullbackCents:1,momentumMaxPullbackCents:12,momentumMaxSpreadCents:2,momentumMinTimeLeftMinutes:0});const st=strategyFor(s,db);let captured=null;
  st.createHunter=async(concept,qq,stake,stop,opt)=>{captured={concept,stake,stop,opt};return row({id:'made',conceptName:concept,ticker:qq.ticker,eventTicker:qq.eventTicker,sourceFeeder:opt.sourceFeeder});};
  assert.equal((await st.evaluateMomentumAndWave(new Map([['M',q('M',85,86,'MEV')]]),{legacyCompatibility:true})).length,0);s.momentumMinEntryCents=86;const made=await st.evaluateMomentumAndWave(new Map([['M',q('M',85,86,'MEV')]]),{legacyCompatibility:true});assert.equal(made.length,1);assert.equal(captured.stake,12345);assert.equal(captured.stop,0,'Aurora owns new-trade stop calculation at fill time');
});

test('R17 hydrates a feeder clock only from the current confirmed GCA1 tracker authority before Momentum evaluation',async()=>{
  const f=row({id:'f-null-clock',conceptName:'Pegasus',ticker:'MC',eventTicker:'MCEV',entryPriceCents:82,currentPriceCents:86,peakPriceCents:90,gameStartTimeMs:null,entryConfig:{referenceStakeCents:3000,feeder:{minPriceCents:80,maxPriceCents:94,dropCents:2}}});
  const db=memoryDb([f]);
  const s=settings({waveSurferEnabled:false,recoveryHunterEnabled:false,momentumMinEntryCents:86,momentumMaxEntryCents:94,momentumMinTimeLeftMinutes:0,minGameMinutes:20});
  const st=strategyFor(s,db);
  st.createHunter=async(concept,qq,_stake,_stop,opt)=>row({id:'made-clock',conceptName:concept,ticker:qq.ticker,eventTicker:qq.eventTicker,sourceFeeder:opt.sourceFeeder});
  const live=q('MC',85,86,'MCEV'); live.gameStartTimeMs=Date.now()-25*60000; live.gameClockState=confirmedClock('MCEV',live.gameStartTimeMs);
  const made=await st.evaluateMomentumAndWave(new Map([['MC',live]]),{legacyCompatibility:true});
  assert.equal(made.length,1);
  assert.equal(db.rows.get('f-null-clock').gameStartTimeMs,live.gameStartTimeMs,'existing feeder must inherit only the newly confirmed observed-live start');
});

test('Wave runtime consumes stake/band/spread/feeder-move controls while Aurora owns the stop',async()=>{
  const f=row({id:'f',conceptName:'Pegasus',ticker:'W',eventTicker:'WEV',entryPriceCents:80,currentPriceCents:88,peakPriceCents:89,gameStartTimeMs:Date.now()-30*60000,entryConfig:{referenceStakeCents:3000,feeder:{minPriceCents:80,maxPriceCents:94,dropCents:2}}});const db=memoryDb([f]);
  const s=settings({momentumHunterEnabled:false,recoveryHunterEnabled:false,waveStakeCents:23456,waveMinEntryCents:86,waveMaxEntryCents:92,waveStopCents:99,waveMinFeederFavorableMoveCents:8,waveMaxSpreadCents:0});const st=strategyFor(s,db);let captured=null;st.createHunter=async(concept,qq,stake,stop,opt)=>{captured={concept,stake,stop,opt};return row({id:'made',conceptName:concept,ticker:qq.ticker,eventTicker:qq.eventTicker,sourceFeeder:opt.sourceFeeder});};
  assert.equal((await st.evaluateMomentumAndWave(new Map([['W',q('W',88,89,'WEV')]]),{legacyCompatibility:true})).length,0);s.waveMaxSpreadCents=1;const made=await st.evaluateMomentumAndWave(new Map([['W',q('W',88,89,'WEV')]]),{legacyCompatibility:true});assert.equal(made.length,1);assert.equal(captured.stake,23456);assert.equal(captured.stop,0);
});

test('Recovery runtime consumes base stake/entry/rebound controls while Aurora owns the stop',async()=>{
  const stopped=row({id:'loss',conceptName:'Momentum Hunter',ticker:'R',eventTicker:'REV',status:'closed',closeReason:'hard_stop_loss',exitPriceCents:70,closedAtMs:Date.now()-60000,remainingCount:0});const db=memoryDb([stopped]);
  const s=settings({momentumHunterEnabled:false,waveSurferEnabled:false,recoveryHunterEnabled:true,recoveryBaseStakeCents:3456,recoveryMinEntryCents:76,recoveryMaxEntryCents:90,recoveryHunterStopLossCents:99,recoveryMinReboundCents:7});const st=strategyFor(s,db);let captured=null;st.createHunter=async(concept,qq,stake,stop,opt)=>{captured={concept,stake,stop,opt};return row({id:'made',conceptName:concept,ticker:qq.ticker,eventTicker:qq.eventTicker,sourceTradeId:opt.sourceTradeId});};
  assert.equal((await st.evaluateRecovery(new Map([['R',q('R',75,76,'REV')]]),{legacyCompatibility:true})).length,0);s.recoveryMinReboundCents=5;const made=await st.evaluateRecovery(new Map([['R',q('R',75,76,'REV')]]),{legacyCompatibility:true});assert.equal(made.length,1);assert.equal(captured.stake,6912);assert.equal(captured.stop,0);
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

test('R47 Maximum Minutes In-Game enforces an inclusive upper entry boundary for every Hunter while zero disables it',async()=>{
  const now=1_800_000_000_000;
  const db=memoryDb();
  const s=settings({minGameMinutes:20,maxGameMinutes:90,maxEntriesPerTrade:50,hunterCooldownMinutes:0});
  const st=strategyFor(s,db);
  const before=q('BEFOREMAX',88,89,'MAX-E1'); before.gameStartTimeMs=now-(90*60000-1); before.gameClockState=confirmedClock('MAX-E1',before.gameStartTimeMs);
  const exact=q('EXACTMAX',88,89,'MAX-E2'); exact.gameStartTimeMs=now-90*60000; exact.gameClockState=confirmedClock('MAX-E2',exact.gameStartTimeMs);
  const after=q('AFTERMAX',88,89,'MAX-E3'); after.gameStartTimeMs=now-(90*60000+1); after.gameClockState=confirmedClock('MAX-E3',after.gameStartTimeMs);
  const originalNow=Date.now;Date.now=()=>now;
  try{
    assert.equal(await st.hunterEntryPolicy('Momentum Hunter',before),true);
    assert.equal(await st.hunterEntryPolicy('Lightning Plasma',exact),true,'exact maximum minute remains eligible');
    assert.equal(await st.hunterEntryPolicy('Recovery Hunter',after),false,'all real Hunters must fail immediately after the maximum');
    assert.equal(db.audits.at(-1).event,'hunter_max_game_minutes_blocked');
    s.maxGameMinutes=0;
    assert.equal(await st.hunterEntryPolicy('Crash Recovery Hunter',after),true,'zero disables the maximum without changing the minimum guard');
  }finally{Date.now=originalNow;}
});

test('R47 immutable Hunter entry snapshot freezes both minimum and maximum in-game limits',()=>{
  const s=settings({minGameMinutes:27,maxGameMinutes:88});
  const snap=entryConfigSnapshot(s,'Wave Surfer','Pegasus',20000,{feeder:{minPriceCents:20,maxPriceCents:89,dropCents:1}},confirmedClock('SNAP-EV',Date.now()-30*60000),'SNAP-EV');
  assert.equal(snap.sharedHunterLimits.minGameMinutes,27);
  assert.equal(snap.sharedHunterLimits.maxGameMinutes,88);
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
  const s=settings({minGameMinutes:20,maxEntriesPerTrade:50,hunterCooldownMinutes:0,startingCapitalCents:10_000_000,crashRecoveryHunterEnabled:true,lightningPlasmaEnabled:true,dragonRecoveryHunterEnabled:true});
  for(const [i,concept] of ['Momentum Hunter','Wave Surfer','Recovery Hunter','Crash Recovery Hunter','Lightning Plasma','Dragon Recovery Hunter','Golden Dragon Hunter'].entries()){
    const db=memoryDb();
    const st=strategyFor(s,db);
    const early=q(`E${i}`,88,89,`EE${i}`); early.gameStartTimeMs=Date.now()-10*60000; early.gameClockState=confirmedClock(`EE${i}`,early.gameStartTimeMs);
    assert.equal(await st.hunterEntryPolicy(concept,early),false,`${concept} bypassed the shared early-game block`);
    const mature=q(`M${i}`,88,89,`ME${i}`); mature.gameStartTimeMs=Date.now()-25*60000; mature.gameClockState=confirmedClock(`ME${i}`,mature.gameStartTimeMs);
    assert.equal(await st.hunterEntryPolicy(concept,mature),true,`${concept} did not pass after the shared threshold`);
  }
});

test('feeders remain free to create reference signals before Minimum Minutes In-Game',async()=>{const D=await import('../src/doctrine.mjs');const C=await import('../src/config.mjs');assert.equal(C.RELEASE,'SAGITTARIUS-R65-GEMINI-LIGHTNING-PLASMA-ATHENA-EXCLAMATION-2026-08-31');assert.equal(D.ATOMIC_THUNDER_BOLT.entryAuthority,false);assert.equal(D.ATHENA_COMMANDER.entryDecisionAuthority,true);assert.equal(D.ATHENA_COMMANDER.attackSelectionAuthority,true);assert.equal(D.ATHENA_COMMANDER.attackStrategicRevalidationAllowed,false);const {readFile}=await import('node:fs/promises');const engine=await readFile(new URL('../src/engine.mjs',import.meta.url),'utf8');assert.ok(engine.includes('evaluateNewGenerationOpportunities'));for(const call of ['strategy.evaluateMomentumAndWave(','strategy.evaluateRecovery(','strategy.evaluateCrashRecovery(','strategy.evaluateLightningPlasma('])assert.equal(engine.includes(call),false,call);});

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


test('HF6 GCA2 SIMULATION-only observed-activity fallback ages conservatively and never backdates the minimum-game clock',async()=>{
  let now=1_800_000_000_000;
  const event='HF6-SIM-ACTIVITY-EV';
  const authority=new GameClockAuthority({kalshi:{async getMilestonesForEvent(){return[];}},now:()=>now});
  const market=q('HF6-SIM-ACTIVITY',88,89,event);
  market.liveStatus='live'; market.recentTrades=20; market.recentTradesObservedAtMs=now; market.occurrenceTimeMs=now+4*60*60*1000;
  const minimumElapsedMs=60*60*1000;
  const first=await authority.resolveEvent({eventTicker:event,quotes:[market],now,allowSimulationActivityClock:true,minimumElapsedMs,forceFresh:true});
  assert.equal(first.phase,'UNKNOWN');
  assert.equal(first.reason,'simulation_observed_activity_aging');
  assert.equal(first.simulationActivityStartMs,now);
  assert.equal(first.startTimeMs,null,'a provisional SIM observation is not yet a confirmed game clock');
  let rolling=first;
  for(let i=0;i<11;i+=1){
    now+=5*60*1000; market.recentTradesObservedAtMs=now;
    rolling=await authority.resolveEvent({eventTicker:event,quotes:[market],priorState:rolling,now,allowSimulationActivityClock:true,minimumElapsedMs,forceFresh:true});
    assert.equal(rolling.phase,'UNKNOWN');
    assert.equal(rolling.simulationActivityStartMs,first.simulationActivityStartMs);
  }
  now+=5*60*1000; market.recentTradesObservedAtMs=now;
  const authorized=await authority.resolveEvent({eventTicker:event,quotes:[market],priorState:rolling,now,allowSimulationActivityClock:true,minimumElapsedMs,forceFresh:true});
  assert.equal(authorized.phase,'CONFIRMED');
  assert.equal(authorized.source,'simulation_observed_activity');
  assert.equal(authorized.sourceStrength,'simulation_only');
  assert.equal(authorized.startTimeMs,first.simulationActivityStartMs,'the lower bound is the first sustained observed activity, never earlier');
  assert.equal(authorized.entryAuthorized,true);
  assert.equal(isEntryAuthorizedGameClockState(authorized,event,now),true);
  const liveMode=await authority.resolveEvent({eventTicker:event,quotes:[market],priorState:authorized,now,allowSimulationActivityClock:false,minimumElapsedMs,forceFresh:true});
  assert.equal(liveMode.entryAuthorized,false,'the SIM fallback can never become LIVE entry authority');
  assert.equal(liveMode.reason,'simulation_observed_activity_live_mode_not_authorized');
});

test('HF6 GCA2 SIMULATION observed-activity clock resets after a long evidence gap instead of inheriting stale pre-match activity',async()=>{
  let now=1_800_000_000_000;
  const event='HF6-SIM-GAP-EV';
  const authority=new GameClockAuthority({kalshi:{async getMilestonesForEvent(){return[];}},now:()=>now});
  const market=q('HF6-SIM-GAP',88,89,event);
  market.liveStatus='live'; market.recentTrades=20; market.recentTradesObservedAtMs=now; market.occurrenceTimeMs=now+4*60*60*1000;
  const first=await authority.resolveEvent({eventTicker:event,quotes:[market],now,allowSimulationActivityClock:true,minimumElapsedMs:60*60*1000,forceFresh:true});
  now+=11*60*1000; market.recentTradesObservedAtMs=now;
  const reset=await authority.resolveEvent({eventTicker:event,quotes:[market],priorState:first,now,allowSimulationActivityClock:true,minimumElapsedMs:60*60*1000,forceFresh:true});
  assert.equal(reset.phase,'UNKNOWN');
  assert.equal(reset.simulationActivityStartMs,now,'a >10 minute evidence gap must restart the conservative lower bound');
  assert.equal(reset.simulationActivityEvidenceCount,1);
  assert.equal(reset.evidence.continuityBroken,true);
});

test('HF6 GCA2 explicit official pregame evidence outranks and blocks the SIMULATION observed-activity fallback',async()=>{
  const now=1_800_000_000_000;
  const event='HF6-SIM-PREGAME-EV';
  const authority=new GameClockAuthority({kalshi:{
    async getMilestonesForEvent(){return[{id:'hf6-pre',category:'Sports',type:'tennis_match',primary_event_tickers:[event],related_event_tickers:[event]}];},
    async getLiveData(){return{milestone_id:'hf6-pre',details:{status:'scheduled'}};},
    async getGameStats(){return null;},
  },now:()=>now});
  const market=q('HF6-SIM-PREGAME',88,89,event); market.liveStatus='live'; market.recentTrades=250; market.recentTradesObservedAtMs=now; market.occurrenceTimeMs=now+3*60*60*1000;
  const state=await authority.resolveEvent({eventTicker:event,quotes:[market],now,allowSimulationActivityClock:true,minimumElapsedMs:0,forceFresh:true});
  assert.equal(state.phase,'UNKNOWN');
  assert.equal(state.reason,'official_live_data_pregame');
  assert.equal(state.entryAuthorized,false);
});

test('HF6 GCA2 coalesces concurrent force-fresh milestone and live-data lookups for the same exact event',async()=>{
  const now=1_800_000_000_000;
  const event='HF6-SINGLE-FLIGHT-EV';
  let milestoneCalls=0; let liveCalls=0;
  const authority=new GameClockAuthority({kalshi:{
    async getMilestonesForEvent(){milestoneCalls+=1;await new Promise((r)=>setTimeout(r,10));return[{id:'hf6-live',category:'Sports',type:'tennis_match',primary_event_tickers:[event],related_event_tickers:[event]}];},
    async getLiveData(){liveCalls+=1;await new Promise((r)=>setTimeout(r,10));return{milestone_id:'hf6-live',details:{status:'in_progress'}};},
    async getGameStats(){return null;},
  },now:()=>now});
  const market=q('HF6-SINGLE-FLIGHT',88,89,event); market.liveStatus='live'; market.occurrenceTimeMs=now+60*60000;
  const states=await Promise.all(Array.from({length:12},()=>authority.resolveEvent({eventTicker:event,quotes:[market],now,forceFresh:true})));
  assert.equal(states.every((x)=>x.phase==='CONFIRMED'&&x.entryAuthorized),true);
  assert.equal(milestoneCalls,1);
  assert.equal(liveCalls,1);
  assert.equal(authority.resourceSnapshot().milestoneLookupsInFlight,0);
  assert.equal(authority.resourceSnapshot().liveLookupsInFlight,0);
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
  await engine.patchSettings({minGameMinutes:27,maxGameMinutes:90});
  const persistedWindow=await db.loadSettings(originalSettings());
  assert.equal(persistedWindow.minGameMinutes,27);
  assert.equal(persistedWindow.maxGameMinutes,90);
  await engine.patchSettings({maxGameMinutes:0});
  assert.equal((await db.loadSettings(originalSettings())).maxGameMinutes,0,'zero must explicitly disable the maximum for backward-compatible deployments');
  await assert.rejects(()=>engine.patchSettings({minGameMinutes:-1}),/non-negative integer/);
  await assert.rejects(()=>engine.patchSettings({minGameMinutes:2.5}),/non-negative integer/);
  await assert.rejects(()=>engine.patchSettings({maxGameMinutes:-1}),/non-negative integer/);
  await assert.rejects(()=>engine.patchSettings({maxGameMinutes:2.5}),/non-negative integer/);
  await assert.rejects(()=>engine.patchSettings({minGameMinutes:40,maxGameMinutes:39}),/greater than or equal to minGameMinutes/);
  await engine.patchSettings({atomicThunderGreenTriggerCents:2});
  const persistedAtomic=await db.loadSettings(originalSettings());
  assert.equal(persistedAtomic.atomicThunderGreenTriggerCents,2);
  await assert.rejects(()=>engine.patchSettings({atomicThunderGreenTriggerCents:0}),/integer from 1 to 99/);
  await assert.rejects(()=>engine.patchSettings({atomicThunderGreenTriggerCents:2.5}),/integer/);
  await assert.rejects(()=>engine.patchSettings({atomicThunderFirstPatternExamSeconds:30}),/Unknown or retired setting/);
  const dbSource=await readFile(resolve(root,'src/db.mjs'),'utf8');
  assert.ok(dbSource.includes('game_start_time_ms=excluded.game_start_time_ms'));
  assert.ok(dbSource.includes('game_clock_state=excluded.game_clock_state'));
  assert.ok(dbSource.includes('create table if not exists sag_game_clock_authority'));
  assert.ok(dbSource.includes('async upsertGameClockState'));
  assert.equal(dbSource.includes('game_start_time_ms=coalesce(sag_trackers.game_start_time_ms,excluded.game_start_time_ms)'),false);
});

test('R45 preserves durable Guard state machines while the Mega UI renders unified profit/loss guard states plus Aurora',async()=>{const {readFile}=await import('node:fs/promises');const app=await readFile(new URL('../public/app.js',import.meta.url),'utf8');const pg=await readFile(new URL('../src/profitGuard.mjs',import.meta.url),'utf8');assert.ok(app.includes('renderInfinity'));assert.ok(app.includes('renderAurora'));assert.ok(pg.includes('U-SG1'));assert.ok(pg.includes('infinityBreak'));assert.ok(pg.includes('auroraDamageControlPercent'));});

test('future Hunter concepts cannot bypass the shared Minimum/Maximum Minutes In-Game policy',async()=>{
  const db=memoryDb();
  const s=settings({minGameMinutes:20,maxGameMinutes:90,maxEntriesPerTrade:8,hunterCooldownMinutes:0});
  const st=strategyFor(s,db);
  const early=q('FUTURE',88,89,'FUTURE-EV'); early.gameStartTimeMs=Date.now()-5*60000; early.gameClockState=confirmedClock('FUTURE-EV',early.gameStartTimeMs);
  assert.equal(await st.hunterEntryPolicy('Future Hunter',early),false);
  assert.equal(db.audits.at(-1).event,'hunter_min_game_minutes_blocked');
  const late=q('FUTURE-LATE',88,89,'FUTURE-LATE-EV'); late.gameStartTimeMs=Date.now()-95*60000; late.gameClockState=confirmedClock('FUTURE-LATE-EV',late.gameStartTimeMs);
  assert.equal(await st.hunterEntryPolicy('Future Hunter',late),false);
  assert.equal(db.audits.at(-1).event,'hunter_max_game_minutes_blocked');
});


test('Recovery may reuse only an R17 GCA1 source snapshot while all legacy timestamp-only stops remain closed',async()=>{
  const now=Date.now();
  const start=now-30*60000;
  const r17Loss=row({id:'r17-loss',conceptName:'Momentum Hunter',ticker:'RR',eventTicker:'RREV',status:'closed',closeReason:'hard_stop_loss',exitPriceCents:70,closedAtMs:now-60000,remainingCount:0,gameStartTimeMs:start,entryConfig:{release:RELEASE,sharedHunterLimits:{minGameMinutes:20},gameClockAuthority:confirmedClock('RREV',start)}});
  const db=memoryDb([r17Loss]);
  const s=settings({minGameMinutes:20,momentumHunterEnabled:false,waveSurferEnabled:false,recoveryHunterEnabled:true,recoveryBaseStakeCents:10000,recoveryMinReboundCents:5,recoveryMinEntryCents:76,recoveryMaxEntryCents:94,startingCapitalCents:10_000_000});
  const st=strategyFor(s,db);
  const rq=q('RR',75,76,'RREV'); rq.gameStartTimeMs=null; rq.gameClockState={};
  const made=await st.evaluateRecovery(new Map([['RR',rq]]),{legacyCompatibility:true});
  assert.equal(made.length,1,'R17 source authority should remain reusable for Recovery when current tracker time is unavailable');

  const legacy=row({id:'legacy-loss',conceptName:'Momentum Hunter',ticker:'LR',eventTicker:'LREV',status:'closed',closeReason:'hard_stop_loss',exitPriceCents:70,closedAtMs:now-60000,remainingCount:0,gameStartTimeMs:now-30*60000,entryConfig:{release:'SAGITTARIUS-R16-UPG1-ULTIMATE-PROFIT-GUARD-2026-08-19',sharedHunterLimits:{minGameMinutes:20}}});
  const db2=memoryDb([legacy]);
  const st2=strategyFor(s,db2);
  const lq=q('LR',75,76,'LREV'); lq.gameStartTimeMs=null; lq.gameClockState={};
  const blocked=await st2.evaluateRecovery(new Map([['LR',lq]]),{legacyCompatibility:true});
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
  const made=await st.createHunter('Wave Surfer',candidate,20000,35,{legacyCompatibility:true});
  assert.equal(made,null);
  assert.equal(refreshCalls,1);
  assert.equal(db.inserted.length,0);
  assert.ok(db.audits.some((x)=>x.event==='hunter_clock_revalidation_blocked'));
});

test('R47 final executable clock boundary vetoes a Hunter that crosses Maximum Minutes In-Game during book/doctrine work',async()=>{
  let fakeNow=1_800_000_000_000;
  const start=fakeNow-(40*60000-500);
  const event='MAX-CROSS-EV';
  const db=memoryDb();
  const s=settings({minGameMinutes:20,maxGameMinutes:40,simFillProbability:1,startingCapitalCents:10_000_000,waveSurferEnabled:true,waveMinEntryCents:86,waveMaxEntryCents:92,waveMinFeederFavorableMoveCents:8,waveMaxSpreadCents:3});
  const candidate=q('MAX-CROSS',89,90,event);candidate.gameStartTimeMs=start;candidate.gameClockState=confirmedClock(event,start);
  const market={
    async refreshTicker(){fakeNow+=1000;const fresh=q(candidate.ticker,89,90,event);fresh.gameStartTimeMs=start;fresh.gameClockState=candidate.gameClockState;fresh.status='active';fresh.result='';return fresh;},
    executableAsk(){return{filled:1000,full:true,avgCents:90,bestCents:90};},
  };
  const originalNow=Date.now;Date.now=()=>fakeNow;
  try{
    const st=new StrategyEngine({db,kalshi:{},market,learning:{},getSettings:()=>s,getLiveReady:()=>false,random:()=>0,
      refreshGameClock:async()=>({gameClockState:{...confirmedClock(event,start),entryAuthorized:true,evidenceObservedAtMs:fakeNow,lastCheckedAtMs:fakeNow,authorizationSource:'kalshi_live_data'},gameStartTimeMs:start,liveStatus:'live'})});
    const made=await st.createHunter('Wave Surfer',candidate,20000,0,{legacyCompatibility:true,sourceFeeder:'Pegasus',sourceTradeId:'P-MAX',sourceEntryConfig:{feeder:{minPriceCents:20,maxPriceCents:89,dropCents:1}},entryQualificationSnapshot:{version:'WAVE-Q1',feederId:'P-MAX',feederConcept:'Pegasus',feederEntryPriceCents:80,observedAtMs:fakeNow}});
    assert.equal(made,null);
    assert.equal(db.inserted.length,0,'crossing the maximum during execution work must veto before persistence/fill');
    assert.ok(db.audits.some((x)=>x.event==='hunter_clock_authorization_expired_before_execution'&&x.data?.reason==='maximum_game_time'));
  }finally{Date.now=originalNow;}
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

test('HF6 GCA2 forceFresh revalidates live data without hammering stable milestone identity metadata',async()=>{
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
  assert.equal(milestoneCalls,1,'stable milestone identity metadata is reused at the executable boundary to avoid per-candidate request storms');
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
    const made=await st.createHunter('Wave Surfer',candidate,20000,35,{legacyCompatibility:true});
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
  assert.equal(await noRefresh.createHunter('Momentum Hunter',structuredClone(candidate),20000,35,{legacyCompatibility:true}),null);
  assert.equal(db.audits.at(-1).event,'hunter_clock_refresh_unavailable');
  assert.equal(fillChecks,0);

  const db2=memoryDb();
  const stale=new StrategyEngine({db:db2,kalshi:{},market,learning:{},getSettings:()=>s,getLiveReady:()=>false,random:()=>0,
    refreshGameClock:async(qq)=>({gameClockState:{...qq.gameClockState,entryAuthorized:true,evidenceObservedAtMs:Date.now()-60_000,lastCheckedAtMs:Date.now(),authorizationSource:'kalshi_live_data'},gameStartTimeMs:qq.gameStartTimeMs,liveStatus:'live'})});
  assert.equal(await stale.createHunter('Momentum Hunter',structuredClone(candidate),20000,35,{legacyCompatibility:true}),null);
  assert.equal(db2.audits.at(-1).event,'hunter_clock_revalidation_blocked');
  assert.equal(fillChecks,0);
});


test('R45 migration preserves surviving controls while retired Golden/Dragon-Recovery runtime concepts are removed and cannot reactivate',async()=>{const C=await import('../src/config.mjs');const s=C.sanitizeRuntimeSettings({hunterStakeCents:7000,dragonRecoveryHunterEnabled:true,goldenDragonEnabled:true,goldenDragonHunterEnabled:true});assert.equal(s.momentumStakeCents,7000);assert.equal(Object.hasOwn(s,'dragonRecoveryHunterEnabled'),false);assert.equal(Object.hasOwn(s,'goldenDragonEnabled'),false);assert.equal(Object.hasOwn(s,'goldenDragonHunterEnabled'),false);});

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
  const made=await st.createHunter('Wave Surfer',candidate,20000,35,{legacyCompatibility:true,
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

test('R61-HF1 Aurora 15 percent write is PostgreSQL-readback verified and survives a reload exactly',async()=>{
  const db=runtimeDb(settings({auroraDamageControlPercent:7}));
  db.audit=async()=>{};
  const engine=Object.create(SagittariusEngine.prototype);
  engine.settings=settings({auroraDamageControlPercent:7});
  engine.db=db;
  engine.settingsPersistence={version:'SETTINGS-PERSISTENCE-R1',lastVerifiedAtMs:0,lastKeys:[],lastValues:{},lastError:null};
  engine.invalidateStateSnapshot=()=>{};
  engine.requestScan=()=>{};
  engine.feederPriorityTickers=new Set();engine.recoveryPriorityTickers=new Set();engine.crashPriorityTickers=new Set();
  engine.refreshFeederPriorityTickers=async()=>engine.feederPriorityTickers;engine.refreshRecoveryPriorityTickers=async()=>engine.recoveryPriorityTickers;engine.refreshCrashPriorityTickers=()=>engine.crashPriorityTickers;
  await engine.patchSettings({auroraDamageControlPercent:15});
  const persisted=await db.loadSettings(originalSettings());
  assert.equal(engine.settings.auroraDamageControlPercent,15);
  assert.equal(persisted.auroraDamageControlPercent,15);
  assert.equal(engine.settingsPersistence.lastError,null);
  assert.deepEqual(engine.settingsPersistence.lastKeys,['auroraDamageControlPercent']);
  assert.equal(engine.settingsPersistence.lastValues.auroraDamageControlPercent,15);
  assert.ok(engine.settingsPersistence.lastVerifiedAtMs>0);
});

test('R61-HF1 settings write fails closed when database readback does not match and runtime does not falsely report 15 percent',async()=>{
  const engine=Object.create(SagittariusEngine.prototype);
  engine.settings=settings({auroraDamageControlPercent:7});
  engine.settingsPersistence={version:'SETTINGS-PERSISTENCE-R1',lastVerifiedAtMs:0,lastKeys:[],lastValues:{},lastError:null};
  engine.invalidateStateSnapshot=()=>{};
  const audits=[];
  engine.db={
    async saveSettings(){},
    async loadSettings(){return settings({auroraDamageControlPercent:7});},
    async audit(level,event,data){audits.push({level,event,data});},
  };
  await assert.rejects(()=>engine.patchSettings({auroraDamageControlPercent:15}),/settings_persistence_verification_failed:auroraDamageControlPercent/);
  assert.equal(engine.settings.auroraDamageControlPercent,7,'runtime must not claim an unverified 15% write');
  assert.match(engine.settingsPersistence.lastError,/auroraDamageControlPercent/);
  assert.ok(audits.some(x=>x.event==='settings_persistence_verification_failed'));
});
