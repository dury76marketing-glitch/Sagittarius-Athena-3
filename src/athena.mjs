import { createHash } from 'node:crypto';
import { classifyDeterministic, profitEpisodeMetrics, profitLearningProfileKeys } from './learning.mjs';

export const ATHENA_BRAIN = Object.freeze({
  version:'ATHENA-B1',
  schemaVersion:1,
  role:'shared_historical_entry_intelligence',
  placement:'structurally_valid_hunter_candidate_before_capital_authorization',
  adaptiveMode:'shadow_only',
  adaptiveDecisionWeight:0,
  insufficientEvidencePolicy:'neutral_pass',
  blockPolicy:'high_confidence_strong_negative_only',
  blockScoreBelow:40,
  blockMinimumObservations:20,
  neutralPriorWeight:0.35,
  maxSerializedBytes:1_500_000,
  maxProfiles:12_000,
  crashDepthThresholds:Object.freeze([15,20,25,30,35,40,45,50,55,60,65,70]),
});

const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const clamp01=(v)=>Math.max(0,Math.min(1,num(v,.5)));
const average=(xs)=>xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:0;
const stable=(v)=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
const canonical=(v)=>JSON.stringify(stable(v));
const sha=(v)=>createHash('sha256').update(canonical(v)).digest('hex');
const validationCache=new WeakMap();
function deepFreeze(v){
  if(!v||typeof v!=='object'||Object.isFrozen(v))return v;
  for(const child of Object.values(v))deepFreeze(child);
  return Object.freeze(v);
}
function maximumTimestamp(...groups){
  let max=0;
  for(const group of groups)for(const row of group||[])max=Math.max(max,num(row?.updatedAtMs??row?.updated_at_ms));
  return max;
}

export const athenaEntryBand=(v)=>{const x=num(v);if(x>=90)return'90+';if(x>=85)return'85-89';if(x>=80)return'80-84';if(x>=70)return'70-79';if(x>=50)return'50-69';return'<50';};
export const athenaCrashBucket=(v)=>{const x=num(v);if(x<15)return'<15';if(x<25)return'15-24';if(x<40)return'25-39';if(x<55)return'40-54';return'55+';};
export const athenaEpisodeBucket=(v)=>num(v,1)<=1?'1':num(v,1)===2?'2':'3+';
export const athenaGameBucket=(v)=>{const x=Math.max(0,num(v));if(x<30)return'0-29';if(x<60)return'30-59';if(x<90)return'60-89';return'90+';};
export const athenaDropBucket=(v)=>{const x=Math.max(0,num(v));if(x<5)return'<5';if(x<=10)return'5-10';if(x<=15)return'11-15';if(x<=25)return'16-25';if(x<=40)return'26-40';return'41+';};

