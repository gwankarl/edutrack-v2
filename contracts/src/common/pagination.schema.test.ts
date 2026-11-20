import { describe, expect, it } from 'vitest';
import { paginationQuerySchema } from '../index.js';

describe('paginationQuerySchema', () => {
  it('applies limit and offset defaults', () => {
    expect(paginationQuerySchema.parse({})).toEqual({ limit: 20, offset: 0 });
  });

  it('parses query string integers', () => {
    expect(paginationQuerySchema.parse({ limit: '50', offset: '120' })).toEqual({
      limit: 50,
      offset: 120,
    });
  });

  it.each(['1', '100'])('accepts the limit boundary %s', (limit) => {
    expect(paginationQuerySchema.safeParse({ limit }).success).toBe(true);
  });

  it.each(['0', '101', '-1', '1.5', '01', ''])('rejects an invalid limit: %s', (limit) => {
    expect(paginationQuerySchema.safeParse({ limit }).success).toBe(false);
  });

  it('rejects negative and unsafe offsets', () => {
    expect(paginationQuerySchema.safeParse({ offset: '-1' }).success).toBe(false);
    expect(paginationQuerySchema.safeParse({ offset: '9007199254740992' }).success).toBe(false);
  });

  it('rejects unknown query keys', () => {
    const result = paginationQuerySchema.safeParse({ page: '2' });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.code === 'unrecognized_keys')).toBe(true);
    }
  });
});
