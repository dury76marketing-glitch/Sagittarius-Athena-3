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

test('legacy models remain default enabled while Dragon, Golden Dragon, CRH1 and DRH1 fail safe OFF until explicitly enabled', async () => {
  const defaults=originalSettings();
  for (const name of ['Pegasus','Sagittarius','Momentum Hunter','Wave Surfer','Recovery Hunter']) {
    const key=MODEL_ENABLE_KEYS[name];
    assert.equal(defaults[key],true,`${name} should default ON`);
    assert.equal(isModelEnabled(defaults,name),true);
  }
  assert.equal(defaults.dragonEnabled,false,'new Dragon feeder must fail safe OFF on migration/deploy');
  assert.equal(defaults.crashRecoveryHunterEnabled,false,'new exposure model must fail safe OFF on migration/deploy');
  assert.equal(isModelEnabled(defaults,'Crash Recovery Hunter'),false);
  assert.equal(isModelEnabled(defaults,'Golden Dragon'),false);
  assert.equal(isModelEnabled(defaults,'Dragon Recovery Hunter'),false);
  const engine=Object.create(SagittariusEngine.prototype);
  engine.settings={...baseSettings()};
  let saved=null;
  engine.db={saveSettings:async(v)=>{saved=structuredClone(v);}};
  await engine.patchSettings({pegasusEnabled:false,waveSurferEnabled:false,recoveryHunterEnabled:'false'});
  assert.equal(engine.settings.pegasusEnabled,false);
  assert.equal(engine.settings.sagittariusEnabled,true);
  assert.equal(engine.settings.momentumHunterEnabled,true);
  assert.equal(engine.settings.waveSurferEnabled,false);
  assert.equal(engine.settings.recoveryHunterEnabled,false);
  assert.equal(saved.pegasusEnabled,false);
});

test('disabling a feeder immediately blocks new downstream Hunters from its existing ghost signal', async () => {
  const feeder=entry({id:'feed',conceptName:'Pegasus',status:'open',entryPriceCents:70,currentPriceCents:90,peakPriceCents:94,count:40,gameStartTimeMs:Date.now()-30*60000});
  const db=fakeDb([feeder]);
  const settings=baseSettings(); settings.pegasusEnabled=false; settings.momentumHunterEnabled=false;
  const strategy=new StrategyEngine({db,kalshi:{},market:{},learning:{recoveryRate:async()=>null},getSettings:()=>settings,getLiveReady:()=>false,refreshGameClock:refreshClock});
  let calls=0;
  strategy.createHunter=async()=>{calls+=1;return entry({id:`made-${calls}`,conceptName:'Wave Surfer'});};
  const marketMap=new Map([['T',q('T',89,90)]]);
  const blocked=await strategy.evaluateMomentumAndWave(marketMap);
  assert.equal(blocked.length,0);
  assert.equal(calls,0);
  settings.pegasusEnabled=true;
  const allowed=await strategy.evaluateMomentumAndWave(marketMap);
  assert.equal(allowed.length,1);
  assert.equal(calls,1);
});

