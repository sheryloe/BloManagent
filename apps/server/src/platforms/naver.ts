import * as cheerio from "cheerio";
import { cleanText, normalizeUrl } from "../lib/utils";
import {
  buildPost,
  detectDate,
  emptyEngagement,
  fetchWithPlaywright,
  fetchWithTimeout,
  numberFromText,
  runDefaultDiscovery,
  selectHtml,
  selectText,
} from "./common";
import type { BlogPlatformAdapter, FetchResult } from "./types";

const extractNaverBlogId = (url: URL) => {
  const blogId = url.searchParams.get("blogId");
  if (blogId) return blogId;

  const parts = url.pathname.split("/").filter(Boolean);
  if (!parts.length) return null;

  if (parts[0] === "NBlogTop.naver") {
    return null;
  }

  return parts[0];
};

const buildNaverRssUrl = (blogId: string) => `https://rss.blog.naver.com/${blogId}.xml`;

const fetchNaverPage = async (url: string): Promise<FetchResult> => {
  const page = await fetchWithTimeout(url);
  if (page.html.includes("mainFrame") || page.html.includes("iframe")) {
    try {
      return {
        ...page,
        html: await fetchWithPlaywright(page.url || url),
      };
    } catch {
      return page;
    }
  }

  return page;
};

export const resolveNaverBlogId = async (mainUrl: string) => {
  const directUrl = new URL(mainUrl);
  const direct = extractNaverBlogId(directUrl);
  if (directUrl.searchParams.get("blogId")) {
    return direct;
  }

  try {
    const page = await fetchWithTimeout(mainUrl);
    const redirected = extractNaverBlogId(new URL(page.url));
    if (redirected) return redirected;

    const match = page.html.match(/blogId=([A-Za-z0-9._-]+)/i);
    if (match?.[1]) return match[1];
  } catch {
    return direct;
  }

  return direct;
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
    const $ = cheerio.load(html);
    return $("a[href]")
      .map((_, el) => $(el).attr("href"))
      .get()
      .filter(Boolean)
      .map((href) => {
        try {
          return normalizeUrl(new URL(href!, url).toString());
        } catch {
          return null;
        }
      })
      .filter((link): link is string => Boolean(link))
      .filter((link) => {
        const next = new URL(link);
        return next.hostname.includes("naver.com") && this.isPostUrl(next);
      });
  },
  async discoverPosts(mainUrl, overrides, settings) {
    const blogId = await resolveNaverBlogId(mainUrl);
    const rssUrl = overrides?.rssUrl ?? (blogId ? buildNaverRssUrl(blogId) : null);

    return runDefaultDiscovery(
      this,
      mainUrl,
      {
        ...overrides,
        rssUrl,
      },
      settings,
      {
        loadMainPage: fetchNaverPage,
      },
    );
  },
  async fetchPost(url) {
    const page = await fetchNaverPage(url);
    const $ = cheerio.load(page.html);
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
      page.html,
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
