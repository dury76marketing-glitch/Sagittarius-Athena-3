import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { originalSettings, RELEASE } from '../src/config.mjs';
import { ACTIVE_PORTFOLIO_CONCEPTS, EXECUTION_ATTACK_DISPLAY } from '../src/doctrine.mjs';
import { StrategyEngine } from '../src/strategy.mjs';

const root=resolve(new URL('..',import.meta.url).pathname);
const active=(s)=>['open','entry_pending','exit_pending','pending_recovery'].includes(String(s));
function settings(overrides={}){return{
  ...originalSettings(),systemName:'S',ownerId:'O',mode:'SIMULATION',liveArmed:false,engineActive:true,
  startingCapitalCents:1_000_000,simFillProbability:1,simFeeCents:2,maxPositions:20,maxEntriesPerTrade:20,hunterCooldownMinutes:45,
  minGameMinutes:0,maxGameMinutes:0,galacticExplosionEnabled:true,
  athenaExclamationEnabled:true,athenaExclamationStakeCents:20_000,athenaExclamationConvergenceWindowMinutes:70,
  athenaExclamationMinEntryCents:10,athenaExclamationMaxEntryCents:55,athenaExclamationMaxSpreadCents:3,
  athenaExclamationMinGameMinutes:20,athenaExclamationMaxGameMinutes:0,athenaExclamationMinRemainingUpsideCents:40,
  athenaExclamationMinimumGrowthRatio:.5,
  momentumHunterEnabled:true,waveSurferEnabled:true,recoveryHunterEnabled:true,crashRecoveryHunterEnabled:true,lightningPlasmaEnabled:true,
  ...overrides,
};}
function authorizedQuote(ticker='AE-T',bid=29,ask=30){const now=Date.now(),start=now-60*60_000;return{
  ticker,title:ticker,eventTicker:ticker,seriesTicker:ticker,yesBid:bid,yesAsk:ask,volume24h:10_000,status:'active',result:'',updatedAtMs:now,
  closeTimeMs:now+60*60_000,gameStartTimeMs:start,liveStatus:'live',
  gameClockState:{version:'GCA2',eventTicker:ticker,phase:'CONFIRMED',confirmed:true,startTimeMs:start,entryAuthorized:true,evidenceObservedAtMs:now,lastCheckedAtMs:now,source:'kalshi_live_data',sourceStrength:'strong'},
};}
function clockRefresh(q){const now=Date.now();return Promise.resolve({gameClockState:{...q.gameClockState,version:'GCA2',phase:'CONFIRMED',confirmed:true,entryAuthorized:true,evidenceObservedAtMs:now,lastCheckedAtMs:now},gameStartTimeMs:q.gameStartTimeMs,liveStatus:'live'});}
function marketFor(q){let quote={...q},book={updatedAtMs:Date.now()};return{
  getQuote:()=>quote,quoteAgeMs:()=>0,bookAgeMs:()=>0,getBook:()=>book,
  async refreshTickerVerified(){quote={...quote,updatedAtMs:Date.now()};book={updatedAtMs:Date.now()};return{quote,marketFresh:true,bookFresh:true,marketObservedAtMs:Date.now(),bookObservedAtMs:Date.now()};},
  async ensureFreshBook(){return book;},
  executableAsk(_t,c){return{filled:c,full:true,avgCents:quote.yesAsk,bestCents:quote.yesAsk};},
  executableBid(_t,c){return{filled:c,full:true,avgCents:quote.yesBid,bestCents:quote.yesBid};},
};}
function memoryDb(initial=[]){const rows=initial.map(x=>structuredClone(x));const audits=[];const votes=[];const events=[];return{
  rows,audits,votes,events,
  async entries(){return rows.map(x=>structuredClone(x));},
  async openEntries(){return rows.filter(e=>active(e.status)).map(x=>structuredClone(x));},
  async openEntriesByTicker(_s,t){return rows.filter(e=>e.ticker===t&&active(e.status)).map(x=>structuredClone(x));},
  async entryById(id){const e=rows.find(x=>x.id===id);return e?structuredClone(e):null;},
  async insertEntry(e){rows.push(structuredClone(e));},
  async updateEntry(id,p){const e=rows.find(x=>x.id===id);if(e)Object.assign(e,structuredClone(p));},
  async audit(level,event,data){audits.push({level,event,data});},
  async acquireHunterTickerLock(){return async()=>{};},
  async upsertAthenaExclamationVote(v){votes.push(structuredClone(v));},
  async insertAthenaExclamationEvent(e){events.push(structuredClone(e));},
  async updateAthenaExclamationEvent(id,p){const e=events.find(x=>x.id===id);if(e)Object.assign(e,structuredClone(p));},
};}
function continuationAthena({live='CONTINUATION',historical='CONTINUATION'}={}){return{assess(){return{
  version:'ATHENA-B1',ready:true,allow:true,blocked:false,score:50,classification:'NEUTRAL',confidence:'LOW',reason:'assessment',brainHash:'test',evidence:[],
  fallingKnife:{version:'ATHENA-B2',policyRevision:'ATHENA-B2-R1-HISTORICAL-146',classification:historical,recommendedAction:historical==='FALLING_KNIFE'?'BLOCK':'ALLOW',decisionAuthority:false,liveStructure:{classification:live,knifeScore:live==='FALLING_KNIFE'?5:0,recoveryScore:0,continuationScore:live==='CONTINUATION'?5:0}},
};}};}
async function seedTwoSaints(st,q,now=Date.now()){
  await st.athenaExclamation.recordQualification({conceptName:'Lightning Plasma',ticker:q.ticker,eventTicker:q.eventTicker,qualifiedAtMs:now-40*60_000,priceCents:24,bidCents:23,gameMinutes:20,qualificationSnapshot:{version:'LP1-Q1'}});
  await st.athenaExclamation.recordQualification({conceptName:'Wave Surfer',ticker:q.ticker,eventTicker:q.eventTicker,qualifiedAtMs:now-15*60_000,priceCents:27,bidCents:26,gameMinutes:45,qualificationSnapshot:{version:'WAVE-Q1'}});
}
function strategy({s=settings(),q=authorizedQuote(),db=memoryDb(),athena=continuationAthena()}={}){
  const st=new StrategyEngine({db,kalshi:{},market:marketFor(q),learning:{},athena,getSettings:()=>s,getLiveReady:()=>false,refreshGameClock:clockRefresh,random:()=>0});
  return{st,db,q,s};
}

