import { PHOENIX_COSMO } from './doctrine.mjs';

const finite=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const finalStatus=(q)=>['determined','finalized','settled'].includes(String(q?.status||'').toLowerCase())||Boolean(q?.result);

export function phoenixSettings(settings={}){
  return {
    enabled:settings.phoenixEnabled===true,
    minPriceCents:finite(settings.phoenixMinPriceCents,PHOENIX_COSMO.defaultMinPriceCents),
    maxPriceCents:finite(settings.phoenixMaxPriceCents,PHOENIX_COSMO.defaultMaxPriceCents),
    maxSpreadCents:finite(settings.maxSpreadCents,3),
  };
}

export function phoenixSignalActive(entry,settings={},now=Date.now()){
  if(!entry||String(entry.conceptName||'')!=='Phoenix'||String(entry.status||'')!=='open'||settings.phoenixEnabled!==true)return false;
  const expires=finite(entry.entryConfig?.phoenixSource?.expiresAtMs,0);
  return expires>Number(now);
}

export function revalidatePhoenixQualification(qualification,q,settings={},now=Date.now()){
  const p=phoenixSettings(settings),bid=finite(q?.yesBid,0),ask=finite(q?.yesAsk,0),spread=ask-bid;
  const base={ok:false,bidCents:bid,askCents:ask,spreadCents:spread};
  if(!p.enabled)return{...base,reason:'phoenix_disabled'};
  if(!qualification?.qualified)return{...base,reason:'qualification_missing'};
  if(Number(now)-finite(qualification.signalAtMs,0)>PHOENIX_COSMO.maximumMaterializationDelayMs)return{...base,reason:'qualification_stale'};
  if(finalStatus(q))return{...base,reason:'market_final'};
  if(!(bid>0)||!(ask>0)||bid>ask)return{...base,reason:'invalid_quote'};
  if(spread>p.maxSpreadCents)return{...base,reason:'spread'};
  if(bid+1e-9<finite(qualification.triggerBidCents,0))return{...base,reason:'ignition_reversed'};
  // Qualification must occur inside the Phoenix universe. A market may cross
  // above the upper bound immediately after ignition without invalidating the
  // already-observed signal, but it may not gap below the configured floor.
  if(ask<p.minPriceCents)return{...base,reason:'below_phoenix_band'};
  return{...base,ok:true,reason:'qualified'};
}

