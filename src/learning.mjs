import { randomUUID } from 'node:crypto';
import { RECOVERY_MARKET_DROP_CENTS, ULTIMATE_STOP_GUARD, STOP_LOSS_WATCHDOG, STOP_GUARD_RECOVERY_LEARNING, PROFIT_LEARNING_INTELLIGENCE, PROTECTED_RUNNER_INTELLIGENCE, goldenDragonStructureQualifiedAtQuote } from './doctrine.mjs';
import { isConfirmedGameClockState } from './gameClock.mjs';

const minMinutes = (ms) => Math.max(10, Math.round(ms / 60000 * 0.25));

export const SEED_SPORT_PROFILES = [
  ['KXATPMATCH','ATP Tennis',120],['KXATPCHALLENGERMATCH','ATP Challenger Tennis',120],['KXWTAMATCH','WTA Tennis',100],['KXWTACHALLENGERMATCH','WTA Challenger Tennis',100],
  ['KXITFMATCH','ITF Tennis',120],['KXITFWMATCH',"ITF Women's Tennis",100],['KXNBAGAME','NBA Basketball',150],['KXWNBAGAME','WNBA Basketball',130],
  ['KXNHLGAME','NHL Hockey',150],['KXNFLGAME','NFL Football',200],['KXNCAAFGAME','NCAAF Football',200],['KXNCAABGAME','NCAAB Basketball',130],
  ['KXMLBGAME','MLB Baseball',200],['KXSOCCERGAME','Soccer',120],['KXUFCMATCH','UFC MMA',30],['KXNPBGAME','NPB Baseball',200],
].map(([prefix, sportName, min]) => ({ prefix, sportName, typicalDurationMs:min * 60000, minMinutes:minMinutes(min * 60000) }));

export const prefixForTicker = (ticker='') => String(ticker).split('-')[0].toUpperCase();
const EXTRA = [
  [/^KXKBO/,'KBO Baseball',200],[/^KXCPBL/,'CPBL Baseball',200],[/^KXT20|^KXTESTMATCH|CRICKET/,'Cricket',240],
  [/^KXCS2|^KXCSGO/,'CS2',90],[/^KXLOL/,'League of Legends',90],[/^KXVALORANT/,'Valorant',90],
  [/SOCCER|EPL|MLS|NWSL|LALIGA|LIGA2|LIGAMX|BRASILEIRO|ARGPREM|ALLSVENSKAN|UCL|COPPA|DIMAYOR|ECULP|ASEAN/i,'Soccer',120],
  [/^KXWNBA|^KXNBA|NCAAB/,'Basketball',140],[/^KXNFL|NCAAF/,'Football',200],[/^KXMLB|^KXNPB|^KXKBO/,'Baseball',200],
];

export function classifyDeterministic(ticker, title='') {
  const prefix = prefixForTicker(ticker);
  const seed = SEED_SPORT_PROFILES.find((x) => x.prefix === prefix);
  if (seed) return { prefix, sportName:seed.sportName, typicalDurationMs:seed.typicalDurationMs, minMinutes:seed.minMinutes, confidence:'high', source:'manual' };
  const text = `${prefix} ${title}`;
  for (const [re, name, mins] of EXTRA) if (re.test(text)) return { prefix, sportName:name, typicalDurationMs:mins * 60000, minMinutes:minMinutes(mins * 60000), confidence:'low', source:'deterministic' };
  return { prefix, sportName:'Unknown', typicalDurationMs:120 * 60000, minMinutes:30, confidence:'low', source:'deterministic' };
}

const entryBand = (v) => v >= 85 && v <= 89 ? '85-89' : v >= 80 && v <= 84 ? '80-84' : v >= 70 && v <= 79 ? '70-79' : 'other';
const dropBucket = (v) => v <= 10 ? '5-10' : v <= 15 ? '10-15' : '15+';
const gameBucket = (v) => v < 30 ? '0-30' : v < 60 ? '30-60' : '60+';
const troughBucket = (v) => v <= 5 ? '0-5' : v <= 10 ? '5-10' : '10+';
const patternKey = (sport, entry, drop, game, trough) => [sport || 'Unknown', entryBand(entry), dropBucket(drop), gameBucket(game), troughBucket(trough)].join('|');
const avg = (a) => a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0;
const n = (v, d=0) => Number.isFinite(Number(v)) ? Number(v) : d;

// R41 SGRL1 uses a dedicated cohort vocabulary instead of the legacy recovery
// pattern buckets. The current 27-60c research band is represented explicitly,
// and game-time buckets match the user's analysis windows before broad fallback.
export const stopGuardEntryBand = (v) => {
  const x=n(v);
  if(x<27)return '<27';
  if(x<=34)return '27-34';
  if(x<=44)return '35-44';
  if(x<=54)return '45-54';
  if(x<=60)return '55-60';
  if(x<=69)return '61-69';
  if(x<=79)return '70-79';
  if(x<=84)return '80-84';
  if(x<=89)return '85-89';
  return '90+';
};
export const stopGuardDropBucket = (v) => {
  const x=Math.max(0,n(v));
  if(x<10)return '0-9';
  if(x<20)return '10-19';
  if(x<30)return '20-29';
  if(x<40)return '30-39';
  return '40+';
};
export const stopGuardGameBucket = (v) => {
  const x=Math.max(0,n(v));
  if(x<20)return '<20';
  if(x<30)return '20-29';
  if(x<40)return '30-39';
  if(x<50)return '40-49';
  if(x<60)return '50-59';
  if(x<90)return '60-89';
  return '90+';
};
export const stopGuardCrashBucket = (state={}) => {
  const phase=String(state?.phase||'').toUpperCase();
  const lower=n(state?.lowerLowCount);
  const rebound=n(state?.reboundCents);
  const upward=n(state?.upwardTicks);
  if(phase==='CRASHING'&&lower>=2&&rebound<STOP_LOSS_WATCHDOG.minimumReboundCents&&upward===0)return 'CRASHING_LOWER_LOW';
  if(phase==='CRASHING')return 'CRASHING';
  if(phase==='REBOUND_CONFIRMED')return 'REBOUND_CONFIRMED';
  if(phase==='NORMAL')return 'NORMAL';
  return 'UNKNOWN';
};

export function stopGuardRecoveryProfileKeys({conceptName='Unknown',sourceFeeder=null,sport='Unknown',entryPriceCents=0,totalDropCents=0,gameMinutes=0,crashBucket='UNKNOWN'}={}){
  const concept=String(conceptName||'Unknown');
  const source=String(sourceFeeder||'none');
  const sp=String(sport||'Unknown');
  const entry=stopGuardEntryBand(entryPriceCents);
  const drop=stopGuardDropBucket(totalDropCents);
  const game=stopGuardGameBucket(gameMinutes);
  const crash=String(crashBucket||'UNKNOWN');
  const key=(specificity,...parts)=>`${STOP_GUARD_RECOVERY_LEARNING.version}|${specificity}|${parts.join('|')}`;
  return [
    {specificity:'exact',profileKey:key('exact',concept,source,sp,entry,drop,game,crash),conceptName:concept,sourceFeeder:source==='none'?null:source,sport:sp,entryBand:entry,dropBucket:drop,gameBucket:game,crashBucket:crash},
    {specificity:'concept_source_entry_drop_game_crash',profileKey:key('concept_source_entry_drop_game_crash',concept,source,entry,drop,game,crash),conceptName:concept,sourceFeeder:source==='none'?null:source,sport:null,entryBand:entry,dropBucket:drop,gameBucket:game,crashBucket:crash},
    {specificity:'concept_sport_entry_drop_game',profileKey:key('concept_sport_entry_drop_game',concept,sp,entry,drop,game),conceptName:concept,sourceFeeder:null,sport:sp,entryBand:entry,dropBucket:drop,gameBucket:game,crashBucket:null},
    {specificity:'concept_entry_drop_game',profileKey:key('concept_entry_drop_game',concept,entry,drop,game),conceptName:concept,sourceFeeder:null,sport:null,entryBand:entry,dropBucket:drop,gameBucket:game,crashBucket:null},
    {specificity:'concept_entry_drop',profileKey:key('concept_entry_drop',concept,entry,drop),conceptName:concept,sourceFeeder:null,sport:null,entryBand:entry,dropBucket:drop,gameBucket:null,crashBucket:null},
    {specificity:'concept_drop',profileKey:key('concept_drop',concept,drop),conceptName:concept,sourceFeeder:null,sport:null,entryBand:null,dropBucket:drop,gameBucket:null,crashBucket:null},
    {specificity:'entry_drop',profileKey:key('entry_drop',entry,drop),conceptName:null,sourceFeeder:null,sport:null,entryBand:entry,dropBucket:drop,gameBucket:null,crashBucket:null},
    {specificity:'global_drop',profileKey:key('global_drop',drop),conceptName:null,sourceFeeder:null,sport:null,entryBand:null,dropBucket:drop,gameBucket:null,crashBucket:null},
  ];
}

export function advanceStopGuardRecoveryState(priorState={}, episode={}, observation={}, now=Date.now()){
  const state=priorState&&priorState.version===STOP_GUARD_RECOVERY_LEARNING.version
    ? structuredClone(priorState)
    : {version:STOP_GUARD_RECOVERY_LEARNING.version,createdAtMs:n(episode.triggerAtMs,now),lastObservedAtMs:0,lastExecutableBidCents:null,lastExecutableNetCents:null,maxExecutableBidCents:null,maxExecutableNetCents:null,minExecutableBidCents:null,firstPositiveAtMs:null,positiveConfirmations:0,recoveryPriceCents:null,recoveryNetCents:null,recovered:false,recoveryAtMs:null,trackingComplete:false,completionReason:null,finalResult:null,samples:0};
  if(state.trackingComplete)return state;
  const observedAt=Math.max(1,n(observation.observedAtMs,now));
  if(observedAt<=n(state.lastObservedAtMs))return state;
  if(observation.final!==true&&(!observation.fullExecutable||!Number.isFinite(Number(observation.executableBidCents))||!Number.isFinite(Number(observation.executableNetCents))))return state;
  state.lastObservedAtMs=observedAt;
  if(observation.final===true){
    const net=n(observation.settlementNetCents,Number.NEGATIVE_INFINITY);
    const count=Math.max(1,n(episode.originalCount,1));
    const qualified=Number.isFinite(net)&&net/count+1e-12>=STOP_GUARD_RECOVERY_LEARNING.minimumNetPerOriginalContractCents;
    state.finalResult=String(observation.finalResult||'').toLowerCase()||null;
    state.recovered=qualified;
    state.recoveryAtMs=qualified?observedAt:null;
    state.recoveryPriceCents=qualified?n(observation.settlementPriceCents):null;
    state.recoveryNetCents=qualified?net:null;
    state.trackingComplete=true;
    state.completionReason=qualified?'settlement_economic_recovery':'market_final_without_economic_recovery';
    return state;
  }
  const bid=n(observation.executableBidCents),net=n(observation.executableNetCents);
  const count=Math.max(1,n(episode.originalCount,1));
  state.samples=n(state.samples)+1;
  state.lastExecutableBidCents=bid;
  state.lastExecutableNetCents=net;
  state.maxExecutableBidCents=state.maxExecutableBidCents==null?bid:Math.max(n(state.maxExecutableBidCents),bid);
  state.minExecutableBidCents=state.minExecutableBidCents==null?bid:Math.min(n(state.minExecutableBidCents),bid);
  state.maxExecutableNetCents=state.maxExecutableNetCents==null?net:Math.max(n(state.maxExecutableNetCents),net);
  const positive=net/count+1e-12>=STOP_GUARD_RECOVERY_LEARNING.minimumNetPerOriginalContractCents;
  if(!positive){state.firstPositiveAtMs=null;state.positiveConfirmations=0;return state;}
  if(!n(state.firstPositiveAtMs)){state.firstPositiveAtMs=observedAt;state.positiveConfirmations=1;}
  else state.positiveConfirmations=n(state.positiveConfirmations)+1;
  const durable=n(state.positiveConfirmations)>=STOP_GUARD_RECOVERY_LEARNING.minimumPositiveConfirmations
    && observedAt-n(state.firstPositiveAtMs)>=STOP_GUARD_RECOVERY_LEARNING.minimumPositiveDurationMs;
  if(durable){
    state.recovered=true;state.recoveryAtMs=observedAt;state.recoveryPriceCents=bid;state.recoveryNetCents=net;
    state.trackingComplete=true;state.completionReason='durable_full_executable_fee_adjusted_recovery';
  }
  return state;
}

