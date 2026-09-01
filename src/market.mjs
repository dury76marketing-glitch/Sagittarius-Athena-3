import WebSocket from 'ws';
import { setTimeout as sleep } from 'node:timers/promises';
import { isMatchDecisionMarket, MAX_HISTORY } from './doctrine.mjs';
import { parseMarket, signKalshi } from './kalshi.mjs';

export const MARKET_TRUTH_REVISION = 'R63-MHF1-HF2A-MARKET-TRUTH-RESTORATION-2026-08-31';

const DERIVATIVE = [
  'SPREAD','TOTAL','HRDERBY','3PT','DERBY','EXACT','GAMETO','ANYSET',
  '-1H','-2H','-1Q','-2Q','-3Q','-4Q','-1P','-2P','-3P','HTOTAL','QTOTAL',
];
const SNAPSHOT_BATCH_SIZE = 250;
const cents = (v) => Math.round(Number(v || 0) * 100);
const validQuote = (q) => q && q.yesBid >= 0 && q.yesAsk > 0 && q.yesAsk <= 100 && q.yesBid <= q.yesAsk;
const finalStatus = (q) => ['finalized', 'settled'].includes(String(q?.status || '').toLowerCase()) && Boolean(q?.result);
const finiteInt = (v) => Number.isFinite(Number(v)) ? Math.trunc(Number(v)) : null;
const sidOf = (data, msg) => finiteInt(data?.sid ?? msg?.sid);
const seqOf = (data, msg) => finiteInt(data?.seq ?? msg?.seq);

function parseLevels(arr = []) {
  return arr
    .map((x) => ({ priceCents: cents(x[0]), count: Number(x[1]) }))
    .filter((x) => x.priceCents > 0 && x.priceCents < 100 && x.count > 0)
    .sort((a, b) => b.priceCents - a.priceCents);
}

function yesAsksFromNoBids(noBids = []) {
  return noBids
    .map((x) => ({ priceCents: 100 - x.priceCents, count: x.count }))
    .filter((x) => x.priceCents > 0 && x.priceCents < 100 && x.count > 0)
    .sort((a, b) => a.priceCents - b.priceCents);
}

function walkLevels(levels, count, predicate) {
  let need = Math.max(0, Number(count) || 0);
  let filled = 0;
  let notional = 0;
  for (const x of levels || []) {
    if (!predicate(x)) continue;
    const take = Math.min(need, Number(x.count) || 0);
    if (take <= 0) continue;
    filled += take;
    notional += take * Number(x.priceCents);
    need -= take;
    if (need <= 1e-9) break;
  }
  return {
    full: need <= 1e-9,
    filled,
    avgCents: filled > 0 ? notional / filled : null,
  };
}

export class MarketHub {
  constructor({ kalshi, wsUrl, fallbackWsUrl, getCredentials, onStatus = () => {}, onQuote = () => {}, onPrivate = () => {} }) {
    this.kalshi = kalshi;
    this.wsUrl = wsUrl;
    this.fallbackWsUrl = fallbackWsUrl;
    this.getCredentials = getCredentials;
    this.onStatus = onStatus;
    this.onQuote = onQuote;
    this.onPrivate = onPrivate;
    this.quotes = new Map();
    this.books = new Map();
    this.histories = new Map();
    this.wanted = new Set();
    this.ws = null;
    this.connected = false;
    this.stopped = true;
    this.lastMessageMs = 0;
    this.reconnectToken = 0;
    this.connectLoopRunning = false;
    this.resyncing = new Set();

    // R63 maintenance HF1: Kalshi orderbook sequence is subscription-scoped,
    // never ticker-scoped. Each SID retains one global cursor plus the tickers
    // currently proven to belong to that stream. Recovery state is bounded by
    // the wanted/safety ticker set and requires no timer, worker or DB surface.
    this.orderbookStreams = new Map();
    this.wsCommandId = 1;
    this.bookIntegrityStats = {
      sequenceGaps:0,
      ignoredOldSequences:0,
      missingSequence:0,
      sidMismatch:0,
      recoveryRequests:0,
      recoveryBatches:0,
      disconnectInvalidations:0,
    };
  }

