// Copyright 2026 Antifraud Services Inc. under the Apache License, Version 2.0.

import type { UserProfileIndex } from 'gdc-sdk-core-ts';

/**
 * Persisted local user-profile index document for node/server runtimes.
 *
 * The shared `UserProfileIndex` contract from `gdc-sdk-core-ts` is
 * runtime-neutral and intentionally omits any storage identifier. Node
 * runtimes need a stable document id so one logical index record can be
 * replaced atomically in a concrete vault adapter such as Firestore, Redis,
 * SQLite, or an in-memory test vault.
 */
export interface UserProfileIndexRecord extends UserProfileIndex {
  /**
   * Stable storage identifier for one local profile-index document.
   */
  id: string;
}
