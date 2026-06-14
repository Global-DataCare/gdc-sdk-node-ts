// Copyright 2026 Antifraud Services Inc. under the Apache License, Version 2.0.

/**
 * Compatibility re-export.
 *
 * The canonical host/hosting facade contract now lives in `gdc-sdk-core-ts` so
 * browser and Node runtimes can share the same orchestration surface. This
 * file stays as a stable import path for existing Node consumers.
 */
export {
  confirmLegalOrganizationOrderWithDeps,
  HostLifecycleRequestType,
  HostedTenantLifecycleRequestType,
  submitHostedTenantLifecycleWithDeps,
} from 'gdc-sdk-core-ts';

export type {
  HostingControllerFacade,
  HostLifecycleInput,
  HostRouteContext,
  HostedTenantLifecycleInput,
  LegalOrganizationOrderInput,
} from 'gdc-sdk-core-ts';
