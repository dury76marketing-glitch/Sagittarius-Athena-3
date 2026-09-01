import test from 'node:test';
import assert from 'node:assert/strict';
import { originalSettings } from '../src/config.mjs';
import { ATHENA_COMMANDER, ARAYASHIKI, ATOMIC_THUNDER_PATTERN_GUARDIAN } from '../src/doctrine.mjs';
import { examineArayashikiSurvival, verifyArayashikiCertificate } from '../src/arayashiki.mjs';
import { AthenaCommander, ATHENA_B2 } from '../src/athena.mjs';
import { validateAthenaFireCommand } from '../src/strategy.mjs';
import { atomicThunderDangerPattern, atomicThunderBoltFeatures, AtomicThunderBoltEngine } from '../src/opportunity.mjs';
import { advanceCrashState } from '../src/learning.mjs';

function settings(overrides={}){
  return {...originalSettings(),systemName:'SAGITTARIUS',mode:'SIMULATION',simFeeCents:2,infinityBreakMinNetPerOriginalContractCents:1,maxSpreadCents:3,
    momentumHunterEnabled:false,waveSurferEnabled:true,recoveryHunterEnabled:false,crashRecoveryHunterEnabled:false,scarletNeedleEnabled:false,athenaExclamationEnabled:false,lightningPlasmaEnabled:false,
    waveStakeCents:20_000,waveMinEntryCents:10,waveMaxEntryCents:89,...overrides};
}
function crashNormal(now=Date.now(),overrides={}){
  return {version:'CI1',phase:'NORMAL',episodeId:null,episodeIndex:0,crashDepthCents:0,reboundCents:0,reclaimRate:0,stableObservations:8,upwardTicks:3,lowerLowCount:0,reboundLostCount:0,entryReady:false,crashStartedAtMs:0,troughAtMs:0,reboundConfirmedAtMs:0,lastResetAtMs:0,lastObservationAtMs:now,updatedAtMs:now,lastBidCents:59,lastAskCents:60,...overrides};
}
function pegasus(now=Date.now(),overrides={}){return{id:'p1',conceptName:'Pegasus',status:'open',openedAtMs:now-2_000,entryPriceCents:55,...overrides};}
function dragon(now=Date.now(),episodeId='CRASH:T:1:1',overrides={}){return{id:'d1',conceptName:'Dragon',status:'open',openedAtMs:now-2_000,entryConfig:{dragonSource:{signalAtMs:now-2_000,episodeId,signalPriceCents:55}},...overrides};}
function features(now=Date.now(),overrides={}){
  return {ticker:'T',eventTicker:'T',side:'YES',sport:'Tennis',bidCents:59,askCents:60,spreadCents:1,historySamples:12,historyWindowMs:30_000,
    velocity5CentsPerSec:0.15,velocity15CentsPerSec:0.10,velocity30CentsPerSec:0.06,velocity60CentsPerSec:0.03,accelerationCentsPerSec2:0.0027,recentMove30Cents:3,recentPeakCents:60,recentTroughCents:55,
    momentumRiseCents:3,momentumPullbackCents:0,waveFavorableMoveCents:5,crashDepthCents:0,reboundCents:5,reclaimRate:1,stableObservations:8,upwardTicks:3,lowerLowCount:0,reboundLostCount:0,crashEpisodeId:null,gameMinutes:20,cosmoSources:['Pegasus'],cosmoCount:1,sourceScore:80,targetFeasibilityScore:90,marketObservedAtMs:now,calculatedAtMs:now,
    eligibleAttacks:[{concept:'Wave Surfer',targetFeasible:true,targetFeasibilityScore:90,requiredTargetBidCents:65,requiredGrossMoveCents:5,estimatedEntryFeePerContractCents:2,estimatedExitFeePerContractCents:2}],...overrides};
}
function bolt(now=Date.now(),overrides={}){return{version:'ATOMIC-THUNDER-BOLT-V1',policyRevision:'ATB1-R2-TARGET-AWARE-ECONOMIC-RADAR',id:'bolt-r56',fingerprint:'bolt-fp',systemName:'SAGITTARIUS',sourceRelease:'R56',ticker:'T',eventTicker:'T',side:'YES',sport:'Tennis',detectedAtMs:now-100,expiresAtMs:now+4_900,score:85,features:features(now),...overrides};}
function db(){
  const episodes=new Map();return{
    episodes,audits:[],
    async athenaEconomicEntries(){return[];},async athenaEconomicOpportunityEpisodes(){return[];},async athenaEconomicProfitEpisodes(){return[];},
    async upsertOpportunityEpisode(ep){episodes.set(ep.id,structuredClone(ep));return structuredClone(ep);},async opportunityEpisode(id){return structuredClone(episodes.get(id)||null);},
    async audit(level,event,data){this.audits.push({level,event,data});},
  };
}

test('R56 Arayashiki A8 certifies a fresh NORMAL regime with current executable ascent evidence',()=>{
  const now=Date.now(),b=bolt(now),c=examineArayashikiSurvival({bolt:b,context:{crashState:crashNormal(now),cosmos:[pegasus(now)]},selectedAttack:'Wave Surfer',now});
  assert.equal(c.status,'CERTIFIED');assert.equal(c.hardBlocks.length,0);assert.ok(c.survivalScore>=c.requiredSurvivalScore);assert.equal(verifyArayashikiCertificate(c,now).ok,true);
});

test('R56 Arayashiki A8 rejects an active CI1 crash even when Atomic Thunder economics and momentum are strong',()=>{
  const now=Date.now(),c=examineArayashikiSurvival({bolt:bolt(now),context:{crashState:crashNormal(now,{phase:'CRASHING',episodeId:'CRASH:T:2:NOW',crashStartedAtMs:now-4_000,crashDepthCents:12,lowerLowCount:2}),cosmos:[pegasus(now)]},selectedAttack:'Wave Surfer',now});
  assert.equal(c.status,'REJECTED');assert.ok(c.hardBlocks.includes('active_ci1_crash'));
});

test('R56 regime continuity invalidates every bullish Cosmo that predates a newer crash/rebound regime',()=>{
  const now=Date.now(),state=crashNormal(now,{phase:'REBOUND_CONFIRMED',episodeId:'CRASH:T:2:NOW',crashStartedAtMs:now-10_000,crashDepthCents:15,reboundCents:11,reclaimRate:.74,stableObservations:6,upwardTicks:4,entryReady:true});
  const oldPegasus=pegasus(now,{openedAtMs:now-30_000});
  const c=examineArayashikiSurvival({bolt:bolt(now),context:{crashState:state,cosmos:[oldPegasus]},selectedAttack:'Wave Surfer',now});
  assert.equal(c.status,'REJECTED');assert.ok(c.hardBlocks.includes('all_cosmo_sources_invalidated_by_regime'));assert.equal(c.regime.sourceContinuity.sources[0].reason,'source_predates_current_regime');
});

