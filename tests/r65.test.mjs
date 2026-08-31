import test from 'node:test';
import assert from 'node:assert/strict';
import { RELEASE, originalSettings, sanitizeRuntimeSettings, CANONICAL_NUMERIC_SETTINGS } from '../src/config.mjs';
import { ATHENA_EXCLAMATION, LIGHTNING_PLASMA, ATHENA_EXIT_INTELLIGENCE, AURORA_EXECUTION, ANOTHER_DIMENSION } from '../src/doctrine.mjs';
import { StrategyEngine } from '../src/strategy.mjs';
import { SagittariusEngine } from '../src/engine.mjs';
import { ProfitGuard } from '../src/profitGuard.mjs';

const active=(s)=>['open','entry_pending','exit_pending','pending_recovery'].includes(String(s));
function settings(overrides={}){return {...originalSettings(),systemName:'SAGITTARIUS',ownerId:'r65-owner',mode:'SIMULATION',liveArmed:false,engineActive:true,simFillProbability:1,startingCapitalCents:10_000_000,maxPositions:50,maxEntriesPerTrade:20,hunterCooldownMinutes:0,minGameMinutes:0,maxGameMinutes:90,maxSpreadCents:3,geminiEnabled:true,justiceArrowEnabled:true,athenaExclamationEnabled:true,lightningPlasmaEnabled:true,athenaExclamationMinEntryCents:20,athenaExclamationMaxEntryCents:89,lightningPlasmaMinEntryCents:20,lightningPlasmaMaxEntryCents:89,lightningPlasmaFieldStakeCents:21_000,infinityBreakMinNetPerOriginalContractCents:1,auroraDamageControlPercent:45,...overrides};}
function quote(ticker='GEM',bid=79,ask=80){const now=Date.now(),start=now-45*60_000;return{ticker,eventTicker:ticker,seriesTicker:ticker,title:ticker,sport:'Tennis',yesBid:bid,yesAsk:ask,volume24h:10000,updatedAtMs:now,status:'active',result:'',gameStartTimeMs:start,closeTimeMs:now+60*60_000,liveStatus:'live',gameClockState:{version:'GCA2',eventTicker:ticker,phase:'CONFIRMED',confirmed:true,entryAuthorized:true,startTimeMs:start,source:'test',sourceStrength:'strong',evidenceObservedAtMs:now,lastCheckedAtMs:now,authorizationReason:'r65_test'}};}
function parentAD({id='AD-1',ticker='GEM',status='closed',anchor=70,pnl=100,openedAtMs=Date.now()-60_000}={}){return{id,systemName:'SAGITTARIUS',ownerId:'r65-owner',conceptName:'Another Dimension',ticker,eventTicker:ticker,marketTitle:ticker,side:'YES',sport:'Tennis',mode:'SIMULATION',status,entryPriceCents:anchor,currentPriceCents:anchor,peakPriceCents:anchor,count:10,remainingCount:status==='closed'?0:10,pnlCents:status==='closed'?pnl:0,exitPriceCents:status==='closed'?75:null,closeReason:status==='closed'?ANOTHER_DIMENSION.profitableCloseReason:null,openedAtMs,closedAtMs:status==='closed'?Date.now()-1000:null,updatedAtMs:Date.now()-1000,sourceFeeder:'Gemini',sourceTradeId:`COSMO-${id}`,entryConfig:{universe:'Gemini'}};}
function fakeMarket(q=quote()) {const m={quote:{...q},history:[{t:Date.now()-30_000,bid:Number(q.yesBid)-2,ask:Number(q.yesAsk)-2},{t:Date.now(),bid:Number(q.yesBid),ask:Number(q.yesAsk)}]};return{get quote(){return m.quote;},history:m.history,getQuote(){return{...m.quote};},getHistory(){return m.history.map(x=>structuredClone(x));},setQuote(bid,ask=Math.min(100,bid+1)){m.quote={...m.quote,yesBid:bid,yesAsk:ask,updatedAtMs:Math.max(Date.now(),Number(m.quote.updatedAtMs||0)+1)};m.history.push({t:m.quote.updatedAtMs,bid,ask});},getBook(){return{updatedAtMs:m.quote.updatedAtMs,yesBids:[{priceCents:m.quote.yesBid,count:10000}],noBids:[{priceCents:100-m.quote.yesAsk,count:10000}]};},quoteAgeMs(){return 0;},bookAgeMs(){return 0;},async refreshTickerVerified(){m.quote={...m.quote,updatedAtMs:Date.now()};return{marketFresh:true,bookFresh:true,quote:{...m.quote},marketObservedAtMs:Date.now(),bookObservedAtMs:Date.now()};},async refreshTickerVerifiedForExit(){return this.refreshTickerVerified();},async ensureFreshBook(){return this.getBook();},executableAsk(_t,c){return{filled:c,full:true,avgCents:m.quote.yesAsk,bestCents:m.quote.yesAsk};},executableBid(_t,c,floor=0){if(m.quote.yesBid<floor)return{filled:0,full:false,avgCents:0,bestCents:m.quote.yesBid};return{filled:c,full:true,avgCents:m.quote.yesBid,bestCents:m.quote.yesBid};}};}
function fakeDb(initial=[]) {const rows=new Map(initial.map(x=>[x.id,structuredClone(x)])),episodes=new Map(),audits=[];return{rows,episodes,audits,async audit(level,event,data){audits.push({level,event,data});},async entries(){return[...rows.values()].map(x=>structuredClone(x));},async entriesByConcept(_s,c){return[...rows.values()].filter(x=>x.conceptName===c).map(x=>structuredClone(x));},async openEntries(){return[...rows.values()].filter(x=>active(x.status)).map(x=>structuredClone(x));},async openEntriesByTicker(_s,t){return[...rows.values()].filter(x=>x.ticker===t&&active(x.status)).map(x=>structuredClone(x));},async openHunterEntriesByTicker(_s,t){return[...rows.values()].filter(x=>x.ticker===t&&active(x.status)&&x.conceptName!=='Another Dimension').map(x=>structuredClone(x));},async entryById(id){const x=rows.get(id);return x?structuredClone(x):null;},async entryByConceptSourceTradeId(_s,c,sourceId){const x=[...rows.values()].find(r=>r.conceptName===c&&r.sourceTradeId===sourceId);return x?structuredClone(x):null;},async insertEntry(e){rows.set(e.id,structuredClone(e));},async updateEntry(id,p){const x=rows.get(id);if(x)Object.assign(x,structuredClone(p));},async acquireHunterTickerLock(){return async()=>{};},async upsertOpportunityEpisode(ep){const prior=episodes.get(ep.id)||{};episodes.set(ep.id,{...structuredClone(prior),...structuredClone(ep)});return structuredClone(episodes.get(ep.id));},async opportunityEpisode(id){const x=episodes.get(id);return x?structuredClone(x):null;},async runLowPriorityPersistence(task){return task();},async profitEpisode(){return null;},async profitEpisodes(){return[];},async recentClosed(){return[...rows.values()].filter(x=>x.status==='closed').map(x=>structuredClone(x));}};}
const refreshClock=async(q)=>({gameStartTimeMs:q.gameStartTimeMs,liveStatus:'live',gameClockState:{...q.gameClockState,entryAuthorized:true,evidenceObservedAtMs:Date.now(),lastCheckedAtMs:Date.now()}});

