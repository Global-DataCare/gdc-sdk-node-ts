// Copyright 2026 Antifraud Services Inc. under the Apache License, Version 2.0.
import { DIDCOMM_DEFAULT_ACCEPT_HEADER } from 'gdc-common-utils-ts/utils/didcomm-submit';
import {
  appendHttpTrace,
  parseTraceBody,
  parseTraceRawText,
  redactTraceValue,
} from './runtime-http-trace.js';

export type RuntimeTransportConfig = Readonly<{
  baseUrl: string;
  bearerToken?: string;
  defaultHeaders: Record<string, string>;
  requestTimeoutMs: number;
  httpTraceFile?: string;
}>;

export function buildRuntimeHeaders(config: RuntimeTransportConfig, contentType: string): Record<string, string> {
  const headers: Record<string, string> = {
    ...config.defaultHeaders,
    'Content-Type': contentType,
    Accept: DIDCOMM_DEFAULT_ACCEPT_HEADER,
  };
  if (config.bearerToken) headers.Authorization = `Bearer ${config.bearerToken}`;
  return headers;
}

export async function pollBatchResponseWithRuntimeConfig(
  config: RuntimeTransportConfig,
  path: string,
  request: { thid: string },
): Promise<{ status: number; body: unknown; retryAfterMs?: number }> {
  const response = await fetchWithTimeout(config, path, {
    method: 'POST',
    headers: buildRuntimeHeaders(config, 'application/json'),
    body: JSON.stringify(request),
  });
  const retryAfter = Number(response.headers.get('retry-after'));
  return {
    status: response.status,
    body: await parseResponseBody(response),
    retryAfterMs: Number.isFinite(retryAfter) ? retryAfter * 1000 : undefined,
  };
}

export async function postJsonWithRuntimeConfig(
  config: RuntimeTransportConfig,
  path: string,
  payload: unknown,
  contentType: string,
): Promise<{ status: number; location?: string; body: unknown }> {
  const response = await fetchWithTimeout(config, path, {
    method: 'POST',
    headers: buildRuntimeHeaders(config, contentType),
    body: JSON.stringify(payload),
  });
  return {
    status: response.status,
    location: response.headers.get('location') || undefined,
    body: await parseResponseBody(response),
  };
}

export async function fetchWithTimeout(config: RuntimeTransportConfig, path: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.requestTimeoutMs);
  const url = /^https?:\/\//.test(path) ? path : `${config.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
  const requestBody = parseTraceBody(init.body);
  const traceBase = {
    ts: new Date().toISOString(),
    request: {
      url,
      method: String(init.method || 'GET').toUpperCase(),
      headers: redactTraceValue(init.headers || {}),
      body: redactTraceValue(requestBody),
    },
  };
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const responseClone = response.clone();
    const responseRaw = await responseClone.text();
    appendHttpTrace(config.httpTraceFile, {
      ...traceBase,
      response: {
        status: response.status,
        headers: redactTraceValue(Object.fromEntries(response.headers.entries())),
        body: redactTraceValue(parseTraceRawText(responseRaw)),
      },
    });
    return response;
  } catch (error) {
    appendHttpTrace(config.httpTraceFile, {
      ...traceBase,
      error: {
        name: error instanceof Error ? error.name : 'Error',
        message: error instanceof Error ? error.message : String(error),
      },
    });
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function parseResponseBody(response: Response): Promise<unknown> {
  const raw = await response.text();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}