test('R56 current Dragon episode may certify after a strong rebound but an older Dragon episode may not',()=>{
  const now=Date.now(),episode='CRASH:T:3:NOW',state=crashNormal(now,{phase:'REBOUND_CONFIRMED',episodeId:episode,crashStartedAtMs:now-20_000,crashDepthCents:20,reboundCents:15,reclaimRate:.75,stableObservations:8,upwardTicks:5,lowerLowCount:1,reboundLostCount:0,entryReady:true});
  const fresh=dragon(now,episode,{openedAtMs:now-4_000,entryConfig:{dragonSource:{signalAtMs:now-4_000,episodeId:episode,signalPriceCents:56}}});
  const good=examineArayashikiSurvival({bolt:bolt(now),context:{crashState:state,cosmos:[fresh]},selectedAttack:'Wave Surfer',now});assert.equal(good.status,'CERTIFIED');
  const old=dragon(now,'CRASH:T:2:OLD',{openedAtMs:now-4_000,entryConfig:{dragonSource:{signalAtMs:now-4_000,episodeId:'CRASH:T:2:OLD',signalPriceCents:56}}});
  const bad=examineArayashikiSurvival({bolt:bolt(now),context:{crashState:state,cosmos:[old]},selectedAttack:'Wave Surfer',now});assert.equal(bad.status,'REJECTED');assert.ok(bad.hardBlocks.includes('dragon_current_episode_mismatch'));
});

test('R56 low-band Atomic-Thunder-only market without strong directional proof is not survival-certified',()=>{
  const now=Date.now(),f=features(now,{bidCents:39,askCents:40,velocity5CentsPerSec:0,velocity15CentsPerSec:0,velocity30CentsPerSec:0,accelerationCentsPerSec2:0,recentMove30Cents:0,upwardTicks:0,waveFavorableMoveCents:0,cosmoSources:[],cosmoCount:0});
  const c=examineArayashikiSurvival({bolt:bolt(now,{features:f}),context:{crashState:crashNormal(now,{lastBidCents:39,lastAskCents:40}),cosmos:[]},selectedAttack:'Wave Surfer',now});
  assert.equal(c.status,'REJECTED');assert.ok(c.hardBlocks.includes('low_band_directional_proof_missing'));assert.ok(c.warnings.includes('low_band_requires_stronger_certificate'));
});

test('R56 unknown or stale causal state fails closed instead of being treated as neutral-safe',()=>{
  const now=Date.now();
  const missing=examineArayashikiSurvival({bolt:bolt(now),context:{cosmos:[pegasus(now)]},selectedAttack:'Wave Surfer',now});assert.equal(missing.status,'REJECTED');assert.ok(missing.hardBlocks.includes('ci1_state_missing'));
  const stale=examineArayashikiSurvival({bolt:bolt(now),context:{crashState:crashNormal(now-10_000),cosmos:[pegasus(now)]},selectedAttack:'Wave Surfer',now});assert.equal(stale.status,'REJECTED');assert.ok(stale.hardBlocks.includes('ci1_state_stale'));
});

test('R56 Athena A3 economic FIRE candidate is converted to SURVIVAL_REJECT before command sealing when A8 rejects',async()=>{
  const now=Date.now(),database=db(),s=settings(),a=new AthenaCommander({db:database,systemName:s.systemName,sourceRelease:'R56',getSettings:()=>s});await a.init();
  const result=await a.decide(bolt(now),{crashState:crashNormal(now,{phase:'CRASHING',episodeId:'CRASH:T:2:NOW',crashStartedAtMs:now-1_000,crashDepthCents:10}),cosmos:[pegasus(now)]});
  assert.equal(result.decision,'SURVIVAL_REJECT');assert.equal(result.fireCommand,null);assert.equal(result.survivalCertificate.status,'REJECTED');assert.equal(a.summary().survivalRejected,1);
});

test('R56 Athena A3 seals the fresh A8 certificate into FIRE and execution validates without recomputing survival',async()=>{
  const now=Date.now(),database=db(),s=settings(),a=new AthenaCommander({db:database,systemName:s.systemName,sourceRelease:'R56',getSettings:()=>s});await a.init();
  const b=bolt(now),result=await a.decide(b,{crashState:crashNormal(now),cosmos:[pegasus(now)]});
  assert.equal(result.decision,'FIRE');assert.equal(result.fireCommand.survivalCertificate.status,'CERTIFIED');assert.equal(a.summary().survivalCertified,1);
  const q={ticker:'T',eventTicker:'T',yesBid:59,yesAsk:60};
  const valid=validateAthenaFireCommand(result.fireCommand,{concept:'Wave Surfer',q,settings:s,now:result.decidedAtMs+100});assert.equal(valid.ok,true);
  const expired=validateAthenaFireCommand(result.fireCommand,{concept:'Wave Surfer',q,settings:s,now:result.fireCommand.survivalCertificate.expiresAtMs+1});assert.equal(expired.ok,false);assert.ok(['athena_fire_expired','arayashiki_certificate_expired'].includes(expired.reason));
});

test('R56 tampering with survival certificate invalidates the sealed Athena FIRE command',async()=>{
  const now=Date.now(),database=db(),s=settings(),a=new AthenaCommander({db:database,systemName:s.systemName,sourceRelease:'R56',getSettings:()=>s});await a.init();
  const result=await a.decide(bolt(now),{crashState:crashNormal(now),cosmos:[pegasus(now)]});assert.equal(result.decision,'FIRE');
  const tampered=structuredClone(result.fireCommand);tampered.survivalCertificate.survivalScore=1;
  const q={ticker:'T',eventTicker:'T',yesBid:59,yesAsk:60};assert.equal(validateAthenaFireCommand(tampered,{concept:'Wave Surfer',q,settings:s,now:Date.now()}).ok,false);
});

test('R56 Athena A3 leaves the frozen B2-R2 Guardian model hash and policy untouched',()=>{
  assert.equal(ATHENA_COMMANDER.version,'ATHENA-A3');assert.equal(ARAYASHIKI.postFirePredictiveVeto,false);
  assert.equal(ATHENA_B2.version,'ATHENA-B2');assert.equal(ATHENA_B2.policyRevision,'ATHENA-B2-R2-GUARDIAN-104');
  assert.equal(ATHENA_B2.guardianModelHash,'77f1153640f1565f7eaaa8823d8dacd2b18d9bfd954e4590ddd63e8e79a5feb4');
});

