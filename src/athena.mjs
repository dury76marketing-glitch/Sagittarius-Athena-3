import { createHash } from 'node:crypto';
import { classifyDeterministic, profitEpisodeMetrics, profitLearningProfileKeys } from './learning.mjs';
import { ATHENA_B2_R2_MODEL } from './athenaB2R2Model.mjs';

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

function freezeR2Model(v){
  if(!v||typeof v!=='object'||Object.isFrozen(v))return v;
  for(const child of Object.values(v))freezeR2Model(child);
  return Object.freeze(v);
}
freezeR2Model(ATHENA_B2_R2_MODEL);
const ATHENA_B2_R2_MODEL_HASH=createHash('sha256').update(JSON.stringify(ATHENA_B2_R2_MODEL)).digest('hex');
function validateR2ModelContract(model=ATHENA_B2_R2_MODEL){
  try{
    const meta=model?.meta;if(!meta||!Array.isArray(meta.categories)||!Array.isArray(meta.numericFeatures)||!Array.isArray(meta.featureNames))return{ok:false,reason:'schema_missing'};
    if(!Number.isFinite(Number(meta.oofThreshold))||Number(meta.oofThreshold)<=0||Number(meta.oofThreshold)>=1)return{ok:false,reason:'threshold_invalid'};
    const categoricalWidth=meta.categories.reduce((n,x)=>n+(Array.isArray(x)?x.length:0),0),featureCount=categoricalWidth+meta.numericFeatures.length;
    if(meta.featureNames.length!==featureCount)return{ok:false,reason:'feature_width_mismatch'};
    const forbidden=new Set(['ticker','event','pnl','realizedpnl','mae','lowestprice','closereason','closedat','recoverytoentry','recoverytogreen','finalresult','currentprice','peakprice']);
    for(const n of [...(meta.categoricalFeatures||[]),...meta.numericFeatures])if(forbidden.has(String(n).replace(/[^a-z0-9]/gi,'').toLowerCase()))return{ok:false,reason:`forbidden_feature:${n}`};
    const validateTrees=(trees)=>{
      if(!Array.isArray(trees)||!trees.length)return false;
      for(const nodes of trees){if(!Array.isArray(nodes)||!nodes.length)return false;for(const node of nodes){if(node&&Object.prototype.hasOwnProperty.call(node,'v')){if(!Number.isFinite(Number(node.v)))return false;continue;}if(!node||!Number.isInteger(node.f)||node.f<0||node.f>=featureCount||!Number.isFinite(Number(node.t))||!Number.isInteger(node.l)||!Number.isInteger(node.r)||node.l<0||node.r<0||node.l>=nodes.length||node.r>=nodes.length)return false;}}
      return true;
    };
    if(!validateTrees(model?.forest?.trees)||!validateTrees(model?.boost?.trees))return{ok:false,reason:'tree_contract_invalid'};
    if(!Number.isFinite(Number(model?.boost?.learningRate))||!Number.isFinite(Number(model?.boost?.initLogOdds)))return{ok:false,reason:'boost_contract_invalid'};
    return{ok:true,reason:'valid',featureCount,forestTrees:model.forest.trees.length,boostTrees:model.boost.trees.length,modelHash:ATHENA_B2_R2_MODEL_HASH};
  }catch(error){return{ok:false,reason:`validation_error:${String(error?.message||error)}`};}
}
export const ATHENA_B2_R2_MODEL_VALIDATION=Object.freeze(validateR2ModelContract());


// R50 / ATHENA-B2-R2. B1 remains the frozen historical survival brain and
// retains its existing veto semantics. B2-R2 is the authoritative binary
// pre-entry Guardian: supported real Attacks are either acceptable risk or are
// blocked before capital authorization. The prior R1 three-state classifier is
// retained below as telemetry only so old frozen evidence stays auditable.
export const ATHENA_B2 = Object.freeze({
  version:'ATHENA-B2',
  policyRevision:'ATHENA-B2-R2-GUARDIAN-104',
  role:'authoritative_pre_entry_bad_trade_risk_gate',
  placement:'after_fresh_doctrine_and_executable_book_before_capital_authorization',
  decisionAuthority:true,
  mode:'authoritative_guardian',
  classes:Object.freeze(['ACCEPTABLE_RISK','BAD_TRADE_RISK','UNSUPPORTED_META_ATTACK']),
  supportedConcepts:Object.freeze(['Momentum Hunter','Wave Surfer','Recovery Hunter','Crash Recovery Hunter','Lightning Plasma']),
  historicalCorpus:Object.freeze({
    generatedAt:'2026-08-27',sourceRuns:4,labeledHunters:104,goodTrades:76,badTrades:28,
    badDefinition:'closed_realized_pnl_below_zero',postEntryOutcomeFeaturesExcluded:true,
    fullCorpusReplayBadBlocked:28,fullCorpusReplayBadTotal:28,fullCorpusReplayGoodAllowed:24,fullCorpusReplayAllowedPnlDollars:282.74,
    groupedTickerHoldoutBadBlocked:28,groupedTickerHoldoutBadTotal:28,groupedTickerHoldoutGoodAllowed:8,groupedTickerHoldoutAllowedPnlDollars:85.87,
    groupedTickerHoldout:true,exactTickerFeatureExcluded:true,noLookahead:true,
  }),
  guardianThreshold:Number(ATHENA_B2_R2_MODEL.meta.oofThreshold),
  guardianBrains:Object.freeze(['CAUSAL_RANDOM_FOREST','CAUSAL_GRADIENT_BOOST']),
  guardianModelHash:ATHENA_B2_R2_MODEL_HASH,
  guardianModelValidation:ATHENA_B2_R2_MODEL_VALIDATION,
  legacyCalibrationFeatures:Object.freeze(['sourceReferenceCents','sourceAgeSeconds','entryMinusSourceSignalCents']),
  maximumSourceAgeSeconds:24*60*60,
  unsupportedConceptPolicy:'meta_attack_prime_review_no_r2_veto',
  invalidModelPolicy:'fail_closed_supported_concepts',
});

const ATHENA_B2_R1_CALIBRATION_IMPUTE = Object.freeze([46,1499.7,64]);

const ATHENA_B2_HISTORICAL_TREE = Object.freeze([
  {f:1,t:1475.958496,l:1,r:48},{f:1,t:78.6525,l:2,r:15},{f:0,t:10,l:3,r:4},{c:'FALLING_KNIFE'},
  {f:2,t:59.5,l:5,r:14},{f:2,t:39.5,l:6,r:7},{c:'CONTINUATION'},{f:1,t:.774,l:8,r:9},{c:'CONTINUATION'},
  {f:1,t:3.4675,l:10,r:11},{c:'FALLING_KNIFE'},{f:2,t:49,l:12,r:13},{c:'CONTINUATION'},{c:'RECOVERABLE_VOLATILITY'},{c:'CONTINUATION'},
  {f:0,t:38,l:16,r:31},{f:2,t:1,l:17,r:20},{f:2,t:-1,l:18,r:19},{c:'CONTINUATION'},{c:'RECOVERABLE_VOLATILITY'},
  {f:1,t:912.669495,l:21,r:26},{f:1,t:253.445999,l:22,r:25},{f:2,t:4.5,l:23,r:24},{c:'CONTINUATION'},{c:'FALLING_KNIFE'},{c:'CONTINUATION'},
  {f:0,t:29.5,l:27,r:30},{f:0,t:18,l:28,r:29},{c:'RECOVERABLE_VOLATILITY'},{c:'FALLING_KNIFE'},{c:'CONTINUATION'},
  {f:2,t:49.5,l:32,r:33},{c:'FALLING_KNIFE'},{f:1,t:1327.984985,l:34,r:45},{f:1,t:930.56601,l:35,r:44},
  {f:1,t:519.809509,l:36,r:39},{f:0,t:75,l:37,r:38},{c:'CONTINUATION'},{c:'FALLING_KNIFE'},
  {f:1,t:852.227509,l:40,r:41},{c:'FALLING_KNIFE'},{f:1,t:885.241486,l:42,r:43},{c:'CONTINUATION'},{c:'FALLING_KNIFE'},{c:'CONTINUATION'},
  {f:0,t:67.5,l:46,r:47},{c:'FALLING_KNIFE'},{c:'RECOVERABLE_VOLATILITY'},
  {f:2,t:46.5,l:49,r:54},{f:2,t:32.5,l:50,r:53},{f:2,t:9,l:51,r:52},{c:'RECOVERABLE_VOLATILITY'},{c:'CONTINUATION'},{c:'RECOVERABLE_VOLATILITY'},
  {f:0,t:77,l:55,r:78},{f:2,t:59.5,l:56,r:65},{f:0,t:44.5,l:57,r:62},{f:0,t:40.5,l:58,r:59},{c:'CONTINUATION'},
  {f:1,t:3610.089355,l:60,r:61},{c:'RECOVERABLE_VOLATILITY'},{c:'CONTINUATION'},
  {f:1,t:8308.276855,l:63,r:64},{c:'FALLING_KNIFE'},{c:'CONTINUATION'},
  {f:0,t:29,l:66,r:69},{f:1,t:4072.646362,l:67,r:68},{c:'RECOVERABLE_VOLATILITY'},{c:'CONTINUATION'},
  {f:1,t:2718.77002,l:70,r:77},{f:1,t:2714.622559,l:71,r:76},{f:1,t:2167.375977,l:72,r:73},{c:'CONTINUATION'},
  {f:1,t:2199.615479,l:74,r:75},{c:'RECOVERABLE_VOLATILITY'},{c:'CONTINUATION'},{c:'RECOVERABLE_VOLATILITY'},{c:'CONTINUATION'},{c:'FALLING_KNIFE'},
]);

