import type { FastifyRequest } from "fastify";

/**
 * Request log serializers that keep a watch ID out of the access log: `GET /watches/:id` puts
 * the student's bearer token in the URL path.
 */
export const requestLogSerializers = {
  req(request: FastifyRequest) {
    return {
      method: request.method,
      url: request.url.replace(/^(\/watches\/)[^/?]+/, "$1:id"),
      hostname: request.hostname,
      remoteAddress: request.ip,
      remotePort: request.socket.remotePort,
    };
  },
};
