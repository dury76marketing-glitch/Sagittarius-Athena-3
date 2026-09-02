import { authorityHash } from './authority.mjs';
import { ARAYASHIKI } from './doctrine.mjs';

const finite=(v,d=null)=>Number.isFinite(Number(v))?Number(v):d;
const clamp=(v,lo=0,hi=100)=>Math.max(lo,Math.min(hi,Number(v)||0));
const openLike=(s)=>['open','entry_pending','exit_pending','pending_recovery'].includes(String(s||''));

function sourceObservedAtMs(source){
  const concept=String(source?.conceptName||source?.name||'');
  if(concept==='Dragon')return finite(source?.entryConfig?.dragonSource?.signalAtMs,finite(source?.openedAtMs,0));
  if(concept==='Phoenix')return finite(source?.entryConfig?.phoenixSource?.signalAtMs,finite(source?.openedAtMs,0));
  return finite(source?.openedAtMs,0);
}
function sourceEpisodeId(source){
  if(String(source?.conceptName||'')!=='Dragon')return null;
  return String(source?.entryConfig?.dragonSource?.episodeId||source?.entryConfig?.dragonSource?.signalEpisodeId||'')||null;
}
function compactCrashState(state){
  if(!state||typeof state!=='object')return null;
  return{
    version:String(state.version||'CI1'),phase:String(state.phase||'UNKNOWN'),episodeId:state.episodeId||null,episodeIndex:finite(state.episodeIndex,finite(state.episodeCount,0)),
    crashDepthCents:finite(state.crashDepthCents,0),reboundCents:finite(state.reboundCents,0),reclaimRate:finite(state.reclaimRate,0),stableObservations:finite(state.stableObservations,0),upwardTicks:finite(state.upwardTicks,0),lowerLowCount:finite(state.lowerLowCount,0),reboundLostCount:finite(state.reboundLostCount,0),entryReady:state.entryReady===true,
    crashStartedAtMs:finite(state.crashStartedAtMs,0),troughAtMs:finite(state.troughAtMs,0),reboundConfirmedAtMs:finite(state.reboundConfirmedAtMs,0),lastResetAtMs:finite(state.lastResetAtMs,0),lastObservationAtMs:finite(state.lastObservationAtMs,finite(state.updatedAtMs,0)),updatedAtMs:finite(state.updatedAtMs,0),lastBidCents:finite(state.lastBidCents,0),lastAskCents:finite(state.lastAskCents,0),
  };
}
function currentRegimeBoundaryMs(crash){
  if(!crash)return 0;
  const activeStart=['CRASHING','REBOUND_CONFIRMED'].includes(String(crash.phase||''))?finite(crash.crashStartedAtMs,0):0;
  return Math.max(activeStart,finite(crash.lastResetAtMs,0));
}
function sourceContinuity(cosmos=[],crash=null,now=Date.now()){
  const boundary=currentRegimeBoundaryMs(crash),currentEpisode=String(crash?.episodeId||'');
  const rows=[];
  for(const source of cosmos||[]){
    if(!(openLike(source?.status)||source?.active===true))continue;
    const concept=String(source?.conceptName||source?.name||''),observedAtMs=sourceObservedAtMs(source),episodeId=sourceEpisodeId(source);
    let valid=observedAtMs>0&&observedAtMs<=now+2_000;
    let reason=valid?'current_regime':'source_time_missing_or_future';
    if(valid&&boundary>0&&observedAtMs<boundary){valid=false;reason='source_predates_current_regime';}
    if(valid&&concept==='Phoenix'){
      const expires=finite(source?.entryConfig?.phoenixSource?.expiresAtMs,0);
      if(expires>0&&now>expires){valid=false;reason='phoenix_source_expired';}
    }
    if(valid&&concept==='Dragon'&&episodeId&&currentEpisode&&['CRASHING','REBOUND_CONFIRMED'].includes(String(crash?.phase||''))&&episodeId!==currentEpisode){valid=false;reason='dragon_episode_mismatch';}
    rows.push({concept,observedAtMs,ageMs:observedAtMs>0?Math.max(0,now-observedAtMs):null,episodeId,valid,reason});
  }
  return{regimeBoundaryMs:boundary,total:rows.length,valid:rows.filter(x=>x.valid).length,invalid:rows.filter(x=>!x.valid).length,sources:rows};
}

export function sealArayashikiCertificate(core={}){
  const clean=structuredClone(core);delete clean.certificateHash;
  return Object.freeze({...clean,certificateHash:authorityHash(clean)});
}
export function verifyArayashikiCertificate(certificate={},now=Date.now()){
  if(!certificate||typeof certificate!=='object'||!certificate.certificateHash)return{ok:false,reason:'arayashiki_certificate_missing'};
  const clean=structuredClone(certificate),provided=String(clean.certificateHash);delete clean.certificateHash;
  if(authorityHash(clean)!==provided)return{ok:false,reason:'arayashiki_certificate_hash_invalid'};
  if(String(certificate.version)!==ARAYASHIKI.version||String(certificate.policyRevision)!==ARAYASHIKI.policyRevision)return{ok:false,reason:'arayashiki_certificate_version_invalid'};
  if(String(certificate.status)!=='CERTIFIED')return{ok:false,reason:'arayashiki_not_certified'};
  const examined=finite(certificate.examinedAtMs,0),expires=finite(certificate.expiresAtMs,0);
  if(!(examined>0)||examined>Number(now)+2_000)return{ok:false,reason:'arayashiki_certificate_time_invalid'};
  if(!(expires>=examined)||Number(now)>expires)return{ok:false,reason:'arayashiki_certificate_expired'};
  return{ok:true,reason:'arayashiki_certificate_valid'};
}