function b2Finite(v){if(v===null||v===undefined||v==='')return null;return Number.isFinite(Number(v))?Number(v):null;}
function b2Series(ticker=''){return String(ticker||'').split('-')[0]||'UNKNOWN';}
export function athenaB2FeatureVector(candidate={}){
  const entry=b2Finite(candidate.entryPriceCents)??b2Finite(candidate.askCents)??0;
  const sourceReference=b2Finite(candidate.sourceReferenceCents);
  const sourceSignal=b2Finite(candidate.sourceSignalCents);
  const sourceAge=b2Finite(candidate.sourceAgeSeconds);
  const bid=b2Finite(candidate.bidCents);
  const ask=b2Finite(candidate.askCents)??entry;
  return {
    conceptName:String(candidate.conceptName||''),sourceFeeder:String(candidate.sourceFeeder||''),ticker:String(candidate.ticker||''),series:b2Series(candidate.ticker),
    sport:String(candidate.sport||'Unknown'),entryPriceCents:entry,bidCents:bid,askCents:ask,spreadCents:bid==null||ask==null?null:Math.max(0,ask-bid),
    sourceReferenceCents:sourceReference,sourceSignalCents:sourceSignal,sourceAgeSeconds:sourceAge,
    entryMinusSourceReferenceCents:sourceReference==null?null:entry-sourceReference,
    entryMinusSourceSignalCents:sourceSignal==null?null:entry-sourceSignal,
    gameMinutes:b2Finite(candidate.gameMinutes),
    crashDepthCents:b2Finite(candidate.crashDepthCents),reboundCents:b2Finite(candidate.reboundCents),reclaimRate:b2Finite(candidate.reclaimRate),
    stableObservations:b2Finite(candidate.stableObservations),upwardTicks:b2Finite(candidate.upwardTicks),lowerLowCount:b2Finite(candidate.lowerLowCount),reboundLostCount:b2Finite(candidate.reboundLostCount),
    sourceContinuationCents:b2Finite(candidate.sourceContinuationCents),sourceFadeCents:b2Finite(candidate.sourceFadeCents),sourceChaseCents:b2Finite(candidate.sourceChaseCents),sourceScore:b2Finite(candidate.sourceScore),
    fieldSourceCount:b2Finite(candidate.fieldSourceCount),fieldIndependentEventCount:b2Finite(candidate.fieldIndependentEventCount),fieldStrikeCount:b2Finite(candidate.fieldStrikeCount),strikeIndex:b2Finite(candidate.strikeIndex),
    momentumPullbackCents:b2Finite(candidate.momentumPullbackCents),waveFavorableMoveCents:b2Finite(candidate.waveFavorableMoveCents),recoveryDropCents:b2Finite(candidate.recoveryDropCents),
    executableAveragePriceCents:b2Finite(candidate.executableAveragePriceCents),executableBestAskCents:b2Finite(candidate.executableBestAskCents),requestedCount:b2Finite(candidate.requestedCount),filledCount:b2Finite(candidate.filledCount),
    bookAgeMs:b2Finite(candidate.bookAgeMs),
  };
}

export function athenaB2HistoricalCalibration(featureVector={}){
  const raw=[featureVector.sourceReferenceCents,featureVector.sourceAgeSeconds,featureVector.entryMinusSourceSignalCents];
  const values=raw.map((v,i)=>b2Finite(v)??ATHENA_B2_R1_CALIBRATION_IMPUTE[i]);
  let index=0,steps=0;
  while(steps++<ATHENA_B2_HISTORICAL_TREE.length+2){
    const node=ATHENA_B2_HISTORICAL_TREE[index];
    if(!node)return{classification:'UNCERTAIN',reason:'calibration_tree_invalid',values};
    if(node.c)return{classification:node.c,reason:'historical_calibration_tree',values,pathLength:steps};
    index=values[node.f]<=node.t?node.l:node.r;
  }
  return{classification:'UNCERTAIN',reason:'calibration_tree_cycle_guard',values};
}

function athenaB2LiveStructure(featureVector={}){
  const signals=[];let knife=0,recovery=0,continuation=0;
  const push=(kind,weight,reason)=>{signals.push({kind,weight,reason});if(kind==='knife')knife+=weight;else if(kind==='recovery')recovery+=weight;else continuation+=weight;};
  const spread=b2Finite(featureVector.spreadCents);
  if(spread!=null){if(spread>=4)push('knife',2,'spread_expansion');else if(spread<=1)push('continuation',1,'tight_spread');}
  const fade=b2Finite(featureVector.sourceFadeCents);if(fade!=null&&fade>0)push('knife',Math.min(3,fade),'source_fade');
  const continuationCents=b2Finite(featureVector.sourceContinuationCents);if(continuationCents!=null){if(continuationCents<0)push('knife',2,'source_continuation_negative');else if(continuationCents>=2)push('continuation',2,'source_continuation_positive');}
  const lower=b2Finite(featureVector.lowerLowCount);if(lower!=null&&lower>=2)push('knife',Math.min(4,lower),'repeated_lower_lows');
  const lost=b2Finite(featureVector.reboundLostCount);if(lost!=null&&lost>=1)push('knife',Math.min(3,lost*1.5),'rebound_lost');
  const reclaim=b2Finite(featureVector.reclaimRate);if(reclaim!=null&&reclaim>0){if(reclaim<.30)push('knife',3,'weak_reclaim');else if(reclaim>=.55)push('recovery',3,'strong_reclaim');}
  const stableObs=b2Finite(featureVector.stableObservations);if(stableObs!=null&&stableObs>=4)push('recovery',1.5,'stable_rebound_observations');
  const up=b2Finite(featureVector.upwardTicks);if(up!=null&&up>=3)push('recovery',1.5,'repeated_upward_ticks');
  const avg=b2Finite(featureVector.executableAveragePriceCents),ask=b2Finite(featureVector.askCents);if(avg!=null&&ask!=null&&avg-ask>=2)push('knife',2,'entry_depth_slippage');
  const age=b2Finite(featureVector.sourceAgeSeconds);if(age!=null&&age>ATHENA_B2.maximumSourceAgeSeconds)push('knife',2,'source_extremely_old');
  const score=continuation+recovery-knife;
  const classification=knife>=6&&knife>recovery+continuation?'FALLING_KNIFE':recovery>=4&&recovery>knife?'RECOVERABLE_VOLATILITY':continuation>=3&&continuation>=knife?'CONTINUATION':'UNCERTAIN';
  return{classification,knifeScore:knife,recoveryScore:recovery,continuationScore:continuation,netStructureScore:score,signals};
}


function athenaB2R2Sport(ticker='',fallback='OTHER'){
  const series=b2Series(ticker).toUpperCase();
  const maps=[['ITFWMATCH','ITF_W_TENNIS'],['ITFMATCH','ITF_TENNIS'],['WTAMATCH','WTA_TENNIS'],['ATPMATCH','ATP_TENNIS'],['ATPCHALLENGERMATCH','ATP_CHALLENGER'],['CS2GAME','CS2'],['LOLGAME','LOL'],['VALORANTGAME','VALORANT'],['KBOGAME','KBO'],['NPBGAME','NPB'],['MLBGAME','MLB'],['NFLGAME','NFL'],['T20MATCH','CRICKET_T20'],['TESTMATCH','CRICKET_TEST'],['FIBAGAME','BASKETBALL'],['LALIGAGAME','SOCCER'],['CPLMATCH','CRICKET_CPL']];
  for(const [k,v] of maps)if(series.includes(k))return v;
  return String(fallback||'OTHER').trim().toUpperCase().replace(/[^A-Z0-9]+/g,'_')||'OTHER';
}
function b2R2Numeric(v){if(v===null||v===undefined||v==='')return ATHENA_B2_R2_MODEL.meta.impute;const x=Number(v);return Number.isFinite(x)?x:ATHENA_B2_R2_MODEL.meta.impute;}
function b2R2EvalTree(nodes,vector){let i=0,guard=0;while(guard++<nodes.length+2){const n=nodes[i];if(!n)throw new Error('athena_b2_r2_tree_invalid');if(Object.prototype.hasOwnProperty.call(n,'v'))return Number(n.v);i=vector[n.f]<=n.t?n.l:n.r;}throw new Error('athena_b2_r2_tree_cycle');}
export function athenaB2R2RiskFromFeatures(features={}){
  if(!ATHENA_B2_R2_MODEL_VALIDATION.ok)throw new Error(`athena_b2_r2_model_invalid:${ATHENA_B2_R2_MODEL_VALIDATION.reason}`);
  const meta=ATHENA_B2_R2_MODEL.meta;const vector=[];
  const categorical=[String(features.concept||''),String(features.source||'NONE'),String(features.sport||'OTHER')];
  for(let i=0;i<meta.categories.length;i+=1){const value=categorical[i];for(const cat of meta.categories[i])vector.push(value===String(cat)?1:0);}
  for(const name of meta.numericFeatures)vector.push(b2R2Numeric(features[name]));
  const forestTrees=ATHENA_B2_R2_MODEL.forest.trees;let forestRisk=0;for(const t of forestTrees)forestRisk+=b2R2EvalTree(t,vector);forestRisk/=Math.max(1,forestTrees.length);
  let boostLogOdds=Number(ATHENA_B2_R2_MODEL.boost.initLogOdds||0);for(const t of ATHENA_B2_R2_MODEL.boost.trees)boostLogOdds+=Number(ATHENA_B2_R2_MODEL.boost.learningRate||0)*b2R2EvalTree(t,vector);
  const boostRisk=1/(1+Math.exp(-Math.max(-60,Math.min(60,boostLogOdds))));
  const guardianRisk=Math.max(forestRisk,boostRisk);const threshold=Number(meta.oofThreshold);
  return{forestRisk,boostRisk,guardianRisk,threshold,blocked:guardianRisk+1e-12>=threshold,featureCount:vector.length};
}
export function athenaB2R2FeatureRow(candidate={},featureVector=athenaB2FeatureVector(candidate)){
  const ctx=candidate.r2Context&&typeof candidate.r2Context==='object'?candidate.r2Context:{};
  const entry=b2Finite(candidate.r2PlannedEntryCents)??b2Finite(featureVector.executableAveragePriceCents)??b2Finite(featureVector.entryPriceCents)??0;
  const sourceRef=b2Finite(featureVector.sourceReferenceCents),sourceSignal=b2Finite(featureVector.sourceSignalCents),sourceAge=b2Finite(featureVector.sourceAgeSeconds);
  const stop=b2Finite(candidate.r2AuroraPreview?.dangerPriceCents),stopDistance=b2Finite(candidate.r2AuroraPreview?.stopDistanceCents);
  const modelMin=b2Finite(ctx.modelMinEntry),modelMax=b2Finite(ctx.modelMaxEntry);
  return{
    ...ctx,
    concept:String(featureVector.conceptName||''),source:String(featureVector.sourceFeeder||'NONE')||'NONE',sport:athenaB2R2Sport(featureVector.ticker,featureVector.sport),
    entry,stop,stopDistance,sourceRef,sourceSignal,sourceAgeSec:sourceAge,
    entryMinusSourceRef:sourceRef==null?null:entry-sourceRef,entryMinusSourceSignal:sourceSignal==null?null:entry-sourceSignal,
    entryMinusSourceLastRef:ctx.sourceSeqLastRef==null?(sourceRef==null?null:entry-sourceRef):entry-Number(ctx.sourceSeqLastRef),
    entryMinusSourcePrevRef:ctx.sourceSeqPrevRef==null?(ctx.sourceSeqLastRef==null?(sourceRef==null?null:entry-sourceRef):entry-Number(ctx.sourceSeqLastRef)):entry-Number(ctx.sourceSeqPrevRef),
    entryMinusSourceLastSignal:ctx.sourceSeqLastSignal==null?(sourceSignal==null?null:entry-sourceSignal):entry-Number(ctx.sourceSeqLastSignal),
    entryAboveModelMin:modelMin==null?null:entry-modelMin,entryBelowModelMax:modelMax==null?null:modelMax-entry,
    sourceAgeMinutes:sourceAge==null?null:sourceAge/60,distanceFrom50:Math.abs(entry-50),remainingUpside:100-entry,oddsRatio:entry/Math.max(1,100-entry),
  };
}

