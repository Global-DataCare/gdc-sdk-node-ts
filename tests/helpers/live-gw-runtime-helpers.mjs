import fs from 'node:fs';
import path from 'node:path';
import { NodeHttpClient } from '../../dist/index.js';

export function ensureLiveGwTraceFiles({
  debugEnabled,
  debugFilePath,
  httpTraceFilePath,
}) {
  fs.mkdirSync(path.dirname(debugFilePath), { recursive: true });
  if (!process.env.SDK_HTTP_TRACE_FILE) {
    process.env.SDK_HTTP_TRACE_FILE = httpTraceFilePath;
  }
  return createLiveGwDebugLogger({ debugEnabled, debugFilePath });
}

export function createLiveGwDebugLogger({ debugEnabled, debugFilePath }) {
  if (!debugEnabled) {
    return { filePath: debugFilePath, record: () => {} };
  }
  fs.writeFileSync(debugFilePath, '');
  return {
    filePath: debugFilePath,
    record(stage, data) {
      fs.appendFileSync(
        debugFilePath,
        `${JSON.stringify({
          ts: new Date().toISOString(),
          stage,
          ...redactForDebug(data),
        })}\n`,
      );
    },
  };
}

export function redactForDebug(value) {
  return JSON.parse(JSON.stringify(value, (key, nestedValue) => {
    if (/token|authorization|secret|password/i.test(String(key || ''))) {
      return '[redacted]';
    }
    return nestedValue;
  }));
}

export function createRuntimeClient({ baseUrl, ctx, bearerToken, requestTimeoutMs = 15_000 } = {}) {
  return new NodeHttpClient({
    baseUrl,
    ctx,
    bearerToken,
    requestTimeoutMs,
  });
}
