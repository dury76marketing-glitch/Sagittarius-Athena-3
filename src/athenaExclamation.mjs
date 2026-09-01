export const ATHENA_EXCLAMATION = Object.freeze({
  version:'ATHENA-EXCLAMATION-AE1',
  policyRevision:'AE1-R3-DURABLE-FORMATION-SINGLE-CONSUMPTION',
  role:'rolling_three_gold_saint_meta_attack',
  minimumSaints:3,
  defaultConvergenceWindowMinutes:70,
  sourceDoesNotAuthorizeEntry:true,
  primeReviewRequired:false,
  legacyPrimeReviewAvailable:true,
  strategicEntryAuthority:'ATHENA-A3',
  ordinaryCooldownExempt:true,
  maximumTrackedTickers:2048,
});

export const GOLD_SAINT_CONCEPTS = Object.freeze([
  'Wave Surfer',
  'Crash Recovery Hunter',
  'Recovery Hunter',
  'Momentum Hunter',
  'Lightning Plasma',
]);
const GOLD_SAINT_SET = new Set(GOLD_SAINT_CONCEPTS);
const finite=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const clone=(v)=>v&&typeof v==='object'?structuredClone(v):v;
const voteKey=(ticker,concept)=>`${String(ticker||'')}|${String(concept||'')}`;
const ACTIVE_EVENT_STATUSES=new Set(['CANDIDATE','QUALIFIED']);
const TERMINAL_EVENT_STATUSES=new Set(['EXECUTED','REJECTED','EXECUTION_BLOCKED']);
const eventIsActive=(e,now=Date.now())=>Boolean(e&&ACTIVE_EVENT_STATUSES.has(String(e.status||''))&&finite(e.expiresAtMs,0)>finite(now,Date.now())&&finite(e.saintCount,0)>=ATHENA_EXCLAMATION.minimumSaints);

export function isGoldSaintConcept(conceptName){return GOLD_SAINT_SET.has(String(conceptName||''));}

export function athenaExclamationWindowMs(settings={}){
  const minutes=Math.max(1,Math.min(240,finite(settings.athenaExclamationConvergenceWindowMinutes,ATHENA_EXCLAMATION.defaultConvergenceWindowMinutes)));
  return minutes*60_000;
}

