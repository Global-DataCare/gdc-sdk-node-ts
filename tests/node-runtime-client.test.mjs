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

test('NodeHttpClient can reuse runtimeVpToken as the default Authorization Bearer header', async () => {
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
      runtimeVpToken: 'vp-token-software-runtime-001',
    });

    assert.equal(client.getRuntimeVpToken(), 'vp-token-software-runtime-001');

    await client.submitBatch('/test', { thid: 'thid-runtime-vp-1', body: {} });

    assert.equal(requests.length, 1);
    assert.deepEqual(requests[0][1].headers, {
      'Content-Type': 'application/didcomm-plaintext+json',
      Accept: 'application/json, application/didcomm-plaintext+json, */*',
      Authorization: 'Bearer vp-token-software-runtime-001',
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('NodeHttpClient exposes current GW CORE lifecycle paths for individual and employee flows', () => {
  const client = new NodeHttpClient({
    baseUrl: 'https://gw.example.org',
    ctx: {
      tenantId: 'acme-id',
      jurisdiction: 'ES',
      sector: 'health-care',
    },
  });

  assert.equal(
    client.individualFamilyOrganizationTransactionPath(),
    '/acme-id/cds-ES/v1/health-care/individual/org.schema/Organization/_transaction',
  );
  assert.equal(
    client.individualFamilyOrganizationDisablePath(),
    '/acme-id/cds-ES/v1/health-care/individual/org.schema/Organization/_disable',
  );
  assert.equal(
    client.individualFamilyOrganizationPurgePollPath(),
    '/acme-id/cds-ES/v1/health-care/individual/org.schema/Organization/_purge-response',
  );
  assert.equal(
    client.employeePurgePath(),
    '/acme-id/cds-ES/v1/health-care/entity/org.schema/Employee/_purge',
  );
});

test('NodeHttpClient keeps individual-member lifecycle methods as explicit not-supported placeholders', async () => {
  const client = new NodeHttpClient({
    baseUrl: 'https://gw.example.org',
    ctx: {
      tenantId: 'acme-id',
      jurisdiction: 'ES',
      sector: 'health-care',
    },
  });

  await assert.rejects(
    client.disableIndividualMember({}, { memberClaims: {} }),
    /current GW CORE contract/,
  );
  await assert.rejects(
    client.purgeIndividualMember({}, { memberClaims: {} }),
    /current GW CORE contract/,
  );
});

test.todo('NodeHttpClient will submit individual-member disable/purge once GW CORE exposes the stable RelatedPerson lifecycle contract');
