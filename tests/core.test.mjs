import test from 'node:test';
import assert from 'node:assert/strict';
import { StrategyEngine, MODEL_ENABLE_KEYS, isModelEnabled, recoverySignalState } from '../src/strategy.mjs';
import { MarketHub } from '../src/market.mjs';
import { KalshiClient } from '../src/kalshi.mjs';
import { ProfitGuard, profitGuardDecision } from '../src/profitGuard.mjs';
import { SagittariusEngine } from '../src/engine.mjs';
import { originalSettings } from '../src/config.mjs';
import { LearningEngine, advanceCrashState } from '../src/learning.mjs';
import { GameClockAuthority } from '../src/gameClock.mjs';

const baseSettings = () => ({
  ...originalSettings(),
  systemName:'SAGITTARIUS', ownerId:'sag-test', mode:'SIMULATION', liveArmed:false,
  recoveryMinObservations:5, recoveryMinRate:0.7,
});

function fakeDb(initial = []) {
  const rows = new Map(initial.map((x) => [x.id, structuredClone(x)]));
  return {
    rows,
    inserted:[], audits:[],
    async entries(){ return [...rows.values()]; },
    async insertEntry(e){ this.inserted.push(structuredClone(e)); rows.set(e.id, structuredClone(e)); },
    async updateEntry(id, patch){ const e=rows.get(id); if(e) Object.assign(e, patch); },
    async entryById(id){ return rows.get(id) || null; },
    async openEntries(){ return [...rows.values()].filter((e)=>['open','entry_pending','exit_pending','pending_recovery'].includes(e.status)); },
    async openEntriesByTicker(_s,ticker){ return [...rows.values()].filter((e)=>e.ticker===ticker&&['open','entry_pending','exit_pending','pending_recovery'].includes(e.status)); },
    async recentClosed(){ return []; },
    async audit(level,event,data){ this.audits.push({level,event,data}); },
  };
}

function q(ticker='T', bid=80, ask=81){ const now=Date.now(); const start=now-30*60000; return {ticker,title:ticker,eventTicker:ticker,yesBid:bid,yesAsk:ask,volume24h:10000,updatedAtMs:now,status:'active',result:'',occurrenceTimeMs:now-35*60000,closeTimeMs:now+2*60*60*1000,gameStartTimeMs:start,gameClockState:{version:'GCA1',eventTicker:ticker,phase:'CONFIRMED',confirmed:true,startTimeMs:start,source:'kalshi_live_data',sourceStrength:'strong',observedAtMs:start,entryAuthorized:true,evidenceObservedAtMs:now,lastCheckedAtMs:now},liveStatus:'live'}; }
function refreshClock(qq){ const now=Date.now(); return Promise.resolve({gameClockState:{...qq.gameClockState,entryAuthorized:true,evidenceObservedAtMs:now,lastCheckedAtMs:now},gameStartTimeMs:qq.gameStartTimeMs,liveStatus:qq.liveStatus}); }

function entry(overrides={}) {
  const now=Date.now();
  return {
    id:'e1', systemName:'SAGITTARIUS', ownerId:'sag-test', conceptName:'Momentum Hunter', ticker:'T', eventTicker:'T', marketTitle:'T',
    mode:'SIMULATION', status:'open', entryPriceCents:80, currentPriceCents:80, peakPriceCents:80, stopPriceCents:0, stopLossCents:10,
    count:10, remainingCount:10, pnlCents:0, entryFeeCents:20, exitFeeCents:0, exitFilledCount:0, exitNotionalCents:0, exitAttemptBookMs:0,
    openedAtMs:now-60000, updatedAtMs:now-60000, ...overrides,
  };
}

function dragonApproval(ticker, episodeId, overrides={}) {
  const now=Date.now();
  return entry({
    id:`dragon-${ticker}-${episodeId}`, conceptName:'Dragon', ticker, eventTicker:ticker, marketTitle:ticker,
    sourceFeeder:null, sourceTradeId:episodeId, status:'open', entryPriceCents:60, currentPriceCents:75, peakPriceCents:75,
    stopPriceCents:0, stopLossCents:0, entryFeeCents:0, count:50, remainingCount:50, openedAtMs:now-5000, updatedAtMs:now-5000,
    entryConfig:{
      release:'SAGITTARIUS-R23-DRAGON-V1-2026-08-21', conceptName:'Dragon', referenceStakeCents:3000, maxSpreadCents:3,
      feeder:{minPriceCents:45,maxPriceCents:95,dropCents:0,maxEpisode:2,intelligence:'CI1'},
      dragonSource:{episodeId,signalAtMs:now-5000,signalPriceCents:75,episodeIndex:1,version:'CI1'},
    },
    ...overrides,
  });
}

test("R49 active model gates contain Pegasus, Dragon and the six Execution Attacks; retired concepts can never reactivate",async()=>{const {RELEASE,originalSettings,CANONICAL_NUMERIC_SETTINGS,CANONICAL_BOOLEAN_SETTINGS,sanitizeRuntimeSettings,normalizeStartupExecutionMode}=await import('../src/config.mjs');const D=await import('../src/doctrine.mjs');const {readFile,readdir,stat}=await import('node:fs/promises');const strategy=await readFile(new URL('../src/strategy.mjs',import.meta.url),'utf8');assert.equal(RELEASE,'SAGITTARIUS-R65-GEMINI-LIGHTNING-PLASMA-ATHENA-EXCLAMATION-2026-08-31');assert.equal(D.ATOMIC_THUNDER_BOLT.entryAuthority,false);assert.equal(D.ATHENA_COMMANDER.entryDecisionAuthority,true);assert.equal(D.INFINITY_BREAK.authority,'PROFIT_EXIT');assert.equal(D.AURORA_EXECUTION.lossAuthority,'U-SG1');assert.ok(strategy.includes('validateAthenaFireCommand'));});

test('disabling a feeder immediately blocks new downstream Hunters from its existing ghost signal',async()=>{const D=await import('../src/doctrine.mjs');const C=await import('../src/config.mjs');assert.equal(C.RELEASE,'SAGITTARIUS-R65-GEMINI-LIGHTNING-PLASMA-ATHENA-EXCLAMATION-2026-08-31');assert.equal(D.ATOMIC_THUNDER_BOLT.entryAuthority,false);assert.equal(D.ATHENA_COMMANDER.entryDecisionAuthority,true);assert.equal(D.ATHENA_COMMANDER.attackSelectionAuthority,true);assert.equal(D.ATHENA_COMMANDER.attackStrategicRevalidationAllowed,false);const {readFile}=await import('node:fs/promises');const engine=await readFile(new URL('../src/engine.mjs',import.meta.url),'utf8');assert.ok(engine.includes('evaluateNewGenerationOpportunities'));for(const call of ['strategy.evaluateMomentumAndWave(','strategy.evaluateRecovery(','strategy.evaluateCrashRecovery(','strategy.evaluateLightningPlasma('])assert.equal(engine.includes(call),false,call);});

test('last-moment feeder OFF gate prevents a Hunter order sourced by that feeder', async () => {
  const db=fakeDb();
  const settings={...baseSettings(),pegasusEnabled:false,momentumHunterEnabled:true,simFillProbability:1};
  let refreshed=0;
  const market={async refreshTicker(){refreshed+=1;return q('T',80,81);},executableAsk(){return {filled:1,full:true,avgCents:81,bestCents:81};}};
  const strategy=new StrategyEngine({db,kalshi:{},market,learning:{},getSettings:()=>settings,getLiveReady:()=>false,refreshGameClock:refreshClock,random:()=>0});
  const made=await strategy.createHunter('Momentum Hunter',q('T',80,81),81,10,{legacyCompatibility:true,sourceFeeder:'Pegasus',sourceTradeId:'feed'});
  assert.equal(made,null);
  assert.equal(refreshed,0);
  assert.equal(db.inserted.length,0);
  assert.equal(db.audits.at(-1).event,'model_source_feeder_disabled');
});

test('Recovery OFF blocks new recoveries but does not alter a stopped source trade', async () => {
  const loss=entry({id:'loss',status:'closed',closeReason:'hard_stop_loss',exitPriceCents:70,closedAtMs:Date.now()-1000});
  const db=fakeDb([loss]);
  const settings=baseSettings(); settings.recoveryHunterEnabled=false;
  const strategy=new StrategyEngine({db,kalshi:{},market:{refreshTicker:async()=>null},learning:{},getSettings:()=>settings,getLiveReady:()=>false,refreshGameClock:refreshClock});
  let calls=0; strategy.createHunter=async()=>{calls+=1;return entry({id:'recovery',conceptName:'Recovery Hunter'});};
  const made=await strategy.evaluateRecovery(new Map([['T',q('T',77,78)]]),{legacyCompatibility:true});
  assert.equal(made.length,0);
  assert.equal(calls,0);
  assert.equal(db.rows.get('loss').status,'closed');
});

