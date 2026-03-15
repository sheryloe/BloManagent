import type { AnalysisSummary, Recommendation } from "@blog-review/shared";
import type { AnalyzePostInput, RecommendationInput, SummarizeWeekInput } from "../providers/types";

export const buildAnalyzePostPrompt = (input: AnalyzePostInput) => `
당신은 블로그 글의 설명 문장만 보강하는 편집 어시스턴트다.
반드시 JSON으로만 응답하라.

블로그명: ${input.blogName}
플랫폼: ${input.blogPlatform}
게시글 제목: ${input.postTitle}
게시글 URL: ${input.postUrl}
게시일: ${input.publishedAt ?? "unknown"}
분석 모드: ${input.analysisMode}
공개 참여 지표: ${JSON.stringify(input.engagement ?? {})}
구조 메트릭: ${JSON.stringify(input.contentMetrics ?? {})}
형제 글 맥락: ${JSON.stringify(input.siblingContext ?? {})}

본문:
${input.contentText}

요구사항:
- summary는 2~3문장
- strengths, weaknesses, improvements, seoNotes는 짧은 문장 배열
- topicLabels는 핵심 키워드 위주 3~5개
- 숫자 점수는 절대 만들지 말고 narrative 필드만 작성하라
`.trim();

export const buildWeeklySummaryPrompt = (input: SummarizeWeekInput) => `
당신은 여러 게시글 진단 결과를 묶어 블로그 운영 메모를 작성하는 어시스턴트다.
반드시 JSON으로만 응답하라.

블로그명: ${input.blogName}
분석 모드: ${input.analysisMode}

게시글 분석 결과:
${JSON.stringify(input.postAnalyses, null, 2)}

요구사항:
- overallSummary는 4~6문장
- topicOverlap, topicGaps, blogComparisons, priorityActions, nextWeekTopics는 배열
- blogScores는 1개 이상 배열
`.trim();

export const buildRecommendationsPrompt = (input: RecommendationInput, analysisSummary: AnalysisSummary) => `
당신은 블로그 운영 액션 아이템을 정리하는 어시스턴트다.
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