export function athenaExclamationPrimeReview({candidate,quote,executionPlan,settings={},athenaAssessment=null,now=Date.now()}={}){
  const reasons=[];
  if(!candidate||!Array.isArray(candidate.saints)||candidate.saints.length<ATHENA_EXCLAMATION.minimumSaints)reasons.push('three_saints_missing');
  const ticker=String(quote?.ticker||'');
  if(!ticker||String(candidate?.ticker||'')!==ticker)reasons.push('ticker_mismatch');
  const windowMs=athenaExclamationWindowMs(settings);
  const firstAt=finite(candidate?.firstVoteAtMs,0),thirdAt=finite(candidate?.thirdVoteAtMs,0);
  if(!(firstAt>0)||!(thirdAt>=firstAt)||thirdAt-firstAt>windowMs)reasons.push('convergence_window_expired');
  if(now-firstAt>windowMs)reasons.push('convergence_stale');
  const bid=finite(quote?.yesBid,0),ask=finite(quote?.yesAsk,0);
  const minEntry=finite(settings.athenaExclamationMinEntryCents,10);
  const maxEntry=finite(settings.athenaExclamationMaxEntryCents,55);
  const maxSpread=Math.max(0,finite(settings.athenaExclamationMaxSpreadCents,3));
  if(!(bid>0)||!(ask>0)||bid>ask)reasons.push('invalid_quote');
  if(ask<minEntry||ask>maxEntry)reasons.push('entry_band');
  if(ask-bid>maxSpread)reasons.push('spread');
  const avg=finite(executionPlan?.averagePriceCents,ask),bestAsk=finite(executionPlan?.bestAskCents,ask);
  if(!(avg>0)||!(bestAsk>0)||bestAsk<minEntry||bestAsk>maxEntry||avg>maxEntry)reasons.push('execution_price_band');
  const remainingUpside=100-avg;
  const minUpside=Math.max(1,finite(settings.athenaExclamationMinRemainingUpsideCents,40));
  if(remainingUpside+1e-9<minUpside)reasons.push('insufficient_remaining_upside');
  const gameMinutes=finite(quote?.gameMinutes,finite(candidate?.gameMinutes,0));
  const minGame=Math.max(0,finite(settings.athenaExclamationMinGameMinutes,0));
  const maxGame=Math.max(0,finite(settings.athenaExclamationMaxGameMinutes,0));
  if(gameMinutes+1e-9<minGame)reasons.push('exclamation_min_game_time');
  if(maxGame>0&&gameMinutes-1e-9>maxGame)reasons.push('exclamation_max_game_time');

  const fk=athenaAssessment?.fallingKnife||null;
  const hist=String(fk?.classification||'').toUpperCase();
  const live=String(fk?.liveStructure?.classification||'').toUpperCase();
  const action=String(fk?.recommendedAction||'').toUpperCase();
  if(hist==='FALLING_KNIFE'||live==='FALLING_KNIFE'||action==='BLOCK')reasons.push('athena_falling_knife');
  // AE1 is intentionally conservative: RECOVERABLE_VOLATILITY may be a good
  // ordinary trade, but the Big Bang requires present continuation evidence.
  if(hist&&hist!=='CONTINUATION')reasons.push('athena_not_continuation');
  if(!fk)reasons.push('athena_b2_unavailable');

  return {
    version:ATHENA_EXCLAMATION.version,policyRevision:ATHENA_EXCLAMATION.policyRevision,
    ok:reasons.length===0,reasons,reviewedAtMs:now,ticker,bidCents:bid,askCents:ask,
    averageEntryCents:avg,bestAskCents:bestAsk,remainingUpsideCents:remainingUpside,
    minEntryCents:minEntry,maxEntryCents:maxEntry,maxSpreadCents:maxSpread,minRemainingUpsideCents:minUpside,
    gameMinutes,minGameMinutes:minGame,maxGameMinutes:maxGame,
    athenaB2:fk?{classification:fk.classification,recommendedAction:fk.recommendedAction,decisionAuthority:fk.decisionAuthority,liveStructure:clone(fk.liveStructure)}:null,
  };
}

