// Copyright 2026 Antifraud Services Inc. under the Apache License, Version 2.0.

import type { JobRequest } from 'gdc-common-utils-ts/models/confidential-job';
import type { JWK } from 'gdc-common-utils-ts/models/jwk';
import type { IVaultRepository } from 'gdc-common-utils-ts/storage';
import type { ActorProfileDescriptor, IWallet } from 'gdc-sdk-core-ts';

export type WalletExecutionContextLike = Readonly<{
  profile?: Readonly<{
    profileId: string;
    actorType?: string;
    actorId?: string;
  }>;
  runtime?: Readonly<{
    runtimeId: string;
    runtimeType?: string;
  }>;
  route?: Readonly<{
    tenantId?: string;
    jurisdiction?: string;
    sector?: string;
  }>;
  walletId?: string;
}>;

export type WalletBackedJobSubmitResult = Readonly<{
  accepted?: boolean;
  completed?: boolean;
  locationUrl?: string;
  responseBody?: unknown;
  errorMessage?: string;
  retryable?: boolean;
}>;

export type WalletBackedJobPollResult = Readonly<{
  pending?: boolean;
  completed?: boolean;
  responseBody?: unknown;
  errorMessage?: string;
  retryable?: boolean;
}>;

export type WalletBackedJobTransport = Readonly<{
  submit: (input: Readonly<{
    job: JobRequest;
    envelope: string;
    accessToken: string;
    context: WalletExecutionContextLike;
  }>) => Promise<WalletBackedJobSubmitResult>;
  poll?: (input: Readonly<{
    job: JobRequest;
    accessToken: string;
    context: WalletExecutionContextLike;
  }>) => Promise<WalletBackedJobPollResult>;
}>;

export type WalletBackedJobManagerOptions = Readonly<{
  descriptor: ActorProfileDescriptor;
  wallet: IWallet;
  walletContext: WalletExecutionContextLike;
  vaultRepository?: IVaultRepository;
  transport?: WalletBackedJobTransport;
  recipientDidOrJwk?: string | JWK;
}>;
