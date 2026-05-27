// Copyright 2026 Antifraud Services Inc. under the Apache License, Version 2.0.
/**
 * @fileoverview Runtime helpers for GW resource submit/poll operations.
 *
 * @architecture 101
 * - Keep request-payload construction centralized here.
 * - Reuse shared DTO/parameter constants instead of repeating string literals.
 */

import { HealthcareBasicSections } from 'gdc-common-utils-ts/constants';
import type {
  BundleSearchQuery,
  CommunicationInput,
  DateRange,
  RelatedProfileSearchInput,
} from 'gdc-sdk-core-ts';
import {
  RELATED_PROFILE_SEARCH_PARAM_ACTOR_IDENTIFIER,
  RELATED_PROFILE_SEARCH_PARAM_INCLUDE_INACTIVE,
  RELATED_PROFILE_SEARCH_PARAM_RELATIONSHIP,
  RELATED_PROFILE_SEARCH_PARAM_SUBJECT_ID,
} from 'gdc-sdk-core-ts';
import {
  GwCoreLifecycleRequestMethod,
  GwCoreLifecycleRequestType,
  GwCoreLifecycleTodo,
} from './constants/lifecycle.js';
import type { SubmitAndPollResult } from './orchestration/client-port.js';
import type { RouteContext } from './individual-onboarding.js';

export type OrganizationEmployeeCreationInput = {
  /**
   * Canonical employee/person claims sent to CORE GW.
   *
   * Use `org.schema.Person.*` claim keys, not invented `Employee.*` keys.
   * Typical examples are:
   * - `@context = org.schema`
   * - `org.schema.Person.identifier`
   * - `org.schema.Person.email`
   * - `org.schema.Person.hasOccupation.identifier.value`
   * - optionally `org.schema.Person.memberOf`
   * - canonically `org.schema.Person.memberOf.taxID` for employee membership under an organization
   *
   * Current CORE GW examples and ICA representative/employee materials are based
   * on `org.schema.Person.memberOf.taxID`. In shared constants this can be
   * referenced as `ClaimsPersonSchemaorg.memberOfOrgTaxId`. Do not invent
   * `Employee.*` claims.
   */
  employeeClaims: Record<string, unknown>;
  dataType?: string;
};

/**
 * Current GW CORE employee lifecycle locator payload.
 *
 * Current backend behavior:
 * - disable is still `Employee/_batch` with entry `request.method = DELETE`
 * - purge is `Employee/_purge` with entry `request.method = POST`
 *
 * This SDK intentionally models the deployed GW CORE contract. It does not
 * synthesize the future normalized `_batch + PATCH` contract ahead of the backend.
 */
export type OrganizationEmployeeLifecycleInput = {
  /**
   * Canonical employee/person claims used by GW CORE to locate the employee.
   */
  employeeClaims: Record<string, unknown>;
  /**
   * Optional canonical resource id when already known by the caller.
   */
  resourceId?: string;
  dataType?: string;
};

/**
 * Current GW CORE individual/family lifecycle locator payload.
 *
 * Current backend behavior:
 * - disable is `individual/org.schema/Organization/_disable`
 * - purge is `individual/org.schema/Organization/_purge`
 */
export type IndividualOrganizationLifecycleInput = {
  /**
   * Canonical claims used by GW CORE to locate the hosted individual/family
   * registration.
   */
  organizationClaims: Record<string, unknown>;
  /**
   * Optional canonical resource id when already known by the caller.
   */
  resourceId?: string;
  dataType?: string;
};

/**
 * Forward-looking locator payload for a future individual-member lifecycle contract.
 *
 * Current GW CORE does not yet expose a stable lifecycle contract for
 * `RelatedPerson` / individual-member records. The Node SDK keeps this type so
 * controller-only methods and TDD can be prepared without fabricating backend behavior.
 */
export type IndividualMemberLifecycleInput = {
  /**
   * Canonical claims expected to locate the member/caregiver relationship once
   * GW CORE exposes the lifecycle contract.
   */
  memberClaims: Record<string, unknown>;
  resourceId?: string;
  dataType?: string;
};

export type IpsOrFhirImportInput = {
  compositionPayload: { thid?: string } & Record<string, unknown>;
  format?: 'api' | 'r4';
  pollOptions?: { timeoutMs?: number; intervalMs?: number };
};

