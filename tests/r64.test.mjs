import test from 'node:test';
import assert from 'node:assert/strict';
import { originalSettings, RELEASE } from '../src/config.mjs';
import {
  ACTIVE_PORTFOLIO_CONCEPTS,
  EXECUTION_ATTACK_DISPLAY,
  ATHENA_EXIT_INTELLIGENCE,
  INFINITY_BREAK,
  AURORA_EXECUTION,
} from '../src/doctrine.mjs';
import { entryConfigSnapshot } from '../src/strategy.mjs';
import { ProfitGuard } from '../src/profitGuard.mjs';

function settings(overrides={}){
  return {
    ...originalSettings(),
    systemName:'SAGITTARIUS', ownerId:'r64-test', mode:'SIMULATION', liveArmed:false,
    simFeeCents:0, infinityBreakMinNetPerOriginalContractCents:5,
    ...overrides,
  };
}

function oldInfinityEntry({id='r64-old',conceptName='Momentum Hunter'}={}){
  return {
    id,systemName:'SAGITTARIUS',ownerId:'r64-test',mode:'SIMULATION',status:'open',
    conceptName,ticker:`${id}-T`,eventTicker:`${id}-T`,marketTitle:id,side:'YES',
    entryPriceCents:80,currentPriceCents:80,peakPriceCents:80,stopPriceCents:45,stopLossCents:35,
    count:10,remainingCount:10,pnlCents:0,entryFeeCents:0,exitFeeCents:0,
    openedAtMs:Date.now()-60_000,updatedAtMs:Date.now()-1_000,maeCents:0,
    entryConfig:{
      release:'SAGITTARIUS-R63-GEMINI-ANOTHER-DIMENSION-LIVE-PARITY-2026-08-31',
      profitAuthority:INFINITY_BREAK.version,
      profitAuthorityRevision:INFINITY_BREAK.policyRevision,
      infinityBreak:{
        version:INFINITY_BREAK.version,policyRevision:INFINITY_BREAK.policyRevision,
        minimumNetPerOriginalContractCents:5,requiredFreshConfirmations:2,
        maximumBookAgeMs:1000,confirmationWindowMs:3000,fullPositionOnly:true,
      },
      aurora:{version:AURORA_EXECUTION.version,frozen:true,damageControlPercent:45,dangerPriceCents:45,stopDistanceCents:35},
      lossAuthority:AURORA_EXECUTION.lossAuthority,
    },
  };
}

function harness({entry=oldInfinityEntry(),bid=84,full=true,bookAgeMs=0,failEntryConfigPersistence=false,failProfitGuardStatePersistence=false}={}){
  const row=structuredClone(entry); const rows=new Map([[row.id,row]]); const audits=[];
  let now=Date.now(), currentBid=bid, currentFull=full, currentBookAgeMs=bookAgeMs;
  const db={
    async updateEntry(id,patch){
      if(failEntryConfigPersistence && Object.hasOwn(patch,'entryConfig')) throw new Error('db-write-blocked');
      if(failProfitGuardStatePersistence && Object.hasOwn(patch,'profitGuardState')) throw new Error('profit-state-write-blocked');
      Object.assign(rows.get(id),structuredClone(patch));
    },
    async entryById(id){const x=rows.get(id);return x?structuredClone(x):null;},
    async openEntriesByTicker(){return [...rows.values()].map(x=>structuredClone(x));},
    async audit(level,event,data){audits.push({level,event,data});},
  };
  const market={
    getQuote(){return {ticker:row.ticker,eventTicker:row.eventTicker,yesBid:currentBid,yesAsk:Math.min(100,currentBid+1),status:'active',result:'',volume24h:1000,updatedAtMs:now-currentBookAgeMs,bookInvalid:false};},
    quoteAgeMs(){return currentBookAgeMs;},
    getBook(){return {updatedAtMs:now-currentBookAgeMs,yesBids:[{priceCents:currentBid,count:1000}]};},
    bookAgeMs(){return currentBookAgeMs;},
    async ensureFreshBook(){return this.getBook();},
    async refreshTicker(){return this.getQuote();},
    executableBid(_ticker,count,floor=0){if(currentBid<floor)return{filled:0,full:false,avgCents:0,bestCents:currentBid};return{filled:currentFull?count:Math.max(0,count-1),full:currentFull,avgCents:currentBid,bestCents:currentBid};},
  };
  const learning={
    async onHardStop(){},async stopGuardProfile(){return null;},async lossWatchdogProfile(){return null;},
    profitLearningState(){return null;},async observeProfitOpportunity(){return null;},
    profitRetentionProfileCached(){return{retentionRatio:.92,specificity:'cold_start',promoted:false,totalObservations:0,oneTickPullbacks:0,oneTickRecoveries:0,continuationRate:.5,collapseRate:.25,confidence:'low'};},
    crashState(){return null;},async markProfitExit(){},
  };
  const s=settings();
  const guard=new ProfitGuard({db,kalshi:{},market,learning,getSettings:()=>s});
  return {
    guard,db,market,audits,settings:s,
    row:()=>structuredClone(rows.get(row.id)),
    setBid(v){currentBid=v;now+=10;currentBookAgeMs=0;},
    setFull(v){currentFull=Boolean(v);now+=10;currentBookAgeMs=0;},
    setBookAge(ms){currentBookAgeMs=ms;now+=10;},
  };
}