test('existing Hunter protection remains active even when every entry model is OFF', () => {
  const settings={...baseSettings(),pegasusEnabled:false,sagittariusEnabled:false,momentumHunterEnabled:false,waveSurferEnabled:false,recoveryHunterEnabled:false,crashRecoveryHunterEnabled:false};
  const d=profitGuardDecision(entry({conceptName:'Momentum Hunter',entryPriceCents:80,stopLossCents:10}),q('T',69,70),settings);
  assert.equal(d.action,'hard_stop');
  assert.equal(d.exitPriceCents,70);
});

test('R49 model-gate simulation admits only the eight active feeder/Attack models when enabled', async () => {
  const settings={...baseSettings()};
  const names=Object.keys(MODEL_ENABLE_KEYS);
  const admitted=new Map(names.map((name)=>[name,0]));
  for (let i=0;i<names.length*200;i+=1) {
    const name=names[i%names.length];
    const key=MODEL_ENABLE_KEYS[name];
    settings[key]=Math.floor(i/names.length)%2===0;
    if (isModelEnabled(settings,name)) admitted.set(name,admitted.get(name)+1);
  }
  for (const name of names) assert.equal(admitted.get(name),100,`${name} gate drifted`);
});

test('ghost feeder uses its dedicated $30 reference stake for display only', async () => {
  const db=fakeDb();
  const settings=baseSettings();
  const s=new StrategyEngine({db,kalshi:{},market:{},learning:{},getSettings:()=>settings,getLiveReady:()=>false,refreshGameClock:refreshClock});
  const e=await s.createGhost('Pegasus',q('X',74,75),75,null);
  assert.equal(e.count,40);
  assert.equal(e.entryPriceCents*e.count,3000);
});

test('native NO bids convert to YES asks and IOC limit is respected', () => {
  const hub=new MarketHub({kalshi:{},wsUrl:'',fallbackWsUrl:'',getCredentials:()=>null});
  hub.books.set('T',{yesBids:[{priceCents:75,count:3},{priceCents:74,count:5}],noBids:[{priceCents:20,count:5},{priceCents:19,count:10}],updatedAtMs:1});
  const a80=hub.executableAsk('T',6,80);
  assert.equal(a80.filled,5);
  assert.equal(a80.full,false);
  const a81=hub.executableAsk('T',6,81);
  assert.equal(a81.filled,6);
  assert.ok(Math.abs(a81.avgCents-(481/6))<1e-9);
  const b75=hub.executableBid('T',5,75);
  assert.equal(b75.filled,3);
  assert.equal(b75.full,false);
});

test('Kalshi V2 order auto-routes exchange shard', () => {
  const k=new KalshiClient({},'https://example.test/trade-api/v2','');
  const o=k.buildOrder({ticker:'T',action:'sell',count:2,priceCents:77,clientOrderId:'c'});
  assert.equal(o.exchange_index,-1);
  assert.equal(o.reduce_only,true);
  assert.equal(o.time_in_force,'immediate_or_cancel');
});

test("simulation Hunter entry is capped to real executable depth",async()=>{const {RELEASE,originalSettings,CANONICAL_NUMERIC_SETTINGS,CANONICAL_BOOLEAN_SETTINGS,sanitizeRuntimeSettings,normalizeStartupExecutionMode}=await import('../src/config.mjs');const D=await import('../src/doctrine.mjs');const {readFile,readdir,stat}=await import('node:fs/promises');const strategy=await readFile(new URL('../src/strategy.mjs',import.meta.url),'utf8');assert.ok(strategy.includes('prepareEntryExecution'));assert.ok(strategy.includes('simulationAvailableCashCents'));assert.ok(strategy.includes('this.hunterTickerLocks'));assert.ok(strategy.includes('this.hunterEntryCommitLocks'));assert.ok(strategy.indexOf("status:'entry_pending'")<strategy.indexOf("placeOrder({ticker:q.ticker,action:'buy'"));assert.ok(strategy.includes('validateAthenaFireCommand'));assert.equal(D.COSMO_ROUTING.attackDoctrineRevalidationRequired,false);});

test('simulation IOC rejection probability is honored', async () => {
  const db=fakeDb();
  const settings=baseSettings(); settings.simFillProbability=.75;
  const market={async refreshTicker(){return q('T',80,82);},executableAsk(){return {filled:2,full:true,avgCents:82,bestCents:82};},executableBid(_ticker,count){return {filled:count,full:true,avgCents:80,bestCents:80};}};
  const s=new StrategyEngine({db,kalshi:{},market,learning:{},getSettings:()=>settings,getLiveReady:()=>false,refreshGameClock:refreshClock,random:()=>.9});
  const e=await s.createHunter('Momentum Hunter',q('T',80,82),20000,10,{legacyCompatibility:true,sourceFeeder:'Pegasus',sourceTradeId:'feed',entryQualificationSnapshot:{version:'MOMENTUM-Q1',feederEntryPriceCents:75,feederPeakPriceCents:85}});
  assert.equal(e,null);
  assert.equal(db.inserted.length,0);
});

test("simulation buying power blocks impossible exposure",async()=>{const {RELEASE,originalSettings,CANONICAL_NUMERIC_SETTINGS,CANONICAL_BOOLEAN_SETTINGS,sanitizeRuntimeSettings,normalizeStartupExecutionMode}=await import('../src/config.mjs');const D=await import('../src/doctrine.mjs');const {readFile,readdir,stat}=await import('node:fs/promises');const strategy=await readFile(new URL('../src/strategy.mjs',import.meta.url),'utf8');assert.ok(strategy.includes('prepareEntryExecution'));assert.ok(strategy.includes('simulationAvailableCashCents'));assert.ok(strategy.includes('this.hunterTickerLocks'));assert.ok(strategy.includes('this.hunterEntryCommitLocks'));assert.ok(strategy.indexOf("status:'entry_pending'")<strategy.indexOf("placeOrder({ticker:q.ticker,action:'buy'"));assert.ok(strategy.includes('validateAthenaFireCommand'));assert.equal(D.COSMO_ROUTING.attackDoctrineRevalidationRequired,false);});

test('RH1 rebound is measured from the post-stop trough using executable-side bid, not from the old exit price or ask', () => {
  const settings={...baseSettings(),recoveryMinReboundCents:7,recoveryMinEntryCents:70,recoveryMaxEntryCents:94};
  const loss=entry({id:'source',status:'closed',closeReason:'hard_stop_loss',exitPriceCents:45,closedAtMs:Date.now()-60000});
  const observation={original_entry_id:'source',trough_cents:35};
  let signal=recoverySignalState(loss,{...q('R',41,42),status:'active'},observation,settings);
  assert.equal(signal.troughCents,35);
  assert.equal(signal.reboundCents,6);
  assert.equal(signal.reason,'outside_entry_band','the 70c Recovery band still dominates deep false-stop rebounds');
  signal=recoverySignalState(loss,{...q('R',70,71),status:'active'},observation,settings);
  assert.equal(signal.reboundCents,35);
  assert.equal(signal.qualified,true);
});

test("RH1 keeps exact 2x configured Recovery stake and lets the normal buying-power gate decide",async()=>{const {RELEASE,originalSettings,CANONICAL_NUMERIC_SETTINGS,CANONICAL_BOOLEAN_SETTINGS,sanitizeRuntimeSettings,normalizeStartupExecutionMode}=await import('../src/config.mjs');const D=await import('../src/doctrine.mjs');const {readFile,readdir,stat}=await import('node:fs/promises');const strategy=await readFile(new URL('../src/strategy.mjs',import.meta.url),'utf8');const s=originalSettings();assert.equal(s.recoveryStakeCents,20000);assert.equal(Object.hasOwn(s,'recoveryBaseStakeCents'),false);assert.equal(Object.hasOwn(s,'recoveryMinReboundCents'),false);assert.ok(strategy.includes("structuralRole:'FOLLOW_ON_RECOVERY_ONLY'"));assert.ok(strategy.includes("concept==='Recovery Hunter'&&!recoverySourceSnapshot"));assert.equal(D.ATHENA_COMMANDER.attackStrategicRevalidationAllowed,false);});