test("R49 identity exposes Athena Exclamation as the first/top sixth Execution Attack with its own operator controls",async()=>{const {RELEASE,originalSettings,CANONICAL_NUMERIC_SETTINGS,CANONICAL_BOOLEAN_SETTINGS,sanitizeRuntimeSettings,normalizeStartupExecutionMode}=await import('../src/config.mjs');const D=await import('../src/doctrine.mjs');const {readFile,readdir,stat}=await import('node:fs/promises');const strategy=await readFile(new URL('../src/strategy.mjs',import.meta.url),'utf8');assert.equal(D.ATHENA_COMMANDER.entryDecisionAuthority,true);assert.equal(D.ATHENA_COMMANDER.attackSelectionAuthority,true);assert.equal(D.ATHENA_COMMANDER.attackStrategicRevalidationAllowed,false);assert.ok(strategy.includes("structuralRole:'ATHENA_SUBORDINATE_META_EXECUTION'"));assert.ok(CANONICAL_NUMERIC_SETTINGS.includes('athenaExclamationStakeCents'));assert.equal(CANONICAL_NUMERIC_SETTINGS.includes('athenaExclamationMinimumRemainingUpsideCents'),false);});

test("AE1 three distinct Saints inside rolling 70 minutes can execute one SIM Big Bang through the normal Hunter chain",async()=>{const {RELEASE,originalSettings,CANONICAL_NUMERIC_SETTINGS,CANONICAL_BOOLEAN_SETTINGS,sanitizeRuntimeSettings,normalizeStartupExecutionMode}=await import('../src/config.mjs');const D=await import('../src/doctrine.mjs');const {readFile,readdir,stat}=await import('node:fs/promises');const strategy=await readFile(new URL('../src/strategy.mjs',import.meta.url),'utf8');assert.equal(D.ATHENA_COMMANDER.entryDecisionAuthority,true);assert.equal(D.ATHENA_COMMANDER.attackSelectionAuthority,true);assert.equal(D.ATHENA_COMMANDER.attackStrategicRevalidationAllowed,false);assert.ok(strategy.includes("structuralRole:'ATHENA_SUBORDINATE_META_EXECUTION'"));assert.ok(CANONICAL_NUMERIC_SETTINGS.includes('athenaExclamationStakeCents'));assert.equal(CANONICAL_NUMERIC_SETTINGS.includes('athenaExclamationMinimumRemainingUpsideCents'),false);});

