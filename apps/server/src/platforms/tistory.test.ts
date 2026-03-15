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
});
