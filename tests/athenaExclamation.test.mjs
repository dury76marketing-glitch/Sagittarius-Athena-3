import test from 'node:test';
import assert from 'node:assert/strict';
import {AthenaExclamationEngine,ATHENA_EXCLAMATION,isGoldSaintConcept,athenaExclamationPrimeReview} from '../src/athenaExclamation.mjs';

const settings=(over={})=>({systemName:'SAGITTARIUS',athenaExclamationConvergenceWindowMinutes:70,athenaExclamationMinEntryCents:10,athenaExclamationMaxEntryCents:55,athenaExclamationMaxSpreadCents:3,athenaExclamationMinGameMinutes:20,athenaExclamationMaxGameMinutes:0,athenaExclamationMinRemainingUpsideCents:40,...over});
const vote=(concept,t,price=30)=>({conceptName:concept,ticker:'T',eventTicker:'E',qualifiedAtMs:t,priceCents:price,bidCents:price-1,gameMinutes:30,qualificationSnapshot:{version:'Q'}});

test('AE1 recognizes only the five real Gold Saint doctrines',()=>{
  for(const c of ['Wave Surfer','Crash Recovery Hunter','Recovery Hunter','Momentum Hunter','Lightning Plasma'])assert.equal(isGoldSaintConcept(c),true);
  for(const c of ['Pegasus','Dragon','Athena Exclamation','Golden Dragon Hunter'])assert.equal(isGoldSaintConcept(c),false);
});

test('AE1 flexible 3-of-N convergence triggers at exactly the 70-minute boundary',async()=>{
  let now=1_000_000;const e=new AthenaExclamationEngine({getSettings:()=>settings()});
  assert.equal((await e.recordQualification(vote('Momentum Hunter',now))).candidate,null);
  assert.equal((await e.recordQualification(vote('Lightning Plasma',now+20*60_000))).candidate,null);
  const r=await e.recordQualification(vote('Wave Surfer',now+70*60_000));
  assert.ok(r.candidate);assert.deepEqual(r.candidate.combination,['Momentum Hunter','Lightning Plasma','Wave Surfer']);
  assert.equal(r.candidate.convergenceSpanMs,70*60_000);assert.equal(r.candidate.saintCount,3);
});

test('AE1 does not form when the third distinct Saint arrives beyond 70 minutes',async()=>{
  const base=2_000_000;const e=new AthenaExclamationEngine({getSettings:()=>settings()});
  await e.recordQualification(vote('Momentum Hunter',base));
  await e.recordQualification(vote('Wave Surfer',base+30*60_000));
  const r=await e.recordQualification(vote('Recovery Hunter',base+70*60_000+1));
  assert.equal(r.candidate,null);assert.equal(e.summary(base+70*60_000+1).formations,0);
});

test('AE1 repeated qualifications from one Saint never count as multiple Saints',async()=>{
  const base=3_000_000;const e=new AthenaExclamationEngine({getSettings:()=>settings()});
  for(let i=0;i<20;i++)await e.recordQualification(vote('Momentum Hunter',base+i*1000));
  assert.equal(e.votesForTicker('T',base+20_000).length,1);
  assert.equal(e.summary(base+20_000).formations,0);
});

test('AE1 same-Saint requalification refreshes one rolling vote without creating a second Saint',async()=>{
  const base=3_500_000;const e=new AthenaExclamationEngine({getSettings:()=>settings()});
  await e.recordQualification(vote('Momentum Hunter',base));
  await e.recordQualification(vote('Momentum Hunter',base+60*60_000));
  await e.recordQualification(vote('Wave Surfer',base+65*60_000));
  const r=await e.recordQualification(vote('Recovery Hunter',base+100*60_000));
  assert.ok(r.candidate);
  assert.equal(r.candidate.saintCount,3);
  assert.equal(r.candidate.firstVoteAtMs,base+60*60_000);
  assert.equal(r.candidate.thirdVoteAtMs,base+100*60_000);
  assert.equal(r.candidate.convergenceSpanMs,40*60_000);
});

