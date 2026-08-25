import test from 'node:test';
import assert from 'node:assert/strict';
import { stableDropEntry,holdToSettlementTrail,isMatchDecisionMarket,computeLiveStatus,MOMENTUM,WAVE,RECOVERY,R43_ENTRY_QUALITY_COVENANT,r43EntryQualityAssessment } from '../src/doctrine.mjs';

test('Pegasus and Sagittarius editable feeder bands are inclusive at 80c and 94c',()=>{
  assert.equal(stableDropEntry([{ask:96},{ask:80},{ask:80},{ask:80}],2,80,94),80);
  assert.equal(stableDropEntry([{ask:96},{ask:94},{ask:94},{ask:94}],2,80,94),94);
  assert.equal(stableDropEntry([{ask:96},{ask:79},{ask:79},{ask:79}],2,80,94),null);
  assert.equal(stableDropEntry([{ask:97},{ask:95},{ask:95},{ask:95}],2,80,94),null);
  assert.equal(stableDropEntry([{ask:94},{ask:93},{ask:93},{ask:93}],2,80,94),null);
  assert.equal(stableDropEntry([{ask:94},{ask:93},{ask:93},{ask:93}],1,80,94),93);
});

test('Hunter doctrine constants not explicitly changed by R7 remain intact',()=>{
  assert.deepEqual(MOMENTUM,{minRiseCents:2,minPullbackCents:1,maxPullbackCents:12,minEntryCents:76,maxEntryCents:94,maxSpreadCents:3,minTimeLeftMs:180000});
  assert.deepEqual(WAVE,{maxSpreadCents:3});
  assert.deepEqual(RECOVERY,{minReboundCents:5,minEntryCents:76,maxEntryCents:94});
});

test('hold-to-settlement trail is 5/6/4/2',()=>{
  assert.equal(holdToSettlementTrail(80,82),5);
  assert.equal(holdToSettlementTrail(80,86),6);
  assert.equal(holdToSettlementTrail(80,92),4);
  assert.equal(holdToSettlementTrail(80,96),2);
});

test('match decision doctrine rejects derivative markets',()=>{
  assert.equal(isMatchDecisionMarket({ticker:'KXATPMATCH-X-A',seriesTicker:'KXATPMATCH',title:'Will A win the A vs B match?'}),true);
  assert.equal(isMatchDecisionMarket({ticker:'KXATPSPREAD-X-A',seriesTicker:'KXATPSPREAD',title:'Will A win by over 2 games?'}),false);
});

test('live status uses trade activity before unreliable occurrence time',()=>{
  assert.equal(computeLiveStatus({tradeCount:5,occurrenceTimeMs:Date.now()+3600000,closeTimeMs:Date.now()+7200000}), 'live');
});


test('R43 EQC1 is execution authority with strict <0.30R friction and 30-minute maturity',()=>{
  assert.equal(R43_ENTRY_QUALITY_COVENANT.version,'EQC1');
  assert.equal(R43_ENTRY_QUALITY_COVENANT.authority,'EXECUTION');
  assert.equal(R43_ENTRY_QUALITY_COVENANT.maximumEntryFrictionR,0.30);
  assert.equal(R43_ENTRY_QUALITY_COVENANT.strictLessThan,true);
  assert.equal(R43_ENTRY_QUALITY_COVENANT.minimumGameMinutes,30);
});

test('R43 EQC1 allows 0.299R but blocks exactly 0.300R',()=>{
  const pass=r43EntryQualityAssessment({helcEntry:{maximumLossCents:7500,projectedImmediateLossCents:2242.5,fullExitabilityProven:true},gameMinutes:30});
  const edge=r43EntryQualityAssessment({helcEntry:{maximumLossCents:7500,projectedImmediateLossCents:2250,fullExitabilityProven:true},gameMinutes:30});
  assert.equal(pass.ok,true); assert.ok(pass.entryFrictionR<0.30);
  assert.equal(edge.ok,false); assert.equal(edge.reason,'entry_friction_not_below_0_30r');
});

test('R43 EQC1 fails closed below 30 minutes even when entry economics are excellent',()=>{
  const early=r43EntryQualityAssessment({helcEntry:{maximumLossCents:7500,projectedImmediateLossCents:1000,fullExitabilityProven:true},gameMinutes:29.999});
  const mature=r43EntryQualityAssessment({helcEntry:{maximumLossCents:7500,projectedImmediateLossCents:1000,fullExitabilityProven:true},gameMinutes:30});
  assert.equal(early.ok,false); assert.equal(early.reason,'game_maturity_below_30_minutes');
  assert.equal(mature.ok,true);
});

test('R43 EQC1 fails closed when exact full-position exitability is unproven',()=>{
  const out=r43EntryQualityAssessment({helcEntry:{maximumLossCents:7500,projectedImmediateLossCents:1000,fullExitabilityProven:false},gameMinutes:60});
  assert.equal(out.ok,false); assert.equal(out.reason,'full_exitability_unproven');
});
