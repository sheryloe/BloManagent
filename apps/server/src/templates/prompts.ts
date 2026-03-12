import type { Recommendation, WeeklySummary } from "@blog-review/shared";
import type { AnalyzePostInput, RecommendationInput, SummarizeWeekInput } from "../providers/types";

export const buildAnalyzePostPrompt = (input: AnalyzePostInput) => `
너는 블로그 전략 분석가다.
반드시 JSON으로만 응답하라.

블로그명: ${input.blogName}
플랫폼: ${input.blogPlatform}
게시물 제목: ${input.postTitle}
게시물 URL: ${input.postUrl}
게시일: ${input.publishedAt ?? "unknown"}
분석 모드: ${input.analysisMode}
참여 지표: ${JSON.stringify(input.engagement ?? {})}

게시물 본문:
${input.content}

요구사항:
- 요약은 2~3문장
- topicLabels, strengths, weaknesses, improvements, seoNotes는 간결한 한국어 배열
- 점수는 0~100 정수
- engagementAdjustmentNote에는 참여지표가 해석에 어떤 영향을 주는지 간단히 기록
`.trim();

export const buildWeeklySummaryPrompt = (input: SummarizeWeekInput) => `
너는 여러 게시물 분석 결과를 바탕으로 주간 블로그 전략을 요약한다.
반드시 JSON으로만 응답하라.

블로그명: ${input.blogName}
분석 모드: ${input.analysisMode}

게시물 분석 요약:
${JSON.stringify(input.postAnalyses, null, 2)}

요구사항:
- overallSummary는 한국어 4~6문장
- topicOverlap, topicGaps, blogComparisons, priorityActions, nextWeekTopics는 배열
- blogScores는 1개 이상 배열로 반환하고, blogId는 호출측에서 치환 가능하도록 임시 문자열 사용 가능
`.trim();

export const buildRecommendationsPrompt = (
  input: RecommendationInput,
  weeklySummary: WeeklySummary,
) => `
너는 블로그 운영 액션 아이템을 제시한다.
반드시 JSON 배열로만 응답하라.

블로그명: ${input.blogName}
분석 모드: ${input.analysisMode}

주간 요약:
${JSON.stringify(weeklySummary, null, 2)}

게시물 분석:
${JSON.stringify(input.postAnalyses, null, 2)}

요구사항:
- 추천은 3~6개
- recommendationType은 one of immediate-action, content-mix, seo, title, category, audience
- priority는 0~100 정수
- title, description, actionItems는 한국어
`.trim();

export const weeklySummaryMarkdown = (
  blogName: string,
  weeklySummary: WeeklySummary,
  recommendations: Recommendation[],
) => {
  const lines = [
    `# ${blogName} 주간 분석`,
    "",
    "## 요약",
    weeklySummary.overallSummary,
    "",
    "## 우선 액션",
    ...weeklySummary.priorityActions.map((item) => `- ${item}`),
    "",
    "## 다음 주 추천 주제",
    ...weeklySummary.nextWeekTopics.map((item) => `- ${item}`),
    "",
    "## 추천",
    ...recommendations.map((item) => `- ${item.title}: ${item.description}`),
  ];

  return lines.join("\n");
};
