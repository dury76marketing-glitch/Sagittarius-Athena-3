import test from 'node:test';
import assert from 'node:assert/strict';
import { originalSettings } from '../src/config.mjs';
import { CRYSTAL_WALL, COSMO_ROUTING, INFINITY_BREAK, AURORA_EXECUTION, ATHENA_COMMANDER } from '../src/doctrine.mjs';
import { atomicThunderBoltFeatures, atomicThunderBoltDecision } from '../src/opportunity.mjs';
import { rankAthenaAttacks } from '../src/athena.mjs';
import { sealAthenaFireCommand, verifyAthenaFireCommandHash } from '../src/authority.mjs';
import { StrategyEngine, validateAthenaFireCommand, entryConfigSnapshot, recoverySignalState } from '../src/strategy.mjs';
import { SagittariusEngine } from '../src/engine.mjs';

const nowQuote = (ticker='CW', bid=56, ask=57) => {
  const now=Date.now(); const start=now-45*60_000;
  return {ticker,eventTicker:ticker,title:ticker,sport:'Tennis',yesBid:bid,yesAsk:ask,volume24h:10000,updatedAtMs:now,status:'active',result:'',gameStartTimeMs:start,liveStatus:'live',gameClockState:{version:'GCA2',eventTicker:ticker,phase:'CONFIRMED',confirmed:true,entryAuthorized:true,startTimeMs:start,source:'test',sourceStrength:'strong',observedAtMs:now,evidenceObservedAtMs:now,lastCheckedAtMs:now,authorizationReason:'test_fresh'}};
};
const refreshClock=async(q)=>{const now=Date.now();const start=q.gameStartTimeMs||now-45*60_000;return{gameStartTimeMs:start,liveStatus:'live',gameClockState:{...(q.gameClockState||{}),version:'GCA2',eventTicker:q.eventTicker||q.ticker,phase:'CONFIRMED',confirmed:true,entryAuthorized:true,startTimeMs:start,evidenceObservedAtMs:now,lastCheckedAtMs:now,authorizationReason:'test_force_fresh'}};};

function settings(overrides={}){
  return {...originalSettings(),systemName:'SAGITTARIUS',ownerId:'r64-test',mode:'SIMULATION',liveArmed:false,engineActive:true,simFillProbability:1,startingCapitalCents:10_000_000,maxPositions:50,maxEntriesPerTrade:20,hunterCooldownMinutes:45,minGameMinutes:10,maxGameMinutes:90,maxSpreadCents:3,recoveryHunterEnabled:true,recoveryStakeCents:20_000,recoveryMinEntryCents:10,recoveryMaxEntryCents:89,...overrides};
}

function fakeDb(initial=[]){
  const rows=new Map(initial.map(x=>[x.id,structuredClone(x)]));
  const episodes=new Map();
  return {
    rows,episodes,audits:[],inserted:[],updated:[],locks:[],
    async audit(level,event,data){this.audits.push({level,event,data});},
    async entries(){return [...rows.values()].map(x=>structuredClone(x));},
    async insertEntry(e){this.inserted.push(structuredClone(e));rows.set(e.id,structuredClone(e));},
    async updateEntry(id,patch){this.updated.push({id,patch:structuredClone(patch)});const e=rows.get(id);if(e)Object.assign(e,structuredClone(patch));},
    async entryById(id){const e=rows.get(id);return e?structuredClone(e):null;},
    async openEntries(){return [...rows.values()].filter(e=>['open','entry_pending','exit_pending','pending_recovery'].includes(e.status)).map(x=>structuredClone(x));},
    async openEntriesByTicker(_s,t){return [...rows.values()].filter(e=>e.ticker===t&&['open','entry_pending','exit_pending','pending_recovery'].includes(e.status)).map(x=>structuredClone(x));},
    async openHunterEntriesByTicker(_s,t){return [...rows.values()].filter(e=>e.ticker===t&&['open','entry_pending','exit_pending','pending_recovery'].includes(e.status)&&!['Pegasus','Dragon','Phoenix'].includes(e.conceptName)).map(x=>structuredClone(x));},
    async acquireHunterTickerLock(_s,key){this.locks.push(key);return async()=>{};},
    async upsertOpportunityEpisode(ep){const prior=episodes.get(ep.id)||{};episodes.set(ep.id,{...structuredClone(prior),...structuredClone(ep)});return structuredClone(episodes.get(ep.id));},
    async opportunityEpisode(id){const e=episodes.get(id);return e?structuredClone(e):null;},
    async recentClosed(){return [...rows.values()].filter(e=>e.status==='closed').map(x=>structuredClone(x));},
    async recentClosedForResearch(_s,sinceMs){return [...rows.values()].filter(e=>e.status==='closed'&&Number(e.closedAtMs||0)>=Number(sinceMs||0)).map(x=>structuredClone(x));},
    async profitEpisodes(){return [];},
    async profitEpisode(){return null;},
    async runLowPriorityPersistence(task){return task();},
  };
}

