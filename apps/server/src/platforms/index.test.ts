import { describe, expect, it } from "vitest";
import { detectPlatform } from "./index";

describe("detectPlatform", () => {
  it("detects blogger hosts", () => {
    expect(detectPlatform("https://sample.blogspot.com").platform).toBe("blogger");
  });

  it("detects tistory hosts", () => {
    expect(detectPlatform("https://hello.tistory.com").platform).toBe("tistory");
  });

  it("detects naver blog hosts", () => {
    expect(detectPlatform("https://blog.naver.com/example").platform).toBe("naver");
  });

  it("falls back to generic", () => {
    expect(detectPlatform("https://example.com").platform).toBe("generic");
  });
});
