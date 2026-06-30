// Copyright 2026 Antifraud Services Inc. under the Apache License, Version 2.0.
import { buildConsentClaimsSimpleWithCid } from 'gdc-common-utils-ts/utils/consent';
import type { GrantProfessionalAccessInput } from './resource-operations.js';

export function buildGrantProfessionalAccessClaimsWithCid(
  input: GrantProfessionalAccessInput,
  createRuntimeUuid: () => string,
): {
  actorIdentifier: string;
  subjectIdentifier: string;
  consentClaims: Record<string, unknown>;
  claimsCid?: string;
} {
  return buildConsentClaimsSimpleWithCid(
    {
      subjectDid: input.subjectDid,
      subjectPhone: input.subjectPhone,
      subjectGivenName: input.subjectGivenName,
      actor: input.actorId ?? input.actor ?? '',
      actorRole: String(input?.actorRole || ''),
      purpose: String(input?.purpose || ''),
      actions: Array.isArray(input?.actions) ? input.actions : [],
      consentIdentifier: input.consentIdentifier,
      consentDate: input.consentDate,
      decision: input.decision,
      attachmentContentType: input.attachmentContentType,
      attachmentBase64: input.attachmentBase64,
    },
    {
      errorPrefix: 'grantProfessionalAccess:',
      consentIdentifierFactory: () => `urn:uuid:${createRuntimeUuid()}`,
    },
  );
}
