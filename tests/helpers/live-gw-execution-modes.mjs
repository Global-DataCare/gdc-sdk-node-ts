/**
 * Live E2E execution modes for the future app-side user job manager boundary.
 *
 * Current live suites always run in `direct` mode:
 * - no local queue
 * - no offline persistence
 * - no retry state machine
 * - every high-level facade call goes straight to the controlled virtual API
 *   harness, which then submits/polls against GW CORE
 *
 * Future work may introduce a `queued` mode once the app-side user job manager
 * exists. The suite keeps this helper now so docs, env vars, and tests all use
 * the same terminology.
 */
export const LiveGwExecutionModes = Object.freeze({
  Direct: 'direct',
  Queued: 'queued',
});

export function normalizeLiveGwExecutionMode(rawValue) {
  const value = String(rawValue || '').trim().toLowerCase();
  if (!value || value === LiveGwExecutionModes.Direct) {
    return LiveGwExecutionModes.Direct;
  }
  if (value === LiveGwExecutionModes.Queued) {
    return LiveGwExecutionModes.Queued;
  }
  return LiveGwExecutionModes.Direct;
}

export function isDirectExecutionMode(mode) {
  return normalizeLiveGwExecutionMode(mode) === LiveGwExecutionModes.Direct;
}
