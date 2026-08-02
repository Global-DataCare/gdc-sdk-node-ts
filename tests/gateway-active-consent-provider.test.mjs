import test from 'node:test';
import assert from 'node:assert/strict';
import { GatewayActiveConsentProvider, extractConsentRules } from '../dist/gateway-active-consent-provider.js';

const subject = 'did:web:subject.example';
const activeRule = {
  '@context': 'org.hl7.fhir.api',
  'Consent.identifier': 'urn:uuid:active-consent',
  'Consent.subject': subject,
  'Consent.actor-identifier': 'did:web:clinic.example:member:zHash:ISCO-08|2211',
  'Consent.actor-role': 'ISCO-08|2211',
  'Consent.purpose': 'TREAT',
  'Consent.action': 'organization/Composition.rs?section=LOINC|48765-2',
  'Consent.decision': 'permit',
  'Consent.date': '2026-08-02',
};

test('GatewayActiveConsentProvider reads active subject rules from GW instead of an app table', async () => {
  const calls = [];
  const provider = new GatewayActiveConsentProvider({
    async searchClinicalBundle(ctx, input) {
      calls.push([ctx, input]);
      return {
        submit: { status: 202, body: {} },
        poll: {
          status: 200,
          attempts: 1,
          body: { data: [{ resource: { resourceType: 'Consent', meta: { claims: activeRule } } }] },
        },
      };
    },
  }, { tenantId: 'subject-provider', jurisdiction: 'ES', sector: 'health-care' });

  assert.deepEqual(await provider.getActiveConsentsForSubject(subject), [activeRule]);
  assert.deepEqual(calls[0][1], { subject, includedTypes: ['Consent'] });
});

test('GatewayActiveConsentProvider excludes expired and wrong-subject rules', async () => {
  const provider = new GatewayActiveConsentProvider({
    async searchClinicalBundle() {
      return {
        submit: { status: 202, body: {} },
        poll: {
          status: 200,
          attempts: 1,
          body: {
            data: [
              { meta: { claims: { ...activeRule, 'Consent.identifier': 'expired', 'Consent.period-end': '2020-01-01' } } },
              { meta: { claims: { ...activeRule, 'Consent.identifier': 'other', 'Consent.subject': 'did:web:other.example' } } },
            ],
          },
        },
      };
    },
  }, { tenantId: 'subject-provider', jurisdiction: 'ES', sector: 'health-care' });
  assert.deepEqual(await provider.getActiveConsentsForSubject(subject), []);
});

test('extractConsentRules ignores non-Consent payloads', () => {
  assert.deepEqual(extractConsentRules({ data: [{ resource: { resourceType: 'Observation' } }] }), []);
});
