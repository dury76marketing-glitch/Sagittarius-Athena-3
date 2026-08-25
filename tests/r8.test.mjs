import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { originalSettings, sanitizeRuntimeSettings, RELEASE } from '../src/config.mjs';
import { StrategyEngine } from '../src/strategy.mjs';
import { SagittariusEngine } from '../src/engine.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const now = () => Date.now();
const openLike = (s) => ['open','entry_pending','exit_pending','pending_recovery'].includes(s);
const settings = (overrides={}) => ({
  ...originalSettings(), systemName:'SAGITTARIUS', ownerId:'r8-test', mode:'SIMULATION',
  liveArmed:false, maxPositions:50, eventCooldownMinutes:0, simFillProbability:1,
  recoveryMinObservations:5, recoveryMinRate:.7, ...overrides,
});
function quote(ticker='T', bid=89, ask=90) {
  const t=now(); const start=t-30*60000;
  return {ticker,title:ticker,eventTicker:ticker,seriesTicker:ticker,yesBid:bid,yesAsk:ask,recentTrades:20,volume24h:10000,updatedAtMs:t,status:'active',result:'',closeTimeMs:t+2*60*60*1000,gameStartTimeMs:start,gameClockState:{version:'GCA1',eventTicker:ticker,phase:'CONFIRMED',confirmed:true,startTimeMs:start,source:'kalshi_live_data'}};
}
function feeder(id='f', ticker='T', overrides={}) {
  const t=now();
  return {id,systemName:'SAGITTARIUS',ownerId:'r8-test',conceptName:'Pegasus',sourceFeeder:null,sourceTradeId:null,
    ticker,eventTicker:ticker,marketTitle:ticker,mode:'SIMULATION',status:'open',entryPriceCents:82,currentPriceCents:90,
    peakPriceCents:90,stopPriceCents:0,stopLossCents:0,count:36,remainingCount:36,pnlCents:0,openedAtMs:t-60000,
    updatedAtMs:t-1000,gameStartTimeMs:t-30*60000,gameClockState:{version:'GCA1',phase:'CONFIRMED',confirmed:true,startTimeMs:t-30*60000,source:'kalshi_live_data'},entryConfig:{referenceStakeCents:3000,feeder:{minPriceCents:80,maxPriceCents:94,dropCents:2}},...overrides};
}
function loss(id='loss', ticker='R', overrides={}) {
  const t=now();
  return {id,systemName:'SAGITTARIUS',ownerId:'r8-test',conceptName:'Momentum Hunter',sourceFeeder:'Pegasus',sourceTradeId:'f',
    ticker,eventTicker:ticker,marketTitle:ticker,mode:'SIMULATION',status:'closed',entryPriceCents:88,exitPriceCents:74,currentPriceCents:74,
    peakPriceCents:88,stopPriceCents:78,stopLossCents:10,count:10,remainingCount:0,pnlCents:-140,closeReason:'hard_stop_loss',
    openedAtMs:t-120000,updatedAtMs:t-60000,closedAtMs:t-60000,gameStartTimeMs:t-30*60000,...overrides};
}
function memoryDb(initial=[]) {
  const rows=new Map(initial.map((x)=>[x.id,structuredClone(x)]));
  return {rows,inserted:[],audits:[],saved:null,
    async entries(){return [...rows.values()];},
    async insertEntry(e){const x=structuredClone(e);rows.set(e.id,x);this.inserted.push(x);},
    async updateEntry(id,patch){const e=rows.get(id);if(e)Object.assign(e,structuredClone(patch));},
    async entryById(id){return rows.get(id)||null;},
    async openEntries(){return [...rows.values()].filter((e)=>openLike(e.status));},
    async openEntriesByTicker(_system,ticker){return [...rows.values()].filter((e)=>e.ticker===ticker&&openLike(e.status));},
    async recentClosed(){return [...rows.values()].filter((e)=>e.status==='closed');},
    async audit(level,event,data){this.audits.push({level,event,data});},
    async saveSettings(v){this.saved=structuredClone(v);},
  };
}
function strategy({db,s,marketExtra={}}) {
  const market={
    getHistory:()=>[],
    async refreshTicker(ticker){return quote(ticker);},
    executableAsk:()=>({filled:1000,full:true,avgCents:90,bestCents:90}),
    ...marketExtra,
  };
  return new StrategyEngine({db,kalshi:{},market,learning:{recoveryRate:async()=>null},getSettings:()=>s,getLiveReady:()=>false,random:()=>0});
}

