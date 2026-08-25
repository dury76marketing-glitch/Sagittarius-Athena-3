export const GAME_CLOCK_AUTHORITY = Object.freeze({
  version: 'GCA2',
  legacyVersions: Object.freeze(['GCA1']),
  milestoneCacheMs: 30 * 60 * 1000,
  ambiguousMilestoneCacheMs: 30 * 1000,
  missingMilestoneCacheMs: 5 * 60 * 1000,
  liveDataCacheMs: 20 * 1000,
  gameStatsCacheMs: 30 * 1000,
  entryAuthorizationMaxAgeMs: 10 * 1000,
  maxConcurrency: 12,
});

const POSITIVE_STATUS = new Set([
  'live', 'inprogress', 'inplay', 'started', 'ongoing', 'playing',
  'halftime', 'intermission', 'overtime', 'extratime',
]);
const NEGATIVE_STATUS = new Set([
  'scheduled', 'pregame', 'prestart', 'notstarted', 'upcoming',
  'delayed', 'postponed', 'pending', 'warmup', 'paused', 'suspended',
]);
const FINAL_STATUS = new Set([
  'final', 'finished', 'complete', 'completed', 'ended', 'settled',
  'canceled', 'cancelled', 'abandoned', 'closed',
]);
const STATUS_KEYS = new Set([
  'status', 'state', 'phase', 'livestatus', 'gamestatus', 'matchstatus',
  'eventstatus', 'fixturestatus', 'gamestate', 'matchstate', 'eventstate',
]);
const LIVE_BOOLEAN_KEYS = new Set([
  'islive', 'inprogress', 'started', 'hasstarted', 'isstarted',
]);
// Flexible live-data JSON is intentionally constrained. Period/clock/player/team
// subtrees are NOT authoritative for whole-game lifecycle because a completed
// period or a live player state must never finalize/start the entire event.
const SAFE_CONTAINER_KEYS = new Set([
  'game', 'match', 'event', 'fixture', 'scoreboard', 'details',
]);

const TERMINAL_MARKET_STATUSES = new Set([
  'closed', 'determined', 'disputed', 'finalized', 'settled', 'amended',
]);