  hydrateHistories(trackers = []) {
    for (const t of trackers) {
      let h = [];
      try { h = Array.isArray(t.price_history) ? t.price_history : JSON.parse(t.price_history || '[]'); } catch {}
      this.histories.set(t.ticker, h.slice(-MAX_HISTORY));
    }
  }

  getQuote(ticker) { return this.quotes.get(ticker); }
  getBook(ticker) { return this.books.get(ticker); }
  getHistory(ticker) { return this.histories.get(ticker) || []; }
  allQuotes() { return [...this.quotes.values()]; }
  quoteAgeMs(ticker, now = Date.now()) {
    const q = this.quotes.get(ticker);
    const observed = Number(q?.quoteAtMs || q?.updatedAtMs || 0);
    return observed > 0 ? Math.max(0, now - observed) : Infinity;
  }
  bookAgeMs(ticker, now = Date.now()) {
    const b = this.books.get(ticker);
    return b?.updatedAtMs ? Math.max(0, now - Number(b.updatedAtMs)) : Infinity;
  }

  sample(ticker, now = Date.now()) {
    const q = this.quotes.get(ticker);
    if (!validQuote(q)) return this.getHistory(ticker);
    const h = this.histories.get(ticker) || [];
    h.push({ t: now, bid: q.yesBid, ask: q.yesAsk, vol: q.volume24h || 0, spread: q.yesAsk - q.yesBid });
    if (h.length > MAX_HISTORY) h.splice(0, h.length - MAX_HISTORY);
    this.histories.set(ticker, h);
    return h;
  }

  seed(q) {
    if (!q?.ticker) return;
    const old = this.quotes.get(q.ticker);
    const merged = old && old.updatedAtMs > q.updatedAtMs
      ? { ...q, ...old, result: q.result || old.result, status: q.status || old.status, recentTrades: Math.max(old.recentTrades || 0, q.recentTrades || 0) }
      : { ...(old || {}), ...q, recentTrades: Math.max(old?.recentTrades || 0, q.recentTrades || 0) };
    const quoteAtMs = Number(merged.quoteAtMs || merged.updatedAtMs || 0);
    const normalized = { ...merged, quoteAtMs, updatedAtMs:quoteAtMs || merged.updatedAtMs };
    if (validQuote(normalized) || finalStatus(normalized)) this.quotes.set(q.ticker, { ...normalized, bookInvalid: finalStatus(normalized) ? false : Boolean(normalized.bookInvalid) });
    else this.quotes.set(q.ticker, { ...normalized, bookInvalid: true });
  }

  async discover(priorityTickers = []) {
    const tradeData = await this.kalshi.getRecentTrades(5, 5);
    const [open, tradeMarkets] = await Promise.all([
      this.kalshi.getOpenMarkets(6, 3000).catch(() => []),
      this.kalshi.getLiveSportsViaTrades(tradeData).catch(() => []),
    ]);
    const merged = new Map();
    for (const q of [...open, ...tradeMarkets]) if (!merged.has(q.ticker)) merged.set(q.ticker, q);
    const now = Date.now();
    const markets = [];
    for (const q0 of merged.values()) {
      const q = { ...q0 };
      const t = q.ticker.toUpperCase();
      if (t.startsWith('KXMV') || DERIVATIVE.some((x) => t.includes(x))) continue;
      if (!t.includes('MATCH') && !t.includes('GAME')) continue;
      if (!isMatchDecisionMarket(q) || !q.canCloseEarly || q.closeTimeMs <= now || !validQuote(q)) continue;
      const td = tradeData.get(q.ticker);
      q.recentTrades = td?.count || q.recentTrades || 0;
      q.recentTradesObservedAtMs = Number(td?.observedAtMs || 0);
      if (td?.lastPriceCents) q.lastPrice = td.lastPriceCents;
      const started = q.occurrenceTimeMs > 0 && q.occurrenceTimeMs < now;
      const moved = (q.prevYesBid > 0 && Math.abs(q.yesBid - q.prevYesBid) >= 2)
        || (q.prevYesAsk > 0 && Math.abs(q.yesAsk - q.prevYesAsk) >= 2);
      if (!q.recentTrades && !started && !moved) continue;
      markets.push(q);
      this.seed(q);
    }
    for (const ticker of priorityTickers) {
      if (this.quotes.has(ticker)) continue;
      const q = await this.kalshi.getMarket(ticker).catch(() => null);
      if (q) this.seed(q);
    }
    this.setWanted([...new Set([...markets.map((x) => x.ticker), ...priorityTickers])]);
    return markets;
  }

