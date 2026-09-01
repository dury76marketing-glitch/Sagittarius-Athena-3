import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { originalSettings } from '../src/config.mjs';
import { PHOENIX_COSMO, ACTIVE_FEEDER_CONCEPTS, COSMO_ROUTING, LIGHTNING_PLASMA } from '../src/doctrine.mjs';
import { PhoenixCosmoEngine, phoenixSignalActive, revalidatePhoenixQualification } from '../src/phoenix.mjs';
import { StrategyEngine, activeCosmoSources } from '../src/strategy.mjs';
import { createFeederSignalIntelState } from '../src/feederSignalIntel.mjs';
import { atomicThunderBoltFeatures } from '../src/opportunity.mjs';
import { MarketHub, MARKET_TRUTH_REVISION } from '../src/market.mjs';

const settings=()=>({...originalSettings(),phoenixEnabled:true,phoenixReferenceStakeCents:3000,phoenixMinPriceCents:10,phoenixMaxPriceCents:50,maxSpreadCents:3,systemName:'SAGITTARIUS',ownerId:'test-owner',mode:'SIMULATION'});
const q=(bid,ask,t,{ticker='PX',recentTrades=20,eventTicker='EV',status='open'}={})=>({ticker,eventTicker,yesBid:bid,yesAsk:ask,recentTrades,status,updatedAtMs:t,title:'Phoenix test market',volume24h:1000});

function qualify(engine,t0=1_000_000){
  assert.equal(engine.observe(q(20,21,t0),t0)?.qualified,false);
  assert.equal(engine.observe(q(21,22,t0+3000),t0+3000)?.qualified,false);
  assert.equal(engine.observe(q(22,23,t0+6000),t0+6000)?.qualified,false);
  const c1=engine.observe(q(24,25,t0+9000),t0+9000);assert.equal(c1.qualified,false);assert.equal(c1.confirmations,1);
  const hit=engine.observe(q(24,25,t0+9300),t0+9300);assert.equal(hit.qualified,true);return hit;
}

test('R55 Phoenix doctrine is a third reference-only Cosmo with frozen ignition safeguards',()=>{
  assert.equal(ACTIVE_FEEDER_CONCEPTS.has('Phoenix'),true);
  assert.deepEqual(COSMO_ROUTING.activeCosmos,['Pegasus','Dragon','Phoenix']);
  assert.deepEqual(LIGHTNING_PLASMA.sourceCosmos,['Pegasus','Dragon','Phoenix']);
  assert.equal(PHOENIX_COSMO.defaultMinPriceCents,10);
  assert.equal(PHOENIX_COSMO.defaultMaxPriceCents,50);
  assert.equal(PHOENIX_COSMO.minimumRiseCents,4);
  assert.equal(PHOENIX_COSMO.minimumUpTicks,3);
  assert.equal(PHOENIX_COSMO.requiredFreshConfirmations,2);
  assert.equal(PHOENIX_COSMO.signalTtlMs,60_000);
  assert.equal(PHOENIX_COSMO.entryAuthority,false);
  assert.equal(PHOENIX_COSMO.orderAuthority,false);
  assert.equal(PHOENIX_COSMO.strategicEntryAuthority,'ATHENA');
});

test('R55 Phoenix does not confuse cheapness, flat quotes, or ask-only spikes with ignition',()=>{
  const s=settings(),e=new PhoenixCosmoEngine({getSettings:()=>s}),t=2_000_000;
  e.observe(q(20,21,t),t);
  for(let i=1;i<=6;i++)assert.notEqual(e.observe(q(20,21,t+i*2000),t+i*2000)?.qualified,true);
  e.clear();e.observe(q(20,21,t),t);
  e.observe(q(20,24,t+3000),t+3000);e.observe(q(20,26,t+9000),t+9000);
  assert.equal(e.summary().qualified,0);
});