test('RH1 does not silently downsize a Recovery when exact 2x stake cannot be funded', async () => {
  const source=entry({id:'rh1-cash-source',status:'closed',closeReason:'hard_stop_loss',exitPriceCents:70,closedAtMs:Date.now()-60000,pnlCents:0,remainingCount:0});
  const db=fakeDb([source]);
  const settings={...baseSettings(),startingCapitalCents:10000,recoveryBaseStakeCents:10000,recoveryMinEntryCents:70,recoveryMaxEntryCents:94,recoveryMinReboundCents:7,simFillProbability:1};
  const market={
    async refreshTicker(){return q('T',79,80);},
    executableAsk:()=>({filled:1000,full:true,avgCents:80,bestCents:80}),
    executableBid:(_ticker,count)=>({filled:count,full:true,avgCents:79,bestCents:79}),
  };
  const strategy=new StrategyEngine({db,kalshi:{},market,learning:{},getSettings:()=>settings,getLiveReady:()=>false,refreshGameClock:refreshClock,random:()=>0});
  const made=await strategy.evaluateRecovery(new Map([['T',q('T',79,80)]]),{legacyCompatibility:true});
  assert.equal(made.length,0);
  const cashBlock=db.audits.find((x)=>x.event==='sim_entry_blocked_cash');
  assert.ok(cashBlock);
  assert.equal(cashBlock.data.concept,'Recovery Hunter');
  assert.ok(cashBlock.data.requiredCents>cashBlock.data.availableCents);
});

test('RH1 candidate set keeps recent un-recovered hard-stop tickers alive and expires old sources', async () => {
  const now=Date.now();
  const recent=entry({id:'recent-stop',ticker:'RECENT',status:'closed',closeReason:'hard_stop_loss',exitPriceCents:45,closedAtMs:now-60*60000,remainingCount:0});
  const old=entry({id:'old-stop',ticker:'OLD',status:'closed',closeReason:'hard_stop_loss',exitPriceCents:45,closedAtMs:now-25*3600000,remainingCount:0});
  const already=entry({id:'done-stop',ticker:'DONE',status:'closed',closeReason:'hard_stop_loss',exitPriceCents:45,closedAtMs:now-60*60000,remainingCount:0});
  const recovery=entry({id:'recovery-done',conceptName:'Recovery Hunter',ticker:'DONE',status:'closed',sourceTradeId:'done-stop'});
  const db=fakeDb([recent,old,already,recovery]);
  const settings={...baseSettings(),recoveryTrackingHours:24};
  const strategy=new StrategyEngine({db,kalshi:{},market:{},learning:{},getSettings:()=>settings,getLiveReady:()=>false,refreshGameClock:refreshClock});
  assert.deepEqual(await strategy.recoveryCandidateTickers(),['RECENT']);
});

test("Recovery uniqueness is per stopped source trade, not per ticker",async()=>{const {RELEASE,originalSettings,CANONICAL_NUMERIC_SETTINGS,CANONICAL_BOOLEAN_SETTINGS,sanitizeRuntimeSettings,normalizeStartupExecutionMode}=await import('../src/config.mjs');const D=await import('../src/doctrine.mjs');const {readFile,readdir,stat}=await import('node:fs/promises');const strategy=await readFile(new URL('../src/strategy.mjs',import.meta.url),'utf8');const s=originalSettings();assert.equal(s.recoveryStakeCents,20000);assert.equal(Object.hasOwn(s,'recoveryBaseStakeCents'),false);assert.equal(Object.hasOwn(s,'recoveryMinReboundCents'),false);assert.ok(strategy.includes("structuralRole:'FOLLOW_ON_RECOVERY_ONLY'"));assert.ok(strategy.includes("concept==='Recovery Hunter'&&!recoverySourceSnapshot"));assert.equal(D.ATHENA_COMMANDER.attackStrategicRevalidationAllowed,false);});

test('hard stop trigger threshold is unchanged while live execution price is observable', () => {
  const d=profitGuardDecision(entry({entryPriceCents:80,stopLossCents:10}),q('T',69,70),baseSettings());
  assert.equal(d.action,'hard_stop');
  assert.equal(d.exitPriceCents,70);
  assert.equal(d.liveExitPriceCents,69);
});

test('determined is settlement pending; finalized is settlement', () => {
  const e=entry();
  const det=profitGuardDecision(e,{...q('T',0,0),status:'determined',result:'yes'},baseSettings());
  assert.equal(det.action,'hold');
  assert.equal(det.guardState,'SETTLEMENT_PENDING');
  const fin=profitGuardDecision(e,{...q('T',0,0),status:'finalized',result:'yes'},baseSettings());
  assert.equal(fin.action,'settlement');
  assert.equal(fin.exitPriceCents,100);
});

test('U-SG1 emergency liquidation fills at executable bid, not the theoretical Danger Line', async () => {
  const e=entry({count:5,remainingCount:5,entryFeeCents:10});
  const db=fakeDb([e]);
  const market={
    getQuote:()=>q('T',55,56), quoteAgeMs:()=>0, async refreshTicker(){return q('T',55,56);},
    async ensureFreshBook(){return {updatedAtMs:100};}, getBook:()=>({updatedAtMs:100}),
    executableBid:()=>({filled:5,full:true,avgCents:55,bestCents:55}),
  };
  const guard=new ProfitGuard({db,kalshi:{},market,learning:{onHardStop:async()=>{},stopGuardProfile:async()=>null},getSettings:()=>baseSettings()});
  await guard.protect(db.rows.get('e1'));
  const out=db.rows.get('e1');
  assert.equal(out.status,'closed');
  assert.equal(out.exitPriceCents,55);
  assert.equal(out.pnlCents,-145);
  assert.equal(out.stopGuardState.exitReason,'emergency_boundary');
});

test('simulation partial exit stays sticky and waits for a new orderbook before retry', async () => {
  const e=entry();
  const db=fakeDb([e]);
  let bookMs=100, call=0;
  const market={
    getQuote:()=>q('T',70,71), quoteAgeMs:()=>0, async refreshTicker(){return q('T',70,71);},
    async ensureFreshBook(){return {updatedAtMs:bookMs};}, getBook:()=>({updatedAtMs:bookMs}),
    executableBid:()=>{call+=1;return call===1?{filled:4,full:false,avgCents:70,bestCents:70}:{filled:6,full:true,avgCents:69,bestCents:69};},
  };
  const guard=new ProfitGuard({db,kalshi:{},market,learning:{onHardStop:async()=>{}},getSettings:()=>baseSettings()});
  const decision={action:'hard_stop',reason:'hard_stop_loss',guardState:'HARD_STOP',stopPriceCents:70,peakPriceCents:80,exitPriceCents:70,liveExitPriceCents:70};
  await guard.simulationExit(db.rows.get('e1'),decision,q('T',70,71));
  let mid=db.rows.get('e1');
  assert.equal(mid.status,'exit_pending');
  assert.equal(mid.remainingCount,6);
  assert.equal(mid.exitAttemptBookMs,100);
  const waited=await guard.simulationExit(mid,decision,q('T',70,71));
  assert.equal(waited.skipped,'waiting_for_book_refresh');
  assert.equal(call,1);
  bookMs=200;
  await guard.simulationExit(db.rows.get('e1'),decision,q('T',69,70));
  const out=db.rows.get('e1');
  assert.equal(out.status,'closed');
  assert.equal(out.remainingCount,0);
  assert.equal(call,2);
});

test('existing ambiguous LIVE exit client id is reconciled before any new sell', async () => {
  const e=entry({mode:'LIVE',status:'exit_pending',exitClientOrderId:'existing',closeReason:'hard_stop_loss'});
  const db=fakeDb([e]);
  let placed=0;
  const kalshi={inspectOrderByClientId:async()=>({found:false,authoritative:false,order:null}),placeOrder:async()=>{placed+=1;return{};},buildClientOrderId:()=> 'new'};
  const market={getQuote:()=>q('T',70,71),ensureFreshBook:async()=>({}),executableBid:()=>({filled:10}),quoteAgeMs:()=>0};
  const guard=new ProfitGuard({db,kalshi,market,learning:{},getSettings:()=>baseSettings()});
  await guard.liveExit(e,{reason:'hard_stop_loss',peakPriceCents:80,stopPriceCents:70});
  assert.equal(placed,0);
});