function aggregateStopGuardRows(rows = []) {
  const total = rows.reduce((s, x) => s + n(x.total_observations), 0);
  const recovered = rows.reduce((s, x) => s + n(x.recovered_count), 0);
  const alpha = ULTIMATE_STOP_GUARD.betaPriorAlpha;
  const beta = ULTIMATE_STOP_GUARD.betaPriorBeta;
  const smoothedRate = (recovered + alpha) / Math.max(1, total + alpha + beta);
  const recoveryWeight = rows.reduce((s, x) => s + Math.max(0, n(x.recovered_count)), 0);
  const avgRecoveryTimeMs = recoveryWeight > 0
    ? rows.reduce((s, x) => s + Math.max(0, n(x.avg_time_to_recover_ms)) * Math.max(0, n(x.recovered_count)), 0) / recoveryWeight
    : 0;
  return { totalObservations:total, recoveredCount:recovered, smoothedRecoveryRate:smoothedRate, avgRecoveryTimeMs:Math.round(avgRecoveryTimeMs) };
}



export const profitLearningEntryBand = (v) => {
  const x=n(v);
  if(x>=90)return '90+';
  if(x>=85)return '85-89';
  if(x>=80)return '80-84';
  if(x>=70)return '70-79';
  if(x>=50)return '50-69';
  return '<50';
};

export function profitLearningProfileKeys({conceptName='',sourceFeeder='',sport='Unknown',entryPriceCents=0}={}){
  const concept=String(conceptName||'Unknown');
  const source=String(sourceFeeder||'none');
  const sp=String(sport||'Unknown');
  const band=profitLearningEntryBand(entryPriceCents);
  return [
    {specificity:'exact',profileKey:`exact|${concept}|${source}|${sp}|${band}`,conceptName:concept,sourceFeeder:source==='none'?null:source,sport:sp,entryBand:band},
    {specificity:'concept_sport_band',profileKey:`concept_sport_band|${concept}|${sp}|${band}`,conceptName:concept,sourceFeeder:null,sport:sp,entryBand:band},
    {specificity:'concept_band',profileKey:`concept_band|${concept}|${band}`,conceptName:concept,sourceFeeder:null,sport:null,entryBand:band},
    {specificity:'concept',profileKey:`concept|${concept}`,conceptName:concept,sourceFeeder:null,sport:null,entryBand:null},
    {specificity:'global',profileKey:'global',conceptName:null,sourceFeeder:null,sport:null,entryBand:null},
  ];
}

export function recommendProfitRetentionRatio({totalObservations=0,oneTickPullbacks=0,oneTickRecoveries=0,collapseCount=0,avgPostExitRegretRate=0}={}){
  const cold=PROTECTED_RUNNER_INTELLIGENCE.coldStartRetentionRatio;
  const total=Math.max(0,n(totalObservations));
  const pull=Math.max(0,n(oneTickPullbacks));
  const recover=Math.max(0,n(oneTickRecoveries));
  if(total<PROFIT_LEARNING_INTELLIGENCE.minimumProfileObservations||pull<PROFIT_LEARNING_INTELLIGENCE.minimumPullbackObservations)return cold;
  const continuation=(recover+2)/(pull+4); // Beta(2,2) smoothing.
  const collapse=(Math.max(0,n(collapseCount))+1)/(total+2); // Beta(1,1) smoothing.
  let ratio=cold;
  if(continuation>=0.75&&collapse<=0.35)ratio=0.86;
  else if(continuation>=0.60&&collapse<=0.45)ratio=0.89;
  else if(continuation<=0.35||collapse>=0.60)ratio=0.96;
  else if(continuation<=0.50)ratio=0.94;
  const regret=Math.max(0,Math.min(2,n(avgPostExitRegretRate)));
  if(regret>=0.25&&collapse<0.50)ratio-=0.02;
  else if(regret<=0.05&&collapse>0.40)ratio+=0.01;
  return Math.max(PROTECTED_RUNNER_INTELLIGENCE.minimumRetentionRatio,Math.min(PROTECTED_RUNNER_INTELLIGENCE.maximumRetentionRatio,Math.round(ratio*100)/100));
}

// PRI1-R2 learns in the same discrete economic unit used by execution: net
// cents per remaining contract that the runner is permitted to give back.
// This avoids the R32 unit conflict where a percentage retention target was
// routinely dominated by the mandatory one-cent contract tick. A promoted
// cohort can widen to 4c when one-tick pullbacks usually recover, or tighten
// to 2c when collapses dominate. Cold start is the evidence-backed 3c runner.
export function recommendProfitRunnerGivebackCents({totalObservations=0,oneTickPullbacks=0,oneTickRecoveries=0,collapseCount=0,avgPostExitRegretRate=0}={}){
  const cold=PROTECTED_RUNNER_INTELLIGENCE.coldStartRunnerGivebackNetPerContractCents;
  const lo=PROTECTED_RUNNER_INTELLIGENCE.minimumRunnerGivebackNetPerContractCents;
  const hi=PROTECTED_RUNNER_INTELLIGENCE.maximumRunnerGivebackNetPerContractCents;
  const total=Math.max(0,n(totalObservations));
  const pull=Math.max(0,n(oneTickPullbacks));
  const recover=Math.max(0,n(oneTickRecoveries));
  if(total<PROFIT_LEARNING_INTELLIGENCE.minimumProfileObservations||pull<PROFIT_LEARNING_INTELLIGENCE.minimumPullbackObservations)return cold;
  const continuation=(recover+2)/(pull+4);
  const collapse=(Math.max(0,n(collapseCount))+1)/(total+2);
  let giveback=cold;
  if(continuation>=0.75&&collapse<=0.35)giveback=4;
  else if(continuation>=0.60&&collapse<=0.45)giveback=4;
  else if(continuation<=0.35||collapse>=0.60)giveback=2;
  else if(continuation<=0.50)giveback=2;
  const regret=Math.max(0,Math.min(2,n(avgPostExitRegretRate)));
  if(regret>=0.25&&collapse<0.50)giveback+=1;
  else if(regret<=0.05&&collapse>0.40)giveback-=1;
  return Math.max(lo,Math.min(hi,Math.round(giveback)));
}

function initialProfitLearningState(entry, sport='Unknown', now=Date.now()){
  const originalCount=Math.max(0,n(entry?.count));
  return {
    version:PROFIT_LEARNING_INTELLIGENCE.version,
    phase:'TRACKING',
    createdAtMs:now,lastObservedAtMs:null,lastPersistedAtMs:0,
    maxExecutableBidCents:null,maxExecutableNetCents:null,maxExecutableAtMs:null,
    lastExecutableBidCents:null,lastExecutableNetCents:null,
    oneTickPullbackCount:0,oneTickRecoveryCount:0,pullbackOpen:null,
    postExitMaxExecutableBidCents:null,postExitMaxExecutableNetCents:null,postExitMaxAtMs:null,
    postExitMinExecutableBidCents:null,postExitMinExecutableNetCents:null,postExitMinAtMs:null,
    actualRealizedNetCents:null,actualExitVwapCents:null,actualExitAtMs:null,closeReason:null,
    terminalNetCents:null,finalResult:null,trackingComplete:false,
    observations:[],
    shadow:{
      PMH1:{version:'PMH1',harvestedFraction:0,harvestedNetCents:0,stages:{}},
      DBR1:{version:'DBR1',harvestedFraction:0,harvestedNetCents:0,stages:{}},
    },
    cohort:{conceptName:String(entry?.conceptName||'Unknown'),sourceFeeder:entry?.sourceFeeder||null,sport:String(sport||'Unknown'),entryBand:profitLearningEntryBand(entry?.entryPriceCents)},
    originalCount,
  };
}

function updateShadowProfitPolicies(state, entry, observation){
  if(!observation.fullExecutable||!Number.isFinite(Number(observation.executableNetCents)))return state;
  const original=Math.max(1e-9,n(state.originalCount,n(entry?.count,1)));
  const favorable=n(observation.executableBidCents)-n(entry?.entryPriceCents);
  const perOriginalNet=n(observation.executableNetCents)/original;
  const shadow={...(state.shadow||{})};
  for(const [name,policy] of Object.entries(PROFIT_LEARNING_INTELLIGENCE.shadowPolicies||{})){
    const prior={version:name,harvestedFraction:0,harvestedNetCents:0,stages:{},...(shadow[name]||{})};
    const stages={...(prior.stages||{})};
    let harvestedFraction=n(prior.harvestedFraction),harvestedNetCents=n(prior.harvestedNetCents);
    for(const [move,frac] of policy.stages||[]){
      const key=String(move);
      if(stages[key]||favorable+1e-9<move)continue;
      const available=Math.max(0,1-harvestedFraction);
      const take=Math.min(available,n(frac));
      if(take<=0)continue;
      const net=take*original*perOriginalNet;
      harvestedFraction+=take;harvestedNetCents+=net;
      stages[key]={atMs:observation.observedAtMs,bidCents:n(observation.executableBidCents),netCents:net,fraction:take};
    }
    shadow[name]={...prior,harvestedFraction,harvestedNetCents,stages};
  }
  return {...state,shadow};
}

export function advanceProfitLearningState(priorState, entry, observation={}, now=Date.now()){
  const state=priorState&&priorState.version===PROFIT_LEARNING_INTELLIGENCE.version?structuredClone(priorState):initialProfitLearningState(entry,observation.sport||'Unknown',now);
  const observedAtMs=Math.max(1,n(observation.observedAtMs,now));
  state.lastObservedAtMs=observedAtMs;
  if(!observation.fullExecutable||!Number.isFinite(Number(observation.executableBidCents))||!Number.isFinite(Number(observation.executableNetCents)))return state;
  const bid=n(observation.executableBidCents),net=n(observation.executableNetCents);
  const priorPeakBid=state.maxExecutableBidCents==null?bid:n(state.maxExecutableBidCents);
  const priorPeakNet=state.maxExecutableNetCents==null?net:n(state.maxExecutableNetCents);
  if(state.pullbackOpen&&bid+1e-9>=n(state.pullbackOpen.peakBidCents)){
    state.oneTickRecoveryCount=n(state.oneTickRecoveryCount)+1;
    state.pullbackOpen=null;
  }
  if(!state.pullbackOpen&&priorPeakNet>0&&bid<=priorPeakBid-1+1e-9){
    state.oneTickPullbackCount=n(state.oneTickPullbackCount)+1;
    state.pullbackOpen={peakBidCents:priorPeakBid,peakNetCents:priorPeakNet,startedAtMs:observedAtMs};
  }
  if(state.maxExecutableNetCents==null||net>n(state.maxExecutableNetCents)+1e-9){state.maxExecutableNetCents=net;state.maxExecutableAtMs=observedAtMs;}
  if(state.maxExecutableBidCents==null||bid>n(state.maxExecutableBidCents)+1e-9)state.maxExecutableBidCents=bid;
  state.lastExecutableBidCents=bid;state.lastExecutableNetCents=net;
  const obs=Array.isArray(state.observations)?state.observations:[];
  const last=obs.at(-1);
  if(!last||n(last.bidCents)!==bid||Math.abs(n(last.netCents)-net)>1e-6||observedAtMs-n(last.t)>=PROFIT_LEARNING_INTELLIGENCE.persistenceIntervalMs){
    state.observations=[...obs,{t:observedAtMs,bidCents:bid,netCents:net,full:true}].slice(-PROFIT_LEARNING_INTELLIGENCE.maximumTimelinePoints);
  }
  return updateShadowProfitPolicies(state,entry,{...observation,observedAtMs,executableBidCents:bid,executableNetCents:net,fullExecutable:true});
}

export function profitEpisodeMetrics(state={}){
  const maxNet=Math.max(0,n(state.maxExecutableNetCents));
  const postMax=Math.max(0,n(state.postExitMaxExecutableNetCents));
  const postMin=state.postExitMinExecutableNetCents==null?null:n(state.postExitMinExecutableNetCents);
  const terminal=n(state.terminalNetCents);
  const actual=n(state.actualRealizedNetCents);
  const best=Math.max(maxNet,postMax,terminal,0);
  return {
    oneTickPullbacks:Math.max(0,n(state.oneTickPullbackCount)),
    oneTickRecoveries:Math.max(0,n(state.oneTickRecoveryCount)),
    // A profit exit is protective evidence if the full original position later
    // became aggregate-negative at any observed executable point, even when the
    // market subsequently recovered before settlement. Terminal-only scoring
    // would systematically undercount exactly the collapses PRI1 is meant to avoid.
    collapse:maxNet>0&&((postMin!=null&&postMin<0)||terminal<0)?1:0,
    peakCaptureRate:maxNet>0?actual/maxNet:0,
    postExitRegretRate:best>0?Math.max(0,best-actual)/best:0,
    maxExecutableNetCents:maxNet,postExitMinExecutableNetCents:postMin,bestCounterfactualNetCents:best,
  };
}

