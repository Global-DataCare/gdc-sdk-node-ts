// Flow contract: an authenticated BFF resolves governed ValueSet options through the server-only SDK and may reuse a versioned local cache without exposing its service credential.
/**
 * 1. The BFF configures its sector once and supplies only the canonical claim after authenticating its user/wallet session; resource type is derived from that claim.
 * 2. Omitted FHIR version, language, jurisdiction and terminology version remain omitted so the service applies R4, English, international and latest-version defaults.
 * 3. The SDK sends only its server credential, validates JSON:API and caches the exact contextual page.
 * 4. Fresh cache avoids a network call; stale cache is usable only as an explicit resilience fallback after a failed refresh.
 * 5. Language, jurisdiction, version, claim and page are cache-key dimensions, so national editions and translations never collide.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AllergyIntoleranceClaim,
  MemoryTerminologyValueSetCache,
  TerminologyServiceClient,
} from '../dist/index.js';

const document = {
  jsonapi: { version: '1.1' },
  data: [{
    type: 'terminology-option',
    id: 'http://snomed.info/sct|39579001',
    attributes: {
      system: 'http://snomed.info/sct', code: '39579001',
      display: 'Anaphylaxis', localizedDisplay: 'Anaphylaxis',
      resolvedLanguage: 'en', fallbackUsed: false,
    },
  }],
  meta: {
    count: 1, total: 252, offset: 0, language: 'en',
    resourceType: 'AllergyIntolerance',
    field: 'AllergyIntolerance.reaction.manifestation',
    claim: 'AllergyIntolerance.manifestation',
    valueSet: {
      id: 'allergy-reaction-uv-ips',
      url: 'http://hl7.org/fhir/uv/ips/ValueSet/allergy-reaction-uv-ips',
      version: '2.0.1', system: 'http://snomed.info/sct',
    },
    terminologyVersions: {
      'http://snomed.info/sct': 'http://snomed.info/sct/999991001000101/version/20240701',
    },
  },
};

const input = { claim: AllergyIntoleranceClaim.Manifestation };

assert.equal(AllergyIntoleranceClaim.Manifestation, 'AllergyIntolerance.manifestation');

test('uses service defaults and a fresh in-memory BFF cache', async () => {
  const requests = [];
  const client = new TerminologyServiceClient({
    baseUrl: 'https://terminology.internal', serviceToken: 'server-secret', sector: 'health-care',
    fetchImplementation: async (url, init) => {
      requests.push({ url: new URL(url), init });
      return new Response(JSON.stringify(document), {
        status: 200, headers: { 'content-type': 'application/vnd.api+json' },
      });
    },
    cache: new MemoryTerminologyValueSetCache(),
    now: () => 1_000,
  });

  const first = await client.expandValueSetForClaim(input);
  const second = await client.expandValueSetForClaim(input);

  assert.equal(first.cacheStatus, 'remote');
  assert.equal(second.cacheStatus, 'fresh-cache');
  assert.equal(requests.length, 1);
  assert.equal(requests[0].init.headers.authorization, 'Bearer server-secret');
  assert.equal(requests[0].url.pathname, '/v1/terminology/value-set-options');
  assert.deepEqual(Object.fromEntries(requests[0].url.searchParams), {
    sector: 'health-care', claim: 'AllergyIntolerance.manifestation', offset: '0', count: '50',
  });
  assert.deepEqual(second.document, document);
});

test('refreshes by contextual key and falls back to an explicitly stale cached page', async () => {
  let now = 1_000;
  let calls = 0;
  const cache = new MemoryTerminologyValueSetCache();
  const client = new TerminologyServiceClient({
    baseUrl: 'https://terminology.internal', serviceToken: 'server-secret', sector: 'health-care', cache,
    cacheTtlMs: 100,
    now: () => now,
    fetchImplementation: async () => {
      calls += 1;
      if (calls === 1) return new Response(JSON.stringify(document), { status: 200 });
      throw new Error('offline');
    },
  });

  assert.equal((await client.expandValueSetForClaim({
    ...input, language: 'es-ES', jurisdiction: 'ES',
    version: 'http://snomed.info/sct/900000000000207008/version/20240701',
  })).cacheStatus, 'remote');
  now = 1_101;
  const stale = await client.expandValueSetForClaim({
    ...input, language: 'es-ES', jurisdiction: 'ES',
    version: 'http://snomed.info/sct/900000000000207008/version/20240701',
  });
  assert.equal(stale.cacheStatus, 'stale-cache');
  assert.equal(calls, 2);

  await assert.rejects(() => client.expandValueSetForClaim({
    ...input, language: 'fr-CA', jurisdiction: 'CA-BC',
  }), /Terminology service request failed/);
});

test('can be primed with an immutable snapshot for startup without a terminology call', async () => {
  const cache = new MemoryTerminologyValueSetCache();
  cache.prime({ ...input, sector: 'health-care' }, document, 5_000);
  const client = new TerminologyServiceClient({
    baseUrl: 'https://terminology.internal', serviceToken: 'server-secret', sector: 'health-care', cache,
    now: () => 5_001,
    fetchImplementation: async () => { throw new Error('must not call'); },
  });

  const result = await client.expandValueSetForClaim(input);
  assert.equal(result.cacheStatus, 'fresh-cache');
  assert.deepEqual(result.document, document);
});

test('falls back to a primed English ValueSet page when the requested local language is unavailable offline', async () => {
  const cache = new MemoryTerminologyValueSetCache();
  cache.prime({ ...input, sector: 'health-care' }, document, 5_000);
  const client = new TerminologyServiceClient({
    baseUrl: 'https://terminology.internal', serviceToken: 'server-secret', sector: 'health-care', cache,
    now: () => 5_001,
    fetchImplementation: async () => { throw new Error('offline'); },
  });

  const result = await client.expandValueSetForClaim({ ...input, language: 'fr-CA' });
  assert.equal(result.cacheStatus, 'english-fallback-cache');
  assert.equal(result.document.meta.language, 'en');
  assert.equal(result.document.data[0].attributes.localizedDisplay, 'Anaphylaxis');
});

test('returns a complete frontend code-to-display list with descriptive metadata', async () => {
  const requestedOffsets = [];
  const client = new TerminologyServiceClient({
    baseUrl: 'https://terminology.internal', sector: 'animal-care',
    fetchImplementation: async (url) => {
      const requestedUrl = new URL(url);
      const offset = Number(requestedUrl.searchParams.get('offset'));
      requestedOffsets.push(offset);
      const code = offset === 0 ? '39579001' : '247472004';
      const localizedDisplay = offset === 0 ? 'Anafilaxia' : 'Habón';
      return new Response(JSON.stringify({
        ...document,
        data: [{
          ...document.data[0],
          id: `http://snomed.info/sct|${code}`,
          attributes: {
            ...document.data[0].attributes,
            code,
            localizedDisplay,
            resolvedLanguage: 'es',
          },
        }],
        meta: { ...document.meta, count: 1, total: 2, offset, language: 'es' },
      }), { status: 200 });
    },
  });

  const allergyReactionManifestationCodeList = await client.getValueSetCodeListForClaim({
    claim: AllergyIntoleranceClaim.Manifestation,
    language: 'es-ES',
  });

  assert.deepEqual(requestedOffsets, [0, 1]);
  assert.equal(allergyReactionManifestationCodeList.codingSystem, 'http://snomed.info/sct');
  assert.deepEqual(allergyReactionManifestationCodeList.codeToDisplay, {
    '39579001': 'Anafilaxia',
    '247472004': 'Habón',
  });
  assert.equal(allergyReactionManifestationCodeList.requestedLanguage, 'es-es');
  assert.equal(allergyReactionManifestationCodeList.resolvedLanguage, 'es');
});

test('rejects a non-canonical claim and a missing client/input sector', async () => {
  const clientWithoutSector = new TerminologyServiceClient({
    baseUrl: 'https://terminology.internal',
    fetchImplementation: async () => { throw new Error('must not call'); },
  });
  await assert.rejects(
    () => clientWithoutSector.expandValueSetForClaim({ claim: AllergyIntoleranceClaim.Manifestation }),
    /sector is required/,
  );

  const configuredClient = new TerminologyServiceClient({
    baseUrl: 'https://terminology.internal', sector: 'health-care',
    fetchImplementation: async () => { throw new Error('must not call'); },
  });
  await assert.rejects(
    () => configuredClient.expandValueSetForClaim({ claim: 'manifestation' }),
    /claim must start with its FHIR resource type/,
  );
});