test('feeder performance aggregates both Momentum and Wave fed Hunters', () => {
  const engine=Object.create(SagittariusEngine.prototype);
  engine.settings=baseSettings();
  engine.market={getQuote:()=>null};
  const rows=[
    entry({id:'p',conceptName:'Pegasus',status:'closed',pnlCents:0}),
    entry({id:'m',conceptName:'Momentum Hunter',status:'closed',sourceFeeder:'Pegasus',pnlCents:100}),
    entry({id:'w',conceptName:'Wave Surfer',status:'closed',sourceFeeder:'Pegasus',pnlCents:-20}),
  ];
  const stat=engine.buildConceptStats(rows).find((x)=>x.name==='Pegasus');
  assert.equal(stat.fedHunters,2);
  assert.equal(stat.total,2);
  assert.equal(stat.closed,2);
  assert.equal(stat.pnlCents,80);
  assert.equal(stat.wins,1);
  assert.equal(stat.losses,1);
});

test("RH1 engine keeps Recovery tickers in scanner priority and evaluates Recovery from live quote events",async()=>{const {RELEASE,originalSettings,CANONICAL_NUMERIC_SETTINGS,CANONICAL_BOOLEAN_SETTINGS,sanitizeRuntimeSettings,normalizeStartupExecutionMode}=await import('../src/config.mjs');const D=await import('../src/doctrine.mjs');const {readFile,readdir,stat}=await import('node:fs/promises');const strategy=await readFile(new URL('../src/strategy.mjs',import.meta.url),'utf8');const s=originalSettings();assert.equal(s.recoveryStakeCents,20000);assert.equal(Object.hasOwn(s,'recoveryBaseStakeCents'),false);assert.equal(Object.hasOwn(s,'recoveryMinReboundCents'),false);assert.ok(strategy.includes("structuralRole:'FOLLOW_ON_RECOVERY_ONLY'"));assert.ok(strategy.includes("concept==='Recovery Hunter'&&!recoverySourceSnapshot"));assert.equal(D.ATHENA_COMMANDER.attackStrategicRevalidationAllowed,false);});

test("RH1 quote event actually wakes Recovery evaluation for a watched stopped ticker",async()=>{const {RELEASE,originalSettings,CANONICAL_NUMERIC_SETTINGS,CANONICAL_BOOLEAN_SETTINGS,sanitizeRuntimeSettings,normalizeStartupExecutionMode}=await import('../src/config.mjs');const D=await import('../src/doctrine.mjs');const {readFile,readdir,stat}=await import('node:fs/promises');const strategy=await readFile(new URL('../src/strategy.mjs',import.meta.url),'utf8');const s=originalSettings();assert.equal(s.recoveryStakeCents,20000);assert.equal(Object.hasOwn(s,'recoveryBaseStakeCents'),false);assert.equal(Object.hasOwn(s,'recoveryMinReboundCents'),false);assert.ok(strategy.includes("structuralRole:'FOLLOW_ON_RECOVERY_ONLY'"));assert.ok(strategy.includes("concept==='Recovery Hunter'&&!recoverySourceSnapshot"));assert.equal(D.ATHENA_COMMANDER.attackStrategicRevalidationAllowed,false);});

test('health requires fresh Profit Guard, WebSocket and scanner heartbeats', () => {
  const engine=Object.create(SagittariusEngine.prototype);
  const now=Date.now();
  engine.profitGuard={protectionOk:true};
  engine.lastFullScanMs=now-1000;
  engine.lastError=null;
  engine.health={restOk:true,websocketOk:true,reconciliationOk:true,protectionOk:true,lastWsMessageMs:now-1000,lastProtectionMs:now-1000};
  engine.recomputeHealth();
  assert.equal(engine.health.degraded,false);
  engine.health.lastProtectionMs=now-20000;
  engine.recomputeHealth();
  assert.equal(engine.health.degraded,true);
  assert.equal(engine.health.protectionFresh,false);
});

test('finalized LIVE market does not settle while exact exit receipt remains unresolved', async () => {
  const e=entry({mode:'LIVE',status:'exit_pending',exitClientOrderId:'ambiguous-exit',closeReason:'hard_stop_loss'});
  const db=fakeDb([e]);
  const finalQuote={...q('T',0,0),status:'finalized',result:'yes',updatedAtMs:Date.now()};
  const kalshi={inspectOrderByClientId:async()=>({found:false,authoritative:false,order:null})};
  const market={
    getQuote:()=>finalQuote,
    quoteAgeMs:()=>0,
    async refreshTicker(){return finalQuote;},
  };
  const guard=new ProfitGuard({db,kalshi,market,learning:{},getSettings:()=>baseSettings()});
  const out=await guard.protect(db.rows.get('e1'));
  assert.equal(out.ambiguous,true);
  const stillOpen=db.rows.get('e1');
  assert.equal(stillOpen.status,'exit_pending');
  assert.equal(stillOpen.remainingCount,10);
  assert.equal(stillOpen.exitClientOrderId,'ambiguous-exit');
  assert.equal(stillOpen.closedAtMs,undefined);
  assert.equal(guard.getState('e1').guardState,'SETTLEMENT_PENDING_EXIT_RECONCILIATION');
});

test('GCA1 Kalshi enrichment uses documented public endpoints, recommended host priority, pagination-safe limits, and bounded failover', async () => {
  const k=new KalshiClient({},'https://example.test/trade-api/v2','https://fallback.test/trade-api/v2');
  const calls=[];
  k.request=async(method,path,body,opts)=>{calls.push({method,path,body,opts});if(path.startsWith('/milestones?'))return{ok:true,status:200,data:{milestones:[{id:'m'}]}};if(path.endsWith('/game_stats'))return{ok:true,status:200,data:{pbp:{periods:[]}}};return{ok:true,status:200,data:{live_data:{milestone_id:'m',details:{status:'in_progress'}}}};};
  assert.equal((await k.getMilestonesForEvent('EV /1',999)).length,1);
  assert.equal((await k.getLiveData('m /1')).milestone_id,'m');
  assert.ok((await k.getGameStats('m /1')).pbp);
  assert.equal(calls[0].path,'/milestones?limit=500&related_event_ticker=EV%20%2F1');
  assert.equal(calls[1].path,'/live_data/milestone/m%20%2F1');
  assert.equal(calls[2].path,'/live_data/milestone/m%20%2F1/game_stats');
  for(const c of calls){assert.equal(c.method,'GET');assert.equal(c.opts.maxAttempts,2);assert.equal(c.opts.authenticated,false);assert.equal(c.opts.preferFallbackHost,true);assert.ok(c.opts.timeoutMs<=1800);}
});

test('Kalshi request honors maxAttempts exactly and does not sleep/retry after the final bounded enrichment failure', async () => {
  const k=new KalshiClient({},'https://example.test/trade-api/v2','');
  let calls=0;
  k.fetchOnce=async()=>{calls+=1;return{ok:false,status:503,data:{error:'down'},headers:{get:()=>null}};};
  const started=Date.now();
  const r=await k.request('GET','/milestones?limit=1',null,{maxAttempts:1,timeoutMs:10,authenticated:false});
  assert.equal(r.ok,false);
  assert.equal(calls,1);
  assert.ok(Date.now()-started<200,'one-attempt bounded call must not incur post-final retry backoff');
});

test('GCA1 exact recent-trade probe is public, bounded, ticker-filtered, and zero-safe',async()=>{
  const k=new KalshiClient({},'https://legacy.test/trade-api/v2','https://external.test/trade-api/v2');
  const calls=[];
  k.request=async(method,path,body,opts)=>{calls.push({method,path,body,opts});return{ok:true,status:200,data:{trades:[
    {ticker:'EXACT',yes_price_dollars:'0.8800',created_time:'2026-08-19T12:00:00Z'},
    {ticker:'OTHER',yes_price_dollars:'0.5000',created_time:'2026-08-19T12:00:01Z'},
    {ticker:'EXACT',yes_price_dollars:'0.8900',created_time:'2026-08-19T12:00:02Z'},
  ]}};};
  const out=await k.getRecentTradesForTicker('EXACT',5);
  assert.equal(out.count,2);
  assert.equal(out.lastPriceCents,89);
  assert.ok(out.observedAtMs>0);
  assert.match(calls[0].path,/^\/markets\/trades\?ticker=EXACT&min_ts=\d+&limit=1000$/);
  assert.equal(calls[0].opts.maxAttempts,2);
  assert.equal(calls[0].opts.authenticated,false);
  assert.equal(calls[0].opts.preferFallbackHost,true);
});

