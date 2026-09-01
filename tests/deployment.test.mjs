import test from 'node:test';import assert from 'node:assert/strict';import { readFile,readdir,stat } from 'node:fs/promises';import { resolve,dirname } from 'node:path';import { fileURLToPath } from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
async function files(dir){const out=[];for(const name of await readdir(dir)){if(name==='node_modules'||name==='.git'||name==='package-lock.json')continue;const p=resolve(dir,name),s=await stat(p);if(s.isDirectory())out.push(...await files(p));else out.push(p);}return out;}
test('deployment starts source directly and cannot repeat missing dist/index.js failure',async()=>{const pkg=JSON.parse(await readFile(resolve(root,'package.json'),'utf8'));assert.equal(pkg.scripts.start,'node src/index.mjs');assert.equal(pkg.scripts.start.includes('dist/'),false);const railway=JSON.parse(await readFile(resolve(root,'railway.json'),'utf8'));assert.equal(railway.deploy.startCommand,'npm start');assert.equal(railway.build.buildCommand,'npm test && npm run check');});
const R56_PROJECT_SOURCE_FILE_BUDGET=44; // R56 adds Arayashiki runtime plus its dedicated survival regression surface on top of R55 Phoenix; generated dependency files remain excluded.
test("R56 project stays within the explicit compact authored source-file budget even when npm generates package-lock.json",async()=>{const {RELEASE,originalSettings,CANONICAL_NUMERIC_SETTINGS,CANONICAL_BOOLEAN_SETTINGS,sanitizeRuntimeSettings,normalizeStartupExecutionMode}=await import('../src/config.mjs');const D=await import('../src/doctrine.mjs');const {readFile,readdir,stat}=await import('node:fs/promises');assert.equal(RELEASE,'SAGITTARIUS-R59-BIG-WAVE-CHOKE-RECOVERY-2026-08-29');const root=new URL('../',import.meta.url);async function walk(u){let out=[];for(const ent of await readdir(u,{withFileTypes:true})){if(ent.name==='node_modules'||ent.name==='.git'||ent.name==='package-lock.json')continue;const x=new URL(ent.name+(ent.isDirectory()?'/':''),u);if(ent.isDirectory())out.push(...await walk(x));else out.push(x);}return out;}const all=await walk(root);assert.equal(all.length,R56_PROJECT_SOURCE_FILE_BUDGET);assert.ok(all.some(x=>x.pathname.endsWith('/src/opportunity.mjs')));assert.ok(all.some(x=>x.pathname.endsWith('/src/authority.mjs')));assert.ok(all.some(x=>x.pathname.endsWith('/tests/r51.test.mjs')));});
test('all required Railway/Kalshi variables are recognized',async()=>{const src=await readFile(resolve(root,'src/config.mjs'),'utf8');for(const k of ['KALSHI_API_KEY_ID','KALSHI_PRIVATE_KEY_PEM','KALSHI_BASE_URL','DEFAULT_ENGINE_MODE','ALLOW_LIVE_TRADING','DATABASE_URL'])assert.ok(src.includes(k),`${k} missing`);});
test("R45 dashboard contains the four-layer Mega Wave architecture plus operational research sections",async()=>{const {RELEASE,originalSettings,CANONICAL_NUMERIC_SETTINGS,CANONICAL_BOOLEAN_SETTINGS,sanitizeRuntimeSettings,normalizeStartupExecutionMode}=await import('../src/config.mjs');const D=await import('../src/doctrine.mjs');const {readFile,readdir,stat}=await import('node:fs/promises');const html=await readFile(new URL('../public/index.html',import.meta.url),'utf8');const app=await readFile(new URL('../public/app.js',import.meta.url),'utf8');assert.ok(html.includes('ATOMIC THUNDER BOLT'));assert.ok(html.includes('ATHENA'));assert.ok(html.includes('INFINITY BREAK'));assert.ok(html.includes('AURORA EXECUTION'));assert.ok(html.includes('COSMO UNIVERSE'));assert.ok(app.includes('auroraDamageControlPercent'));assert.ok(app.includes('lightningPlasmaMaxStrikes'));for(const retired of ['momentumMinRiseCents','waveMinFeederFavorableMoveCents','crashRecoveryMinCrashCents','recoveryMinReboundCents'])assert.equal(app.includes(retired),false,retired);});

test("PDF-parity dashboard restores manual Hunter cashout and active Profit Guard visibility",async()=>{const {RELEASE,originalSettings,CANONICAL_NUMERIC_SETTINGS,CANONICAL_BOOLEAN_SETTINGS,sanitizeRuntimeSettings,normalizeStartupExecutionMode}=await import('../src/config.mjs');const D=await import('../src/doctrine.mjs');const {readFile,readdir,stat}=await import('node:fs/promises');const html=await readFile(new URL('../public/index.html',import.meta.url),'utf8');const app=await readFile(new URL('../public/app.js',import.meta.url),'utf8');assert.ok(html.includes('ATOMIC THUNDER BOLT'));assert.ok(html.includes('ATHENA'));assert.ok(html.includes('INFINITY BREAK'));assert.ok(html.includes('AURORA EXECUTION'));assert.ok(html.includes('COSMO UNIVERSE'));assert.ok(app.includes('auroraDamageControlPercent'));assert.ok(app.includes('lightningPlasmaMaxStrikes'));for(const retired of ['momentumMinRiseCents','waveMinFeederFavorableMoveCents','crashRecoveryMinCrashCents','recoveryMinReboundCents'])assert.equal(app.includes(retired),false,retired);});

