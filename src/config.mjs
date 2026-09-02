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

export const RELEASE = 'SAGITTARIUS-R63-GEMINI-ANOTHER-DIMENSION-LIVE-PARITY-2026-08-31';

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
  // Shared/system safety + simulation controls.
  'maxPositions',
  'maxEntriesPerTrade',
  'hunterCooldownMinutes',
  'minGameMinutes',
  'maxGameMinutes',
  'eventCooldownMinutes',
  'maxSpreadCents',
  'startingCapitalCents',
  'simFillProbability',
  'simFeeCents',
  'recoveryTrackingHours',

  // Atomic Thunder -- operator-editable favorable move required from a shadow Cosmo trade.
  'atomicThunderGreenTriggerCents',

  // Infinity Break -- sole profit authority for new-generation positions.
  'infinityBreakMinNetPerOriginalContractCents',
  'infinityBreakRequiredConfirmations',
  'infinityBreakMaximumBookAgeMs',
  'infinityBreakConfirmationWindowMs',

  // Aurora Execution -- operator-controlled economic damage envelope.
  'auroraDamageControlPercent',

  // Pegasus/Dragon/Phoenix remain reference-only Cosmos controls.
  'pegasusReferenceStakeCents',
  'pegasusMinPriceCents',
  'pegasusMaxPriceCents',
  'pegasusDropCents',
  'dragonReferenceStakeCents',
  'dragonMinSignalPriceCents',
  'dragonMaxSignalPriceCents',
  'dragonMaxEpisode',
  'phoenixReferenceStakeCents',
  'phoenixMinPriceCents',
  'phoenixMaxPriceCents',
  'geminiReferenceStakeCents',
  'geminiMinPriceCents',
  'geminiMaxPriceCents',

  // Execution Attacks retain only stake + operator-permitted price band.
  'momentumStakeCents',
  'momentumMinEntryCents',
  'momentumMaxEntryCents',
  'waveStakeCents',
  'waveMinEntryCents',
  'waveMaxEntryCents',
  'recoveryStakeCents',
  'recoveryMinEntryCents',
  'recoveryMaxEntryCents',
  'crashRecoveryStakeCents',
  'crashRecoveryMinEntryCents',
  'crashRecoveryMaxEntryCents',
  'scarletNeedleStakeCents',
  'scarletNeedleMinEntryCents',
  'scarletNeedleMaxEntryCents',
  'scarletNeedleMaxRepeats',
  'justiceArrowStakeCents',
  'justiceArrowMinEntryCents',
  'justiceArrowMaxEntryCents',
  'athenaExclamationStakeCents',
  'athenaExclamationMinEntryCents',
  'athenaExclamationMaxEntryCents',
  'lightningPlasmaFieldStakeCents',
  'lightningPlasmaMinEntryCents',
  'lightningPlasmaMaxEntryCents',
  'lightningPlasmaMaxStrikes',

  'resetTimestampMs',
]);

export const CANONICAL_BOOLEAN_SETTINGS = Object.freeze([
  'engineActive',
  'pegasusEnabled',
  'dragonEnabled',
  'phoenixEnabled',
  'momentumHunterEnabled',
  'waveSurferEnabled',
  'recoveryHunterEnabled',
  'crashRecoveryHunterEnabled',
  'scarletNeedleEnabled',
  'geminiEnabled',
  'justiceArrowEnabled',
  'athenaExclamationEnabled',
  'lightningPlasmaEnabled',
  'galacticExplosionEnabled',
  'athenaSoulEnabled',
]);