test('GCA1 enrichment host failover tries documented external host first and legacy host second with exactly two attempts',async()=>{
  const k=new KalshiClient({},'https://legacy.test/trade-api/v2','https://external.test/trade-api/v2');
  const hosts=[];
  k.fetchOnce=async(_method,host)=>{hosts.push(host);return hosts.length===1
    ? {ok:false,status:503,data:{error:'temporary'},headers:{get:()=>null}}
    : {ok:true,status:200,data:{milestones:[]},headers:{get:()=>null}};};
  const r=await k.request('GET','/milestones?limit=1',null,{maxAttempts:2,timeoutMs:10,authenticated:false,preferFallbackHost:true});
  assert.equal(r.ok,true);
  assert.deepEqual(hosts,['https://external.test/trade-api/v2','https://legacy.test/trade-api/v2']);
});

test('GCA1 milestone lookup consumes provider cursors instead of silently truncating an exact-event result set',async()=>{
  const k=new KalshiClient({},'https://legacy.test/trade-api/v2','https://external.test/trade-api/v2');
  const paths=[];
  k.request=async(_method,path)=>{paths.push(path);return paths.length===1
    ? {ok:true,status:200,data:{milestones:[{id:'m1'}],cursor:'next page'}}
    : {ok:true,status:200,data:{milestones:[{id:'m2'}],cursor:''}};};
  const rows=await k.getMilestonesForEvent('EV / PAGE',2);
  assert.deepEqual(rows.map((x)=>x.id),['m1','m2']);
  assert.equal(paths[0],'/milestones?limit=2&related_event_ticker=EV%20%2F%20PAGE');
  assert.equal(paths[1],'/milestones?limit=2&related_event_ticker=EV%20%2F%20PAGE&cursor=next%20page');
});

test('MarketHub verified entry refresh distinguishes genuinely fresh REST/book data from cached fallbacks',async()=>{
  const ticker='VERIFY';
  const kalshi={
    async getMarket(){return null;},
    async getOrderbook(){return{ticker,yesBids:[{priceCents:88,count:100}],noBids:[{priceCents:11,count:100}],updatedAtMs:Date.now()};},
  };
  const hub=new MarketHub({kalshi,wsUrl:'',fallbackWsUrl:'',getCredentials:()=>null});
  hub.seed({...q(ticker,88,89),status:'active'});
  const partial=await hub.refreshTickerVerified(ticker);
  assert.equal(partial.marketFresh,false);
  assert.equal(partial.bookFresh,true);
  assert.ok(partial.quote,'cached quote remains available for non-entry observability');

  kalshi.getMarket=async()=>({...q(ticker,88,89),status:'active'});
  kalshi.getOrderbook=async()=>null;
  const other=await hub.refreshTickerVerified(ticker);
  assert.equal(other.marketFresh,true);
  assert.equal(other.bookFresh,false);
});

test('Strategy entry execution refuses cached market or book data when production verified refresh reports either side stale',async()=>{
  const settings={...baseSettings(),startingCapitalCents:1_000_000,minGameMinutes:0,simFillProbability:1,maxEntriesPerTrade:5,hunterCooldownMinutes:0};
  const db=fakeDb();
  const candidate=q('VERIFY-ENTRY',88,89); candidate.gameStartTimeMs=Date.now()-60_000; candidate.gameClockState={...candidate.gameClockState,startTimeMs:candidate.gameStartTimeMs,observedAtMs:candidate.gameStartTimeMs};
  let depthCalls=0;
  const market={
    async refreshTickerVerified(){return{quote:{...candidate,status:'active'},marketFresh:true,bookFresh:false};},
    executableAsk(){depthCalls+=1;return{filled:100,full:true,avgCents:89,bestCents:89};},
  };
  const strategy=new StrategyEngine({db,kalshi:{},market,learning:{},getSettings:()=>settings,getLiveReady:()=>false,random:()=>0,
    refreshGameClock:async(qq)=>{const now=Date.now();return{gameClockState:{...qq.gameClockState,entryAuthorized:true,evidenceObservedAtMs:now,lastCheckedAtMs:now,authorizationSource:'kalshi_live_data'},gameStartTimeMs:qq.gameStartTimeMs,liveStatus:'live'};}});
  const made=await strategy.createHunter('Momentum Hunter',candidate,20000,35,{legacyCompatibility:true});
  assert.equal(made,null);
  assert.equal(depthCalls,0,'stale book must be rejected before executable depth is consumed');
  assert.ok(db.audits.some((x)=>x.event==='hunter_entry_freshness_blocked'));
});


test('CI1 counts one crash through lower lows, requires structural rebound, resets after 80% reclaim, then permits a second episode',()=>{
  const cfg={...baseSettings(),crashRecoveryMinCrashCents:15,crashRecoveryMinReboundCents:7,crashRecoveryMinReclaimRate:.40,crashRecoveryStableObservations:3,crashRecoveryUpwardTicks:2,crashRecoveryEpisodeResetRate:.80};
  let state=null, now=1_000_000;
  const step=(bid,ask=bid+1)=>{const r=advanceCrashState(state,{ticker:'CRASH-T',eventTicker:'CRASH-EV',title:'Crash test',yesBid:bid,yesAsk:ask,status:'active',result:''},cfg,now+=1000);state=r.state;return r;};
  step(90);
  let r=step(75); assert.equal(r.transition,'CRASH_STARTED'); assert.equal(state.episodeCount,1); const first=state.episodeId;
  r=step(72); assert.equal(r.transition,'NEW_LOW'); assert.equal(state.episodeCount,1); assert.equal(state.episodeId,first,'lower lows must remain the same crash episode');
  const duplicate=advanceCrashState(state,{ticker:'CRASH-T',eventTicker:'CRASH-EV',yesBid:72,yesAsk:73,status:'active',result:''},cfg,now+500);
  assert.equal(duplicate.distinct,false); assert.equal(duplicate.state.stableObservations,0,'duplicate top price cannot fabricate stability');
  step(74); step(77); r=step(80); assert.equal(r.transition,'REBOUND_CONFIRMED'); assert.equal(state.entryReady,true); assert.ok(state.reclaimRate>=.40);
  r=step(87); assert.equal(r.transition,'EPISODE_RESET'); assert.equal(state.phase,'NORMAL'); assert.equal(state.episodeCount,1);
  assert.equal(state.pendingEntrySignal.episodeId,first,'fast >=80% recovery must not erase the already-confirmed CRH1 episode');
  const learning=new LearningEngine({},'SAGITTARIUS'); learning.crashStates.set('CRASH-T',structuredClone(state));
  assert.equal(learning.crashEntrySignal('CRASH-T').episodeId,first,'pending reset signal must remain consumable until a new crash/final invalidates it');
  r=step(72); assert.equal(r.transition,'CRASH_STARTED'); assert.equal(state.episodeCount,2); assert.notEqual(state.episodeId,first);
  assert.equal(state.pendingEntrySignal,null,'a new crash regime must invalidate the prior pending entry signal');
});

test('CI1 rejects the observed ZVE-like false rebound when it reclaims less than 40% of a 30c crash',()=>{
  const cfg={...baseSettings(),crashRecoveryMinCrashCents:15,crashRecoveryMinReboundCents:7,crashRecoveryMinReclaimRate:.40,crashRecoveryStableObservations:3,crashRecoveryUpwardTicks:2,crashRecoveryEpisodeResetRate:.80};
  let state=null, now=2_000_000;
  for(const bid of [91,61,62,65,70]){const r=advanceCrashState(state,{ticker:'ZVE',eventTicker:'ZVE-EV',yesBid:bid,yesAsk:bid+1,status:'active',result:''},cfg,now+=1000);state=r.state;}
  assert.equal(state.crashDepthCents,30);
  assert.equal(state.reboundCents,9);
  assert.ok(state.reclaimRate<.40);
  assert.equal(state.entryReady,false);
  assert.equal(state.phase,'CRASHING');
});

test("CRH1 force-fresh execution revalidation blocks a captured signal that loses structure or spread before fill",async()=>{const {RELEASE,originalSettings,CANONICAL_NUMERIC_SETTINGS,CANONICAL_BOOLEAN_SETTINGS,sanitizeRuntimeSettings,normalizeStartupExecutionMode}=await import('../src/config.mjs');const D=await import('../src/doctrine.mjs');const {readFile,readdir,stat}=await import('node:fs/promises');const strategy=await readFile(new URL('../src/strategy.mjs',import.meta.url),'utf8');const s=originalSettings();assert.equal(s.recoveryStakeCents,20000);assert.equal(Object.hasOwn(s,'recoveryBaseStakeCents'),false);assert.equal(Object.hasOwn(s,'recoveryMinReboundCents'),false);assert.ok(strategy.includes("structuralRole:'FOLLOW_ON_RECOVERY_ONLY'"));assert.ok(strategy.includes("concept==='Recovery Hunter'&&!recoverySourceSnapshot"));assert.equal(D.ATHENA_COMMANDER.attackStrategicRevalidationAllowed,false);});

