import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { originalSettings, sanitizeRuntimeSettings, RELEASE } from '../src/config.mjs';
import { stableDropEntry } from '../src/doctrine.mjs';
import { StrategyEngine, feederSettings, entryConfigSnapshot } from '../src/strategy.mjs';
import { ProfitGuard } from '../src/profitGuard.mjs';
import { SagittariusEngine } from '../src/engine.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const openLike = (s) => ['open','entry_pending','exit_pending','pending_recovery'].includes(s);
const settings = (overrides={}) => ({
  ...originalSettings(),
  systemName:'SAGITTARIUS', ownerId:'r7-test', mode:'SIMULATION', liveArmed:false,
  maxPositions:20, eventCooldownMinutes:0, simFillProbability:1,
  ...overrides,
});

function quote(ticker='T', bid=89, ask=90) {
  return { ticker, title:ticker, eventTicker:ticker, seriesTicker:ticker, yesBid:bid, yesAsk:ask, recentTrades:10, volume24h:10000, updatedAtMs:Date.now(), status:'active', result:'' };
}

function memoryDb(initial=[]) {
  const rows = new Map(initial.map((x)=>[x.id, structuredClone(x)]));
  return {
    rows, inserted:[], audits:[], saved:null,
    async entries(){return [...rows.values()];},
    async insertEntry(e){const x=structuredClone(e);this.inserted.push(x);rows.set(e.id,x);},
    async updateEntry(id,patch){const e=rows.get(id);if(e)Object.assign(e,structuredClone(patch));},
    async entryById(id){return rows.get(id)||null;},
    async openEntries(){return [...rows.values()].filter((e)=>openLike(e.status));},
    async openEntriesByTicker(_system,ticker){return [...rows.values()].filter((e)=>e.ticker===ticker&&openLike(e.status));},
    async recentClosed(){return [...rows.values()].filter((e)=>e.status==='closed');},
    async audit(level,event,data){this.audits.push({level,event,data});},
    async saveSettings(v){this.saved=structuredClone(v);},
  };
}

function feeder(id,ticker='T', overrides={}) {
  const now=Date.now();
  return {
    id, systemName:'SAGITTARIUS', ownerId:'r7-test', conceptName:'Pegasus', sourceFeeder:null, sourceTradeId:null,
    ticker, eventTicker:ticker, marketTitle:ticker, mode:'SIMULATION', status:'open', entryPriceCents:80, currentPriceCents:90,
    peakPriceCents:90, stopPriceCents:0, stopLossCents:0, count:100, remainingCount:100, pnlCents:0,
    openedAtMs:now-60000, updatedAtMs:now-1000, gameStartTimeMs:now-30*60000, gameClockState:{version:'GCA1',phase:'CONFIRMED',confirmed:true,startTimeMs:now-30*60000,source:'kalshi_live_data'}, ...overrides,
  };
}

function hunter(overrides={}) {
  const now=Date.now();
  return {
    id:'h1', systemName:'SAGITTARIUS', ownerId:'r7-test', conceptName:'Wave Surfer', ticker:'T', eventTicker:'T', marketTitle:'T',
    mode:'SIMULATION', status:'open', entryPriceCents:90, currentPriceCents:90, peakPriceCents:90, stopPriceCents:76, stopLossCents:14,
    count:10, remainingCount:10, pnlCents:0, entryFeeCents:20, exitFeeCents:0, exitFilledCount:0, exitNotionalCents:0,
    lowestPriceAfterEntryCents:null, maeCents:0, maeAtMs:null, recoveryToEntryAtMs:null, recoveryToGreenAtMs:null,
    recoveryGreenPriceCents:null, researchTrackingComplete:false, openedAtMs:now-60000, updatedAtMs:now-1000, ...overrides,
  };
}

function strategyFor({db=memoryDb(), s=settings(), histories=new Map(), marketExtra={}}={}) {
  const market={
    getHistory:(ticker)=>histories.get(ticker)||[],
    async refreshTicker(ticker){return quote(ticker);},
    executableAsk:()=>({filled:1000,full:true,avgCents:90,bestCents:90}),
    ...marketExtra,
  };
  return new StrategyEngine({db,kalshi:{},market,learning:{recoveryRate:async()=>null},getSettings:()=>s,getLiveReady:()=>false,random:()=>0});
}

