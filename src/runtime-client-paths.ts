// Copyright 2026 Antifraud Services Inc. under the Apache License, Version 2.0.
import { GwCoreLifecycleAction } from './constants/lifecycle.js';
import type { HostRouteContext } from './host-onboarding.js';
import type { RouteContext } from './individual-onboarding.js';
import {
  buildHostRegistryPath,
  buildIdentityDeviceDcrPath,
  buildIdentityDeviceDcrPollPath,
  buildIdentityOpenIdSmartTokenPath,
  buildIdentityOpenIdSmartTokenPollPath,
  buildIdentityTokenExchangePath,
  buildIdentityTokenExchangePollPath,
  buildOrganizationDidBindingPath,
  buildOrganizationDidBindingPollPath,
  buildV1Path,
} from './runtime-paths.js';
import {
  requireHostRouteContext,
  requireRouteContext,
  routeCtxFromInput,
  type HostNetworkWarningState,
} from './runtime-route-context.js';

export class RuntimeClientPaths {
  private readonly defaultCtx?: RouteContext;
  private readonly warningState: HostNetworkWarningState = {
    warnedDefaultHostNetwork: false,
  };

  public constructor(defaultCtx?: RouteContext) {
    this.defaultCtx = defaultCtx;
  }

  public requireRouteContext(ctx?: RouteContext): RouteContext {
    return requireRouteContext(ctx, this.defaultCtx);
  }

  public routeCtxFromInput(input: { serviceProviderDid?: string; tenantId?: string; jurisdiction?: string; sector?: string }): RouteContext {
    return routeCtxFromInput(input, this.defaultCtx);
  }

  public requireHostRouteContext(ctx?: HostRouteContext): HostRouteContext {
    return requireHostRouteContext(ctx, {
      defaultJurisdiction: this.defaultCtx?.jurisdiction,
      warningState: this.warningState,
      warn: (message: string) => console.warn(message),
    });
  }

  public v1Path(ctx: RouteContext | undefined, section: string, format: string, resourceType: string, action: string): string {
    return buildV1Path(this.requireRouteContext(ctx), section, format, resourceType, action);
  }

  public hostRegistryPath(ctx: HostRouteContext | undefined, resourceType: string, action: string): string {
    return buildHostRegistryPath(this.requireHostRouteContext(ctx), resourceType, action);
  }

