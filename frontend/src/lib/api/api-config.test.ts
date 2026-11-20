import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('configured API base URL', () => {
  it('uses VITE_API_BASE_URL and adds the API version prefix once', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.test/api/v1/');
    vi.resetModules();

    const { API_BASE_URL, buildApiUrl } = await import('./api-config');

    expect(API_BASE_URL).toBe('https://api.example.test/api/v1');
    expect(buildApiUrl('/api/v1/health')).toBe('https://api.example.test/api/v1/health');
  });
});
