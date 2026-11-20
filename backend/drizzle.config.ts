import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'drizzle-kit';
import { parseEnvironment } from './src/infrastructure/config/environment.js';

const backendDirectory = dirname(fileURLToPath(import.meta.url));
const environmentFile = resolve(backendDirectory, '.env');

if (existsSync(environmentFile)) {
  loadEnvFile(environmentFile);
}

const { DATABASE_URL } = parseEnvironment(process.env);

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/infrastructure/database/schema/index.ts',
  out: './drizzle',
  dbCredentials: {
    url: DATABASE_URL,
  },
});
