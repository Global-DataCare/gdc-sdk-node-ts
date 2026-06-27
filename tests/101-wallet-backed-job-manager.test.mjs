import test from 'node:test';
import assert from 'node:assert/strict';

import { VaultMemRepository } from 'gdc-common-utils-ts';
import { ActorKinds } from 'gdc-common-utils-ts/constants/actor-session';
import {
  EXAMPLE_PROFILE_PROVIDER_DID,
  EXAMPLE_PROFILE_RUNTIME_CLASS_SERVER,
  EXAMPLE_PROFILE_ID,
} from 'gdc-common-utils-ts/examples';
import {
  NodeCryptoHelper,
  NodeManagedWallet,
  createWalletBackedJobManagerInMemory,
} from '../dist/index.js';

/**
 * Teaching goal:
 * show the shared backend/session model that both a portal BFF and a
 * short-lived service session can use:
 * 1. initialize one runtime wallet,
 * 2. keep one local memory vault for the active session,
 * 3. cache the draft/job locally without waiting for transport completion,
 * 4. submit and poll through injected transport callbacks,
 * 5. recover the final response by thread id.
 */
test('101: wallet-backed job manager caches locally first and then syncs through one injected transport', async () => {
  const wallet = new NodeManagedWallet({
    cryptoHelper: new NodeCryptoHelper(),
  });
  const vault = new VaultMemRepository();
  const walletContext = {
    runtime: {
      runtimeId: 'portal-runtime:session-001',
      runtimeType: 'web-bff',
    },
    route: {
      tenantId: 'tenant-demo',
      jurisdiction: 'es',
      sector: 'healthcare',
    },
  };

  await wallet.provisionManagedKeys(walletContext, {
    ownerScope: 'runtime',
    purposes: ['comm-signing', 'comm-encryption'],
    seedMaterial: 'portal-runtime-seed-001',
    mode: 'deterministic',
  });

  const submittedEnvelopes = [];
  const manager = createWalletBackedJobManagerInMemory({
    descriptor: {
      profileId: `${EXAMPLE_PROFILE_ID}-portal-runtime`,
      actorKind: ActorKinds.IndividualController,
      providerDid: EXAMPLE_PROFILE_PROVIDER_DID,
      runtimeClass: EXAMPLE_PROFILE_RUNTIME_CLASS_SERVER,
    },
    wallet,
    walletContext,
    vaultRepository: vault,
    transport: {
      async submit({ job, envelope, accessToken }) {
        submittedEnvelopes.push({ jobId: job.id, envelope, accessToken });
        return {
          accepted: true,
          locationUrl: `/jobs/${job.id}`,
        };
      },
      async poll({ job }) {
        return {
          completed: true,
          responseBody: {
            id: `response-${job.id}`,
            ok: true,
            thid: job.thid,
          },
        };
      },
    },
  });

  await manager.initialize();
  const created = await manager.createJob({
    iss: 'did:web:portal.example.org',
    aud: 'https://gw.example.org/request',
    jti: 'job-001',
    thid: 'thread-001',
    type: 'BundleJsonApi',
    body: {
      data: [
        {
          id: 'entry-1',
          type: 'Communication',
          resource: {
            resourceType: 'Communication',
          },
        },
      ],
    },
  }, {
    apiVersion: 'v1',
    section: 'identity',
    format: 'didcomm',
    resourceType: 'request',
    action: '_submit',
  });

  const storedProtected = await vault.get('wallet-backed-jobs', created.id);
  assert.equal(created.status, 'DRAFT');
  assert.ok(storedProtected.jwe, 'the local session vault should persist the protected job payload');
  assert.equal(storedProtected.content, undefined);

  const queriedDrafts = await manager.queryJobs({
    where: [{ attribute: 'status', equals: 'DRAFT' }],
  });
  assert.equal(queriedDrafts.length, 1);
  assert.equal(queriedDrafts[0].content.thid, 'thread-001');

  await manager.sync('access-token-001');

  assert.equal(submittedEnvelopes.length, 1);
  assert.equal(submittedEnvelopes[0].accessToken, 'access-token-001');
  assert.match(submittedEnvelopes[0].envelope, /\./);

  const completedJobs = await manager.queryJobs({
    where: [{ attribute: 'status', equals: 'COMPLETED' }],
  });
  assert.equal(completedJobs.length, 1);
  assert.ok(completedJobs[0].responseMessageId);

  const response = await manager.getJobResponseByThid('thread-001');
  assert.deepEqual(response, {
    id: `response-${created.id}`,
    ok: true,
    thid: 'thread-001',
  });
});