function routingEngine({cycleState,aeResult='AE',justiceResult='JA',existingEpisodes=[]}={}){
  const e=Object.create(SagittariusEngine.prototype),q=quote('ROUTE',79,80),parent=parentAD({id:'AD-ROUTE',ticker:'ROUTE'}),episodes=new Map(existingEpisodes.map(x=>[x.id,structuredClone(x)])),calls=[];
  e.settings=settings();e.justiceArrowInFlight=new Set();e.justiceArrowStats=null;e.athenaExclamationStats=null;
  e.currentAthenaExclamationCycleState=async()=>structuredClone(cycleState||{version:ATHENA_EXCLAMATION.version,threshold:12,justiceArrowCount:0,armed:false,cycleStartedAtMs:0,lastAthenaExclamationEntryId:null,pendingAthenaExclamationEntryId:null});
  e.market={async refreshTickerVerified(){return{marketFresh:true,bookFresh:true,quote:{...q}};}};
  e.strategy={async executeAthenaExclamationContinuation(fresh,p,ctx){calls.push({attack:'AE',fresh:structuredClone(fresh),parent:p.id,ctx:structuredClone(ctx)});return aeResult?{id:'AE-OPEN',conceptName:'Athena Exclamation',ticker:fresh.ticker,entryPriceCents:fresh.yesAsk,openedAtMs:Date.now(),entryConfig:{athenaFire:{selectedAttack:'Athena Exclamation'}}}:null;},async executeJusticeArrowContinuation(fresh,p,ctx){calls.push({attack:'JA',fresh:structuredClone(fresh),parent:p.id,ctx:structuredClone(ctx)});return justiceResult?{id:'JA-OPEN',conceptName:'Sagittarius Justice Arrow',ticker:fresh.ticker,entryPriceCents:fresh.yesAsk,openedAtMs:Date.now(),entryConfig:{athenaFire:{selectedAttack:'Sagittarius Justice Arrow'}}}:null;}};
  e.db={async acquireHunterTickerLock(){return async()=>{};},async opportunityEpisode(id){const x=episodes.get(id);return x?structuredClone(x):null;},async upsertOpportunityEpisode(ep){episodes.set(ep.id,{...(episodes.get(ep.id)||{}),...structuredClone(ep)});},async audit(){}};
  return{e,q,parent,calls,episodes};
}

