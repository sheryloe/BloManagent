import type { FastifyInstance } from "fastify";
import { settingsPayloadSchema } from "@blog-review/shared";
import { getSettingsPayload, saveSettings } from "../services/settings-service";

export const registerSettingsRoutes = async (app: FastifyInstance) => {
  app.get("/api/settings", async () => getSettingsPayload());
  app.put("/api/settings", async (request) => saveSettings(settingsPayloadSchema.parse(request.body)));
};