export const EDITABLE_NUMERIC_SETTINGS = Object.freeze(CANONICAL_NUMERIC_SETTINGS.filter((k) => !['resetTimestampMs','simFillProbability'].includes(k)));
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
    dragonEnabled: true,
    phoenixEnabled: false,
    momentumHunterEnabled: true,
    waveSurferEnabled: true,
    recoveryHunterEnabled: true,
    crashRecoveryHunterEnabled: true,
    scarletNeedleEnabled: false,
    geminiEnabled: false,
    justiceArrowEnabled: false,
    athenaExclamationEnabled: false,
    lightningPlasmaEnabled: true,
    galacticExplosionEnabled: false,
    athenaSoulEnabled: false,

    maxPositions: 8,
    maxEntriesPerTrade: 8,
    hunterCooldownMinutes: 0,
    minGameMinutes: 30,
    maxGameMinutes: 60,
    eventCooldownMinutes: 1,
    maxSpreadCents: 3,
    startingCapitalCents: 100000,
    // Compatibility telemetry only. R63 SIM execution is deterministic from fresh
    // visible IOC depth and no longer applies an independent random fill lottery.
    simFillProbability: 1,
    simFeeCents: 2,
    recoveryTrackingHours: 24,

    atomicThunderGreenTriggerCents: 1,

    infinityBreakMinNetPerOriginalContractCents: 1,
    infinityBreakRequiredConfirmations: 2,
    infinityBreakMaximumBookAgeMs: 1000,
    infinityBreakConfirmationWindowMs: 3000,
    auroraDamageControlPercent: 45,

    pegasusReferenceStakeCents: 3000,
    pegasusMinPriceCents: 45,
    pegasusMaxPriceCents: 60,
    pegasusDropCents: 1,
    dragonReferenceStakeCents: 3000,
    dragonMinSignalPriceCents: 45,
    dragonMaxSignalPriceCents: 60,
    dragonMaxEpisode: 4,
    phoenixReferenceStakeCents: 3000,
    phoenixMinPriceCents: 10,
    phoenixMaxPriceCents: 50,
    geminiReferenceStakeCents: 20000,
    geminiMinPriceCents: 10,
    geminiMaxPriceCents: 89,

    momentumStakeCents: 20000,
    momentumMinEntryCents: 50,
    momentumMaxEntryCents: 60,
    waveStakeCents: 20000,
    waveMinEntryCents: 50,
    waveMaxEntryCents: 60,
    recoveryStakeCents: 20000,
    recoveryMinEntryCents: 50,
    recoveryMaxEntryCents: 60,
    crashRecoveryStakeCents: 20000,
    crashRecoveryMinEntryCents: 50,
    crashRecoveryMaxEntryCents: 60,
    scarletNeedleStakeCents: 20000,
    scarletNeedleMinEntryCents: 10,
    scarletNeedleMaxEntryCents: 89,
    scarletNeedleMaxRepeats: 1,
    justiceArrowStakeCents: 20000,
    justiceArrowMinEntryCents: 10,
    justiceArrowMaxEntryCents: 89,
    athenaExclamationStakeCents: 20000,
    athenaExclamationMinEntryCents: 50,
    athenaExclamationMaxEntryCents: 60,
    lightningPlasmaFieldStakeCents: 20000,
    lightningPlasmaMinEntryCents: 50,
    lightningPlasmaMaxEntryCents: 60,
    lightningPlasmaMaxStrikes: 3,

    resetTimestampMs: null,
  };
}

