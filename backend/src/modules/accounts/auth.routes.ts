import type { FastifyPluginAsync } from 'fastify';
import { loginAccountController, registerAccountController } from './auth.controller.js';

export const authRoutes: FastifyPluginAsync = async (app) => {
  app.post('/auth/register', registerAccountController);

  app.post('/auth/login', loginAccountController);
};