export class PhoenixCosmoEngine {
  constructor({getSettings=()=>({})}={}){
    this.getSettings=getSettings;
    this.states=new Map();
    this.stats={observed:0,watch:0,ignitions:0,qualified:0,resets:0,spikesRejected:0,lastQualifiedAtMs:0,lastQualifiedTicker:null};
  }
  clear(ticker){if(ticker)this.states.delete(String(ticker));else this.states.clear();}
  prune(now=Date.now(),maximumStates=PHOENIX_COSMO.maximumRuntimeStates){
    for(const [ticker,state] of [...this.states]){
      const age=Number(now)-finite(state.lastAtMs,0);
      if(age>PHOENIX_COSMO.runtimeStateTtlMs)this.states.delete(ticker);
    }
    if(this.states.size<=maximumStates)return;
    const ordered=[...this.states.entries()].sort((a,b)=>finite(a[1]?.lastAtMs,0)-finite(b[1]?.lastAtMs,0));
    while(this.states.size>maximumStates&&ordered.length){const [ticker]=ordered.shift();this.states.delete(ticker);}
  }
  observe(q,now=Date.now()){
    const settings=this.getSettings()||{},p=phoenixSettings(settings),ticker=String(q?.ticker||'');
    if(!ticker)return null;
    this.stats.observed+=1;
    if(!p.enabled){this.states.delete(ticker);return null;}
    const bid=finite(q?.yesBid,0),ask=finite(q?.yesAsk,0),spread=ask-bid,recentTrades=Math.max(0,finite(q?.recentTrades,0));
    const eligible=!finalStatus(q)&&bid>0&&ask>0&&bid<=ask&&ask>=p.minPriceCents&&ask<=p.maxPriceCents&&spread<=p.maxSpreadCents&&recentTrades>=PHOENIX_COSMO.minimumRecentTrades;
    if(!eligible){
      // A pre-signal watch is invalidated by leaving the Phoenix universe,
      // stale activity, or an untradeably wide quote. Qualified evidence lives
      // durably in sag_entries and is not represented by this transient watch.
      this.states.delete(ticker);
      return null;
    }
    const observedAtMs=Math.max(Number(now),finite(q?.updatedAtMs,0));
    let state=this.states.get(ticker);
    if(!state||observedAtMs-finite(state.lastAtMs,0)>PHOENIX_COSMO.observationWindowMs){
      state={ticker,eventTicker:String(q?.eventTicker||ticker),originBidCents:bid,originAskCents:ask,originAtMs:observedAtMs,lastBidCents:bid,lastAskCents:ask,lastAtMs:observedAtMs,peakBidCents:bid,upTicks:0,confirmations:0,lastConfirmationAtMs:0,phase:'WATCH',episodeSequence:(finite(state?.episodeSequence,0)+1)};
      this.states.set(ticker,state);this.stats.watch+=1;this.prune(observedAtMs);return{qualified:false,phase:'WATCH',ticker};
    }
    // A true lower low restarts the causal origin. This is the core protection
    // against a small bounce inside a continuing collapse being called Phoenix.
    if(bid<finite(state.originBidCents,bid)){
      state={...state,originBidCents:bid,originAskCents:ask,originAtMs:observedAtMs,lastBidCents:bid,lastAskCents:ask,lastAtMs:observedAtMs,peakBidCents:bid,upTicks:0,confirmations:0,lastConfirmationAtMs:0,phase:'WATCH',episodeSequence:finite(state.episodeSequence,0)+1};
      this.states.set(ticker,state);this.stats.resets+=1;return{qualified:false,phase:'WATCH',ticker,reason:'new_local_low'};
    }
    if(bid>finite(state.lastBidCents,bid))state.upTicks=finite(state.upTicks,0)+1;
    state.peakBidCents=Math.max(finite(state.peakBidCents,bid),bid);
    state.lastBidCents=bid;state.lastAskCents=ask;state.lastAtMs=observedAtMs;
    const riseBidCents=bid-finite(state.originBidCents,bid);
    const riseAskCents=ask-finite(state.originAskCents,ask);
    const durationMs=observedAtMs-finite(state.originAtMs,observedAtMs);
    const ignition=riseBidCents>=PHOENIX_COSMO.minimumRiseCents&&riseAskCents>=PHOENIX_COSMO.minimumAskRiseCents&&finite(state.upTicks,0)>=PHOENIX_COSMO.minimumUpTicks&&durationMs>=PHOENIX_COSMO.minimumConfirmationDurationMs;
    if(!ignition){
      state.phase=riseBidCents>0?'IGNITION':'WATCH';state.confirmations=0;state.lastConfirmationAtMs=0;
      if(state.phase==='IGNITION')this.stats.ignitions+=1;
      this.states.set(ticker,state);return{qualified:false,phase:state.phase,ticker,riseBidCents,riseAskCents,upTicks:state.upTicks,durationMs};
    }
    if(observedAtMs-finite(state.lastConfirmationAtMs,0)>=PHOENIX_COSMO.minimumFreshConfirmationGapMs){
      state.confirmations=finite(state.confirmations,0)+1;state.lastConfirmationAtMs=observedAtMs;
    }
    state.phase='IGNITION';
    this.states.set(ticker,state);
    if(state.confirmations<PHOENIX_COSMO.requiredFreshConfirmations)return{qualified:false,phase:'IGNITION',ticker,riseBidCents,riseAskCents,upTicks:state.upTicks,durationMs,confirmations:state.confirmations};
    const signalAtMs=observedAtMs;
    const qualification={
      qualified:true,version:PHOENIX_COSMO.version,policyRevision:PHOENIX_COSMO.policyRevision,role:PHOENIX_COSMO.role,
      signalId:`PHOENIX:${ticker}:${Math.floor(finite(state.originAtMs,signalAtMs))}:${finite(state.episodeSequence,1)}`,
      ticker,eventTicker:String(q?.eventTicker||state.eventTicker||ticker),originBidCents:finite(state.originBidCents,bid),originAskCents:finite(state.originAskCents,ask),originAtMs:finite(state.originAtMs,signalAtMs),
      signalBidCents:bid,signalAskCents:ask,signalAtMs,triggerBidCents:bid,riseBidCents,riseAskCents,upTicks:finite(state.upTicks,0),confirmationCount:finite(state.confirmations,0),observationDurationMs:durationMs,recentTrades,spreadCents:spread,
      expiresAtMs:signalAtMs+PHOENIX_COSMO.signalTtlMs,minPriceCents:p.minPriceCents,maxPriceCents:p.maxPriceCents,minimumRiseCents:PHOENIX_COSMO.minimumRiseCents,minimumUpTicks:PHOENIX_COSMO.minimumUpTicks,requiredFreshConfirmations:PHOENIX_COSMO.requiredFreshConfirmations,
      sourceDoesNotAuthorizeEntry:true,strategicEntryAuthority:'ATHENA',entryAuthority:false,orderAuthority:false,
    };
    // Remove the transient watch immediately. A subsequent Phoenix episode on
    // the same ticker must establish a new local origin and full confirmation.
    this.states.delete(ticker);this.stats.qualified+=1;this.stats.lastQualifiedAtMs=signalAtMs;this.stats.lastQualifiedTicker=ticker;
    return qualification;
  }
  compact({maximumStates=256,now=Date.now()}={}){const before=this.states.size;this.prune(now,Math.max(1,Number(maximumStates)||256));return{before,after:this.states.size,removed:Math.max(0,before-this.states.size)};}
  summary(){
    const phases={WATCH:0,IGNITION:0};for(const s of this.states.values())phases[s.phase]=(phases[s.phase]||0)+1;
    return{version:PHOENIX_COSMO.version,policyRevision:PHOENIX_COSMO.policyRevision,role:PHOENIX_COSMO.role,runtimeStates:this.states.size,phases,...this.stats};
  }
}