async function waveDecision({count=1, fee=0, feederStake=3000, feederEntry=82, bid=90, ask=91, threshold=8}={}) {
  const f=feeder('f','W',{entryPriceCents:feederEntry,count,remainingCount:count,entryConfig:{referenceStakeCents:feederStake,feeder:{minPriceCents:80,maxPriceCents:94,dropCents:2}}});
  const db=memoryDb([f]);
  const s=settings({pegasusReferenceStakeCents:feederStake,momentumHunterEnabled:false,recoveryHunterEnabled:false,waveSurferEnabled:true,simFeeCents:fee,waveMinFeederFavorableMoveCents:threshold});
  const st=strategy({db,s});
  const made=[];
  st.createHunter=async(concept,q,stake,stop,opt)=>{const x={concept,ticker:q.ticker,stake,stop,opt};made.push(x);return {id:`w-${made.length}`,conceptName:concept,ticker:q.ticker,status:'open',openedAtMs:now(),sourceFeeder:opt.sourceFeeder};};
  await st.evaluateMomentumAndWave(new Map([['W',quote('W',bid,ask)]]));
  return made;
}

async function momentumDecision({count=1, feederStake=3000}={}) {
  const f=feeder('f','M',{entryPriceCents:82,currentPriceCents:86,peakPriceCents:90,count,remainingCount:count,entryConfig:{referenceStakeCents:feederStake,feeder:{minPriceCents:80,maxPriceCents:94,dropCents:2}}});
  const db=memoryDb([f]);
  const s=settings({pegasusReferenceStakeCents:feederStake,momentumHunterEnabled:true,waveSurferEnabled:false,recoveryHunterEnabled:false});
  const st=strategy({db,s});
  const made=[];
  st.createHunter=async(concept,q,stake,stop,opt)=>{made.push({concept,ticker:q.ticker,stake,stop,opt});return {id:'m',conceptName:concept,ticker:q.ticker,status:'open',openedAtMs:now(),sourceFeeder:opt.sourceFeeder};};
  await st.evaluateMomentumAndWave(new Map([['M',quote('M',85,86)]]));
  return made;
}

async function recoveryDecision(feederStake=3000) {
  const db=memoryDb([loss()]);
  const s=settings({pegasusReferenceStakeCents:feederStake,pegasusEnabled:false,sagittariusEnabled:false,momentumHunterEnabled:false,waveSurferEnabled:false,recoveryHunterEnabled:true});
  const st=strategy({db,s});
  const made=[];
  st.createHunter=async(concept,q,stake,stop,opt)=>{made.push({concept,ticker:q.ticker,stake,stop,opt});return {id:'r',conceptName:concept,ticker:q.ticker,status:'open',openedAtMs:now(),sourceTradeId:opt.sourceTradeId};};
  await st.evaluateRecovery(new Map([['R',quote('R',79,80)]]));
  return made;
}

