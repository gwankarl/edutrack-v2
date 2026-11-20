import type { ValidationDetail } from '@edutrack/contracts';
import type { AppErrorCode } from './error-codes.js';

export class AppError extends Error {
  constructor(
    readonly code: AppErrorCode,
    readonly statusCode: number,
    message: string,
    readonly details?: ValidationDetail[],
  ) {
    super(message);

    if (!Number.isInteger(statusCode) || statusCode < 400 || statusCode >= 500) {
      throw new RangeError('AppError statusCode must be an HTTP 4xx status.');
    }

    this.name = 'AppError';
  }
}