test('R8 canonical strategic defaults retain R7 Golden controls and add feeder-move decoupling',()=>{
  const s=originalSettings();
  assert.ok(RELEASE.startsWith('SAGITTARIUS-R43-') || RELEASE.startsWith('SAGITTARIUS-R42-') || RELEASE.startsWith('SAGITTARIUS-R41-') || RELEASE.startsWith('SAGITTARIUS-R40-') || RELEASE.startsWith('SAGITTARIUS-R39-') || RELEASE.startsWith('SAGITTARIUS-R38-') || RELEASE.startsWith('SAGITTARIUS-R37-') || RELEASE.startsWith('SAGITTARIUS-R36-') || RELEASE.startsWith('SAGITTARIUS-R35-') || RELEASE.startsWith('SAGITTARIUS-R34-') || RELEASE.startsWith('SAGITTARIUS-R33-') || RELEASE.startsWith('SAGITTARIUS-R32-') || RELEASE.startsWith('SAGITTARIUS-R31-') || RELEASE.startsWith('SAGITTARIUS-R30-') || RELEASE.startsWith('SAGITTARIUS-R29-') || RELEASE.startsWith('SAGITTARIUS-R28-') || RELEASE.startsWith('SAGITTARIUS-R27-') || RELEASE.startsWith('SAGITTARIUS-R26-') || RELEASE.startsWith('SAGITTARIUS-R25-') || RELEASE.startsWith('SAGITTARIUS-R24-') || RELEASE.startsWith('SAGITTARIUS-R23-') || RELEASE.startsWith('SAGITTARIUS-R21-') || RELEASE.startsWith('SAGITTARIUS-R20-') || RELEASE.startsWith('SAGITTARIUS-R19-') || RELEASE.startsWith('SAGITTARIUS-R18-') || RELEASE.startsWith('SAGITTARIUS-R17-') || RELEASE.startsWith('SAGITTARIUS-R16-') || RELEASE.startsWith('SAGITTARIUS-R15-') || RELEASE.startsWith('SAGITTARIUS-R14-') || RELEASE.startsWith('SAGITTARIUS-R13-') || RELEASE.startsWith('SAGITTARIUS-R12-') || RELEASE.startsWith('SAGITTARIUS-R11-') || RELEASE.startsWith('SAGITTARIUS-R10-') || RELEASE.startsWith('SAGITTARIUS-R9-') || RELEASE === 'SAGITTARIUS-R8-FEEDER-REFERENCE-DECOUPLING-2026-08-18');
  assert.deepEqual([s.pegasusMinPriceCents,s.pegasusMaxPriceCents,s.pegasusDropCents],[80,94,2]);
  assert.deepEqual([s.sagittariusMinPriceCents,s.sagittariusMaxPriceCents,s.sagittariusDropCents],[80,94,1]);
  assert.deepEqual([s.waveMinEntryCents,s.waveMaxEntryCents,s.waveStopCents,s.waveMinFeederFavorableMoveCents],[86,92,14,8]);
  assert.equal(s.momentumHunterStopLossCents,10);
  assert.equal(s.recoveryHunterStopLossCents,10);
});

test('retired settings are sanitized out and cannot re-enter the runtime object',()=>{
  const clean=sanitizeRuntimeSettings({
    ...originalSettings(),
    takeProfitCents:77,
    minEntryPriceCents:1,
    maxEntryPriceCents:99,
    simVolatilityCents:50,
    waveStopCents:15,
    pegasusDropCents:3,
    liveArmed:true,
  });
  for (const k of ['takeProfitCents','minEntryPriceCents','maxEntryPriceCents','simVolatilityCents']) assert.equal(Object.hasOwn(clean,k),false,`${k} leaked into canonical settings`);
  assert.equal(clean.waveStopCents,15);
  assert.equal(clean.pegasusDropCents,3);
  assert.equal(clean.liveArmed,false,'restart sanitation must keep LIVE disarmed');
});