  pruneUnusedCaches(wanted = this.wanted) {
    const keep = wanted instanceof Set ? wanted : new Set(Array.from(wanted || []).filter(Boolean));
    const removed = { quotes:0, books:0, histories:0 };
    for (const [name, cache] of [['quotes',this.quotes],['books',this.books],['histories',this.histories]]) {
      for (const ticker of [...cache.keys()]) {
        if (keep.has(ticker)) continue;
        cache.delete(ticker);
        removed[name] += 1;
      }
    }
    // Keep sequence/recovery metadata under the same RGM4 cache authority.
    for (const [sid,state] of this.orderbookStreams) {
      for (const ticker of [...state.tickers]) if (!keep.has(ticker)) state.tickers.delete(ticker);
      for (const ticker of [...state.pendingSnapshots]) if (!keep.has(ticker)) state.pendingSnapshots.delete(ticker);
      if (!state.tickers.size && !state.pendingSnapshots.size) this.orderbookStreams.delete(sid);
    }
    return removed;
  }

  resourceSnapshot() {
    let wsSequenceValidBooks=0,restVerifiedBooks=0,invalidBooks=0,recoveringStreams=0,pendingSnapshots=0;
    for (const [ticker,book] of this.books) {
      const q=this.quotes.get(ticker);
      if (q?.bookInvalid || book?.sequenceValid===false) invalidBooks+=1;
      if (book?.source==='WS' && book?.sequenceValid===true && !q?.bookInvalid) wsSequenceValidBooks+=1;
      if (book?.source==='REST' && book?.sequenceValid===true && !q?.bookInvalid) restVerifiedBooks+=1;
    }
    for (const state of this.orderbookStreams.values()) {
      if (state.recovering) recoveringStreams+=1;
      pendingSnapshots+=state.pendingSnapshots.size;
    }
    return {
      marketTruthRevision:MARKET_TRUTH_REVISION,
      wanted:this.wanted.size,
      quotes:this.quotes.size,
      books:this.books.size,
      histories:this.histories.size,
      resyncing:this.resyncing.size,
      connected:this.connected,
      bookIntegrity:{
        wsSequenceValidBooks,
        restVerifiedBooks,
        invalidBooks,
        sequenceSids:this.orderbookStreams.size,
        recoveringStreams,
        pendingSnapshots,
        ...this.bookIntegrityStats,
      },
      cacheBoundedToWanted:true,
    };
  }

  setWanted(tickers) {
    const next = new Set(tickers.filter(Boolean));
    const changed = next.size !== this.wanted.size || [...next].some((x) => !this.wanted.has(x));
    this.wanted = next;
    // HF4/RGM1: the current discovery set plus explicit safety-priority tickers is
    // the complete runtime subscription authority. Historical ticker caches are
    // durable elsewhere and must not accumulate for the lifetime of the process.
    // Pruning never removes an active/open/recovery/crash priority ticker because
    // fullScan includes all of those in `priority` before calling discover().
    this.pruneUnusedCaches(next);
    if (changed && this.ws && this.connected) {
      this.reconnectToken += 1;
      this.ws.close(1000, 'subscription refresh');
    }
  }

  trustedRestBook(b) {
    return b ? { ...b, source:'REST', sid:null, seq:null, sequenceValid:true, invalidReason:null } : null;
  }

