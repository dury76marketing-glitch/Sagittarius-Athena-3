import { createHash } from 'node:crypto';

export function canonicalJson(value){
  if(value===null||value===undefined)return JSON.stringify(value??null);
  if(Array.isArray(value))return`[${value.map(canonicalJson).join(',')}]`;
  if(typeof value==='object')return`{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(',')}}`;
  return JSON.stringify(value);
}
export function authorityHash(value){return createHash('sha256').update(canonicalJson(value)).digest('hex');}
export function sealAthenaFireCommand(core={}){const clean=structuredClone(core);delete clean.commandHash;return Object.freeze({...clean,commandHash:authorityHash(clean)});}
export function verifyAthenaFireCommandHash(command={}){if(!command||typeof command!=='object'||!command.commandHash)return false;const clean=structuredClone(command);const provided=String(clean.commandHash);delete clean.commandHash;return authorityHash(clean)===provided;}

// CW2 is an in-place R63 architecture correction. It deliberately lives in an
// existing authored module so the strict 44-file deployment budget is preserved.
// It patches only the already-existing Athena / Strategy / Engine authority
// boundaries at process startup and does not create a parallel broker path.
export const CRYSTAL_WALL_V2 = Object.freeze({
  version:'CRYSTAL-WALL-V2',
  policyRevision:'CW2-R1-GEMINI-ANOTHER-DIMENSION-LOSS-RECOVERY',
  displayName:'Crystal Wall',
  internalConcept:'Recovery Hunter',
  sourceUniverse:'Gemini',
  parentConcept:'Another Dimension',
  parentLossCloseReason:'another_dimension_aurora',
  strategicEntryAuthority:'ATHENA-A3',
  normalProfitAuthority:'INFINITY_BREAK',
  lossAuthority:'AURORA_EXECUTION',
  minimumReboundCents:5,
  maximumActiveWatches:100,
  maximumQuoteAgeMs:10_000,
  commandTtlMs:5_000,
  oneAttackPerParentLoss:true,
  directPegasusDragonPhoenixSource:false,
  justiceArrowDependency:false,
  normalHardExecutionSafetyRequired:true,
});

const cwNum=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const cwFinal=(q)=>Boolean(q?.result)||['determined','finalized','settled','closed'].includes(String(q?.status||'').toLowerCase());
const cwAudit=(target,event,data,level='info')=>{
  try{
    if(typeof target?.audit==='function')return Promise.resolve(target.audit(event,data,level)).catch(()=>{});
    if(typeof target?.db?.audit==='function')return Promise.resolve(target.db.audit(level,event,data)).catch(()=>{});
  }catch{}
  return Promise.resolve();
};

export function crystalWallV2AuthorizationId(parent){
  const id=String(parent?.id||'');
  return id?`CRYSTAL-WALL:${id}:1`:'';
}

export function isCrystalWallV2Source(entry,settings=null){
  if(!entry||typeof entry!=='object')return false;
  if(String(entry.id||'')==='')return false;
  if(String(entry.conceptName||'')!==CRYSTAL_WALL_V2.parentConcept)return false;
  if(String(entry.status||'')!=='closed')return false;
  if(String(entry.closeReason||'')!==CRYSTAL_WALL_V2.parentLossCloseReason)return false;
  if(!(cwNum(entry.pnlCents)<0))return false;
  if(!(cwNum(entry.closedAtMs)>0))return false;
  if(String(entry.ticker||'')==='')return false;
  const universe=String(entry?.entryConfig?.universe?.name||entry?.entryConfig?.shadowAttack?.universe||'');
  const shadowUniverse=String(entry?.entryConfig?.shadowAttack?.universe||universe);
  if(universe!=='Gemini'||shadowUniverse!=='Gemini')return false;
  if(settings&&typeof settings==='object'){
    if(settings.geminiEnabled!==true)return false;
    if(String(settings.systemName||'')&&String(entry.systemName||'')!==String(settings.systemName))return false;
    if(String(settings.ownerId||'')&&String(entry.ownerId||'')!==String(settings.ownerId))return false;
    if(String(settings.mode||'')&&String(entry.mode||'')!==String(settings.mode))return false;
  }
  return true;
}

