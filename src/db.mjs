import pg from 'pg';
import { decryptSecret, encryptSecret, sanitizeRuntimeSettings } from './config.mjs';
import { PORTFOLIO_CONCEPTS, FEEDER_CONCEPTS } from './doctrine.mjs';
const { Pool } = pg;

const n = (v, d=0) => Number.isFinite(Number(v)) ? Number(v) : d;
const PORTFOLIO_CONCEPT_NAMES = Object.freeze([...PORTFOLIO_CONCEPTS]);
const FEEDER_CONCEPT_NAMES = Object.freeze([...FEEDER_CONCEPTS]);

// HF6/DBPI2: high-cardinality diagnostic/learning persistence must never
// consume the ordinary PostgreSQL pool without a hard concurrency budget.
// This gate is deliberately independent from execution/ledger/protection
// work: only low-priority telemetry writers use it.
export const LOW_PRIORITY_DB_PERSISTENCE = Object.freeze({
  version:'DBPI2-LP2',
  maximumConcurrency:1,
  maximumPending:256,
  maximumBatchBytes:1_500_000,
  scope:'FSI_CI1_COUNTERFACTUAL_AND_POST_EXIT_RESEARCH_PERSISTENCE_ONLY',
});

export class BoundedDbWorkGate {
  constructor(maxConcurrency=LOW_PRIORITY_DB_PERSISTENCE.maximumConcurrency,maxPending=LOW_PRIORITY_DB_PERSISTENCE.maximumPending){
    this.maxConcurrency=Math.max(1,Math.floor(Number(maxConcurrency)||1));
    this.maxPending=Math.max(1,Math.floor(Number(maxPending)||1));
    this.active=0;this.queue=[];this.totalStarted=0;this.totalCompleted=0;this.totalFailed=0;this.totalRejected=0;this.maxObservedActive=0;this.maxObservedPending=0;
  }
  run(task){
    if(typeof task!=='function')return Promise.reject(new TypeError('low-priority database task must be a function'));
    if(this.queue.length>=this.maxPending){
      this.totalRejected++;
      const error=new Error('low_priority_persistence_backpressure');
      error.code='LOW_PRIORITY_PERSISTENCE_BACKPRESSURE';
      return Promise.reject(error);
    }
    return new Promise((resolve,reject)=>{
      this.queue.push({task,resolve,reject});
      this.maxObservedPending=Math.max(this.maxObservedPending,this.queue.length);
      this.pump();
    });
  }
  pump(){
    while(this.active<this.maxConcurrency&&this.queue.length){
      const job=this.queue.shift();this.active++;this.totalStarted++;this.maxObservedActive=Math.max(this.maxObservedActive,this.active);
      Promise.resolve().then(job.task).then((value)=>{this.totalCompleted++;job.resolve(value);},(error)=>{this.totalFailed++;job.reject(error);}).finally(()=>{this.active--;this.pump();});
    }
  }
  snapshot(){return{version:LOW_PRIORITY_DB_PERSISTENCE.version,maxConcurrency:this.maxConcurrency,maxPending:this.maxPending,active:this.active,pending:this.queue.length,totalStarted:this.totalStarted,totalCompleted:this.totalCompleted,totalFailed:this.totalFailed,totalRejected:this.totalRejected,maxObservedActive:this.maxObservedActive,maxObservedPending:this.maxObservedPending};}
}

// INT1: PostgreSQL stores these sag_entries fields as integer cents. Runtime
// execution math may legitimately produce fractional VWAPs (for example,
// U-PG3 full-position executable averages), so the storage boundary must
// project only the integer-backed ledger/display columns to whole cents while
// leaving double-precision accounting fields and JSON guard telemetry exact.
const ENTRY_INTEGER_CENT_FIELDS = new Set([
  'entryPriceCents','exitPriceCents','currentPriceCents','peakPriceCents',
  'stopPriceCents','stopLossCents','spreadAtEntryCents',
  'lowestPriceAfterEntryCents','maeCents','recoveryGreenPriceCents',
]);
function entryStorageValue(key, value) {
  if (!ENTRY_INTEGER_CENT_FIELDS.has(key) || value == null) return value;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) throw new Error(`${key} must be finite before sag_entries persistence`);
  return Math.round(numeric);
}
const rowEntry = (r) => ({
  id:r.id, systemName:r.system_name, ownerId:r.owner_id, conceptName:r.concept_name,
  sourceFeeder:r.source_feeder, sourceTradeId:r.source_trade_id, ticker:r.ticker,
  eventTicker:r.event_ticker, marketTitle:r.market_title, watchdogModel:r.watchdog_model,
  mode:r.mode, status:r.status, entryPriceCents:n(r.entry_price_cents), exitPriceCents:r.exit_price_cents==null?null:n(r.exit_price_cents),
  currentPriceCents:n(r.current_price_cents), peakPriceCents:n(r.peak_price_cents), stopPriceCents:n(r.stop_price_cents),
  stopLossCents:n(r.stop_loss_cents), count:n(r.count), remainingCount:n(r.remaining_count), volume24h:n(r.volume_24h),
  spreadAtEntryCents:n(r.spread_at_entry_cents), pnlCents:n(r.pnl_cents), entryFeeCents:n(r.entry_fee_cents),
  profitHarvestPeakPnlCents:n(r.profit_harvest_peak_pnl_cents),
  apexProfitGuardState:r.apex_profit_guard_state && typeof r.apex_profit_guard_state==='object' ? r.apex_profit_guard_state : {},
  exitFeeCents:n(r.exit_fee_cents), exitFilledCount:n(r.exit_filled_count), exitNotionalCents:n(r.exit_notional_cents), exitAttemptBookMs:n(r.exit_attempt_book_ms), entryOrderId:r.entry_order_id,
  entryClientOrderId:r.entry_client_order_id, exitOrderId:r.exit_order_id, exitClientOrderId:r.exit_client_order_id,
  closeReason:r.close_reason, gameStartTimeMs:r.game_start_time_ms==null?null:n(r.game_start_time_ms), openedAtMs:n(r.opened_at_ms),
  updatedAtMs:n(r.updated_at_ms), closedAtMs:r.closed_at_ms==null?null:n(r.closed_at_ms), archived:Boolean(r.archived),
  lowestPriceAfterEntryCents:r.lowest_price_after_entry_cents==null?null:n(r.lowest_price_after_entry_cents),
  maeCents:n(r.mae_cents), maeAtMs:r.mae_at_ms==null?null:n(r.mae_at_ms),
  recoveryToEntryAtMs:r.recovery_to_entry_at_ms==null?null:n(r.recovery_to_entry_at_ms),
  recoveryToGreenAtMs:r.recovery_to_green_at_ms==null?null:n(r.recovery_to_green_at_ms),
  recoveryGreenPriceCents:r.recovery_green_price_cents==null?null:n(r.recovery_green_price_cents),
  researchTrackingComplete:Boolean(r.research_tracking_complete),
  entryConfig:r.entry_config && typeof r.entry_config==='object' ? r.entry_config : {},
  feederState:r.feeder_state && typeof r.feeder_state==='object' ? r.feeder_state : {},
  stopGuardState:r.stop_guard_state && typeof r.stop_guard_state==='object' ? r.stop_guard_state : {},
  profitGuardState:r.profit_guard_state && typeof r.profit_guard_state==='object' ? r.profit_guard_state : {},
  postExitState:r.post_exit_state && typeof r.post_exit_state==='object' ? r.post_exit_state : {},
});

export class Database {
  constructor(url) {
    if (!url) throw new Error('DATABASE_URL is required');
    const base = { connectionString:url, ssl:url.includes('localhost') ? false : { rejectUnauthorized:false } };
    // HF3: session advisory locks must never consume the same pool that serves
    // ordinary ledger/diagnostic/protection queries. Holding pg_advisory_lock
    // on the query pool can self-deadlock under concurrent entries: every
    // worker can hold one pool client and then wait forever for another client
    // to run its next policy/capital query. The lock pool is deliberately
    // small and bounded; contention becomes backpressure instead of query-pool
    // starvation, while all ordinary database work keeps its own capacity.
    // Keep the total configured PostgreSQL connection footprint at the historical
    // node-postgres default of ten: eight clients are reserved for ordinary
    // ledger/protection/diagnostic work and two are isolated for short-lived
    // session advisory locks. This fixes lock/query self-starvation without
    // silently increasing Railway/PostgreSQL connection demand.
    this.pool = new Pool({ ...base, max:8, connectionTimeoutMillis:5000, idleTimeoutMillis:10000 });
    this.lockPool = new Pool({ ...base, max:2, connectionTimeoutMillis:2000, idleTimeoutMillis:10000 });
    this.lowPriorityPersistenceGate = new BoundedDbWorkGate(LOW_PRIORITY_DB_PERSISTENCE.maximumConcurrency);
  }
  resourceSnapshot(){
    const snap=(pool,max)=>({max,total:Number(pool?.totalCount||0),idle:Number(pool?.idleCount||0),waiting:Number(pool?.waitingCount||0)});
    return {bounded:true,mainPool:snap(this.pool,8),lockPool:snap(this.lockPool,2),maximumConnections:10,lowPriorityPersistence:this.lowPriorityPersistenceGate?.snapshot?.()||null};
  }
  runLowPriorityPersistence(task){
    if(!this.lowPriorityPersistenceGate)return Promise.resolve().then(task);
    return this.lowPriorityPersistenceGate.run(task);
  }
  async acquireHunterTickerLock(systemName, ticker) {
    const client = await this.lockPool.connect();
    const key = `${systemName}|hunter-entry|${ticker}`;
    try {
      const r = await client.query('select pg_try_advisory_lock(hashtextextended($1,0)) as locked', [key]);
      if (!r.rows?.[0]?.locked) {
        client.release();
        return null;
      }
      let released = false;
      return async () => {
        if (released) return;
        released = true;
        try {
          await client.query('select pg_advisory_unlock(hashtextextended($1,0)) as unlocked', [key]);
          client.release();
        } catch (e) {
          client.release(e);
          throw e;
        }
      };
    } catch (e) {
      client.release(e);
      throw e;
    }
  }

  async acquireCosmoSignalLock(systemName, conceptName, ticker) {
    const client = await this.lockPool.connect();
    const key = `${systemName}|cosmo-signal|${conceptName}|${ticker}`;
    try {
      const r = await client.query('select pg_try_advisory_lock(hashtextextended($1,0)) as locked', [key]);
      if (!r.rows?.[0]?.locked) { client.release(); return null; }
      let released = false;
      return async () => {
        if (released) return;
        released = true;
        try {
          await client.query('select pg_advisory_unlock(hashtextextended($1,0)) as unlocked', [key]);
          client.release();
        } catch (e) { client.release(e); throw e; }
      };
    } catch (e) { client.release(e); throw e; }
  }

  async tableColumns(tableName) {
    const r = await this.pool.query(
      "select column_name from information_schema.columns where table_schema=current_schema() and table_name=$1",
      [tableName],
    );
    return new Set(r.rows.map((x) => x.column_name));
  }

  async migrateLearningData() {
    // R1 used sag_recovery_observations with trade_id/complete. R2/R3 use
    // id/tracking_complete. Keep legacy tables untouched and copy whatever is
    // compatible into the versioned v2 tables. The inserts are idempotent.
    const obs = await this.tableColumns('sag_recovery_observations');
    if (obs.has('trade_id') && obs.has('complete')) {
      await this.pool.query(`
        insert into sag_recovery_observations_v2(
          id,system_name,original_entry_id,ticker,concept_name,sport,entry_price_cents,exit_price_cents,drop_cents,
          game_minutes_at_entry,exit_at_ms,prices,trough_cents,rebound_cents,recovered,recovery_at_ms,time_to_recover_ms,
          tracking_complete,settled,final_result,updated_at_ms
        )
        select
          trade_id,system_name,trade_id,ticker,
          case when trade_id like 'MKT:%' then 'MarketObserver' else 'Legacy Hunter' end,
          sport,entry_price_cents,exit_price_cents,drop_cents,coalesce(game_minutes,0),
          coalesce(created_at_ms,updated_at_ms,0),'[]'::jsonb,trough_cents,
          case when recovered then greatest(0,entry_price_cents-trough_cents) else 0 end,
          recovered,null,0,complete,false,null,updated_at_ms
        from sag_recovery_observations
        on conflict(id) do nothing
      `);
    } else if (obs.has('id') && obs.has('tracking_complete')) {
      await this.pool.query(`
        insert into sag_recovery_observations_v2(
          id,system_name,original_entry_id,ticker,concept_name,sport,entry_price_cents,exit_price_cents,drop_cents,
          game_minutes_at_entry,exit_at_ms,prices,trough_cents,rebound_cents,recovered,recovery_at_ms,time_to_recover_ms,
          tracking_complete,settled,final_result,updated_at_ms
        )
        select id,system_name,original_entry_id,ticker,concept_name,sport,entry_price_cents,exit_price_cents,drop_cents,
          game_minutes_at_entry,exit_at_ms,prices,trough_cents,rebound_cents,recovered,recovery_at_ms,time_to_recover_ms,
          tracking_complete,settled,final_result,updated_at_ms
        from sag_recovery_observations
        on conflict(id) do nothing
      `);
    }

    const sports = await this.tableColumns('sag_sport_profiles');
    if (sports.has('prefix') && sports.has('sport')) {
      await this.pool.query(`
        insert into sag_sport_profiles_v2(
          ticker_prefix,detected_sport_name,typical_duration_ms,min_game_minutes_for_hunter,observation_count,
          confidence_level,source,observed_durations,updated_at_ms
        )
        select prefix,sport,median_duration_ms,
          greatest(10,round((median_duration_ms::numeric)/240000)::int),
          observations,case when observations>=15 then 'high' when observations>=5 then 'medium' else 'low' end,
          'legacy-learning',durations,updated_at_ms
        from sag_sport_profiles
        where observations>0 and median_duration_ms is not null and median_duration_ms>0
        on conflict(ticker_prefix) do nothing
      `);
    } else if (sports.has('ticker_prefix') && sports.has('detected_sport_name')) {
      await this.pool.query(`
        insert into sag_sport_profiles_v2(
          ticker_prefix,detected_sport_name,typical_duration_ms,min_game_minutes_for_hunter,observation_count,
          confidence_level,source,observed_durations,updated_at_ms
        )
        select ticker_prefix,detected_sport_name,typical_duration_ms,min_game_minutes_for_hunter,observation_count,
          confidence_level,source,observed_durations,updated_at_ms
        from sag_sport_profiles
        on conflict(ticker_prefix) do nothing
      `);
    }
  }