function legacyNegativeEntries({certified=false,count=6}={}){
  return Array.from({length:count},(_,i)=>({
    id:`legacy-neg-${certified?'cert':'raw'}-${i}`,conceptName:'Wave Surfer',status:'closed',closedAtMs:Date.now()-10_000-i,closeReason:'aurora_execution',
    pnlCents:-3000,maeCents:30,entryPriceCents:60,entryFeeCents:200,count:100,sourceFeeder:'Pegasus',watchdogModel:'bolt-athena-infinity-aurora',
    entryConfig:{sport:'Tennis',gameClockAuthority:{elapsedMinutes:20},gameMinutes:20,release:certified?'R58-CERTIFIED':'R55',infinityBreak:{minimumNetPerOriginalContractCents:1},
      athenaFire:certified?{survivalCertificate:{status:'CERTIFIED',version:ARAYASHIKI.version,policyRevision:ARAYASHIKI.policyRevision},decisionEvidence:{preBoltClearance:{status:'CLEARED',version:ATOMIC_THUNDER_PATTERN_GUARDIAN.version,policyRevision:ATOMIC_THUNDER_PATTERN_GUARDIAN.policyRevision}}}:null},
  }));
}
function certifiedPositiveEntries(count=6){
  return Array.from({length:count},(_,i)=>({
    id:`cert-pos-${i}`,conceptName:'Wave Surfer',status:'closed',closedAtMs:Date.now()-5_000-i,closeReason:'infinity_break',
    pnlCents:2800,maeCents:3,entryPriceCents:60,entryFeeCents:200,count:100,sourceFeeder:'Pegasus',watchdogModel:'bolt-athena-infinity-aurora',
    entryConfig:{sport:'Tennis',gameClockAuthority:{elapsedMinutes:20},gameMinutes:20,release:'R58-CERTIFIED-POSITIVE',infinityBreak:{minimumNetPerOriginalContractCents:1},
      athenaFire:{survivalCertificate:{status:'CERTIFIED',version:ARAYASHIKI.version,policyRevision:ARAYASHIKI.policyRevision},decisionEvidence:{preBoltClearance:{status:'CLEARED',version:ATOMIC_THUNDER_PATTERN_GUARDIAN.version,policyRevision:ATOMIC_THUNDER_PATTERN_GUARDIAN.policyRevision}}}},
  }));
}
function dbWithEconomicEntries(entries=[]){
  const base=db();base.athenaEconomicEntries=async()=>structuredClone(entries);return base;
}

test('R58 legacy mature negative EV remains only a cold-start prior and cannot raise the A8 threshold',async()=>{
  const now=Date.now(),database=dbWithEconomicEntries(legacyNegativeEntries()),s=settings(),a=new AthenaCommander({db:database,systemName:s.systemName,sourceRelease:'R56-HF1',getSettings:()=>s});await a.init();
  const result=await a.decide(bolt(now),{crashState:crashNormal(now),cosmos:[pegasus(now)]});
  assert.equal(result.ranking[0].legacyEconomicMature,true);assert.equal(result.ranking[0].legacyEconomicQualified,false);
  assert.equal(result.ranking[0].certifiedEconomicMature,false);assert.equal(result.ranking[0].economicAuthorityMode,'ATB2_A8_CERTIFIED_COLD_START');
  assert.equal(result.survivalCertificate.status,'CERTIFIED');assert.equal(result.survivalConditionedEconomics.mode,'ATB2_A8_CERTIFIED_COLD_START');
  assert.equal(result.survivalConditionedEconomics.requiredSurvivalScore,result.survivalCertificate.requiredSurvivalScore);
  assert.equal(result.decision,'FIRE');assert.equal(result.reason,'atb2_a8_certified_cold_start_feasible');
});

test('R58 mature certified positive economics outranks a much larger negative legacy population',async()=>{
  const now=Date.now(),entries=[...legacyNegativeEntries({count:24}),...certifiedPositiveEntries(6)],database=dbWithEconomicEntries(entries),s=settings(),a=new AthenaCommander({db:database,systemName:s.systemName,sourceRelease:'R58',getSettings:()=>s});await a.init();
  const result=await a.decide(bolt(now),{crashState:crashNormal(now),cosmos:[pegasus(now)]});
  const best=result.ranking[0];assert.equal(best.concept,'Wave Surfer');assert.equal(best.certifiedEconomicMature,true);assert.equal(best.certifiedEconomicQualified,true);assert.equal(best.legacyEconomicMature,true);assert.equal(best.legacyEconomicQualified,false);
  assert.equal(best.economicAuthorityMode,'ATB2_A8_CERTIFIED_MATURE');assert.ok(best.certifiedExpectedNetPerOriginalContractCents>0);assert.ok(best.legacyExpectedNetPerOriginalContractCents<0);
  assert.equal(result.survivalConditionedEconomics.mode,'ATB2_A8_CERTIFIED_MATURE_SHADOW_MEMORY');assert.equal(result.survivalConditionedEconomics.memoryAssessment,'POSITIVE_EV');assert.equal(result.survivalConditionedEconomics.memoryDecisionAuthority,false);assert.equal(result.decision,'FIRE');assert.equal(result.reason,'atb2_a8_certified_current_feasible_memory_positive_shadow');
});

test('R56-HF1 never weakens A8: the same legacy-negative candidate is still blocked by an active crash',async()=>{
  const now=Date.now(),database=dbWithEconomicEntries(legacyNegativeEntries()),s=settings(),a=new AthenaCommander({db:database,systemName:s.systemName,sourceRelease:'R56-HF1',getSettings:()=>s});await a.init();
  const result=await a.decide(bolt(now),{crashState:crashNormal(now,{phase:'CRASHING',episodeId:'CRASH:T:9:NOW',crashStartedAtMs:now-1_000,crashDepthCents:16,lowerLowCount:3}),cosmos:[pegasus(now)]});
  assert.equal(result.decision,'SURVIVAL_REJECT');assert.equal(result.fireCommand,null);assert.ok(result.survivalCertificate.hardBlocks.includes('active_ci1_crash'));
});

test('R59 Athena Memory HF1 mature negative Athena Memory is shadow-only and cannot veto a fresh A8-certified feasible candidate',async()=>{
  const now=Date.now(),entries=legacyNegativeEntries({certified:true,count:24}),database=dbWithEconomicEntries(entries),s=settings(),a=new AthenaCommander({db:database,systemName:s.systemName,sourceRelease:'R59-ATHENA-MEMORY-HF1',getSettings:()=>s});await a.init();
  assert.ok(a.summary().memory.certifiedEntryRows>=24);assert.ok(a.summary().memory.certifiedProfileCount>0);assert.equal(a.summary().economicMemory.decisionAuthority,false);
  const result=await a.decide(bolt(now),{crashState:crashNormal(now),cosmos:[pegasus(now)]});
  assert.equal(result.survivalCertificate.status,'CERTIFIED');assert.equal(result.ranking[0].certifiedEconomicMature,true);assert.equal(result.ranking[0].certifiedEconomicQualified,false);
  assert.equal(result.survivalConditionedEconomics.mode,'ATB2_A8_CERTIFIED_MATURE_SHADOW_MEMORY');assert.equal(result.survivalConditionedEconomics.memoryAssessment,'NEGATIVE_EV');assert.equal(result.survivalConditionedEconomics.memoryDecisionAuthority,false);
  assert.equal(result.decision,'FIRE');assert.equal(result.reason,'atb2_a8_certified_current_feasible_memory_negative_shadow');assert.ok(result.fireCommand);assert.equal(result.fireCommand.economicTarget.memoryDecisionAuthority,false);
});