// R63-MHF1 authoritative fresh-install profile. Keep the conservative
// originalSettings() contract for legacy migrations and missing-key fallbacks,
// while a brand-new database boots with the locked 2026-08-31 running profile.
export function freshInstallSettings() {
  return {
    ...originalSettings(),
    mode:'SIMULATION',
    liveArmed:false,
    engineActive:true,
    pegasusEnabled:true,
    dragonEnabled:true,
    phoenixEnabled:true,
    momentumHunterEnabled:true,
    waveSurferEnabled:true,
    recoveryHunterEnabled:true,
    crashRecoveryHunterEnabled:true,
    scarletNeedleEnabled:true,
    geminiEnabled:false,
    justiceArrowEnabled:true,
    athenaExclamationEnabled:true,
    lightningPlasmaEnabled:true,
    galacticExplosionEnabled:true,
    athenaSoulEnabled:true,

    maxPositions:20,
    maxEntriesPerTrade:1,
    hunterCooldownMinutes:45,
    minGameMinutes:30,
    maxGameMinutes:55,
    eventCooldownMinutes:1,
    maxSpreadCents:3,
    startingCapitalCents:1_000_000,
    simFillProbability:1,
    simFeeCents:2,
    recoveryTrackingHours:24,

    atomicThunderGreenTriggerCents:5,
    infinityBreakMinNetPerOriginalContractCents:5,
    infinityBreakRequiredConfirmations:1,
    infinityBreakMaximumBookAgeMs:1000,
    infinityBreakConfirmationWindowMs:3000,
    auroraDamageControlPercent:75,

    pegasusReferenceStakeCents:3000,
    pegasusMinPriceCents:20,
    pegasusMaxPriceCents:90,
    pegasusDropCents:10,
    dragonReferenceStakeCents:3000,
    dragonMinSignalPriceCents:20,
    dragonMaxSignalPriceCents:90,
    dragonMaxEpisode:2,
    phoenixReferenceStakeCents:3000,
    phoenixMinPriceCents:20,
    phoenixMaxPriceCents:90,
    geminiReferenceStakeCents:20000,
    geminiMinPriceCents:35,
    geminiMaxPriceCents:75,

    momentumStakeCents:20000,
    momentumMinEntryCents:56,
    momentumMaxEntryCents:89,
    waveStakeCents:20000,
    waveMinEntryCents:80,
    waveMaxEntryCents:89,
    recoveryStakeCents:20000,
    recoveryMinEntryCents:56,
    recoveryMaxEntryCents:69,
    crashRecoveryStakeCents:20000,
    crashRecoveryMinEntryCents:56,
    crashRecoveryMaxEntryCents:69,
    scarletNeedleStakeCents:20000,
    scarletNeedleMinEntryCents:56,
    scarletNeedleMaxEntryCents:99,
    scarletNeedleMaxRepeats:1,
    justiceArrowStakeCents:20000,
    justiceArrowMinEntryCents:80,
    justiceArrowMaxEntryCents:89,
    athenaExclamationStakeCents:40000,
    athenaExclamationMinEntryCents:50,
    athenaExclamationMaxEntryCents:70,
    lightningPlasmaFieldStakeCents:20000,
    lightningPlasmaMinEntryCents:56,
    lightningPlasmaMaxEntryCents:69,
    lightningPlasmaMaxStrikes:1,

    resetTimestampMs:null,
  };
}

