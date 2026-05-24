// Copyright 2026 Antifraud Services Inc. under the Apache License, Version 2.0.

import type { AsyncPollRequest, PollOptions, PollResult } from './orchestration/client-port.js';

export type AcceptedPollResponse = {
  status: number;
  body: unknown;
  retryAfterMs?: number;
};

export async function pollUntilCompleteWithMethod(
  pollOnce: (path: string, request: AsyncPollRequest) => Promise<AcceptedPollResponse>,
  path: string,
  request: AsyncPollRequest,
  options?: PollOptions,
): Promise<PollResult> {
  const timeoutMs = options?.timeoutMs ?? 60_000;
  const intervalMs = options?.intervalMs ?? 2_000;
  const startedAt = Date.now();
  let attempts = 0;

  while (true) {
    attempts += 1;
    const result = await pollOnce(path, request);

    if (result.status !== 202) {
      return {
        status: result.status,
        body: result.body,
        attempts,
      };
    }

    if (Date.now() - startedAt > timeoutMs) {
      throw new Error(`Polling timeout after ${attempts} attempts (${timeoutMs}ms).`);
    }

    const waitMs = options?.intervalMs ?? result.retryAfterMs ?? intervalMs;
    await sleep(waitMs);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Math.floor(ms))));
}
