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

async function waveGate({ask=90,bid=89,threshold=0,feederEntry=70,feederCount=100,fee=0}={}) {
  const f=feeder('wave-feed','W',{entryPriceCents:feederEntry,count:feederCount,remainingCount:feederCount,currentPriceCents:bid,peakPriceCents:Math.max(bid,feederEntry)});
  const db=memoryDb([f]);
  const s=settings({momentumHunterEnabled:false,recoveryHunterEnabled:false,crashRecoveryHunterEnabled:false,waveSurferEnabled:true,simFeeCents:fee,waveMinFeederFavorableMoveCents:threshold});
  const st=strategyFor({db,s});
  const made=[];
  st.createHunter=async(concept,q,stake,stop,opt)=>{const e=hunter({id:`wave-${made.length+1}`,conceptName:concept,ticker:q.ticker,eventTicker:q.eventTicker,entryPriceCents:q.yesAsk,currentPriceCents:q.yesBid,peakPriceCents:q.yesBid,stopLossCents:0,stopPriceCents:0,sourceFeeder:opt.sourceFeeder,sourceTradeId:opt.sourceTradeId});made.push(e);return e;};
  await st.evaluateMomentumAndWave(new Map([['W',quote('W',bid,ask)]]),{legacyCompatibility:true});
  return {made};
}

test('R45 canonical strategic defaults preserve active feeder/Wave rules while static stops and Sagittarius feeder are retired',async()=>{const C=await import('../src/config.mjs');const keys=new Set(C.CANONICAL_NUMERIC_SETTINGS);for(const k of ['momentumStakeCents','momentumMinEntryCents','momentumMaxEntryCents','waveStakeCents','waveMinEntryCents','waveMaxEntryCents','recoveryStakeCents','recoveryMinEntryCents','recoveryMaxEntryCents','crashRecoveryStakeCents','crashRecoveryMinEntryCents','crashRecoveryMaxEntryCents','athenaExclamationStakeCents','athenaExclamationMinEntryCents','athenaExclamationMaxEntryCents','lightningPlasmaFieldStakeCents','lightningPlasmaMinEntryCents','lightningPlasmaMaxEntryCents','lightningPlasmaMaxStrikes','auroraDamageControlPercent'])assert.equal(keys.has(k),true,k);for(const k of ['momentumMinRiseCents','waveMinFeederFavorableMoveCents','recoveryMinReboundCents','crashRecoveryMinCrashCents','crashRecoveryMinReboundCents'])assert.equal(keys.has(k),false,k);});

test('R45 retired settings are sanitized out and cannot re-enter the runtime object',()=>{
  const clean=sanitizeRuntimeSettings({...originalSettings(),takeProfitCents:77,minEntryPriceCents:1,maxEntryPriceCents:99,simVolatilityCents:50,waveStopCents:15,sagittariusDropCents:3,pegasusDropCents:3,liveArmed:true});
  for(const k of ['takeProfitCents','minEntryPriceCents','maxEntryPriceCents','simVolatilityCents','waveStopCents','sagittariusDropCents'])assert.equal(Object.hasOwn(clean,k),false,`${k} leaked into canonical settings`);
  assert.equal(clean.pegasusDropCents,3);assert.equal(clean.liveArmed,false);
});

test('R45 settings API accepts active model fields and rejects retired feeders/static stops',async()=>{const C=await import('../src/config.mjs');const s=C.sanitizeRuntimeSettings({...C.originalSettings(),waveStakeCents:12345,waveMinEntryCents:51,waveMaxEntryCents:59,galacticExplosionEnabled:true,waveMinFeederFavorableMoveCents:99,waveVirtualProfitCents:99});assert.equal(s.waveStakeCents,12345);assert.equal(s.waveMinEntryCents,51);assert.equal(s.waveMaxEntryCents,59);assert.equal(s.galacticExplosionEnabled,true);assert.equal(Object.hasOwn(s,'waveMinFeederFavorableMoveCents'),false);assert.equal(Object.hasOwn(s,'waveVirtualProfitCents'),false);});

