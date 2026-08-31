import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ATHENA_EXCLAMATION, ATHENA_EXIT_INTELLIGENCE, AURORA_EXECUTION } from '../src/doctrine.mjs';
import { AthenaExclamationEngine, athenaExclamationCycleArmed, athenaExclamationPrimeReview, isGoldSaintConcept } from '../src/athenaExclamation.mjs';
import { CANONICAL_NUMERIC_SETTINGS } from '../src/config.mjs';

test('R65 Athena Exclamation identity is the every-12-Justice-Arrows Gemini diversion with ATHENA-X1/Aurora exits',()=>{
  assert.equal(ATHENA_EXCLAMATION.version,'ATHENA-EXCLAMATION-AE2');
  assert.equal(ATHENA_EXCLAMATION.triggerEveryJusticeArrows,12);
  assert.equal(ATHENA_EXCLAMATION.sourceUniverse,'Gemini');
  assert.equal(ATHENA_EXCLAMATION.sourceAttack,'Another Dimension');
  assert.equal(ATHENA_EXCLAMATION.fallbackAttack,'Sagittarius Justice Arrow');
  assert.equal(ATHENA_EXCLAMATION.profitAuthority,ATHENA_EXIT_INTELLIGENCE.version);
  assert.equal(ATHENA_EXCLAMATION.lossAuthority,'AURORA_EXECUTION');
  assert.equal(CANONICAL_NUMERIC_SETTINGS.includes('athenaExclamationStakeCents'),true);
});

test('R65 AE1 Gold-Saint convergence is retired and cannot authorize exposure',async()=>{
  assert.equal(isGoldSaintConcept('Momentum Hunter'),false);
  assert.equal(isGoldSaintConcept('Lightning Plasma'),false);
  const e=new AthenaExclamationEngine();
  const out=await e.recordQualification({conceptName:'Momentum Hunter',ticker:'T'});
  assert.equal(out.recorded,false);assert.equal(out.candidate,null);assert.equal(out.reason,'ae1_three_saint_convergence_retired');
  assert.equal(e.summary().legacyThreeSaintAuthority,false);
});

test('R65 Athena Exclamation arms exactly on the twelfth successfully opened Justice Arrow count',()=>{
  assert.equal(athenaExclamationCycleArmed(0),false);
  assert.equal(athenaExclamationCycleArmed(11),false);
  assert.equal(athenaExclamationCycleArmed(12),true);
  assert.equal(athenaExclamationCycleArmed(13),true);
});

test('R65 Athena Exclamation Prime accepts only the profitable completed Another Dimension opportunity in its own band',()=>{
  const parent={id:'AD',conceptName:'Another Dimension',status:'closed',remainingCount:0,closeReason:'another_dimension_profit',pnlCents:100,ticker:'T'};
  const quote={ticker:'T',yesBid:79,yesAsk:80};const settings={athenaExclamationMinEntryCents:75,athenaExclamationMaxEntryCents:89};
  const cycleState={justiceArrowCount:12,armed:true};
  const ok=athenaExclamationPrimeReview({parentShadow:parent,quote,executionPlan:{bestAskCents:80,averagePriceCents:80},settings,cycleState});
  assert.equal(ok.ok,true);
  assert.equal(athenaExclamationPrimeReview({parentShadow:{...parent,pnlCents:-1},quote,executionPlan:{bestAskCents:80,averagePriceCents:80},settings,cycleState}).ok,false);
  assert.equal(athenaExclamationPrimeReview({parentShadow:parent,quote:{...quote,yesAsk:90},executionPlan:{bestAskCents:90,averagePriceCents:90},settings,cycleState}).ok,false);
});

test('R65 Athena Exclamation is absent from ordinary Bolt/Athena selection and has a dedicated fallback router',async()=>{
  const opportunity=await readFile(new URL('../src/opportunity.mjs',import.meta.url),'utf8');
  const athena=await readFile(new URL('../src/athena.mjs',import.meta.url),'utf8');
  const engine=await readFile(new URL('../src/engine.mjs',import.meta.url),'utf8');
  assert.equal(opportunity.includes("concept:'Athena Exclamation'"),false);
  assert.ok(athena.includes("if(concept==='Lightning Plasma'||concept==='Athena Exclamation')continue"));
  assert.ok(engine.includes('athena_exclamation_fallback_to_justice_arrow'));
  assert.ok(engine.includes('athena-exclamation-cycle-v2'));
});