export const CRASH_INTELLIGENCE = Object.freeze({ version:'CI1', persistenceIntervalMs:30_000 });
const CRASH_TERMINAL_STATUSES = new Set(['finalized','settled']);
const crashNumber = (v, fallback=0) => Number.isFinite(Number(v)) ? Number(v) : fallback;

export function crashSettings(settings = {}) {
  return {
    minCrashCents: Math.max(1, crashNumber(settings.crashRecoveryMinCrashCents, 15)),
    minReboundCents: Math.max(0, crashNumber(settings.crashRecoveryMinReboundCents, 7)),
    minReclaimRate: Math.max(0, Math.min(1, crashNumber(settings.crashRecoveryMinReclaimRate, 0.40))),
    stableObservations: Math.max(1, Math.floor(crashNumber(settings.crashRecoveryStableObservations, 3))),
    upwardTicks: Math.max(1, Math.floor(crashNumber(settings.crashRecoveryUpwardTicks, 2))),
    episodeResetRate: Math.max(0, Math.min(1, crashNumber(settings.crashRecoveryEpisodeResetRate, 0.80))),
  };
}

function initialCrashState(q = {}, now = Date.now()) {
  const bid = crashNumber(q.yesBid, 0);
  return {
    version:CRASH_INTELLIGENCE.version,
    ticker:String(q.ticker || ''),
    eventTicker:String(q.eventTicker || q.ticker || ''),
    marketTitle:String(q.title || ''),
    sport:'Unknown',
    phase:'NORMAL',
    episodeCount:0,
    episodeIndex:0,
    episodeId:null,
    rollingPeakCents:bid > 0 ? bid : 0,
    preCrashPeakCents:0,
    troughCents:0,
    crashDepthCents:0,
    crashStartedAtMs:null,
    troughAtMs:null,
    reboundConfirmedAtMs:null,
    goldenReboundConfirmedAtMs:null,
    goldenEntryReady:false,
    resetAtMs:null,
    stableObservations:0,
    upwardTicks:0,
    lowerLowCount:0,
    reboundLostCount:0,
    reboundCents:0,
    reclaimRate:0,
    entryReady:false,
    lastBidCents:bid > 0 ? bid : 0,
    lastAskCents:crashNumber(q.yesAsk, 0),
    lastObservationAtMs:bid > 0 ? now : null,
    lastEpisodeId:null,
    lastResetAtMs:null,
    pendingEntrySignal:null,
    goldenPendingSignal:null,
    finalResult:null,
    updatedAtMs:now,
  };
}

function crashSignalSnapshot(state) {
  if (!state?.episodeId) return null;
  return {
    version:CRASH_INTELLIGENCE.version,
    episodeId:String(state.episodeId),
    ticker:String(state.ticker || ''),
    eventTicker:String(state.eventTicker || state.ticker || ''),
    episodeIndex:Number(state.episodeIndex || 0),
    preCrashPeakCents:Number(state.preCrashPeakCents || 0),
    troughCents:Number(state.troughCents || 0),
    crashDepthCents:Number(state.crashDepthCents || 0),
    reboundCents:Number(state.reboundCents || 0),
    reclaimRate:Number(state.reclaimRate || 0),
    stableObservations:Number(state.stableObservations || 0),
    upwardTicks:Number(state.upwardTicks || 0),
    lowerLowCount:Number(state.lowerLowCount || 0),
    reboundLostCount:Number(state.reboundLostCount || 0),
    crashStartedAtMs:Number(state.crashStartedAtMs || 0),
    troughAtMs:Number(state.troughAtMs || 0),
    reboundConfirmedAtMs:Number(state.reboundConfirmedAtMs || 0),
    goldenReboundConfirmedAtMs:Number(state.goldenReboundConfirmedAtMs || 0),
    goldenEntryReady:Boolean(state.goldenEntryReady),
    lastBidCents:Number(state.lastBidCents || 0),
    lastAskCents:Number(state.lastAskCents || 0),
    sport:String(state.sport || 'Unknown'),
  };
}

export function crashEpisodeFromState(state, overrideState = null) {
  if (!state?.episodeId) return null;
  return {
    id:String(state.episodeId),
    systemName:null,
    ticker:String(state.ticker || ''),
    eventTicker:String(state.eventTicker || state.ticker || ''),
    episodeIndex:Number(state.episodeIndex || 0),
    sport:String(state.sport || 'Unknown'),
    marketTitle:String(state.marketTitle || ''),
    state:String(overrideState || state.phase || 'CRASHING'),
    preCrashPeakCents:Number(state.preCrashPeakCents || 0),
    troughCents:Number(state.troughCents || 0),
    crashDepthCents:Number(state.crashDepthCents || 0),
    crashStartedAtMs:Number(state.crashStartedAtMs || 0),
    troughAtMs:Number(state.troughAtMs || state.crashStartedAtMs || 0),
    reboundConfirmedAtMs:state.reboundConfirmedAtMs || null,
    resetAtMs:state.resetAtMs || null,
    stableObservations:Number(state.stableObservations || 0),
    upwardTicks:Number(state.upwardTicks || 0),
    lowerLowCount:Number(state.lowerLowCount || 0),
    reboundLostCount:Number(state.reboundLostCount || 0),
    reboundCents:Number(state.reboundCents || 0),
    reclaimRate:Number(state.reclaimRate || 0),
    finalResult:state.finalResult || null,
    updatedAtMs:Number(state.updatedAtMs || Date.now()),
  };
}