function wilson(successes,total,z=1.96){
  const n=Math.max(0,num(total)),s=Math.max(0,Math.min(n,num(successes)));
  if(!n)return{low:0,high:1};
  const p=s/n,z2=z*z,den=1+z2/n,center=(p+z2/(2*n))/den;
  const margin=z*Math.sqrt((p*(1-p)+z2/(4*n))/n)/den;
  return{low:Math.max(0,center-margin),high:Math.min(1,center+margin)};
}
function evidenceStats(successes,total){
  const n=Math.max(0,num(total)),s=Math.max(0,Math.min(n,num(successes))),w=wilson(s,n);
  return{totalObservations:n,successes:s,smoothedRate:(s+2)/(n+4),wilsonLow:w.low,wilsonHigh:w.high};
}
function addBinary(map,key,identity,success,updatedAtMs=0){
  if(!key||!identity)return;
  let bucket=map.get(key);if(!bucket){bucket=new Map();map.set(key,bucket);}
  const prior=bucket.get(identity);
  if(!prior||num(updatedAtMs)>=num(prior.updatedAtMs))bucket.set(identity,{success:Boolean(success),updatedAtMs:num(updatedAtMs)});
}
function finishBinary(map,minimum=1){
  const out={};
  for(const key of [...map.keys()].sort()){
    const rows=[...map.get(key).values()];
    if(rows.length<minimum)continue;
    const successes=rows.filter(x=>x.success).length;
    out[key]=evidenceStats(successes,rows.length);
  }
  return out;
}
function sourceKind(v){const s=String(v||'');return s==='Golden Dragon'?'Golden Dragon':s==='Dragon'?'Dragon':null;}
function safeSport(v,ticker='',title=''){
  const supplied=String(v||'').trim();
  if(supplied&&supplied!=='Unknown')return supplied;
  return String(classifyDeterministic(ticker||'',title||'').sportName||'Unknown');
}
function frozenSignalFromRow(row={}){
  const cfg=row.entry_config&&typeof row.entry_config==='object'?row.entry_config:{};
  const source=sourceKind(row.concept_name);
  if(!source)return null;
  const snap=(source==='Golden Dragon'?cfg.goldenDragonSource:cfg.dragonSource)||{};
  const episodeId=String(snap.episodeId||row.source_trade_id||'');
  if(!episodeId)return null;
  return{
    source, episodeId, ticker:String(row.ticker||''), title:String(row.market_title||''),
    sport:safeSport(snap.sport,row.ticker,row.market_title),
    crashDepthCents:num(snap.crashDepthCents), episodeIndex:num(snap.episodeIndex,1),
    signalPriceCents:num(snap.signalPriceCents||snap.validatedAskCents),
    reboundCents:num(snap.reboundCents), reclaimRate:num(snap.reclaimRate),
    lowerLowCount:num(snap.lowerLowCount), reboundLostCount:num(snap.reboundLostCount),
    finalResult:String(row.final_result||'').toLowerCase(), updatedAtMs:num(row.opened_at_ms||row.updated_at_ms),
  };
}
function signalKeys(s){
  const source=sourceKind(s.source),sport=String(s.sport||'Unknown'),depth=athenaCrashBucket(s.crashDepthCents),episode=athenaEpisodeBucket(s.episodeIndex),price=athenaEntryBand(s.signalPriceCents);
  return{
    exact:s.source&&s.crashDepthCents>0&&s.signalPriceCents>0?`${source}|${sport}|${depth}|${episode}|${price}`:null,
    sourceSportDepthEpisode:s.source&&s.crashDepthCents>0?`${source}|${sport}|${depth}|${episode}`:null,
    sourceSportDepth:s.source&&s.crashDepthCents>0?`${source}|${sport}|${depth}`:null,
    sourceDepth:s.source&&s.crashDepthCents>0?`${source}|${depth}`:null,
    source:source||null,
    global:'global',
  };
}
function addSignal(map,key,identity,row){
  if(!key||!identity)return;
  let bucket=map.get(key);if(!bucket){bucket=new Map();map.set(key,bucket);}
  const prior=bucket.get(identity);
  if(!prior||num(row.updatedAtMs)>=num(prior.updatedAtMs))bucket.set(identity,row);
}
function finishSignals(map,minimum=1){
  const out={};
  for(const key of [...map.keys()].sort()){
    const rows=[...map.get(key).values()];if(rows.length<minimum)continue;
    const successes=rows.filter(x=>x.finalResult==='yes').length;
    out[key]={...evidenceStats(successes,rows.length),avgReboundCents:average(rows.map(x=>num(x.reboundCents))),avgReclaimRate:average(rows.map(x=>num(x.reclaimRate))),avgLowerLowCount:average(rows.map(x=>num(x.lowerLowCount))),avgReboundLostCount:average(rows.map(x=>num(x.reboundLostCount)))};
  }
  return out;
}
function recoveryDomain(row={}){return String(row.concept_name||'')==='MarketObserver'?'market_drop':'stop_recovery';}
function recoveryKeys(row){
  const domain=recoveryDomain(row),sport=String(row.sport||'Unknown'),entry=athenaEntryBand(row.entry_price_cents),drop=athenaDropBucket(row.drop_cents),game=athenaGameBucket(row.game_minutes_at_entry);
  return{
    exact:`${domain}|${sport}|${entry}|${drop}|${game}`,
    domainSportDropGame:`${domain}|${sport}|${drop}|${game}`,
    domainSportDrop:`${domain}|${sport}|${drop}`,
    domainDrop:`${domain}|${drop}`,
    domain,
    global:'global',
  };
}
function continuationAggregate(rows=[]){
  const total=rows.length,pull=rows.reduce((s,x)=>s+num(x.metrics.oneTickPullbacks),0),recover=rows.reduce((s,x)=>s+num(x.metrics.oneTickRecoveries),0),collapse=rows.reduce((s,x)=>s+num(x.metrics.collapse),0);
  const continuation=(recover+2)/(pull+4),collapseRate=(collapse+1)/(total+2);
  return{totalObservations:total,oneTickPullbacks:pull,oneTickRecoveries:recover,collapseCount:collapse,continuationRate:continuation,collapseRate,qualityRate:clamp01(.7*continuation+.3*(1-collapseRate)),avgPeakCaptureRate:average(rows.map(x=>x.metrics.peakCaptureRate).filter(Number.isFinite)),avgPostExitRegretRate:average(rows.map(x=>x.metrics.postExitRegretRate).filter(Number.isFinite))};
}
function compileCrashDepthProfiles(rows=[]){
  const byTicker=new Map();
  for(const r of rows){
    const result=String(r.final_result||'').toLowerCase();if(!['yes','no'].includes(result))continue;
    const ticker=String(r.ticker||'');if(!ticker)continue;
    const prior=byTicker.get(ticker)||{ticker,maxDepth:0,sport:'Unknown',success:result==='yes',updatedAtMs:0};
    prior.maxDepth=Math.max(prior.maxDepth,num(r.crash_depth_cents));
    if(prior.sport==='Unknown'&&String(r.sport||'')&&String(r.sport)!=='Unknown')prior.sport=String(r.sport);
    if(num(r.updated_at_ms)>=prior.updatedAtMs){prior.success=result==='yes';prior.updatedAtMs=num(r.updated_at_ms);}
    byTicker.set(ticker,prior);
  }
  const sportMap=new Map(),globalMap=new Map();
  for(const row of byTicker.values())for(const threshold of ATHENA_BRAIN.crashDepthThresholds){
    if(row.maxDepth<threshold)continue;
    addBinary(globalMap,String(threshold),row.ticker,row.success,row.updatedAtMs);
    if(row.sport&&row.sport!=='Unknown')addBinary(sportMap,`${row.sport}|${threshold}`,row.ticker,row.success,row.updatedAtMs);
  }
  return{sport:finishBinary(sportMap,8),global:finishBinary(globalMap,12),uniqueTickers:byTicker.size};
}
function profileCount(brain){
  const groups=[brain?.profiles?.crashDepth?.sport,brain?.profiles?.crashDepth?.global,brain?.profiles?.signalSurvival?.exact,brain?.profiles?.signalSurvival?.sourceSportDepthEpisode,brain?.profiles?.signalSurvival?.sourceSportDepth,brain?.profiles?.signalSurvival?.sourceDepth,brain?.profiles?.signalSurvival?.source,brain?.profiles?.signalSurvival?.global,brain?.profiles?.recovery?.exact,brain?.profiles?.recovery?.domainSportDropGame,brain?.profiles?.recovery?.domainSportDrop,brain?.profiles?.recovery?.domainDrop,brain?.profiles?.recovery?.domain,brain?.profiles?.recovery?.global,brain?.profiles?.hunterOutcome,brain?.profiles?.continuation,brain?.profiles?.sports];
  return groups.reduce((s,g)=>s+Object.keys(g||{}).length,0);
}

