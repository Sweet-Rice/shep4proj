import type { FastifyPluginAsync } from "fastify";

export const degreesRoutes: FastifyPluginAsync = async (app) => {
  app.get("/degrees", async (_request, _reply) => {
    return Array.from(app.degrees.values());
  });

  app.get<{ Params: { id: string } }>("/degrees/:id", async (request, reply) => {
    const degree = app.degrees.get(request.params.id);
    if (!degree) {
      return reply.status(404).send({
        statusCode: 404,
        error: "Not Found",
        message: `Degree program '${request.params.id}' not found`,
      });
    }
    return degree;
  });
};