test('R55 Phoenix requires causal duration, three bid up-ticks and two fresh confirmations',()=>{
  const s=settings(),e=new PhoenixCosmoEngine({getSettings:()=>s}),hit=qualify(e,3_000_000);
  assert.equal(hit.signalBidCents,24);assert.equal(hit.signalAskCents,25);assert.equal(hit.originBidCents,20);assert.equal(hit.originAskCents,21);
  assert.equal(hit.riseBidCents,4);assert.equal(hit.riseAskCents,4);assert.equal(hit.upTicks,3);assert.equal(hit.confirmationCount,2);
  assert.ok(hit.observationDurationMs>=8000);assert.equal(hit.expiresAtMs-hit.signalAtMs,60_000);
});

test('R55 Phoenix lower low resets origin and prevents bounce-inside-collapse false qualification',()=>{
  const s=settings(),e=new PhoenixCosmoEngine({getSettings:()=>s}),t=4_000_000;
  e.observe(q(30,31,t),t);e.observe(q(31,32,t+3000),t+3000);e.observe(q(32,33,t+6000),t+6000);
  const reset=e.observe(q(27,28,t+7000),t+7000);assert.equal(reset.reason,'new_local_low');
  e.observe(q(28,29,t+10000),t+10000);e.observe(q(29,30,t+13000),t+13000);
  const x=e.observe(q(30,31,t+16000),t+16000);assert.notEqual(x.qualified,true);
});

test('R55 Phoenix refuses inactive, illiquid, wide-spread and out-of-band candidates',()=>{
  const s=settings(),e=new PhoenixCosmoEngine({getSettings:()=>s}),t=5_000_000;
  assert.equal(e.observe(q(5,6,t),t),null);
  assert.equal(e.observe(q(49,53,t+1000),t+1000),null);
  assert.equal(e.observe(q(20,21,t+2000,{recentTrades:2}),t+2000),null);
  s.phoenixEnabled=false;assert.equal(e.observe(q(20,21,t+3000),t+3000),null);
});

test('R55 Phoenix source is live only inside its frozen TTL and enablement',()=>{
  const s=settings(),now=6_000_000,entry={conceptName:'Phoenix',status:'open',entryConfig:{phoenixSource:{expiresAtMs:now+1000}}};
  assert.equal(phoenixSignalActive(entry,s,now),true);
  assert.equal(phoenixSignalActive(entry,s,now+1001),false);
  assert.equal(activeCosmoSources([entry],s,{now}).length,1);
  assert.equal(activeCosmoSources([entry],s,{now:now+1001}).length,0);
  s.phoenixEnabled=false;assert.equal(activeCosmoSources([entry],s,{now}).length,0);
});

test('R55 materialization revalidates ignition, freezes causal evidence, and is duplicate-safe',async()=>{
  const s=settings(),e=new PhoenixCosmoEngine({getSettings:()=>s}),signal=qualify(e,7_000_000);let inserted=null,locked=0,unlocked=0;
  const db={
    async acquireCosmoSignalLock(){locked++;return async()=>{unlocked++;};},
    async openEntriesByTicker(){return[];},async insertEntry(x){inserted=x;return x;},async updateEntry(){},async audit(){},
  };
  const market={getQuote(){return q(24,25,signal.signalAtMs+100,{ticker:'PX',eventTicker:'EV'});}};
  const st=new StrategyEngine({db,market,learning:null,athena:null,getSettings:()=>s,getLiveReady:()=>true,onFeederOpened:()=>{}});
  const out=await st.materializePhoenixSignal(market.getQuote('PX'),signal,signal.signalAtMs+100);
  assert.ok(out);assert.equal(out.conceptName,'Phoenix');assert.equal(out.entryPriceCents,25);assert.equal(out.sourceTradeId,signal.signalId);
  assert.equal(out.entryConfig.phoenixSource.originBidCents,20);assert.equal(out.entryConfig.phoenixSource.signalBidCents,24);assert.equal(out.entryConfig.phoenixSource.riseBidCents,4);
  assert.equal(out.entryConfig.phoenixSource.sourceDoesNotAuthorizeEntry,true);assert.equal(locked,1);assert.equal(unlocked,1);assert.equal(inserted.id,out.id);
  const invalid=revalidatePhoenixQualification(signal,q(22,23,signal.signalAtMs+100,{ticker:'PX'}),s,signal.signalAtMs+100);assert.equal(invalid.ok,false);assert.equal(invalid.reason,'ignition_reversed');
});

