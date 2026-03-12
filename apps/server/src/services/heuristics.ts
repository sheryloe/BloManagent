import {
  calculateEbi,
  ebiStatus,
  type PostAnalysis,
  type Recommendation,
  type WeeklySummary,
} from "@blog-review/shared";
import { average, cleanText, estimateTokensFromText } from "../lib/utils";
import type { AnalyzePostInput, ProviderResult, RecommendationInput, SummarizeWeekInput } from "../providers/types";

const scoreFromLength = (value: string, low = 500, high = 2500) => {
  if (!value) return 20;
  const length = value.length;
  if (length <= low) return 40;
  if (length >= high) return 88;
  return Math.round(40 + ((length - low) / (high - low)) * 48);
};

const extractTopics = (content: string) => {
  const candidates = cleanText(content)
    .toLowerCase()
    .split(/[^a-zA-Z0-9가-힣]+/)
    .filter((token) => token.length >= 3);

  const counts = new Map<string, number>();
  for (const token of candidates) {
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([token]) => token);
};

export const heuristicPostAnalysis = (input: AnalyzePostInput): ProviderResult<PostAnalysis> => {
  const content = cleanText(input.content);
  const paragraphCount = input.content.split(/\n{2,}/).filter(Boolean).length;
  const sentenceCount = input.content.split(/[.!?。！？]/).filter(Boolean).length;
  const titleStrength = Math.max(35, Math.min(92, 30 + input.postTitle.length * 3));
  const structureScore = Math.min(90, 30 + paragraphCount * 8);
  const informationDensityScore = Math.min(92, Math.round(sentenceCount * 1.8));
  const practicalityScore = Math.min(95, scoreFromLength(content));
  const differentiationScore = Math.max(40, Math.min(88, 45 + extractTopics(content).length * 6));
  const seoPotentialScore = Math.max(35, Math.min(90, titleStrength - 5 + extractTopics(content).length * 4));
  const audienceFitScore = Math.max(45, Math.min(90, structureScore - 2 + (input.engagement?.commentsCount ?? 0)));

  return {
    data: {
      summary: `${input.postTitle} 글은 ${content.slice(0, 120)}${content.length > 120 ? "..." : ""}`,
      targetAudienceGuess: "실용 정보를 찾는 독자",
      intentGuess: "정보 제공 및 신뢰 구축",
      topicLabels: extractTopics(content),
      strengths: [
        "핵심 주제를 빠르게 파악할 수 있음",
        "실행 가능한 포인트를 뽑기 쉬움",
        paragraphCount >= 4 ? "문단 구성이 비교적 안정적임" : "짧고 빠르게 읽힘",
      ],
      weaknesses: [
        paragraphCount < 4 ? "문단 수가 적어 전개가 짧게 느껴질 수 있음" : "중간 연결 문장이 더 있으면 흐름이 좋아짐",
        input.postTitle.length < 18 ? "제목의 검색 의도가 조금 더 선명하면 좋음" : "제목은 좋지만 차별 포인트를 더 강조할 수 있음",
      ],
      improvements: [
        "도입부에 문제 상황을 더 명확히 제시하기",
        "소제목 단위로 핵심 행동을 분리하기",
        "마무리에 다음 행동 유도 문장 추가하기",
      ],
      seoNotes: [
        "핵심 키워드를 제목과 첫 문단에서 일관되게 유지",
        "관련 질문형 소제목 추가 검토",
      ],
      titleStrength: Math.round(titleStrength),
      hookStrength: Math.min(90, Math.round(titleStrength - 4 + paragraphCount * 2)),
      structureScore: Math.round(structureScore),
      informationDensityScore: Math.round(informationDensityScore),
      practicalityScore: Math.round(practicalityScore),
      differentiationScore: Math.round(differentiationScore),
      seoPotentialScore: Math.round(seoPotentialScore),
      audienceFitScore: Math.round(audienceFitScore),
      engagementAdjustmentNote:
        input.engagement && Object.values(input.engagement).some(Boolean)
          ? "참여 지표가 존재하여 독자 반응 가능성을 보정했다."
          : "참여 지표가 없어서 콘텐츠 자체만 기준으로 평가했다.",
    },
    usage: {
      inputTokens: estimateTokensFromText(input.content),
      outputTokens: 320,
      estimatedCost: 0,
    },
  };
};

