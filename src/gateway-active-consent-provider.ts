// Copyright 2026 Antifraud Services Inc. under the Apache License, Version 2.0.

import { ResourceTypesFhirR4 } from 'gdc-common-utils-ts/constants/fhir-resource-types';
import { ClaimConsent, type ConsentRule } from 'gdc-common-utils-ts/models/consent-rule';
import { isConsentRuleActive } from 'gdc-common-utils-ts/utils/consent';
import type { ActiveConsentProvider } from 'gdc-sdk-core-ts';
import type { RouteContext } from './individual-onboarding.js';
import { requireClientMethod, type NodeRuntimeClient } from './orchestration/client-port.js';

/**
 * GW-backed implementation of the runtime-neutral ActiveConsentProvider.
 *
 * The configured client decides HTTP authentication and transport protection.
 * This adapter does not introduce an application-owned Consent table.
 */
export class GatewayActiveConsentProvider implements ActiveConsentProvider {
  public constructor(
    private readonly client: NodeRuntimeClient,
    private readonly routeContext: RouteContext,
  ) {}

  /** Loads and normalizes the active Consent rules owned by one subject. */
  public async getActiveConsentsForSubject(subject: string): Promise<ConsentRule[]> {
    const normalizedSubject = String(subject || '').trim();
    if (!normalizedSubject.startsWith('did:')) {
      throw new Error('Active Consent lookup requires a subject DID.');
    }
    const result = await requireClientMethod(this.client, 'searchClinicalBundle')(
      this.routeContext,
      {
        subject: normalizedSubject,
        includedTypes: [ResourceTypesFhirR4.Consent],
      },
    );
    return extractConsentRules(result.poll.body)
      .filter((rule) => isConsentRuleActive(rule, { subject: normalizedSubject }));
  }
}

/** Extracts canonical Consent claim maps from current GW Bundle wrappers. */
export function extractConsentRules(value: unknown): ConsentRule[] {
  const candidates: ConsentRule[] = [];
  const seenObjects = new Set<object>();
  const seenRules = new Set<string>();

  function visit(node: unknown): void {
    if (!node || typeof node !== 'object') return;
    if (seenObjects.has(node as object)) return;
    seenObjects.add(node as object);
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    const record = node as Record<string, unknown>;
    const claims = record.claims && typeof record.claims === 'object'
      ? record.claims as Record<string, unknown>
      : undefined;
    for (const candidate of [record, claims]) {
      if (!candidate) continue;
      const rule = normalizeConsentRule(candidate);
      if (!looksLikeConsentRule(rule as unknown as Record<string, unknown>)) continue;
      const key = String(rule[ClaimConsent.identifier] || JSON.stringify(rule));
      if (!seenRules.has(key)) {
        seenRules.add(key);
        candidates.push(rule);
      }
    }
    Object.values(record).forEach(visit);
  }

  visit(value);
  return candidates;
}

function normalizeConsentRule(value: Record<string, unknown>): ConsentRule {
  const normalized: Record<string, unknown> = { ...value };
  const context = String(value['@context'] || '').trim();
  if (context) {
    const prefix = context.endsWith('.') ? context : `${context}.`;
    for (const [key, claimValue] of Object.entries(value)) {
      if (key.startsWith(prefix)) normalized[key.slice(prefix.length)] = claimValue;
    }
  }
  return normalized as unknown as ConsentRule;
}

function looksLikeConsentRule(value: Record<string, unknown>): boolean {
  return Boolean(
    String(value[ClaimConsent.subject] || '').trim()
    && String(value[ClaimConsent.actorIdentifier] || '').trim()
    && String(value[ClaimConsent.decision] || '').trim()
    && String(value[ClaimConsent.action] || '').trim(),
  );
}
