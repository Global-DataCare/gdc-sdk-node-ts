// Copyright 2026 Antifraud Services Inc. under the Apache License, Version 2.0.

import { JobStatus, type JobRequest } from 'gdc-common-utils-ts/models/confidential-job';
import type { IDecodedDidcommPayload } from 'gdc-common-utils-ts/models/confidential-message';
import type { ServiceEndpointSelector } from 'gdc-common-utils-ts/models/did';
import type { JWK } from 'gdc-common-utils-ts/models/jwk';
import { IVaultRepository, VaultMemRepository, type VaultQuery } from 'gdc-common-utils-ts/storage';
import type { IJobManager, IWallet } from 'gdc-sdk-core-ts';
import type {
  WalletBackedJobManagerOptions,
  WalletExecutionContextLike,
} from './wallet-backed-job-manager.types.js';

export type {
  WalletBackedJobManagerOptions,
  WalletBackedJobPollResult,
  WalletBackedJobSubmitResult,
  WalletBackedJobTransport,
  WalletExecutionContextLike,
} from './wallet-backed-job-manager.types.js';

const JOB_COLLECTION = 'wallet-backed-jobs';
const RESPONSE_COLLECTION = 'wallet-backed-job-responses';

type ContextualWalletLike = IWallet & {
  packForRecipientWithContext?: (
    content: unknown,
    recipientDidOrJwk: string | JWK,
    options: Readonly<{
      context: WalletExecutionContextLike;
      signingKey?: Record<string, unknown>;
      encryptionKey?: Record<string, unknown>;
    }>,
  ) => Promise<string>;
  unpackWithContext?: (
    packedMessage: string,
    options: Readonly<{
      context: WalletExecutionContextLike;
      decryptionKey?: Record<string, unknown>;
      verificationKey?: Record<string, unknown>;
    }>,
  ) => Promise<{ content: unknown; meta: unknown }>;
  protectManagedConfidentialData?: (
    doc: unknown,
    context: WalletExecutionContextLike,
    options?: Readonly<{ key?: Record<string, unknown> }>,
  ) => Promise<unknown>;
  unprotectManagedConfidentialData?: (
    doc: unknown,
    context: WalletExecutionContextLike,
    options?: Readonly<{ key?: Record<string, unknown> }>,
  ) => Promise<unknown>;
};