// CI1 is intentionally a pure price-structure state machine. It does not know
// about Hunter entry bands, stakes, GCA1 authorization, R13 exposure locking,
// or execution depth. Those remain downstream StrategyEngine responsibilities.
// This separation lets learning count every crash episode without turning a
// telemetry event into exposure by itself.
export function advanceCrashState(priorState, q = {}, settings = {}, now = Date.now()) {
  const cfg = crashSettings(settings);
  const bid = crashNumber(q.yesBid, 0);
  const ask = crashNumber(q.yesAsk, 0);
  const ticker = String(q.ticker || priorState?.ticker || '');
  const eventTicker = String(q.eventTicker || priorState?.eventTicker || ticker);
  const title = String(q.title || priorState?.marketTitle || '');
  const status = String(q.status || '').toLowerCase();
  const terminal = CRASH_TERMINAL_STATUSES.has(status) && Boolean(q.result);
  const prior = priorState && typeof priorState === 'object' ? structuredClone(priorState) : initialCrashState({ ...q, ticker, eventTicker, title }, now);
  prior.version = CRASH_INTELLIGENCE.version;
  prior.ticker = ticker;
  prior.eventTicker = eventTicker;
  prior.marketTitle = title;

  if (prior.phase === 'FINAL') return { state:prior, transition:'NONE', distinct:false, newLow:false, episode:null };
  if (terminal) {
    const activeEpisode = prior.episodeId ? { ...prior, phase:'FINAL', finalResult:String(q.result), updatedAtMs:now } : null;
    const next = { ...prior, phase:'FINAL', entryReady:false, goldenEntryReady:false, reboundConfirmedAtMs:null, goldenReboundConfirmedAtMs:null, pendingEntrySignal:null, goldenPendingSignal:null, finalResult:String(q.result), lastBidCents:bid || prior.lastBidCents || 0, lastAskCents:ask || prior.lastAskCents || 0, lastObservationAtMs:now, updatedAtMs:now };
    return { state:next, transition:'FINAL', distinct:true, newLow:false, episode:activeEpisode ? crashEpisodeFromState(activeEpisode, 'FINAL') : null };
  }
  if (!(bid > 0) || !(ask > 0) || bid > ask) return { state:prior, transition:'NONE', distinct:false, newLow:false, episode:null };

  const distinct = bid !== Number(prior.lastBidCents || 0) || ask !== Number(prior.lastAskCents || 0);
  if (!distinct) return { state:prior, transition:'NONE', distinct:false, newLow:false, episode:null };

  if (prior.phase === 'NORMAL') {
    // R27 GPI2: CI1's pendingEntrySignal remains immutable for CRH/Dragon
    // provenance, but Golden owns a separate exact-episode continuation that
    // can mature after CI1 has reset the episode. This prevents a stricter
    // Golden doctrine from being permanently frozen below qualification.
    let goldenPendingSignal = prior.goldenPendingSignal
      ? structuredClone(prior.goldenPendingSignal)
      : prior.pendingEntrySignal?.episodeId ? structuredClone(prior.pendingEntrySignal) : null;
    if (goldenPendingSignal?.episodeId) {
      const pendingTrough=Number(goldenPendingSignal.troughCents || 0);
      if (!(pendingTrough>0) || bid<pendingTrough) {
        goldenPendingSignal=null;
      } else {
        const pendingPreviousBid=Number(goldenPendingSignal.lastBidCents || goldenPendingSignal.troughCents || 0);
        const pendingStable=Number(goldenPendingSignal.stableObservations || 0)+1;
        const pendingUpward=pendingPreviousBid>0 && bid>pendingPreviousBid
          ? Number(goldenPendingSignal.upwardTicks || 0)+1
          : pendingPreviousBid>0 && bid<pendingPreviousBid ? 0 : Number(goldenPendingSignal.upwardTicks || 0);
        const pendingDepth=Math.max(1,Number(goldenPendingSignal.crashDepthCents || 0));
        const pendingRebound=Math.max(0,bid-pendingTrough);
        const pendingReclaim=pendingRebound/pendingDepth;
        const candidate={...goldenPendingSignal,stableObservations:pendingStable,upwardTicks:pendingUpward,reboundCents:pendingRebound,reclaimRate:pendingReclaim,lastBidCents:bid,lastAskCents:ask};
        const structure=goldenDragonStructureQualifiedAtQuote(candidate,{yesBid:bid,yesAsk:ask},settings);
        const legacyClock=Number(goldenPendingSignal.goldenReboundConfirmedAtMs || goldenPendingSignal.reboundConfirmedAtMs || 0);
        const legacyClockValid=legacyClock>0 && legacyClock>=Number(goldenPendingSignal.troughAtMs || 0);
        const priorGoldenReady=goldenPendingSignal.goldenEntryReady===true || (!Object.hasOwn(goldenPendingSignal,'goldenEntryReady') && structure.ok && legacyClockValid);
        goldenPendingSignal={
          ...candidate,
          goldenEntryReady:structure.ok,
          goldenReboundConfirmedAtMs:structure.ok ? (priorGoldenReady && legacyClockValid ? legacyClock : now) : null,
          updatedAtMs:now,
        };
      }
    }
    const rollingPeak = Math.max(Number(prior.rollingPeakCents || 0), bid);
    const depth = Math.max(0, rollingPeak - bid);
    if (depth + 1e-9 >= cfg.minCrashCents) {
      const episodeIndex = Number(prior.episodeCount || 0) + 1;
      const episodeId = `CRASH:${ticker}:${episodeIndex}:${now}`;
      const next = {
        ...prior,
        phase:'CRASHING', episodeCount:episodeIndex, episodeIndex, episodeId,
        rollingPeakCents:rollingPeak, preCrashPeakCents:rollingPeak, troughCents:bid, crashDepthCents:depth,
        crashStartedAtMs:now, troughAtMs:now, reboundConfirmedAtMs:null, resetAtMs:null,
        goldenReboundConfirmedAtMs:null, goldenEntryReady:false,
        stableObservations:0, upwardTicks:0, reboundCents:0, reclaimRate:0, entryReady:false, pendingEntrySignal:null, goldenPendingSignal:null,
        lastBidCents:bid, lastAskCents:ask, lastObservationAtMs:now, finalResult:null, updatedAtMs:now,
      };
      return { state:next, transition:'CRASH_STARTED', distinct:true, newLow:true, episode:crashEpisodeFromState(next) };
    }
    const next = { ...prior, goldenPendingSignal, rollingPeakCents:rollingPeak, lastBidCents:bid, lastAskCents:ask, lastObservationAtMs:now, updatedAtMs:now };
    return { state:next, transition:rollingPeak > Number(prior.rollingPeakCents || 0) ? 'PEAK_UPDATED' : 'OBSERVED', distinct:true, newLow:false, episode:null };
  }

  // Any active episode stays one episode while lower lows are still being
  // discovered. A lower low invalidates an earlier rebound signal but does not
  // manufacture a second crash. A second episode can start only after the first
  // has reclaimed the configured reset fraction and returned to NORMAL.
  const previousBid = Number(prior.lastBidCents || 0);
  const isNewLow = bid < Number(prior.troughCents || bid);
  if (isNewLow) {
    const depth = Math.max(0, Number(prior.preCrashPeakCents || 0) - bid);
    const next = {
      ...prior, phase:'CRASHING', troughCents:bid, crashDepthCents:depth, troughAtMs:now,
      // R27 GPI1: a lower low starts a new recovery attempt inside the same
      // crash episode. Any confirmation timestamp from the invalidated rebound
      // belongs to the old trough and must not survive into the new attempt.
      // Otherwise Golden Dragon's rebound-freshness gate can reject a genuinely
      // fresh recovery as stale because it is comparing against an impossible
      // timestamp that predates the current trough.
      reboundConfirmedAtMs:null,
      goldenReboundConfirmedAtMs:null, goldenEntryReady:false,
      stableObservations:0, upwardTicks:0, lowerLowCount:Number(prior.lowerLowCount || 0)+1, reboundCents:0, reclaimRate:0, entryReady:false,
      lastBidCents:bid, lastAskCents:ask, lastObservationAtMs:now, updatedAtMs:now,
    };
    return { state:next, transition:'NEW_LOW', distinct:true, newLow:true, episode:crashEpisodeFromState(next) };
  }

  const stableObservations = Number(prior.stableObservations || 0) + 1;
  // R27 GPI1 migration hardening: R26 may have persisted an impossible
  // confirmation timestamp that predates the current trough while the state
  // still says REBOUND_CONFIRMED. Treat that clock as invalid immediately so
  // the first distinct post-upgrade quote establishes a current-attempt clock.
  const priorCi1Clock=Number(prior.reboundConfirmedAtMs || 0);
  const currentTroughAt=Number(prior.troughAtMs || prior.crashStartedAtMs || 0);
  const priorCi1ClockValid=priorCi1Clock>0 && (!(currentTroughAt>0) || priorCi1Clock>=currentTroughAt);
  const upwardTicks = previousBid > 0 && bid > previousBid
    ? Number(prior.upwardTicks || 0) + 1
    : previousBid > 0 && bid < previousBid ? 0 : Number(prior.upwardTicks || 0);
  const reboundCents = Math.max(0, bid - Number(prior.troughCents || bid));
  const depth = Math.max(1, Number(prior.crashDepthCents || Number(prior.preCrashPeakCents || 0) - Number(prior.troughCents || 0)));
  const reclaimRate = reboundCents / depth;
  const goldenCandidate={...prior,stableObservations,upwardTicks,reboundCents,reclaimRate,lastBidCents:bid,lastAskCents:ask};
  const goldenStructure=goldenDragonStructureQualifiedAtQuote(goldenCandidate,{yesBid:bid,yesAsk:ask},settings);
  const priorGoldenClock=Number(prior.goldenReboundConfirmedAtMs || 0);
  const legacyGoldenClock=priorGoldenClock || Number(prior.reboundConfirmedAtMs || 0);
  const legacyGoldenClockValid=legacyGoldenClock>0 && legacyGoldenClock>=Number(prior.troughAtMs || 0);
  const priorGoldenStructure=goldenDragonStructureQualifiedAtQuote(prior,{yesBid:Number(prior.lastBidCents||0),yesAsk:Number(prior.lastAskCents||0)},settings);
  const priorGoldenReady=prior.goldenEntryReady===true || (!Object.hasOwn(prior,'goldenEntryReady') && priorGoldenStructure.ok && legacyGoldenClockValid);
  const goldenEntryReady=goldenStructure.ok;
  const goldenReboundConfirmedAtMs=goldenEntryReady ? (priorGoldenReady && legacyGoldenClockValid ? legacyGoldenClock : now) : null;

  // Once a structurally confirmed rebound has existed for at least one prior
  // distinct observation, an >=80% reclaim closes that episode and establishes
  // a fresh rolling peak. Delaying reset by one observation prevents a single
  // gap quote from both creating and instantly erasing an actionable signal.
  if (prior.phase === 'REBOUND_CONFIRMED' && reclaimRate + 1e-12 >= cfg.episodeResetRate) {
    const completed = {
      ...prior, stableObservations, upwardTicks, reboundCents, reclaimRate, goldenEntryReady, goldenReboundConfirmedAtMs, resetAtMs:now,
      // A persisted R26 impossible clock must not be frozen into the immutable
      // CRH/Dragon snapshot during an immediate post-upgrade reset.
      reboundConfirmedAtMs:priorCi1ClockValid ? priorCi1Clock : now,
      lastBidCents:bid, lastAskCents:ask, lastObservationAtMs:now, updatedAtMs:now,
    };
    const episode = crashEpisodeFromState(completed, 'RESET');
    const next = {
      ...initialCrashState({ ...q, ticker, eventTicker, title }, now),
      episodeCount:Number(prior.episodeCount || 0),
      rollingPeakCents:bid,
      lastEpisodeId:String(prior.episodeId || ''),
      lastResetAtMs:now,
      // Preserve the already-confirmed episode as an immutable pending signal.
      // This closes the debounce race where a fast >=80% recovery could reset
      // the learning episode before CRH1 reaches its last execution boundary.
      // A subsequent qualifying crash clears this pending signal above.
      pendingEntrySignal:crashSignalSnapshot(completed),
      goldenPendingSignal:crashSignalSnapshot(completed),
      updatedAtMs:now,
    };
    return { state:next, transition:'EPISODE_RESET', distinct:true, newLow:false, episode };
  }

  const requiredReboundCents = Math.max(cfg.minReboundCents, Math.ceil(depth * cfg.minReclaimRate - 1e-12));
  const qualified = stableObservations >= cfg.stableObservations
    && upwardTicks >= cfg.upwardTicks
    && reboundCents >= requiredReboundCents
    && reclaimRate + 1e-12 >= cfg.minReclaimRate;
  const priorReady = prior.phase === 'REBOUND_CONFIRMED' && prior.entryReady === true;
  const next = {
    ...prior,
    phase:qualified ? 'REBOUND_CONFIRMED' : 'CRASHING',
    stableObservations, upwardTicks, reboundCents, reclaimRate, entryReady:qualified, goldenEntryReady, goldenReboundConfirmedAtMs,
    reboundLostCount:(!qualified && priorReady) ? Number(prior.reboundLostCount || 0)+1 : Number(prior.reboundLostCount || 0),
    // R27 GPI1 lifecycle invariant: the actionable confirmation clock exists
    // iff the *current* recovery attempt is structurally confirmed. A newly
    // confirmed/reconfirmed rebound receives the current observation time;
    // losing confirmation clears it. This also self-heals persisted R26 states
    // carrying a stale timestamp while phase/entryReady are no longer confirmed.
    reboundConfirmedAtMs: qualified ? (priorReady && priorCi1ClockValid ? priorCi1Clock : now) : null,
    lastBidCents:bid, lastAskCents:ask, lastObservationAtMs:now, updatedAtMs:now,
  };
  const transition = qualified && !priorReady ? 'REBOUND_CONFIRMED' : !qualified && priorReady ? 'REBOUND_LOST' : 'OBSERVED';
  return { state:next, transition, distinct:true, newLow:false, episode:crashEpisodeFromState(next) };
}

export class LearningEngine {
  constructor(db, systemName) {
    this.db = db;
    this.systemName = systemName;
    this.marketDropKeys = new Set();
    this.durationRecorded = new Set();
    this.crashStates = new Map();
    this.crashLastPersistMs = new Map();
    this.goldenDragonHistory = [];
    this.profitStates = new Map();
    this.profitMeta = new Map();
    this.profitLastPersistMs = new Map();
    this.profitProfilesCache = new Map();
    // R41: quote-driven, fast-scan and full-scan research can overlap. Guard
    // each persisted wound row so concurrent telemetry passes can never race a
    // durability confirmation or overwrite a newer SGRL1 state.
    this.stopGuardRecoveryTrackingLocks = new Set();
  }

  async init() {
    await this.db.seedSportProfiles(SEED_SPORT_PROFILES);
    if (typeof this.db.crashEpisodes === 'function') {
      this.goldenDragonHistory = (await this.db.crashEpisodes(this.systemName,{limit:5000}).catch(()=>[]))
        .filter((x)=>['yes','no'].includes(String(x?.final_result || '').toLowerCase()));
    }
    if (typeof this.db.crashMarketStates === 'function') {
      const rows = await this.db.crashMarketStates(this.systemName).catch(() => []);
      for (const row of rows || []) {
        const state = row?.state && typeof row.state === 'object' ? structuredClone(row.state) : {};
        const ticker = String(row?.ticker || state.ticker || '');
        if (!ticker) continue;
        state.version = CRASH_INTELLIGENCE.version;
        state.ticker = ticker;
        state.eventTicker = String(row?.event_ticker || state.eventTicker || ticker);
        state.marketTitle = String(row?.market_title || state.marketTitle || '');
        state.sport = String(row?.sport || state.sport || 'Unknown');
        state.episodeCount = Math.max(Number(row?.episode_count || 0), Number(state.episodeCount || 0));
        this.crashStates.set(ticker, state);
        this.crashLastPersistMs.set(ticker, Number(row?.updated_at_ms || state.updatedAtMs || 0));
      }
    }
    if (typeof this.db.profitEpisodes === 'function') {
      const rows = await this.db.profitEpisodes(this.systemName,{complete:false,limit:5000}).catch(()=>[]);
      for(const row of rows||[]){
        const state=row?.state&&typeof row.state==='object'?structuredClone(row.state):null;
        if(!row?.id||!state||state.version!==PROFIT_LEARNING_INTELLIGENCE.version)continue;
        this.profitStates.set(String(row.id),state);
        this.profitMeta.set(String(row.id),{
          id:String(row.id),systemName:this.systemName,ticker:String(row.ticker||''),eventTicker:String(row.event_ticker||row.ticker||''),conceptName:String(row.concept_name||'Unknown'),
          sourceFeeder:row.source_feeder||null,sport:String(row.sport||'Unknown'),entryPriceCents:n(row.entry_price_cents),originalCount:n(row.original_count),openedAtMs:n(row.opened_at_ms),closedAtMs:row.closed_at_ms==null?null:n(row.closed_at_ms),
        });
        this.profitLastPersistMs.set(String(row.id),n(row.updated_at_ms));
      }
    }
    if (typeof this.db.profitProfiles === 'function') {
      const rows = await this.db.profitProfiles(this.systemName).catch(()=>[]);
      for (const row of rows || []) this.cacheProfitProfile(row);
    }
    // A process can die after a completed PLI1 episode is durably persisted but
    // before its derived cohort profile is rebuilt. Rebuild once at startup so
    // no completed trade can be silently omitted from future retention policy.
    if (typeof this.db.profitEpisodes === 'function' && typeof this.db.upsertProfitProfile === 'function') {
      await this.rebuildProfitProfiles().catch(()=>{});
    }
  }

  async classify(ticker, title='') {
    const d = classifyDeterministic(ticker, title);
    let p = await this.db.sportProfile(d.prefix);
    if (!p) {
      await this.db.ensureSportProfile(d);
      p = await this.db.sportProfile(d.prefix);
    }
    return p || {
      ticker_prefix:d.prefix,
      detected_sport_name:d.sportName,
      typical_duration_ms:d.typicalDurationMs,
      min_game_minutes_for_hunter:d.minMinutes,
      confidence_level:d.confidence,
      source:d.source,
    };
  }

  resetCrashRuntime() {
    this.crashStates.clear();
    this.crashLastPersistMs.clear();
  }

  crashState(ticker) {
    const state = this.crashStates.get(String(ticker || ''));
    return state ? structuredClone(state) : null;
  }

  crashEntrySignal(ticker) {
    const state = this.crashStates.get(String(ticker || ''));
    if (!state) return null;
    if (state.phase === 'REBOUND_CONFIRMED' && state.entryReady === true && state.episodeId) {
      return crashSignalSnapshot(state);
    }
    if (state.phase === 'NORMAL' && state.pendingEntrySignal?.episodeId) {
      return structuredClone(state.pendingEntrySignal);
    }
    return null;
  }

