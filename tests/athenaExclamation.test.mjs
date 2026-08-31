import test from 'node:test';
import assert from 'node:assert/strict';
import {AthenaExclamationEngine,ATHENA_EXCLAMATION,isGoldSaintConcept,athenaExclamationCycleArmed,athenaExclamationPrimeReview} from '../src/athenaExclamation.mjs';
import {ANOTHER_DIMENSION} from '../src/doctrine.mjs';

const settings=(over={})=>({systemName:'SAGITTARIUS',athenaExclamationMinEntryCents:45,athenaExclamationMaxEntryCents:89,...over});
const parent=(over={})=>({id:'ad-1',systemName:'SAGITTARIUS',ownerId:'owner',mode:'SIMULATION',conceptName:'Another Dimension',ticker:'T',eventTicker:'E',side:'YES',status:'closed',remainingCount:0,closeReason:ANOTHER_DIMENSION.profitableCloseReason,pnlCents:25,entryPriceCents:70,exitPriceCents:72,closedAtMs:10_000,...over});

test('AE2 retires all Gold-Saint convergence authority',()=>{
  for(const c of ['Wave Surfer','Crash Recovery Hunter','Recovery Hunter','Momentum Hunter','Lightning Plasma','Pegasus'])assert.equal(isGoldSaintConcept(c),false);
  assert.equal(ATHENA_EXCLAMATION.triggerEveryJusticeArrows,12);
  assert.equal(ATHENA_EXCLAMATION.sourceUniverse,'Gemini');
  assert.equal(ATHENA_EXCLAMATION.sourceAttack,'Another Dimension');
});

test('AE2 arms inclusively on the twelfth successfully opened Justice Arrow',()=>{
  assert.equal(athenaExclamationCycleArmed(0),false);
  assert.equal(athenaExclamationCycleArmed(11),false);
  assert.equal(athenaExclamationCycleArmed(12),true);
  assert.equal(athenaExclamationCycleArmed(25),true);
});

test('AE2 Prime Review accepts a profitable Another Dimension continuation inside its own band only when cycle is armed',()=>{
  const quote={ticker:'T',eventTicker:'E',yesBid:78,yesAsk:79};
  const plan={bestAskCents:79,averagePriceCents:79};
  const good=athenaExclamationPrimeReview({parentShadow:parent(),quote,executionPlan:plan,settings:settings(),cycleState:{armed:true,justiceArrowCount:12}});
  assert.equal(good.ok,true);assert.equal(good.justiceArrowCount,12);
  const notArmed=athenaExclamationPrimeReview({parentShadow:parent(),quote,executionPlan:plan,settings:settings(),cycleState:{armed:false,justiceArrowCount:11}});
  assert.equal(notArmed.ok,false);assert.ok(notArmed.reasons.includes('twelve_justice_arrows_not_reached'));
});

test('AE2 Prime Review fails closed on non-profitable parent, ticker mismatch, invalid quote, and entry band',()=>{
  const out=athenaExclamationPrimeReview({parentShadow:parent({pnlCents:-5,closeReason:ANOTHER_DIMENSION.lossCloseReason}),quote:{ticker:'OTHER',yesBid:90,yesAsk:91},executionPlan:{bestAskCents:91,averagePriceCents:91},settings:settings(),cycleState:{armed:true,justiceArrowCount:12}});
  assert.equal(out.ok,false);
  assert.ok(out.reasons.includes('profitable_another_dimension_required'));
  assert.ok(out.reasons.includes('ticker_mismatch'));
  assert.ok(out.reasons.includes('entry_band'));
});

test('AE2 compatibility engine ignores historical vote callbacks and exposes no trading candidate',async()=>{
  const e=new AthenaExclamationEngine();
  await e.init();
  const r=await e.recordQualification({conceptName:'Momentum Hunter',ticker:'T'});
  assert.equal(r.recorded,false);assert.equal(r.candidate,null);assert.equal(r.reason,'ae1_three_saint_convergence_retired');
  const summary=e.summary();assert.equal(summary.legacyThreeSaintAuthority,false);assert.equal(summary.triggerEveryJusticeArrows,12);assert.equal(summary.legacyVotesIgnored,1);
});