export function crystalWallV2WatchFromParent(parent,settings={},prior=null,now=Date.now()){
  if(!isCrystalWallV2Source(parent,settings))return null;
  const exit=Math.max(0,cwNum(parent.exitPriceCents));
  const recordedLow=Math.max(0,cwNum(parent.lowestPriceAfterEntryCents));
  // Crystal Wall begins only after Another Dimension has actually lost and
  // closed. A low made while the parent virtual trade was still open is
  // historical audit context, never the post-loss recovery origin.
  const trough=Math.max(0,cwNum(prior?.troughCents,exit));
  return {
    version:CRYSTAL_WALL_V2.version,
    policyRevision:CRYSTAL_WALL_V2.policyRevision,
    authorizationId:crystalWallV2AuthorizationId(parent),
    parentId:String(parent.id),
    ticker:String(parent.ticker),
    eventTicker:String(parent.eventTicker||parent.ticker),
    side:String(parent.side||parent?.entryConfig?.side||'YES').toUpperCase(),
    armedAtMs:prior?.armedAtMs||Math.max(1,cwNum(parent.closedAtMs,now)),
    closedAtMs:Math.max(1,cwNum(parent.closedAtMs,now)),
    parentEntryPriceCents:cwNum(parent.entryPriceCents),
    parentExitPriceCents:exit,
    parentLowestBeforeCloseCents:recordedLow||null,
    parentRealizedPnlCents:cwNum(parent.pnlCents),
    troughCents:trough,
    troughAtMs:prior?.troughAtMs||Math.max(1,cwNum(parent.closedAtMs,now)),
    lastBidCents:prior?.lastBidCents??exit,
    lastAskCents:prior?.lastAskCents??null,
    lastBookMs:prior?.lastBookMs||0,
    observations:cwNum(prior?.observations),
    upwardTicks:cwNum(prior?.upwardTicks),
    lowerLowCount:cwNum(prior?.lowerLowCount),
    lastRecoveryContext:prior?.lastRecoveryContext||null,
    lastDecision:prior?.lastDecision||null,
    entryId:prior?.entryId||null,
    updatedAtMs:Math.max(cwNum(prior?.updatedAtMs),now),
  };
}

function cwWatchTtlMs(settings={}){
  const hours=Math.max(1,Math.min(168,cwNum(settings.recoveryTrackingHours,24)));
  return hours*60*60*1000;
}

function cwEnsureState(engine){
  if(!(engine.crystalWallV2Watches instanceof Map))engine.crystalWallV2Watches=new Map();
  if(!(engine.crystalWallV2InFlight instanceof Set))engine.crystalWallV2InFlight=new Set();
  if(!(engine.crystalWallV2CompletedParents instanceof Set))engine.crystalWallV2CompletedParents=new Set();
  if(!engine.crystalWallV2Stats||typeof engine.crystalWallV2Stats!=='object')engine.crystalWallV2Stats={armed:0,observations:0,qualified:0,athenaReviews:0,fires:0,opened:0,sourceRejected:0,duplicates:0,finalized:0,expired:0,lastEvent:null};
  return engine.crystalWallV2Watches;
}

function cwStat(engine,key,data=null){
  cwEnsureState(engine);
  engine.crystalWallV2Stats[key]=cwNum(engine.crystalWallV2Stats[key])+1;
  engine.crystalWallV2Stats.lastEvent={event:key,atMs:Date.now(),...(data||{})};
}

function cwPrune(engine,now=Date.now()){
  const watches=cwEnsureState(engine),ttl=cwWatchTtlMs(engine.settings||{});
  for(const [id,w] of [...watches]){
    if(w.entryId||now-cwNum(w.closedAtMs)>ttl){watches.delete(id);if(!w.entryId)cwStat(engine,'expired',{parentId:id,ticker:w.ticker});}
  }
  if(watches.size>CRYSTAL_WALL_V2.maximumActiveWatches){
    const ordered=[...watches.entries()].sort((a,b)=>cwNum(a[1].closedAtMs)-cwNum(b[1].closedAtMs));
    while(watches.size>CRYSTAL_WALL_V2.maximumActiveWatches&&ordered.length){const [id]=ordered.shift();watches.delete(id);}
  }
  return watches;
}