  public hostRegistryOrganizationTransactionPath(ctx?: HostRouteContext): string { return this.hostRegistryPath(ctx, 'Organization', GwCoreLifecycleAction.Transaction); }
  public hostRegistryOrganizationTransactionPollPath(ctx?: HostRouteContext): string { return this.hostRegistryPath(ctx, 'Organization', GwCoreLifecycleAction.TransactionResponse); }
  public hostRegistryOrganizationIssuePath(ctx?: HostRouteContext): string { return this.hostRegistryPath(ctx, 'Organization', GwCoreLifecycleAction.Issue); }
  public hostRegistryOrganizationIssuePollPath(ctx?: HostRouteContext): string { return this.hostRegistryPath(ctx, 'Organization', GwCoreLifecycleAction.IssueResponse); }
  public hostRegistryOrganizationActivatePath(ctx?: HostRouteContext): string { return this.hostRegistryPath(ctx, 'Organization', '_activate'); }
  public hostRegistryOrganizationActivatePollPath(ctx?: HostRouteContext): string { return this.hostRegistryPath(ctx, 'Organization', '_activate-response'); }
  public hostRegistryOrganizationDisablePath(ctx?: HostRouteContext): string { return this.hostRegistryPath(ctx, 'Organization', GwCoreLifecycleAction.Disable); }
  public hostRegistryOrganizationDisablePollPath(ctx?: HostRouteContext): string { return this.hostRegistryPath(ctx, 'Organization', `${GwCoreLifecycleAction.Disable}-response`); }
  public hostRegistryOrganizationPurgePath(ctx?: HostRouteContext): string { return this.hostRegistryPath(ctx, 'Organization', GwCoreLifecycleAction.Purge); }
  public hostRegistryOrganizationPurgePollPath(ctx?: HostRouteContext): string { return this.hostRegistryPath(ctx, 'Organization', `${GwCoreLifecycleAction.Purge}-response`); }
  public hostRegistryOrderBatchPath(ctx?: HostRouteContext): string { return this.hostRegistryPath(ctx, 'Order', '_batch'); }
  public hostRegistryOrderPollPath(ctx?: HostRouteContext): string { return this.hostRegistryPath(ctx, 'Order', '_batch-response'); }
  public employeeBatchPath(ctx?: RouteContext): string { return this.v1Path(ctx, 'entity', 'org.schema', 'Employee', GwCoreLifecycleAction.Batch); }
  public employeePollPath(ctx?: RouteContext): string { return this.v1Path(ctx, 'entity', 'org.schema', 'Employee', GwCoreLifecycleAction.BatchResponse); }
  public employeeSearchPath(ctx?: RouteContext): string { return this.v1Path(ctx, 'entity', 'org.schema', 'Employee', '_search'); }
  public employeeSearchPollPath(ctx?: RouteContext): string { return this.v1Path(ctx, 'entity', 'org.schema', 'Employee', '_search-response'); }
  public organizationLicenseSearchPath(ctx?: RouteContext): string { return this.v1Path(ctx, 'entity', 'org.schema', 'License', '_search'); }
  public organizationLicenseSearchPollPath(ctx?: RouteContext): string { return this.v1Path(ctx, 'entity', 'org.schema', 'License', '_search-response'); }
  public organizationDidBindingPath(ctx?: RouteContext): string { return buildOrganizationDidBindingPath(this.requireRouteContext(ctx)); }
  public organizationDidBindingPollPath(ctx?: RouteContext): string { return buildOrganizationDidBindingPollPath(this.requireRouteContext(ctx)); }
  public organizationLicenseOfferSearchPath(ctx?: RouteContext): string { return this.v1Path(ctx, 'entity', 'org.schema', 'Offer', '_search'); }
  public organizationLicenseOfferSearchPollPath(ctx?: RouteContext): string { return this.v1Path(ctx, 'entity', 'org.schema', 'Offer', '_search-response'); }
  public organizationLicenseOrderSearchPath(ctx?: RouteContext): string { return this.v1Path(ctx, 'entity', 'org.schema', 'Order', '_search'); }
  public organizationLicenseOrderSearchPollPath(ctx?: RouteContext): string { return this.v1Path(ctx, 'entity', 'org.schema', 'Order', '_search-response'); }
  public employeePurgePath(ctx?: RouteContext): string { return this.v1Path(ctx, 'entity', 'org.schema', 'Employee', GwCoreLifecycleAction.Purge); }
  public employeePurgePollPath(ctx?: RouteContext): string { return this.v1Path(ctx, 'entity', 'org.schema', 'Employee', `${GwCoreLifecycleAction.Purge}-response`); }
  public individualFamilyOrganizationBatchPath(ctx?: RouteContext): string { return this.v1Path(ctx, 'individual', 'org.schema', 'Organization', GwCoreLifecycleAction.Batch); }
  public individualFamilyOrganizationPollPath(ctx?: RouteContext): string { return this.v1Path(ctx, 'individual', 'org.schema', 'Organization', GwCoreLifecycleAction.BatchResponse); }
  public individualFamilyOrganizationSearchPath(ctx?: RouteContext): string { return this.v1Path(ctx, 'individual', 'org.schema', 'Organization', '_search'); }
  public individualFamilyOrganizationSearchPollPath(ctx?: RouteContext): string { return this.v1Path(ctx, 'individual', 'org.schema', 'Organization', '_search-response'); }
  public individualFamilyOrganizationTransactionPath(ctx?: RouteContext): string { return this.v1Path(ctx, 'individual', 'org.schema', 'Organization', GwCoreLifecycleAction.Transaction); }
  public individualFamilyOrganizationTransactionPollPath(ctx?: RouteContext): string { return this.v1Path(ctx, 'individual', 'org.schema', 'Organization', GwCoreLifecycleAction.TransactionResponse); }
  public individualFamilyOrganizationDisablePath(ctx?: RouteContext): string { return this.v1Path(ctx, 'individual', 'org.schema', 'Organization', GwCoreLifecycleAction.Disable); }
  public individualFamilyOrganizationDisablePollPath(ctx?: RouteContext): string { return this.v1Path(ctx, 'individual', 'org.schema', 'Organization', `${GwCoreLifecycleAction.Disable}-response`); }
  public individualFamilyOrganizationPurgePath(ctx?: RouteContext): string { return this.v1Path(ctx, 'individual', 'org.schema', 'Organization', GwCoreLifecycleAction.Purge); }
  public individualFamilyOrganizationPurgePollPath(ctx?: RouteContext): string { return this.v1Path(ctx, 'individual', 'org.schema', 'Organization', `${GwCoreLifecycleAction.Purge}-response`); }
  public individualLicenseSearchPath(ctx?: RouteContext): string { return this.v1Path(ctx, 'individual', 'org.schema', 'License', '_search'); }
  public individualLicenseSearchPollPath(ctx?: RouteContext): string { return this.v1Path(ctx, 'individual', 'org.schema', 'License', '_search-response'); }
  public individualLicenseOfferSearchPath(ctx?: RouteContext): string { return this.v1Path(ctx, 'individual', 'org.schema', 'Offer', '_search'); }
  public individualLicenseOfferSearchPollPath(ctx?: RouteContext): string { return this.v1Path(ctx, 'individual', 'org.schema', 'Offer', '_search-response'); }
  public individualLicenseOrderSearchPath(ctx?: RouteContext): string { return this.v1Path(ctx, 'individual', 'org.schema', 'Order', '_search'); }
  public individualLicenseOrderSearchPollPath(ctx?: RouteContext): string { return this.v1Path(ctx, 'individual', 'org.schema', 'Order', '_search-response'); }
  public individualFamilyOrderBatchPath(ctx?: RouteContext): string { return this.v1Path(ctx, 'individual', 'org.schema', 'Order', '_batch'); }
  public individualFamilyOrderPollPath(ctx?: RouteContext): string { return this.v1Path(ctx, 'individual', 'org.schema', 'Order', '_batch-response'); }
  public individualRelatedPersonBatchPath(ctx?: RouteContext): string { return this.v1Path(ctx, 'individual', 'org.hl7.fhir.r4', 'RelatedPerson', '_batch'); }
  public individualRelatedPersonPollPath(ctx?: RouteContext): string { return this.v1Path(ctx, 'individual', 'org.hl7.fhir.r4', 'RelatedPerson', '_batch-response'); }
  public individualRelatedPersonPurgePath(ctx?: RouteContext): string { return this.v1Path(ctx, 'individual', 'org.hl7.fhir.r4', 'RelatedPerson', '_purge'); }
  public individualRelatedPersonPurgePollPath(ctx?: RouteContext): string { return this.v1Path(ctx, 'individual', 'org.hl7.fhir.r4', 'RelatedPerson', '_purge-response'); }
  public individualConsentR4BatchPath(ctx: RouteContext): string { return this.v1Path(ctx, 'individual', 'org.hl7.fhir.r4', 'Consent', '_batch'); }
  public individualConsentR4PollPath(ctx: RouteContext): string { return this.v1Path(ctx, 'individual', 'org.hl7.fhir.r4', 'Consent', '_batch-response'); }
  public individualCommunicationBatchPath(ctx: RouteContext, format: 'org.hl7.fhir.api' | 'org.hl7.fhir.r4'): string { return this.v1Path(ctx, 'individual', format, 'Communication', '_batch'); }
  public individualCommunicationPollPath(ctx: RouteContext, format: 'org.hl7.fhir.api' | 'org.hl7.fhir.r4'): string { return this.v1Path(ctx, 'individual', format, 'Communication', '_batch-response'); }
  public individualCommunicationSearchPath(ctx: RouteContext): string { return this.v1Path(ctx, 'individual', 'org.hl7.fhir.r4', 'Communication', '_search'); }
  public individualCommunicationSearchPollPath(ctx: RouteContext): string { return this.v1Path(ctx, 'individual', 'org.hl7.fhir.r4', 'Communication', '_search-response'); }
  public individualBundleSearchPath(ctx: RouteContext): string { return this.v1Path(ctx, 'individual', 'org.hl7.fhir.r4', 'Bundle', '_search'); }
  public individualBundleSearchPollPath(ctx: RouteContext): string { return this.v1Path(ctx, 'individual', 'org.hl7.fhir.r4', 'Bundle', '_search-response'); }
  public identityTokenExchangePath(ctx: RouteContext): string { return buildIdentityTokenExchangePath(ctx); }
  public identityTokenExchangePollPath(ctx: RouteContext): string { return buildIdentityTokenExchangePollPath(ctx); }
  public identityDeviceDcrPath(ctx: RouteContext): string { return buildIdentityDeviceDcrPath(ctx); }
  public identityDeviceDcrPollPath(ctx: RouteContext): string { return buildIdentityDeviceDcrPollPath(ctx); }
  public identityOpenIdSmartTokenPath(ctx: RouteContext): string { return buildIdentityOpenIdSmartTokenPath(ctx); }
  public identityOpenIdSmartTokenPollPath(ctx: RouteContext): string { return buildIdentityOpenIdSmartTokenPollPath(ctx); }
}
