import type { AccountRole, Uuid } from '@edutrack/contracts';
import { AppError } from '../errors/app-error.js';
import { ERROR_CODES } from '../errors/error-codes.js';

/**
 * A minimal view of the trusted server-side actor.
 * Callers should construct this from request.authenticatedUser.
 */
export type ResourceActor = {
  id: Uuid;
  roles: readonly AccountRole[];
};

/**
 * Access facts produced by a feature repository from persisted data.
 * Do not populate these fields from request bodies, query parameters, or headers.
 */
export type ResourceAccessFacts = {
  ownerUserId?: Uuid | null;
  hasServerVerifiedRelationship?: boolean;
};

export type ResourceAccessPolicy = {
  /** Roles explicitly allowed by this resource's policy. There is no admin bypass. */
  allowedRoles?: readonly AccountRole[];
  /** Permit a persisted relationship only when the feature policy explicitly opts in. */
  allowVerifiedRelationship?: boolean;
  /** Conceal an existing resource when access is denied. Defaults to true. */
  concealExistence?: boolean;
};

function notFoundError(): AppError {
  return new AppError(ERROR_CODES.NOT_FOUND, 404, 'The requested resource was not found.');
}

function forbiddenError(): AppError {
  return new AppError(ERROR_CODES.FORBIDDEN, 403, 'The request is not permitted.');
}

/**
 * Throws when the actor may not access the resource.
 *
 * Ownership is allowed by default. Relationship and role exceptions require
 * explicit policy configuration. Missing resources and denied access are both
 * reported as 404 by default to avoid disclosing resource existence.
 */
export function assertResourceAccess(
  actor: ResourceActor,
  facts: ResourceAccessFacts | undefined,
  policy: ResourceAccessPolicy = {},
): void {
  if (!facts) {
    throw notFoundError();
  }

  const isOwner = facts.ownerUserId != null && facts.ownerUserId === actor.id;
  const hasAllowedRole = (policy.allowedRoles ?? []).some((role) => actor.roles.includes(role));
  const hasAllowedRelationship =
    policy.allowVerifiedRelationship === true && facts.hasServerVerifiedRelationship === true;

  if (isOwner || hasAllowedRole || hasAllowedRelationship) {
    return;
  }

  if (policy.concealExistence ?? true) {
    throw notFoundError();
  }

  throw forbiddenError();
}
