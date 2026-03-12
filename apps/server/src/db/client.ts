import fs from "node:fs";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { config } from "../config";
import { createId, nowIso } from "../lib/utils";
import * as schema from "./schema";

const createStatements = [
  `CREATE TABLE IF NOT EXISTS blogs (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    main_url TEXT NOT NULL,
    platform TEXT NOT NULL,
    rss_url TEXT,
    sitemap_url TEXT,
    description TEXT,
    is_active INTEGER DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS blog_categories (
    id TEXT PRIMARY KEY,
    blog_id TEXT NOT NULL,
    name TEXT NOT NULL,
    slug TEXT,
    mapped_topic_group TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS posts (
    id TEXT PRIMARY KEY,
    blog_id TEXT NOT NULL,
    url TEXT NOT NULL UNIQUE,
    title TEXT,
    published_at TEXT,
    category_name TEXT,
    tags_json TEXT,
    content_raw TEXT,
    content_clean TEXT,
    content_hash TEXT,
    discovered_at TEXT NOT NULL,
    last_crawled_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS post_engagement_snapshots (
    id TEXT PRIMARY KEY,
    post_id TEXT NOT NULL,
    comments_count INTEGER,
    likes_count INTEGER,
    sympathy_count INTEGER,
    views_count INTEGER,
    captured_at TEXT NOT NULL,
    raw_json TEXT
  );`,
  `CREATE TABLE IF NOT EXISTS analysis_runs (
    id TEXT PRIMARY KEY,
    run_scope TEXT NOT NULL,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    analysis_mode TEXT NOT NULL,
    started_at TEXT NOT NULL,
    ended_at TEXT,
    status TEXT NOT NULL,
    blog_count INTEGER DEFAULT 0,
    post_count INTEGER DEFAULT 0,
    estimated_input_tokens INTEGER DEFAULT 0,
    estimated_output_tokens INTEGER DEFAULT 0,
    estimated_cost REAL DEFAULT 0,
    actual_cost REAL DEFAULT 0,
    error_message TEXT
  );`,
  `CREATE TABLE IF NOT EXISTS analysis_run_targets (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    blog_id TEXT NOT NULL,
    created_at TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS run_events (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    level TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS post_analyses (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    post_id TEXT NOT NULL,
    summary TEXT,
    target_audience_guess TEXT,
    intent_guess TEXT,
    topic_labels_json TEXT,
    strengths_json TEXT,
    weaknesses_json TEXT,
    improvements_json TEXT,
    seo_notes_json TEXT,
    title_strength INTEGER,
    hook_strength INTEGER,
    structure_score INTEGER,
    information_density_score INTEGER,
    practicality_score INTEGER,
    differentiation_score INTEGER,
    seo_potential_score INTEGER,
    audience_fit_score INTEGER,
    engagement_adjustment_note TEXT,
    created_at TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS weekly_reports (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    week_start TEXT NOT NULL,
    week_end TEXT NOT NULL,
    overall_summary TEXT,
    topic_overlap_json TEXT,
    topic_gaps_json TEXT,
    blog_comparisons_json TEXT,
    priority_actions_json TEXT,
    next_week_topics_json TEXT,
    markdown_report TEXT,
    created_at TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS blog_weekly_scores (
    id TEXT PRIMARY KEY,
    weekly_report_id TEXT NOT NULL,
    blog_id TEXT NOT NULL,
    post_count INTEGER DEFAULT 0,
    avg_title_strength REAL DEFAULT 0,
    avg_hook_strength REAL DEFAULT 0,
    avg_structure_score REAL DEFAULT 0,
    avg_information_density_score REAL DEFAULT 0,
    avg_practicality_score REAL DEFAULT 0,
    avg_differentiation_score REAL DEFAULT 0,
    avg_seo_potential_score REAL DEFAULT 0,
    avg_audience_fit_score REAL DEFAULT 0,
    topic_diversity_score REAL DEFAULT 0,
    publishing_consistency_score REAL DEFAULT 0,
    freshness_score REAL DEFAULT 0,
    engagement_score REAL DEFAULT 0,
    ebi_score REAL DEFAULT 0,
    ebi_status TEXT,
    ebi_reason_json TEXT,
    created_at TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS topic_summaries (
    id TEXT PRIMARY KEY,
    weekly_report_id TEXT NOT NULL,
    topic_name TEXT NOT NULL,
    post_count INTEGER DEFAULT 0,
    avg_score REAL DEFAULT 0,
    overlap_score REAL DEFAULT 0,
    gap_score REAL DEFAULT 0,
    recommendation_priority REAL DEFAULT 0,
    notes TEXT,
    created_at TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS recommendations (
    id TEXT PRIMARY KEY,
    weekly_report_id TEXT NOT NULL,
    blog_id TEXT,
    recommendation_type TEXT NOT NULL,
    priority INTEGER DEFAULT 0,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    action_items_json TEXT,
    created_at TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS provider_settings (
    id TEXT PRIMARY KEY,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    is_default INTEGER DEFAULT 0,
    analysis_mode TEXT DEFAULT 'balanced',
    max_posts_per_run INTEGER DEFAULT 10,
    max_chars_per_post INTEGER DEFAULT 3000,
    max_output_tokens INTEGER DEFAULT 1200,
    timeout_ms INTEGER DEFAULT 30000,
    retry_count INTEGER DEFAULT 2,
    fallback_provider TEXT,
    ollama_base_url TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS cost_logs (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    estimated_input_tokens INTEGER DEFAULT 0,
    estimated_output_tokens INTEGER DEFAULT 0,
    estimated_cost REAL DEFAULT 0,
    actual_cost REAL DEFAULT 0,
    created_at TEXT NOT NULL
  );`,
];