function fakeMarket(q=nowQuote()){
  const quote={...q};
  return {
    quote,
    history:[{t:Date.now()-30_000,bid:50,ask:51},{t:Date.now(),bid:quote.yesBid,ask:quote.yesAsk}],
    getHistory(){return this.history.map(x=>structuredClone(x));},
    async refreshTicker(){return {...quote};},
    async refreshTickerVerified(){return{marketFresh:true,bookFresh:true,quote:{...quote}};},
    getQuote(){return {...quote};},
    getBook(){return{updatedAtMs:Number(quote.updatedAtMs)||Date.now(),yesBids:[{priceCents:quote.yesBid,count:10000}],noBids:[{priceCents:100-quote.yesAsk,count:10000}]};},
    bookAgeMs(){return 0;},quoteAgeMs(){return 0;},
    async ensureFreshBook(){return this.getBook();},
    executableAsk(_ticker,count){return{filled:count,full:true,avgCents:quote.yesAsk,bestCents:quote.yesAsk};},
    executableBid(_ticker,count,floor=0){if(quote.yesBid<floor)return{filled:0,full:false,avgCents:0,bestCents:quote.yesBid};return{filled:count,full:true,avgCents:quote.yesBid,bestCents:quote.yesBid};},
    async refreshTickerVerifiedForExit(){return{marketFresh:true,bookFresh:true,quote:{...quote}};},
    setQuote(next){Object.assign(quote,next);}
  };
}

function strategyFixture({s=settings(),quote=nowQuote(),initial=[]}={}){
  const db=fakeDb(initial),market=fakeMarket(quote);
  const engine=new StrategyEngine({db,kalshi:{},market,learning:{},getSettings:()=>s,getLiveReady:()=>false,refreshGameClock:refreshClock,random:()=>0});
  return{db,market,s,quote,strategy:engine};
}

function greenShadow(ticker='CW',entryPriceCents=50){
  return {id:`shadow-${ticker}`,conceptName:'Pegasus',ticker,eventTicker:ticker,status:'open',entryPriceCents,openedAtMs:Date.now()-10_000,feederState:{}};
}

function lostParent(q,overrides={}){
  return {id:'lost-parent',systemName:'SAGITTARIUS',ownerId:'r64-test',conceptName:'Wave Surfer',ticker:q.ticker,eventTicker:q.eventTicker,side:'YES',sport:'Tennis',mode:'SIMULATION',status:'closed',remainingCount:0,entryPriceCents:70,exitPriceCents:40,pnlCents:-8000,closeReason:'hard_stop_loss',closedAtMs:Date.now()-1_000,openedAtMs:Date.now()-120_000,entryConfig:{},...overrides};
}

