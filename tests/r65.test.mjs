import test from 'node:test';
import assert from 'node:assert/strict';
import { originalSettings } from '../src/config.mjs';
import { LIGHTNING_PLASMA, COSMO_ROUTING, INFINITY_BREAK, AURORA_EXECUTION, ATHENA_COMMANDER, ANOTHER_DIMENSION } from '../src/doctrine.mjs';
import { atomicThunderBoltFeatures } from '../src/opportunity.mjs';
import { rankAthenaAttacks } from '../src/athena.mjs';
import { sealAthenaFireCommand, verifyAthenaFireCommandHash } from '../src/authority.mjs';
import { StrategyEngine, entryConfigSnapshot, plasmaSignalState } from '../src/strategy.mjs';
import { SagittariusEngine } from '../src/engine.mjs';

const nowQuote = (ticker='LP', bid=56, ask=57) => {
  const now=Date.now(); const start=now-45*60_000;
  return {ticker,eventTicker:ticker,title:ticker,sport:'Tennis',yesBid:bid,yesAsk:ask,volume24h:10000,updatedAtMs:now,status:'active',result:'',gameStartTimeMs:start,liveStatus:'live',gameClockState:{version:'GCA2',eventTicker:ticker,phase:'CONFIRMED',confirmed:true,entryAuthorized:true,startTimeMs:start,source:'test',sourceStrength:'strong',observedAtMs:now,evidenceObservedAtMs:now,lastCheckedAtMs:now,authorizationReason:'test_fresh'}};
};
const refreshClock=async(q)=>{const now=Date.now();const start=q.gameStartTimeMs||now-45*60_000;return{gameStartTimeMs:start,liveStatus:'live',gameClockState:{...(q.gameClockState||{}),version:'GCA2',eventTicker:q.eventTicker||q.ticker,phase:'CONFIRMED',confirmed:true,entryAuthorized:true,startTimeMs:start,evidenceObservedAtMs:now,lastCheckedAtMs:now,authorizationReason:'test_force_fresh'}};};