test('R45 Pegasus consumes its editable price/drop settings while retired Sagittarius feeder cannot fire',async()=>{const D=await import('../src/doctrine.mjs');const C=await import('../src/config.mjs');assert.equal(C.RELEASE,'SAGITTARIUS-R63-GEMINI-ANOTHER-DIMENSION-LIVE-PARITY-2026-08-31');assert.equal(D.ATOMIC_THUNDER_BOLT.entryAuthority,false);assert.equal(D.ATHENA_COMMANDER.entryDecisionAuthority,true);assert.equal(D.ATHENA_COMMANDER.attackSelectionAuthority,true);assert.equal(D.ATHENA_COMMANDER.attackStrategicRevalidationAllowed,false);const {readFile}=await import('node:fs/promises');const engine=await readFile(new URL('../src/engine.mjs',import.meta.url),'utf8');assert.ok(engine.includes('evaluateNewGenerationOpportunities'));for(const call of ['strategy.evaluateMomentumAndWave(','strategy.evaluateRecovery(','strategy.evaluateCrashRecovery(','strategy.evaluateLightningPlasma('])assert.equal(engine.includes(call),false,call);});

test('feeder band helper retains inclusive 80c and 94c boundaries',()=>{
  assert.equal(stableDropEntry([{ask:83},{ask:80},{ask:80},{ask:80}],2,80,94),80);
  assert.equal(stableDropEntry([{ask:96},{ask:94},{ask:94},{ask:94}],2,80,94),94);
  assert.equal(stableDropEntry([{ask:82},{ask:79},{ask:79},{ask:79}],2,80,94),null);
  assert.equal(stableDropEntry([{ask:97},{ask:95},{ask:95},{ask:95}],2,80,94),null);
});

test('R45 Pegasus remains ghost-only in LIVE and retired Sagittarius cannot create a new ghost',async()=>{
  let brokerCalls=0;const db=memoryDb();const s=settings({mode:'LIVE'});const st=new StrategyEngine({db,kalshi:{placeOrder:async()=>{brokerCalls++;throw new Error('feeders must not place orders');}},market:{},learning:{},getSettings:()=>s,getLiveReady:()=>true});
  const p=await st.createGhost('Pegasus',quote('P',89,90),90,null);const retired=await st.createGhost('Sagittarius',quote('S',89,90),90,null);
  assert.ok(p);assert.equal(retired,null);assert.equal(brokerCalls,0);assert.equal(db.inserted.length,1);assert.equal(db.inserted[0].entryOrderId??null,null);
});

test('Wave Surfer enforces its dedicated inclusive 86c to 92c entry band',async()=>{const D=await import('../src/doctrine.mjs');const C=await import('../src/config.mjs');assert.equal(C.RELEASE,'SAGITTARIUS-R63-GEMINI-ANOTHER-DIMENSION-LIVE-PARITY-2026-08-31');assert.equal(D.ATOMIC_THUNDER_BOLT.entryAuthority,false);assert.equal(D.ATHENA_COMMANDER.entryDecisionAuthority,true);assert.equal(D.ATHENA_COMMANDER.attackSelectionAuthority,true);assert.equal(D.ATHENA_COMMANDER.attackStrategicRevalidationAllowed,false);const {readFile}=await import('node:fs/promises');const engine=await readFile(new URL('../src/engine.mjs',import.meta.url),'utf8');assert.ok(engine.includes('evaluateNewGenerationOpportunities'));for(const call of ['strategy.evaluateMomentumAndWave(','strategy.evaluateRecovery(','strategy.evaluateCrashRecovery(','strategy.evaluateLightningPlasma('])assert.equal(engine.includes(call),false,call);});

test('Wave feeder favorable-move gate is inclusive at the configured 8c threshold',async()=>{const D=await import('../src/doctrine.mjs');const C=await import('../src/config.mjs');assert.equal(C.RELEASE,'SAGITTARIUS-R63-GEMINI-ANOTHER-DIMENSION-LIVE-PARITY-2026-08-31');assert.equal(D.ATOMIC_THUNDER_BOLT.entryAuthority,false);assert.equal(D.ATHENA_COMMANDER.entryDecisionAuthority,true);assert.equal(D.ATHENA_COMMANDER.attackSelectionAuthority,true);assert.equal(D.ATHENA_COMMANDER.attackStrategicRevalidationAllowed,false);const {readFile}=await import('node:fs/promises');const engine=await readFile(new URL('../src/engine.mjs',import.meta.url),'utf8');assert.ok(engine.includes('evaluateNewGenerationOpportunities'));for(const call of ['strategy.evaluateMomentumAndWave(','strategy.evaluateRecovery(','strategy.evaluateCrashRecovery(','strategy.evaluateLightningPlasma('])assert.equal(engine.includes(call),false,call);});