test('AE1 accepts a different trio and permits a fourth Saint without creating a second formation',async()=>{
  const base=4_000_000;const e=new AthenaExclamationEngine({getSettings:()=>settings()});
  await e.recordQualification(vote('Crash Recovery Hunter',base));
  await e.recordQualification(vote('Recovery Hunter',base+5*60_000));
  const third=await e.recordQualification(vote('Lightning Plasma',base+10*60_000));
  assert.ok(third.candidate);assert.deepEqual(third.candidate.combination,['Crash Recovery Hunter','Recovery Hunter','Lightning Plasma']);
  const fourth=await e.recordQualification(vote('Wave Surfer',base+12*60_000));
  assert.equal(fourth.candidate,null);assert.equal(fourth.event.saintCount,4);assert.equal(e.summary(base+12*60_000).formations,1);
});

test('AE1 hydrates durable recent votes and events after restart',async()=>{
  const base=5_000_000;
  const db={
    async recentAthenaExclamationVotes(){return [
      {systemName:'SAGITTARIUS',ticker:'T',eventTicker:'E',conceptName:'Momentum Hunter',firstQualifiedAtMs:base,lastQualifiedAtMs:base,refreshCount:0,priceCents:30,bidCents:29,snapshot:{}},
      {systemName:'SAGITTARIUS',ticker:'T',eventTicker:'E',conceptName:'Wave Surfer',firstQualifiedAtMs:base+1000,lastQualifiedAtMs:base+1000,refreshCount:0,priceCents:31,bidCents:30,snapshot:{}},
    ];},
    async recentAthenaExclamationEvents(){return [];},
    async upsertAthenaExclamationVote(){},async insertAthenaExclamationEvent(){},
  };
  const e=new AthenaExclamationEngine({db,getSettings:()=>settings()});await e.init(base+2000);
  const r=await e.recordQualification(vote('Recovery Hunter',base+3000));assert.ok(r.candidate);assert.equal(r.candidate.saintCount,3);
});

test('AE1 Prime Review rejects falling knives and accepts fresh low-band continuation',()=>{
  const candidate={ticker:'T',firstVoteAtMs:10_000,thirdVoteAtMs:20_000,gameMinutes:30,saints:[1,2,3]};
  const quote={ticker:'T',yesBid:29,yesAsk:30,gameMinutes:30};const plan={bestAskCents:30,averagePriceCents:30};
  const good=athenaExclamationPrimeReview({candidate,quote,executionPlan:plan,settings:settings(),now:21_000,athenaAssessment:{fallingKnife:{classification:'CONTINUATION',recommendedAction:'ALLOW',liveStructure:{classification:'CONTINUATION'}}}});
  assert.equal(good.ok,true);assert.equal(good.remainingUpsideCents,70);
  const knife=athenaExclamationPrimeReview({candidate,quote,executionPlan:plan,settings:settings(),now:21_000,athenaAssessment:{fallingKnife:{classification:'CONTINUATION',recommendedAction:'ALLOW',liveStructure:{classification:'FALLING_KNIFE'}}}});
  assert.equal(knife.ok,false);assert.ok(knife.reasons.includes('athena_falling_knife'));
});

test('AE1 Prime Review enforces its own price, spread, game-time and upside controls',()=>{
  const candidate={ticker:'T',firstVoteAtMs:10_000,thirdVoteAtMs:20_000,gameMinutes:10,saints:[1,2,3]};
  const out=athenaExclamationPrimeReview({candidate,quote:{ticker:'T',yesBid:57,yesAsk:60,gameMinutes:10},executionPlan:{bestAskCents:60,averagePriceCents:60},settings:settings({athenaExclamationMaxEntryCents:55,athenaExclamationMinGameMinutes:20,athenaExclamationMinRemainingUpsideCents:50}),now:21_000,athenaAssessment:{fallingKnife:{classification:'CONTINUATION',recommendedAction:'ALLOW',liveStructure:{classification:'CONTINUATION'}}}});
  assert.equal(out.ok,false);assert.ok(out.reasons.includes('entry_band'));assert.ok(out.reasons.includes('insufficient_remaining_upside'));assert.ok(out.reasons.includes('exclamation_min_game_time'));
});

