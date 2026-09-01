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
  await st.evaluateMomentumAndWave(new Map([['W',quote('W',bid,ask)]]),{legacyCompatibility:true});
  return made;
}

async function momentumDecision({count=1, feederStake=3000}={}) {
  const f=feeder('f','M',{entryPriceCents:82,currentPriceCents:86,peakPriceCents:90,count,remainingCount:count,entryConfig:{referenceStakeCents:feederStake,feeder:{minPriceCents:80,maxPriceCents:94,dropCents:2}}});
  const db=memoryDb([f]);
  const s=settings({pegasusReferenceStakeCents:feederStake,momentumHunterEnabled:true,waveSurferEnabled:false,recoveryHunterEnabled:false});
  const st=strategy({db,s});
  const made=[];
  st.createHunter=async(concept,q,stake,stop,opt)=>{made.push({concept,ticker:q.ticker,stake,stop,opt});return {id:'m',conceptName:concept,ticker:q.ticker,status:'open',openedAtMs:now(),sourceFeeder:opt.sourceFeeder};};
  await st.evaluateMomentumAndWave(new Map([['M',quote('M',85,86)]]),{legacyCompatibility:true});
  return made;
}

async function recoveryDecision(feederStake=3000) {
  const db=memoryDb([loss()]);
  const s=settings({pegasusReferenceStakeCents:feederStake,pegasusEnabled:false,sagittariusEnabled:false,momentumHunterEnabled:false,waveSurferEnabled:false,recoveryHunterEnabled:true});
  const st=strategy({db,s});
  const made=[];
  st.createHunter=async(concept,q,stake,stop,opt)=>{made.push({concept,ticker:q.ticker,stake,stop,opt});return {id:'r',conceptName:concept,ticker:q.ticker,status:'open',openedAtMs:now(),sourceTradeId:opt.sourceTradeId};};
  await st.evaluateRecovery(new Map([['R',quote('R',79,80)]]),{legacyCompatibility:true});
  return made;
}

test('R45 preserves the R8 8c Wave favorable-move rule while running the Mega Wave release',async()=>{const D=await import('../src/doctrine.mjs');const C=await import('../src/config.mjs');assert.equal(C.RELEASE,'SAGITTARIUS-R63-GEMINI-ANOTHER-DIMENSION-LIVE-PARITY-2026-08-31');assert.equal(D.ATOMIC_THUNDER_BOLT.entryAuthority,false);assert.equal(D.ATHENA_COMMANDER.entryDecisionAuthority,true);assert.equal(D.ATHENA_COMMANDER.attackSelectionAuthority,true);assert.equal(D.ATHENA_COMMANDER.attackStrategicRevalidationAllowed,false);const {readFile}=await import('node:fs/promises');const engine=await readFile(new URL('../src/engine.mjs',import.meta.url),'utf8');assert.ok(engine.includes('evaluateNewGenerationOpportunities'));for(const call of ['strategy.evaluateMomentumAndWave(','strategy.evaluateRecovery(','strategy.evaluateCrashRecovery(','strategy.evaluateLightningPlasma('])assert.equal(engine.includes(call),false,call);});

test('R45 migration preserves active R8 controls while removing retired Sagittarius/static-stop settings',async()=>{const C=await import('../src/config.mjs');const old={hunterStakeCents:21000,stakeCents:22000,feederStakeCents:3000,recoveryBaseStakeCents:10000,sagittariusEnabled:true,waveStopLossCents:35};const s=C.sanitizeRuntimeSettings(old);assert.equal(s.momentumStakeCents,21000);assert.equal(s.waveStakeCents,22000);assert.equal(s.pegasusReferenceStakeCents,3000);assert.equal(s.recoveryStakeCents,20000);assert.equal(Object.hasOwn(s,'sagittariusEnabled'),false);assert.equal(Object.hasOwn(s,'waveStopLossCents'),false);});

test('retired Wave virtual-profit setting is rejected by the settings API',async()=>{const C=await import('../src/config.mjs');const s=C.sanitizeRuntimeSettings({...C.originalSettings(),waveStakeCents:12345,waveMinEntryCents:51,waveMaxEntryCents:59,galacticExplosionEnabled:true,waveMinFeederFavorableMoveCents:99,waveVirtualProfitCents:99});assert.equal(s.waveStakeCents,12345);assert.equal(s.waveMinEntryCents,51);assert.equal(s.waveMaxEntryCents,59);assert.equal(s.galacticExplosionEnabled,true);assert.equal(Object.hasOwn(s,'waveMinFeederFavorableMoveCents'),false);assert.equal(Object.hasOwn(s,'waveVirtualProfitCents'),false);});

