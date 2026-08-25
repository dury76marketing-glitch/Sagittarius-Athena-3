let STATE = null;
const $ = (id) => document.getElementById(id);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
const money = (c) => `${Number(c || 0) >= 0 ? '+' : ''}$${(Number(c || 0) / 100).toFixed(2)}`;
const moneyPlain = (c) => `$${(Number(c || 0) / 100).toFixed(2)}`;
const pc = (c) => c == null ? '-' : `${Math.round(Number(c))}c`;
const pct = (v) => `${(Number(v || 0) * 100).toFixed(1)}%`;
const vol = (v) => Number(v || 0) >= 1e6 ? `$${(Number(v) / 1e6).toFixed(1)}m` : Number(v || 0) >= 1000 ? `$${(Number(v) / 1000).toFixed(1)}k` : `$${Math.round(Number(v || 0))}`;
const ago = (ms) => { if (!ms) return 'never'; const s = Math.max(0, Math.round((Date.now() - ms) / 1000)); return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.floor(s / 60)}m ago` : `${Math.floor(s / 3600)}h ago`; };
const pnlClass = (v) => Number(v) > 0 ? 'positive' : Number(v) < 0 ? 'negative' : '';
const duration = (ms) => ms == null ? '-' : Number(ms) < 60000 ? `${Math.round(Number(ms)/1000)}s` : `${(Number(ms)/60000).toFixed(1)}m`;
const post = async (url, data = {}) => { const r = await fetch(url, { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(data) }); const j = await r.json(); if (!r.ok) throw new Error(j.error || 'Request failed'); return j; };
const patch = async (url, data) => { const r = await fetch(url, { method:'PATCH', headers:{'content-type':'application/json'}, body:JSON.stringify(data) }); const j = await r.json(); if (!r.ok) throw new Error(j.error || 'Request failed'); return j; };
function msg(text, bad = false) { $('actionMessage').textContent = text; $('actionMessage').className = `message ${bad ? 'negative' : 'positive'}`; setTimeout(() => { $('actionMessage').textContent = ''; }, 6000); }
function setPnl(id, v, plain = false) { const e = $(id); e.textContent = plain ? moneyPlain(v) : money(v); e.className = pnlClass(v); }

// Same Europe/Madrid boundary logic used by the original dashboard helper.
function madridMidnightOn(date) {
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone:'Europe/Madrid', year:'numeric', month:'2-digit', day:'2-digit' }).format(date);
  const utcMid = new Date(`${ymd}T00:00:00Z`);
  const hm = new Intl.DateTimeFormat('en-GB', { timeZone:'Europe/Madrid', hour:'2-digit', minute:'2-digit', hour12:false }).format(utcMid);
  const [h, m] = hm.split(':').map(Number);
  return new Date(utcMid.getTime() - ((h % 24) * 60 + m) * 60000);
}
function madridBoundary(type) {
  const now = new Date();
  if (type === 'day') return madridMidnightOn(now).getTime();
  if (type === 'week') {
    const wd = new Intl.DateTimeFormat('en-CA', { timeZone:'Europe/Madrid', weekday:'short' }).format(now);
    const map = { Sun:0, Mon:1, Tue:2, Wed:3, Thu:4, Fri:5, Sat:6 };
    const dow = map[wd] ?? 0;
    const days = dow === 0 ? 6 : dow - 1;
    return madridMidnightOn(new Date(Date.now() - days * 86400000)).getTime();
  }
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone:'Europe/Madrid', year:'numeric', month:'2-digit' }).formatToParts(now).reduce((o, x) => (o[x.type] = x.value, o), {});
  const date = type === 'month' ? new Date(`${parts.year}-${parts.month}-01T12:00:00Z`) : new Date(`${parts.year}-01-01T12:00:00Z`);
  return madridMidnightOn(date).getTime();
}
function periodPnl(closed, boundary) { return (closed || []).filter((x) => Number(x.closedAtMs || 0) >= boundary).reduce((s, x) => s + Number(x.pnlCents || 0), 0); }

const DESCS = {
  'Wave Surfer':'Feeder-driven Hunter using feeder price movement only. All Wave entry/risk controls are editable here. Feeder stake/P&L remain display references and cannot influence Wave eligibility or sizing.',
  'Recovery Hunter':'Re-enters a qualified stopped Hunter after a confirmed rebound from its post-stop trough. Target size remains exactly 2x the editable base stake; buying power is enforced by the normal execution gate and never silently changes the configured Recovery size.',
  'Momentum Hunter':'Feeder pullback Hunter with its own editable stake, entry band, rise/pullback, spread, time-left, stop and Recovery Learning gate.',
  'Pegasus':'Ghost/reference feeder with its own editable reference stake, price band and drop threshold. Reference economics are display-only and never size or authorize Hunters.',
  'Sagittarius':'Ghost/reference feeder with its own editable reference stake, price band and drop threshold. Reference economics are display-only and never size or authorize Hunters.',
  'Dragon':'Ghost/reference feeder powered by Crash Intelligence. It emits qualified CI1 crash-recovery signals; its trough is the reference origin and it never creates exposure itself.',
  'Golden Dragon':'High-trust ghost feeder layered on CI1. It scores durable recovery quality using crash structure, repeated-instability penalties, timing and prior finalized survival evidence, then revalidates the same episode before any Hunter can use it.',
  'Golden Dragon Hunter':'Independent real Hunter native to Golden Dragon intelligence. It requires an exact current Golden episode, then applies its own tighter trust, episode, entry-band, rebound/reclaim/stability, spread and stop controls before central execution.',
  'Dragon Recovery Hunter':'Tradable recovery Hunter fed only by Golden Dragon. It waits for a confirmed trough plus strong rebound/reclaim/stability before using the normal central Hunter execution and protection path.',
  'Crash Recovery Hunter':'Crash-recovery Hunter that may consume an exact episode approved by Dragon or Golden Dragon and still applies its own CRH doctrine.'
};

const MODEL_KEYS = {
  'Pegasus':'pegasusEnabled',
  'Sagittarius':'sagittariusEnabled',
  'Dragon':'dragonEnabled',
  'Golden Dragon':'goldenDragonEnabled',
  'Momentum Hunter':'momentumHunterEnabled',
  'Wave Surfer':'waveSurferEnabled',
  'Recovery Hunter':'recoveryHunterEnabled',
  'Crash Recovery Hunter':'crashRecoveryHunterEnabled',
  'Dragon Recovery Hunter':'dragonRecoveryHunterEnabled',
  'Golden Dragon Hunter':'goldenDragonHunterEnabled'
};
const FAIL_SAFE_OFF_MODELS = new Set(['Dragon','Golden Dragon','Crash Recovery Hunter','Dragon Recovery Hunter','Golden Dragon Hunter']);
const modelIsEnabled = (s, name) => { const key = MODEL_KEYS[name]; if (!key) return true; return FAIL_SAFE_OFF_MODELS.has(name) ? s.settings[key] === true : s.settings[key] !== false; };
const MODEL_FIELDS = {
  'Pegasus': [
    ['pegasusReferenceStakeCents','Reference stake','c',1],['pegasusMinPriceCents','Min price','c',1],['pegasusMaxPriceCents','Max price','c',1],['pegasusDropCents','Drop','c',1],
  ],
  'Sagittarius': [
    ['sagittariusReferenceStakeCents','Reference stake','c',1],['sagittariusMinPriceCents','Min price','c',1],['sagittariusMaxPriceCents','Max price','c',1],['sagittariusDropCents','Drop','c',1],
  ],
  'Dragon': [
    ['dragonReferenceStakeCents','Reference stake','c',1],['dragonMinSignalPriceCents','Min signal','c',1],['dragonMaxSignalPriceCents','Max signal','c',1],['dragonMaxEpisode','Max episode','',1],
  ],
  'Golden Dragon': [
    ['goldenDragonReferenceStakeCents','Reference stake','c',1],['goldenDragonMinSignalPriceCents','Min signal','c',1],['goldenDragonMaxSignalPriceCents','Max signal','c',1],
    ['goldenDragonMaxEpisode','Max episode','',1],['goldenDragonMinCrashCents','Min crash','c',1],['goldenDragonMinReboundCents','Min rebound','c',1],
    ['goldenDragonMinReclaimRate','Min reclaim','0-1',0.01],['goldenDragonStableObservations','Stable obs','',1],['goldenDragonUpwardTicks','Up ticks','',1],
    ['goldenDragonMinTrustScore','Min trust score','0-100',1],['goldenDragonMinRecoveryAgeSeconds','Min trough age','sec',1],['goldenDragonMaxRecoveryAgeSeconds','Max rebound age','sec',1],
  ],
  'Golden Dragon Hunter': [
    ['goldenDragonHunterStakeCents','Stake','c',1],['goldenDragonHunterMinEntryCents','Min entry','c',1],['goldenDragonHunterMaxEntryCents','Max entry','c',1],
    ['goldenDragonHunterStopLossCents','Stop loss','c',1],['goldenDragonHunterMaxSpreadCents','Max spread','c',1],['goldenDragonHunterMinTrustScore','Min Golden trust','0-100',1],
    ['goldenDragonHunterMaxEpisode','Max episode','',1],['goldenDragonHunterMinReboundCents','Min rebound','c',1],['goldenDragonHunterMinReclaimRate','Min reclaim','0-1',0.01],
    ['goldenDragonHunterStableObservations','Stable obs','',1],['goldenDragonHunterUpwardTicks','Up ticks','',1],
  ],
  'Momentum Hunter': [
    ['momentumStakeCents','Stake','c',1],['momentumMinEntryCents','Min entry','c',1],['momentumMaxEntryCents','Max entry','c',1],
    ['momentumHunterStopLossCents','Stop loss','c',1],['momentumMinRiseCents','Min rise','c',1],['momentumMinPullbackCents','Min pullback','c',1],
    ['momentumMaxPullbackCents','Max pullback','c',1],['momentumMaxSpreadCents','Max spread','c',1],['momentumMinTimeLeftMinutes','Min time left','min',0.5],
    ['recoveryMinObservations','Learning obs','',1],['recoveryMinRate','Learning rate','0-1',0.01],
  ],
  'Wave Surfer': [
    ['waveStakeCents','Stake','c',1],['waveMinEntryCents','Min entry','c',1],['waveMaxEntryCents','Max entry','c',1],
    ['waveStopCents','Stop loss','c',1],['waveMinFeederFavorableMoveCents','Min feeder move','c',1],['waveMaxSpreadCents','Max spread','c',1],
  ],
  'Recovery Hunter': [
    ['recoveryBaseStakeCents','Base stake (2x entry)','c',1],['recoveryMinEntryCents','Min entry','c',1],['recoveryMaxEntryCents','Max entry','c',1],
    ['recoveryHunterStopLossCents','Stop loss','c',1],['recoveryMinReboundCents','Min rebound','c',1],
  ],
  'Dragon Recovery Hunter': [
    ['dragonRecoveryStakeCents','Stake','c',1],['dragonRecoveryMinEntryCents','Min entry','c',1],['dragonRecoveryMaxEntryCents','Max entry','c',1],
    ['dragonRecoveryStopLossCents','Stop loss','c',1],['dragonRecoveryMaxSpreadCents','Max spread','c',1],['dragonRecoveryMinReboundCents','Min rebound','c',1],
    ['dragonRecoveryMinReclaimRate','Min reclaim','0-1',0.01],['dragonRecoveryStableObservations','Stable obs','',1],['dragonRecoveryUpwardTicks','Up ticks','',1],
  ],
  'Crash Recovery Hunter': [
    ['crashRecoveryStakeCents','Stake','c',1],['crashRecoveryMinEntryCents','Min entry','c',1],['crashRecoveryMaxEntryCents','Max entry','c',1],
    ['crashRecoveryStopLossCents','Stop loss','c',1],['crashRecoveryMaxSpreadCents','Max spread','c',1],['crashRecoveryMinCrashCents','Min crash','c',1],
    ['crashRecoveryMinReboundCents','Min rebound','c',1],['crashRecoveryMinReclaimRate','Min reclaim','0-1',0.01],
    ['crashRecoveryStableObservations','Stable obs','',1],['crashRecoveryUpwardTicks','Up ticks','',1],['crashRecoveryEpisodeResetRate','Episode reset','0-1',0.01],
  ],
};
const MODEL_DRAFTS = new Map();
const GENERAL_DRAFTS = new Map();
const draftOrSetting = (s, key) => MODEL_DRAFTS.has(key) ? MODEL_DRAFTS.get(key) : (s.settings[key] ?? '');
function modelFieldsHtml(s, name) {
  const fields = MODEL_FIELDS[name] || [];
  if (!fields.length) return '';
  return `<div class="model-settings">${fields.map(([key,label,suffix,step]) => `<label>${esc(label)}<span><input class="model-setting-input" data-setting-key="${esc(key)}" type="number" step="${esc(step)}" value="${esc(draftOrSetting(s,key))}"><em>${esc(suffix)}</em></span></label>`).join('')}<button type="button" class="btn model-save" data-model-save="${esc(name)}">Apply</button></div>`;
}
async function patchSettingsVerified(data) {
  const saved = await patch('/api/settings', data);
  for (const [key, expected] of Object.entries(data)) {
    if (Number.isFinite(Number(expected))) {
      if (Number(saved[key]) !== Number(expected)) throw new Error(`${key} did not persist (saved ${saved[key]})`);
    } else if (saved[key] !== expected) throw new Error(`${key} did not persist`);
  }
  const r = await fetch('/api/state', { cache:'no-store' });
  const fresh = await r.json();
  if (!r.ok) throw new Error(fresh.error || 'Unable to verify saved settings');
  for (const [key, expected] of Object.entries(data)) {
    const actual = fresh.settings?.[key];
    if (Number.isFinite(Number(expected))) {
      if (Number(actual) !== Number(expected)) throw new Error(`${key} reverted after save (runtime ${actual})`);
    } else if (actual !== expected) throw new Error(`${key} reverted after save`);
  }
  return fresh;
}

function draw(svgId, series) {
  const svg = $(svgId); if (!svg) return;
  const w = 900, h = Number(svg.getAttribute('viewBox').split(' ')[3]) || 110, pad = 12;
  const all = series.flatMap((x) => x.values).filter(Number.isFinite); svg.innerHTML = '';
  if (all.length < 2) { svg.innerHTML = '<text x="15" y="35" fill="#94a3b8" font-size="12">Waiting for portfolio snapshots...</text>'; return; }
  let min = Math.min(...all), max = Math.max(...all); if (min === max) { min -= 1; max += 1; }
  const n = Math.max(...series.map((x) => x.values.length));
  const x = (i) => pad + (w - 2 * pad) * (n <= 1 ? 0 : i / (n - 1));
  const y = (v) => h - pad - (h - 2 * pad) * (v - min) / (max - min);
  svg.insertAdjacentHTML('beforeend', `<line x1="${pad}" y1="${h-pad}" x2="${w-pad}" y2="${h-pad}" stroke="#e2e8f0"/><text x="${pad}" y="12" fill="#94a3b8" font-size="10">${(max/100).toFixed(0)}</text><text x="${pad}" y="${h-2}" fill="#94a3b8" font-size="10">${(min/100).toFixed(0)}</text>`);
  const colors = ['#16a34a','#2563eb','#f59e0b'];
  series.forEach((s, si) => { const pts = s.values.map((v, i) => `${x(i)},${y(v)}`).join(' '); svg.insertAdjacentHTML('beforeend', `<polyline fill="none" stroke="${colors[si % colors.length]}" stroke-width="2" points="${pts}"/>`); });
}
function renderCharts(s) {
  const snaps = s.snapshots || [];
  draw('chartPortfolio', [{ values:snaps.map((x) => Number(x.portfolio_value_cents)) }]);
  draw('chartHunterFeeder', [{ values:snaps.map((x) => Number(x.hunter_realized_pnl_cents)) }, { values:snaps.map((x) => Number(x.feeder_unrealized_pnl_cents)) }]);
  draw('chartRealUnreal', [{ values:snaps.map((x) => Number(x.hunter_realized_pnl_cents)) }, { values:snaps.map((x) => Number(x.hunter_unrealized_pnl_cents)) }]);
}
function currentCell(x) {
  if (!x.avgCurrentCents) return '-';
  const d = Number(x.avgCurrentCents) - Number(x.avgEntryCents || 0);
  if (!x.avgEntryCents || d === 0) return pc(x.avgCurrentCents);
  return `${pc(x.avgCurrentCents)} <span class="${d > 0 ? 'positive' : 'negative'}">${d > 0 ? '▲' : '▼'}${Math.abs(d)}c</span>`;
}
function renderConcepts(s) {
  if (document.activeElement?.classList?.contains('model-setting-input')) return;
  const rows = s.conceptStats || [];
  $('conceptBody').innerHTML = rows.map((x, i) => {
    const enabled = modelIsEnabled(s, x.name);
    const key = MODEL_KEYS[x.name] || '';
    const rowClass = `${i === 0 ? 'leader-row ' : ''}${enabled ? '' : 'model-disabled'}`.trim();
    return `<tr class="${rowClass}"><td>${i + 1}</td><td class="concept-cell"><div class="concept-name">${esc(x.name)}</div><div class="concept-desc">${esc(DESCS[x.name] || '')}${x.statsBasis === 'fed_hunters' ? `<br>Signals: ${Number(x.feederSignals || 0)} · performance columns = fed Hunters` : ''}</div>${modelFieldsHtml(s,x.name)}</td><td><button type="button" class="model-toggle ${enabled ? 'enabled' : 'disabled'}" data-model-key="${esc(key)}" data-model-name="${esc(x.name)}" data-enabled="${enabled ? 'true' : 'false'}" aria-pressed="${enabled ? 'true' : 'false'}">${enabled ? 'ON' : 'OFF'}</button></td><td>${x.avgEntryCents ? pc(x.avgEntryCents) : '-'}</td><td>${currentCell(x)}</td><td>${x.avgLiquidity ? vol(x.avgLiquidity) : '-'}</td><td>${x.total}</td><td>${x.open}</td><td>${x.closed}</td><td><span class="positive">${x.wins}</span> / <span class="negative">${x.losses}</span></td><td>${x.closed ? pct(x.winRate) : '-%'}</td><td class="${pnlClass(x.pnlCents)}">${money(x.pnlCents)}</td><td>${x.fedHunters == null ? '-' : x.fedHunters}</td></tr>`;
  }).join('');
  const p = s.performance;
  const hunterTotal = rows.filter((x) => !['Pegasus','Sagittarius','Dragon','Golden Dragon'].includes(x.name)).reduce((n, x) => n + x.total, 0);
  const enabledCount = rows.filter((x) => modelIsEnabled(s, x.name)).length;
  $('entryTotals').innerHTML = `<span><strong>${enabledCount}/${rows.length}</strong> models enabled</span><span><strong>${hunterTotal}</strong> total entries</span><span><strong>${p.closed}</strong> closed</span><span>Total P&amp;L: <strong class="${pnlClass(p.realizedCents)}">${money(p.realizedCents)}</strong></span><span>Last scan ${ago(s.scanner.lastScanMs)} - auto-runs every 5 min</span>`;
}

function guardCell(e) {
  const g = e.profitGuard;
  if (!g) return '<span class="guard">Waiting</span>';
  const usg1 = ['USG1_RECOVERY_ZONE','USG1_STRESSED_ZONE','USG1_CRITICAL_ZONE','USG1_CRITICAL_PROBE','USG1_RECLAIMING'].includes(g.guardState);
  const pri1 = String(g.guardState || '').startsWith('PRI1_') || g.pri1Armed;
  const upg3 = ['UPG3_ARMED','UPG3_RECOVERY_ZONE','UPG3_FAILURE_CONFIRMING','UPG3_RECLAIMING','UPG3_WAITING_FOR_FULL_DEPTH','UPG3_PROFIT_FLOOR_LOST','UPG3_EXIT_TRIGGERED'].includes(g.guardState);
  const cls = (pri1 || upg3) ? 'trailing' : ['HARD_STOP','EXIT_PENDING','USG1_EXIT','USG1_EMERGENCY_EXIT','PRI1_EXIT','PRI1_EXIT_COMMITTED','UPG3_EXIT','UPG3_EXIT_COMMITTED','UPG2_EXIT','UPG2_EXIT_COMMITTED','UPG1_EXIT','UPG1_EXIT_COMMITTED'].includes(g.guardState) ? 'stop' : usg1 ? 'usg1' : g.guardState === 'FEEDER' ? 'feeder' : '';
  const priR2 = String(g.protectedRunnerPolicyRevision || '') === 'PRI1-R2';
  const priPolicy = priR2
    ? `giveback ${Number(g.pri1EffectiveRunnerGivebackCents ?? g.pri1RunnerGivebackCents ?? 0).toFixed(0)}c (${esc(g.pri1RunnerGivebackSource || 'cold_start')}) · floor ${g.pri1ProfitFloorArmed ? 'ARMED' : 'BUILDING'}${g.pri1LateProfitTightened ? ' · LATE TIGHTEN' : ''}`
    : `retain ${(100 * Number(g.pri1RetentionRatio || 0)).toFixed(1)}% (${esc(g.pri1RetentionSource || 'cold_start')})`;
  const priGuard = g.pri1Armed ? `<br><span class="muted">${esc(g.protectedRunnerIntelligence || 'PRI1')}${g.protectedRunnerPolicyRevision ? `/${esc(g.protectedRunnerPolicyRevision)}` : ''} · PLI ${esc(g.profitLearningIntelligence || 'PLI1')} · peak ${pc(g.pri1PeakExecutableBidCents)} / ${money(g.pri1PeakExecutableNetCents)} net · protected ${pc(g.pri1ProtectedPriceFloorCents)} / ${money(g.pri1ProtectedNetFloorCents)} net · ${priPolicy} · break-even ${pc(g.pri1BreakEvenPriceCents)} · exec ${pc(g.pri1ExecutableBidCents)}${g.pri1DataHoldReason ? ` · DATA HOLD ${esc(g.pri1DataHoldReason)}` : ''}${g.pri1CapitalFloorGapped ? ' · PROFIT FLOOR GAPPED → U-SG1' : ''}</span>` : '';
  const profitGuard = priGuard || (g.upg3Armed ? `<br><span class="muted">${esc(g.ultimateProfitGuard || 'U-PG3')} · peak ${pc(g.upg3PeakExecutableBidCents)} · danger ${pc(g.upg3DangerLineCents)} · structural ${pc(g.upg3StructuralLineCents)} · +net floor ${pc(g.upg3MinimumPositivePriceCents)} · arm ${pc(g.upg3HeadroomArmPriceCents)} · break-even ${pc(g.upg3EconomicBreakEvenPriceCents)} · exec ${pc(g.upg3ExecutableBidCents)}${g.upg3ProfitFloorLost ? ' · PROFIT FLOOR LOST → U-SG1' : ''}</span>` : '');
  const stopGuard = g.stopGuardVersion ? `<br><span class="muted">${esc(g.stopGuardVersion)} · ${pc(g.stopGuardPenetrationCents || 0)} through danger${g.stopGuardDeadlineMs ? ` · ${duration(Math.max(0, Number(g.stopGuardDeadlineMs) - Date.now()))} left` : ''}</span>` : '';
  return `<span class="guard ${cls}">${esc(g.guardState || 'ACTIVE')}</span>${profitGuard}${stopGuard}`;
}
function dataCell(e) {
  const state = e.dataState || 'UNKNOWN';
  const fresh = state === 'LIVE' || state === 'FINALIZED';
  const age = e.quoteAgeMs == null ? '' : `<br><span class="muted">${ago(Date.now() - Number(e.quoteAgeMs))}</span>`;
  return `<span class="data-state ${fresh ? 'fresh' : 'stale'}">${esc(state)}</span>${age}`;
}
function researchCell(e) {
  const lowest = e.lowestPriceAfterEntryCents == null ? '-' : pc(e.lowestPriceAfterEntryCents);
  const toEntry = e.recoveryToEntryMs == null ? '-' : duration(e.recoveryToEntryMs);
  const toGreen = e.recoveryToGreenMs == null ? '-' : duration(e.recoveryToGreenMs);
  return `<span class="research">Low ${lowest} · MAE ${Number(e.maeCents || 0)}c (${duration(e.maeAfterEntryMs)})<br><span class="muted">Recovery→entry ${toEntry} · green ${toGreen}${e.recoveryGreenPriceCents == null ? '' : ` @ ${pc(e.recoveryGreenPriceCents)}`}</span></span>`;
}
function renderTrades(s) {
  const p = s.performance, fee = Number(s.settings.simFeeCents || 2);
  $('openHunterCount').textContent = `(${s.openHunters.length})`;
  $('hunterSummary').textContent = `Total: ${p.open + p.closed} Wins: ${p.wins} Losses: ${p.losses} Scratches: ${p.scratches} | Realized: ${money(p.realizedCents)} | Win Rate: ${pct(p.winRate)}`;
  const profitable = s.openHunters.filter((e) => e.status === 'open' && e.dataState === 'LIVE' && Number(e.positionPnlCents ?? e.unrealizedCents) > 0);
  const profitableTotal = profitable.reduce((n, e) => n + Number(e.positionPnlCents ?? e.unrealizedCents ?? 0), 0);
  const cash = $('cashOutProfitBtn');
  cash.classList.toggle('hidden', profitable.length === 0);
  cash.disabled = profitable.length === 0;
  cash.textContent = `Cash Out Hunter Profit (${profitable.length})${profitableTotal > 0 ? ` +$${(profitableTotal / 100).toFixed(2)}` : ''}`;
  $('openHunterBody').innerHTML = s.openHunters.map((e) => `<tr><td class="ticker">${esc(e.ticker)}</td><td><strong>${esc(e.conceptName)}</strong>${e.sourceFeeder ? `<br><span class="muted">&larr; ${esc(e.sourceFeeder)}</span>` : ''}</td><td>YES</td><td>${pc(e.entryPriceCents)}</td><td>${moneyPlain(e.entryPriceCents * e.count)}</td><td>${pc(e.currentPriceCents)}</td><td>${pc(e.peakPriceCents)}</td><td>${pc(e.stopPriceCents)}</td><td>${guardCell(e)}</td><td>${Number(e.remainingCount ?? e.count).toFixed(2)}${Number(e.remainingCount ?? e.count) !== Number(e.count) ? `<br><span class="muted">of ${Number(e.count).toFixed(2)}</span>` : ''}</td><td>${vol(e.volume24h)}</td><td>${esc(String(e.mode || '').toLowerCase())}</td><td>${esc(e.status)}</td><td class="${pnlClass(e.positionPnlCents ?? e.unrealizedCents)}">${money(e.positionPnlCents ?? e.unrealizedCents)}</td><td>${dataCell(e)}</td><td>${e.gameMinutes == null ? '-' : `${e.gameMinutes}m`} ${esc(e.liveStatus || '')}</td></tr>`).join('') || '<tr><td colspan="16" class="muted">No open Hunter trades.</td></tr>';

  $('openFeederCount').textContent = `(${s.openFeeders.length})`;
  const fs = s.feederSummary || { hunters:0,wins:0,losses:0,pnlCents:0,winRate:0 };
  $('feederSummary').textContent = `Fed Hunters: ${fs.hunters} Wins: ${fs.wins} Losses: ${fs.losses} | Fed Hunter P&L: ${money(fs.pnlCents)} Win Rate: ${pct(fs.winRate)}`;
  $('openFeederBody').innerHTML = s.openFeeders.map((e) => { const ref = e.referencePnlCents == null ? (e.currentPriceCents - e.entryPriceCents) * e.count - 2 * fee * e.count : Number(e.referencePnlCents); const move = Number(e.favorableMoveCents || 0) > 0 ? `+${Number(e.favorableMoveCents)}c` : Number(e.adverseMoveCents || 0) > 0 ? `-${Number(e.adverseMoveCents)}c` : '0c'; const signalRef = e.signalPriceCents == null ? pc(e.referenceOriginCents ?? e.entryPriceCents) : `<strong>Signal ${pc(e.signalPriceCents)}</strong><br><span class="muted">Ref ${esc(e.referenceOrigin || 'origin')} ${pc(e.referenceOriginCents ?? e.entryPriceCents)}</span>`; return `<tr><td class="ticker">${esc(e.ticker)}</td><td><strong>${esc(e.conceptName)}</strong><br><span class="muted">Move ${esc(move)}</span></td><td>YES</td><td>${signalRef}</td><td>${moneyPlain(e.entryPriceCents * e.count)}</td><td>${pc(e.currentPriceCents)}</td><td>${pc(e.peakPriceCents)}</td><td>${Number(e.count).toFixed(2)}</td><td>${vol(e.volume24h)}</td><td>${esc(String(e.mode || '').toLowerCase())}</td><td>${esc(e.status)}</td><td class="${pnlClass(ref)}">${money(ref)}<br><span class="muted">reference only</span></td><td>${dataCell(e)}</td><td>${e.gameMinutes == null ? '-' : `${e.gameMinutes}m`} ${esc(e.liveStatus || '')}</td></tr>`; }).join('') || '<tr><td colspan="14" class="muted">No open feeder signals.</td></tr>';

  $('closedCount').textContent = `(${s.closedHunters.length})`;
  $('closedSummary').textContent = `Trades: ${p.closed} Wins: ${p.wins} Losses: ${p.losses} Win Rate: ${pct(p.winRate)} Closed P&L: ${money(p.closedRealizedCents ?? p.realizedCents)}`;
  $('closedBody').innerHTML = s.closedHunters.slice(0, 250).map((e) => { const delta = e.exitPriceCents == null ? 0 : (e.currentPriceCents - e.exitPriceCents) * e.count; return `<tr><td class="ticker">${esc(e.ticker)}</td><td>${esc(e.conceptName)}${e.sourceFeeder ? `<br><span class="muted">&larr; ${esc(e.sourceFeeder)}</span>` : ''}</td><td>YES</td><td>${pc(e.entryPriceCents)}</td><td>${moneyPlain(e.entryPriceCents * e.count)}</td><td>${pc(e.exitPriceCents)}</td><td>${pc(e.currentPriceCents)}</td><td>${pc(e.peakPriceCents)}</td><td>${pc(e.stopPriceCents)}</td><td>${Number(e.count).toFixed(2)}</td><td>${esc(String(e.mode || '').toLowerCase())}</td><td>${esc(e.closeReason || '')}</td><td class="${pnlClass(e.pnlCents)}">${money(e.pnlCents)}</td><td class="${pnlClass(delta)}">${money(delta)}</td><td>${researchCell(e)}</td></tr>`; }).join('') || '<tr><td colspan="15" class="muted">No closed Hunter positions.</td></tr>';
}

function renderLearning(s) {
  const ts = s.trackerSummary || { tracked:s.trackedMarkets.length, hot:0, aboutToEnter:0, entered:0 };
  $('trackedLabel').textContent = `Tracked: ${ts.tracked}  Hot: ${ts.hot}  About to Enter: ${ts.aboutToEnter}  Entered: ${ts.entered}  Recovery watch: ${Number(ts.recovery || 0)}`;
  $('trackedBody').innerHTML = s.trackedMarkets.slice(0, 150).map((t) => `<tr><td class="ticker">${esc(t.ticker)}</td><td>${esc(t.market_title)}</td><td>${pc(t.yes_bid_cents)}</td><td>${pc(t.yes_ask_cents)}</td><td>${pc(Number(t.yes_ask_cents) - Number(t.yes_bid_cents))}</td><td>${t.trade_count}</td><td>${vol(t.volume_24h)}</td><td>${esc(t.live_status || '')}</td><td>${t.scan_count}</td><td>${ago(Number(t.last_scan_ms))}</td></tr>`).join('');
  const high = s.sports.filter((x) => x.confidence_level === 'high').length, medium = s.sports.filter((x) => x.confidence_level === 'medium').length, low = s.sports.length - high - medium;
  $('sportsLabel').textContent = `(${s.sports.length} sports - ${high} high - ${medium} medium - ${low} low)`;
  $('sportsBody').innerHTML = s.sports.map((x) => `<tr><td class="ticker">${esc(x.ticker_prefix)}</td><td>${esc(x.detected_sport_name)}</td><td>${Math.round(Number(x.typical_duration_ms) / 60000)}m</td><td>${x.min_game_minutes_for_hunter}m</td><td>${x.observation_count}</td><td>${esc(x.confidence_level)}</td><td>${esc(x.source)}</td></tr>`).join('');
  const ph = s.patterns.filter((x) => x.confidence_level === 'high').length, pm = s.patterns.filter((x) => x.confidence_level === 'medium').length;
  $('patternsLabel').textContent = `(${s.patterns.length} patterns - ${ph} high - ${pm} medium - ${s.patterns.length - ph - pm} low - ${Number(s.recoveryTracking || 0)} tracking)`;
  $('patternsBody').innerHTML = s.patterns.slice(0, 250).map((x) => `<tr><td>${esc(x.sport)}</td><td>${esc(x.entry_price_band)}</td><td>${esc(x.drop_bucket)}</td><td>${esc(x.game_minutes_bucket)}</td><td>${esc(x.trough_bucket)}</td><td>${x.total_observations}</td><td>${x.recovered_count}</td><td>${pct(x.recovery_rate)}</td><td>${esc(x.confidence_level)}</td></tr>`).join('');
}
function renderCrashLearning(s) {
  const ci = s.crashLearning || { version:'CI1', totalEpisodes:0, multipleCrashMarkets:0, activeCrashes:0, reboundConfirmed:0, states:[] };
  const episodes = s.crashEpisodes || [];
  $('crashLabel').textContent = `${ci.version || 'CI1'} · ${Number(ci.totalEpisodes || 0)} episodes · ${Number(ci.multipleCrashMarkets || 0)} multi-crash markets · ${Number(ci.activeCrashes || 0)} crashing · ${Number(ci.reboundConfirmed || 0)} rebound-confirmed`;
  $('crashBody').innerHTML = episodes.slice(0,250).map((x) => `<tr><td class="ticker">${esc(x.ticker)}</td><td>${Number(x.episode_index || 0)}</td><td>${esc(x.sport || 'Unknown')}</td><td>${pc(x.pre_crash_peak_cents)}</td><td>${pc(x.trough_cents)}</td><td>${pc(x.crash_depth_cents)}</td><td>${pc(x.rebound_cents)}</td><td>${pct(x.reclaim_rate)}</td><td>${Number(x.stable_observations || 0)}</td><td>${Number(x.upward_ticks || 0)}</td><td>${esc(x.state || '')}</td><td>${esc(x.final_result || '-')}</td></tr>`).join('') || '<tr><td colspan="12" class="muted">Crash Intelligence is learning. No persisted crash episodes yet.</td></tr>';
}

function renderScanner(s) {
  $('liveMarketsLabel').textContent = `- ${s.liveMarkets.length} active markets`;
  $('liveMarketsBody').innerHTML = s.liveMarkets.slice(0, 100).map((q) => `<tr><td class="ticker">${esc(q.ticker)}</td><td>${esc(q.title)}</td><td>${pc(q.yesBid)}</td><td>${pc(q.yesAsk)}</td><td>${pc(q.yesAsk - q.yesBid)}</td><td>${q.recentTrades || 0}</td><td>${vol(q.volume24h)}</td><td>${esc(q.liveStatus || q.status)}</td></tr>`).join('');
  $('scannerActive').textContent = `${s.scanner.activeMarkets} markets in-play - last scan ${ago(s.scanner.lastScanMs)}`;
  $('scannerDetail').textContent = `Dual-source scanner: open-market pagination plus recent-trade sports discovery. Mode: ${s.scanner.mode}.`;
  $('avgCycle').textContent = `${s.scanner.avgCycleMs || 0}ms`; $('maxCycle').textContent = `${s.scanner.maxCycleMs || 0}ms`; $('checksLoop').textContent = s.scanner.checksCompleted || 0; $('fetchFailures').textContent = s.scanner.fetchFailures || 0;
  const fresh = Boolean(s.health?.scannerFresh); const good = fresh && (s.scanner.avgCycleMs || 0) <= 2000; $('scanSpeedState').textContent = !fresh ? 'STALE' : good ? 'OK' : 'SLOW'; $('scanSpeedState').className = `pill ${good ? 'green' : 'red'}`;
  $('speedDetail').textContent = `Target ~450ms during fast exit loops - closed this loop: ${s.scanner.closedThisLoop || 0} - phase: ${s.scanner.mode}.`;
}

const SETTINGS = [
  ['maxPositions','Max Hunter positions'],
  ['maxEntriesPerTrade','Max amount of entries per trade'],
  ['hunterCooldownMinutes','Shared Hunter cooldown (min)'],
  ['minGameMinutes','Minimum minutes in-game before any Hunter'],
  ['eventCooldownMinutes','Shared feeder event cooldown (min)'],
  ['maxSpreadCents','Shared feeder max spread (cents)'],
  ['startingCapitalCents','Simulation starting capital (cents)'],
  ['simFillProbability','Simulation IOC fill probability'],
  ['simFeeCents','Simulation fee (c/contract/leg)'],
  ['recoveryTrackingHours','Recovery research tracking hours'],
];
function renderSettings(s) {
  if (!$('settingsForm').dataset.built) {
    $('settingsForm').innerHTML = SETTINGS.map(([k, l]) => `<label>${esc(l)}<input name="${k}" data-general-setting="${k}" type="number" step="any"></label>`).join('') + `<div class="muted"><strong>Exact ticker Hunter lock: ON</strong><br>Maximum one real Hunter on an exact ticker until that Hunter is fully closed. Pegasus/Sagittarius/Dragon/Golden Dragon feeder signals are exempt.</div>`;
    $('settingsForm').dataset.built = '1';
  }
  for (const [k] of SETTINGS) {
    const i = $('settingsForm').elements[k];
    const value = GENERAL_DRAFTS.has(k) ? GENERAL_DRAFTS.get(k) : (s.settings[k] ?? '');
    if (document.activeElement !== i) i.value = value;
  }
}
function render(s) {
  STATE = s; const p = s.performance;
  $('title').textContent = `Sagittarius - ${s.settings.systemName}`;
  $('portfolioValue').textContent = moneyPlain(p.portfolioValueCents); $('winRate').textContent = pct(p.winRate); setPnl('unrealized', p.unrealizedCents); setPnl('realized', p.realizedCents); $('simFreeCash').textContent = p.simulationCashCents == null ? '-' : moneyPlain(p.simulationCashCents);
  setPnl('todayPnl', periodPnl(s.closedHunters, madridBoundary('day'))); setPnl('weekPnl', periodPnl(s.closedHunters, madridBoundary('week'))); setPnl('monthPnl', periodPnl(s.closedHunters, madridBoundary('month'))); setPnl('yearPnl', periodPnl(s.closedHunters, madridBoundary('year')));
  const live = s.settings.mode === 'LIVE' && s.settings.liveArmed;
  $('modeBtn').textContent = live ? 'LIVE ENABLED' : s.settings.mode === 'LIVE' ? 'ENABLE LIVE' : 'SIMULATION'; $('modeBtn').className = `btn ${live ? 'primary' : 'danger'}`;
  $('modeNote').textContent = live ? 'Real Kalshi orders are armed.' : s.settings.mode === 'LIVE' ? 'LIVE is selected but disarmed after restart.' : 'Paper trading - no real orders. Disable live trading to use simulation.';
  $('engineBtn').textContent = s.settings.engineActive ? 'Stop Engine' : 'Start Engine'; $('engineStatus').textContent = s.settings.engineActive ? 'Engine running' : 'Entries stopped'; $('engineStatus').className = `pill ${s.settings.engineActive ? 'green' : 'amber'}`;
  const h = s.health; $('systemStatus').textContent = h.degraded ? 'Degraded' : 'Running'; $('systemStatus').className = `pill ${h.degraded ? 'red' : 'green'}`;
  const a = s.athena || {};
  $('athenaStatus').textContent = a.ready ? `${a.coverageState === 'PARTIAL' ? 'Partial' : 'Ready'} - ${String(a.brainHash || '').slice(0,12)}` : 'Neutral fallback - brain unavailable';
  $('athenaDetail').textContent = a.ready
    ? `ATHENA-B1 | coverage ${a.coverageState || 'unknown'}${a.missingEvidenceFamilies?.length ? ` (missing: ${a.missingEvidenceFamilies.join(', ')})` : ''} | ${a.profileCount || 0} profiles | ${a.sources?.crashEpisodes || 0} crash episodes | ${a.sources?.frozenCrashSignals || 0} frozen crash signals | ${a.sources?.recoveryObservations || 0} recovery observations | ${a.sources?.profitEpisodes || 0} profit episodes | adaptive weight 0 | ${a.assessments || 0} assessments / ${a.blocks || 0} vetoes.`
    : `ATHENA-B1 is not ready (${a.loadError || 'no valid brain'}). Existing Hunter doctrine remains available because Athena's unavailable-data policy is neutral pass.`;
  $('uptime').textContent = `Session ${Math.floor((Date.now() - h.startedAtMs) / 3600000)}h ${Math.floor((Date.now() - h.startedAtMs) % 3600000 / 60000)}m - REST ${h.restOk ? 'OK' : 'DOWN'} - WS ${h.websocketFresh ? `OK ${ago(h.lastWsMessageMs)}` : 'STALE'} - Reconcile ${h.reconciliationOk ? 'OK' : 'CHECK'} - ProfitGuard ${h.protectionFresh ? `OK ${ago(h.lastProtectionMs)}` : 'STALE'} - Scanner ${h.scannerFresh ? `OK ${ago(h.lastFullScanMs)}` : 'STALE'}`;
  const errors = (s.audit || []).filter((x) => x.level === 'error' && Date.now() - Date.parse(x.ts) < 10 * 60 * 1000); $('errorWatchdog').classList.toggle('hidden', !errors.length); if (errors.length) $('errorWatchdog').innerHTML = `<strong>Error Watchdog - ${errors.length} recent errors</strong><br>${esc(errors[0].event)}: ${esc(errors[0].data?.message || '')}`;
  const scanFresh = Number(s.scanner.lastScanMs || 0) > 0 && Date.now() - Number(s.scanner.lastScanMs) < 10 * 60 * 1000;
  $('entryRunning').textContent = scanFresh ? 'Running' : 'Waiting'; $('entryRunning').className = `pill ${scanFresh ? 'green' : 'amber'}`;
  renderCharts(s); renderSettings(s); renderConcepts(s); renderTrades(s); renderLearning(s); renderCrashLearning(s); renderScanner(s);
  $('systemNameInput').value = s.settings.systemName; $('connectionPill').textContent = h.restOk && h.websocketFresh ? 'Connected' : 'Connection check'; $('connectionPill').className = `pill ${h.restOk && h.websocketFresh ? 'green' : 'amber'}`;
}
async function load() { try { const r = await fetch('/api/state'); render(await r.json()); } catch (e) { console.error(e); } }

