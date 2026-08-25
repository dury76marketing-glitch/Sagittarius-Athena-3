import test from 'node:test';import assert from 'node:assert/strict';import { readFile,readdir,stat } from 'node:fs/promises';import { resolve,dirname } from 'node:path';import { fileURLToPath } from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
async function files(dir){const out=[];for(const name of await readdir(dir)){if(name==='node_modules'||name==='.git'||name==='package-lock.json')continue;const p=resolve(dir,name),s=await stat(p);if(s.isDirectory())out.push(...await files(p));else out.push(p);}return out;}
test('deployment starts source directly and cannot repeat missing dist/index.js failure',async()=>{const pkg=JSON.parse(await readFile(resolve(root,'package.json'),'utf8'));assert.equal(pkg.scripts.start,'node src/index.mjs');assert.equal(pkg.scripts.start.includes('dist/'),false);const railway=JSON.parse(await readFile(resolve(root,'railway.json'),'utf8'));assert.equal(railway.deploy.startCommand,'npm start');assert.equal(railway.build.buildCommand,'npm test && npm run check');});
const R37_PROJECT_SOURCE_FILE_BUDGET=33; // npm install may generate package-lock.json; deployment metadata is excluded from the authored source-file budget.
test('project stays within the explicit R37 compact source-file budget even when npm generates package-lock.json',async()=>{const list=await files(root);assert.ok(list.includes(resolve(root,'src/gameClock.mjs')),'R17 GCA1 runtime authority module missing');assert.ok(list.includes(resolve(root,'src/athena.mjs')),'R34 ATHENA-B1 runtime brain module missing');assert.ok(list.includes(resolve(root,'src/athenaExit.mjs')),'R36 ATHENA-X1 runtime exit intelligence module missing');assert.ok(list.length<=R37_PROJECT_SOURCE_FILE_BUDGET,`source file count ${list.length} exceeds R37 budget ${R37_PROJECT_SOURCE_FILE_BUDGET}`);});
test('all required Railway/Kalshi variables are recognized',async()=>{const src=await readFile(resolve(root,'src/config.mjs'),'utf8');for(const k of ['KALSHI_API_KEY_ID','KALSHI_PRIVATE_KEY_PEM','KALSHI_BASE_URL','DEFAULT_ENGINE_MODE','ALLOW_LIVE_TRADING','DATABASE_URL'])assert.ok(src.includes(k),`${k} missing`);});
test('dashboard contains PDF operational sections and intentionally excludes exit-strategy tournament',async()=>{const html=await readFile(resolve(root,'public/index.html'),'utf8');for(const s of ['Portfolio Performance','Main System Entry Models','OPEN HUNTER TRADES','OPEN FEEDER TRADES','Closed Positions - Hunters','Tracked Markets','Sport Profiles','Recovery Patterns','Crash Intelligence','Live Markets Being Scanned','Scanner Active','Scan Speed','Kalshi Credentials'])assert.ok(html.includes(s),`${s} missing`);assert.equal(html.includes('Profit Guard Test - Wide Trail'),false);});

test('PDF-parity dashboard restores manual Hunter cashout and active Profit Guard visibility',async()=>{const html=await readFile(resolve(root,'public/index.html'),'utf8');const app=await readFile(resolve(root,'public/app.js'),'utf8');assert.ok(html.includes('cashOutProfitBtn'));assert.ok(html.includes('Profit Guard'));assert.ok(app.includes('/api/manual-cashout'));assert.equal(html.includes('Wide Trail Test'),false);});

test('crossed real-time books fail closed and trigger resync instead of feeding Hunters or Profit Guard',async()=>{const {MarketHub}=await import('../src/market.mjs');let resynced=false;const hub=new MarketHub({kalshi:{},wsUrl:'',fallbackWsUrl:'',getCredentials:()=>null});hub.quotes.set('T',{ticker:'T',yesBid:79,yesAsk:80,updatedAtMs:Date.now(),status:'active',result:'',bookInvalid:false});hub.books.set('T',{ticker:'T',yesBids:[{priceCents:80,count:1}],noBids:[{priceCents:25,count:1}],updatedAtMs:Date.now()});hub.resyncBook=async(ticker)=>{assert.equal(ticker,'T');resynced=true;};hub.applyBook('T');assert.equal(hub.getQuote('T').bookInvalid,true);await new Promise(r=>setImmediate(r));assert.equal(resynced,true);});