export const heuristicWeeklySummary = (input: SummarizeWeekInput): ProviderResult<WeeklySummary> => {
  const analyses = input.postAnalyses.map((item) => item.analysis);
  const topicMap = new Map<string, number>();
  for (const analysis of analyses) {
    for (const topic of analysis.topicLabels) {
      topicMap.set(topic, (topicMap.get(topic) ?? 0) + 1);
    }
  }

  const rankedTopics = Array.from(topicMap.entries()).sort((a, b) => b[1] - a[1]);
  const topicOverlap = rankedTopics.filter(([, count]) => count > 1).slice(0, 5).map(([topic]) => topic);
  const topicGaps = ["검색형 입문 콘텐츠", "비교형 콘텐츠", "실행 체크리스트"].filter(
    (topic) => !topicOverlap.includes(topic),
  );

  const summary: WeeklySummary = {
    overallSummary: `${input.blogName} 블로그는 최근 게시물 기준으로 실용 정보 비중이 높고, 제목과 구조 점수는 안정적이다. 다만 중복되는 주제가 반복될 가능성이 있어 검색형 확장 주제를 추가하는 편이 좋다. 다음 분석 주기에는 제목 차별화와 카테고리 균형을 동시에 점검하는 것이 유효하다.`,
    topicOverlap,
    topicGaps: topicGaps.slice(0, 5),
    blogComparisons: ["현재 런은 단일 블로그 기준으로 요약되며, 대시보드에서는 다른 블로그의 최신 EBI와 비교한다."],
    priorityActions: [
      "상위 중복 주제의 제목 패턴을 분리하기",
      "입문형과 비교형 콘텐츠를 섞어 검색 유입 폭 넓히기",
      "실행 체크리스트 섹션을 추가해 체감 실용성 높이기",
    ],
    nextWeekTopics: topicGaps.slice(0, 3),
    blogScores: [
      {
        blogId: "pending",
        blogName: input.blogName,
        postCount: analyses.length,
        avgTitleStrength: average(analyses.map((analysis) => analysis.titleStrength)),
        avgHookStrength: average(analyses.map((analysis) => analysis.hookStrength)),
        avgStructureScore: average(analyses.map((analysis) => analysis.structureScore)),
        avgInformationDensityScore: average(analyses.map((analysis) => analysis.informationDensityScore)),
        avgPracticalityScore: average(analyses.map((analysis) => analysis.practicalityScore)),
        avgDifferentiationScore: average(analyses.map((analysis) => analysis.differentiationScore)),
        avgSeoPotentialScore: average(analyses.map((analysis) => analysis.seoPotentialScore)),
        avgAudienceFitScore: average(analyses.map((analysis) => analysis.audienceFitScore)),
        topicDiversityScore: Math.min(100, rankedTopics.length * 12 + 28),
        publishingConsistencyScore: analyses.length >= 4 ? 82 : analyses.length >= 2 ? 68 : 52,
        freshnessScore: 75,
        engagementScore: 50,
        ebiScore: 0,
        ebiStatus: "watch",
        ebiReason: [],
      },
    ],
  };

  const score = summary.blogScores[0];
  const ebi = calculateEbi({
    publishingConsistency: score.publishingConsistencyScore,
    topicDiversity: score.topicDiversityScore,
    contentQuality: average([score.avgTitleStrength, score.avgStructureScore, score.avgPracticalityScore]),
    structureScore: score.avgStructureScore,
    practicalityScore: score.avgPracticalityScore,
    seoPotential: score.avgSeoPotentialScore,
    audienceFit: score.avgAudienceFitScore,
    freshness: score.freshnessScore,
    engagementScore: score.engagementScore,
  });

  score.ebiScore = ebi;
  score.ebiStatus = ebiStatus(ebi);
  score.ebiReason = [
    `제목 평균 ${score.avgTitleStrength.toFixed(1)}`,
    `구조 평균 ${score.avgStructureScore.toFixed(1)}`,
    `실용성 평균 ${score.avgPracticalityScore.toFixed(1)}`,
  ];

  return {
    data: summary,
    usage: {
      inputTokens: estimateTokensFromText(JSON.stringify(input.postAnalyses)),
      outputTokens: 420,
      estimatedCost: 0,
    },
  };
};

export const heuristicRecommendations = (
  input: RecommendationInput,
  summary: WeeklySummary,
): ProviderResult<Recommendation[]> => ({
  data: [
    {
      recommendationType: "immediate-action",
      priority: 90,
      title: "중복 주제 제목을 분리",
      description: `${summary.topicOverlap[0] ?? "상위 주제"} 관련 글은 제목 차별 포인트를 더 분명히 넣어 검색 의도를 분리한다.`,
      actionItems: ["제목에 대상 독자 또는 상황을 명시", "첫 문단에 문제 정의 추가"],
      blogId: null,
    },
    {
      recommendationType: "content-mix",
      priority: 78,
      title: "검색형 보강 주제 추가",
      description: `다음 주에는 ${summary.nextWeekTopics.slice(0, 2).join(", ")} 유형을 섞어 유입 구조를 넓힌다.`,
      actionItems: ["입문형 1개", "비교형 1개", "체크리스트형 1개 기획"],
      blogId: null,
    },
    {
      recommendationType: "seo",
      priority: 72,
      title: "소제목 키워드 정리",
      description: "본문 중간 소제목을 질문형 또는 비교형으로 정리해 검색 친화도를 높인다.",
      actionItems: ["소제목 3개 이상", "FAQ형 마무리 추가"],
      blogId: null,
    },
  ],
  usage: {
    inputTokens: estimateTokensFromText(JSON.stringify(input.postAnalyses)),
    outputTokens: 220,
    estimatedCost: 0,
  },
});
