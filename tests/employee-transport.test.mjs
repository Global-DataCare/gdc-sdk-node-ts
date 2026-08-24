/**
 * Teaching goal:
 * prove one BundleEditor-authored Employee licence is transported through the
 * caller-selected FHIR, DIDComm plain, or DIDComm encrypted wire profile.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EXAMPLE_EMPLOYEE_CONTROLLER_ACTIVE,
  EXAMPLE_LICENSE_OFFER_ID,
} from 'gdc-common-utils-ts/examples';
import {
  NodeHttpClient,
  OrganizationControllerSdk,
  TransportProfiles,
} from '../dist/index.js';

const ctx = { tenantId: 'VATES-G02793479', jurisdiction: 'ES', sector: 'onehealth-research' };
const employeeClaims = {
  '@context': 'org.schema',
  'org.schema.Person.email': 'employee@example.org',
  'org.schema.Person.hasOccupation.identifier.value': 'ISCO-08|3344',
  'org.schema.Person.memberOf.taxID': 'VATES-G02793479',
};
const employeeResourceId = 'employee-transport-example';

function createSecureOrganizationController(calls, packedMessages) {
  return new OrganizationControllerSdk(new NodeHttpClient({
    baseUrl: 'https://gw.example',
    ctx,
    transportProfile: TransportProfiles.DidcommEncryptedForm,
    secureTransportAdapter: {
      async pack(message) {
        packedMessages.push(message);
        return `packed-${message.thid}`;
      },
      async unpack(jwe) { return { decrypted: jwe }; },
    },
    fetchImpl: createFetchRecorder(TransportProfiles.DidcommEncryptedForm, calls),
  }));
}

function createFetchRecorder(profile, calls) {
  return async (url, init) => {
    calls.push({ url: String(url), init });
    if (String(url).endsWith('_batch')) {
      return new Response('{}', { status: 202, headers: { 'content-type': 'application/json' } });
    }
    if (profile === TransportProfiles.DidcommEncryptedForm) {
      return new Response('response=employee-terminal-jwe', {
        status: 200,
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
      });
    }
    return Response.json({ data: [{ response: { status: '200' } }] }, { status: 200 });
  };
}

for (const profile of Object.values(TransportProfiles)) {
  test(`OrganizationControllerSdk transports one employee licence with ${profile}`, async () => {
    const calls = [];
    const packedMessages = [];
    const secureTransportAdapter = profile === TransportProfiles.DidcommEncryptedForm
      ? {
          async pack(message) {
            packedMessages.push(message);
            return `packed-${message.thid}`;
          },
          async unpack(jwe) { return { decrypted: jwe }; },
        }
      : undefined;
    const sdk = new OrganizationControllerSdk(new NodeHttpClient({
      baseUrl: 'https://gw.example',
      ctx,
      transportProfile: profile,
      secureTransportAdapter,
      fetchImpl: createFetchRecorder(profile, calls),
    }));

    const result = await sdk.createOrganizationEmployee(ctx, {
      employeeClaims,
    }, { intervalMs: 1, timeoutMs: 100 });

    assert.equal(result.poll.status, 200);
    assert.equal(calls.length, 2);
    assert.match(calls[0].url, /Employee\/_batch$/);
    assert.match(calls[1].url, /Employee\/_batch-response$/);

    if (profile === TransportProfiles.FhirJson) {
      assert.equal(calls[0].init.headers['Content-Type'], TransportProfiles.FhirJson);
      const body = JSON.parse(calls[0].init.body);
      assert.equal(body.resourceType, 'Bundle');
      assert.equal(body.type, 'batch');
      assert.equal(body.entry.length, 1);
      assert.equal(body.entry[0].resource.meta.claims['org.schema.Person.email'], 'employee@example.org');
    } else if (profile === TransportProfiles.DidcommPlainJson) {
      assert.equal(calls[0].init.headers['Content-Type'], TransportProfiles.DidcommPlainJson);
      const message = JSON.parse(calls[0].init.body);
      assert.equal(message.body.data.length, 1);
      assert.equal(message.body.data[0].resource.meta.claims['org.schema.Person.email'], 'employee@example.org');
    } else {
      assert.equal(calls[0].init.headers['Content-Type'], TransportProfiles.DidcommEncryptedForm);
      assert.match(calls[0].init.body, /^request=packed-employee-/);
      assert.match(calls[1].init.body, /^request=packed-employee-/);
      assert.equal(packedMessages[0].body.data.length, 1);
      assert.equal(packedMessages[0].body.data[0].resource.meta.claims['org.schema.Person.email'], 'employee@example.org');
      assert.deepEqual(result.poll.body, { decrypted: 'employee-terminal-jwe' });
    }
  });
}

test('OrganizationControllerSdk requests a professional Offer through secure transport', async () => {
  const calls = [];
  const packedMessages = [];
  const sdk = new OrganizationControllerSdk(new NodeHttpClient({
    baseUrl: 'https://gw.example',
    ctx,
    transportProfile: TransportProfiles.DidcommEncryptedForm,
    secureTransportAdapter: {
      async pack(message) {
        packedMessages.push(message);
        return `packed-${message.thid}`;
      },
      async unpack(jwe) { return { decrypted: jwe }; },
    },
    fetchImpl: createFetchRecorder(TransportProfiles.DidcommEncryptedForm, calls),
  }));

  await sdk.requestEmployeeLicenseOffer(ctx, {
    issuerDid: 'did:web:gw.example:tenant:controller:one',
    quantity: 2,
    pollOptions: { intervalMs: 1, timeoutMs: 100 },
  });
  assert.equal(calls.length, 2);
  assert.equal(packedMessages.length, 2);
  assert.equal(packedMessages[0].iss, 'did:web:gw.example:tenant:controller:one');
  assert.equal(packedMessages[1].iss, 'did:web:gw.example:tenant:controller:one');
  assert.equal(packedMessages[0].body.data[0].meta.claims['org.schema.Offer.eligibleQuantity.value'], 2);
  assert.equal(packedMessages[0].body.data[0].meta.claims['org.schema.IndividualProduct.category'], 'professional');
});

test('OrganizationControllerSdk confirms the professional Order through the same secure transport', async () => {
  const calls = [];
  const packedMessages = [];
  const sdk = new OrganizationControllerSdk(new NodeHttpClient({
    baseUrl: 'https://gw.example',
    ctx,
    transportProfile: TransportProfiles.DidcommEncryptedForm,
    secureTransportAdapter: {
      async pack(message) {
        packedMessages.push(message);
        return `packed-${message.thid}`;
      },
      async unpack(jwe) { return { decrypted: jwe }; },
    },
    fetchImpl: createFetchRecorder(TransportProfiles.DidcommEncryptedForm, calls),
  }));

  await sdk.confirmOrganizationLicenseOrder(ctx, {
    issuerDid: 'did:web:gw.example:tenant:controller:one',
    offerId: 'urn:cds:ES:v1:onehealth-research:product:org.schema:Offer:example',
    hostNetwork: 'test',
    additionalClaims: { 'Order.paymentMethod': 'TestNetworkVirtual' },
  });

  assert.equal(calls.length, 2);
  assert.equal(packedMessages.length, 2);
  assert.equal(packedMessages[0].iss, 'did:web:gw.example:tenant:controller:one');
  assert.equal(packedMessages[1].iss, 'did:web:gw.example:tenant:controller:one');
  assert.equal(
    packedMessages[0].body.data[0].meta.claims['Order.acceptedOffer.identifier'],
    'urn:cds:ES:v1:onehealth-research:product:org.schema:Offer:example',
  );
});

test('configured secure transport governs employee and licence inventory submit and poll', async () => {
  const calls = [];
  const packedMessages = [];
  const sdk = createSecureOrganizationController(calls, packedMessages);

  await sdk.searchOrganizationEmployees(ctx, { employeeClaims });
  await sdk.listLicenses(ctx);

  assert.equal(calls.length, 4);
  assert.equal(packedMessages.length, 4);
  for (const call of calls) {
    assert.equal(call.init.headers['Content-Type'], TransportProfiles.DidcommEncryptedForm);
    assert.match(call.init.body, /^request=packed-/);
  }
  assert.match(calls[0].url, /Employee\/_search$/);
  assert.match(calls[1].url, /Employee\/_search-response$/);
  assert.match(calls[2].url, /License\/_search$/);
  assert.match(calls[3].url, /License\/_search-response$/);
});

test('configured secure transport governs employee disable and purge submit and poll', async () => {
  const calls = [];
  const packedMessages = [];
  const sdk = createSecureOrganizationController(calls, packedMessages);

  await sdk.disableEmployee(ctx, { resourceId: employeeResourceId, employeeClaims });
  await sdk.purgeEmployee(ctx, { resourceId: employeeResourceId, employeeClaims });

  assert.equal(calls.length, 4);
  assert.equal(packedMessages.length, 4);
  for (const call of calls) {
    assert.equal(call.init.headers['Content-Type'], TransportProfiles.DidcommEncryptedForm);
    assert.match(call.init.body, /^request=packed-/);
  }
});

test('staging professional flow keeps one encrypted profile from inventory through employee issue', async () => {
  const calls = [];
  const packedMessages = [];
  const sdk = createSecureOrganizationController(calls, packedMessages);

  await sdk.searchOrganizationEmployees(ctx, { employeeClaims });
  await sdk.listLicenses(ctx);
  await sdk.requestEmployeeLicenseOffer(ctx, {
    issuerDid: EXAMPLE_EMPLOYEE_CONTROLLER_ACTIVE.identifier,
    quantity: 1,
  });
  await sdk.confirmOrganizationLicenseOrder(ctx, {
    issuerDid: EXAMPLE_EMPLOYEE_CONTROLLER_ACTIVE.identifier,
    offerId: EXAMPLE_LICENSE_OFFER_ID,
    hostNetwork: 'test',
  });
  await sdk.createOrganizationEmployee(ctx, { employeeClaims });
  await sdk.issueOrganizationEmployeeLicense(ctx, {
    email: EXAMPLE_EMPLOYEE_CONTROLLER_ACTIVE.email,
    role: EXAMPLE_EMPLOYEE_CONTROLLER_ACTIVE.role,
    subjectDid: EXAMPLE_EMPLOYEE_CONTROLLER_ACTIVE.identifier,
  });

  assert.equal(calls.length, 12);
  assert.equal(packedMessages.length, 12);
  for (const call of calls) {
    assert.equal(call.init.headers['Content-Type'], TransportProfiles.DidcommEncryptedForm);
    assert.match(call.init.body, /^request=packed-/);
  }
});