export type RelatedPersonUpsertInput = {
  relatedPersonPayload: { thid?: string } & Record<string, unknown>;
  pollOptions?: { timeoutMs?: number; intervalMs?: number };
};

export type RelatedProfileSearchRuntimeInput = RelatedProfileSearchInput & {
  requestThid?: string;
  pollOptions?: { timeoutMs?: number; intervalMs?: number };
};

export type CommunicationIngestionInput = {
  communicationPayload: CommunicationInput & Record<string, unknown>;
  pathFormatSegment?: 'org.hl7.fhir.api' | 'org.hl7.fhir.r4' | 'api' | 'r4' | 'fhir.r4';
  autoConvertClaimsToFhirR4?: boolean;
  pollOptions?: { timeoutMs?: number; intervalMs?: number };
};

export type ClinicalDateRange = DateRange;

export type ClinicalBundleSearchInput = Omit<BundleSearchQuery, 'section' | 'searchParams'> & {
  section?: string | string[];
  extraSearchParams?: BundleSearchQuery['searchParams'];
  requestThid?: string;
  pollOptions?: { timeoutMs?: number; intervalMs?: number };
};

export type ConsentActorTargetInput =
  | string
  | string[]
  | {
    identifier?: string;
    url?: string;
    didWeb?: string;
    organizationUrl?: string;
    organizationTaxId?: string;
    email?: string;
    phone?: string;
  };

export type GrantProfessionalAccessInput = {
  subjectDid?: string;
  /**
   * Compatibility/extension field.
   *
   * CORE canonical consent examples identify the subject with `subjectDid`.
   * Phone-based subject targeting should be treated as an extension concern.
   */
  subjectPhone?: string;
  /**
   * Compatibility/extension field used by phone/notification-heavy UX layers.
   *
   * CORE canonical consent examples do not require a display name side-field.
   */
  subjectGivenName?: string;
  /**
   * Canonical flat actor identifier for the actor receiving the permission.
   *
   * Preferred input forms:
   * - `did:web:...`
   * - `user@example.org`
   * - `tel:+34600111222`
   * - `ES`
   * - comma-separated lists or string arrays of those tokens
   *
   * A legacy structured object is still accepted for compatibility, but new
   * integrations should send canonical strings or string arrays.
   */
  actorId?: ConsentActorTargetInput;
  /**
   * @deprecated Use `actorId`.
   */
  actor?: ConsentActorTargetInput;
  actorRole: string;
  purpose: string;
  actions: string[];
  consentIdentifier?: string;
  consentDate?: string;
  decision?: 'permit' | 'deny';
  attachmentContentType?: string;
  attachmentBase64?: string;
  dataType?: string;
  pollOptions?: { timeoutMs?: number; intervalMs?: number };
};

export type GrantProfessionalAccessResult = {
  thid: string;
  consent: SubmitAndPollResult;
  subjectIdentifier: string;
  actorIdentifier: string;
  consentClaims: Record<string, unknown>;
  claimsCid?: string;
};

export type DigitalTwinGenerationInput = {
  compositionPayload: { thid?: string } & Record<string, unknown>;
  format?: 'api' | 'r4';
  pollOptions?: { timeoutMs?: number; intervalMs?: number };
};

export async function createOrganizationEmployeeWithDeps(
  routeCtx: RouteContext,
  input: OrganizationEmployeeCreationInput,
  options: { timeoutMs?: number; intervalMs?: number } | undefined,
  deps: {
    employeeBatchPath: (ctx: RouteContext) => string;
    employeePollPath: (ctx: RouteContext) => string;
    submitAndPoll: (
      submitPath: string,
      pollPath: string,
      payload: { thid?: string } & Record<string, unknown>,
      pollOptions?: { timeoutMs?: number; intervalMs?: number },
    ) => Promise<SubmitAndPollResult>;
  },
): Promise<SubmitAndPollResult> {
  const payload = buildEmployeeLifecyclePayload({
    routeCtx,
    requestType: input.dataType || GwCoreLifecycleRequestType.EmployeeCreate,
    requestMethod: GwCoreLifecycleRequestMethod.Post,
    employeeClaims: input.employeeClaims,
    thidPrefix: 'employee',
  });
  return deps.submitAndPoll(
    deps.employeeBatchPath(routeCtx),
    deps.employeePollPath(routeCtx),
    payload,
    options,
  );
}

