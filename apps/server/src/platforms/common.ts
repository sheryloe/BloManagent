import * as cheerio from "cheerio";
import { XMLParser } from "fast-xml-parser";
import { chromium } from "playwright-core";
import { cleanText, normalizeUrl } from "../lib/utils";
import type {
  BlogPlatformAdapter,
  DiscoveryOverrides,
  DiscoveryResult,
  DiscoverySettings,
  DiscoverySource,
  FetchResult,
  NormalizedPost,
  PostEngagement,
} from "./types";

export const xmlParser = new XMLParser({
  ignoreAttributes: false,
});

const discoveryKeyBySource: Record<DiscoverySource, keyof DiscoveryResult["sourceCounts"]> = {
  rss: "rss",
  sitemap: "sitemap",
  main: "main",
  "wp-json": "wpJson",
};

export const createSourceCounts = (): DiscoveryResult["sourceCounts"] => ({
  rss: 0,
  sitemap: 0,
  main: 0,
  wpJson: 0,
});

export const fetchWithTimeout = async (
  url: string,
  timeoutMs = 15000,
  init: RequestInit = {},
): Promise<FetchResult> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        "User-Agent": "BlogReviewDashboard/0.1",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        ...(init.headers ?? {}),
      },
    });

    return {
      url: response.url,
      html: init.method === "HEAD" ? "" : await response.text(),
      status: response.status,
      headers: Object.fromEntries(
        Array.from(response.headers.entries()).map(([key, value]) => [key.toLowerCase(), value]),
      ),
    };
  } finally {
    clearTimeout(timer);
  }
};

export const collectLinks = (html: string, baseUrl: string) => {
  const $ = cheerio.load(html);
  return $("a[href]")
    .map((_, el) => $(el).attr("href"))
    .get()
    .filter(Boolean)
    .map((href) => {
      try {
        return normalizeUrl(new URL(href!, baseUrl).toString());
      } catch {
        return null;
      }
    })
    .filter((value): value is string => Boolean(value));
};

export const parseFeedLinks = (xml: string) => {
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

export const selectText = ($: cheerio.CheerioAPI, selectors: string[]) => {
  for (const selector of selectors) {
    const node = $(selector).first();
    const text = cleanText(node.attr("content") ?? node.text());
    if (text) return text;
  }
  return "";
};

export const selectHtml = ($: cheerio.CheerioAPI, selectors: string[]) => {
  for (const selector of selectors) {
    const node = $(selector).first();
    if (node.length) {
      const cloned = node.clone();
      cloned.find("script, style, noscript, template, iframe").remove();
      const html = cloned.html() ?? "";
      const text = cleanText(cloned.text());
      if (text) {
        return { html, text };
      }
    }
  }
  return { html: "", text: "" };
};

export const detectDate = ($: cheerio.CheerioAPI, selectors: string[]) => {
  for (const selector of selectors) {
    const node = $(selector).first();
    const value = node.attr("datetime") ?? node.attr("content") ?? node.text();
    const trimmed = cleanText(value ?? "");
    if (trimmed) return trimmed;
  }
  return null;
};

export const numberFromText = (value: string | undefined) => {
  if (!value) return null;
  const digits = value.replace(/[^\d]/g, "");
  return digits ? Number(digits) : null;
};

export const fetchWithPlaywright = async (url: string) => {
  const browser = await chromium.launch({
    channel: "msedge",
    headless: true,
  });
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });
    await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => undefined);
    return await page.content();
  } finally {
    await browser.close();
  }
};

export const buildPost = (
  url: string,
  title: string,
  publishedAt: string | null,
  categoryName: string | null,
  tags: string[],
  contentRaw: string,
  contentClean: string,
  pageHtml?: string,
): NormalizedPost => ({
  url,
  title,
  publishedAt,
  categoryName,
  tags,
  contentRaw,
  contentClean,
  pageHtml,
});

export const emptyEngagement = (): PostEngagement => ({
  commentsCount: null,
  likesCount: null,
  sympathyCount: null,
  viewsCount: null,
});

