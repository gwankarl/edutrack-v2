import { healthResponseSchema } from '@edutrack/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApiUrl } from './api-config';
import { apiRequest } from './http-client';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('buildApiUrl', () => {
  it('adds the version prefix once', () => {
    expect(buildApiUrl('/health')).toBe('http://localhost:3000/api/v1/health');
    expect(buildApiUrl('/api/v1/health')).toBe('http://localhost:3000/api/v1/health');
  });
});

describe('apiRequest', () => {
  it('validates a successful response and includes cookies', async () => {
    const payload = {
      success: true,
      data: { status: 'ok' },
    };
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await apiRequest('/health', {
      responseSchema: healthResponseSchema,
    });

    expect(result).toEqual(payload);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/v1/health',
      expect.objectContaining({
        method: 'GET',
        credentials: 'include',
      }),
    );
  });

  it('preserves status and application error details from the shared contract', async () => {
    const payload = {
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'The requested resource was not found.',
      },
    };
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify(payload), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiRequest('/missing')).rejects.toMatchObject({
      name: 'ApiClientError',
      kind: 'http',
      status: 404,
      code: 'NOT_FOUND',
      message: 'The requested resource was not found.',
    });
  });

  it('returns a generic network error without exposing the underlying exception', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error('private connection detail'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiRequest('/health')).rejects.toMatchObject({
      name: 'ApiClientError',
      kind: 'network',
      message: 'Unable to reach the EduTrack API.',
    });
  });

  it('reports malformed JSON without exposing its body', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('sensitive malformed payload', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiRequest('/health')).rejects.toMatchObject({
      kind: 'invalid-json',
      status: 200,
      message: 'The API returned malformed JSON.',
    });
  });

  it('rejects a successful JSON response that fails runtime schema validation', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: { status: 'degraded' },
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      apiRequest('/health', {
        responseSchema: healthResponseSchema,
      }),
    ).rejects.toMatchObject({
      kind: 'invalid-response',
      status: 200,
    });
  });

  it('returns undefined for a successful empty response', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      apiRequest('/resource', {
        method: 'DELETE',
      }),
    ).resolves.toBeUndefined();
  });
});
