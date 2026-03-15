import { describe, expect, it } from "vitest";
import { heuristicPostAnalysis } from "./heuristics";

const baseInput = {
  blogName: "Test Blog",
  blogPlatform: "tistory" as const,
  analysisMode: "balanced" as const,
  maxOutputTokens: 800,
  engagement: {
    commentsCount: null,
    likesCount: null,
    sympathyCount: null,
    viewsCount: null,
  },
};

describe("heuristicPostAnalysis", () => {
  it("spreads scores when structure and intent differ", () => {
    const wallOfText = heuristicPostAnalysis({
      ...baseInput,
      postTitle: "SSD 정리",
      postUrl: "https://example.com/a",
      contentText:
        "SSD를 고를 때는 가격과 용량을 같이 봐야 합니다. 이 글은 SSD를 대충 정리한 글입니다. 빠르게 읽기 어렵고 예시도 거의 없습니다. 비교 기준이나 체크리스트도 부족합니다.",
      contentHtml: "<p>SSD를 고를 때는 가격과 용량을 같이 봐야 합니다. 이 글은 SSD를 대충 정리한 글입니다. 빠르게 읽기 어렵고 예시도 거의 없습니다. 비교 기준이나 체크리스트도 부족합니다.</p>",
    }).data;

    const structuredGuide = heuristicPostAnalysis({
      ...baseInput,
      postTitle: "SSD 추천 2026 비교 가이드 5단계",
      postUrl: "https://example.com/b",
      contentText:
        "SSD를 처음 고를 때는 용도, 용량, 인터페이스 순으로 보면 됩니다. 예를 들어 게임용이면 1TB, 문서용이면 500GB도 충분합니다. 마지막에는 체크리스트와 FAQ를 꼭 넣어두세요.",
      contentHtml:
        "<h2>1. 용도 정하기</h2><p>SSD를 처음 고를 때는 용도, 용량, 인터페이스 순으로 보면 됩니다.</p><h2>2. 예시</h2><p>예를 들어 게임용이면 1TB, 문서용이면 500GB도 충분합니다.</p><ul><li>체크리스트</li><li>가격 비교</li></ul><h3>FAQ</h3><p>어떤 SSD가 초보자에게 좋을까요?</p>",
    }).data;

    expect(structuredGuide.qualityScore).toBeGreaterThan(wallOfText.qualityScore);
    expect(structuredGuide.readabilityScore).toBeGreaterThan(wallOfText.readabilityScore);
    expect(structuredGuide.searchFitScore).toBeGreaterThan(wallOfText.searchFitScore);
  });

  it("penalizes repeated sibling titles", () => {
    const repeated = heuristicPostAnalysis({
      ...baseInput,
      postTitle: "노트북 추천 정리",
      postUrl: "https://example.com/c",
      contentText: "노트북 추천 글입니다. 비교 기준은 가격과 무게입니다. 직접 사용 경험은 적습니다.",
      contentHtml: "<p>노트북 추천 글입니다. 비교 기준은 가격과 무게입니다. 직접 사용 경험은 적습니다.</p>",
      siblingContext: {
        duplicateTitleCount: 2,
        siblingTopicOverlapRatio: 0.7,
        siblingOverlapKeywords: ["노트북", "추천"],
        relatedTitleSamples: ["노트북 추천 정리", "노트북 추천 비교"],
      },
    }).data;

    const unique = heuristicPostAnalysis({
      ...baseInput,
      postTitle: "노트북 발열 줄이는 법 실험 후기",
      postUrl: "https://example.com/d",
      contentText: "직접 테스트한 노트북 발열 관리 방법을 정리합니다. 써멀패드와 팬 세팅 차이를 비교했습니다.",
      contentHtml: "<h2>테스트 조건</h2><p>직접 테스트한 노트북 발열 관리 방법을 정리합니다.</p><p>써멀패드와 팬 세팅 차이를 비교했습니다.</p>",
      siblingContext: {
        duplicateTitleCount: 0,
        siblingTopicOverlapRatio: 0.1,
        siblingOverlapKeywords: [],
        relatedTitleSamples: [],
      },
    }).data;

    expect(unique.originalityScore).toBeGreaterThan(repeated.originalityScore);
    expect(unique.qualityScore).toBeGreaterThan(repeated.qualityScore);
  });
});
