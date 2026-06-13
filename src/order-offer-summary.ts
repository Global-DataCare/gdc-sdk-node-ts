// Copyright 2026 Antifraud Services Inc. under the Apache License, Version 2.0.

import {
  ClaimsOfferSchemaorg,
  extractPrimaryClaims,
  readLicenseOfferPreviewFromResponseBody,
  readLicenseOrderSummaryFromResponseBody,
  type LicenseOfferPreview,
  type LicenseOrderSummary,
} from 'gdc-common-utils-ts';

export type OfferPreview = LicenseOfferPreview;
export type OrderSummary = LicenseOrderSummary;

export function extractOfferIdFromResponseBody(body: unknown): string | undefined {
  return String(extractPrimaryClaims(body)[ClaimsOfferSchemaorg.identifier] || '').trim() || undefined;
}

export function extractOfferPreviewFromResponseBody(body: unknown): OfferPreview {
  return readLicenseOfferPreviewFromResponseBody(body);
}

export function extractOrderSummaryFromResponseBody(body: unknown): OrderSummary {
  return readLicenseOrderSummaryFromResponseBody(body);
}