test('R65 release and fixed Lightning Plasma doctrine are exact',()=>{
  assert.equal(RELEASE,'SAGITTARIUS-R65-GEMINI-LIGHTNING-PLASMA-ATHENA-EXCLAMATION-2026-08-31');
  assert.equal(LIGHTNING_PLASMA.sourceUniverse,'Gemini');assert.equal(LIGHTNING_PLASMA.sourceAttack,'Another Dimension');assert.equal(LIGHTNING_PLASMA.minimumUpliftCents,4);assert.equal(LIGHTNING_PLASMA.maxStrikes,3);assert.equal(LIGHTNING_PLASMA.noTimeWindow,true);assert.equal(LIGHTNING_PLASMA.fieldBudgetSharedAcrossStrikes,true);
  assert.equal(ATHENA_EXCLAMATION.triggerEveryJusticeArrows,12);assert.equal(ATHENA_EXCLAMATION.fallbackAttack,'Sagittarius Justice Arrow');
  assert.equal(CANONICAL_NUMERIC_SETTINGS.includes('lightningPlasmaMaxStrikes'),false);assert.equal(sanitizeRuntimeSettings({...settings(),lightningPlasmaMaxStrikes:99}).lightningPlasmaMaxStrikes,3);
});

test('R65 AE2 cycle reconstruction counts only proven Justice fills, survives restart and resets only on proven AE fill',async()=>{
  const e=Object.create(SagittariusEngine.prototype);e.settings=settings({resetTimestampMs:1});
  const marker={justiceArrowContinuation:{athenaExclamationCycleVersion:ATHENA_EXCLAMATION.version}},aeMarker={athenaExclamation:{version:ATHENA_EXCLAMATION.version}};
  const arrows=Array.from({length:12},(_,i)=>({id:`J-${i}`,conceptName:'Sagittarius Justice Arrow',status:'closed',openedAtMs:10+i,entryConfig:marker}));
  arrows.push({id:'J-PENDING',conceptName:'Sagittarius Justice Arrow',status:'entry_pending',openedAtMs:30,entryConfig:marker});
  let aes=[{id:'AE-PENDING',conceptName:'Athena Exclamation',status:'entry_pending',openedAtMs:31,entryConfig:aeMarker}];
  e.db={async entriesByConcept(_s,c){return structuredClone(c==='Athena Exclamation'?aes:arrows);}};
  let state=await e.currentAthenaExclamationCycleState();assert.equal(state.justiceArrowCount,12);assert.equal(state.armed,true);assert.equal(state.pendingAthenaExclamationEntryId,'AE-PENDING');assert.equal(state.lastAthenaExclamationEntryId,null);
  aes=[{id:'AE-FILLED',conceptName:'Athena Exclamation',status:'closed',openedAtMs:20,entryConfig:aeMarker}];
  state=await e.currentAthenaExclamationCycleState();assert.equal(state.lastAthenaExclamationEntryId,'AE-FILLED');assert.equal(state.justiceArrowCount,1,'only proven arrows strictly after the AE fill start the next cycle; entry_pending is excluded');assert.equal(state.armed,false);
});

