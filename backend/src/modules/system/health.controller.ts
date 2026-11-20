import type { HealthResponse } from '@edutrack/contracts';
import type { FastifyReply, FastifyRequest } from 'fastify';

export function getHealthController(request: FastifyRequest, reply: FastifyReply) {
  void request;

  const response: HealthResponse = {
    success: true,
    data: { status: 'ok' },
  };

  return reply.code(200).send(response);
}
