import { eq } from "drizzle-orm";
import type {
  AnalysisEngine,
  AppSettings,
  ProviderSettings,
  SettingsPayload,
} from "@blog-review/shared";
import { appSettingsSchema, providerSettingsSchema, settingsPayloadSchema } from "@blog-review/shared";
import { db, sqlite } from "../db/client";
import { appSettings, providerSettings } from "../db/schema";
import { nowIso, safeJsonParse, toBoolean } from "../lib/utils";
import { secretStore } from "../security/secret-store";
import type { ProviderSettingsRow } from "../providers/types";

const defaultAppSettings = (): AppSettings => ({
  discoveryDepth: 2,
  rssPriority: true,
  sitemapPriority: true,
  recrawlPolicy: "changedOnly",
  collectEngagementSnapshots: true,
  allowNaverPublicCrawl: false,
  analysisRangeDefault: "latest30",
  monthlyBudgetLimit: 30,
  maxEstimatedCostPerRun: 3,
  fallbackOnOverBudget: true,
});

const uniqueProviderRows = (rows: Array<typeof providerSettings.$inferSelect>) => {
  const seen = new Set<string>();
  return [...rows]
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .filter((row) => {
      if (seen.has(row.provider)) return false;
      seen.add(row.provider);
      return true;
    });
};

const mapProviderRow = async (row: typeof providerSettings.$inferSelect): Promise<ProviderSettings> =>
  providerSettingsSchema.parse({
    engine: row.provider,
    model: row.model,
    isDefault: row.provider === "algorithm" ? true : toBoolean(row.isDefault),
    analysisMode: row.analysisMode,
    maxPostsPerRun: row.maxPostsPerRun,
    maxCharsPerPost: row.maxCharsPerPost,
    maxOutputTokens: row.maxOutputTokens,
    timeoutMs: row.timeoutMs,
    retryCount: row.retryCount,
    fallbackEngine: row.fallbackProvider,
    ollamaBaseUrl: row.ollamaBaseUrl,
    hasCredential:
      row.provider === "algorithm"
        ? true
        : row.provider === "google"
        ? await secretStore.has("googleApiKey")
        : row.provider === "openai"
          ? await secretStore.has("openaiApiKey")
          : await secretStore.has("ollamaBaseUrl"),
  });

export const getProviderSettings = async () => {
  const rows = uniqueProviderRows(await db.select().from(providerSettings));
  return Promise.all(rows.map(mapProviderRow));
};

export const getAppSettings = async (): Promise<AppSettings> => {
  const rows = await db.select().from(appSettings);
  const result = defaultAppSettings();
  for (const row of rows) {
    (result as Record<string, unknown>)[row.key] = safeJsonParse(row.value, row.value);
  }
  return appSettingsSchema.parse(result);
};

export const getSettingsPayload = async () => ({
  providers: await getProviderSettings(),
  app: await getAppSettings(),
  secretStatus: await secretStore.status(),
});

export const saveSettings = async (payload: SettingsPayload) => {
  const parsed = settingsPayloadSchema.parse(payload);
  const now = nowIso();

  for (const provider of parsed.providers) {
    const existing = await db.select().from(providerSettings).where(eq(providerSettings.provider, provider.engine));
    if (existing.length) {
      await db
        .update(providerSettings)
        .set({
          model: provider.model,
          isDefault: provider.engine === "algorithm" ? 1 : provider.isDefault ? 1 : 0,
          analysisMode: provider.analysisMode,
          maxPostsPerRun: provider.maxPostsPerRun,
          maxCharsPerPost: provider.maxCharsPerPost,
          maxOutputTokens: provider.maxOutputTokens,
          timeoutMs: provider.timeoutMs,
          retryCount: provider.retryCount,
          fallbackProvider: provider.fallbackEngine ?? null,
          ollamaBaseUrl: provider.ollamaBaseUrl ?? null,
          updatedAt: now,
        })
        .where(eq(providerSettings.provider, provider.engine));
    } else {
      await db.insert(providerSettings).values({
        id: `pset-${provider.engine}`,
        provider: provider.engine,
        model: provider.model,
        isDefault: provider.engine === "algorithm" ? 1 : provider.isDefault ? 1 : 0,
        analysisMode: provider.analysisMode,
        maxPostsPerRun: provider.maxPostsPerRun,
        maxCharsPerPost: provider.maxCharsPerPost,
        maxOutputTokens: provider.maxOutputTokens,
        timeoutMs: provider.timeoutMs,
        retryCount: provider.retryCount,
        fallbackProvider: provider.fallbackEngine ?? null,
        ollamaBaseUrl: provider.ollamaBaseUrl ?? null,
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  for (const [key, value] of Object.entries(parsed.app)) {
    sqlite
      .prepare(
        `INSERT INTO app_settings (key, value, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      )
      .run(key, JSON.stringify(value), now);
  }

  if (parsed.secrets?.googleApiKey) await secretStore.set("googleApiKey", parsed.secrets.googleApiKey);
  if (parsed.secrets?.openaiApiKey) await secretStore.set("openaiApiKey", parsed.secrets.openaiApiKey);
  if (parsed.secrets?.ollamaBaseUrl) await secretStore.set("ollamaBaseUrl", parsed.secrets.ollamaBaseUrl);

  return getSettingsPayload();
};

export const resolveProviderSetting = async (requestedProvider?: AnalysisEngine) => {
  const rows = uniqueProviderRows(await db.select().from(providerSettings));
  const row =
    rows.find((item) => item.provider === requestedProvider) ??
    rows.find((item) => item.provider === "algorithm") ??
    rows.find((item) => item.isDefault === 1) ??
    rows[0];

  if (!row) {
    throw new Error("Provider settings are not configured.");
  }

  return {
    provider: row.provider as AnalysisEngine,
    model: row.model,
    analysisMode: row.analysisMode as ProviderSettingsRow["analysisMode"],
    maxPostsPerRun: row.maxPostsPerRun,
    maxCharsPerPost: row.maxCharsPerPost,
    maxOutputTokens: row.maxOutputTokens,
    timeoutMs: row.timeoutMs,
    retryCount: row.retryCount,
    fallbackProvider: row.fallbackProvider as AnalysisEngine | null,
    ollamaBaseUrl: row.ollamaBaseUrl,
  } satisfies ProviderSettingsRow;
};

export const getProviderSettingRow = async (provider: AnalysisEngine) => {
  const row = await db.select().from(providerSettings).where(eq(providerSettings.provider, provider)).get();
  if (!row) return null;
  return {
    provider: row.provider as AnalysisEngine,
    model: row.model,
    analysisMode: row.analysisMode as ProviderSettingsRow["analysisMode"],
    maxPostsPerRun: row.maxPostsPerRun,
    maxCharsPerPost: row.maxCharsPerPost,
    maxOutputTokens: row.maxOutputTokens,
    timeoutMs: row.timeoutMs,
    retryCount: row.retryCount,
    fallbackProvider: row.fallbackProvider as AnalysisEngine | null,
    ollamaBaseUrl: row.ollamaBaseUrl,
  } satisfies ProviderSettingsRow;
};
