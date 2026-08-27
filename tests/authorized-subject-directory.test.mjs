/**
 * Flow contract:
 * 1. A BFF supplies only the verified email/telephone from a signed OpenID
 *    `id_token`; it never authors License or Organization search bundles.
 * 2. The SDK finds active accepted subject grants and resolves each exact
 *    subject record through the owning individual index.
 * 3. Returned role/evidence metadata describes the accepted grant but never
 *    upgrades the account token into VP, SMART or action authority.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  listAuthorizedIndividualSubjectsWithDeps,
  NodeHttpClient,
} from '../dist/index.js';

const routeContext = {
  tenantId: 'did:web:index.example',
  jurisdiction: 'ES',
  sector: 'health-care',
};

test('authors and resolves the contact-bound authorized-subject directory inside the SDK', async () => {
  const submissions = [];
  const submitAndPoll = async (submitPath, pollPath, payload) => {
    submissions.push({ submitPath, pollPath, payload });
    if (submitPath.endsWith('/License/_search')) {
      return {
        poll: { body: { data: [{ resource: { data: [{
          meta: {
            authorizedSubjectDid: 'did:web:index.example:card:1',
            identifier: 'urn:uuid:evidence-1',
            issuerDid: 'did:web:index.example',
            claims: {
              'RelatedPerson.role': 'CAREGIVER',
              'org.schema.Person.hasOccupation.identifier.value': 'ISCO-08|5322',
            },
          },
        }] } }] } },
      };
    }
    return {
      poll: { body: { data: [{ meta: { claims: {
        '@context': 'org.schema',
        'org.schema.Organization.sameAs': 'did:web:index.example:card:1',
        'org.schema.Organization.legalName': 'Authorized subject',
      } } }] } },
    };
  };

  const result = await listAuthorizedIndividualSubjectsWithDeps(routeContext, {
    verifiedContact: { email: ' PERSON@Example.ORG ' },
  }, {
    individualLicenseSearchPath: () => '/tenant/individual/org.schema/License/_search',
    individualLicenseSearchPollPath: () => '/tenant/individual/org.schema/License/_search-response',
    individualOrganizationSearchPath: () => '/tenant/individual/org.schema/Organization/_search',
    individualOrganizationSearchPollPath: () => '/tenant/individual/org.schema/Organization/_search-response',
    submitAndPoll,
  });

  assert.deepEqual(result, [{
    subjectDid: 'did:web:index.example:card:1',
    role: 'CAREGIVER',
    authorizationEvidenceId: 'urn:uuid:evidence-1',
    issuerDid: 'did:web:index.example',
    subjectClaims: {
      '@context': 'org.schema',
      'org.schema.Organization.sameAs': 'did:web:index.example:card:1',
      'org.schema.Organization.legalName': 'Authorized subject',
    },
  }]);
  assert.equal(submissions.length, 2);
  assert.equal(
    submissions[0].payload.body.data[0].meta.claims['org.schema.Person.email'],
    'person@example.org',
  );
  assert.equal(
    submissions[1].payload.body.data[0].meta.claims['org.schema.Organization.sameAs'],
    'did:web:index.example:card:1',
  );
});

test('requires a verified contact and rejects a mismatched subject projection', async () => {
  const deps = {
    individualLicenseSearchPath: () => '/license',
    individualLicenseSearchPollPath: () => '/license-response',
    individualOrganizationSearchPath: () => '/organization',
    individualOrganizationSearchPollPath: () => '/organization-response',
    submitAndPoll: async (path) => path === '/license'
      ? { poll: { body: { data: [{ resource: { data: [{ meta: {
        authorizedSubjectDid: 'did:web:index.example:card:expected',
        claims: { 'org.schema.Person.hasOccupation.identifier.value': 'ISCO-08|2211' },
      } }] } }] } } }
      : { poll: { body: { data: [{ meta: { claims: {
        'org.schema.Organization.sameAs': 'did:web:index.example:card:other',
      } } }] } } },
  };

  await assert.rejects(
    listAuthorizedIndividualSubjectsWithDeps(routeContext, { verifiedContact: {} }, deps),
    /verified email or telephone/i,
  );
  assert.deepEqual(await listAuthorizedIndividualSubjectsWithDeps(routeContext, {
    verifiedContact: { telephone: '+15555550100' },
  }, deps), []);
});

test('NodeHttpClient exposes the complete operation with no caller-authored paths or bundles', async () => {
  const client = new NodeHttpClient({
    baseUrl: 'https://gw.example.org',
    bearerToken: 'signed-openid-id-token',
    appInfo: {
      appId: 'https://sos.example.org',
      appVersion: 'v1.0',
      appType: 'Emergency',
      sector: 'health-care',
    },
  });
  const calls = [];
  client.submitAndPoll = async (...args) => {
    calls.push(args);
    return args[0].endsWith('/License/_search')
      ? { poll: { body: { data: [{ resource: { data: [{ meta: {
        authorizedSubjectDid: 'did:web:index.example:card:1',
        claims: { 'org.schema.Person.hasOccupation.identifier.value': 'ISCO-08|2211' },
      } }] } }] } } }
      : { poll: { body: { data: [{ meta: { claims: {
        'org.schema.Organization.sameAs': 'did:web:index.example:card:1',
        'org.schema.Organization.legalName': 'Authorized subject',
      } } }] } } };
  };

  const subjects = await client.listAuthorizedIndividualSubjects(routeContext, {
    verifiedContact: { email: 'doctor@example.org' },
  });

  assert.equal(subjects[0].subjectDid, 'did:web:index.example:card:1');
  assert.deepEqual(calls.map((call) => call.slice(0, 2)), [
    [
      '/did:web:index.example/cds-ES/v1/health-care/individual/org.schema/License/_search',
      '/did:web:index.example/cds-ES/v1/health-care/individual/org.schema/License/_search-response',
    ],
    [
      '/did:web:index.example/cds-ES/v1/health-care/individual/org.schema/Organization/_search',
      '/did:web:index.example/cds-ES/v1/health-care/individual/org.schema/Organization/_search-response',
    ],
  ]);
});
