import { afterEach, describe, expect, it } from 'vitest';
import { healthResponseSchema } from '@edutrack/contracts';
import { createApp } from '../../app/create-app.js';
import { parseEnvironment } from '../../infrastructure/config/environment.js';

const TEST_DATABASE_URL = 'postgresql://test:test@localhost:5432/edutrack_test';

describe('GET /api/v1/health', () => {
  const apps: ReturnType<typeof createApp>[] = [];

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  it('returns the shared success response without starting a listener', async () => {
    const app = createApp(parseEnvironment({ NODE_ENV: 'test', DATABASE_URL: TEST_DATABASE_URL }));
    apps.push(app);

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/health',
    });

    expect(response.statusCode).toBe(200);
    expect(healthResponseSchema.safeParse(response.json()).success).toBe(true);
    expect(response.json()).toEqual({
      success: true,
      data: { status: 'ok' },
    });
  });
});