test('Railway health is liveness-only and remains 200 while engine is booting',async()=>{const { startServer }=await import('../src/server.mjs');const runtime={engine:null,boot:{status:'starting',startedAtMs:Date.now(),lastAttemptMs:Date.now(),attempts:1,lastError:null}};const server=startServer(runtime,0,root);await new Promise(r=>server.once('listening',r));const port=server.address().port;const health=await fetch(`http://127.0.0.1:${port}/health`);assert.equal(health.status,200);const h=await health.json();assert.equal(h.processAlive,true);assert.equal(h.engineReady,false);const ready=await fetch(`http://127.0.0.1:${port}/ready`);assert.equal(ready.status,503);await new Promise(r=>server.close(r));});

test('HTTP listener is started before engine initialization and boot retries are retained',async()=>{const src=await readFile(resolve(root,'src/index.mjs'),'utf8');const listenAt=src.indexOf('startServer(runtime');const engineAt=src.indexOf('new SagittariusEngine()');assert.ok(listenAt>=0&&engineAt>=0&&listenAt<engineAt,'HTTP server must bind before engine init');assert.ok(src.includes('while (!stopping && !runtime.engine)'));assert.ok(src.includes('await sleep(5000)'));});


test('database learning schema is versioned and legacy-compatible',async()=>{const src=await readFile(resolve(root,'src/db.mjs'),'utf8');assert.ok(src.includes('sag_recovery_observations_v2'));assert.ok(src.includes('sag_sport_profiles_v2'));assert.ok(src.includes("tableColumns('sag_recovery_observations')"));assert.ok(src.includes("obs.has('trade_id') && obs.has('complete')"));assert.ok(src.includes("obs.has('id') && obs.has('tracking_complete')"));assert.ok(src.includes('await this.migrateLearningData()'));assert.ok(src.includes('sag_profit_episodes_v1'));assert.ok(src.includes('sag_profit_profiles_v1'));assert.ok(src.includes('upsertProfitEpisode'));assert.ok(src.includes('upsertProfitProfile'));assert.equal(src.includes('create index if not exists sag_recovery_obs_system on sag_recovery_observations('),false);});

test('dashboard exposes independent ON/OFF controls for all ten entry models',async()=>{const html=await readFile(resolve(root,'public/index.html'),'utf8');const app=await readFile(resolve(root,'public/app.js'),'utf8');assert.ok(html.includes('<th>Enabled</th>'));for(const key of ['pegasusEnabled','sagittariusEnabled','dragonEnabled','goldenDragonEnabled','momentumHunterEnabled','waveSurferEnabled','recoveryHunterEnabled','crashRecoveryHunterEnabled','dragonRecoveryHunterEnabled','goldenDragonHunterEnabled'])assert.ok(app.includes(key),`${key} toggle missing`);assert.ok(app.includes("Existing Hunter positions remain protected"));});

test('R43 production release promotes only the validated Entry Quality Covenant while preserving R42 loss authority',async()=>{
  const config=await readFile(resolve(root,'src/config.mjs'),'utf8');
  const doctrine=await readFile(resolve(root,'src/doctrine.mjs'),'utf8');
  const strategy=await readFile(resolve(root,'src/strategy.mjs'),'utf8');
  const engine=await readFile(resolve(root,'src/engine.mjs'),'utf8');
  assert.ok(config.includes("SAGITTARIUS-R43-HF1-ENTRY-MODE-ISOLATION-2026-08-25"));
  assert.ok(doctrine.includes("version: 'EQC1'"));
  assert.ok(doctrine.includes("authority: 'EXECUTION'"));
  assert.ok(doctrine.includes('maximumEntryFrictionR: 0.30'));
  assert.ok(doctrine.includes('minimumGameMinutes: 30'));
  assert.ok(strategy.includes("trace('R43_ENTRY_QUALITY','BLOCKED'"));
  assert.ok(strategy.includes("'hunter_entry_r43_quality_blocked'"));
  assert.ok(strategy.includes('frozenEntryConfig.entryQualityCovenant'));
  assert.ok(engine.includes('r43EntryQualityCovenant: R43_ENTRY_QUALITY_COVENANT.version'));
  assert.ok(engine.includes('hardEconomicLossCeiling: HARD_ECONOMIC_LOSS_CEILING.version'),'R42 HELC must remain present');
  assert.ok(engine.includes('ultimateStopGuard: ULTIMATE_STOP_GUARD.version'),'U-SG1 must remain sole loss authority');
});


