import type { FastifyPluginAsync } from 'fastify';
import { getHealthController } from './health.controller.js';

export const systemRoutes: FastifyPluginAsync = async (app) => {
  app.get('/health', getHealthController);
};