  // R27 GPI2: Golden consumes its own live exact-episode candidate instead of
  // CI1's CRH-oriented immutable pending snapshot. Active crash episodes are
  // visible even before CI1 entryReady becomes true, allowing Golden's own
  // structural doctrine to decide qualification. After CI1 reset, the separate
  // goldenPendingSignal continues to mature without mutating CRH provenance.
  goldenDragonEntrySignal(ticker) {
    const state=this.crashStates.get(String(ticker || ''));
    if(!state)return null;
    let raw=null;
    if ((state.phase==='CRASHING'||state.phase==='REBOUND_CONFIRMED') && state.episodeId) raw=crashSignalSnapshot(state);
    else if(state.phase==='NORMAL'&&state.goldenPendingSignal?.episodeId) raw=structuredClone(state.goldenPendingSignal);
    else if(state.phase==='NORMAL'&&state.pendingEntrySignal?.episodeId) raw=structuredClone(state.pendingEntrySignal); // R26 migration fallback.
    if(!raw?.episodeId)return null;
    const ci1Clock=Number(raw.reboundConfirmedAtMs || 0);
    const goldenClock=Number(raw.goldenReboundConfirmedAtMs || 0);
    return {...raw,ci1ReboundConfirmedAtMs:ci1Clock,reboundConfirmedAtMs:goldenClock || ci1Clock || 0};
  }


  goldenDragonSurvivalProfile(signal = {}) {
    const rows = Array.isArray(this.goldenDragonHistory) ? this.goldenDragonHistory : [];
    const sport = String(signal.sport || 'Unknown');
    const episodeIndex = Math.max(1, Number(signal.episodeIndex || 1));
    const crashDepth = Number(signal.crashDepthCents || 0);
    const signalPrice = Number(signal.signalPriceCents || signal.validatedAskCents || 0);
    const crashBucket = crashDepth < 25 ? '15-24' : crashDepth < 40 ? '25-39' : '40+';
    const priceBucket = signalPrice < 60 ? '<60' : signalPrice < 70 ? '60-69' : signalPrice < 80 ? '70-79' : signalPrice < 90 ? '80-89' : '90+';
    const episodeBucket = episodeIndex === 1 ? '1' : episodeIndex === 2 ? '2' : '3+';
    const unique = (list) => {
      const seen=new Set(), out=[];
      for (const r of list) { const t=String(r?.ticker || ''); if(!t || seen.has(t)) continue; seen.add(t); out.push(r); }
      return out;
    };
    const classify=(r)=>({
      sport:String(r?.sport || 'Unknown'),
      crashBucket:Number(r?.crash_depth_cents||0)<25?'15-24':Number(r?.crash_depth_cents||0)<40?'25-39':'40+',
      episodeBucket:Number(r?.episode_index||1)===1?'1':Number(r?.episode_index||1)===2?'2':'3+',
      priceBucket:Number(r?.dragon_signal?.signalAskCents||0)>0?(Number(r?.dragon_signal?.signalAskCents||0)<60?'<60':Number(r?.dragon_signal?.signalAskCents||0)<70?'60-69':Number(r?.dragon_signal?.signalAskCents||0)<80?'70-79':Number(r?.dragon_signal?.signalAskCents||0)<90?'80-89':'90+'):null,
    });
    const tiers=[
      ['sport_crash_episode_price',(r,c)=>c.sport===sport&&c.crashBucket===crashBucket&&c.episodeBucket===episodeBucket&&c.priceBucket===priceBucket],
      ['sport_crash_episode',(r,c)=>c.sport===sport&&c.crashBucket===crashBucket&&c.episodeBucket===episodeBucket],
      ['sport_crash',(r,c)=>c.sport===sport&&c.crashBucket===crashBucket],
      ['sport',(r,c)=>c.sport===sport],
      ['global',()=>true],
    ];
    for (const [specificity,pred] of tiers) {
      const sample=unique(rows.filter((r)=>pred(r,classify(r))));
      if (sample.length < 8 && specificity !== 'global') continue;
      const wins=sample.filter((r)=>String(r.final_result).toLowerCase()==='yes').length;
      const smoothed=(wins+2)/(sample.length+4);
      return {specificity,totalObservations:sample.length,successes:wins,smoothedSurvivalRate:smoothed,crashBucket,episodeBucket,priceBucket,sport};
    }
    return {specificity:'none',totalObservations:0,successes:0,smoothedSurvivalRate:0.5,crashBucket,episodeBucket,priceBucket,sport};
  }

  crashLearningSummary() {
    const states = [...this.crashStates.values()].map((x) => structuredClone(x));
    return {
      version:CRASH_INTELLIGENCE.version,
      trackedMarkets:states.length,
      marketsWithCrash:states.filter((x) => Number(x.episodeCount || 0) > 0).length,
      totalEpisodes:states.reduce((sum, x) => sum + Number(x.episodeCount || 0), 0),
      multipleCrashMarkets:states.filter((x) => Number(x.episodeCount || 0) > 1).length,
      activeCrashes:states.filter((x) => x.phase === 'CRASHING').length,
      reboundConfirmed:states.filter((x) => x.phase === 'REBOUND_CONFIRMED' && x.entryReady).length,
      finalized:states.filter((x) => x.phase === 'FINAL').length,
      states:states.sort((a,b) => Number(b.updatedAtMs || 0) - Number(a.updatedAtMs || 0)).slice(0,250),
    };
  }

  async persistCrashState(state, episode = null) {
    const now = Number(state?.updatedAtMs || Date.now());
    if (typeof this.db.upsertCrashMarketState === 'function' && state?.ticker) {
      await this.db.upsertCrashMarketState({
        systemName:this.systemName, ticker:state.ticker, eventTicker:state.eventTicker, marketTitle:state.marketTitle,
        sport:state.sport || 'Unknown', episodeCount:Number(state.episodeCount || 0), state, updatedAtMs:now,
      });
      this.crashLastPersistMs.set(String(state.ticker), now);
    }
    if (episode && typeof this.db.upsertCrashEpisode === 'function') {
      await this.db.upsertCrashEpisode({ ...episode, systemName:this.systemName });
    }
  }

  async markDragonSignal(ticker, episodeId, signal = {}) {
    if (!episodeId || typeof this.db.markCrashEpisodeDragonSignal !== 'function') return;
    await this.db.markCrashEpisodeDragonSignal(this.systemName, String(episodeId), {
      version:'DRAGON-V1',
      ticker:String(ticker || ''),
      signalAtMs:Number(signal.signalAtMs || Date.now()),
      signalBidCents:Number(signal.signalBidCents || 0),
      signalAskCents:Number(signal.signalAskCents || 0),
      gameMinutes:Number.isFinite(Number(signal.gameMinutes)) ? Number(signal.gameMinutes) : null,
      episodeIndex:Number(signal.episodeIndex || 0),
    }, Number(signal.signalAtMs || Date.now()));
  }

  async observeCrashQuote(q, settings, now = Date.now()) {
    const ticker = String(q?.ticker || '');
    if (!ticker) return null;
    const prior = this.crashStates.get(ticker) || null;
    const result = advanceCrashState(prior, q, settings, now);
    const state = result.state;
    const d = classifyDeterministic(ticker, q?.title || state.marketTitle || '');
    state.sport = d.sportName || 'Unknown';
    state.eventTicker = String(q?.eventTicker || state.eventTicker || ticker);
    state.marketTitle = String(q?.title || state.marketTitle || ticker);
    if (result.episode) {
      result.episode.sport = state.sport;
      result.episode.eventTicker = state.eventTicker;
      result.episode.marketTitle = state.marketTitle;
      result.episode.updatedAtMs = now;
    }
    this.crashStates.set(ticker, state);
    if (result.transition === 'FINAL' && state.finalResult && typeof this.db.finalizeCrashEpisodes === 'function') {
      await this.db.finalizeCrashEpisodes(this.systemName, ticker, state.finalResult, now).catch(() => {});
      if (typeof this.db.crashEpisodes === 'function') {
        const refreshed = await this.db.crashEpisodes(this.systemName,{limit:100,ticker}).catch(()=>[]);
        const keep = this.goldenDragonHistory.filter((x)=>String(x?.ticker||'')!==ticker);
        this.goldenDragonHistory = [...refreshed.filter((x)=>['yes','no'].includes(String(x?.final_result||'').toLowerCase())), ...keep].slice(0,5000);
      }
    }

    const important = ['CRASH_STARTED','NEW_LOW','REBOUND_CONFIRMED','REBOUND_LOST','EPISODE_RESET','FINAL'].includes(result.transition);
    const lastPersist = Number(this.crashLastPersistMs.get(ticker) || 0);
    const due = result.distinct && now - lastPersist >= CRASH_INTELLIGENCE.persistenceIntervalMs;
    if ((important || due) && (typeof this.db.upsertCrashMarketState === 'function' || typeof this.db.upsertCrashEpisode === 'function')) {
      await this.persistCrashState(state, result.episode).catch(() => {});
    }
    return { ...result, state:structuredClone(state), episode:result.episode ? structuredClone(result.episode) : null };
  }

  async onHardStop(trade) {
    const exists = (await this.db.recoveryObservations(this.systemName, { limit:5000 })).some((x) => x.original_entry_id === trade.id);
    if (exists) return;
    const profile = await this.classify(trade.ticker, trade.marketTitle);
    const exit = trade.exitPriceCents || trade.currentPriceCents;
    const clock = trade.entryConfig?.gameClockAuthority;
    const clockStart = isConfirmedGameClockState(clock, trade.eventTicker || trade.ticker) ? Number(clock.startTimeMs || 0) : 0;
    const gameMinutes = clockStart ? Math.max(0, Math.round(((trade.closedAtMs || Date.now()) - clockStart) / 60000)) : 0;
    await this.db.createRecoveryObservation({
      id:`STOP:${trade.id}`, systemName:this.systemName, originalEntryId:trade.id, ticker:trade.ticker, conceptName:trade.conceptName,
      sport:profile.detected_sport_name || 'Unknown', entryPriceCents:trade.entryPriceCents, exitPriceCents:exit,
      dropCents:Math.max(0, trade.entryPriceCents - exit), gameMinutesAtEntry:gameMinutes, exitAtMs:trade.closedAtMs || Date.now(),
      prices:[], troughCents:exit, reboundCents:0, recovered:false, trackingComplete:false, settled:false, updatedAtMs:Date.now(),
    });
  }

  async trackRecovery(quotes, settings) {
    const now = Date.now();
    const windowMs = (settings.recoveryTrackingHours || 24) * 3600000;
    const open = await this.db.recoveryObservations(this.systemName, { complete:false, limit:5000 });
    for (const o of open) {
      const q = quotes.get(o.ticker);
      if (!q) continue;
      const price = q.yesBid > 0 && q.yesAsk > 0 ? Math.round((q.yesBid + q.yesAsk) / 2) : (q.yesBid || q.yesAsk || q.lastPrice || 0);
      if (price <= 0) continue;
      let prices = Array.isArray(o.prices) ? o.prices : [];
      prices = [...prices, { t:now, p:price }].slice(-500);
      const trough = Math.min(Number(o.trough_cents) || price, price);
      const recovered = Boolean(o.recovered) || price >= Number(o.entry_price_cents);
      const recoveryAt = Number(o.recovery_at_ms) || (recovered ? now : null);
      const settled = Boolean(q.result) && (q.status === 'finalized' || q.status === 'determined' || price === 0 || price === 100);
      const complete = recovered || settled || now - Number(o.exit_at_ms) >= windowMs;
      await this.db.updateRecoveryObservation(o.id, {
        prices, troughCents:trough, reboundCents:Math.max(0, price - trough), recovered, recoveryAtMs:recoveryAt,
        timeToRecoverMs:recovered ? Math.max(0, recoveryAt - Number(o.exit_at_ms)) : 0,
        trackingComplete:complete, settled, finalResult:q.result || null, updatedAtMs:now,
      });
    }
  }