export function factoryOperatorSettingsPatch() {
  const factory = freshInstallSettings();
  const patch = {};
  for (const k of EDITABLE_NUMERIC_SETTINGS) if (Object.hasOwn(factory, k)) patch[k] = factory[k];
  for (const k of EDITABLE_BOOLEAN_SETTINGS) if (Object.hasOwn(factory, k)) patch[k] = factory[k];
  return patch;
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
  if (!Object.hasOwn(src, 'momentumStakeCents') && Object.hasOwn(src, 'hunterStakeCents')) src.momentumStakeCents = src.hunterStakeCents;
  if (!Object.hasOwn(src, 'recoveryStakeCents') && Object.hasOwn(src, 'recoveryBaseStakeCents')) src.recoveryStakeCents = Number(src.recoveryBaseStakeCents) * 2;
  if (!Object.hasOwn(src, 'recoveryStakeCents') && Object.hasOwn(src, 'hunterStakeCents')) src.recoveryStakeCents = src.hunterStakeCents;
  if (!Object.hasOwn(src, 'waveStakeCents') && Object.hasOwn(src, 'stakeCents')) src.waveStakeCents = src.stakeCents;
  // R63 rename/migration: the former Another Dimension shadow-universe toggle
  // becomes Gemini. Existing R62 deployments retain their operator state and
  // inherit the prior Great Horn-linked virtual stake/band exactly once.
  if (!Object.hasOwn(src, 'geminiEnabled') && Object.hasOwn(src, 'anotherDimensionEnabled')) src.geminiEnabled = src.anotherDimensionEnabled;
  if (!Object.hasOwn(src, 'geminiReferenceStakeCents') && Object.hasOwn(src, 'momentumStakeCents')) src.geminiReferenceStakeCents = src.momentumStakeCents;
  if (!Object.hasOwn(src, 'geminiMinPriceCents') && Object.hasOwn(src, 'momentumMinEntryCents')) src.geminiMinPriceCents = src.momentumMinEntryCents;
  if (!Object.hasOwn(src, 'geminiMaxPriceCents') && Object.hasOwn(src, 'momentumMaxEntryCents')) src.geminiMaxPriceCents = src.momentumMaxEntryCents;

  // R45 retired runtime concepts/settings are intentionally not canonical.
  // Persisted legacy keys are ignored on load, while historical trade-level
  // snapshots remain intact in sag_entries for audit and legacy protection.
  const hasPersistedRecord=Object.keys(raw).length>0;
  const migrationFailSafeOff=new Set(['dragonEnabled','phoenixEnabled','crashRecoveryHunterEnabled','scarletNeedleEnabled','geminiEnabled','justiceArrowEnabled','athenaExclamationEnabled','lightningPlasmaEnabled']);

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
  // R51 compatibility bridge: old Atomic Thunder profit settings become
  // Infinity Break settings for NEW positions. Historical rows keep their
  // creation-time Atomic Thunder snapshots and close reasons unchanged.
  if (!Object.hasOwn(src, 'infinityBreakMinNetPerOriginalContractCents') && Object.hasOwn(src, 'atomicThunderMinNetPerOriginalContractCents')) out.infinityBreakMinNetPerOriginalContractCents = Number(src.atomicThunderMinNetPerOriginalContractCents);
  if (!Object.hasOwn(src, 'infinityBreakRequiredConfirmations') && Object.hasOwn(src, 'atomicThunderRequiredConfirmations')) out.infinityBreakRequiredConfirmations = Number(src.atomicThunderRequiredConfirmations);
  if (!Object.hasOwn(src, 'infinityBreakMaximumBookAgeMs') && Object.hasOwn(src, 'atomicThunderMaximumBookAgeMs')) out.infinityBreakMaximumBookAgeMs = Number(src.atomicThunderMaximumBookAgeMs);
  if (!Object.hasOwn(src, 'infinityBreakConfirmationWindowMs') && Object.hasOwn(src, 'atomicThunderConfirmationWindowMs')) out.infinityBreakConfirmationWindowMs = Number(src.atomicThunderConfirmationWindowMs);
  out.atomicThunderGreenTriggerCents = Math.max(1, Math.min(99, Math.floor(Number(out.atomicThunderGreenTriggerCents) || 1)));
  out.infinityBreakMinNetPerOriginalContractCents = Math.max(0.01, Number(out.infinityBreakMinNetPerOriginalContractCents) || 0.01);
  out.infinityBreakRequiredConfirmations = Math.max(1, Math.floor(Number(out.infinityBreakRequiredConfirmations) || 1));
  out.infinityBreakMaximumBookAgeMs = Math.max(100, Math.floor(Number(out.infinityBreakMaximumBookAgeMs) || 100));
  out.infinityBreakConfirmationWindowMs = Math.max(250, Math.floor(Number(out.infinityBreakConfirmationWindowMs) || 250));
  out.auroraDamageControlPercent = Math.max(1, Math.min(95, Number(out.auroraDamageControlPercent) || 45));
  out.scarletNeedleMaxRepeats = Math.max(0, Math.min(100, Math.floor(Number(out.scarletNeedleMaxRepeats) || 0)));
  out.lightningPlasmaMaxStrikes = Math.max(1, Math.floor(Number(out.lightningPlasmaMaxStrikes) || 1));
  // R63 simulation/live parity: persisted legacy probabilities are neutralized.
  // SIM still requires fresh executable depth and may fill partially, but never
  // rejects a proven executable IOC through an unrelated random coin flip.
  out.simFillProbability = 1;
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
