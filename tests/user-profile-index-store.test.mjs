import test from 'node:test';
import assert from 'node:assert/strict';

import { UserProfileIndexStore } from '../dist/index.js';

function createVaultStub() {
  const collections = new Map();
  const calls = {
    initialize: 0,
    put: [],
    get: [],
    query: [],
    delete: [],
  };

  const ensureCollection = (collectionName) => {
    if (!collections.has(collectionName)) {
      collections.set(collectionName, new Map());
    }
    return collections.get(collectionName);
  };

  return {
    calls,
    vault: {
      async initialize() {
        calls.initialize += 1;
      },
      async put(collectionName, containers) {
        calls.put.push([collectionName, containers]);
        const collection = ensureCollection(collectionName);
        const items = Array.isArray(containers) ? containers : [containers];
        for (const item of items) {
          collection.set(item.id, item);
        }
        return true;
      },
      async get(collectionName, containerId) {
        calls.get.push([collectionName, containerId]);
        return collections.get(collectionName)?.get(containerId);
      },
      async query(collectionName, query) {
        calls.query.push([collectionName, query]);
        return [...(collections.get(collectionName)?.values() || [])];
      },
      async delete(collectionName, containerId) {
        calls.delete.push([collectionName, containerId]);
        return collections.get(collectionName)?.delete(containerId) ?? false;
      },
    },
  };
}

test('UserProfileIndexStore persists and resolves hashed profile-index records in node runtimes', async () => {
  const { calls, vault } = createVaultStub();
  const store = new UserProfileIndexStore(vault);

  await store.initialize();
  assert.equal(calls.initialize, 1);

  const record = {
    id: 'local-index-main',
    lookup: [
      {
        kind: 'phone',
        algorithm: 'sha256-salted',
        value: 'lookup-phone-hash-001',
      },
    ],
    profiles: [
      {
        profileId: 'profile-ana',
        actorKind: 'individual-controller',
        subjectId: 'subject-ana',
        pinRequired: true,
      },
    ],
    updatedAt: '2026-06-26T11:00:00.000Z',
  };

  assert.deepEqual(await store.upsert(record), record);
  assert.deepEqual(await store.list(), [record]);
  assert.deepEqual(await store.get('local-index-main'), record);
  assert.deepEqual(
    await store.findByLookup({
      kind: 'phone',
      algorithm: 'sha256-salted',
      value: 'lookup-phone-hash-001',
    }),
    record,
  );
  assert.equal(
    await store.findByLookup({
      kind: 'email',
      algorithm: 'sha256-salted',
      value: 'lookup-email-hash-missing',
    }),
    undefined,
  );
  assert.equal(await store.remove('local-index-main'), true);
  assert.equal(await store.get('local-index-main'), undefined);

  assert.deepEqual(calls.put, [['user-profile-index', record]]);
  assert.deepEqual(calls.query, [
    ['user-profile-index', {}],
    ['user-profile-index', {}],
    ['user-profile-index', {}],
  ]);
  assert.deepEqual(calls.get, [
    ['user-profile-index', 'local-index-main'],
    ['user-profile-index', 'local-index-main'],
  ]);
  assert.deepEqual(calls.delete, [['user-profile-index', 'local-index-main']]);
});