test('R55 materialization refuses a second active Phoenix under the same cross-process lock',async()=>{
  const s=settings(),e=new PhoenixCosmoEngine({getSettings:()=>s}),signal=qualify(e,8_000_000),existing={id:'OLD',conceptName:'Phoenix',status:'open',ticker:'PX',entryConfig:{phoenixSource:{expiresAtMs:signal.signalAtMs+50_000}}};let inserts=0;
  const db={async acquireCosmoSignalLock(){return async()=>{};},async openEntriesByTicker(){return[existing];},async insertEntry(){inserts++;},async updateEntry(){},async audit(){}};
  const market={getQuote(){return q(24,25,signal.signalAtMs+100,{ticker:'PX'});}};
  const st=new StrategyEngine({db,market,learning:null,athena:null,getSettings:()=>s,getLiveReady:()=>true});
  assert.equal(await st.materializePhoenixSignal(market.getQuote('PX'),signal,signal.signalAtMs+100),null);assert.equal(inserts,0);
});

test('R55 Phoenix is visible to Atomic Thunder/Athena as independent Cosmo diversity',()=>{
  const s=settings(),now=9_000_000,phoenix={id:'P',conceptName:'Phoenix',status:'open',ticker:'PX',eventTicker:'EV',openedAtMs:now-100,entryConfig:{phoenixSource:{expiresAtMs:now+50_000,signalAtMs:now-100,signalAskCents:25}}},dragon={id:'D',conceptName:'Dragon',status:'open',ticker:'PX',eventTicker:'EV',openedAtMs:now-200,entryPriceCents:20,entryConfig:{dragonSource:{signalAtMs:now-200,signalPriceCents:24}}};
  const history=[{t:now-10_000,bid:20,ask:21},{t:now-7000,bid:21,ask:22},{t:now-4000,bid:22,ask:23},{t:now,bid:24,ask:25}];
  const f=atomicThunderBoltFeatures({q:q(24,25,now,{ticker:'PX',eventTicker:'EV'}),history,settings:s,cosmos:[phoenix,dragon],now});
  assert.deepEqual(new Set(f.cosmoSources),new Set(['Phoenix','Dragon']));assert.equal(f.cosmoCount,2);
});

test('R55 Phoenix FSI freezes signal-time ascent context without granting Athena authority',()=>{
  const s=settings(),now=10_000_000,entry={id:'P1',conceptName:'Phoenix',status:'open',ticker:'PX',eventTicker:'EV',entryPriceCents:25,count:120,spreadAtEntryCents:1,openedAtMs:now,entryConfig:{referenceStakeCents:3000,phoenixSource:{signalAtMs:now,signalBidCents:24,signalAskCents:25,originBidCents:20,originAskCents:21,riseBidCents:4,riseAskCents:4,upTicks:3,confirmationCount:2,observationDurationMs:9300,expiresAtMs:now+60_000}}};
  const state=createFeederSignalIntelState(entry,q(30,31,now+500,{ticker:'PX'}),s,now+500);
  assert.ok(state);assert.equal(state.signalContext.bidCents,24);assert.equal(state.signalContext.askCents,25);assert.equal(state.signalContext.phoenixRiseBidCents,4);assert.equal(state.signalContext.phoenixConfirmationCount,2);
});

