import { describe, expect, it } from 'vitest';
import { parseEnvironment } from '../infrastructure/config/environment.js';
import { createApp } from './create-app.js';

describe('createApp', () => {
  it('constructs and closes the application without starting an HTTP listener', async () => {
    const app = createApp(parseEnvironment({ NODE_ENV: 'test' }));

    try {
      await app.ready();

      expect(app.server.listening).toBe(false);
    } finally {
      await app.close();
    }
  });
});
