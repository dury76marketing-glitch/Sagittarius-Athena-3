# SAGITTARIUS R40 - Feeder Signal Intelligence (FSI1)


## R40 FSI1 diagnostic research contract

The Download Diagnostics artifact now contains a top-level `feederSignalIntelligence` section. Each feeder record preserves signal-time facts, crash/trough context when available, the exact reference-origin economics that produce the dashboard green number, a normalized $200 causal entry hypothesis at the observable signal ask, quote/book/depth observations, MFE/MAE-style post-signal extremes, spread/depth quality, direction/run statistics, fixed time checkpoints, final outcome when known, and any linked Hunter outcomes/Athena snapshot.

The key anti-hindsight rule is explicit: Dragon/Golden Dragon `Reference PnL` begins at the crash trough because the feeder is reference-only. FSI1 never treats that trough as a tradable entry. Its signal hypothesis begins at the observable signal ask, and its large-green threshold hypotheses begin only when the corresponding Reference PnL threshold is first observed. This lets later analysis answer whether a +$100/+200/+500 feeder reading predicts additional future continuation or merely describes profit that has already happened.

FSI1 state persists in isolated PostgreSQL table `sag_feeder_signal_intel_v1` and is included only in `/api/diagnostics` and `/api/diagnostics/download`; it is intentionally excluded from the 2-second dashboard state/SSE payload. Existing feeder signals present when R40 first boots are marked `partial_from_upgrade` when pre-upgrade trajectory is unavailable, so incomplete history cannot masquerade as signal-time coverage.

R40 preserves **SLW1/U-SG1**, Golden Eye GE1-R2 and ATHENA-B1 unchanged in authority, and adds **FSI1 Feeder Signal Intelligence** as diagnostics-only causal telemetry. FSI1 records what the large green feeder Reference PnL actually means, captures the observable market state at feeder signal time, follows the post-signal path, measures a normalized $200 signal-time hypothetical, and creates causal threshold experiments whenever displayed feeder Reference PnL crosses +$25, +$50, +$100, +$200, +$300 or +$500. It never places orders, never blocks entries, never exits positions and has zero Athena decision weight.

Key invariants:
- U-SG1 remains the sole loss authority and the frozen Danger Line is unchanged.
- Golden Eye remains profit-only; ATHENA-B1 remains entry-only.
- SLW1 does not exit from loss magnitude alone. A learned weak-recovery cohort plus fresh deterioration, or severe loss plus corroborating CI1 crash deterioration, is required.
- Strong learned recovery or live rebound structure keeps a wounded trade alive.
- Fresh-book gating prevents stale data from producing a new SLW1 dead-market exit.
- Existing R38 Golden Eye manual-learning/backfill behavior is preserved.

# SAGITTARIUS R38 - Golden Eye Manual Learning

Release: `SAGITTARIUS-R38-GOLDEN-EYE-MANUAL-LEARNING-2026-08-24`
Golden Eye: `GOLDEN-EYE-V1 / GE1-R2`

R38 upgrades Golden Eye so the operator's manual **Cash Out Hunter Profit** actions are supervised training labels instead of censored observations.

## What changes

- Golden Eye still learns natural aggregate executable-profit peak episodes.
- A manual cash-out now captures the pre-click Golden Eye portfolio sample, marks the natural episode as intervened, executes through the existing manual cash-out path, and then records the realized profitable action as a human-labeled `manual_cashout` training episode.
- Natural and manual episodes form one decision **collective**. Manual labels have real decision weight in the same historical peak/extension statistics used by Golden Eye.
- On first R38 startup, Golden Eye migrates the persisted `GE1-R1` state to `GE1-R2` without discarding valid natural episodes and backfills historical closed `manual_cashout` Hunter rows from PostgreSQL.
- Historical rows closed within 2 seconds are grouped as one portfolio-level manual action, preventing one click that closed multiple Hunters from being counted as multiple independent timing decisions.
- Backfill is checkpointed and runtime manual actions advance the checkpoint only after the training label is durably completed, so a crash before completion can be recovered from the closed trade ledger on restart.

## Current-history backfill verification

Using the supplied 2026-08-24 diagnostics, R38 identifies **13 profitable manual Hunter exits**, groups them into **11 manual cash-now actions**, and preserves **11,199 cents ($111.99)** of realized manual-profit labels in the Golden Eye collective. Two pairs of trades closed essentially simultaneously and are correctly treated as single portfolio-level clicks.

## Safety / authority boundaries

- Golden Eye remains portfolio-level and all-profitable; it does not select individual Hunters.
- U-SG1 remains the exclusive loss-domain authority.
- Settlement/lifecycle finality still outranks Golden Eye.
- Golden Eye still requires fresh, full-position executable books and uses the established manual cash-out execution path.
- No intentional position splitting was added.
- Autonomous LIVE remains fail-closed behind the existing Golden Eye LIVE switch and the inherited system LIVE-readiness covenant. This release is certified for Railway **SIMULATION** testing, not real-money LIVE arming.

## Validation

- Full test suite: **456/456 PASS**.
- Dedicated Golden Eye suite: **28/28 PASS**, including the 20,000-transition deterministic stress test.
- `npm run check`: PASS.
- Syntax sweep: **26/26 JS/MJS files PASS**.
- Import validation: **13/13 non-entrypoint source modules PASS**.
- R38 tests explicitly prove GE1-R1 migration, 13-trade historical manual backfill, portfolio-action grouping, runtime pre-click/post-execution training, and manual-label decision weight.