  async init() {
    await this.pool.query(`
      create table if not exists sag_settings(key text primary key,value jsonb not null,updated_at timestamptz not null default now());
      create table if not exists sag_athena_exclamation_votes_v1(
        system_name text not null,ticker text not null,event_ticker text not null,concept_name text not null,
        first_qualified_at_ms bigint not null,last_qualified_at_ms bigint not null,refresh_count int not null default 0,
        price_cents int not null default 0,bid_cents int not null default 0,source_feeder text,source_trade_id text,
        game_minutes double precision,snapshot jsonb not null default '{}'::jsonb,
        primary key(system_name,ticker,concept_name)
      );
      create index if not exists sag_athena_exclamation_votes_v1_recent on sag_athena_exclamation_votes_v1(system_name,last_qualified_at_ms desc);
      create table if not exists sag_athena_exclamation_events_v1(
        id text primary key,system_name text not null,ticker text not null,event_ticker text not null,status text not null,
        created_at_ms bigint not null,first_vote_at_ms bigint not null,third_vote_at_ms bigint not null,expires_at_ms bigint not null,
        convergence_span_ms bigint not null,saint_count int not null,saints jsonb not null default '[]'::jsonb,
        combination jsonb not null default '[]'::jsonb,review jsonb,entry_id text,decided_at_ms bigint
      );
      create index if not exists sag_athena_exclamation_events_v1_recent on sag_athena_exclamation_events_v1(system_name,created_at_ms desc);
      create table if not exists sag_secrets(key text primary key,value text not null,updated_at timestamptz not null default now());
      create table if not exists sag_entries(
        id text primary key,system_name text not null,owner_id text not null,concept_name text not null,source_feeder text,source_trade_id text,
        ticker text not null,event_ticker text not null,market_title text not null,watchdog_model text not null default 'hold-to-settlement',
        mode text not null,status text not null,entry_price_cents int not null,exit_price_cents int,current_price_cents int not null,
        peak_price_cents int not null,stop_price_cents int not null default 0,stop_loss_cents int not null default 0,count double precision not null,
        remaining_count double precision not null default 0,volume_24h double precision not null default 0,spread_at_entry_cents int not null default 0,
        pnl_cents double precision not null default 0,entry_fee_cents double precision not null default 0,profit_harvest_peak_pnl_cents double precision not null default 0,exit_fee_cents double precision not null default 0,
        exit_filled_count double precision not null default 0,exit_notional_cents double precision not null default 0,exit_attempt_book_ms bigint not null default 0,
        entry_order_id text,entry_client_order_id text,exit_order_id text,exit_client_order_id text,close_reason text,game_start_time_ms bigint,
        opened_at_ms bigint not null,updated_at_ms bigint not null,closed_at_ms bigint,archived boolean not null default false,
        lowest_price_after_entry_cents int,mae_cents int not null default 0,mae_at_ms bigint,recovery_to_entry_at_ms bigint,
        recovery_to_green_at_ms bigint,recovery_green_price_cents int,research_tracking_complete boolean not null default false,
        entry_config jsonb not null default '{}'::jsonb,feeder_state jsonb not null default '{}'::jsonb,stop_guard_state jsonb not null default '{}'::jsonb,profit_guard_state jsonb not null default '{}'::jsonb,apex_profit_guard_state jsonb not null default '{}'::jsonb,post_exit_state jsonb not null default '{}'::jsonb
      );
      alter table sag_entries add column if not exists exit_price_cents int;
      alter table sag_entries add column if not exists entry_fee_cents double precision not null default 0;
      alter table sag_entries add column if not exists profit_harvest_peak_pnl_cents double precision not null default 0;
      alter table sag_entries add column if not exists exit_fee_cents double precision not null default 0;
      alter table sag_entries add column if not exists exit_filled_count double precision not null default 0;
      alter table sag_entries add column if not exists exit_notional_cents double precision not null default 0;
      alter table sag_entries add column if not exists exit_attempt_book_ms bigint not null default 0;
      alter table sag_entries add column if not exists lowest_price_after_entry_cents int;
      alter table sag_entries add column if not exists mae_cents int not null default 0;
      alter table sag_entries add column if not exists mae_at_ms bigint;
      alter table sag_entries add column if not exists recovery_to_entry_at_ms bigint;
      alter table sag_entries add column if not exists recovery_to_green_at_ms bigint;
      alter table sag_entries add column if not exists recovery_green_price_cents int;
      alter table sag_entries add column if not exists research_tracking_complete boolean not null default false;
      alter table sag_entries add column if not exists entry_config jsonb not null default '{}'::jsonb;
      alter table sag_entries add column if not exists feeder_state jsonb not null default '{}'::jsonb;
      alter table sag_entries add column if not exists stop_guard_state jsonb not null default '{}'::jsonb;
      alter table sag_entries add column if not exists profit_guard_state jsonb not null default '{}'::jsonb;
      alter table sag_entries add column if not exists apex_profit_guard_state jsonb not null default '{}'::jsonb;
      alter table sag_entries add column if not exists post_exit_state jsonb not null default '{}'::jsonb;
      create index if not exists sag_entries_owner_status on sag_entries(owner_id,status);
      create index if not exists sag_entries_system_concept on sag_entries(system_name,concept_name);
      create index if not exists sag_entries_system_concept_source on sag_entries(system_name,concept_name,source_trade_id);
      create index if not exists sag_entries_ticker on sag_entries(ticker);
      create index if not exists sag_entries_system_closed_at on sag_entries(system_name,status,closed_at_ms desc);
      create table if not exists sag_trackers(
        system_name text not null,ticker text not null,market_title text not null,event_ticker text,series_ticker text,
        price_history jsonb not null default '[]'::jsonb,concepts_fired jsonb not null default '[]'::jsonb,first_seen_ms bigint not null,last_scan_ms bigint not null,
        scan_count int not null default 0,trade_count int not null default 0,yes_bid_cents int not null default 0,yes_ask_cents int not null default 0,
        volume_24h double precision not null default 0,game_start_time_ms bigint,game_clock_state jsonb not null default '{}'::jsonb,
        close_time_ms bigint,live_status text,phase text not null default 'tracking',primary key(system_name,ticker)
      );
      alter table sag_trackers add column if not exists phase text not null default 'tracking';
      alter table sag_trackers add column if not exists game_clock_state jsonb not null default '{}'::jsonb;
      create table if not exists sag_game_clock_authority(
        system_name text not null,event_ticker text not null,state jsonb not null default '{}'::jsonb,last_updated_ms bigint not null,
        primary key(system_name,event_ticker)
      );
      create index if not exists sag_game_clock_authority_updated on sag_game_clock_authority(system_name,last_updated_ms desc);
      create table if not exists sag_recovery_observations_v2(
        id text primary key,system_name text not null,original_entry_id text not null,ticker text not null,concept_name text not null,sport text not null,
        entry_price_cents int not null,exit_price_cents int not null,drop_cents int not null,game_minutes_at_entry int not null default 0,exit_at_ms bigint not null,
        prices jsonb not null default '[]'::jsonb,trough_cents int not null,rebound_cents int not null default 0,recovered boolean not null default false,
        recovery_at_ms bigint,time_to_recover_ms bigint not null default 0,tracking_complete boolean not null default false,settled boolean not null default false,
        final_result text,updated_at_ms bigint not null
      );
      create index if not exists sag_recovery_obs_v2_system on sag_recovery_observations_v2(system_name,tracking_complete);
      create index if not exists sag_recovery_obs_v2_original on sag_recovery_observations_v2(system_name,original_entry_id);
      create table if not exists sag_crash_market_state_v1(
        system_name text not null,ticker text not null,event_ticker text,market_title text,sport text not null default 'Unknown',
        episode_count int not null default 0,state jsonb not null default '{}'::jsonb,updated_at_ms bigint not null,
        primary key(system_name,ticker)
      );
      create index if not exists sag_crash_market_state_v1_updated on sag_crash_market_state_v1(system_name,updated_at_ms desc);
      create table if not exists sag_crash_episodes_v1(
        id text primary key,system_name text not null,ticker text not null,event_ticker text,episode_index int not null,sport text not null default 'Unknown',
        market_title text not null default '',state text not null,pre_crash_peak_cents int not null,trough_cents int not null,crash_depth_cents int not null,
        crash_started_at_ms bigint not null,trough_at_ms bigint not null,rebound_confirmed_at_ms bigint,reset_at_ms bigint,stable_observations int not null default 0,
        upward_ticks int not null default 0,rebound_cents int not null default 0,reclaim_rate double precision not null default 0,final_result text,
        dragon_signal jsonb not null default '{}'::jsonb,updated_at_ms bigint not null
      );
      alter table sag_crash_episodes_v1 add column if not exists dragon_signal jsonb not null default '{}'::jsonb;
      create index if not exists sag_crash_episodes_v1_system_ticker on sag_crash_episodes_v1(system_name,ticker,episode_index desc);
      create index if not exists sag_crash_episodes_v1_updated on sag_crash_episodes_v1(system_name,updated_at_ms desc);
      create table if not exists sag_recovery_patterns(
        system_name text not null,pattern_key text not null,sport text not null,entry_price_band text not null,drop_bucket text not null,
        game_minutes_bucket text not null,trough_bucket text not null,total_observations int not null,recovered_count int not null,recovery_rate double precision not null,
        avg_trough_cents int not null,avg_rebound_cents int not null,avg_time_to_recover_ms bigint not null,confidence_level text not null,
        enabled boolean not null default true,updated_at_ms bigint not null,primary key(system_name,pattern_key)
      );
      create table if not exists sag_stop_guard_recovery_v1(
        id text primary key,system_name text not null,original_entry_id text not null,trigger_stage text not null,ticker text not null,mode text not null,
        concept_name text not null,source_feeder text,sport text not null,entry_price_cents int not null,trigger_price_cents int not null,
        trigger_drop_cents int not null,trigger_loss_cents double precision not null default 0,danger_line_cents int not null default 0,
        game_minutes_at_entry int not null default 0,crash_bucket text not null default 'UNKNOWN',original_count double precision not null,tracked_count double precision not null,
        entry_fee_cents double precision not null default 0,base_realized_pnl_cents double precision not null default 0,trigger_at_ms bigint not null,tracking_complete boolean not null default false,
        recovered boolean not null default false,recovery_at_ms bigint,coverage_kind text not null default 'causal_from_trigger',state jsonb not null default '{}'::jsonb,updated_at_ms bigint not null,
        unique(system_name,original_entry_id,trigger_stage)
      );
      alter table sag_stop_guard_recovery_v1 add column if not exists tracked_count double precision not null default 0;
      alter table sag_stop_guard_recovery_v1 add column if not exists base_realized_pnl_cents double precision not null default 0;
      alter table sag_stop_guard_recovery_v1 add column if not exists coverage_kind text not null default 'causal_from_trigger';
      create index if not exists sag_stop_guard_recovery_v1_tracking on sag_stop_guard_recovery_v1(system_name,tracking_complete,updated_at_ms desc);
      create index if not exists sag_stop_guard_recovery_v1_ticker_tracking on sag_stop_guard_recovery_v1(system_name,ticker,tracking_complete,updated_at_ms desc);
      create index if not exists sag_stop_guard_recovery_v1_cohort on sag_stop_guard_recovery_v1(system_name,trigger_stage,mode,concept_name,source_feeder,sport,entry_price_cents,trigger_drop_cents,game_minutes_at_entry,crash_bucket);
      create table if not exists sag_stop_guard_profiles_v1(
        system_name text not null,trigger_stage text not null,mode text not null,profile_key text not null,specificity text not null,
        concept_name text,source_feeder text,sport text,entry_band text,drop_bucket text,game_bucket text,crash_bucket text,
        total_observations int not null,recovered_count int not null,avg_time_to_recover_ms bigint not null default 0,
        confidence_level text not null,updated_at_ms bigint not null,primary key(system_name,trigger_stage,mode,profile_key)
      );
      create index if not exists sag_stop_guard_profiles_v1_system on sag_stop_guard_profiles_v1(system_name,trigger_stage,mode,total_observations desc,updated_at_ms desc);
      create table if not exists sag_profit_episodes_v1(
        id text primary key,system_name text not null,ticker text not null,event_ticker text,concept_name text not null,source_feeder text,
        sport text not null default 'Unknown',entry_price_cents int not null,original_count double precision not null,opened_at_ms bigint not null,
        closed_at_ms bigint,tracking_complete boolean not null default false,state jsonb not null default '{}'::jsonb,updated_at_ms bigint not null
      );
      create index if not exists sag_profit_episodes_v1_system_tracking on sag_profit_episodes_v1(system_name,tracking_complete,updated_at_ms desc);
      create index if not exists sag_profit_episodes_v1_cohort on sag_profit_episodes_v1(system_name,concept_name,source_feeder,sport,entry_price_cents);
      create table if not exists sag_profit_profiles_v1(
        system_name text not null,profile_key text not null,specificity text not null,concept_name text,source_feeder text,sport text,entry_band text,
        total_observations int not null,one_tick_pullbacks int not null,one_tick_recoveries int not null,collapse_count int not null,
        avg_peak_capture_rate double precision not null,avg_post_exit_regret_rate double precision not null,recommended_retention_ratio double precision not null,
        confidence_level text not null,state jsonb not null default '{}'::jsonb,updated_at_ms bigint not null,primary key(system_name,profile_key)
      );
      create index if not exists sag_profit_profiles_v1_system on sag_profit_profiles_v1(system_name,total_observations desc,updated_at_ms desc);
      create table if not exists sag_athena_brains_v1(
        system_name text not null,brain_version text not null,brain_hash text not null,source_release text not null,training_cutoff_ms bigint not null default 0,
        brain jsonb not null,stats jsonb not null default '{}'::jsonb,active boolean not null default true,created_at_ms bigint not null,updated_at_ms bigint not null,
        primary key(system_name,brain_version)
      );
      create index if not exists sag_athena_brains_v1_active on sag_athena_brains_v1(system_name,active,updated_at_ms desc);
      create table if not exists sag_sport_profiles_v2(
        ticker_prefix text primary key,detected_sport_name text not null,typical_duration_ms bigint not null,min_game_minutes_for_hunter int not null,
        observation_count int not null default 0,confidence_level text not null,source text not null,observed_durations jsonb not null default '[]'::jsonb,updated_at_ms bigint not null
      );
      create table if not exists sag_sport_duration_events_v1(
        system_name text not null,ticker text not null,ticker_prefix text not null,duration_ms bigint not null,recorded_at_ms bigint not null,
        primary key(system_name,ticker)
      );
      create index if not exists sag_sport_duration_events_v1_time on sag_sport_duration_events_v1(system_name,recorded_at_ms desc);
      create table if not exists sag_snapshots(
        id bigserial primary key,system_name text not null,created_at_ms bigint not null,portfolio_value_cents double precision not null,
        realized_pnl_cents double precision not null,unrealized_pnl_cents double precision not null,hunter_realized_pnl_cents double precision not null,
        hunter_unrealized_pnl_cents double precision not null,feeder_realized_pnl_cents double precision not null,feeder_unrealized_pnl_cents double precision not null,
        win_rate double precision not null,open_count int not null,closed_count int not null
      );
      create index if not exists sag_snapshots_system_time on sag_snapshots(system_name,created_at_ms desc);
      create table if not exists sag_golden_eye_state_v1(
        system_name text primary key,state jsonb not null default '{}'::jsonb,updated_at_ms bigint not null
      );
      create table if not exists sag_feeder_signal_intel_v1(
        feeder_id text primary key,system_name text not null,concept_name text not null,ticker text not null,event_ticker text,source_episode_id text,
        signal_at_ms bigint not null,coverage_started_at_ms bigint not null,state jsonb not null default '{}'::jsonb,updated_at_ms bigint not null
      );
      create index if not exists sag_feeder_signal_intel_v1_system_time on sag_feeder_signal_intel_v1(system_name,signal_at_ms desc);
      create index if not exists sag_feeder_signal_intel_v1_ticker on sag_feeder_signal_intel_v1(system_name,ticker,signal_at_ms desc);
      create table if not exists sag_audit(id bigserial primary key,ts timestamptz not null default now(),level text not null,event text not null,data jsonb not null default '{}'::jsonb);
      create table if not exists sag_atomic_thunder_events_v1(
        id bigserial primary key,event_key text not null unique,system_name text not null,hunter_id text not null,ticker text not null,
        event_type text not null,at_ms bigint not null,data jsonb not null default '{}'::jsonb
      );
      create index if not exists sag_atomic_thunder_system_event on sag_atomic_thunder_events_v1(system_name,event_type,at_ms desc);
      create table if not exists sag_opportunity_episodes_v1(
        id text primary key,system_name text not null,source_release text not null,cohort_id text not null default '',
        ticker text not null,event_ticker text,side text not null default 'YES',sport text not null default 'Unknown',
        bolt_at_ms bigint not null,bolt_snapshot jsonb not null default '{}'::jsonb,
        athena_decision jsonb not null default '{}'::jsonb,fire_command jsonb not null default '{}'::jsonb,
        attack_selected text,entry_id text,entry_at_ms bigint,outcome jsonb not null default '{}'::jsonb,
        outcome_label text,tracking_complete boolean not null default false,updated_at_ms bigint not null
      );
      create index if not exists sag_opportunity_episodes_v1_system_time on sag_opportunity_episodes_v1(system_name,bolt_at_ms desc);
      create index if not exists sag_opportunity_episodes_v1_training on sag_opportunity_episodes_v1(system_name,tracking_complete,outcome_label,updated_at_ms desc);
      create index if not exists sag_opportunity_episodes_v1_entry on sag_opportunity_episodes_v1(system_name,entry_id);
      create table if not exists sag_lightning_plasma_reservations_v1(
        system_name text not null,field_id text not null,event_ticker text not null,bolt_id text not null,stake_cents double precision not null,
        reserved_at_ms bigint not null,expires_at_ms bigint not null,entry_id text,
        primary key(system_name,field_id,bolt_id),unique(system_name,field_id,event_ticker)
      );
      create index if not exists sag_lightning_plasma_reservations_v1_expiry on sag_lightning_plasma_reservations_v1(system_name,expires_at_ms);
    `);
    await this.migrateLearningData();
  }