test('R64 Crystal Wall doctrine is a one-shot post-stop rebound continuation',()=>{
  assert.equal(CRYSTAL_WALL.version,'CRYSTAL-WALL-V2');
  assert.equal(CRYSTAL_WALL.trigger,'POST_HARD_STOP_LOSS');
  assert.equal(CRYSTAL_WALL.strategicEntryAuthority,'CRYSTAL_WALL_POST_STOP_CONTINUATION');
  assert.equal(CRYSTAL_WALL.parentCannotBeSelf,true);
  assert.equal(CRYSTAL_WALL.defaultMaxRepeats,1);
  assert.equal(CRYSTAL_WALL.reboundOrigin,'post_stop_trough');
  assert.deepEqual([...COSMO_ROUTING.followOnOnlyExceptions],['Recovery Hunter','Lightning Plasma']);
  const snap=entryConfigSnapshot(settings(),'Recovery Hunter');
  assert.equal(snap.model.structuralRole,'FOLLOW_ON_RECOVERY_ONLY');
  assert.equal(snap.strategicEntryAuthority,CRYSTAL_WALL.strategicEntryAuthority);
  assert.ok(String(snap.authorityChain).includes('HARD_STOP_LOSS->CRYSTAL_WALL'));
});

test('R64 Crystal Wall is absent from Cosmo GREEN / ordinary Athena selection even with an eligible loss',()=>{
  const s=settings({momentumHunterEnabled:false,waveSurferEnabled:false,crashRecoveryHunterEnabled:false,lightningPlasmaEnabled:false,athenaExclamationEnabled:false});
  const q=nowQuote('CW-GREEN',56,57);
  const f=atomicThunderBoltFeatures({q,history:[{t:Date.now()-30_000,bid:40,ask:41},{t:Date.now(),bid:56,ask:57}],settings:s,cosmos:[greenShadow(q.ticker,50)],recoveryContext:{eligible:true,sourceTradeId:'lost-parent',troughCents:40,reboundCents:16},now:Date.now()});
  assert.equal(f.eligibleAttacks.some(x=>x.concept==='Recovery Hunter'),false);
  assert.equal(rankAthenaAttacks({score:100,features:f},s,null,{recoveryContext:{eligible:true}}).some(x=>x.concept==='Recovery Hunter'),false);
  assert.equal(atomicThunderBoltDecision(f,s).detected,false);
});

test('R64 a fabricated normal Athena FIRE cannot open Crystal Wall outside continuation authority',async()=>{
  const s=settings();
  const q=nowQuote('CW-FORGED',56,57);
  const f=strategyFixture({s,quote:q});
  const now=Date.now();
  const core={version:ATHENA_COMMANDER.version,policyRevision:ATHENA_COMMANDER.policyRevision,boltId:'forged-crystal',systemName:s.systemName,sourceRelease:'R64',decidedAtMs:now,expiresAtMs:now+5000,ticker:q.ticker,eventTicker:q.eventTicker,side:'YES',selectedAttack:'Recovery Hunter',selectedAttackDisplay:'Crystal Wall',stakeCents:s.recoveryStakeCents,operatorMinEntryCents:s.recoveryMinEntryCents,operatorMaxEntryCents:s.recoveryMaxEntryCents,entryPriceCents:q.yesAsk,authorizedMaxEntryCents:q.yesAsk,maxSpreadCents:s.maxSpreadCents,auroraDamageControlPercent:s.auroraDamageControlPercent,infinityBreakPolicyVersion:INFINITY_BREAK.version,economicTarget:{version:'ATHENA-A3-ECONOMIC-TARGET-V1',netPerOriginalContractCents:Number(s.infinityBreakMinNetPerOriginalContractCents||1),requiredTargetBidCents:q.yesAsk+5,requiredGrossMoveCents:5,estimatedEntryFeePerContractCents:2,estimatedExitFeePerContractCents:2,targetFeasible:true},ranking:[{concept:'Recovery Hunter',score:90}],recoveryContext:{eligible:true,sourceTradeId:'lost-parent',troughCents:40,reboundCents:16},decisionEvidence:{recoveryContext:{eligible:true,sourceTradeId:'lost-parent',troughCents:40,reboundCents:16}}};
  const c=sealAthenaFireCommand(core);
  const e=await f.strategy.createHunter('Recovery Hunter',q,c.stakeCents,0,{athenaFireCommand:c,recoverySourceSnapshot:{sourceTradeId:'lost-parent',troughCents:40,reboundCents:16}});
  assert.equal(e,null);assert.equal(f.db.inserted.length,0);
  assert.ok(f.db.audits.some(x=>x.event==='crystal_wall_continuation_execution_blocked'&&x.data?.reason==='crystal_wall_continuation_authority_required'));
});