test('R65 before arrow 12 the profitable Another Dimension close routes only to Sagittarius Justice Arrow',async()=>{
  const x=routingEngine({cycleState:{justiceArrowCount:11,armed:false,cycleStartedAtMs:0,pendingAthenaExclamationEntryId:null}});const out=await x.e.handleJusticeArrowContinuation(x.parent);
  assert.equal(out.attack,'Sagittarius Justice Arrow');assert.deepEqual(x.calls.map(c=>c.attack),['JA']);
});

test('R65 after arrow 12 the next profitable Another Dimension close is diverted to Athena Exclamation',async()=>{
  const x=routingEngine({cycleState:{justiceArrowCount:12,armed:true,cycleStartedAtMs:0,pendingAthenaExclamationEntryId:null}});const out=await x.e.handleJusticeArrowContinuation(x.parent);
  assert.equal(out.attack,'Athena Exclamation');assert.deepEqual(x.calls.map(c=>c.attack),['AE']);
});

test('R65 Athena Exclamation hard/unfilled failure gives the exact same fresh Gemini opportunity back to Justice Arrow',async()=>{
  const x=routingEngine({cycleState:{justiceArrowCount:12,armed:true,cycleStartedAtMs:0,pendingAthenaExclamationEntryId:null},aeResult:null});const out=await x.e.handleJusticeArrowContinuation(x.parent);
  assert.equal(out.attack,'Sagittarius Justice Arrow');assert.deepEqual(x.calls.map(c=>c.attack),['AE','JA']);assert.equal(x.calls[0].fresh.ticker,x.calls[1].fresh.ticker);assert.equal(x.calls[0].fresh.yesAsk,x.calls[1].fresh.yesAsk);assert.equal(x.e.athenaExclamationStats.fallbacks,1);assert.equal(x.e.athenaExclamationStats.fallbackJusticeOpened,1);
});

test('R65 unresolved Athena Exclamation entry_pending cannot reset the cycle or create a second AE race',async()=>{
  const x=routingEngine({cycleState:{justiceArrowCount:12,armed:true,cycleStartedAtMs:0,pendingAthenaExclamationEntryId:'AE-PENDING'}});const out=await x.e.handleJusticeArrowContinuation(x.parent);
  assert.equal(out.attack,'Sagittarius Justice Arrow');assert.deepEqual(x.calls.map(c=>c.attack),['JA']);
});

test('R65 Lightning Plasma engine opens one available strike per qualifying asynchronous market and never exceeds three slots',async()=>{
  const e=Object.create(SagittariusEngine.prototype),now=Date.now(),s=settings({lightningPlasmaFieldStakeCents:21_000});e.settings=s;e.running=true;e.entryExecutionGate=()=>({allowed:true});e.lightningPlasmaEvaluationPromise=null;e.lightningPlasmaRerunRequested=false;e.lightningPlasmaStats=null;
  const refs=['A','B','C','D'].map((t,i)=>parentAD({id:`AD-${t}`,ticker:t,status:'open',anchor:50+i,openedAtMs:now-(i+1)*3_600_000}));e.anotherDimensionRecent=new Map(refs.map(r=>[r.id,r]));
  const quotes=new Map(refs.map((r,i)=>[r.ticker,quote(r.ticker,r.entryPriceCents+4,r.entryPriceCents+5)]));const opened=[];
  e.market={getQuote(t){return quotes.get(t);},async refreshTickerVerified(t){return{marketFresh:true,bookFresh:true,quote:quotes.get(t)}}};
  e.db={async acquireHunterTickerLock(){return async()=>{};},async entriesByConcept(){return[];},async entryById(id){return structuredClone(e.anotherDimensionRecent.get(id));},async entryByConceptSourceTradeId(){return null;},async audit(){}};
  e.strategy={async executeLightningPlasmaGeminiStrike(q,p,ctx){opened.push({ticker:q.ticker,parent:p.id,ctx:structuredClone(ctx)});return{id:`LP-${q.ticker}`,conceptName:'Lightning Plasma',ticker:q.ticker,status:'open',sourceTradeId:p.id};}};
  const out=await e.runLightningPlasmaEvaluation('test');assert.equal(out.opened.length,3);assert.equal(out.qualifiedMarkets,4);assert.equal(out.maxSlots,3);assert.equal(opened.length,3);assert.equal(opened.every(x=>x.ctx.rayStakeCents===7000),true);assert.equal(opened.every(x=>x.ctx.fieldBudgetCents===21000),true);
  // With two already occupied slots, a later fourth market may fill only the one free slot.
  e.lightningPlasmaEvaluationPromise=null;e.db.entriesByConcept=async()=>[{id:'LP-X',conceptName:'Lightning Plasma',ticker:'X',status:'open'},{id:'LP-Y',conceptName:'Lightning Plasma',ticker:'Y',status:'open'}];opened.length=0;
  const second=await e.runLightningPlasmaEvaluation('later');assert.equal(second.opened.length,1);assert.equal(opened.length,1);
});