export function assessAthenaB2(candidate={}){
  const featureVector=athenaB2FeatureVector(candidate);
  const legacyHistoricalCalibration=athenaB2HistoricalCalibration(featureVector);
  const liveStructure=athenaB2LiveStructure(featureVector);
  const supported=ATHENA_B2.supportedConcepts.includes(String(featureVector.conceptName||''));
  if(supported&&candidate.r2AuthorityRequired===true&&candidate.r2Context?.ready!==true){
    return{version:ATHENA_B2.version,policyRevision:ATHENA_B2.policyRevision,decisionAuthority:true,globalDecisionAuthority:true,mode:ATHENA_B2.mode,
      classification:'BAD_TRADE_RISK',recommendedAction:'BLOCK',blocked:true,confidence:'FAIL_CLOSED',reason:'guardian_context_unavailable_fail_closed',
      guardian:{error:'causal_context_not_ready',threshold:ATHENA_B2.guardianThreshold},legacyHistoricalCalibration,liveStructure,featureVector,assessedAtMs:Date.now()};
  }
  if(supported&&candidate.r2AuthorityRequired!==true&&candidate.r2Context?.ready!==true){
    return{version:ATHENA_B2.version,policyRevision:ATHENA_B2.policyRevision,decisionAuthority:false,globalDecisionAuthority:true,mode:ATHENA_B2.mode,
      classification:'ACCEPTABLE_RISK',recommendedAction:'ALLOW',blocked:false,confidence:'RESEARCH_ONLY',reason:'guardian_context_not_requested',
      guardian:null,legacyHistoricalCalibration,liveStructure,featureVector,assessedAtMs:Date.now()};
  }
  if(!supported){
    return{version:ATHENA_B2.version,policyRevision:ATHENA_B2.policyRevision,decisionAuthority:false,globalDecisionAuthority:true,mode:ATHENA_B2.mode,
      classification:'UNSUPPORTED_META_ATTACK',recommendedAction:'ALLOW',blocked:false,confidence:'N/A',reason:'meta_attack_prime_review',
      guardian:null,legacyHistoricalCalibration,liveStructure,featureVector,assessedAtMs:Date.now()};
  }
  try{
    const r2Features=athenaB2R2FeatureRow(candidate,featureVector);const guardian=athenaB2R2RiskFromFeatures(r2Features);
    const blocked=guardian.blocked;return{
      version:ATHENA_B2.version,policyRevision:ATHENA_B2.policyRevision,decisionAuthority:true,globalDecisionAuthority:true,mode:ATHENA_B2.mode,
      classification:blocked?'BAD_TRADE_RISK':'ACCEPTABLE_RISK',recommendedAction:blocked?'BLOCK':'ALLOW',blocked,
      confidence:'GUARDIAN_ENSEMBLE',reason:blocked?'guardian_risk_at_or_above_zero_miss_threshold':'guardian_risk_below_threshold',
      guardian:{...guardian,brains:[{name:'CAUSAL_RANDOM_FOREST',risk:guardian.forestRisk},{name:'CAUSAL_GRADIENT_BOOST',risk:guardian.boostRisk}]},
      legacyHistoricalCalibration,liveStructure,featureVector,r2Features,assessedAtMs:Date.now(),
    };
  }catch(error){
    return{version:ATHENA_B2.version,policyRevision:ATHENA_B2.policyRevision,decisionAuthority:true,globalDecisionAuthority:true,mode:ATHENA_B2.mode,
      classification:'BAD_TRADE_RISK',recommendedAction:'BLOCK',blocked:true,confidence:'FAIL_CLOSED',reason:'guardian_model_unavailable_fail_closed',
      guardian:{error:String(error?.message||error),threshold:ATHENA_B2.guardianThreshold},legacyHistoricalCalibration,liveStructure,featureVector,assessedAtMs:Date.now()};
  }
}

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
  const fallingKnife=assessAthenaB2(candidate);
  const valid=validateAthenaBrain(brain);
  if(!valid.ok){const b2Blocked=Boolean(fallingKnife?.decisionAuthority&&fallingKnife?.blocked);return{version:ATHENA_BRAIN.version,brainHash:null,ready:false,allow:!b2Blocked,blocked:b2Blocked,score:50,classification:b2Blocked?'STRONG_NEGATIVE':'NEUTRAL',confidence:b2Blocked?'HIGH':'LOW',reason:b2Blocked?'athena_b2_r2_guardian_veto':`brain_unavailable:${valid.reason}`,evidence:[],fallingKnife};}
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
  const b1Blocked=classification==='STRONG_NEGATIVE'&&confidence==='HIGH'&&strongNegative;
  const b2Blocked=Boolean(fallingKnife?.decisionAuthority&&fallingKnife?.blocked);const blocked=b1Blocked||b2Blocked;
  return{version:brain.version,brainHash:brain.brainHash,ready:true,allow:!blocked,blocked,score,probability,classification,confidence,reason:b2Blocked?'athena_b2_r2_guardian_veto':b1Blocked?'high_confidence_strong_negative':'assessment',sport,dimensions:{entryBand:entry,crashBucket:depth,crashDepthThresholdCents:threshold,episodeBucket:episode,crashSignalPriceBand:athenaEntryBand(crashSignalPrice),dropBucket:drop,gameBucket:game,recoveryDomain:domain||null},evidence:evidence.map(({weight,...e})=>({...e,weight:Number(weight.toFixed(4))})),fallingKnife,adaptiveMode:ATHENA_BRAIN.adaptiveMode,adaptiveDecisionWeight:0,assessedAtMs:Date.now()};
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
    return{version:ATHENA_BRAIN.version,role:ATHENA_BRAIN.role,placement:ATHENA_BRAIN.placement,ready:Boolean(check.ok),coverageState,missingEvidenceFamilies,brainHash:this.brain?.brainHash||null,loadedFrom:this.loadedFrom,loadError:this.loadError,trainingCutoffMs:this.brain?.trainingCutoffMs||0,sources,profileCount:this.brain?profileCount(this.brain):0,serializedBytes:check.bytes||0,adaptiveMode:ATHENA_BRAIN.adaptiveMode,adaptiveDecisionWeight:0,insufficientEvidencePolicy:ATHENA_BRAIN.insufficientEvidencePolicy,blockPolicy:ATHENA_BRAIN.blockPolicy,noLookahead:Boolean(this.brain?.provenance?.noLookahead),fallingKnifeBrain:{version:ATHENA_B2.version,policyRevision:ATHENA_B2.policyRevision,role:ATHENA_B2.role,placement:ATHENA_B2.placement,decisionAuthority:ATHENA_B2.decisionAuthority,mode:ATHENA_B2.mode,historicalCorpus:ATHENA_B2.historicalCorpus,guardianThreshold:ATHENA_B2.guardianThreshold,guardianBrains:[...ATHENA_B2.guardianBrains],guardianModelHash:ATHENA_B2.guardianModelHash,guardianModelValidation:ATHENA_B2.guardianModelValidation,supportedConcepts:[...ATHENA_B2.supportedConcepts],legacyCalibrationFeatures:[...ATHENA_B2.legacyCalibrationFeatures],invalidModelPolicy:ATHENA_B2.invalidModelPolicy},assessments:this.assessments,blocks:this.blocks,lastAssessment:this.lastAssessment};
  }
  exportBrain(){return this.brain?structuredClone(this.brain):null;}
}

// ---------------------------------------------------------------------------
// R52 ATHENA-C2: Economic supreme commander.
// B1/B2 remain frozen historical/read-only compatibility surfaces. C2 is the
// sole new-entry strategic authority and ranks the enabled Saints by the
// configured Infinity Break economic mission, not by raw win rate or one
// privileged heuristic. Mature negative expected value cannot be overridden by
// a visually strong pattern fit. No Attack quota is forced: diversity emerges
// only when a different Saint has the stronger economic case.
// ---------------------------------------------------------------------------
import { ATHENA_COMMANDER, ARAYASHIKI, ATOMIC_THUNDER_BOLT, ATOMIC_THUNDER_PATTERN_GUARDIAN, INFINITY_BREAK, ATHENA_EXIT_INTELLIGENCE, SCARLET_NEEDLE, LIGHTNING_PLASMA, ATHENA_EXCLAMATION, EXECUTION_ATTACK_DISPLAY, PORTFOLIO_CONCEPTS } from './doctrine.mjs';
import { sealAthenaFireCommand } from './authority.mjs';

