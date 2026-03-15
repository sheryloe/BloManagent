import { afterEach, describe, expect, it, vi } from "vitest";
import { naverAdapter, resolveNaverBlogId } from "./naver";

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

describe("resolveNaverBlogId", () => {
  it("extracts blogId from redirected main page", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        mockResponse(
          "https://blog.naver.com/NBlogTop.naver?blogId=naverofficial",
          200,
          "<html><body></body></html>",
        ),
      ),
    );

    expect(await resolveNaverBlogId("https://blog.naver.com/naver_diary")).toBe("naverofficial");
  });
});

describe("naverAdapter.discoverPosts", () => {
  it("uses derived rss url before html fallback", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);

        if (url === "https://rss.blog.naver.com/naverofficial.xml") {
          return mockResponse(
            url,
            200,
            `<?xml version="1.0" encoding="UTF-8"?>
            <rss><channel>
              <item><link>https://blog.naver.com/naverofficial/22300001</link></item>
              <item><link>https://blog.naver.com/naverofficial/22300002</link></item>
            </channel></rss>`,
            { "Content-Type": "application/xml" },
          );
        }

        return mockResponse(url, 200, "<html><body></body></html>");
      }),
    );

    const result = await naverAdapter.discoverPosts?.("https://blog.naver.com/naverofficial");
    expect(result?.posts).toHaveLength(2);
    expect(result?.sourceCounts.rss).toBe(2);
    expect(result?.sourceCounts.main).toBe(0);
  });
});