test('R64 maps every real Execution Attack to ATHENA-X1 while preserving the named Attack identities',()=>{
  assert.equal(RELEASE,'SAGITTARIUS-R65-GEMINI-LIGHTNING-PLASMA-ATHENA-EXCLAMATION-2026-08-31');
  const expected={
    'Wave Surfer':'Pegasus Ryu Sei Ken',
    'Crash Recovery Hunter':'Starlight Extinction',
    'Recovery Hunter':'Crystal Wall',
    'Momentum Hunter':'Great Horn',
    'Lightning Plasma':'Lightning Plasma',
    'Athena Exclamation':'Athena Exclamation',
    'Scarlet Needle':'Scarlet Needle',
    'Sagittarius Justice Arrow':'Sagittarius Justice Arrow',
  };
  assert.deepEqual(new Set(Object.keys(expected)),ACTIVE_PORTFOLIO_CONCEPTS);
  const s=settings();
  for(const [concept,display] of Object.entries(expected)){
    assert.equal(EXECUTION_ATTACK_DISPLAY[concept].name,display);
    const snap=entryConfigSnapshot(s,concept);
    assert.equal(snap.profitAuthority,ATHENA_EXIT_INTELLIGENCE.version,concept);
    assert.equal(snap.profitAuthorityRevision,ATHENA_EXIT_INTELLIGENCE.policyRevision,concept);
    assert.equal(snap.lossAuthority,AURORA_EXECUTION.lossAuthority,concept);
    assert.match(snap.authorityChain,/ATHENA_X1\/AURORA$/,concept);
  }
});

test('R64 migrates an open pre-upgrade real Attack from Infinity Break to ATHENA-X1 without changing its frozen +5c activation threshold',async()=>{
  const h=harness({bid:84});
  let out=await h.guard.protect(h.row());
  assert.equal(out.closed??false,false);
  let row=h.row();
  assert.equal(row.entryConfig.profitAuthority,ATHENA_EXIT_INTELLIGENCE.version);
  assert.equal(row.entryConfig.profitAuthorityRevision,ATHENA_EXIT_INTELLIGENCE.policyRevision);
  assert.equal(row.entryConfig.infinityBreak,undefined);
  assert.equal(row.entryConfig.athenaExit.activationMinimumNetPerOriginalContractCents,5);
  assert.equal(row.profitGuardState?.activationLatched??false,false,'+4c net/original contract must not arm X1');
  assert.ok(h.audits.some(x=>x.event==='athena_x1_universal_authority_migrated'));

  // Restart after migration, then cross the threshold exactly: 80c -> 85c with
  // zero fees = +5c per original contract. The first threshold book starts X1;
  // it must not be converted into an immediate profit sell.
  const restarted=new ProfitGuard({db:h.db,kalshi:{},market:h.market,learning:h.guard.learning,getSettings:()=>h.settings});
  h.setBid(85);
  out=await restarted.protect(h.row());
  assert.equal(out.closed??false,false);
  row=h.row();
  assert.equal(row.profitGuardState.version,ATHENA_EXIT_INTELLIGENCE.version);
  assert.equal(row.profitGuardState.activationLatched,true);
  assert.equal(row.profitGuardState.activationMinimumNetPerOriginalContractCents,5);
  assert.equal(row.profitGuardState.activationTargetAggregateNetCents,50);
  assert.equal(row.closeReason??null,null);
});