export async function disableOrganizationEmployeeWithDeps(
  routeCtx: RouteContext,
  input: OrganizationEmployeeLifecycleInput,
  options: { timeoutMs?: number; intervalMs?: number } | undefined,
  deps: {
    employeeBatchPath: (ctx: RouteContext) => string;
    employeePollPath: (ctx: RouteContext) => string;
    submitAndPoll: (
      submitPath: string,
      pollPath: string,
      payload: { thid?: string } & Record<string, unknown>,
      pollOptions?: { timeoutMs?: number; intervalMs?: number },
    ) => Promise<SubmitAndPollResult>;
  },
): Promise<SubmitAndPollResult> {
  // TODO(gw-core-lifecycle-target-patch-employee-disable): switch this
  // legacy DELETE-in-_batch flow to `_batch + PATCH` when GW CORE deploys it.
  void GwCoreLifecycleTodo.EmployeeDisablePatchMigration;
  const payload = buildEmployeeLifecyclePayload({
    routeCtx,
    requestType: input.dataType || GwCoreLifecycleRequestType.EmployeeDisable,
    requestMethod: GwCoreLifecycleRequestMethod.Delete,
    employeeClaims: input.employeeClaims,
    resourceId: input.resourceId,
    thidPrefix: 'employee-disable',
  });
  return deps.submitAndPoll(
    deps.employeeBatchPath(routeCtx),
    deps.employeePollPath(routeCtx),
    payload,
    options,
  );
}

export async function purgeOrganizationEmployeeWithDeps(
  routeCtx: RouteContext,
  input: OrganizationEmployeeLifecycleInput,
  options: { timeoutMs?: number; intervalMs?: number } | undefined,
  deps: {
    employeePurgePath: (ctx: RouteContext) => string;
    employeePurgePollPath: (ctx: RouteContext) => string;
    submitAndPoll: (
      submitPath: string,
      pollPath: string,
      payload: { thid?: string } & Record<string, unknown>,
      pollOptions?: { timeoutMs?: number; intervalMs?: number },
    ) => Promise<SubmitAndPollResult>;
  },
): Promise<SubmitAndPollResult> {
  const payload = buildEmployeeLifecyclePayload({
    routeCtx,
    requestType: input.dataType || GwCoreLifecycleRequestType.EmployeePurge,
    requestMethod: GwCoreLifecycleRequestMethod.Post,
    employeeClaims: input.employeeClaims,
    resourceId: input.resourceId,
    thidPrefix: 'employee-purge',
  });
  return deps.submitAndPoll(
    deps.employeePurgePath(routeCtx),
    deps.employeePurgePollPath(routeCtx),
    payload,
    options,
  );
}

export async function disableIndividualOrganizationWithDeps(
  routeCtx: RouteContext,
  input: IndividualOrganizationLifecycleInput,
  options: { timeoutMs?: number; intervalMs?: number } | undefined,
  deps: {
    individualOrganizationDisablePath: (ctx: RouteContext) => string;
    individualOrganizationDisablePollPath: (ctx: RouteContext) => string;
    submitAndPoll: (
      submitPath: string,
      pollPath: string,
      payload: { thid?: string } & Record<string, unknown>,
      pollOptions?: { timeoutMs?: number; intervalMs?: number },
    ) => Promise<SubmitAndPollResult>;
  },
): Promise<SubmitAndPollResult> {
  // TODO(gw-core-lifecycle-target-patch-individual-disable): migrate from
  // explicit `_disable` to `_batch + PATCH` only after GW CORE supports it.
  void GwCoreLifecycleTodo.IndividualDisablePatchMigration;
  const payload = buildIndividualOrganizationLifecyclePayload({
    routeCtx,
    requestType: input.dataType || GwCoreLifecycleRequestType.IndividualOrganizationDisable,
    organizationClaims: input.organizationClaims,
    resourceId: input.resourceId,
    thidPrefix: 'individual-organization-disable',
  });
  return deps.submitAndPoll(
    deps.individualOrganizationDisablePath(routeCtx),
    deps.individualOrganizationDisablePollPath(routeCtx),
    payload,
    options,
  );
}

