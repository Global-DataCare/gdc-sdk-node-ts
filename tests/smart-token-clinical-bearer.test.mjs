// Flow contract: reuse shared test fixtures and canonical types; do not introduce duplicated literals.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EXAMPLE_PROFESSIONAL_DID,
  EXAMPLE_SUBJECT_DID,
  EXAMPLE_TENANT_ROUTE_CONTEXT,
  buildExampleLiveMedicationCases,
  buildExampleMedicationIpsDocumentBundle,
  cloneExample,
} from 'gdc-common-utils-ts/examples';
import { buildSmartCompositionReadScope } from 'gdc-common-utils-ts/utils/smart-scope';
import { NodeHttpClient, ProfessionalSdk } from '../dist/index.js';

test('one high-level SDK instance sends its granted SMART bearer on the following clinical write', async () => {
  const requests = [];
  // These opaque tokens are the exact Authorization transition under test, not identity fixtures.
  const accountBearer = 'account-id-token';
  const smartBearer = 'actor-bound-smart-token';
  const smartScope = buildSmartCompositionReadScope({
    subjectDid: EXAMPLE_SUBJECT_DID,
    accessVerb: 'cruds',
  });
  const fetchImpl = async (url, init) => {
    const requestUrl = String(url);
    requests.push({ url: requestUrl, authorization: init?.headers?.Authorization });
    if (requestUrl.endsWith('/identity/openid/smart/token')) {
      return new Response('{}', { status: 202 });
    }
    if (requestUrl.endsWith('/identity/openid/smart/_batch-response')) {
      return Response.json({
        access_token: smartBearer,
        token_type: 'Bearer',
        expires_in: 300,
        scope: smartScope,
      });
    }
    if (requestUrl.endsWith('/Communication/_batch')) {
      return new Response('{}', { status: 202 });
    }
    return Response.json({ data: [{ response: { status: '200' } }] });
  };
  const routeContext = cloneExample(EXAMPLE_TENANT_ROUTE_CONTEXT);
  const sdk = new ProfessionalSdk(new NodeHttpClient({
    baseUrl: 'https://gw.example.org',
    ctx: routeContext,
    bearerToken: accountBearer,
    fetchImpl,
  }));

  const smart = await sdk.requestSmartToken({
    ...routeContext,
    actorDid: EXAMPLE_PROFESSIONAL_DID,
    subjectDid: EXAMPLE_SUBJECT_DID,
    idToken: accountBearer,
    scopes: [smartScope],
    smartTokenKind: 'openid-smart',
  });
  assert.equal(smart.accessToken, smartBearer);

  await sdk.updateClinicalSummary(routeContext, {
    subject: EXAMPLE_SUBJECT_DID,
    sender: EXAMPLE_PROFESSIONAL_DID,
    bundle: buildExampleMedicationIpsDocumentBundle({
      subjectDid: EXAMPLE_SUBJECT_DID,
      medication: buildExampleLiveMedicationCases()[0],
    }),
    pollOptions: { intervalMs: 1, timeoutMs: 100 },
  });
  await sdk.requestSmartToken({
    ...routeContext,
    actorDid: EXAMPLE_PROFESSIONAL_DID,
    subjectDid: EXAMPLE_SUBJECT_DID,
    idToken: accountBearer,
    scopes: [smartScope],
    smartTokenKind: 'openid-smart',
  });

  const smartRequests = requests.filter(({ url }) => url.includes('/identity/openid/smart/'));
  const clinicalRequests = requests.filter(({ url }) => url.includes('/Communication/'));
  assert.ok(smartRequests.length >= 2);
  assert.ok(clinicalRequests.length >= 2);
  assert.ok(smartRequests.every(({ authorization }) => authorization === `Bearer ${accountBearer}`));
  assert.ok(clinicalRequests.every(({ authorization }) => authorization === `Bearer ${smartBearer}`));
});
