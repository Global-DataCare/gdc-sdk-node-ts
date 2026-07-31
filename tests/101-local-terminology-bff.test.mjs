/**
 * Teaching goal:
 * - load the legacy local terminology JSON shape once in the application BFF
 * - search it by user text without sending the complete catalog to the browser
 * - keep the result envelope small and framework-neutral for a Next.js route
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { LocalTerminologyBffService } from '../dist/index.js';

test('101: a Next.js BFF searches one local terminology catalog', () => {
  // Step 1. The server loads catalog JSON during application bootstrap.
  const terminology = new LocalTerminologyBffService([{
    language: 'es',
    data: [{
      id: 'http://loinc.org',
      attributes: {
        '85354-9': 'Panel de presión arterial',
        '8310-5': 'Temperatura corporal',
      },
    }, {
      id: 'http://snomed.info/sct',
      attributes: {
        '44054006': 'Diabetes mellitus tipo 2',
      },
    }],
  }]);

  // Step 2. A route passes only its validated query and allowed systems.
  const response = terminology.search({
    text: 'presion',
    language: 'es-ES',
    systems: ['http://loinc.org'],
    limit: 10,
  });

  // Step 3. The browser receives options, not the complete source catalog.
  assert.deepEqual(response, {
    data: [{
      system: 'http://loinc.org',
      code: '85354-9',
      display: 'Panel de presión arterial',
      language: 'es',
    }],
  });
});

test('the BFF returns an empty primary document for an unknown local term', () => {
  const terminology = new LocalTerminologyBffService([]);
  assert.deepEqual(terminology.search({
    text: 'unknown',
    language: 'en',
  }), { data: [] });
});