test('settings API rejects retired keys while accepting the new model settings',async()=>{
  const engine=Object.create(SagittariusEngine.prototype);
  engine.settings=settings();
  engine.db={saveSettings:async(v)=>{engine.saved=structuredClone(v);}};
  await engine.patchSettings({pegasusMinPriceCents:81,sagittariusDropCents:2,waveMinEntryCents:87,waveStopCents:15,waveMinFeederFavorableMoveCents:9});
  assert.equal(engine.settings.pegasusMinPriceCents,81);
  assert.equal(engine.settings.sagittariusDropCents,2);
  assert.equal(engine.settings.waveStopCents,15);
  await assert.rejects(()=>engine.patchSettings({takeProfitCents:10}),/Unknown or retired setting/);
});

test('Pegasus and Sagittarius consume independent editable price/drop settings',async()=>{
  {
    const db=memoryDb();
    const s=settings({sagittariusEnabled:false,pegasusDropCents:2});
    const histories=new Map([['P',[{ask:95},{ask:93},{ask:93},{ask:93}]]]);
    const st=strategyFor({db,s,histories});
    const made=await st.evaluateFeeders([{...quote('P',92,93),recentTrades:10}],new Map());
    assert.equal(made.length,1); assert.equal(made[0].conceptName,'Pegasus');
  }
  {
    const db=memoryDb();
    const s=settings({sagittariusEnabled:false,pegasusDropCents:3});
    const histories=new Map([['P',[{ask:95},{ask:93},{ask:93},{ask:93}]]]);
    const st=strategyFor({db,s,histories});
    assert.equal((await st.evaluateFeeders([{...quote('P',92,93),recentTrades:10}],new Map())).length,0);
  }
  {
    const db=memoryDb();
    const s=settings({pegasusEnabled:false,sagittariusEnabled:true,pegasusDropCents:9,sagittariusDropCents:1});
    const histories=new Map([['S',[{ask:94},{ask:93},{ask:93},{ask:93}]]]);
    const st=strategyFor({db,s,histories});
    const made=await st.evaluateFeeders([{...quote('S',92,93),recentTrades:10}],new Map());
    assert.equal(made.length,1); assert.equal(made[0].conceptName,'Sagittarius');
  }
});

test('feeder band helper retains inclusive 80c and 94c boundaries',()=>{
  assert.equal(stableDropEntry([{ask:83},{ask:80},{ask:80},{ask:80}],2,80,94),80);
  assert.equal(stableDropEntry([{ask:96},{ask:94},{ask:94},{ask:94}],2,80,94),94);
  assert.equal(stableDropEntry([{ask:82},{ask:79},{ask:79},{ask:79}],2,80,94),null);
  assert.equal(stableDropEntry([{ask:97},{ask:95},{ask:95},{ask:95}],2,80,94),null);
});

test('Pegasus and Sagittarius remain ghost-only even when runtime mode is LIVE',async()=>{
  let brokerCalls=0;
  const db=memoryDb();
  const s=settings({mode:'LIVE'});
  const st=new StrategyEngine({db,kalshi:{placeOrder:async()=>{brokerCalls+=1;throw new Error('feeders must not place orders');}},market:{},learning:{},getSettings:()=>s,getLiveReady:()=>true});
  await st.createGhost('Pegasus',quote('P',89,90),90,null);
  await st.createGhost('Sagittarius',quote('S',89,90),90,null);
  assert.equal(brokerCalls,0);
  assert.equal(db.inserted.length,2);
  assert.ok(db.inserted.every((e)=>e.entryOrderId==null&&e.entryClientOrderId==null));
});