  async upsertOpportunityEpisode(e={}){
    const now=Number(e.updatedAtMs||Date.now());
    const id=String(e.id||'').trim();
    if(!id)throw new Error('opportunity episode id required');
    await this.pool.query(`insert into sag_opportunity_episodes_v1(
      id,system_name,source_release,cohort_id,ticker,event_ticker,side,sport,bolt_at_ms,bolt_snapshot,athena_decision,fire_command,attack_selected,entry_id,entry_at_ms,outcome,outcome_label,tracking_complete,updated_at_ms
    ) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
    on conflict(id) do update set
      athena_decision=excluded.athena_decision,fire_command=excluded.fire_command,attack_selected=excluded.attack_selected,entry_id=excluded.entry_id,entry_at_ms=excluded.entry_at_ms,
      outcome=excluded.outcome,outcome_label=excluded.outcome_label,tracking_complete=excluded.tracking_complete,updated_at_ms=excluded.updated_at_ms`,[
      id,String(e.systemName||'SAGITTARIUS'),String(e.sourceRelease||''),String(e.cohortId||''),String(e.ticker||''),e.eventTicker?String(e.eventTicker):null,
      String(e.side||'YES'),String(e.sport||'Unknown'),Number(e.boltAtMs||Date.now()),e.boltSnapshot||{},e.athenaDecision||{},e.fireCommand||{},e.attackSelected||null,e.entryId||null,e.entryAtMs==null?null:Number(e.entryAtMs),e.outcome||{},e.outcomeLabel||null,e.trackingComplete===true,now
    ]);
    return id;
  }
  async opportunityEpisode(id){
    const r=await this.pool.query('select * from sag_opportunity_episodes_v1 where id=$1',[String(id)]);
    return r.rows[0]?this.mapOpportunityEpisode(r.rows[0]):null;
  }
  mapOpportunityEpisode(r){
    return {id:r.id,systemName:r.system_name,sourceRelease:r.source_release,cohortId:r.cohort_id||'',ticker:r.ticker,eventTicker:r.event_ticker,side:r.side,sport:r.sport,boltAtMs:n(r.bolt_at_ms),boltSnapshot:r.bolt_snapshot||{},athenaDecision:r.athena_decision||{},fireCommand:r.fire_command||{},attackSelected:r.attack_selected,entryId:r.entry_id,entryAtMs:r.entry_at_ms==null?null:n(r.entry_at_ms),outcome:r.outcome||{},outcomeLabel:r.outcome_label,trackingComplete:Boolean(r.tracking_complete),updatedAtMs:n(r.updated_at_ms)};
  }
  async opportunityEpisodes(systemName,{limit=5000,trackingComplete=null,sinceMs=null}={}){
    const params=[String(systemName)];let where='where system_name=$1';
    if(trackingComplete!=null){params.push(Boolean(trackingComplete));where+=` and tracking_complete=$${params.length}`;}
    if(sinceMs!=null){params.push(Number(sinceMs)||0);where+=` and bolt_at_ms >= $${params.length}`;}
    params.push(Math.max(1,Math.min(20_000,Math.floor(Number(limit)||5000))));
    const r=await this.pool.query(`select * from sag_opportunity_episodes_v1 ${where} order by bolt_at_ms desc limit $${params.length}`,params);
    return r.rows.map(x=>this.mapOpportunityEpisode(x));
  }
  // R54/RGM3: Athena C2 training readers project only the fields that feed the
  // economic profile compiler. Large entry_config / Bolt / outcome JSON blobs
  // remain durable in PostgreSQL and are never hydrated into the trading
  // process merely to rebuild compact historical evidence.
  async athenaEconomicOpportunityEpisodes(systemName,{limit=20000}={}){
    const lim=Math.max(1,Math.min(20_000,Math.floor(Number(limit)||20_000)));
    const r=await this.pool.query(`select
      id,source_release,cohort_id,sport,tracking_complete,attack_selected,entry_id,
      fire_command->>'selectedAttack' as fire_selected_attack,
      fire_command->>'entryPriceCents' as fire_entry_price_cents,
      fire_command->>'stakeCents' as fire_stake_cents,
      fire_command#>>'{economicTarget,netPerOriginalContractCents}' as fire_target_net_per_contract_cents,
      fire_command#>>'{survivalCertificate,status}' as arayashiki_status,
      fire_command#>>'{survivalCertificate,version}' as arayashiki_version,
      fire_command#>>'{survivalCertificate,policyRevision}' as arayashiki_policy_revision,
      outcome->>'realizedPnlCents' as outcome_realized_pnl_cents,
      outcome->>'maeCents' as outcome_mae_cents,
      outcome->>'closeReason' as outcome_close_reason,
      outcome_label,
      bolt_snapshot#>>'{features,sport}' as bolt_sport,
      bolt_snapshot#>>'{features,cosmoSources,0}' as bolt_source_feeder,
      bolt_snapshot#>>'{features,gameMinutes}' as bolt_game_minutes,
      bolt_snapshot#>>'{features,askCents}' as bolt_ask_cents
      from sag_opportunity_episodes_v1
      where system_name=$1 and tracking_complete=true
      order by bolt_at_ms desc limit $2`,[String(systemName),lim]);
    return r.rows.map((x)=>({
      id:x.id,sourceRelease:x.source_release||'',cohortId:x.cohort_id||'',sport:x.sport||'Unknown',trackingComplete:Boolean(x.tracking_complete),
      attackSelected:x.attack_selected,entryId:x.entry_id,outcomeLabel:x.outcome_label,
      fireCommand:{selectedAttack:x.fire_selected_attack||null,entryPriceCents:x.fire_entry_price_cents,stakeCents:x.fire_stake_cents,economicTarget:{netPerOriginalContractCents:x.fire_target_net_per_contract_cents},survivalCertificate:x.arayashiki_status?{status:x.arayashiki_status,version:x.arayashiki_version||null,policyRevision:x.arayashiki_policy_revision||null}:null},
      outcome:{realizedPnlCents:x.outcome_realized_pnl_cents,maeCents:x.outcome_mae_cents,closeReason:x.outcome_close_reason||null},
      boltSnapshot:{features:{sport:x.bolt_sport||null,cosmoSources:x.bolt_source_feeder?[x.bolt_source_feeder]:[],gameMinutes:x.bolt_game_minutes,askCents:x.bolt_ask_cents}},
    }));
  }
  async opportunitySummary(systemName){
    const r=await this.pool.query(`select
      count(*)::int as total,
      count(*) filter(where coalesce((athena_decision->>'decision'),'')='FIRE')::int as fire,
      count(*) filter(where coalesce((athena_decision->>'decision'),'')='WATCH')::int as watch,
      count(*) filter(where coalesce((athena_decision->>'decision'),'')='REJECT')::int as reject,
      count(*) filter(where coalesce((athena_decision->>'decision'),'')='EXPIRED')::int as expired,
      count(*) filter(where outcome_label='CLEAN_BOLT')::int as clean,
      count(*) filter(where outcome_label='TOXIC_LATE_BOLT')::int as toxic_late,
      count(*) filter(where outcome_label='FALSE_BOLT')::int as false_bolt,
      count(*) filter(where outcome_label='EXPIRED_NO_IMPULSE')::int as expired_no_impulse,
      count(*) filter(where tracking_complete=true)::int as complete,
      count(*) filter(where tracking_complete=false)::int as incomplete
      from sag_opportunity_episodes_v1 where system_name=$1`,[String(systemName)]);
    const x=r.rows[0]||{};return Object.fromEntries(Object.entries(x).map(([k,v])=>[k,Number(v)||0]));
  }

  async reserveLightningPlasmaRay({systemName,fieldId,eventTicker,boltId,stakeCents,fieldBudgetCents,maxRays,expiresAtMs}){
    const client=await this.pool.connect();const now=Date.now();
    try{
      await client.query('begin');
      await client.query('select pg_advisory_xact_lock(hashtextextended($1,0))',[`${systemName}|athena-plasma-field|${fieldId}`]);
      await client.query('delete from sag_lightning_plasma_reservations_v1 where system_name=$1 and expires_at_ms < $2',[String(systemName),now]);
      const r=await client.query('select count(*)::int as rays,coalesce(sum(stake_cents),0)::double precision as stake from sag_lightning_plasma_reservations_v1 where system_name=$1 and field_id=$2',[String(systemName),String(fieldId)]);
      const rays=Number(r.rows?.[0]?.rays||0),stake=Number(r.rows?.[0]?.stake||0),ray=Math.max(0,Number(stakeCents)||0),budget=Math.max(0,Number(fieldBudgetCents)||0),limit=Math.max(1,Math.floor(Number(maxRays)||1));
      if(rays>=limit||stake+ray>budget+1e-9){await client.query('rollback');return{ok:false,reason:rays>=limit?'max_rays':'field_budget',rays,stakeCents:stake};}
      try{
        await client.query('insert into sag_lightning_plasma_reservations_v1(system_name,field_id,event_ticker,bolt_id,stake_cents,reserved_at_ms,expires_at_ms) values($1,$2,$3,$4,$5,$6,$7)',[String(systemName),String(fieldId),String(eventTicker),String(boltId),ray,now,Number(expiresAtMs||now+5000)]);
      }catch(e){
        if(String(e?.code||'')==='23505'){await client.query('rollback');return{ok:false,reason:'duplicate_event_or_bolt',rays,stakeCents:stake};}
        throw e;
      }
      await client.query('commit');return{ok:true,rayIndex:rays+1,reservedStakeCents:stake+ray};
    }catch(e){try{await client.query('rollback');}catch{}throw e;}finally{client.release();}
  }
  async linkLightningPlasmaReservation({systemName,fieldId,boltId,entryId}){
    await this.pool.query('update sag_lightning_plasma_reservations_v1 set entry_id=$4 where system_name=$1 and field_id=$2 and bolt_id=$3',[String(systemName),String(fieldId),String(boltId),entryId?String(entryId):null]);
  }

  async close(){ await Promise.allSettled([this.pool.end(),this.lockPool.end()]); }
  async loadSettings(defaults){const r=await this.pool.query("select value from sag_settings where key='runtime'");return sanitizeRuntimeSettings(r.rows[0]?.value||{},defaults);}
  async saveSettings(settings){const clean=sanitizeRuntimeSettings(settings);await this.pool.query("insert into sag_settings(key,value) values('runtime',$1) on conflict(key) do update set value=excluded.value,updated_at=now()",[clean]);}
  async saveDeploymentConfig(value){await this.pool.query("insert into sag_settings(key,value) values('deployment',$1) on conflict(key) do update set value=excluded.value,updated_at=now()",[value]);}