  async refreshTickerVerified(ticker) {
    const [marketResult, bookResult] = await Promise.allSettled([
      this.kalshi.getMarket(ticker),
      this.kalshi.getOrderbook(ticker),
    ]);
    const q = marketResult.status === 'fulfilled' ? marketResult.value : null;
    const rawBook = bookResult.status === 'fulfilled' ? bookResult.value : null;
    const b=this.trustedRestBook(rawBook);
    const marketObservedAtMs = q ? Date.now() : 0;
    if (q) this.seed({ ...q, restMarketObservedAtMs: marketObservedAtMs });
    if (b) {
      this.books.set(ticker, b);
      this.applyBook(ticker);
    }
    return {
      quote: this.quotes.get(ticker) || null,
      marketFresh: Boolean(q),
      bookFresh: Boolean(b),
      marketObservedAtMs,
      bookObservedAtMs: b ? Number(b.updatedAtMs || Date.now()) : 0,
    };
  }

  async refreshTicker(ticker) {
    return (await this.refreshTickerVerified(ticker)).quote;
  }

  async ensureFreshBook(ticker, maxAgeMs = 5000) {
    const q = this.getQuote(ticker);
    const book = this.getBook(ticker);
    if (!book || this.bookAgeMs(ticker) > maxAgeMs || !q || q.bookInvalid || book.sequenceValid===false) await this.refreshTicker(ticker).catch(() => null);
    return this.getBook(ticker) || null;
  }

  async resyncBook(ticker) {
    if (this.resyncing.has(ticker)) return;
    this.resyncing.add(ticker);
    try {
      const raw = await this.kalshi.getOrderbook(ticker);
      const b=this.trustedRestBook(raw);
      if (b) {
        this.books.set(ticker, b);
        this.applyBook(ticker);
      }
    } finally {
      this.resyncing.delete(ticker);
    }
  }

  applyBook(ticker) {
    const book = this.books.get(ticker);
    const old = this.quotes.get(ticker);
    if (!book || !old) return;
    const trusted = book.source == null || book.source==='REST' || (book.source==='WS' && book.sequenceValid===true);
    if (!trusted) {
      this.quotes.set(ticker, { ...old, bookInvalid: !finalStatus(old) });
      return;
    }
    const yesAsks = yesAsksFromNoBids(book.noBids || []);
    book.yesAsks = yesAsks;
    const bid = book.yesBids?.[0];
    const ask = yesAsks[0];
    if (!bid || !ask || bid.priceCents > ask.priceCents) {
      if (book.source==='WS') { book.sequenceValid=false; book.invalidReason='crossed_or_incomplete_book'; }
      this.quotes.set(ticker, { ...old, bookInvalid: !finalStatus(old) });
      if (!finalStatus(old)) void this.resyncBook(ticker);
      return;
    }
    const observedAtMs=Number(book.updatedAtMs || 0);
    const q = {
      ...old,
      yesBid: bid.priceCents,
      yesAsk: ask.priceCents,
      yesBidSize: bid.count,
      yesAskSize: ask.count,
      quoteAtMs: Math.max(Number(old.quoteAtMs || old.updatedAtMs || 0), observedAtMs),
      updatedAtMs: Math.max(Number(old.updatedAtMs || 0), observedAtMs),
      bookInvalid: false,
    };
    this.quotes.set(ticker, q);
    this.onQuote(q);
  }

  executableBid(ticker, count, limitCents = null) {
    const b = this.books.get(ticker);
    const q = this.quotes.get(ticker);
    if (!b?.yesBids?.length || b.sequenceValid===false || q?.bookInvalid) return null;
    const limit = Number.isFinite(Number(limitCents)) ? Number(limitCents) : -Infinity;
    const out = walkLevels(b.yesBids, count, (x) => x.priceCents >= limit);
    return { ...out, bestCents: b.yesBids[0].priceCents };
  }

  executableAsk(ticker, count, limitCents = null) {
    const b = this.books.get(ticker);
    const q = this.quotes.get(ticker);
    if (!b?.noBids?.length || b.sequenceValid===false || q?.bookInvalid) return null;
    const asks = yesAsksFromNoBids(b.noBids);
    const limit = Number.isFinite(Number(limitCents)) ? Number(limitCents) : Infinity;
    const out = walkLevels(asks, count, (x) => x.priceCents <= limit);
    return { ...out, bestCents: asks[0]?.priceCents ?? null };
  }