test('R65 direct Gemini Lightning Plasma opens through hard execution safety with fixed one-third budget and ATHENA-X1/Aurora',async()=>{
  const s=settings({lightningPlasmaFieldStakeCents:21_000}),q=quote('LP-E2E',74,75),parent=parentAD({id:'AD-LP-E2E',ticker:'LP-E2E',status:'open',anchor:70}),db=fakeDb(),market=fakeMarket(q);
  const st=new StrategyEngine({db,kalshi:{},market,learning:{},getSettings:()=>s,getLiveReady:()=>false,refreshGameClock:refreshClock,random:()=>0});
  const entry=await st.executeLightningPlasmaGeminiStrike(q,parent,{authorizationId:'LP-E2E-AUTH',maxSlots:3,fieldBudgetCents:21000,rayStakeCents:7000,slotIndex:1});
  assert.ok(entry);assert.equal(entry.conceptName,'Lightning Plasma');assert.equal(entry.status,'open');assert.equal(entry.entryConfig.profitAuthority,ATHENA_EXIT_INTELLIGENCE.version);assert.equal(entry.entryConfig.lossAuthority,AURORA_EXECUTION.lossAuthority);assert.equal(entry.entryConfig.model.stakeCents,7000);assert.equal(entry.entryConfig.model.configuredStakeCents,21000);assert.equal(entry.entryConfig.lightningPlasmaGemini.upliftCents,4);assert.equal(entry.sourceTradeId,parent.id);
});

test('R65 direct Gemini Athena Exclamation opens only on an armed profitable AD handoff and freezes ATHENA-X1/Aurora',async()=>{
  const s=settings(),q=quote('AE-E2E',79,80),parent=parentAD({id:'AD-AE-E2E',ticker:'AE-E2E'}),db=fakeDb(),market=fakeMarket(q);
  const st=new StrategyEngine({db,kalshi:{},market,learning:{},getSettings:()=>s,getLiveReady:()=>false,refreshGameClock:refreshClock,random:()=>0});
  assert.equal(await st.executeAthenaExclamationContinuation(q,parent,{authorizationId:'AE-NOT-ARMED',cycleState:{justiceArrowCount:11,armed:false}}),null);
  const entry=await st.executeAthenaExclamationContinuation(q,parent,{authorizationId:'AE-E2E-AUTH',cycleState:{justiceArrowCount:12,armed:true,cycleStartedAtMs:0}});
  assert.ok(entry);assert.equal(entry.conceptName,'Athena Exclamation');assert.equal(entry.status,'open');assert.equal(entry.entryConfig.profitAuthority,ATHENA_EXIT_INTELLIGENCE.version);assert.equal(entry.entryConfig.lossAuthority,AURORA_EXECUTION.lossAuthority);assert.equal(entry.entryConfig.athenaExclamation.continuation.justiceArrowCount,12);assert.equal(entry.sourceTradeId,parent.id);
});