const addDiscoveredLinks = (
  found: Map<string, DiscoverySource>,
  sourceCounts: DiscoveryResult["sourceCounts"],
  links: string[],
  source: DiscoverySource,
  mainUrl: URL,
  adapter: Pick<BlogPlatformAdapter, "isPostUrl">,
) => {
  for (const link of links) {
    try {
      const normalized = normalizeUrl(link);
      if (found.has(normalized)) continue;

      const linkUrl = new URL(normalized);
      if (linkUrl.hostname !== mainUrl.hostname && !linkUrl.hostname.endsWith(mainUrl.hostname)) continue;
      if (!adapter.isPostUrl(linkUrl)) continue;

      found.set(normalized, source);
      sourceCounts[discoveryKeyBySource[source]] += 1;
    } catch {
      continue;
    }
  }
};

const buildDiscoveryOrder = (settings?: DiscoverySettings): DiscoverySource[] => {
  const ordered: DiscoverySource[] = [];

  if (settings?.rssPriority !== false) ordered.push("rss");
  if (settings?.sitemapPriority !== false) ordered.push("sitemap");
  ordered.push("main");
  if (settings?.rssPriority === false) ordered.push("rss");
  if (settings?.sitemapPriority === false) ordered.push("sitemap");

  return ordered;
};

export const buildDiscoveryResult = (
  found: Map<string, DiscoverySource>,
  sourceCounts: DiscoveryResult["sourceCounts"],
): DiscoveryResult => ({
  posts: Array.from(found.entries()).map(([url, source]) => ({ url, source })),
  sourceCounts,
});

export const runDefaultDiscovery = async (
  adapter: BlogPlatformAdapter,
  mainUrl: string,
  overrides?: DiscoveryOverrides,
  settings?: DiscoverySettings,
  options?: {
    loadMainPage?: (url: string) => Promise<Pick<FetchResult, "html" | "url">>;
    parseSitemap?: (xml: string) => string[];
  },
): Promise<DiscoveryResult> => {
  const mainPageUrl = new URL(mainUrl);
  const found = new Map<string, DiscoverySource>();
  const sourceCounts = createSourceCounts();
  const discoveryOrder = buildDiscoveryOrder(settings);

  for (const source of discoveryOrder) {
    if (source === "rss") {
      const feedCandidates = [overrides?.rssUrl, ...adapter.feedCandidates(mainPageUrl)].filter(Boolean) as string[];
      for (const candidate of feedCandidates) {
        try {
          const response = await fetchWithTimeout(candidate, 15000, {
            headers: {
              Accept: "application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.5",
            },
          });
          if (response.status < 400) {
            addDiscoveredLinks(found, sourceCounts, parseFeedLinks(response.html), "rss", mainPageUrl, adapter);
          }
        } catch {
          continue;
        }
      }
      continue;
    }

    if (source === "sitemap") {
      const sitemapCandidates = [overrides?.sitemapUrl, ...adapter.sitemapCandidates(mainPageUrl)].filter(Boolean) as string[];
      for (const candidate of sitemapCandidates) {
        try {
          const response = await fetchWithTimeout(candidate, 15000, {
            headers: {
              Accept: "application/xml, text/xml;q=0.9, */*;q=0.5",
            },
          });
          if (response.status < 400) {
            const sitemapLinks = options?.parseSitemap ? options.parseSitemap(response.html) : parseFeedLinks(response.html);
            addDiscoveredLinks(found, sourceCounts, sitemapLinks, "sitemap", mainPageUrl, adapter);
          }
        } catch {
          continue;
        }
      }
      continue;
    }

    try {
      const mainPage = options?.loadMainPage ? await options.loadMainPage(mainUrl) : await fetchWithTimeout(mainUrl);
      const baseUrl = new URL(mainPage.url || mainUrl);
      addDiscoveredLinks(found, sourceCounts, adapter.discoverFromMainPage(baseUrl, mainPage.html), "main", mainPageUrl, adapter);
    } catch {
      // no-op
    }
  }

  return buildDiscoveryResult(found, sourceCounts);
};