type JobResponseRecord = Readonly<{
  id: string;
  thid: string;
  content?: unknown;
  jwe?: Record<string, unknown>;
  createdAtTimestamp: number;
}>;

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function createRuntimeUuid(): string {
  const cryptoLike = globalThis as typeof globalThis & {
    crypto?: { randomUUID?: () => string };
  };
  if (typeof cryptoLike.crypto?.randomUUID === 'function') {
    return cryptoLike.crypto.randomUUID();
  }
  return `job-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function inferFormType(content: IDecodedDidcommPayload | undefined): string {
  const first = Array.isArray(content?.body?.data) ? content.body.data[0] : undefined;
  return String(first?.type || content?.type || '').trim();
}

function updateJobShape(job: JobRequest, patch: Partial<JobRequest>): JobRequest {
  return {
    ...job,
    ...patch,
    sequence: (job.sequence || 0) + 1,
    previousSequence: job.sequence,
  };
}

/**
 * Creates one backend/session job manager that stores protected job payloads in
 * one local vault while reusing one shared wallet for protect/unprotect and
 * transport packing.
 *
 * Intended for:
 * - portal/BFF runtimes
 * - short-lived service sessions
 * - send-first or cache-first orchestration over one local in-memory vault
 */
export function createWalletBackedJobManager(
  options: WalletBackedJobManagerOptions,
): IJobManager {
  const wallet = options.wallet as ContextualWalletLike;
  const vaultRepository = options.vaultRepository ?? new VaultMemRepository();
  const context = options.walletContext;
  const localEntityId = context.profile?.profileId ?? context.runtime?.runtimeId ?? options.descriptor.profileId;

  let isInitialized = false;
  let listener: (() => void) | undefined;
  let lastAccessToken = '';

  async function notify(): Promise<void> {
    listener?.();
  }

  async function protectJob(job: JobRequest): Promise<JobRequest> {
    if (wallet.protectManagedConfidentialData) {
      return wallet.protectManagedConfidentialData(job, context) as Promise<JobRequest>;
    }
    return wallet.protectConfidentialData(job, localEntityId) as Promise<JobRequest>;
  }

  async function unprotectJob(job: JobRequest): Promise<JobRequest> {
    if (!job?.jwe) return clone(job);
    if (wallet.unprotectManagedConfidentialData) {
      return wallet.unprotectManagedConfidentialData(job, context) as Promise<JobRequest>;
    }
    return wallet.unprotectConfidentialData(job, localEntityId) as Promise<JobRequest>;
  }

  async function putProtectedJob(job: JobRequest): Promise<JobRequest> {
    const protectedJob = await protectJob(job);
    await vaultRepository.put(JOB_COLLECTION, protectedJob);
    await notify();
    return clone(job);
  }

  async function readProtectedJob(jobId: string): Promise<JobRequest | undefined> {
    return vaultRepository.get<JobRequest>(JOB_COLLECTION, jobId);
  }

  async function readUnprotectedJob(jobId: string): Promise<JobRequest | undefined> {
    const stored = await readProtectedJob(jobId);
    if (!stored) return undefined;
    return unprotectJob(stored);
  }

  async function listUnprotectedJobs(query: VaultQuery): Promise<JobRequest[]> {
    const stored = await vaultRepository.query<JobRequest>(JOB_COLLECTION, query);
    const out: JobRequest[] = [];
    for (const job of stored) {
      out.push(await unprotectJob(job));
    }
    return out;
  }

  async function buildEnvelope(job: JobRequest): Promise<string> {
    if (!job.content) {
      throw new Error(`WalletBackedJobManager cannot build an envelope for job '${job.id}' without plaintext content.`);
    }
    if (options.recipientDidOrJwk) {
      if (wallet.packForRecipientWithContext) {
        return wallet.packForRecipientWithContext(job.content, options.recipientDidOrJwk, { context });
      }
      if (typeof options.recipientDidOrJwk === 'string' && wallet.packForRecipient) {
        return wallet.packForRecipient(job.content, options.recipientDidOrJwk);
      }
    }
    return JSON.stringify(job.content);
  }

  async function putResponse(thid: string, responseBody: unknown): Promise<string> {
    const responseId = createRuntimeUuid();
    const response: JobResponseRecord = {
      id: responseId,
      thid,
      content: clone(responseBody),
      createdAtTimestamp: Date.now(),
    };
    await vaultRepository.put(RESPONSE_COLLECTION, response);
    return responseId;
  }

  async function markCompleted(job: JobRequest, responseBody: unknown): Promise<JobRequest> {
    const responseMessageId = await putResponse(String(job.thid || job.id), responseBody);
    const updated = updateJobShape(job, {
      status: JobStatus.COMPLETED,
      responseMessageId,
      errorMessage: undefined,
    });
    await putProtectedJob(updated);
    return updated;
  }

  return {
    descriptor: { ...options.descriptor },
    get isInitialized() {
      return isInitialized;
    },
    async initialize() {
      isInitialized = true;
    },
    shutdown() {
      isInitialized = false;
      listener = undefined;
    },
    setListener(nextListener) {
      listener = nextListener;
    },
    async createJob(content: IDecodedDidcommPayload, selector: ServiceEndpointSelector) {
      const now = Date.now();
      const draft: JobRequest = {
        id: createRuntimeUuid(),
        thid: String(content?.thid || '').trim() || undefined,
        status: JobStatus.DRAFT,
        sequence: 1,
        createdAtTimestamp: now,
        content: clone(content),
        ...selector,
      };
      await putProtectedJob(draft);
      return clone(draft);
    },
    async findDraftJobByFormType(formType: string) {
      const normalizedFormType = String(formType || '').trim();
      const drafts = await listUnprotectedJobs({
        where: [{ attribute: 'status', equals: JobStatus.DRAFT }],
      });
      return drafts.find((job) => inferFormType(job.content) === normalizedFormType) ?? null;
    },
    async createOrUpdateDraftJob(content: IDecodedDidcommPayload, selector: ServiceEndpointSelector) {
      const formType = inferFormType(content);
      const existing = formType ? await this.findDraftJobByFormType(formType) : null;
      if (!existing) {
        return this.createJob(content, selector);
      }
      const updated = updateJobShape(existing, {
        content: clone(content),
        thid: String(content?.thid || '').trim() || existing.thid,
        ...selector,
      });
      await putProtectedJob(updated);
      return clone(updated);
    },
    async sync(accessToken: string) {
      lastAccessToken = accessToken;
      const pending = await listUnprotectedJobs({
        where: [{
          attribute: 'status',
          in: [JobStatus.DRAFT, JobStatus.ERROR_RETRYABLE, JobStatus.SENT],
        }],
      });
      for (const job of pending) {
        if (job.status === JobStatus.SENT && options.transport?.poll) {
          const poll = await options.transport.poll({
            job,
            accessToken,
            context,
          });
          if (poll.pending) continue;
          if (poll.completed && poll.responseBody !== undefined) {
            await markCompleted(job, poll.responseBody);
            continue;
          }
          const failed = updateJobShape(job, {
            status: poll.retryable ? JobStatus.ERROR_RETRYABLE : JobStatus.FAILED,
            errorMessage: poll.errorMessage,
          });
          await putProtectedJob(failed);
          continue;
        }
        await this.submitJob(job);
      }
    },
    async queryJobs(query: VaultQuery) {
      return listUnprotectedJobs(query);
    },
    async submitJob(job: JobRequest) {
      if (!options.transport) {
        const sent = updateJobShape(job, {
          status: JobStatus.SENT,
        });
        await putProtectedJob(sent);
        return;
      }
      if (!lastAccessToken) {
        throw new Error('WalletBackedJobManager.submitJob requires sync(accessToken) before transport submission.');
      }

      const submitting = updateJobShape(job, {
        status: JobStatus.SUBMITTING,
      });
      await putProtectedJob(submitting);

      const envelope = await buildEnvelope(submitting);
      const submitResult = await options.transport.submit({
        job: submitting,
        envelope,
        accessToken: lastAccessToken,
        context,
      });

      if (submitResult.completed && submitResult.responseBody !== undefined) {
        await markCompleted(submitting, submitResult.responseBody);
        return;
      }

      const nextStatus = submitResult.retryable
        ? JobStatus.ERROR_RETRYABLE
        : submitResult.accepted === false
          ? JobStatus.FAILED
          : JobStatus.SENT;
      const updated = updateJobShape(submitting, {
        status: nextStatus,
        locationUrl: submitResult.locationUrl,
        errorMessage: submitResult.errorMessage,
      });
      await putProtectedJob(updated);
      if (updated.status === JobStatus.SENT && options.transport.poll) {
        const pollResult = await options.transport.poll({
          job: updated,
          accessToken: lastAccessToken,
          context,
        });
        if (pollResult.completed && pollResult.responseBody !== undefined) {
          await markCompleted(updated, pollResult.responseBody);
          return;
        }
        if (!pollResult.pending) {
          const failedAfterPoll = updateJobShape(updated, {
            status: pollResult.retryable ? JobStatus.ERROR_RETRYABLE : JobStatus.FAILED,
            errorMessage: pollResult.errorMessage,
          });
          await putProtectedJob(failedAfterPoll);
        }
      }
    },
    async sealJobWithToken(job: JobRequest, accessToken: string) {
      if (!job.content) return job;
      const sealed = updateJobShape(job, {
        content: {
          ...clone(job.content),
          meta: {
            ...(job.content.meta || {}),
            bearer: {
              compact: accessToken,
              jwt: {},
            },
          },
        },
      });
      await putProtectedJob(sealed);
      return sealed;
    },
    async getJobResponseByThid(thid: string) {
      const responses = await vaultRepository.query<JobResponseRecord>(RESPONSE_COLLECTION, {
        where: [{ attribute: 'thid', equals: thid }],
        orderBy: { attribute: 'createdAtTimestamp', direction: 'desc' },
        limit: 1,
      });
      return responses[0]?.content ?? null;
    },
    generateId() {
      return createRuntimeUuid();
    },
  };
}

/**
 * Convenience helper for the default transient backend/session mode where one
 * in-memory vault is enough and durable cloud sync is optional.
 */
export function createWalletBackedJobManagerInMemory(
  options: WalletBackedJobManagerOptions,
): IJobManager {
  return createWalletBackedJobManager({
    ...options,
    vaultRepository: options.vaultRepository ?? new VaultMemRepository(),
  });
}