test('AE1 cross-process durable convergence serializes one exact-ticker Big Bang formation',async()=>{
  const base=Date.now();
  const durableVotes=new Map(),durableEvents=new Map(),locks=new Set();
  const k=(v)=>`${v.systemName}|${v.ticker}|${v.conceptName}`;
  const sharedDb={
    async upsertAthenaExclamationVote(v){
      const key=k(v),old=durableVotes.get(key);
      if(!old){durableVotes.set(key,structuredClone(v));return;}
      const newer=Number(v.lastQualifiedAtMs)>=Number(old.lastQualifiedAtMs);
      durableVotes.set(key,{...old,...(newer?structuredClone(v):{}),firstQualifiedAtMs:Math.min(Number(old.firstQualifiedAtMs),Number(v.firstQualifiedAtMs)),lastQualifiedAtMs:Math.max(Number(old.lastQualifiedAtMs),Number(v.lastQualifiedAtMs)),refreshCount:Number(old.refreshCount||0)+1});
    },
    async athenaExclamationVotesByTicker(systemName,ticker,sinceMs){return [...durableVotes.values()].filter(v=>v.systemName===systemName&&v.ticker===ticker&&v.lastQualifiedAtMs>=sinceMs).map(v=>structuredClone(v));},
    async activeAthenaExclamationEvent(systemName,ticker,now){return [...durableEvents.values()].filter(e=>e.systemName===systemName&&e.ticker===ticker&&e.expiresAtMs>now).sort((a,b)=>b.createdAtMs-a.createdAtMs).map(v=>structuredClone(v))[0]||null;},
    async insertAthenaExclamationEvent(e){if(durableEvents.has(e.id))return false;durableEvents.set(e.id,structuredClone(e));return true;},
    async updateAthenaExclamationEvent(id,e){if(durableEvents.has(id))durableEvents.set(id,structuredClone(e));},
    async acquireHunterTickerLock(systemName,key){const lk=`${systemName}|${key}`;if(locks.has(lk))return null;locks.add(lk);return async()=>{locks.delete(lk);};},
  };
  const a=new AthenaExclamationEngine({db:sharedDb,getSettings:()=>settings()});
  const b=new AthenaExclamationEngine({db:sharedDb,getSettings:()=>settings()});
  assert.equal((await a.recordQualification(vote('Momentum Hunter',base))).candidate,null);
  assert.equal((await b.recordQualification(vote('Wave Surfer',base+10*60_000))).candidate,null);
  const formed=await a.recordQualification(vote('Lightning Plasma',base+20*60_000));
  assert.ok(formed.candidate);assert.equal(durableEvents.size,1);
  const fourth=await b.recordQualification(vote('Recovery Hunter',base+25*60_000));
  assert.equal(fourth.candidate,null);assert.equal(fourth.event.saintCount,4);assert.equal(durableEvents.size,1);
  assert.equal(a.summary(base+25*60_000).formations,1);
  assert.equal(b.summary(base+25*60_000).formations,0,'second process must not materialize a duplicate formation');
});

test('AE1 fails closed when a production-style durable Saint vote cannot be persisted',async()=>{
  const e=new AthenaExclamationEngine({db:{async upsertAthenaExclamationVote(){throw new Error('db down');}},getSettings:()=>settings()});
  const r=await e.recordQualification(vote('Momentum Hunter',Date.now()));
  assert.equal(r.recorded,false);assert.equal(r.candidate,null);assert.equal(r.reason,'vote_persistence_failed');assert.equal(e.votes.size,0);
});