function ms(value) {
  if (value == null || value === '') return 0;
  if (Number.isFinite(Number(value)) && Number(value) > 100000000000) return Number(value);
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function token(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function cleanString(value, max = 160) {
  const s = String(value ?? '');
  return s.length > max ? s.slice(0, max) : s;
}

function stateBase(eventTicker, now) {
  return {
    version: GAME_CLOCK_AUTHORITY.version,
    eventTicker: String(eventTicker || ''),
    phase: 'UNKNOWN',
    confirmed: false,
    startTimeMs: null,
    source: null,
    sourceStrength: null,
    observedAtMs: null,
    // Proven start time is restart-safe provenance. Entry authorization is a
    // separate, short-lived permission and is never carried through an outage.
    entryAuthorized: false,
    evidenceObservedAtMs: null,
    authorizationReason: null,
    authorizationSource: null,
    lastCheckedAtMs: Number(now),
    milestoneId: null,
    milestoneType: null,
    milestoneStartMs: null,
    occurrenceTimeMs: null,
    occurrenceConflict: false,
    reason: 'no_authoritative_evidence',
    evidence: {},
  };
}

export function normalizeGameClockState(raw, eventTicker = '') {
  const version = String(raw?.version || '');
  if (!raw || typeof raw !== 'object' || (version !== GAME_CLOCK_AUTHORITY.version && !GAME_CLOCK_AUTHORITY.legacyVersions.includes(version))) return null;
  const phase = ['UNKNOWN', 'CONFIRMED', 'FINAL', 'CONFLICT'].includes(String(raw.phase)) ? String(raw.phase) : 'UNKNOWN';
  const start = Number(raw.startTimeMs || 0);
  const confirmed = phase === 'CONFIRMED' && raw.confirmed === true && Number.isFinite(start) && start > 0;
  const evidenceObservedAtMs = Number(raw.evidenceObservedAtMs || 0) || null;
  return {
    ...stateBase(raw.eventTicker || eventTicker, Number(raw.lastCheckedAtMs || Date.now())),
    ...raw,
    eventTicker: String(raw.eventTicker || eventTicker || ''),
    phase,
    confirmed,
    startTimeMs: Number.isFinite(start) && start > 0 ? start : null,
    observedAtMs: Number(raw.observedAtMs || 0) || null,
    entryAuthorized: Boolean(confirmed && raw.entryAuthorized === true && evidenceObservedAtMs),
    evidenceObservedAtMs,
    authorizationReason: raw.authorizationReason ? cleanString(raw.authorizationReason) : null,
    authorizationSource: raw.authorizationSource ? cleanString(raw.authorizationSource) : null,
    lastCheckedAtMs: Number(raw.lastCheckedAtMs || 0) || null,
    milestoneStartMs: Number(raw.milestoneStartMs || 0) || null,
    occurrenceTimeMs: Number(raw.occurrenceTimeMs || 0) || null,
    occurrenceConflict: Boolean(raw.occurrenceConflict),
    evidence: raw.evidence && typeof raw.evidence === 'object' ? raw.evidence : {},
  };
}

export function isConfirmedGameClockState(raw, expectedEventTicker = '') {
  const s = normalizeGameClockState(raw, expectedEventTicker);
  if (!(s?.confirmed && s.phase === 'CONFIRMED' && s.startTimeMs > 0)) return false;
  const expected = String(expectedEventTicker || '');
  return !expected || s.eventTicker === expected;
}

export function isEntryAuthorizedGameClockState(
  raw,
  expectedEventTicker = '',
  now = Date.now(),
  maxAgeMs = GAME_CLOCK_AUTHORITY.entryAuthorizationMaxAgeMs,
) {
  const s = normalizeGameClockState(raw, expectedEventTicker);
  if (!isConfirmedGameClockState(s, expectedEventTicker) || s.entryAuthorized !== true) return false;
  const observed = Number(s.evidenceObservedAtMs || 0);
  const t = Number(now);
  const maxAge = Math.max(0, Number(maxAgeMs) || 0);
  if (!Number.isFinite(observed) || observed <= 0 || !Number.isFinite(t) || t <= 0) return false;
  const age = t - observed;
  return age >= -2000 && age <= maxAge;
}

export function authoritativeClockSnapshot(raw, expectedEventTicker = '') {
  const s = normalizeGameClockState(raw, expectedEventTicker);
  if (!s || !isConfirmedGameClockState(s, expectedEventTicker)) return null;
  return {
    version: s.version,
    eventTicker: s.eventTicker,
    phase: 'CONFIRMED',
    confirmed: true,
    startTimeMs: s.startTimeMs,
    source: s.source,
    sourceStrength: s.sourceStrength,
    observedAtMs: s.observedAtMs,
    evidenceObservedAtMs: s.evidenceObservedAtMs,
    entryAuthorizedAtEntry: Boolean(s.entryAuthorized),
    authorizationSourceAtEntry: s.authorizationSource || null,
    milestoneId: s.milestoneId,
    milestoneType: s.milestoneType,
  };
}

function collectLiveSignals(value, out, path = 'details', depth = 0) {
  if (value == null || depth > 4 || out.length >= 32) return;
  if (Array.isArray(value)) {
    for (const item of value.slice(0, 12)) collectLiveSignals(item, out, path, depth + 1);
    return;
  }
  if (typeof value !== 'object') return;
  for (const [rawKey, child] of Object.entries(value)) {
    if (out.length >= 32) break;
    const key = token(rawKey);
    const childPath = `${path}.${cleanString(rawKey, 40)}`;
    if (LIVE_BOOLEAN_KEYS.has(key) && typeof child === 'boolean') {
      out.push({ kind: child ? 'positive' : 'negative', path: childPath, value: child });
      continue;
    }
    if (STATUS_KEYS.has(key) && (typeof child === 'string' || typeof child === 'number')) {
      const t = token(child);
      if (FINAL_STATUS.has(t)) out.push({ kind: 'final', path: childPath, value: cleanString(child) });
      else if (POSITIVE_STATUS.has(t)) out.push({ kind: 'positive', path: childPath, value: cleanString(child) });
      else if (NEGATIVE_STATUS.has(t)) out.push({ kind: 'negative', path: childPath, value: cleanString(child) });
      continue;
    }
    if (child && typeof child === 'object' && SAFE_CONTAINER_KEYS.has(key)) {
      collectLiveSignals(child, out, childPath, depth + 1);
    }
  }
}

export function classifyLiveData(liveData) {
  const details = liveData?.details && typeof liveData.details === 'object' && !Array.isArray(liveData.details)
    ? liveData.details
    : {};
  const signals = [];
  collectLiveSignals(details, signals);
  const kinds = new Set(signals.map((x) => x.kind));
  let classification = 'unknown';
  // Contradictory whole-event lifecycle evidence must never be collapsed into
  // FINAL merely because one subtree says "complete". FINAL is sticky, so a
  // mixed final/live or final/pregame payload is a conflict and fails closed.
  if (kinds.has('final') && (kinds.has('positive') || kinds.has('negative'))) classification = 'conflict';
  else if (kinds.has('final')) classification = 'final';
  else if (kinds.has('positive') && kinds.has('negative')) classification = 'conflict';
  else if (kinds.has('positive')) classification = 'live';
  else if (kinds.has('negative')) classification = 'pregame';
  return {
    classification,
    type: cleanString(liveData?.type || ''),
    milestoneId: cleanString(liveData?.milestone_id || ''),
    signals: signals.slice(0, 12),
  };
}

export function countPbpEvents(gameStats) {
  const periods = gameStats?.pbp?.periods || gameStats?.game_stats?.pbp?.periods;
  if (!Array.isArray(periods)) return 0;
  let count = 0;
  for (const period of periods.slice(0, 64)) {
    if (!Array.isArray(period?.events)) continue;
    count += period.events.filter((e) => e && typeof e === 'object' && Object.keys(e).length > 0).length;
    if (count > 0) return count;
  }
  return count;
}

function atomicMilestoneType(type) {
  const t = token(type);
  if (!t) return false;
  if (t.includes('tournament') || t.includes('season') || t.includes('multileg') || t.includes('series')) return false;
  return t.includes('game') || t.includes('match');
}

export function selectEventMilestone(milestones, eventTicker) {
  const event = String(eventTicker || '');
  if (!event) return { milestone: null, reason: 'missing_event_ticker', candidates: 0 };
  const unique = new Map();
  for (const m of Array.isArray(milestones) ? milestones : []) {
    if (m?.id && !unique.has(String(m.id))) unique.set(String(m.id), m);
  }
  const scored = [];
  for (const m of unique.values()) {
    const category = token(m.category);
    if (category !== 'sports' && category !== 'esports') continue;
    if (!atomicMilestoneType(m.type)) continue;
    const primary = Array.isArray(m.primary_event_tickers) ? m.primary_event_tickers.map(String) : [];
    const related = Array.isArray(m.related_event_tickers) ? m.related_event_tickers.map(String) : [];
    const inPrimary = primary.includes(event);
    const inRelated = related.includes(event);
    if (!inPrimary && !inRelated) continue;
    let score = inPrimary ? 300 : 200;
    const t = token(m.type);
    if (t.includes('match')) score += 20;
    if (t.includes('game')) score += 20;
    if (primary.length === 1 && inPrimary) score += 10;
    scored.push({ milestone: m, score });
  }
  scored.sort((a, b) => b.score - a.score || String(a.milestone.id).localeCompare(String(b.milestone.id)));
  if (!scored.length) return { milestone: null, reason: 'no_atomic_event_milestone', candidates: 0 };
  const best = scored[0];
  const tied = scored.filter((x) => x.score === best.score);
  if (tied.length > 1) {
    return {
      milestone: null,
      reason: 'ambiguous_atomic_milestone',
      candidates: tied.length,
      candidateIds: tied.map((x) => String(x.milestone.id)).slice(0, 8),
    };
  }
  return { milestone: best.milestone, reason: 'selected', candidates: scored.length };
}

function marketTerminal(quotes = []) {
  return quotes.some((q) => Boolean(q?.result) || TERMINAL_MARKET_STATUSES.has(String(q?.status || '').toLowerCase()));
}

function broadLive(quotes = []) {
  return quotes.some((q) => String(q?.liveStatus || '').toLowerCase() === 'live');
}

// The R14 occurrence fallback may establish conservative start provenance from
// the broad discovery classifier, but new exposure needs stronger CURRENT
// evidence. Only a freshly queried exact-market recent-trade observation can
// authorize the fallback at execution time. This prevents stale scan activity
// from being relabeled as fresh just because the clock resolver ran now.
function freshTradeActivity(quotes = [], now = Date.now(), maxAgeMs = GAME_CLOCK_AUTHORITY.entryAuthorizationMaxAgeMs) {
  const t = Number(now);
  return quotes.some((q) => {
    if (String(q?.liveStatus || '').toLowerCase() !== 'live') return false;
    if (Number(q?.recentTrades || 0) < 3) return false;
    const observed = Number(q?.recentTradesObservedAtMs || 0);
    if (!Number.isFinite(observed) || observed <= 0 || !Number.isFinite(t)) return false;
    const age = t - observed;
    return age >= -2000 && age <= Math.max(0, Number(maxAgeMs) || 0);
  });
}

function coherentOccurrence(quotes = []) {
  const values = [...new Set(quotes.map((q) => Number(q?.occurrenceTimeMs || 0)).filter((x) => Number.isFinite(x) && x > 0))];
  if (!values.length) return { value: 0, coherent: true, values: [] };
  const min = Math.min(...values);
  const max = Math.max(...values);
  return { value: min, coherent: max - min <= 5 * 60 * 1000, values };
}

function makeUnknown(eventTicker, now, reason, extra = {}) {
  return {
    ...stateBase(eventTicker, now),
    reason,
    ...extra,
    phase: 'UNKNOWN',
    confirmed: false,
    startTimeMs: null,
    entryAuthorized: false,
  };
}

function makeConfirmed(eventTicker, now, startTimeMs, source, extra = {}) {
  const evidenceObservedAtMs = Number(extra.evidenceObservedAtMs || now);
  return {
    ...stateBase(eventTicker, now),
    ...extra,
    phase: 'CONFIRMED',
    confirmed: true,
    startTimeMs: Number(startTimeMs),
    source,
    sourceStrength: source === 'occurrence_passed' ? 'fallback' : 'strong',
    observedAtMs: Number(extra.observedAtMs || now),
    entryAuthorized: extra.entryAuthorized !== false,
    evidenceObservedAtMs: extra.entryAuthorized === false ? null : (Number.isFinite(evidenceObservedAtMs) && evidenceObservedAtMs > 0 ? evidenceObservedAtMs : null),
    authorizationReason: extra.entryAuthorized === false ? null : (extra.authorizationReason || `fresh_${source}`),
    authorizationSource: extra.entryAuthorized === false ? null : (extra.authorizationSource || source),
    lastCheckedAtMs: Number(now),
    reason: extra.reason || source,
  };
}

function makeTerminal(eventTicker, now, prior, reason, extra = {}) {
  return {
    ...stateBase(eventTicker, now),
    ...extra,
    phase: 'FINAL',
    confirmed: false,
    startTimeMs: Number(prior?.startTimeMs || 0) || null,
    source: prior?.source || extra.source || null,
    sourceStrength: prior?.sourceStrength || extra.sourceStrength || null,
    observedAtMs: prior?.observedAtMs || null,
    entryAuthorized: false,
    evidenceObservedAtMs: Number(extra.evidenceObservedAtMs || 0) || null,
    authorizationReason: null,
    authorizationSource: null,
    reason,
  };
}

function makeConflict(eventTicker, now, prior, reason, extra = {}) {
  return {
    ...stateBase(eventTicker, now),
    ...extra,
    phase: 'CONFLICT',
    confirmed: false,
    startTimeMs: Number(prior?.startTimeMs || 0) || null,
    source: prior?.source || extra.source || null,
    sourceStrength: prior?.sourceStrength || extra.sourceStrength || null,
    observedAtMs: prior?.observedAtMs || null,
    entryAuthorized: false,
    evidenceObservedAtMs: Number(extra.evidenceObservedAtMs || 0) || null,
    authorizationReason: null,
    authorizationSource: null,
    reason,
  };
}

async function concurrentMap(items, limit, fn) {
  const out = new Array(items.length);
  let cursor = 0;
  const worker = async () => {
    while (true) {
      const i = cursor;
      cursor += 1;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length || 1) }, () => worker()));
  return out;
}