export async function purgeIndividualOrganizationWithDeps(
  routeCtx: RouteContext,
  input: IndividualOrganizationLifecycleInput,
  options: { timeoutMs?: number; intervalMs?: number } | undefined,
  deps: {
    individualOrganizationPurgePath: (ctx: RouteContext) => string;
    individualOrganizationPurgePollPath: (ctx: RouteContext) => string;
    submitAndPoll: (
      submitPath: string,
      pollPath: string,
      payload: { thid?: string } & Record<string, unknown>,
      pollOptions?: { timeoutMs?: number; intervalMs?: number },
    ) => Promise<SubmitAndPollResult>;
  },
): Promise<SubmitAndPollResult> {
  const payload = buildIndividualOrganizationLifecyclePayload({
    routeCtx,
    requestType: input.dataType || GwCoreLifecycleRequestType.IndividualOrganizationPurge,
    organizationClaims: input.organizationClaims,
    resourceId: input.resourceId,
    thidPrefix: 'individual-organization-purge',
  });
  return deps.submitAndPoll(
    deps.individualOrganizationPurgePath(routeCtx),
    deps.individualOrganizationPurgePollPath(routeCtx),
    payload,
    options,
  );
}

export async function importIpsOrFhirAndUpdateIndexWithDeps(
  routeCtx: RouteContext,
  input: IpsOrFhirImportInput,
  deps: {
    individualCompositionR4BatchPath: (ctx: RouteContext) => string;
    individualCompositionR4PollPath: (ctx: RouteContext) => string;
    submitAndPoll: (
      submitPath: string,
      pollPath: string,
      payload: { thid?: string } & Record<string, unknown>,
      pollOptions?: { timeoutMs?: number; intervalMs?: number },
    ) => Promise<SubmitAndPollResult>;
  },
): Promise<SubmitAndPollResult> {
  const payload = {
    thid: input.compositionPayload.thid || `composition-${createRuntimeUuid()}`,
    ...input.compositionPayload,
  };
  const submitPath = (input.format || 'r4') === 'api'
    ? deps.individualCompositionR4BatchPath(routeCtx).replace('/org.hl7.fhir.r4/', '/org.hl7.fhir.api/')
    : deps.individualCompositionR4BatchPath(routeCtx);
  const pollPath = (input.format || 'r4') === 'api'
    ? deps.individualCompositionR4PollPath(routeCtx).replace('/org.hl7.fhir.r4/', '/org.hl7.fhir.api/')
    : deps.individualCompositionR4PollPath(routeCtx);
  return deps.submitAndPoll(submitPath, pollPath, payload, input.pollOptions);
}

export async function upsertRelatedPersonAndPollWithDeps(
  routeCtx: RouteContext,
  input: RelatedPersonUpsertInput,
  deps: {
    individualRelatedPersonBatchPath: (ctx: RouteContext) => string;
    individualRelatedPersonPollPath: (ctx: RouteContext) => string;
    submitAndPoll: (
      submitPath: string,
      pollPath: string,
      payload: { thid?: string } & Record<string, unknown>,
      pollOptions?: { timeoutMs?: number; intervalMs?: number },
    ) => Promise<SubmitAndPollResult>;
  },
): Promise<SubmitAndPollResult> {
  const payload = {
    thid: input.relatedPersonPayload.thid || `relatedperson-${createRuntimeUuid()}`,
    ...input.relatedPersonPayload,
  };
  return deps.submitAndPoll(
    deps.individualRelatedPersonBatchPath(routeCtx),
    deps.individualRelatedPersonPollPath(routeCtx),
    payload,
    input.pollOptions,
  );
}