function validateAthenaBrainRaw(brain){
  if(!brain||typeof brain!=='object')return{ok:false,reason:'brain_missing'};
  if(brain.version!==ATHENA_BRAIN.version||num(brain.schemaVersion)!==ATHENA_BRAIN.schemaVersion)return{ok:false,reason:'brain_version_mismatch'};
  if(String(brain?.policy?.adaptiveMode||'')!==ATHENA_BRAIN.adaptiveMode||num(brain?.policy?.adaptiveDecisionWeight)!==0)return{ok:false,reason:'brain_adaptive_policy_invalid'};
  if(String(brain?.policy?.insufficientEvidencePolicy||'')!==ATHENA_BRAIN.insufficientEvidencePolicy
      ||String(brain?.policy?.blockPolicy||'')!==ATHENA_BRAIN.blockPolicy
      ||num(brain?.policy?.blockScoreBelow)!==ATHENA_BRAIN.blockScoreBelow
      ||num(brain?.policy?.blockMinimumObservations)!==ATHENA_BRAIN.blockMinimumObservations
      ||num(brain?.policy?.neutralPriorWeight)!==ATHENA_BRAIN.neutralPriorWeight)return{ok:false,reason:'brain_policy_mismatch'};
  if(brain?.provenance?.noLookahead!==true||brain?.provenance?.realizedPnlExcluded!==true||brain?.provenance?.rawHistoryDecisionPath!==false)return{ok:false,reason:'brain_provenance_invalid'};
  const copy=structuredClone(brain),provided=String(copy.brainHash||'');delete copy.brainHash;
  const expected=sha(copy);if(!provided||provided!==expected)return{ok:false,reason:'brain_hash_invalid',expected,provided};
  const bytes=Buffer.byteLength(canonical(brain));const profiles=profileCount(brain);
  if(bytes>ATHENA_BRAIN.maxSerializedBytes)return{ok:false,reason:'brain_size_limit',bytes,limit:ATHENA_BRAIN.maxSerializedBytes};
  if(profiles>ATHENA_BRAIN.maxProfiles)return{ok:false,reason:'brain_profile_limit',profiles,limit:ATHENA_BRAIN.maxProfiles};
  return{ok:true,reason:'valid',bytes,profiles,brainHash:provided};
}
function trustedAthenaBrain(brain){
  if(!brain||typeof brain!=='object')return{ok:false,reason:'brain_missing'};
  const cached=validationCache.get(brain);if(cached)return cached;
  const check=validateAthenaBrainRaw(brain);
  // Only cache immutable valid brains. Runtime load/compile/import paths freeze
  // them once, making repeated candidate assessment O(1) for validation rather
  // than re-hashing the complete brain on every market candidate.
  if(check.ok&&Object.isFrozen(brain))validationCache.set(brain,check);
  return check;
}
function trustAndFreezeBrain(brain){
  const check=validateAthenaBrainRaw(brain);if(!check.ok)return check;
  deepFreeze(brain);validationCache.set(brain,check);return check;
}
export function validateAthenaBrain(brain){return trustedAthenaBrain(brain);}