test('crossed real-time books fail closed and trigger resync instead of feeding Hunters or Profit Guard',async()=>{const {MarketHub}=await import('../src/market.mjs');let resynced=false;const hub=new MarketHub({kalshi:{},wsUrl:'',fallbackWsUrl:'',getCredentials:()=>null});hub.quotes.set('T',{ticker:'T',yesBid:79,yesAsk:80,updatedAtMs:Date.now(),status:'active',result:'',bookInvalid:false});hub.books.set('T',{ticker:'T',yesBids:[{priceCents:80,count:1}],noBids:[{priceCents:25,count:1}],updatedAtMs:Date.now()});hub.resyncBook=async(ticker)=>{assert.equal(ticker,'T');resynced=true;};hub.applyBook('T');assert.equal(hub.getQuote('T').bookInvalid,true);await new Promise(r=>setImmediate(r));assert.equal(resynced,true);});

test('Railway health is liveness-only and remains 200 while engine is booting',async()=>{const { startServer }=await import('../src/server.mjs');const runtime={engine:null,boot:{status:'starting',startedAtMs:Date.now(),lastAttemptMs:Date.now(),attempts:1,lastError:null}};const server=startServer(runtime,0,root);await new Promise(r=>server.once('listening',r));const port=server.address().port;const health=await fetch(`http://127.0.0.1:${port}/health`);assert.equal(health.status,200);const h=await health.json();assert.equal(h.processAlive,true);assert.equal(h.engineReady,false);const ready=await fetch(`http://127.0.0.1:${port}/ready`);assert.equal(ready.status,503);await new Promise(r=>server.close(r));});

test('HTTP listener is started before engine initialization and boot retries are retained',async()=>{const src=await readFile(resolve(root,'src/index.mjs'),'utf8');const listenAt=src.indexOf('startServer(runtime');const engineAt=src.indexOf('new SagittariusEngine()');assert.ok(listenAt>=0&&engineAt>=0&&listenAt<engineAt,'HTTP server must bind before engine init');assert.ok(src.includes('while (!stopping && !runtime.engine)'));assert.ok(src.includes('await sleep(5000)'));});


test('database learning schema is versioned and legacy-compatible',async()=>{const src=await readFile(resolve(root,'src/db.mjs'),'utf8');assert.ok(src.includes('sag_recovery_observations_v2'));assert.ok(src.includes('sag_sport_profiles_v2'));assert.ok(src.includes("tableColumns('sag_recovery_observations')"));assert.ok(src.includes("obs.has('trade_id') && obs.has('complete')"));assert.ok(src.includes("obs.has('id') && obs.has('tracking_complete')"));assert.ok(src.includes('await this.migrateLearningData()'));assert.ok(src.includes('sag_profit_episodes_v1'));assert.ok(src.includes('sag_profit_profiles_v1'));assert.ok(src.includes('upsertProfitEpisode'));assert.ok(src.includes('upsertProfitProfile'));assert.equal(src.includes('create index if not exists sag_recovery_obs_system on sag_recovery_observations('),false);});

test("R49 dashboard exposes Athena Exclamation plus the seven existing model toggles, Galactic Explosion and shared maximum in-game entry control",async()=>{const {RELEASE,originalSettings,CANONICAL_NUMERIC_SETTINGS,CANONICAL_BOOLEAN_SETTINGS,sanitizeRuntimeSettings,normalizeStartupExecutionMode}=await import('../src/config.mjs');const D=await import('../src/doctrine.mjs');const {readFile,readdir,stat}=await import('node:fs/promises');const html=await readFile(new URL('../public/index.html',import.meta.url),'utf8');const app=await readFile(new URL('../public/app.js',import.meta.url),'utf8');assert.ok(html.includes('ATOMIC THUNDER BOLT'));assert.ok(html.includes('ATHENA'));assert.ok(html.includes('INFINITY BREAK'));assert.ok(html.includes('AURORA EXECUTION'));assert.ok(html.includes('COSMO UNIVERSE'));assert.ok(app.includes('auroraDamageControlPercent'));assert.ok(app.includes('lightningPlasmaMaxStrikes'));for(const retired of ['momentumMinRiseCents','waveMinFeederFavorableMoveCents','crashRecoveryMinCrashCents','recoveryMinReboundCents'])assert.equal(app.includes(retired),false,retired);});

test("R45 preserves EMI1 and Atomic Thunder while adding Aurora and Galactic Explosion without restoring R42/R43 authorities",async()=>{const {RELEASE,originalSettings,CANONICAL_NUMERIC_SETTINGS,CANONICAL_BOOLEAN_SETTINGS,sanitizeRuntimeSettings,normalizeStartupExecutionMode}=await import('../src/config.mjs');const D=await import('../src/doctrine.mjs');const {readFile,readdir,stat}=await import('node:fs/promises');const pg=await readFile(new URL('../src/profitGuard.mjs',import.meta.url),'utf8');assert.equal(D.INFINITY_BREAK.authority,'PROFIT_EXIT');assert.equal(D.AURORA_EXECUTION.lossAuthority,'U-SG1');assert.equal(D.AURORA_EXECUTION.defaultDamageControlPercent,45);assert.ok(pg.includes("'infinity_break'"));assert.ok(pg.includes("'atomic_thunder_cashout'"),'legacy Atomic history must remain compatible');assert.ok(pg.includes('auroraDamageControlPercent'));assert.equal(pg.includes('maximumPositionLifetimeMs'),false);});


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

