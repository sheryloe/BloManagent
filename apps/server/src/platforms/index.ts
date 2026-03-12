import type { PlatformName } from "@blog-review/shared";
import { normalizeUrl } from "../lib/utils";
import { bloggerAdapter } from "./blogger";
import { fetchWithTimeout, xmlParser } from "./common";
import { genericAdapter } from "./generic";
import { naverAdapter } from "./naver";
import { tistoryAdapter } from "./tistory";
import type { BlogPlatformAdapter, DiscoveredPost } from "./types";

const adapters = [bloggerAdapter, tistoryAdapter, naverAdapter, genericAdapter];

export const detectPlatform = (mainUrl: string, override?: PlatformName): BlogPlatformAdapter => {
  if (override) {
    return adapters.find((adapter) => adapter.platform === override) ?? genericAdapter;
  }
  const url = new URL(mainUrl);
  return adapters.find((adapter) => adapter.detect(url)) ?? genericAdapter;
};

export const getAdapter = (platform: PlatformName) =>
  adapters.find((adapter) => adapter.platform === platform) ?? genericAdapter;

const parseFeedLinks = (xml: string) => {
  try {
    const parsed = xmlParser.parse(xml) as Record<string, unknown>;
    const links: string[] = [];
    const walk = (value: unknown, keyHint?: string) => {
      if (!value) return;
      if (typeof value === "string") {
        if ((keyHint === "link" || keyHint === "loc" || keyHint === "@_href") && value.startsWith("http")) {
          links.push(value);
        }
        return;
      }
      if (Array.isArray(value)) {
        value.forEach((item) => walk(item, keyHint));
        return;
      }
      if (typeof value === "object") {
        for (const [key, next] of Object.entries(value as Record<string, unknown>)) {
          walk(next, key);
        }
      }
    };

    walk(parsed);
    return links;
  } catch {
    return [];
  }
};

export const discoverPosts = async (
  mainUrl: string,
  platform: PlatformName,
  overrides?: { rssUrl?: string | null; sitemapUrl?: string | null },
) => {
  const adapter = getAdapter(platform);
  const url = new URL(mainUrl);
  const found = new Map<string, string>();

  const addLinks = (links: string[], source: string) => {
    for (const link of links) {
      try {
        const normalized = normalizeUrl(link);
        const linkUrl = new URL(normalized);
        if (linkUrl.hostname !== url.hostname && !linkUrl.hostname.endsWith(url.hostname)) continue;
        if (adapter.isPostUrl(linkUrl)) {
          found.set(normalized, source);
        }
      } catch {
        continue;
      }
    }
  };

  const feedCandidates = [overrides?.rssUrl, ...adapter.feedCandidates(url)].filter(Boolean) as string[];
  for (const candidate of feedCandidates) {
    try {
      const response = await fetchWithTimeout(candidate);
      if (response.status < 400) {
        addLinks(parseFeedLinks(response.html), "feed");
      }
    } catch {
      continue;
    }
  }

  const sitemapCandidates = [overrides?.sitemapUrl, ...adapter.sitemapCandidates(url)].filter(Boolean) as string[];
  for (const candidate of sitemapCandidates) {
    try {
      const response = await fetchWithTimeout(candidate);
      if (response.status < 400) {
        addLinks(parseFeedLinks(response.html), "sitemap");
      }
    } catch {
      continue;
    }
  }

  try {
    const mainPage = await fetchWithTimeout(mainUrl);
    addLinks(adapter.discoverFromMainPage(url, mainPage.html), "main");
  } catch {
    // no-op
  }

  const discoveredPosts: DiscoveredPost[] = Array.from(found.entries()).map(([postUrl, source]) => ({
    url: postUrl,
    source,
  }));

  return discoveredPosts;
};