  start() {
    this.stopped = false;
    if (!this.connectLoopRunning) void this.connectLoop();
  }
  stop() {
    this.stopped = true;
    this.ws?.close();
  }

  wsHeaders(url) {
    const c = this.getCredentials();
    if (!c?.keyId || !c?.privateKeyPem) return {};
    const ts = Date.now().toString();
    const path = new URL(url).pathname;
    return {
      'KALSHI-ACCESS-KEY': c.keyId,
      'KALSHI-ACCESS-TIMESTAMP': ts,
      'KALSHI-ACCESS-SIGNATURE': signKalshi(c.privateKeyPem, ts, 'GET', path),
    };
  }

  nextWsCommandId(){ const id=this.wsCommandId; this.wsCommandId+=1; return id; }

  streamState(sid,{create=false}={}) {
    if (sid==null) return null;
    let state=this.orderbookStreams.get(sid)||null;
    if (!state && create) {
      state={sid,lastSeq:0,tickers:new Set(),pendingSnapshots:new Set(),recovering:false,recoveryRequested:false};
      this.orderbookStreams.set(sid,state);
    }
    return state;
  }

  invalidateTickerBook(ticker,reason='untrusted_ws_book') {
    const book=this.books.get(ticker);
    if (book?.source==='WS') { book.sequenceValid=false; book.invalidReason=reason; }
    const q=this.quotes.get(ticker);
    if (q && !finalStatus(q)) this.quotes.set(ticker,{...q,bookInvalid:true});
  }

  invalidateStream(state,reason='sequence_gap') {
    if (!state) return;
    for (const ticker of state.tickers) {
      const book=this.books.get(ticker);
      if (book?.source==='WS' && Number(book.sid)===Number(state.sid)) this.invalidateTickerBook(ticker,reason);
      if (this.wanted.has(ticker) || this.books.has(ticker) || this.quotes.has(ticker)) state.pendingSnapshots.add(ticker);
    }
    state.recovering=true;
    this.requestStreamSnapshots(state);
  }

  requestStreamSnapshots(state) {
    if (!state || state.recoveryRequested || !state.pendingSnapshots.size) return false;
    const ws=this.ws;
    const openConstant=WebSocket?.OPEN;
    if (!ws || !this.connected || typeof ws.send!=='function' || (openConstant!=null && ws.readyState!==openConstant)) return false;
    state.recoveryRequested=true;
    const tickers=[...state.pendingSnapshots];
    this.bookIntegrityStats.recoveryRequests+=1;
    for (let i=0;i<tickers.length;i+=SNAPSHOT_BATCH_SIZE) {
      const batch=tickers.slice(i,i+SNAPSHOT_BATCH_SIZE);
      this.bookIntegrityStats.recoveryBatches+=1;
      ws.send(JSON.stringify({id:this.nextWsCommandId(),cmd:'update_subscription',params:{sid:state.sid,market_tickers:batch,action:'get_snapshot'}}));
    }
    return true;
  }

  startSingleTickerRecovery(state,ticker,reason) {
    if (!state || !ticker) return;
    state.tickers.add(ticker);
    state.pendingSnapshots.add(ticker);
    state.recovering=true;
    this.invalidateTickerBook(ticker,reason);
    this.requestStreamSnapshots(state);
    if (!state.recoveryRequested) void this.resyncBook(ticker);
  }

