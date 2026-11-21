import { loginRequestSchema, registrationRequestSchema } from '@edutrack/contracts';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { loginAccount } from './login-service.js';
import { registerStudent } from './registration-service.js';

export async function registerAccountController(request: FastifyRequest, reply: FastifyReply) {
  const input = registrationRequestSchema.parse(request.body);
  const response = await registerStudent(input);

  return reply.code(201).send(response);
}

export async function loginAccountController(request: FastifyRequest, reply: FastifyReply) {
  const input = loginRequestSchema.parse(request.body);
  const response = await loginAccount(input);

  return reply.code(200).send(response);
}
