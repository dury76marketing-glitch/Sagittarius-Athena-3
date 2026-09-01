import test from 'node:test';
import assert from 'node:assert/strict';
import { originalSettings } from '../src/config.mjs';
import { PHOENIX_COSMO, ACTIVE_FEEDER_CONCEPTS, COSMO_ROUTING, LIGHTNING_PLASMA } from '../src/doctrine.mjs';
import { PhoenixCosmoEngine, phoenixSignalActive, revalidatePhoenixQualification } from '../src/phoenix.mjs';
import { StrategyEngine, activeCosmoSources } from '../src/strategy.mjs';
import { createFeederSignalIntelState } from '../src/feederSignalIntel.mjs';
import { atomicThunderBoltFeatures } from '../src/opportunity.mjs';

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
  const x=e.observe(q(30,31,t+16000),t+16000);assert.notEqual(x.qualified,true); // only +3 from the new 27c origin
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