  advanceStreamSequence(data,{ticker=null,type='orderbook'}={}) {
    const msg=data?.msg||{};
    const sid=sidOf(data,msg),seq=seqOf(data,msg);
    if (sid==null || seq==null) {
      this.bookIntegrityStats.missingSequence+=1;
      const knownBook=ticker?this.books.get(ticker):null;
      const knownSid=knownBook?.source==='WS'?finiteInt(knownBook.sid):null;
      const knownState=knownSid==null?null:this.streamState(knownSid);
      if (knownState) this.invalidateStream(knownState,'missing_sid_or_sequence');
      else if (ticker) {
        this.invalidateTickerBook(ticker,'missing_sid_or_sequence');
        void this.resyncBook(ticker);
      }
      return {ok:false,sid,seq,state:knownState,reason:'missing_sid_or_sequence'};
    }
    let state=this.streamState(sid,{create:type==='snapshot'});
    if (!state) {
      this.bookIntegrityStats.missingSequence+=1;
      if (ticker) {
        this.invalidateTickerBook(ticker,'subscription_state_missing');
        void this.resyncBook(ticker);
      }
      return {ok:false,sid,seq,state:null,reason:'subscription_state_missing'};
    }
    if (seq<=state.lastSeq) {
      this.bookIntegrityStats.ignoredOldSequences+=1;
      return {ok:false,sid,seq,state,reason:'old_or_duplicate_sequence'};
    }
    if (state.lastSeq>0 && seq!==state.lastSeq+1) {
      this.bookIntegrityStats.sequenceGaps+=1;
      const previousSeq=state.lastSeq;
      state.lastSeq=seq;
      this.invalidateStream(state,`sequence_gap:${previousSeq}->${seq}`);
      return {ok:false,sid,seq,state,reason:'sequence_gap'};
    }
    state.lastSeq=seq;
    return {ok:true,sid,seq,state,reason:'contiguous'};
  }

  invalidateWsBooks(reason='websocket_disconnect') {
    let count=0;
    for (const [ticker,book] of this.books) {
      if (book?.source!=='WS') continue;
      count+=1;
      book.sequenceValid=false;
      book.invalidReason=reason;
      book.sid=null;
      book.seq=null;
      const q=this.quotes.get(ticker);
      if (q && !finalStatus(q)) this.quotes.set(ticker,{...q,bookInvalid:true});
    }
    this.orderbookStreams.clear();
    this.bookIntegrityStats.disconnectInvalidations+=count;
    return count;
  }

  async connectLoop() {
    if (this.connectLoopRunning) return;
    this.connectLoopRunning = true;
    let attempt = 0;
    try {
      while (!this.stopped) {
        if (!this.getCredentials()?.keyId) {
          await sleep(2000);
          continue;
        }
        const token = this.reconnectToken;
        const urls = [this.wsUrl, this.fallbackWsUrl].filter((x, i, a) => x && a.indexOf(x) === i);
        try {
          await this.connectOnce(urls[Math.min(attempt, urls.length - 1)] || this.wsUrl, token);
          attempt = 0;
        } catch {
          attempt += 1;
        }
        if (!this.stopped) await sleep(Math.min(1000 * 2 ** Math.min(attempt, 5), 30000));
      }
    } finally {
      this.connectLoopRunning = false;
    }
  }

