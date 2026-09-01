import WebSocket from 'ws';
import { setTimeout as sleep } from 'node:timers/promises';
import { isMatchDecisionMarket, MAX_HISTORY } from './doctrine.mjs';
import { parseMarket, signKalshi } from './kalshi.mjs';

const DERIVATIVE = [
  'SPREAD','TOTAL','HRDERBY','3PT','DERBY','EXACT','GAMETO','ANYSET',
  '-1H','-2H','-1Q','-2Q','-3Q','-4Q','-1P','-2P','-3P','HTOTAL','QTOTAL',
];
const cents = (v) => Math.round(Number(v || 0) * 100);
const validQuote = (q) => q && q.yesBid >= 0 && q.yesAsk > 0 && q.yesAsk <= 100 && q.yesBid <= q.yesAsk;
const finalStatus = (q) => ['finalized', 'settled'].includes(String(q?.status || '').toLowerCase()) && Boolean(q?.result);

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
    return q?.updatedAtMs ? Math.max(0, now - Number(q.updatedAtMs)) : Infinity;
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
    if (validQuote(merged) || finalStatus(merged)) this.quotes.set(q.ticker, { ...merged, bookInvalid: finalStatus(merged) ? false : Boolean(merged.bookInvalid) });
    else this.quotes.set(q.ticker, { ...merged, bookInvalid: true });
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
    return removed;
  }

  resourceSnapshot() {
    return {
      wanted:this.wanted.size,
      quotes:this.quotes.size,
      books:this.books.size,
      histories:this.histories.size,
      resyncing:this.resyncing.size,
      connected:this.connected,
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

  async refreshTickerVerified(ticker) {
    const [marketResult, bookResult] = await Promise.allSettled([
      this.kalshi.getMarket(ticker),
      this.kalshi.getOrderbook(ticker),
    ]);
    const q = marketResult.status === 'fulfilled' ? marketResult.value : null;
    const b = bookResult.status === 'fulfilled' ? bookResult.value : null;
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
    if (!book || this.bookAgeMs(ticker) > maxAgeMs || !q || q.bookInvalid) await this.refreshTicker(ticker).catch(() => null);
    return this.getBook(ticker) || null;
  }

  async resyncBook(ticker) {
    if (this.resyncing.has(ticker)) return;
    this.resyncing.add(ticker);
    try {
      const b = await this.kalshi.getOrderbook(ticker);
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
    const yesAsks = yesAsksFromNoBids(book.noBids || []);
    book.yesAsks = yesAsks;
    const bid = book.yesBids?.[0];
    const ask = yesAsks[0];
    if (!bid || !ask || bid.priceCents > ask.priceCents) {
      this.quotes.set(ticker, { ...old, bookInvalid: !finalStatus(old) });
      if (!finalStatus(old)) void this.resyncBook(ticker);
      return;
    }
    const q = {
      ...old,
      yesBid: bid.priceCents,
      yesAsk: ask.priceCents,
      yesBidSize: bid.count,
      yesAskSize: ask.count,
      updatedAtMs: Math.max(old.updatedAtMs || 0, book.updatedAtMs || 0),
      bookInvalid: false,
    };
    this.quotes.set(ticker, q);
    this.onQuote(q);
  }

  executableBid(ticker, count, limitCents = null) {
    const b = this.books.get(ticker);
    if (!b?.yesBids?.length) return null;
    const limit = Number.isFinite(Number(limitCents)) ? Number(limitCents) : -Infinity;
    const out = walkLevels(b.yesBids, count, (x) => x.priceCents >= limit);
    return { ...out, bestCents: b.yesBids[0].priceCents };
  }

  executableAsk(ticker, count, limitCents = null) {
    const b = this.books.get(ticker);
    if (!b?.noBids?.length) return null;
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
      const clean = () => {
        if (ping) clearInterval(ping);
        if (stale) clearInterval(stale);
        if (this.ws === ws) this.ws = null;
        this.connected = false;
        this.onStatus(false, this.lastMessageMs);
      };
      ws.on('open', () => {
        this.connected = true;
        this.lastMessageMs = Date.now();
        this.onStatus(true, this.lastMessageMs);
        let id = 1;
        const tickers = [...this.wanted];
        if (tickers.length) {
          ws.send(JSON.stringify({ id: id++, cmd: 'subscribe', params: { channels: ['ticker', 'trade'], market_tickers: tickers } }));
          // Keep Kalshi's native YES-bid / NO-bid representation. YES asks are
          // derived internally as 100 - NO bid so REST and WebSocket books use
          // the same price convention.
          ws.send(JSON.stringify({ id: id++, cmd: 'subscribe', params: { channels: ['orderbook_delta'], market_tickers: tickers } }));
        }
        ws.send(JSON.stringify({ id: id++, cmd: 'subscribe', params: { channels: ['market_lifecycle_v2'] } }));
        ws.send(JSON.stringify({ id: id++, cmd: 'subscribe', params: { channels: ['fill', 'market_positions', 'user_orders'] } }));
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
    if (type === 'ticker') {
      const ticker = msg.market_ticker;
      const old = this.quotes.get(ticker);
      if (!ticker || !old) return;
      const q = {
        ...old,
        yesBid: msg.yes_bid_dollars != null ? cents(msg.yes_bid_dollars) : old.yesBid,
        yesAsk: msg.yes_ask_dollars != null ? cents(msg.yes_ask_dollars) : old.yesAsk,
        yesBidSize: msg.yes_bid_size_fp != null ? Number(msg.yes_bid_size_fp) : old.yesBidSize,
        yesAskSize: msg.yes_ask_size_fp != null ? Number(msg.yes_ask_size_fp) : old.yesAskSize,
        lastPrice: msg.price_dollars != null ? cents(msg.price_dollars) : old.lastPrice,
        volume: msg.volume_fp != null ? Number(msg.volume_fp) : old.volume,
        updatedAtMs: Number(msg.ts_ms) || Date.now(),
      };
      if (!validQuote(q) && !finalStatus(q)) {
        this.quotes.set(ticker, { ...old, bookInvalid: true, updatedAtMs: q.updatedAtMs });
        void this.resyncBook(ticker);
        return;
      }
      q.bookInvalid = false;
      this.quotes.set(ticker, q);
      this.onQuote(q);
      return;
    }
    if (type === 'trade') {
      const ticker = msg.market_ticker;
      const q = this.quotes.get(ticker);
      if (q) {
        q.recentTrades = (q.recentTrades || 0) + 1;
        if (msg.yes_price_dollars != null) q.lastPrice = cents(msg.yes_price_dollars);
        q.updatedAtMs = Number(msg.ts_ms) || Date.now();
        this.onQuote(q);
      }
      return;
    }
    if (type === 'orderbook_snapshot') {
      const ticker = msg.market_ticker;
      if (!ticker) return;
      this.books.set(ticker, {
        ticker,
        yesBids: parseLevels(msg.yes_dollars_fp || msg.yes_dollars),
        noBids: parseLevels(msg.no_dollars_fp || msg.no_dollars),
        updatedAtMs: Number(msg.ts_ms) || Date.now(),
      });
      this.applyBook(ticker);
      return;
    }
    if (type === 'orderbook_delta') {
      const ticker = msg.market_ticker;
      const book = this.books.get(ticker);
      if (!book) return;
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
        q.updatedAtMs = Number(msg.ts_ms) || Date.now();
        q.bookInvalid = false;
        this.onQuote(q);
      }
      return;
    }
    if (['fill', 'market_position', 'market_positions', 'user_order', 'user_orders'].includes(type)) this.onPrivate({ type, msg });
  }
}
