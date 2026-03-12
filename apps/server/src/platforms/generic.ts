import * as cheerio from "cheerio";
import { normalizeUrl } from "../lib/utils";
import { buildPost, collectLinks, detectDate, fetchWithTimeout, numberFromText, selectHtml, selectText } from "./common";
import type { BlogPlatformAdapter } from "./types";

export const genericAdapter: BlogPlatformAdapter = {
  platform: "generic",
  detect() {
    return true;
  },
  feedCandidates(url) {
    return [new URL("/rss", url).toString(), new URL("/feed", url).toString(), new URL("/atom.xml", url).toString()];
  },
  sitemapCandidates(url) {
    return [new URL("/sitemap.xml", url).toString()];
  },
  isPostUrl(url) {
    return /\/\d{4}\//.test(url.pathname) || /\/\d{2}\//.test(url.pathname) || url.pathname.split("/").length >= 3;
  },
  discoverFromMainPage(url, html) {
    return collectLinks(html, url.toString()).filter((link) => {
      const next = new URL(link);
      return next.hostname === url.hostname && this.isPostUrl(next);
    });
  },
  async fetchPost(url) {
    const page = await fetchWithTimeout(url);
    const $ = cheerio.load(page.html);
    const title = selectText($, ["meta[property='og:title']", "h1", "title"]);
    const content = selectHtml($, ["article .entry-content", "article .post-content", ".entry-content", ".post-content", "article", "main"]);
    return buildPost(
      normalizeUrl(page.url),
      title,
      detectDate($, ["meta[property='article:published_time']", "time", "meta[name='date']"]),
      selectText($, [".category", ".post-category"]) || null,
      $(".tag a, .tags a")
        .map((_, el) => $(el).text().trim())
        .get()
        .filter(Boolean),
      content.html,
      content.text,
    );
  },
  async extractEngagement(_url, html) {
    const $ = cheerio.load(html);
    return {
      commentsCount: numberFromText(selectText($, [".comment-count", ".comments-count"])),
      likesCount: numberFromText(selectText($, [".like-count", ".likes-count"])),
      sympathyCount: null,
      viewsCount: numberFromText(selectText($, [".view-count", ".views-count"])),
      rawJson: {},
    };
  },
};