async function waveGate({ask=90,bid=89,threshold=0,feederEntry=70,feederCount=100,fee=0}={}) {
  const f=feeder('f','W',{entryPriceCents:feederEntry,count:feederCount,remainingCount:feederCount});
  const db=memoryDb([f]);
  const s=settings({momentumHunterEnabled:false,recoveryHunterEnabled:false,simFeeCents:fee,waveMinFeederFavorableMoveCents:threshold});
  const st=strategyFor({db,s});
  let captured=null;
  st.createHunter=async(concept,q,_stake,stop,opt)=>{captured={concept,q,stop,opt};return hunter({id:'wave',ticker:q.ticker,conceptName:concept,stopLossCents:stop,sourceFeeder:opt.sourceFeeder,sourceTradeId:opt.sourceTradeId});};
  const made=await st.evaluateMomentumAndWave(new Map([['W',quote('W',bid,ask)]]));
  return {made,captured};
}

test('Wave Surfer enforces its dedicated inclusive 86c to 92c entry band',async()=>{
  for (const [ask,allowed] of [[85,false],[86,true],[92,true],[93,false]]) {
    const {made}=await waveGate({ask,bid:ask,threshold:0,feederEntry:70,fee:0});
    assert.equal(made.length,allowed?1:0,`Wave boundary failed at ${ask}c`);
  }
});

test('Wave feeder favorable-move gate is inclusive at the configured 8c threshold',async()=>{
  const below=await waveGate({ask:90,bid:89,threshold:8,feederEntry:82,feederCount:1,fee:99}); // +7c
  assert.equal(below.made.length,0);
  const exact=await waveGate({ask:90,bid:90,threshold:8,feederEntry:82,feederCount:1000,fee:0}); // +8c
  assert.equal(exact.made.length,1);
});

test('Wave uses one universal editable stop for tennis, baseball and soccer',async()=>{
  const tickers=['KXATPMATCH-R7-A','KXMLBGAME-R7-A','KXEPLGAME-R7-A'];
  const rows=tickers.map((t,i)=>feeder(`f${i}`,t,{entryPriceCents:70,count:100,remainingCount:100}));
  const db=memoryDb(rows);
  const s=settings({momentumHunterEnabled:false,recoveryHunterEnabled:false,simFeeCents:0,waveMinFeederFavorableMoveCents:0,waveStopCents:14});
  const st=strategyFor({db,s});
  const stops=[];
  st.createHunter=async(concept,q,_stake,stop,opt)=>{stops.push([q.ticker,stop]);return hunter({id:`w-${q.ticker}`,ticker:q.ticker,conceptName:concept,stopLossCents:stop,sourceFeeder:opt.sourceFeeder});};
  const map=new Map(tickers.map((t)=>[t,quote(t,89,90)]));
  const made=await st.evaluateMomentumAndWave(map);
  assert.equal(made.length,3);
  assert.deepEqual(stops.map((x)=>x[1]),[14,14,14]);
});

test('entry configuration snapshot freezes the actual per-trade strategy configuration and actual Recovery stake',()=>{
  const s=settings();
  const snap=entryConfigSnapshot(s,'Recovery Hunter',null,40000);
  assert.equal(snap.stakeCents,40000);
  assert.equal(snap.model.stopCents,10);
  assert.equal(snap.model.baseStakeCents,20000);
  assert.equal(snap.model.actualStakeCents,40000);
  const sourceEntryConfig={feeder:{minPriceCents:81,maxPriceCents:93,dropCents:3},referenceStakeCents:3000,maxSpreadCents:3};
  const wave=entryConfigSnapshot(s,'Wave Surfer','Pegasus',20000,sourceEntryConfig);
  assert.deepEqual(wave.feeder,{minPriceCents:81,maxPriceCents:93,dropCents:3,referenceStakeCents:3000,maxSpreadCents:3});
  assert.deepEqual(wave.model,{stakeCents:20000,minEntryCents:86,maxEntryCents:92,stopCents:14,minFeederFavorableMoveCents:8,maxSpreadCents:3});
  s.waveStopCents=20; s.pegasusDropCents=5; sourceEntryConfig.feeder.dropCents=8;
  assert.equal(wave.model.stopCents,14); assert.equal(wave.feeder.dropCents,3);
});