test('R59 Athena Memory HF1 five-farm simulation: Aurora 35/45/55/65/75 cannot create mature-learning starvation',async()=>{
  const negative=legacyNegativeEntries({certified:true,count:80});
  for(const auroraDamageControlPercent of [35,45,55,65,75]){
    const now=Date.now(),database=dbWithEconomicEntries(negative),s=settings({auroraDamageControlPercent}),a=new AthenaCommander({db:database,systemName:s.systemName,sourceRelease:'R59-ATHENA-MEMORY-HF1',getSettings:()=>s});await a.init();
    for(let i=0;i<20;i++){
      const t=now+i, b=bolt(t,{id:`farm-${auroraDamageControlPercent}-${i}`,fingerprint:`farm-fp-${auroraDamageControlPercent}-${i}`,expiresAtMs:t+4_900});
      const result=await a.decide(b,{crashState:crashNormal(t),cosmos:[pegasus(t)]});
      assert.equal(result.survivalCertificate.status,'CERTIFIED',`${auroraDamageControlPercent}% A8`);
      assert.equal(result.survivalConditionedEconomics.memoryAssessment,'NEGATIVE_EV',`${auroraDamageControlPercent}% memory should remain negative and visible`);
      assert.equal(result.decision,'FIRE',`${auroraDamageControlPercent}% negative memory must not choke FIRE`);
      assert.ok(result.fireCommand);
    }
    assert.equal(a.summary().fire,20);assert.equal(a.summary().economicMemory.decisionAuthority,false);
  }
});

test('R59 Athena Memory HF1 shadow-memory separation does not weaken current-state safety: active CI1 crash still blocks every farm',async()=>{
  const negative=legacyNegativeEntries({certified:true,count:80});
  for(const auroraDamageControlPercent of [35,45,55,65,75]){
    const now=Date.now(),database=dbWithEconomicEntries(negative),s=settings({auroraDamageControlPercent}),a=new AthenaCommander({db:database,systemName:s.systemName,sourceRelease:'R59-ATHENA-MEMORY-HF1',getSettings:()=>s});await a.init();
    const result=await a.decide(bolt(now,{id:`unsafe-${auroraDamageControlPercent}`}),{crashState:crashNormal(now,{phase:'CRASHING',episodeId:`CRASH:T:${auroraDamageControlPercent}:NOW`,crashStartedAtMs:now-1_000,crashDepthCents:18,lowerLowCount:3}),cosmos:[pegasus(now)]});
    assert.equal(result.decision,'SURVIVAL_REJECT');assert.equal(result.fireCommand,null);assert.ok(result.survivalCertificate.hardBlocks.includes('active_ci1_crash'));
  }
});

test('R58 A8 does not duplicate ATB2 accumulated crash/rebound history when the present market state is clean',()=>{
  const now=Date.now(),state=crashNormal(now,{phase:'NORMAL',episodeId:'OLD-DAMAGED-EPISODE',crashDepthCents:40,reboundCents:2,reclaimRate:.05,lowerLowCount:20,reboundLostCount:12,lastResetAtMs:now-30_000});
  const c=examineArayashikiSurvival({bolt:bolt(now),context:{crashState:state,cosmos:[pegasus(now,{openedAtMs:now-5_000})]},selectedAttack:'Wave Surfer',now});
  assert.equal(c.status,'CERTIFIED');
  for(const retired of ['excessive_lower_lows','rebound_repeatedly_lost','severe_crash_weak_reclaim'])assert.equal(c.hardBlocks.includes(retired),false,retired);
});


// R57 ATB2-R3 regression surface. These tests intentionally exercise only the
// new pre-Bolt pattern screen and leave Athena/A8/Attack authority unchanged.
const atb2Hp=(t,p)=>({t,bid:p,ask:p+1});
function atb2CleanHistory(now){return[atb2Hp(now-150_000,50),atb2Hp(now-120_000,51),atb2Hp(now-90_000,52),atb2Hp(now-60_000,53),atb2Hp(now-30_000,54),atb2Hp(now,55)];}
function atb2CrashReboundHistory(now){return[atb2Hp(now-140_000,76),atb2Hp(now-110_000,50),atb2Hp(now-80_000,16),atb2Hp(now-45_000,48),atb2Hp(now-10_000,76),atb2Hp(now,77)];}
function atb2FailedReboundHistory(now){return[atb2Hp(now-140_000,70),atb2Hp(now-110_000,60),atb2Hp(now-80_000,65),atb2Hp(now-50_000,56),atb2Hp(now-20_000,60),atb2Hp(now,52)];}
function atb2Path(now,prices,stepMs=15_000){return prices.map((p,i)=>atb2Hp(now-(prices.length-1-i)*stepMs,p));}
function atb2P6PeakNoExtensionCliff(now){return atb2Path(now,[60,64,68,72,75,76,75,76,74,71]);}
function atb2P7MicroBreakoutRejection(now){return atb2Path(now,[65,70,74,75,74,75,77,75,73,71]);}
function atb2P8HighZoneExhaustion(now){return atb2Path(now,[61,65,69,73,76,78,79,78,79,76,72]);}
function atb2HealthyHighZoneContinuation(now){return atb2Path(now,[70,72,74,76,78,80,82,84,86]);}
function atb2HealthyBreakoutHold(now){return atb2Path(now,[65,70,74,75,74,75,78,80,82]);}
function atb2BenignHighZonePullbackResume(now){return atb2Path(now,[60,64,68,72,75,77,76,78,79]);}
function atb2Settings(){return{mode:'SIMULATION',simFeeCents:2,maxSpreadCents:3,infinityBreakMinNetPerOriginalContractCents:1,waveSurferEnabled:true,waveMinEntryCents:10,waveMaxEntryCents:89,waveStakeCents:20_000,momentumHunterEnabled:false,recoveryHunterEnabled:false,crashRecoveryHunterEnabled:false,scarletNeedleEnabled:false,athenaExclamationEnabled:false,lightningPlasmaEnabled:false};}
function atb2Db(){return{episodes:new Map(),audits:[],async upsertOpportunityEpisode(ep){this.episodes.set(ep.id,structuredClone(ep));return ep;},async audit(level,event,data){this.audits.push({level,event,data});}};}