  async upsertAthenaExclamationVote(v){
    await this.pool.query(`
      insert into sag_athena_exclamation_votes_v1(system_name,ticker,event_ticker,concept_name,first_qualified_at_ms,last_qualified_at_ms,refresh_count,price_cents,bid_cents,source_feeder,source_trade_id,game_minutes,snapshot)
      values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      on conflict(system_name,ticker,concept_name) do update set
        event_ticker=case when excluded.last_qualified_at_ms >= sag_athena_exclamation_votes_v1.last_qualified_at_ms then excluded.event_ticker else sag_athena_exclamation_votes_v1.event_ticker end,
        first_qualified_at_ms=least(sag_athena_exclamation_votes_v1.first_qualified_at_ms,excluded.first_qualified_at_ms),
        last_qualified_at_ms=greatest(sag_athena_exclamation_votes_v1.last_qualified_at_ms,excluded.last_qualified_at_ms),
        refresh_count=sag_athena_exclamation_votes_v1.refresh_count+1,
        price_cents=case when excluded.last_qualified_at_ms >= sag_athena_exclamation_votes_v1.last_qualified_at_ms then excluded.price_cents else sag_athena_exclamation_votes_v1.price_cents end,
        bid_cents=case when excluded.last_qualified_at_ms >= sag_athena_exclamation_votes_v1.last_qualified_at_ms then excluded.bid_cents else sag_athena_exclamation_votes_v1.bid_cents end,
        source_feeder=case when excluded.last_qualified_at_ms >= sag_athena_exclamation_votes_v1.last_qualified_at_ms then excluded.source_feeder else sag_athena_exclamation_votes_v1.source_feeder end,
        source_trade_id=case when excluded.last_qualified_at_ms >= sag_athena_exclamation_votes_v1.last_qualified_at_ms then excluded.source_trade_id else sag_athena_exclamation_votes_v1.source_trade_id end,
        game_minutes=case when excluded.last_qualified_at_ms >= sag_athena_exclamation_votes_v1.last_qualified_at_ms then excluded.game_minutes else sag_athena_exclamation_votes_v1.game_minutes end,
        snapshot=case when excluded.last_qualified_at_ms >= sag_athena_exclamation_votes_v1.last_qualified_at_ms then excluded.snapshot else sag_athena_exclamation_votes_v1.snapshot end`,[
      v.systemName,v.ticker,v.eventTicker,v.conceptName,v.firstQualifiedAtMs,v.lastQualifiedAtMs,v.refreshCount||0,
      Math.round(Number(v.priceCents||0)),Math.round(Number(v.bidCents||0)),v.sourceFeeder||null,v.sourceTradeId||null,
      v.gameMinutes==null?null:Number(v.gameMinutes),v.snapshot||{}
    ]);
  }
  async recentAthenaExclamationVotes(systemName,sinceMs=0){
    const r=await this.pool.query(`select * from sag_athena_exclamation_votes_v1 where system_name=$1 and last_qualified_at_ms >= $2 order by last_qualified_at_ms asc`,[systemName,sinceMs]);
    return r.rows.map(x=>({systemName:x.system_name,ticker:x.ticker,eventTicker:x.event_ticker,conceptName:x.concept_name,firstQualifiedAtMs:n(x.first_qualified_at_ms),lastQualifiedAtMs:n(x.last_qualified_at_ms),refreshCount:n(x.refresh_count),priceCents:n(x.price_cents),bidCents:n(x.bid_cents),sourceFeeder:x.source_feeder,sourceTradeId:x.source_trade_id,gameMinutes:x.game_minutes==null?null:n(x.game_minutes),snapshot:x.snapshot||{}}));
  }
  async athenaExclamationVotesByTicker(systemName,ticker,sinceMs=0){
    const r=await this.pool.query(`select * from sag_athena_exclamation_votes_v1 where system_name=$1 and ticker=$2 and last_qualified_at_ms >= $3 order by last_qualified_at_ms asc`,[systemName,ticker,sinceMs]);
    return r.rows.map(x=>({systemName:x.system_name,ticker:x.ticker,eventTicker:x.event_ticker,conceptName:x.concept_name,firstQualifiedAtMs:n(x.first_qualified_at_ms),lastQualifiedAtMs:n(x.last_qualified_at_ms),refreshCount:n(x.refresh_count),priceCents:n(x.price_cents),bidCents:n(x.bid_cents),sourceFeeder:x.source_feeder,sourceTradeId:x.source_trade_id,gameMinutes:x.game_minutes==null?null:n(x.game_minutes),snapshot:x.snapshot||{}}));
  }
  async insertAthenaExclamationEvent(e){
    const r=await this.pool.query(`insert into sag_athena_exclamation_events_v1(id,system_name,ticker,event_ticker,status,created_at_ms,first_vote_at_ms,third_vote_at_ms,expires_at_ms,convergence_span_ms,saint_count,saints,combination,review,entry_id,decided_at_ms)
      values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) on conflict(id) do nothing`,[
      e.id,e.systemName,e.ticker,e.eventTicker,e.status,e.createdAtMs,e.firstVoteAtMs,e.thirdVoteAtMs,e.expiresAtMs,e.convergenceSpanMs,e.saintCount,e.saints||[],e.combination||[],e.review||null,e.entryId||null,e.decidedAtMs||null
    ]);
    return (r.rowCount||0)>0;
  }
  async updateAthenaExclamationEvent(id,e){
    await this.pool.query(`update sag_athena_exclamation_events_v1 set status=$2,review=$3,entry_id=$4,decided_at_ms=$5,saint_count=$6,saints=$7,combination=$8 where id=$1`,[id,e.status,e.review||null,e.entryId||null,e.decidedAtMs||null,e.saintCount||0,e.saints||[],e.combination||[]]);
  }
  async recentAthenaExclamationEvents(systemName,sinceMs=0){
    const r=await this.pool.query(`select * from sag_athena_exclamation_events_v1 where system_name=$1 and created_at_ms >= $2 order by created_at_ms asc`,[systemName,sinceMs]);
    return r.rows.map(x=>({id:x.id,systemName:x.system_name,ticker:x.ticker,eventTicker:x.event_ticker,status:x.status,createdAtMs:n(x.created_at_ms),firstVoteAtMs:n(x.first_vote_at_ms),thirdVoteAtMs:n(x.third_vote_at_ms),expiresAtMs:n(x.expires_at_ms),convergenceSpanMs:n(x.convergence_span_ms),saintCount:n(x.saint_count),saints:x.saints||[],combination:x.combination||[],review:x.review||null,entryId:x.entry_id,decidedAtMs:x.decided_at_ms==null?null:n(x.decided_at_ms)}));
  }
  async activeAthenaExclamationEvent(systemName,ticker,nowMs=Date.now()){
    const r=await this.pool.query(`select * from sag_athena_exclamation_events_v1 where system_name=$1 and ticker=$2 and expires_at_ms>$3 order by created_at_ms desc limit 1`,[systemName,ticker,nowMs]);
    const x=r.rows[0];
    return x?{id:x.id,systemName:x.system_name,ticker:x.ticker,eventTicker:x.event_ticker,status:x.status,createdAtMs:n(x.created_at_ms),firstVoteAtMs:n(x.first_vote_at_ms),thirdVoteAtMs:n(x.third_vote_at_ms),expiresAtMs:n(x.expires_at_ms),convergenceSpanMs:n(x.convergence_span_ms),saintCount:n(x.saint_count),saints:x.saints||[],combination:x.combination||[],review:x.review||null,entryId:x.entry_id,decidedAtMs:x.decided_at_ms==null?null:n(x.decided_at_ms)}:null;
  }
  async goldenEyeState(systemName){const r=await this.pool.query('select system_name,state,updated_at_ms from sag_golden_eye_state_v1 where system_name=$1',[systemName]);return r.rows[0]||null;}
  async saveGoldenEyeState(systemName,state){const now=Date.now();await this.pool.query(`insert into sag_golden_eye_state_v1(system_name,state,updated_at_ms) values($1,$2,$3) on conflict(system_name) do update set state=excluded.state,updated_at_ms=excluded.updated_at_ms where excluded.updated_at_ms>=sag_golden_eye_state_v1.updated_at_ms`,[systemName,state||{},now]);}
  async manualCashoutTrainingRows(systemName,{afterMs=0,limit=5000}={}){const r=await this.pool.query("select * from sag_entries where system_name=$1 and status='closed' and close_reason='manual_cashout' and closed_at_ms>$2 order by closed_at_ms asc,id asc limit $3",[systemName,Math.max(0,n(afterMs)),Math.max(1,Math.min(20000,Math.floor(n(limit,5000))))]);return r.rows.map(rowEntry);}
  async saveCredentials(keyId,privateKeyPem){for(const [key,value] of [['kalshi_api_key_id',encryptSecret(keyId)],['kalshi_private_key_pem',encryptSecret(privateKeyPem)]])await this.pool.query('insert into sag_secrets(key,value) values($1,$2) on conflict(key) do update set value=excluded.value,updated_at=now()',[key,value]);}
  async loadCredentials(){try{const r=await this.pool.query("select key,value from sag_secrets where key in ('kalshi_api_key_id','kalshi_private_key_pem')");const m=new Map(r.rows.map(x=>[x.key,x.value]));if(!m.get('kalshi_api_key_id')||!m.get('kalshi_private_key_pem'))return null;return{keyId:decryptSecret(m.get('kalshi_api_key_id')),privateKeyPem:decryptSecret(m.get('kalshi_private_key_pem'))};}catch{return null;}}

