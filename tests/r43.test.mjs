import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { freshInstallSettings, normalizeStartupExecutionMode, sanitizeRuntimeSettings, RELEASE } from '../src/config.mjs';
import { SagittariusEngine } from '../src/engine.mjs';
import { StrategyEngine } from '../src/strategy.mjs';

const root = resolve(new URL('..', import.meta.url).pathname);

test('R44 EMI1 fresh install is deterministically SIMULATION and impossible persisted LIVE recovers only when deployment LIVE is disabled', () => {
  const fresh = freshInstallSettings();
  assert.equal(RELEASE, 'SAGITTARIUS-R44-ATOMIC-THUNDER-R41-STOP-RESTORE-2026-08-26');
  assert.equal(fresh.mode, 'SIMULATION');
  assert.equal(fresh.liveArmed, false);
  assert.equal(fresh.engineActive, true);

  const impossible = normalizeStartupExecutionMode({ ...fresh, mode:'LIVE', liveArmed:false, waveSurferEnabled:true }, false);
  assert.equal(impossible.recovered, true);
  assert.equal(impossible.reason, 'live_trading_disabled');
  assert.equal(impossible.settings.mode, 'SIMULATION');
  assert.equal(impossible.settings.liveArmed, false);
  assert.equal(impossible.settings.waveSurferEnabled, true);

  const authorizedDeployment = normalizeStartupExecutionMode({ ...fresh, mode:'LIVE', liveArmed:true }, true);
  assert.equal(authorizedDeployment.recovered, false);
  assert.equal(authorizedDeployment.settings.mode, 'LIVE');
  assert.equal(authorizedDeployment.settings.liveArmed, false, 'restart must still disarm LIVE even when deployment policy permits it');
});

test('R44 EMI1 entry-chain isolation keeps reference feeders active in LIVE-disarmed state while every real Hunter stays blocked', async () => {
  const engine = Object.create(SagittariusEngine.prototype);
  engine.settings = { ...freshInstallSettings(), systemName:'S', mode:'LIVE', liveArmed:false, engineActive:true };
  engine.health = { degraded:false };
  engine.recomputeHealth = () => {};
  const calls = [];
  engine.strategy = {
    evaluateRecovery: async()=>{ calls.push('recovery'); return []; },
    evaluateDragon: async()=>{ calls.push('dragon'); return []; },
    evaluateGoldenDragon: async()=>{ calls.push('golden'); return []; },
    refreshGoldenDragonFeedAuthorities: async()=>{ calls.push('golden-feed'); },
    evaluateGoldenDragonHunter: async()=>{ calls.push('gdh'); return []; },
    evaluateDragonRecovery: async()=>{ calls.push('drh'); return []; },
    evaluateCrashRecovery: async()=>{ calls.push('crh'); return []; },
    evaluateFeeders: async()=>{ calls.push('feeders'); return []; },
    evaluateMomentumAndWave: async()=>{ calls.push('wave'); return []; },
  };
  engine.refreshFeederPriorityTickers = async()=>new Set();
  const result = await engine.evaluateEntryChain([], new Map(), new Map());
  assert.deepEqual(result, []);
  assert.deepEqual(calls, ['dragon','golden','golden-feed','feeders']);
  assert.equal(engine.referenceSignalGate().allowed, true);
  assert.equal(engine.entryExecutionGate().allowed, false);
});

test('R44 EMI1 SIMULATION runs the complete entry chain in recovery-first and feeder-before-downstream order', async () => {
  const engine = Object.create(SagittariusEngine.prototype);
  engine.settings = { ...freshInstallSettings(), systemName:'S', mode:'SIMULATION', liveArmed:false, engineActive:true };
  engine.health = { degraded:false };
  engine.recomputeHealth = () => {};
  const calls = [];
  const ret = (name) => async()=>{ calls.push(name); return [{ id:name }]; };
  engine.strategy = {
    evaluateRecovery: ret('recovery'),
    evaluateDragon: ret('dragon'),
    evaluateGoldenDragon: ret('golden'),
    refreshGoldenDragonFeedAuthorities: async()=>{ calls.push('golden-feed'); },
    evaluateGoldenDragonHunter: ret('gdh'),
    evaluateDragonRecovery: ret('drh'),
    evaluateCrashRecovery: ret('crh'),
    evaluateFeeders: ret('feeders'),
    evaluateMomentumAndWave: ret('wave'),
  };
  engine.refreshFeederPriorityTickers = async()=>{ calls.push('refresh-feeder-priority'); return new Set(); };
  const result = await engine.evaluateEntryChain([], new Map(), new Map());
  assert.deepEqual(calls, ['recovery','dragon','golden','golden-feed','gdh','drh','crh','feeders','refresh-feeder-priority','wave']);
  assert.equal(result.length, 8);
  assert.equal(engine.entryExecutionGate().allowed, true);
  assert.equal(engine.entryExecutionGate().reason, 'simulation');
});