  async beginStopGuardRecoveryEpisode(entry,{triggerStage='SLW1',triggerPriceCents=0,triggerLossCents=0,dangerLineCents=0,crash=null,coverageKind='causal_from_trigger',atMs=Date.now()}={}){
    if(typeof this.db?.createStopGuardRecoveryEpisode!=='function'||!entry?.id)return null;
    const stage=String(triggerStage||'SLW1').toUpperCase();
    if(!['SLW1','USG1'].includes(stage))return null;
    const coverage=coverageKind==='partial_from_upgrade'?'partial_from_upgrade':'causal_from_trigger';
    const profile=await this.classify(entry.ticker,entry.marketTitle||'');
    const clock=entry?.entryConfig?.gameClockAuthority;
    const clockStart=isConfirmedGameClockState(clock,entry.eventTicker||entry.ticker)?n(clock?.startTimeMs):n(entry.gameStartTimeMs);
    const gameMinutesAtEntry=clockStart>0&&n(entry.openedAtMs)>=clockStart?Math.max(0,Math.floor((n(entry.openedAtMs)-clockStart)/60000)):0;
    const crashState=crash&&typeof crash==='object'?crash:(this.crashState(entry.ticker)||{});
    const originalCount=Math.max(1,n(entry.count));
    const trackedCount=Math.max(1,n(entry.remainingCount,originalCount));
    const feePerContract=n(entry?.entryConfig?.simFeeCents,2);
    const totalEntryFee=n(entry.entryFeeCents)>0?n(entry.entryFeeCents):feePerContract*originalCount;
    const allocatedEntryFee=totalEntryFee*(trackedCount/originalCount);
    const baseRealizedPnlCents=n(entry.pnlCents);
    const trigger=n(triggerPriceCents,n(entry.currentPriceCents));
    const episode={
      id:`${STOP_GUARD_RECOVERY_LEARNING.version}:${stage}:${entry.id}`,systemName:this.systemName,originalEntryId:String(entry.id),triggerStage:stage,
      ticker:String(entry.ticker||''),mode:String(entry.mode||'SIMULATION'),conceptName:String(entry.conceptName||'Unknown'),sourceFeeder:entry.sourceFeeder||null,
      sport:String(profile?.detected_sport_name||'Unknown'),entryPriceCents:n(entry.entryPriceCents),triggerPriceCents:trigger,
      triggerDropCents:Math.max(0,n(entry.entryPriceCents)-trigger),triggerLossCents:Math.max(0,n(triggerLossCents)),dangerLineCents:Math.max(0,n(dangerLineCents)),
      gameMinutesAtEntry,crashBucket:stopGuardCrashBucket(crashState),originalCount,trackedCount,entryFeeCents:allocatedEntryFee,baseRealizedPnlCents,triggerAtMs:n(atMs,Date.now()),
      trackingComplete:false,recovered:false,recoveryAtMs:null,coverageKind:coverage,
      state:{version:STOP_GUARD_RECOVERY_LEARNING.version,feePerContractCents:feePerContract,coverageKind:coverage,decisionEvidenceEligible:String(entry.mode||'SIMULATION')===STOP_GUARD_RECOVERY_LEARNING.decisionEvidenceMode&&coverage==='causal_from_trigger',crashAtTrigger:{phase:String(crashState?.phase||'UNKNOWN'),lowerLowCount:n(crashState?.lowerLowCount),reboundCents:n(crashState?.reboundCents),upwardTicks:n(crashState?.upwardTicks)},createdAtMs:n(atMs,Date.now())},
      updatedAtMs:Date.now(),
    };
    const stored=await this.db.createStopGuardRecoveryEpisode(episode);
    const actualCoverage=String(stored?.coverage_kind||stored?.coverageKind||coverage)==='partial_from_upgrade'?'partial_from_upgrade':'causal_from_trigger';
    return {...episode,coverageKind:actualCoverage,state:{...episode.state,coverageKind:actualCoverage,decisionEvidenceEligible:String(entry.mode||'SIMULATION')===STOP_GUARD_RECOVERY_LEARNING.decisionEvidenceMode&&actualCoverage==='causal_from_trigger'}};
  }

  async trackStopGuardRecovery(quotes,settings,market,{ticker=null}={}){
    if(typeof this.db?.stopGuardRecoveryEpisodes!=='function'||typeof this.db?.updateStopGuardRecoveryEpisode!=='function'||!market)return {tracked:0,completed:0,recovered:0};
    const rows=await this.db.stopGuardRecoveryEpisodes(this.systemName,{complete:false,ticker,limit:ticker?20:STOP_GUARD_RECOVERY_LEARNING.maximumEpisodes});
    const now=Date.now();const windowMs=Math.max(1,n(settings?.recoveryTrackingHours,24))*3600000;
    let tracked=0,completed=0,recovered=0;
    for(const row of rows){
      const lockKey=String(row?.id||'');
      if(!lockKey||this.stopGuardRecoveryTrackingLocks.has(lockKey))continue;
      this.stopGuardRecoveryTrackingLocks.add(lockKey);
      try{
      let q=quotes?.get?.(row.ticker)||market.getQuote?.(row.ticker)||null;
      if(!q||market.quoteAgeMs?.(row.ticker,now)>30000)q=await market.refreshTicker?.(row.ticker).catch?.(()=>q)||q;
      const episode={originalCount:n(row.original_count),trackedCount:n(row.tracked_count,n(row.original_count)),triggerAtMs:n(row.trigger_at_ms)};
      let state=row.state&&typeof row.state==='object'?row.state:{};
      let observation=null;
      const status=String(q?.status||'').toLowerCase();
      const final=['finalized','settled'].includes(status)&&Boolean(q?.result);
      if(final){
        const payout=String(q.result).toLowerCase()==='yes'?100:0;
        const settlementNet=n(row.base_realized_pnl_cents)+(payout-n(row.entry_price_cents))*n(row.tracked_count,n(row.original_count))-n(row.entry_fee_cents);
        observation={observedAtMs:Math.max(n(q?.updatedAtMs,now),n(row.trigger_at_ms)),final:true,finalResult:q.result,settlementPriceCents:payout,settlementNetCents:settlementNet};
      }else if(q){
        await market.ensureFreshBook?.(row.ticker,STOP_GUARD_RECOVERY_LEARNING.maximumBookAgeMs).catch?.(()=>null);
        const freshQ=market.getQuote?.(row.ticker)||q;
        const book=market.getBook?.(row.ticker);
        const bookMs=n(book?.updatedAtMs,n(freshQ?.updatedAtMs));
        const age=bookMs>0?now-bookMs:Infinity;
        const fresh=Boolean(book&&bookMs>0&&age>=-STOP_GUARD_RECOVERY_LEARNING.maximumFutureBookSkewMs&&age<=STOP_GUARD_RECOVERY_LEARNING.maximumBookAgeMs&&!freshQ?.bookInvalid);
        const count=Math.max(1,n(row.tracked_count,n(row.original_count)));
        const exec=fresh?market.executableBid?.(row.ticker,count,1):null;
        const full=Boolean(exec?.full&&n(exec.filled)+1e-9>=count&&Number.isFinite(Number(exec.avgCents)));
        if(full){
          const bid=n(exec.avgCents);const feePerContract=n(settings?.simFeeCents,n(state?.feePerContractCents,2));
          const exitFee=feePerContract*count;
          const net=n(row.base_realized_pnl_cents)+(bid-n(row.entry_price_cents))*count-n(row.entry_fee_cents)-exitFee;
          observation={observedAtMs:bookMs,fullExecutable:true,executableBidCents:bid,executableNetCents:net};
        }
      }
      if(observation){state=advanceStopGuardRecoveryState(state,episode,observation,now);tracked+=1;}
      if(!state.trackingComplete&&now-n(row.trigger_at_ms)>=windowMs){state={...state,trackingComplete:true,recovered:false,recoveryAtMs:null,completionReason:'research_window_complete',completedAtMs:now};}
      if(state.trackingComplete&&!row.tracking_complete){completed+=1;if(state.recovered)recovered+=1;}
      await this.db.updateStopGuardRecoveryEpisode(row.id,{state,trackingComplete:Boolean(state.trackingComplete),recovered:Boolean(state.recovered),recoveryAtMs:state.recoveryAtMs||null,updatedAtMs:now});
      }finally{
        this.stopGuardRecoveryTrackingLocks.delete(lockKey);
      }
    }
    return {tracked,completed,recovered};
  }

  async aggregateStopGuardProfiles(){
    if(typeof this.db?.stopGuardRecoveryEpisodes!=='function'||typeof this.db?.replaceStopGuardProfiles!=='function')return {profiles:0,observations:0};
    const mode=STOP_GUARD_RECOVERY_LEARNING.decisionEvidenceMode;
    const rows=(await this.db.stopGuardRecoveryEpisodes(this.systemName,{complete:true,mode,coverageKind:'causal_from_trigger',limit:STOP_GUARD_RECOVERY_LEARNING.maximumEpisodes}))
      .filter(r=>String(r.coverage_kind||r.state?.coverageKind||'')==='causal_from_trigger'&&r.state?.decisionEvidenceEligible===true);
    let profileCount=0;
    for(const stage of ['SLW1','USG1']){
      const stageRows=rows.filter(r=>String(r.trigger_stage||'').toUpperCase()===stage);
      const buckets=new Map();
      for(const row of stageRows){
        const keys=stopGuardRecoveryProfileKeys({conceptName:row.concept_name,sourceFeeder:row.source_feeder,sport:row.sport,entryPriceCents:n(row.entry_price_cents),totalDropCents:n(row.trigger_drop_cents),gameMinutes:n(row.game_minutes_at_entry),crashBucket:row.crash_bucket});
        for(const key of keys){if(!buckets.has(key.profileKey))buckets.set(key.profileKey,{meta:key,rows:[]});buckets.get(key.profileKey).rows.push(row);}
      }
      const profiles=[];
      for(const {meta,rows:list} of buckets.values()){
        const recovered=list.filter(r=>Boolean(r.recovered));
        const times=recovered.map(r=>Math.max(0,n(r.recovery_at_ms)-n(r.trigger_at_ms))).filter(Number.isFinite);
        profiles.push({...meta,totalObservations:list.length,recoveredCount:recovered.length,avgTimeToRecoverMs:Math.round(avg(times)),confidenceLevel:list.length>=30?'high':list.length>=STOP_GUARD_RECOVERY_LEARNING.minimumProfileObservations?'medium':'low',updatedAtMs:Date.now()});
      }
      await this.db.replaceStopGuardProfiles(this.systemName,stage,mode,profiles);
      profileCount+=profiles.length;
    }
    return {profiles:profileCount,observations:rows.length};
  }

  async stopGuardDecisionProfile(triggerStage,{ticker,title='',conceptName='Unknown',sourceFeeder=null,mode='SIMULATION',entryPriceCents=0,totalDropCents=0,gameMinutes=0,crashBucket:crashBucketOverride=null,minimumObservations=STOP_GUARD_RECOVERY_LEARNING.minimumProfileObservations}={}){
    const sportProfile=await this.classify(ticker,title);const sport=sportProfile.detected_sport_name||'Unknown';
    const crashBucket=crashBucketOverride?String(crashBucketOverride):stopGuardCrashBucket(this.crashState(ticker)||{});
    const keys=stopGuardRecoveryProfileKeys({conceptName,sourceFeeder,sport,entryPriceCents,totalDropCents,gameMinutes,crashBucket});
    if(typeof this.db?.stopGuardProfiles!=='function')return {totalObservations:0,recoveredCount:0,smoothedRecoveryRate:0.5,avgRecoveryTimeMs:0,sport,specificity:'cold_start',entryBand:stopGuardEntryBand(entryPriceCents),dropBucket:stopGuardDropBucket(totalDropCents),gameBucket:stopGuardGameBucket(gameMinutes),crashBucket,confidence:'low',evidenceVersion:STOP_GUARD_RECOVERY_LEARNING.version};
    const rows=await this.db.stopGuardProfiles(this.systemName,{triggerStage,mode,profileKeys:keys.map(k=>k.profileKey)});
    const byKey=new Map(rows.map(r=>[String(r.profile_key),r]));
    let chosen=null;
    for(const key of keys){const row=byKey.get(key.profileKey);if(row&&n(row.total_observations)>=minimumObservations){chosen={key,row};break;}}
    if(!chosen){for(const key of keys){const row=byKey.get(key.profileKey);if(row){chosen={key,row};break;}}}
    if(!chosen)return {totalObservations:0,recoveredCount:0,smoothedRecoveryRate:0.5,avgRecoveryTimeMs:0,sport,specificity:'cold_start',entryBand:stopGuardEntryBand(entryPriceCents),dropBucket:stopGuardDropBucket(totalDropCents),gameBucket:stopGuardGameBucket(gameMinutes),crashBucket,confidence:'low',evidenceVersion:STOP_GUARD_RECOVERY_LEARNING.version};
    const total=n(chosen.row.total_observations),recovered=n(chosen.row.recovered_count);const alpha=ULTIMATE_STOP_GUARD.betaPriorAlpha,beta=ULTIMATE_STOP_GUARD.betaPriorBeta;
    return {totalObservations:total,recoveredCount:recovered,smoothedRecoveryRate:(recovered+alpha)/Math.max(1,total+alpha+beta),avgRecoveryTimeMs:n(chosen.row.avg_time_to_recover_ms),sport,specificity:chosen.key.specificity,entryBand:stopGuardEntryBand(entryPriceCents),dropBucket:stopGuardDropBucket(totalDropCents),gameBucket:stopGuardGameBucket(gameMinutes),crashBucket,confidence:total>=30?'high':total>=minimumObservations?'medium':'low',evidenceVersion:STOP_GUARD_RECOVERY_LEARNING.version,profileKey:chosen.key.profileKey};
  }

