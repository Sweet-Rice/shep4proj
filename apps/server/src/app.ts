import Fastify, { type FastifyInstance, type FastifyServerOptions } from "fastify";

import { CourseSchema, DegreeSchema } from "@jevschedule/shared";
import { loadYamlFiles } from "./yaml-loader.js";

/** Body returned by `GET /health`. */
export interface HealthResponse {
  status: "ok";
}

export interface ServerOptions extends FastifyServerOptions {
  catalogDataDir?: string;
  degreesDataDir?: string;
}

declare module "fastify" {
  interface FastifyInstance {
    degrees: Map<string, import("@jevschedule/shared").Degree>;
  }
}

/**
 * Builds the API server without starting it, so tests can drive it with
 * `app.inject()` and `main.ts` can decide where to listen. Routes are
 * registered here; later tasks add their own (courses, degrees, …).
 */
export function buildServer(opts: ServerOptions = {}): FastifyInstance {
  const app = Fastify(opts);

  // Decorate so we can inject during tests even without directories
  app.decorate("degrees", new Map<string, import("@jevschedule/shared").Degree>());

  if (opts.catalogDataDir) {
    app.register(async (_instance) => {
      // Validate all YAML files during startup (fails fast on error)
      await loadYamlFiles(opts.catalogDataDir!, CourseSchema);
    });
  }

  if (opts.degreesDataDir) {
    app.register(async (instance) => {
      const loaded = await loadYamlFiles(opts.degreesDataDir!, DegreeSchema);
      for (const item of loaded) {
        instance.degrees.set(item.data.id, item.data);
      }
    });
  }

  app.get("/degrees", async () => {
    return Array.from(app.degrees.values());
  });

  app.get<{ Params: { id: string } }>("/degrees/:id", async (request, reply) => {
    const degree = app.degrees.get(request.params.id);
    if (!degree) {
      return reply.status(404).send({ error: "Not Found" });
    }
    return degree;
  });

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
