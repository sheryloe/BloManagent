import type { FastifyInstance } from "fastify";
import { resetWorkspaceData } from "../services/blog-service";
import { analysisCoordinator } from "../services/run-service";

export const registerWorkspaceRoutes = async (app: FastifyInstance) => {
  app.post("/api/workspace/reset", async (_request, reply) => {
    if (analysisCoordinator.isBusy()) {
      return reply.status(409).send({ message: "Analysis is currently running. Wait for it to finish before reset." });
    }

    return resetWorkspaceData();
  });
};
