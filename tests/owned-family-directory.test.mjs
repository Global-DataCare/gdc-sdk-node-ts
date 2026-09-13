// Flow contract: reuse shared test fixtures and canonical types; do not introduce duplicated literals.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ClaimsOrganizationSchemaorg,
  ClaimsPersonSchemaorg,
} from 'gdc-common-utils-ts';
import {
  EXAMPLE_EMAIL_CONTROLLER_INDIVIDUAL,
  EXAMPLE_REGISTERED_SUBJECT_ALTERNATE_NAME,
  EXAMPLE_TENANT_ROUTE_CONTEXT,
} from 'gdc-common-utils-ts/examples';
import { listOwnedFamilyOrganizationsWithDeps } from '../dist/index.js';

test('lists every individual Organization for one verified owner without resourceId input', async () => {
  const calls = [];
  const result = await listOwnedFamilyOrganizationsWithDeps(
    EXAMPLE_TENANT_ROUTE_CONTEXT,
    { verifiedContact: { email: EXAMPLE_EMAIL_CONTROLLER_INDIVIDUAL } },
    {
      individualFamilyOrganizationSearchPath: () => '/organization/_search',
      individualFamilyOrganizationSearchPollPath: () => '/organization/_search-response',
      submitAndPoll: async (...args) => {
        calls.push(args);
        return { poll: { status: 200, body: { data: [{ resource: {
          resourceType: 'Bundle',
          type: 'searchset',
          entry: [
            { resource: {
              resourceType: 'Organization',
              id: 'owned-organization-id',
              meta: { claims: {
                [ClaimsOrganizationSchemaorg.ownerEmail]: EXAMPLE_EMAIL_CONTROLLER_INDIVIDUAL,
                [ClaimsOrganizationSchemaorg.alternateName]: EXAMPLE_REGISTERED_SUBJECT_ALTERNATE_NAME,
              } },
            } },
            { resource: {
              resourceType: 'Organization',
              id: 'owned-private-draft-id',
              meta: { claims: {
                [ClaimsOrganizationSchemaorg.ownerEmail]: EXAMPLE_EMAIL_CONTROLLER_INDIVIDUAL,
                [ClaimsPersonSchemaorg.birthDate]: '1942',
                'org.schema.FamilyRegistration.status': 'draft_saved',
                'org.schema.FamilyRegistration.missingFields': ['alternateName', 'sameAs'],
              } },
            } },
            { resource: {
              resourceType: 'Organization',
              id: 'foreign-private-draft-id',
              meta: { claims: {
                [ClaimsOrganizationSchemaorg.ownerEmail]: 'another.owner@example.org',
                [ClaimsPersonSchemaorg.birthDate]: '1942',
                'org.schema.FamilyRegistration.status': 'draft_saved',
              } },
            } },
            { resource: {
              resourceType: 'Organization',
              id: 'invalid-nameless-active-id',
              meta: { claims: {
                [ClaimsOrganizationSchemaorg.ownerEmail]: EXAMPLE_EMAIL_CONTROLLER_INDIVIDUAL,
                'org.schema.FamilyRegistration.status': 'already_exists',
              } },
            } },
          ],
        } }] } } };
      },
    },
  );

  assert.deepEqual(result, [
    {
      resourceId: 'owned-organization-id',
      alternateName: EXAMPLE_REGISTERED_SUBJECT_ALTERNATE_NAME,
      claims: {
        [ClaimsOrganizationSchemaorg.ownerEmail]: EXAMPLE_EMAIL_CONTROLLER_INDIVIDUAL,
        [ClaimsOrganizationSchemaorg.alternateName]: EXAMPLE_REGISTERED_SUBJECT_ALTERNATE_NAME,
      },
    },
    {
      resourceId: 'owned-private-draft-id',
      status: 'draft_saved',
      birthDate: '1942',
      missingFields: ['alternateName', 'sameAs'],
      claims: {
        [ClaimsOrganizationSchemaorg.ownerEmail]: EXAMPLE_EMAIL_CONTROLLER_INDIVIDUAL,
        [ClaimsPersonSchemaorg.birthDate]: '1942',
        'org.schema.FamilyRegistration.status': 'draft_saved',
        'org.schema.FamilyRegistration.missingFields': ['alternateName', 'sameAs'],
      },
    },
  ]);
  assert.equal(calls[0][0], '/organization/_search');
  assert.equal(calls[0][1], '/organization/_search-response');
  assert.equal(calls[0][2].body.data[0].resource.meta.claims[
    ClaimsOrganizationSchemaorg.ownerEmail
  ], EXAMPLE_EMAIL_CONTROLLER_INDIVIDUAL);
  assert.equal(calls[0][2].body.data[0].resource.meta.claims[
    ClaimsOrganizationSchemaorg.alternateName
  ], undefined);
});
