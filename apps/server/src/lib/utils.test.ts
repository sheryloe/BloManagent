import { describe, expect, it } from "vitest";
import { normalizeUrl } from "./utils";

describe("normalizeUrl", () => {
  it("removes tracking params and trailing slashes", () => {
    const normalized = normalizeUrl("https://example.com/post/?utm_source=test&fbclid=123#section");
    expect(normalized).toBe("https://example.com/post");
  });
});
