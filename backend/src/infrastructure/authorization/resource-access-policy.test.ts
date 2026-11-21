import { describe, expect, it } from 'vitest';
import type { AccountRole, Uuid } from '@edutrack/contracts';
import { ERROR_CODES } from '../errors/error-codes.js';
import {
  assertResourceAccess,
  type ResourceAccessFacts,
  type ResourceActor,
} from './resource-access-policy.js';

const ownerId = '550e8400-e29b-41d4-a716-446655440000' as Uuid;
const otherUserId = 'd9428888-122b-4b86-b1d4-6a4e4b3b8c11' as Uuid;

function actor(id: Uuid, roles: AccountRole[] = ['student']): ResourceActor {
  return { id, roles };
}

function captureError(operation: () => void): unknown {
  try {
    operation();
  } catch (error) {
    return error;
  }

  throw new Error('Expected the policy to reject access.');
}

describe('assertResourceAccess', () => {
  it('allows the persisted resource owner', () => {
    expect(() => assertResourceAccess(actor(ownerId), { ownerUserId: ownerId })).not.toThrow();
  });

  it('returns a concealed not-found error for an unrelated user', () => {
    const error = captureError(() =>
      assertResourceAccess(actor(otherUserId), { ownerUserId: ownerId }),
    );

    expect(error).toMatchObject({
      code: ERROR_CODES.NOT_FOUND,
      statusCode: 404,
      message: 'The requested resource was not found.',
    });
  });

  it('returns the same not-found error for missing and unauthorized resources', () => {
    const missingError = captureError(() => assertResourceAccess(actor(otherUserId), undefined));
    const unauthorizedError = captureError(() =>
      assertResourceAccess(actor(otherUserId), { ownerUserId: ownerId }),
    );

    expect(missingError).toMatchObject({
      code: ERROR_CODES.NOT_FOUND,
      statusCode: 404,
      message: 'The requested resource was not found.',
    });
    expect(unauthorizedError).toMatchObject({
      code: ERROR_CODES.NOT_FOUND,
      statusCode: 404,
      message: 'The requested resource was not found.',
    });
  });

  it('allows a persisted relationship only when explicitly enabled', () => {
    const facts: ResourceAccessFacts = {
      ownerUserId: ownerId,
      hasServerVerifiedRelationship: true,
    };

    expect(() => assertResourceAccess(actor(otherUserId), facts)).toThrowError(
      expect.objectContaining({ code: ERROR_CODES.NOT_FOUND }),
    );

    expect(() =>
      assertResourceAccess(actor(otherUserId), facts, {
        allowVerifiedRelationship: true,
      }),
    ).not.toThrow();
  });

  it('allows a role exception only when the policy names that role', () => {
    expect(() =>
      assertResourceAccess(
        actor(otherUserId, ['teacher']),
        {
          ownerUserId: ownerId,
        },
        {
          allowedRoles: ['teacher'],
        },
      ),
    ).not.toThrow();
  });

  it('does not grant Administrators automatic access', () => {
    const error = captureError(() =>
      assertResourceAccess(
        actor(otherUserId, ['administrator']),
        { ownerUserId: ownerId },
        { concealExistence: false },
      ),
    );

    expect(error).toMatchObject({
      code: ERROR_CODES.FORBIDDEN,
      statusCode: 403,
      message: 'The request is not permitted.',
    });
  });

  it('allows an Administrator only when that role is explicitly permitted', () => {
    expect(() =>
      assertResourceAccess(
        actor(otherUserId, ['administrator']),
        { ownerUserId: ownerId },
        { allowedRoles: ['administrator'] },
      ),
    ).not.toThrow();
  });

  it('supports multi-role users when any explicitly permitted role matches', () => {
    expect(() =>
      assertResourceAccess(
        actor(otherUserId, ['student', 'teacher']),
        { ownerUserId: ownerId },
        { allowedRoles: ['teacher'] },
      ),
    ).not.toThrow();
  });

  it('does not use client-supplied owner or role claims', () => {
    const clientPayload = {
      ownerUserId: otherUserId,
      roles: ['administrator'],
    };

    // The policy accepts only the trusted actor and persisted access facts.
    // Client payload fields are not policy inputs.
    expect(clientPayload.ownerUserId).toBe(otherUserId);

    const error = captureError(() =>
      assertResourceAccess(
        actor(otherUserId, ['student']),
        { ownerUserId: ownerId },
        { allowedRoles: [] },
      ),
    );

    expect(error).toMatchObject({
      code: ERROR_CODES.NOT_FOUND,
      statusCode: 404,
    });
  });
});