test('R52 preserves Golden Eye isolation while adding only the explicit post-exit research state to sag_entries',async()=>{
  const db=await readFile(resolve(root,'src/db.mjs'),'utf8');
  assert.ok(db.includes('sag_golden_eye_state_v1'));
  assert.ok(db.includes('goldenEyeState(systemName)'));
  assert.ok(db.includes('saveGoldenEyeState(systemName,state)'));
  const sagEntriesSchema=(text)=>text.match(/create table if not exists sag_entries\s*\([\s\S]*?\);/)?.[0]||'';
  const schema=sagEntriesSchema(db);
  assert.ok(schema.length>0,'sag_entries schema must be present');
  assert.match(schema,/post_exit_state jsonb not null default/,'R52 must persist bounded post-exit regret/protection telemetry on the owned trade row');
  assert.equal(/golden[_ ]?eye/i.test(schema),false,'Golden Eye state must stay isolated from sag_entries');
});

test('R37 Golden Eye migration auto-enables only existing SIMULATION records while LIVE autonomy remains explicitly fail-safe off',async()=>{const C=await import('../src/config.mjs');const s=C.originalSettings();assert.equal(s.mode,'SIMULATION');assert.equal(s.liveArmed,false);assert.equal(C.normalizeStartupExecutionMode({...s,mode:'LIVE',liveArmed:true},true).settings.liveArmed,false);const old={...s};delete old.infinityBreakMinNetPerOriginalContractCents;old.atomicThunderMinNetPerOriginalContractCents=7;const migrated=C.sanitizeRuntimeSettings(old);assert.equal(migrated.infinityBreakMinNetPerOriginalContractCents,7);assert.equal(migrated.auroraDamageControlPercent,45);});

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


test("R45 Aurora freezes the Danger Line while preserving R41 U-SG1 plus SLW1-R2 loss authority and SGRL1 evidence",async()=>{const {RELEASE,originalSettings,CANONICAL_NUMERIC_SETTINGS,CANONICAL_BOOLEAN_SETTINGS,sanitizeRuntimeSettings,normalizeStartupExecutionMode}=await import('../src/config.mjs');const D=await import('../src/doctrine.mjs');const {readFile,readdir,stat}=await import('node:fs/promises');const pg=await readFile(new URL('../src/profitGuard.mjs',import.meta.url),'utf8');assert.equal(D.INFINITY_BREAK.authority,'PROFIT_EXIT');assert.equal(D.AURORA_EXECUTION.lossAuthority,'U-SG1');assert.equal(D.AURORA_EXECUTION.defaultDamageControlPercent,45);assert.ok(pg.includes("'infinity_break'"));assert.ok(pg.includes("'atomic_thunder_cashout'"),'legacy Atomic history must remain compatible');assert.ok(pg.includes('auroraDamageControlPercent'));assert.equal(pg.includes('maximumPositionLifetimeMs'),false);});


test('R45-HF1 diagnostics serializer enforces a strict 2 MB UTF-8 body cap and prioritizes essential runtime/open-position evidence',async()=>{
  const {serializeDiagnosticDownload,DIAGNOSTIC_EXPORT_MAX_BYTES}=await import('../src/server.mjs');
  assert.equal(DIAGNOSTIC_EXPORT_MAX_BYTES,2_000_000);
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
  assert.equal(parsed.diagnosticExport.version,'DX2');
});

test('R45-HF1 trading-log serializer enforces the same immutable 2 MB cap and preserves the newest/open-first prefix',async()=>{
  const {serializeTradingLogDownload,TRADING_LOG_EXPORT_MAX_BYTES}=await import('../src/server.mjs');
  assert.equal(TRADING_LOG_EXPORT_MAX_BYTES,2_000_000);
  const huge=['=== SAGITTARIUS TRADING LOGS ===','OPEN-KEEP '+('x'.repeat(500_000)),...Array.from({length:12},(_,i)=>`CLOSED-${i} ${'y'.repeat(300_000)}`)].join('\n');
  const out=serializeTradingLogDownload(huge,9_000_000);
  assert.ok(out.bytes<=2_000_000,`trading log body ${out.bytes} exceeds 2000000`);
  assert.equal(out.truncated,true);
  assert.ok(out.text.includes('OPEN-KEEP'));
  assert.ok(out.text.includes('TLX1 hard cap: 2000000 bytes'));
});

test('R45-HF1 compact trading log keeps analysis-critical trade economics while a 5000-row cohort remains downloadable under the hard barrier',async()=>{
  const {SagittariusEngine}=await import('../src/engine.mjs');
  const {serializeTradingLogDownload}=await import('../src/server.mjs');
  const engine=Object.create(SagittariusEngine.prototype);
  const now=Date.now();
  const rows=Array.from({length:5000},(_,i)=>({id:`H${i}`,ticker:`KXTESTGAME-${String(i).padStart(5,'0')}-YES`,conceptName:'Wave Surfer',sourceFeeder:'Pegasus',mode:'SIMULATION',status:i<20?'open':'closed',entryPriceCents:55,currentPriceCents:60,peakPriceCents:72,stopPriceCents:32,count:100,remainingCount:i<20?100:0,pnlCents:i<20?0:300,positionPnlCents:i<20?300:0,dataState:'LIVE',quoteAgeMs:500,lowestPriceAfterEntryCents:44,maeCents:11,maeAfterEntryMs:120000,recoveryToEntryMs:240000,recoveryToGreenMs:300000,closeReason:i<20?'':'atomic_thunder_cashout',openedAtMs:now-i*1000,closedAtMs:i<20?null:now-i*500}));
  engine.performance=async()=>({active:rows,hunters:rows,open:rows.slice(0,20),closed:rows.slice(20),wins:4980,losses:0,scratches:0,hunterRealizedCents:1_494_000,hunterUnrealizedCents:6_000});
  engine.decorateEntry=(e)=>e;
  const raw=await engine.tradingLogText();
  assert.ok(raw.startsWith('=== SAGITTARIUS TRADING LOGS ==='));
  assert.ok(raw.includes('Format: TLX1 compact analysis log'));
  assert.ok(raw.indexOf('KXTESTGAME-00000-YES')<raw.indexOf('KXTESTGAME-00020-YES'),'open positions must be emitted before closed history');
  const out=serializeTradingLogDownload(raw);
  assert.ok(out.bytes<=2_000_000);
  assert.ok(out.text.includes('entry=55c'));
  assert.ok(out.text.includes('mae=11c'));
});