test('MAE tracks the lowest executable full-position price and preserves the time of the worst excursion',async()=>{
  const e=hunter({entryPriceCents:90});
  const db=memoryDb([e]);
  let px=89;
  const market={executableBid:()=>({filled:10,full:true,avgCents:px,bestCents:px})};
  const guard=new ProfitGuard({db,kalshi:{},market,learning:{},getSettings:()=>settings()});
  let worstAt=null;
  for (const p of [89,86,81,84,79,88]) {
    px=p;
    await guard.updateMae(db.rows.get('h1'),{yesBid:p,status:'active',result:''});
    if (p===79) worstAt=db.rows.get('h1').maeAtMs;
  }
  const out=db.rows.get('h1');
  assert.equal(out.lowestPriceAfterEntryCents,79);
  assert.equal(out.maeCents,11);
  assert.equal(out.maeAtMs,worstAt);
});

test('MAE research price prefers executable full-position VWAP and fails back to observed bid when full depth is unavailable',()=>{
  const e=hunter({entryPriceCents:90,count:10,remainingCount:10});
  let full=true;
  const market={executableBid:()=>full?{filled:10,full:true,avgCents:80,bestCents:82}:{filled:3,full:false,avgCents:80,bestCents:82}};
  const guard=new ProfitGuard({db:memoryDb(),kalshi:{},market,learning:{},getSettings:()=>settings()});
  assert.equal(guard.researchPrice(e,{yesBid:82,status:'active',result:''}),80);
  full=false;
  assert.equal(guard.researchPrice(e,{yesBid:82,status:'active',result:''}),82);
});

test('post-stop research independently records recovery to entry and fee-aware recovery to net green',async()=>{
  const now=Date.now();
  const e=hunter({id:'stopped',status:'closed',entryPriceCents:80,exitPriceCents:66,stopLossCents:14,closeReason:'hard_stop_loss',closedAtMs:now-1000,entryFeeCents:20,count:10,remainingCount:0});
  const db=memoryDb([e]);
  let bid=80, full=true;
  const market={
    getQuote:()=>({yesBid:bid,yesAsk:bid+1,status:'active',result:'',updatedAtMs:Date.now()}),
    quoteAgeMs:()=>0,
    refreshTicker:async()=>({yesBid:bid,yesAsk:bid+1,status:'active',result:'',updatedAtMs:Date.now()}),
    executableBid:()=>full?({filled:10,full:true,avgCents:bid,bestCents:bid}):({filled:3,full:false,avgCents:bid,bestCents:bid}),
  };
  const guard=new ProfitGuard({db,kalshi:{},market,learning:{},getSettings:()=>settings({simFeeCents:2,recoveryTrackingHours:24})});
  await guard.trackPostExit();
  assert.ok(db.rows.get('stopped').recoveryToEntryAtMs);
  assert.equal(db.rows.get('stopped').recoveryToGreenAtMs,null);
  bid=84; await guard.trackPostExit(); // +4c is exactly break-even after 2c each leg
  assert.equal(db.rows.get('stopped').recoveryToGreenAtMs,null);
  bid=85; full=false; await guard.trackPostExit();
  assert.equal(db.rows.get('stopped').recoveryToGreenAtMs,null,'thin top-of-book must not count as executable full-position recovery');
  full=true; await guard.trackPostExit();
  assert.ok(db.rows.get('stopped').recoveryToGreenAtMs);
  assert.equal(db.rows.get('stopped').recoveryGreenPriceCents,85);
  assert.equal(db.rows.get('stopped').researchTrackingComplete,true);
});