test('last-moment feeder OFF gate prevents a Hunter order sourced by that feeder', async () => {
  const db=fakeDb();
  const settings={...baseSettings(),pegasusEnabled:false,momentumHunterEnabled:true,simFillProbability:1};
  let refreshed=0;
  const market={async refreshTicker(){refreshed+=1;return q('T',80,81);},executableAsk(){return {filled:1,full:true,avgCents:81,bestCents:81};}};
  const strategy=new StrategyEngine({db,kalshi:{},market,learning:{},getSettings:()=>settings,getLiveReady:()=>false,refreshGameClock:refreshClock,random:()=>0});
  const made=await strategy.createHunter('Momentum Hunter',q('T',80,81),81,10,{sourceFeeder:'Pegasus',sourceTradeId:'feed'});
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
  const made=await strategy.evaluateRecovery(new Map([['T',q('T',77,78)]]));
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

test('2000-opportunity model-gate simulation admits only enabled models including Dragon, Golden Dragon, CRH1, DRH1 and GDH1', async () => {
  const settings={...baseSettings()};
  const names=Object.keys(MODEL_ENABLE_KEYS);
  const admitted=new Map(names.map((name)=>[name,0]));
  for (let i=0;i<2000;i+=1) {
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

test('simulation Hunter entry is capped to real executable depth', async () => {
  const db=fakeDb();
  const settings=baseSettings(); settings.simFillProbability=1;
  const market={
    async refreshTicker(){return q('T',80,82);},
    executableAsk(){return {filled:2,full:false,avgCents:82,bestCents:82};},
    executableBid(_ticker,count){return {filled:count,full:true,avgCents:80,bestCents:80};},
  };
  const s=new StrategyEngine({db,kalshi:{},market,learning:{},getSettings:()=>settings,getLiveReady:()=>false,refreshGameClock:refreshClock,random:()=>0});
  const e=await s.createHunter('Momentum Hunter',q('T',80,82),20000,10,{sourceFeeder:'Pegasus',sourceTradeId:'feed',entryQualificationSnapshot:{version:'MOMENTUM-Q1',feederEntryPriceCents:75,feederPeakPriceCents:85}});
  assert.equal(e.count,2);
  assert.equal(e.entryPriceCents,82);
  assert.equal(e.entryFeeCents,4);
});

test('simulation IOC rejection probability is honored', async () => {
  const db=fakeDb();
  const settings=baseSettings(); settings.simFillProbability=.75;
  const market={async refreshTicker(){return q('T',80,82);},executableAsk(){return {filled:2,full:true,avgCents:82,bestCents:82};},executableBid(_ticker,count){return {filled:count,full:true,avgCents:80,bestCents:80};}};
  const s=new StrategyEngine({db,kalshi:{},market,learning:{},getSettings:()=>settings,getLiveReady:()=>false,refreshGameClock:refreshClock,random:()=>.9});
  const e=await s.createHunter('Momentum Hunter',q('T',80,82),20000,10,{sourceFeeder:'Pegasus',sourceTradeId:'feed',entryQualificationSnapshot:{version:'MOMENTUM-Q1',feederEntryPriceCents:75,feederPeakPriceCents:85}});
  assert.equal(e,null);
  assert.equal(db.inserted.length,0);
});

test('simulation buying power blocks impossible exposure', async () => {
  const db=fakeDb();
  const settings=baseSettings(); settings.simFillProbability=1; settings.startingCapitalCents=100;
  const market={async refreshTicker(){return q('T',80,82);},executableAsk(){return {filled:2,full:true,avgCents:82,bestCents:82};},executableBid(_ticker,count){return {filled:count,full:true,avgCents:80,bestCents:80};}};
  const s=new StrategyEngine({db,kalshi:{},market,learning:{},getSettings:()=>settings,getLiveReady:()=>false,refreshGameClock:refreshClock,random:()=>0});
  const e=await s.createHunter('Momentum Hunter',q('T',80,82),20000,10,{sourceFeeder:'Pegasus',sourceTradeId:'feed',entryQualificationSnapshot:{version:'MOMENTUM-Q1',feederEntryPriceCents:75,feederPeakPriceCents:85}});
  assert.equal(e,null);
  assert.equal(db.audits.at(-1).event,'sim_entry_blocked_cash');
});

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

test('RH1 keeps exact 2x configured Recovery stake and lets the normal buying-power gate decide', async () => {
  const source=entry({id:'rh1-source',status:'closed',closeReason:'hard_stop_loss',exitPriceCents:70,closedAtMs:Date.now()-60000,pnlCents:0,remainingCount:0});
  const db=fakeDb([source]);
  const settings={...baseSettings(),startingCapitalCents:100000,recoveryBaseStakeCents:10000,recoveryMinEntryCents:70,recoveryMaxEntryCents:94,recoveryMinReboundCents:7,simFillProbability:1};
  const market={
    async refreshTicker(){return q('T',79,80);},
    executableAsk:()=>({filled:1000,full:true,avgCents:80,bestCents:80}),
    executableBid:(_ticker,count)=>({filled:count,full:true,avgCents:79,bestCents:79}),
  };
  const strategy=new StrategyEngine({db,kalshi:{},market,learning:{},getSettings:()=>settings,getLiveReady:()=>false,refreshGameClock:refreshClock,random:()=>0});
  const made=await strategy.evaluateRecovery(new Map([['T',q('T',79,80)]]));
  assert.equal(made.length,1);
  assert.equal(made[0].conceptName,'Recovery Hunter');
  assert.equal(made[0].entryConfig.model.baseStakeCents,10000);
  assert.equal(made[0].entryConfig.model.targetStakeCents,20000);
  assert.equal(made[0].entryConfig.model.actualStakeCents,20000);
  assert.equal(made[0].entryConfig.recoverySource.sourceTradeId,'rh1-source');
  assert.ok(db.audits.some((x)=>x.event==='recovery_entry_created'));
});

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
  const made=await strategy.evaluateRecovery(new Map([['T',q('T',79,80)]]));
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

test('Recovery uniqueness is per stopped source trade, not per ticker', async () => {
  const loss1=entry({id:'loss1',status:'closed',closeReason:'hard_stop_loss',exitPriceCents:70,closedAtMs:Date.now()-2000});
  const loss2=entry({id:'loss2',status:'closed',closeReason:'hard_stop_loss',exitPriceCents:71,closedAtMs:Date.now()-1000});
  const existing=entry({id:'r1',conceptName:'Recovery Hunter',status:'closed',sourceTradeId:'loss1'});
  const db=fakeDb([loss1,loss2,existing]);
  const settings=baseSettings();
  const s=new StrategyEngine({db,kalshi:{},market:{refreshTicker:async()=>null},learning:{},getSettings:()=>settings,getLiveReady:()=>false,refreshGameClock:refreshClock});
  const made=[];
  s.createHunter=async(_concept,qq,_stake,_stop,opt)=>{const e=entry({id:`made-${opt.sourceTradeId}`,conceptName:'Recovery Hunter',ticker:qq.ticker,sourceTradeId:opt.sourceTradeId});made.push(e);return e;};
  const qq=q('T',77,78);
  await s.evaluateRecovery(new Map([['T',qq]]));
  assert.deepEqual(made.map((x)=>x.sourceTradeId),['loss2']);
});

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

test('RH1 engine keeps Recovery tickers in scanner priority and evaluates Recovery from live quote events', async () => {
  const src=await (await import('node:fs/promises')).readFile(new URL('../src/engine.mjs', import.meta.url),'utf8');
  assert.ok(src.includes('this.recoveryPriorityTickers = new Set'));
  assert.ok(src.includes('queueRecoveryEvaluation(q?.ticker)'));
  assert.ok(src.includes("evaluateRecovery(new Map([[ticker, q]]), { onlyTicker:ticker })"));
  assert.ok(src.includes("...open.map((x) => x.ticker), ...this.recoveryPriorityTickers"));
  const full=src.slice(src.indexOf('async fullScan()'),src.indexOf('async fastPhase('));
  assert.ok(full.indexOf("await this.runProtectionSweep('full_scan')") < full.indexOf('evaluateEntryChain(markets, trackerMap, map)'));
  const chain=src.slice(src.indexOf('async evaluateEntryChain('),src.indexOf('async fullScan()'));
  assert.ok(chain.indexOf('strategy.evaluateRecovery(marketMap)') < chain.indexOf('strategy.evaluateMomentumAndWave(marketMap)'));
});

test('RH1 quote event actually wakes Recovery evaluation for a watched stopped ticker', async () => {
  const engine=Object.create(SagittariusEngine.prototype);
  engine.running=true;
  engine.settings={mode:'SIMULATION',engineActive:true};
  engine.recoveryPriorityTickers=new Set(['REC']);
  engine.recoveryEvaluationTimers=new Map();
  engine.market={getQuote:(ticker)=>q(ticker,79,80)};
  const calls=[];
  engine.strategy={async evaluateRecovery(map,opt){calls.push({map,opt});return[];}};
  engine.db={async audit(){}};
  engine.isLiveReady=()=>false;
  engine.queueRecoveryEvaluation('REC');
  await new Promise((r)=>setTimeout(r,420));
  assert.equal(calls.length,1);
  assert.equal(calls[0].opt.onlyTicker,'REC');
  assert.equal(calls[0].map.get('REC').yesAsk,80);
  assert.equal(engine.recoveryEvaluationTimers.size,0);
});

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
  const made=await strategy.createHunter('Momentum Hunter',candidate,20000,35);
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

test('CRH1 force-fresh execution revalidation blocks a captured signal that loses structure or spread before fill',async()=>{
  for (const mode of ['new_low','wide_spread']) {
    const captured={version:'CI1',episodeId:`CRASH:BOUNDARY:${mode}:1`,episodeIndex:1,preCrashPeakCents:90,troughCents:60,crashDepthCents:30,reboundCents:12,reclaimRate:.4,stableObservations:3,upwardTicks:2,crashStartedAtMs:1,troughAtMs:2,reboundConfirmedAtMs:3,sport:'Baseball'};
    const db=fakeDb([dragonApproval('BOUNDARY',captured.episodeId)]);
    const settings={...baseSettings(),dragonEnabled:true,crashRecoveryHunterEnabled:true,crashRecoveryStakeCents:20000,crashRecoveryMinEntryCents:70,crashRecoveryMaxEntryCents:89,crashRecoveryStopLossCents:35,crashRecoveryMaxSpreadCents:3,crashRecoveryMinCrashCents:15,crashRecoveryMinReboundCents:7,crashRecoveryMinReclaimRate:.40,crashRecoveryStableObservations:3,crashRecoveryUpwardTicks:2,minGameMinutes:0,startingCapitalCents:1_000_000,simFillProbability:1};
    let currentSignal=structuredClone(captured);
    const fresh=mode==='new_low'?{...q('BOUNDARY',58,59),status:'active',eventTicker:'BOUNDARY'}:{...q('BOUNDARY',74,79),status:'active',eventTicker:'BOUNDARY'};
    const learning={
      crashEntrySignal:()=>currentSignal,
      async observeCrashQuote(){ if(mode==='new_low') currentSignal=null; return {state:{phase:mode==='new_low'?'CRASHING':'REBOUND_CONFIRMED'}}; },
    };
    const market={
      async refreshTickerVerified(){return{quote:fresh,marketFresh:true,bookFresh:true};},
      executableAsk(){return{filled:1000,full:true,avgCents:fresh.yesAsk,bestCents:fresh.yesAsk};},
      getQuote(){return fresh;},
    };
    const strategy=new StrategyEngine({db,kalshi:{},market,learning,getSettings:()=>settings,getLiveReady:()=>false,refreshGameClock:refreshClock,random:()=>0});
    const candidate={...q('BOUNDARY',72,73),eventTicker:'BOUNDARY'};
    const made=await strategy.evaluateCrashRecovery(new Map([['BOUNDARY',candidate]]));
    assert.equal(made.length,0,`${mode} reached a fill`);
    assert.equal(db.inserted.length,0);
    assert.ok(db.audits.some((x)=>['hunter_pre_execution_doctrine_blocked','crash_recovery_pre_execution_revalidation_blocked'].includes(x.event)),`${mode} was not blocked at the fresh boundary`);
  }
});

test('CRH1 creates one Dragon-gated episode-attributed Hunter with immutable Crash Intelligence snapshot and normal central execution controls',async()=>{
  const signal={version:'CI1',episodeId:'CRASH:CRH:1:1',episodeIndex:1,preCrashPeakCents:90,troughCents:60,crashDepthCents:30,reboundCents:12,reclaimRate:.4,stableObservations:3,upwardTicks:2,crashStartedAtMs:1,troughAtMs:2,reboundConfirmedAtMs:3,sport:'Baseball'};
  const dragon=dragonApproval('CRH',signal.episodeId,{id:'dragon-crh'});
  const db=fakeDb([dragon]);
  const settings={...baseSettings(),dragonEnabled:true,crashRecoveryHunterEnabled:true,crashRecoveryStakeCents:20000,crashRecoveryMinEntryCents:70,crashRecoveryMaxEntryCents:89,crashRecoveryStopLossCents:35,crashRecoveryMaxSpreadCents:3,minGameMinutes:0,startingCapitalCents:1_000_000,simFillProbability:1};
  const learning={crashEntrySignal:(ticker)=>ticker==='CRH'?signal:null};
  const market={async refreshTicker(t){return q(t,79,80);},executableAsk(){return{filled:1000,full:true,avgCents:80,bestCents:80};},executableBid(_ticker,count){return{filled:count,full:true,avgCents:79,bestCents:79};}};
  const strategy=new StrategyEngine({db,kalshi:{},market,learning,getSettings:()=>settings,getLiveReady:()=>false,refreshGameClock:refreshClock,random:()=>0});
  const made=await strategy.evaluateCrashRecovery(new Map([['CRH',q('CRH',79,80)]]));
  assert.equal(made.length,1);
  const e=made[0];
  assert.equal(e.conceptName,'Crash Recovery Hunter');
  assert.equal(e.sourceFeeder,'Dragon');
  assert.equal(e.sourceTradeId,signal.episodeId);
  assert.equal(e.stopLossCents,35);
  assert.equal(e.entryConfig.model.minCrashCents,15);
  assert.equal(e.entryConfig.crashRecoverySource.episodeId,signal.episodeId);
  assert.equal(e.entryConfig.crashRecoverySource.huntingGround,'dragon_signal_episode');
  assert.equal(e.entryConfig.crashRecoverySource.dragonSignalId,'dragon-crh');
  assert.equal(e.entryConfig.crashRecoverySource.dragonEpisodeId,signal.episodeId);
  assert.equal(e.entryConfig.crashRecoverySource.reclaimRate,19/30,'entry snapshot must freeze the force-fresh executable rebound, not the stale candidate quote');
  assert.equal(e.entryConfig.crashRecoverySource.validatedBidCents,79);
  assert.equal(e.entryConfig.crashRecoverySource.validatedAskCents,80);
  await db.updateEntry(e.id,{status:'closed',closedAtMs:Date.now(),remainingCount:0});
  const again=await strategy.evaluateCrashRecovery(new Map([['CRH',q('CRH',79,80)]]));
  assert.equal(again.length,0,'one CRH1 entry is allowed per exact crash episode even after the Hunter closes');
});

test('CRH1 cannot hunt a raw CI1 signal unless Dragon approved that exact crash episode',async()=>{
  const episodeId='CRASH:RAW-ONLY:1:1';
  const db=fakeDb();
  const settings={...baseSettings(),dragonEnabled:true,crashRecoveryHunterEnabled:true,crashRecoveryMinEntryCents:70,crashRecoveryMaxEntryCents:89,crashRecoveryMaxSpreadCents:3};
  const learning={crashEntrySignal:()=>({version:'CI1',episodeId,episodeIndex:1,preCrashPeakCents:90,troughCents:60,crashDepthCents:30,reboundCents:20,reclaimRate:2/3,stableObservations:5,upwardTicks:3})};
  const strategy=new StrategyEngine({db,kalshi:{},market:{},learning,getSettings:()=>settings,getLiveReady:()=>false,refreshGameClock:refreshClock});
  let calls=0; strategy.createHunter=async()=>{calls+=1;return entry({conceptName:'Crash Recovery Hunter'});};
  const made=await strategy.evaluateCrashRecovery(new Map([['RAW-ONLY',q('RAW-ONLY',79,80)]]));
  assert.deepEqual(made,[]);
  assert.equal(calls,0,'raw CI1 must not bypass the Dragon hunting-ground gate');
});

test('CRH1 requires the same Dragon episode, not merely any Dragon signal on the same ticker',async()=>{
  const oldEpisode='CRASH:SAME-TICKER:1:1';
  const newEpisode='CRASH:SAME-TICKER:2:2';
  const db=fakeDb([dragonApproval('SAME-TICKER',oldEpisode)]);
  const settings={...baseSettings(),dragonEnabled:true,crashRecoveryHunterEnabled:true,crashRecoveryMinEntryCents:70,crashRecoveryMaxEntryCents:89,crashRecoveryMaxSpreadCents:3};
  const learning={crashEntrySignal:()=>({version:'CI1',episodeId:newEpisode,episodeIndex:2,preCrashPeakCents:90,troughCents:60,crashDepthCents:30,reboundCents:20,reclaimRate:2/3,stableObservations:5,upwardTicks:3})};
  const strategy=new StrategyEngine({db,kalshi:{},market:{},learning,getSettings:()=>settings,getLiveReady:()=>false,refreshGameClock:refreshClock});
  let calls=0; strategy.createHunter=async()=>{calls+=1;return entry({conceptName:'Crash Recovery Hunter'});};
  const made=await strategy.evaluateCrashRecovery(new Map([['SAME-TICKER',q('SAME-TICKER',79,80)]]));
  assert.deepEqual(made,[]);
  assert.equal(calls,0,'an older Dragon episode on the ticker must not authorize a later crash');
});

test('CRH1 deterministically defers to RH1 when the same ticker has an eligible stopped Sagittarius source',async()=>{
  const loss=entry({id:'loss-crh',ticker:'CRH-RH1',eventTicker:'CRH-RH1',status:'closed',closeReason:'hard_stop_loss',exitPriceCents:45,closedAtMs:Date.now()-60_000,remainingCount:0});
  const episodeId='CRASH:CRH-RH1:1:1';
  const db=fakeDb([loss,dragonApproval('CRH-RH1',episodeId)]);
  const settings={...baseSettings(),dragonEnabled:true,crashRecoveryHunterEnabled:true,recoveryHunterEnabled:true,crashRecoveryMinEntryCents:70,crashRecoveryMaxEntryCents:89,crashRecoveryMaxSpreadCents:3};
  const learning={crashEntrySignal:()=>({version:'CI1',episodeId,episodeIndex:1,preCrashPeakCents:90,troughCents:45,crashDepthCents:45,reboundCents:35,reclaimRate:.78,stableObservations:4,upwardTicks:3})};
  const strategy=new StrategyEngine({db,kalshi:{},market:{},learning,getSettings:()=>settings,getLiveReady:()=>false,refreshGameClock:refreshClock});
  let calls=0; strategy.createHunter=async()=>{calls+=1;return entry({conceptName:'Crash Recovery Hunter'});};
  const made=await strategy.evaluateCrashRecovery(new Map([['CRH-RH1',q('CRH-RH1',79,80)]]));
  assert.equal(made.length,0); assert.equal(calls,0);
  assert.equal(db.audits.at(-1).event,'crash_recovery_deferred_to_recovery_hunter');
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

test('R35 feeder quote queue wakes ordinary feeder-driven Hunters without waiting for the scan phase', async () => {
  const engine=Object.create(SagittariusEngine.prototype);
  engine.running=true;
  engine.settings={mode:'SIMULATION',engineActive:true,waveSurferEnabled:true,momentumHunterEnabled:false};
  engine.feederPriorityTickers=new Set(['W']);
  engine.feederHunterEvaluationTimers=new Map();
  engine.market={getQuote:(ticker)=>q(ticker,80,81)};
  const calls=[];
  engine.strategy={async evaluateMomentumAndWave(map){calls.push(map.get('W'));return[];}};
  engine.db={async audit() {}};
  engine.isLiveReady=()=>false;
  engine.queueFeederHunterEvaluation('W');
  await new Promise((r)=>setTimeout(r,360));
  assert.equal(calls.length,1);
  assert.equal(calls[0].yesAsk,81);
  assert.equal(engine.feederHunterEvaluationTimers.size,0);
});


test('R35 EPT1 identifies the exact upstream game-clock reason before Athena or execution can be reached', async () => {
  const db=fakeDb();
  const s={...baseSettings(),waveSurferEnabled:true,pegasusEnabled:true,minGameMinutes:20,maxPositions:20,maxEntriesPerTrade:1,hunterCooldownMinutes:0,simFillProbability:1};
  const strategy=new StrategyEngine({
    db,kalshi:{},market:{},learning:{},athena:{assess(){throw new Error('Athena must not run after a GCA2 block');}},
    getSettings:()=>s,getLiveReady:()=>false,
    refreshGameClock:async(qq)=>({gameClockState:{version:'GCA2',eventTicker:qq.eventTicker||qq.ticker,phase:'UNKNOWN',confirmed:false,startTimeMs:null,entryAuthorized:false,reason:'activity_only_future_occurrence_blocked',lastCheckedAtMs:Date.now()},gameStartTimeMs:null,liveStatus:'live'}),
    random:()=>0,
  });
  const made=await strategy.createHunter('Wave Surfer',q('EPT-CLOCK',80,81),8100,35,{sourceFeeder:'Pegasus',sourceTradeId:'feed',entryQualificationSnapshot:{version:'WAVE-Q1',feederEntryPriceCents:65}});
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

test('R35 deterministic SIM test trade traverses feeder -> Wave -> GCA2 -> executable book -> Athena -> R13 -> cash -> fill -> persistence -> ProfitGuard settlement', async () => {
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
  let current={ticker:'R35-E2E',title:'R35 E2E market',eventTicker:'R35-E2E',seriesTicker:'KXITFMATCH',yesBid:80,yesAsk:81,volume24h:10000,updatedAtMs:now,status:'active',result:'',occurrenceTimeMs:now-60*60000,closeTimeMs:now+2*3600000,gameStartTimeMs:start,liveStatus:'live',bookInvalid:false,gameClockState:{version:'GCA2',eventTicker:'R35-E2E',phase:'CONFIRMED',confirmed:true,startTimeMs:start,source:'kalshi_live_data',sourceStrength:'strong',observedAtMs:start,entryAuthorized:true,evidenceObservedAtMs:now,lastCheckedAtMs:now,authorizationReason:'fresh_exact_milestone_live_data'}};
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
  const refreshGameClock=async(qq)=>{const t=Date.now();return{gameClockState:{...qq.gameClockState,version:'GCA2',eventTicker:'R35-E2E',phase:'CONFIRMED',confirmed:true,startTimeMs:start,source:'kalshi_live_data',sourceStrength:'strong',entryAuthorized:true,evidenceObservedAtMs:t,lastCheckedAtMs:t,authorizationReason:'fresh_exact_milestone_live_data'},gameStartTimeMs:start,liveStatus:'live'};};
  const learning={recoveryRate:async()=>null,onHardStop:async()=>{},profitLearningState:()=>null};
  const strategy=new StrategyEngine({db,kalshi:{},market,learning,athena,getSettings:()=>s,getLiveReady:()=>false,refreshGameClock,random:()=>0});
  const made=await strategy.evaluateMomentumAndWave(new Map([['R35-E2E',current]]));
  assert.equal(made.length,1);
  const hunter=made[0];
  assert.equal(hunter.conceptName,'Wave Surfer');
  assert.equal(hunter.sourceFeeder,'Pegasus');
  assert.equal(hunter.entryPriceCents,81);
  assert.ok(hunter.count>0);
  assert.equal(hunter.entryConfig.athena.brainHash,'r35-e2e-brain');
  assert.equal(athena.calls,1);
  const pipeline=strategy.entryPipelineSummary();
  for(const stage of ['GAME_CLOCK:PASS','EXECUTABLE_BOOK:PASS','LIFECYCLE:PASS','DOCTRINE:PASS','ATHENA:PASS','FINAL_CLOCK:PASS','R13_EXPOSURE:PASS','CAPITAL:PASS','EXECUTION:PASS','PERSISTENCE:PASS','OPENED:PASS']) assert.ok(pipeline.byStage[stage]>=1,`${stage} missing`);

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
