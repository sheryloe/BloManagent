import type { FastifyInstance } from "fastify";
import { getReports } from "../services/blog-service";
import { getRunDetails, listRuns } from "../services/run-service";

export const registerRunRoutes = async (app: FastifyInstance) => {
  app.get("/api/runs", async () => listRuns());
  app.get("/api/runs/:id", async (request, reply) => {
    const run = await getRunDetails((request.params as { id: string }).id);
    if (!run) {
      return reply.status(404).send({ message: "Run not found." });
    }
    return run;
  });
  app.get("/api/reports", async () => getReports());
};