test('R36 deployment hardening pins ws above the 2026 security-advisory floor without changing pg',async()=>{
  const pkg=JSON.parse(await readFile(resolve(root,'package.json'),'utf8'));
  assert.equal(pkg.dependencies.ws,'8.21.3');
  const parts=String(pkg.dependencies.ws).split('.').map(Number);
  assert.ok(parts[0]===8 && (parts[1]>21 || (parts[1]===21 && parts[2]>=0)),'ws must remain at or above the 8.21.0 high-severity DoS fix floor');
  assert.equal(pkg.dependencies.pg,'8.16.3');
});

test('R37 preserves ATHENA-B1 as read-only exit context while diagnostics keep B1 exit authority false',async()=>{
  const src=await readFile(resolve(root,'src/engine.mjs'),'utf8');
  assert.match(src,/new ProfitGuard\(\{[\s\S]*?athena:\s*this\.athena[\s\S]*?\}\)/);
  assert.ok(/athenaExitAuthority:\s*false/.test(src));
  assert.ok(/athenaB1ExitAuthority:\s*false/.test(src));
  assert.ok(/athenaExitIntelligence:\s*ATHENA_EXIT_INTELLIGENCE\.version/.test(src));
  const pg=await readFile(resolve(root,'src/profitGuard.mjs'),'utf8');
  assert.ok(pg.includes('assessAthenaBrain(brain'));
  assert.equal(pg.includes('this.athena.assess('),false,'ProfitGuard may not call or mutate the B1 entry-assessment path');
});

test('R37 Golden Eye is intelligence-only and routes execution through the existing all-profitable manual cashout authority',async()=>{
  const ge=await readFile(resolve(root,'src/goldenEye.mjs'),'utf8');
  assert.equal(ge.includes("from './kalshi.mjs'"),false,'Golden Eye intelligence may not import broker transport');
  assert.equal(ge.includes('kalshi.placeOrder'),false,'Golden Eye intelligence may not place orders directly');
  const engine=await readFile(resolve(root,'src/engine.mjs'),'utf8');
  assert.ok(engine.includes("this.manualCashout({ allProfitable:true }, 'golden_eye_cashout')"),'Golden Eye execution must use the established global cashout path');
  const pg=await readFile(resolve(root,'src/profitGuard.mjs'),'utf8');
  assert.ok(pg.includes("reason === 'golden_eye_cashout'"));
  assert.ok(pg.includes('golden_eye_partial_depth_no_split'));
});

test('R38 manual Cash Out is wired as supervised Golden Eye training before and after execution, with historical backfill from closed manual trades',async()=>{
  const engine=await readFile(resolve(root,'src/engine.mjs'),'utf8');
  const beginAt=engine.indexOf('beginManualTraining?.(open');
  const executeAt=engine.indexOf('const rows = await mapLimit(open');
  const completeAt=engine.indexOf('completeManualTraining?.(manualTrainingContext,result');
  assert.ok(beginAt>=0&&executeAt>beginAt&&completeAt>executeAt,'manual training must capture the pre-click state and then persist the realized label after execution');
  const ge=await readFile(resolve(root,'src/goldenEye.mjs'),'utf8');
  assert.ok(ge.includes('buildManualTrainingEpisodes'));
  assert.ok(ge.includes('manualEpisodes'));
  assert.ok(ge.includes('collectiveTrainingEpisodes'));
  const db=await readFile(resolve(root,'src/db.mjs'),'utf8');
  assert.ok(db.includes("close_reason='manual_cashout'"));
  assert.ok(db.includes('manualCashoutTrainingRows'));
});