  async insertEntry(e){
    const cols=[
      'id','system_name','owner_id','concept_name','source_feeder','source_trade_id','ticker','event_ticker','market_title','watchdog_model','mode','status',
      'entry_price_cents','exit_price_cents','current_price_cents','peak_price_cents','stop_price_cents','stop_loss_cents','count','remaining_count','volume_24h',
      'spread_at_entry_cents','pnl_cents','entry_fee_cents','profit_harvest_peak_pnl_cents','exit_fee_cents','exit_filled_count','exit_notional_cents','exit_attempt_book_ms','entry_order_id',
      'entry_client_order_id','exit_order_id','exit_client_order_id','close_reason','game_start_time_ms','opened_at_ms','updated_at_ms','closed_at_ms','archived',
      'lowest_price_after_entry_cents','mae_cents','mae_at_ms','recovery_to_entry_at_ms','recovery_to_green_at_ms','recovery_green_price_cents',
      'research_tracking_complete','entry_config','feeder_state','stop_guard_state','profit_guard_state','apex_profit_guard_state','post_exit_state',
    ];
    const vals=[
      e.id,e.systemName,e.ownerId,e.conceptName,e.sourceFeeder||null,e.sourceTradeId||null,e.ticker,e.eventTicker,e.marketTitle,e.watchdogModel||'hold-to-settlement',e.mode,e.status,
      entryStorageValue('entryPriceCents',e.entryPriceCents),entryStorageValue('exitPriceCents',e.exitPriceCents??null),entryStorageValue('currentPriceCents',e.currentPriceCents),entryStorageValue('peakPriceCents',e.peakPriceCents),entryStorageValue('stopPriceCents',e.stopPriceCents||0),entryStorageValue('stopLossCents',e.stopLossCents||0),e.count,e.remainingCount??e.count,e.volume24h||0,
      entryStorageValue('spreadAtEntryCents',e.spreadAtEntryCents||0),e.pnlCents||0,e.entryFeeCents||0,e.profitHarvestPeakPnlCents||0,e.exitFeeCents||0,e.exitFilledCount||0,e.exitNotionalCents||0,e.exitAttemptBookMs||0,e.entryOrderId||null,
      e.entryClientOrderId||null,e.exitOrderId||null,e.exitClientOrderId||null,e.closeReason||null,e.gameStartTimeMs||null,e.openedAtMs,e.updatedAtMs,e.closedAtMs||null,Boolean(e.archived),
      entryStorageValue('lowestPriceAfterEntryCents',e.lowestPriceAfterEntryCents??null),entryStorageValue('maeCents',e.maeCents||0),e.maeAtMs??null,e.recoveryToEntryAtMs??null,e.recoveryToGreenAtMs??null,entryStorageValue('recoveryGreenPriceCents',e.recoveryGreenPriceCents??null),
      Boolean(e.researchTrackingComplete),e.entryConfig||{},e.feederState||{},e.stopGuardState||{},e.profitGuardState||{},e.apexProfitGuardState||{},e.postExitState||{},
    ];
    const marks=vals.map((_,i)=>`$${i+1}`).join(',');
    await this.pool.query(`insert into sag_entries(${cols.join(',')}) values(${marks})`,vals);
    return e;
  }
  async updateEntry(id,patch){
    const col={status:'status',entryPriceCents:'entry_price_cents',exitPriceCents:'exit_price_cents',currentPriceCents:'current_price_cents',peakPriceCents:'peak_price_cents',stopPriceCents:'stop_price_cents',stopLossCents:'stop_loss_cents',count:'count',remainingCount:'remaining_count',pnlCents:'pnl_cents',entryFeeCents:'entry_fee_cents',profitHarvestPeakPnlCents:'profit_harvest_peak_pnl_cents',exitFeeCents:'exit_fee_cents',exitFilledCount:'exit_filled_count',exitNotionalCents:'exit_notional_cents',exitAttemptBookMs:'exit_attempt_book_ms',entryOrderId:'entry_order_id',entryClientOrderId:'entry_client_order_id',exitOrderId:'exit_order_id',exitClientOrderId:'exit_client_order_id',closeReason:'close_reason',updatedAtMs:'updated_at_ms',closedAtMs:'closed_at_ms',archived:'archived',volume24h:'volume_24h',gameStartTimeMs:'game_start_time_ms',lowestPriceAfterEntryCents:'lowest_price_after_entry_cents',maeCents:'mae_cents',maeAtMs:'mae_at_ms',recoveryToEntryAtMs:'recovery_to_entry_at_ms',recoveryToGreenAtMs:'recovery_to_green_at_ms',recoveryGreenPriceCents:'recovery_green_price_cents',researchTrackingComplete:'research_tracking_complete',entryConfig:'entry_config',feederState:'feeder_state',stopGuardState:'stop_guard_state',profitGuardState:'profit_guard_state',apexProfitGuardState:'apex_profit_guard_state',postExitState:'post_exit_state'};
    const jsonFields=new Set(['entryConfig','feederState','stopGuardState','profitGuardState','apexProfitGuardState','postExitState']);
    const sets=[],vals=[];for(const[k,v]of Object.entries(patch))if(col[k]){const value=jsonFields.has(k)?(v||{}):entryStorageValue(k,v);vals.push(value);sets.push(`${col[k]}=$${vals.length}`);}if(!sets.length)return;vals.push(id);await this.pool.query(`update sag_entries set ${sets.join(',')} where id=$${vals.length}`,vals);
  }
  async entries(systemName,{limit=5000,includeArchived=false}={}){const r=await this.pool.query(`select * from sag_entries where system_name=$1 ${includeArchived?'':'and archived=false'} order by opened_at_ms desc limit $2`,[systemName,limit]);return r.rows.map(rowEntry);}
  async feederSignalLinkedHunters(systemName,{limit=20000}={}){
    const lim=Math.max(1,Math.min(20_000,Math.floor(Number(limit)||20_000)));
    const r=await this.pool.query(`select id,concept_name,source_feeder,source_trade_id,ticker,status,mode,entry_price_cents,opened_at_ms,closed_at_ms,close_reason,pnl_cents,mae_cents,lowest_price_after_entry_cents,
      entry_config->>'release' as release,entry_config->>'profitAuthority' as profit_authority,
      entry_config#>>'{crashRecoverySource,cosmoSourceId}' as crash_cosmo_source_id,
      entry_config#>>'{athena,version}' as athena_version,entry_config#>>'{athena,brainHash}' as athena_brain_hash,
      entry_config#>>'{athena,classification}' as athena_classification,entry_config#>>'{athena,confidence}' as athena_confidence,entry_config#>>'{athena,score}' as athena_score
      from sag_entries where system_name=$1 and concept_name = any($2::text[]) order by opened_at_ms desc limit $3`,[String(systemName),PORTFOLIO_CONCEPT_NAMES,lim]);
    return r.rows.map((x)=>({
      id:x.id,conceptName:x.concept_name,sourceFeeder:x.source_feeder,sourceTradeId:x.source_trade_id,ticker:x.ticker,status:x.status,mode:x.mode,entryPriceCents:n(x.entry_price_cents),
      openedAtMs:n(x.opened_at_ms),closedAtMs:x.closed_at_ms==null?null:n(x.closed_at_ms),closeReason:x.close_reason,pnlCents:n(x.pnl_cents),maeCents:x.mae_cents==null?null:n(x.mae_cents),lowestPriceAfterEntryCents:x.lowest_price_after_entry_cents==null?null:n(x.lowest_price_after_entry_cents),
      entryConfig:{release:x.release||null,profitAuthority:x.profit_authority||null,crashRecoverySource:{cosmoSourceId:x.crash_cosmo_source_id||null},athena:x.athena_version?{version:x.athena_version,brainHash:x.athena_brain_hash||null,classification:x.athena_classification||null,confidence:x.athena_confidence||null,score:x.athena_score==null?null:n(x.athena_score)}:null},
    }));
  }
  async athenaEconomicEntries(systemName,{limit=20000}={}){
    const lim=Math.max(1,Math.min(20_000,Math.floor(Number(limit)||20_000)));
    const r=await this.pool.query(`select
      id,concept_name,status,closed_at_ms,close_reason,pnl_cents,mae_cents,entry_price_cents,entry_fee_cents,count,source_feeder,watchdog_model,
      entry_config->>'sport' as entry_sport,
      entry_config#>>'{gameClockAuthority,elapsedMinutes}' as game_elapsed_minutes,
      entry_config->>'gameMinutes' as game_minutes,
      entry_config->>'release' as release,entry_config->>'sourceRelease' as source_release,
      entry_config->>'cohortId' as cohort_id,entry_config->>'resetTimestampMs' as reset_timestamp_ms,
      entry_config#>>'{infinityBreak,minimumNetPerOriginalContractCents}' as infinity_target,
      entry_config#>>'{atomicThunder,minimumNetPerOriginalContractCents}' as atomic_target,
      entry_config#>>'{athenaFire,survivalCertificate,status}' as arayashiki_status,
      entry_config#>>'{athenaFire,survivalCertificate,version}' as arayashiki_version,
      entry_config#>>'{athenaFire,survivalCertificate,policyRevision}' as arayashiki_policy_revision
      from sag_entries
      where system_name=$1 and concept_name = any($2::text[]) and (status in ('closed','settled') or closed_at_ms is not null)
      order by coalesce(closed_at_ms,updated_at_ms) desc limit $3`,[String(systemName),PORTFOLIO_CONCEPT_NAMES,lim]);
    return r.rows.map((x)=>({
      id:x.id,conceptName:x.concept_name,status:x.status,closedAtMs:x.closed_at_ms==null?null:n(x.closed_at_ms),closeReason:x.close_reason,
      pnlCents:n(x.pnl_cents),maeCents:x.mae_cents==null?null:n(x.mae_cents),entryPriceCents:n(x.entry_price_cents),entryFeeCents:n(x.entry_fee_cents),count:n(x.count),sourceFeeder:x.source_feeder,watchdogModel:x.watchdog_model,
      entryConfig:{sport:x.entry_sport||null,gameClockAuthority:{elapsedMinutes:x.game_elapsed_minutes},gameMinutes:x.game_minutes,release:x.release||null,sourceRelease:x.source_release||null,cohortId:x.cohort_id||null,resetTimestampMs:x.reset_timestamp_ms,infinityBreak:{minimumNetPerOriginalContractCents:x.infinity_target},atomicThunder:{minimumNetPerOriginalContractCents:x.atomic_target},athenaFire:x.arayashiki_status?{survivalCertificate:{status:x.arayashiki_status,version:x.arayashiki_version||null,policyRevision:x.arayashiki_policy_revision||null}}:null},
    }));
  }
  async openEntries(systemName){const r=await this.pool.query("select * from sag_entries where system_name=$1 and archived=false and status in ('open','entry_pending','exit_pending','pending_recovery') order by opened_at_ms asc",[systemName]);return r.rows.map(rowEntry);}
  // R54/RGM3 trade-priority readers: execution and Athena hot paths must never
  // hydrate the historical 5,000-row ledger just to answer compact admission,
  // capital, feeder-context, or recovery questions. These projections preserve
  // the exact durable facts consumed by those decisions while leaving heavy
  // historical entry JSON in PostgreSQL.
  async athenaR2FeederContextRows(systemName,{limit=4096}={}){
    const lim=Math.max(1,Math.min(4096,Math.floor(Number(limit)||4096)));
    const r=await this.pool.query(`select id,concept_name,ticker,event_ticker,entry_price_cents,opened_at_ms,
      entry_config#>>'{dragonSource,signalPriceCents}' as dragon_signal_price_cents
      from sag_entries where system_name=$1 and archived=false and concept_name in ('Pegasus','Dragon')
      order by opened_at_ms desc limit $2`,[String(systemName),lim]);
    return r.rows.map((x)=>({id:x.id,conceptName:x.concept_name,ticker:x.ticker,eventTicker:x.event_ticker||x.ticker,entryPriceCents:n(x.entry_price_cents),openedAtMs:n(x.opened_at_ms),entryConfig:x.concept_name==='Dragon'?{dragonSource:{signalPriceCents:n(x.dragon_signal_price_cents)}}:{}})).reverse();
  }
  async simulationCashAggregate(systemName,{simFeeCents=0}={}){
    const fee=Math.max(0,Number(simFeeCents)||0);
    const r=await this.pool.query(`select
      coalesce(sum(pnl_cents) filter(where mode='SIMULATION' and concept_name = any($2::text[])),0)::double precision as realized_cents,
      coalesce(sum((entry_price_cents*greatest(0,remaining_count)) +
        case when count>0 then (case when entry_fee_cents>0 then entry_fee_cents else $3::double precision*count end)*(greatest(0,remaining_count)/count) else 0 end)
        filter(where mode='SIMULATION' and concept_name = any($2::text[]) and status in ('open','entry_pending','exit_pending','pending_recovery')),0)::double precision as reserved_cents
      from sag_entries where system_name=$1 and archived=false`,[String(systemName),PORTFOLIO_CONCEPT_NAMES,fee]);
    return{realizedCents:n(r.rows[0]?.realized_cents),reservedCents:n(r.rows[0]?.reserved_cents)};
  }
  async hunterEventPolicySnapshot(systemName,eventTicker){
    const event=String(eventTicker||'');
    // R59/GE-C1: one compact query returns both the global event exposure cap
    // and per-Attack last-entry clocks. With Galactic Explosion ON, different
    // Attacks may coexist; only the same Attack's cooldown remains relevant.
    // Keeping this in one query avoids multiplying hot-path DB fanout.
    const r=await this.pool.query(`with event_rows as (
      select concept_name,status,opened_at_ms from sag_entries
      where system_name=$1 and archived=false and concept_name = any($2::text[])
        and coalesce(nullif(event_ticker,''),ticker)=$3
    ), by_concept as (
      select concept_name,coalesce(max(opened_at_ms) filter(where status<>'rejected'),0)::bigint as latest_hunter_entry_ms
      from event_rows group by concept_name
    ), aggregate as (
      select count(*) filter(where status in ('open','entry_pending','exit_pending','pending_recovery'))::int as active_entries,
        coalesce(max(opened_at_ms) filter(where status<>'rejected'),0)::bigint as latest_hunter_entry_ms
      from event_rows
    ) select aggregate.active_entries,aggregate.latest_hunter_entry_ms,
      coalesce((select jsonb_object_agg(concept_name,latest_hunter_entry_ms) from by_concept),'{}'::jsonb) as latest_by_concept
      from aggregate`,[String(systemName),PORTFOLIO_CONCEPT_NAMES,event]);
    const by=r.rows[0]?.latest_by_concept||{};
    return{activeEntries:n(r.rows[0]?.active_entries),latestHunterEntryMs:n(r.rows[0]?.latest_hunter_entry_ms),latestByConcept:Object.fromEntries(Object.entries(by).map(([k,v])=>[k,n(v)]))};
  }
  async recoverySourceEntries(systemName,{sinceMs=0}={}){
    const since=Math.max(0,Number(sinceMs)||0);
    const r=await this.pool.query(`select e.id,e.concept_name,e.ticker,e.event_ticker,e.market_title,e.entry_price_cents,e.exit_price_cents,e.closed_at_ms,
      jsonb_build_object('gameClockAuthority',coalesce(e.entry_config->'gameClockAuthority','{}'::jsonb)) as entry_config
      from sag_entries e where e.system_name=$1 and e.archived=false and e.status='closed' and e.close_reason='hard_stop_loss'
      and e.concept_name <> 'Recovery Hunter'
      and e.exit_price_cents>0 and e.closed_at_ms >= $2
      and not exists(select 1 from sag_entries r where r.system_name=e.system_name and r.archived=false and r.concept_name='Recovery Hunter' and r.source_trade_id=e.id)
      order by e.closed_at_ms desc`,[String(systemName),since]);
    return r.rows.map((x)=>({id:x.id,conceptName:x.concept_name,ticker:x.ticker,eventTicker:x.event_ticker||x.ticker,marketTitle:x.market_title||x.ticker,entryPriceCents:n(x.entry_price_cents),exitPriceCents:n(x.exit_price_cents),closedAtMs:n(x.closed_at_ms),entryConfig:x.entry_config||{}}));
  }
  async feederEvaluationContext(systemName,{sinceMs=0}={}){
    const since=Math.max(0,Number(sinceMs)||0);
    const r=await this.pool.query(`select concept_name,ticker,event_ticker,status,opened_at_ms from sag_entries
      where system_name=$1 and archived=false and (status in ('open','entry_pending','exit_pending','pending_recovery') or opened_at_ms >= $2)
      order by opened_at_ms asc`,[String(systemName),since]);
    return r.rows.map((x)=>({conceptName:x.concept_name,ticker:x.ticker,eventTicker:x.event_ticker||x.ticker,status:x.status,openedAtMs:n(x.opened_at_ms)}));
  }
  async sourceTradeIdsByConcept(systemName,concept){
    const r=await this.pool.query(`select source_trade_id from sag_entries where system_name=$1 and archived=false and concept_name=$2 and source_trade_id is not null`,[String(systemName),String(concept)]);
    return r.rows.map((x)=>String(x.source_trade_id||'')).filter(Boolean);
  }
  async recoveryObservationsByOriginalEntryIds(systemName,originalEntryIds=[]){
    const ids=[...new Set((originalEntryIds||[]).map(String).filter(Boolean))];if(!ids.length)return[];
    const r=await this.pool.query(`select id,original_entry_id,trough_cents,rebound_cents,recovered,recovery_at_ms,time_to_recover_ms,tracking_complete,settled,final_result,updated_at_ms
      from sag_recovery_observations_v2 where system_name=$1 and original_entry_id = any($2::text[]) order by updated_at_ms desc`,[String(systemName),ids]);
    return r.rows;
  }
  // R54/RGM3 operational dashboard readers. These queries preserve complete
  // portfolio totals without hydrating thousands of full sag_entries JSON
  // objects every SSE refresh. Open positions remain full-fidelity; history is
  // summarized in PostgreSQL and only a bounded recent display window is read.
  async performanceAggregate(systemName,{resetTimestampMs=0}={}){
    const reset=Math.max(0,Number(resetTimestampMs)||0);
    const r=await this.pool.query(`select
      count(*) filter(where concept_name = any($2::text[]) and status='closed' and ($3::bigint=0 or closed_at_ms >= $3))::int as closed_hunters,
      count(*) filter(where concept_name = any($2::text[]) and status in ('open','entry_pending','exit_pending','pending_recovery'))::int as open_hunters,
      count(*) filter(where concept_name = any($2::text[]) and status='closed' and pnl_cents>0 and ($3::bigint=0 or closed_at_ms >= $3))::int as wins,
      count(*) filter(where concept_name = any($2::text[]) and status='closed' and pnl_cents<0 and ($3::bigint=0 or closed_at_ms >= $3))::int as losses,
      count(*) filter(where concept_name = any($2::text[]) and status='closed' and pnl_cents=0 and ($3::bigint=0 or closed_at_ms >= $3))::int as scratches,
      coalesce(sum(pnl_cents) filter(where concept_name = any($2::text[]) and status='closed' and ($3::bigint=0 or closed_at_ms >= $3)),0)::double precision as closed_realized_cents,
      coalesce(sum(pnl_cents) filter(where concept_name = any($2::text[]) and status in ('open','entry_pending','exit_pending','pending_recovery') and ($3::bigint=0 or updated_at_ms >= $3)),0)::double precision as partial_realized_cents,
      coalesce(sum(pnl_cents) filter(where concept_name = any($2::text[]) and mode='SIMULATION'),0)::double precision as simulation_ledger_pnl_cents
      from sag_entries where system_name=$1 and archived=false`,[String(systemName),PORTFOLIO_CONCEPT_NAMES,reset]);
    const x=r.rows[0]||{};return Object.fromEntries(Object.entries(x).map(([k,v])=>[k,Number(v)||0]));
  }
  async recentClosedHunters(systemName,{limit=150,resetTimestampMs=0}={}){
    const lim=Math.max(1,Math.min(500,Math.floor(Number(limit)||150))),reset=Math.max(0,Number(resetTimestampMs)||0);
    // R54/RGM3: closed-position dashboard rows do not need the full Athena FIRE
    // evidence, feeder/stop/profit JSON graphs, or other creation-time payloads.
    // Keep only fields required by the closed table and authority summaries.
    const r=await this.pool.query(`select id,system_name,owner_id,concept_name,source_feeder,source_trade_id,ticker,event_ticker,market_title,watchdog_model,mode,status,
      entry_price_cents,exit_price_cents,current_price_cents,peak_price_cents,stop_price_cents,stop_loss_cents,count,remaining_count,volume_24h,spread_at_entry_cents,pnl_cents,
      entry_fee_cents,profit_harvest_peak_pnl_cents,exit_fee_cents,exit_filled_count,exit_notional_cents,exit_attempt_book_ms,close_reason,game_start_time_ms,opened_at_ms,updated_at_ms,closed_at_ms,archived,
      lowest_price_after_entry_cents,mae_cents,mae_at_ms,recovery_to_entry_at_ms,recovery_to_green_at_ms,recovery_green_price_cents,research_tracking_complete,
      jsonb_build_object('aurora',coalesce(entry_config->'aurora','{}'::jsonb),'infinityBreak',coalesce(entry_config->'infinityBreak','{}'::jsonb)) as entry_config,
      '{}'::jsonb as feeder_state,'{}'::jsonb as stop_guard_state,'{}'::jsonb as profit_guard_state,'{}'::jsonb as apex_profit_guard_state,post_exit_state
      from sag_entries where system_name=$1 and archived=false and concept_name = any($2::text[]) and status='closed' and ($3::bigint=0 or closed_at_ms >= $3) order by closed_at_ms desc nulls last limit $4`,[String(systemName),PORTFOLIO_CONCEPT_NAMES,reset,lim]);
    return r.rows.map(rowEntry);
  }
  async conceptStatsAggregate(systemName){
    const r=await this.pool.query(`with portfolio as (
      select concept_name,
        count(*)::int as total,
        count(*) filter(where status in ('open','entry_pending','exit_pending','pending_recovery'))::int as open,
        count(*) filter(where status='closed')::int as closed,
        count(*) filter(where status='closed' and pnl_cents>0)::int as wins,
        count(*) filter(where status='closed' and pnl_cents<0)::int as losses,
        coalesce(sum(pnl_cents) filter(where status='closed'),0)::double precision as pnl_cents,
        coalesce(avg(entry_price_cents),0)::double precision as avg_entry_cents,
        coalesce(avg(current_price_cents),0)::double precision as avg_current_cents,
        coalesce(avg(volume_24h),0)::double precision as avg_liquidity
      from sag_entries where system_name=$1 and archived=false and concept_name = any($2::text[]) group by concept_name
    ), signals as (
      select concept_name,count(*)::int as feeder_signals,
        coalesce(avg(case when concept_name='Dragon' then coalesce(nullif(entry_config#>>'{dragonSource,signalPriceCents}','')::double precision,entry_price_cents::double precision) when concept_name='Phoenix' then coalesce(nullif(entry_config#>>'{phoenixSource,signalAskCents}','')::double precision,entry_price_cents::double precision) else entry_price_cents::double precision end),0)::double precision as avg_entry_cents,
        coalesce(avg(current_price_cents),0)::double precision as avg_current_cents,
        coalesce(avg(volume_24h),0)::double precision as avg_liquidity
      from sag_entries where system_name=$1 and archived=false and concept_name = any($3::text[]) group by concept_name
    ), linked as (
      select source_feeder,
        count(*)::int as total,
        count(*) filter(where status in ('open','entry_pending','exit_pending','pending_recovery'))::int as open,
        count(*) filter(where status='closed')::int as closed,
        count(*) filter(where status='closed' and pnl_cents>0)::int as wins,
        count(*) filter(where status='closed' and pnl_cents<0)::int as losses,
        count(*) filter(where status='closed' and pnl_cents=0)::int as scratches,
        coalesce(sum(pnl_cents) filter(where status='closed'),0)::double precision as pnl_cents
      from sag_entries where system_name=$1 and archived=false and concept_name = any($2::text[]) and source_feeder = any($3::text[]) group by source_feeder
    ) select
      coalesce((select jsonb_agg(to_jsonb(p)) from portfolio p),'[]'::jsonb) as portfolio,
      coalesce((select jsonb_agg(to_jsonb(s)) from signals s),'[]'::jsonb) as signals,
      coalesce((select jsonb_agg(to_jsonb(l)) from linked l),'[]'::jsonb) as linked`,[String(systemName),PORTFOLIO_CONCEPT_NAMES,FEEDER_CONCEPT_NAMES]);
    const x=r.rows[0]||{};return{portfolio:Array.isArray(x.portfolio)?x.portfolio:[],signals:Array.isArray(x.signals)?x.signals:[],linked:Array.isArray(x.linked)?x.linked:[]};
  }
  async expirePhoenixSignals(systemName, nowMs=Date.now(), {forceAll=false,limit=256}={}){
    const lim=Math.max(1,Math.min(1024,Math.floor(Number(limit)||256))),now=Math.max(0,Number(nowMs)||Date.now());
    const r=await this.pool.query(`with stale as (
      select id from sag_entries where system_name=$1 and archived=false and concept_name='Phoenix' and status='open'
        and ($3::boolean=true or coalesce(nullif(entry_config#>>'{phoenixSource,expiresAtMs}','')::bigint,0) <= $2)
      order by opened_at_ms asc limit $4
    ) update sag_entries e set status='closed',close_reason='phoenix_signal_expired',closed_at_ms=$2,updated_at_ms=$2
      from stale where e.id=stale.id returning e.id,e.ticker`,[String(systemName),now,Boolean(forceAll),lim]);
    return r.rows.map((x)=>({id:x.id,ticker:x.ticker}));
  }

