import type { DiscoverySourceCounts, PlatformName } from "@blog-review/shared";

export interface FetchResult {
  url: string;
  html: string;
  status: number;
  headers: Record<string, string>;
}

export interface DiscoveredPost {
  url: string;
  source: DiscoverySource;
}

export type DiscoverySource = "rss" | "sitemap" | "main" | "wp-json";

export interface DiscoveryOverrides {
  rssUrl?: string | null;
  sitemapUrl?: string | null;
}

export interface DiscoverySettings {
  rssPriority?: boolean;
  sitemapPriority?: boolean;
}

export interface DiscoveryResult {
  posts: DiscoveredPost[];
  sourceCounts: DiscoverySourceCounts;
}

export interface NormalizedPost {
  url: string;
  title: string;
  publishedAt?: string | null;
  categoryName?: string | null;
  tags: string[];
  contentRaw: string;
  contentClean: string;
  pageHtml?: string;
}

export interface PostEngagement {
  commentsCount?: number | null;
  likesCount?: number | null;
  sympathyCount?: number | null;
  viewsCount?: number | null;
  rawJson?: Record<string, unknown>;
}

export interface BlogPlatformAdapter {
  platform: PlatformName;
  detect(url: URL): boolean;
  feedCandidates(url: URL): string[];
  sitemapCandidates(url: URL): string[];
  isPostUrl(url: URL): boolean;
  discoverFromMainPage(url: URL, html: string): string[];
  discoverPosts?(mainUrl: string, overrides?: DiscoveryOverrides, settings?: DiscoverySettings): Promise<DiscoveryResult>;
  fetchPost(url: string): Promise<NormalizedPost>;
  extractEngagement(url: string, html: string): Promise<PostEngagement>;
}
