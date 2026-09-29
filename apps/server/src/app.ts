import Fastify, { type FastifyInstance, type FastifyServerOptions } from "fastify";

import { DegreeProgramSchema } from "@jevschedule/shared";
import { loadYamlFiles } from "./yaml-loader.js";

/** Body returned by `GET /health`. */
export interface HealthResponse {
  status: "ok";
}

export interface ServerOptions extends FastifyServerOptions {
  catalogDataDir?: string;
}

/**
 * Builds the API server without starting it, so tests can drive it with
 * `app.inject()` and `main.ts` can decide where to listen. Routes are
 * registered here; later tasks add their own (courses, degrees, …).
 */
export function buildServer(opts: ServerOptions = {}): FastifyInstance {
  const app = Fastify(opts);

  if (opts.catalogDataDir) {
    app.register(async () => {
      // Validate all YAML files during startup (fails fast on error)
      await loadYamlFiles(opts.catalogDataDir!, DegreeProgramSchema);
    });
  }

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