test('R55 frozen Athena B2 feeder context ignores Phoenix while preserving Pegasus/Dragon',()=>{
  const s=settings(),st=new StrategyEngine({db:{},market:{},learning:null,athena:null,getSettings:()=>s,getLiveReady:()=>true});
  st.recordAthenaR2FeederContext({id:'P',conceptName:'Phoenix',ticker:'PX',eventTicker:'EV',entryPriceCents:25,openedAtMs:1,entryConfig:{phoenixSource:{signalAskCents:25}}});
  st.recordAthenaR2FeederContext({id:'G',conceptName:'Pegasus',ticker:'PX',eventTicker:'EV',entryPriceCents:25,openedAtMs:2,entryConfig:{}});
  st.recordAthenaR2FeederContext({id:'D',conceptName:'Dragon',ticker:'PX',eventTicker:'EV',entryPriceCents:20,openedAtMs:3,entryConfig:{dragonSource:{signalPriceCents:24}}});
  assert.deepEqual(st.athenaR2FeederHistory.map(x=>x.conceptName),['Pegasus','Dragon']);
});

// R63-MHF1 cross-runtime market-truth tripwires. These live in the existing
// Phoenix surface so the strict 44-authored-file deployment budget stays intact.
const hubForMarketTruth=()=>new MarketHub({kalshi:{getOrderbook:async()=>null},wsUrl:'',fallbackWsUrl:'',getCredentials:()=>null});
const seedTruth=(hub,ticker='T',at=1_000)=>hub.seed({ticker,yesBid:79,yesAsk:80,updatedAtMs:at,quoteAtMs:at,status:'active',result:'',recentTrades:0});
const snap=(ticker,sid,seq,at=1_000)=>({type:'orderbook_snapshot',sid,seq,msg:{market_ticker:ticker,yes_dollars_fp:[['0.79','10']],no_dollars_fp:[['0.20','10']],ts_ms:at}});
const delta=(ticker,sid,seq,side='yes',price='0.79',amount=1,at=1_001)=>({type:'orderbook_delta',sid,seq,msg:{market_ticker:ticker,side,price_dollars:price,delta_fp:amount,ts_ms:at}});

test('R63-MHF1 market truth revision is explicit and orderbook subscription pins native NO-leg pricing',async()=>{
  assert.equal(MARKET_TRUTH_REVISION,'R63-MHF1-HF2A-MARKET-TRUTH-RESTORATION-2026-08-31');
  const src=await readFile(new URL('../src/market.mjs',import.meta.url),'utf8');
  assert.match(src,/channels:\s*\['orderbook_delta'\][^\n]*use_yes_price:false/);
});

test('R63-MHF1 trade and lifecycle activity cannot refresh bid-ask truth or heal an invalid executable book',()=>{
  const hub=hubForMarketTruth();seedTruth(hub,'T',1_000);hub.quotes.set('T',{...hub.getQuote('T'),bookInvalid:true});
  hub.handle({type:'trade',msg:{market_ticker:'T',yes_price_dollars:'0.81',ts_ms:9_000}});
  assert.equal(hub.getQuote('T').quoteAtMs,1_000);assert.equal(hub.getQuote('T').updatedAtMs,1_000);assert.equal(hub.getQuote('T').bookInvalid,true);
  hub.handle({type:'market_lifecycle_v2',msg:{market_ticker:'T',event_type:'activated',ts_ms:10_000}});
  assert.equal(hub.getQuote('T').quoteAtMs,1_000);assert.equal(hub.getQuote('T').updatedAtMs,1_000);assert.equal(hub.getQuote('T').bookInvalid,true);
});

test('R63-MHF1 ticker quote updates may refresh quote truth but cannot heal sequence-invalid book truth',()=>{
  const hub=hubForMarketTruth();seedTruth(hub,'T',1_000);hub.quotes.set('T',{...hub.getQuote('T'),bookInvalid:true});
  hub.handle({type:'ticker',msg:{market_ticker:'T',yes_bid_dollars:'0.80',yes_ask_dollars:'0.81',ts_ms:2_000}});
  assert.equal(hub.getQuote('T').yesBid,80);assert.equal(hub.getQuote('T').quoteAtMs,2_000);assert.equal(hub.getQuote('T').bookInvalid,true);
});

