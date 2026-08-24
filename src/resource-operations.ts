// Copyright 2026 Antifraud Services Inc. under the Apache License, Version 2.0.

import { HealthcareBasicSections, ResourceTypesFhirR4 } from 'gdc-common-utils-ts/constants';
import { Format } from 'gdc-common-utils-ts/constants/Schemas';
import { RelatedPersonClaim } from 'gdc-common-utils-ts/models/interoperable-claims/related-person-claims';
import { CommunicationClaim } from 'gdc-common-utils-ts/models/interoperable-claims/communication-claims';
import {
  BundleEditor,
  buildCommunicationParticipantSearchBundle,
  buildBlockchainArtifactDocumentReference,
  BundleQuery,
  createInteroperableResourceOperationEditor,
  IndividualOrganizationLifecycleEditor,
  LicenseOfferSearchEditor,
  LicenseOrderSearchEditor,
  InteroperableLifecycleStatuses,
  LicenseListSearchEditor,
  buildLicenseIssueEntry,
  buildLicensePurchaseEntry,
} from 'gdc-common-utils-ts';
import {
  EmployeeBundleOperations,
  EmployeeResourceTypes,
} from 'gdc-common-utils-ts/utils/employee';
import { DeviceAppTypes, DeviceUserClasses, type DeviceAppType } from 'gdc-common-utils-ts/constants/device';
import {
  addFhirResourceToCommunication,
  createCommunicationResource,
  buildClinicalSummaryCommunicationJob,
  buildPermissionRequestCommunication,
  createClinicalSectionUpdateOutboxJob,
  createClinicalSummaryUpdateOutboxJob,
  readClinicalSummaryOperationResult,
  TransportProfiles,
  type ClinicalSectionUpdateCommunicationInput,
  type ClinicalUpdateCommunicationInput,
  type ClinicalSummaryReadResult,
  type ClinicalSummaryRequestInput,
  type PermissionRequestCommunicationInput,
} from 'gdc-sdk-core-ts';
import type { LicenseOfferSearchState, LicenseOrderSearchState } from 'gdc-common-utils-ts/utils/license-commercial-search';
import type { LicenseListSearchState } from 'gdc-common-utils-ts/utils/license-list-search';
import type {
  BundleSearchQuery,
  CommMsgExtendedCommunicationOutboxJob,
  CommunicationOutboxJob,
  CommunicationInput,
  DateRange,
  EmployeeSearchValue,
  IndividualOrganizationLifecycleInput,
  TransportProfile,
  SubmitPayload,
} from 'gdc-sdk-core-ts';
import type { BundleEntry, BundleJsonApi } from 'gdc-common-utils-ts/models/bundle';
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

export type {
  ClinicalSummaryReadResult,
  ClinicalSummaryRequestInput,
} from 'gdc-sdk-core-ts';

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

