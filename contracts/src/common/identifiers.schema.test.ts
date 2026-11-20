import { describe, expect, it } from 'vitest';
import { uuidSchema } from '../index.js';

describe('uuidSchema', () => {
  it('accepts a valid UUID', () => {
    expect(uuidSchema.safeParse('550e8400-e29b-41d4-a716-446655440000').success).toBe(true);
  });

  it.each(['not-a-uuid', '', '550e8400-e29b-41d4-a716-44665544000'])(
    'rejects an invalid UUID: %s',
    (value) => {
      expect(uuidSchema.safeParse(value).success).toBe(false);
    },
  );
});
