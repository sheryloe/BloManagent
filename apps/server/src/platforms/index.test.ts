import { afterEach, describe, expect, it, vi } from "vitest";
import { resolvePlatform } from "./index";

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

describe("resolvePlatform", () => {
  it("detects blogger hosts without network discovery", async () => {
    expect((await resolvePlatform("https://sample.blogspot.com")).platform).toBe("blogger");
  });

  it("detects tistory hosts without network discovery", async () => {
    expect((await resolvePlatform("https://hello.tistory.com")).platform).toBe("tistory");
  });

  it("detects naver blog hosts without network discovery", async () => {
    expect((await resolvePlatform("https://blog.naver.com/example")).platform).toBe("naver");
  });

  it("detects wordpress via api discovery", async () => {
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

        return mockResponse(url, 404, "");
      }),
    );

    expect((await resolvePlatform("https://example.com")).platform).toBe("wordpress");
  });

  it("falls back to generic when wordpress discovery fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => mockResponse(String(input), 404, "")),
    );

    expect((await resolvePlatform("https://example.com")).platform).toBe("generic");
  });
});
