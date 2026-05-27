// Copyright 2026 Antifraud Services Inc. under the Apache License, Version 2.0.

import type { NodeCapability } from '../session.js';

/**
 * Enforces actor-session capabilities on facade methods when the facade was
 * materialized from an `ActorSession`.
 *
 * Direct facade construction without explicit capabilities stays permissive for
 * backward compatibility with existing integrations.
 */
export function assertFacadeCapability(
  capabilities: readonly NodeCapability[] | undefined,
  requiredCapability: NodeCapability,
  actorLabel: string,
  methodName: string,
): void {
  if (!capabilities) return;
  if (capabilities.includes(requiredCapability)) return;
  throw new Error(`${actorLabel}.${methodName} requires capability '${requiredCapability}'.`);
}