test('AE1 simultaneous cross-process third/fourth Saint race can materialize only one durable Big Bang',async()=>{
  const base=Date.now();
  const durableVotes=new Map(),durableEvents=new Map(),locks=new Set();
  const keyOf=(v)=>`${v.systemName}|${v.ticker}|${v.conceptName}`;
  const sharedDb={
    async upsertAthenaExclamationVote(v){
      const key=keyOf(v),old=durableVotes.get(key);
      if(!old){durableVotes.set(key,structuredClone(v));return;}
      const newer=Number(v.lastQualifiedAtMs)>=Number(old.lastQualifiedAtMs);
      durableVotes.set(key,{...old,...(newer?structuredClone(v):{}),firstQualifiedAtMs:Math.min(Number(old.firstQualifiedAtMs),Number(v.firstQualifiedAtMs)),lastQualifiedAtMs:Math.max(Number(old.lastQualifiedAtMs),Number(v.lastQualifiedAtMs)),refreshCount:Number(old.refreshCount||0)+1});
    },
    async athenaExclamationVotesByTicker(systemName,ticker,sinceMs){return [...durableVotes.values()].filter(v=>v.systemName===systemName&&v.ticker===ticker&&v.lastQualifiedAtMs>=sinceMs).map(v=>structuredClone(v));},
    async activeAthenaExclamationEvent(systemName,ticker,now){return [...durableEvents.values()].filter(e=>e.systemName===systemName&&e.ticker===ticker&&e.expiresAtMs>now).sort((a,b)=>b.createdAtMs-a.createdAtMs).map(v=>structuredClone(v))[0]||null;},
    async insertAthenaExclamationEvent(e){if(durableEvents.has(e.id))return false;durableEvents.set(e.id,structuredClone(e));return true;},
    async updateAthenaExclamationEvent(id,e){if(durableEvents.has(id))durableEvents.set(id,structuredClone(e));},
    async acquireHunterTickerLock(systemName,key){const lk=`${systemName}|${key}`;if(locks.has(lk))return null;locks.add(lk);return async()=>{locks.delete(lk);};},
  };
  const a=new AthenaExclamationEngine({db:sharedDb,getSettings:()=>settings()});
  const b=new AthenaExclamationEngine({db:sharedDb,getSettings:()=>settings()});
  await a.recordQualification(vote('Momentum Hunter',base));
  await b.recordQualification(vote('Wave Surfer',base+10*60_000));
  const [r1,r2]=await Promise.all([
    a.recordQualification(vote('Lightning Plasma',base+20*60_000)),
    b.recordQualification(vote('Recovery Hunter',base+20*60_000)),
  ]);
  assert.equal(durableEvents.size,1);
  assert.equal([r1,r2].filter(r=>r.candidate).length,1);
  assert.equal([r1,r2].filter(r=>r.reason==='formation_lock_busy'||r.reason==='formation_already_exists').length,1);
  const event=[...durableEvents.values()][0];
  assert.ok(event.saintCount>=3);
  assert.equal(new Set(event.saints.map(s=>s.conceptName)).size,event.saintCount);
});

test('AE1 durable event identity is system-scoped for owner isolation on shared databases',async()=>{
  const base=Date.now();
  const make=async(systemName)=>{
    const e=new AthenaExclamationEngine({getSettings:()=>settings({systemName})});
    await e.recordQualification(vote('Momentum Hunter',base));
    await e.recordQualification(vote('Wave Surfer',base+1000));
    return (await e.recordQualification(vote('Lightning Plasma',base+2000))).candidate;
  };
  const one=await make('SAGITTARIUS-A');
  const two=await make('SAGITTARIUS-B');
  assert.ok(one&&two);
  assert.notEqual(one.id,two.id);
  assert.match(one.id,/^AE1:SAGITTARIUS-A:/);
  assert.match(two.id,/^AE1:SAGITTARIUS-B:/);
});
