import path from "node:path";
import dotenv from "dotenv";

dotenv.config();

const rootDir = path.resolve(process.cwd(), "..", "..");
const dataDir = path.resolve(process.env.DATA_DIR ?? path.join(rootDir, "data"));

export const config = {
  appPort: Number(process.env.APP_PORT ?? 8787),
  webPort: Number(process.env.WEB_PORT ?? 5173),
  dataDir,
  dbPath: path.join(dataDir, "blog-review.db"),
  webDistDir: path.resolve(rootDir, "apps", "web", "dist"),
  envGoogleApiKey: process.env.GOOGLE_API_KEY ?? "",
  envOpenAiApiKey: process.env.OPENAI_API_KEY ?? "",
  envOllamaBaseUrl: process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434",
};
