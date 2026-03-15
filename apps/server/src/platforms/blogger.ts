import * as cheerio from "cheerio";
import { normalizeUrl } from "../lib/utils";
import { buildPost, collectLinks, detectDate, fetchWithTimeout, numberFromText, selectHtml, selectText } from "./common";
import type { BlogPlatformAdapter } from "./types";

export const bloggerAdapter: BlogPlatformAdapter = {
  platform: "blogger",
  detect(url) {
    return url.hostname.includes("blogspot") || url.hostname.includes("blogger");
  },
  feedCandidates(url) {
    return [
      new URL("/feeds/posts/default?alt=rss", url).toString(),
      new URL("/feeds/posts/default", url).toString(),
      new URL("/feeds/posts/default?alt=atom", url).toString(),
      new URL("/atom.xml", url).toString(),
      new URL("/rss.xml", url).toString(),
    ];
  },
  sitemapCandidates(url) {
    return [new URL("/sitemap.xml", url).toString()];
  },
  isPostUrl(url) {
    return /\d{4}\/\d{2}\//.test(url.pathname);
  },
  discoverFromMainPage(url, html) {
    return collectLinks(html, url.toString()).filter((link) => this.isPostUrl(new URL(link)));
  },
  async fetchPost(url) {
    const page = await fetchWithTimeout(url);
    const $ = cheerio.load(page.html);
    const title = selectText($, ["h1.post-title", "h3.post-title", "title"]);
    const content = selectHtml($, [".post-body", "article .entry-content", ".post-outer"]);
    return buildPost(
      normalizeUrl(page.url),
      title,
      detectDate($, ["time[datetime]", "meta[property='article:published_time']", "h2.date-header"]),
      selectText($, [".post-labels a", ".labels a"]) || null,
      $(".post-labels a, .labels a")
        .map((_, el) => $(el).text().trim())
        .get()
        .filter(Boolean),
      content.html,
      content.text,
      page.html,
    );
  },
  async extractEngagement(_url, html) {
    const $ = cheerio.load(html);
    return {
      commentsCount: numberFromText(selectText($, [".comment-count", "a.comments-link"])),
      likesCount: null,
      sympathyCount: null,
      viewsCount: null,
      rawJson: {},
    };
  },
};