const seedProviderSettings = [
  {
    provider: "google",
    model: "gemini-2.5-flash",
    isDefault: 1,
    fallbackProvider: "ollama",
  },
  {
    provider: "google",
    model: "gemini-2.5-flash-lite",
    isDefault: 0,
    fallbackProvider: "ollama",
  },
  {
    provider: "openai",
    model: "gpt-5 mini",
    isDefault: 0,
    fallbackProvider: "google",
  },
  {
    provider: "openai",
    model: "gpt-5",
    isDefault: 0,
    fallbackProvider: "google",
  },
  {
    provider: "ollama",
    model: "qwen3:8b",
    isDefault: 0,
    fallbackProvider: "google",
  },
];

const seedAppSettings = {
  discoveryDepth: 2,
  rssPriority: true,
  sitemapPriority: true,
  recrawlPolicy: "changedOnly",
  collectEngagementSnapshots: true,
  analysisRangeDefault: "latest30",
  monthlyBudgetLimit: 30,
  maxEstimatedCostPerRun: 3,
  fallbackOnOverBudget: true,
};

fs.mkdirSync(config.dataDir, { recursive: true });
export const sqlite = new Database(config.dbPath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

for (const statement of createStatements) {
  sqlite.exec(statement);
}

export const db = drizzle(sqlite, { schema });

const seedDefaults = () => {
  const providerCount = sqlite.prepare("SELECT COUNT(*) as count FROM provider_settings").get() as { count: number };
  if (providerCount.count === 0) {
    const now = nowIso();
    const insert = sqlite.prepare(
      `INSERT INTO provider_settings (
        id, provider, model, is_default, analysis_mode, max_posts_per_run, max_chars_per_post, max_output_tokens,
        timeout_ms, retry_count, fallback_provider, ollama_base_url, created_at, updated_at
      ) VALUES (
        @id, @provider, @model, @isDefault, 'balanced', 10, 3000, 1200, 30000, 2, @fallbackProvider, 'http://127.0.0.1:11434', @createdAt, @updatedAt
      )`,
    );

    for (const row of seedProviderSettings) {
      insert.run({
        id: createId("pset"),
        provider: row.provider,
        model: row.model,
        isDefault: row.isDefault,
        fallbackProvider: row.fallbackProvider,
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  const existingKeys = sqlite
    .prepare("SELECT key FROM app_settings")
    .all()
    .map((row) => (row as { key: string }).key);

  const insertAppSetting = sqlite.prepare(
    "INSERT INTO app_settings (key, value, updated_at) VALUES (@key, @value, @updatedAt)",
  );

  const updatedAt = nowIso();
  for (const [key, value] of Object.entries(seedAppSettings)) {
    if (!existingKeys.includes(key)) {
      insertAppSetting.run({
        key,
        value: JSON.stringify(value),
        updatedAt,
      });
    }
  }
};

seedDefaults();
