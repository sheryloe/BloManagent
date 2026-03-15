import { afterEach, describe, expect, it, vi } from "vitest";
import { wordpressAdapter } from "./wordpress";

const mockResponse = (url: string, status: number, body: string, headers?: Record<string, string>) =>
  ({
    url,
    status,
    headers: new Headers(headers),
    text: async () => body,
  }) as Response;

const getPageParam = (url: string) => new URL(url).searchParams.get("page");

afterEach(() => {
  vi.restoreAllMocks();
});

describe("wordpressAdapter.discoverPosts", () => {
  it("collects public posts from wp-json and reuses the cached content", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);

        if (init?.method === "HEAD") {
          return mockResponse(url, 200, "", {
            Link: "<https://example.com/wp-json/>; rel=\"https://api.w.org/\"",
          });
        }

        if (url === "https://example.com/wp-json/") {
          return mockResponse(url, 200, JSON.stringify({ namespaces: ["wp/v2"] }), {
            "Content-Type": "application/json",
          });
        }

        if (url.includes("/wp/v2/posts") && getPageParam(url) === "1") {
          return mockResponse(
            url,
            200,
            JSON.stringify([
              {
                link: "https://example.com/hello-world/",
                date: "2026-03-01T00:00:00",
                title: { rendered: "Hello World" },
                content: { rendered: "<p>First post</p>" },
              },
            ]),
            {
              "Content-Type": "application/json",
              "X-WP-TotalPages": "2",
            },
          );
        }

        if (url.includes("/wp/v2/posts") && getPageParam(url) === "2") {
          return mockResponse(
            url,
            200,
            JSON.stringify([
              {
                link: "https://example.com/next-post/",
                date: "2026-03-02T00:00:00",
                title: { rendered: "Next Post" },
                content: { rendered: "<p>Second post</p>" },
              },
            ]),
            {
              "Content-Type": "application/json",
              "X-WP-TotalPages": "2",
            },
          );
        }

        return mockResponse(url, 404, "");
      }),
    );

    const result = await wordpressAdapter.discoverPosts?.("https://example.com");
    expect(result?.posts).toHaveLength(2);
    expect(result?.sourceCounts.wpJson).toBe(2);

    const firstPost = await wordpressAdapter.fetchPost("https://example.com/hello-world/");
    expect(firstPost.title).toBe("Hello World");
    expect(firstPost.contentClean).toBe("First post");
  });

  it("falls back to feed discovery when wp-json is not available", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);

        if (init?.method === "HEAD") {
          return mockResponse(url, 404, "");
        }

        if (url === "https://example.com" || url === "https://example.com/") {
          return mockResponse(url, 200, "<html><body></body></html>");
        }

        if (url === "https://example.com/feed") {
          return mockResponse(
            url,
            200,
            `<?xml version="1.0" encoding="UTF-8"?>
            <rss><channel>
              <item><link>https://example.com/hello-world/</link></item>
            </channel></rss>`,
            { "Content-Type": "application/xml" },
          );
        }

        return mockResponse(url, 404, "");
      }),
    );

    const result = await wordpressAdapter.discoverPosts?.("https://example.com");
    expect(result?.posts).toHaveLength(1);
    expect(result?.sourceCounts.rss).toBe(1);
    expect(result?.sourceCounts.wpJson).toBe(0);
  });
});