export class GameClockAuthority {
  constructor({ kalshi, audit = async () => {}, now = () => Date.now() } = {}) {
    this.kalshi = kalshi;
    this.audit = audit;
    this.now = now;
    this.milestoneCache = new Map();
    this.liveCache = new Map();
    this.statsCache = new Map();
  }

  async cached(cache, key, ttlMs, fn, { forceFresh = false } = {}) {
    const checkAtMs = Number(this.now());
    const hit = cache.get(key);
    if (!forceFresh && hit && checkAtMs - hit.observedAtMs <= ttlMs) {
      return { ...hit, fromCache: true };
    }
    let value = null;
    let error = null;
    try { value = await fn(); } catch (e) { error = cleanString(e?.message || e, 240); }
    const observedAtMs = Number(this.now());
    const record = { value, error, observedAtMs, fromCache: false };
    cache.set(key, record);
    return record;
  }

  async milestoneForEvent(eventTicker, { seriesTicker = '', forceFresh = false } = {}) {
    const event = String(eventTicker || '');
    const series = String(seriesTicker || '');
    const cacheKey = `${event}|${series}`;
    const now = Number(this.now());
    const hit = this.milestoneCache.get(cacheKey);
    if (!forceFresh && hit) {
      let ttl = GAME_CLOCK_AUTHORITY.missingMilestoneCacheMs;
      if (hit.value?.milestone) ttl = GAME_CLOCK_AUTHORITY.milestoneCacheMs;
      else if (hit.value?.reason === 'ambiguous_atomic_milestone') ttl = GAME_CLOCK_AUTHORITY.ambiguousMilestoneCacheMs;
      if (now - hit.atMs <= ttl) return hit.value;
      this.milestoneCache.delete(cacheKey);
    }

    let direct = [];
    let directError = null;
    try { direct = await this.kalshi?.getMilestonesForEvent?.(event) || []; }
    catch (e) { directError = cleanString(e?.message || e, 240); }
    const directSelection = selectEventMilestone(direct, event);
    if (directSelection.milestone) {
      const value = { ...directSelection, discoverySource:'related_event_ticker', directError };
      this.milestoneCache.set(cacheKey, { atMs:Number(this.now()), value });
      return value;
    }

    let viaSeries = [];
    let seriesError = null;
    if (typeof this.kalshi?.getMilestonesForSeriesEvent === 'function') {
      try { viaSeries = await this.kalshi.getMilestonesForSeriesEvent(event, series) || []; }
      catch (e) { seriesError = cleanString(e?.message || e, 240); }
    }
    const merged = new Map();
    for (const m of [...direct, ...viaSeries]) if (m?.id) merged.set(String(m.id), m);
    const combinedSelection = selectEventMilestone([...merged.values()], event);
    let value = {
      ...combinedSelection,
      discoverySource: combinedSelection.milestone && viaSeries.some((m) => String(m?.id || '') === String(combinedSelection.milestone.id))
        ? 'series_events_with_milestones'
        : 'related_event_ticker',
      directReason: directSelection.reason,
      directError,
      seriesError,
    };
    if (!combinedSelection.milestone && directError && !viaSeries.length && seriesError) {
      value = { ...value, reason:'milestone_lookup_failed', error:`related=${directError}; series=${seriesError}` };
    }
    this.milestoneCache.set(cacheKey, { atMs:Number(this.now()), value });
    return value;
  }

