import { randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { Pool } from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Uuid } from '@edutrack/contracts';
import { AppError } from '../../infrastructure/errors/app-error.js';
import { ERROR_CODES } from '../../infrastructure/errors/error-codes.js';
import { parseEnvironment } from '../../infrastructure/config/environment.js';
import { createDatabaseClient, getDatabaseClient } from '../../infrastructure/database/client.js';
import {
  closeDatabaseConnection,
  initializeDatabaseConnection,
} from '../../infrastructure/database/connection.js';
import { emailVerificationTokens } from '../../infrastructure/database/schema/accounts/email-verification-tokens.table.js';
import { passwordResetTokens } from '../../infrastructure/database/schema/accounts/password-reset-tokens.table.js';
import { sessions } from '../../infrastructure/database/schema/accounts/sessions.table.js';
import { users } from '../../infrastructure/database/schema/accounts/users.table.js';
import { userRoles } from '../../infrastructure/database/schema/accounts/user-roles.table.js';
import {
  EMAIL_VERIFICATION_MAX_ISSUANCES_PER_DAY,
  EMAIL_VERIFICATION_TOKEN_LIFETIME_MS,
  EMAIL_VERIFICATION_RESEND_COOLDOWN_MS,
  PASSWORD_RESET_RESEND_COOLDOWN_MS,
  PASSWORD_RESET_TOKEN_LIFETIME_MS,
} from '../../infrastructure/security/account-token-policy.js';
import {
  generateSecurityToken,
  hashSecurityToken,
} from '../../infrastructure/security/security-token.js';
import { hashPassword, verifyPassword } from '../../infrastructure/security/password-hasher.js';
import {
  consumeEmailVerificationToken,
  findActiveEmailVerificationToken,
  issueEmailVerificationToken,
} from './email-verification-token-service.js';
import {
  consumePasswordResetToken,
  findActivePasswordResetToken,
  issuePasswordResetToken,
  resetPasswordWithToken,
} from './password-reset-token-service.js';
import { createSession } from './session-repository.js';
import { createPasswordResetWorkflow } from './password-reset-workflow-service.js';
import {
  EmailVerificationIssuanceLimitError,
  PasswordResetIssuanceLimitError,
} from './account-repository.errors.js';
import { createEmailVerificationWorkflow } from './email-verification-workflow-service.js';
import { confirmEmailVerificationToken } from './email-verification-token-service.js';

const TEST_DATABASE_NAME = 'edutrack_test';
const createdUserIds: Uuid[] = [];

let pool: Pool | undefined;

function requirePool(): Pool {
  if (!pool) {
    throw new Error('Account security token test pool was not initialized.');
  }

  return pool;
}

function requireTestDatabaseUrl(): URL {
  const configuredUrl = process.env.DATABASE_TEST_URL;

  if (!configuredUrl) {
    throw new Error('Set DATABASE_TEST_URL to the dedicated edutrack_test database.');
  }

  try {
    const url = new URL(configuredUrl);
    const databaseName = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
    const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');

    if (
      !/^postgres(?:ql)?:$/i.test(url.protocol) ||
      databaseName !== TEST_DATABASE_NAME ||
      !['localhost', '127.0.0.1', '::1'].includes(hostname)
    ) {
      throw new Error('Invalid test database target.');
    }

    const applicationUrl = process.env.DATABASE_URL;
    if (applicationUrl) {
      const application = new URL(applicationUrl);
      const applicationHost = application.hostname.toLowerCase().replace(/^\[|\]$/g, '');
      const testTarget = `${hostname}:${url.port || '5432'}/${databaseName}`;
      const applicationTarget =
        `${applicationHost}:${application.port || '5432'}/` +
        decodeURIComponent(application.pathname.replace(/^\/+/, ''));

      if (testTarget === applicationTarget) {
        throw new Error('Test and application database targets are identical.');
      }
    }

    return url;
  } catch {
    throw new Error(
      'Refusing account security token tests: DATABASE_TEST_URL must target a separate local edutrack_test database.',
    );
  }
}

async function createTestUser(): Promise<Uuid> {
  const [user] = await getDatabaseClient()
    .insert(users)
    .values({
      displayName: 'Account Security Token Integration User',
      email: `account-token-${randomUUID()}@example.test`,
      passwordHash: 'test-only-placeholder-hash',
    })
    .returning({ id: users.id });

  if (!user) {
    throw new Error('Failed to create account security token test user.');
  }

  createdUserIds.push(user.id);
  return user.id;
}