export async function searchRelatedProfilesWithDeps(
  routeCtx: RouteContext,
  input: RelatedProfileSearchRuntimeInput,
  deps: {
    individualRelatedPersonSearchPath: (ctx: RouteContext) => string;
    individualRelatedPersonSearchPollPath: (ctx: RouteContext) => string;
    submitAndPoll: (
      submitPath: string,
      pollPath: string,
      payload: { thid?: string } & Record<string, unknown>,
      pollOptions?: { timeoutMs?: number; intervalMs?: number },
    ) => Promise<SubmitAndPollResult>;
  },
): Promise<SubmitAndPollResult> {
  const payload = {
    thid: input.requestThid || `relatedprofile-search-${createRuntimeUuid()}`,
    body: {
      resourceType: 'Parameters',
      parameter: [
        { name: RELATED_PROFILE_SEARCH_PARAM_ACTOR_IDENTIFIER, valueString: input.actorIdentifier },
        ...(input.subjectId ? [{ name: RELATED_PROFILE_SEARCH_PARAM_SUBJECT_ID, valueString: input.subjectId }] : []),
        ...(input.relationship ? [{ name: RELATED_PROFILE_SEARCH_PARAM_RELATIONSHIP, valueString: input.relationship }] : []),
        ...(input.includeInactive === true ? [{ name: RELATED_PROFILE_SEARCH_PARAM_INCLUDE_INACTIVE, valueBoolean: true }] : []),
      ],
    },
  };
  return deps.submitAndPoll(
    deps.individualRelatedPersonSearchPath(routeCtx),
    deps.individualRelatedPersonSearchPollPath(routeCtx),
    payload,
    input.pollOptions,
  );
}

export async function ingestCommunicationAndUpdateIndexWithDeps(
  routeCtx: RouteContext,
  input: CommunicationIngestionInput,
  deps: {
    individualCommunicationBatchPath: (ctx: RouteContext, pathFormatSegment: 'org.hl7.fhir.api' | 'org.hl7.fhir.r4') => string;
    individualCommunicationPollPath: (ctx: RouteContext, pathFormatSegment: 'org.hl7.fhir.api' | 'org.hl7.fhir.r4') => string;
    transformPayloadForFhirR4?: (
      payload: Record<string, unknown>,
      enabled: boolean,
    ) => Record<string, unknown>;
    submitAndPoll: (
      submitPath: string,
      pollPath: string,
      payload: { thid?: string } & Record<string, unknown>,
      pollOptions?: { timeoutMs?: number; intervalMs?: number },
    ) => Promise<SubmitAndPollResult>;
  },
): Promise<SubmitAndPollResult> {
  const payload = {
    thid: input.communicationPayload.thid || `communication-${createRuntimeUuid()}`,
    ...input.communicationPayload,
  };
  const pathFormatSegment = normalizeCommunicationPathFormatSegment(input.pathFormatSegment);
  const convertedPayload = pathFormatSegment === 'org.hl7.fhir.r4'
    ? (deps.transformPayloadForFhirR4
      ? deps.transformPayloadForFhirR4(payload, input.autoConvertClaimsToFhirR4 !== false)
      : payload)
    : payload;

  return deps.submitAndPoll(
    deps.individualCommunicationBatchPath(routeCtx, pathFormatSegment),
    deps.individualCommunicationPollPath(routeCtx, pathFormatSegment),
    convertedPayload,
    input.pollOptions,
  );
}

export async function searchClinicalBundleWithDeps(
  routeCtx: RouteContext,
  input: ClinicalBundleSearchInput,
  deps: {
    bundleSearchPath: (ctx: RouteContext) => string;
    bundleSearchPollPath: (ctx: RouteContext) => string;
    submitAndPoll: (
      submitPath: string,
      pollPath: string,
      payload: { thid?: string } & Record<string, unknown>,
      pollOptions?: { timeoutMs?: number; intervalMs?: number },
    ) => Promise<SubmitAndPollResult>;
  },
): Promise<SubmitAndPollResult> {
  const query = buildBundleSearchQuery(input);
  const payload = {
    thid: input.requestThid || `bundle-search-${createRuntimeUuid()}`,
    body: {
      resourceType: 'Bundle',
      type: 'batch',
      entry: [{ request: { method: 'GET', url: query } }],
    },
  };
  return deps.submitAndPoll(
    deps.bundleSearchPath(routeCtx),
    deps.bundleSearchPollPath(routeCtx),
    payload,
    input.pollOptions,
  );
}

export async function searchLatestIpsWithDeps(
  routeCtx: RouteContext,
  input: Omit<ClinicalBundleSearchInput, 'includedTypes' | 'section'> & { section?: string | string[] },
  deps: {
    searchClinicalBundle: (
      routeCtx: RouteContext,
      input: ClinicalBundleSearchInput,
    ) => Promise<SubmitAndPollResult>;
  },
): Promise<SubmitAndPollResult> {
  return deps.searchClinicalBundle(routeCtx, {
    ...input,
    section: input.section || HealthcareBasicSections.PatientSummaryDocument.claim,
    includedTypes: ['Composition', 'DocumentReference'],
  });
}

