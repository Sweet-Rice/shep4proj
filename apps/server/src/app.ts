import Fastify, { type FastifyInstance, type FastifyServerOptions } from "fastify";
import type { Db } from "./db/client.js";
import { loadDegreePrograms } from "./degrees/load.js";
import { registerCourseRoutes } from "./routes/courses.js";
import { registerDegreeRoutes } from "./routes/degrees.js";
import { registerSectionRoutes } from "./routes/sections.js";

/** Body returned by `GET /health`. */
export interface HealthResponse {
  status: "ok";
  commit: string | null;
}

export interface ServerOptions extends FastifyServerOptions {
  db?: Db;
  degreeDataDir?: string;
}

/**
 * Builds the API server without starting it, so tests can drive it with
 * `app.inject()` and `main.ts` can decide where to listen. Routes are
 * registered here; later tasks add their own (courses, degrees, …).
 */
export function buildServer(opts: ServerOptions = {}): FastifyInstance {
  const { db, degreeDataDir, ...fastifyOpts } = opts;
  const app = Fastify(fastifyOpts);

  if (degreeDataDir) {
    void app.register(async (instance) => {
      const programs = await loadDegreePrograms(degreeDataDir);
      registerDegreeRoutes(instance, { programs });
    });
  }

  app.get(
    "/health",
    {
      schema: {
        response: {
          200: {
            type: "object",
            properties: {
              status: { type: "string", const: "ok" },
              commit: { type: ["string", "null"] },
            },
            required: ["status", "commit"],
            additionalProperties: false,
          },
        },
      },
    },
    async (): Promise<HealthResponse> => ({
      status: "ok",
      commit: process.env["RENDER_GIT_COMMIT"] ?? null,
    }),
  );

  if (db) {
    registerCourseRoutes(app, { db });
    registerSectionRoutes(app, { db });
  }

  return app;
}