export class AthenaExclamationEngine {
  constructor({db=null,getSettings=()=>({}),audit=null}={}){
    this.db=db;this.getSettings=getSettings;this.audit=typeof audit==='function'?audit:null;
    this.votes=new Map();this.events=new Map();this.activeEventByTicker=new Map();
    this.counters={
      votesRecorded:0,votesRefreshed:0,formations:0,qualified:0,rejected:0,executed:0,
      votePersistenceFailures:0,formationLockFailures:0,formationLockBusy:0,durableVoteRefreshFailures:0,
      durableEventRefreshFailures:0,formationPersistenceFailures:0,formationConflicts:0,eventUpdateFailures:0,
    };
    this.lastFailure=null;
  }
  settings(){return this.getSettings?.()||{};}
  noteFailure(reason,data={}){this.lastFailure={reason:String(reason||'unknown'),atMs:Date.now(),...clone(data||{})};}
  async init(now=Date.now()){
    const s=this.settings();const systemName=String(s.systemName||'SAGITTARIUS');
    const since=now-Math.max(athenaExclamationWindowMs(s),240*60_000);
    if(typeof this.db?.recentAthenaExclamationVotes==='function'){
      const rows=await this.db.recentAthenaExclamationVotes(systemName,since).catch(()=>[]);
      for(const r of rows||[]){
        if(!isGoldSaintConcept(r.conceptName))continue;
        this.votes.set(voteKey(r.ticker,r.conceptName),{...r,snapshot:clone(r.snapshot||{})});
      }
    }
    if(typeof this.db?.recentAthenaExclamationEvents==='function'){
      const rows=await this.db.recentAthenaExclamationEvents(systemName,since).catch(()=>[]);
      for(const e of rows||[]){
        this.events.set(String(e.id),e);
        if(eventIsActive(e,now))this.activeEventByTicker.set(String(e.ticker),String(e.id));
      }
    }
    this.prune(now);return this.summary(now);
  }
  prune(now=Date.now()){
    const windowMs=athenaExclamationWindowMs(this.settings());
    // The convergence doctrine is a *rolling* window. A Gold Saint that
    // independently re-qualifies refreshes its current vote timestamp, but
    // still represents only one Saint. Keep firstQualifiedAtMs for audit and
    // use lastQualifiedAtMs for live eligibility.
    for(const [k,v] of this.votes){if(now-finite(v.lastQualifiedAtMs,finite(v.firstQualifiedAtMs,0))>windowMs)this.votes.delete(k);}
    for(const [ticker,id] of this.activeEventByTicker){const e=this.events.get(id);if(!eventIsActive(e,now))this.activeEventByTicker.delete(ticker);}
    if(this.votes.size>ATHENA_EXCLAMATION.maximumTrackedTickers*GOLD_SAINT_CONCEPTS.length){
      const rows=[...this.votes.entries()].sort((a,b)=>finite(a[1].lastQualifiedAtMs)-finite(b[1].lastQualifiedAtMs));
      const excess=this.votes.size-ATHENA_EXCLAMATION.maximumTrackedTickers*GOLD_SAINT_CONCEPTS.length;
      for(let i=0;i<excess;i++)this.votes.delete(rows[i][0]);
    }
  }
  votesForTicker(ticker,now=Date.now()){
    this.prune(now);const windowMs=athenaExclamationWindowMs(this.settings());
    return [...this.votes.values()].filter(v=>String(v.ticker)===String(ticker)&&now-finite(v.lastQualifiedAtMs,finite(v.firstQualifiedAtMs,0))<=windowMs)
      .sort((a,b)=>finite(a.lastQualifiedAtMs,finite(a.firstQualifiedAtMs))-finite(b.lastQualifiedAtMs,finite(b.firstQualifiedAtMs))||String(a.conceptName).localeCompare(String(b.conceptName)));
  }
  activeCandidate(ticker,now=Date.now()){
    this.prune(now);
    const id=this.activeEventByTicker.get(String(ticker||''));if(!id)return null;
    const event=this.events.get(String(id))||null;
    return eventIsActive(event,now)?clone(event):null;
  }
  async recordQualification({conceptName,ticker,eventTicker=null,qualifiedAtMs=Date.now(),priceCents=0,bidCents=0,sourceFeeder=null,sourceTradeId=null,gameMinutes=null,qualificationSnapshot=null}={}){
    if(!isGoldSaintConcept(conceptName)||!ticker)return {recorded:false,candidate:null};
    const s=this.settings();const now=finite(qualifiedAtMs,Date.now());const windowMs=athenaExclamationWindowMs(s);this.prune(now);
    const systemName=String(s.systemName||'SAGITTARIUS');
    const key=voteKey(ticker,conceptName);const prior=this.votes.get(key);const sameEpisode=prior&&now-finite(prior.lastQualifiedAtMs,finite(prior.firstQualifiedAtMs,0))<=windowMs;
    const vote={
      systemName,ticker:String(ticker),eventTicker:String(eventTicker||ticker),conceptName:String(conceptName),
      firstQualifiedAtMs:sameEpisode?finite(prior.firstQualifiedAtMs,now):now,lastQualifiedAtMs:now,
      refreshCount:sameEpisode?finite(prior.refreshCount,0)+1:0,priceCents:finite(priceCents,0),bidCents:finite(bidCents,0),
      sourceFeeder:sourceFeeder||null,sourceTradeId:sourceTradeId||null,gameMinutes:gameMinutes==null?null:finite(gameMinutes,0),
      snapshot:clone(qualificationSnapshot||{}),
    };
    this.votes.set(key,vote);sameEpisode?this.counters.votesRefreshed++:this.counters.votesRecorded++;

    // AE1 is a capital-authorizing meta-Attack. When a durable vote store is
    // present (production), an ambiguous persistence failure may never degrade
    // into an in-memory-only Big Bang. Preserve the prior local vote, if any,
    // but fail closed for this qualification cycle.
    if(typeof this.db?.upsertAthenaExclamationVote==='function'){
      try{await this.db.upsertAthenaExclamationVote(vote);}
      catch(error){
        if(prior)this.votes.set(key,prior);else this.votes.delete(key);
        this.counters.votePersistenceFailures++;this.noteFailure('vote_persistence_failed',{ticker:vote.ticker,conceptName:vote.conceptName,message:String(error?.message||error)});
        if(this.audit)await this.audit('athena_exclamation_vote_persistence_failed',{ticker:vote.ticker,conceptName:vote.conceptName,message:String(error?.message||error)}).catch?.(()=>{});
        return {recorded:false,vote:null,candidate:null,reason:'vote_persistence_failed'};
      }
    }
    if(this.audit)await this.audit('athena_exclamation_saint_vote',{ticker:vote.ticker,eventTicker:vote.eventTicker,conceptName:vote.conceptName,firstQualifiedAtMs:vote.firstQualifiedAtMs,lastQualifiedAtMs:vote.lastQualifiedAtMs,priceCents:vote.priceCents,gameMinutes:vote.gameMinutes,refreshCount:vote.refreshCount}).catch?.(()=>{});

    // Cross-process formation serialization: every Railway process may observe
    // Gold Saint doctrine independently, but only one process may materialize a
    // three-Saint event for an exact ticker. The lock is deliberately short and
    // is released before createHunter() performs any market/broker work.
    let formationUnlock=null;
    if(typeof this.db?.acquireHunterTickerLock==='function'){
      try{formationUnlock=await this.db.acquireHunterTickerLock(systemName,`athena-exclamation:${vote.ticker}`);}
      catch(error){
        this.counters.formationLockFailures++;this.noteFailure('formation_lock_failed',{ticker:vote.ticker,message:String(error?.message||error)});
        if(this.audit)await this.audit('athena_exclamation_formation_lock_failed',{ticker:vote.ticker,message:String(error?.message||error)}).catch?.(()=>{});
        return {recorded:true,vote,candidate:null,reason:'formation_lock_failed'};
      }
      if(!formationUnlock){this.counters.formationLockBusy++;return {recorded:true,vote,candidate:null,reason:'formation_lock_busy'};}
    }

    try{
      // Refresh exact-ticker durable truth while serialized. This makes Saint
      // votes produced by another process immediately visible and prevents a
      // local cache from becoming an authority boundary.
      if(typeof this.db?.athenaExclamationVotesByTicker==='function'){
        let durableVotes;
        try{durableVotes=await this.db.athenaExclamationVotesByTicker(systemName,vote.ticker,now-windowMs);}
        catch(error){
          this.counters.durableVoteRefreshFailures++;this.noteFailure('durable_vote_refresh_failed',{ticker:vote.ticker,message:String(error?.message||error)});
          if(this.audit)await this.audit('athena_exclamation_vote_refresh_failed',{ticker:vote.ticker,message:String(error?.message||error)}).catch?.(()=>{});
          return {recorded:true,vote,candidate:null,reason:'durable_vote_refresh_failed'};
        }
        for(const [k,v] of [...this.votes])if(String(v.ticker)===vote.ticker)this.votes.delete(k);
        for(const r of durableVotes||[])if(isGoldSaintConcept(r.conceptName))this.votes.set(voteKey(r.ticker,r.conceptName),{...r,snapshot:clone(r.snapshot||{})});
      }

      if(typeof this.db?.activeAthenaExclamationEvent==='function'){
        let durableActive;
        try{durableActive=await this.db.activeAthenaExclamationEvent(systemName,vote.ticker,now);}
        catch(error){
          this.counters.durableEventRefreshFailures++;this.noteFailure('durable_event_refresh_failed',{ticker:vote.ticker,message:String(error?.message||error)});
          if(this.audit)await this.audit('athena_exclamation_event_refresh_failed',{ticker:vote.ticker,message:String(error?.message||error)}).catch?.(()=>{});
          return {recorded:true,vote,candidate:null,reason:'durable_event_refresh_failed'};
        }
        if(durableActive){
          this.events.set(String(durableActive.id),durableActive);
          this.activeEventByTicker.set(vote.ticker,String(durableActive.id));
        }
      }

      const activeId=this.activeEventByTicker.get(vote.ticker);
      if(activeId){
        const active=this.events.get(activeId)||null;
        if(active){
          const currentVote=this.votes.get(key)||vote;
          const already=(active.saints||[]).some(x=>String(x.conceptName||'')===vote.conceptName);
          if(!already){
            const updated={...active,saints:[...(active.saints||[]),clone(currentVote)],saintCount:Number(active.saintCount||0)+1};
            if(typeof this.db?.updateAthenaExclamationEvent==='function'){
              try{await this.db.updateAthenaExclamationEvent(activeId,updated);}
              catch(error){
                this.counters.eventUpdateFailures++;this.noteFailure('event_update_failed',{id:activeId,ticker:vote.ticker,message:String(error?.message||error)});
                if(this.audit)await this.audit('athena_exclamation_event_update_failed',{id:activeId,ticker:vote.ticker,message:String(error?.message||error)}).catch?.(()=>{});
                return {recorded:true,vote:currentVote,candidate:null,event:active,reason:'event_update_failed'};
              }
            }
            this.events.set(activeId,updated);
            if(this.audit)await this.audit('athena_exclamation_additional_saint',{id:activeId,ticker:vote.ticker,conceptName:vote.conceptName,saintCount:updated.saintCount}).catch?.(()=>{});
            return {recorded:true,vote:currentVote,candidate:null,event:updated};
          }
        }
        return {recorded:true,vote:this.votes.get(key)||vote,candidate:null,event:active};
      }

      const votes=this.votesForTicker(vote.ticker,now);
      if(votes.length<ATHENA_EXCLAMATION.minimumSaints)return {recorded:true,vote:this.votes.get(key)||vote,candidate:null};
      const firstThree=votes.slice(0,ATHENA_EXCLAMATION.minimumSaints);
      const liveVoteTimes=firstThree.map(v=>finite(v.lastQualifiedAtMs,finite(v.firstQualifiedAtMs)));
      const firstVoteAtMs=Math.min(...liveVoteTimes),thirdVoteAtMs=Math.max(...liveVoteTimes);
      if(thirdVoteAtMs-firstVoteAtMs>windowMs)return {recorded:true,vote:this.votes.get(key)||vote,candidate:null};
      const id=`AE1:${systemName}:${vote.ticker}:${firstVoteAtMs}`;
      const candidate={
        id,version:ATHENA_EXCLAMATION.version,policyRevision:ATHENA_EXCLAMATION.policyRevision,status:'CANDIDATE',
        systemName,ticker:vote.ticker,eventTicker:vote.eventTicker,createdAtMs:now,firstVoteAtMs,thirdVoteAtMs,
        expiresAtMs:firstVoteAtMs+windowMs,convergenceSpanMs:thirdVoteAtMs-firstVoteAtMs,
        saintCount:votes.length,saints:clone(votes),combination:firstThree.map(v=>v.conceptName),gameMinutes:vote.gameMinutes,
      };
      if(typeof this.db?.insertAthenaExclamationEvent==='function'){
        try{
          const inserted=await this.db.insertAthenaExclamationEvent(candidate);
          if(inserted===false){
            this.counters.formationConflicts++;
            const existing=typeof this.db?.activeAthenaExclamationEvent==='function'?await this.db.activeAthenaExclamationEvent(systemName,vote.ticker,now).catch(()=>null):null;
            if(existing){this.events.set(String(existing.id),existing);this.activeEventByTicker.set(vote.ticker,String(existing.id));}
            return {recorded:true,vote:this.votes.get(key)||vote,candidate:null,event:existing||null,reason:'formation_already_exists'};
          }
        }catch(error){
          this.counters.formationPersistenceFailures++;this.noteFailure('event_persistence_failed',{id,ticker:vote.ticker,message:String(error?.message||error)});
          if(this.audit)await this.audit('athena_exclamation_event_persistence_failed',{id,ticker:vote.ticker,message:String(error?.message||error)}).catch?.(()=>{});
          return {recorded:true,vote:this.votes.get(key)||vote,candidate:null,reason:'event_persistence_failed'};
        }
      }
      this.events.set(id,candidate);this.activeEventByTicker.set(vote.ticker,id);this.counters.formations++;
      if(this.audit)await this.audit('athena_exclamation_formation',{id,ticker:vote.ticker,eventTicker:vote.eventTicker,saintCount:votes.length,combination:candidate.combination,firstVoteAtMs,thirdVoteAtMs,convergenceSpanMs:candidate.convergenceSpanMs}).catch?.(()=>{});
      return {recorded:true,vote:this.votes.get(key)||vote,candidate};
    } finally {
      if(formationUnlock){try{await formationUnlock();}catch(error){if(this.audit)await this.audit('athena_exclamation_formation_unlock_failed',{ticker:vote.ticker,message:String(error?.message||error)}).catch?.(()=>{});}}
    }
  }

