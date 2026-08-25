import { createHash, createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const num = (name, fallback) => {
  const v = Number(process.env[name]);
  return Number.isFinite(v) ? v : fallback;
};
const bool = (name, fallback) => {
  const v = process.env[name];
  return v == null ? fallback : /^(1|true|yes|on)$/i.test(v);
};
const pem = (v='') => String(v).replace(/\\n/g, '\n').trim();

export const RELEASE = 'SAGITTARIUS-R44-ATOMIC-THUNDER-R41-STOP-RESTORE-2026-08-26';

export const env = Object.freeze({
  port: num('PORT', 3000),
  databaseUrl: process.env.DATABASE_URL || '',
  kalshiApiKeyId: process.env.KALSHI_API_KEY_ID || '',
  kalshiPrivateKeyPem: pem(process.env.KALSHI_PRIVATE_KEY_PEM || ''),
  kalshiBaseUrl: (process.env.KALSHI_BASE_URL || 'https://api.elections.kalshi.com/trade-api/v2').replace(/\/$/, ''),
  kalshiFallbackBaseUrl: (process.env.KALSHI_FALLBACK_BASE_URL || 'https://external-api.kalshi.com/trade-api/v2').replace(/\/$/, ''),
  kalshiWsUrl: process.env.KALSHI_WS_URL || 'wss://external-api-ws.kalshi.com/trade-api/ws/v2',
  kalshiFallbackWsUrl: process.env.KALSHI_FALLBACK_WS_URL || 'wss://api.elections.kalshi.com/trade-api/ws/v2',
  defaultEngineMode: String(process.env.DEFAULT_ENGINE_MODE || 'SIMULATION').toUpperCase() === 'LIVE' ? 'LIVE' : 'SIMULATION',
  allowLiveTrading: bool('ALLOW_LIVE_TRADING', false),
  systemName: process.env.SYSTEM_NAME || 'SAGITTARIUS',
  ownerId: process.env.SYSTEM_OWNER_ID || 'sagittarius-main',
});

export const CANONICAL_NUMERIC_SETTINGS = Object.freeze([
  // Shared/system controls only.
  'maxPositions',
  'maxEntriesPerTrade',
  'hunterCooldownMinutes',
  'minGameMinutes',
  'eventCooldownMinutes',
  'maxSpreadCents',
  'startingCapitalCents',
  'simFillProbability',
  'simFeeCents',
  'recoveryTrackingHours',

  // Atomic Thunder per-Hunter profit-harvest controls.
  'atomicThunderMinNetPerOriginalContractCents',
  'atomicThunderRequiredConfirmations',
  'atomicThunderMaximumBookAgeMs',
  'atomicThunderConfirmationWindowMs',

  // Pegasus reference-feeder controls.
  'pegasusReferenceStakeCents',
  'pegasusMinPriceCents',
  'pegasusMaxPriceCents',
  'pegasusDropCents',

  // Sagittarius reference-feeder controls.
  'sagittariusReferenceStakeCents',
  'sagittariusMinPriceCents',
  'sagittariusMaxPriceCents',
  'sagittariusDropCents',

  // Dragon crash-intelligence reference-feeder controls.
  'dragonReferenceStakeCents',
  'dragonMinSignalPriceCents',
  'dragonMaxSignalPriceCents',
  'dragonMaxEpisode',
  'goldenDragonReferenceStakeCents',
  'goldenDragonMinSignalPriceCents',
  'goldenDragonMaxSignalPriceCents',
  'goldenDragonMaxEpisode',
  'goldenDragonMinCrashCents',
  'goldenDragonMinReboundCents',
  'goldenDragonMinReclaimRate',
  'goldenDragonStableObservations',
  'goldenDragonUpwardTicks',
  'goldenDragonMinTrustScore',
  'goldenDragonMinRecoveryAgeSeconds',
  'goldenDragonMaxRecoveryAgeSeconds',

  // Momentum Hunter controls.
  'momentumStakeCents',
  'momentumMinEntryCents',
  'momentumMaxEntryCents',
  'momentumHunterStopLossCents',
  'momentumMinRiseCents',
  'momentumMinPullbackCents',
  'momentumMaxPullbackCents',
  'momentumMaxSpreadCents',
  'momentumMinTimeLeftMinutes',
  'recoveryMinObservations',
  'recoveryMinRate',

  // Wave Surfer controls.
  'waveStakeCents',
  'waveMinEntryCents',
  'waveMaxEntryCents',
  'waveStopCents',
  'waveMinFeederFavorableMoveCents',
  'waveMaxSpreadCents',

  // Recovery Hunter controls. Recovery stake remains 2x the configured base.
  'recoveryBaseStakeCents',
  'recoveryMinEntryCents',
  'recoveryMaxEntryCents',
  'recoveryHunterStopLossCents',
  'recoveryMinReboundCents',

  // Crash Recovery Hunter controls. Crash Intelligence learns regardless of
  // whether the exposure-creating Hunter is enabled.
  'crashRecoveryStakeCents',
  'crashRecoveryMinEntryCents',
  'crashRecoveryMaxEntryCents',
  'crashRecoveryStopLossCents',
  'crashRecoveryMaxSpreadCents',
  'crashRecoveryMinCrashCents',
  'crashRecoveryMinReboundCents',
  'crashRecoveryMinReclaimRate',
  'crashRecoveryStableObservations',
  'crashRecoveryUpwardTicks',
  'crashRecoveryEpisodeResetRate',

  // Dragon Recovery Hunter controls.
  'dragonRecoveryStakeCents',
  'dragonRecoveryMinEntryCents',
  'dragonRecoveryMaxEntryCents',
  'dragonRecoveryStopLossCents',
  'dragonRecoveryMaxSpreadCents',
  'dragonRecoveryMinReboundCents',
  'dragonRecoveryMinReclaimRate',
  'dragonRecoveryStableObservations',
  'dragonRecoveryUpwardTicks',

  // Golden Dragon Hunter controls. The feeder's research universe remains
  // separate from this tighter real-capital envelope.
  'goldenDragonHunterStakeCents',
  'goldenDragonHunterMinEntryCents',
  'goldenDragonHunterMaxEntryCents',
  'goldenDragonHunterStopLossCents',
  'goldenDragonHunterMaxSpreadCents',
  'goldenDragonHunterMinTrustScore',
  'goldenDragonHunterMaxEpisode',
  'goldenDragonHunterMinReboundCents',
  'goldenDragonHunterMinReclaimRate',
  'goldenDragonHunterStableObservations',
  'goldenDragonHunterUpwardTicks',

  'resetTimestampMs',
]);

export const CANONICAL_BOOLEAN_SETTINGS = Object.freeze([
  'engineActive',
  'pegasusEnabled',
  'sagittariusEnabled',
  'dragonEnabled',
  'goldenDragonEnabled',
  'momentumHunterEnabled',
  'waveSurferEnabled',
  'recoveryHunterEnabled',
  'crashRecoveryHunterEnabled',
  'dragonRecoveryHunterEnabled',
  'goldenDragonHunterEnabled',
  'goldenEyeEnabled',
  'goldenEyeLiveEnabled',
  'atomicThunderEnabled',
]);

export const EDITABLE_NUMERIC_SETTINGS = Object.freeze(CANONICAL_NUMERIC_SETTINGS.filter((k) => k !== 'resetTimestampMs'));
export const EDITABLE_BOOLEAN_SETTINGS = Object.freeze(CANONICAL_BOOLEAN_SETTINGS.filter((k) => k !== 'engineActive'));

// R10 has one authoritative home for every setting. Legacy shared stake keys are
// accepted only while loading an older persisted record so they can be migrated
// into model-owned settings; they are never emitted back into runtime settings.
export function originalSettings() {
  return {
    systemName: env.systemName,
    ownerId: env.ownerId,
    mode: env.defaultEngineMode,
    liveArmed: false,
    engineActive: true,
    pegasusEnabled: true,
    sagittariusEnabled: true,
    dragonEnabled: false,
    goldenDragonEnabled: false,
    momentumHunterEnabled: true,
    waveSurferEnabled: true,
    recoveryHunterEnabled: true,
    crashRecoveryHunterEnabled: false,
    dragonRecoveryHunterEnabled: false,
    goldenDragonHunterEnabled: false,
    goldenEyeEnabled: true,
    goldenEyeLiveEnabled: false,
    atomicThunderEnabled: true,

    maxPositions: 8,
    maxEntriesPerTrade: 8,
    hunterCooldownMinutes: 0,
    minGameMinutes: 20,
    eventCooldownMinutes: 1,
    maxSpreadCents: 3,
    startingCapitalCents: 100000,
    simFillProbability: 0.75,
    simFeeCents: 2,
    recoveryTrackingHours: 24,
    atomicThunderMinNetPerOriginalContractCents: 1,
    atomicThunderRequiredConfirmations: 2,
    atomicThunderMaximumBookAgeMs: 1000,
    atomicThunderConfirmationWindowMs: 3000,

    pegasusReferenceStakeCents: 3000,
    pegasusMinPriceCents: 80,
    pegasusMaxPriceCents: 94,
    pegasusDropCents: 2,

    sagittariusReferenceStakeCents: 3000,
    sagittariusMinPriceCents: 80,
    sagittariusMaxPriceCents: 94,
    sagittariusDropCents: 1,

    dragonReferenceStakeCents: 3000,
    dragonMinSignalPriceCents: 84,
    dragonMaxSignalPriceCents: 88,
    dragonMaxEpisode: 2,
    goldenDragonReferenceStakeCents: 3000,
    goldenDragonMinSignalPriceCents: 27,
    goldenDragonMaxSignalPriceCents: 95,
    goldenDragonMaxEpisode: 4,
    goldenDragonMinCrashCents: 15,
    goldenDragonMinReboundCents: 15,
    goldenDragonMinReclaimRate: 0.55,
    goldenDragonStableObservations: 5,
    goldenDragonUpwardTicks: 3,
    goldenDragonMinTrustScore: 72,
    goldenDragonMinRecoveryAgeSeconds: 30,
    goldenDragonMaxRecoveryAgeSeconds: 240,

    momentumStakeCents: 20000,
    momentumMinEntryCents: 76,
    momentumMaxEntryCents: 94,
    momentumHunterStopLossCents: 10,
    momentumMinRiseCents: 2,
    momentumMinPullbackCents: 1,
    momentumMaxPullbackCents: 12,
    momentumMaxSpreadCents: 3,
    momentumMinTimeLeftMinutes: 3,
    recoveryMinObservations: 1,
    recoveryMinRate: 0.2,

    waveStakeCents: 20000,
    waveMinEntryCents: 86,
    waveMaxEntryCents: 92,
    waveStopCents: 14,
    waveMinFeederFavorableMoveCents: 8,
    waveMaxSpreadCents: 3,

    recoveryBaseStakeCents: 20000,
    recoveryMinEntryCents: 76,
    recoveryMaxEntryCents: 94,
    recoveryHunterStopLossCents: 10,
    recoveryMinReboundCents: 5,

    // CRH1 settings selected by the reconstructed crash-episode simulation.
    crashRecoveryStakeCents: 20000,
    crashRecoveryMinEntryCents: 70,
    crashRecoveryMaxEntryCents: 89,
    crashRecoveryStopLossCents: 35,
    crashRecoveryMaxSpreadCents: 3,
    crashRecoveryMinCrashCents: 15,
    crashRecoveryMinReboundCents: 7,
    crashRecoveryMinReclaimRate: 0.40,
    crashRecoveryStableObservations: 3,
    crashRecoveryUpwardTicks: 2,
    crashRecoveryEpisodeResetRate: 0.80,

    dragonRecoveryStakeCents: 20000,
    dragonRecoveryMinEntryCents: 27,
    dragonRecoveryMaxEntryCents: 60,
    dragonRecoveryStopLossCents: 35,
    dragonRecoveryMaxSpreadCents: 3,
    dragonRecoveryMinReboundCents: 15,
    dragonRecoveryMinReclaimRate: 0.55,
    dragonRecoveryStableObservations: 5,
    dragonRecoveryUpwardTicks: 3,

    goldenDragonHunterStakeCents: 20000,
    goldenDragonHunterMinEntryCents: 55,
    goldenDragonHunterMaxEntryCents: 89,
    goldenDragonHunterStopLossCents: 35,
    goldenDragonHunterMaxSpreadCents: 3,
    goldenDragonHunterMinTrustScore: 80,
    goldenDragonHunterMaxEpisode: 2,
    goldenDragonHunterMinReboundCents: 15,
    goldenDragonHunterMinReclaimRate: 0.55,
    goldenDragonHunterStableObservations: 5,
    goldenDragonHunterUpwardTicks: 3,

    resetTimestampMs: null,
  };
}

// R44 fresh-install profile. This remains separate from originalSettings() so
// persisted deployments preserve their settings while a brand-new database
// boots safely in SIMULATION with the current reference/Hunter lane.
export function freshInstallSettings() {
  return {
    ...originalSettings(),
    // Fresh installs are always SIMULATION regardless of deployment defaults.
    // LIVE remains available only through the explicit runtime arm flow.
    mode:'SIMULATION',
    liveArmed:false,
    pegasusEnabled:true,
    sagittariusEnabled:false,
    dragonEnabled:false,
    goldenDragonEnabled:false,
    momentumHunterEnabled:false,
    waveSurferEnabled:true,
    recoveryHunterEnabled:false,
    crashRecoveryHunterEnabled:false,
    dragonRecoveryHunterEnabled:false,
    goldenDragonHunterEnabled:false,
    goldenEyeEnabled:true,
    goldenEyeLiveEnabled:false,
    maxPositions:20,
    maxEntriesPerTrade:3,
    hunterCooldownMinutes:45,
    minGameMinutes:30,
    startingCapitalCents:1_000_000,
    pegasusReferenceStakeCents:3000,
    pegasusMinPriceCents:27,
    pegasusMaxPriceCents:89,
    pegasusDropCents:1,
    waveStakeCents:20_000,
    waveMinEntryCents:27,
    waveMaxEntryCents:89,
    waveStopCents:35,
    waveMinFeederFavorableMoveCents:1,
    waveMaxSpreadCents:3,
  };
}

export function normalizeStartupExecutionMode(settings = {}, allowLiveTrading = env.allowLiveTrading) {
  const current = settings && typeof settings === 'object' ? { ...settings } : {};
  // A persisted LIVE selection is impossible to execute when deployment policy
  // explicitly disables LIVE trading. Recover deterministically to SIMULATION
  // while preserving engineActive and every strategy setting. If LIVE is
  // deployment-authorized, remain fail-closed and disarmed after restart; the
  // operator must explicitly re-arm it.
  if (String(current.mode || '').toUpperCase() === 'LIVE' && allowLiveTrading !== true) {
    return { settings: { ...current, mode:'SIMULATION', liveArmed:false }, recovered:true, reason:'live_trading_disabled' };
  }
  return { settings: { ...current, liveArmed:false }, recovered:false, reason:null };
}

export function sanitizeRuntimeSettings(value = {}, defaults = originalSettings()) {
  const raw = value && typeof value === 'object' ? value : {};
  // One-time compatibility bridge from R9 and earlier. These aliases are not
  // canonical and disappear immediately after the first R10 save.
  const src = { ...raw };
  if (!Object.hasOwn(src, 'pegasusReferenceStakeCents') && Object.hasOwn(src, 'feederStakeCents')) src.pegasusReferenceStakeCents = src.feederStakeCents;
  if (!Object.hasOwn(src, 'sagittariusReferenceStakeCents') && Object.hasOwn(src, 'feederStakeCents')) src.sagittariusReferenceStakeCents = src.feederStakeCents;
  if (!Object.hasOwn(src, 'momentumStakeCents') && Object.hasOwn(src, 'hunterStakeCents')) src.momentumStakeCents = src.hunterStakeCents;
  if (!Object.hasOwn(src, 'recoveryBaseStakeCents') && Object.hasOwn(src, 'hunterStakeCents')) src.recoveryBaseStakeCents = src.hunterStakeCents;
  if (!Object.hasOwn(src, 'waveStakeCents') && Object.hasOwn(src, 'stakeCents')) src.waveStakeCents = src.stakeCents;

  // Fresh installs intentionally boot into the System 6 flood experiment, but
  // an older persisted deployment must never gain a newly-enabled risk concept
  // simply because R27 changed fresh defaults.
  const hasPersistedRecord=Object.keys(raw).length>0;
  const migrationFailSafeOff=new Set(['dragonEnabled','goldenDragonEnabled','crashRecoveryHunterEnabled','dragonRecoveryHunterEnabled','goldenDragonHunterEnabled','goldenEyeEnabled','goldenEyeLiveEnabled']);
  const looksLikeSystem6Flood=hasPersistedRecord
    && raw.goldenDragonEnabled===true && raw.goldenDragonHunterEnabled===true
    && Number(raw.goldenDragonMaxEpisode||0)>=10
    && Number(raw.goldenDragonMinRecoveryAgeSeconds||Infinity)<=3
    && Number(raw.goldenDragonMaxRecoveryAgeSeconds||0)>=420
    && Number(raw.goldenDragonHunterMinEntryCents||0)<=45
    && Number(raw.goldenDragonHunterMinTrustScore||0)<=72;
  const legacyGoldenStructure={
    goldenDragonMinCrashCents:15,goldenDragonMinReboundCents:15,goldenDragonMinReclaimRate:.55,
    goldenDragonStableObservations:5,goldenDragonUpwardTicks:3,
  };
  if(hasPersistedRecord&&!looksLikeSystem6Flood){
    for(const [key,value] of Object.entries(legacyGoldenStructure)) if(!Object.hasOwn(src,key)) src[key]=value;
  }
  // Preserve the historical System 6 flood cohort explicitly instead of
  // relying on whichever fresh-install profile happens to be current.
  if(hasPersistedRecord&&looksLikeSystem6Flood){
    const system6GoldenStructure={
      goldenDragonMinCrashCents:15,goldenDragonMinReboundCents:7,goldenDragonMinReclaimRate:.40,
      goldenDragonStableObservations:3,goldenDragonUpwardTicks:2,
    };
    for(const [key,value] of Object.entries(system6GoldenStructure)) if(!Object.hasOwn(src,key)) src[key]=value;
  }

  const out = { ...defaults };
  for (const key of CANONICAL_NUMERIC_SETTINGS) {
    if (!Object.hasOwn(src, key)) continue;
    if (key === 'resetTimestampMs' && src[key] == null) { out[key] = null; continue; }
    const v = Number(src[key]);
    if (Number.isFinite(v)) out[key] = v;
  }
  for (const key of CANONICAL_BOOLEAN_SETTINGS) {
    if (!Object.hasOwn(src, key)) {
      if(hasPersistedRecord&&migrationFailSafeOff.has(key)) out[key]=false;
      continue;
    }
    out[key] = typeof src[key] === 'boolean' ? src[key] : /^(1|true|yes|on)$/i.test(String(src[key]));
  }
  if (Object.hasOwn(src, 'systemName') && String(src.systemName).trim()) out.systemName = String(src.systemName).trim();
  if (Object.hasOwn(src, 'ownerId') && String(src.ownerId).trim()) out.ownerId = String(src.ownerId).trim();
  if (Object.hasOwn(src, 'mode')) out.mode = String(src.mode).toUpperCase() === 'LIVE' ? 'LIVE' : 'SIMULATION';
  // R44 Atomic Thunder migration: a persisted SIMULATION repository adopts
  // the new profit-harvest authority by default, while a persisted LIVE
  // repository remains fail-closed until the operator explicitly enables it.
  if (hasPersistedRecord && !Object.hasOwn(src, 'atomicThunderEnabled')) out.atomicThunderEnabled = out.mode === 'SIMULATION';
  out.atomicThunderMinNetPerOriginalContractCents = Math.max(0.01, Number(out.atomicThunderMinNetPerOriginalContractCents) || 0.01);
  out.atomicThunderRequiredConfirmations = Math.max(1, Math.floor(Number(out.atomicThunderRequiredConfirmations) || 1));
  out.atomicThunderMaximumBookAgeMs = Math.max(100, Math.floor(Number(out.atomicThunderMaximumBookAgeMs) || 100));
  out.atomicThunderConfirmationWindowMs = Math.max(250, Math.floor(Number(out.atomicThunderConfirmationWindowMs) || 250));
  // R37 Golden Eye is safe to auto-enable only for an already-persisted
  // SIMULATION deployment. LIVE upgrades remain fail-closed until the operator
  // explicitly enables goldenEyeLiveEnabled in addition to normal LIVE arming.
  if (hasPersistedRecord && !Object.hasOwn(src, 'goldenEyeEnabled')) out.goldenEyeEnabled = out.mode === 'SIMULATION';
  if (hasPersistedRecord && !Object.hasOwn(src, 'goldenEyeLiveEnabled')) out.goldenEyeLiveEnabled = false;
  // R27 GPI3 migration truthfulness: Golden consumes CI1-created crash
  // episodes, so a persisted Golden min-crash below CI1's detector floor was
  // never executable. Normalize the displayed/persisted Golden floor upward to
  // the real upstream floor without changing effective legacy behavior.
  if (out.goldenDragonEnabled === true && Number(out.goldenDragonMinCrashCents) < Number(out.crashRecoveryMinCrashCents)) {
    out.goldenDragonMinCrashCents = Number(out.crashRecoveryMinCrashCents);
  }
  out.liveArmed = false;
  return out;
}

export function deploymentConfigRecord() {
  return {
    release: RELEASE,
    KALSHI_API_KEY_ID: env.kalshiApiKeyId,
    KALSHI_PRIVATE_KEY_PEM: env.kalshiPrivateKeyPem ? '[configured]' : '',
    KALSHI_BASE_URL: env.kalshiBaseUrl,
    DEFAULT_ENGINE_MODE: env.defaultEngineMode,
    ALLOW_LIVE_TRADING: env.allowLiveTrading,
  };
}

function secretKey() {
  if (!env.databaseUrl) throw new Error('DATABASE_URL is required');
  return createHash('sha256').update(`${env.databaseUrl}|${env.ownerId}|SAGITTARIUS-PDF-PARITY-v2`).digest();
}
export function encryptSecret(value) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', secretKey(), iv);
  const enc = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  return `${iv.toString('base64')}.${cipher.getAuthTag().toString('base64')}.${enc.toString('base64')}`;
}
export function decryptSecret(value) {
  const [iv, tag, data] = String(value || '').split('.');
  if (!iv || !tag || !data) throw new Error('Invalid encrypted secret');
  const d = createDecipheriv('aes-256-gcm', secretKey(), Buffer.from(iv, 'base64'));
  d.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([d.update(Buffer.from(data, 'base64')), d.final()]).toString('utf8');
}
