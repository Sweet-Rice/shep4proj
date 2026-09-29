import Fastify, { type FastifyInstance, type FastifyServerOptions } from "fastify";

import { DegreeProgramSchema, type DegreeProgram } from "@jevschedule/shared";
import { loadYamlFiles } from "./yaml-loader.js";
import { degreesRoutes } from "./routes/degrees.js";

/** Body returned by `GET /health`. */
export interface HealthResponse {
  status: "ok";
}

export interface ServerOptions extends FastifyServerOptions {
  catalogDataDir?: string;
  db?: unknown;
}

declare module "fastify" {
  interface FastifyInstance {
    degrees: Map<string, DegreeProgram>;
  }
}

/**
 * Builds the API server without starting it, so tests can drive it with
 * `app.inject()` and `main.ts` can decide where to listen. Routes are
 * registered here; later tasks add their own (courses, degrees, …).
 */
export function buildServer(opts: ServerOptions = {}): FastifyInstance {
  const app = Fastify(opts);

  app.decorate("degrees", new Map<string, DegreeProgram>());

  if (opts.catalogDataDir) {
    app.register(async (instance) => {
      // Validate all YAML files during startup (fails fast on error)
      const loaded = await loadYamlFiles(opts.catalogDataDir!, DegreeProgramSchema);
      for (const item of loaded) {
        instance.degrees.set(item.data.id, item.data);
      }
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

  app.register(degreesRoutes);

  return app;
}