test('scanner candidate priority uses active model-specific bands instead of retired global entry bands',async()=>{
  const engine=Object.create(SagittariusEngine.prototype);
  engine.settings=settings({pegasusEnabled:false,sagittariusEnabled:false,momentumHunterEnabled:false,recoveryHunterEnabled:false,waveSurferEnabled:true,waveMinEntryCents:86,waveMaxEntryCents:92});
  const stored=[];
  engine.db={
    trackers:async()=>[], openEntries:async()=>[],
    upsertTracker:async(_s,q)=>{stored.push(q.ticker);},
    deleteStaleTrackers:async()=>{},
  };
  engine.market={getHistory:()=>[]};
  const markets=[];
  for(let i=0;i<50;i++) markets.push({...quote(`OUT${i}`,79,80),recentTrades:0,occurrenceTimeMs:Date.now()+3600000,closeTimeMs:Date.now()+7200000});
  for(let i=0;i<10;i++) markets.push({...quote(`WAVE${i}`,89,90),recentTrades:0,occurrenceTimeMs:Date.now()+3600000,closeTimeMs:Date.now()+7200000});
  await engine.persistTrackers(markets);
  for(let i=0;i<10;i++) assert.ok(stored.includes(`WAVE${i}`),`active Wave-band candidate WAVE${i} was starved`);
  assert.equal(stored.length,50);
});

test('dashboard exposes only canonical active controls plus model-specific R7 controls and research telemetry',async()=>{
  const app=await readFile(resolve(root,'public/app.js'),'utf8');
  const html=await readFile(resolve(root,'public/index.html'),'utf8');
  for (const key of ['pegasusMinPriceCents','pegasusMaxPriceCents','pegasusDropCents','sagittariusMinPriceCents','sagittariusMaxPriceCents','sagittariusDropCents','waveMinEntryCents','waveMaxEntryCents','waveStopCents','waveMinFeederFavorableMoveCents']) assert.ok(app.includes(key),`${key} missing from dashboard`);
  for (const retired of ["'takeProfitCents'","'maxExitPriceCents'","'stopLossCents'","'minEntryPriceCents'","'maxEntryPriceCents'","'simVolatilityCents'","'simDriftCents'","'simReversionCents'","'simSettlementProbability'"]) assert.equal(app.includes(retired),false,`${retired} still exposed`);
  assert.ok(html.includes('<th>Research</th>'));
  for (const label of ['Low ','MAE','Recovery→entry']) assert.ok(app.includes(label));
});

test('R7 database migration is additive and persists research fields plus entry configuration snapshots',async()=>{
  const src=await readFile(resolve(root,'src/db.mjs'),'utf8');
  for (const col of ['lowest_price_after_entry_cents','mae_cents','mae_at_ms','recovery_to_entry_at_ms','recovery_to_green_at_ms','recovery_green_price_cents','research_tracking_complete','entry_config']) {
    assert.ok(src.includes(`add column if not exists ${col}`),`${col} migration missing`);
  }
  assert.ok(src.includes('sanitizeRuntimeSettings'));
  assert.equal(src.includes('drop table sag_recovery'),false);
  assert.equal(src.includes('truncate sag_recovery'),false);
});

test('1000-candidate feeder settings exercise shows no Pegasus/Sagittarius cross-model leakage',async()=>{
  let expected=0,created=0;
  for(let i=0;i<1000;i++) {
    const usePegasus=i%2===0;
    const drop=1+(i%4);
    const current=i%3===0?95:90;
    const peak=current+drop;
    const name=usePegasus?'Pegasus':'Sagittarius';
    const ticker=`R7-${i}`;
    const s=settings({
      pegasusEnabled:usePegasus,sagittariusEnabled:!usePegasus,
      pegasusDropCents:usePegasus?drop:9,sagittariusDropCents:usePegasus?9:drop,
      pegasusMinPriceCents:80,pegasusMaxPriceCents:94,sagittariusMinPriceCents:80,sagittariusMaxPriceCents:94,
    });
    const db=memoryDb();
    const histories=new Map([[ticker,[{ask:peak},{ask:current},{ask:current},{ask:current}]]]);
    const st=strategyFor({db,s,histories});
    const out=await st.evaluateFeeders([{...quote(ticker,current-1,current),recentTrades:10}],new Map());
    const should=current>=80&&current<=94;
    if(should) expected+=1;
    created+=out.length;
    if(out.length) assert.equal(out[0].conceptName,name);
    const own=feederSettings(s,name); const other=feederSettings(s,usePegasus?'Sagittarius':'Pegasus');
    assert.equal(own.dropCents,drop); assert.equal(other.dropCents,9);
  }
  assert.equal(created,expected);
});