test('R45-HF1 HTTP diagnostic and trading-log downloads advertise exact Content-Length and never exceed 2 MB',async()=>{
  const {startServer,DIAGNOSTIC_EXPORT_MAX_BYTES,TRADING_LOG_EXPORT_MAX_BYTES}=await import('../src/server.mjs');
  const giant='z'.repeat(3_000_000);
  const runtime={engine:{health:{degraded:false},async diagnostics(){return{settings:{mode:'SIMULATION'},riskControls:{auroraExecution:'AURORA-V1'},health:{degraded:false},performance:{},openHunters:[{id:'OPEN',blob:giant}],closedHunters:[],feederSignalIntelligence:{records:[]},snapshots:[{blob:giant}]};},async tradingLogText(){return`=== SAGITTARIUS TRADING LOGS ===\nOPEN\n${giant}`;}},boot:{status:'running',startedAtMs:Date.now(),attempts:1}};
  const server=startServer(runtime,0,root);await new Promise(r=>server.once('listening',r));const port=server.address().port;
  try{
    for(const [path,cap] of [['/api/diagnostics/download',DIAGNOSTIC_EXPORT_MAX_BYTES],['/api/trading-logs/download',TRADING_LOG_EXPORT_MAX_BYTES]]){
      const res=await fetch(`http://127.0.0.1:${port}${path}`);assert.equal(res.status,200);const bytes=(await res.arrayBuffer()).byteLength;assert.ok(bytes<=cap,`${path} returned ${bytes}`);assert.equal(Number(res.headers.get('content-length')),bytes);
    }
  }finally{await new Promise(r=>server.close(r));}
});

test('R41-HF2 compact FSI diagnostic projection removes raw observation arrays but preserves causal economics, milestones and linked Hunter outcomes',async()=>{
  const {compactFeederSignalIntelRecord}=await import('../src/feederSignalIntel.mjs');
  const r=compactFeederSignalIntelRecord({version:'FSI1',feederId:'F',feederConcept:'Dragon',ticker:'T',trajectoryCoverage:'causal_from_signal',economics:{signalAskCents:40,analysisCount:500},trajectory:{observationCount:1200,storedObservationCount:900,currentNormalizedExecutablePnlCents:5000,checkpoints:{'60000':{markNetPnlCents:500}},referenceProfitMilestones:{'20000':{crossedAtMs:100,hypotheticalEntryAskCents:51,hypotheticalCount:392,horizons:{'60000':{atMs:60100,bidCents:60,askCents:61,markNetPnlCents:2744,referencePnlCents:22000}},finalMarkNetPnlCents:-1000,finalResult:'no'}}},observations:Array.from({length:1200},()=>({large:'ignored'})),linkedHunters:[{id:'H',pnlCents:-1000}]});
  assert.equal('observations' in r,false);
  assert.equal(r.trajectory.observationCount,1200);
  assert.equal(r.trajectory.referenceProfitMilestones['20000'].horizons['60000'].markNetPnlCents,2744);
  assert.equal(r.linkedHunters[0].id,'H');
});

