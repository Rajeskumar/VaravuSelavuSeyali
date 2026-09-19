/**
 * Deterministic, collision-safe identifier for everything the QA framework creates in
 * this run. On CI, GITHUB_RUN_ID+GITHUB_RUN_ATTEMPT is already unique and stable across
 * every `npm run qa:*` script in the same job. Locally, `playwright.config.ts` sets
 * `process.env.QA_RUN_ID` once (a timestamp+random suffix) before any worker process
 * spawns — reading it here rather than computing our own random value is required, not
 * a style choice: `globalSetup` and each test file run in separate Node processes, so an
 * independently-computed random value here would differ between the process that
 * registers the QA personas and the process that logs into them.
 */
export const RUN_ID: string =
  process.env.GITHUB_RUN_ID && process.env.GITHUB_RUN_ATTEMPT
    ? `${process.env.GITHUB_RUN_ID}${process.env.GITHUB_RUN_ATTEMPT}`
    : process.env.QA_RUN_ID || `${Date.now()}${Math.floor(Math.random() * 1000)}`;

/** Prefix every automation-created record with this so cleanup sweeps and humans can spot them instantly. */
export const QA_TAG = `QA_E2E_${RUN_ID}`;

/** A unique, readable description/name for a throwaway financial record. */
export function qaLabel(suffix: string): string {
  return `${QA_TAG}_${suffix}`;
}

let uniqueCounter = 0;
/** Monotonic per-process counter, for when even the same test needs several unique labels. */
export function uniqueSuffix(): string {
  uniqueCounter += 1;
  return `${uniqueCounter}_${Math.floor(Math.random() * 10_000)}`;
}

export function isQaTagged(value: string | null | undefined): boolean {
  return !!value && value.startsWith(QA_TAG);
}