  async liveForMilestone(id, { forceFresh = false } = {}) {
    return this.cached(
      this.liveCache,
      String(id),
      GAME_CLOCK_AUTHORITY.liveDataCacheMs,
      async () => this.kalshi?.getLiveData?.(id),
      { forceFresh },
    );
  }

  async statsForMilestone(id, { forceFresh = false } = {}) {
    return this.cached(
      this.statsCache,
      String(id),
      GAME_CLOCK_AUTHORITY.gameStatsCacheMs,
      async () => this.kalshi?.getGameStats?.(id),
      { forceFresh },
    );
  }

  async resolveEvent({
    eventTicker,
    quotes = [],
    priorState = null,
    now = this.now(),
    allowGameStats = true,
    forceFresh = false,
  } = {}) {
    const event = String(eventTicker || quotes[0]?.eventTicker || quotes[0]?.ticker || '');
    const seriesTicker = String(quotes.find((q) => q?.seriesTicker)?.seriesTicker || '');
    const prior = normalizeGameClockState(priorState, event);
    const occurrence = coherentOccurrence(quotes);
    const occurrenceTimeMs = occurrence.value || null;
    const decisionNow = () => Math.max(Number(now) || 0, Number(this.now()) || 0);

    if (marketTerminal(quotes)) {
      return makeTerminal(event, decisionNow(), prior, 'market_terminal', { occurrenceTimeMs });
    }
    // FINAL is terminal for new-exposure authority. A transient downstream API
    // recovery can never reopen a real-world event that we already proved ended.
    if (prior?.phase === 'FINAL') {
      return {
        ...prior,
        entryAuthorized: false,
        evidenceObservedAtMs: null,
        authorizationReason: null,
        authorizationSource: null,
        lastCheckedAtMs: decisionNow(),
        occurrenceTimeMs: occurrenceTimeMs || prior.occurrenceTimeMs || null,
        reason: 'persisted_final_retained',
      };
    }

    let milestoneSelection = null;
    let milestone = null;
    let liveClass = null;
    let liveError = null;
    let liveIdentityProblem = null;
    let pbpCount = 0;
    let statsError = null;
    try {
      milestoneSelection = await this.milestoneForEvent(event, { seriesTicker, forceFresh });
      milestone = milestoneSelection?.milestone || null;
    } catch {
      milestoneSelection = { milestone: null, reason: 'milestone_lookup_failed', candidates: 0 };
    }

    const milestoneMeta = milestone ? {
      milestoneId: String(milestone.id),
      milestoneType: cleanString(milestone.type || ''),
      // Metadata only. Never a Hunter start-authority source.
      milestoneStartMs: ms(milestone.start_date) || null,
      milestoneEndMs: ms(milestone.end_date) || null,
      milestoneDiscoverySource: milestoneSelection?.discoverySource || null,
    } : { milestoneDiscoverySource: milestoneSelection?.discoverySource || null };

    if (milestone) {
      const liveRecord = await this.liveForMilestone(milestone.id, { forceFresh });
      liveError = liveRecord.error || null;
      const rawLive = liveRecord.value;
      const liveData = rawLive?.live_data || rawLive;
      liveClass = classifyLiveData(liveData);
      const liveObservedAtMs = Number(liveRecord.observedAtMs || decisionNow());
      const expectedMilestoneId = String(milestone.id);
      if (liveClass.milestoneId && liveClass.milestoneId !== expectedMilestoneId) {
        return makeConflict(event, decisionNow(), prior, 'official_live_data_milestone_mismatch', {
          ...milestoneMeta,
          occurrenceTimeMs,
          evidenceObservedAtMs: liveObservedAtMs,
          evidence: {
            liveData: liveClass,
            expectedMilestoneId,
            receivedMilestoneId: liveClass.milestoneId,
          },
        });
      }
      if (liveClass.classification !== 'unknown' && !liveClass.milestoneId) {
        liveIdentityProblem = 'missing_milestone_id';
      }
      const liveIdentityValid = liveClass.milestoneId === expectedMilestoneId;

      if (liveIdentityValid && liveClass.classification === 'final') {
        return makeTerminal(event, decisionNow(), prior, 'official_live_data_final', {
          ...milestoneMeta,
          occurrenceTimeMs,
          evidenceObservedAtMs: liveObservedAtMs,
          evidence: { liveData: liveClass },
        });
      }
      if (liveIdentityValid && liveClass.classification === 'pregame') {
        if (prior?.confirmed) {
          return makeConflict(event, decisionNow(), prior, 'official_pregame_after_confirmed_start', {
            ...milestoneMeta,
            occurrenceTimeMs,
            evidenceObservedAtMs: liveObservedAtMs,
            evidence: { liveData: liveClass },
          });
        }
        return makeUnknown(event, decisionNow(), 'official_live_data_pregame', {
          ...milestoneMeta,
          occurrenceTimeMs,
          evidenceObservedAtMs: liveObservedAtMs,
          evidence: { liveData: liveClass },
        });
      }
      if (liveIdentityValid && liveClass.classification === 'conflict') {
        return makeConflict(event, decisionNow(), prior, 'official_live_data_conflict', {
          ...milestoneMeta,
          occurrenceTimeMs,
          evidenceObservedAtMs: liveObservedAtMs,
          evidence: { liveData: liveClass },
        });
      }
      if (liveIdentityValid && liveClass.classification === 'live') {
        const observedNow = Math.max(liveObservedAtMs, decisionNow());
        const start = prior?.confirmed ? prior.startTimeMs : observedNow;
        return makeConfirmed(event, observedNow, start, 'kalshi_live_data', {
          ...milestoneMeta,
          occurrenceTimeMs,
          occurrenceConflict: Boolean(!occurrence.coherent || (occurrenceTimeMs && occurrenceTimeMs > observedNow)),
          observedAtMs: prior?.confirmed ? prior.observedAtMs : observedNow,
          evidenceObservedAtMs: observedNow,
          authorizationReason: 'fresh_exact_milestone_live_data',
          authorizationSource: 'kalshi_live_data',
          reason: occurrenceTimeMs && occurrenceTimeMs > observedNow
            ? 'official_live_overrides_future_occurrence'
            : 'official_live_in_progress',
          evidence: { liveData: liveClass, forceFresh: Boolean(forceFresh) },
        });
      }

      const statsRecord = allowGameStats
        ? await this.statsForMilestone(milestone.id, { forceFresh })
        : null;
      statsError = statsRecord?.error || null;
      pbpCount = countPbpEvents(statsRecord?.value);
      if (pbpCount > 0 && prior?.phase !== 'CONFLICT') {
        const observedNow = Math.max(Number(statsRecord?.observedAtMs || 0), decisionNow());
        const start = prior?.confirmed ? prior.startTimeMs : observedNow;
        const freshExactTrade = freshTradeActivity(quotes, observedNow);
        const occurrenceWindowCurrent = Boolean(occurrence.coherent && occurrenceTimeMs && occurrenceTimeMs <= observedNow);
        const milestoneStartMs = Number(milestoneMeta.milestoneStartMs || 0);
        const milestoneEndMs = Number(milestoneMeta.milestoneEndMs || 0);
        const officialMilestoneWindowCurrent = Boolean(
          milestoneStartMs > 0 && milestoneStartMs <= observedNow
          && milestoneEndMs > observedNow,
        );
        const fallbackAuthorized = Boolean(freshExactTrade && (occurrenceWindowCurrent || officialMilestoneWindowCurrent));
        // PBP proves that play has occurred, but historical PBP may remain after
        // a game ends. GCA2 therefore authorizes new exposure only when PBP is
        // paired with a CURRENT exact-ticker trade probe and an official current
        // event window (milestone start/end) or the legacy occurrence-passed
        // window. A future/session-like occurrence can no longer veto a current
        // official milestone window, while PBP alone still never authorizes.
        const authorizationSource = fallbackAuthorized
          ? (officialMilestoneWindowCurrent ? 'kalshi_game_stats_plus_exact_trade' : 'occurrence_passed_fresh_trade_activity')
          : null;
        return makeConfirmed(event, observedNow, start, prior?.source || 'kalshi_game_stats', {
          ...milestoneMeta,
          occurrenceTimeMs,
          occurrenceConflict: Boolean(!occurrence.coherent || (occurrenceTimeMs && occurrenceTimeMs > observedNow)),
          observedAtMs: prior?.confirmed ? prior.observedAtMs : observedNow,
          entryAuthorized: fallbackAuthorized,
          evidenceObservedAtMs: fallbackAuthorized ? observedNow : null,
          authorizationReason: fallbackAuthorized
            ? (officialMilestoneWindowCurrent ? 'official_pbp_plus_fresh_exact_trade_in_milestone_window' : 'fresh_occurrence_passed_plus_trade_activity_after_pbp')
            : null,
          authorizationSource,
          reason: fallbackAuthorized
            ? (officialMilestoneWindowCurrent ? 'official_pbp_current_window_authorized' : 'official_pbp_start_with_fresh_fallback_authorization')
            : 'official_pbp_start_provenance_only',
          evidence: {
            liveData: liveClass, pbpEventCount: pbpCount, forceFresh: Boolean(forceFresh),
            freshExactTrade, occurrenceWindowCurrent, officialMilestoneWindowCurrent,
          },
        });
      }
    }

    const currentNow = decisionNow();
    // The market occurrence field is known to be fallible. Disagreement
    // between sibling markets is therefore a conflict only when stronger
    // milestone evidence could not settle the question. Strong official live
    // data/PBP above is allowed to win, while the mismatch remains telemetry.
    if (!occurrence.coherent) {
      return makeConflict(event, currentNow, prior, 'sibling_occurrence_mismatch', {
        ...milestoneMeta,
        occurrenceTimeMs,
        evidence: {
          liveData: liveClass,
          liveError,
          liveIdentityProblem,
          pbpEventCount: pbpCount,
          statsError,
          milestoneReason: milestoneSelection?.reason || null,
          occurrenceTimes: occurrence.values.slice(0, 8),
        },
      });
    }

    // A CONFLICT cannot be cleared by the weaker occurrence/activity fallback
    // or by an API outage. Only explicit strong official evidence above may
    // resolve it; otherwise we keep failing closed across scans/restarts.
    if (prior?.phase === 'CONFLICT') {
      return {
        ...prior,
        entryAuthorized: false,
        evidenceObservedAtMs: null,
        authorizationReason: null,
        authorizationSource: null,
        lastCheckedAtMs: currentNow,
        occurrenceTimeMs: occurrenceTimeMs || prior.occurrenceTimeMs || null,
        milestoneId: milestoneMeta.milestoneId || prior.milestoneId || null,
        milestoneType: milestoneMeta.milestoneType || prior.milestoneType || null,
        milestoneStartMs: milestoneMeta.milestoneStartMs || prior.milestoneStartMs || null,
        evidence: {
          ...(prior.evidence || {}),
          currentLiveData: liveClass,
          liveError,
          liveIdentityProblem,
          statsError,
          milestoneReason: milestoneSelection?.reason || null,
          retainedConflictAcrossEvidenceGap: true,
        },
        reason: 'persisted_conflict_retained',
      };
    }

    if (prior?.confirmed) {
      if (prior.source === 'occurrence_passed' && occurrenceTimeMs && occurrenceTimeMs > currentNow) {
        return makeConflict(event, currentNow, prior, 'fallback_occurrence_moved_future', {
          ...milestoneMeta,
          occurrenceTimeMs,
          evidence: {
            liveData: liveClass,
            liveError,
            liveIdentityProblem,
            statsError,
            milestoneReason: milestoneSelection?.reason || null,
          },
        });
      }
      const freshFallback = Boolean(
        occurrenceTimeMs
        && occurrenceTimeMs <= currentNow
        && broadLive(quotes)
        && freshTradeActivity(quotes, currentNow),
      );
      if (freshFallback) {
        return makeConfirmed(event, currentNow, prior.startTimeMs, prior.source || 'occurrence_passed', {
          ...milestoneMeta,
          occurrenceTimeMs,
          occurrenceConflict: false,
          observedAtMs: prior.observedAtMs || prior.startTimeMs,
          evidenceObservedAtMs: currentNow,
          authorizationReason: 'fresh_occurrence_passed_plus_trade_activity',
          authorizationSource: 'occurrence_passed_fresh_trade_activity',
          reason: 'persisted_start_reauthorized_by_fresh_occurrence_activity',
          evidence: {
            ...(prior.evidence || {}),
            currentLiveData: liveClass,
            liveError,
            liveIdentityProblem,
            statsError,
            milestoneReason: milestoneSelection?.reason || null,
            freshTradeActivity: true,
          },
        });
      }
      // Persist the lower-bound start as provenance, but never persist permission
      // to create new exposure through an API/evidence gap. Pre-execution must
      // obtain fresh authorization again.
      return {
        ...prior,
        entryAuthorized: false,
        evidenceObservedAtMs: null,
        authorizationReason: null,
        authorizationSource: null,
        lastCheckedAtMs: currentNow,
        occurrenceTimeMs: occurrenceTimeMs || prior.occurrenceTimeMs || null,
        milestoneId: milestoneMeta.milestoneId || prior.milestoneId || null,
        milestoneType: milestoneMeta.milestoneType || prior.milestoneType || null,
        milestoneStartMs: milestoneMeta.milestoneStartMs || prior.milestoneStartMs || null,
        evidence: {
          ...(prior.evidence || {}),
          currentLiveData: liveClass,
          liveError,
          liveIdentityProblem,
          statsError,
          milestoneReason: milestoneSelection?.reason || null,
          retainedAcrossEvidenceGap: true,
        },
        reason: 'persisted_confirmed_start_retained',
      };
    }

    if (occurrenceTimeMs && occurrenceTimeMs <= currentNow && broadLive(quotes)) {
      const fallbackAuthorized = freshTradeActivity(quotes, currentNow);
      return makeConfirmed(event, currentNow, currentNow, 'occurrence_passed', {
        ...milestoneMeta,
        occurrenceTimeMs,
        entryAuthorized: fallbackAuthorized,
        evidenceObservedAtMs: fallbackAuthorized ? currentNow : null,
        authorizationReason: fallbackAuthorized ? 'fresh_occurrence_passed_plus_trade_activity' : null,
        authorizationSource: fallbackAuthorized ? 'occurrence_passed_fresh_trade_activity' : null,
        reason: fallbackAuthorized ? 'occurrence_passed_plus_fresh_trade_activity' : 'occurrence_passed_broad_live_provenance_only',
        evidence: {
          liveData: liveClass,
          liveError,
          liveIdentityProblem,
          statsError,
          milestoneReason: milestoneSelection?.reason || null,
          broadLive: true,
          freshTradeActivity: fallbackAuthorized,
        },
      });
    }

    let reason = !occurrenceTimeMs
      ? 'missing_occurrence_no_strong_live_evidence'
      : occurrenceTimeMs > currentNow && broadLive(quotes)
        ? 'activity_only_future_occurrence_blocked'
        : occurrenceTimeMs > currentNow
          ? 'future_occurrence_no_strong_live_evidence'
          : 'no_live_evidence_after_occurrence';
    if (liveIdentityProblem === 'missing_milestone_id') reason = 'live_data_identity_missing_no_other_authority';
    return makeUnknown(event, currentNow, reason, {
      ...milestoneMeta,
      occurrenceTimeMs,
      evidence: {
        liveData: liveClass,
        liveError,
        liveIdentityProblem,
        pbpEventCount: pbpCount,
        statsError,
        milestoneReason: milestoneSelection?.reason || null,
        milestoneError: milestoneSelection?.error || null,
        broadLive: broadLive(quotes),
      },
    });
  }