test('HF3 diagnostics and trading-log collection fail over to bounded runtime-only incident evidence when DB-backed collection stalls',async()=>{
  const {collectDiagnosticData,collectTradingLogText,serializeDiagnosticDownload,serializeTradingLogDownload}=await import('../src/server.mjs');
  const never=()=>new Promise(()=>{});
  const engine={
    settings:{systemName:'SAGITTARIUS',mode:'SIMULATION',pegasusEnabled:true,dragonEnabled:true,galacticExplosionEnabled:true,momentumHunterEnabled:true,waveSurferEnabled:true,recoveryHunterEnabled:true,crashRecoveryHunterEnabled:true},
    health:{degraded:true,lastError:'simulated_db_pressure'},lastError:'simulated_db_pressure',running:true,scanRequested:true,lastFullScanMs:123,
    protectedTickers:new Set(['A']),feederPriorityTickers:new Set(['A','B']),recoveryPriorityTickers:new Set(['C']),crashPriorityTickers:new Set(['D']),
    entryEvaluationQueue:{snapshot:()=>({maxConcurrency:2,active:2,pending:12,rerun:8,totalStarted:20,totalCoalesced:100,maxObservedActive:2})},
    quoteProtectionQueue:{snapshot:()=>({maxConcurrency:3,active:2,pending:1,rerun:0,totalStarted:10,totalCoalesced:3,maxObservedActive:3})},
    resourceUsageSnapshot:()=>({version:'RGM2',workload:{version:'DBPI2',quoteProtectionScope:'REAL_HUNTERS_ONLY',entryWorkers:2,protectionWorkers:3,ordinaryPoolReservedHeadroom:3,stateDbFanoutMaximum:2,referenceSignalSweepIntervalMs:30000},database:{mainPool:{max:8,total:8,idle:1,waiting:0},lockPool:{max:2,total:0,idle:0,waiting:0},maximumConnections:10}}),
    strategy:{entryPipelineSummary:()=>({version:'EPT1',attempts:99,opened:2,blocked:97})},
    diagnostics:never,tradingLogText:never,
  };
  const d=await collectDiagnosticData(engine,{timeoutMs:20});
  assert.equal(d.diagnosticExport.incidentFallback,true);
  assert.equal(d.diagnosticExport.collectionComplete,false);
  assert.equal(d.riskControls.incidentDiagnosticFallback,'RUNTIME_ONLY_NO_DB');
  assert.equal(d.riskControls.entryEvaluationBackpressure.active,2);
  assert.equal(d.resourceUsage.workload.version,'DBPI2');
  assert.equal(d.resourceUsage.workload.quoteProtectionScope,'REAL_HUNTERS_ONLY');
  assert.equal(d.incidentRuntime.feederPriorityTickerCount,2);
  assert.match(d.incidentRuntime.reason,/diagnostic_collection_timeout/);
  const ds=serializeDiagnosticDownload(d);assert.ok(ds.bytes<=2_000_000);

  const log=await collectTradingLogText(engine,{timeoutMs:20});
  assert.match(log,/TRADING LOG EXPORT FALLBACK/);assert.match(log,/collection_complete=false/);assert.match(log,/runtime_only_no_database_queries/);
  const ls=serializeTradingLogDownload(log);assert.ok(ls.bytes<=2_000_000);
});


test('R54 RGM3 pressure defers heavyweight historical exports without invoking DB-backed collectors',async()=>{
  const {collectDiagnosticData,collectTradingLogText}=await import('../src/server.mjs');
  let diagnosticsCalled=0,logsCalled=0;
  const engine={
    resourceResearchDeferred:true,resourcePressureState:'HARD_RESEARCH_SHED',
    settings:{systemName:'SAGITTARIUS',mode:'SIMULATION',pegasusEnabled:true,dragonEnabled:true,scarletNeedleEnabled:true},
    health:{degraded:false,lastError:null},lastError:null,running:true,scanRequested:false,lastFullScanMs:123,
    protectedTickers:new Set(['OPEN']),feederPriorityTickers:new Set(['COSMO']),recoveryPriorityTickers:new Set(),crashPriorityTickers:new Set(),
    entryEvaluationQueue:{snapshot:()=>({maxConcurrency:2,active:1,pending:0,rerun:0,totalStarted:1,totalCoalesced:0,maxObservedActive:1})},
    quoteProtectionQueue:{snapshot:()=>({maxConcurrency:3,active:1,pending:0,rerun:0,totalStarted:1,totalCoalesced:0,maxObservedActive:1})},
    resourceUsageSnapshot:()=>({version:'RGM4',pressureState:'HARD_RESEARCH_SHED',researchDeferred:true,workload:{version:'DBPI2'}}),
    strategy:{entryPipelineSummary:()=>({version:'EPT1',attempts:1,opened:1,blocked:0})},
    async diagnostics(){diagnosticsCalled+=1;throw new Error('must_not_run');},
    async tradingLogText(){logsCalled+=1;throw new Error('must_not_run');},
  };
  const d=await collectDiagnosticData(engine,{timeoutMs:100});
  assert.equal(diagnosticsCalled,0,'pressure fallback must not invoke historical diagnostics');
  assert.equal(d.diagnosticExport.incidentFallback,true);
  assert.match(d.incidentRuntime.reason,/diagnostic_deferred_resource_pressure/);
  assert.equal(d.resourceUsage.pressureState,'HARD_RESEARCH_SHED');
  const log=await collectTradingLogText(engine,{timeoutMs:100});
  assert.equal(logsCalled,0,'pressure fallback must not invoke full trading log collection');
  assert.match(log,/trading_log_deferred_resource_pressure/);
  assert.match(log,/RGM4 is protecting trading memory/);
});

test('R54 RGM3 live dashboard yields refresh cadence under memory pressure but never changes trading cadence',async()=>{
  const server=await readFile(resolve(root,'src/server.mjs'),'utf8');
  assert.match(server,/HARD_RESEARCH_SHED/);
  assert.match(server,/\?5000:pressure==='COMPACT'\?3000:2000/);
  assert.match(server,/const timer=setInterval\(push,1000\)/);
  assert.equal(server.includes('setInterval(push,5000)'),false,'five-second pressure cadence must be dashboard-only, not a replacement engine loop');
});

