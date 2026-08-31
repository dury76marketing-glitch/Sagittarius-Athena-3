import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { env } from './config.mjs';
import { SagittariusEngine } from './engine.mjs';
import { AthenaCommander } from './athena.mjs';
import { StrategyEngine, recoverySignalState } from './strategy.mjs';
import { atomicThunderBoltFeatures } from './opportunity.mjs';
import { installCrystalWallV2 } from './authority.mjs';
import { startServer } from './server.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const runtime = {
  engine: null,
  boot: {
    status: 'starting',
    startedAtMs: Date.now(),
    lastAttemptMs: 0,
    attempts: 0,
    lastError: null,
  },
};

let stopping = false;
const server = startServer(runtime, env.port, root);
console.log(`SAGITTARIUS HTTP listening on port ${env.port}`);

async function bootLoop() {
  while (!stopping && !runtime.engine) {
    runtime.boot.status = runtime.boot.attempts ? 'retrying' : 'starting';
    runtime.boot.attempts += 1;
    runtime.boot.lastAttemptMs = Date.now();
    let candidate = null;
    try {
      // Install CW2 inside the existing retry boundary, after the HTTP listener
      // is already live but before the first engine instance is constructed.
      installCrystalWallV2({SagittariusEngine,AthenaCommander,StrategyEngine,atomicThunderBoltFeatures,recoverySignalState});
      candidate = new SagittariusEngine();
      await candidate.init();
      runtime.engine = candidate;
      runtime.boot.status = 'running';
      runtime.boot.lastError = null;
      console.log(`SAGITTARIUS engine ready mode=${candidate.settings.mode} liveArmed=${candidate.settings.liveArmed} entries=${candidate.settings.engineActive}`);
      return;
    } catch (error) {
      runtime.boot.status = 'retrying';
      runtime.boot.lastError = String(error?.stack || error?.message || error);
      console.error(`SAGITTARIUS ENGINE BOOT ATTEMPT ${runtime.boot.attempts} FAILED`, error);
      if (candidate) await candidate.shutdown().catch(() => {});
      if (!stopping) await sleep(5000);
    }
  }
}

void bootLoop();

const stop = async () => {
  if (stopping) return;
  stopping = true;
  runtime.boot.status = 'stopping';
  await new Promise((resolveClose) => server.close(resolveClose));
  if (runtime.engine) await runtime.engine.shutdown().catch(() => {});
  process.exit(0);
};
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