$('conceptBody').oninput = (e) => {
  const input = e.target.closest('[data-setting-key]');
  if (!input) return;
  MODEL_DRAFTS.set(input.dataset.settingKey, input.value);
};
$('conceptBody').onclick = async (e) => {
  const save = e.target.closest('[data-model-save]');
  if (save) {
    const row = save.closest('tr');
    const data = {};
    for (const input of row.querySelectorAll('[data-setting-key]')) data[input.dataset.settingKey] = Number(input.value);
    save.disabled = true;
    try {
      const fresh = await patchSettingsVerified(data);
      for (const key of Object.keys(data)) MODEL_DRAFTS.delete(key);
      save.blur(); render(fresh); msg(`${save.dataset.modelSave} settings saved and verified.`);
    }
    catch (x) { msg(x.message, true); }
    finally { save.disabled = false; }
    return;
  }
  const btn = e.target.closest('[data-model-key]');
  if (!btn) return;
  const key = btn.dataset.modelKey, name = btn.dataset.modelName || 'Model';
  if (!key) return;
  const enable = btn.dataset.enabled !== 'true';
  btn.disabled = true;
  try {
    await patch('/api/settings', { [key]:enable });
    btn.blur(); await load();
    msg(enable ? `${name} enabled for new signals/entries.` : `${name} disabled for new signals/entries. Existing Hunter positions remain protected.`);
  } catch (x) { msg(x.message, true); } finally { btn.disabled = false; }
};