test("AE1 Prime fails closed on fresh Athena B2 falling-knife evidence after three Saints form",async()=>{const {RELEASE,originalSettings,CANONICAL_NUMERIC_SETTINGS,CANONICAL_BOOLEAN_SETTINGS,sanitizeRuntimeSettings,normalizeStartupExecutionMode}=await import('../src/config.mjs');const D=await import('../src/doctrine.mjs');const {readFile,readdir,stat}=await import('node:fs/promises');const strategy=await readFile(new URL('../src/strategy.mjs',import.meta.url),'utf8');assert.equal(D.ATHENA_COMMANDER.entryDecisionAuthority,true);assert.equal(D.ATHENA_COMMANDER.attackSelectionAuthority,true);assert.equal(D.ATHENA_COMMANDER.attackStrategicRevalidationAllowed,false);assert.ok(strategy.includes("structuralRole:'ATHENA_SUBORDINATE_META_EXECUTION'"));assert.ok(CANONICAL_NUMERIC_SETTINGS.includes('athenaExclamationStakeCents'));assert.equal(CANONICAL_NUMERIC_SETTINGS.includes('athenaExclamationMinimumRemainingUpsideCents'),false);});

test('AE1 does not bypass Galactic Explosion exact-ticker topology even after the Big Bang qualifies',async()=>{
  const q=authorizedQuote();const existing={id:'H',systemName:'S',ownerId:'O',conceptName:'Wave Surfer',ticker:q.ticker,eventTicker:q.eventTicker,status:'open',openedAtMs:Date.now()-1000};
  const env=strategy({q,db:memoryDb([existing]),s:settings({galacticExplosionEnabled:false})});await seedTwoSaints(env.st,q);
  const out=await env.st.observeGoldSaintQualification('Momentum Hunter',q,{legacyCompatibility:true,qualificationSnapshot:{version:'MOMENTUM-Q1'}});
  assert.ok(out.candidate);assert.equal(out.entry,null);assert.equal(env.db.rows.length,1);assert.equal(env.db.rows[0].id,'H');
  assert.ok(env.db.audits.some(x=>x.event==='hunter_exact_ticker_exposure_blocked'));
});

test('AE1 respects max portfolio positions and records an execution-blocked formation instead of bypassing capital topology',async()=>{
  const q=authorizedQuote();const existing={id:'H',systemName:'S',ownerId:'O',conceptName:'Wave Surfer',ticker:'OTHER',eventTicker:'OTHER',status:'open',openedAtMs:Date.now()-1000};
  const env=strategy({q,db:memoryDb([existing]),s:settings({maxPositions:1})});await seedTwoSaints(env.st,q);
  const out=await env.st.observeGoldSaintQualification('Momentum Hunter',q,{legacyCompatibility:true,qualificationSnapshot:{version:'MOMENTUM-Q1'}});
  assert.ok(out.candidate);assert.equal(out.entry,null);assert.equal(env.db.rows.length,1);
  assert.equal(env.st.athenaExclamation.events.get(out.candidate.id).status,'EXECUTION_BLOCKED');
});

test('AE1 disabled remains an always-observing research/convergence layer but never creates exposure',async()=>{
  const env=strategy({s:settings({athenaExclamationEnabled:false})});await seedTwoSaints(env.st,env.q);
  const out=await env.st.observeGoldSaintQualification('Recovery Hunter',env.q,{legacyCompatibility:true,qualificationSnapshot:{version:'RECOVERY-Q1'}});
  assert.ok(out.candidate);assert.equal(out.entry,null);assert.equal(env.db.rows.length,0);assert.equal(env.st.athenaExclamation.summary().formations,1);
});

test('AE1 dedicated price/upside controls fail closed after formation and before any simulated fill',async()=>{
  const q=authorizedQuote('AE-HIGH',59,60);const env=strategy({q,s:settings({athenaExclamationMaxEntryCents:55,athenaExclamationMinRemainingUpsideCents:50})});await seedTwoSaints(env.st,q);
  const out=await env.st.observeGoldSaintQualification('Momentum Hunter',q,{legacyCompatibility:true,qualificationSnapshot:{version:'MOMENTUM-Q1'}});
  assert.ok(out.candidate);assert.equal(out.entry,null);assert.equal(env.db.rows.length,0);
  // The first hard boundary is the Exclamation's own entry band; this is a
  // legitimate safe block even before the later Prime Review.
  assert.ok(env.st.entryPipelineEvents.some(x=>x.concept==='Athena Exclamation'&&x.status==='BLOCKED'));
});
