import Fastify, { type FastifyInstance, type FastifyServerOptions } from "fastify";
import type { Db } from "./db/client.js";
import { loadDegreePrograms } from "./degrees/load.js";
import { registerCourseRoutes } from "./routes/courses.js";

/** Body returned by `GET /health`. */
export interface HealthResponse {
  status: "ok";
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
    void app.register(async () => {
      await loadDegreePrograms(degreeDataDir);
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

  if (db) {
    registerCourseRoutes(app, { db });
  }

  return app;
}