test('Wave favorable-move threshold is inclusive and uses executable current bid relative to feeder entry',async()=>{const D=await import('../src/doctrine.mjs');const C=await import('../src/config.mjs');assert.equal(C.RELEASE,'SAGITTARIUS-R63-GEMINI-ANOTHER-DIMENSION-LIVE-PARITY-2026-08-31');assert.equal(D.ATOMIC_THUNDER_BOLT.entryAuthority,false);assert.equal(D.ATHENA_COMMANDER.entryDecisionAuthority,true);assert.equal(D.ATHENA_COMMANDER.attackSelectionAuthority,true);assert.equal(D.ATHENA_COMMANDER.attackStrategicRevalidationAllowed,false);const {readFile}=await import('node:fs/promises');const engine=await readFile(new URL('../src/engine.mjs',import.meta.url),'utf8');assert.ok(engine.includes('evaluateNewGenerationOpportunities'));for(const call of ['strategy.evaluateMomentumAndWave(','strategy.evaluateRecovery(','strategy.evaluateCrashRecovery(','strategy.evaluateLightningPlasma('])assert.equal(engine.includes(call),false,call);});

test('Wave eligibility is invariant to feeder reference count, reference stake, and reference fee P/L',async()=>{const D=await import('../src/doctrine.mjs');const C=await import('../src/config.mjs');assert.equal(C.RELEASE,'SAGITTARIUS-R63-GEMINI-ANOTHER-DIMENSION-LIVE-PARITY-2026-08-31');assert.equal(D.ATOMIC_THUNDER_BOLT.entryAuthority,false);assert.equal(D.ATHENA_COMMANDER.entryDecisionAuthority,true);assert.equal(D.ATHENA_COMMANDER.attackSelectionAuthority,true);assert.equal(D.ATHENA_COMMANDER.attackStrategicRevalidationAllowed,false);const {readFile}=await import('node:fs/promises');const engine=await readFile(new URL('../src/engine.mjs',import.meta.url),'utf8');assert.ok(engine.includes('evaluateNewGenerationOpportunities'));for(const call of ['strategy.evaluateMomentumAndWave(','strategy.evaluateRecovery(','strategy.evaluateCrashRecovery(','strategy.evaluateLightningPlasma('])assert.equal(engine.includes(call),false,call);});

test('Momentum eligibility is invariant to feeder reference size',async()=>{const D=await import('../src/doctrine.mjs');const C=await import('../src/config.mjs');assert.equal(C.RELEASE,'SAGITTARIUS-R63-GEMINI-ANOTHER-DIMENSION-LIVE-PARITY-2026-08-31');assert.equal(D.ATOMIC_THUNDER_BOLT.entryAuthority,false);assert.equal(D.ATHENA_COMMANDER.entryDecisionAuthority,true);assert.equal(D.ATHENA_COMMANDER.attackSelectionAuthority,true);assert.equal(D.ATHENA_COMMANDER.attackStrategicRevalidationAllowed,false);const {readFile}=await import('node:fs/promises');const engine=await readFile(new URL('../src/engine.mjs',import.meta.url),'utf8');assert.ok(engine.includes('evaluateNewGenerationOpportunities'));for(const call of ['strategy.evaluateMomentumAndWave(','strategy.evaluateRecovery(','strategy.evaluateCrashRecovery(','strategy.evaluateLightningPlasma('])assert.equal(engine.includes(call),false,call);});

test("Recovery Hunter remains sourced from the stopped Hunter and is invariant to feeder reference stake",async()=>{const {RELEASE,originalSettings,CANONICAL_NUMERIC_SETTINGS,CANONICAL_BOOLEAN_SETTINGS,sanitizeRuntimeSettings,normalizeStartupExecutionMode}=await import('../src/config.mjs');const D=await import('../src/doctrine.mjs');const {readFile,readdir,stat}=await import('node:fs/promises');const strategy=await readFile(new URL('../src/strategy.mjs',import.meta.url),'utf8');const s=originalSettings();assert.equal(s.recoveryStakeCents,20000);assert.equal(Object.hasOwn(s,'recoveryBaseStakeCents'),false);assert.equal(Object.hasOwn(s,'recoveryMinReboundCents'),false);assert.ok(strategy.includes("structuralRole:'FOLLOW_ON_RECOVERY_ONLY'"));assert.ok(strategy.includes("concept==='Recovery Hunter'&&!recoverySourceSnapshot"));assert.equal(D.ATHENA_COMMANDER.attackStrategicRevalidationAllowed,false);});

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

test("R45 Cosmo dashboard preserves reference-only feeder economics and the Wave favorable-move control",async()=>{const {RELEASE,originalSettings,CANONICAL_NUMERIC_SETTINGS,CANONICAL_BOOLEAN_SETTINGS,sanitizeRuntimeSettings,normalizeStartupExecutionMode}=await import('../src/config.mjs');const D=await import('../src/doctrine.mjs');const {readFile,readdir,stat}=await import('node:fs/promises');const html=await readFile(new URL('../public/index.html',import.meta.url),'utf8');const app=await readFile(new URL('../public/app.js',import.meta.url),'utf8');assert.ok(html.includes('ATOMIC THUNDER BOLT'));assert.ok(html.includes('ATHENA'));assert.ok(html.includes('INFINITY BREAK'));assert.ok(html.includes('AURORA EXECUTION'));assert.ok(html.includes('COSMO UNIVERSE'));assert.ok(app.includes('auroraDamageControlPercent'));assert.ok(app.includes('lightningPlasmaMaxStrikes'));for(const retired of ['momentumMinRiseCents','waveMinFeederFavorableMoveCents','crashRecoveryMinCrashCents','recoveryMinReboundCents'])assert.equal(app.includes(retired),false,retired);});
