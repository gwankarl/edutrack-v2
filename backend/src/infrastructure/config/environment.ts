import { z } from 'zod';

const environmentSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    HOST: z.string().trim().min(1).default('127.0.0.1'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    DATABASE_URL: z
      .string()
      .trim()
      .url()
      .refine((value) => /^postgres(?:ql)?:$/i.test(new URL(value).protocol), {
        message: 'must use a postgres:// or postgresql:// URL',
      }),
    FRONTEND_ORIGIN: z.string().trim().url().optional(),
  })
  .superRefine((environment, context) => {
    if (environment.NODE_ENV === 'production' && !environment.FRONTEND_ORIGIN) {
      context.addIssue({
        code: 'custom',
        path: ['FRONTEND_ORIGIN'],
        message: 'is required in production',
      });
    }
  })
  .transform((environment) => ({
    ...environment,
    FRONTEND_ORIGIN: environment.FRONTEND_ORIGIN ?? 'http://localhost:5173',
  }));

export type BackendEnvironment = z.infer<typeof environmentSchema>;

export function parseEnvironment(source: NodeJS.ProcessEnv = process.env): BackendEnvironment {
  const result = environmentSchema.safeParse(source);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join('.') || 'environment'}: ${issue.message}`)
      .join('\n');

    throw new Error(`Invalid backend environment configuration:\n${issues}`);
  }

  return result.data;
}