test('R58 A8 consumes explicit current-window lower lows instead of accumulated CI1 counters leaked through Bolt features',()=>{
  const now=1_900_000,history=atb2CleanHistory(now),q={ticker:'T',eventTicker:'T',sport:'Tennis',yesBid:55,yesAsk:56,quoteAtMs:now};
  const crashSignal={episodeId:'OLD-CI1',crashDepthCents:6,reboundCents:1,reclaimRate:1/6,stableObservations:50,upwardTicks:0,lowerLowCount:20,reboundLostCount:12};
  const f=atomicThunderBoltFeatures({q,history,settings:atb2Settings(),cosmos:[pegasus(now)],crashSignal,now});
  assert.equal(f.lowerLowCount,20,'legacy/enriched CI1 counter remains available for historical context');
  assert.equal(f.currentLowerLowCount,0,'A8 gets the actual current short-window structure');
  assert.ok(f.currentUpwardTicks>=1);
  const b={id:'current-window-bolt',fingerprint:'fp',ticker:'T',eventTicker:'T',expiresAtMs:now+5000,features:f};
  const c=examineArayashikiSurvival({bolt:b,context:{crashState:crashNormal(now),cosmos:[pegasus(now)]},selectedAttack:'Wave Surfer',now});
  assert.equal(c.status,'CERTIFIED');assert.equal(c.market.lowerLowCount,0);assert.equal(c.hardBlocks.includes('fresh_directional_deterioration'),false);
});

test('R57 ATB2 maps severe crash then rebound as contaminated before Bolt emission',()=>{const now=1_000_000,r=atomicThunderDangerPattern({history:atb2CrashReboundHistory(now),now});assert.equal(r.contaminated,true);assert.ok(r.reasons.includes('crash_rebound_market'));});
test('R57 ATB2 maps fall rebound lower fall as contaminated',()=>{const now=1_000_000,r=atomicThunderDangerPattern({history:atb2FailedReboundHistory(now),now});assert.equal(r.contaminated,true);assert.ok(r.reasons.includes('fall_rebound_lower_fall')||r.reasons.includes('repeated_fall_rebound_cycle'));});
test('R57 ATB2 leaves a clean rising path pattern-clear',()=>{const now=1_000_000,r=atomicThunderDangerPattern({history:atb2CleanHistory(now),now});assert.equal(r.contaminated,false);assert.deepEqual(r.reasons,[]);});

test('ATB2-R5 P6 maps peak -> no extension/stall -> cliff as a new upside-origin dangerous family',()=>{
  const now=2_000_000,r=atomicThunderDangerPattern({history:atb2P6PeakNoExtensionCliff(now),now});
  assert.equal(r.contaminated,true);assert.ok(r.reasons.includes('peak_entry_no_extension_cliff'));
});
test('ATB2-R5 P7 maps established-high micro breakout -> rejection -> cliff without requiring a prior fall',()=>{
  const now=2_100_000,r=atomicThunderDangerPattern({history:atb2P7MicroBreakoutRejection(now),now});
  assert.equal(r.contaminated,true);assert.ok(r.reasons.includes('micro_breakout_rejection_cliff'));
});
test('ATB2-R5 P8 maps extended ascent -> high-zone compression -> terminal reversal and never uses high price alone',()=>{
  const now=2_200_000,r=atomicThunderDangerPattern({history:atb2P8HighZoneExhaustion(now),now});
  assert.equal(r.contaminated,true);assert.ok(r.reasons.includes('high_zone_exhaustion_terminal_reversal'));
});
test('ATB2-R5 preserves healthy high-zone continuation, held breakouts and resumed pullbacks',()=>{
  const now=2_300_000;
  for(const history of [atb2HealthyHighZoneContinuation(now),atb2HealthyBreakoutHold(now),atb2BenignHighZonePullbackResume(now)]){
    const r=atomicThunderDangerPattern({history,now});
    assert.equal(r.contaminated,false,JSON.stringify(r.reasons));assert.deepEqual(r.reasons,[]);
  }
});
test('ATB2-R5 P6-P8 are pre-Bolt only and destroy an armed PRE-BOLT when upside exhaustion appears before final exam',async()=>{
  let now=2_400_000,history=atb2CleanHistory(now);const database=atb2Db(),market={getHistory:()=>history};
  const e=new AtomicThunderBoltEngine({market,getSettings:atb2Settings,db:database,systemName:'SAGITTARIUS',sourceRelease:'R59-ATB2-R5'});
  const q=()=>({ticker:'UPDANGER',eventTicker:'UPDANGER',sport:'Tennis',yesBid:71,yesAsk:72,quoteAtMs:now});
  assert.equal(await e.detect(q(),{now}),null);assert.equal(e.preBolts.size,1);
  now+=30_000;history=atb2CleanHistory(now);assert.equal(await e.detect(q(),{now}),null);assert.equal(e.preExamPassed,1);
  now+=30_000;history=atb2P6PeakNoExtensionCliff(now);assert.equal(await e.detect(q(),{now}),null);
  assert.equal(e.preBolts.size,0);assert.equal(e.patternBlocked,1);assert.ok(e.lastPatternBlock.reasons.includes('peak_entry_no_extension_cliff'));
  assert.equal(e.detected,0,'no Bolt may exist after P6-P8 contamination');
});
test('R57 HF1 ATB2 blocks Southampton-style CI1 crash-rebound ancestry even when the recent 120s price path is clean',()=>{
  const now=1_000_000,crashSignal={episodeId:'CRASH:SOU:2:1',crashDepthCents:17,reboundCents:14,reclaimRate:14/17};
  const r=atomicThunderDangerPattern({history:atb2CleanHistory(now),now,crashSignal});
  assert.equal(r.contaminated,true);assert.ok(r.reasons.includes('crash_rebound_ancestry'));
});
test('R57 HF1 ATB2 also blocks current active CI1 rebound state without needing a pending reset signal',()=>{
  const now=1_500_000,crashState={phase:'REBOUND_CONFIRMED',episodeId:'CRASH:ACTIVE:1:1',crashDepthCents:20,reboundCents:12,reclaimRate:0.60};
  const r=atomicThunderDangerPattern({history:atb2CleanHistory(now),now,crashState});
  assert.equal(r.contaminated,true);assert.ok(r.reasons.includes('crash_rebound_ancestry'));
});
test('R57 HF1 ATB2 blocks a clean PRE-BOLT when its current CI1 ancestry is crash-rebound contaminated',async()=>{
  let now=5_000_000,history=atb2CleanHistory(now);const database=atb2Db(),market={getHistory:()=>history};
  const e=new AtomicThunderBoltEngine({market,getSettings:atb2Settings,db:database,systemName:'SAGITTARIUS',sourceRelease:'R57-HF1'});
  const q=()=>({ticker:'SOU',eventTicker:'SOU',sport:'Soccer',yesBid:74,yesAsk:76,quoteAtMs:now});
  const crashSignal={episodeId:'CRASH:SOU:2:1788013763593',crashDepthCents:17,reboundCents:14,reclaimRate:0.8235294117647058};
  assert.equal(await e.detect(q(),{now,crashSignal}),null);assert.equal(e.preBolts.size,0);assert.equal(e.patternBlocked,1);assert.ok(e.lastPatternBlock.reasons.includes('crash_rebound_ancestry'));
});
test('R57 ATB2 holds clean nomination through 30s and emits existing Bolt only after 120s',async()=>{let now=10_000_000,history=atb2CleanHistory(now);const database=atb2Db(),market={getHistory:()=>history},e=new AtomicThunderBoltEngine({market,getSettings:atb2Settings,db:database,systemName:'SAGITTARIUS',sourceRelease:'R57'}),q=()=>({ticker:'T',eventTicker:'T',sport:'Tennis',yesBid:55,yesAsk:56,quoteAtMs:now});let b=await e.detect(q(),{now});assert.equal(b,null);assert.equal(e.preBolts.size,1);now+=ATOMIC_THUNDER_PATTERN_GUARDIAN.defaultPreExamMs;history=atb2CleanHistory(now);b=await e.detect(q(),{now});assert.equal(b,null);assert.equal(e.preExamPassed,1);now+=ATOMIC_THUNDER_PATTERN_GUARDIAN.defaultFinalExamMs-ATOMIC_THUNDER_PATTERN_GUARDIAN.defaultPreExamMs;history=atb2CleanHistory(now);b=await e.detect(q(),{now});assert.ok(b);assert.equal(e.finalExamPassed,1);assert.equal(e.detected,1);assert.equal(b.preBoltClearance?.status,'CLEARED');assert.equal(b.preBoltClearance?.version,ATOMIC_THUNDER_PATTERN_GUARDIAN.version);assert.equal(b.preBoltClearance?.firstExamMs,ATOMIC_THUNDER_PATTERN_GUARDIAN.defaultPreExamMs);assert.equal(b.preBoltClearance?.finalExamMs,ATOMIC_THUNDER_PATTERN_GUARDIAN.defaultFinalExamMs);});
test('R57 ATB2 destroys current PRE-BOLT when crash/rebound contamination appears',async()=>{let now=20_000_000,history=atb2CleanHistory(now);const database=atb2Db(),market={getHistory:()=>history},e=new AtomicThunderBoltEngine({market,getSettings:atb2Settings,db:database,systemName:'SAGITTARIUS',sourceRelease:'R57'}),q=()=>({ticker:'T',eventTicker:'T',sport:'Tennis',yesBid:55,yesAsk:56,quoteAtMs:now});assert.equal(await e.detect(q(),{now}),null);now+=30_000;history=atb2CrashReboundHistory(now);assert.equal(await e.detect(q(),{now}),null);assert.equal(e.preBolts.size,0);assert.ok(e.patternBlocked>=1);});


