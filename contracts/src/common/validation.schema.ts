import { z } from 'zod';

// Shared string conventions trim whitespace and reject empty provided values.
export const requiredStringSchema = z.string().trim().min(1);
export const optionalStringSchema = requiredStringSchema.optional();

// Query parameters arrive as strings; these aliases make that intent explicit.
export const requiredQueryStringSchema = requiredStringSchema;
export const optionalQueryStringSchema = optionalStringSchema;

export type RequiredString = z.infer<typeof requiredStringSchema>;
export type OptionalString = z.infer<typeof optionalStringSchema>;
export type RequiredQueryString = z.infer<typeof requiredQueryStringSchema>;
export type OptionalQueryString = z.infer<typeof optionalQueryStringSchema>;