  async resolveBatch(quotes = [], priorStates = new Map(), now = this.now(), { gameStatsEventTickers = new Set() } = {}) {
    const groups = new Map();
    for (const q of quotes) {
      const event = String(q?.eventTicker || q?.ticker || '');
      if (!event) continue;
      if (!groups.has(event)) groups.set(event, []);
      groups.get(event).push(q);
    }
    const events = [...groups.entries()];
    const rows = await concurrentMap(events, GAME_CLOCK_AUTHORITY.maxConcurrency, async ([eventTicker, eventQuotes]) => {
      const prior = priorStates instanceof Map ? priorStates.get(eventTicker) : priorStates?.[eventTicker];
      const allowGameStats = gameStatsEventTickers instanceof Set && gameStatsEventTickers.has(eventTicker);
      const state = await this.resolveEvent({ eventTicker, quotes: eventQuotes, priorState: prior, now, allowGameStats });
      await this.auditTransition(eventTicker, prior, state, eventQuotes).catch(() => {});
      return [eventTicker, state];
    });
    return new Map(rows);
  }

  async auditTransition(eventTicker, priorRaw, nextRaw, quotes = []) {
    const prior = normalizeGameClockState(priorRaw, eventTicker);
    const next = normalizeGameClockState(nextRaw, eventTicker) || nextRaw;
    const meaningful = !prior
      || prior.phase !== next.phase
      || prior.source !== next.source
      || prior.reason !== next.reason
      || Boolean(prior.entryAuthorized) !== Boolean(next.entryAuthorized)
      || Boolean(prior.occurrenceConflict) !== Boolean(next.occurrenceConflict);
    if (!meaningful) return;
    const data = {
      eventTicker,
      tickers: quotes.map((q) => q.ticker).slice(0, 8),
      phase: next.phase,
      source: next.source,
      reason: next.reason,
      startTimeMs: next.startTimeMs,
      entryAuthorized: Boolean(next.entryAuthorized),
      evidenceObservedAtMs: next.evidenceObservedAtMs || null,
      occurrenceTimeMs: next.occurrenceTimeMs,
      occurrenceConflict: Boolean(next.occurrenceConflict),
      milestoneId: next.milestoneId,
      milestoneType: next.milestoneType,
      milestoneDiscoverySource: next.milestoneDiscoverySource || null,
      milestoneStartMs: next.milestoneStartMs || null,
      milestoneEndMs: next.milestoneEndMs || null,
      authorizationReason: next.authorizationReason || null,
      authorizationSource: next.authorizationSource || null,
    };
    if (next.phase === 'CONFIRMED') await this.audit('game_clock_authority_confirmed', data);
    else if (next.phase === 'CONFLICT') await this.audit('game_clock_authority_conflict', data);
    else if (next.phase === 'FINAL') await this.audit('game_clock_authority_final', data);
    else if (next.reason === 'activity_only_future_occurrence_blocked') await this.audit('game_clock_activity_only_blocked', data);
    else await this.audit('game_clock_authority_waiting', data);
  }
}
