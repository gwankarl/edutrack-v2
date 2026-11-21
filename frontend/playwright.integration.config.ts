import { defineConfig } from '@playwright/test';
import process from 'node:process';
import baseConfig from './playwright.config.ts';

const backendPort = 4301;
const frontendPort = 4175;
const backendOrigin = `http://127.0.0.1:${backendPort}`;
const frontendOrigin = `http://127.0.0.1:${frontendPort}`;

export default defineConfig({
  ...baseConfig,
  testMatch: '**/*.integration.spec.ts',
  testIgnore: [],
  use: {
    ...baseConfig.use,
    baseURL: frontendOrigin,
  },
  webServer: [
    {
      command: 'npm run dev --workspace=@edutrack/backend',
      url: `${backendOrigin}/api/v1/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
      env: {
        NODE_ENV: 'test',
        HOST: '127.0.0.1',
        PORT: String(backendPort),
        DATABASE_URL: 'postgresql://127.0.0.1:1/edutrack_e2e',
      },
    },
    {
      command:
        'npm run dev --workspace=@edutrack/frontend -- --host 127.0.0.1 --port 4175 --strictPort',
      url: frontendOrigin,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
      env: {
        VITE_API_BASE_URL: frontendOrigin,
        EDUTRACK_BACKEND_PROXY_TARGET: backendOrigin,
      },
    },
  ],
});