export function crystalWallV2Summary(engine,now=Date.now()){
  const watches=cwPrune(engine,now);
  return {
    version:CRYSTAL_WALL_V2.version,
    policyRevision:CRYSTAL_WALL_V2.policyRevision,
    role:'gemini_another_dimension_loss_recovery_attack',
    sourceUniverse:'Gemini',
    parentConcept:'Another Dimension',
    parentLossCloseReason:CRYSTAL_WALL_V2.parentLossCloseReason,
    strategicEntryAuthority:CRYSTAL_WALL_V2.strategicEntryAuthority,
    normalProfitAuthority:CRYSTAL_WALL_V2.normalProfitAuthority,
    lossAuthority:CRYSTAL_WALL_V2.lossAuthority,
    justiceArrowDependency:false,
    directPegasusDragonPhoenixSource:false,
    activeWatches:watches.size,
    completedParents:engine.crystalWallV2CompletedParents?.size||0,
    watchTickers:[...new Set([...watches.values()].map(w=>w.ticker).filter(Boolean))].slice(0,100),
    stats:{...(engine.crystalWallV2Stats||{})},
  };
}

function cwQueueExecution(engine,parent,q,recoveryContext){
  const id=String(parent?.id||'');if(!id)return;
  cwEnsureState(engine);
  if(engine.crystalWallV2InFlight.has(id))return;
  const run=async()=>{
    if(engine.crystalWallV2InFlight.has(id))return;
    engine.crystalWallV2InFlight.add(id);
    try{await engine.executeCrystalWallV2(parent,q,recoveryContext);}
    catch(error){await cwAudit(engine,'crystal_wall_v2_execution_error',{parentId:id,ticker:parent?.ticker||null,message:String(error?.message||error)},'error');}
    finally{engine.crystalWallV2InFlight.delete(id);}
  };
  const queue=engine.entryEvaluationQueue;
  if(queue&&typeof queue.enqueue==='function')queue.enqueue(`crystal-wall:${id}`,run);
  else void Promise.resolve().then(run);
}

