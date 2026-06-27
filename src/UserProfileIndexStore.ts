// Copyright 2026 Antifraud Services Inc. under the Apache License, Version 2.0.

import type { IVaultRepository, UserProfileLookupKey } from 'gdc-sdk-core-ts';
import type { UserProfileIndexRecord } from './UserProfileIndexStore.types.js';

export type { UserProfileIndexRecord } from './UserProfileIndexStore.types.js';

const COLLECTION = 'user-profile-index';

/**
 * Node/server persistence adapter for hashed local user-profile indexes.
 *
 * Responsibilities:
 * - store ordered local profile indexes
 * - list stored index documents
 * - resolve one index by hashed lookup key before PIN unlock
 *
 * Non-responsibilities:
 * - hashing raw email/phone input
 * - unlocking profiles with PIN
 * - storing seeds or decrypted private key material
 */
export class UserProfileIndexStore {
  constructor(private readonly vault: IVaultRepository) {}

  /**
   * Initializes the underlying storage adapter.
   */
  public async initialize(): Promise<void> {
    await this.vault.initialize();
  }

  /**
   * Creates or replaces one stored user-profile index record.
   */
  public async upsert(record: UserProfileIndexRecord): Promise<UserProfileIndexRecord> {
    await this.vault.put(COLLECTION, record);
    return record;
  }

  /**
   * Returns every stored user-profile index record.
   */
  public async list(): Promise<UserProfileIndexRecord[]> {
    return this.vault.query<UserProfileIndexRecord>(COLLECTION, {});
  }

  /**
   * Returns one stored index by storage id.
   */
  public async get(id: string): Promise<UserProfileIndexRecord | undefined> {
    return this.vault.get<UserProfileIndexRecord>(COLLECTION, id);
  }

  /**
   * Resolves the first stored index that contains the given hashed lookup key.
   *
   * This intentionally compares hashed lookup tokens only. Raw phone/email
   * values are outside this store contract.
   */
  public async findByLookup(lookup: UserProfileLookupKey): Promise<UserProfileIndexRecord | undefined> {
    const records = await this.list();
    return records.find((record) => record.lookup.some((item) => lookupEquals(item, lookup)));
  }

  /**
   * Deletes one stored index by storage id.
   */
  public async remove(id: string): Promise<boolean> {
    return this.vault.delete(COLLECTION, id);
  }
}

function lookupEquals(left: UserProfileLookupKey, right: UserProfileLookupKey): boolean {
  return left.kind === right.kind
    && left.algorithm === right.algorithm
    && left.value === right.value;
}
