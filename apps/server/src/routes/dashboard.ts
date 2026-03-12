import type { FastifyInstance } from "fastify";
import { getDashboard } from "../services/run-service";

export const registerDashboardRoutes = async (app: FastifyInstance) => {
  app.get("/api/dashboard", async () => getDashboard());
};