  connectOnce(url, token) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url, { headers: this.wsHeaders(url), handshakeTimeout: 10000 });
      this.ws = ws;
      let ping = null;
      let stale = null;
      let cleaned = false;
      const clean = () => {
        if (cleaned) return;
        cleaned = true;
        if (ping) clearInterval(ping);
        if (stale) clearInterval(stale);
        this.invalidateWsBooks('websocket_disconnect');
        if (this.ws === ws) this.ws = null;
        this.connected = false;
        this.onStatus(false, this.lastMessageMs);
      };
      ws.on('open', () => {
        this.connected = true;
        this.lastMessageMs = Date.now();
        this.onStatus(true, this.lastMessageMs);
        const tickers = [...this.wanted];
        if (tickers.length) {
          ws.send(JSON.stringify({ id: this.nextWsCommandId(), cmd: 'subscribe', params: { channels: ['ticker', 'trade'], market_tickers: tickers } }));
          // Explicitly preserve Kalshi native YES-bid / NO-bid orderbook semantics.
          // YES asks are derived internally as 100 - NO bid for REST/WS parity.
          ws.send(JSON.stringify({ id: this.nextWsCommandId(), cmd: 'subscribe', params: { channels: ['orderbook_delta'], market_tickers: tickers, use_yes_price:false } }));
        }
        ws.send(JSON.stringify({ id: this.nextWsCommandId(), cmd: 'subscribe', params: { channels: ['market_lifecycle_v2'] } }));
        ws.send(JSON.stringify({ id: this.nextWsCommandId(), cmd: 'subscribe', params: { channels: ['fill', 'market_positions', 'user_orders'] } }));
        ping = setInterval(() => { if (ws.readyState === WebSocket.OPEN) ws.ping(); }, 20000);
        stale = setInterval(() => {
          if (Date.now() - this.lastMessageMs > 65000 && ws.readyState === WebSocket.OPEN) ws.terminate();
          if (token !== this.reconnectToken && ws.readyState === WebSocket.OPEN) ws.close(1000, 'refresh');
        }, 5000);
      });
      ws.on('message', (raw) => {
        this.lastMessageMs = Date.now();
        this.onStatus(true, this.lastMessageMs);
        try { this.handle(JSON.parse(raw.toString())); } catch {}
      });
      ws.on('pong', () => {
        this.lastMessageMs = Date.now();
        this.onStatus(true, this.lastMessageMs);
      });
      ws.on('error', (e) => { clean(); reject(e); });
      ws.on('close', () => { clean(); resolve(); });
    });
  }

  handle(data) {
    const type = data.type;
    const msg = data.msg || {};

    // Kalshi update_subscription acknowledgements can carry the same SID/SEQ
    // cursor as book messages. They advance continuity but never heal a book.
    if (type === 'ok') {
      const sid=sidOf(data,msg),seq=seqOf(data,msg);
      const state=this.streamState(sid);
      if (state && seq!=null) this.advanceStreamSequence(data,{type:'ok'});
      return;
    }

    if (type === 'ticker') {
      const ticker = msg.market_ticker;
      const old = this.quotes.get(ticker);
      if (!ticker || !old) return;
      const hasBid=msg.yes_bid_dollars != null,hasAsk=msg.yes_ask_dollars != null;
      const directQuoteTruth=hasBid||hasAsk;
      const observedAt=directQuoteTruth ? (Number(msg.ts_ms) || Date.now()) : Number(old.quoteAtMs || old.updatedAtMs || 0);
      const q = {
        ...old,
        yesBid: hasBid ? cents(msg.yes_bid_dollars) : old.yesBid,
        yesAsk: hasAsk ? cents(msg.yes_ask_dollars) : old.yesAsk,
        yesBidSize: msg.yes_bid_size_fp != null ? Number(msg.yes_bid_size_fp) : old.yesBidSize,
        yesAskSize: msg.yes_ask_size_fp != null ? Number(msg.yes_ask_size_fp) : old.yesAskSize,
        lastPrice: msg.price_dollars != null ? cents(msg.price_dollars) : old.lastPrice,
        volume: msg.volume_fp != null ? Number(msg.volume_fp) : old.volume,
        quoteAtMs:observedAt,
        updatedAtMs:observedAt,
        // A quote/ticker message can refresh bid/ask values but it cannot prove
        // continuity of the executable depth book after sequence invalidation.
        bookInvalid:Boolean(old.bookInvalid),
      };
      if (!validQuote(q) && !finalStatus(q)) {
        this.quotes.set(ticker, { ...old, bookInvalid: true });
        void this.resyncBook(ticker);
        return;
      }
      this.quotes.set(ticker, q);
      this.onQuote(q);
      return;
    }

    if (type === 'trade') {
      const ticker = msg.market_ticker;
      const q = this.quotes.get(ticker);
      if (q) {
        const observedAt=Number(msg.ts_ms) || Date.now();
        q.recentTrades = (q.recentTrades || 0) + 1;
        q.recentTradesObservedAtMs = Math.max(Number(q.recentTradesObservedAtMs || 0),observedAt);
        q.lastTradeObservedAtMs = observedAt;
        if (msg.yes_price_dollars != null) q.lastPrice = cents(msg.yes_price_dollars);
        // Critical HF2 invariant: trade activity is not bid/ask freshness.
        // Do not mutate quoteAtMs/updatedAtMs or bookInvalid here.
        this.onQuote(q);
      }
      return;
    }

    if (type === 'orderbook_snapshot') {
      const ticker = msg.market_ticker;
      if (!ticker) return;
      const sid=sidOf(data,msg);
      const existing=this.books.get(ticker);
      if (existing?.source==='WS' && existing.sid!=null && sid!=null && Number(existing.sid)!==Number(sid)) {
        this.bookIntegrityStats.sidMismatch+=1;
        const oldState=this.streamState(finiteInt(existing.sid));
        if (oldState) this.invalidateStream(oldState,'sid_mismatch');
        this.invalidateTickerBook(ticker,'sid_mismatch');
        void this.resyncBook(ticker);
        return;
      }
      const gate=this.advanceStreamSequence(data,{ticker,type:'snapshot'});
      if (!gate.ok) return;
      const state=gate.state;
      state.tickers.add(ticker);
      this.books.set(ticker, {
        ticker,
        yesBids: parseLevels(msg.yes_dollars_fp || msg.yes_dollars),
        noBids: parseLevels(msg.no_dollars_fp || msg.no_dollars),
        updatedAtMs: Number(msg.ts_ms) || Date.now(),
        source:'WS',sid:gate.sid,seq:gate.seq,sequenceValid:true,invalidReason:null,
      });
      if (state.pendingSnapshots.has(ticker)) state.pendingSnapshots.delete(ticker);
      if (state.recovering && state.pendingSnapshots.size===0) { state.recovering=false;state.recoveryRequested=false; }
      this.applyBook(ticker);
      return;
    }

    if (type === 'orderbook_delta') {
      const ticker = msg.market_ticker;
      if (!ticker) return;
      const gate=this.advanceStreamSequence(data,{ticker,type:'delta'});
      const state=gate.state;
      if (!gate.ok) return;
      const book = this.books.get(ticker);
      if (!book) { this.startSingleTickerRecovery(state,ticker,'missing_snapshot_before_delta'); return; }
      if (book.source!=='WS' || Number(book.sid)!==Number(gate.sid)) {
        this.bookIntegrityStats.sidMismatch+=1;
        this.startSingleTickerRecovery(state,ticker,'sid_mismatch');
        return;
      }
      if (state.pendingSnapshots.has(ticker) || book.sequenceValid!==true) return;
      const nativeSide = String(msg.side || '').toLowerCase() === 'no' ? book.noBids : book.yesBids;
      const price = cents(msg.price_dollars);
      const delta = Number(msg.delta_fp ?? msg.delta ?? 0);
      const found = nativeSide.find((x) => x.priceCents === price);
      if (found) found.count += delta;
      else if (delta > 0) nativeSide.push({ priceCents: price, count: delta });
      const clean = nativeSide.filter((x) => x.count > 1e-9).sort((a, b) => b.priceCents - a.priceCents);
      if (String(msg.side || '').toLowerCase() === 'no') book.noBids = clean;
      else book.yesBids = clean;
      book.updatedAtMs = Number(msg.ts_ms) || Date.now();
      book.seq=gate.seq;
      book.sequenceValid=true;
      book.invalidReason=null;
      this.applyBook(ticker);
      return;
    }

    if (type === 'market_lifecycle_v2') {
      const ticker = msg.market_ticker || msg.ticker;
      const q = this.quotes.get(ticker);
      if (q) {
        const e = String(msg.event_type || '').toLowerCase();
        if (e === 'activated') q.status = 'active';
        else if (e === 'deactivated') q.status = 'inactive';
        else if (e === 'determined') { q.status = 'determined'; q.result = msg.result || q.result; }
        else if (e === 'settled' || e === 'finalized') { q.status = 'finalized'; q.result = msg.result || q.result; }
        q.lifecycleObservedAtMs = Number(msg.ts_ms) || Date.now();
        // Lifecycle is not bid/ask freshness and cannot heal an invalid book.
        this.onQuote(q);
      }
      return;
    }
    if (['fill', 'market_position', 'market_positions', 'user_order', 'user_orders'].includes(type)) this.onPrivate({ type, msg });
  }
}