test('R64 rebound gate refuses the stop print and qualifies after trough lift',()=>{
  const s=settings();
  const parent=lostParent(nowQuote('CW-REB',40,41),{exitPriceCents:40});
  const atStop=recoverySignalState(parent,nowQuote('CW-REB',40,41),null,s,40);
  assert.equal(atStop.qualified,false);assert.equal(atStop.reason,'rebound_not_confirmed');
  const after=recoverySignalState(parent,nowQuote('CW-REB',46,47),null,s,40);
  assert.equal(after.qualified,true);assert.equal(after.reboundCents,6);
});

test('R64 post-stop continuation opens Crystal Wall after confirmed rebound and freezes lineage',async()=>{
  const s=settings();
  const q=nowQuote('CW-OPEN',46,47);
  const f=strategyFixture({s,quote:q});
  const parent=lostParent(q,{exitPriceCents:40});
  const entry=await f.strategy.executeCrystalWallContinuation(q,parent,{authorizationId:'CRYSTAL-WALL-CONTINUATION:lost-parent:1',authorizedAtMs:Date.now()});
  assert.ok(entry,`blocked: ${JSON.stringify({audits:f.db.audits,pipeline:f.strategy.entryPipelineSummary()})}`);
  assert.equal(entry.conceptName,'Recovery Hunter');
  assert.equal(entry.sourceTradeId,parent.id);
  assert.equal(entry.entryConfig.crystalWallContinuation.parentEntryId,parent.id);
  assert.equal(entry.entryConfig.crystalWallContinuation.repeatIndex,1);
  assert.equal(entry.entryConfig.athenaFire.authorityMode,CRYSTAL_WALL.strategicEntryAuthority);
  assert.equal(verifyAthenaFireCommandHash(entry.entryConfig.athenaFire),true);
  assert.equal(entry.entryConfig.infinityBreak.version,INFINITY_BREAK.version);
  assert.equal(entry.entryConfig.aurora.frozen,true);
  assert.equal(entry.entryConfig.recoverySource.sourceTradeId,parent.id);
});

test('R64 Crystal Wall refuses to follow itself and engine authorizes then watches until rebound',async()=>{
  const s=settings();
  const q=nowQuote('CW-WATCH',40,41);
  const db=fakeDb();
  const market=fakeMarket(q);
  const strategy=new StrategyEngine({db,kalshi:{},market,learning:{},getSettings:()=>s,getLiveReady:()=>false,refreshGameClock:refreshClock,random:()=>0});
  const engine=Object.create(SagittariusEngine.prototype);
  engine.settings=s;engine.db=db;engine.market=market;engine.strategy=strategy;
  engine.crystalWallContinuationInFlight=new Set();engine.crystalWallWatches=new Map();engine.crystalWallContinuationStats=null;engine.recoveryPriorityTickers=new Set();
  const self={...lostParent(q),id:'cw-self',conceptName:'Recovery Hunter'};
  assert.equal((await engine.handleCrystalWallContinuation(self)).reason,'parent_is_crystal_wall');
  const parent=lostParent(q);
  const first=await engine.handleCrystalWallContinuation(parent);
  assert.equal(first.status,'WATCHING');assert.equal(first.reason,'rebound_not_confirmed');
  const ep=await db.opportunityEpisode('CRYSTAL-WALL-CONTINUATION:lost-parent:1');
  assert.ok(ep);assert.notEqual(ep.athenaDecision?.crystalWallContinuation?.status,'OPENED');
  market.setQuote(nowQuote('CW-WATCH',46,47));
  const second=await engine.attemptCrystalWallContinuation(engine.crystalWallWatches.get('CRYSTAL-WALL-CONTINUATION:lost-parent:1'));
  assert.equal(second.status,'OPENED',JSON.stringify({second,audits:db.audits}));
  const replay=await engine.handleCrystalWallContinuation(parent);
  assert.equal(replay.status,'DUPLICATE_SUPPRESSED');
});