function settings(overrides={}){
  return {...originalSettings(),systemName:'SAGITTARIUS',ownerId:'r65-test',mode:'SIMULATION',liveArmed:false,engineActive:true,simFillProbability:1,startingCapitalCents:10_000_000,maxPositions:50,maxEntriesPerTrade:20,hunterCooldownMinutes:45,minGameMinutes:10,maxGameMinutes:90,maxSpreadCents:3,geminiEnabled:true,lightningPlasmaEnabled:true,lightningPlasmaFieldStakeCents:20_000,lightningPlasmaMinEntryCents:10,lightningPlasmaMaxEntryCents:89,...overrides};
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

function greenShadow(ticker='LP',entryPriceCents=50){
  return {id:`shadow-${ticker}`,conceptName:'Pegasus',ticker,eventTicker:ticker,status:'open',entryPriceCents,openedAtMs:Date.now()-10_000,feederState:{}};
}

function lostAd(q,overrides={}){
  return {id:'ad-lost',systemName:'SAGITTARIUS',ownerId:'r65-test',conceptName:'Another Dimension',ticker:q.ticker,eventTicker:q.eventTicker,side:'YES',sport:'Tennis',mode:'SIMULATION',status:'closed',remainingCount:0,entryPriceCents:70,exitPriceCents:40,pnlCents:-8000,closeReason:ANOTHER_DIMENSION.lossCloseReason,closedAtMs:Date.now()-1_000,openedAtMs:Date.now()-120_000,sourceFeeder:'Pegasus',sourceTradeId:'cosmo-1',entryConfig:{},...overrides};
}

test('R65 Lightning Plasma doctrine is a one-shot Gemini post-AD-loss rebound continuation',()=>{
  assert.equal(LIGHTNING_PLASMA.version,'LIGHTNING-PLASMA-V2');
  assert.equal(LIGHTNING_PLASMA.trigger,'POST_LOSS_ANOTHER_DIMENSION_CLOSE');
  assert.equal(LIGHTNING_PLASMA.strategicEntryAuthority,'LIGHTNING_PLASMA_POST_SHADOW_LOSS');
  assert.equal(LIGHTNING_PLASMA.parentCannotBeSelf,true);
  assert.equal(LIGHTNING_PLASMA.defaultMaxRepeats,1);
  assert.equal(LIGHTNING_PLASMA.reboundOrigin,'post_ad_loss_trough');
  assert.ok(COSMO_ROUTING.followOnOnlyExceptions.includes('Lightning Plasma'));
  assert.equal(COSMO_ROUTING.currentInitialEntryConsumers.includes('Lightning Plasma'),false);
  const snap=entryConfigSnapshot(settings(),'Lightning Plasma');
  assert.equal(snap.model.structuralRole,'FOLLOW_ON_GEMINI_LOSS_ONLY');
  assert.equal(snap.strategicEntryAuthority,LIGHTNING_PLASMA.strategicEntryAuthority);
  assert.ok(String(snap.authorityChain).includes('ANOTHER_DIMENSION_LOSS->LIGHTNING_PLASMA'));
});

test('R65 Lightning Plasma is absent from Cosmo GREEN / ordinary Athena selection',()=>{
  const s=settings({momentumHunterEnabled:false,waveSurferEnabled:false,crashRecoveryHunterEnabled:false,athenaExclamationEnabled:false,recoveryHunterEnabled:false});
  const q=nowQuote('LP-GREEN',56,57);
  const f=atomicThunderBoltFeatures({q,history:[{t:Date.now()-30_000,bid:40,ask:41},{t:Date.now(),bid:56,ask:57}],settings:s,cosmos:[greenShadow(q.ticker,50)],fieldContext:{lightningPlasmaQualified:true,independentEventCount:3,cosmoCount:3},now:Date.now()});
  assert.equal(f.eligibleAttacks.some(x=>x.concept==='Lightning Plasma'),false);
  assert.equal(rankAthenaAttacks({score:100,features:f},s,null,{fieldContext:{lightningPlasmaQualified:true}}).some(x=>x.concept==='Lightning Plasma'),false);
});

test('R65 a fabricated normal Athena FIRE cannot open Plasma outside continuation authority',async()=>{
  const s=settings();
  const q=nowQuote('LP-FORGED',56,57);
  const f=strategyFixture({s,quote:q});
  const now=Date.now();
  const core={version:ATHENA_COMMANDER.version,policyRevision:ATHENA_COMMANDER.policyRevision,boltId:'forged-plasma',systemName:s.systemName,sourceRelease:'R65',decidedAtMs:now,expiresAtMs:now+5000,ticker:q.ticker,eventTicker:q.eventTicker,side:'YES',selectedAttack:'Lightning Plasma',selectedAttackDisplay:'Lightning Plasma',stakeCents:s.lightningPlasmaFieldStakeCents,operatorMinEntryCents:s.lightningPlasmaMinEntryCents,operatorMaxEntryCents:s.lightningPlasmaMaxEntryCents,entryPriceCents:q.yesAsk,authorizedMaxEntryCents:q.yesAsk,maxSpreadCents:s.maxSpreadCents,auroraDamageControlPercent:s.auroraDamageControlPercent,infinityBreakPolicyVersion:INFINITY_BREAK.version,economicTarget:{version:'ATHENA-A3-ECONOMIC-TARGET-V1',netPerOriginalContractCents:Number(s.infinityBreakMinNetPerOriginalContractCents||1),requiredTargetBidCents:q.yesAsk+5,requiredGrossMoveCents:5,estimatedEntryFeePerContractCents:2,estimatedExitFeePerContractCents:2,targetFeasible:true},ranking:[{concept:'Lightning Plasma',score:90}],decisionEvidence:{}};
  const c=sealAthenaFireCommand(core);
  const e=await f.strategy.createHunter('Lightning Plasma',q,c.stakeCents,0,{athenaFireCommand:c});
  assert.equal(e,null);assert.equal(f.db.inserted.length,0);
  assert.ok(f.db.audits.some(x=>String(x.event||'').includes('lightning_plasma')||String(x.event||'').includes('athena_fire_execution')||String(x.data?.reason||'').includes('plasma')));
});

test('R65 rebound gate refuses the AD stop print and qualifies after trough lift',()=>{
  const s=settings();
  const parent=lostAd(nowQuote('LP-REB',40,41),{exitPriceCents:40});
  const atStop=plasmaSignalState(parent,nowQuote('LP-REB',40,41),null,s,40);
  assert.equal(atStop.qualified,false);assert.equal(atStop.reason,'rebound_not_confirmed');
  const after=plasmaSignalState(parent,nowQuote('LP-REB',46,47),null,s,40);
  assert.equal(after.qualified,true);assert.equal(after.reboundCents,6);
});

test('R65 post-AD-loss continuation opens Plasma after confirmed rebound and freezes lineage',async()=>{
  const s=settings();
  const q=nowQuote('LP-OPEN',46,47);
  const f=strategyFixture({s,quote:q});
  const parent=lostAd(q,{exitPriceCents:40});
  const entry=await f.strategy.executeLightningPlasmaContinuation(q,parent,{authorizationId:'LIGHTNING-PLASMA-CONTINUATION:ad-lost:1',authorizedAtMs:Date.now()});
  assert.ok(entry,`blocked: ${JSON.stringify({audits:f.db.audits,pipeline:f.strategy.entryPipelineSummary?.()})}`);
  assert.equal(entry.conceptName,'Lightning Plasma');
  assert.equal(entry.sourceFeeder,'Another Dimension');
  assert.equal(entry.sourceTradeId,parent.id);
  assert.equal(entry.entryConfig.lightningPlasmaContinuation.parentShadowTradeId,parent.id);
  assert.equal(entry.entryConfig.athenaFire.authorityMode,LIGHTNING_PLASMA.strategicEntryAuthority);
  assert.equal(verifyAthenaFireCommandHash(entry.entryConfig.athenaFire),true);
  assert.equal(entry.entryConfig.infinityBreak.version,INFINITY_BREAK.version);
  assert.equal(entry.entryConfig.aurora.frozen,true);
  assert.equal(entry.entryConfig.aurora.version,AURORA_EXECUTION.version);
});

test('R65 Plasma ignores AD wins, ignores self-parents, and watches until rebound',async()=>{
  const s=settings();
  const q=nowQuote('LP-WATCH',40,41);
  const db=fakeDb();
  const market=fakeMarket(q);
  const strategy=new StrategyEngine({db,kalshi:{},market,learning:{},getSettings:()=>s,getLiveReady:()=>false,refreshGameClock:refreshClock,random:()=>0});
  const engine=Object.create(SagittariusEngine.prototype);
  engine.settings=s;engine.db=db;engine.market=market;engine.strategy=strategy;
  engine.lightningPlasmaContinuationInFlight=new Set();engine.lightningPlasmaWatches=new Map();engine.lightningPlasmaContinuationStats=null;
  const win={...lostAd(q),closeReason:ANOTHER_DIMENSION.profitableCloseReason,pnlCents:200};
  assert.equal((await engine.handleLightningPlasmaContinuation(win)).reason,'not_another_dimension_aurora_loss');
  const self={...lostAd(q),id:'lp-self',conceptName:'Lightning Plasma'};
  assert.equal((await engine.handleLightningPlasmaContinuation(self)).reason,'not_completed_another_dimension');
  const parent=lostAd(q);
  const first=await engine.handleLightningPlasmaContinuation(parent);
  assert.equal(first.status,'WATCHING');assert.equal(first.reason,'rebound_not_confirmed');
  const ep=await db.opportunityEpisode('LIGHTNING-PLASMA-CONTINUATION:ad-lost:1');
  assert.ok(ep);assert.notEqual(ep.athenaDecision?.lightningPlasmaContinuation?.status,'OPENED');
  market.setQuote(nowQuote('LP-WATCH',46,47));
  const second=await engine.attemptLightningPlasmaContinuation(engine.lightningPlasmaWatches.get('LIGHTNING-PLASMA-CONTINUATION:ad-lost:1'));
  assert.equal(second.status,'OPENED');
  assert.equal(second.entry?.conceptName,'Lightning Plasma');
});
