// Copyright 2026 Antifraud Services Inc. under the Apache License, Version 2.0.

import { HealthcareBasicSections, ResourceTypesFhirR4 } from 'gdc-common-utils-ts/constants';
import { Format } from 'gdc-common-utils-ts/constants/Schemas';
import { RelatedPersonClaim } from 'gdc-common-utils-ts/models/interoperable-claims/related-person-claims';
import {
  buildCommunicationParticipantSearchBundle,
  createInteroperableResourceOperationEditor,
  IndividualOrganizationLifecycleEditor,
  LicenseOfferSearchEditor,
  LicenseOrderSearchEditor,
  InteroperableLifecycleStatuses,
  LicenseListSearchEditor,
} from 'gdc-common-utils-ts';
import type { LicenseOfferSearchState, LicenseOrderSearchState } from 'gdc-common-utils-ts/utils/license-commercial-search';
import type { LicenseListSearchState } from 'gdc-common-utils-ts/utils/license-list-search';
import type {
  BundleSearchQuery,
  CommunicationInput,
  DateRange,
  EmployeeSearchValue,
  IndividualOrganizationLifecycleInput,
} from 'gdc-sdk-core-ts';
import {
  GwCoreLifecycleRequestMethod,
  GwCoreLifecycleRequestType,
  GwCoreLifecycleTodo,
} from './constants/lifecycle.js';
import {
  buildEmployeeBatchEntry,
  buildEmployeeSearchBundle,
  ConsentClaims,
} from 'gdc-sdk-core-ts';
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
   * Canonical employee/person claims carried as the exportable employee identity.
   *
   * These claims should still include the business/external identifier
   * (`org.schema.Person.identifier`) when available, but runtime lifecycle
   * operations must prefer `resourceId` as the concrete GW profile locator.
   * Treat `resource.id` as the current technical record anchor and
   * `identifier` as the interoperable/exported identity value.
   */
  employeeClaims: Record<string, unknown>;
  /**
   * Preferred current GW employee profile id returned by create/search.
   *
   * Pass this for disable/purge whenever the caller already knows the active
   * profile row. The SDK forwards it as `Bundle.entry.resource.id`, which GW
   * now treats as the primary operational locator for lifecycle actions.
   */
  resourceId: string;
  dataType?: string;
};

export type OrganizationEmployeeSearchInput = {
  /**
   * Canonical employee/person claims used as search filters against GW CORE.
   *
   * Typical examples:
   * - `org.schema.Person.email`
   * - `org.schema.Person.hasOccupation.identifier.value`
   * - `org.schema.Person.memberOf.taxID`
   */
  employeeClaims?: Record<string, EmployeeSearchValue>;
  requestThid?: string;
  pollOptions?: { timeoutMs?: number; intervalMs?: number };
};

/**
 * Runtime search/list input for license seats exposed through actor facades.
 *
 * The semantic filter set comes from the shared license controller facade.
 */
export type LicenseListRuntimeSearchInput = {
  licenseQuery?: Partial<LicenseListSearchState>;
  requestThid?: string;
  pollOptions?: { timeoutMs?: number; intervalMs?: number };
};

/**
 * Runtime search/list input for commercial offer read-models exposed through
 * actor facades.
 */
export type LicenseOfferRuntimeSearchInput = {
  offerQuery?: Partial<LicenseOfferSearchState>;
  requestThid?: string;
  pollOptions?: { timeoutMs?: number; intervalMs?: number };
};

/**
 * Runtime search/list input for commercial order/payment read-models exposed
 * through actor facades.
 */
export type LicenseOrderRuntimeSearchInput = {
  orderQuery?: Partial<LicenseOrderSearchState>;
  requestThid?: string;
  pollOptions?: { timeoutMs?: number; intervalMs?: number };
};

/**
 * Current GW CORE individual/family lifecycle locator payload.
 *
 * Current backend behavior:
 * - disable is `individual/org.schema/Organization/_disable`
 * - purge is `individual/org.schema/Organization/_purge`
 */
/**
 * Current locator payload for individual-member / caregiver lifecycle
 * operations backed by `RelatedPerson`.
 *
 * Current runtime behavior:
 * - disable uses `RelatedPerson/_batch` with identifier-first lifecycle
 *   resource semantics
 * - purge uses explicit `RelatedPerson/_purge`
 */