function cwObserve(engine,q,recoverySignalState){
  const watches=cwPrune(engine),ticker=String(q?.ticker||'');
  if(!ticker||!watches.size)return;
  const settings=engine.settings||{};
  // Recovery OFF suppresses Athena/FIRE but must not blind the watch. Crystal
  // Wall keeps tracking the Gemini loss trough while disabled so re-enabling
  // cannot manufacture a late origin or miss a still-valid recovery.
  if(settings.geminiEnabled!==true||settings.engineActive===false)return;
  if(!(settings.mode==='SIMULATION'||engine.isLiveReady?.()===true))return;
  const bid=cwNum(q?.yesBid),ask=cwNum(q?.yesAsk),bookMs=cwNum(engine.market?.getBook?.(ticker)?.updatedAtMs),quoteMs=cwNum(q?.quoteAtMs||q?.updatedAtMs);
  const now=Date.now();
  if(cwFinal(q)){
    for(const [id,w] of [...watches])if(w.ticker===ticker){watches.delete(id);cwStat(engine,'finalized',{parentId:id,ticker});}
    return;
  }
  if(!(bid>0)||!(ask>0)||bid>ask||q?.bookInvalid===true)return;
  if(!bookMs||now-bookMs>CRYSTAL_WALL_V2.maximumQuoteAgeMs)return;
  if(quoteMs&&now-quoteMs>CRYSTAL_WALL_V2.maximumQuoteAgeMs)return;
  for(const [id,watch] of [...watches]){
    if(watch.ticker!==ticker||watch.entryId)continue;
    if(bookMs<=cwNum(watch.lastBookMs))continue;
    const parent=engine.anotherDimensionRecent?.get?.(id)||null;
    if(!isCrystalWallV2Source(parent,settings)){watches.delete(id);cwStat(engine,'sourceRejected',{parentId:id,ticker});continue;}
    const priorBid=cwNum(watch.lastBidCents,bid);
    let trough=Math.max(0,cwNum(watch.troughCents));
    if(!trough||bid<trough){trough=bid;watch.troughAtMs=bookMs;watch.lowerLowCount=cwNum(watch.lowerLowCount)+1;watch.upwardTicks=0;}
    else if(bid>priorBid)watch.upwardTicks=cwNum(watch.upwardTicks)+1;
    else if(bid<priorBid)watch.upwardTicks=0;
    watch.lastBidCents=bid;watch.lastAskCents=ask;watch.lastBookMs=bookMs;watch.observations=cwNum(watch.observations)+1;watch.troughCents=trough;watch.updatedAtMs=now;
    const base=recoverySignalState(parent,q,null,settings,trough)||{};
    const recoveryContext={
      eligible:base.qualified===true,
      version:CRYSTAL_WALL_V2.version,
      policyRevision:CRYSTAL_WALL_V2.policyRevision,
      authoritySource:'GEMINI_ANOTHER_DIMENSION_LOSS',
      sourceUniverse:'Gemini',
      sourceTradeId:id,
      sourceConcept:'Another Dimension',
      observationId:`CW2:${id}:${bookMs}`,
      troughCents:cwNum(base.troughCents,trough),
      reboundCents:cwNum(base.reboundCents),
      minReboundCents:cwNum(base.minReboundCents,CRYSTAL_WALL_V2.minimumReboundCents),
      bidCents:bid,askCents:ask,
      upwardTicks:cwNum(watch.upwardTicks),
      lowerLowCount:cwNum(watch.lowerLowCount),
      observations:cwNum(watch.observations),
      bookObservedAtMs:bookMs,
      observedAtMs:now,
      reason:String(base.reason||'unknown'),
      operatorMinEntryCents:cwNum(settings.recoveryMinEntryCents),
      operatorMaxEntryCents:cwNum(settings.recoveryMaxEntryCents),
    };
    watch.lastRecoveryContext=recoveryContext;
    cwStat(engine,'observations',{parentId:id,ticker,reboundCents:recoveryContext.reboundCents});
    if(recoveryContext.eligible){
      cwStat(engine,'qualified',{parentId:id,ticker,reboundCents:recoveryContext.reboundCents});
      if(settings.recoveryHunterEnabled===true)cwQueueExecution(engine,parent,q,recoveryContext);
    }
  }
}