  async stopGuardRecoverySummary(){
    if(typeof this.db?.stopGuardRecoverySummary==='function'){
      const row=await this.db.stopGuardRecoverySummary(this.systemName,STOP_GUARD_RECOVERY_LEARNING.decisionEvidenceMode);
      return {version:STOP_GUARD_RECOVERY_LEARNING.version,role:STOP_GUARD_RECOVERY_LEARNING.role,tracked:n(row?.tracked),complete:n(row?.complete),recovered:n(row?.recovered),causalFromTrigger:n(row?.causal_from_trigger),partialFromUpgrade:n(row?.partial_from_upgrade),decisionEligibleComplete:n(row?.decision_eligible_complete),decisionEligibleRecovered:n(row?.decision_eligible_recovered),decisionEvidenceMode:STOP_GUARD_RECOVERY_LEARNING.decisionEvidenceMode};
    }
    if(typeof this.db?.stopGuardRecoveryEpisodes!=='function')return {version:STOP_GUARD_RECOVERY_LEARNING.version,tracked:0,complete:0,recovered:0,decisionEvidenceMode:STOP_GUARD_RECOVERY_LEARNING.decisionEvidenceMode};
    const rows=await this.db.stopGuardRecoveryEpisodes(this.systemName,{limit:STOP_GUARD_RECOVERY_LEARNING.maximumEpisodes});
    const causal=rows.filter(r=>String(r.coverage_kind||r.state?.coverageKind||'')==='causal_from_trigger');
    const partial=rows.filter(r=>String(r.coverage_kind||r.state?.coverageKind||'')==='partial_from_upgrade');
    const eligible=causal.filter(r=>String(r.mode||'')===STOP_GUARD_RECOVERY_LEARNING.decisionEvidenceMode&&r.state?.decisionEvidenceEligible===true);
    return {version:STOP_GUARD_RECOVERY_LEARNING.version,role:STOP_GUARD_RECOVERY_LEARNING.role,tracked:rows.length,complete:rows.filter(r=>r.tracking_complete).length,recovered:rows.filter(r=>r.tracking_complete&&r.recovered).length,causalFromTrigger:causal.length,partialFromUpgrade:partial.length,decisionEligibleComplete:eligible.filter(r=>r.tracking_complete).length,decisionEligibleRecovered:eligible.filter(r=>r.tracking_complete&&r.recovered).length,decisionEvidenceMode:STOP_GUARD_RECOVERY_LEARNING.decisionEvidenceMode};
  }

  async learnMarketDrops(trackers, quotes) {
    const now = Date.now();
    for (const t of trackers) {
      let h = [];
      try { h = Array.isArray(t.price_history) ? t.price_history : JSON.parse(t.price_history || '[]'); } catch {}
      if (h.length < 2) continue;
      const asks = h.map((x) => Number(x.ask ?? x)).filter((x) => Number.isFinite(x) && x > 0);
      if (asks.length < 2) continue;
      const peak = Math.max(...asks);
      const current = asks.at(-1);
      if (peak < 50 || peak > 95 || peak - current < RECOVERY_MARKET_DROP_CENTS) continue;
      const peakIndex = asks.lastIndexOf(peak);
      const peakTime = Number(h[peakIndex]?.t || t.first_seen_ms || now);
      const key = `MKT:${t.ticker}:${peakTime}`;
      if (this.marketDropKeys.has(key)) continue;
      const existing = (await this.db.recoveryObservations(this.systemName, { limit:5000 })).some((x) => x.original_entry_id === key);
      if (existing) { this.marketDropKeys.add(key); continue; }
      const q = quotes.get(t.ticker);
      if (!q) continue;
      const profile = await this.classify(t.ticker, t.market_title);
      // R17: never let a legacy/pre-GCA tracker timestamp contaminate learned
      // game-time buckets. Unknown clock truth stays in the conservative 0
      // bucket until GCA1 has positively authorized the lower-bound start.
      const gameStart = isConfirmedGameClockState(t.game_clock_state, t.event_ticker || t.ticker) ? Number(t.game_start_time_ms) || 0 : 0;
      const gm = gameStart ? Math.max(0, Math.round((now - gameStart) / 60000)) : 0;
      await this.db.createRecoveryObservation({
        id:`${key}:${randomUUID().slice(0,8)}`, systemName:this.systemName, originalEntryId:key, ticker:t.ticker, conceptName:'MarketObserver',
        sport:profile.detected_sport_name || 'Unknown', entryPriceCents:peak, exitPriceCents:current, dropCents:peak-current,
        gameMinutesAtEntry:gm, exitAtMs:now, prices:[{ t:now, p:current }], troughCents:current, reboundCents:0,
        recovered:false, trackingComplete:false, settled:false, updatedAtMs:now,
      });
      this.marketDropKeys.add(key);
    }
  }

  async aggregatePatterns() {
    const obs = await this.db.recoveryObservations(this.systemName, { complete:true, limit:5000 });
    const buckets = new Map();
    for (const o of obs) {
      const troughBelow = Number(o.exit_price_cents) - Number(o.trough_cents);
      const key = patternKey(o.sport, Number(o.entry_price_cents), Number(o.drop_cents), Number(o.game_minutes_at_entry), troughBelow);
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(o);
    }
    for (const [key, list] of buckets) {
      const rec = list.filter((x) => x.recovered);
      const [sport, eb, db, gb, tb] = key.split('|');
      await this.db.upsertPattern({
        systemName:this.systemName, patternKey:key, sport, entryBand:eb, dropBucket:db, gameBucket:gb, troughBucket:tb,
        total:list.length, recovered:rec.length, rate:Math.round(rec.length / list.length * 100) / 100,
        avgTrough:Math.round(avg(list.map((x) => Number(x.trough_cents)))),
        avgRebound:Math.round(avg(list.map((x) => Number(x.rebound_cents)))),
        avgTime:Math.round(avg(rec.map((x) => Number(x.time_to_recover_ms)))),
        confidence:list.length >= 15 ? 'high' : list.length >= 5 ? 'medium' : 'low',
      });
    }
  }

  async recoveryRate(ticker, title, entryPrice, drop, gameMinutes, minObs) {
    const p = await this.classify(ticker, title);
    const patterns = await this.db.patterns(this.systemName);
    const matches = patterns.filter((x) => x.sport === (p.detected_sport_name || 'Unknown')
      && x.entry_price_band === entryBand(entryPrice)
      && x.drop_bucket === dropBucket(drop)
      && x.game_minutes_bucket === gameBucket(gameMinutes));
    const total = matches.reduce((s, x) => s + Number(x.total_observations), 0);
    if (total < minObs) return null;
    const recovered = matches.reduce((s, x) => s + Number(x.recovered_count), 0);
    return { recoveryRate:total ? recovered / total : 0, totalObservations:total, confidence:total >= 15 ? 'high' : total >= 5 ? 'medium' : 'low', sport:p.detected_sport_name || 'Unknown' };
  }

  // R41 SGRL1 is the sole historical decision evidence for U-SG1/SLW1.
  // Legacy sag_recovery_patterns remain available to Recovery Hunter/Athena
  // research but cannot authorize a Stop Guard hold or veto a live exit.
  async stopGuardProfile(args = {}) {
    return this.stopGuardDecisionProfile('USG1',{...args,minimumObservations:args.minimumObservations??ULTIMATE_STOP_GUARD.minimumLearningObservations});
  }

  async lossWatchdogProfile(args = {}) {
    return this.stopGuardDecisionProfile('SLW1',{...args,minimumObservations:args.minimumObservations??STOP_LOSS_WATCHDOG.minimumLearningObservations});
  }

  cacheProfitProfile(profile={}){
    const profileKey=String(profile.profile_key||profile.profileKey||'');
    if(!profileKey)return null;
    const row={
      profile_key:profileKey,
      specificity:String(profile.specificity||'global'),
      concept_name:profile.concept_name??profile.conceptName??null,
      source_feeder:profile.source_feeder??profile.sourceFeeder??null,
      sport:profile.sport??null,
      entry_band:profile.entry_band??profile.entryBand??null,
      total_observations:n(profile.total_observations??profile.totalObservations),
      one_tick_pullbacks:n(profile.one_tick_pullbacks??profile.oneTickPullbacks),
      one_tick_recoveries:n(profile.one_tick_recoveries??profile.oneTickRecoveries),
      collapse_count:n(profile.collapse_count??profile.collapseCount),
      avg_peak_capture_rate:n(profile.avg_peak_capture_rate??profile.avgPeakCaptureRate),
      avg_post_exit_regret_rate:n(profile.avg_post_exit_regret_rate??profile.avgPostExitRegretRate),
      recommended_retention_ratio:n(profile.recommended_retention_ratio??profile.recommendedRetentionRatio,PROTECTED_RUNNER_INTELLIGENCE.coldStartRetentionRatio),
      confidence_level:String(profile.confidence_level||profile.confidenceLevel||'low'),
      state:profile.state&&typeof profile.state==='object'?structuredClone(profile.state):{},
      updated_at_ms:n(profile.updated_at_ms??profile.updatedAtMs),
    };
    const prior=this.profitProfilesCache.get(profileKey);
    if(!prior||n(row.updated_at_ms)>=n(prior.updated_at_ms))this.profitProfilesCache.set(profileKey,row);
    return structuredClone(this.profitProfilesCache.get(profileKey));
  }

  profitRetentionProfileCached(entry={}){
    const id=String(entry?.id||'');
    const meta=id?this.profitMeta.get(id):null;
    const deterministic=classifyDeterministic(entry?.ticker||meta?.ticker||'',entry?.marketTitle||'');
    const cohort={
      conceptName:String(meta?.conceptName||entry?.conceptName||'Unknown'),
      sourceFeeder:meta?.sourceFeeder??entry?.sourceFeeder??null,
      sport:String(meta?.sport||deterministic.sportName||'Unknown'),
      entryPriceCents:n(meta?.entryPriceCents,entry?.entryPriceCents),
    };
    const cold={version:PROFIT_LEARNING_INTELLIGENCE.version,retentionRatio:PROTECTED_RUNNER_INTELLIGENCE.coldStartRetentionRatio,runnerGivebackCents:PROTECTED_RUNNER_INTELLIGENCE.coldStartRunnerGivebackNetPerContractCents,specificity:'cold_start',totalObservations:0,oneTickPullbacks:0,oneTickRecoveries:0,continuationRate:0.5,collapseRate:0.25,avgPeakCaptureRate:0,avgPostExitRegretRate:0,confidence:'low',promoted:false};
    for(const key of profitLearningProfileKeys(cohort)){
      const row=this.profitProfilesCache.get(key.profileKey);if(!row)continue;
      const total=n(row.total_observations),pull=n(row.one_tick_pullbacks);
      if(total<PROFIT_LEARNING_INTELLIGENCE.minimumProfileObservations||pull<PROFIT_LEARNING_INTELLIGENCE.minimumPullbackObservations)continue;
      const runnerGivebackCents=Math.max(
        PROTECTED_RUNNER_INTELLIGENCE.minimumRunnerGivebackNetPerContractCents,
        Math.min(
          PROTECTED_RUNNER_INTELLIGENCE.maximumRunnerGivebackNetPerContractCents,
          n(row.state?.recommendedRunnerGivebackCents,recommendProfitRunnerGivebackCents({
            totalObservations:total,oneTickPullbacks:pull,oneTickRecoveries:n(row.one_tick_recoveries),
            collapseCount:n(row.collapse_count),avgPostExitRegretRate:n(row.avg_post_exit_regret_rate),
          })),
        ),
      );
      return {version:PROFIT_LEARNING_INTELLIGENCE.version,retentionRatio:Math.max(PROTECTED_RUNNER_INTELLIGENCE.minimumRetentionRatio,Math.min(PROTECTED_RUNNER_INTELLIGENCE.maximumRetentionRatio,n(row.recommended_retention_ratio,PROTECTED_RUNNER_INTELLIGENCE.coldStartRetentionRatio))),runnerGivebackCents,specificity:String(row.specificity||key.specificity),profileKey:key.profileKey,totalObservations:total,oneTickPullbacks:pull,oneTickRecoveries:n(row.one_tick_recoveries),continuationRate:Math.max(0,Math.min(1,n(row.state?.continuationRate,(n(row.one_tick_recoveries)+2)/(pull+4)))),collapseRate:Math.max(0,Math.min(1,n(row.state?.collapseRate,(n(row.collapse_count)+1)/(total+2)))),avgPeakCaptureRate:n(row.avg_peak_capture_rate),avgPostExitRegretRate:n(row.avg_post_exit_regret_rate),confidence:String(row.confidence_level||'medium'),promoted:true};
    }
    return cold;
  }

