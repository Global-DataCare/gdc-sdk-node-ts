// Copyright 2026 Antifraud Services Inc. under the Apache License, Version 2.0.

import { requireClientMethod, type NodeRuntimeClient } from './client-port.js';
import type { EmployeeDeviceActivationResult, EmployeeDeviceActivationRequestInput } from '../device-activation.js';
import type { SmartTokenExchangeResult, SmartTokenRequestInput } from '../smart-token.js';

export class OrganizationEmployeeSdk {
  constructor(private readonly client: NodeRuntimeClient) {}

  public activateEmployeeDeviceWithActivationRequest(input: EmployeeDeviceActivationRequestInput): Promise<EmployeeDeviceActivationResult> {
    return requireClientMethod(this.client, 'activateEmployeeDeviceWithActivationRequest')(input);
  }

  public requestSmartToken(input: SmartTokenRequestInput): Promise<SmartTokenExchangeResult> {
    return requireClientMethod(this.client, 'requestSmartToken')(input);
  }
}
