import type { ValidationDetail } from '@edutrack/contracts';

export type ApiClientErrorKind =
  'request' | 'network' | 'http' | 'invalid-json' | 'invalid-response';

export type ApiClientErrorOptions = {
  kind: ApiClientErrorKind;
  status?: number;
  code?: string;
  details?: ValidationDetail[];
};

export class ApiClientError extends Error {
  readonly kind: ApiClientErrorKind;
  readonly status: number | undefined;
  readonly code: string | undefined;
  readonly details: ValidationDetail[] | undefined;

  constructor(message: string, options: ApiClientErrorOptions) {
    super(message);

    this.name = 'ApiClientError';
    this.kind = options.kind;
    this.status = options.status;
    this.code = options.code;
    this.details = options.details;
  }
}