const COMMAND_ATTACKS=Object.freeze([
  'Momentum Hunter','Wave Surfer','Crash Recovery Hunter','Recovery Hunter','Lightning Plasma','Athena Exclamation',
]);
const COMMAND_SETTING_MAP=Object.freeze({
  'Momentum Hunter':Object.freeze({enabled:'momentumHunterEnabled',stake:'momentumStakeCents',min:'momentumMinEntryCents',max:'momentumMaxEntryCents'}),
  'Wave Surfer':Object.freeze({enabled:'waveSurferEnabled',stake:'waveStakeCents',min:'waveMinEntryCents',max:'waveMaxEntryCents'}),
  'Crash Recovery Hunter':Object.freeze({enabled:'crashRecoveryHunterEnabled',stake:'crashRecoveryStakeCents',min:'crashRecoveryMinEntryCents',max:'crashRecoveryMaxEntryCents'}),
  'Recovery Hunter':Object.freeze({enabled:'recoveryHunterEnabled',stake:'recoveryStakeCents',min:'recoveryMinEntryCents',max:'recoveryMaxEntryCents'}),
  'Lightning Plasma':Object.freeze({enabled:'lightningPlasmaEnabled',stake:'lightningPlasmaFieldStakeCents',min:'lightningPlasmaMinEntryCents',max:'lightningPlasmaMaxEntryCents'}),
  'Athena Exclamation':Object.freeze({enabled:'athenaExclamationEnabled',stake:'athenaExclamationStakeCents',min:'athenaExclamationMinEntryCents',max:'athenaExclamationMaxEntryCents'}),
});
const ECONOMIC_MEMORY_VERSION='ATHENA-ECONOMIC-MEMORY-V5-ATB2-A8-CERTIFIED';
const ECONOMIC_TARGET_THRESHOLDS=Object.freeze([1,2,3,4,5,6,7,8,10,12,15,20,25,30,40,50,60,70,80,90]);
const commandFinite=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const commandMaybeFinite=(v)=>v===null||v===undefined||v===''?null:(Number.isFinite(Number(v))?Number(v):null);
const commandClamp=(v,lo=0,hi=100)=>Math.max(lo,Math.min(hi,Number(v)||0));
const commandBand=(p)=>{const x=Math.max(0,Math.min(99,Math.round(Number(p)||0)));const lo=Math.floor(x/5)*5;return `${lo}-${Math.min(99,lo+4)}`;};
function commandGameBucket(m){const x=commandFinite(m,-1);if(x<0)return'UNKNOWN';if(x<20)return'0-19';if(x<30)return'20-29';if(x<40)return'30-39';if(x<50)return'40-49';if(x<60)return'50-59';return'60+';}
function emptyTargetMap(){return Object.fromEntries(ECONOMIC_TARGET_THRESHOLDS.map(t=>[String(t),0]));}
function blankEconomicProfile(key){return{key,total:0,clean:0,toxicLate:0,falseBolt:0,expired:0,realizedPnlCents:0,maeTotalCents:0,maeSamples:0,legacyRows:0,episodeRows:0,realizedContractSamples:0,netPnlPerContractTotal:0,returnRatioTotal:0,negativeContractSamples:0,negativeNetPerContractTotal:0,targetSamples:emptyTargetMap(),targetHits:emptyTargetMap(),exactPeakNetSamples:0};}
function economicsFor({entry=null,profitEpisode=null,outcome=null,fireCommand=null}={}){
  const state=profitEpisode?.state&&typeof profitEpisode.state==='object'?profitEpisode.state:{};
  const count=Math.max(1,commandFinite(state.originalCount,commandFinite(profitEpisode?.original_count,commandFinite(entry?.count,0)))||Math.floor(commandFinite(fireCommand?.stakeCents,1)/Math.max(1,commandFinite(fireCommand?.entryPriceCents,1))));
  const pnl=commandMaybeFinite(entry?.pnlCents)??commandMaybeFinite(state.actualRealizedNetCents)??commandMaybeFinite(outcome?.realizedPnlCents);
  const entryPrice=commandMaybeFinite(entry?.entryPriceCents)??commandMaybeFinite(profitEpisode?.entry_price_cents)??commandMaybeFinite(fireCommand?.entryPriceCents);
  const entryFee=Math.max(0,commandFinite(entry?.entryFeeCents,0));
  const notional=entryPrice!=null?Math.max(1,entryPrice*count+entryFee):null;
  const realizedNetPerContract=pnl==null?null:pnl/count;
  const returnRatio=pnl==null||notional==null?null:pnl/notional;
  const peakNet=commandMaybeFinite(state.maxExecutableNetCents);
  const peakNetPerContract=peakNet==null?null:peakNet/count;
  const closeReason=String(entry?.closeReason||outcome?.closeReason||state.closeReason||'');
  const frozenTarget=Math.max(0,commandFinite(entry?.entryConfig?.athenaExit?.activationMinimumNetPerOriginalContractCents,commandFinite(entry?.entryConfig?.infinityBreak?.minimumNetPerOriginalContractCents,commandFinite(fireCommand?.economicTarget?.netPerOriginalContractCents,0))));
  const mae=commandMaybeFinite(entry?.maeCents)??commandMaybeFinite(outcome?.maeCents);
  return{count,pnl,entryPrice,realizedNetPerContract,returnRatio,peakNetPerContract,closeReason,frozenTarget,mae};
}
function addProfileObservation(profiles,key,{label,pnlCents=0,maeCents=null,origin='legacy',economics=null}={}){
  const p=profiles.get(key)||blankEconomicProfile(key);p.total+=1;p.realizedPnlCents+=commandFinite(pnlCents,0);
  if(maeCents!=null&&Number.isFinite(Number(maeCents))){p.maeTotalCents+=Number(maeCents);p.maeSamples+=1;}
  if(label==='CLEAN_BOLT')p.clean+=1;else if(label==='TOXIC_LATE_BOLT')p.toxicLate+=1;else if(label==='FALSE_BOLT')p.falseBolt+=1;else p.expired+=1;
  if(origin==='episode')p.episodeRows+=1;else p.legacyRows+=1;
  if(economics){
    const realized=commandMaybeFinite(economics.realizedNetPerContract),ret=commandMaybeFinite(economics.returnRatio);
    if(realized!=null){p.realizedContractSamples+=1;p.netPnlPerContractTotal+=realized;if(ret!=null)p.returnRatioTotal+=ret;if(realized<0){p.negativeContractSamples+=1;p.negativeNetPerContractTotal+=realized;}}
    const exactPeak=commandMaybeFinite(economics.peakNetPerContract);const frozenTarget=Math.max(0,commandFinite(economics.frozenTarget,0));const reason=String(economics.closeReason||'');
    for(const threshold of ECONOMIC_TARGET_THRESHOLDS){
      const k=String(threshold);let known=false,hit=false;
      if(exactPeak!=null){known=true;hit=exactPeak+1e-9>=threshold;}
      else if(['athena_x1_exit','infinity_break','atomic_thunder_cashout'].includes(reason)&&frozenTarget>0&&threshold<=frozenTarget+1e-9){known=true;hit=true;}
      else if(/aurora|hard_stop|stop_loss|ultimate_stop/i.test(reason)&&frozenTarget>0&&threshold+1e-9>=frozenTarget){known=true;hit=false;}
      if(known){p.targetSamples[k]+=1;if(hit)p.targetHits[k]+=1;}
    }
    if(exactPeak!=null)p.exactPeakNetSamples+=1;
  }
  profiles.set(key,p);
}

function economicLegacyLabel(e){
  const reason=String(e?.closeReason||''),pnl=commandFinite(e?.pnlCents,0),mae=commandFinite(e?.maeCents,0);
  const frozenTarget=commandFinite(e?.entryConfig?.athenaExit?.activationMinimumNetPerOriginalContractCents,commandFinite(e?.entryConfig?.infinityBreak?.minimumNetPerOriginalContractCents,e?.entryConfig?.atomicThunder?.minimumNetPerOriginalContractCents??5));
  if(reason==='athena_x1_exit'&&pnl>0)return String(e?.conceptName||'')==='Sagittarius Justice Arrow'?'CLEAN_BOLT':(mae<=Math.max(1,frozenTarget)?'CLEAN_BOLT':'TOXIC_LATE_BOLT');
  if(['infinity_break','atomic_thunder_cashout'].includes(reason))return mae<=Math.max(1,frozenTarget)?'CLEAN_BOLT':'TOXIC_LATE_BOLT';
  if(/aurora|stop_loss|hard_stop|ultimate_stop/i.test(reason)||pnl<0)return'FALSE_BOLT';
  return'EXPIRED_NO_IMPULSE';
}
function economicProfileKeys(concept,{entryPriceCents=0,sport='Unknown',source='NONE',gameMinutes=null}={}){
  return[
    `B|${concept}|${commandBand(entryPriceCents)}`,
    `S|${concept}|${sport||'Unknown'}`,
    `C|${concept}|${source||'NONE'}`,
    `G|${concept}|${commandGameBucket(gameMinutes)}`,
    `A|${concept}`,
  ];
}
function arayashikiCertifiedArtifact({entry=null,episode=null}={}){
  const certificate=episode?.fireCommand?.survivalCertificate||episode?.athenaDecision?.survivalCertificate||entry?.entryConfig?.athenaFire?.survivalCertificate||entry?.entryConfig?.athena?.survivalCertificate||null;
  const clearance=episode?.boltSnapshot?.preBoltClearance
    ||episode?.fireCommand?.decisionEvidence?.preBoltClearance
    ||episode?.athenaDecision?.fireCommand?.decisionEvidence?.preBoltClearance
    ||entry?.entryConfig?.athenaFire?.decisionEvidence?.preBoltClearance
    ||entry?.entryConfig?.athena?.decisionEvidence?.preBoltClearance
    ||entry?.entryConfig?.entryQualification?.preBoltClearance
    ||null;
  const a8=String(certificate?.status||'')==='CERTIFIED'&&String(certificate?.version||'')===ARAYASHIKI.version&&String(certificate?.policyRevision||'')===ARAYASHIKI.policyRevision;
  const atb2=String(clearance?.status||'')==='CLEARED'&&String(clearance?.version||'')===ATOMIC_THUNDER_PATTERN_GUARDIAN.version&&String(clearance?.policyRevision||'')===ATOMIC_THUNDER_PATTERN_GUARDIAN.policyRevision;
  return a8&&atb2;
}
function addEpisodeEconomicObservation(profiles,ep,{entry=null,profit=null,sourceReleases=new Set(),cohortIds=new Set()}={}){
  const concept=String(ep?.attackSelected||ep?.fireCommand?.selectedAttack||'');if(!COMMAND_ATTACKS.includes(concept)||!ep?.trackingComplete)return false;
  const label=['CLEAN_BOLT','TOXIC_LATE_BOLT','FALSE_BOLT','EXPIRED_NO_IMPULSE'].includes(String(ep.outcomeLabel))?String(ep.outcomeLabel):'EXPIRED_NO_IMPULSE';
  sourceReleases.add(String(ep.sourceRelease||'UNKNOWN'));if(ep.cohortId)cohortIds.add(String(ep.cohortId));
  const f=ep?.boltSnapshot?.features||{};
  const sport=String(ep.sport||f.sport||entry?.entryConfig?.sport||'Unknown'),source=String((f.cosmoSources||[])[0]||entry?.sourceFeeder||'NONE'),game=f.gameMinutes??entry?.entryConfig?.gameClockAuthority?.elapsedMinutes;
  const entryPrice=ep?.fireCommand?.entryPriceCents??f.askCents??entry?.entryPriceCents;
  const econ=economicsFor({entry,profitEpisode:profit,outcome:ep?.outcome,fireCommand:ep?.fireCommand});
  const row={label,pnlCents:ep?.outcome?.realizedPnlCents??entry?.pnlCents,maeCents:ep?.outcome?.maeCents??entry?.maeCents,origin:'episode',economics:econ};
  for(const key of economicProfileKeys(concept,{entryPriceCents:entryPrice,sport,source,gameMinutes:game}))addProfileObservation(profiles,key,row);
  return true;
}
function finalizedProfileMap(profiles){
  const out={};
  for(const [k,p] of profiles||[]){
    const positiveMass=p.clean+(p.toxicLate*0.25)+(p.expired*0.10),posteriorDenominator=p.clean+p.toxicLate+p.falseBolt+p.expired+4;
    const success=(positiveMass+2)/posteriorDenominator;
    out[k]={...p,evidence:p.total,successRate:Number(success.toFixed(6)),avgPnlCents:p.total?Number((p.realizedPnlCents/p.total).toFixed(3)):0,avgMaeCents:p.maeSamples?Number((p.maeTotalCents/p.maeSamples).toFixed(3)):null,avgNetPerContractCents:p.realizedContractSamples?Number((p.netPnlPerContractTotal/p.realizedContractSamples).toFixed(6)):null,avgReturnRatio:p.realizedContractSamples?Number((p.returnRatioTotal/p.realizedContractSamples).toFixed(8)):null,avgFailureNetPerContractCents:p.negativeContractSamples?Number((p.negativeNetPerContractTotal/p.negativeContractSamples).toFixed(6)):null};
  }
  return out;
}
function finalizeAthenaAttackMemory({profiles,certifiedProfiles=new Map(),entryRows=0,opportunityRows=0,profitEpisodeRows=0,certifiedEntryRows=0,certifiedOpportunityRows=0,sourceReleases=new Set(),cohortIds=new Set()}={}){
  const out=finalizedProfileMap(profiles),certifiedOut=finalizedProfileMap(certifiedProfiles);
  const provenance={sourceReleases:[...sourceReleases].sort(),cohortIds:[...cohortIds].sort()};
  const memoryHash=createHash('sha256').update(JSON.stringify({version:ECONOMIC_MEMORY_VERSION,profiles:out,certifiedProfiles:certifiedOut,provenance})).digest('hex');
  return Object.freeze({version:ECONOMIC_MEMORY_VERSION,memoryHash,compiledAtMs:Date.now(),profiles:Object.freeze(out),certifiedProfiles:Object.freeze(certifiedOut),entryRows:Number(entryRows||0),opportunityRows:Number(opportunityRows||0),profitEpisodeRows:Number(profitEpisodeRows||0),certifiedEntryRows:Number(certifiedEntryRows||0),certifiedOpportunityRows:Number(certifiedOpportunityRows||0),sourceReleases:Object.freeze(provenance.sourceReleases),cohortIds:Object.freeze(provenance.cohortIds),targetThresholds:ECONOMIC_TARGET_THRESHOLDS});
}