test('R37 Golden Eye has isolated durable versioned learning state without changing sag_entries schema',async()=>{
  const {createHash}=await import('node:crypto');
  const db=await readFile(resolve(root,'src/db.mjs'),'utf8');
  assert.ok(db.includes('sag_golden_eye_state_v1'));
  assert.ok(db.includes('goldenEyeState(systemName)'));
  assert.ok(db.includes('saveGoldenEyeState(systemName,state)'));
  const sagEntriesSchema=(text)=>text.match(/create table if not exists sag_entries\s*\([\s\S]*?\);/)?.[0]||'';
  const schema=sagEntriesSchema(db);
  assert.ok(schema.length>0,'sag_entries schema must be present');
  const schemaHash=createHash('sha256').update(schema).digest('hex');
  assert.equal(schemaHash,'b782ec9e596b156a34a36a4765c36063eb913630b6b1ba6f2954aa0e170e396f','R37 Golden Eye must not mutate the validated R36 sag_entries schema');
  assert.equal(/golden[_ ]?eye/i.test(schema),false,'Golden Eye state must stay isolated from sag_entries');
});

test('R37 Golden Eye migration auto-enables only existing SIMULATION records while LIVE autonomy remains explicitly fail-safe off',async()=>{
  const {originalSettings,sanitizeRuntimeSettings}=await import('../src/config.mjs');
  const defaults=originalSettings();
  const sim=sanitizeRuntimeSettings({systemName:'SAGITTARIUS',mode:'SIMULATION'},defaults);
  assert.equal(sim.goldenEyeEnabled,true);
  assert.equal(sim.goldenEyeLiveEnabled,false);
  const live=sanitizeRuntimeSettings({systemName:'SAGITTARIUS',mode:'LIVE'},defaults);
  assert.equal(live.goldenEyeEnabled,false,'legacy LIVE records may not silently gain a new autonomous exit authority');
  assert.equal(live.goldenEyeLiveEnabled,false);
  const explicitLive=sanitizeRuntimeSettings({systemName:'SAGITTARIUS',mode:'LIVE',goldenEyeEnabled:true,goldenEyeLiveEnabled:true},defaults);
  assert.equal(explicitLive.goldenEyeEnabled,true);
  assert.equal(explicitLive.goldenEyeLiveEnabled,true);
});