test('R57 ATB2 operator timing defaults persist and enforce first < final',async()=>{
  const C=await import('../src/config.mjs');
  const defaults=C.originalSettings();
  assert.equal(defaults.atomicThunderFirstPatternExamSeconds,30);
  assert.equal(defaults.atomicThunderFinalPatternExamSeconds,120);
  assert.ok(C.CANONICAL_NUMERIC_SETTINGS.includes('atomicThunderFirstPatternExamSeconds'));
  assert.ok(C.CANONICAL_NUMERIC_SETTINGS.includes('atomicThunderFinalPatternExamSeconds'));
});

test('R57 ATB2 pattern block counts once and requires Atomic Thunder nomination reset before a new PRE-BOLT',async()=>{
  let now=30_000_000,history=atb2CrashReboundHistory(now),detected=true;
  const database=atb2Db(),market={getHistory:()=>history};
  const settings=()=>({...atb2Settings(),atomicThunderFirstPatternExamSeconds:30,atomicThunderFinalPatternExamSeconds:120});
  const e=new AtomicThunderBoltEngine({market,getSettings:settings,db:database,systemName:'SAGITTARIUS',sourceRelease:'R57'});
  const q=()=>({ticker:'T',eventTicker:'T',sport:'Tennis',yesBid:55,yesAsk:56,quoteAtMs:now});
  await e.detect(q(),{now});const once=e.patternBlocked;
  now+=1_000;history=atb2CrashReboundHistory(now);await e.detect(q(),{now});assert.equal(e.patternBlocked,once);
  // End the underlying Atomic Thunder opportunity by making the quote invalid, then allow a new clean nomination.
  now+=1_000;await e.detect({...q(),yesBid:0,yesAsk:0},{now});
  now+=1_000;history=atb2CleanHistory(now);await e.detect(q(),{now});assert.equal(e.preBolts.size,1);
});

test('R57 chain is Pattern-cleared Bolt -> Arayashiki -> Athena, with no Athena ranking on A8 rejection',async()=>{
  const {readFile}=await import('node:fs/promises');
  const athena=await readFile(new URL('../src/athena.mjs',import.meta.url),'utf8');
  const engine=await readFile(new URL('../src/engine.mjs',import.meta.url),'utf8');
  const a8=athena.indexOf('survivalCertificate=examineArayashikiSurvival({bolt,context,selectedAttack:null,now})');
  const rank=athena.indexOf('ranking=rankAthenaAttacks(bolt,settings,this.memory,context)',a8);
  assert.ok(a8>=0&&rank>a8);
  assert.ok(engine.includes("authorityChain:'GAME_CLOCK->PRE_BOLT->ATOMIC_THUNDER_BOLT->ARAYASHIKI->ATHENA->EXECUTION_ATTACK->INFINITY_BREAK/AURORA'"));
});

test('R57 ATB2 freezes exam timing per PRE-BOLT so later operator edits cannot shorten an active qualification',async()=>{
  let now=40_000_000,history=atb2CleanHistory(now);
  const current={...atb2Settings(),atomicThunderFirstPatternExamSeconds:30,atomicThunderFinalPatternExamSeconds:120};
  const database=atb2Db(),market={getHistory:()=>history};
  const e=new AtomicThunderBoltEngine({market,getSettings:()=>current,db:database,systemName:'SAGITTARIUS',sourceRelease:'R57'});
  const q=()=>({ticker:'T',eventTicker:'T',sport:'Tennis',yesBid:55,yesAsk:56,quoteAtMs:now});
  assert.equal(await e.detect(q(),{now}),null);
  const frozen=e.preBolts.get('T');assert.equal(frozen.firstExamMs,30_000);assert.equal(frozen.finalExamMs,120_000);
  current.atomicThunderFinalPatternExamSeconds=31;
  now+=31_000;history=atb2CleanHistory(now);assert.equal(await e.detect(q(),{now}),null,'active PRE-BOLT must not adopt a shorter final exam');
  assert.equal(e.preBolts.get('T').finalExamMs,120_000);
  now+=89_000;history=atb2CleanHistory(now);assert.ok(await e.detect(q(),{now}),'original 120-second frozen final exam must still release the clean Bolt');
});