export function compileAthenaAttackMemory({entries=[],episodes=[],profitEpisodes=[]}={}){
  const profiles=new Map(),certifiedProfiles=new Map();
  const entryById=new Map((entries||[]).filter(x=>x?.id).map(x=>[String(x.id),x]));
  const profitById=new Map((profitEpisodes||[]).filter(x=>x?.id).map(x=>[String(x.id),x]));
  const episodeEntryIds=new Set((episodes||[]).filter(ep=>ep?.trackingComplete&&ep?.entryId).map(ep=>String(ep.entryId)));
  const sourceReleases=new Set();const cohortIds=new Set();let certifiedEntryRows=0,certifiedOpportunityRows=0;
  for(const e of entries||[]){
    if(!COMMAND_ATTACKS.includes(String(e?.conceptName||'')))continue;
    if(episodeEntryIds.has(String(e?.id||'')))continue;
    if(!['closed','settled'].includes(String(e?.status||''))&&e?.closedAtMs==null)continue;
    const concept=String(e.conceptName),sport=String(e.entryConfig?.sport||e.sport||'Unknown'),source=String(e.sourceFeeder||'NONE'),game=e.entryConfig?.gameClockAuthority?.elapsedMinutes??e.entryConfig?.gameMinutes;
    const release=String(e?.entryConfig?.release||e?.entryConfig?.sourceRelease||e?.watchdogModel||'LEGACY');sourceReleases.add(release);
    const cohort=String(e?.entryConfig?.cohortId||e?.entryConfig?.resetTimestampMs||'');if(cohort)cohortIds.add(cohort);
    const econ=economicsFor({entry:e,profitEpisode:profitById.get(String(e.id))});
    const row={label:economicLegacyLabel(e),pnlCents:e.pnlCents,maeCents:e.maeCents,origin:'legacy',economics:econ};
    const keys=economicProfileKeys(concept,{entryPriceCents:e.entryPriceCents,sport,source,gameMinutes:game});
    for(const key of keys)addProfileObservation(profiles,key,row);
    if(arayashikiCertifiedArtifact({entry:e})){for(const key of keys)addProfileObservation(certifiedProfiles,key,row);certifiedEntryRows+=1;}
  }
  for(const ep of episodes||[]){
    const entry=entryById.get(String(ep?.entryId||''))||null,profit=profitById.get(String(ep?.entryId||''))||null;
    const added=addEpisodeEconomicObservation(profiles,ep,{entry,profit,sourceReleases,cohortIds});
    if(added&&arayashikiCertifiedArtifact({entry,episode:ep})){addEpisodeEconomicObservation(certifiedProfiles,ep,{entry,profit,sourceReleases:new Set(),cohortIds:new Set()});certifiedOpportunityRows+=1;}
  }
  return finalizeAthenaAttackMemory({profiles,certifiedProfiles,entryRows:(entries||[]).length,opportunityRows:(episodes||[]).length,profitEpisodeRows:(profitEpisodes||[]).length,certifiedEntryRows,certifiedOpportunityRows,sourceReleases,cohortIds});
}

function targetEvidenceForProfile(p,target){
  if(!p)return null;const wanted=Math.max(0.01,commandFinite(target,5));let threshold=ECONOMIC_TARGET_THRESHOLDS.find(x=>x+1e-9>=wanted);
  if(threshold==null)threshold=ECONOMIC_TARGET_THRESHOLDS.at(-1);
  const samples=commandFinite(p.targetSamples?.[String(threshold)],0),hits=commandFinite(p.targetHits?.[String(threshold)],0);
  if(!(samples>0))return null;
  return{threshold,samples,hits,probability:(hits+1)/(samples+2)};
}
function economicProfileView(p,target){
  const wanted=Math.max(0.01,commandFinite(target,5)),targetEvidence=targetEvidenceForProfile(p,wanted);
  const avgFailure=commandMaybeFinite(p?.avgFailureNetPerContractCents)??-Math.max(3,wanted);
  const avgRealized=commandMaybeFinite(p?.avgNetPerContractCents);
  const evidence=Math.max(commandFinite(targetEvidence?.samples,0),commandFinite(p?.realizedContractSamples,0));
  const confidence=Math.min(1,Math.log2(Math.max(1,evidence)+1)/4);
  let probability=targetEvidence?.probability??null,breakEvenProbability=null,rawExpectedNet=avgRealized??0;
  if(probability!=null){const loss=Math.max(0.01,Math.abs(Math.min(-0.01,avgFailure)));breakEvenProbability=loss/(wanted+loss);rawExpectedNet=probability*wanted+(1-probability)*avgFailure;}
  const expectedNet=rawExpectedNet*confidence;
  const edge=probability==null||breakEvenProbability==null?0:probability-breakEvenProbability;
  const economicScore=commandClamp(50+38*Math.tanh(expectedNet/Math.max(1,wanted))+12*Math.tanh(edge*4));
  return{economicScore:Number(economicScore.toFixed(2)),economicEvidence:evidence,economicConfidence:Number(confidence.toFixed(4)),targetHitProbability:probability==null?null:Number(probability.toFixed(6)),targetEvidenceThresholdCents:targetEvidence?.threshold??null,targetHitSamples:targetEvidence?.samples??0,targetHits:targetEvidence?.hits??0,breakEvenTargetHitProbability:breakEvenProbability==null?null:Number(breakEvenProbability.toFixed(6)),expectedNetPerContractCents:Number(expectedNet.toFixed(6)),rawExpectedNetPerContractCents:Number(rawExpectedNet.toFixed(6)),avgNetPerContractCents:avgRealized,avgFailureNetPerContractCents:Number(avgFailure.toFixed(6)),avgReturnRatio:commandMaybeFinite(p?.avgReturnRatio),avgMaeCents:commandMaybeFinite(p?.avgMaeCents)};
}
function memoryEvidence(memory,concept,features,target,{certifiedOnly=false}={}){
  const profilePool=certifiedOnly?memory?.certifiedProfiles:memory?.profiles;
  const keys=[
    [`B|${concept}|${commandBand(features.askCents)}`,1.25],
    [`S|${concept}|${features.sport||'Unknown'}`,features.sport&&features.sport!=='Unknown'?1.15:0.45],
    [`C|${concept}|${(features.cosmoSources||[])[0]||'NONE'}`,1.0],
    [`G|${concept}|${commandGameBucket(features.gameMinutes)}`,1.10],
    [`A|${concept}`,0.60],
  ];
  const used=[];
  for(const [key,specificity] of keys){const p=profilePool?.[key];if(!p||p.evidence<3)continue;const view=economicProfileView(p,target);const weight=specificity*Math.max(0.25,Math.min(2,Math.log10(Number(p.evidence)+1)));used.push({key,profile:p,view,weight});}
  if(!used.length)return null;
  const w=used.reduce((a,x)=>a+x.weight,0)||1,weighted=(field,allowNull=false)=>{const rows=used.filter(x=>x.view[field]!=null&&Number.isFinite(Number(x.view[field])));if(!rows.length)return allowNull?null:0;const rw=rows.reduce((a,x)=>a+x.weight,0)||1;return rows.reduce((a,x)=>a+Number(x.view[field])*x.weight,0)/rw;};
  const evidence=Math.max(...used.map(x=>Number(x.view.economicEvidence||0)),0),historyEvidence=Math.max(...used.map(x=>Number(x.profile.evidence||0)),0);
  return{key:used[0].key,profiles:used.map(x=>x.key),evidence:historyEvidence,economicEvidence:evidence,economicScore:Number(weighted('economicScore').toFixed(2)),economicConfidence:Number(weighted('economicConfidence').toFixed(4)),targetHitProbability:weighted('targetHitProbability',true),breakEvenTargetHitProbability:weighted('breakEvenTargetHitProbability',true),expectedNetPerContractCents:Number(weighted('expectedNetPerContractCents').toFixed(6)),rawExpectedNetPerContractCents:Number(weighted('rawExpectedNetPerContractCents').toFixed(6)),avgNetPerContractCents:weighted('avgNetPerContractCents',true),avgFailureNetPerContractCents:Number(weighted('avgFailureNetPerContractCents').toFixed(6)),avgReturnRatio:weighted('avgReturnRatio',true),avgMaeCents:weighted('avgMaeCents',true)};
}
function featureFit(concept,f={},context={}){
  const v15=commandFinite(f.velocity15CentsPerSec),v30=commandFinite(f.velocity30CentsPerSec),rise=commandFinite(f.momentumRiseCents),pull=commandFinite(f.momentumPullbackCents),wave=commandFinite(f.waveFavorableMoveCents),crash=commandFinite(f.crashDepthCents),rebound=commandFinite(f.reboundCents),reclaim=commandFinite(f.reclaimRate),up=commandFinite(f.currentUpwardTicks??f.upwardTicks),lower=commandFinite(f.currentLowerLowCount??f.lowerLowCount),spread=commandFinite(f.spreadCents,99);
  if(concept==='Recovery Hunter'){if(!context?.recoveryContext?.eligible)return -100;return commandClamp(50+Math.min(24,rebound*4)+Math.min(10,up*3)-Math.min(16,lower*4)-Math.min(8,spread*2));}
  if(concept==='Momentum Hunter')return commandClamp(50+Math.min(24,Math.max(0,v15)*18)+Math.min(16,rise*4)+Math.min(8,up*2)-Math.min(18,pull*3)-Math.min(12,lower*3));
  if(concept==='Wave Surfer')return commandClamp(50+Math.min(20,wave*3)+Math.min(14,rebound*3)+Math.min(10,Math.max(0,v30)*12)+Math.min(6,pull*1.5)-Math.min(14,lower*3));
  if(concept==='Crash Recovery Hunter')return commandClamp(45+Math.min(24,crash*1.2)+Math.min(22,rebound*3)+Math.min(14,reclaim*18)+Math.min(8,up*2)-Math.min(20,lower*4));
  return 0;
}