  async openEntriesByTicker(systemName,ticker){const r=await this.pool.query("select * from sag_entries where system_name=$1 and ticker=$2 and archived=false and status in ('open','entry_pending','exit_pending','pending_recovery') order by opened_at_ms asc",[systemName,ticker]);return r.rows.map(rowEntry);}
  async openHunterEntries(systemName){const r=await this.pool.query("select * from sag_entries where system_name=$1 and archived=false and concept_name = any($2::text[]) and status in ('open','entry_pending','exit_pending','pending_recovery') order by opened_at_ms asc",[systemName,PORTFOLIO_CONCEPT_NAMES]);return r.rows.map(rowEntry);}
  async openHunterEntriesByTicker(systemName,ticker){const r=await this.pool.query("select * from sag_entries where system_name=$1 and ticker=$2 and archived=false and concept_name = any($3::text[]) and status in ('open','entry_pending','exit_pending','pending_recovery') order by opened_at_ms asc",[systemName,ticker,PORTFOLIO_CONCEPT_NAMES]);return r.rows.map(rowEntry);}
  async openFeederEntries(systemName){const r=await this.pool.query("select * from sag_entries where system_name=$1 and archived=false and concept_name = any($2::text[]) and status in ('open','entry_pending','exit_pending','pending_recovery') order by opened_at_ms asc",[systemName,FEEDER_CONCEPT_NAMES]);return r.rows.map(rowEntry);}
  async entriesByConcept(systemName,conceptName,{limit=200,includeArchived=false}={}){const lim=Math.max(1,Math.min(2000,Math.floor(Number(limit)||200)));const r=await this.pool.query(`select * from sag_entries where system_name=$1 and concept_name=$2 ${includeArchived?'':'and archived=false'} order by opened_at_ms desc limit $3`,[String(systemName),String(conceptName),lim]);return r.rows.map(rowEntry);}
  async entryByConceptSourceTradeId(systemName,conceptName,sourceTradeId){const r=await this.pool.query('select * from sag_entries where system_name=$1 and concept_name=$2 and source_trade_id=$3 and archived=false order by opened_at_ms desc limit 1',[String(systemName),String(conceptName),String(sourceTradeId)]);return r.rows[0]?rowEntry(r.rows[0]):null;}
  async liveOpenHunterEntries(ownerId){const r=await this.pool.query("select * from sag_entries where owner_id=$1 and archived=false and concept_name = any($2::text[]) and mode='LIVE' and status in ('open','entry_pending','exit_pending','pending_recovery') order by opened_at_ms asc",[ownerId,PORTFOLIO_CONCEPT_NAMES]);return r.rows.map(rowEntry);}
  async entryById(id){const r=await this.pool.query('select * from sag_entries where id=$1',[id]);return r.rows[0]?rowEntry(r.rows[0]):null;}
  async recentClosed(systemName,limit=500){const r=await this.pool.query("select * from sag_entries where system_name=$1 and archived=false and status='closed' order by closed_at_ms desc nulls last limit $2",[systemName,limit]);return r.rows.map(rowEntry);}
  async recentClosedForResearch(systemName,sinceMs,limit=500){const lim=Math.max(1,Math.min(2000,Math.floor(Number(limit)||500)));const r=await this.pool.query("select * from sag_entries where system_name=$1 and status='closed' and closed_at_ms is not null and closed_at_ms >= $2 order by closed_at_ms desc limit $3",[systemName,Number(sinceMs)||0,lim]);return r.rows.map(rowEntry);}
  async archiveSimulation(systemName){const r=await this.pool.query("update sag_entries set archived=true,updated_at_ms=$2 where system_name=$1 and mode='SIMULATION' and archived=false returning id",[systemName,Date.now()]);return r.rowCount||0;}

  async getTracker(systemName,ticker){const r=await this.pool.query('select * from sag_trackers where system_name=$1 and ticker=$2',[systemName,ticker]);return r.rows[0]||null;}
  async upsertTracker(systemName,q,history,conceptsFired=[],phase='tracking'){const now=Date.now();await this.pool.query(`insert into sag_trackers(system_name,ticker,market_title,event_ticker,series_ticker,price_history,concepts_fired,first_seen_ms,last_scan_ms,scan_count,trade_count,yes_bid_cents,yes_ask_cents,volume_24h,game_start_time_ms,game_clock_state,close_time_ms,live_status,phase) values($1,$2,$3,$4,$5,$6,$7,$8,$8,1,$9,$10,$11,$12,$13,$14,$15,$16,$17) on conflict(system_name,ticker) do update set market_title=excluded.market_title,event_ticker=excluded.event_ticker,series_ticker=excluded.series_ticker,price_history=excluded.price_history,concepts_fired=excluded.concepts_fired,last_scan_ms=excluded.last_scan_ms,scan_count=sag_trackers.scan_count+1,trade_count=excluded.trade_count,yes_bid_cents=excluded.yes_bid_cents,yes_ask_cents=excluded.yes_ask_cents,volume_24h=excluded.volume_24h,game_start_time_ms=excluded.game_start_time_ms,game_clock_state=excluded.game_clock_state,close_time_ms=excluded.close_time_ms,live_status=excluded.live_status,phase=excluded.phase`,[systemName,q.ticker,q.title,q.eventTicker,q.seriesTicker,JSON.stringify(history),JSON.stringify(conceptsFired),now,q.recentTrades||0,q.yesBid||0,q.yesAsk||0,q.volume24h||0,q.gameStartTimeMs||null,JSON.stringify(q.gameClockState||{}),q.closeTimeMs||null,q.liveStatus||q.status||null,phase]);}
  async trackers(systemName,limit=500){const r=await this.pool.query('select * from sag_trackers where system_name=$1 order by last_scan_ms desc limit $2',[systemName,limit]);return r.rows;}
  async trackerHistoryRows(systemName,limit=100){const lim=Math.max(1,Math.min(200,Math.floor(Number(limit)||100)));const r=await this.pool.query('select ticker,price_history,last_scan_ms from sag_trackers where system_name=$1 order by last_scan_ms desc limit $2',[String(systemName),lim]);return r.rows;}
  async trackerDashboardRows(systemName,limit=150){const lim=Math.max(1,Math.min(500,Math.floor(Number(limit)||150)));const r=await this.pool.query('select system_name,ticker,market_title,event_ticker,series_ticker,first_seen_ms,last_scan_ms,scan_count,trade_count,yes_bid_cents,yes_ask_cents,volume_24h,game_start_time_ms,close_time_ms,live_status,phase from sag_trackers where system_name=$1 order by last_scan_ms desc limit $2',[String(systemName),lim]);return r.rows;}
  async trackerSummary(systemName){const r=await this.pool.query(`select count(*)::int as tracked,count(*) filter(where phase='hot')::int as hot,count(*) filter(where phase='about_to_enter')::int as about_to_enter,count(*) filter(where phase='entered')::int as entered,count(*) filter(where phase='recovery')::int as recovery from sag_trackers where system_name=$1`,[String(systemName)]);const x=r.rows[0]||{};return{tracked:Number(x.tracked||0),hot:Number(x.hot||0),aboutToEnter:Number(x.about_to_enter||0),entered:Number(x.entered||0),recovery:Number(x.recovery||0)};}
  async deleteStaleTrackers(systemName,keepTickers=[]){if(!keepTickers.length){await this.pool.query('delete from sag_trackers where system_name=$1',[systemName]);return;}await this.pool.query('delete from sag_trackers where system_name=$1 and not (ticker = any($2::text[]))',[systemName,keepTickers]);}
  async clearTrackers(systemName){await this.pool.query('delete from sag_trackers where system_name=$1',[systemName]);}

  async gameClockStates(systemName,eventTickers=[]){
    const events=[...new Set((eventTickers||[]).map(String).filter(Boolean))];
    if(!events.length)return new Map();
    const r=await this.pool.query('select event_ticker,state,last_updated_ms from sag_game_clock_authority where system_name=$1 and event_ticker = any($2::text[])',[systemName,events]);
    return new Map(r.rows.map(x=>[x.event_ticker,x.state&&typeof x.state==='object'?x.state:{}]));
  }
  async upsertGameClockState(systemName,eventTicker,state){
    if(!eventTicker)return;
    await this.pool.query(`insert into sag_game_clock_authority(system_name,event_ticker,state,last_updated_ms) values($1,$2,$3,$4) on conflict(system_name,event_ticker) do update set state=excluded.state,last_updated_ms=excluded.last_updated_ms`,[systemName,eventTicker,state||{},Date.now()]);
  }
  async pruneGameClockStates(systemName,beforeMs){await this.pool.query('delete from sag_game_clock_authority where system_name=$1 and last_updated_ms<$2',[systemName,Number(beforeMs)||0]);}

  async createRecoveryObservation(o){await this.pool.query(`insert into sag_recovery_observations_v2(id,system_name,original_entry_id,ticker,concept_name,sport,entry_price_cents,exit_price_cents,drop_cents,game_minutes_at_entry,exit_at_ms,prices,trough_cents,rebound_cents,recovered,recovery_at_ms,time_to_recover_ms,tracking_complete,settled,final_result,updated_at_ms) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21) on conflict(id) do nothing`,[o.id,o.systemName,o.originalEntryId,o.ticker,o.conceptName,o.sport,o.entryPriceCents,o.exitPriceCents,o.dropCents,o.gameMinutesAtEntry||0,o.exitAtMs,JSON.stringify(o.prices||[]),o.troughCents,o.reboundCents||0,Boolean(o.recovered),o.recoveryAtMs||null,o.timeToRecoverMs||0,Boolean(o.trackingComplete),Boolean(o.settled),o.finalResult||null,o.updatedAtMs||Date.now()]);}
  async recoveryObservations(systemName,{complete=null,limit=5000}={}){const cond=complete===null?'':'and tracking_complete=$3';const args=complete===null?[systemName,limit]:[systemName,limit,complete];const r=await this.pool.query(`select * from sag_recovery_observations_v2 where system_name=$1 ${cond} order by updated_at_ms desc limit $2`,args);return r.rows;}
  async recoveryObservationByOriginalEntryId(systemName,originalEntryId){const r=await this.pool.query('select id,original_entry_id,tracking_complete,updated_at_ms from sag_recovery_observations_v2 where system_name=$1 and original_entry_id=$2 order by updated_at_ms desc limit 1',[systemName,originalEntryId]);return r.rows[0]||null;}
  async recoveryTrackingCount(systemName){const r=await this.pool.query('select count(*)::int as count from sag_recovery_observations_v2 where system_name=$1 and tracking_complete=false',[systemName]);return Number(r.rows[0]?.count||0);}
  async updateRecoveryObservation(id,patch){const col={prices:'prices',troughCents:'trough_cents',reboundCents:'rebound_cents',recovered:'recovered',recoveryAtMs:'recovery_at_ms',timeToRecoverMs:'time_to_recover_ms',trackingComplete:'tracking_complete',settled:'settled',finalResult:'final_result',updatedAtMs:'updated_at_ms'};const sets=[],vals=[];for(const[k,v]of Object.entries(patch))if(col[k]){vals.push(k==='prices'?JSON.stringify(v):v);sets.push(`${col[k]}=$${vals.length}`);}if(!sets.length)return;vals.push(id);await this.pool.query(`update sag_recovery_observations_v2 set ${sets.join(',')} where id=$${vals.length}`,vals);}
  async upsertPattern(p){await this.pool.query(`insert into sag_recovery_patterns(system_name,pattern_key,sport,entry_price_band,drop_bucket,game_minutes_bucket,trough_bucket,total_observations,recovered_count,recovery_rate,avg_trough_cents,avg_rebound_cents,avg_time_to_recover_ms,confidence_level,enabled,updated_at_ms) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,true,$15) on conflict(system_name,pattern_key) do update set total_observations=excluded.total_observations,recovered_count=excluded.recovered_count,recovery_rate=excluded.recovery_rate,avg_trough_cents=excluded.avg_trough_cents,avg_rebound_cents=excluded.avg_rebound_cents,avg_time_to_recover_ms=excluded.avg_time_to_recover_ms,confidence_level=excluded.confidence_level,updated_at_ms=excluded.updated_at_ms`,[p.systemName,p.patternKey,p.sport,p.entryBand,p.dropBucket,p.gameBucket,p.troughBucket,p.total,p.recovered,p.rate,p.avgTrough,p.avgRebound,p.avgTime,p.confidence,Date.now()]);}
  async patterns(systemName){const r=await this.pool.query('select * from sag_recovery_patterns where system_name=$1 order by total_observations desc,updated_at_ms desc',[systemName]);return r.rows;}

