import * as cheerio from "cheerio";
import { normalizeUrl } from "../lib/utils";
import { buildPost, collectLinks, detectDate, fetchWithTimeout, numberFromText, selectHtml, selectText } from "./common";
import type { BlogPlatformAdapter } from "./types";

const blockedTistoryPrefixes = [
  "/archive",
  "/category",
  "/guestbook",
  "/manage",
  "/media",
  "/notice",
  "/pages",
  "/search",
  "/tag",
  "/toolbar",
];

const looksLikeTistoryPost = ($: cheerio.CheerioAPI) =>
  selectText($, ["meta[property='og:type']"]) === "article" ||
  Boolean(selectText($, ["meta[property='article:published_time']"]));

export const tistoryAdapter: BlogPlatformAdapter = {
  platform: "tistory",
  detect(url) {
    return url.hostname.includes("tistory.com");
  },
  feedCandidates(url) {
    return [new URL("/rss", url).toString(), new URL("/rss.xml", url).toString()];
  },
  sitemapCandidates(url) {
    return [new URL("/sitemap.xml", url).toString()];
  },
  isPostUrl(url) {
    const pathname = url.pathname.replace(/\/+$/, "") || "/";
    if (pathname === "/") return false;
    if (blockedTistoryPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
      return false;
    }

    return /^\/\d+$/.test(pathname) || pathname.includes("/entry/");
  },
  discoverFromMainPage(url, html) {
    return collectLinks(html, url.toString()).filter((link) => {
      const nextUrl = new URL(link);
      return nextUrl.hostname === url.hostname && this.isPostUrl(nextUrl);
    });
  },
  async fetchPost(url) {
    const page = await fetchWithTimeout(url);
    const $ = cheerio.load(page.html);
    if (!looksLikeTistoryPost($)) {
      throw new Error("Not a Tistory post page.");
    }

    const title = selectText($, [".title-article", "h1", "title"]);
    const content = selectHtml($, [".tt_article_useless_p_margin", ".article-view", ".entry-content", "article"]);
    return buildPost(
      normalizeUrl(page.url),
      title,
      detectDate($, ["meta[property='article:published_time']", "time", ".date"]),
      selectText($, [".category", ".tit_category"]) || null,
      $(".tag_label a, .wrap_tag a")
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
      commentsCount: numberFromText(selectText($, [".txt_comment", ".comment-num", ".count"])),
      likesCount: numberFromText(selectText($, [".btn_like .txt_like", ".like_count"])),
      sympathyCount: null,
      viewsCount: numberFromText(selectText($, [".txt_view", ".view-count"])),
      rawJson: {},
    };
  },
};
