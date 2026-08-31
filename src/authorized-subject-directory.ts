// Copyright 2026 Antifraud Services Inc. under the Apache License, Version 2.0.

import type { SubmitAndPollResult } from 'gdc-sdk-core-ts';
import type { RouteContext } from './individual-onboarding.js';

const SCHEMA_CONTEXT = 'org.schema';
const INDIVIDUAL_AUDIENCE_TYPE = 'Individual';
const ACCEPTED_ITEM_CONDITION = 'https://schema.org/UsedCondition';
const CLAIM_AUDIENCE_TYPE = 'org.schema.IndividualProduct.audience.audienceType';
const CLAIM_ITEM_CONDITION = 'org.schema.IndividualProduct.itemCondition';
const CLAIM_PERSON_EMAIL = 'org.schema.Person.email';
const CLAIM_PERSON_TELEPHONE = 'org.schema.Person.telephone';
const CLAIM_ORGANIZATION_SAME_AS = 'org.schema.Organization.sameAs';
const CLAIM_ORGANIZATION_OWNER_EMAIL = 'org.schema.Organization.owner.email';
const CLAIM_ORGANIZATION_OWNER_TELEPHONE = 'org.schema.Organization.owner.telephone';
const CLAIM_ORGANIZATION_MEMBER_ROLE = 'org.schema.Organization.member.role';
const CLAIM_RELATED_PERSON_ROLE = 'RelatedPerson.role';
const CLAIM_OCCUPATION_IDENTIFIER = 'org.schema.Person.hasOccupation.identifier.value';

/** Verified contact extracted by the BFF from a signed OpenID `id_token`. */
export type AuthorizedSubjectVerifiedContact = Readonly<{
  email?: string;
  telephone?: string;
}>;

/**
 * High-level input for listing subject grants already accepted by an
 * individual index. The contact locates grants; it is not role or action proof.
 */
export type AuthorizedIndividualSubjectDirectoryInput = Readonly<{
  verifiedContact: AuthorizedSubjectVerifiedContact;
  requestThid?: string;
  pollOptions?: Readonly<{ timeoutMs?: number; intervalMs?: number }>;
}>;

/** One exact subject projection paired with its accepted grant metadata. */
export type AuthorizedIndividualSubject = Readonly<{
  subjectDid: string;
  role?: string;
  /** Accepted provider grant claims; descriptive metadata, never action authority. */
  grantClaims: Readonly<Record<string, unknown>>;
  authorizationEvidenceId?: string;
  issuerDid?: string;
  subjectClaims: Readonly<Record<string, unknown>>;
}>;

type DirectoryDeps = Readonly<{
  individualLicenseSearchPath: (ctx: RouteContext) => string;
  individualLicenseSearchPollPath: (ctx: RouteContext) => string;
  individualOrganizationSearchPath: (ctx: RouteContext) => string;
  individualOrganizationSearchPollPath: (ctx: RouteContext) => string;
  submitAndPoll: (
    submitPath: string,
    pollPath: string,
    payload: { thid?: string } & Record<string, unknown>,
    pollOptions?: { timeoutMs?: number; intervalMs?: number },
  ) => Promise<SubmitAndPollResult>;
}>;

type AcceptedLicenseRow = Readonly<{
  subjectDid: string;
  role?: string;
  grantClaims: Readonly<Record<string, unknown>>;
  authorizationEvidenceId?: string;
  issuerDid?: string;
}>;

/**
 * Lists already-authorized individual subjects without exposing GW plumbing.
 *
 * The caller supplies a verified contact taken from a signed OpenID token.
 * That account/contact proof is intentionally insufficient for protected
 * actions: professional role proof remains a separate `vp_token`, and SMART
 * access remains bound to a registered wallet/device session.
 */