export async function grantProfessionalAccessWithDeps(
  routeCtx: RouteContext,
  input: GrantProfessionalAccessInput,
  deps: {
    buildConsentClaimsWithCid: (
      input: GrantProfessionalAccessInput,
      options?: { consentIdentifierFactory: () => string },
    ) => {
      actorIdentifier: string;
      subjectIdentifier: string;
      consentClaims: Record<string, unknown>;
      claimsCid?: string;
    };
    individualConsentR4BatchPath: (ctx: RouteContext) => string;
    individualConsentR4PollPath: (ctx: RouteContext) => string;
    submitAndPoll: (
      submitPath: string,
      pollPath: string,
      payload: { thid?: string } & Record<string, unknown>,
      pollOptions?: { timeoutMs?: number; intervalMs?: number },
    ) => Promise<SubmitAndPollResult>;
  },
): Promise<GrantProfessionalAccessResult> {
  const built = deps.buildConsentClaimsWithCid(
    {
      subjectDid: input.subjectDid,
      subjectPhone: input.subjectPhone,
      subjectGivenName: input.subjectGivenName,
      actor: input.actorId ?? input.actor,
      actorRole: input.actorRole,
      purpose: input.purpose,
      actions: input.actions,
      consentIdentifier: input.consentIdentifier,
      consentDate: input.consentDate,
      decision: input.decision,
      attachmentContentType: input.attachmentContentType,
      attachmentBase64: input.attachmentBase64,
    },
    {
      consentIdentifierFactory: () => `urn:uuid:${createRuntimeUuid()}`,
    },
  );

  const thid = `consent-${createRuntimeUuid()}`;
  const consentPayload = {
    thid,
    body: {
      data: [{
        type: input.dataType || 'Consent-grant-request-v1.0',
        meta: { claims: built.consentClaims },
        resource: { resourceType: 'Consent', meta: { claims: built.consentClaims } },
      }],
    },
  };

  const consent = await deps.submitAndPoll(
    deps.individualConsentR4BatchPath(routeCtx),
    deps.individualConsentR4PollPath(routeCtx),
    consentPayload,
    input.pollOptions,
  );

  return {
    thid,
    consent,
    actorIdentifier: built.actorIdentifier,
    subjectIdentifier: built.subjectIdentifier,
    consentClaims: built.consentClaims,
    claimsCid: built.claimsCid,
  };
}

export async function generateDigitalTwinFromSubjectDataWithDeps(
  routeCtx: RouteContext,
  input: DigitalTwinGenerationInput,
  deps: {
    digitalTwinCompositionApiBatchPath: (ctx: RouteContext) => string;
    digitalTwinCompositionApiPollPath: (ctx: RouteContext) => string;
    digitalTwinCompositionR4BatchPath: (ctx: RouteContext) => string;
    digitalTwinCompositionR4PollPath: (ctx: RouteContext) => string;
    submitAndPoll: (
      submitPath: string,
      pollPath: string,
      payload: { thid?: string } & Record<string, unknown>,
      pollOptions?: { timeoutMs?: number; intervalMs?: number },
    ) => Promise<SubmitAndPollResult>;
  },
): Promise<SubmitAndPollResult> {
  const payload = {
    thid: input.compositionPayload.thid || `digital-twin-${createRuntimeUuid()}`,
    ...input.compositionPayload,
  };
  const submitPath = (input.format || 'r4') === 'api'
    ? deps.digitalTwinCompositionApiBatchPath(routeCtx)
    : deps.digitalTwinCompositionR4BatchPath(routeCtx);
  const pollPath = (input.format || 'r4') === 'api'
    ? deps.digitalTwinCompositionApiPollPath(routeCtx)
    : deps.digitalTwinCompositionR4PollPath(routeCtx);
  return deps.submitAndPoll(submitPath, pollPath, payload, input.pollOptions);
}

