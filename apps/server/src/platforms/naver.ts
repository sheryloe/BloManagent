import * as cheerio from "cheerio";
import { cleanText, normalizeUrl } from "../lib/utils";
import {
  buildPost,
  collectLinks,
  detectDate,
  emptyEngagement,
  fetchWithPlaywright,
  fetchWithTimeout,
  numberFromText,
  selectHtml,
  selectText,
} from "./common";
import type { BlogPlatformAdapter } from "./types";

const fetchNaverHtml = async (url: string) => {
  const page = await fetchWithTimeout(url);
  if (page.html.includes("mainFrame") || page.html.includes("iframe")) {
    try {
      return await fetchWithPlaywright(url);
    } catch {
      return page.html;
    }
  }
  return page.html;
};

export const naverAdapter: BlogPlatformAdapter = {
  platform: "naver",
  detect(url) {
    return url.hostname.includes("blog.naver.com") || url.hostname.includes("m.blog.naver.com");
  },
  feedCandidates() {
    return [];
  },
  sitemapCandidates() {
    return [];
  },
  isPostUrl(url) {
    return url.pathname.includes("PostView") || /^\/[^/]+\/\d+/.test(url.pathname);
  },
  discoverFromMainPage(url, html) {
    return collectLinks(html, url.toString()).filter((link) => {
      const next = new URL(link);
      return next.hostname.includes("naver.com") && this.isPostUrl(next);
    });
  },
  async fetchPost(url) {
    const html = await fetchNaverHtml(url);
    const $ = cheerio.load(html);
    const title = selectText($, [".se-title-text", ".pcol1 .htitle", "title"]);
    const content = selectHtml($, [".se-main-container", "#postViewArea", ".post-view", ".contents_style"]);
    const tags = cleanText(selectText($, [".tag_area", ".post_tag"])).split(/\s+/).filter(Boolean);
    return buildPost(
      normalizeUrl(url),
      title,
      detectDate($, ["meta[property='article:published_time']", "time", ".se_publishDate"]),
      selectText($, [".blog2_series", ".category"]) || null,
      tags,
      content.html,
      content.text,
    );
  },
  async extractEngagement(_url, html) {
    const $ = cheerio.load(html);
    const sympathy = numberFromText(selectText($, [".u_likeit_list_count", ".u_likeit_list_count._count"]));
    const comments = numberFromText(selectText($, [".commentcount", ".u_cbox_count"]));
    const views = numberFromText(selectText($, [".blog_view .num", ".cnt", ".visitor"]));
    if (!sympathy && !comments && !views) {
      return emptyEngagement();
    }
    return {
      commentsCount: comments,
      likesCount: null,
      sympathyCount: sympathy,
      viewsCount: views,
      rawJson: {},
    };
  },
};