test('R64 ATHENA-X1 activation fails closed on stale or partial executable evidence',async()=>{
  const stale=harness({bid:90,bookAgeMs:ATHENA_EXIT_INTELLIGENCE.maximumExecutableBookAgeMs+100});
  let out=await stale.guard.protect(stale.row());
  assert.equal(out.closed??false,false);
  assert.equal(stale.row().entryConfig.profitAuthority,ATHENA_EXIT_INTELLIGENCE.version);
  assert.equal(stale.row().profitGuardState?.activationLatched??false,false);

  const partial=harness({entry:oldInfinityEntry({id:'r64-partial'}),bid:90,full:false});
  out=await partial.guard.protect(partial.row());
  assert.equal(out.closed??false,false);
  assert.equal(partial.row().entryConfig.profitAuthority,ATHENA_EXIT_INTELLIGENCE.version);
  assert.equal(partial.row().profitGuardState?.activationLatched??false,false);
});

test('R64 Aurora retains loss precedence while ATHENA-X1 is the real Attack profit authority',async()=>{
  const h=harness({entry:{...oldInfinityEntry({id:'r64-loss'}),entryConfig:{...oldInfinityEntry({id:'r64-loss'}).entryConfig,profitAuthority:ATHENA_EXIT_INTELLIGENCE.version,profitAuthorityRevision:ATHENA_EXIT_INTELLIGENCE.policyRevision,athenaExit:{version:ATHENA_EXIT_INTELLIGENCE.version,policyRevision:ATHENA_EXIT_INTELLIGENCE.policyRevision,activationMinimumNetPerOriginalContractCents:5,activationThresholdSetting:'infinityBreakMinNetPerOriginalContractCents',activationRequiresFreshFullPositionExecutableDepth:true,activationLatch:true,lossAuthority:'U-SG1'}}},bid:44});
  const out=await h.guard.protect(h.row());
  assert.equal(out.protected,true);
  assert.equal(out.action,'stop_guard');
  assert.match(String(out.guardState||''),/^USG1_/);
  assert.equal(h.row().profitGuardState?.activationLatched??false,false,'Aurora must act before X1 can acquire profit-side state');
});

test('R64 Golden Eye cannot compete for current real Attack profit execution',async()=>{
  const h=harness({entry:{...oldInfinityEntry({id:'r64-ge'}),entryConfig:{profitAuthority:'GOLDEN-EYE-V1'}},bid:90});
  const out=await h.guard.manualCashout(h.row(),h.market.getQuote(),{reason:'golden_eye_cashout'});
  assert.equal(out.closed,false);
  assert.equal(out.skipped,'athena_x1_has_priority');
});


test('R64 ATHENA-X1 fails closed when its activation state cannot be persisted, while leaving the real Attack open for Aurora protection',async()=>{
  const base=oldInfinityEntry({id:'r64-db-fail'});
  base.entryConfig={
    ...base.entryConfig,
    profitAuthority:ATHENA_EXIT_INTELLIGENCE.version,
    profitAuthorityRevision:ATHENA_EXIT_INTELLIGENCE.policyRevision,
    athenaExit:{
      version:ATHENA_EXIT_INTELLIGENCE.version,policyRevision:ATHENA_EXIT_INTELLIGENCE.policyRevision,
      activationMinimumNetPerOriginalContractCents:5,activationThresholdSetting:'infinityBreakMinNetPerOriginalContractCents',
      activationRequiresFreshFullPositionExecutableDepth:true,activationLatch:true,lossAuthority:'U-SG1',
    },
  };
  delete base.entryConfig.infinityBreak;
  const h=harness({entry:base,bid:85,failProfitGuardStatePersistence:true});
  const out=await h.guard.protect(h.row());
  assert.equal(out.closed??false,false);
  assert.equal(h.row().profitGuardState?.activationLatched??false,false,'an unpersisted threshold observation must not activate X1');
  assert.equal(h.row().closeReason??null,null);
  assert.ok(h.audits.some(x=>x.event==='athena_x1_state_persistence_failed'&&x.data?.stage==='activate'));
});