beforeAll(async () => {
  const testUrl = requireTestDatabaseUrl();
  const environment = parseEnvironment({
    ...process.env,
    NODE_ENV: 'test',
    DATABASE_URL: testUrl.toString(),
  });

  pool = initializeDatabaseConnection(environment);

  // Verify server identity before any test inserts synthetic records.
  const identity = await requirePool().query<{ database_name: string }>(
    'SELECT current_database() AS database_name',
  );

  if (identity.rows[0]?.database_name !== TEST_DATABASE_NAME) {
    throw new Error(
      'Refusing account security token tests: PostgreSQL did not report edutrack_test.',
    );
  }

  createDatabaseClient(requirePool());
});

afterEach(async () => {
  if (createdUserIds.length > 0) {
    const ids = [...createdUserIds];
    await getDatabaseClient().delete(users).where(inArray(users.id, ids));
    createdUserIds.splice(0, ids.length);
  }
});

afterAll(async () => {
  try {
    if (pool && createdUserIds.length > 0) {
      await createDatabaseClient(pool)
        .delete(users)
        .where(inArray(users.id, [...createdUserIds]));
      createdUserIds.length = 0;
    }
  } finally {
    await closeDatabaseConnection();
    pool = undefined;
  }
});

describe('account security token lifecycle', () => {
  it('stores only hashes and replaces prior email-verification tokens', async () => {
    const userId = await createTestUser();
    const issuedAt = new Date();
    const first = await issueEmailVerificationToken(userId, issuedAt);
    const firstHash = hashSecurityToken(first.token);

    const emailLifetime = first.expiresAt.getTime() - issuedAt.getTime();
    expect(emailLifetime).toBeGreaterThan(0);
    expect(emailLifetime).toBeLessThanOrEqual(EMAIL_VERIFICATION_TOKEN_LIFETIME_MS);
    const activeFirst = await findActiveEmailVerificationToken(first.token);
    expect(activeFirst).toMatchObject({
      userId,
      expiresAt: first.expiresAt,
    });
    expect(activeFirst).not.toHaveProperty('tokenHash');

    const [storedFirst] = await getDatabaseClient()
      .select({ tokenHash: emailVerificationTokens.tokenHash })
      .from(emailVerificationTokens)
      .where(eq(emailVerificationTokens.userId, userId))
      .limit(1);
    expect(storedFirst?.tokenHash).toBe(firstHash);
    expect(storedFirst?.tokenHash).not.toBe(first.token);

    const second = await issueEmailVerificationToken(
      userId,
      new Date(
        first.expiresAt.getTime() -
          EMAIL_VERIFICATION_TOKEN_LIFETIME_MS +
          EMAIL_VERIFICATION_RESEND_COOLDOWN_MS +
          1,
      ),
    );
    expect(await findActiveEmailVerificationToken(first.token)).toBeUndefined();
    await expect(consumeEmailVerificationToken(first.token)).rejects.toMatchObject({
      code: ERROR_CODES.BAD_REQUEST,
      statusCode: 400,
    });
    await expect(findActiveEmailVerificationToken(second.token)).resolves.toMatchObject({ userId });

    const firstRow = await getDatabaseClient()
      .select({ consumedAt: emailVerificationTokens.consumedAt })
      .from(emailVerificationTokens)
      .where(eq(emailVerificationTokens.tokenHash, firstHash))
      .limit(1);
    expect(firstRow[0]?.consumedAt).toBeInstanceOf(Date);
  });

  it('keeps password-reset tokens separate and replaces only previous reset tokens', async () => {
    const userId = await createTestUser();
    const verification = await issueEmailVerificationToken(userId);
    const issuedAt = new Date();
    const firstReset = await issuePasswordResetToken(userId, issuedAt);
    const firstResetHash = hashSecurityToken(firstReset.token);

    const resetLifetime = firstReset.expiresAt.getTime() - issuedAt.getTime();
    expect(resetLifetime).toBeGreaterThan(0);
    expect(resetLifetime).toBeLessThanOrEqual(PASSWORD_RESET_TOKEN_LIFETIME_MS);

    const storedReset = await getDatabaseClient()
      .select({ tokenHash: passwordResetTokens.tokenHash })
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.userId, userId))
      .limit(1);
    expect(storedReset[0]?.tokenHash).toBe(firstResetHash);
    expect(storedReset[0]?.tokenHash).not.toBe(firstReset.token);

    const secondReset = await issuePasswordResetToken(
      userId,
      new Date(issuedAt.getTime() + PASSWORD_RESET_RESEND_COOLDOWN_MS + 1),
    );
    expect(await findActivePasswordResetToken(firstReset.token)).toBeUndefined();
    await expect(consumePasswordResetToken(firstReset.token)).rejects.toMatchObject({
      code: ERROR_CODES.BAD_REQUEST,
      statusCode: 400,
    });
    await expect(findActivePasswordResetToken(secondReset.token)).resolves.toMatchObject({
      userId,
    });
    await expect(findActiveEmailVerificationToken(verification.token)).resolves.toMatchObject({
      userId,
    });
  });

  it('consumes each token once and rejects a concurrent second consumption', async () => {
    const userId = await createTestUser();
    const emailToken = await issueEmailVerificationToken(userId);
    const emailResults = await Promise.allSettled([
      consumeEmailVerificationToken(emailToken.token),
      consumeEmailVerificationToken(emailToken.token),
    ]);

    expect(emailResults.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(emailResults.filter((result) => result.status === 'rejected')).toHaveLength(1);
    await expect(findActiveEmailVerificationToken(emailToken.token)).resolves.toBeUndefined();

    const resetToken = await issuePasswordResetToken(userId);
    const resetResults = await Promise.allSettled([
      consumePasswordResetToken(resetToken.token),
      consumePasswordResetToken(resetToken.token),
    ]);
    expect(resetResults.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(resetResults.filter((result) => result.status === 'rejected')).toHaveLength(1);
    await expect(findActivePasswordResetToken(resetToken.token)).resolves.toBeUndefined();
  });

  it('rejects expired tokens for lookup and consumption', async () => {
    const userId = await createTestUser();
    const now = Date.now();
    const emailToken = generateSecurityToken();
    const resetToken = generateSecurityToken();
    const emailExpiresAt = new Date(now - 60_000);
    const createdAt = new Date(now - 120_000);

    await getDatabaseClient()
      .insert(emailVerificationTokens)
      .values({
        userId,
        tokenHash: hashSecurityToken(emailToken),
        createdAt,
        expiresAt: emailExpiresAt,
      });
    await getDatabaseClient()
      .insert(passwordResetTokens)
      .values({
        userId,
        tokenHash: hashSecurityToken(resetToken),
        createdAt,
        expiresAt: emailExpiresAt,
      });

    await expect(findActiveEmailVerificationToken(emailToken)).resolves.toBeUndefined();
    await expect(findActivePasswordResetToken(resetToken)).resolves.toBeUndefined();
    await expect(consumeEmailVerificationToken(emailToken)).rejects.toBeInstanceOf(AppError);
    await expect(consumePasswordResetToken(resetToken)).rejects.toBeInstanceOf(AppError);
    await expect(confirmEmailVerificationToken(emailToken)).rejects.toBeInstanceOf(AppError);
  });

  it('sends a generic verification request and atomically verifies the account without changing roles', async () => {
    const userId = await createTestUser();
    await getDatabaseClient().insert(userRoles).values({ userId, role: 'student' });
    const [account] = await getDatabaseClient()
      .select({ email: users.email, displayName: users.displayName })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    const sendAccountVerificationEmail = vi.fn().mockResolvedValue(undefined);
    const workflow = createEmailVerificationWorkflow({
      frontendOrigin: 'http://localhost:5173',
      emailService: { sendAccountVerificationEmail },
      logger: { error: vi.fn() },
    });

    const accepted = await workflow.requestVerification({ email: account!.email });
    expect(accepted).toEqual({ success: true, data: { accepted: true } });
    const actionUrl = sendAccountVerificationEmail.mock.calls[0]?.[0].actionUrl;
    expect(actionUrl).toBeDefined();
    const verificationToken = new URL(actionUrl!).searchParams.get('token');
    expect(verificationToken).toBeTruthy();

    const additionalToken = generateSecurityToken();
    const createdAt = new Date();
    await getDatabaseClient()
      .insert(emailVerificationTokens)
      .values({
        userId,
        tokenHash: hashSecurityToken(additionalToken),
        createdAt,
        expiresAt: new Date(createdAt.getTime() + EMAIL_VERIFICATION_TOKEN_LIFETIME_MS),
      });

    // Immediate resend is throttled and has the same outward result.
    await expect(workflow.requestVerification({ email: account!.email })).resolves.toEqual(
      accepted,
    );
    expect(sendAccountVerificationEmail).toHaveBeenCalledOnce();

    const confirmation = await workflow.confirmVerification({ token: verificationToken! });
    expect(confirmation).toEqual({ success: true, data: { verified: true } });
    expect(JSON.stringify(confirmation)).not.toContain(verificationToken);

    const [verifiedAccount] = await getDatabaseClient()
      .select({ emailVerifiedAt: users.emailVerifiedAt })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    expect(verifiedAccount?.emailVerifiedAt).toBeInstanceOf(Date);

    const roles = await getDatabaseClient()
      .select({ role: userRoles.role })
      .from(userRoles)
      .where(eq(userRoles.userId, userId));
    expect(roles).toEqual([{ role: 'student' }]);

    const allTokenRecords = await getDatabaseClient()
      .select({ consumedAt: emailVerificationTokens.consumedAt })
      .from(emailVerificationTokens)
      .where(eq(emailVerificationTokens.userId, userId));
    expect(allTokenRecords).toHaveLength(2);
    expect(allTokenRecords.every((record) => record.consumedAt instanceof Date)).toBe(true);
  });

  it('allows only one concurrent confirmation to consume and verify with a token', async () => {
    const userId = await createTestUser();
    const issued = await issueEmailVerificationToken(userId);
    const results = await Promise.allSettled([
      confirmEmailVerificationToken(issued.token),
      confirmEmailVerificationToken(issued.token),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);

    const [account] = await getDatabaseClient()
      .select({ emailVerifiedAt: users.emailVerifiedAt })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    expect(account?.emailVerifiedAt).toBeInstanceOf(Date);
  });

  it('enforces the daily email-verification issuance maximum', async () => {
    const userId = await createTestUser();
    const firstCreatedAt = new Date();

    for (let index = 0; index < EMAIL_VERIFICATION_MAX_ISSUANCES_PER_DAY; index += 1) {
      await issueEmailVerificationToken(
        userId,
        new Date(firstCreatedAt.getTime() + index * (EMAIL_VERIFICATION_RESEND_COOLDOWN_MS + 1)),
      );
    }

    await expect(
      issueEmailVerificationToken(
        userId,
        new Date(
          firstCreatedAt.getTime() +
            EMAIL_VERIFICATION_MAX_ISSUANCES_PER_DAY * (EMAIL_VERIFICATION_RESEND_COOLDOWN_MS + 1),
        ),
      ),
    ).rejects.toBeInstanceOf(EmailVerificationIssuanceLimitError);
  });

  it('keeps an account unverified and invalidates its token when email delivery fails', async () => {
    const userId = await createTestUser();
    const [account] = await getDatabaseClient()
      .select({ email: users.email, displayName: users.displayName })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    const sendAccountVerificationEmail = vi
      .fn()
      .mockRejectedValue(new Error('private SMTP detail'));
    const workflow = createEmailVerificationWorkflow({
      frontendOrigin: 'http://localhost:5173',
      emailService: { sendAccountVerificationEmail },
      logger: { error: vi.fn() },
    });

    await expect(workflow.requestVerification({ email: account!.email })).resolves.toEqual({
      success: true,
      data: { accepted: true },
    });

    const [user] = await getDatabaseClient()
      .select({ emailVerifiedAt: users.emailVerifiedAt })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    const tokens = await getDatabaseClient()
      .select({ consumedAt: emailVerificationTokens.consumedAt })
      .from(emailVerificationTokens)
      .where(eq(emailVerificationTokens.userId, userId));
    expect(user?.emailVerifiedAt).toBeNull();
    expect(tokens).toHaveLength(1);
    expect(tokens[0]?.consumedAt).toBeInstanceOf(Date);
  });

  it('resets a password atomically, revokes only that user sessions, and preserves roles and verification', async () => {
    const userId = await createTestUser();
    const otherUserId = await createTestUser();
    const [profileBefore] = await getDatabaseClient()
      .select({ displayName: users.displayName, email: users.email })
      .from(users)
      .where(eq(users.id, userId));
    if (!profileBefore) throw new Error('Password reset test account profile was not found.');
    const oldPassword = 'old sufficiently secure password';
    const newPassword = 'new sufficiently secure password';
    const emailVerifiedAt = new Date(Date.now() - 60_000);

    await getDatabaseClient()
      .update(users)
      .set({ passwordHash: await hashPassword(oldPassword), emailVerifiedAt })
      .where(eq(users.id, userId));
    await getDatabaseClient().insert(userRoles).values({ userId, role: 'student' });

    const userSessionHash = hashSecurityToken(generateSecurityToken());
    const otherSessionHash = hashSecurityToken(generateSecurityToken());
    await createSession({
      userId,
      tokenHash: userSessionHash,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    await createSession({
      userId: otherUserId,
      tokenHash: otherSessionHash,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    const issued = await issuePasswordResetToken(userId);
    const additionalResetToken = generateSecurityToken();
    const additionalTokenCreatedAt = new Date();
    await getDatabaseClient()
      .insert(passwordResetTokens)
      .values({
        userId,
        tokenHash: hashSecurityToken(additionalResetToken),
        createdAt: additionalTokenCreatedAt,
        expiresAt: new Date(additionalTokenCreatedAt.getTime() + PASSWORD_RESET_TOKEN_LIFETIME_MS),
      });

    const storedBefore = await getDatabaseClient()
      .select({ tokenHash: passwordResetTokens.tokenHash })
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.userId, userId));
    expect(storedBefore.map((record) => record.tokenHash)).toContain(
      hashSecurityToken(issued.token),
    );
    expect(storedBefore.map((record) => record.tokenHash)).not.toContain(issued.token);

    await resetPasswordWithToken(issued.token, await hashPassword(newPassword));

    const [account] = await getDatabaseClient()
      .select({
        passwordHash: users.passwordHash,
        emailVerifiedAt: users.emailVerifiedAt,
        displayName: users.displayName,
        email: users.email,
      })
      .from(users)
      .where(eq(users.id, userId));
    expect(account).toMatchObject(profileBefore);
    expect(await verifyPassword(oldPassword, account!.passwordHash)).toBe(false);
    expect(await verifyPassword(newPassword, account!.passwordHash)).toBe(true);
    expect(account?.emailVerifiedAt?.getTime()).toBe(emailVerifiedAt.getTime());

    const roleRows = await getDatabaseClient()
      .select({ role: userRoles.role })
      .from(userRoles)
      .where(eq(userRoles.userId, userId));
    expect(roleRows).toEqual([{ role: 'student' }]);

    const sessionRows = await getDatabaseClient()
      .select({ userId: sessions.userId, revokedAt: sessions.revokedAt })
      .from(sessions)
      .where(inArray(sessions.userId, [userId, otherUserId]));
    expect(sessionRows.find((row) => row.userId === userId)?.revokedAt).toBeInstanceOf(Date);
    expect(sessionRows.find((row) => row.userId === otherUserId)?.revokedAt).toBeNull();

    const [consumedToken] = await getDatabaseClient()
      .select({ consumedAt: passwordResetTokens.consumedAt })
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.tokenHash, hashSecurityToken(issued.token)));
    expect(consumedToken?.consumedAt).toBeInstanceOf(Date);
    const resetRows = await getDatabaseClient()
      .select({
        tokenHash: passwordResetTokens.tokenHash,
        consumedAt: passwordResetTokens.consumedAt,
      })
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.userId, userId));
    expect(resetRows).toHaveLength(2);
    expect(resetRows.every((row) => row.consumedAt instanceof Date)).toBe(true);
    expect(resetRows.map((row) => row.tokenHash)).not.toContain(additionalResetToken);
    await expect(
      resetPasswordWithToken(issued.token, await hashPassword('another new secure password')),
    ).rejects.toBeInstanceOf(AppError);
  });

  it('rejects malformed, unknown, and expired password reset tokens', async () => {
    const userId = await createTestUser();
    await expect(resetPasswordWithToken('malformed', 'not-persisted')).rejects.toBeInstanceOf(
      AppError,
    );
    await expect(
      resetPasswordWithToken(generateSecurityToken(), 'not-persisted'),
    ).rejects.toBeInstanceOf(AppError);

    const issued = await issuePasswordResetToken(userId);
    const createdAt = new Date(Date.now() - 10 * 60 * 1000);
    const expiresAt = new Date(createdAt.getTime() + 5 * 60 * 1000);
    await getDatabaseClient()
      .update(passwordResetTokens)
      .set({ createdAt, expiresAt })
      .where(eq(passwordResetTokens.tokenHash, hashSecurityToken(issued.token)));

    await expect(resetPasswordWithToken(issued.token, 'not-persisted')).rejects.toMatchObject({
      code: ERROR_CODES.BAD_REQUEST,
      statusCode: 400,
    });
  });

  it('allows only one concurrent password reset completion for a token', async () => {
    const userId = await createTestUser();
    const issued = await issuePasswordResetToken(userId);
    const passwordHash = await hashPassword('one new concurrent password');

    const results = await Promise.allSettled([
      resetPasswordWithToken(issued.token, passwordHash),
      resetPasswordWithToken(issued.token, passwordHash),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
  });

  it('enforces the daily reset issuance maximum even when each request respects cooldown', async () => {
    const userId = await createTestUser();
    const firstCreatedAt = new Date();

    for (let index = 0; index < 5; index += 1) {
      await issuePasswordResetToken(
        userId,
        new Date(firstCreatedAt.getTime() + index * (PASSWORD_RESET_RESEND_COOLDOWN_MS + 1)),
      );
    }

    await expect(
      issuePasswordResetToken(
        userId,
        new Date(firstCreatedAt.getTime() + 5 * (PASSWORD_RESET_RESEND_COOLDOWN_MS + 1)),
      ),
    ).rejects.toBeInstanceOf(PasswordResetIssuanceLimitError);
  });

  it('uses a generic recovery result, enforces issuance throttling, and cleans up undelivered tokens', async () => {
    const userId = await createTestUser();
    const [account] = await getDatabaseClient()
      .select({ email: users.email, displayName: users.displayName })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    const sendPasswordResetEmail = vi.fn().mockResolvedValue(undefined);
    const logger = { error: vi.fn() };
    const workflow = createPasswordResetWorkflow({
      frontendOrigin: 'http://localhost:5173',
      emailService: { sendPasswordResetEmail },
      logger,
    });

    const accepted = { success: true, data: { accepted: true } } as const;
    await expect(workflow.requestReset({ email: account!.email })).resolves.toEqual(accepted);
    const actionUrl = sendPasswordResetEmail.mock.calls[0]?.[0].actionUrl;
    const rawToken = new URL(actionUrl!).searchParams.get('token')!;
    expect(rawToken).toMatch(/^[A-Za-z0-9_-]{43}$/);

    await expect(workflow.requestReset({ email: 'unknown@example.test' })).resolves.toEqual(
      accepted,
    );
    await expect(workflow.requestReset({ email: account!.email })).resolves.toEqual(accepted);
    expect(sendPasswordResetEmail).toHaveBeenCalledOnce();
    expect(JSON.stringify(accepted)).not.toContain(rawToken);

    const tokenRows = await getDatabaseClient()
      .select({
        tokenHash: passwordResetTokens.tokenHash,
        consumedAt: passwordResetTokens.consumedAt,
      })
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.userId, userId));
    expect(tokenRows).toHaveLength(1);
    expect(tokenRows[0]?.tokenHash).toBe(hashSecurityToken(rawToken));
    expect(tokenRows[0]?.tokenHash).not.toBe(rawToken);

    const failedDeliveryUserId = await createTestUser();
    const [failedDeliveryAccount] = await getDatabaseClient()
      .select({ email: users.email, displayName: users.displayName })
      .from(users)
      .where(eq(users.id, failedDeliveryUserId))
      .limit(1);
    const failingWorkflow = createPasswordResetWorkflow({
      frontendOrigin: 'http://localhost:5173',
      emailService: {
        sendPasswordResetEmail: vi.fn().mockRejectedValue(new Error('secret SMTP detail')),
      },
      logger,
    });
    await expect(
      failingWorkflow.requestReset({ email: failedDeliveryAccount!.email }),
    ).resolves.toEqual(accepted);
    const failedRows = await getDatabaseClient()
      .select({ consumedAt: passwordResetTokens.consumedAt })
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.userId, failedDeliveryUserId));
    expect(failedRows).toHaveLength(1);
    expect(failedRows[0]?.consumedAt).toBeInstanceOf(Date);
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain('secret SMTP detail');
  });
});
