import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const backendDirectory = dirname(fileURLToPath(import.meta.url));
const environmentFile = resolve(backendDirectory, '.env');

if (existsSync(environmentFile)) {
  loadEnvFile(environmentFile);
}

export default defineConfig({
  test: {
    include: ['src/**/*.integration.test.ts'],
    environment: 'node',
    fileParallelism: false,
    testTimeout: 15_000,
    hookTimeout: 15_000,
  },
});
