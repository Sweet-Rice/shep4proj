import Fastify, {
  type FastifyError,
  type FastifyInstance,
  type FastifyServerOptions,
} from "fastify";
import type { Db } from "./db/client.js";
import { loadDegreePrograms } from "./degrees/load.js";
import { registerCourseRoutes } from "./routes/courses.js";
import { registerDegreeRoutes } from "./routes/degrees.js";
import { registerSectionRoutes } from "./routes/sections.js";
import { registerWatchRoutes } from "./routes/watches.js";
import { redactIds } from "./request-log.js";

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
    registerSectionRoutes(app, { db });
    registerWatchRoutes(app, { db });
  }

  // Fastify's defaults log and reply with the raw error message and the unmatched path. Those
  // quote query parameters and URLs, which carry a watch's bearer ID, so replace both.
  app.setErrorHandler((error: FastifyError, request, reply) => {
    const statusCode = error.statusCode ?? 500;
    if (statusCode < 500) return reply.send(error);
    request.log.error(
      {
        err: {
          type: error.name,
          message: redactIds(error.message),
          stack: error.stack && redactIds(error.stack),
        },
      },
      "request failed",
    );
    return reply.status(statusCode).send({ error: "Internal Server Error" });
  });
  app.setNotFoundHandler((request, reply) => {
    request.log.info("route not found");
    return reply.status(404).send({ error: "Not Found" });
  });

  return app;
}