test('R8 replaces the stake-dependent Wave dollar gate with an 8c favorable-move setting',()=>{
  const s=originalSettings();
  assert.ok(RELEASE.startsWith('SAGITTARIUS-R42-') || RELEASE.startsWith('SAGITTARIUS-R41-') || RELEASE.startsWith('SAGITTARIUS-R40-') || RELEASE.startsWith('SAGITTARIUS-R39-') || RELEASE.startsWith('SAGITTARIUS-R38-') || RELEASE.startsWith('SAGITTARIUS-R37-') || RELEASE.startsWith('SAGITTARIUS-R36-') || RELEASE.startsWith('SAGITTARIUS-R35-') || RELEASE.startsWith('SAGITTARIUS-R34-') || RELEASE.startsWith('SAGITTARIUS-R33-') || RELEASE.startsWith('SAGITTARIUS-R32-') || RELEASE.startsWith('SAGITTARIUS-R31-') || RELEASE.startsWith('SAGITTARIUS-R30-') || RELEASE.startsWith('SAGITTARIUS-R29-') || RELEASE.startsWith('SAGITTARIUS-R28-') || RELEASE.startsWith('SAGITTARIUS-R27-') || RELEASE.startsWith('SAGITTARIUS-R26-') || RELEASE.startsWith('SAGITTARIUS-R25-') || RELEASE.startsWith('SAGITTARIUS-R24-') || RELEASE.startsWith('SAGITTARIUS-R23-') || RELEASE.startsWith('SAGITTARIUS-R21-') || RELEASE.startsWith('SAGITTARIUS-R20-') || RELEASE.startsWith('SAGITTARIUS-R19-') || RELEASE.startsWith('SAGITTARIUS-R18-') || RELEASE.startsWith('SAGITTARIUS-R17-') || RELEASE.startsWith('SAGITTARIUS-R16-') || RELEASE.startsWith('SAGITTARIUS-R15-') || RELEASE.startsWith('SAGITTARIUS-R14-') || RELEASE.startsWith('SAGITTARIUS-R13-') || RELEASE.startsWith('SAGITTARIUS-R12-') || RELEASE.startsWith('SAGITTARIUS-R11-') || RELEASE.startsWith('SAGITTARIUS-R10-') || RELEASE.startsWith('SAGITTARIUS-R9-') || RELEASE === 'SAGITTARIUS-R8-FEEDER-REFERENCE-DECOUPLING-2026-08-18');
  assert.equal(s.waveMinFeederFavorableMoveCents,8);
  assert.equal(Object.hasOwn(s,'waveMinFeederVirtualProfitCents'),false);
  const sanitized=sanitizeRuntimeSettings({...s,waveMinFeederVirtualProfitCents:9999});
  assert.equal(Object.hasOwn(sanitized,'waveMinFeederVirtualProfitCents'),false);
  assert.equal(sanitized.waveMinFeederFavorableMoveCents,8);
});

test('R7 persisted custom simulation settings migrate to R8 without resetting the active experiment',()=>{
  const migrated=sanitizeRuntimeSettings({
    ...originalSettings(),
    engineActive:true,pegasusEnabled:true,sagittariusEnabled:true,momentumHunterEnabled:true,waveSurferEnabled:true,recoveryHunterEnabled:false,
    pegasusMinPriceCents:80,pegasusMaxPriceCents:94,pegasusDropCents:2,
    sagittariusMinPriceCents:80,sagittariusMaxPriceCents:94,sagittariusDropCents:3,
    waveMinEntryCents:86,waveMaxEntryCents:92,waveStopCents:14,waveMinFeederVirtualProfitCents:400,
    recoveryMinObservations:5,recoveryMinRate:.7,recoveryTrackingHours:24,feederStakeCents:3000,hunterStakeCents:20000,stakeCents:20000,
  });
  assert.equal(migrated.sagittariusDropCents,3);
  assert.equal(migrated.recoveryHunterEnabled,false);
  assert.equal(migrated.recoveryMinObservations,5);
  assert.equal(migrated.recoveryMinRate,.7);
  assert.equal(migrated.pegasusReferenceStakeCents,3000);
  assert.equal(migrated.sagittariusReferenceStakeCents,3000);
  assert.equal(migrated.momentumStakeCents,20000);
  assert.equal(migrated.recoveryBaseStakeCents,20000);
  assert.equal(migrated.waveStakeCents,20000);
  assert.equal(Object.hasOwn(migrated,'feederStakeCents'),false);
  assert.equal(Object.hasOwn(migrated,'hunterStakeCents'),false);
  assert.equal(Object.hasOwn(migrated,'stakeCents'),false);
  assert.equal(migrated.waveMinFeederFavorableMoveCents,8);
  assert.equal(Object.hasOwn(migrated,'waveMinFeederVirtualProfitCents'),false);
});

test('retired Wave virtual-profit setting is rejected by the settings API',async()=>{
  const engine=Object.create(SagittariusEngine.prototype);
  engine.settings=settings();
  engine.db={saveSettings:async()=>{}};
  await engine.patchSettings({waveMinFeederFavorableMoveCents:9});
  assert.equal(engine.settings.waveMinFeederFavorableMoveCents,9);
  await assert.rejects(()=>engine.patchSettings({waveMinFeederVirtualProfitCents:200}),/Unknown or retired setting/);
});