export function compileAthenaBrain({systemName='SAGITTARIUS',sourceRelease='',crashEpisodes=[],crashSignals=[],recoveryObservations=[],profitEpisodes=[],sportProfiles=[]}={}){
  const finalizedCrashes=(crashEpisodes||[]).filter(r=>['yes','no'].includes(String(r.final_result||'').toLowerCase()));
  const crashDepth=compileCrashDepthProfiles(finalizedCrashes);

  const signalRows=(crashSignals||[]).map(frozenSignalFromRow).filter(x=>x&&['yes','no'].includes(x.finalResult));
  const signalMaps={exact:new Map(),sourceSportDepthEpisode:new Map(),sourceSportDepth:new Map(),sourceDepth:new Map(),source:new Map(),global:new Map()};
  for(const r of signalRows){const k=signalKeys(r),identity=`${r.source}|${r.episodeId}`;for(const family of Object.keys(signalMaps))addSignal(signalMaps[family],k[family],identity,r);}

  const recoveryRows=(recoveryObservations||[]).filter(r=>r.tracking_complete===true||String(r.tracking_complete)==='true');
  const recoveryMaps={exact:new Map(),domainSportDropGame:new Map(),domainSportDrop:new Map(),domainDrop:new Map(),domain:new Map(),global:new Map()};
  for(const r of recoveryRows){
    const k=recoveryKeys(r);
    // An exact recovery observation is a distinct, pre-existing research episode.
    // original_entry_id prevents repeated scans of one episode from overcounting,
    // while still preserving later independent stop/drop episodes on the same ticker.
    const id=String(r.original_entry_id||r.id||r.ticker||'');
    for(const family of Object.keys(recoveryMaps))addBinary(recoveryMaps[family],k[family],id,Boolean(r.recovered),r.updated_at_ms);
  }

  const hunterOutcomeMaps=new Map(),continuationMaps=new Map();
  for(const r of (profitEpisodes||[])){
    if(!(r.tracking_complete===true||String(r.tracking_complete)==='true'))continue;
    const state=r?.state&&typeof r.state==='object'?r.state:{};
    const metrics=profitEpisodeMetrics(state),identity=String(r.ticker||r.id||'');
    const finalResult=String(state.finalResult||'').toLowerCase();
    for(const key of profitLearningProfileKeys({conceptName:r.concept_name,sourceFeeder:r.source_feeder,sport:r.sport,entryPriceCents:r.entry_price_cents})){
      let byTicker=continuationMaps.get(key.profileKey);if(!byTicker){byTicker=new Map();continuationMaps.set(key.profileKey,byTicker);}
      const prior=byTicker.get(identity);if(!prior||num(r.updated_at_ms)>=num(prior.updatedAtMs))byTicker.set(identity,{metrics,updatedAtMs:num(r.updated_at_ms),specificity:key.specificity});
      // Final YES/NO is a doctrine-independent directional label. It is kept
      // separate from realized P/L so exit-policy changes cannot rewrite entry intelligence.
      if(['yes','no'].includes(finalResult)){
        let outcomeMap=hunterOutcomeMaps.get(key.profileKey);if(!outcomeMap){outcomeMap=new Map();hunterOutcomeMaps.set(key.profileKey,outcomeMap);}
        const op=outcomeMap.get(identity);if(!op||num(r.updated_at_ms)>=num(op.updatedAtMs))outcomeMap.set(identity,{success:finalResult==='yes',updatedAtMs:num(r.updated_at_ms),specificity:key.specificity});
      }
    }
  }
  const hunterOutcome={},continuation={};
  for(const key of [...hunterOutcomeMaps.keys()].sort()){
    const rows=[...hunterOutcomeMaps.get(key).values()];
    if(rows.length<12)continue;
    const successes=rows.filter(x=>x.success).length;
    hunterOutcome[key]={...evidenceStats(successes,rows.length),specificity:rows[0]?.specificity||'global'};
  }
  for(const key of [...continuationMaps.keys()].sort()){
    const rows=[...continuationMaps.get(key).values()],a=continuationAggregate(rows);
    if(a.totalObservations<12||a.oneTickPullbacks<6)continue;
    continuation[key]={...a,specificity:rows[0]?.specificity||'global'};
  }

  const sports={};
  for(const r of [...(sportProfiles||[])].sort((a,b)=>String(a.ticker_prefix||'').localeCompare(String(b.ticker_prefix||''))))sports[String(r.ticker_prefix||'UNKNOWN')]={sport:String(r.detected_sport_name||'Unknown'),typicalDurationMs:num(r.typical_duration_ms),observationCount:num(r.observation_count),confidence:String(r.confidence_level||'low'),source:String(r.source||'unknown')};
  const cutoff=maximumTimestamp(finalizedCrashes,signalRows,recoveryRows,profitEpisodes,sportProfiles);
  const core={
    schemaVersion:ATHENA_BRAIN.schemaVersion,version:ATHENA_BRAIN.version,sourceSystemName:String(systemName),sourceRelease:String(sourceRelease),trainingCutoffMs:cutoff,
    policy:{adaptiveMode:ATHENA_BRAIN.adaptiveMode,adaptiveDecisionWeight:0,insufficientEvidencePolicy:ATHENA_BRAIN.insufficientEvidencePolicy,blockPolicy:ATHENA_BRAIN.blockPolicy,blockScoreBelow:ATHENA_BRAIN.blockScoreBelow,blockMinimumObservations:ATHENA_BRAIN.blockMinimumObservations,neutralPriorWeight:ATHENA_BRAIN.neutralPriorWeight},
    provenance:{noLookahead:true,crashDepth:'finalized episodes used only as threshold-reached survival curves; future crash magnitude is never a candidate feature',signalSurvival:'only frozen Dragon/Golden signal snapshots stored at signal creation are used for multidimensional crash profiles',recovery:'only pre-outcome sport/entry/drop/game dimensions are used; eventual trough/rebound are excluded from keys',hunterOutcome:'final YES/NO is used only as the label for frozen concept/source/sport/entry-band cohorts',continuation:'concept/source/sport/entry-band keys only; post-entry outcome metrics are labels, not candidate features',realizedPnlExcluded:true,rawHistoryDecisionPath:false},
    sources:{crashEpisodes:finalizedCrashes.length,uniqueCrashTickers:crashDepth.uniqueTickers,frozenCrashSignals:signalRows.length,uniqueCrashSignalEpisodes:new Set(signalRows.map(r=>`${r.source}|${r.episodeId}`)).size,recoveryObservations:recoveryRows.length,uniqueRecoveryTickers:new Set(recoveryRows.map(r=>String(r.ticker||'')).filter(Boolean)).size,profitEpisodes:(profitEpisodes||[]).filter(r=>r.tracking_complete===true||String(r.tracking_complete)==='true').length,sportProfiles:(sportProfiles||[]).length},
    profiles:{
      crashDepth:{sport:crashDepth.sport,global:crashDepth.global},
      signalSurvival:{exact:finishSignals(signalMaps.exact,12),sourceSportDepthEpisode:finishSignals(signalMaps.sourceSportDepthEpisode,10),sourceSportDepth:finishSignals(signalMaps.sourceSportDepth,8),sourceDepth:finishSignals(signalMaps.sourceDepth,12),source:finishSignals(signalMaps.source,20),global:finishSignals(signalMaps.global,20)},
      recovery:{exact:finishBinary(recoveryMaps.exact,8),domainSportDropGame:finishBinary(recoveryMaps.domainSportDropGame,8),domainSportDrop:finishBinary(recoveryMaps.domainSportDrop,8),domainDrop:finishBinary(recoveryMaps.domainDrop,12),domain:finishBinary(recoveryMaps.domain,20),global:finishBinary(recoveryMaps.global,20)},
      hunterOutcome,continuation,sports,
    },
  };
  const brain={...core,brainHash:sha(core)};
  const validation=trustAndFreezeBrain(brain);if(!validation.ok)throw new Error(`Athena B1 compile rejected: ${validation.reason}`);
  return brain;
}