  async createStopGuardRecoveryEpisode(o){
    const key=[o.systemName,o.originalEntryId,o.triggerStage];
    const r=await this.pool.query(`insert into sag_stop_guard_recovery_v1(
      id,system_name,original_entry_id,trigger_stage,ticker,mode,concept_name,source_feeder,sport,entry_price_cents,trigger_price_cents,
      trigger_drop_cents,trigger_loss_cents,danger_line_cents,game_minutes_at_entry,crash_bucket,original_count,tracked_count,entry_fee_cents,base_realized_pnl_cents,trigger_at_ms,
      tracking_complete,recovered,recovery_at_ms,coverage_kind,state,updated_at_ms
    ) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27)
    on conflict(system_name,original_entry_id,trigger_stage) do nothing returning coverage_kind`,[
      o.id,o.systemName,o.originalEntryId,o.triggerStage,o.ticker,o.mode,o.conceptName,o.sourceFeeder||null,o.sport||'Unknown',
      Number(o.entryPriceCents||0),Number(o.triggerPriceCents||0),Number(o.triggerDropCents||0),Number(o.triggerLossCents||0),Number(o.dangerLineCents||0),
      Number(o.gameMinutesAtEntry||0),o.crashBucket||'UNKNOWN',Number(o.originalCount||0),Number(o.trackedCount||0),Number(o.entryFeeCents||0),Number(o.baseRealizedPnlCents||0),Number(o.triggerAtMs||Date.now()),
      Boolean(o.trackingComplete),Boolean(o.recovered),o.recoveryAtMs||null,o.coverageKind||'causal_from_trigger',o.state||{},Number(o.updatedAtMs||Date.now()),
    ]);
    if(r.rows?.[0])return r.rows[0];
    const existing=await this.pool.query('select coverage_kind from sag_stop_guard_recovery_v1 where system_name=$1 and original_entry_id=$2 and trigger_stage=$3',key);
    return existing.rows?.[0]||null;
  }
  async stopGuardRecoveryEpisodes(systemName,{complete=null,triggerStage=null,mode=null,ticker=null,coverageKind=null,limit=5000}={}){
    const where=['system_name=$1'];const args=[systemName];
    if(complete!==null){args.push(Boolean(complete));where.push(`tracking_complete=$${args.length}`);}
    if(triggerStage){args.push(String(triggerStage));where.push(`trigger_stage=$${args.length}`);}
    if(mode){args.push(String(mode));where.push(`mode=$${args.length}`);}
    if(ticker){args.push(String(ticker));where.push(`ticker=$${args.length}`);}
    if(coverageKind){args.push(String(coverageKind));where.push(`coverage_kind=$${args.length}`);}
    args.push(Math.max(1,Math.min(20000,Math.floor(Number(limit)||5000))));
    const r=await this.pool.query(`select * from sag_stop_guard_recovery_v1 where ${where.join(' and ')} order by updated_at_ms desc limit $${args.length}`,args);
    return r.rows;
  }
  async updateStopGuardRecoveryEpisode(id,patch){
    const col={trackingComplete:'tracking_complete',recovered:'recovered',recoveryAtMs:'recovery_at_ms',state:'state',updatedAtMs:'updated_at_ms'};
    const sets=[],vals=[];
    for(const[k,v]of Object.entries(patch||{}))if(col[k]){vals.push(v);sets.push(`${col[k]}=$${vals.length}`);}
    if(!sets.length)return;
    vals.push(id);await this.pool.query(`update sag_stop_guard_recovery_v1 set ${sets.join(',')} where id=$${vals.length}`,vals);
  }
  async stopGuardProfiles(systemName,{triggerStage=null,mode=null,profileKeys=null}={}){
    const where=['system_name=$1'];const args=[systemName];
    if(triggerStage){args.push(String(triggerStage));where.push(`trigger_stage=$${args.length}`);}
    if(mode){args.push(String(mode));where.push(`mode=$${args.length}`);}
    const keys=Array.isArray(profileKeys)?[...new Set(profileKeys.map(String).filter(Boolean))]:[];
    if(keys.length){args.push(keys);where.push(`profile_key = any($${args.length}::text[])`);}
    const r=await this.pool.query(`select * from sag_stop_guard_profiles_v1 where ${where.join(' and ')} order by total_observations desc,updated_at_ms desc`,args);
    return r.rows;
  }
  async stopGuardRecoverySummary(systemName,decisionMode='SIMULATION'){
    const r=await this.pool.query(`select
      count(*)::int as tracked,
      count(*) filter(where tracking_complete)::int as complete,
      count(*) filter(where tracking_complete and recovered)::int as recovered,
      count(*) filter(where coverage_kind='causal_from_trigger')::int as causal_from_trigger,
      count(*) filter(where coverage_kind='partial_from_upgrade')::int as partial_from_upgrade,
      count(*) filter(where mode=$2 and coverage_kind='causal_from_trigger' and tracking_complete)::int as decision_eligible_complete,
      count(*) filter(where mode=$2 and coverage_kind='causal_from_trigger' and tracking_complete and recovered)::int as decision_eligible_recovered
      from sag_stop_guard_recovery_v1 where system_name=$1`,[systemName,String(decisionMode)]);
    return r.rows[0]||{};
  }
  async replaceStopGuardProfiles(systemName,triggerStage,mode,profiles=[]){
    const client=await this.pool.connect();
    try{
      await client.query('begin');
      await client.query('delete from sag_stop_guard_profiles_v1 where system_name=$1 and trigger_stage=$2 and mode=$3',[systemName,triggerStage,mode]);
      for(const p of profiles){
        await client.query(`insert into sag_stop_guard_profiles_v1(
          system_name,trigger_stage,mode,profile_key,specificity,concept_name,source_feeder,sport,entry_band,drop_bucket,game_bucket,crash_bucket,
          total_observations,recovered_count,avg_time_to_recover_ms,confidence_level,updated_at_ms
        ) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,[
          systemName,triggerStage,mode,p.profileKey,p.specificity,p.conceptName||null,p.sourceFeeder||null,p.sport||null,p.entryBand||null,
          p.dropBucket||null,p.gameBucket||null,p.crashBucket||null,Number(p.totalObservations||0),Number(p.recoveredCount||0),
          Number(p.avgTimeToRecoverMs||0),p.confidenceLevel||'low',Number(p.updatedAtMs||Date.now()),
        ]);
      }
      await client.query('commit');
    }catch(e){await client.query('rollback').catch(()=>{});throw e;}finally{client.release();}
  }

  async crashMarketStates(systemName,{limit=5000}={}){
    const lim=Math.max(1,Math.min(10000,Math.floor(Number(limit)||5000)));
    const r=await this.pool.query('select system_name,ticker,event_ticker,market_title,sport,episode_count,state,updated_at_ms from sag_crash_market_state_v1 where system_name=$1 order by updated_at_ms desc limit $2',[systemName,lim]);
    return r.rows;
  }
  async upsertCrashMarketState(o){
    await this.runLowPriorityPersistence(()=>this.pool.query(`insert into sag_crash_market_state_v1(system_name,ticker,event_ticker,market_title,sport,episode_count,state,updated_at_ms) values($1,$2,$3,$4,$5,$6,$7,$8) on conflict(system_name,ticker) do update set event_ticker=excluded.event_ticker,market_title=excluded.market_title,sport=excluded.sport,episode_count=excluded.episode_count,state=excluded.state,updated_at_ms=excluded.updated_at_ms where excluded.updated_at_ms>=sag_crash_market_state_v1.updated_at_ms`,[o.systemName,o.ticker,o.eventTicker||null,o.marketTitle||'',o.sport||'Unknown',Number(o.episodeCount||0),o.state||{},Number(o.updatedAtMs||Date.now())]));
  }
  async upsertCrashEpisode(e){
    await this.runLowPriorityPersistence(()=>this.pool.query(`insert into sag_crash_episodes_v1(id,system_name,ticker,event_ticker,episode_index,sport,market_title,state,pre_crash_peak_cents,trough_cents,crash_depth_cents,crash_started_at_ms,trough_at_ms,rebound_confirmed_at_ms,reset_at_ms,stable_observations,upward_ticks,rebound_cents,reclaim_rate,final_result,updated_at_ms) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21) on conflict(id) do update set state=excluded.state,trough_cents=excluded.trough_cents,crash_depth_cents=excluded.crash_depth_cents,trough_at_ms=excluded.trough_at_ms,rebound_confirmed_at_ms=excluded.rebound_confirmed_at_ms,reset_at_ms=excluded.reset_at_ms,stable_observations=excluded.stable_observations,upward_ticks=excluded.upward_ticks,rebound_cents=excluded.rebound_cents,reclaim_rate=excluded.reclaim_rate,final_result=excluded.final_result,updated_at_ms=excluded.updated_at_ms where excluded.updated_at_ms>=sag_crash_episodes_v1.updated_at_ms`,[e.id,e.systemName,e.ticker,e.eventTicker||null,Number(e.episodeIndex||0),e.sport||'Unknown',e.marketTitle||'',e.state||'CRASHING',Number(e.preCrashPeakCents||0),Number(e.troughCents||0),Number(e.crashDepthCents||0),Number(e.crashStartedAtMs||0),Number(e.troughAtMs||0),e.reboundConfirmedAtMs||null,e.resetAtMs||null,Number(e.stableObservations||0),Number(e.upwardTicks||0),Number(e.reboundCents||0),Number(e.reclaimRate||0),e.finalResult||null,Number(e.updatedAtMs||Date.now())]));
  }
  async crashEpisodes(systemName,{limit=500,ticker=null}={}){
    const lim=Math.max(1,Math.min(5000,Math.floor(Number(limit)||500)));
    if(ticker){const r=await this.pool.query('select * from sag_crash_episodes_v1 where system_name=$1 and ticker=$2 order by episode_index desc,updated_at_ms desc limit $3',[systemName,ticker,lim]);return r.rows;}
    const r=await this.pool.query('select * from sag_crash_episodes_v1 where system_name=$1 order by updated_at_ms desc limit $2',[systemName,lim]);return r.rows;
  }
  async crashSurvivalHistory(systemName,{limit=5000,ticker=null}={}){
    const lim=Math.max(1,Math.min(5000,Math.floor(Number(limit)||5000)));
    const fields="ticker,sport,crash_depth_cents,episode_index,final_result,dragon_signal->>'signalAskCents' as signal_ask_cents";
    if(ticker){
      const r=await this.pool.query(`select ${fields} from sag_crash_episodes_v1 where system_name=$1 and ticker=$2 and lower(coalesce(final_result,'')) in ('yes','no') order by updated_at_ms desc limit $3`,[String(systemName),String(ticker),lim]);
      return r.rows;
    }
    const r=await this.pool.query(`select ${fields} from sag_crash_episodes_v1 where system_name=$1 and lower(coalesce(final_result,'')) in ('yes','no') order by updated_at_ms desc limit $2`,[String(systemName),lim]);
    return r.rows;
  }
  async finalizeCrashEpisodes(systemName,ticker,finalResult,updatedAtMs=Date.now()){
    await this.pool.query('update sag_crash_episodes_v1 set final_result=$3,updated_at_ms=greatest(updated_at_ms,$4) where system_name=$1 and ticker=$2',[systemName,ticker,finalResult||null,Number(updatedAtMs||Date.now())]);
  }
  async markCrashEpisodeDragonSignal(systemName,episodeId,signal,updatedAtMs=Date.now()){
    await this.pool.query('update sag_crash_episodes_v1 set dragon_signal=$3,updated_at_ms=greatest(updated_at_ms,$4) where system_name=$1 and id=$2',[systemName,episodeId,signal||{},Number(updatedAtMs||Date.now())]);
  }
  async clearCrashMarketStates(systemName){await this.pool.query('delete from sag_crash_market_state_v1 where system_name=$1',[systemName]);}

  async seedSportProfiles(rows){for(const p of rows)await this.pool.query(`insert into sag_sport_profiles_v2(ticker_prefix,detected_sport_name,typical_duration_ms,min_game_minutes_for_hunter,observation_count,confidence_level,source,observed_durations,updated_at_ms) values($1,$2,$3,$4,0,'high','manual','[]'::jsonb,$5) on conflict(ticker_prefix) do nothing`,[p.prefix,p.sportName,p.typicalDurationMs,p.minMinutes,Date.now()]);}
  async ensureSportProfile(p){await this.pool.query(`insert into sag_sport_profiles_v2(ticker_prefix,detected_sport_name,typical_duration_ms,min_game_minutes_for_hunter,observation_count,confidence_level,source,observed_durations,updated_at_ms) values($1,$2,$3,$4,0,$5,$6,'[]'::jsonb,$7) on conflict(ticker_prefix) do nothing`,[p.prefix,p.sportName,p.typicalDurationMs,p.minMinutes,p.confidence||'low',p.source||'deterministic',Date.now()]);}
  async sportProfile(prefix){const r=await this.pool.query('select * from sag_sport_profiles_v2 where ticker_prefix=$1',[prefix]);return r.rows[0]||null;}
  async sportProfiles(){const r=await this.pool.query('select * from sag_sport_profiles_v2 order by detected_sport_name,ticker_prefix');return r.rows;}
  async recordSportDuration(prefix,durationMs){const p=await this.sportProfile(prefix);if(!p)return false;let ds=Array.isArray(p.observed_durations)?p.observed_durations:[];ds=[...ds.map(Number).filter(Number.isFinite),Math.round(durationMs)].slice(-50).sort((a,b)=>a-b);const count=n(p.observation_count)+1;const median=ds.length?ds[Math.floor(ds.length/2)]:n(p.typical_duration_ms);const confidence=count>=15?'high':count>=5?'medium':p.confidence_level;const isManual=p.source==='manual';await this.pool.query('update sag_sport_profiles_v2 set observation_count=$2,observed_durations=$3,typical_duration_ms=$4,min_game_minutes_for_hunter=$5,confidence_level=$6,updated_at_ms=$7 where ticker_prefix=$1',[prefix,count,JSON.stringify(ds),isManual?n(p.typical_duration_ms):median,isManual?n(p.min_game_minutes_for_hunter):Math.max(10,Math.round(median/60000*0.25)),confidence,Date.now()]);return true;}
  async recordSportDurationOnce(systemName,ticker,prefix,durationMs){
    const client=await this.pool.connect();
    try{
      await client.query('begin');
      const inserted=await client.query('insert into sag_sport_duration_events_v1(system_name,ticker,ticker_prefix,duration_ms,recorded_at_ms) values($1,$2,$3,$4,$5) on conflict(system_name,ticker) do nothing returning ticker',[systemName,String(ticker||''),prefix,Math.round(Number(durationMs)||0),Date.now()]);
      if(!inserted.rowCount){await client.query('commit');return false;}
      const r=await client.query('select * from sag_sport_profiles_v2 where ticker_prefix=$1 for update',[prefix]);
      const p=r.rows[0];
      if(!p){await client.query('rollback');return false;}
      let ds=Array.isArray(p.observed_durations)?p.observed_durations:[];ds=[...ds.map(Number).filter(Number.isFinite),Math.round(durationMs)].slice(-50).sort((a,b)=>a-b);
      const count=n(p.observation_count)+1;const median=ds.length?ds[Math.floor(ds.length/2)]:n(p.typical_duration_ms);const confidence=count>=15?'high':count>=5?'medium':p.confidence_level;const isManual=p.source==='manual';
      await client.query('update sag_sport_profiles_v2 set observation_count=$2,observed_durations=$3,typical_duration_ms=$4,min_game_minutes_for_hunter=$5,confidence_level=$6,updated_at_ms=$7 where ticker_prefix=$1',[prefix,count,JSON.stringify(ds),isManual?n(p.typical_duration_ms):median,isManual?n(p.min_game_minutes_for_hunter):Math.max(10,Math.round(median/60000*0.25)),confidence,Date.now()]);
      await client.query('commit');return true;
    }catch(e){await client.query('rollback').catch(()=>{});throw e;}finally{client.release();}
  }

  async upsertProfitEpisode(e){
    await this.pool.query(`insert into sag_profit_episodes_v1(id,system_name,ticker,event_ticker,concept_name,source_feeder,sport,entry_price_cents,original_count,opened_at_ms,closed_at_ms,tracking_complete,state,updated_at_ms)
      values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
      on conflict(id) do update set event_ticker=excluded.event_ticker,concept_name=excluded.concept_name,source_feeder=excluded.source_feeder,sport=excluded.sport,
      entry_price_cents=excluded.entry_price_cents,original_count=excluded.original_count,opened_at_ms=excluded.opened_at_ms,closed_at_ms=excluded.closed_at_ms,
      tracking_complete=excluded.tracking_complete,state=excluded.state,updated_at_ms=excluded.updated_at_ms
      where excluded.updated_at_ms>=sag_profit_episodes_v1.updated_at_ms`,[
      e.id,e.systemName,e.ticker,e.eventTicker||null,e.conceptName,e.sourceFeeder||null,e.sport||'Unknown',Math.round(Number(e.entryPriceCents||0)),Number(e.originalCount||0),
      Number(e.openedAtMs||0),e.closedAtMs==null?null:Number(e.closedAtMs),Boolean(e.trackingComplete),e.state||{},Number(e.updatedAtMs||Date.now()),
    ]);
  }
  async profitEpisode(id){const r=await this.pool.query('select * from sag_profit_episodes_v1 where id=$1',[id]);return r.rows[0]||null;}
  async profitEpisodes(systemName,{complete=null,limit=5000}={}){
    const lim=Math.max(1,Math.min(10000,Math.floor(Number(limit)||5000)));
    if(complete===null){const r=await this.pool.query('select * from sag_profit_episodes_v1 where system_name=$1 order by updated_at_ms desc limit $2',[systemName,lim]);return r.rows;}
    const r=await this.pool.query('select * from sag_profit_episodes_v1 where system_name=$1 and tracking_complete=$2 order by updated_at_ms desc limit $3',[systemName,Boolean(complete),lim]);return r.rows;
  }
  async athenaEconomicProfitEpisodes(systemName,{limit=20000}={}){
    const lim=Math.max(1,Math.min(20_000,Math.floor(Number(limit)||20_000)));
    const r=await this.pool.query(`select id,entry_price_cents,
      state->>'originalCount' as original_count_state,
      state->>'actualRealizedNetCents' as actual_realized_net_cents,
      state->>'maxExecutableNetCents' as max_executable_net_cents,
      state->>'closeReason' as state_close_reason
      from sag_profit_episodes_v1 where system_name=$1 order by updated_at_ms desc limit $2`,[String(systemName),lim]);
    return r.rows.map((x)=>({id:x.id,entry_price_cents:x.entry_price_cents,original_count:x.original_count_state,state:{originalCount:x.original_count_state,actualRealizedNetCents:x.actual_realized_net_cents,maxExecutableNetCents:x.max_executable_net_cents,closeReason:x.state_close_reason||null}}));
  }
  async upsertProfitProfile(p){
    await this.pool.query(`insert into sag_profit_profiles_v1(system_name,profile_key,specificity,concept_name,source_feeder,sport,entry_band,total_observations,one_tick_pullbacks,one_tick_recoveries,collapse_count,avg_peak_capture_rate,avg_post_exit_regret_rate,recommended_retention_ratio,confidence_level,state,updated_at_ms)
      values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
      on conflict(system_name,profile_key) do update set specificity=excluded.specificity,concept_name=excluded.concept_name,source_feeder=excluded.source_feeder,sport=excluded.sport,entry_band=excluded.entry_band,
      total_observations=excluded.total_observations,one_tick_pullbacks=excluded.one_tick_pullbacks,one_tick_recoveries=excluded.one_tick_recoveries,collapse_count=excluded.collapse_count,
      avg_peak_capture_rate=excluded.avg_peak_capture_rate,avg_post_exit_regret_rate=excluded.avg_post_exit_regret_rate,recommended_retention_ratio=excluded.recommended_retention_ratio,
      confidence_level=excluded.confidence_level,state=excluded.state,updated_at_ms=excluded.updated_at_ms
      where excluded.updated_at_ms>=sag_profit_profiles_v1.updated_at_ms`,[
      p.systemName,p.profileKey,p.specificity,p.conceptName||null,p.sourceFeeder||null,p.sport||null,p.entryBand||null,Number(p.totalObservations||0),Number(p.oneTickPullbacks||0),
      Number(p.oneTickRecoveries||0),Number(p.collapseCount||0),Number(p.avgPeakCaptureRate||0),Number(p.avgPostExitRegretRate||0),Number(p.recommendedRetentionRatio||0),
      p.confidenceLevel||'low',p.state||{},Number(p.updatedAtMs||Date.now()),
    ]);
  }
  async profitProfiles(systemName){const r=await this.pool.query('select * from sag_profit_profiles_v1 where system_name=$1 order by total_observations desc,updated_at_ms desc',[systemName]);return r.rows;}
  async completedProfitEpisodeIds(systemName,{limit=1000}={}){const lim=Math.max(1,Math.min(5000,Math.floor(Number(limit)||1000)));const r=await this.pool.query('select id from sag_profit_episodes_v1 where system_name=$1 and tracking_complete=true order by updated_at_ms desc limit $2',[systemName,lim]);return r.rows.map(x=>String(x.id||'')).filter(Boolean);}

  // R34/ATHENA-B1 authoritative training readers intentionally have no arbitrary
  // 5k/10k LIMIT. Athena compiles the complete mature corpus once, reduces it
  // to bounded categorical profiles, persists the frozen brain, and never
  // rereads raw history on the decision path.
  async athenaCrashEpisodes(systemName){const r=await this.pool.query(`select id,ticker,event_ticker,episode_index,sport,crash_depth_cents,final_result,updated_at_ms from sag_crash_episodes_v1 where system_name=$1 and lower(coalesce(final_result,'')) in ('yes','no') order by ticker,updated_at_ms desc,id`,[systemName]);return r.rows;}
  async athenaCrashSignals(systemName){const r=await this.pool.query(`select e.id,e.ticker,e.event_ticker,e.market_title,e.concept_name,e.source_trade_id,e.entry_config,e.opened_at_ms,e.updated_at_ms,c.final_result from sag_entries e join sag_crash_episodes_v1 c on c.system_name=e.system_name and c.id=e.source_trade_id where e.system_name=$1 and e.concept_name in ('Dragon','Golden Dragon') and lower(coalesce(c.final_result,'')) in ('yes','no') order by e.opened_at_ms,e.id`,[systemName]);return r.rows;}
  async athenaRecoveryObservations(systemName){const r=await this.pool.query(`select id,original_entry_id,ticker,concept_name,sport,entry_price_cents,exit_price_cents,drop_cents,game_minutes_at_entry,recovered,time_to_recover_ms,tracking_complete,updated_at_ms from sag_recovery_observations_v2 where system_name=$1 and tracking_complete=true order by ticker,updated_at_ms desc,id`,[systemName]);return r.rows;}
  async athenaProfitEpisodes(systemName){const r=await this.pool.query(`select id,ticker,event_ticker,concept_name,source_feeder,sport,entry_price_cents,tracking_complete,state,updated_at_ms from sag_profit_episodes_v1 where system_name=$1 and tracking_complete=true order by ticker,updated_at_ms desc,id`,[systemName]);return r.rows;}
  async athenaBrain(systemName,version='ATHENA-B1'){const r=await this.pool.query('select * from sag_athena_brains_v1 where system_name=$1 and brain_version=$2 and active=true',[systemName,version]);return r.rows[0]||null;}
  async saveAthenaBrain(b){const now=Date.now();await this.pool.query(`insert into sag_athena_brains_v1(system_name,brain_version,brain_hash,source_release,training_cutoff_ms,brain,stats,active,created_at_ms,updated_at_ms) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$9) on conflict(system_name,brain_version) do update set brain_hash=excluded.brain_hash,source_release=excluded.source_release,training_cutoff_ms=excluded.training_cutoff_ms,brain=excluded.brain,stats=excluded.stats,active=excluded.active,updated_at_ms=excluded.updated_at_ms`,[b.systemName,b.version,b.brainHash,b.sourceRelease||'',Number(b.trainingCutoffMs||0),b.brain||{},b.stats||{},b.active!==false,now]);}

  async saveFeederSignalIntel(r){
    return this.saveFeederSignalIntelBatch([r]);
  }
  async saveFeederSignalIntelBatch(rows=[]){
    const payload=(Array.isArray(rows)?rows:[]).filter((r)=>r?.feederId).map((r)=>({
      feeder_id:String(r.feederId),system_name:String(r.systemName||''),concept_name:String(r.conceptName||''),ticker:String(r.ticker||''),
      event_ticker:r.eventTicker==null?null:String(r.eventTicker),source_episode_id:r.sourceEpisodeId==null?null:String(r.sourceEpisodeId),
      signal_at_ms:Number(r.signalAtMs||0),coverage_started_at_ms:Number(r.coverageStartedAtMs||r.signalAtMs||Date.now()),state:r.state||{},updated_at_ms:Number(r.updatedAtMs||Date.now()),
    }));
    if(!payload.length)return false;
    // Bound both record count (upstream) and serialized SQL payload size. A
    // mature FSI state can contain hundreds of compact observations, so a
    // count-only batch could otherwise create a multi-megabyte transient JSON
    // allocation and a single oversized PostgreSQL parameter.
    const chunks=[];let current=[],bytes=2;
    for(const row of payload){
      const encoded=JSON.stringify(row),rowBytes=Buffer.byteLength(encoded,'utf8')+(current.length?1:0);
      if(current.length&&bytes+rowBytes>LOW_PRIORITY_DB_PERSISTENCE.maximumBatchBytes){chunks.push(current);current=[];bytes=2;}
      current.push(encoded);bytes+=Buffer.byteLength(encoded,'utf8')+(current.length>1?1:0);
    }
    if(current.length)chunks.push(current);
    const sql=`insert into sag_feeder_signal_intel_v1(feeder_id,system_name,concept_name,ticker,event_ticker,source_episode_id,signal_at_ms,coverage_started_at_ms,state,updated_at_ms)
      select x.feeder_id,x.system_name,x.concept_name,x.ticker,x.event_ticker,x.source_episode_id,x.signal_at_ms,x.coverage_started_at_ms,x.state,x.updated_at_ms
      from jsonb_to_recordset($1::jsonb) as x(feeder_id text,system_name text,concept_name text,ticker text,event_ticker text,source_episode_id text,signal_at_ms bigint,coverage_started_at_ms bigint,state jsonb,updated_at_ms bigint)
      on conflict(feeder_id) do update set concept_name=excluded.concept_name,ticker=excluded.ticker,event_ticker=excluded.event_ticker,source_episode_id=excluded.source_episode_id,
      signal_at_ms=excluded.signal_at_ms,coverage_started_at_ms=least(sag_feeder_signal_intel_v1.coverage_started_at_ms,excluded.coverage_started_at_ms),state=excluded.state,updated_at_ms=excluded.updated_at_ms
      where excluded.updated_at_ms>=sag_feeder_signal_intel_v1.updated_at_ms`;
    for(const chunk of chunks){const payloadJson=`[${chunk.join(',')}]`;await this.runLowPriorityPersistence(()=>this.pool.query(sql,[payloadJson]));}
    return true;
  }
  async feederSignalIntel(systemName,{limit=5000,trackingComplete=null,stripObservations=false}={}){
    const lim=Math.max(1,Math.min(20000,Math.floor(Number(limit)||5000)));
    const completion=trackingComplete===true?" and state->>'trackingComplete'='true'":trackingComplete===false?" and coalesce(state->>'trackingComplete','false')<>'true'":'';
    const stateExpr=stripObservations?"state - 'observations' as state":'state';
    const r=await this.pool.query(`select feeder_id,system_name,concept_name,ticker,event_ticker,source_episode_id,signal_at_ms,coverage_started_at_ms,${stateExpr},updated_at_ms from sag_feeder_signal_intel_v1 where system_name=$1${completion} order by signal_at_ms desc limit $2`,[systemName,lim]);
    return r.rows;
  }

  async insertSnapshot(s){await this.pool.query(`insert into sag_snapshots(system_name,created_at_ms,portfolio_value_cents,realized_pnl_cents,unrealized_pnl_cents,hunter_realized_pnl_cents,hunter_unrealized_pnl_cents,feeder_realized_pnl_cents,feeder_unrealized_pnl_cents,win_rate,open_count,closed_count) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,[s.systemName,s.createdAtMs,s.portfolioValueCents,s.realizedPnlCents,s.unrealizedPnlCents,s.hunterRealizedPnlCents,s.hunterUnrealizedPnlCents,s.feederRealizedPnlCents,s.feederUnrealizedPnlCents,s.winRate,s.openCount,s.closedCount]);await this.pool.query('delete from sag_snapshots where id in (select id from sag_snapshots where system_name=$1 order by created_at_ms desc offset 2500)',[s.systemName]);}
  async snapshots(systemName,limit=500){const r=await this.pool.query('select * from sag_snapshots where system_name=$1 order by created_at_ms desc limit $2',[systemName,limit]);return r.rows.reverse();}
  async recordAtomicThunderEvent({eventKey,systemName,hunterId,ticker,eventType,atMs=Date.now(),data={}}={}){
    if(!eventKey||!systemName||!hunterId||!ticker||!eventType)return false;
    const r=await this.pool.query(`insert into sag_atomic_thunder_events_v1(event_key,system_name,hunter_id,ticker,event_type,at_ms,data) values($1,$2,$3,$4,$5,$6,$7) on conflict(event_key) do nothing returning id`,[String(eventKey),String(systemName),String(hunterId),String(ticker),String(eventType),Number(atMs)||Date.now(),data||{}]);
    return r.rowCount>0;
  }
  async atomicThunderStats(systemName){
    // HF5 observability reads are intentionally sequential inside this composite
    // so one dashboard snapshot cannot secretly exceed the state fan-out budget.
    const events=await this.pool.query(`select event_type,count(*)::int as count,max(at_ms)::bigint as last_at_ms from sag_atomic_thunder_events_v1 where system_name=$1 group by event_type`,[systemName]);
    const harvests=await this.pool.query(`select e.id,e.pnl_cents,e.opened_at_ms,e.closed_at_ms,p.state from sag_entries e left join sag_profit_episodes_v1 p on p.id=e.id where e.system_name=$1 and e.archived=false and e.status='closed' and e.close_reason='atomic_thunder_cashout' order by e.closed_at_ms desc`,[systemName]);
    const recent=await this.pool.query(`select hunter_id,ticker,event_type,at_ms,data from sag_atomic_thunder_events_v1 where system_name=$1 order by at_ms desc,id desc limit 30`,[systemName]);
    const byEvent=Object.fromEntries(events.rows.map((r)=>[r.event_type,{count:Number(r.count||0),lastAtMs:Number(r.last_at_ms||0)}]));
    let realizedPnlCents=0,totalTimeMs=0,avoidedLossCents=0,forgoneUpsideCents=0,lossesAvoided=0,researchComplete=0;
    for(const row of harvests.rows){
      const actual=Number(row.pnl_cents||0);realizedPnlCents+=actual;totalTimeMs+=Math.max(0,Number(row.closed_at_ms||0)-Number(row.opened_at_ms||0));
      const st=row.state&&typeof row.state==='object'?row.state:{};
      const finiteOrNull=(value)=>value===null||value===undefined||value===''?null:(Number.isFinite(Number(value))?Number(value):null);
      const postMin=finiteOrNull(st.postExitMinExecutableNetCents);const terminal=finiteOrNull(st.terminalNetCents);
      const futureDown=[postMin,terminal].filter((v)=>v!==null);
      if(futureDown.length){const worst=Math.min(...futureDown);if(worst<actual){avoidedLossCents+=Math.max(0,actual-worst);if(worst<0)lossesAvoided+=1;}}
      const postMax=finiteOrNull(st.postExitMaxExecutableNetCents);const best=Math.max(0,...[postMax,terminal].filter((v)=>v!==null));
      forgoneUpsideCents+=Math.max(0,best-actual);
      if(st.trackingComplete===true)researchComplete+=1;
    }
    const harvestCount=harvests.rows.length;
    return {
      observedHunters:Number(byEvent.observing?.count||0),
      opportunitiesDetected:Number(byEvent.opportunity_detected?.count||0),
      harvestsExecuted:harvestCount,
      invalidOpportunitiesBlocked:Number(byEvent.invalid_opportunity_blocked?.count||0),
      confirmationResets:Number(byEvent.confirmation_reset?.count||0),
      realizedPnlCents,averageProfitCents:harvestCount?realizedPnlCents/harvestCount:0,
      averageTimeToHarvestMs:harvestCount?totalTimeMs/harvestCount:0,
      lossesAvoided,avoidedLossCents,forgoneUpsideCents,researchComplete,
      lastHarvestAtMs:Number(byEvent.harvest_executed?.lastAtMs||0)||null,
      recent:recent.rows.map((r)=>({hunterId:r.hunter_id,ticker:r.ticker,eventType:r.event_type,atMs:Number(r.at_ms||0),data:r.data||{}})),
    };
  }
  async audit(level,event,data={}){await this.pool.query('insert into sag_audit(level,event,data) values($1,$2,$3)',[level,event,data]);}
  async recentAudit(limit=100){const r=await this.pool.query('select id,ts,level,event,data from sag_audit order by id desc limit $1',[limit]);return r.rows;}
}