export async function listAuthorizedIndividualSubjectsWithDeps(
  routeContext: RouteContext,
  input: AuthorizedIndividualSubjectDirectoryInput,
  deps: DirectoryDeps,
): Promise<AuthorizedIndividualSubject[]> {
  const email = String(input.verifiedContact?.email || '').trim().toLowerCase();
  const telephone = String(input.verifiedContact?.telephone || '').trim();
  if (!email && !telephone) {
    throw new Error('A verified email or telephone is required to list authorized subjects.');
  }

  const ownerResult = await deps.submitAndPoll(
    deps.individualOrganizationSearchPath(routeContext),
    deps.individualOrganizationSearchPollPath(routeContext),
    {
      thid: input.requestThid || createThreadId('authorized-subject-owner'),
      body: {
        resourceType: 'Bundle',
        type: 'batch',
        data: [{
          type: 'Family-search-v1.0',
          request: { method: 'POST' },
          meta: { claims: {
            '@context': SCHEMA_CONTEXT,
            ...(email ? { [CLAIM_ORGANIZATION_OWNER_EMAIL]: email } : {}),
            ...(telephone ? { [CLAIM_ORGANIZATION_OWNER_TELEPHONE]: telephone } : {}),
          } },
        }],
      },
    },
    input.pollOptions,
  );
  const ownedSubjects = readOwnedSubjects(ownerResult, { email, telephone });
  const subjectsByDid = new Map(ownedSubjects.map((subject) => [subject.subjectDid, subject]));

  const licenseClaims: Record<string, unknown> = {
    '@context': SCHEMA_CONTEXT,
    [CLAIM_AUDIENCE_TYPE]: INDIVIDUAL_AUDIENCE_TYPE,
    [CLAIM_ITEM_CONDITION]: ACCEPTED_ITEM_CONDITION,
    ...(email ? { [CLAIM_PERSON_EMAIL]: email } : {}),
    ...(telephone ? { [CLAIM_PERSON_TELEPHONE]: telephone } : {}),
  };
  const licenseResult = await deps.submitAndPoll(
    deps.individualLicenseSearchPath(routeContext),
    deps.individualLicenseSearchPollPath(routeContext),
    {
      thid: input.requestThid || createThreadId('authorized-subject-license'),
      body: {
        resourceType: 'Bundle',
        type: 'batch',
        data: [{
          request: { method: 'POST' },
          meta: { status: 'active', claims: licenseClaims },
        }],
      },
    },
    input.pollOptions,
  );
  const licenses = readAcceptedLicenses(licenseResult);

  const resolved = await Promise.all(licenses.filter((license) => !subjectsByDid.has(license.subjectDid)).map(async (license) => {
    const organizationClaims = {
      '@context': SCHEMA_CONTEXT,
      [CLAIM_ORGANIZATION_SAME_AS]: license.subjectDid,
    };
    const organizationResult = await deps.submitAndPoll(
      deps.individualOrganizationSearchPath(routeContext),
      deps.individualOrganizationSearchPollPath(routeContext),
      {
        thid: createThreadId('authorized-subject-record'),
        body: {
          resourceType: 'Bundle',
          type: 'batch',
          data: [{
            type: 'Family-search-v1.0',
            request: { method: 'POST' },
            meta: { claims: organizationClaims },
          }],
        },
      },
      input.pollOptions,
    );
    const subjectClaims = readFirstClaims(organizationResult);
    if (String(subjectClaims[CLAIM_ORGANIZATION_SAME_AS] || '').trim() !== license.subjectDid) {
      return undefined;
    }
    return {
      subjectDid: license.subjectDid,
      ...(license.role ? { role: license.role } : {}),
      grantClaims: license.grantClaims,
      ...(license.authorizationEvidenceId
        ? { authorizationEvidenceId: license.authorizationEvidenceId }
        : {}),
      ...(license.issuerDid ? { issuerDid: license.issuerDid } : {}),
      subjectClaims,
    } satisfies AuthorizedIndividualSubject;
  }));

  for (const subject of resolved.filter((value): value is AuthorizedIndividualSubject => Boolean(value))) {
    subjectsByDid.set(subject.subjectDid, subject);
  }
  return [...subjectsByDid.values()];
}

function readOwnedSubjects(
  result: SubmitAndPollResult,
  verified: Readonly<{ email: string; telephone: string }>,
): AuthorizedIndividualSubject[] {
  const resources = readData(result).flatMap((entry: any) => {
    if (entry?.resource?.resourceType === 'Bundle' && Array.isArray(entry.resource.entry)) {
      return entry.resource.entry.map((item: any) => item?.resource).filter(Boolean);
    }
    return [];
  });
  return resources.flatMap((resource: any) => {
    const claims = resource?.meta?.claims;
    if (!claims || typeof claims !== 'object') return [];
    const ownerEmail = String(claims[CLAIM_ORGANIZATION_OWNER_EMAIL] || '').trim().toLowerCase();
    const ownerTelephone = String(claims[CLAIM_ORGANIZATION_OWNER_TELEPHONE] || '').trim();
    if (!((verified.email && ownerEmail === verified.email) || (verified.telephone && ownerTelephone === verified.telephone))) {
      return [];
    }
    const subjectDid = String(claims[CLAIM_ORGANIZATION_SAME_AS] || '').trim();
    if (!subjectDid) return [];
    const role = String(claims[CLAIM_ORGANIZATION_MEMBER_ROLE] || '').trim();
    return [{
      subjectDid,
      ...(role ? { role } : {}),
      grantClaims: {},
      subjectClaims: claims as Readonly<Record<string, unknown>>,
    }];
  });
}

function readAcceptedLicenses(result: SubmitAndPollResult): AcceptedLicenseRow[] {
  const rows = readData(result)[0]?.resource?.data;
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((row: any) => {
    const meta = row?.meta || row?.resource?.meta || {};
    const subjectDid = String(meta.authorizedSubjectDid || '').trim();
    if (!subjectDid) return [];
    const claims = (meta.claims || {}) as Record<string, unknown>;
    const relatedRoles = String(claims[CLAIM_RELATED_PERSON_ROLE] || '')
      .split(',')
      .map((value) => value.trim().toUpperCase())
      .filter(Boolean);
    const occupation = String(claims[CLAIM_OCCUPATION_IDENTIFIER] || '').trim();
    const role = relatedRoles.includes('CAREGIVER') ? 'CAREGIVER' : occupation;
    return [{
      subjectDid,
      ...(role ? { role } : {}),
      grantClaims: claims,
      ...(meta.identifier ? { authorizationEvidenceId: String(meta.identifier) } : {}),
      ...(meta.issuerDid ? { issuerDid: String(meta.issuerDid) } : {}),
    }];
  });
}

function readFirstClaims(result: SubmitAndPollResult): Record<string, unknown> {
  const entry = readData(result)[0];
  const claims = entry?.meta?.claims || entry?.resource?.meta?.claims;
  return claims && typeof claims === 'object' ? claims : {};
}

function readData(result: SubmitAndPollResult): any[] {
  const pollBody = (result?.poll?.body || {}) as any;
  const root = pollBody?.body || pollBody;
  return Array.isArray(root?.data) ? root.data : [];
}

function createThreadId(prefix: string): string {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
}