/**
 * Arayashiki A8 is deliberately deterministic and causal. It does not predict
 * from final outcomes and it owns no broker authority. It asks a narrower
 * question immediately before Athena FIRE: is the current market regime both
 * sufficiently observed and free of known catastrophic contradictions?
 */
export function examineArayashikiSurvival({bolt,context={},selectedAttack=null,now=Date.now()}={}){
  const f=bolt?.features||{},crash=compactCrashState(context?.crashState),cosmos=context?.cosmos||[];
  const hardBlocks=[],warnings=[],evidence=[];
  const bid=finite(f.bidCents,0),ask=finite(f.askCents,0),spread=finite(f.spreadCents,99),observedAt=finite(f.marketObservedAtMs,0);
  const marketAgeMs=observedAt>0?Math.max(0,now-observedAt):Infinity;
  const historySamples=finite(f.historySamples,0),historyWindowMs=finite(f.historyWindowMs,0);
  const v5=finite(f.velocity5CentsPerSec,0),v15=finite(f.velocity15CentsPerSec,0),v30=finite(f.velocity30CentsPerSec,0),accel=finite(f.accelerationCentsPerSec2,0);
  const recentMove=finite(f.recentMove30Cents,0),lowerLow=finite(f.currentLowerLowCount,finite(f.lowerLowCount,0)),upTicks=finite(f.currentUpwardTicks,finite(f.upwardTicks,0)),reboundLost=finite(f.reboundLostCount,0);
  const featureCrash=finite(f.crashDepthCents,0),featureRebound=finite(f.reboundCents,0),featureReclaim=finite(f.reclaimRate,0);
  const continuity=sourceContinuity(cosmos,crash,now);

  if(!bolt?.id)hardBlocks.push('bolt_missing');
  if(Number(now)>finite(bolt?.expiresAtMs,0))hardBlocks.push('bolt_expired');
  if(!(bid>0)||!(ask>0)||bid>ask)hardBlocks.push('invalid_executable_quote');
  if(marketAgeMs>ARAYASHIKI.maximumMarketAgeMs)hardBlocks.push('market_observation_stale');
  if(historySamples<ARAYASHIKI.minimumHistorySamples)hardBlocks.push('insufficient_market_history');
  if(historyWindowMs<ARAYASHIKI.minimumHistoryWindowMs)hardBlocks.push('insufficient_history_duration');
  if(spread>ARAYASHIKI.maximumSpreadCents)hardBlocks.push('spread_too_wide');
  if(!crash)hardBlocks.push('ci1_state_missing');
  else if(Math.max(0,now-finite(crash.lastObservationAtMs,0))>ARAYASHIKI.maximumCrashStateAgeMs)hardBlocks.push('ci1_state_stale');

  const phase=String(crash?.phase||'MISSING');
  if(phase==='CRASHING')hardBlocks.push('active_ci1_crash');
  if(phase==='FINAL')hardBlocks.push('final_market_state');
  // A8-R2 deliberately does not re-veto from accumulated CI1 path history.
  // Repeated lower lows / rebound losses / severe crash-reclaim topology are
  // ATB2 responsibilities. A8 keeps only the *present* rebound-state checks
  // below plus the fresh short-window directional contradictions.
  if(crash&&phase==='REBOUND_CONFIRMED'){
    if(crash.entryReady!==true)hardBlocks.push('rebound_not_entry_ready');
    if(finite(crash.reclaimRate,0)<ARAYASHIKI.minimumReboundReclaimRate)hardBlocks.push('rebound_reclaim_too_weak');
    if(finite(crash.stableObservations,0)<ARAYASHIKI.minimumReboundStableObservations)hardBlocks.push('rebound_stability_insufficient');
    if(finite(crash.upwardTicks,0)<ARAYASHIKI.minimumReboundUpTicks)hardBlocks.push('rebound_upward_confirmation_insufficient');
  }

  if(continuity.invalid>0){warnings.push('stale_cosmo_regime_evidence');evidence.push(`invalid_cosmos:${continuity.invalid}`);}
  if(continuity.total>0&&continuity.valid===0)hardBlocks.push('all_cosmo_sources_invalidated_by_regime');
  if(continuity.sources.some(x=>x.reason==='dragon_episode_mismatch'))hardBlocks.push('dragon_current_episode_mismatch');

  // Current path contradiction: do not wait for CI1's 15c crash threshold if
  // the executable market is already developing a fresh lower-low cascade.
  if(lowerLow>=3&&v15<0&&v30<=0)hardBlocks.push('fresh_directional_deterioration');
  if(recentMove<=-3&&v15<0&&accel<=0)hardBlocks.push('accelerating_negative_move');

  // Survival score intentionally rewards independent current evidence rather
  // than historical identity. It is used only after all hard contradictions
  // have been checked.
  let score=50;
  if(spread<=1){score+=10;evidence.push('tight_spread');}else if(spread<=2){score+=6;evidence.push('acceptable_spread');}
  if(historySamples>=8){score+=5;evidence.push('rich_short_history');}
  if(historyWindowMs>=15_000){score+=5;evidence.push('history_duration');}
  if(v15>0){score+=8;evidence.push('positive_v15');}else if(v15<0)score-=10;
  if(v30>0){score+=7;evidence.push('positive_v30');}else if(v30<0)score-=8;
  if(recentMove>=2){score+=7;evidence.push('positive_recent_move');}else if(recentMove<0)score-=6;
  if(upTicks>=2){score+=5;evidence.push('upward_tick_support');}
  if(lowerLow===0){score+=6;evidence.push('no_recent_lower_lows');}else score-=Math.min(12,lowerLow*4);
  if(continuity.valid>0){score+=Math.min(8,continuity.valid*3);evidence.push(`fresh_cosmos:${continuity.valid}`);}

  if(crash){
    if(phase==='NORMAL'){
      score+=8;evidence.push('ci1_normal');
      if(finite(crash.crashDepthCents,0)<ARAYASHIKI.materialCrashCents)score+=4;
    }else if(phase==='REBOUND_CONFIRMED'){
      score+=8+Math.min(8,finite(crash.reclaimRate,0)*10);evidence.push('ci1_rebound_confirmed');
    }
  }
  // The historical negative-enrichment work consistently found lower/weaker
  // geometry riskier. Do not veto solely on price; demand more proof below 50c.
  const requiredScore=ask<50?ARAYASHIKI.minimumLowBandSurvivalScore:ARAYASHIKI.minimumSurvivalScore;
  if(ask<50){
    warnings.push('low_band_requires_stronger_certificate');score-=3;
    if(!(v15>0&&v30>=0&&recentMove>=1&&upTicks>=1))hardBlocks.push('low_band_directional_proof_missing');
  }
  // Atomic-Thunder-only opportunities are permissible, but absent a fresh
  // Cosmo witness the current market path itself must carry the certificate.
  if(continuity.total===0){warnings.push('atomic_thunder_only');if(!(v15>0&&v30>=0&&lowerLow===0))score-=10;}

  score=clamp(score);
  const evidenceCoverage={quote:bid>0&&ask>0&&marketAgeMs<=ARAYASHIKI.maximumMarketAgeMs,history:historySamples>=ARAYASHIKI.minimumHistorySamples&&historyWindowMs>=ARAYASHIKI.minimumHistoryWindowMs,crashState:!!crash&&Math.max(0,now-finite(crash.lastObservationAtMs,0))<=ARAYASHIKI.maximumCrashStateAgeMs,regimeContinuity:continuity.total===0||continuity.valid>0};
  const coverageCount=Object.values(evidenceCoverage).filter(Boolean).length;
  if(coverageCount<Object.keys(evidenceCoverage).length)hardBlocks.push('survival_evidence_incomplete');
  if(!hardBlocks.length&&score<requiredScore)hardBlocks.push('survival_score_below_threshold');

  const status=hardBlocks.length?'REJECTED':'CERTIFIED';
  const core={version:ARAYASHIKI.version,policyRevision:ARAYASHIKI.policyRevision,role:ARAYASHIKI.role,status,ticker:String(bolt?.ticker||f.ticker||''),eventTicker:String(bolt?.eventTicker||f.eventTicker||bolt?.ticker||''),boltId:String(bolt?.id||''),boltFingerprint:bolt?.fingerprint||null,selectedAttack:selectedAttack?String(selectedAttack):null,examinedAtMs:now,expiresAtMs:now+ARAYASHIKI.certificateTtlMs,survivalScore:Number(score.toFixed(2)),requiredSurvivalScore:requiredScore,evidenceCoverage,hardBlocks:[...new Set(hardBlocks)],warnings:[...new Set(warnings)],evidence:[...new Set(evidence)],regime:{id:`${String(bolt?.ticker||f.ticker||'')}:${String(crash?.episodeId||'NORMAL')}:${continuity.regimeBoundaryMs||0}`,boundaryAtMs:continuity.regimeBoundaryMs,sourceContinuity:continuity},market:{bidCents:bid,askCents:ask,spreadCents:spread,observedAtMs:observedAt,ageMs:Number.isFinite(marketAgeMs)?marketAgeMs:null,historySamples,historyWindowMs,velocity5CentsPerSec:v5,velocity15CentsPerSec:v15,velocity30CentsPerSec:v30,accelerationCentsPerSec2:accel,recentMove30Cents:recentMove,lowerLowCount:lowerLow,upwardTicks:upTicks,reboundLostCount:reboundLost,crashDepthCents:featureCrash,reboundCents:featureRebound,reclaimRate:featureReclaim},crashState:crash};
  return sealArayashikiCertificate(core);
}
