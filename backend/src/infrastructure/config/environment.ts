import { z } from 'zod';

const frontendOriginSchema = z
  .string()
  .trim()
  .url()
  .refine((value) => {
    const url = new URL(value);

    return (
      ['http:', 'https:'].includes(url.protocol) &&
      !url.username &&
      !url.password &&
      url.pathname === '/' &&
      !url.search &&
      !url.hash
    );
  }, 'must be a safe frontend origin');

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
    FRONTEND_ORIGIN: frontendOriginSchema.optional(),
    SMTP_HOST: z.string().trim().min(1).optional(),
    SMTP_PORT: z.coerce.number().int().min(1).max(65535).optional(),
    SMTP_SECURE: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    SMTP_USER: z.string().trim().min(1).optional(),
    SMTP_PASSWORD: z.string().min(1).optional(),
    SMTP_FROM_EMAIL: z.email().optional(),
    SMTP_FROM_NAME: z.string().trim().min(1).default('EduTrack'),
  })
  .superRefine((environment, context) => {
    if (environment.NODE_ENV === 'production') {
      if (!environment.FRONTEND_ORIGIN) {
        context.addIssue({
          code: 'custom',
          path: ['FRONTEND_ORIGIN'],
          message: 'is required in production',
        });
      } else if (
        URL.canParse(environment.FRONTEND_ORIGIN) &&
        new URL(environment.FRONTEND_ORIGIN).protocol !== 'https:'
      ) {
        context.addIssue({
          code: 'custom',
          path: ['FRONTEND_ORIGIN'],
          message: 'must use HTTPS in production',
        });
      }
    }

    const smtpValues = [
      environment.SMTP_HOST,
      environment.SMTP_PORT,
      environment.SMTP_USER,
      environment.SMTP_PASSWORD,
      environment.SMTP_FROM_EMAIL,
    ];

    const hasSmtpValues = smtpValues.some((value) => value !== undefined);

    if (hasSmtpValues || environment.SMTP_SECURE) {
      const requiredSmtpValues = [
        ['SMTP_HOST', environment.SMTP_HOST],
        ['SMTP_PORT', environment.SMTP_PORT],
        ['SMTP_USER', environment.SMTP_USER],
        ['SMTP_PASSWORD', environment.SMTP_PASSWORD],
        ['SMTP_FROM_EMAIL', environment.SMTP_FROM_EMAIL],
      ] as const;

      for (const [field, value] of requiredSmtpValues) {
        if (value === undefined) {
          context.addIssue({
            code: 'custom',
            path: [field],
            message: 'is required when SMTP is configured',
          });
        }
      }
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