test('R44 EMI1 createHunter independently blocks disarmed LIVE before book refresh or broker mutation', async () => {
  const audits = [];
  const settings = { ...freshInstallSettings(), systemName:'S', ownerId:'O', mode:'LIVE', liveArmed:false, engineActive:true, waveSurferEnabled:true, pegasusEnabled:true };
  const strategy = new StrategyEngine({
    db:{ async audit(_level,event,data){ audits.push({event,data}); } },
    kalshi:{ async placeOrder(){ throw new Error('broker mutation must be unreachable'); } },
    market:{ async refreshTickerVerified(){ throw new Error('book refresh must be unreachable'); } },
    learning:{}, athena:null,
    getSettings:()=>settings,
    getLiveReady:()=>false,
    refreshGameClock:async()=>{ throw new Error('clock refresh must be unreachable'); },
  });
  const out = await strategy.createHunter('Wave Surfer', { ticker:'T', eventTicker:'E', yesBid:49, yesAsk:50 }, 20_000, 35, { sourceFeeder:'Pegasus', sourceTradeId:'F', entryQualificationSnapshot:{version:'WAVE-Q1',feederEntryPriceCents:48} });
  assert.equal(out, null);
  const summary = strategy.entryPipelineSummary();
  assert.equal(summary.attempts, 1);
  assert.equal(summary.byReason.live_not_ready, 1);
  assert.equal(summary.byStage['MODE_AUTHORIZATION:BLOCKED'], 1);
});

test('R44 EMI1 Pegasus reference signals do not stop when real-Hunter maxPositions is full', async () => {
  const now = Date.now();
  const entries = Array.from({length:20}, (_,i)=>({
    id:`H${i}`, systemName:'S', ownerId:'O', conceptName:'Wave Surfer', ticker:`H${i}`, eventTicker:`E${i}`,
    status:'open', openedAtMs:now-60_000, entryPriceCents:50, count:1,
  }));
  const settings = {
    ...freshInstallSettings(), systemName:'S', ownerId:'O', mode:'SIMULATION', engineActive:true,
    maxPositions:20, pegasusEnabled:true, sagittariusEnabled:false, eventCooldownMinutes:1,
    pegasusMinPriceCents:27, pegasusMaxPriceCents:89, pegasusDropCents:1, maxSpreadCents:3,
  };
  const strategy = new StrategyEngine({
    db:{
      async entries(){ return entries; },
      async insertEntry(e){ entries.push(e); },
      async audit(){},
    },
    kalshi:{},
    market:{ getHistory(){ return [{ask:60},{ask:50},{ask:50},{ask:50}]; } },
    learning:{}, getSettings:()=>settings, getLiveReady:()=>false,
  });
  const q = { ticker:'T', eventTicker:'E', title:'T wins', yesBid:49, yesAsk:50, recentTrades:20, volume24h:1000, gameStartTimeMs:null };
  const created = await strategy.evaluateFeeders([q], new Map());
  assert.equal(created.length, 1);
  assert.equal(created[0].conceptName, 'Pegasus');
  assert.equal(created[0].ticker, 'T');
  assert.equal(entries.filter((e)=>e.conceptName==='Wave Surfer' && e.status==='open').length, 20, 'real-Hunter capacity remains full and unchanged');
});

test('R44 EMI1 UI can always escape LIVE-disarmed state back to SIMULATION', async () => {
  const app = await readFile(resolve(root, 'public/app.js'), 'utf8');
  assert.match(app, /if \(STATE\.settings\.mode === 'LIVE'\) \{ await post\('\/api\/mode', \{ mode:'SIMULATION' \}\)/);
  assert.doesNotMatch(app, /STATE\.settings\.mode === 'LIVE' && STATE\.settings\.liveArmed/);
  assert.match(app, /LIVE DISARMED/);
});

test('R44 removes R42 HELC1 and R43 EQC1 runtime gates while preserving EMI1', async () => {
  const doctrine = await readFile(resolve(root, 'src/doctrine.mjs'), 'utf8');
  const strategy = await readFile(resolve(root, 'src/strategy.mjs'), 'utf8');
  const engine = await readFile(resolve(root, 'src/engine.mjs'), 'utf8');
  assert.equal(doctrine.includes("version: 'HELC1'"), false);
  assert.equal(doctrine.includes("version: 'EQC1'"), false);
  assert.equal(strategy.includes('hardEconomicLossEntryFeasibility'), false);
  assert.equal(strategy.includes('entryQualityCovenant'), false);
  assert.equal(engine.includes('hardEconomicLossCeiling:'), false);
  assert.equal(engine.includes('r43EntryQualityCovenant:'), false);
  assert.ok(engine.includes("entryModeIsolation:'EMI1'"));
});


test('R44 Atomic Thunder migration auto-enables only persisted SIMULATION and clamps unsafe numeric settings',()=>{
  const sim=sanitizeRuntimeSettings({systemName:'S',ownerId:'O',mode:'SIMULATION'});
  const live=sanitizeRuntimeSettings({systemName:'S',ownerId:'O',mode:'LIVE'});
  assert.equal(sim.atomicThunderEnabled,true);
  assert.equal(live.atomicThunderEnabled,false);
  const clamped=sanitizeRuntimeSettings({systemName:'S',ownerId:'O',mode:'SIMULATION',atomicThunderEnabled:true,atomicThunderMinNetPerOriginalContractCents:-5,atomicThunderRequiredConfirmations:0,atomicThunderMaximumBookAgeMs:1,atomicThunderConfirmationWindowMs:1});
  assert.equal(clamped.atomicThunderMinNetPerOriginalContractCents,0.01);
  assert.equal(clamped.atomicThunderRequiredConfirmations,1);
  assert.equal(clamped.atomicThunderMaximumBookAgeMs,100);
  assert.equal(clamped.atomicThunderConfirmationWindowMs,250);
});
