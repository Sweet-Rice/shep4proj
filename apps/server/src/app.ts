import Fastify, { type FastifyInstance, type FastifyServerOptions } from "fastify";

/** Body returned by `GET /health`. */
export interface HealthResponse {
  status: "ok";
}

/**
 * Builds the API server without starting it, so tests can drive it with
 * `app.inject()` and `main.ts` can decide where to listen. Routes are
 * registered here; later tasks add their own (courses, degrees, …).
 */
export function buildServer(opts: FastifyServerOptions = {}): FastifyInstance {
  const app = Fastify(opts);

  app.get(
    "/health",
    {
      schema: {
        response: {
          200: {
            type: "object",
            properties: { status: { type: "string", const: "ok" } },
            required: ["status"],
            additionalProperties: false,
          },
        },
      },
    },
    async (): Promise<HealthResponse> => ({ status: "ok" }),
  );

  return app;
}
