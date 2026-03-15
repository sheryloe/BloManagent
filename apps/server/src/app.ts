import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import { config } from "./config";
import { registerBlogRoutes } from "./routes/blogs";
import { registerDashboardRoutes } from "./routes/dashboard";
import { registerProviderRoutes } from "./routes/providers";
import { registerRunRoutes } from "./routes/runs";
import { registerSettingsRoutes } from "./routes/settings";
import { registerWorkspaceRoutes } from "./routes/workspace";

export const buildApp = async () => {
  const app = Fastify({
    logger: false,
  });

  await app.register(cors, {
    origin: true,
  });

  await registerDashboardRoutes(app);
  await registerBlogRoutes(app);
  await registerProviderRoutes(app);
  await registerRunRoutes(app);
  await registerSettingsRoutes(app);
  await registerWorkspaceRoutes(app);

  if (process.env.NODE_ENV === "production") {
    await app.register(fastifyStatic, {
      root: config.webDistDir,
      prefix: "/",
    });

    app.setNotFoundHandler(async (request, reply) => {
      if (request.url.startsWith("/api/")) {
        return reply.status(404).send({ message: `Route ${request.method}:${request.url} not found` });
      }
      return reply.sendFile("index.html");
    });
  }

  return app;
};