export function installCrystalWallV2({SagittariusEngine,AthenaCommander,StrategyEngine,atomicThunderBoltFeatures,recoverySignalState}={}){
  if(!SagittariusEngine?.prototype||!AthenaCommander?.prototype||!StrategyEngine?.prototype||typeof atomicThunderBoltFeatures!=='function'||typeof recoverySignalState!=='function')throw new Error('crystal_wall_v2_install_dependencies_missing');
  if(SagittariusEngine.prototype.__crystalWallV2Installed===true)return CRYSTAL_WALL_V2;

  const athenaDecide=AthenaCommander.prototype.decide;
  if(typeof athenaDecide!=='function')throw new Error('crystal_wall_v2_athena_decide_missing');
  AthenaCommander.prototype.decide=async function(bolt,context={}){
    const eligible=Array.isArray(bolt?.features?.eligibleAttacks)?bolt.features.eligibleAttacks:[];
    if(!eligible.some(x=>String(x?.concept||'')==='Recovery Hunter'))return athenaDecide.call(this,bolt,context);
    const settings=this.getSettings?.()||{};
    const validSource=isCrystalWallV2Source(context?.recoverySource,settings)&&context?.recoveryContext?.eligible===true;
    if(validSource)return athenaDecide.call(this,bolt,context);
    const filtered=eligible.filter(x=>String(x?.concept||'')!=='Recovery Hunter');
    const nextBolt={...bolt,features:{...(bolt?.features||{}),eligibleAttacks:filtered}};
    return athenaDecide.call(this,nextBolt,{...context,recoverySource:null,recoveryContext:null});
  };

  const strategyExecute=StrategyEngine.prototype.executeAthenaFire;
  if(typeof strategyExecute!=='function')throw new Error('crystal_wall_v2_strategy_execute_missing');
  StrategyEngine.prototype.executeAthenaFire=async function(q,bolt,decision,context={}){
    const concept=String(decision?.fireCommand?.selectedAttack||'');
    if(concept!=='Recovery Hunter')return strategyExecute.call(this,q,bolt,decision,context);
    const settings=this.getSettings?.()||{};
    const parent=context?.recoverySource||null,rc=context?.recoveryContext||decision?.fireCommand?.decisionEvidence?.recoveryContext||null;
    const valid=isCrystalWallV2Source(parent,settings)
      && String(parent.ticker||'')===String(q?.ticker||'')
      && String(parent.eventTicker||parent.ticker||'')===String(q?.eventTicker||q?.ticker||'')
      && rc?.eligible===true
      && String(rc?.sourceTradeId||'')===String(parent.id);
    if(!valid){await cwAudit(this,'crystal_wall_v2_source_rejected',{ticker:q?.ticker||null,parentId:parent?.id||null,parentConcept:parent?.conceptName||null,parentCloseReason:parent?.closeReason||null});return null;}
    const nextContext={...context,cosmos:[parent],recoverySource:parent,recoveryContext:rc,crystalWallV2:true};
    return strategyExecute.call(this,q,bolt,decision,nextContext);
  };

  const remember=SagittariusEngine.prototype.rememberAnotherDimension;
  if(typeof remember!=='function')throw new Error('crystal_wall_v2_remember_another_dimension_missing');
  SagittariusEngine.prototype.rememberAnotherDimension=function(entry){
    const out=remember.call(this,entry);cwEnsureState(this);cwPrune(this);
    if(isCrystalWallV2Source(entry,this.settings||{})){
      const id=String(entry.id);
      // Once this exact AD loss has produced a durable Crystal Wall entry, a
      // later cache refresh or duplicate close receipt may never re-arm it.
      if(this.crystalWallV2CompletedParents.has(id)){cwStat(this,'duplicates',{parentId:id,ticker:String(entry.ticker||''),scope:'completed_parent'});return out;}
      const prior=this.crystalWallV2Watches.get(id)||null,watch=crystalWallV2WatchFromParent(entry,this.settings||{},prior);
      if(watch){
        const wasNew=!prior;this.crystalWallV2Watches.set(id,watch);cwPrune(this);
        if(wasNew){cwStat(this,'armed',{parentId:id,ticker:watch.ticker});void cwAudit(this,'crystal_wall_v2_armed',{parentId:id,ticker:watch.ticker,eventTicker:watch.eventTicker,parentExitPriceCents:watch.parentExitPriceCents,parentRealizedPnlCents:watch.parentRealizedPnlCents});}
        try{const wanted=new Set(this.market?.wanted||[]);wanted.add(watch.ticker);this.market?.setWanted?.([...wanted]);}catch{}
      }
    }
    return out;
  };

  const hydrateAnother=SagittariusEngine.prototype.hydrateAnotherDimension;
  if(typeof hydrateAnother==='function')SagittariusEngine.prototype.hydrateAnotherDimension=async function(...args){
    const out=await hydrateAnother.apply(this,args);cwEnsureState(this);cwPrune(this);
    // Restart de-duplication is reconstructed from durable Recovery lineage.
    // No extra table is required: sourceTradeId is the exact AD parent ID.
    if(typeof this.db?.entryByConceptSourceTradeId==='function'){
      for(const [parentId] of [...this.crystalWallV2Watches]){
        const existing=await this.db.entryByConceptSourceTradeId(this.settings?.systemName,'Recovery Hunter',parentId).catch(()=>null);
        if(existing){this.crystalWallV2CompletedParents.add(parentId);this.crystalWallV2Watches.delete(parentId);}
      }
    }
    return out;
  };

  const refreshRecovery=SagittariusEngine.prototype.refreshRecoveryPriorityTickers;
  if(typeof refreshRecovery==='function')SagittariusEngine.prototype.refreshRecoveryPriorityTickers=async function(...args){
    const out=await refreshRecovery.apply(this,args);cwPrune(this);
    if(this.settings?.geminiEnabled===true&&this.settings?.engineActive!==false){
      const merged=new Set(this.recoveryPriorityTickers||out||[]);for(const w of this.crystalWallV2Watches.values())if(!w.entryId)merged.add(w.ticker);this.recoveryPriorityTickers=merged;
    }
    return this.recoveryPriorityTickers;
  };

  const observeAnother=SagittariusEngine.prototype.observeAnotherDimensionQuote;
  if(typeof observeAnother!=='function')throw new Error('crystal_wall_v2_observe_another_dimension_missing');
  SagittariusEngine.prototype.observeAnotherDimensionQuote=function(q,...args){
    // Preserve the R63 synchronous quote-hot-path contract. The original
    // observer schedules durable AD work itself; CW2 adds only synchronous
    // in-memory observation and bounded entry-queue scheduling.
    const out=observeAnother.call(this,q,...args);
    try{cwObserve(this,q,recoverySignalState);}catch(error){void cwAudit(this,'crystal_wall_v2_quote_observer',{ticker:q?.ticker||null,message:String(error?.message||error)},'error');}
    return out;
  };

  SagittariusEngine.prototype.executeCrystalWallV2=async function(parent,q,recoveryContext){
    cwEnsureState(this);const settings=this.settings||{},parentId=String(parent?.id||''),ticker=String(parent?.ticker||''),authorizationId=crystalWallV2AuthorizationId(parent);
    if(!isCrystalWallV2Source(parent,settings)||!parentId||!ticker){cwStat(this,'sourceRejected',{parentId,ticker});return null;}
    if(settings.recoveryHunterEnabled===false||settings.geminiEnabled!==true||settings.engineActive===false)return null;
    if(!(settings.mode==='SIMULATION'||this.isLiveReady?.()===true))return null;
    const duplicate=typeof this.db?.entryByConceptSourceTradeId==='function'?await this.db.entryByConceptSourceTradeId(settings.systemName,'Recovery Hunter',parentId).catch(()=>null):null;
    if(duplicate){this.crystalWallV2CompletedParents.add(parentId);this.crystalWallV2Watches.delete(parentId);cwStat(this,'duplicates',{parentId,ticker,entryId:duplicate.id});return duplicate;}
    const priorEpisode=typeof this.db?.opportunityEpisode==='function'?await this.db.opportunityEpisode(authorizationId).catch(()=>null):null;
    if(priorEpisode?.entryId){this.crystalWallV2CompletedParents.add(parentId);this.crystalWallV2Watches.delete(parentId);cwStat(this,'duplicates',{parentId,ticker,entryId:priorEpisode.entryId});return null;}

    const verified=typeof this.market?.refreshTickerVerified==='function'?await this.market.refreshTickerVerified(ticker).catch(()=>null):null;
    const freshQ=verified?.quote||this.market?.getQuote?.(ticker)||q;
    if(!freshQ||verified?.marketFresh===false||verified?.bookFresh===false||freshQ.bookInvalid===true||cwFinal(freshQ))return null;
    const book=this.market?.getBook?.(ticker),bookMs=cwNum(book?.updatedAtMs);
    if(!bookMs||Date.now()-bookMs>CRYSTAL_WALL_V2.maximumQuoteAgeMs)return null;
    const watch=this.crystalWallV2Watches.get(parentId)||crystalWallV2WatchFromParent(parent,settings,null);
    if(!watch)return null;
    const recheck=recoverySignalState(parent,freshQ,null,settings,watch.troughCents)||{};
    const freshContext={...recoveryContext,eligible:recheck.qualified===true,reason:recheck.reason,sourceTradeId:parentId,sourceConcept:'Another Dimension',sourceUniverse:'Gemini',troughCents:cwNum(recheck.troughCents,watch.troughCents),reboundCents:cwNum(recheck.reboundCents),minReboundCents:cwNum(recheck.minReboundCents,CRYSTAL_WALL_V2.minimumReboundCents),bidCents:cwNum(freshQ.yesBid),askCents:cwNum(freshQ.yesAsk),bookObservedAtMs:bookMs,observedAtMs:Date.now()};
    if(!freshContext.eligible)return null;

    const history=this.market?.getHistory?.(ticker)||[];
    const features=atomicThunderBoltFeatures({q:freshQ,history,settings,cosmos:[],recoveryContext:freshContext,now:Date.now()});
    const recoveryBand=(features?.eligibleAttacks||[]).filter(x=>String(x?.concept||'')==='Recovery Hunter');
    if(!recoveryBand.length)return null;
    const at=Date.now();
    const candidate={
      version:CRYSTAL_WALL_V2.version,policyRevision:CRYSTAL_WALL_V2.policyRevision,id:authorizationId,
      fingerprint:`CW2-${authorityHash({parentId,ticker,bookMs,trough:freshContext.troughCents,rebound:freshContext.reboundCents,ask:freshQ.yesAsk}).slice(0,24)}`,
      systemName:String(settings.systemName||''),sourceRelease:'SAGITTARIUS-R63-CW2',ticker,eventTicker:String(parent.eventTicker||ticker),side:'YES',sport:String(freshQ.sport||parent.sport||'Unknown'),detectedAtMs:at,expiresAtMs:at+CRYSTAL_WALL_V2.commandTtlMs,score:Math.max(50,Math.min(100,50+freshContext.reboundCents*4)),
      greenTrigger:null,preBoltClearance:{version:CRYSTAL_WALL_V2.version,policyRevision:CRYSTAL_WALL_V2.policyRevision,status:'GEMINI_LOSS_RECOVERY',parentShadowTradeId:parentId,sourceUniverse:'Gemini',normalStrategicDiscoveryBypassed:true,hardExecutionSafetyStillRequired:true},
      features:{
        ...features,
        eligibleAttacks:recoveryBand,
        recoveryContext:freshContext,
        // Crystal Wall is judged by its own post-Another-Dimension recovery
        // structure. Feed Athena the exact current rebound structure rather
        // than any unrelated historical/ordinary-Cosmo feature geometry.
        reboundCents:freshContext.reboundCents,
        upwardTicks:freshContext.upwardTicks,
        currentUpwardTicks:freshContext.upwardTicks,
        lowerLowCount:freshContext.lowerLowCount,
        currentLowerLowCount:freshContext.lowerLowCount,
        cosmoSources:[],
        cosmoCount:0,
      },
    };
    cwStat(this,'athenaReviews',{parentId,ticker,reboundCents:freshContext.reboundCents});
    const decision=await this.athenaCommander?.decide?.(candidate,{recoverySource:parent,recoveryContext:freshContext,cosmos:[],crashState:this.learning?.crashState?.(ticker)||null,crystalWallV2:true});
    watch.lastDecision=decision?{decision:decision.decision,reason:decision.reason,selectedAttack:decision.selectedAttack||null,decidedAtMs:decision.decidedAtMs||Date.now()}:null;
    if(decision?.decision!=='FIRE'||String(decision?.selectedAttack||decision?.fireCommand?.selectedAttack||'')!=='Recovery Hunter'||!decision?.fireCommand)return null;
    cwStat(this,'fires',{parentId,ticker,commandHash:decision.fireCommand.commandHash||null});
    const opened=await this.strategy?.executeAthenaFire?.(freshQ,candidate,decision,{cosmos:[parent],recoverySource:parent,recoveryContext:freshContext,crystalWallV2:true});
    if(opened){watch.entryId=opened.id;this.crystalWallV2CompletedParents.add(parentId);this.crystalWallV2Watches.delete(parentId);cwStat(this,'opened',{parentId,ticker,entryId:opened.id});await cwAudit(this,'crystal_wall_v2_opened',{authorizationId,parentId,ticker,entryId:opened.id,entryPriceCents:cwNum(opened.entryPriceCents),stakeCents:cwNum(settings.recoveryStakeCents),operatorMinEntryCents:cwNum(settings.recoveryMinEntryCents),operatorMaxEntryCents:cwNum(settings.recoveryMaxEntryCents),athenaCommandHash:decision.fireCommand.commandHash||null});}
    return opened||null;
  };

  const diagnostics=SagittariusEngine.prototype.diagnostics;
  if(typeof diagnostics==='function')SagittariusEngine.prototype.diagnostics=async function(...args){const data=await diagnostics.apply(this,args);return{...data,crystalWallV2:crystalWallV2Summary(this)};};

  Object.defineProperty(SagittariusEngine.prototype,'__crystalWallV2Installed',{value:true,writable:false,enumerable:false,configurable:false});
  return CRYSTAL_WALL_V2;
}