function normalizeCommunicationPathFormatSegment(
  raw?: 'org.hl7.fhir.api' | 'org.hl7.fhir.r4' | 'api' | 'r4' | 'fhir.r4',
): 'org.hl7.fhir.api' | 'org.hl7.fhir.r4' {
  const value = String(raw || '').trim().toLowerCase();
  if (!value || value === 'api' || value === 'org.hl7.fhir.api') return 'org.hl7.fhir.api';
  if (value === 'r4' || value === 'fhir.r4' || value === 'org.hl7.fhir.r4') return 'org.hl7.fhir.r4';
  return 'org.hl7.fhir.api';
}

function createRuntimeUuid(): string {
  const fromCrypto = globalThis.crypto?.randomUUID?.();
  if (fromCrypto) {
    return fromCrypto;
  }
  return `fallback-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function buildEmployeeLifecyclePayload(input: {
  routeCtx: RouteContext;
  requestType: string;
  requestMethod: string;
  employeeClaims: Record<string, unknown> | undefined;
  resourceId?: string;
  thidPrefix: string;
}): {
  jti: string;
  iss: string;
  aud: string;
  type: string;
  thid: string;
  body: {
    data: Array<{
      type: string;
      request: { method: string };
      meta: { claims: Record<string, unknown> };
      resource: { id?: string; meta: { claims: Record<string, unknown> } };
    }>;
  };
} {
  const claims = input.employeeClaims || {};
  return {
    jti: `jti-${createRuntimeUuid()}`,
    iss: input.routeCtx.tenantId,
    aud: input.routeCtx.tenantId,
    type: 'application/didcomm-plain+json',
    thid: `${input.thidPrefix}-${createRuntimeUuid()}`,
    body: {
      data: [{
        type: input.requestType,
        request: { method: input.requestMethod },
        meta: { claims },
        resource: {
          ...(input.resourceId ? { id: input.resourceId } : {}),
          meta: { claims },
        },
      }],
    },
  };
}

function buildIndividualOrganizationLifecyclePayload(input: {
  routeCtx: RouteContext;
  requestType: string;
  organizationClaims: Record<string, unknown> | undefined;
  resourceId?: string;
  thidPrefix: string;
}): {
  jti: string;
  iss: string;
  aud: string;
  type: string;
  thid: string;
  body: {
    data: Array<{
      type: string;
      request: { method: string };
      meta: { claims: Record<string, unknown> };
      resource: { id?: string; meta: { claims: Record<string, unknown> } };
    }>;
  };
} {
  const claims = input.organizationClaims || {};
  return {
    jti: `jti-${createRuntimeUuid()}`,
    iss: input.routeCtx.tenantId,
    aud: input.routeCtx.tenantId,
    type: 'application/didcomm-plain+json',
    thid: `${input.thidPrefix}-${createRuntimeUuid()}`,
    body: {
      data: [{
        type: input.requestType,
        request: { method: GwCoreLifecycleRequestMethod.Post },
        meta: { claims },
        resource: {
          ...(input.resourceId ? { id: input.resourceId } : {}),
          meta: { claims },
        },
      }],
    },
  };
}

function buildBundleSearchQuery(input: ClinicalBundleSearchInput): string {
  const params = new URLSearchParams();
  params.set('subject', input.subject);

  const sectionValues = normalizeToCsv(input.section);
  if (sectionValues) params.set('composition.section', sectionValues);

  const typeValues = normalizeToCsv(input.includedTypes);
  if (typeValues) params.set('_type', typeValues);

  if (input.date?.start) params.set('start', input.date.start);
  if (input.date?.end) params.set('end', input.date.end);

  const codeValues = normalizeToCsv(input.code);
  if (codeValues) params.set('code', codeValues);

  const categoryValues = normalizeToCsv(input.category);
  if (categoryValues) params.set('category', categoryValues);

  const authorValues = normalizeToCsv(input.author);
  if (authorValues) params.set('author', authorValues);

  if (input.thid) params.set('thid', input.thid);
  if (input.pthid) params.set('pthid', input.pthid);
  if (input.channelId) params.set('channelId', input.channelId);
  if (input.partOf) params.set('part-of', input.partOf);

  if (input.extraSearchParams) {
    for (const [key, value] of Object.entries(input.extraSearchParams)) {
      if (value === undefined || value === null || String(value).trim() === '') continue;
      params.set(key, String(value));
    }
  }

  return `Bundle?type=document&${params.toString()}`;
}

function normalizeToCsv(value?: string | string[]): string {
  if (!value) return '';
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean).join(',');
  return String(value).trim();
}
