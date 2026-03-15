import * as cheerio from "cheerio";
import { cleanText, normalizeUrl } from "../lib/utils";
import {
  buildDiscoveryResult,
  buildPost,
  createSourceCounts,
  detectDate,
  emptyEngagement,
  fetchWithTimeout,
  numberFromText,
  runDefaultDiscovery,
  selectHtml,
  selectText,
} from "./common";
import type { BlogPlatformAdapter, DiscoveryResult, DiscoverySource, NormalizedPost } from "./types";

interface WordPressRenderedField {
  rendered?: string;
}

interface WordPressApiPost {
  link?: string;
  date?: string;
  slug?: string;
  title?: WordPressRenderedField;
  content?: WordPressRenderedField;
}

const preloadedPosts = new Map<string, NormalizedPost>();

const ensureTrailingSlash = (value: string) => (value.endsWith("/") ? value : `${value}/`);

const extractApiRootFromLinkHeader = (value?: string | null) => {
  if (!value) return null;
  const match = value.match(/<([^>]+)>;\s*rel="https:\/\/api\.w\.org\/"/i);
  return match?.[1] ?? null;
};

const buildWordPressApiUrl = (apiRoot: string, restPath: string, params?: Record<string, string>) => {
  const url = new URL(apiRoot);

  if (url.searchParams.has("rest_route")) {
    url.searchParams.set("rest_route", `/${restPath}`);
  } else {
    const base = ensureTrailingSlash(apiRoot);
    return new URL(
      `${restPath}${params ? `?${new URLSearchParams(params).toString()}` : ""}`,
      base,
    ).toString();
  }

  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.set(key, value);
    });
  }

  return url.toString();
};

const validateWordPressApiRoot = async (apiRoot: string) => {
  const response = await fetchWithTimeout(apiRoot, 15000, {
    headers: {
      Accept: "application/json",
    },
  });
  if (response.status >= 400) return false;

  try {
    const payload = JSON.parse(response.html) as { namespaces?: string[] };
    return Boolean(payload.namespaces?.includes("wp/v2"));
  } catch {
    return false;
  }
};

export const discoverWordPressApiRoot = async (mainUrl: string) => {
  try {
    const head = await fetchWithTimeout(mainUrl, 12000, {
      method: "HEAD",
      headers: {
        Accept: "*/*",
      },
    });
    const fromHead = extractApiRootFromLinkHeader(head.headers.link);
    if (fromHead && (await validateWordPressApiRoot(fromHead))) {
      return fromHead;
    }
  } catch {
    // Fall back to GET discovery.
  }

  try {
    const page = await fetchWithTimeout(mainUrl);
    const fromHeader = extractApiRootFromLinkHeader(page.headers.link);
    if (fromHeader && (await validateWordPressApiRoot(fromHeader))) {
      return fromHeader;
    }

    const $ = cheerio.load(page.html);
    const fromMarkup = $("link[rel='https://api.w.org/']").attr("href");
    if (fromMarkup && (await validateWordPressApiRoot(fromMarkup))) {
      return fromMarkup;
    }
  } catch {
    // Fall back to well-known routes below.
  }

  const wellKnownCandidates = [
    new URL("/wp-json/", mainUrl).toString(),
    new URL("/?rest_route=/", mainUrl).toString(),
  ];

  for (const candidate of wellKnownCandidates) {
    try {
      if (await validateWordPressApiRoot(candidate)) {
        return candidate;
      }
    } catch {
      continue;
    }
  }

  return null;
};

const htmlToText = (html: string) => cleanText(cheerio.load(html).text());

const toPreloadedPost = (post: WordPressApiPost): NormalizedPost | null => {
  if (!post.link) return null;

  const normalizedUrl = normalizeUrl(post.link);
  const contentHtml = post.content?.rendered ?? "";
  const contentText = htmlToText(contentHtml);
  if (!contentText) return null;

  return buildPost(
    normalizedUrl,
    htmlToText(post.title?.rendered ?? "") || normalizedUrl,
    post.date ?? null,
    null,
    [],
    contentHtml,
    contentText,
    contentHtml,
  );
};

const fetchWordPressPosts = async (apiRoot: string) => {
  const results: NormalizedPost[] = [];
  let page = 1;
  let totalPages = 1;

  do {
    const response = await fetchWithTimeout(
      buildWordPressApiUrl(apiRoot, "wp/v2/posts", {
        page: String(page),
        per_page: "100",
        _fields: "link,date,slug,title,content",
      }),
      15000,
      {
        headers: {
          Accept: "application/json",
        },
      },
    );

    if (response.status >= 400) {
      throw new Error(`WordPress posts endpoint returned ${response.status}`);
    }

    const payload = JSON.parse(response.html) as WordPressApiPost[];
    payload
      .map(toPreloadedPost)
      .filter((post): post is NormalizedPost => Boolean(post))
      .forEach((post) => results.push(post));

    totalPages = Number(response.headers["x-wp-totalpages"] ?? 1) || 1;
    page += 1;
  } while (page <= totalPages);

  return results;
};

