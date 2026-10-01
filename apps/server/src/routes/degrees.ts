import { type DegreeProgram, type DegreeSummary } from "@jevschedule/shared";
import type { FastifyInstance } from "fastify";

interface DegreeParams {
  id: string;
}

export function registerDegreeRoutes(
  app: FastifyInstance,
  deps: { programs: readonly DegreeProgram[] },
): void {
  const { programs } = deps;

  const summaries: DegreeSummary[] = [...programs]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((program) => ({
      id: program.id,
      program: program.program,
      concentration: program.concentration,
      catalogYear: program.catalogYear,
      totalCredits: program.totalCredits,
    }));

  const byId = new Map<string, DegreeProgram>(programs.map((program) => [program.id, program]));

  app.get("/degrees", async (_request, reply) => {
    return reply.send({ degrees: summaries });
  });

  app.get<{ Params: DegreeParams }>("/degrees/:id", async (request, reply) => {
    const { id } = request.params;
    const program = byId.get(id);
    if (!program) {
      return reply.status(404).send({ error: "Degree not found" });
    }
    return reply.send(program);
  });
}
