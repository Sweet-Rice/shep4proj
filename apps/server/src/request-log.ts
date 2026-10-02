import type { FastifyRequest } from "fastify";

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/**
 * Replaces every UUID in `text` with `:id`. A watch ID is a bearer token and it is a UUID, so this
 * keeps one out of any message that may quote a query's parameters or a request path.
 */
export function redactIds(text: string): string {
  return text.replace(UUID, ":id");
}

/**
 * Request log serializers that keep a watch ID out of the access log: `GET /watches/:id` puts
 * the student's bearer token in the URL path.
 */
export const requestLogSerializers = {
  req(request: FastifyRequest) {
    return {
      method: request.method,
      url: redactIds(request.url.replace(/^(\/watches\/)[^/?]+/, "$1:id")),
      hostname: request.hostname,
      remoteAddress: request.ip,
      remotePort: request.socket.remotePort,
    };
  },
};
