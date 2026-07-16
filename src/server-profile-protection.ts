// Copyright 2026 Antifraud Services Inc. under the Apache License, Version 2.0.

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';

/**
 * Host-controlled KEK boundary.
 *
 * A BFF normally implements this with Cloud KMS. A native confidential app
 * implements the same boundary with a non-exportable Keychain/Keystore key.
 * The adapter never receives the user's PIN.
 */
export type ServerProfileSealer = Readonly<{
  seal(cleartext: string, aad: string): Promise<string>;
  unseal(ciphertext: string, aad: string): Promise<string>;
}>;

/** Persisted scrypt work factor. The salt and parameters are public metadata. */
export type ProfileScryptParameters = Readonly<{
  name: 'scrypt';
  saltBase64Url: string;
  cost: number;
  blockSize: number;
  parallelization: number;
  keyLength: 32;
}>;

/**
 * Portable v1 envelope for a profile secret.
 *
 * `ciphertext` contains the secret encrypted by a random DEK. The host first
 * wraps that DEK; the PIN-derived key then encrypts the host-wrapped value.
 * Opening therefore requires both factors without exposing either factor to
 * the other adapter.
 */
export type PinProtectedProfileSecret = Readonly<{
  version: 'gdc-pin-host-envelope-v1';
  kdf: ProfileScryptParameters;
  payload: AesGcmCiphertext;
  pinWrappedHostDek: AesGcmCiphertext;
}>;

export type AesGcmCiphertext = Readonly<{
  ivBase64Url: string;
  ciphertextBase64Url: string;
  tagBase64Url: string;
}>;

export type ProfileProtectionOptions = Readonly<{
  cost?: number;
  blockSize?: number;
  parallelization?: number;
}>;

/** Distinguishes a wrong PIN from a host KMS outage or corrupted payload. */
export class ProfilePinRejectedError extends Error {
  public constructor() {
    super('Profile PIN rejected.');
    this.name = 'ProfilePinRejectedError';
  }
}

/**
 * Encrypt one seed, private-key export or credential using a fresh DEK.
 *
 * The returned salt is intentionally stored in clear. Security comes from the
 * PIN work factor, the independent host KEK and authenticated encryption, not
 * from hiding the salt or algorithm parameters.
 */
export async function protectServerProfileSecret(
  cleartext: string,
  pin: string,
  aad: string,
  hostSealer: ServerProfileSealer,
  options: ProfileProtectionOptions = {},
): Promise<PinProtectedProfileSecret> {
  requirePin(pin);
  const kdf: ProfileScryptParameters = {
    name: 'scrypt',
    saltBase64Url: randomBytes(16).toString('base64url'),
    cost: options.cost ?? 16_384,
    blockSize: options.blockSize ?? 8,
    parallelization: options.parallelization ?? 1,
    keyLength: 32,
  };
  const pinKey = derivePinKey(pin, kdf);
  const dek = randomBytes(32);
  const hostWrappedDek = await hostSealer.seal(dek.toString('base64url'), `${aad}:dek`);
  try {
    return {
      version: 'gdc-pin-host-envelope-v1',
      kdf,
      payload: encryptAesGcm(Buffer.from(cleartext), dek, `${aad}:payload`),
      pinWrappedHostDek: encryptAesGcm(Buffer.from(hostWrappedDek), pinKey, `${aad}:host-wrapped-dek`),
    };
  } finally {
    pinKey.fill(0);
    dek.fill(0);
  }
}

/**
 * Open one protected profile secret using both PIN and host protection.
 *
 * The PIN layer is authenticated before the host adapter is called. A wrong
 * PIN therefore neither reaches KMS nor becomes indistinguishable from a KMS
 * availability failure in audit logs.
 */
export async function openServerProfileSecret(
  envelope: PinProtectedProfileSecret,
  pin: string,
  aad: string,
  hostSealer: ServerProfileSealer,
): Promise<string> {
  validateEnvelope(envelope);
  const pinKey = derivePinKey(pin, envelope.kdf);
  let hostWrappedDek: string;
  try {
    hostWrappedDek = decryptAesGcm(envelope.pinWrappedHostDek, pinKey, `${aad}:host-wrapped-dek`).toString('utf8');
  } catch {
    throw new ProfilePinRejectedError();
  } finally {
    pinKey.fill(0);
  }
  const dek = Buffer.from(await hostSealer.unseal(hostWrappedDek, `${aad}:dek`), 'base64url');
  try {
    if (dek.length !== 32) throw new Error('Profile host returned an invalid DEK.');
    return decryptAesGcm(envelope.payload, dek, `${aad}:payload`).toString('utf8');
  } finally {
    dek.fill(0);
  }
}

function derivePinKey(pin: string, parameters: ProfileScryptParameters): Buffer {
  requirePin(pin);
  return scryptSync(pin, Buffer.from(parameters.saltBase64Url, 'base64url'), parameters.keyLength, {
    N: parameters.cost,
    r: parameters.blockSize,
    p: parameters.parallelization,
    maxmem: Math.max(64 * 1024 * 1024, 256 * parameters.cost * parameters.blockSize),
  });
}

function encryptAesGcm(cleartext: Buffer, key: Buffer, aad: string): AesGcmCiphertext {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(aad));
  const ciphertext = Buffer.concat([cipher.update(cleartext), cipher.final()]);
  return {
    ivBase64Url: iv.toString('base64url'),
    ciphertextBase64Url: ciphertext.toString('base64url'),
    tagBase64Url: cipher.getAuthTag().toString('base64url'),
  };
}

function decryptAesGcm(value: AesGcmCiphertext, key: Buffer, aad: string): Buffer {
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(value.ivBase64Url, 'base64url'));
  decipher.setAAD(Buffer.from(aad));
  decipher.setAuthTag(Buffer.from(value.tagBase64Url, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(value.ciphertextBase64Url, 'base64url')),
    decipher.final(),
  ]);
}

function requirePin(pin: string): void {
  if (String(pin).length < 6) throw new Error('Production profile PIN must contain at least 6 characters.');
}

function validateEnvelope(value: PinProtectedProfileSecret): void {
  if (value?.version !== 'gdc-pin-host-envelope-v1' || value.kdf?.name !== 'scrypt') {
    throw new Error('Unsupported protected profile envelope.');
  }
}
