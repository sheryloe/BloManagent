import type { FastifyInstance } from "fastify";
import type { ProviderName } from "@blog-review/shared";
import { getProvider } from "../providers";
import { getProviderSettingRow } from "../services/settings-service";

export const registerProviderRoutes = async (app: FastifyInstance) => {
  app.get("/api/providers/:provider/models", async (request, reply) => {
    const providerName = (request.params as { provider: ProviderName }).provider;
    const settings = await getProviderSettingRow(providerName);
    if (!settings) {
      return reply.status(404).send({ message: "Provider not found." });
    }
    const provider = getProvider(providerName);
    return {
      provider: providerName,
      models: await provider.listModels(settings),
    };
  });
};