export type IndividualMemberLifecycleInput = {
  /**
   * Canonical claims used to locate the member/caregiver relationship.
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

export type CommunicationIngestionInput = {
  communicationPayload: CommunicationInput & Record<string, unknown>;
  pathFormatSegment?: 'org.hl7.fhir.api' | 'org.hl7.fhir.r4' | 'api' | 'r4' | 'fhir.r4';
  autoConvertClaimsToFhirR4?: boolean;
  pollOptions?: { timeoutMs?: number; intervalMs?: number };
};

/**
 * Runtime participant query for `Communication/_search`.
 *
 * Search semantics:
 * - `subject` scopes which individual communication sections to inspect
 * - `userActorId` and `targetActorId` both match sender OR any recipient
 * - `senderActorId` and `recipientActorId` constrain one side explicitly
 * - `actorId` is the generic sender-or-recipient filter
 * - `*` means "all" for the corresponding operand
 *
 * Canonical prefixes are normalized by shared `gdc-common-utils-ts` helpers:
 * - `did:`
 * - `email:` / `mailto:`
 * - `tel:` / `phone:`
 */
export type CommunicationParticipantRuntimeSearchInput = {
  searchParams?: Record<string, string | number | boolean | Array<string | number | boolean> | undefined>;
  subject?: string | string[];
  actorId?: string | string[];
  senderActorId?: string | string[];
  recipientActorId?: string | string[];
  userActorId?: string | string[];
  targetActorId?: string | string[];
  periodStart?: string;
  periodEnd?: string;
  requestThid?: string;
  pollOptions?: { timeoutMs?: number; intervalMs?: number };
  page?: number;
  count?: number;
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

export type RevokeProfessionalAccessInput = {
  consentClaims: Record<string, unknown>;
  periodEnd?: string;
  dataType?: string;
  pollOptions?: { timeoutMs?: number; intervalMs?: number };
};

export type RevokeProfessionalAccessResult = {
  thid: string;
  consent: SubmitAndPollResult;
  consentClaims: Record<string, unknown>;
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
  assertEmployeeLifecycleResourceId(input.resourceId, 'disableEmployee');
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
  assertEmployeeLifecycleResourceId(input.resourceId, 'purgeEmployee');
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

function assertEmployeeLifecycleResourceId(resourceId: string, operation: 'disableEmployee' | 'purgeEmployee'): void {
  const normalized = String(resourceId || '').trim();
  if (!normalized) {
    throw new Error(`${operation}: resourceId is required and must be the current GW technical employee id (resource.id).`);
  }
}

export async function searchOrganizationEmployeesWithDeps(
  routeCtx: RouteContext,
  input: OrganizationEmployeeSearchInput,
  deps: {
    employeeSearchPath: (ctx: RouteContext) => string;
    employeeSearchPollPath: (ctx: RouteContext) => string;
    submitAndPoll: (
      submitPath: string,
      pollPath: string,
      payload: { thid?: string } & Record<string, unknown>,
      pollOptions?: { timeoutMs?: number; intervalMs?: number },
    ) => Promise<SubmitAndPollResult>;
  },
): Promise<SubmitAndPollResult> {
  return deps.submitAndPoll(
    deps.employeeSearchPath(routeCtx),
    deps.employeeSearchPollPath(routeCtx),
    {
      thid: input.requestThid || `employee-search-${createRuntimeUuid()}`,
      body: buildEmployeeSearchBundle({ claims: input.employeeClaims }),
    },
    input.pollOptions,
  );
}

/**
 * Searches license seats for one organization/tenant through `License/_search`.
 */
export async function searchOrganizationLicensesWithDeps(
  routeCtx: RouteContext,
  input: LicenseListRuntimeSearchInput,
  deps: {
    organizationLicenseSearchPath: (ctx: RouteContext) => string;
    organizationLicenseSearchPollPath: (ctx: RouteContext) => string;
    submitAndPoll: (
      submitPath: string,
      pollPath: string,
      payload: { thid?: string } & Record<string, unknown>,
      pollOptions?: { timeoutMs?: number; intervalMs?: number },
    ) => Promise<SubmitAndPollResult>;
  },
): Promise<SubmitAndPollResult> {
  return deps.submitAndPoll(
    deps.organizationLicenseSearchPath(routeCtx),
    deps.organizationLicenseSearchPollPath(routeCtx),
    {
      thid: input.requestThid || `organization-license-search-${createRuntimeUuid()}`,
      body: {
        resourceType: 'Bundle',
        type: 'batch',
        entry: [
          new LicenseListSearchEditor(input.licenseQuery || {})
            .buildSearchEntry(),
        ],
      },
    },
    input.pollOptions,
  );
}

/**
 * Lists license seats using the same canonical `License/_search` route with no
 * mandatory filters.
 */
export async function listOrganizationLicensesWithDeps(
  routeCtx: RouteContext,
  input: LicenseListRuntimeSearchInput | undefined,
  deps: Parameters<typeof searchOrganizationLicensesWithDeps>[2],
): Promise<SubmitAndPollResult> {
  return searchOrganizationLicensesWithDeps(routeCtx, input || {}, deps);
}

/**
 * Searches commercial license offers for one organization/tenant through
 * `Offer/_search`.
 */
export async function searchOrganizationLicenseOffersWithDeps(
  routeCtx: RouteContext,
  input: LicenseOfferRuntimeSearchInput,
  deps: {
    organizationLicenseOfferSearchPath: (ctx: RouteContext) => string;
    organizationLicenseOfferSearchPollPath: (ctx: RouteContext) => string;
    submitAndPoll: (
      submitPath: string,
      pollPath: string,
      payload: { thid?: string } & Record<string, unknown>,
      pollOptions?: { timeoutMs?: number; intervalMs?: number },
    ) => Promise<SubmitAndPollResult>;
  },
): Promise<SubmitAndPollResult> {
  return deps.submitAndPoll(
    deps.organizationLicenseOfferSearchPath(routeCtx),
    deps.organizationLicenseOfferSearchPollPath(routeCtx),
    {
      thid: input.requestThid || `organization-license-offer-search-${createRuntimeUuid()}`,
      body: {
        resourceType: 'Bundle',
        type: 'batch',
        data: [
          new LicenseOfferSearchEditor(input.offerQuery || {})
            .buildSearchEntry(),
        ],
      },
    },
    input.pollOptions,
  );
}

export async function listOrganizationLicenseOffersWithDeps(
  routeCtx: RouteContext,
  input: LicenseOfferRuntimeSearchInput | undefined,
  deps: Parameters<typeof searchOrganizationLicenseOffersWithDeps>[2],
): Promise<SubmitAndPollResult> {
  return searchOrganizationLicenseOffersWithDeps(routeCtx, input || {}, deps);
}

/**
 * Searches commercial license orders/payment projections for one
 * organization/tenant through `Order/_search`.
 */
export async function searchOrganizationLicenseOrdersWithDeps(
  routeCtx: RouteContext,
  input: LicenseOrderRuntimeSearchInput,
  deps: {
    organizationLicenseOrderSearchPath: (ctx: RouteContext) => string;
    organizationLicenseOrderSearchPollPath: (ctx: RouteContext) => string;
    submitAndPoll: (
      submitPath: string,
      pollPath: string,
      payload: { thid?: string } & Record<string, unknown>,
      pollOptions?: { timeoutMs?: number; intervalMs?: number },
    ) => Promise<SubmitAndPollResult>;
  },
): Promise<SubmitAndPollResult> {
  return deps.submitAndPoll(
    deps.organizationLicenseOrderSearchPath(routeCtx),
    deps.organizationLicenseOrderSearchPollPath(routeCtx),
    {
      thid: input.requestThid || `organization-license-order-search-${createRuntimeUuid()}`,
      body: {
        resourceType: 'Bundle',
        type: 'batch',
        data: [
          new LicenseOrderSearchEditor(input.orderQuery || {})
            .buildSearchEntry(),
        ],
      },
    },
    input.pollOptions,
  );
}

export async function listOrganizationLicenseOrdersWithDeps(
  routeCtx: RouteContext,
  input: LicenseOrderRuntimeSearchInput | undefined,
  deps: Parameters<typeof searchOrganizationLicenseOrdersWithDeps>[2],
): Promise<SubmitAndPollResult> {
  return searchOrganizationLicenseOrdersWithDeps(routeCtx, input || {}, deps);
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
    individualEditor: input.individualEditor,
    organizationEditor: input.organizationEditor,
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
    individualEditor: input.individualEditor,
    organizationEditor: input.organizationEditor,
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

/**
 * Searches license seats for one individual/family controller context through
 * the shared `License/_search` route.
 */
export async function searchIndividualLicensesWithDeps(
  routeCtx: RouteContext,
  input: LicenseListRuntimeSearchInput,
  deps: {
    individualLicenseSearchPath: (ctx: RouteContext) => string;
    individualLicenseSearchPollPath: (ctx: RouteContext) => string;
    submitAndPoll: (
      submitPath: string,
      pollPath: string,
      payload: { thid?: string } & Record<string, unknown>,
      pollOptions?: { timeoutMs?: number; intervalMs?: number },
    ) => Promise<SubmitAndPollResult>;
  },
): Promise<SubmitAndPollResult> {
  return deps.submitAndPoll(
    deps.individualLicenseSearchPath(routeCtx),
    deps.individualLicenseSearchPollPath(routeCtx),
    {
      thid: input.requestThid || `individual-license-search-${createRuntimeUuid()}`,
      body: {
        resourceType: 'Bundle',
        type: 'batch',
        entry: [
          new LicenseListSearchEditor(input.licenseQuery || {})
            .buildSearchEntry(),
        ],
      },
    },
    input.pollOptions,
  );
}

/**
 * Lists license seats for the individual/family side using the same canonical
 * search route without mandatory filters.
 */
export async function listIndividualLicensesWithDeps(
  routeCtx: RouteContext,
  input: LicenseListRuntimeSearchInput | undefined,
  deps: Parameters<typeof searchIndividualLicensesWithDeps>[2],
): Promise<SubmitAndPollResult> {
  return searchIndividualLicensesWithDeps(routeCtx, input || {}, deps);
}

export async function searchIndividualLicenseOffersWithDeps(
  routeCtx: RouteContext,
  input: LicenseOfferRuntimeSearchInput,
  deps: {
    individualLicenseOfferSearchPath: (ctx: RouteContext) => string;
    individualLicenseOfferSearchPollPath: (ctx: RouteContext) => string;
    submitAndPoll: (
      submitPath: string,
      pollPath: string,
      payload: { thid?: string } & Record<string, unknown>,
      pollOptions?: { timeoutMs?: number; intervalMs?: number },
    ) => Promise<SubmitAndPollResult>;
  },
): Promise<SubmitAndPollResult> {
  return deps.submitAndPoll(
    deps.individualLicenseOfferSearchPath(routeCtx),
    deps.individualLicenseOfferSearchPollPath(routeCtx),
    {
      thid: input.requestThid || `individual-license-offer-search-${createRuntimeUuid()}`,
      body: {
        resourceType: 'Bundle',
        type: 'batch',
        data: [
          new LicenseOfferSearchEditor(input.offerQuery || {})
            .buildSearchEntry(),
        ],
      },
    },
    input.pollOptions,
  );
}

export async function listIndividualLicenseOffersWithDeps(
  routeCtx: RouteContext,
  input: LicenseOfferRuntimeSearchInput | undefined,
  deps: Parameters<typeof searchIndividualLicenseOffersWithDeps>[2],
): Promise<SubmitAndPollResult> {
  return searchIndividualLicenseOffersWithDeps(routeCtx, input || {}, deps);
}

export async function searchIndividualLicenseOrdersWithDeps(
  routeCtx: RouteContext,
  input: LicenseOrderRuntimeSearchInput,
  deps: {
    individualLicenseOrderSearchPath: (ctx: RouteContext) => string;
    individualLicenseOrderSearchPollPath: (ctx: RouteContext) => string;
    submitAndPoll: (
      submitPath: string,
      pollPath: string,
      payload: { thid?: string } & Record<string, unknown>,
      pollOptions?: { timeoutMs?: number; intervalMs?: number },
    ) => Promise<SubmitAndPollResult>;
  },
): Promise<SubmitAndPollResult> {
  return deps.submitAndPoll(
    deps.individualLicenseOrderSearchPath(routeCtx),
    deps.individualLicenseOrderSearchPollPath(routeCtx),
    {
      thid: input.requestThid || `individual-license-order-search-${createRuntimeUuid()}`,
      body: {
        resourceType: 'Bundle',
        type: 'batch',
        data: [
          new LicenseOrderSearchEditor(input.orderQuery || {})
            .buildSearchEntry(),
        ],
      },
    },
    input.pollOptions,
  );
}

export async function listIndividualLicenseOrdersWithDeps(
  routeCtx: RouteContext,
  input: LicenseOrderRuntimeSearchInput | undefined,
  deps: Parameters<typeof searchIndividualLicenseOrdersWithDeps>[2],
): Promise<SubmitAndPollResult> {
  return searchIndividualLicenseOrdersWithDeps(routeCtx, input || {}, deps);
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

export async function disableIndividualMemberWithDeps(
  routeCtx: RouteContext,
  input: IndividualMemberLifecycleInput,
  options: { timeoutMs?: number; intervalMs?: number } | undefined,
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
  const claims: Record<string, unknown> = {
    '@context': String(input.memberClaims?.['@context'] || Format.FHIR_API).trim() || Format.FHIR_API,
    ...(input.memberClaims || {}),
  };
  const resource = createInteroperableResourceOperationEditor()
    .setResourceType(ResourceTypesFhirR4.RelatedPerson)
    .setIdentifierClaimKey(RelatedPersonClaim.IdentifierValue)
    .setBusinessIdentifier(String(claims[RelatedPersonClaim.IdentifierValue] || claims[RelatedPersonClaim.Identifier] || '').trim())
    .setClaims(claims)
    .setLifecycleStatus(InteroperableLifecycleStatuses.Inactive)
    .buildLifecycleResource();
  const payload = {
    thid: `relatedperson-disable-${createRuntimeUuid()}`,
    body: {
      resourceType: 'Bundle',
      type: 'batch',
      entry: [{
        request: { method: GwCoreLifecycleRequestMethod.Post },
        meta: { claims },
        resource: {
          ...resource,
          ...(input.resourceId ? { id: input.resourceId } : {}),
        },
      }],
    },
  };
  return deps.submitAndPoll(
    deps.individualRelatedPersonBatchPath(routeCtx),
    deps.individualRelatedPersonPollPath(routeCtx),
    payload,
    options,
  );
}

export async function purgeIndividualMemberWithDeps(
  routeCtx: RouteContext,
  input: IndividualMemberLifecycleInput,
  options: { timeoutMs?: number; intervalMs?: number } | undefined,
  deps: {
    individualRelatedPersonPurgePath: (ctx: RouteContext) => string;
    individualRelatedPersonPurgePollPath: (ctx: RouteContext) => string;
    submitAndPoll: (
      submitPath: string,
      pollPath: string,
      payload: { thid?: string } & Record<string, unknown>,
      pollOptions?: { timeoutMs?: number; intervalMs?: number },
    ) => Promise<SubmitAndPollResult>;
  },
): Promise<SubmitAndPollResult> {
  const claims: Record<string, unknown> = {
    '@context': String(input.memberClaims?.['@context'] || Format.FHIR_API).trim() || Format.FHIR_API,
    ...(input.memberClaims || {}),
  };
  const resource = createInteroperableResourceOperationEditor()
    .setResourceType(ResourceTypesFhirR4.RelatedPerson)
    .setIdentifierClaimKey(RelatedPersonClaim.IdentifierValue)
    .setBusinessIdentifier(String(claims[RelatedPersonClaim.IdentifierValue] || claims[RelatedPersonClaim.Identifier] || '').trim())
    .setClaims(claims)
    .setLifecycleStatus(InteroperableLifecycleStatuses.Purged)
    .buildLifecycleResource();
  const payload = {
    thid: `relatedperson-purge-${createRuntimeUuid()}`,
    body: {
      resourceType: 'Bundle',
      type: 'batch',
      entry: [{
        type: input.dataType || GwCoreLifecycleRequestType.IndividualMemberPurge,
        request: { method: GwCoreLifecycleRequestMethod.Post },
        meta: { claims },
        resource: {
          ...resource,
          ...(input.resourceId ? { id: input.resourceId } : {}),
        },
      }],
    },
  };
  return deps.submitAndPoll(
    deps.individualRelatedPersonPurgePath(routeCtx),
    deps.individualRelatedPersonPurgePollPath(routeCtx),
    payload,
    options,
  );
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

export async function searchCommunicationParticipantsWithDeps(
  routeCtx: RouteContext,
  input: CommunicationParticipantRuntimeSearchInput,
  deps: {
    communicationSearchPath: (ctx: RouteContext) => string;
    communicationSearchPollPath: (ctx: RouteContext) => string;
    submitAndPoll: (
      submitPath: string,
      pollPath: string,
      payload: { thid?: string } & Record<string, unknown>,
      pollOptions?: { timeoutMs?: number; intervalMs?: number },
    ) => Promise<SubmitAndPollResult>;
  },
): Promise<SubmitAndPollResult> {
  const payload = {
    thid: input.requestThid || `communication-search-${createRuntimeUuid()}`,
    body: buildCommunicationParticipantSearchBundle({
      searchParams: input.searchParams,
      subject: input.subject,
      actorId: input.actorId,
      senderActorId: input.senderActorId,
      recipientActorId: input.recipientActorId,
      userActorId: input.userActorId,
      targetActorId: input.targetActorId,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      page: input.page,
      count: input.count,
    }),
  };

  return deps.submitAndPoll(
    deps.communicationSearchPath(routeCtx),
    deps.communicationSearchPollPath(routeCtx),
    payload,
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

export async function revokeProfessionalAccessWithDeps(
  routeCtx: RouteContext,
  input: RevokeProfessionalAccessInput,
  deps: {
    individualConsentR4BatchPath: (ctx: RouteContext) => string;
    individualConsentR4PollPath: (ctx: RouteContext) => string;
    submitAndPoll: (
      submitPath: string,
      pollPath: string,
      payload: { thid?: string } & Record<string, unknown>,
      pollOptions?: { timeoutMs?: number; intervalMs?: number },
    ) => Promise<SubmitAndPollResult>;
  },
): Promise<RevokeProfessionalAccessResult> {
  const revokedClaims = ConsentClaims
    .fromClaims(input.consentClaims as never)
    .setPeriodEnd(String(input.periodEnd || new Date().toISOString()).trim())
    .toClaims() as Record<string, unknown>;

  const thid = `consent-revoke-${createRuntimeUuid()}`;
  const consentPayload = {
    thid,
    body: {
      data: [{
        type: input.dataType || 'Consent-grant-request-v1.0',
        meta: { claims: revokedClaims },
        resource: { resourceType: 'Consent', meta: { claims: revokedClaims } },
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
    consentClaims: revokedClaims,
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
      data: [buildEmployeeBatchEntry({
        type: input.requestType,
        method: input.requestMethod as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
        claims,
        // Keep the transport-local GW profile anchor separate from the
        // exportable employee identifier carried in claims.
        resourceId: input.resourceId,
      })],
    },
  };
}

function buildIndividualOrganizationLifecyclePayload(input: {
  routeCtx: RouteContext;
  requestType: string;
  organizationClaims: Record<string, unknown> | undefined;
  individualEditor?: IndividualOrganizationLifecycleEditor;
  organizationEditor?: IndividualOrganizationLifecycleEditor;
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
  const editor = input.individualEditor || input.organizationEditor;
  const payload = editor
    ? new IndividualOrganizationLifecycleEditor(editor.getState())
    : new IndividualOrganizationLifecycleEditor().setClaims(input.organizationClaims || {});

  payload
    .setRequestType(input.requestType)
    .setThreadId(`${input.thidPrefix}-${createRuntimeUuid()}`);

  if (input.resourceId) {
    payload.setResourceId(input.resourceId);
  }

  return {
    jti: `jti-${createRuntimeUuid()}`,
    iss: input.routeCtx.tenantId,
    aud: input.routeCtx.tenantId,
    type: 'application/didcomm-plain+json',
    ...payload.buildCurrentGwPayload(),
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