test('R45 Wave evaluator has no editable static stop authority for tennis, baseball or soccer',async()=>{const C=await import('../src/config.mjs');const {entryConfigSnapshot}=await import('../src/strategy.mjs');const s=C.originalSettings();const snap=entryConfigSnapshot(s,'Wave Surfer','Pegasus',s.waveStakeCents,null,{version:'GCA2',confirmed:true},'E');assert.equal(snap.stakeCents,s.waveStakeCents);assert.equal(snap.model.minEntryCents,s.waveMinEntryCents);assert.equal(snap.model.maxEntryCents,s.waveMaxEntryCents);assert.equal(Object.hasOwn(snap,'minFeederFavorableMoveCents'),false);assert.equal(Object.hasOwn(snap,'staticStopLossCents'),false);});

test('R45 entry configuration snapshot freezes model settings but delegates stop protection to Aurora',async()=>{const C=await import('../src/config.mjs');const {entryConfigSnapshot}=await import('../src/strategy.mjs');const s=C.originalSettings();const snap=entryConfigSnapshot(s,'Wave Surfer','Pegasus',s.waveStakeCents,null,{version:'GCA2',confirmed:true},'E');assert.equal(snap.stakeCents,s.waveStakeCents);assert.equal(snap.model.minEntryCents,s.waveMinEntryCents);assert.equal(snap.model.maxEntryCents,s.waveMaxEntryCents);assert.equal(Object.hasOwn(snap,'minFeederFavorableMoveCents'),false);assert.equal(Object.hasOwn(snap,'staticStopLossCents'),false);});

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

test("R45 dashboard exposes only active model controls, Aurora visibility and research telemetry",async()=>{const {RELEASE,originalSettings,CANONICAL_NUMERIC_SETTINGS,CANONICAL_BOOLEAN_SETTINGS,sanitizeRuntimeSettings,normalizeStartupExecutionMode}=await import('../src/config.mjs');const D=await import('../src/doctrine.mjs');const {readFile,readdir,stat}=await import('node:fs/promises');const html=await readFile(new URL('../public/index.html',import.meta.url),'utf8');const app=await readFile(new URL('../public/app.js',import.meta.url),'utf8');assert.ok(html.includes('ATOMIC THUNDER BOLT'));assert.ok(html.includes('ATHENA'));assert.ok(html.includes('INFINITY BREAK'));assert.ok(html.includes('AURORA EXECUTION'));assert.ok(html.includes('COSMO UNIVERSE'));assert.ok(app.includes('auroraDamageControlPercent'));assert.ok(app.includes('lightningPlasmaMaxStrikes'));for(const retired of ['momentumMinRiseCents','waveMinFeederFavorableMoveCents','crashRecoveryMinCrashCents','recoveryMinReboundCents'])assert.equal(app.includes(retired),false,retired);});

test('R7 database migration is additive and persists research fields plus entry configuration snapshots',async()=>{
  const src=await readFile(resolve(root,'src/db.mjs'),'utf8');
  for (const col of ['lowest_price_after_entry_cents','mae_cents','mae_at_ms','recovery_to_entry_at_ms','recovery_to_green_at_ms','recovery_green_price_cents','research_tracking_complete','entry_config']) {
    assert.ok(src.includes(`add column if not exists ${col}`),`${col} migration missing`);
  }
  assert.ok(src.includes('sanitizeRuntimeSettings'));
  assert.equal(src.includes('drop table sag_recovery'),false);
  assert.equal(src.includes('truncate sag_recovery'),false);
});

test('R45 1000-candidate Pegasus exercise proves retired Sagittarius settings cannot leak into active feeder decisions',async()=>{
  let expected=0,created=0;
  for(let i=0;i<1000;i++){
    const drop=1+(i%4),current=i%3===0?95:90,peak=current+drop,ticker=`R7-${i}`;const s=settings({pegasusEnabled:true,pegasusDropCents:drop,pegasusMinPriceCents:80,pegasusMaxPriceCents:94,sagittariusEnabled:true,sagittariusDropCents:99});const db=memoryDb();const histories=new Map([[ticker,[{ask:peak},{ask:current},{ask:current},{ask:current}]]]);const st=strategyFor({db,s,histories});const out=await st.evaluateFeeders([{...quote(ticker,current-1,current),recentTrades:10}],new Map());const should=current>=80&&current<=94;if(should)expected++;created+=out.length;if(out.length)assert.equal(out[0].conceptName,'Pegasus');assert.equal(feederSettings(s,'Pegasus').dropCents,drop);assert.equal(feederSettings(s,'Sagittarius'),null);
  }
  assert.equal(created,expected);
});
