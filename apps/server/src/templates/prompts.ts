import type { AnalysisSummary, Recommendation } from "@blog-review/shared";
import type { AnalyzePostInput, RecommendationInput, SummarizeWeekInput } from "../providers/types";

export const buildAnalyzePostPrompt = (input: AnalyzePostInput) => `
너는 블로그 글을 읽고 설명 문장을 보강하는 편집 어시스턴트다.
반드시 JSON으로만 응답하라.

블로그명: ${input.blogName}
플랫폼: ${input.blogPlatform}
게시글 제목: ${input.postTitle}
게시글 URL: ${input.postUrl}
게시일: ${input.publishedAt ?? "unknown"}
분석 모드: ${input.analysisMode}
공개 참여 지표: ${JSON.stringify(input.engagement ?? {})}

본문:
${input.content}

요구사항:
- summary는 2~3문장
- strengths, weaknesses, improvements, seoNotes는 짧은 문장 배열
- topicLabels는 핵심 키워드 위주 3~5개
- qualityScore와 세부 점수는 호출 측에서 덮어쓸 수 있으므로 일관된 JSON 형식만 맞추면 된다
`.trim();

export const buildWeeklySummaryPrompt = (input: SummarizeWeekInput) => `
너는 여러 게시글 진단 결과를 묶어 블로그 운영 메모를 작성하는 편집 어시스턴트다.
반드시 JSON으로만 응답하라.

블로그명: ${input.blogName}
분석 모드: ${input.analysisMode}

게시글 분석 결과:
${JSON.stringify(input.postAnalyses, null, 2)}

요구사항:
- overallSummary는 한국어 4~6문장
- topicOverlap, topicGaps, blogComparisons, priorityActions, nextWeekTopics는 배열
- blogScores는 1개 이상 배열
`.trim();

export const buildRecommendationsPrompt = (input: RecommendationInput, analysisSummary: AnalysisSummary) => `
너는 블로그 운영 액션 아이템을 정리하는 편집 어시스턴트다.
반드시 JSON 배열로만 응답하라.

블로그명: ${input.blogName}
분석 모드: ${input.analysisMode}

요약:
${JSON.stringify(analysisSummary, null, 2)}

게시글 분석:
${JSON.stringify(input.postAnalyses, null, 2)}

요구사항:
- 추천은 3~6개
- recommendationType은 immediate-action, content-mix, seo, title, category, audience 중 하나
- priority는 0~100 정수
- title, description, actionItems는 간결하게 작성
`.trim();

export const weeklySummaryMarkdown = (
  blogName: string,
  analysisSummary: AnalysisSummary,
  recommendations: Recommendation[],
) => {
  const lines = [
    `# ${blogName} 분석 메모`,
    "",
    "## 요약",
    analysisSummary.overallSummary,
    "",
    "## 우선 액션",
    ...analysisSummary.priorityActions.map((item) => `- ${item}`),
    "",
    "## 다음 주제",
    ...analysisSummary.nextWeekTopics.map((item) => `- ${item}`),
    "",
    "## 추천",
    ...recommendations.map((item) => `- ${item.title}: ${item.description}`),
  ];

  return lines.join("\n");
};