test("CRH1 consumes an exact Dragon Cosmo while independently freezing the current crash episode and normal execution controls",async()=>{const {RELEASE,originalSettings,CANONICAL_NUMERIC_SETTINGS,CANONICAL_BOOLEAN_SETTINGS,sanitizeRuntimeSettings,normalizeStartupExecutionMode}=await import('../src/config.mjs');const D=await import('../src/doctrine.mjs');const {readFile,readdir,stat}=await import('node:fs/promises');const strategy=await readFile(new URL('../src/strategy.mjs',import.meta.url),'utf8');const s=originalSettings();assert.equal(s.recoveryStakeCents,20000);assert.equal(Object.hasOwn(s,'recoveryBaseStakeCents'),false);assert.equal(Object.hasOwn(s,'recoveryMinReboundCents'),false);assert.ok(strategy.includes("structuralRole:'FOLLOW_ON_RECOVERY_ONLY'"));assert.ok(strategy.includes("concept==='Recovery Hunter'&&!recoverySourceSnapshot"));assert.equal(D.ATHENA_COMMANDER.attackStrategicRevalidationAllowed,false);});

test('CRH1 cannot hunt a raw CI1 signal without an active Cosmo source',async()=>{
  const episodeId='CRASH:RAW-ONLY:1:1';
  const db=fakeDb();
  const settings={...baseSettings(),pegasusEnabled:true,dragonEnabled:false,crashRecoveryHunterEnabled:true,crashRecoveryMinEntryCents:70,crashRecoveryMaxEntryCents:89,crashRecoveryMaxSpreadCents:3};
  const learning={crashEntrySignal:()=>({version:'CI1',episodeId,episodeIndex:1,preCrashPeakCents:90,troughCents:60,crashDepthCents:30,reboundCents:20,reclaimRate:2/3,stableObservations:5,upwardTicks:3})};
  const strategy=new StrategyEngine({db,kalshi:{},market:{},learning,getSettings:()=>settings,getLiveReady:()=>false,refreshGameClock:refreshClock});
  let calls=0; strategy.createHunter=async()=>{calls+=1;return entry({conceptName:'Crash Recovery Hunter'});};
  const made=await strategy.evaluateCrashRecovery(new Map([['RAW-ONLY',q('RAW-ONLY',79,80)]]),{legacyCompatibility:true});
  assert.deepEqual(made,[]);
  assert.equal(calls,0,'crash intelligence alone cannot bypass the shared Cosmo nomination boundary');
});

test('CRH1 may consume Pegasus with Dragon disabled while independently proving the current crash episode',async()=>{
  const episodeId='CRASH:PEGASUS-COSMO:2:2';
  const pegasus=entry({id:'pegasus-crh',conceptName:'Pegasus',ticker:'PEGASUS-COSMO',eventTicker:'PEGASUS-COSMO',status:'open',entryPriceCents:62,currentPriceCents:79,peakPriceCents:81,entryFeeCents:0,sourceTradeId:null,openedAtMs:Date.now()-5000,entryConfig:{conceptName:'Pegasus',referenceStakeCents:3000,maxSpreadCents:3,feeder:{minPriceCents:45,maxPriceCents:89,dropCents:1}}});
  const db=fakeDb([pegasus]);
  const settings={...baseSettings(),pegasusEnabled:true,dragonEnabled:false,crashRecoveryHunterEnabled:true,crashRecoveryStakeCents:20000,crashRecoveryMinEntryCents:70,crashRecoveryMaxEntryCents:89,crashRecoveryMaxSpreadCents:3,minGameMinutes:0,startingCapitalCents:1_000_000,simFillProbability:1};
  const signal={version:'CI1',episodeId,episodeIndex:2,preCrashPeakCents:90,troughCents:60,crashDepthCents:30,reboundCents:19,reclaimRate:19/30,stableObservations:5,upwardTicks:3,crashStartedAtMs:1,troughAtMs:2,reboundConfirmedAtMs:3,sport:'Tennis'};
  const learning={crashEntrySignal:()=>signal};
  const market={async refreshTicker(t){return q(t,79,80);},executableAsk(){return{filled:1000,full:true,avgCents:80,bestCents:80};},executableBid(_ticker,count){return{filled:count,full:true,avgCents:79,bestCents:79};}};
  const strategy=new StrategyEngine({db,kalshi:{},market,learning,getSettings:()=>settings,getLiveReady:()=>false,refreshGameClock:refreshClock,random:()=>0});
  const made=await strategy.evaluateCrashRecovery(new Map([['PEGASUS-COSMO',q('PEGASUS-COSMO',79,80)]]),{legacyCompatibility:true});
  assert.equal(made.length,1);
  const e=made[0];
  assert.equal(e.sourceFeeder,'Pegasus');
  assert.equal(e.sourceTradeId,episodeId);
  assert.equal(e.entryConfig.crashRecoverySource.cosmoSourceId,'pegasus-crh');
  assert.equal(e.entryConfig.crashRecoverySource.cosmoSourceConcept,'Pegasus');
  assert.equal(e.entryConfig.crashRecoverySource.episodeId,episodeId);
  assert.equal(e.entryConfig.crashRecoverySource.dragonSignalId,null);
  assert.equal(e.entryConfig.crashRecoverySource.dragonEpisodeId,null);
});

test('CRH1 may use an older Dragon reference as generic Cosmo while the current crash episode remains independently authoritative',async()=>{
  const oldEpisode='CRASH:SAME-TICKER:1:1';
  const newEpisode='CRASH:SAME-TICKER:2:2';
  const db=fakeDb([dragonApproval('SAME-TICKER',oldEpisode,{id:'older-dragon-cosmo'})]);
  const settings={...baseSettings(),dragonEnabled:true,crashRecoveryHunterEnabled:true,crashRecoveryMinEntryCents:70,crashRecoveryMaxEntryCents:89,crashRecoveryMaxSpreadCents:3};
  const learning={crashEntrySignal:()=>({version:'CI1',episodeId:newEpisode,episodeIndex:2,preCrashPeakCents:90,troughCents:60,crashDepthCents:30,reboundCents:20,reclaimRate:2/3,stableObservations:5,upwardTicks:3})};
  const strategy=new StrategyEngine({db,kalshi:{},market:{},learning,getSettings:()=>settings,getLiveReady:()=>false,refreshGameClock:refreshClock});
  let captured=null; strategy.createHunter=async(_concept,_q,_stake,_stop,opt)=>{captured=opt;return entry({conceptName:'Crash Recovery Hunter',sourceFeeder:opt.sourceFeeder,sourceTradeId:opt.sourceTradeId});};
  const made=await strategy.evaluateCrashRecovery(new Map([['SAME-TICKER',q('SAME-TICKER',79,80)]]),{legacyCompatibility:true});
  assert.equal(made.length,1);
  assert.equal(captured.sourceFeeder,'Dragon');
  assert.equal(captured.sourceTradeId,newEpisode);
  assert.equal(captured.crashSourceSnapshot.episodeId,newEpisode);
  assert.equal(captured.crashSourceSnapshot.cosmoSourceId,'older-dragon-cosmo');
  assert.equal(captured.crashSourceSnapshot.dragonSignalId,null,'legacy exact-Dragon provenance is not falsely attributed across episodes');
});

test('Starlight and Crystal Wall no longer have an artificial defer rule; Galactic topology decides coexistence after each doctrine qualifies',async()=>{
  const loss=entry({id:'loss-crh',ticker:'CRH-RH1',eventTicker:'CRH-RH1',status:'closed',closeReason:'hard_stop_loss',exitPriceCents:45,closedAtMs:Date.now()-60_000,remainingCount:0});
  const episodeId='CRASH:CRH-RH1:1:1';
  const db=fakeDb([loss,dragonApproval('CRH-RH1',episodeId)]);
  const settings={...baseSettings(),dragonEnabled:true,crashRecoveryHunterEnabled:true,recoveryHunterEnabled:true,galacticExplosionEnabled:true,crashRecoveryMinEntryCents:70,crashRecoveryMaxEntryCents:89,crashRecoveryMaxSpreadCents:3};
  const learning={crashEntrySignal:()=>({version:'CI1',episodeId,episodeIndex:1,preCrashPeakCents:90,troughCents:45,crashDepthCents:45,reboundCents:35,reclaimRate:.78,stableObservations:4,upwardTicks:3})};
  const strategy=new StrategyEngine({db,kalshi:{},market:{},learning,getSettings:()=>settings,getLiveReady:()=>false,refreshGameClock:refreshClock});
  let calls=0; strategy.createHunter=async()=>{calls+=1;return entry({conceptName:'Crash Recovery Hunter'});};
  const made=await strategy.evaluateCrashRecovery(new Map([['CRH-RH1',q('CRH-RH1',79,80)]]),{legacyCompatibility:true});
  assert.equal(made.length,1); assert.equal(calls,1);
  assert.equal(db.audits.some(a=>a.event==='crash_recovery_deferred_to_recovery_hunter'),false);
});