test('R57 A-to-Z entry authority reaches executable Athena FIRE only after ATB2 30/120 clearance and A8 certification',async()=>{
  const hp=(t,p)=>({t,bid:p,ask:p+1});
  const clean=(t)=>[hp(t-120_000,55),hp(t-90_000,56),hp(t-60_000,57),hp(t-30_000,58),hp(t,59)];
  let now=Date.now()-120_000,history=clean(now);
  const s=settings({atomicThunderFirstPatternExamSeconds:30,atomicThunderFinalPatternExamSeconds:120,waveSurferEnabled:false,lightningPlasmaEnabled:true,lightningPlasmaMinEntryCents:10,lightningPlasmaMaxEntryCents:89,lightningPlasmaFieldStakeCents:20_000,lightningPlasmaMaxStrikes:5});
  const database=atb2Db();database.opportunityEpisode=async(id)=>structuredClone(database.episodes.get(id)||null);database.athenaEconomicEntries=async()=>[];database.athenaEconomicOpportunityEpisodes=async()=>[];database.athenaEconomicProfitEpisodes=async()=>[];
  const market={getHistory:()=>history};
  const at=new AtomicThunderBoltEngine({market,getSettings:()=>s,db:database,systemName:'SAGITTARIUS',sourceRelease:'R57'});
  const q=()=>({ticker:'T',eventTicker:'T',sport:'Tennis',yesBid:59,yesAsk:60,quoteAtMs:now});
  const fieldContext={lightningPlasmaQualified:true,currentTickerEligible:true,independentEventCount:4,minCosmos:3,minStrikes:2,fieldId:'F',expiresAtMs:Date.now()+300_000,fieldBudgetCents:20_000,maxRays:5,rayStakeCents:4_000};
  assert.equal(await at.detect(q(),{now,fieldContext}),null);
  now+=30_000;history=clean(now);assert.equal(await at.detect(q(),{now,fieldContext}),null);assert.equal(at.preExamPassed,1);
  now+=90_000;history=clean(now);const b=await at.detect(q(),{now,fieldContext});assert.ok(b);assert.equal(at.finalExamPassed,1);
  const a=new AthenaCommander({db:database,systemName:'SAGITTARIUS',sourceRelease:'R57',getSettings:()=>s});await a.init();
  const result=await a.decide(b,{crashState:crashNormal(now,{lastBidCents:59,lastAskCents:60}),cosmos:[],fieldContext});
  assert.equal(result.survivalCertificate.status,'CERTIFIED');assert.equal(result.decision,'FIRE');assert.equal(result.fireCommand.selectedAttack,'Lightning Plasma');
  const envelope=validateAthenaFireCommand(result.fireCommand,{concept:'Lightning Plasma',q:q(),settings:s,now:Date.now()});assert.equal(envelope.ok,true);assert.equal(envelope.reason,'athena_fire_valid');
});

test('R59 CI1 refreshes causal observation freshness on an unchanged live quote without advancing crash structure',()=>{
  const old=Date.now()-10_000,now=Date.now();
  const prior=crashNormal(old,{ticker:'T',eventTicker:'T',phase:'NORMAL',lastBidCents:59,lastAskCents:60,lastObservationAtMs:old,updatedAtMs:old,stableObservations:8,upwardTicks:3,lowerLowCount:2,reboundLostCount:1});
  const out=advanceCrashState(prior,{ticker:'T',eventTicker:'T',yesBid:59,yesAsk:60,status:'active'},settings(),now);
  assert.equal(out.distinct,false);assert.equal(out.transition,'OBSERVATION_REFRESHED');
  assert.equal(out.state.lastObservationAtMs,now);assert.equal(out.state.updatedAtMs,now);
  assert.equal(out.state.phase,'NORMAL');assert.equal(out.state.stableObservations,8);assert.equal(out.state.upwardTicks,3);assert.equal(out.state.lowerLowCount,2);assert.equal(out.state.reboundLostCount,1);
  const cert=examineArayashikiSurvival({bolt:bolt(now),context:{crashState:out.state,cosmos:[pegasus(now)]},selectedAttack:'Wave Surfer',now});
  assert.equal(cert.hardBlocks.includes('ci1_state_stale'),false,'fresh unchanged observation must not look causally stale to A8');
});

test('R59 ATB2 retires completed crash ancestry only at a proven CI1 episode reset boundary and never by TTL',()=>{
  const now=Date.now(),episodeId='CRASH:T:7:123';
  const signal={version:'CI1',episodeId,ticker:'T',eventTicker:'T',crashDepthCents:20,reboundCents:16,reclaimRate:.8,crashStartedAtMs:now-86_400_000,reboundConfirmedAtMs:now-86_300_000};
  const clean=atb2CleanHistory(now);
  const active=atomicThunderDangerPattern({history:clean,now,crashSignal:signal,crashState:crashNormal(now,{phase:'REBOUND_CONFIRMED',episodeId,crashDepthCents:20,reboundCents:16,reclaimRate:.8,entryReady:true,lastResetAtMs:0})});
  assert.equal(active.contaminated,true);assert.ok(active.reasons.includes('crash_rebound_ancestry'),'active ancestry stays sticky regardless of age');
  const resetState=crashNormal(now,{phase:'NORMAL',episodeId:null,lastEpisodeId:episodeId,lastResetAtMs:now-1_000,crashDepthCents:0,reboundCents:0,reclaimRate:0});
  const reset=atomicThunderDangerPattern({history:clean,now,crashSignal:signal,crashState:resetState});
  assert.equal(reset.reasons.includes('crash_rebound_ancestry'),false,'CI1 EPISODE_RESET is the causal new-regime boundary');
});

test('R59 ATB2 sticky block is released by a newer CI1 regime reset even when the broad nomination stays continuously true',async()=>{
  const now=Date.now(),episodeId='CRASH:T:9:OLD',database=db(),stages=[];
  let history=atb2CleanHistory(now);
  const market={getHistory(){return history;}};
  const at=new AtomicThunderBoltEngine({market,getSettings:()=>settings(),db:database,systemName:'SAGITTARIUS',sourceRelease:'R59',onCandidateStage:(e)=>stages.push(structuredClone(e))});
  at.patternBlockedByTicker.set('T',{id:'blocked-old-regime',ticker:'T',atMs:now-5_000,regimeResetAtMs:now-10_000,reasons:['crash_rebound_ancestry'],preBoltAgeMs:30_000});
  const crashSignal={version:'CI1',episodeId,ticker:'T',eventTicker:'T',crashDepthCents:18,reboundCents:14,reclaimRate:.78,crashStartedAtMs:now-60_000,reboundConfirmedAtMs:now-30_000};
  const resetState=crashNormal(now,{phase:'NORMAL',episodeId:null,lastEpisodeId:episodeId,lastResetAtMs:now-1_000,lastObservationAtMs:now,updatedAtMs:now});
  const q={ticker:'T',eventTicker:'T',sport:'Tennis',yesBid:59,yesAsk:60,quoteAtMs:now,status:'active'};
  const out=await at.detect(q,{cosmos:[pegasus(now)],crashSignal,crashState:resetState,now});
  assert.equal(out,null,'a released regime starts a fresh PRE-BOLT; it does not skip the 30/120 second exams');
  assert.equal(at.patternBlockedByTicker.has('T'),false);
  assert.equal(at.preBolts.has('T'),true,'the continuously nominated ticker must be allowed to begin a new-regime PRE-BOLT');
  assert.ok(stages.some(x=>x.candidateId==='blocked-old-regime'&&x.stage==='REGIME_RESET'&&x.reason==='ci1_episode_reset_new_regime'));
  assert.ok(stages.some(x=>x.stage==='UNIQUE_OPPORTUNITY'&&x.ticker==='T'));
});