$('modeBtn').onclick = async () => { try { if (STATE.settings.mode === 'LIVE' && STATE.settings.liveArmed) { await post('/api/mode', { mode:'SIMULATION' }); msg('Switched to SIMULATION. Existing owned LIVE positions remain protected.'); } else { const phrase = prompt('Type ENABLE LIVE TRADING to arm real Kalshi orders.'); if (phrase == null) return; await post('/api/mode', { mode:'LIVE', confirmation:phrase }); msg('LIVE trading armed.'); } await load(); } catch (e) { msg(e.message, true); } };
$('engineBtn').onclick = async () => { try { await post('/api/engine', { active:!STATE.settings.engineActive }); await load(); } catch (e) { msg(e.message, true); } };
$('scanBtn').onclick = $('modelScanBtn').onclick = async () => { try { await post('/api/run-scan'); msg('Scan requested.'); } catch (e) { msg(e.message, true); } };
$('resetDashboardBtn').onclick = async () => { if (!confirm('Reset dashboard performance period from now? Trades are not deleted.')) return; try { await post('/api/reset-dashboard'); await load(); msg('Dashboard performance baseline reset.'); } catch (e) { msg(e.message, true); } };
$('resetSimulationBtn').onclick = async () => { if (!confirm('Archive all current simulation records and reset simulation tracking?')) return; try { await post('/api/reset-simulation'); await load(); msg('Simulation records archived.'); } catch (e) { msg(e.message, true); } };
$('cashOutProfitBtn').onclick = async () => { const b = $('cashOutProfitBtn'); const old = b.textContent; b.disabled = true; b.textContent = 'Cashing out...'; try { const r = await post('/api/manual-cashout', { allProfitable:true }); await load(); msg(r.closedCount > 0 ? `Cashed out ${r.closedCount} position${r.closedCount === 1 ? '' : 's'} - total profit ${money(r.totalProfitCents)}` : r.pendingCount > 0 ? `${r.pendingCount} LIVE exit${r.pendingCount === 1 ? '' : 's'} committed and pending fill.` : 'No profitable positions after fees.'); } catch (e) { msg(e.message, true); } finally { b.disabled = false; if (b.textContent === 'Cashing out...') b.textContent = old; } };
$('settingsForm').oninput = (e) => { const input = e.target.closest('[data-general-setting]'); if (input) GENERAL_DRAFTS.set(input.name, input.value); };
$('settingsForm').onsubmit = async (e) => {
  e.preventDefault();
  const data = {};
  for (const [k] of SETTINGS) if (GENERAL_DRAFTS.has(k)) data[k] = Number(GENERAL_DRAFTS.get(k));
  if (!Object.keys(data).length) { msg('No shared/system setting changes to save.'); return; }
  try {
    const fresh = await patchSettingsVerified(data);
    for (const key of Object.keys(data)) GENERAL_DRAFTS.delete(key);
    render(fresh); msg('Shared/system settings saved and verified.');
  } catch (x) { msg(x.message, true); }
};
$('credentialsForm').onsubmit = async (e) => { e.preventDefault(); try { if ($('systemNameInput').value && $('systemNameInput').value !== STATE.settings.systemName) await patch('/api/settings', { systemName:$('systemNameInput').value }); const keyId = $('apiKeyInput').value.trim(), privateKeyPem = $('privateKeyInput').value.trim(); if (keyId && privateKeyPem) await post('/api/credentials', { keyId, privateKeyPem }); else if (keyId || privateKeyPem) throw new Error('Enter both API Key ID and private key PEM.'); await load(); msg(keyId ? 'Credentials saved and connection verified.' : 'System name saved.'); $('privateKeyInput').value = ''; } catch (x) { msg(x.message, true); } };
$('testConnectionBtn').onclick = async () => { try { await post('/api/test-connection'); await load(); msg('Kalshi REST authentication successful.'); } catch (e) { msg(e.message, true); } };
$('athenaRebuildBtn').onclick = async () => {
  if (!confirm('Rebuild Athena B1 from the complete current historical database? This requires SIMULATION, LIVE disarmed, the engine stopped, and no active real Hunters.')) return;
  try {
    const r = await post('/api/athena/rebuild');
    await load();
    msg(`Athena brain rebuilt and frozen: ${String(r.athena?.brainHash || '').slice(0,12)} (${r.athena?.coverageState || 'unknown coverage'})`);
  } catch (e) { msg(e.message, true); }
};
$('athenaInstallBtn').onclick = async () => {
  const f = $('athenaFileInput').files?.[0];
  if (!f) return msg('Choose an Athena brain JSON file first.', true);
  if (!confirm('Install this Athena B1 brain? The system must be in SIMULATION, LIVE disarmed, engine stopped, with no active real Hunters.')) return;
  try {
    const payload = JSON.parse(await f.text());
    const r = await post('/api/athena/install', payload);
    $('athenaFileInput').value = '';
    await load();
    msg(`Athena brain installed and validated: ${String(r.athena?.brainHash || '').slice(0,12)}`);
  } catch (e) { msg(e.message, true); }
};
function clock() { const d = new Date(); $('madridClock').textContent = new Intl.DateTimeFormat('en-GB', { timeZone:'Europe/Madrid', weekday:'long', hour:'2-digit', minute:'2-digit', second:'2-digit', day:'2-digit', month:'long' }).format(d) + ' Europe/Madrid'; }
setInterval(clock, 1000); clock(); load();
const es = new EventSource('/api/events'); es.onmessage = (e) => { try { render(JSON.parse(e.data)); } catch {} }; es.onerror = () => {};
