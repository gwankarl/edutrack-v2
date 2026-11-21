import { expect, test } from '@playwright/test';

test('reaches Fastify health through the frontend client and validates the shared contract', async ({
  page,
}) => {
  const healthResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());

    return url.pathname === '/api/v1/health' && url.port === '4175';
  });

  await page.goto('/e2e/integration/health-harness.html');

  const healthResponse = await healthResponsePromise;

  expect(healthResponse.status()).toBe(200);

  const result = page.getByRole('status', { name: 'Backend health result' });

  await expect(result).toHaveAttribute('data-state', 'success');
  await expect(result).toHaveAttribute('data-status', 'ok');
  await expect(result).toHaveAttribute('data-contract', 'valid');
  await expect(result).toHaveText('Backend status: ok');
});

test('shows the API client network error when the health request is unavailable', async ({
  page,
}) => {
  await page.route('**/api/v1/health', (route) => route.abort());

  await page.goto('/e2e/integration/health-harness.html');

  const result = page.getByRole('status', { name: 'Backend health result' });

  await expect(result).toHaveAttribute('data-state', 'error');
  await expect(result).toHaveAttribute('data-error-kind', 'network');
  await expect(result).toHaveText('Unable to reach the EduTrack API.');
});
