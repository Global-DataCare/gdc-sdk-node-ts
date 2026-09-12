import { BundleReader } from 'gdc-common-utils-ts';
import type {
  NodeHttpClient,
  OwnedFamilyOrganizationDirectoryEntry,
  RouteContext,
} from 'gdc-sdk-node-ts';

type OwnedCleanupDirectoryInput = Readonly<{
  sdk: Pick<NodeHttpClient, 'listOwnedFamilyOrganizations'>;
  routeContext: RouteContext;
  verifiedContact: Readonly<{ email?: string; telephone?: string }>;
  alternateNamePrefix: string;
}>;

/**
 * Lists only records owned by the already verified contact, then applies the
 * label prefix locally. GW intentionally does not expose an unscoped prefix
 * scan of individual Organizations.
 */
export async function listOwnedIndividualCleanupCandidates(
  input: OwnedCleanupDirectoryInput,
): Promise<OwnedFamilyOrganizationDirectoryEntry[]> {
  const subjects = await input.sdk.listOwnedFamilyOrganizations(
    input.routeContext,
    { verifiedContact: input.verifiedContact },
  );
  return subjects.filter((subject) => {
    return subject.alternateName.startsWith(input.alternateNamePrefix);
  });
}

type ConfirmedCleanupInput = Readonly<{
  sdk: Pick<NodeHttpClient, 'disableIndividual' | 'purgeIndividual'>;
  routeContext: RouteContext;
  subject: OwnedFamilyOrganizationDirectoryEntry;
  /** Exact label reviewed by the operator after listing candidates. */
  confirmedAlternateName: string;
}>;

/** Disables and then purges one explicitly reviewed owned Organization. */
export async function disableAndPurgeOwnedIndividual(
  input: ConfirmedCleanupInput,
): Promise<void> {
  const alternateName = input.subject.alternateName;
  if (!alternateName || alternateName !== input.confirmedAlternateName) {
    throw new Error('The confirmed alternateName does not match the selected owned Organization.');
  }

  const disabled = await input.sdk.disableIndividual(input.routeContext, {
    organizationClaims: input.subject.claims,
    resourceId: input.subject.resourceId,
  });
  assertSuccessfulLifecycle(disabled.poll.status, disabled.poll.body, 'disable');

  const purged = await input.sdk.purgeIndividual(input.routeContext, {
    organizationClaims: input.subject.claims,
    resourceId: input.subject.resourceId,
  });
  assertSuccessfulLifecycle(purged.poll.status, purged.poll.body, 'purge');
}

function assertSuccessfulLifecycle(
  pollStatus: number,
  body: unknown,
  operation: string,
): void {
  if (pollStatus !== 200) {
    throw new Error(`${operation} polling did not complete successfully.`);
  }
  const analysis = new BundleReader(
    (body && typeof body === 'object' ? body : {}) as Record<string, unknown>,
  ).getResponseAnalysis();
  if (analysis.hasErrors || analysis.successfulOperations < 1) {
    throw new Error(
      `${operation} failed: ${analysis.issueDiagnostics.join('; ') || 'incomplete terminal Bundle'}`,
    );
  }
}
