// Copyright 2026 Antifraud Services Inc. under the Apache License, Version 2.0.

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';

export type PortableProfileRecoveryEnvelope = Readonly<{
  version: 'gdc-portable-profile-recovery-v1';
  profileId: string;
  walletKeyDerivationId: string;
  kdf: Readonly<{
    name: 'scrypt';
    saltBase64Url: string;
    cost: number;
    blockSize: number;
    parallelization: number;
    keyLength: 32;
  }>;
  cipher: 'A256GCM';
  ivBase64Url: string;
  ciphertextBase64Url: string;
  tagBase64Url: string;
}>;

export type PortableProfileRecoveryProtection = Readonly<{
  cost?: number;
  blockSize?: number;
  parallelization?: number;
}>;

export function createPortableProfileRecoveryEnvelope(input: Readonly<{
  profileId: string;
  walletSeed: string;
  walletKeyDerivationId: string;
  recoverySecret: string;
  protection?: PortableProfileRecoveryProtection;
}>): PortableProfileRecoveryEnvelope {
  const profileId = requiredText(input.profileId, 'profileId');
  const walletKeyDerivationId = requiredText(input.walletKeyDerivationId, 'walletKeyDerivationId');
  requireSeed(input.walletSeed);
  requireRecoverySecret(input.recoverySecret);
  const kdf = {
    name: 'scrypt' as const,
    saltBase64Url: randomBytes(16).toString('base64url'),
    cost: input.protection?.cost ?? 65_536,
    blockSize: input.protection?.blockSize ?? 8,
    parallelization: input.protection?.parallelization ?? 1,
    keyLength: 32 as const,
  };
  const key = deriveKey(input.recoverySecret, kdf);
  const iv = randomBytes(12);
  const aad = envelopeAad(profileId, walletKeyDerivationId);
  try {
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(aad);
    const ciphertext = Buffer.concat([
      cipher.update(JSON.stringify({ walletSeed: input.walletSeed }), 'utf8'),
      cipher.final(),
    ]);
    return {
      version: 'gdc-portable-profile-recovery-v1',
      profileId,
      walletKeyDerivationId,
      kdf,
      cipher: 'A256GCM',
      ivBase64Url: iv.toString('base64url'),
      ciphertextBase64Url: ciphertext.toString('base64url'),
      tagBase64Url: cipher.getAuthTag().toString('base64url'),
    };
  } finally {
    key.fill(0);
  }
}

export function openPortableProfileRecoveryEnvelope(input: Readonly<{
  envelope: PortableProfileRecoveryEnvelope;
  recoverySecret: string;
}>): Readonly<{ profileId: string; walletSeed: string; walletKeyDerivationId: string }> {
  const envelope = input.envelope;
  try {
    validateEnvelope(envelope);
    requireRecoverySecret(input.recoverySecret);
    const key = deriveKey(input.recoverySecret, envelope.kdf);
    try {
      const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.ivBase64Url, 'base64url'));
      decipher.setAAD(envelopeAad(envelope.profileId, envelope.walletKeyDerivationId));
      decipher.setAuthTag(Buffer.from(envelope.tagBase64Url, 'base64url'));
      const cleartext = Buffer.concat([
        decipher.update(Buffer.from(envelope.ciphertextBase64Url, 'base64url')),
        decipher.final(),
      ]).toString('utf8');
      const payload = JSON.parse(cleartext) as { walletSeed?: unknown };
      const walletSeed = String(payload.walletSeed || '');
      requireSeed(walletSeed);
      return {
        profileId: envelope.profileId,
        walletSeed,
        walletKeyDerivationId: envelope.walletKeyDerivationId,
      };
    } finally {
      key.fill(0);
    }
  } catch {
    throw new Error('Portable profile recovery envelope could not be opened.');
  }
}

function deriveKey(secret: string, kdf: PortableProfileRecoveryEnvelope['kdf']): Buffer {
  return scryptSync(secret, Buffer.from(kdf.saltBase64Url, 'base64url'), kdf.keyLength, {
    N: kdf.cost,
    r: kdf.blockSize,
    p: kdf.parallelization,
    maxmem: Math.max(128 * 1024 * 1024, 256 * kdf.cost * kdf.blockSize),
  });
}

function envelopeAad(profileId: string, walletKeyDerivationId: string): Buffer {
  return Buffer.from(JSON.stringify({
    version: 'gdc-portable-profile-recovery-v1',
    profileId,
    walletKeyDerivationId,
  }));
}

function requireRecoverySecret(value: string): void {
  const secret = String(value || '');
  if (secret.length < 16 || /^\d+$/.test(secret)) {
    throw new Error('Portable recovery requires a high-entropy recovery secret, not a short PIN.');
  }
}

function requireSeed(value: string): void {
  if (!/^[A-Za-z0-9_-]{43}$/.test(value) || Buffer.from(value, 'base64url').byteLength !== 32) {
    throw new Error('Portable recovery requires a 32-byte base64url wallet seed.');
  }
}

function requiredText(value: string, name: string): string {
  const normalized = String(value || '').trim();
  if (!normalized) throw new Error(`Portable recovery requires ${name}.`);
  return normalized;
}

function validateEnvelope(value: PortableProfileRecoveryEnvelope): void {
  if (value?.version !== 'gdc-portable-profile-recovery-v1'
    || value.cipher !== 'A256GCM'
    || value.kdf?.name !== 'scrypt'
    || value.kdf.keyLength !== 32
    || !value.profileId
    || !value.walletKeyDerivationId) {
    throw new Error('Unsupported portable profile recovery envelope.');
  }
}
