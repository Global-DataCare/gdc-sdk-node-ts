// Copyright 2026 Antifraud Services Inc. under the Apache License, Version 2.0.

import { ActorCapabilities, ActorKinds } from 'gdc-common-utils-ts/constants/actor-session';

import { requireClientMethod, type NodeRuntimeClient } from './client-port.js';
import { assertFacadeCapability } from './capability-guard.js';
import type { EmployeeDeviceActivationResult, EmployeeDeviceActivationRequestInput } from '../device-activation.js';
import type { SmartTokenExchangeResult, SmartTokenRequestInput } from '../smart-token.js';
import type { NodeCapability } from '../session.js';

export class OrganizationEmployeeSdk {
  constructor(
    private readonly client: NodeRuntimeClient,
    private readonly capabilities?: readonly NodeCapability[],
  ) {}

  public activateEmployeeDeviceWithActivationRequest(input: EmployeeDeviceActivationRequestInput): Promise<EmployeeDeviceActivationResult> {
    assertFacadeCapability(this.capabilities, ActorCapabilities.OrganizationActivateDevice, ActorKinds.OrganizationEmployee, 'activateEmployeeDeviceWithActivationRequest');
    return requireClientMethod(this.client, 'activateEmployeeDeviceWithActivationRequest')(input);
  }

  public requestSmartToken(input: SmartTokenRequestInput): Promise<SmartTokenExchangeResult> {
    assertFacadeCapability(this.capabilities, ActorCapabilities.OrganizationRequestSmartToken, ActorKinds.OrganizationEmployee, 'requestSmartToken');
    return requireClientMethod(this.client, 'requestSmartToken')(input);
  }
}