test('R59 specialist Attack eligibility requires real LP/AE structural evidence and cannot be synthesized from counters',()=>{
  const now=Date.now(),q={ticker:'T',eventTicker:'T',sport:'Tennis',yesBid:59,yesAsk:60,quoteAtMs:now},history=atb2CleanHistory(now);
  const s=settings({waveSurferEnabled:false,lightningPlasmaEnabled:true,lightningPlasmaMinEntryCents:10,lightningPlasmaMaxEntryCents:89,lightningPlasmaFieldStakeCents:20_000,athenaExclamationEnabled:true,athenaExclamationMinEntryCents:10,athenaExclamationMaxEntryCents:89,athenaExclamationStakeCents:20_000});
  const synthetic=atomicThunderBoltFeatures({q,history,settings:s,fieldContext:{independentEventCount:5,goldSaintCount:5},now});
  assert.equal(synthetic.eligibleAttacks.some(x=>x.concept==='Lightning Plasma'),false);
  assert.equal(synthetic.eligibleAttacks.some(x=>x.concept==='Athena Exclamation'),false);
  const lp=atomicThunderBoltFeatures({q,history,settings:s,fieldContext:{lightningPlasmaQualified:true,currentTickerEligible:true,independentEventCount:5,minCosmos:3,minStrikes:2},now});
  assert.equal(lp.eligibleAttacks.some(x=>x.concept==='Lightning Plasma'),true);
  const ae=atomicThunderBoltFeatures({q,history,settings:s,fieldContext:{athenaExclamationCandidate:{id:'AE1',ticker:'T',eventTicker:'T',saintCount:3,expiresAtMs:now+60_000}},now});
  assert.equal(ae.eligibleAttacks.some(x=>x.concept==='Athena Exclamation'),true);
});

test('R59 certified cold start does not restore a hand-built Athena fit veto after ATB2 and A8 have cleared the candidate',async()=>{
  const now=Date.now(),database=db(),s=settings({scarletNeedleEnabled:false});
  const f=features(now,{velocity5CentsPerSec:0,velocity15CentsPerSec:0,velocity30CentsPerSec:0,velocity60CentsPerSec:0,accelerationCentsPerSec2:0,recentMove30Cents:0,momentumRiseCents:0,momentumPullbackCents:0,waveFavorableMoveCents:0,reboundCents:0,reclaimRate:0,upwardTicks:0,currentUpwardTicks:0,lowerLowCount:0,currentLowerLowCount:0,cosmoSources:[],cosmoCount:0,targetFeasibilityScore:90,eligibleAttacks:[{concept:'Wave Surfer',targetFeasible:true,targetFeasibilityScore:90,requiredTargetBidCents:65,requiredGrossMoveCents:5,estimatedEntryFeePerContractCents:2,estimatedExitFeePerContractCents:2}]});
  const b=bolt(now,{score:50,features:f,preBoltClearance:{version:'ATB2',status:'CLEARED',preBoltId:'pre-r59',finalExamPassedAtMs:now-10}});
  const a=new AthenaCommander({db:database,systemName:'SAGITTARIUS',sourceRelease:'R59',getSettings:()=>s});await a.init();
  const result=await a.decide(b,{crashState:crashNormal(now),cosmos:[]});
  assert.equal(result.survivalCertificate.status,'CERTIFIED');
  assert.equal(result.ranking[0].fitScore,50,'live fit may rank Attacks but may not become a second cold-start path veto');
  assert.equal(result.ranking[0].certifiedEconomicMature,false);
  assert.equal(result.decision,'FIRE');assert.equal(result.reason,'atb2_a8_certified_cold_start_feasible');
});

test('R59 prospective R58 stale-only choke case refreshes CI1 and reaches Athena FIRE instead of WATCH/REJECT',async()=>{
  const now=Date.now(),old=now-10_000,database=db(),s=settings({scarletNeedleEnabled:false});
  const prior=crashNormal(old,{phase:'NORMAL',lastBidCents:59,lastAskCents:60,lastObservationAtMs:old,updatedAtMs:old,stableObservations:8,lowerLowCount:0,reboundLostCount:0});
  const refreshed=advanceCrashState(prior,{ticker:'T',eventTicker:'T',yesBid:59,yesAsk:60,status:'active'},s,now).state;
  const f=features(now,{targetFeasibilityScore:64,eligibleAttacks:[{concept:'Wave Surfer',targetFeasible:true,targetFeasibilityScore:64,requiredTargetBidCents:65,requiredGrossMoveCents:5,estimatedEntryFeePerContractCents:2,estimatedExitFeePerContractCents:2}]});
  const b=bolt(now,{score:46.36,features:f,preBoltClearance:{version:ATOMIC_THUNDER_PATTERN_GUARDIAN.version,policyRevision:ATOMIC_THUNDER_PATTERN_GUARDIAN.policyRevision,status:'CLEARED',preBoltId:'r58-stale-only',finalExamPassedAtMs:now-10}});
  const a=new AthenaCommander({db:database,systemName:'SAGITTARIUS',sourceRelease:'R59',getSettings:()=>s});await a.init();
  const result=await a.decide(b,{crashState:refreshed,cosmos:[pegasus(now)]});
  assert.equal(result.survivalCertificate.hardBlocks.includes('ci1_state_stale'),false);
  assert.equal(result.survivalCertificate.status,'CERTIFIED');
  assert.equal(result.survivalConditionedEconomics.mode,'ATB2_A8_CERTIFIED_COLD_START');
  assert.equal(result.decision,'FIRE');assert.ok(result.fireCommand);
});

test('ATB2-R5 diagnostics expose the complete P1-P8 mapped family catalog without adding P10 look-ahead',()=>{
  assert.equal(ATOMIC_THUNDER_PATTERN_GUARDIAN.policyRevision,'ATB2-R5-P6-P8-UPSIDEDANGER-PATTERN-GUARD-30S-120S');
  for(const id of ['P1_FALL_REBOUND_FALL','P2_REPEATED_FALL_REBOUND_CYCLES','P3_CRASH_REBOUND_SECOND_CRASH_CONTAMINATION','P4_PERSISTENT_LOWER_LOWS_FAILED_REBOUNDS','P5_FALLING_DEAD_MARKET_CONTINUATION','P6_PEAK_ENTRY_NO_EXTENSION_CLIFF','P7_MICRO_BREAKOUT_REJECTION_CLIFF','P8_EXTENDED_HIGH_ZONE_EXHAUSTION_TERMINAL_REVERSAL'])assert.ok(ATOMIC_THUNDER_PATTERN_GUARDIAN.mappedFamilies.includes(id),id);
  assert.equal(ATOMIC_THUNDER_PATTERN_GUARDIAN.mappedFamilies.some(x=>String(x).startsWith('P10_')),false,'post-entry P10 must remain research-only until a pre-Bolt precursor is proven');
});