const specificityWeight={exact:1,sourceSportDepthEpisode:.92,domainSportDropGame:.92,sourceSportDepth:.84,domainSportDrop:.84,concept_sport_band:.9,concept_band:.8,concept:.72,sourceDepth:.72,domainDrop:.72,source:.62,domain:.62,sportDepth:.78,depth:.68,global:.5};
function chooseProfile(family,keys,minimums){
  for(const [name,key] of keys){const p=family?.[name]?.[key];if(!p)continue;const min=minimums?.[name]??8;if(num(p.totalObservations)>=min)return{...p,specificity:name,profileKey:key};}
  return null;
}
function weightFor(e){const n=num(e?.totalObservations),sample=Math.min(1,Math.sqrt(Math.max(0,n)/30));return(Math.max(.25,specificityWeight[e?.specificity]??.6))*sample;}
function crashDepthThreshold(v){const depth=num(v);let chosen=0;for(const t of ATHENA_BRAIN.crashDepthThresholds)if(depth>=t)chosen=t;return chosen;}

export function assessAthenaBrain(brain,candidate={}){
  const valid=validateAthenaBrain(brain);
  if(!valid.ok)return{version:ATHENA_BRAIN.version,brainHash:null,ready:false,allow:true,blocked:false,score:50,classification:'NEUTRAL',confidence:'LOW',reason:`brain_unavailable:${valid.reason}`,evidence:[]};
  const sport=safeSport(candidate.sport,candidate.ticker,candidate.title),entry=athenaEntryBand(candidate.entryPriceCents),depth=athenaCrashBucket(candidate.crashDepthCents),episode=athenaEpisodeBucket(candidate.episodeIndex),drop=athenaDropBucket(candidate.dropCents),game=athenaGameBucket(candidate.gameMinutes);
  const evidence=[];

  const threshold=crashDepthThreshold(candidate.crashDepthCents);
  if(threshold>0){
    const p=brain.profiles?.crashDepth?.sport?.[`${sport}|${threshold}`]||brain.profiles?.crashDepth?.global?.[String(threshold)]||null;
    if(p)evidence.push({kind:'crash_depth_survival',probability:clamp01(p.smoothedRate),...p,specificity:brain.profiles?.crashDepth?.sport?.[`${sport}|${threshold}`]?'sportDepth':'global',profileKey:brain.profiles?.crashDepth?.sport?.[`${sport}|${threshold}`]?`${sport}|${threshold}`:String(threshold),thresholdCents:threshold});
  }

  const source=sourceKind(candidate.sourceFeeder);
  const crashSignalPrice=num(candidate.crashSignalPriceCents||candidate.entryPriceCents);
  if(source&&num(candidate.crashDepthCents)>0){
    const price=athenaEntryBand(crashSignalPrice);
    const e=chooseProfile(brain.profiles?.signalSurvival,[['exact',`${source}|${sport}|${depth}|${episode}|${price}`],['sourceSportDepthEpisode',`${source}|${sport}|${depth}|${episode}`],['sourceSportDepth',`${source}|${sport}|${depth}`],['sourceDepth',`${source}|${depth}`],['source',source],['global','global']],{exact:12,sourceSportDepthEpisode:10,sourceSportDepth:8,sourceDepth:12,source:20,global:20});
    if(e)evidence.push({kind:'signal_survival',probability:clamp01(e.smoothedRate),source,...e});
  }

  const domain=String(candidate.recoveryDomain||'');
  if((domain==='market_drop'||domain==='stop_recovery')&&num(candidate.dropCents)>0){
    const e=chooseProfile(brain.profiles?.recovery,[['exact',`${domain}|${sport}|${entry}|${drop}|${game}`],['domainSportDropGame',`${domain}|${sport}|${drop}|${game}`],['domainSportDrop',`${domain}|${sport}|${drop}`],['domainDrop',`${domain}|${drop}`],['domain',domain],['global','global']],{exact:8,domainSportDropGame:8,domainSportDrop:8,domainDrop:12,domain:20,global:20});
    if(e)evidence.push({kind:'recovery',probability:clamp01(e.smoothedRate),domain,...e});
  }

  const keys=profitLearningProfileKeys({conceptName:candidate.conceptName,sourceFeeder:candidate.sourceFeeder,sport,entryPriceCents:candidate.entryPriceCents});
  for(const k of keys){const p=brain.profiles?.hunterOutcome?.[k.profileKey];if(!p)continue;evidence.push({kind:'hunter_final_survival',probability:clamp01(p.smoothedRate),specificity:k.specificity,profileKey:k.profileKey,...p});break;}
  for(const k of keys){const p=brain.profiles?.continuation?.[k.profileKey];if(!p)continue;evidence.push({kind:'continuation',probability:clamp01(p.qualityRate),specificity:k.specificity,profileKey:k.profileKey,totalObservations:num(p.totalObservations),continuationRate:num(p.continuationRate),collapseRate:num(p.collapseRate),oneTickPullbacks:num(p.oneTickPullbacks)});break;}

  let weighted=.5*ATHENA_BRAIN.neutralPriorWeight,totalWeight=ATHENA_BRAIN.neutralPriorWeight;
  for(const e of evidence){const w=weightFor(e);weighted+=clamp01(e.probability)*w;totalWeight+=w;e.weight=w;}
  const probability=weighted/totalWeight,score=Math.round(probability*100);
  const mature=evidence.filter(e=>num(e.totalObservations)>=8),highMaturity=evidence.filter(e=>num(e.totalObservations)>=20);
  const evidenceWeight=evidence.reduce((s,e)=>s+num(e.weight),0);
  const statisticallyDirectional=evidence.some(e=>num(e.totalObservations)>=ATHENA_BRAIN.blockMinimumObservations&&Number.isFinite(Number(e.wilsonLow))&&Number.isFinite(Number(e.wilsonHigh))&&(num(e.wilsonHigh,1)<.5||num(e.wilsonLow,0)>.5));
  const confidence=statisticallyDirectional||(mature.length>=2&&evidenceWeight>=1.1)||(highMaturity.length>=1&&evidenceWeight>=.6)?'HIGH':mature.length>=1?'MEDIUM':'LOW';
  const strongNegative=evidence.some(e=>num(e.totalObservations)>=ATHENA_BRAIN.blockMinimumObservations&&Number.isFinite(Number(e.wilsonHigh))&&num(e.wilsonHigh,1)<.5)||evidence.some(e=>e.kind==='continuation'&&num(e.oneTickPullbacks)>=12&&num(e.continuationRate,.5)<.35&&num(e.collapseRate,0)>.55);
  const classification=score>=70?'FAVORABLE':score>=60?'SUPPORTIVE':score>=48?'NEUTRAL':score>=ATHENA_BRAIN.blockScoreBelow?'CAUTION':'STRONG_NEGATIVE';
  const blocked=classification==='STRONG_NEGATIVE'&&confidence==='HIGH'&&strongNegative;
  return{version:brain.version,brainHash:brain.brainHash,ready:true,allow:!blocked,blocked,score,probability,classification,confidence,reason:blocked?'high_confidence_strong_negative':'assessment',sport,dimensions:{entryBand:entry,crashBucket:depth,crashDepthThresholdCents:threshold,episodeBucket:episode,crashSignalPriceBand:athenaEntryBand(crashSignalPrice),dropBucket:drop,gameBucket:game,recoveryDomain:domain||null},evidence:evidence.map(({weight,...e})=>({...e,weight:Number(weight.toFixed(4))})),adaptiveMode:ATHENA_BRAIN.adaptiveMode,adaptiveDecisionWeight:0,assessedAtMs:Date.now()};
}