/** Input for reserving an existing employee seat and issuing its activation credential. */
export type OrganizationEmployeeLicenseInvitationInput = {
  email: string;
  role: string;
  subjectDid: string;
  type?: DeviceAppType;
  requestThid?: string;
  pollOptions?: { timeoutMs?: number; intervalMs?: number };
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
 * Reserves one individual-organization seat for an existing RelatedPerson.
 *
 * Only FHIR v3 RoleCode members belong here. ISCO professionals receive
 * Consent/Communication access but keep using the license paid by their
 * professional organization.
 */
export type IndividualMemberLicenseInvitationInput = {
  ownerOrganizationId: string;
  /** Exact card/subject DID granted after the invitation is accepted. */
  subjectDid: string;
  relatedPersonId: string;
  invitationId: string;
  role: string;
  email?: string;
  telephone?: string;
  type?: DeviceAppType;
  requestThid?: string;
  pollOptions?: { timeoutMs?: number; intervalMs?: number };
};

/** Adds zero-cost member seats to one individual organization. */
export type IndividualMemberLicenseAddInput = {
  ownerOrganizationId: string;
  quantity: number;
  requestThid?: string;
  pollOptions?: { timeoutMs?: number; intervalMs?: number };
};

/** Requests a host-authored Offer for additional professional employee seats. */
export type OrganizationEmployeeLicenseOfferInput = {
  quantity: number;
  requestThid?: string;
  pollOptions?: { timeoutMs?: number; intervalMs?: number };
};

/** @deprecated Use `OrganizationEmployeeLicenseOfferInput`. */
export type OrganizationEmployeeLicenseAddInput = OrganizationEmployeeLicenseOfferInput;

/** Input shared by invitation acceptance, deactivation and release. */
export type IndividualMemberLicenseTransitionInput = {
  /** Required for controller deactivation/release; acceptance resolves by code. */
  ownerOrganizationId?: string;
  activationCode: string;
  subjectId?: string;
  verifiedActorIdentifier?: string;
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
  /**
   * Canonical RelatedPerson bundle. Keep kinship/legal relationship in
   * `RelatedPerson.relationship`; the optional GDC `RelatedPerson.role`
   * extension may carry comma-separated functions such as
   * `CAREGIVER,ECON,DEPEN,BILL`.
   * Access decisions such as PERMITTED do not belong in either claim.
   */
  relatedPersonPayload: { thid?: string } & Record<string, unknown>;
  pollOptions?: { timeoutMs?: number; intervalMs?: number };
};

export type CommunicationIngestionInput = {
  /**
   * Preferred claims-first job created by
   * `createCommunicationOutboxJobFromCommMsgExtendedDraft(...)`. Legacy
   * `createOutboxJobFromDraft(...)` jobs remain accepted temporarily.
   */
  communicationJob?: CommunicationOutboxJob | CommMsgExtendedCommunicationOutboxJob;
  /**
   * Compatibility input for callers that already own one GW envelope.
   * New application code should pass `communicationJob` instead.
   */
  communicationPayload?: CommunicationInput & Record<string, unknown>;
  /** Overrides the client default only for this clinical submission. */
  transportProfile?: TransportProfile;
  /** Clinical representation rendered from canonical claims: built-in `api`/`r4` or an extension format. */
  clinicalFormat?: string;
  /** @deprecated Use `clinicalFormat`. This value selects representation and route, not transport. */
  pathFormatSegment?: 'org.hl7.fhir.api' | 'org.hl7.fhir.r4' | 'api' | 'r4' | 'fhir.r4';
  autoConvertClaimsToFhirR4?: boolean;
  pollOptions?: { timeoutMs?: number; intervalMs?: number };
};

/**
 * Canonical professional-to-subject permission request.
 *
 * This operation records a `Communication`; it never creates Consent or
 * requires a SMART token. HTTP authentication and optional secure DIDComm
 * transport remain concerns of the configured runtime client.
 */
export type ProfessionalAccessRequestInput = Omit<PermissionRequestCommunicationInput, 'missing'> & Readonly<{
  missing: Readonly<{
    sections: string[];
    resourceTypes: string[];
    pairs?: PermissionRequestCommunicationInput['missing']['pairs'];
  }>;
  transportProfile?: TransportProfile;
  pollOptions?: { timeoutMs?: number; intervalMs?: number };
}>;

/** Result of persisting one canonical permission-request Communication. */
export type ProfessionalAccessRequestResult = Readonly<{
  thid: string;
  communicationIdentifier: string;
  communication: CommunicationInput;
  delivery: SubmitAndPollResult;
}>;

type ClinicalUpdateRuntimeOptions = Readonly<{
  transportProfile?: TransportProfile;
  clinicalFormat?: string;
  pollOptions?: { timeoutMs?: number; intervalMs?: number };
}>;

/** Updates exactly one clinical section through a scoped batch/collection. */
export type ClinicalSectionUpdateInput =
  ClinicalSectionUpdateCommunicationInput & ClinicalUpdateRuntimeOptions;

/** Updates one complete multi-section clinical summary document. */
export type ClinicalSummaryUpdateInput =
  ClinicalUpdateCommunicationInput & ClinicalUpdateRuntimeOptions;

export function buildClinicalSectionUpdateIngestion(
  input: ClinicalSectionUpdateInput,
): CommunicationIngestionInput {
  return {
    communicationJob: createClinicalSectionUpdateOutboxJob(input),
    clinicalFormat: input.clinicalFormat,
    transportProfile: input.transportProfile,
    pollOptions: input.pollOptions,
  };
}

export function buildClinicalSummaryUpdateIngestion(
  input: ClinicalSummaryUpdateInput,
): CommunicationIngestionInput {
  return {
    communicationJob: createClinicalSummaryUpdateOutboxJob(input),
    clinicalFormat: input.clinicalFormat,
    transportProfile: input.transportProfile,
    pollOptions: input.pollOptions,
  };
}

export type BlockchainArtifactRegistrationInput = {
  subject: string;
  resource?: Record<string, unknown>;
  contentDataBase64?: string;
  contentType?: string;
  identifier?: string;
  title?: string;
  description?: string;
  date?: string;
  location?: string;
  language?: string;
  requestThid?: string;
  pollOptions?: { timeoutMs?: number; intervalMs?: number };
};

export type BlockchainArtifactSearchSelectionInput = Readonly<{
  subject: string;
  searchResponse: unknown;
  selectedResourceIds?: readonly string[];
}>;

export type BlockchainArtifactSearchSelectionResult = Readonly<{
  availableResourceIds: readonly string[];
  anchoredResourceIds: readonly string[];
  unanchoredResourceIds: readonly string[];
  selectedResourceIds: readonly string[];
  missingResourceIds: readonly string[];
  returnedCount: number;
  totalCount: number;
  bundle: BundleJsonApi<BundleEntry>;
}>;

export type VitalSignBatchCommunicationFromSearchResponseInput = Readonly<{
  subject: string;
  searchResponse: unknown;
  selectedResourceIds?: readonly string[];
  sender?: string;
  recipient?: string | string[];
  sent?: string;
  status?: string;
  noteText?: string;
  requestThid?: string;
  pollOptions?: { timeoutMs?: number; intervalMs?: number };
}>;

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

/** Subject/requester filters for canonical permission-request Communications. */
export type ProfessionalAccessRequestSearchInput = CommunicationParticipantRuntimeSearchInput;

/** Restricts a Communication participant search to permission requests. */
export function buildProfessionalAccessRequestSearchInput(
  input: ProfessionalAccessRequestSearchInput,
): CommunicationParticipantRuntimeSearchInput {
  return {
    ...input,
    searchParams: {
      ...input.searchParams,
      [CommunicationClaim.Category]: 'permission-request',
    },
  };
}

export type ClinicalDateRange = DateRange;

export type ClinicalBundleSearchInput = Omit<BundleSearchQuery, 'section' | 'searchParams'> & {
  section?: string | string[];
  extraSearchParams?: BundleSearchQuery['searchParams'];
  requestThid?: string;
  pollOptions?: { timeoutMs?: number; intervalMs?: number };
  /** Overrides the client default for this subject-scoped clinical read. */
  transportProfile?: TransportProfile;
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
   * Canonical professional grant input:
   * - the exact `did:web:...:employee:<multibase>:<role>` actor DID reused by
   *   the employee profile, VP credential subject and SMART request
   *
   * Compatibility input forms:
   * - `user@example.org`
   * - `tel:+34600111222`
   * - `ES`
   * - comma-separated lists or string arrays of those tokens
   *
   * Email/phone targets and legacy structured objects remain accepted for
   * compatibility, but they do not automatically authorize a later SMART
   * request made with a different derived professional DID.
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
  /**
   * ISO 8601 instant after which this grant must no longer authorize access.
   * It is persisted and signed as the canonical `Consent.period-end` claim.
   */
  periodEnd?: string;
  decision?: 'permit' | 'deny';
  /** Permission-request Communication identifier or thread being answered. */
  eventBasedOn?: string;
  /** Canonical permission-request Communication reference. */
  sourceReference?: string;
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

/** Subject decision that remains correlated to the originating request. */
export type ProfessionalAccessRequestDecisionInput = Omit<
  GrantProfessionalAccessInput,
  'eventBasedOn' | 'sourceReference'
> & Readonly<{
  requestThid: string;
  requestCommunicationIdentifier?: string;
}>;

/** Converts one request decision into the canonical correlated Consent grant. */
export function buildProfessionalAccessRequestDecisionGrant(
  input: ProfessionalAccessRequestDecisionInput,
): GrantProfessionalAccessInput {
  const requestThid = String(input.requestThid || '').trim();
  if (!requestThid) throw new Error('Permission request decision requires requestThid.');
  const communicationIdentifier = String(input.requestCommunicationIdentifier || '').trim();
  return {
    ...input,
    eventBasedOn: communicationIdentifier || requestThid,
    sourceReference: communicationIdentifier
      ? `Communication?identifier=${encodeURIComponent(communicationIdentifier)}`
      : `Communication?thid=${encodeURIComponent(requestThid)}`,
  };
}

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

/**
 * Issues the activation credential for an employee already created under the
 * tenant. The credential belongs to that employee seat and can authorize its
 * configured number of concurrent installations (two by default in GW CORE).
 */
export async function issueOrganizationEmployeeLicenseWithDeps(
  routeCtx: RouteContext,
  input: OrganizationEmployeeLicenseInvitationInput,
  deps: {
    identityLicenseIssuePath: (ctx: RouteContext) => string;
    identityLicenseIssuePollPath: (ctx: RouteContext) => string;
    submitAndPoll: (
      submitPath: string,
      pollPath: string,
      payload: { thid?: string } & Record<string, unknown>,
      pollOptions?: { timeoutMs?: number; intervalMs?: number },
    ) => Promise<SubmitAndPollResult>;
  },
): Promise<SubmitAndPollResult> {
  const email = String(input.email || '').trim().toLowerCase();
  const role = String(input.role || '').trim();
  const subjectDid = String(input.subjectDid || '').trim();
  if (!email) throw new Error('issueOrganizationEmployeeLicense: email is required.');
  if (!role) throw new Error('issueOrganizationEmployeeLicense: role is required.');
  if (!subjectDid) throw new Error('issueOrganizationEmployeeLicense: subjectDid is required.');

  const entry = buildLicenseIssueEntry({
    email,
    role,
    userClass: DeviceUserClasses.Employee,
    type: input.type || DeviceAppTypes.Web,
  });
  (entry.meta as typeof entry.meta & { subjectDid: string }).subjectDid = subjectDid;

  return deps.submitAndPoll(
    deps.identityLicenseIssuePath(routeCtx),
    deps.identityLicenseIssuePollPath(routeCtx),
    {
      thid: input.requestThid || `employee-license-issue-${createRuntimeUuid()}`,
      body: {
        resourceType: EmployeeResourceTypes.bundle,
        type: EmployeeResourceTypes.batch,
        data: [entry],
      },
    },
    input.pollOptions,
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

type IndividualLicenseMutationDeps = {
  individualLicenseActionPath: (ctx: RouteContext, action: string) => string;
  individualLicenseActionPollPath: (ctx: RouteContext, action: string) => string;
  submitAndPoll: (
    submitPath: string,
    pollPath: string,
    payload: { thid?: string } & Record<string, unknown>,
    pollOptions?: { timeoutMs?: number; intervalMs?: number },
  ) => Promise<SubmitAndPollResult>;
};

type OrganizationLicenseMutationDeps = {
  organizationLicenseActionPath: (ctx: RouteContext, action: string) => string;
  organizationLicenseActionPollPath: (ctx: RouteContext, action: string) => string;
  submitAndPoll: IndividualLicenseMutationDeps['submitAndPoll'];
};

/**
 * Requests a professional-seat Offer without creating or assigning seats.
 * The returned Offer must be accepted through the existing paid Order flow.
 */
export async function requestOrganizationEmployeeLicenseOfferWithDeps(
  routeCtx: RouteContext,
  input: OrganizationEmployeeLicenseOfferInput,
  deps: OrganizationLicenseMutationDeps,
): Promise<SubmitAndPollResult> {
  const entry = buildLicensePurchaseEntry({
    quantity: input.quantity,
    userClass: 'employee',
    type: 'web',
  });
  return deps.submitAndPoll(
    deps.organizationLicenseActionPath(routeCtx, '_add'),
    deps.organizationLicenseActionPollPath(routeCtx, '_add'),
    {
      thid: input.requestThid || `organization-license-offer-${createRuntimeUuid()}`,
      body: { resourceType: 'Bundle', type: 'batch', data: [entry] },
    },
    input.pollOptions,
  );
}

/** @deprecated Use `requestOrganizationEmployeeLicenseOfferWithDeps`. */
export async function addFreeOrganizationEmployeeLicensesWithDeps(
  routeCtx: RouteContext,
  input: OrganizationEmployeeLicenseAddInput,
  deps: OrganizationLicenseMutationDeps,
): Promise<SubmitAndPollResult> {
  return requestOrganizationEmployeeLicenseOfferWithDeps(routeCtx, input, deps);
}

/**
 * Reserves one available household/member seat for a selected contact.
 *
 * Ordered application flow:
 * 1. Create/select RelatedPerson.
 * 2. Author Consent rules.
 * 3. Call this operation only for a FHIR v3 RoleCode member.
 * 4. Put the returned activation code in the invitation Communication.
 */
export async function issueIndividualMemberLicenseWithDeps(
  routeCtx: RouteContext,
  input: IndividualMemberLicenseInvitationInput,
  deps: IndividualLicenseMutationDeps,
): Promise<SubmitAndPollResult> {
  const entry = buildLicenseIssueEntry({
    email: input.email,
    telephone: input.telephone,
    role: input.role,
    userClass: 'individual',
    type: input.type || 'web',
    ownerOrganizationId: input.ownerOrganizationId,
    relatedPersonId: input.relatedPersonId,
    invitationId: input.invitationId,
  });
  (entry.meta as typeof entry.meta & { subjectDid: string }).subjectDid = input.subjectDid;
  return deps.submitAndPoll(
    deps.individualLicenseActionPath(routeCtx, '_issue'),
    deps.individualLicenseActionPollPath(routeCtx, '_issue'),
    {
      thid: input.requestThid || `individual-license-issue-${createRuntimeUuid()}`,
      body: { resourceType: 'Bundle', type: 'batch', data: [entry] },
    },
    input.pollOptions,
  );
}

/**
 * Adds free seats without creating contacts, permissions or invitations.
 * Price zero is explicit so GW never routes this MVP operation through a
 * payment-proof branch.
 */
export async function addFreeIndividualMemberLicensesWithDeps(
  routeCtx: RouteContext,
  input: IndividualMemberLicenseAddInput,
  deps: IndividualLicenseMutationDeps,
): Promise<SubmitAndPollResult> {
  const entry = buildLicensePurchaseEntry({
    quantity: input.quantity,
    userClass: 'individual',
    type: 'web',
    price: 0,
    priceCurrency: 'EUR',
    ownerOrganizationId: input.ownerOrganizationId,
  });
  return deps.submitAndPoll(
    deps.individualLicenseActionPath(routeCtx, '_add'),
    deps.individualLicenseActionPollPath(routeCtx, '_add'),
    {
      thid: input.requestThid || `individual-license-add-${createRuntimeUuid()}`,
      body: { resourceType: 'Bundle', type: 'batch', data: [entry] },
    },
    input.pollOptions,
  );
}

/**
 * Accepts, deactivates or releases one member seat.
 *
 * `_accept` needs the Firebase/BFF verified recipient plus the authenticated
 * subject id. `_release` remains backend-guarded and cannot free an active
 * member directly.
 */
export async function transitionIndividualMemberLicenseWithDeps(
  routeCtx: RouteContext,
  action: '_accept' | '_deactivate' | '_release',
  input: IndividualMemberLicenseTransitionInput,
  deps: IndividualLicenseMutationDeps,
): Promise<SubmitAndPollResult> {
  return deps.submitAndPoll(
    deps.individualLicenseActionPath(routeCtx, action),
    deps.individualLicenseActionPollPath(routeCtx, action),
    {
      thid: input.requestThid || `individual-license-${action.slice(1)}-${createRuntimeUuid()}`,
      body: {
        resourceType: 'Bundle',
        type: 'batch',
        data: [{
          id: input.activationCode,
          type: `IndividualMemberLicense${action}`,
          meta: {
            ...(input.ownerOrganizationId ? { ownerOrganizationId: input.ownerOrganizationId } : {}),
            ...(input.subjectId ? { subjectId: input.subjectId } : {}),
            ...(input.verifiedActorIdentifier ? { verifiedActorIdentifier: input.verifiedActorIdentifier } : {}),
            claims: {
              '@context': 'org.schema',
              'org.schema.IndividualProduct.serialNumber': input.activationCode,
            },
          },
          request: { method: 'POST' },
        }],
      },
    },
    input.pollOptions,
  );
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
    individualCommunicationBatchPath: (ctx: RouteContext, pathFormatSegment: string) => string;
    individualCommunicationPollPath: (ctx: RouteContext, pathFormatSegment: string) => string;
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
  if (!input.communicationPayload) {
    throw new Error('Legacy communication ingestion requires communicationPayload.');
  }
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

/**
 * Builds and persists one professional access request against the subject's
 * provider route. The request is deliberately independent from SMART because
 * no subject consent exists yet.
 */
export async function requestProfessionalAccessWithDeps(
  routeCtx: RouteContext,
  input: ProfessionalAccessRequestInput,
  deps: {
    individualCommunicationBatchPath: (ctx: RouteContext, pathFormatSegment: string) => string;
    individualCommunicationPollPath: (ctx: RouteContext, pathFormatSegment: string) => string;
    submitAndPoll: (
      submitPath: string,
      pollPath: string,
      payload: { thid?: string } & Record<string, unknown>,
      pollOptions?: { timeoutMs?: number; intervalMs?: number },
    ) => Promise<SubmitAndPollResult>;
  },
): Promise<ProfessionalAccessRequestResult> {
  const subject = String(input.subject || '').trim();
  const missingSections = input.missing.sections.map((value) => String(value || '').trim()).filter(Boolean);
  const missingResourceTypes = input.missing.resourceTypes.map((value) => String(value || '').trim()).filter(Boolean);
  const requesterTargets = [
    input.requester.did,
    input.requester.email,
    input.requester.phone,
    input.requester.organizationDid,
  ].map((value) => String(value || '').trim()).filter(Boolean);
  if (!subject.startsWith('did:')) throw new Error('Professional access request requires a subject DID.');
  if (requesterTargets.length === 0) throw new Error('Professional access request requires an authenticated requester target.');
  if (missingSections.length === 0 && missingResourceTypes.length === 0) {
    throw new Error('Professional access request requires at least one missing permission.');
  }

  const thid = String(input.thid || '').trim() || `permission-request-${createRuntimeUuid()}`;
  const communicationIdentifier = String(input.communicationIdentifier || '').trim()
    || `urn:uuid:${createRuntimeUuid()}`;
  const communication = buildPermissionRequestCommunication({
    ...input,
    subject,
    thid,
    communicationIdentifier,
    missing: {
      sections: missingSections,
      resourceTypes: missingResourceTypes,
      pairs: input.missing.pairs || [
        ...missingSections.map((section) => ({ section, reason: 'missing-consent' })),
        ...missingResourceTypes.map((resourceType) => ({ resourceType, reason: 'missing-consent' })),
      ],
    },
  });
  const delivery = await ingestCommunicationAndUpdateIndexWithDeps(routeCtx, {
    communicationPayload: communication,
    pathFormatSegment: 'r4',
    pollOptions: input.pollOptions,
  }, deps);
  return { thid, communicationIdentifier, communication, delivery };
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

/**
 * Requests the subject's available clinical document through the canonical
 * auditable read lifecycle:
 *
 * `Communication -> Subject/$summary -> FHIR Parameters -> Bundle document`.
 *
 * The dependency name intentionally says `submit`, not `ingest`: GW receives a
 * Communication transport record, but the business operation is a read and
 * must not be exposed to applications as index ingestion. `Subject/$summary`
 * is the internal operation reference inside that Communication, not a route
 * for application/BFF code to invoke directly.
 */
export async function requestClinicalSummaryWithDeps(
  routeCtx: RouteContext,
  input: ClinicalSummaryRequestInput,
  deps: {
    submitSummaryCommunication: (
      ctx: RouteContext,
      input: CommunicationIngestionInput,
    ) => Promise<SubmitAndPollResult>;
  },
): Promise<ClinicalSummaryReadResult> {
  const communicationJob = buildClinicalSummaryCommunicationJob(input);
  const operation = await deps.submitSummaryCommunication(routeCtx, {
    communicationJob,
    clinicalFormat: input.clinicalFormat || 'api',
    transportProfile: input.transportProfile,
    pollOptions: input.pollOptions,
  });
  return readClinicalSummaryOperationResult(operation);
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

/**
 * Builds one Communication-ready ingestion payload from a paginated search
 * response that already selected the day batches to be anchored.
 *
 * The search response is normalized into a `Bundle.type=batch` attachment,
 * and the resulting `Communication` is ready for `ingestCommunication...`.
 */
export function buildVitalSignBatchCommunicationFromSearchResponse(
  input: VitalSignBatchCommunicationFromSearchResponseInput,
): CommunicationIngestionInput {
  const selection = buildBlockchainArtifactBundleFromSearchResponse({
    subject: input.subject,
    searchResponse: input.searchResponse,
    selectedResourceIds: input.selectedResourceIds,
  });

  const communication = addFhirResourceToCommunication(
    createCommunicationResource({
      subject: input.subject,
      sender: input.sender,
      recipient: input.recipient,
      sent: input.sent,
      status: input.status || 'completed',
      noteText: input.noteText || `Selected ${selection.selectedResourceIds.length} vital-sign batch item(s) for blockchain anchoring.`,
      claims: {
        'Communication.vital-sign-batch-selection.subject': input.subject,
        'Communication.vital-sign-batch-selection.selected-count': selection.selectedResourceIds.length,
        'Communication.vital-sign-batch-selection.unanchored-count': selection.unanchoredResourceIds.length,
        'Communication.vital-sign-batch-selection.selected-ids': selection.selectedResourceIds.join(','),
        'Communication.vital-sign-batch-selection.missing-ids': selection.missingResourceIds.join(','),
      },
    }),
    selection.bundle as unknown as Record<string, unknown>,
    {
      attachmentContentType: 'application/fhir+json',
      attachmentTitle: 'vital-sign-batch-selection.json',
    },
  );

  return {
    communicationPayload: communication as unknown as CommunicationInput & Record<string, unknown>,
    pathFormatSegment: 'org.hl7.fhir.r4',
    pollOptions: input.pollOptions,
    autoConvertClaimsToFhirR4: false,
  };
}

/**
 * Builds one blockchain-ready batch bundle from a paginated search response.
 *
 * The helper keeps the original search result as the source of truth and only
 * projects the selected `resource.id` values into a `Bundle.type=batch`
 * payload for subsequent communication/registration.
 */
export function buildBlockchainArtifactBundleFromSearchResponse(
  input: BlockchainArtifactSearchSelectionInput,
): BlockchainArtifactSearchSelectionResult {
  const bundle = normalizeBundleLike(input.searchResponse);
  const query = new BundleQuery(bundle as BundleJsonApi<BundleEntry>);
  const availableResourceIds = query.getResourceIds();
  const availableEntries = query.getResourceEntriesByIds(availableResourceIds) as BundleEntry[];
  const anchoredResourceIds = availableEntries
    .filter((entry: BundleEntry) => hasAuditTxId(entry))
    .map((entry: BundleEntry, index: number) => resolveBundleEntryStableId(entry, index));
  const unanchoredResourceIds = availableResourceIds.filter((resourceId) => !anchoredResourceIds.includes(resourceId));
  const requestedResourceIds = normalizeIdList(input.selectedResourceIds);
  const selectedResourceIds = requestedResourceIds.length > 0
    ? requestedResourceIds.filter((resourceId) => availableResourceIds.includes(resourceId))
    : unanchoredResourceIds;
  const missingResourceIds = requestedResourceIds.filter((resourceId) => !availableResourceIds.includes(resourceId));

  if (requestedResourceIds.length > 0 && selectedResourceIds.length === 0) {
    throw new Error('buildBlockchainArtifactBundleFromSearchResponse could not match any selected resource ids.');
  }

  const selectedEntries = query.getResourceEntriesByIds(selectedResourceIds) as BundleEntry[];
  const artifactEntries = selectedEntries.map((entry: BundleEntry, index: number) => {
    const resource = entry.resource && typeof entry.resource === 'object' ? entry.resource as Record<string, unknown> : undefined;
    if (!resource) {
      throw new Error(`buildBlockchainArtifactBundleFromSearchResponse requires resource data for selected entry at index ${index}.`);
    }

    const logicalIdentifier = asTrimmedString(resource.id || entry.id || entry.fullUrl || selectedResourceIds[index]);
    const artifact = buildBlockchainArtifactDocumentReference({
      subject: input.subject,
      resource,
      identifier: logicalIdentifier || undefined,
      title: `${asTrimmedString(resource.resourceType) || 'resource'}.json`,
    });

    return {
      type: 'DocumentReference',
      meta: { claims: artifact.documentReference.meta?.claims || {} },
      resource: artifact.documentReference,
      request: {
        method: 'POST' as const,
        url: 'individual/org.hl7.fhir.r4/DocumentReference/_batch',
      },
    };
  });

  return {
    availableResourceIds,
    anchoredResourceIds,
    unanchoredResourceIds,
    selectedResourceIds,
    missingResourceIds,
    returnedCount: query.getResourceIds().length,
    totalCount: typeof (bundle as { total?: unknown }).total === 'number'
      ? Number((bundle as { total?: number }).total)
      : query.getResourceIds().length,
    bundle: {
      resourceType: 'Bundle',
      type: 'batch',
      meta: {
        claims: {
          'BlockchainArtifactSelection.subject': input.subject,
          'BlockchainArtifactSelection.availableCount': availableResourceIds.length,
          'BlockchainArtifactSelection.selectedCount': selectedResourceIds.length,
          'BlockchainArtifactSelection.missingCount': missingResourceIds.length,
          'BlockchainArtifactSelection.selectedResourceIds': selectedResourceIds.join(','),
        },
      },
      data: artifactEntries,
    },
  };
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

export async function registerBlockchainArtifactAndUpdateIndexWithDeps(
  routeCtx: RouteContext,
  input: BlockchainArtifactRegistrationInput,
  deps: {
    individualDocumentReferenceBatchPath: (ctx: RouteContext) => string;
    individualDocumentReferencePollPath: (ctx: RouteContext) => string;
    submitAndPoll: (
      submitPath: string,
      pollPath: string,
      payload: { thid?: string } & Record<string, unknown>,
      pollOptions?: { timeoutMs?: number; intervalMs?: number },
    ) => Promise<SubmitAndPollResult>;
  },
): Promise<SubmitAndPollResult> {
  const artifact = buildBlockchainArtifactDocumentReference({
    subject: input.subject,
    resource: input.resource,
    contentDataBase64: input.contentDataBase64,
    contentType: input.contentType,
    identifier: input.identifier,
    title: input.title,
    description: input.description,
    date: input.date,
    location: input.location,
    language: input.language,
  });

  const payload = {
    thid: input.requestThid || `blockchain-artifact-${createRuntimeUuid()}`,
    body: {
      resourceType: 'Bundle',
      type: 'batch',
      data: [{
        type: 'DocumentReference',
        meta: { claims: artifact.documentReference.meta?.claims || {} },
        resource: artifact.documentReference,
        request: {
          method: 'POST',
          url: 'individual/org.hl7.fhir.r4/DocumentReference/_batch',
        },
      }],
    },
  };

  return deps.submitAndPoll(
    deps.individualDocumentReferenceBatchPath(routeCtx),
    deps.individualDocumentReferencePollPath(routeCtx),
    payload,
    input.pollOptions,
  );
}

function normalizeBundleLike(value: unknown): BundleJsonApi<BundleEntry> {
  const root = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const body = root.body && typeof root.body === 'object' ? root.body as Record<string, unknown> : root;
  const resourceType = asTrimmedString(body.resourceType) || 'Bundle';
  const type = asTrimmedString(body.type) || 'batch';
  const data = Array.isArray(body.data)
    ? body.data
    : (Array.isArray(body.entry) ? body.entry : []);
  return {
    ...(typeof body.id === 'string' ? { id: asTrimmedString(body.id) || undefined } : {}),
    resourceType: resourceType as 'Bundle',
    type,
    total: typeof body.total === 'number' ? body.total : undefined,
    meta: body.meta && typeof body.meta === 'object' ? body.meta as BundleJsonApi<BundleEntry>['meta'] : undefined,
    data: data as BundleEntry[],
  };
}

function normalizeIdList(value?: readonly string[]): string[] {
  return [...(value || [])]
    .map((item) => asTrimmedString(item))
    .filter(Boolean);
}

function asTrimmedString(value: unknown): string {
  if (value === undefined || value === null) {
    return '';
  }
  return String(value).trim();
}

function resolveBundleEntryStableId(entry: BundleEntry, index: number): string {
  const resource = entry.resource && typeof entry.resource === 'object' ? entry.resource as Record<string, unknown> : {};
  return asTrimmedString(resource.id || entry.id || entry.fullUrl || `entry-${index}`);
}

function hasAuditTxId(entry: BundleEntry): boolean {
  const entryAudit = entry && typeof entry === 'object' ? (entry as Record<string, unknown>).audit : undefined;
  const entryMeta = entry && typeof entry === 'object' ? (entry as Record<string, unknown>).meta : undefined;
  const resource = entry.resource && typeof entry.resource === 'object' ? entry.resource as Record<string, unknown> : {};
  const resourceMeta = resource.meta && typeof resource.meta === 'object' ? resource.meta as Record<string, unknown> : {};
  const audit = [entryAudit, entryMeta && typeof entryMeta === 'object' ? (entryMeta as Record<string, unknown>).audit : undefined, resourceMeta.audit]
    .find((candidate) => candidate && typeof candidate === 'object') as Record<string, unknown> | undefined;
  return Boolean(asTrimmedString(audit?.txId));
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
      periodEnd: input.periodEnd,
      decision: input.decision,
      eventBasedOn: input.eventBasedOn,
      sourceReference: input.sourceReference,
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

export function normalizeCommunicationPathFormatSegment(
  raw?: string,
): string {
  const value = String(raw || '').trim().toLowerCase();
  if (!value || value === 'api' || value === 'org.hl7.fhir.api') return 'org.hl7.fhir.api';
  if (value === 'r4' || value === 'fhir.r4' || value === 'org.hl7.fhir.r4') return 'org.hl7.fhir.r4';
  if (/^org\.hl7\.fhir\.[a-z0-9.-]+$/.test(value)) return value;
  throw new Error(`Unsupported Communication clinical format '${String(raw || '')}'.`);
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
    data: Array<Record<string, unknown>>;
  };
} {
  const claims = input.employeeClaims || {};
  const editor = new BundleEditor()
    .setBundleOperation(EmployeeBundleOperations.create)
    .setAllowedResourceType(EmployeeResourceTypes.employee);
  const employee = editor.newEntry(input.resourceId).asEmployee();
  for (const [claim, value] of Object.entries(claims)) {
    employee.setClaim(claim, value);
  }
  const authored = employee.doneEntry().buildJsonApi();
  const data = authored.data.map((entry) => ({
    ...entry,
    type: input.requestType,
    request: { method: input.requestMethod },
  }));
  return {
    jti: `jti-${createRuntimeUuid()}`,
    iss: input.routeCtx.tenantId,
    aud: input.routeCtx.tenantId,
    type: 'application/didcomm-plain+json',
    thid: `${input.thidPrefix}-${createRuntimeUuid()}`,
    body: {
      data,
    },
  };
}

/**
 * Selects only the outer employee wire representation.
 *
 * The BundleEditor-authored entries remain identical across transports:
 * JSON-API `data[]` stays inside DIDComm, while the legacy FHIR profile maps
 * those entries to standard `Bundle.entry[]`. Authorization and encryption
 * remain runtime concerns rather than browser-authored payload fields.
 */
export function prepareEmployeeLifecycleMessageForTransport(
  message: SubmitPayload,
  profile: TransportProfile,
): SubmitPayload {
  if (profile !== TransportProfiles.FhirJson) return message;
  const envelopeBody = message.body as { data?: unknown[] } | undefined;
  if (!Array.isArray(envelopeBody?.data)) {
    throw new Error('Employee FHIR transport requires Bundle data entries.');
  }
  return {
    ...message,
    body: {
      resourceType: ResourceTypesFhirR4.Bundle,
      type: 'batch',
      entry: envelopeBody.data,
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