export function rankAthenaAttacks(bolt,settings={},memory=null,context={}){
  const f=bolt?.features||{},eligible=new Map((f.eligibleAttacks||[]).map(x=>[String(x.concept),x])),rows=[];
  const target=Math.max(0.01,commandFinite(settings.infinityBreakMinNetPerOriginalContractCents,INFINITY_BREAK.defaultMinimumNetPerOriginalContractCents));
  const maturity=Math.max(1,commandFinite(ATHENA_COMMANDER.certifiedEconomicMaturityObservations,5));
  const partialMinimum=Math.max(1,commandFinite(ATHENA_COMMANDER.partialCertifiedEconomicMinimumObservations,3));
  for(const concept of COMMAND_ATTACKS){
    const map=COMMAND_SETTING_MAP[concept],band=eligible.get(concept);if(!map||settings?.[map.enabled]!==true||!band)continue;
    // R65 Gemini-direct Attacks are never selectable by the ordinary
    // Bolt/Athena commander. Their dedicated routers build sealed FIRE
    // commands only after LP2 or AE2 qualification.
    if(concept==='Lightning Plasma'||concept==='Athena Exclamation')continue;
    if(band.targetFeasible===false)continue;
    if(concept==='Recovery Hunter'&&!context?.recoveryContext?.eligible)continue;
    if(context?.entryAdmission?.eventCapBlocked===true)continue;
    const admission=context?.entryAdmission||{};
    const attackCooldown=admission.cooldownScope==='attack'&&Array.isArray(admission.cooldownBlockedConcepts)&&admission.cooldownBlockedConcepts.includes(concept);
    if(admission.cooldownBlocked===true||attackCooldown)continue;
    const fit=featureFit(concept,f,context),legacy=memoryEvidence(memory,concept,f,target),certified=memoryEvidence(memory,concept,f,target,{certifiedOnly:true}),targetFeasibility=commandClamp(band.targetFeasibilityScore??f.targetFeasibilityScore??50);
    const liveScore=fit*0.72+targetFeasibility*0.28;
    const certifiedEvidence=commandFinite(certified?.economicEvidence,0),legacyEvidence=commandFinite(legacy?.economicEvidence,0);
    const certifiedMature=certifiedEvidence>=maturity,certifiedPartial=certifiedEvidence>=partialMinimum;
    let authorityMode='ATB2_A8_CERTIFIED_COLD_START',economicWeight=0,economicScore=50;
    if(certifiedMature){
      authorityMode='ATB2_A8_CERTIFIED_MATURE';economicScore=certified?.economicScore??50;
      economicWeight=certifiedEvidence>=20?0.72:certifiedEvidence>=8?0.62:0.50;
    }else if(certifiedPartial){
      authorityMode='ATB2_A8_CERTIFIED_PARTIAL';economicScore=certified?.economicScore??50;
      economicWeight=Math.max(0,Math.min(0.60,commandFinite(ATHENA_COMMANDER.partialCertifiedEconomicDecisionWeight,0.45)));
    }else if(legacy){
      // Legacy/mixed history survives only as a deliberately small cold-start
      // prior. It may order otherwise-similar candidates, but it cannot dominate
      // the current live fit or reacquire a negative-EV veto over the new chain.
      economicScore=legacy.economicScore??50;
      economicWeight=Math.max(0,Math.min(0.25,commandFinite(ATHENA_COMMANDER.coldStartLegacyPriorDecisionWeight,0.10)));
    }
    let score=economicScore*economicWeight+liveScore*(1-economicWeight);
    const certifiedExpected=certified?.expectedNetPerContractCents??null,certifiedQualified=!certifiedMature||commandFinite(certifiedExpected,0)>0;
    if(certifiedMature&&!certifiedQualified)score-=Math.min(18,4+Math.abs(commandFinite(certifiedExpected,0))*1.25);
    const legacyExpected=legacy?.expectedNetPerContractCents??0,legacyMature=legacyEvidence>=maturity,legacyQualified=!legacyMature||legacyExpected>0;
    rows.push({
      concept,displayName:EXECUTION_ATTACK_DISPLAY[concept]?.name||concept,score:Number(commandClamp(score).toFixed(2)),fitScore:Number(fit.toFixed(2)),liveScore:Number(liveScore.toFixed(2)),
      economicAuthorityMode:authorityMode,economicDecisionWeight:Number(economicWeight.toFixed(4)),economicScore:Number(economicScore.toFixed(2)),economicEvidence:certifiedEvidence,economicQualified:certifiedQualified,economicMature:certifiedMature,
      certifiedEconomicEvidence:certifiedEvidence,certifiedEconomicQualified:certifiedQualified,certifiedEconomicMature:certifiedMature,certifiedEconomicScore:certified?.economicScore??null,certifiedExpectedNetPerOriginalContractCents:certifiedExpected==null?null:Number(certifiedExpected.toFixed(6)),certifiedTargetHitProbability:certified?.targetHitProbability==null?null:Number(certified.targetHitProbability.toFixed(6)),certifiedProfiles:certified?.profiles||[],
      legacyEconomicEvidence:legacyEvidence,legacyEconomicQualified:legacyQualified,legacyEconomicMature:legacyMature,legacyEconomicScore:legacy?.economicScore??null,legacyExpectedNetPerOriginalContractCents:Number(legacyExpected.toFixed(6)),legacyTargetHitProbability:legacy?.targetHitProbability==null?null:Number(legacy.targetHitProbability.toFixed(6)),legacyBreakEvenTargetHitProbability:legacy?.breakEvenTargetHitProbability==null?null:Number(legacy.breakEvenTargetHitProbability.toFixed(6)),legacyProfiles:legacy?.profiles||[],
      // Compatibility aliases now describe the *authoritative* certified
      // population rather than the legacy mixed population.
      expectedNetPerOriginalContractCents:certifiedExpected==null?null:Number(certifiedExpected.toFixed(6)),rawExpectedNetPerOriginalContractCents:certified?.rawExpectedNetPerContractCents==null?null:Number(certified.rawExpectedNetPerContractCents.toFixed(6)),targetHitProbability:certified?.targetHitProbability==null?null:Number(certified.targetHitProbability.toFixed(6)),breakEvenTargetHitProbability:certified?.breakEvenTargetHitProbability==null?null:Number(certified.breakEvenTargetHitProbability.toFixed(6)),averageFailureNetPerOriginalContractCents:certified?.avgFailureNetPerContractCents??null,averageNetPerOriginalContractCents:certified?.avgNetPerContractCents??null,averageReturnRatio:certified?.avgReturnRatio??null,averageMaeCents:certified?.avgMaeCents??null,
      historyScore:legacy?.economicScore??50,historyEvidence:legacy?.evidence||0,historyProfile:legacy?.key||null,historyProfiles:legacy?.profiles||[],
      targetNetPerOriginalContractCents:target,targetFeasibilityScore:Number(targetFeasibility.toFixed(2)),requiredTargetBidCents:commandMaybeFinite(band.requiredTargetBidCents),requiredGrossMoveCents:commandMaybeFinite(band.requiredGrossMoveCents),estimatedEntryFeePerContractCents:commandMaybeFinite(band.estimatedEntryFeePerContractCents),estimatedExitFeePerContractCents:commandMaybeFinite(band.estimatedExitFeePerContractCents),stakeCents:commandFinite(settings[map.stake],0),operatorMinEntryCents:commandFinite(settings[map.min],0),operatorMaxEntryCents:commandFinite(settings[map.max],100),
    });
  }
  return rows.sort((a,b)=>b.score-a.score||Number(b.liveScore)-Number(a.liveScore)||Number(b.certifiedEconomicQualified)-Number(a.certifiedEconomicQualified)||Number(b.certifiedTargetHitProbability??-1)-Number(a.certifiedTargetHitProbability??-1)||a.concept.localeCompare(b.concept));
}

