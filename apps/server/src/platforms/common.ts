import * as cheerio from "cheerio";
import { XMLParser } from "fast-xml-parser";
import { chromium } from "playwright-core";
import { cleanText, normalizeUrl } from "../lib/utils";
import type { FetchResult, NormalizedPost, PostEngagement } from "./types";

export const xmlParser = new XMLParser({
  ignoreAttributes: false,
});

export const fetchWithTimeout = async (url: string, timeoutMs = 15000): Promise<FetchResult> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "BlogReviewDashboard/0.1",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });
    return {
      url: response.url,
      html: await response.text(),
      status: response.status,
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
      const html = node.html() ?? "";
      const text = cleanText(node.text());
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
): NormalizedPost => ({
  url,
  title,
  publishedAt,
  categoryName,
  tags,
  contentRaw,
  contentClean,
});

export const emptyEngagement = (): PostEngagement => ({
  commentsCount: null,
  likesCount: null,
  sympathyCount: null,
  viewsCount: null,
});
