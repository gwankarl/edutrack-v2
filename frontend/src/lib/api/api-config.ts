const DEFAULT_API_ORIGIN = 'http://localhost:3000';
const API_VERSION_PREFIX = '/api/v1';

const configuredApiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();
const configuredOrigin = (configuredApiBaseUrl || DEFAULT_API_ORIGIN)
  .replace(/\/+$/, '')
  .replace(/\/api\/v1$/i, '');

export const API_BASE_URL = `${configuredOrigin}${API_VERSION_PREFIX}`;

export function buildApiUrl(endpoint: string): string {
  const normalizedEndpoint = endpoint
    .trim()
    .replace(/^\/+/, '')
    .replace(/^api\/v1(?:\/|$)/i, '');

  return normalizedEndpoint ? `${API_BASE_URL}/${normalizedEndpoint}` : API_BASE_URL;
}
