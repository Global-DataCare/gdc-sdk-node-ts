import test from 'node:test';
import assert from 'node:assert/strict';

import { NodeHttpClient } from '../dist/index.js';

test('NodeHttpClient resolves app identity and defaults appVersion to v1.0', () => {
  const client = new NodeHttpClient({
    baseUrl: 'https://gw.example.org',
    appInfo: {
      appId: 'https://globaldatacare.es/backend',
      appType: 'Organization',
      sector: 'health-care',
    },
  });

  assert.deepEqual(client.getResolvedAppInfo(), {
    appId: 'es.globaldatacare',
    appVersion: 'v1.0',
    appType: 'Organization',
    sector: 'health-care',
  });

  assert.deepEqual(client.getAppHeaders(), {
    AppId: 'es.globaldatacare',
    AppVersion: 'v1.0',
  });
});

test('NodeHttpClient injects AppId and AppVersion headers in outgoing GW requests', async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];

  globalThis.fetch = async (url, init) => {
    requests.push([url, init]);
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  try {
    const client = new NodeHttpClient({
      baseUrl: 'https://gw.example.org',
      appInfo: {
        appId: 'portal.globaldatacare.es',
        appVersion: 'v2.0.0',
        appType: 'Organization',
        sector: 'health-care',
      },
    });

    await client.submitBatch('/test', { thid: 'thid-1', body: {} });

    assert.equal(requests.length, 1);
    assert.equal(requests[0][0], 'https://gw.example.org/test');
    assert.deepEqual(requests[0][1].headers, {
      AppId: 'es.globaldatacare.portal',
      AppVersion: 'v2.0.0',
      'Content-Type': 'application/didcomm-plaintext+json',
      Accept: 'application/json, application/didcomm-plaintext+json, */*',
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