export class Athena {
  constructor({db,systemName,sourceRelease,audit=async()=>{}}={}){this.db=db;this.systemName=systemName||'SAGITTARIUS';this.sourceRelease=sourceRelease||'';this.audit=audit;this.brain=null;this.loadedFrom='none';this.loadError=null;this.assessments=0;this.blocks=0;this.lastAssessment=null;}
  async init(){
    try{
      const stored=typeof this.db?.athenaBrain==='function'?await this.db.athenaBrain(this.systemName,ATHENA_BRAIN.version).catch(()=>null):null;
      if(stored?.brain){const candidate=structuredClone(stored.brain);if(!candidate.brainHash&&stored.brain_hash)candidate.brainHash=stored.brain_hash;const check=trustAndFreezeBrain(candidate);if(check.ok){this.brain=candidate;this.loadedFrom='persisted';this.loadError=null;return this.brain;}}
      const [crashEpisodes,crashSignals,recoveryObservations,profitEpisodes,sportProfiles]=await Promise.all([
        typeof this.db?.athenaCrashEpisodes==='function'?this.db.athenaCrashEpisodes(this.systemName):[],
        typeof this.db?.athenaCrashSignals==='function'?this.db.athenaCrashSignals(this.systemName):[],
        typeof this.db?.athenaRecoveryObservations==='function'?this.db.athenaRecoveryObservations(this.systemName):[],
        typeof this.db?.athenaProfitEpisodes==='function'?this.db.athenaProfitEpisodes(this.systemName):[],
        typeof this.db?.sportProfiles==='function'?this.db.sportProfiles():[],
      ]);
      this.brain=compileAthenaBrain({systemName:this.systemName,sourceRelease:this.sourceRelease,crashEpisodes,crashSignals,recoveryObservations,profitEpisodes,sportProfiles});
      this.loadedFrom='compiled_once';this.loadError=null;
      if(typeof this.db?.saveAthenaBrain==='function')await this.db.saveAthenaBrain({systemName:this.systemName,version:ATHENA_BRAIN.version,brainHash:this.brain.brainHash,sourceRelease:this.sourceRelease,trainingCutoffMs:this.brain.trainingCutoffMs,brain:this.brain,stats:this.brain.sources,active:true});
      await this.audit('athena_b1_initialized',{brainHash:this.brain.brainHash,loadedFrom:this.loadedFrom,trainingCutoffMs:this.brain.trainingCutoffMs,sources:this.brain.sources,validation:validateAthenaBrain(this.brain)}).catch(()=>{});
      return this.brain;
    }catch(e){
      this.brain=null;this.loadedFrom='error';this.loadError=String(e?.message||e);
      await this.audit('athena_b1_initialization_failed',{error:this.loadError,policy:'neutral_pass_existing_hunter_behavior_preserved'}).catch(()=>{});
      return null;
    }
  }
  async installBrain(raw){
    const candidate=structuredClone(raw?.brain&&raw?.version==null?raw.brain:raw);
    const check=trustAndFreezeBrain(candidate);if(!check.ok)throw new Error(`Athena brain rejected: ${check.reason}`);
    this.brain=candidate;this.loadedFrom='imported';this.loadError=null;
    if(typeof this.db?.saveAthenaBrain==='function')await this.db.saveAthenaBrain({systemName:this.systemName,version:ATHENA_BRAIN.version,brainHash:this.brain.brainHash,sourceRelease:String(this.brain.sourceRelease||this.sourceRelease||''),trainingCutoffMs:this.brain.trainingCutoffMs,brain:this.brain,stats:this.brain.sources,active:true});
    await this.audit('athena_b1_imported',{brainHash:this.brain.brainHash,sourceSystemName:this.brain.sourceSystemName,trainingCutoffMs:this.brain.trainingCutoffMs,validation:check}).catch(()=>{});
    return this.summary();
  }
  // R35/ABR1: B1 remains frozen during normal runtime. A rebuild is an
  // explicit operator action behind the same stopped-SIM/no-exposure boundary
  // as portable import. This lets a thin first-boot B1 be deliberately replaced
  // after the authoritative historical tables have accumulated richer evidence
  // without introducing silent online retraining or look-ahead drift.
  async rebuildFromDatabase(){
    const [crashEpisodes,crashSignals,recoveryObservations,profitEpisodes,sportProfiles]=await Promise.all([
      typeof this.db?.athenaCrashEpisodes==='function'?this.db.athenaCrashEpisodes(this.systemName):[],
      typeof this.db?.athenaCrashSignals==='function'?this.db.athenaCrashSignals(this.systemName):[],
      typeof this.db?.athenaRecoveryObservations==='function'?this.db.athenaRecoveryObservations(this.systemName):[],
      typeof this.db?.athenaProfitEpisodes==='function'?this.db.athenaProfitEpisodes(this.systemName):[],
      typeof this.db?.sportProfiles==='function'?this.db.sportProfiles():[],
    ]);
    const candidate=compileAthenaBrain({systemName:this.systemName,sourceRelease:this.sourceRelease,crashEpisodes,crashSignals,recoveryObservations,profitEpisodes,sportProfiles});
    const check=trustAndFreezeBrain(candidate);if(!check.ok)throw new Error(`Athena B1 rebuild rejected: ${check.reason}`);
    this.brain=candidate;this.loadedFrom='rebuilt_explicit';this.loadError=null;this.assessments=0;this.blocks=0;this.lastAssessment=null;
    if(typeof this.db?.saveAthenaBrain==='function')await this.db.saveAthenaBrain({systemName:this.systemName,version:ATHENA_BRAIN.version,brainHash:this.brain.brainHash,sourceRelease:this.sourceRelease,trainingCutoffMs:this.brain.trainingCutoffMs,brain:this.brain,stats:this.brain.sources,active:true});
    await this.audit('athena_b1_rebuilt_explicit',{brainHash:this.brain.brainHash,trainingCutoffMs:this.brain.trainingCutoffMs,sources:this.brain.sources,validation:check}).catch(()=>{});
    return this.summary();
  }
  assess(candidate={}){const a=assessAthenaBrain(this.brain,candidate);this.assessments+=1;if(a.blocked)this.blocks+=1;this.lastAssessment=a;return a;}
  summary(){
    const check=this.brain?validateAthenaBrain(this.brain):{ok:false};
    const sources=this.brain?.sources||{};
    const missingEvidenceFamilies=[];
    if(!(Number(sources.crashEpisodes||0)>0))missingEvidenceFamilies.push('crash_depth');
    if(!(Number(sources.frozenCrashSignals||0)>0))missingEvidenceFamilies.push('dragon_golden_signal_survival');
    if(!(Number(sources.recoveryObservations||0)>0))missingEvidenceFamilies.push('recovery');
    if(!(Number(sources.profitEpisodes||0)>0))missingEvidenceFamilies.push('hunter_survival_continuation');
    const coverageState=!check.ok?'UNAVAILABLE':missingEvidenceFamilies.length?'PARTIAL':'ALL_EVIDENCE_FAMILIES_PRESENT';
    return{version:ATHENA_BRAIN.version,role:ATHENA_BRAIN.role,placement:ATHENA_BRAIN.placement,ready:Boolean(check.ok),coverageState,missingEvidenceFamilies,brainHash:this.brain?.brainHash||null,loadedFrom:this.loadedFrom,loadError:this.loadError,trainingCutoffMs:this.brain?.trainingCutoffMs||0,sources,profileCount:this.brain?profileCount(this.brain):0,serializedBytes:check.bytes||0,adaptiveMode:ATHENA_BRAIN.adaptiveMode,adaptiveDecisionWeight:0,insufficientEvidencePolicy:ATHENA_BRAIN.insufficientEvidencePolicy,blockPolicy:ATHENA_BRAIN.blockPolicy,noLookahead:Boolean(this.brain?.provenance?.noLookahead),assessments:this.assessments,blocks:this.blocks,lastAssessment:this.lastAssessment};
  }
  exportBrain(){return this.brain?structuredClone(this.brain):null;}
}