  async markDecision(id,{status,review=null,entryId=null,decidedAtMs=Date.now()}={}){
    const e=this.events.get(String(id));if(!e)return null;
    const next={...e,status:String(status||e.status),review:clone(review),entryId:entryId||null,decidedAtMs};
    this.events.set(String(id),next);
    if(next.status==='QUALIFIED')this.counters.qualified++;
    if(next.status==='REJECTED')this.counters.rejected++;
    if(next.status==='EXECUTED')this.counters.executed++;
    let persistenceOk=true;
    if(typeof this.db?.updateAthenaExclamationEvent==='function'){
      try{await this.db.updateAthenaExclamationEvent(String(id),next);}
      catch(error){persistenceOk=false;this.counters.eventUpdateFailures++;this.noteFailure('event_decision_persistence_failed',{id:String(id),ticker:next.ticker,status:next.status,message:String(error?.message||error)});if(this.audit)await this.audit('athena_exclamation_event_decision_persistence_failed',{id:String(id),ticker:next.ticker,status:next.status,message:String(error?.message||error)}).catch?.(()=>{});}
    }
    if(TERMINAL_EVENT_STATUSES.has(next.status)&&this.activeEventByTicker.get(String(next.ticker||''))===String(id))this.activeEventByTicker.delete(String(next.ticker||''));
    return {...next,persistenceOk};
  }
  summary(now=Date.now()){
    this.prune(now);
    const byTicker={};for(const v of this.votes.values()){const k=String(v.ticker);byTicker[k]=(byTicker[k]||0)+1;}
    return {version:ATHENA_EXCLAMATION.version,policyRevision:ATHENA_EXCLAMATION.policyRevision,minimumSaints:ATHENA_EXCLAMATION.minimumSaints,convergenceWindowMinutes:athenaExclamationWindowMs(this.settings())/60000,activeVotes:this.votes.size,activeTickers:Object.keys(byTicker).length,activeFormations:this.activeEventByTicker.size,...this.counters,lastFailure:clone(this.lastFailure),recentEvents:[...this.events.values()].sort((a,b)=>finite(b.createdAtMs)-finite(a.createdAtMs)).slice(0,25)};
  }
}