test('R63-MHF1 one SID cursor accepts ordinary multi-ticker interleaving and ignores old duplicate sequences',()=>{
  const hub=hubForMarketTruth();seedTruth(hub,'A');seedTruth(hub,'B');
  hub.handle(snap('A',7,1));hub.handle(snap('B',7,2));hub.handle(delta('A',7,3));hub.handle(delta('B',7,4));
  assert.equal(hub.resourceSnapshot().bookIntegrity.sequenceGaps,0);assert.equal(hub.getBook('A').seq,3);assert.equal(hub.getBook('B').seq,4);
  const before=hub.getBook('A').yesBids[0].count;hub.handle(delta('A',7,3,'yes','0.79',50));
  assert.equal(hub.getBook('A').yesBids[0].count,before);assert.equal(hub.resourceSnapshot().bookIntegrity.ignoredOldSequences,1);
});

test('R63-MHF1 genuine SID gap invalidates the entire stream and recovers by bounded get_snapshot without reconnect',()=>{
  const hub=hubForMarketTruth();for(const t of ['A','B'])seedTruth(hub,t);hub.setWanted(['A','B']);
  const sent=[];hub.ws={readyState:1,send:x=>sent.push(JSON.parse(x)),close:()=>assert.fail('gap recovery must not reconnect')};hub.connected=true;
  hub.handle(snap('A',9,10));hub.handle(snap('B',9,11));hub.handle(delta('A',9,13));
  assert.equal(hub.getQuote('A').bookInvalid,true);assert.equal(hub.getQuote('B').bookInvalid,true);
  assert.equal(hub.resourceSnapshot().bookIntegrity.sequenceGaps,1);assert.equal(hub.resourceSnapshot().bookIntegrity.recoveringStreams,1);
  assert.equal(sent.length,1);assert.equal(sent[0].cmd,'update_subscription');assert.equal(sent[0].params.action,'get_snapshot');assert.deepEqual(new Set(sent[0].params.market_tickers),new Set(['A','B']));
  hub.handle(snap('A',9,14));assert.equal(hub.getQuote('A').bookInvalid,false);assert.equal(hub.getQuote('B').bookInvalid,true);
  hub.handle(delta('A',9,15));assert.equal(hub.getBook('A').seq,15,'restored ticker may resume while another ticker awaits snapshot');
  hub.handle(snap('B',9,16));assert.equal(hub.resourceSnapshot().bookIntegrity.recoveringStreams,0);assert.equal(hub.resourceSnapshot().bookIntegrity.pendingSnapshots,0);assert.equal(hub.getQuote('B').bookInvalid,false);
});

test('R63-MHF1 missing SID or sequence invalidates the known subscription instead of mutating executable depth',()=>{
  const hub=hubForMarketTruth();for(const t of ['A','B'])seedTruth(hub,t);hub.handle(snap('A',12,1));hub.handle(snap('B',12,2));
  const before=hub.getBook('A').yesBids[0].count;hub.handle({type:'orderbook_delta',msg:{market_ticker:'A',side:'yes',price_dollars:'0.79',delta_fp:100,ts_ms:2_000}});
  assert.equal(hub.getBook('A').yesBids[0].count,before);assert.equal(hub.getQuote('A').bookInvalid,true);assert.equal(hub.getQuote('B').bookInvalid,true);
});

test('R63-MHF1 disconnect invalidates WS-derived books but preserves independently REST-verified book truth',()=>{
  const hub=hubForMarketTruth();seedTruth(hub,'WS');seedTruth(hub,'REST');hub.handle(snap('WS',4,1));
  hub.books.set('REST',{ticker:'REST',yesBids:[{priceCents:79,count:10}],noBids:[{priceCents:20,count:10}],updatedAtMs:1_500,source:'REST',sid:null,seq:null,sequenceValid:true,invalidReason:null});hub.applyBook('REST');
  hub.invalidateWsBooks('test_disconnect');
  assert.equal(hub.getQuote('WS').bookInvalid,true);assert.equal(hub.executableBid('WS',1),null);assert.equal(hub.getQuote('REST').bookInvalid,false);assert.equal(hub.executableBid('REST',1).full,true);
  assert.equal(hub.resourceSnapshot().marketTruthRevision,MARKET_TRUTH_REVISION);
});
