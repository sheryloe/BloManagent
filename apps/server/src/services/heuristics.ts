import {
  calculateQualityComponents,
  type AnalysisSummary,
  type PostAnalysis,
  type Recommendation,
} from "@blog-review/shared";
import { average, cleanText } from "../lib/utils";
import type { AnalyzePostInput, ProviderResult, RecommendationInput, SummarizeWeekInput } from "../providers/types";

type QualityArea = "headline" | "readability" | "value" | "originality" | "search-fit";

const averageRounded = (values: number[]) => Math.round(average(values));

const scoreFromLength = (value: string, low = 500, high = 2500) => {
  if (!value) return 20;
  const length = value.length;
  if (length <= low) return 40;
  if (length >= high) return 88;
  return Math.round(40 + ((length - low) / (high - low)) * 48);
};

const extractTopics = (content: string) => {
  const tokens = cleanText(content)
    .toLowerCase()
    .split(/[^0-9a-zA-Z가-힣]+/)
    .filter((token) => token.length >= 2);

  const counts = new Map<string, number>();
  for (const token of tokens) {
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .sort((left, right) => right[1] - left[1])
    .slice(0, 5)
    .map(([token]) => token);
};

const firstParagraph = (content: string) => content.split(/\n{2,}/).map((part) => part.trim()).find(Boolean) ?? "";

const inferIntent = (title: string, content: string) => {
  const source = `${title} ${content}`.toLowerCase();
  if (/(비교|차이|vs|추천|선택)/.test(source)) return "비교와 선택을 돕는 글";
  if (/(방법|하는 법|가이드|정리|팁|체크)/.test(source)) return "실행 가이드를 주는 글";
  if (/(후기|경험|리뷰|사용기)/.test(source)) return "경험과 의견을 공유하는 글";
  return "정보를 정리해 전달하는 글";
};

const inferAudience = (title: string, content: string) => {
  const source = `${title} ${content}`.toLowerCase();
  if (/(입문|초보|처음|기초)/.test(source)) return "처음 정보를 찾는 입문자";
  if (/(비교|추천|선택)/.test(source)) return "여러 선택지를 비교하려는 독자";
  if (/(체크|방법|가이드|정리)/.test(source)) return "바로 실행할 방법이 필요한 독자";
  return "빠르게 핵심을 확인하려는 독자";
};

const areaLabel = (area: QualityArea) => {
  switch (area) {
    case "headline":
      return "제목과 첫인상";
    case "readability":
      return "가독성";
    case "value":
      return "정보 가치";
    case "originality":
      return "차별성";
    case "search-fit":
      return "검색 적합성";
  }
};

const areaAction = (area: QualityArea) => {
  switch (area) {
    case "headline":
      return "제목을 더 구체적으로 바꾸고 첫 문단에서 문제 상황을 바로 제시하세요.";
    case "readability":
      return "소제목과 짧은 문단, 목록형 정리를 늘려 읽는 흐름을 가볍게 만드세요.";
    case "value":
      return "예시, 체크리스트, 단계별 실행 방법을 추가해 실전성을 높이세요.";
    case "originality":
      return "직접 경험, 비교 포인트, 판단 기준을 넣어 다른 글과 차이를 만드세요.";
    case "search-fit":
      return "질문형 소제목과 FAQ, 핵심 키워드 정렬로 검색 의도를 더 맞추세요.";
  }
};

const areaReason = (area: QualityArea, score: number) => `${areaLabel(area)} 점수 ${score.toFixed(1)}`;

const rankedAreas = (analysis: Pick<PostAnalysis, "headlineScore" | "readabilityScore" | "valueScore" | "originalityScore" | "searchFitScore">) =>
  [
    ["headline", analysis.headlineScore],
    ["readability", analysis.readabilityScore],
    ["value", analysis.valueScore],
    ["originality", analysis.originalityScore],
    ["search-fit", analysis.searchFitScore],
  ].sort((left, right) => Number(left[1]) - Number(right[1])) as Array<[QualityArea, number]>;

export const topIssuesFromAnalysis = (
  analysis: Pick<PostAnalysis, "headlineScore" | "readabilityScore" | "valueScore" | "originalityScore" | "searchFitScore">,
) =>
  rankedAreas(analysis)
    .filter(([, score]) => score < 65)
    .slice(0, 3)
    .map(([area]) => areaLabel(area));

const buildStrengths = (
  paragraphCount: number,
  topicLabels: string[],
  analysis: Pick<PostAnalysis, "headlineScore" | "readabilityScore" | "valueScore" | "originalityScore" | "searchFitScore">,
) => {
  const strengths: string[] = [];
  if (analysis.headlineScore >= 70) strengths.push("제목과 도입에서 글의 주제가 비교적 또렷하게 보입니다.");
  if (analysis.readabilityScore >= 70) strengths.push("문단 구성이 안정적이라 끝까지 읽기 편한 편입니다.");
  if (analysis.valueScore >= 70) strengths.push("실제로 써먹을 수 있는 정보량이 충분한 편입니다.");
  if (analysis.originalityScore >= 70) strengths.push("반복 요약보다 고유한 관점이 드러납니다.");
  if (analysis.searchFitScore >= 70) strengths.push("검색 의도와 맞는 표현이 비교적 잘 잡혀 있습니다.");
  if (paragraphCount >= 5) strengths.push("핵심 정보를 끊어서 정리해 흐름이 무너지지 않습니다.");
  if (topicLabels.length >= 3) strengths.push("주제를 구성하는 핵심 키워드가 여러 갈래로 드러납니다.");
  return strengths.slice(0, 5);
};

const buildWeaknesses = (analysis: Pick<PostAnalysis, "headlineScore" | "readabilityScore" | "valueScore" | "originalityScore" | "searchFitScore">) =>
  rankedAreas(analysis)
    .filter(([, score]) => score < 65)
    .slice(0, 4)
    .map(([area, score]) => `${areaLabel(area)}이 약합니다 (${Math.round(score)}점).`);

const buildImprovements = (analysis: Pick<PostAnalysis, "headlineScore" | "readabilityScore" | "valueScore" | "originalityScore" | "searchFitScore">) =>
  rankedAreas(analysis)
    .slice(0, 3)
    .map(([area]) => areaAction(area));

const buildSeoNotes = (topicLabels: string[], analysis: Pick<PostAnalysis, "headlineScore" | "searchFitScore">) => {
  const notes = [
    "핵심 키워드는 제목과 첫 문단에 자연스럽게 한 번 더 맞춰 주세요.",
    "질문형 소제목이나 FAQ 한두 개를 넣으면 검색 의도 대응이 쉬워집니다.",
  ];
  if (topicLabels.length) {
    notes.unshift(`반복 등장한 키워드: ${topicLabels.slice(0, 3).join(", ")}`);
  }
  if (analysis.headlineScore < 60 || analysis.searchFitScore < 60) {
    notes.push("제목이 추상적이면 구체적인 문제 상황이나 대상 독자를 넣어 보세요.");
  }
  return notes.slice(0, 4);
};

export const heuristicPostAnalysis = (input: AnalyzePostInput): ProviderResult<PostAnalysis> => {
  const content = cleanText(input.content);
  const paragraphCount = input.content.split(/\n{2,}/).filter((chunk) => chunk.trim().length > 0).length;
  const sentenceCount = content.split(/[.!?]+|\n/).filter((chunk) => chunk.trim().length > 0).length;
  const topicLabels = extractTopics(content);
  const opening = firstParagraph(content);
  const titleStrength = Math.max(35, Math.min(92, 28 + input.postTitle.trim().length * 2.6));
  const hookStrength = Math.max(35, Math.min(92, titleStrength - 6 + Math.min(opening.length / 8, 16)));
  const structureScore = Math.max(30, Math.min(92, 28 + paragraphCount * 8));
  const informationDensityScore = Math.max(32, Math.min(94, Math.round(sentenceCount * 1.7)));
  const practicalityScore = Math.max(35, Math.min(95, scoreFromLength(content)));
  const differentiationScore = Math.max(38, Math.min(90, 42 + topicLabels.length * 8));
  const seoPotentialScore = Math.max(35, Math.min(92, titleStrength - 4 + topicLabels.length * 4));
  const audienceFitScore = Math.max(
    40,
    Math.min(92, structureScore - 4 + Math.min((input.engagement?.commentsCount ?? 0) * 2, 8)),
  );
  const quality = calculateQualityComponents({
    titleStrength,
    hookStrength,
    structureScore,
    informationDensityScore,
    practicalityScore,
    differentiationScore,
    seoPotentialScore,
    audienceFitScore,
  });

  const analysis: PostAnalysis = {
    summary: `${input.postTitle} 글은 ${content.slice(0, 110)}${content.length > 110 ? "..." : ""}`,
    targetAudienceGuess: inferAudience(input.postTitle, content),
    intentGuess: inferIntent(input.postTitle, content),
    topicLabels,
    strengths: buildStrengths(paragraphCount, topicLabels, quality),
    weaknesses: buildWeaknesses(quality),
    improvements: buildImprovements(quality),
    seoNotes: buildSeoNotes(topicLabels, quality),
    titleStrength: Math.round(titleStrength),
    hookStrength: Math.round(hookStrength),
    structureScore: Math.round(structureScore),
    informationDensityScore: Math.round(informationDensityScore),
    practicalityScore: Math.round(practicalityScore),
    differentiationScore: Math.round(differentiationScore),
    seoPotentialScore: Math.round(seoPotentialScore),
    audienceFitScore: Math.round(audienceFitScore),
    headlineScore: quality.headlineScore,
    readabilityScore: quality.readabilityScore,
    valueScore: quality.valueScore,
    originalityScore: quality.originalityScore,
    searchFitScore: quality.searchFitScore,
    qualityScore: quality.qualityScore,
    qualityStatus: quality.qualityStatus,
    engagementAdjustmentNote:
      input.engagement && Object.values(input.engagement).some((value) => value != null && value > 0)
        ? "공개 참여 지표가 있는 경우 독자 반응을 보조 신호로만 참고했습니다."
        : "공개 참여 지표가 없어서 본문 구조와 정보 품질만으로 평가했습니다.",
  };

  return {
    data: analysis,
    usage: {
      inputTokens: 0,
      outputTokens: 0,
      estimatedCost: 0,
    },
  };
};

const componentAverages = (analyses: PostAnalysis[]) => ({
  avgTitleStrength: average(analyses.map((analysis) => analysis.titleStrength)),
  avgHookStrength: average(analyses.map((analysis) => analysis.hookStrength)),
  avgStructureScore: average(analyses.map((analysis) => analysis.structureScore)),
  avgInformationDensityScore: average(analyses.map((analysis) => analysis.informationDensityScore)),
  avgPracticalityScore: average(analyses.map((analysis) => analysis.practicalityScore)),
  avgDifferentiationScore: average(analyses.map((analysis) => analysis.differentiationScore)),
  avgSeoPotentialScore: average(analyses.map((analysis) => analysis.seoPotentialScore)),
  avgAudienceFitScore: average(analyses.map((analysis) => analysis.audienceFitScore)),
});

export const heuristicAnalysisSummary = (input: SummarizeWeekInput): ProviderResult<AnalysisSummary> => {
  const analyses = input.postAnalyses.map((item) => item.analysis);
  const topics = new Map<string, number>();

  for (const analysis of analyses) {
    for (const topic of analysis.topicLabels) {
      topics.set(topic, (topics.get(topic) ?? 0) + 1);
    }
  }

  const rankedTopics = Array.from(topics.entries()).sort((left, right) => right[1] - left[1]);
  const topicOverlap = rankedTopics
    .filter(([, count]) => count > 1)
    .slice(0, 5)
    .map(([topic]) => topic);
  const topicGaps = ["비교형 글", "체크리스트형 글", "입문용 정리 글"].filter((topic) => !topicOverlap.includes(topic));

  const averages = componentAverages(analyses);
  const quality = calculateQualityComponents({
    titleStrength: averages.avgTitleStrength,
    hookStrength: averages.avgHookStrength,
    structureScore: averages.avgStructureScore,
    informationDensityScore: averages.avgInformationDensityScore,
    practicalityScore: averages.avgPracticalityScore,
    differentiationScore: averages.avgDifferentiationScore,
    seoPotentialScore: averages.avgSeoPotentialScore,
    audienceFitScore: averages.avgAudienceFitScore,
  });
  const reasons = [
    areaReason("headline", quality.headlineScore),
    areaReason("readability", quality.readabilityScore),
    areaReason("value", quality.valueScore),
    areaReason("originality", quality.originalityScore),
    areaReason("search-fit", quality.searchFitScore),
  ]
    .sort((left, right) => Number(left.match(/([\d.]+)$/)?.[1] ?? 0) - Number(right.match(/([\d.]+)$/)?.[1] ?? 0))
    .slice(0, 3);

  const weakestAreas = [
    ["headline", quality.headlineScore],
    ["readability", quality.readabilityScore],
    ["value", quality.valueScore],
    ["originality", quality.originalityScore],
    ["search-fit", quality.searchFitScore],
  ]
    .sort((left, right) => Number(left[1]) - Number(right[1]))
    .slice(0, 2) as Array<[QualityArea, number]>;

  const summary: AnalysisSummary = {
    overallSummary: `${input.blogName}의 최근 글은 평균 ${quality.qualityScore}점으로 ${
      quality.qualityStatus === "excellent"
        ? "완성도가 높은 편"
        : quality.qualityStatus === "solid"
          ? "기본기가 안정적인 편"
          : quality.qualityStatus === "watch"
            ? "보완 포인트가 눈에 띄는 편"
            : "우선 보강이 필요한 상태"
    }입니다. ${
      weakestAreas.length
        ? `${weakestAreas.map(([area]) => areaLabel(area)).join("와 ")}을 먼저 손보면 체감 개선 폭이 큽니다.`
        : "핵심 구성 요소가 고르게 유지되고 있습니다."
    }`,
    topicOverlap,
    topicGaps: topicGaps.slice(0, 5),
    blogComparisons: ["현재 요약은 단일 블로그 기준이며, 대시보드에서는 최근 분석된 글들끼리 우선순위를 비교합니다."],
    priorityActions: weakestAreas.map(([area]) => areaAction(area)),
    nextWeekTopics: topicGaps.slice(0, 3),
    blogScores: [
      {
        blogId: "pending",
        blogName: input.blogName,
        postCount: analyses.length,
        ...averages,
        topicDiversityScore: Math.min(100, rankedTopics.length * 12 + 24),
        publishingConsistencyScore: analyses.length >= 6 ? 86 : analyses.length >= 3 ? 72 : 58,
        freshnessScore: analyses.length ? 75 : 40,
        engagementScore: averageRounded(analyses.map((analysis) => analysis.searchFitScore)),
        qualityScore: quality.qualityScore,
        status: quality.qualityStatus,
        reasons,
      },
    ],
  };

  return {
    data: summary,
    usage: {
      inputTokens: 0,
      outputTokens: 0,
      estimatedCost: 0,
    },
  };
};

export const heuristicRecommendations = (
  input: RecommendationInput,
  summary: AnalysisSummary,
): ProviderResult<Recommendation[]> => {
  const lowestPost = [...input.postAnalyses].sort(
    (left, right) => left.analysis.qualityScore - right.analysis.qualityScore,
  )[0];
  const weakestReason = summary.blogScores[0]?.reasons[0] ?? "품질이 낮은 구간";

  return {
    data: [
      {
        recommendationType: "post-fix",
        priority: 92,
        title: "점수가 낮은 글부터 보완하기",
        description: lowestPost
          ? `"${lowestPost.title}"은 ${lowestPost.analysis.qualityScore}점으로 최근 글 중 보완 우선순위가 높습니다.`
          : "최근 분석 글 중 보완 우선순위가 높은 글부터 다시 손보세요.",
        actionItems: lowestPost?.analysis.improvements.slice(0, 3) ?? [areaAction("headline"), areaAction("value")],
        blogId: null,
      },
      {
        recommendationType: "structure",
        priority: 80,
        title: "반복 이슈를 한 번에 정리하기",
        description: `${weakestReason}가 반복되어 보이므로 비슷한 패턴의 글을 한꺼번에 손보는 편이 효율적입니다.`,
        actionItems: summary.priorityActions.slice(0, 3),
        blogId: null,
      },
      {
        recommendationType: "content-mix",
        priority: 72,
        title: "다음 글은 다른 형식으로 구성하기",
        description: `다음 주제 후보는 ${summary.nextWeekTopics.join(", ") || "입문형 또는 비교형 글"}입니다.`,
        actionItems: [
          "질문형 소제목 2개 이상 넣기",
          "체크리스트나 단계형 정리 넣기",
          "직접 경험이나 비교 기준 한 문단 추가하기",
        ],
        blogId: null,
      },
    ],
    usage: {
      inputTokens: 0,
      outputTokens: 0,
      estimatedCost: 0,
    },
  };
};
