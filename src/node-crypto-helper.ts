 // Copyright 2026 Antifraud Services Inc. under the Apache License, Version 2.0.

import { createHash, randomBytes, randomUUID } from 'crypto';
import type { ICryptoHelper } from 'gdc-common-utils-ts/interfaces/ICryptoHelper';

/**
 * Node.js implementation of the low-level crypto helper contract used by
 * `CryptographyService` and managed wallet adapters.
 */
export class NodeCryptoHelper implements ICryptoHelper {
  /**
   * Returns cryptographically secure random bytes from the Node runtime.
   */
  async getRandomBytes(byteCount: number): Promise<Uint8Array> {
    return randomBytes(byteCount);
  }

  /**
   * Computes a digest for the provided string using one Node-supported hash algorithm.
   */
  async digestString(data: string, algorithm: string): Promise<string> {
    const normalized = String(algorithm).replace(/-/g, '').toLowerCase();
    return createHash(normalized).update(data, 'utf8').digest('hex');
  }

  /**
   * Returns a cryptographically secure UUID v4 from the Node runtime.
   */
  randomUUID(): string {
    return randomUUID();
  }
}