function survivalConditionedEconomics({memory,best,bolt,certificate,settings}={}){
  const target=Math.max(0.01,commandFinite(settings?.infinityBreakMinNetPerOriginalContractCents,INFINITY_BREAK.defaultMinimumNetPerOriginalContractCents));
  const certified=memoryEvidence(memory,best?.concept,bolt?.features||{},target,{certifiedOnly:true});
  const maturity=Math.max(1,commandFinite(ATHENA_COMMANDER.certifiedEconomicMaturityObservations,5));
  const certifiedEvidence=commandFinite(certified?.economicEvidence,0);
  if(certifiedEvidence>=maturity){
    const expected=commandFinite(certified?.expectedNetPerContractCents,0),qualified=expected>0;
    return{mode:'ATB2_A8_CERTIFIED_MATURE',qualified,reason:qualified?'atb2_a8_certified_positive_expected_economic_value':'atb2_a8_certified_negative_expected_economic_value',evidence:certifiedEvidence,targetHitProbability:certified?.targetHitProbability??null,breakEvenTargetHitProbability:certified?.breakEvenTargetHitProbability??null,expectedNetPerOriginalContractCents:Number(expected.toFixed(6)),rawExpectedNetPerOriginalContractCents:certified?.rawExpectedNetPerContractCents??null,averageFailureNetPerOriginalContractCents:certified?.avgFailureNetPerContractCents??null,profiles:certified?.profiles||[]};
  }
  // Cold start means exactly that: the new ATB2+A8 population is not mature.
  // Legacy mixed history remains visible as a prior, but it may neither raise
  // A8's survival threshold nor veto a certified present-state candidate.
  const requiredSurvival=commandFinite(certificate?.requiredSurvivalScore,70);
  // R59/A3-C1: before the clean ATB2+A8 cohort is mature there is no causal EV
  // evidence that can justify a second hand-built price-path veto. ATB2 already
  // owns dangerous history and A8 already certified the present state. Athena
  // therefore requires only economic target reachability plus a valid Bolt;
  // live fit remains a ranking signal, never a cold-start execution veto.
  const targetFloor=45,boltFloor=45;
  const qualified=commandFinite(certificate?.survivalScore,0)>=requiredSurvival&&commandFinite(best?.targetFeasibilityScore,0)>=targetFloor&&commandFinite(bolt?.score,0)>=boltFloor;
  return{mode:'ATB2_A8_CERTIFIED_COLD_START',qualified,reason:qualified?'atb2_a8_certified_cold_start_feasible':'atb2_a8_certified_cold_start_economic_target_unready',evidence:certifiedEvidence,targetHitProbability:null,breakEvenTargetHitProbability:null,expectedNetPerOriginalContractCents:null,rawExpectedNetPerOriginalContractCents:null,averageFailureNetPerOriginalContractCents:null,profiles:certified?.profiles||[],requiredSurvivalScore:requiredSurvival,observedSurvivalScore:commandFinite(certificate?.survivalScore,0),targetFeasibilityFloor:targetFloor,boltScoreFloor:boltFloor,legacyPrior:{mature:best?.legacyEconomicMature===true,qualified:best?.legacyEconomicQualified===true,expectedNetPerOriginalContractCents:best?.legacyExpectedNetPerOriginalContractCents??null,targetHitProbability:best?.legacyTargetHitProbability??null,breakEvenTargetHitProbability:best?.legacyBreakEvenTargetHitProbability??null}};
}


