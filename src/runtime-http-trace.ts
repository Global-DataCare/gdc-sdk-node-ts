// Copyright 2026 Antifraud Services Inc. under the Apache License, Version 2.0.

import fs from 'node:fs';
import path from 'node:path';

export function appendHttpTrace(traceFile: string | undefined, entry: Record<string, unknown>): void {
  if (!traceFile) return;
  try {
    fs.mkdirSync(path.dirname(traceFile), { recursive: true });
    fs.appendFileSync(traceFile, `${JSON.stringify(entry)}\n`);
  } catch {
    // Tracing must never break runtime requests.
  }
}

export function parseTraceBody(body: BodyInit | null | undefined): unknown {
  if (body == null) return undefined;
  if (typeof body === 'string') return parseTraceRawText(body);
  if (body instanceof URLSearchParams) return Object.fromEntries(body.entries());
  return '[non-text-body]';
}

export function parseTraceRawText(raw: string): unknown {
  if (!raw) return '';
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

export function redactTraceValue<T>(value: T): T {
  if (value === undefined) return value;
  const serialized = JSON.stringify(value, (key, nestedValue) => {
    if (/token|authorization|secret|password/i.test(String(key || ''))) {
      return '[redacted]';
    }
    return nestedValue;
  });
  return serialized === undefined ? value : JSON.parse(serialized);
}
