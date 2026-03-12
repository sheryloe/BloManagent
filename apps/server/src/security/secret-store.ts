import { config } from "../config";

type SecretKey = "googleApiKey" | "openaiApiKey" | "ollamaBaseUrl";

const serviceName = "blog-review-dashboard";
let keytarPromise: Promise<typeof import("keytar") | null> | null = null;

const loadKeytar = async () => {
  if (!keytarPromise) {
    keytarPromise = import("keytar").catch(() => null);
  }
  return keytarPromise;
};

const envFallbackMap: Record<SecretKey, string> = {
  googleApiKey: config.envGoogleApiKey,
  openaiApiKey: config.envOpenAiApiKey,
  ollamaBaseUrl: config.envOllamaBaseUrl,
};

export const secretStore = {
  async set(key: SecretKey, value: string) {
    const keytar = await loadKeytar();
    if (!value) return;
    if (keytar) {
      await keytar.setPassword(serviceName, key, value);
    }
  },
  async get(key: SecretKey) {
    const keytar = await loadKeytar();
    if (keytar) {
      const value = await keytar.getPassword(serviceName, key);
      if (value) return value;
    }
    return envFallbackMap[key];
  },
  async has(key: SecretKey) {
    const value = await this.get(key);
    return Boolean(value);
  },
  async status() {
    const keytar = await loadKeytar();
    return {
      mode: keytar ? "os-keychain" : "env-fallback",
      googleApiKey: await this.has("googleApiKey"),
      openaiApiKey: await this.has("openaiApiKey"),
      ollamaBaseUrl: await this.has("ollamaBaseUrl"),
    };
  },
};
