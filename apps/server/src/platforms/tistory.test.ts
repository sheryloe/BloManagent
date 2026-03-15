import { afterEach, describe, expect, it, vi } from "vitest";
import { tistoryAdapter } from "./tistory";

const mockResponse = (url: string, status: number, body: string, headers?: Record<string, string>) =>
  ({
    url,
    status,
    headers: new Headers(headers),
    text: async () => body,
  }) as Response;

afterEach(() => {
  vi.restoreAllMocks();
});

describe("tistoryAdapter.isPostUrl", () => {
  it("accepts numeric and entry post urls", () => {
    expect(tistoryAdapter.isPostUrl(new URL("https://sample.tistory.com/123"))).toBe(true);
    expect(tistoryAdapter.isPostUrl(new URL("https://sample.tistory.com/entry/hello-world"))).toBe(true);
  });

  it("rejects tag and archive urls", () => {
    expect(tistoryAdapter.isPostUrl(new URL("https://sample.tistory.com/tag/test"))).toBe(false);
    expect(tistoryAdapter.isPostUrl(new URL("https://sample.tistory.com/archive/202603"))).toBe(false);
  });
});

describe("tistoryAdapter.fetchPost", () => {
  it("throws when the page is not an article", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) =>
        mockResponse(
          String(input),
          200,
          "<html><head><meta property='og:type' content='website'></head><body><article>Listing</article></body></html>",
        ),
      ),
    );

    await expect(tistoryAdapter.fetchPost("https://sample.tistory.com/tag/test")).rejects.toThrow(
      "Not a Tistory post page.",
    );
  });

  it("prefers og:title over blog h1 and strips style/script noise from content", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) =>
        mockResponse(
          String(input),
          200,
          `
          <html>
            <head>
              <meta property="og:type" content="article">
              <meta property="article:published_time" content="2026-03-15T12:00:00+09:00">
              <meta property="og:title" content="실제 글 제목">
              <title>실제 글 제목</title>
            </head>
            <body>
              <h1>블로그 이름</h1>
              <div class="tt_article_useless_p_margin">
                <style>.post-wrap{color:red}</style>
                <script>console.log("ad code")</script>
                <p>첫 문단입니다.</p>
                <p>두 번째 문단입니다.</p>
              </div>
            </body>
          </html>
          `,
        ),
      ),
    );

    const result = await tistoryAdapter.fetchPost("https://sample.tistory.com/123");
    expect(result.title).toBe("실제 글 제목");
    expect(result.contentClean).toContain("첫 문단입니다.");
    expect(result.contentClean).toContain("두 번째 문단입니다.");
    expect(result.contentClean).not.toContain("블로그 이름");
    expect(result.contentClean).not.toContain("post-wrap");
    expect(result.contentClean).not.toContain("ad code");
  });
});

describe("tistoryAdapter.discoverPosts", () => {
  it("keeps only sitemap entries that look like real post urls", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);

        if (url === "https://sample.tistory.com/rss" || url === "https://sample.tistory.com/rss.xml") {
          return mockResponse(url, 404, "");
        }

        if (url === "https://sample.tistory.com/sitemap.xml") {
          return mockResponse(
            url,
            200,
            `<?xml version="1.0" encoding="UTF-8"?>
            <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
              <url><loc>https://sample.tistory.com/category</loc></url>
              <url><loc>https://sample.tistory.com/tag/test</loc></url>
              <url><loc>https://sample.tistory.com/guestbook</loc></url>
              <url><loc>https://sample.tistory.com/123</loc><lastmod>2026-03-15T00:00:00+09:00</lastmod></url>
              <url><loc>https://sample.tistory.com/entry/hello-world</loc><lastmod>2026-03-15T00:00:00+09:00</lastmod></url>
            </urlset>`,
            { "Content-Type": "application/xml" },
          );
        }

        if (url === "https://sample.tistory.com/" || url === "https://sample.tistory.com") {
          return mockResponse(url, 200, "<html><body></body></html>");
        }

        return mockResponse(url, 404, "");
      }),
    );

    const result = await tistoryAdapter.discoverPosts?.("https://sample.tistory.com");
    expect(result?.posts.map((item) => item.url)).toEqual([
      "https://sample.tistory.com/123",
      "https://sample.tistory.com/entry/hello-world",
    ]);
    expect(result?.sourceCounts.sitemap).toBe(2);
  });
});
