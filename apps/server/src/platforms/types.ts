import type { PlatformName } from "@blog-review/shared";

export interface FetchResult {
  url: string;
  html: string;
  status: number;
}

export interface DiscoveredPost {
  url: string;
  source: string;
}

export interface NormalizedPost {
  url: string;
  title: string;
  publishedAt?: string | null;
  categoryName?: string | null;
  tags: string[];
  contentRaw: string;
  contentClean: string;
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
  fetchPost(url: string): Promise<NormalizedPost>;
  extractEngagement(url: string, html: string): Promise<PostEngagement>;
}