  profitLearningState(entryId){const s=this.profitStates.get(String(entryId||''));return s?structuredClone(s):null;}

  async ensureProfitLearningMeta(entry){
    const id=String(entry?.id||'');if(!id)return null;
    let meta=this.profitMeta.get(id);
    if(meta)return meta;
    let sport='Unknown';
    try{sport=(await this.classify(entry.ticker,entry.marketTitle||'')).detected_sport_name||'Unknown';}catch{}
    meta={id,systemName:this.systemName,ticker:String(entry.ticker||''),eventTicker:String(entry.eventTicker||entry.ticker||''),conceptName:String(entry.conceptName||'Unknown'),sourceFeeder:entry.sourceFeeder||null,sport,entryPriceCents:n(entry.entryPriceCents),originalCount:n(entry.count),openedAtMs:n(entry.openedAtMs,Date.now()),closedAtMs:entry.closedAtMs==null?null:n(entry.closedAtMs)};
    this.profitMeta.set(id,meta);return meta;
  }

  async persistProfitLearning(entry,state,{force=false,trackingComplete=null}={}){
    if(typeof this.db.upsertProfitEpisode!=='function')return;
    const meta=await this.ensureProfitLearningMeta(entry);if(!meta)return;
    const now=Date.now(),id=meta.id,last=n(this.profitLastPersistMs.get(id));
    if(!force&&now-last<PROFIT_LEARNING_INTELLIGENCE.persistenceIntervalMs)return;
    const complete=trackingComplete==null?Boolean(state.trackingComplete):Boolean(trackingComplete);
    await this.db.upsertProfitEpisode({...meta,closedAtMs:entry.closedAtMs??meta.closedAtMs,trackingComplete:complete,state,updatedAtMs:now});
    this.profitLastPersistMs.set(id,now);
  }

  async observeProfitOpportunity(entry,observation={}){
    const id=String(entry?.id||'');if(!id)return null;
    const meta=await this.ensureProfitLearningMeta(entry);if(!meta)return null;
    const prior=this.profitStates.get(id)||initialProfitLearningState(entry,meta.sport,Date.now());
    const next=advanceProfitLearningState(prior,entry,{...observation,sport:meta.sport},Date.now());
    this.profitStates.set(id,next);
    const meaningful=n(next.maxExecutableNetCents)!==n(prior.maxExecutableNetCents)||n(next.oneTickPullbackCount)!==n(prior.oneTickPullbackCount)||n(next.oneTickRecoveryCount)!==n(prior.oneTickRecoveryCount);
    await this.persistProfitLearning(entry,next,{force:meaningful});
    return structuredClone(next);
  }

  async markProfitExit(entry,{realizedNetCents=null,exitVwapCents=null,closedAtMs=null,closeReason=null}={}){
    const id=String(entry?.id||'');if(!id)return null;
    const meta=await this.ensureProfitLearningMeta(entry);if(!meta)return null;
    const prior=this.profitStates.get(id)||initialProfitLearningState(entry,meta.sport,Date.now());
    const state={...prior,phase:'POST_EXIT_TRACKING',actualRealizedNetCents:realizedNetCents==null?n(entry.pnlCents):n(realizedNetCents),actualExitVwapCents:exitVwapCents==null?(entry.exitPriceCents==null?null:n(entry.exitPriceCents)):n(exitVwapCents),actualExitAtMs:n(closedAtMs,entry.closedAtMs||Date.now()),closeReason:String(closeReason||entry.closeReason||''),trackingComplete:false,lastObservedAtMs:Date.now()};
    this.profitStates.set(id,state);meta.closedAtMs=state.actualExitAtMs;this.profitMeta.set(id,meta);
    await this.persistProfitLearning({...entry,closedAtMs:state.actualExitAtMs},state,{force:true});
    return structuredClone(state);
  }

  async observeProfitPostExit(entry,{executableBidCents=null,executableNetCents=null,observedAtMs=Date.now(),finalResult=null,terminalNetCents=null}={}){
    const id=String(entry?.id||'');if(!id)return null;
    const meta=await this.ensureProfitLearningMeta(entry);if(!meta)return null;
    const prior=this.profitStates.get(id)||initialProfitLearningState(entry,meta.sport,Date.now());
    const state={...prior,phase:'POST_EXIT_TRACKING',lastObservedAtMs:observedAtMs};
    if(Number.isFinite(Number(executableNetCents))&&Number.isFinite(Number(executableBidCents))){
      if(state.postExitMaxExecutableNetCents==null||n(executableNetCents)>n(state.postExitMaxExecutableNetCents)+1e-9){state.postExitMaxExecutableNetCents=n(executableNetCents);state.postExitMaxExecutableBidCents=n(executableBidCents);state.postExitMaxAtMs=observedAtMs;}
      if(state.postExitMinExecutableNetCents==null||n(executableNetCents)<n(state.postExitMinExecutableNetCents)-1e-9){state.postExitMinExecutableNetCents=n(executableNetCents);state.postExitMinExecutableBidCents=n(executableBidCents);state.postExitMinAtMs=observedAtMs;}
    }
    if(finalResult!=null)state.finalResult=String(finalResult||'').toLowerCase()||null;
    if(terminalNetCents!=null&&Number.isFinite(Number(terminalNetCents)))state.terminalNetCents=n(terminalNetCents);
    this.profitStates.set(id,state);await this.persistProfitLearning(entry,state,{force:Boolean(finalResult)});return structuredClone(state);
  }

  async finalizeProfitLearning(entry,{finalResult=null,terminalNetCents=null,reason='research_window_complete'}={}){
    const id=String(entry?.id||'');if(!id)return null;
    const meta=await this.ensureProfitLearningMeta(entry);if(!meta)return null;
    const prior=this.profitStates.get(id)||initialProfitLearningState(entry,meta.sport,Date.now());
    const state={...prior,phase:'COMPLETE',trackingComplete:true,completedAtMs:Date.now(),completionReason:reason,finalResult:finalResult==null?prior.finalResult:(String(finalResult||'').toLowerCase()||null),terminalNetCents:terminalNetCents==null?prior.terminalNetCents:n(terminalNetCents)};
    if(state.actualRealizedNetCents==null)state.actualRealizedNetCents=n(entry.pnlCents);
    if(state.actualExitAtMs==null)state.actualExitAtMs=n(entry.closedAtMs,Date.now());
    if(Number.isFinite(Number(state.terminalNetCents))){
      const terminal=n(state.terminalNetCents),shadow={...(state.shadow||{})};
      for(const [name,priorShadow] of Object.entries(shadow)){
        const harvestedFraction=Math.max(0,Math.min(1,n(priorShadow?.harvestedFraction)));
        const runnerFraction=Math.max(0,1-harvestedFraction);
        shadow[name]={...priorShadow,runnerFraction,terminalRunnerNetCents:runnerFraction*terminal,finalCounterfactualNetCents:n(priorShadow?.harvestedNetCents)+runnerFraction*terminal};
      }
      state.shadow=shadow;
    }
    this.profitStates.set(id,state);await this.persistProfitLearning({...entry,closedAtMs:state.actualExitAtMs},state,{force:true,trackingComplete:true});
    await this.rebuildProfitProfiles().catch(()=>{});return structuredClone(state);
  }

  async rebuildProfitProfiles(){
    if(typeof this.db.profitEpisodes!=='function'||typeof this.db.upsertProfitProfile!=='function')return [];
    const rows=await this.db.profitEpisodes(this.systemName,{complete:true,limit:10000});
    const buckets=new Map();
    for(const row of rows||[]){
      const state=row?.state&&typeof row.state==='object'?row.state:{};
      if(state.version!==PROFIT_LEARNING_INTELLIGENCE.version)continue;
      const keys=profitLearningProfileKeys({conceptName:row.concept_name,sourceFeeder:row.source_feeder,sport:row.sport,entryPriceCents:row.entry_price_cents});
      const m=profitEpisodeMetrics(state);
      for(const key of keys){if(!buckets.has(key.profileKey))buckets.set(key.profileKey,{key,metrics:[]});buckets.get(key.profileKey).metrics.push(m);}
    }
    const out=[];
    for(const {key,metrics} of buckets.values()){
      const total=metrics.length,pull=metrics.reduce((a,x)=>a+x.oneTickPullbacks,0),recover=metrics.reduce((a,x)=>a+x.oneTickRecoveries,0),collapse=metrics.reduce((a,x)=>a+x.collapse,0);
      const capture=avg(metrics.map(x=>x.peakCaptureRate).filter(Number.isFinite));
      const regret=avg(metrics.map(x=>x.postExitRegretRate).filter(Number.isFinite));
      const ratio=recommendProfitRetentionRatio({totalObservations:total,oneTickPullbacks:pull,oneTickRecoveries:recover,collapseCount:collapse,avgPostExitRegretRate:regret});
      const runnerGivebackCents=recommendProfitRunnerGivebackCents({totalObservations:total,oneTickPullbacks:pull,oneTickRecoveries:recover,collapseCount:collapse,avgPostExitRegretRate:regret});
      const p={systemName:this.systemName,profileKey:key.profileKey,specificity:key.specificity,conceptName:key.conceptName,sourceFeeder:key.sourceFeeder,sport:key.sport,entryBand:key.entryBand,totalObservations:total,oneTickPullbacks:pull,oneTickRecoveries:recover,collapseCount:collapse,avgPeakCaptureRate:capture,avgPostExitRegretRate:regret,recommendedRetentionRatio:ratio,confidenceLevel:total>=30?'high':total>=PROFIT_LEARNING_INTELLIGENCE.minimumProfileObservations?'medium':'low',state:{version:PROFIT_LEARNING_INTELLIGENCE.version,continuationRate:(recover+2)/(pull+4),collapseRate:(collapse+1)/(total+2),recommendedRunnerGivebackCents:runnerGivebackCents},updatedAtMs:Date.now()};
      await this.db.upsertProfitProfile(p);this.cacheProfitProfile(p);out.push(p);
    }
    return out;
  }

  async profitRetentionProfile(entry){
    await this.ensureProfitLearningMeta(entry).catch(()=>null);
    return this.profitRetentionProfileCached(entry);
  }

  profitLearningSummary(){
    const states=[...this.profitStates.values()];
    return {version:PROFIT_LEARNING_INTELLIGENCE.version,tracked:states.length,complete:states.filter(x=>x.trackingComplete).length,postExitTracking:states.filter(x=>x.phase==='POST_EXIT_TRACKING').length,active:states.filter(x=>!x.trackingComplete&&x.phase!=='POST_EXIT_TRACKING').length};
  }

  async learnDurations(quotes) {
    const now = Date.now();
    for (const q of quotes.values()) {
      if (!q.result || q.occurrenceTimeMs <= 0 || !['determined','finalized'].includes(q.status)) continue;
      if (this.durationRecorded.has(q.ticker)) continue;
      const d = now - q.occurrenceTimeMs;
      if (d <= 0 || d > 24 * 3600000) continue;
      const prefix = prefixForTicker(q.ticker);
      await this.classify(q.ticker, q.title);
      await this.db.recordSportDuration(prefix, d);
      this.durationRecorded.add(q.ticker);
    }
  }
}
