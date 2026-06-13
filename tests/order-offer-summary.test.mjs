import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EXAMPLE_LICENSE_OFFER_ID,
  EXAMPLE_LICENSE_OFFER_PREVIEW,
  EXAMPLE_LICENSE_OFFER_RESPONSE_BODY,
  EXAMPLE_LICENSE_ORDER_RESPONSE_BODY,
  EXAMPLE_LICENSE_ORDER_SUMMARY,
} from 'gdc-common-utils-ts/examples';

import {
  extractOfferIdFromResponseBody,
  extractOfferPreviewFromResponseBody,
  extractOrderSummaryFromResponseBody,
} from '../dist/index.js';

test('extractOfferPreviewFromResponseBody reads canonical offer claims from GW poll payloads', () => {
  assert.equal(extractOfferIdFromResponseBody(EXAMPLE_LICENSE_OFFER_RESPONSE_BODY), EXAMPLE_LICENSE_OFFER_ID);
  assert.deepEqual(extractOfferPreviewFromResponseBody(EXAMPLE_LICENSE_OFFER_RESPONSE_BODY), EXAMPLE_LICENSE_OFFER_PREVIEW);
});

test('extractOrderSummaryFromResponseBody reads canonical order/payment claims from GW poll payloads', () => {
  assert.deepEqual(extractOrderSummaryFromResponseBody(EXAMPLE_LICENSE_ORDER_RESPONSE_BODY), EXAMPLE_LICENSE_ORDER_SUMMARY);
});