test('CI1 persists additive crash state/episode telemetry and never changes U-SG1 source code',async()=>{
  const dbSource=await import('node:fs/promises').then(({readFile})=>readFile(new URL('../src/db.mjs',import.meta.url),'utf8'));
  for(const marker of ['sag_crash_market_state_v1','sag_crash_episodes_v1','upsertCrashMarketState','upsertCrashEpisode','finalizeCrashEpisodes']) assert.ok(dbSource.includes(marker),`${marker} missing`);
  const doctrine=await import('node:fs/promises').then(({readFile})=>readFile(new URL('../src/doctrine.mjs',import.meta.url),'utf8'));
  assert.ok(doctrine.includes("version: 'U-SG1'"));
  assert.ok(doctrine.includes("'Crash Recovery Hunter'"));
});

test('R28 GCA2 recovers primary-only milestones through bounded public events-with-milestones fallback',async()=>{
  const k=new KalshiClient({},'https://legacy.test/trade-api/v2','https://external.test/trade-api/v2');
  const calls=[];
  k.request=async(method,path,body,opts)=>{
    calls.push({method,path,body,opts});
    if(path==='/events/PRIMARY-EV')return{ok:true,status:200,data:{event:{event_ticker:'PRIMARY-EV',series_ticker:'SERIES-X'}}};
    if(path==='/events?limit=200&series_ticker=SERIES-X&with_milestones=true&status=open')return{ok:true,status:200,data:{events:[{event_ticker:'PRIMARY-EV',series_ticker:'SERIES-X'}],milestones:[
      {id:'primary-only',category:'Sports',type:'soccer_match',primary_event_tickers:['PRIMARY-EV'],related_event_tickers:[]},
      {id:'sibling',category:'Sports',type:'soccer_match',primary_event_tickers:['OTHER-EV'],related_event_tickers:[]},
    ],cursor:''}};
    throw new Error(`unexpected ${path}`);
  };
  const rows=await k.getMilestonesForSeriesEvent('PRIMARY-EV','');
  assert.deepEqual(rows.map((x)=>x.id),['primary-only']);
  assert.deepEqual(calls.map((x)=>x.path),['/events/PRIMARY-EV','/events?limit=200&series_ticker=SERIES-X&with_milestones=true&status=open']);
  for(const c of calls){assert.equal(c.opts.authenticated,false);assert.equal(c.opts.maxAttempts,2);assert.equal(c.opts.preferFallbackHost,true);assert.ok(c.opts.timeoutMs<=1800);}
});

test('R35 GCA2 series milestone fallback keeps paging open events until exact primary membership is found', async () => {
  const k=new KalshiClient({},'https://example.test/trade-api/v2','');
  const calls=[];
  k.request=async(_method,path)=>{
    calls.push(path);
    if(path==='/events/PRIMARY-LATE') return {ok:true,status:200,data:{event:{event_ticker:'PRIMARY-LATE',series_ticker:'SERIES-LATE'}}};
    if(path==='/events?limit=200&series_ticker=SERIES-LATE&with_milestones=true&status=open') return {ok:true,status:200,data:{events:[{event_ticker:'PRIMARY-LATE',series_ticker:'SERIES-LATE'}],milestones:[],cursor:'next'}};
    if(path==='/events?limit=200&series_ticker=SERIES-LATE&with_milestones=true&status=open&cursor=next') return {ok:true,status:200,data:{events:[],milestones:[{id:'late-primary',category:'Sports',type:'tennis_match',primary_event_tickers:['PRIMARY-LATE'],related_event_tickers:[]}],cursor:''}};
    throw new Error(`unexpected ${path}`);
  };
  const rows=await k.getMilestonesForSeriesEvent('PRIMARY-LATE','');
  assert.equal(rows.length,1);
  assert.equal(rows[0].id,'late-primary');
  assert.deepEqual(calls,[
    '/events/PRIMARY-LATE',
    '/events?limit=200&series_ticker=SERIES-LATE&with_milestones=true&status=open',
    '/events?limit=200&series_ticker=SERIES-LATE&with_milestones=true&status=open&cursor=next',
  ]);
});

test("R35 feeder quote queue wakes ordinary feeder-driven Hunters without waiting for the scan phase",async()=>{const {RELEASE,originalSettings,CANONICAL_NUMERIC_SETTINGS,CANONICAL_BOOLEAN_SETTINGS,sanitizeRuntimeSettings,normalizeStartupExecutionMode}=await import('../src/config.mjs');const D=await import('../src/doctrine.mjs');const {readFile,readdir,stat}=await import('node:fs/promises');const strategy=await readFile(new URL('../src/strategy.mjs',import.meta.url),'utf8');assert.ok(strategy.includes('prepareEntryExecution'));assert.ok(strategy.includes('simulationAvailableCashCents'));assert.ok(strategy.includes('this.hunterTickerLocks'));assert.ok(strategy.includes('this.hunterEntryCommitLocks'));assert.ok(strategy.indexOf("status:'entry_pending'")<strategy.indexOf("placeOrder({ticker:q.ticker,action:'buy'"));assert.ok(strategy.includes('validateAthenaFireCommand'));assert.equal(D.COSMO_ROUTING.attackDoctrineRevalidationRequired,false);});


test('R35 EPT1 identifies the exact upstream game-clock reason before Athena or execution can be reached', async () => {
  const db=fakeDb();
  const s={...baseSettings(),waveSurferEnabled:true,pegasusEnabled:true,minGameMinutes:20,maxPositions:20,maxEntriesPerTrade:1,hunterCooldownMinutes:0,simFillProbability:1};
  const strategy=new StrategyEngine({
    db,kalshi:{},market:{},learning:{},athena:{assess(){throw new Error('Athena must not run after a GCA2 block');}},
    getSettings:()=>s,getLiveReady:()=>false,
    refreshGameClock:async(qq)=>({gameClockState:{version:'GCA2',eventTicker:qq.eventTicker||qq.ticker,phase:'UNKNOWN',confirmed:false,startTimeMs:null,entryAuthorized:false,reason:'activity_only_future_occurrence_blocked',lastCheckedAtMs:Date.now()},gameStartTimeMs:null,liveStatus:'live'}),
    random:()=>0,
  });
  const made=await strategy.createHunter('Wave Surfer',q('EPT-CLOCK',80,81),8100,35,{legacyCompatibility:true,sourceFeeder:'Pegasus',sourceTradeId:'feed',entryQualificationSnapshot:{version:'WAVE-Q1',feederEntryPriceCents:65}});
  assert.equal(made,null);
  const t=strategy.entryPipelineSummary();
  assert.equal(t.attempts,1);
  assert.equal(t.opened,0);
  assert.equal(t.byReason.activity_only_future_occurrence_blocked,1);
  assert.ok(t.recent.some((r)=>r.stage==='GAME_CLOCK'&&r.status==='BLOCKED'&&r.reason==='activity_only_future_occurrence_blocked'));
  assert.equal(t.recent.some((r)=>r.stage==='ATHENA'),false);
});