export class AthenaCommander{
  constructor({db,systemName='SAGITTARIUS',sourceRelease='',getSettings=()=>({}),audit=async()=>{},legacyAthena=null}={}){
    this.db=db;this.systemName=systemName;this.sourceRelease=sourceRelease;this.getSettings=getSettings;this.audit=audit;this.legacyAthena=legacyAthena;this.memory=compileAthenaAttackMemory();this.loadedAtMs=0;this.decisions=0;this.fire=0;this.watch=0;this.reject=0;this.expired=0;this.survivalCertified=0;this.survivalRejected=0;this.lastSurvivalCertificate=null;this.lastDecision=null;this.trainedEpisodeIds=new Set();this.knownEntryIds=new Set();this.knownProfitEpisodeIds=new Set();this.memoryRefreshPromise=null;this.memoryMutationVersion=0;this.memoryLoad={state:'IDLE',startedAtMs:0,completedAtMs:0,lastError:null,attempts:0,discardedStaleLoads:0};
  }
  async loadHistoricalMemory(){
    const entryReader=typeof this.db?.athenaEconomicEntries==='function'?this.db.athenaEconomicEntries.bind(this.db):this.db?.entries?.bind(this.db);
    const episodeReader=typeof this.db?.athenaEconomicOpportunityEpisodes==='function'?this.db.athenaEconomicOpportunityEpisodes.bind(this.db):this.db?.opportunityEpisodes?.bind(this.db);
    const profitReader=typeof this.db?.athenaEconomicProfitEpisodes==='function'?this.db.athenaEconomicProfitEpisodes.bind(this.db):this.db?.profitEpisodes?.bind(this.db);
    if(typeof entryReader!=='function'||typeof episodeReader!=='function')throw new Error('Athena C2 persistence readers are required');
    const startedAtMs=Date.now(),mutationVersionAtStart=this.memoryMutationVersion;
    this.memoryLoad={...this.memoryLoad,state:'LOADING',startedAtMs,completedAtMs:0,lastError:null,attempts:Number(this.memoryLoad?.attempts||0)+1};
    try{
      const entries=await entryReader(this.systemName,{limit:20_000,includeArchived:true});
      const episodes=await episodeReader(this.systemName,{limit:20_000,trackingComplete:true});
      const profitEpisodes=typeof profitReader==='function'?await profitReader(this.systemName,{complete:null,limit:20_000}).catch(()=>[]):[];
      const compiled=compileAthenaAttackMemory({entries,episodes,profitEpisodes});
      if(this.memoryMutationVersion!==mutationVersionAtStart){
        this.memoryLoad={...this.memoryLoad,state:'STALE_DISCARDED',completedAtMs:Date.now(),lastError:null,discardedStaleLoads:Number(this.memoryLoad?.discardedStaleLoads||0)+1};
        await this.audit('athena_c2_memory_load_stale_discarded',{mutationVersionAtStart,currentMutationVersion:this.memoryMutationVersion,entryRows:entries.length,opportunityRows:episodes.length,profitEpisodeRows:profitEpisodes.length,policy:'keep_live_ranking_memory_and_retry'}).catch(()=>{});
        return this.memory;
      }
      this.memory=compiled;this.loadedAtMs=Date.now();
      this.trainedEpisodeIds=new Set((episodes||[]).filter(x=>x?.trackingComplete&&x?.id).map(x=>String(x.id)));
      this.knownEntryIds=new Set((entries||[]).filter(x=>x?.id).map(x=>String(x.id)));
      this.knownProfitEpisodeIds=new Set((profitEpisodes||[]).filter(x=>x?.id).map(x=>String(x.id)));
      this.memoryLoad={...this.memoryLoad,state:'READY',completedAtMs:Date.now(),lastError:null};
      await this.audit('athena_c2_memory_initialized',{entryRows:entries.length,opportunityRows:episodes.length,profitEpisodeRows:profitEpisodes.length,profileCount:Object.keys(this.memory.profiles).length,certifiedProfileCount:Object.keys(this.memory.certifiedProfiles||{}).length,certifiedEntryRows:this.memory.certifiedEntryRows||0,certifiedOpportunityRows:this.memory.certifiedOpportunityRows||0,economicObjective:ATHENA_COMMANDER.economicObjective,rawTrainingRowsRetained:0,compactTrainingReaders:typeof this.db?.athenaEconomicEntries==='function',entryAuthorityBlockedUntilLoaded:false}).catch(()=>{});
      return this.memory;
    }catch(error){
      this.memoryLoad={...this.memoryLoad,state:'FAILED',completedAtMs:Date.now(),lastError:String(error?.message||error)};
      await this.audit('athena_c2_memory_initialization_failed',{message:String(error?.message||error),policy:'ranking_memory_optional_trading_continues_neutral_live_fit'},'warning').catch(()=>{});
      throw error;
    }
  }
  async init({background=false}={}){
    if(background){void this.refreshLearning().catch(()=>{});return this.memory;}
    return this.refreshLearning();
  }
  async refreshLearning(){
    if(this.memoryRefreshPromise)return this.memoryRefreshPromise;
    const run=this.loadHistoricalMemory();this.memoryRefreshPromise=run;
    try{return await run;}finally{if(this.memoryRefreshPromise===run)this.memoryRefreshPromise=null;}
  }
  async learnEpisode(episode){
    const id=String(episode?.id||'');if(!id||episode?.trackingComplete!==true||this.trainedEpisodeIds.has(id))return this.memory;
    const entry=episode?.entryId&&typeof this.db?.entryById==='function'?await this.db.entryById(String(episode.entryId)).catch(()=>null):null;
    const profit=episode?.entryId&&typeof this.db?.profitEpisode==='function'?await this.db.profitEpisode(String(episode.entryId)).catch(()=>null):null;
    const cloneProfiles=(source)=>new Map(Object.entries(source||{}).map(([k,p])=>[k,{...p,targetSamples:{...(p?.targetSamples||{})},targetHits:{...(p?.targetHits||{})}}]));
    const profiles=cloneProfiles(this.memory?.profiles),certifiedProfiles=cloneProfiles(this.memory?.certifiedProfiles);
    const sourceReleases=new Set(this.memory?.sourceReleases||[]),cohortIds=new Set(this.memory?.cohortIds||[]);
    const added=addEpisodeEconomicObservation(profiles,episode,{entry,profit,sourceReleases,cohortIds});if(!added)return this.memory;
    const certified=arayashikiCertifiedArtifact({entry,episode});if(certified)addEpisodeEconomicObservation(certifiedProfiles,episode,{entry,profit,sourceReleases:new Set(),cohortIds:new Set()});
    const entryId=String(entry?.id||episode?.entryId||''),profitId=String(profit?.id||'');
    const newEntry=entryId&&!this.knownEntryIds.has(entryId);
    const entryRows=Number(this.memory?.entryRows||0)+(newEntry?1:0);
    const profitEpisodeRows=Number(this.memory?.profitEpisodeRows||0)+(profitId&&!this.knownProfitEpisodeIds.has(profitId)?1:0);
    this.memory=finalizeAthenaAttackMemory({profiles,certifiedProfiles,entryRows,opportunityRows:Number(this.memory?.opportunityRows||0)+1,profitEpisodeRows,certifiedEntryRows:Number(this.memory?.certifiedEntryRows||0)+(certified&&newEntry?1:0),certifiedOpportunityRows:Number(this.memory?.certifiedOpportunityRows||0)+(certified?1:0),sourceReleases,cohortIds});
    this.memoryMutationVersion+=1;
    this.trainedEpisodeIds.add(id);if(entryId)this.knownEntryIds.add(entryId);if(profitId)this.knownProfitEpisodeIds.add(profitId);
    while(this.trainedEpisodeIds.size>25_000)this.trainedEpisodeIds.delete(this.trainedEpisodeIds.values().next().value);
    while(this.knownEntryIds.size>25_000)this.knownEntryIds.delete(this.knownEntryIds.values().next().value);
    while(this.knownProfitEpisodeIds.size>25_000)this.knownProfitEpisodeIds.delete(this.knownProfitEpisodeIds.values().next().value);
    await this.audit('athena_c2_continuous_learning_updated',{opportunityId:id,outcomeLabel:episode.outcomeLabel,attackSelected:episode.attackSelected,profileCount:Object.keys(this.memory.profiles).length,rawTrainingRowsRetained:0,incremental:true}).catch(()=>{});return this.memory;
  }
  async decide(bolt,context={}){
    const now=Date.now(),settings=this.getSettings(),target=Math.max(0.01,commandFinite(settings.infinityBreakMinNetPerOriginalContractCents,1));this.decisions+=1;
    let decision='REJECT',reason='no_executable_attack',ranking=[],fireCommand=null;
    if(!bolt||!bolt.id){reason='bolt_required';this.reject+=1;}
    else if(now>Number(bolt.expiresAtMs||0)){decision='EXPIRED';reason='bolt_expired';this.expired+=1;}
    else{
      ranking=rankAthenaAttacks(bolt,settings,this.memory,context);
      const immediate=ranking[0]||null;
      if(immediate){decision='FIRE';reason='cosmo_green_best_attack';this.fire+=1;}
      else this.reject+=1;
    }
    const best=ranking[0]||null;
    if(decision==='FIRE'&&best){
      const currentAsk=commandFinite(bolt.features?.askCents,0),chase=best.score>=85?1:0,authorizedMaxEntryCents=Math.min(best.operatorMaxEntryCents,currentAsk+chase);
      const isPlasma=best.concept==='Lightning Plasma',fieldBudgetCents=isPlasma?best.stakeCents:null,executionStakeCents=isPlasma&&Number(context?.fieldContext?.rayStakeCents)>0?Math.min(best.stakeCents,Number(context.fieldContext.rayStakeCents)):best.stakeCents;
      const economicTarget={version:'ATHENA-A3-ECONOMIC-TARGET-V4-COSMO-GREEN',authorityMode:'COSMO_GREEN_DIRECT',netPerOriginalContractCents:target,requiredTargetBidCents:best.requiredTargetBidCents,requiredGrossMoveCents:best.requiredGrossMoveCents,estimatedEntryFeePerContractCents:best.estimatedEntryFeePerContractCents,estimatedExitFeePerContractCents:best.estimatedExitFeePerContractCents,targetFeasibilityScore:best.targetFeasibilityScore,targetHitProbability:best.certifiedTargetHitProbability??best.legacyTargetHitProbability??null,breakEvenTargetHitProbability:best.breakEvenTargetHitProbability??null,expectedNetPerOriginalContractCents:best.certifiedExpectedNetPerOriginalContractCents??best.legacyExpectedNetPerOriginalContractCents??null,economicEvidence:best.certifiedEconomicEvidence??0,economicQualified:true,rankingOnlyHistory:true};
      const core={version:ATHENA_COMMANDER.version,policyRevision:ATHENA_COMMANDER.policyRevision,boltId:bolt.id,boltFingerprint:bolt.fingerprint||null,systemName:this.systemName,sourceRelease:this.sourceRelease,decidedAtMs:now,expiresAtMs:Number(bolt.expiresAtMs||now),ticker:bolt.ticker,eventTicker:bolt.eventTicker,side:'YES',selectedAttack:best.concept,selectedAttackDisplay:best.displayName,stakeCents:executionStakeCents,fieldBudgetCents,maxRays:isPlasma?Math.max(1,Math.floor(Number(settings.lightningPlasmaMaxStrikes||1))):null,operatorMinEntryCents:best.operatorMinEntryCents,operatorMaxEntryCents:best.operatorMaxEntryCents,entryPriceCents:currentAsk,authorizedMaxEntryCents,maxSpreadCents:Number(settings.maxSpreadCents??3),auroraDamageControlPercent:Number(settings.auroraDamageControlPercent??45),profitAuthority:ATHENA_EXIT_INTELLIGENCE.version,infinityBreakPolicyVersion:null,profitActivationSetting:'infinityBreakMinNetPerOriginalContractCents',economicTarget,survivalCertificate:null,ranking:ranking.slice(0,6),decisionEvidence:{economicObjective:ATHENA_COMMANDER.economicObjective,configuredTargetNetPerOriginalContractCents:target,boltScore:bolt.score,greenTrigger:structuredClone(bolt.greenTrigger||null),features:bolt.features,preBoltClearance:structuredClone(bolt.preBoltClearance||null),historicalMemoryVersion:this.memory.version,historyRole:'RANKING_ONLY_NO_VETO',predictiveReVetoAllowed:false,recoveryContext:context?.recoveryContext||null,fieldContext:context?.fieldContext||null}};
      fireCommand=sealAthenaFireCommand(core);
    }
    let result={version:ATHENA_COMMANDER.version,policyRevision:ATHENA_COMMANDER.policyRevision,decision,reason,decidedAtMs:now,boltId:bolt?.id||null,ticker:bolt?.ticker||null,ranking,selectedAttack:best?.concept||null,selectedAttackDisplay:best?.displayName||null,fireCommand,economicObjective:ATHENA_COMMANDER.economicObjective,configuredTargetNetPerOriginalContractCents:target,strategicAuthority:true,legacyB2VetoApplied:false,durableFireRequired:true,survivalCertificate:null,survivalConditionedEconomics:null};
    let persisted=false;
    if(typeof this.db?.upsertOpportunityEpisode==='function'&&bolt?.id){try{await this.db.upsertOpportunityEpisode({id:bolt.id,systemName:this.systemName,sourceRelease:this.sourceRelease,cohortId:String(settings.resetTimestampMs||''),ticker:bolt.ticker,eventTicker:bolt.eventTicker,side:'YES',sport:bolt.sport||bolt.features?.sport||'Unknown',boltAtMs:bolt.detectedAtMs,boltSnapshot:bolt,athenaDecision:result,fireCommand:fireCommand||{},attackSelected:best?.concept||null,updatedAtMs:now});persisted=true;}catch(error){await this.audit('athena_a3_decision_persistence_failed',{boltId:bolt.id,ticker:bolt.ticker,decision,message:String(error?.message||error)},'error').catch(()=>{});}}
    if(decision==='FIRE'&&!persisted){this.fire=Math.max(0,this.fire-1);this.reject+=1;decision='REJECT';reason='fire_persistence_failed';fireCommand=null;result={...result,decision,reason,fireCommand:null,selectedAttack:best?.concept||null,selectedAttackDisplay:best?.displayName||null,durableFirePersisted:false};}else result={...result,durableFirePersisted:persisted};
    this.lastDecision=result;await this.audit('athena_a3_decision',{boltId:bolt?.id||null,ticker:bolt?.ticker||null,decision,reason,selectedAttack:best?.concept||null,bestScore:best?.score||null,historyRole:'RANKING_ONLY_NO_VETO',configuredTargetNetPerOriginalContractCents:target,durableFirePersisted:persisted}).catch(()=>{});return result;
  }
  summary(){return{version:ATHENA_COMMANDER.version,policyRevision:ATHENA_COMMANDER.policyRevision,role:ATHENA_COMMANDER.role,economicObjective:ATHENA_COMMANDER.economicObjective,targetAwareAttackSelection:true,entryDecisionAuthority:true,attackSelectionAuthority:true,attackStrategicRevalidationAllowed:false,loadedAtMs:this.loadedAtMs,memory:{version:this.memory.version,memoryHash:this.memory.memoryHash,entryRows:this.memory.entryRows,opportunityRows:this.memory.opportunityRows,profitEpisodeRows:this.memory.profitEpisodeRows,profileCount:Object.keys(this.memory.profiles||{}).length,certifiedProfileCount:Object.keys(this.memory.certifiedProfiles||{}).length,certifiedEntryRows:this.memory.certifiedEntryRows||0,certifiedOpportunityRows:this.memory.certifiedOpportunityRows||0,sourceReleaseCount:this.memory.sourceReleases?.length||0,cohortCount:this.memory.cohortIds?.length||0,rawTrainingRowsRetained:0,load:{...this.memoryLoad},mutationVersion:this.memoryMutationVersion,entryAuthorityBlockedUntilLoaded:false},decisions:this.decisions,fire:this.fire,watch:this.watch,reject:this.reject,expired:this.expired,survivalCertified:this.survivalCertified,survivalRejected:this.survivalRejected,arayashiki:{version:ARAYASHIKI.version,policyRevision:ARAYASHIKI.policyRevision,role:ARAYASHIKI.role,noEvidencePolicy:ARAYASHIKI.noEvidencePolicy,certificateTtlMs:ARAYASHIKI.certificateTtlMs,lastCertificate:this.lastSurvivalCertificate},lastDecision:this.lastDecision,scarletNeedle:{version:SCARLET_NEEDLE.version,role:SCARLET_NEEDLE.role,strategicAuthority:false,managedBy:'ENGINE_POST_PROFIT_CLOSE_HANDOFF',retracementAuthority:false},legacyHistoricalBrain:this.legacyAthena?.summary?.()||null};}
}