test('Wave favorable-move threshold is inclusive and uses executable current bid relative to feeder entry',async()=>{
  assert.equal((await waveDecision({feederEntry:82,bid:89,ask:90,threshold:8})).length,0,'+7c must not qualify');
  assert.equal((await waveDecision({feederEntry:82,bid:90,ask:91,threshold:8})).length,1,'+8c must qualify');
});

test('Wave eligibility is invariant to feeder reference count, reference stake, and reference fee P/L',async()=>{
  const tiny=await waveDecision({count:1,feederStake:100,fee:99,feederEntry:82,bid:90,ask:91,threshold:8});
  const huge=await waveDecision({count:10000,feederStake:999999,fee:0,feederEntry:82,bid:90,ask:91,threshold:8});
  assert.equal(tiny.length,1);
  assert.equal(huge.length,1);
  assert.deepEqual(tiny.map(x=>[x.concept,x.ticker,x.stop]),huge.map(x=>[x.concept,x.ticker,x.stop]));
});

test('Momentum eligibility is invariant to feeder reference size',async()=>{
  const a=await momentumDecision({count:1,feederStake:100});
  const b=await momentumDecision({count:10000,feederStake:999999});
  assert.equal(a.length,1); assert.equal(b.length,1);
  assert.deepEqual(a.map(x=>[x.concept,x.ticker,x.stop]),b.map(x=>[x.concept,x.ticker,x.stop]));
});

test('Recovery Hunter remains sourced from the stopped Hunter and is invariant to feeder reference stake',async()=>{
  const a=await recoveryDecision(100);
  const b=await recoveryDecision(999999);
  assert.equal(a.length,1); assert.equal(b.length,1);
  assert.equal(a[0].opt.sourceTradeId,'loss');
  assert.equal(b[0].opt.sourceTradeId,'loss');
  assert.deepEqual(a.map(x=>[x.concept,x.ticker,x.stop]),b.map(x=>[x.concept,x.ticker,x.stop]));
});

test('feeder reference stake still controls hypothetical reference quantity/P&L display only',async()=>{
  async function make(stake){
    const db=memoryDb(); const s=settings({pegasusReferenceStakeCents:stake});
    const st=strategy({db,s});
    const e=await st.createGhost('Pegasus',quote('F',89,90),90,null);
    return e;
  }
  const small=await make(3000), large=await make(6000);
  assert.equal(small.count,33);
  assert.equal(large.count,66);
  assert.equal(small.entryOrderId == null,true);
  assert.equal(large.entryOrderId == null,true);
});

test('1000 Wave opportunities prove feeder reference economics cannot change candidate timing/identity',async()=>{
  for(let i=0;i<1000;i++){
    const entry=80+(i%5); // 80-84
    const move=5+(i%7);  // 5-11
    const bid=entry+move;
    const ask=Math.min(92,bid+1);
    if (bid>92) continue;
    const threshold=8;
    const a=await waveDecision({count:1,feederStake:100,fee:99,feederEntry:entry,bid,ask,threshold});
    const b=await waveDecision({count:10000,feederStake:999999,fee:0,feederEntry:entry,bid,ask,threshold});
    assert.equal(a.length,b.length,`reference economics leaked at case ${i}`);
    if(a.length) assert.deepEqual([a[0].concept,a[0].ticker,a[0].stop],[b[0].concept,b[0].ticker,b[0].stop]);
  }
});

test('dashboard states the feeder stake is reference-only and exposes the new Wave move setting',async()=>{
  const app=await readFile(resolve(root,'public/app.js'),'utf8');
  const html=await readFile(resolve(root,'public/index.html'),'utf8');
  assert.ok(app.includes('waveMinFeederFavorableMoveCents'));
  assert.equal(app.includes('waveMinFeederVirtualProfitCents'),false);
  assert.ok(app.includes('display references') || app.includes('display-only'));
  assert.ok(app.includes('reference only'));
  assert.ok(html.includes('cannot influence Hunter eligibility, timing, sizing, or exits'));
});
