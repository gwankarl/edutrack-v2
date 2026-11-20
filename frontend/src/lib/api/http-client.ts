import { errorResponseSchema } from '@edutrack/contracts';
import { ApiClientError } from './api-client-error';
import { buildApiUrl } from './api-config';

export type ApiMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export interface RuntimeResponseSchema<TResponse> {
  parse(input: unknown): TResponse;
}

export interface ApiRequestOptions<TResponse = unknown> {
  method?: ApiMethod;
  headers?: HeadersInit;
  body?: unknown;
  signal?: AbortSignal;
  responseSchema?: RuntimeResponseSchema<TResponse>;
}

function createHttpError(status: number, payload: unknown): ApiClientError {
  const result = errorResponseSchema.safeParse(payload);

  if (!result.success) {
    return new ApiClientError('The API request failed.', {
      kind: 'http',
      status,
    });
  }

  return new ApiClientError(result.data.error.message, {
    kind: 'http',
    status,
    code: result.data.error.code,
    details: result.data.error.details,
  });
}

export function apiRequest<TResponse>(
  endpoint: string,
  options: ApiRequestOptions<TResponse> & {
    responseSchema: RuntimeResponseSchema<TResponse>;
  },
): Promise<TResponse>;

export function apiRequest(
  endpoint: string,
  options?: ApiRequestOptions<unknown>,
): Promise<unknown | undefined>;

export async function apiRequest<TResponse>(
  endpoint: string,
  options: ApiRequestOptions<TResponse> = {},
): Promise<unknown | undefined> {
  const method = options.method ?? 'GET';

  let serializedBody: string | undefined;
  if (options.body !== undefined) {
    try {
      serializedBody = JSON.stringify(options.body);
    } catch {
      throw new ApiClientError('The request body could not be serialized.', {
        kind: 'request',
      });
    }

    if (serializedBody === undefined) {
      throw new ApiClientError('The request body could not be serialized.', {
        kind: 'request',
      });
    }
  }

  if (method === 'GET' && serializedBody !== undefined) {
    throw new ApiClientError('GET requests cannot include a body.', {
      kind: 'request',
    });
  }

  const headers = new Headers(options.headers);
  headers.set('Accept', 'application/json');

  if (serializedBody !== undefined) {
    headers.set('Content-Type', 'application/json');
  }

  let response: Response;

  try {
    response = await fetch(buildApiUrl(endpoint), {
      method,
      headers,
      body: serializedBody,
      credentials: 'include',
      signal: options.signal,
    });
  } catch {
    throw new ApiClientError('Unable to reach the EduTrack API.', {
      kind: 'network',
    });
  }

  let responseText: string;

  try {
    responseText = await response.text();
  } catch {
    throw new ApiClientError('Unable to read the API response.', {
      kind: 'network',
      status: response.status,
    });
  }

  if (responseText.trim() === '') {
    if (!response.ok) {
      throw createHttpError(response.status, undefined);
    }

    if (options.responseSchema) {
      throw new ApiClientError('The API returned an empty response where JSON was expected.', {
        kind: 'invalid-response',
        status: response.status,
      });
    }

    return undefined;
  }

  let payload: unknown;

  try {
    payload = JSON.parse(responseText);
  } catch {
    throw new ApiClientError('The API returned malformed JSON.', {
      kind: 'invalid-json',
      status: response.status,
    });
  }

  if (!response.ok) {
    throw createHttpError(response.status, payload);
  }

  if (!options.responseSchema) {
    return payload;
  }

  try {
    return options.responseSchema.parse(payload);
  } catch {
    throw new ApiClientError('The API response did not match the expected format.', {
      kind: 'invalid-response',
      status: response.status,
    });
  }
}