const blockedWordPressPaths = [
  "/wp-json",
  "/wp-admin",
  "/wp-content",
  "/wp-includes",
  "/feed",
  "/tag/",
  "/category/",
  "/author/",
  "/comments/",
];

const isLikelyWordPressPostPath = (pathname: string) => {
  if (!pathname || pathname === "/") return false;
  if (blockedWordPressPaths.some((prefix) => pathname.startsWith(prefix))) return false;
  if (/\.(xml|jpg|jpeg|png|gif|svg|webp|pdf|css|js)$/i.test(pathname)) return false;

  const segments = pathname.split("/").filter(Boolean);
  if (!segments.length) return false;
  if (/\d{4}\/\d{2}/.test(pathname)) return true;
  if (segments.length >= 1) return true;

  return false;
};

export const wordpressAdapter: BlogPlatformAdapter = {
  platform: "wordpress",
  detect(url) {
    return url.hostname.includes("wordpress");
  },
  feedCandidates(url) {
    return [
      new URL("/feed", url).toString(),
      new URL("/rss", url).toString(),
      new URL("/atom.xml", url).toString(),
    ];
  },
  sitemapCandidates(url) {
    return [
      new URL("/wp-sitemap-posts-post-1.xml", url).toString(),
      new URL("/wp-sitemap.xml", url).toString(),
      new URL("/sitemap.xml", url).toString(),
    ];
  },
  isPostUrl(url) {
    return isLikelyWordPressPostPath(url.pathname);
  },
  discoverFromMainPage(url, html) {
    const $ = cheerio.load(html);
    const directLinks = [
      ...$("article a[rel='bookmark'], h1.entry-title a, h2.entry-title a, h3.entry-title a, .wp-block-post-title a")
        .map((_, el) => $(el).attr("href"))
        .get()
        .filter(Boolean),
      ...$("article a[href]")
        .map((_, el) => $(el).attr("href"))
        .get()
        .filter(Boolean),
    ];

    return directLinks
      .map((href) => {
        try {
          return normalizeUrl(new URL(href!, url).toString());
        } catch {
          return null;
        }
      })
      .filter((link): link is string => Boolean(link))
      .filter((link) => this.isPostUrl(new URL(link)));
  },
  async discoverPosts(mainUrl, overrides, settings): Promise<DiscoveryResult> {
    const apiRoot = await discoverWordPressApiRoot(mainUrl);
    if (apiRoot) {
      try {
        const posts = await fetchWordPressPosts(apiRoot);
        const found = new Map<string, DiscoverySource>();
        const sourceCounts = createSourceCounts();

        for (const post of posts) {
          preloadedPosts.set(post.url, post);
          if (found.has(post.url)) continue;
          found.set(post.url, "wp-json");
          sourceCounts.wpJson += 1;
        }

        return buildDiscoveryResult(found, sourceCounts);
      } catch {
        // Fall back to feed/sitemap/main discovery below.
      }
    }

    return runDefaultDiscovery(this, mainUrl, overrides, settings);
  },
  async fetchPost(url) {
    const normalized = normalizeUrl(url);
    const cached = preloadedPosts.get(normalized);
    if (cached) {
      return cached;
    }

    const page = await fetchWithTimeout(url);
    const $ = cheerio.load(page.html);
    const title = selectText($, ["meta[property='og:title']", "h1.entry-title", "h1", "title"]);
    const content = selectHtml($, [
      ".wp-block-post-content",
      "article .entry-content",
      "article .post-content",
      ".entry-content",
      ".post-content",
      "article",
      "main",
    ]);

    return buildPost(
      normalizeUrl(page.url),
      title,
      detectDate($, ["meta[property='article:published_time']", "time[datetime]", "meta[name='date']"]),
      selectText($, [".cat-links", ".entry-categories", ".post-categories"]) || null,
      $(".tag-links a, .post-tags a, .entry-tags a")
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
      commentsCount: numberFromText(selectText($, [".comments-number", ".comments-link", ".comment-count"])),
      likesCount: null,
      sympathyCount: null,
      viewsCount: null,
      rawJson: {},
    };
  },
};