test('R65 Athena Exclamation full SIM lifecycle reaches ATHENA-X1 activation and exits through ATHENA-X1 while Aurora stays frozen underneath',async()=>{
  const s=settings({infinityBreakMinNetPerOriginalContractCents:3,infinityBreakRequiredConfirmations:2,infinityBreakMaximumBookAgeMs:1000,infinityBreakConfirmationWindowMs:3000}),q=quote('AE-LIFE',79,80),parent=parentAD({id:'AD-AE-LIFE',ticker:'AE-LIFE'}),db=fakeDb(),market=fakeMarket(q);
  const st=new StrategyEngine({db,kalshi:{},market,learning:{},getSettings:()=>s,getLiveReady:()=>false,refreshGameClock:refreshClock,random:()=>0});
  const entry=await st.executeAthenaExclamationContinuation(q,parent,{authorizationId:'AE-LIFE-AUTH',cycleState:{justiceArrowCount:12,armed:true,cycleStartedAtMs:0}});assert.ok(entry);assert.equal(entry.entryConfig.athenaExit.activationMinimumNetPerOriginalContractCents,3);assert.ok(entry.entryConfig.aurora.dangerPriceCents>0);
  const learning={async onHardStop(){},async stopGuardProfile(){return null;},async lossWatchdogProfile(){return null;},profitLearningState(){return null;},async observeProfitOpportunity(){return null;},profitRetentionProfileCached(){return{retentionRatio:.92,specificity:'cold_start',promoted:false,totalObservations:0,oneTickPullbacks:0,oneTickRecoveries:0,continuationRate:.5,collapseRate:.25,confidence:'low'};},crashState(){return null;},async markProfitExit(){}};
  const guard=new ProfitGuard({db,kalshi:{},market,learning,getSettings:()=>s});
  market.setQuote(95,96);let out=await guard.protect(await db.entryById(entry.id));assert.equal(out.closed??false,false);let live=await db.entryById(entry.id);assert.equal(live.profitGuardState.version,ATHENA_EXIT_INTELLIGENCE.version);assert.equal(live.profitGuardState.activationLatched,true);
  for(const bid of [93,91,89,87]){market.setQuote(bid,bid+1);out=await guard.protect(await db.entryById(entry.id));if(out.closed)break;}
  assert.equal(out.closed,true);const closed=await db.entryById(entry.id);assert.equal(closed.status,'closed');assert.equal(closed.closeReason,'athena_x1_exit');assert.ok(closed.pnlCents>0);
});

test('R65 Lightning Plasma full SIM lifecycle remains independently protected by its frozen Aurora loss authority',async()=>{
  const s=settings({auroraDamageControlPercent:35,lightningPlasmaFieldStakeCents:21_000}),q=quote('LP-LOSS',74,75),parent=parentAD({id:'AD-LP-LOSS',ticker:'LP-LOSS',status:'open',anchor:70}),db=fakeDb(),market=fakeMarket(q);
  const st=new StrategyEngine({db,kalshi:{},market,learning:{},getSettings:()=>s,getLiveReady:()=>false,refreshGameClock:refreshClock,random:()=>0});
  const entry=await st.executeLightningPlasmaGeminiStrike(q,parent,{authorizationId:'LP-LOSS-AUTH',maxSlots:3,fieldBudgetCents:21000,rayStakeCents:7000,slotIndex:1});assert.ok(entry);assert.equal(entry.entryConfig.aurora.damageControlPercent,35);
  const danger=Number(entry.entryConfig.aurora.dangerPriceCents);assert.ok(danger>0&&danger<entry.entryPriceCents);market.setQuote(1,2);
  const learning={async onHardStop(){},async stopGuardProfile(){return null;},async lossWatchdogProfile(){return null;}};const guard=new ProfitGuard({db,kalshi:{},market,learning,getSettings:()=>s});
  const out=await guard.protect(await db.entryById(entry.id));assert.equal(out.closed,true);const closed=await db.entryById(entry.id);assert.equal(closed.status,'closed');assert.equal(closed.closeReason,'hard_stop_loss');assert.ok(closed.pnlCents<0);assert.equal(closed.entryConfig.aurora.damageControlPercent,35);
});