test('R37 Golden Eye quote events are not lost during an active evaluation/execution and shutdown clears/drains Golden Eye work',async()=>{
  const engine=await readFile(resolve(root,'src/engine.mjs'),'utf8');
  assert.match(engine,/if \(this\.goldenEyeExecutionPromise\) \{\s*this\.goldenEyeRerunRequested = true;/);
  assert.match(engine,/if \(this\.goldenEyeEvaluationPromise\) \{\s*this\.goldenEyeRerunRequested = true;/);
  assert.ok(engine.includes('if (this.goldenEyeTimer) clearTimeout(this.goldenEyeTimer)'));
  assert.ok(engine.includes('Promise.allSettled(goldenEyePending)'));
  assert.ok(engine.includes('this.goldenEye?.persist?.(true)'));
});

test('R37 compact project includes exactly one dedicated Golden Eye runtime module and one dedicated Golden Eye unit suite',async()=>{
  const list=(await files(root)).map((p)=>p.slice(root.length+1));
  assert.ok(list.includes('src/goldenEye.mjs'));
  assert.ok(list.includes('tests/goldenEye.test.mjs'));
  assert.equal(list.filter((p)=>p.startsWith('src/')&&p.toLowerCase().includes('goldeneye')).length,1);
  assert.equal(list.filter((p)=>p.startsWith('tests/')&&p.toLowerCase().includes('goldeneye')).length,1);
});

test('R37 Railway validation is self-contained and does not depend on local sibling baseline directories',async()=>{
  const src=await readFile(resolve(root,'tests/deployment.test.mjs'),'utf8');
  const sibling=['..','sagittarius_r37_baseline'].join('/');
  const localWorkspace=['','mnt','data','sagittarius_r37_baseline'].join('/');
  assert.equal(src.includes(sibling),false,'Railway tests must not read a local sibling baseline directory');
  assert.equal(src.includes(localWorkspace),false,'Railway tests must not depend on the local validation workspace');
});


test('R39 SLW1 is structurally inside U-SG1 and cannot replace the frozen Danger Line or gain profit authority',async()=>{
  const doctrine=await readFile(resolve(root,'src/doctrine.mjs'),'utf8');
  const pg=await readFile(resolve(root,'src/profitGuard.mjs'),'utf8');
  const engine=await readFile(resolve(root,'src/engine.mjs'),'utf8');
  assert.ok(doctrine.includes("version: 'SLW1'"));
  assert.ok(doctrine.includes('wakeLossCents: 6000'));
  assert.ok(pg.includes('const watchdog = await this.handleStopLossWatchdog(entry, q, settings)'));
  assert.ok(pg.includes('if (bid0<=danger || stopGuardState(entry)) return { handled:false }'));
  assert.ok(pg.includes("return this.commitStopGuardExit(entry,freshQ,merged,reason)"),'SLW1 must delegate an exit to the existing U-SG1 commit path');
  assert.ok(engine.includes("stopLossWatchdogLossAuthority: ULTIMATE_STOP_GUARD.version"));
  assert.equal(pg.includes("closeReason:'slw1"),false,'SLW1 must not create a competing close-reason/execution lane');
});

test('R40 FSI1 reconstructs the green feeder number without pretending the trough was a tradable signal entry',async()=>{
  const {createFeederSignalIntelState,applyFeederSignalObservation,FEEDER_SIGNAL_INTELLIGENCE}=await import('../src/feederSignalIntel.mjs');
  const now=1_000_000;
  const entry={
    id:'dragon-1',systemName:'SAGITTARIUS',conceptName:'Dragon',ticker:'T',eventTicker:'E',marketTitle:'Example',mode:'SIMULATION',
    entryPriceCents:2,currentPriceCents:35,count:1500,volume24h:52000,spreadAtEntryCents:1,openedAtMs:now,
    entryConfig:{release:'R40',referenceStakeCents:3000,dragonSource:{version:'CI1',episodeId:'ep1',episodeIndex:1,preCrashPeakCents:45,troughCents:2,crashDepthCents:43,reboundCents:34,reclaimRate:34/43,stableObservations:3,upwardTicks:2,validatedBidCents:35,validatedAskCents:36,signalPriceCents:36,signalAtMs:now,troughAtMs:now-10_000}},
  };
  const state=createFeederSignalIntelState(entry,{yesBid:35,yesAsk:36,volume24h:52000,updatedAtMs:now},{systemName:'SAGITTARIUS',simFeeCents:2},now);
  assert.equal(state.economics.referenceOriginCents,2);
  assert.equal(state.economics.referenceCount,1500);
  assert.equal(state.economics.signalAskCents,36);
  assert.equal(state.economics.analysisCount,555);
  assert.equal(state.semantics.hindsightEntryAtTrough,false);
  const market={bookAgeMs:()=>10,executableBid:()=>({full:true,filled:555,avgCents:45,bestCents:45})};
  applyFeederSignalObservation(state,{yesBid:45,yesAsk:46,updatedAtMs:now+1000,status:'active'},market,now+1000);
  assert.equal(state.trajectory.currentReferencePnlCents,58500,'2c trough reference stake should explain the displayed +$585 reference PnL');
  assert.equal(state.trajectory.currentNormalizedMarkPnlCents,2775,'the causal $200 signal-time hypothetical is only +$27.75 at 45c bid');
  assert.equal(state.trajectory.currentNormalizedExecutablePnlCents,2775);
  assert.equal(FEEDER_SIGNAL_INTELLIGENCE.executionAuthority,false);
  assert.equal(FEEDER_SIGNAL_INTELLIGENCE.entryAuthority,false);
});

test('R40 FSI1 captures causal large-green threshold crossings and measures what happens after the crossing',async()=>{
  const {createFeederSignalIntelState,applyFeederSignalObservation}=await import('../src/feederSignalIntel.mjs');
  const t0=2_000_000;
  const entry={id:'dragon-2',systemName:'SAGITTARIUS',conceptName:'Dragon',ticker:'T2',eventTicker:'E2',marketTitle:'Threshold',mode:'SIMULATION',entryPriceCents:5,currentPriceCents:30,count:600,volume24h:1000,spreadAtEntryCents:1,openedAtMs:t0,entryConfig:{referenceStakeCents:3000,dragonSource:{episodeId:'ep2',troughCents:5,crashDepthCents:35,validatedBidCents:29,validatedAskCents:30,signalPriceCents:30,signalAtMs:t0}}};
  const state=createFeederSignalIntelState(entry,{yesBid:29,yesAsk:30,updatedAtMs:t0},{systemName:'SAGITTARIUS',simFeeCents:2},t0);
  const market={bookAgeMs:()=>5,executableBid:(ticker,count)=>({full:true,filled:count,avgCents:50,bestCents:50})};
  applyFeederSignalObservation(state,{yesBid:50,yesAsk:51,updatedAtMs:t0+1000,status:'active'},market,t0+1000);
  const m=state.trajectory.referenceProfitMilestones['20000'];
  assert.ok(m,'+$200 reference PnL threshold should be captured at first crossing');
  assert.equal(m.hypotheticalEntryAskCents,51,'threshold experiment must enter at the observable crossing ask, not at the trough or original Dragon signal');
  applyFeederSignalObservation(state,{yesBid:60,yesAsk:61,updatedAtMs:t0+61_000,status:'active'},market,t0+61_000);
  assert.ok(m.horizons['60000']);
  assert.ok(m.horizons['60000'].markNetPnlCents>0,'future result is measured from the threshold crossing forward');
  applyFeederSignalObservation(state,{yesBid:0,yesAsk:0,updatedAtMs:t0+120_000,status:'finalized',result:'no'},null,t0+120_000);
  assert.equal(state.trackingComplete,true);
  assert.equal(m.finalResult,'no');
  assert.ok(m.finalMarkNetPnlCents<0,'the telemetry must preserve the later collapse after a large green threshold');
});

test('R40 FSI1 is diagnostics-only, persisted separately, and cannot enter the trading authority path',async()=>{
  const fsi=await readFile(resolve(root,'src/feederSignalIntel.mjs'),'utf8');
  const engine=await readFile(resolve(root,'src/engine.mjs'),'utf8');
  const strategy=await readFile(resolve(root,'src/strategy.mjs'),'utf8');
  const db=await readFile(resolve(root,'src/db.mjs'),'utf8');
  assert.equal(fsi.includes("from './kalshi.mjs'"),false);
  assert.equal(fsi.includes('placeOrder'),false);
  assert.equal(fsi.includes('manualCashout'),false);
  assert.ok(db.includes('sag_feeder_signal_intel_v1'));
  assert.ok(engine.includes('async diagnostics()'));
  assert.ok(engine.includes('return {...boundedBase,feederSignalIntelligence,diagnosticExport:'));
  assert.ok(fsi.includes('rawObservationsIncluded:false'));
  assert.ok(fsi.includes('recordsCompact:true'));
  assert.ok(fsi.includes('recordLimit=400'));
  assert.ok(fsi.includes('huntersByTicker'));
  assert.ok(fsi.includes('compactFeederSignalIntelRecord'));
  assert.equal(engine.includes('feederSignalIntelligence: feederSignalIntelligence'),false,'full FSI records must not bloat the 2-second dashboard state/SSE path');
  assert.ok(strategy.includes('this.onFeederOpened?.(e)'));
  assert.ok(strategy.includes('Feeder creation must never depend on telemetry'));
  assert.ok(engine.includes('feederSignalIntelligenceExecutionAuthority: false'));
  assert.ok(engine.includes('feederSignalIntelligenceAthenaDecisionAuthority: false'));
});


test('R42 Stop Guard preserves SGRL1 stake normalization and adds HELC1 as a non-negotiable U-SG1 capital covenant',async()=>{
  const doctrine=await readFile(resolve(root,'src/doctrine.mjs'),'utf8');
  const db=await readFile(resolve(root,'src/db.mjs'),'utf8');
  const learning=await readFile(resolve(root,'src/learning.mjs'),'utf8');
  const pg=await readFile(resolve(root,'src/profitGuard.mjs'),'utf8');
  const engine=await readFile(resolve(root,'src/engine.mjs'),'utf8');
  const strategy=await readFile(resolve(root,'src/strategy.mjs'),'utf8');
  assert.ok(doctrine.includes("version: 'SGRL1'"));
  assert.ok(doctrine.includes("policyRevision: 'SLW1-R3-HARD-ECONOMIC-CEILING'"));
  assert.ok(doctrine.includes("version: 'HELC1'"));
  assert.ok(doctrine.includes('lossRatio: 0.375'));
  assert.ok(doctrine.includes('absoluteMaximumLossCents: 7500'));
  assert.ok(doctrine.includes("fullPositionEconomicBasis: 'fee_adjusted_aggregate_liquidation_net'"));
  assert.ok(doctrine.includes('recoveryVetoAllowed: false'));
  assert.ok(doctrine.includes('durableFlattenRequired: true'));
  assert.ok(doctrine.includes("lossAuthority: 'U-SG1'"));
  assert.ok(doctrine.includes("stakeBasis: 'original_entry_notional'"));
  assert.ok(doctrine.includes('wakeLossRatio: 0.30'));
  assert.ok(doctrine.includes('catastrophicLossRatio: 0.90'));
  assert.ok(pg.includes('stopLossWatchdogThresholds(entry)'));
  assert.ok(pg.includes('hardEconomicLossCeiling(entry, settings'));
  assert.ok(pg.includes('probeHardEconomicLossCeiling'));
  assert.ok(pg.includes('commitHardEconomicLossCeiling'));
  assert.ok(pg.includes("commitStopGuardExit(entry, probe.q || q, durableState, 'hard_economic_loss_ceiling')"));
  assert.ok(pg.includes("phase:'EXIT_COMMITTED'"));
  assert.ok(pg.includes("exitReason:'hard_economic_loss_ceiling'"));
  assert.ok(strategy.includes('hardEconomicLossEntryFeasibility'));
  assert.ok(strategy.includes("trace('HELC_ENTRY_FEASIBILITY','BLOCKED'"));
  assert.ok(strategy.includes("'hunter_entry_helc_feasibility_blocked'"));
  assert.ok(strategy.includes('full_exit_depth_unavailable'));
  assert.ok(strategy.includes('entry_consumes_hard_economic_loss_budget'));
  assert.ok(pg.includes('lossThresholds.severeLossCents'));
  assert.ok(engine.includes('stopLossWatchdogStakeNormalized: STOP_LOSS_WATCHDOG.stakeNormalized'));
  assert.ok(engine.includes('hardEconomicLossCeiling: HARD_ECONOMIC_LOSS_CEILING.version'));
  assert.ok(engine.includes('hardEconomicLossCeilingRatio: HARD_ECONOMIC_LOSS_CEILING.lossRatio'));
  assert.ok(engine.includes('hardEconomicLossCeilingAbsoluteMaximumCents: HARD_ECONOMIC_LOSS_CEILING.absoluteMaximumLossCents'));
  assert.ok(engine.includes('hardEconomicLossCeilingRecoveryVetoAllowed: HARD_ECONOMIC_LOSS_CEILING.recoveryVetoAllowed'));
  assert.ok(engine.includes('hardEconomicLossCeilingDurableFlattenRequired: HARD_ECONOMIC_LOSS_CEILING.durableFlattenRequired'));
  assert.ok(engine.includes('hardEconomicLossCeilingLossAuthority: HARD_ECONOMIC_LOSS_CEILING.lossAuthority'));
  assert.ok(doctrine.includes('legacyRecoveryPatternDecisionAuthority: false'));
  assert.ok(doctrine.includes('marketObserverDecisionAuthority: false'));
  assert.ok(db.includes('sag_stop_guard_recovery_v1'));
  assert.ok(db.includes("coverage_kind text not null default 'causal_from_trigger'"));
  assert.ok(db.includes("coverage_kind='partial_from_upgrade'"));
  assert.ok(db.includes('sag_stop_guard_profiles_v1'));
  assert.equal(db.includes('drop table sag_recovery'),false);
  assert.equal(db.includes('truncate sag_recovery'),false);
  assert.ok(learning.includes("return this.stopGuardDecisionProfile('USG1'"));
  assert.ok(learning.includes("return this.stopGuardDecisionProfile('SLW1'"));
  assert.ok(learning.includes('durable_full_executable_fee_adjusted_recovery'));
  assert.ok(pg.includes("this.beginStopGuardLearningEpisode(entry,'SLW1'"));
  assert.ok(pg.includes("this.beginStopGuardLearningEpisode(entry,'USG1'"));
  assert.ok(pg.includes('slw1_severe_live_deterioration'));
  assert.ok(pg.includes('slw1_catastrophic_stall'));
  assert.ok(pg.includes('economic_severe_stall'));
  assert.ok(doctrine.includes('weakHistoryGraceMs: 5 * 60 * 1000'));
  assert.ok(doctrine.includes('minimumLiveOverrideAgeMs: 25 * 60 * 1000'));
  assert.ok(doctrine.includes('strongHistorySevereGraceMs: 30 * 60 * 1000'));
  assert.ok(doctrine.includes('severeStallMs: 30 * 60 * 1000'));
  assert.ok(doctrine.includes('catastrophicStallMs: 25 * 60 * 1000'));
  assert.ok(engine.includes('stopGuardHistoricalStrongUnlimitedVeto: false'));
  assert.ok(engine.includes("stopGuardRecoveryDefinition: 'full_position_executable_fee_adjusted_positive_net'"));
  assert.equal(pg.includes("closeReason:'slw1"),false,'R42 must still delegate all loss execution to the existing U-SG1 hard-stop lane');
  assert.equal(doctrine.includes('placeOrder'),false,'doctrine must never become an execution engine');
  assert.equal(learning.includes('placeOrder'),false,'learning must never become an execution engine');
});


test('R41-HF2 diagnostics serializer enforces a strict 5 MB UTF-8 body cap and prioritizes essential Stop Guard/runtime evidence',async()=>{
  const {serializeDiagnosticDownload,DIAGNOSTIC_EXPORT_MAX_BYTES}=await import('../src/server.mjs');
  const giant='x'.repeat(10_000);
  const fakeRecords=Array.from({length:300},(_,i)=>({feederId:`f${i}`,ticker:`T${i}`,observations:[giant,giant,giant]}));
  const diagnostic={
    settings:{release:'R41-HF2',mode:'SIMULATION'},riskControls:{ultimateStopGuard:'U-SG1',stopLossWatchdog:'SLW1',stopGuardRecoveryLearning:'SGRL1'},
    health:{degraded:false,protectionOk:true},performance:{portfolioValueCents:1_000_000},conceptStats:[],entryPipeline:{version:'EPT1'},
    stopGuardRecoveryLearning:{version:'SGRL1'},openHunters:[{id:'KEEP',profitGuard:{stopGuardState:{phase:'RECOVERING'}}}],closedHunters:[],scanner:{tracked:1},
    feederSignalIntelligence:{version:'FSI1',summary:{signals:300},records:fakeRecords,recordsAvailable:300,recordsIncluded:300},
    snapshots:Array.from({length:100},()=>({blob:giant})),crashEpisodes:Array.from({length:100},()=>({blob:giant})),patterns:Array.from({length:100},()=>({blob:giant})),trackedMarkets:Array.from({length:100},()=>({blob:giant})),liveMarkets:[],openFeeders:[],audit:[],sports:[],crashLearning:{states:[]},
  };
  const out=serializeDiagnosticDownload(diagnostic);
  assert.ok(out.bytes<=DIAGNOSTIC_EXPORT_MAX_BYTES,`diagnostic body ${out.bytes} exceeds ${DIAGNOSTIC_EXPORT_MAX_BYTES}`);
  const parsed=JSON.parse(out.text);
  assert.equal(parsed.settings.release,'R41-HF2');
  assert.equal(parsed.riskControls.stopGuardRecoveryLearning,'SGRL1');
  assert.equal(parsed.openHunters[0].id,'KEEP');
  assert.equal(parsed.diagnosticExport.hardCapEnforced,true);
});

test('R41-HF2 compact FSI diagnostic projection removes raw observation arrays but preserves causal economics, milestones and linked Hunter outcomes',async()=>{
  const {compactFeederSignalIntelRecord}=await import('../src/feederSignalIntel.mjs');
  const r=compactFeederSignalIntelRecord({version:'FSI1',feederId:'F',feederConcept:'Dragon',ticker:'T',trajectoryCoverage:'causal_from_signal',economics:{signalAskCents:40,analysisCount:500},trajectory:{observationCount:1200,storedObservationCount:900,currentNormalizedExecutablePnlCents:5000,checkpoints:{'60000':{markNetPnlCents:500}},referenceProfitMilestones:{'20000':{crossedAtMs:100,hypotheticalEntryAskCents:51,hypotheticalCount:392,horizons:{'60000':{atMs:60100,bidCents:60,askCents:61,markNetPnlCents:2744,referencePnlCents:22000}},finalMarkNetPnlCents:-1000,finalResult:'no'}}},observations:Array.from({length:1200},()=>({large:'ignored'})),linkedHunters:[{id:'H',pnlCents:-1000}]});
  assert.equal('observations' in r,false);
  assert.equal(r.trajectory.observationCount,1200);
  assert.equal(r.trajectory.referenceProfitMilestones['20000'].horizons['60000'].markNetPnlCents,2744);
  assert.equal(r.linkedHunters[0].id,'H');
});