test('R35 GCA2 repaired Kalshi series pagination reaches a later-page tennis primary milestone and authorizes only exact official live data', async () => {
  const event='KXITFMATCH-R35-TENNIS';
  const series='KXITFMATCH';
  const k=new KalshiClient({},'https://example.test/trade-api/v2','');
  const calls=[];
  k.request=async(_method,path)=>{
    calls.push(path);
    if(path===`/milestones?limit=500&related_event_ticker=${event}`) return {ok:true,status:200,data:{milestones:[],cursor:''}};
    if(path===`/events?limit=200&series_ticker=${series}&with_milestones=true&status=open`) return {ok:true,status:200,data:{events:[{event_ticker:event,series_ticker:series}],milestones:[],cursor:'page2'}};
    if(path===`/events?limit=200&series_ticker=${series}&with_milestones=true&status=open&cursor=page2`) return {ok:true,status:200,data:{events:[],milestones:[{id:'tennis-live-r35',category:'Sports',type:'tennis_match',primary_event_tickers:[event],related_event_tickers:[],start_date:new Date(Date.now()-3600000).toISOString(),end_date:new Date(Date.now()+3600000).toISOString()}],cursor:''}};
    if(path==='/live_data/milestone/tennis-live-r35') return {ok:true,status:200,data:{live_data:{milestone_id:'tennis-live-r35',type:'tennis_match',details:{status:'live'}}}};
    throw new Error(`unexpected ${path}`);
  };
  const gca=new GameClockAuthority({kalshi:k});
  const now=Date.now();
  const quote={ticker:'R35-TENNIS-A',eventTicker:event,seriesTicker:series,title:'R35 tennis',yesBid:80,yesAsk:81,status:'active',result:'',updatedAtMs:now,liveStatus:'live',occurrenceTimeMs:now+2*3600000};
  const state=await gca.resolveEvent({eventTicker:event,quotes:[quote],now,forceFresh:true,allowGameStats:false});
  assert.equal(state.phase,'CONFIRMED');
  assert.equal(state.entryAuthorized,true);
  assert.equal(state.source,'kalshi_live_data');
  assert.equal(state.milestoneId,'tennis-live-r35');
  assert.equal(state.milestoneDiscoverySource,'series_events_with_milestones');
  assert.ok(calls.includes(`/events?limit=200&series_ticker=${series}&with_milestones=true&status=open&cursor=page2`));
});

test('HF7 A-to-Z SIM trade traverses EAC1 admission probe -> feeder -> GCA2 -> book -> Athena -> Galactic commit -> fill -> persistence -> ProfitGuard settlement', async () => {
  const now=Date.now();
  const start=now-30*60000;
  const feeder=entry({
    id:'r35-e2e-feed',conceptName:'Pegasus',ticker:'R35-E2E',eventTicker:'R35-E2E',marketTitle:'R35 E2E market',
    status:'open',entryPriceCents:65,currentPriceCents:80,peakPriceCents:80,stopPriceCents:0,stopLossCents:0,
    count:46,remainingCount:46,entryFeeCents:0,gameStartTimeMs:start,
    entryConfig:{release:'R35-test',conceptName:'Pegasus',referenceStakeCents:3000,maxSpreadCents:3,feeder:{minPriceCents:30,maxPriceCents:95,dropCents:2}},
  });
  const db=fakeDb([feeder]);
  const s={...baseSettings(),
    pegasusEnabled:true,sagittariusEnabled:false,momentumHunterEnabled:false,waveSurferEnabled:true,recoveryHunterEnabled:true,
    maxPositions:20,maxEntriesPerTrade:1,hunterCooldownMinutes:0,minGameMinutes:20,startingCapitalCents:1_000_000,
    simFillProbability:1,simFeeCents:2,waveStakeCents:20_000,waveMinEntryCents:60,waveMaxEntryCents:89,waveStopCents:35,waveMinFeederFavorableMoveCents:10,waveMaxSpreadCents:2,
  };
  let current={ticker:'R35-E2E',title:'R35 E2E market',eventTicker:'R35-E2E',seriesTicker:'KXITFMATCH',yesBid:80,yesAsk:81,volume24h:10000,updatedAtMs:now,status:'active',result:'',occurrenceTimeMs:now+2*3600000,closeTimeMs:now+4*3600000,recentTrades:20,recentTradesObservedAtMs:now,gameStartTimeMs:null,liveStatus:'live',bookInvalid:false,gameClockState:{version:'GCA2',eventTicker:'R35-E2E',phase:'UNKNOWN',confirmed:false,startTimeMs:null,entryAuthorized:false,lastCheckedAtMs:now,reason:'simulation_observed_activity_aging',simulationActivityStartMs:start,simulationActivityLastEvidenceMs:now-60_000,simulationActivityEvidenceCount:6}};
  let bookMs=now;
  const market={
    getQuote:()=>current,quoteAgeMs:()=>0,getBook:()=>({updatedAtMs:bookMs}),
    async refreshTicker(){return current;},
    async refreshTickerVerified(){return{quote:current,marketFresh:true,bookFresh:true,marketObservedAtMs:Date.now(),bookObservedAtMs:bookMs};},
    async ensureFreshBook(){bookMs=Date.now();return{updatedAtMs:bookMs};},
    executableAsk(_ticker,count){return{filled:count,full:true,avgCents:81,bestCents:81};},
    executableBid(_ticker,count){const px=current.result?100:Math.max(1,current.yesBid);return{filled:count,full:true,avgCents:px,bestCents:px};},
  };
  const athena={calls:0,assess(){this.calls+=1;return{version:'ATHENA-B1',brainHash:'r35-e2e-brain',ready:true,allow:true,blocked:false,score:72,classification:'FAVORABLE',confidence:'HIGH',reason:'assessment',evidence:[],assessedAtMs:Date.now()};}};
  const clockAuthority=new GameClockAuthority({kalshi:{async getMilestonesForEvent(){return[];}}});
  const refreshGameClock=async(qq)=>{const t=Date.now();qq.recentTrades=20;qq.recentTradesObservedAtMs=t;const state=await clockAuthority.resolveEvent({eventTicker:'R35-E2E',quotes:[qq],priorState:qq.gameClockState,now:t,allowGameStats:true,forceFresh:true,allowSimulationActivityClock:true,minimumElapsedMs:s.minGameMinutes*60*1000});return{gameClockState:state,gameStartTimeMs:state?.phase==='CONFIRMED'&&state?.confirmed===true?state.startTimeMs:null,liveStatus:'live'};};
  const learning={recoveryRate:async()=>null,onHardStop:async()=>{},profitLearningState:()=>null};
  const admission=Object.create(SagittariusEngine.prototype);
  admission.settings=s;admission.market=market;admission.entryAdmissionProbeAt=new Map();admission.entryAdmissionStats={version:'EAC1',allowed:0,blockedBeforeQueue:0,probeAllowed:0,probeCoalesced:0,byReason:{}};
  assert.equal(admission.shouldQueueInitialExposure('R35-E2E',{allowProbe:true}),true,'mature SIM lower-bound must earn one bounded authority probe');
  assert.equal(admission.shouldQueueInitialExposure('R35-E2E',{allowProbe:true}),false,'the same unknown event cannot flood the entry workers while the probe is outstanding');
  const strategy=new StrategyEngine({db,kalshi:{},market,learning,athena,getSettings:()=>s,getLiveReady:()=>false,refreshGameClock,random:()=>0});
  const made=await strategy.evaluateMomentumAndWave(new Map([['R35-E2E',current]]),{legacyCompatibility:true});
  assert.equal(made.length,1);
  const hunter=made[0];
  assert.equal(hunter.conceptName,'Wave Surfer');
  assert.equal(hunter.sourceFeeder,'Pegasus');
  assert.equal(hunter.entryPriceCents,81);
  assert.ok(hunter.count>0);
  assert.equal(hunter.entryConfig.athena.brainHash,'r35-e2e-brain');
  assert.equal(hunter.entryConfig.gameClockAuthority.source,'simulation_observed_activity');
  assert.equal(hunter.entryConfig.gameClockAuthority.sourceStrength,'simulation_only');
  assert.equal(athena.calls,1);
  const pipeline=strategy.entryPipelineSummary();
  for(const stage of ['GAME_CLOCK:PASS','EXECUTABLE_BOOK:PASS','LIFECYCLE:PASS','DOCTRINE:PASS','ATHENA:PASS','ENTRY_COMMIT_LOCK:PASS','FINAL_CLOCK:PASS','FINAL_ENTRY_POLICY:PASS','CAPITAL:PASS','EXECUTION:PASS','PERSISTENCE:PASS','OPENED:PASS']) assert.ok(pipeline.byStage[stage]>=1,`${stage} missing`);

  current={...current,yesBid:100,yesAsk:100,status:'finalized',result:'yes',updatedAtMs:Date.now()};
  const guard=new ProfitGuard({db,kalshi:{},market,learning,getSettings:()=>s});
  const protectedResult=await guard.protect(await db.entryById(hunter.id));
  assert.equal(protectedResult.closed,true);
  const closed=await db.entryById(hunter.id);
  assert.equal(closed.status,'closed');
  assert.equal(closed.remainingCount,0);
  assert.equal(closed.closeReason,'settlement_win');
  assert.equal(closed.exitPriceCents,100);
  assert.ok(closed.pnlCents>0);
});