test('R54 closed-position dashboard projection never rehydrates full historical Athena FIRE graphs',async()=>{
  const {Database}=await import('../src/db.mjs');
  let sql='';
  const db=Object.create(Database.prototype);
  db.pool={query:async(q)=>{sql=String(q);return{rows:[]};}};
  const rows=await db.recentClosedHunters('S',{limit:150});
  assert.deepEqual(rows,[]);
  assert.match(sql,/jsonb_build_object\('aurora'/);
  assert.match(sql,/entry_config->'infinityBreak'/);
  assert.equal(/select\s+\*/i.test(sql),false,'closed dashboard query must not select full rows');
  assert.match(sql,/'\{\}'::jsonb as stop_guard_state/);
});

test('R54 Railway startup never awaits Scarlet Needle historical arm restoration',async()=>{
  const {AthenaCommander}=await import('../src/athena.mjs');
  let incompleteReads=0,releaseIncomplete;
  const incomplete=new Promise((resolve)=>{releaseIncomplete=resolve;});
  const db={
    async entries(){return[];},
    async opportunityEpisodes(_system,options={}){if(options.trackingComplete===false){incompleteReads+=1;return incomplete;}return[];},
    async profitEpisodes(){return[];},
    async audit(){},
  };
  const athena=new AthenaCommander({db,systemName:'S',sourceRelease:'R54-RGM3-TEST',getSettings:()=>({scarletNeedleEnabled:true})});
  const initResult=await Promise.race([athena.init().then(()=> 'ready'),new Promise((resolve)=>setTimeout(()=>resolve('blocked'),100))]);
  assert.equal(initResult,'ready','Athena core memory initialization must not wait on active Needle restoration');
  assert.equal(incompleteReads,0,'startup init must not touch incomplete Needle history');
  const hydration=athena.hydrateScarletNeedleArms();
  await new Promise((resolve)=>setImmediate(resolve));
  assert.equal(incompleteReads,1,'Needle history is restored only by the detached hydration path');
  assert.equal(athena.summary().scarletNeedle.hydration.state,'LOADING');
  releaseIncomplete([]);await hydration;
  assert.equal(athena.summary().scarletNeedle.hydration.state,'READY');
  const dbSource=await readFile(resolve(root,'src/db.mjs'),'utf8');
  assert.equal(dbSource.includes('activeScarletNeedleArms'),false,'R54 must not add an unindexed Scarlet JSON history scan');
  const engineSource=await readFile(resolve(root,'src/engine.mjs'),'utf8');
  const runningAt=engineSource.indexOf('this.running = true;');
  const hydrateAt=engineSource.indexOf('hydrateScarletNeedleArms?.()');
  assert.ok(runningAt>=0&&hydrateAt>runningAt,'Needle restoration must be detached after the engine reaches its running startup phase');
});

test('R54 dashboard always exposes Scarlet Needle and deploys frontend assets without stale-cache split versions',async()=>{
  const app=await readFile(resolve(root,'public/app.js'),'utf8');
  const html=await readFile(resolve(root,'public/index.html'),'utf8');
  const server=await readFile(resolve(root,'src/server.mjs'),'utf8');
  const engine=await readFile(resolve(root,'src/engine.mjs'),'utf8');
  const scarletAt=app.indexOf("{legacy:'Scarlet Needle',name:'Scarlet Needle'");
  const athenaAt=app.indexOf("{legacy:'Athena Exclamation',name:'Athena Exclamation'");
  const waveAt=app.indexOf("{legacy:'Wave Surfer',name:'Pegasus Ryu Sei Ken'");
  assert.ok(athenaAt>=0&&scarletAt>athenaAt&&waveAt>scarletAt,'Scarlet Needle must be the second visible Execution Attack row');
  for(const key of ['scarletNeedleEnabled','scarletNeedleStakeCents','scarletNeedleMinEntryCents','scarletNeedleMaxEntryCents'])assert.ok(app.includes(key),key);
  assert.ok(app.includes('fixed 10c retracement'));
  assert.ok(engine.includes("this.settings.scarletNeedleEnabled === true ? 'Scarlet Needle'"),'enabled Needle must be reported as an initial-exposure Attack');
  assert.ok(html.includes('/styles.css?v=R59BWR1'));
  assert.ok(html.includes('/app.js?v=R59BWR1'));
  assert.equal(server.includes("public, max-age=300"),false,'dashboard assets may not retain the old five-minute cache policy');
  assert.ok(server.includes("'cache-control':'no-store'"),'static dashboard responses must be no-store');

  const {startServer}=await import('../src/server.mjs');
  const runtime={engine:null,boot:{status:'starting',startedAtMs:Date.now(),attempts:1}};
  const srv=startServer(runtime,0,root);await new Promise(r=>srv.once('listening',r));const port=srv.address().port;
  try{
    for(const path of ['/','/app.js?v=R59BWR1','/styles.css?v=R59BWR1']){
      const res=await fetch(`http://127.0.0.1:${port}${path}`);assert.equal(res.status,200,path);assert.equal(res.headers.get('cache-control'),'no-store',path);
    }
    const js=await (await fetch(`http://127.0.0.1:${port}/app.js?v=R59BWR1`)).text();assert.ok(js.includes("name:'Scarlet Needle'"));
  }finally{await new Promise(r=>srv.close(r));}
});

test('R54 trade-priority DB readers keep admission, capital, recovery and startup history narrow',async()=>{
  const {Database}=await import('../src/db.mjs');
  const db=Object.create(Database.prototype);
  const seen=[];
  db.pool={query:async(q)=>{seen.push(String(q));return{rows:[{realized_cents:0,reserved_cents:0,active_entries:0,latest_hunter_entry_ms:0}]};}};
  await db.athenaR2FeederContextRows('S',{limit:32});
  await db.simulationCashAggregate('S',{simFeeCents:2});
  await db.hunterEventPolicySnapshot('S','EV');
  await db.recoverySourceEntries('S',{sinceMs:1});
  await db.feederEvaluationContext('S',{sinceMs:1});
  await db.sourceTradeIdsByConcept('S','Dragon');
  await db.recoveryObservationsByOriginalEntryIds('S',['E1']);
  await db.trackerHistoryRows('S',100);
  assert.equal(seen.length,8);
  for(const sql of seen)assert.equal(/select\s+\*/i.test(sql),false,`hot-path query must not SELECT *: ${sql.slice(0,80)}`);
  assert.match(seen[1],/sum\(pnl_cents\)/i,'simulation cash must be aggregated in PostgreSQL');
  assert.match(seen[2],/count\(\*\).*filter/i,'event policy must be aggregated in PostgreSQL');
  assert.match(seen[6],/original_entry_id = any/i,'recovery observations must be restricted to candidate source IDs');
  assert.match(seen[7],/select ticker,price_history,last_scan_ms/i,'startup tracker hydration must project only market history fields');
});

test('R54 StrategyEngine prefers compact trade-priority readers over the 5000-row historical ledger',async()=>{
  const {StrategyEngine}=await import('../src/strategy.mjs');
  let fullLedgerReads=0,compactContext=0,cashReads=0,recoveryReads=0,observationReads=0;
  const db={
    async entries(){fullLedgerReads+=1;throw new Error('full ledger forbidden');},
    async athenaR2FeederContextRows(){compactContext+=1;return[{id:'P1',conceptName:'Pegasus',ticker:'T',eventTicker:'E',entryPriceCents:55,openedAtMs:1,entryConfig:{}}];},
    async simulationCashAggregate(){cashReads+=1;return{realizedCents:125,reservedCents:25};},
    async recoverySourceEntries(){recoveryReads+=1;return[{id:'L1',conceptName:'Momentum Hunter',ticker:'T',eventTicker:'E',entryPriceCents:60,exitPriceCents:20,closedAtMs:Date.now(),entryConfig:{}}];},
    async recoveryObservationsByOriginalEntryIds(_system,ids){observationReads+=1;assert.deepEqual(ids,['L1']);return[{original_entry_id:'L1',trough_cents:10}];},
    async audit(){},
  };
  const settings={systemName:'S',startingCapitalCents:100000,simFeeCents:2,recoveryHunterEnabled:true,recoveryTrackingHours:24};
  const strategy=new StrategyEngine({db,kalshi:{},market:{},learning:{},getSettings:()=>settings,getLiveReady:()=>true});
  await strategy.hydrateAthenaR2FeederContext();
  assert.equal(strategy.athenaR2FeederHistory.length,1);
  assert.equal(await strategy.simulationAvailableCashCents(),100100);
  assert.deepEqual(await strategy.recoveryCandidateTickers(),['T']);
  const observations=await strategy.recoveryObservationsBySource(['L1']);
  assert.equal(observations.get('L1')?.trough_cents,10);
  assert.equal(compactContext,1);assert.equal(cashReads,1);assert.equal(recoveryReads,1);assert.equal(observationReads,1);
  assert.equal(fullLedgerReads,0,'production compact readers must prevent a 5000-row ledger hydration');
});

test('R54 Athena quote path and startup tracker hydration cannot restore heavyweight historical reads',async()=>{
  const engine=await readFile(resolve(root,'src/engine.mjs'),'utf8');
  const start=engine.indexOf('async init()');
  const startupEnd=engine.indexOf('async start()',start);
  const startup=engine.slice(start,startupEnd>start?startupEnd:start+30000);
  assert.match(startup,/trackerHistoryRows\(this\.settings\.systemName,100\)/,'startup must hydrate only the bounded tracker-history projection');
  assert.equal(/trackers\(this\.settings\.systemName,\s*2000\)/.test(startup),false,'startup may not hydrate 2000 full tracker rows');
  const oppStart=engine.indexOf('async evaluateNewGenerationOpportunities');
  const oppEnd=engine.indexOf('\n  async ',oppStart+10);
  const opp=engine.slice(oppStart,oppEnd>oppStart?oppEnd:oppStart+30000);
  assert.match(opp,/openEntries\(s\.systemName\)/,'Athena quote evaluation must use active entries only');
  assert.match(opp,/recoverySourceEntries\(s\.systemName/,'Athena quote evaluation must use compact recovery candidates');
  assert.match(opp,/recoveryObservationsBySource\(recoveryLosses\.map/,'recovery observations must be requested only for candidate source IDs');
});

test('R55 Phoenix is event-driven, reference-only, TTL-bounded and cannot contaminate frozen Athena B2-R2 context',async()=>{
  const config=await readFile(resolve(root,'src/config.mjs'),'utf8');
  const doctrine=await readFile(resolve(root,'src/doctrine.mjs'),'utf8');
  const engine=await readFile(resolve(root,'src/engine.mjs'),'utf8');
  const strategy=await readFile(resolve(root,'src/strategy.mjs'),'utf8');
  const db=await readFile(resolve(root,'src/db.mjs'),'utf8');
  const phoenix=await readFile(resolve(root,'src/phoenix.mjs'),'utf8');
  const app=await readFile(resolve(root,'public/app.js'),'utf8');
  const html=await readFile(resolve(root,'public/index.html'),'utf8');

  assert.ok(config.includes("SAGITTARIUS-R59-BIG-WAVE-CHOKE-RECOVERY-2026-08-29"));
  assert.ok(config.includes('phoenixEnabled: false'),'Phoenix must migrate fail-safe OFF');
  assert.ok(config.includes("'phoenixEnabled'"));
  for(const key of ['phoenixReferenceStakeCents','phoenixMinPriceCents','phoenixMaxPriceCents'])assert.ok(config.includes(key),key);

  assert.ok(doctrine.includes("version:'PHOENIX-COSMO-V1'"));
  assert.ok(doctrine.includes("policyRevision:'PC1-R1-CONFIRMED-LOW-BAND-ASCENT'"));
  assert.ok(doctrine.includes('minimumRiseCents:4'));
  assert.ok(doctrine.includes('minimumUpTicks:3'));
  assert.ok(doctrine.includes('requiredFreshConfirmations:2'));
  assert.ok(doctrine.includes('signalTtlMs:60_000'));
  assert.ok(doctrine.includes('entryAuthority:false'));
  assert.ok(doctrine.includes('orderAuthority:false'));
  assert.ok(doctrine.includes("activeCosmos:Object.freeze(['Pegasus','Dragon','Phoenix'])"));

  assert.ok(engine.includes("import { PhoenixCosmoEngine } from './phoenix.mjs'"));
  assert.ok(engine.includes('this.phoenixCosmo?.observe?.(q,Date.now())'));
  assert.ok(engine.includes('this.queuePhoenixSignal(phoenix,q)'));
  const fullScanStart=engine.indexOf('async fullScan('),fullScanEnd=engine.indexOf('\n  async ',fullScanStart+20);
  const fullScan=engine.slice(fullScanStart,fullScanEnd>fullScanStart?fullScanEnd:engine.length);
  assert.equal(fullScan.includes('phoenixCosmo?.observe'),false,'Phoenix must not add a second broad scanner');
  assert.ok(engine.includes('HARD_RESEARCH_SHED:128'),'RGM3 must be able to compact transient Phoenix watches first');

  assert.ok(strategy.includes("!['Pegasus','Dragon'].includes(String(entry.conceptName||''))"),'frozen B2 context must explicitly exclude Phoenix');
  assert.ok(strategy.includes("acquireCosmoSignalLock(s.systemName,'Phoenix',ticker)"),'Phoenix materialization needs cross-process serialization');
  assert.ok(strategy.includes('phoenixSignalActive(e,s,at)'),'duplicate check must respect TTL');
  assert.ok(strategy.includes("createGhost('Phoenix'"),'Phoenix must materialize only as a ghost/reference Cosmo');
  assert.ok(db.includes("concept_name in ('Pegasus','Dragon')"),'frozen B2 SQL reader must exclude Phoenix');
  assert.ok(db.includes("concept_name='Phoenix' and status='open'"),'Phoenix TTL expiry must be durable in PostgreSQL');
  assert.ok(db.includes('cosmo-signal'),'Phoenix needs a dedicated advisory-lock namespace');

  assert.ok(phoenix.includes('minimumRecentTrades'));
  assert.ok(phoenix.includes("reason:'new_local_low'"));
  assert.ok(phoenix.includes('sourceDoesNotAuthorizeEntry:true'));
  assert.ok(app.includes("legacy:'Phoenix',name:'Phoenix'"));
  assert.ok(html.includes('Pegasus, Dragon and Phoenix'));
  assert.ok(html.includes('/styles.css?v=R59BWR1'));
  assert.ok(html.includes('/app.js?v=R59BWR1'));
});

test('R56 Athena A3 embeds Arayashiki A8 before FIRE and execution cannot create a second predictive survival veto',async()=>{
  const doctrine=await readFile(resolve(root,'src/doctrine.mjs'),'utf8');
  const athena=await readFile(resolve(root,'src/athena.mjs'),'utf8');
  const engine=await readFile(resolve(root,'src/engine.mjs'),'utf8');
  const strategy=await readFile(resolve(root,'src/strategy.mjs'),'utf8');
  const arayashiki=await readFile(resolve(root,'src/arayashiki.mjs'),'utf8');
  const model=await readFile(resolve(root,'src/athenaB2R2Model.mjs'),'utf8');
  const { ATHENA_B2 }=await import('../src/athena.mjs');
  const html=await readFile(resolve(root,'public/index.html'),'utf8');
  const app=await readFile(resolve(root,'public/app.js'),'utf8');

  assert.ok(doctrine.includes("version:'ATHENA-A3'"));
  assert.ok(doctrine.includes("version:'ARAYASHIKI-A8-V1'"));
  assert.ok(doctrine.includes("postFirePredictiveVeto:false"));
  assert.ok(doctrine.includes("noEvidencePolicy:'NOT_CERTIFIED'"));
  assert.ok(athena.includes("examineArayashikiSurvival({bolt,context,selectedAttack:null,now})"));
  assert.ok(athena.indexOf("examineArayashikiSurvival({bolt,context,selectedAttack:null,now})")<athena.indexOf('ranking=rankAthenaAttacks(bolt,settings,this.memory,context)'));
  assert.ok(athena.includes("decision='SURVIVAL_REJECT'"));
  assert.ok(athena.includes('survivalCertificate'));
  assert.ok(strategy.includes('verifyArayashikiCertificate(command.survivalCertificate,now)'));
  assert.equal(strategy.includes('examineArayashikiSurvival'),false,'post-FIRE execution may verify but never recompute predictive survival');
  assert.ok(engine.includes('crashState'));
  assert.ok(engine.includes('survivalFeatures'));
  assert.ok(arayashiki.includes('all_cosmo_sources_invalidated_by_regime'));
  assert.ok(arayashiki.includes('source_predates_current_regime'));
  assert.ok(arayashiki.includes('low_band_directional_proof_missing'));
  assert.ok(model.includes('ATHENA_B2_R2_MODEL'));
  assert.equal(ATHENA_B2.guardianModelHash,'77f1153640f1565f7eaaa8823d8dacd2b18d9bfd954e4590ddd63e8e79a5feb4');
  assert.ok(html.includes('ARAYASHIKI'));
  assert.ok(app.includes('survivalCertified'));
  assert.ok(app.includes('survivalRejected'));
});
