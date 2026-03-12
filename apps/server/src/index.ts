import { config } from "./config";
import "./db/client";
import { buildApp } from "./app";

const start = async () => {
  const app = await buildApp();
  await app.listen({
    port: config.appPort,
    host: "0.0.0.0",
  });
};

start().catch((error) => {
  console.error(error);
  process.exit(1);
});
