import { load } from "cheerio";
import type {
  AnalysisSummary,
  ContentMetrics,
  ImprovementItem,
  PostAnalysis,
  PostNarrative,
  Recommendation,
  SignalFinding,
  SignalBreakdown,
} from "@blog-review/shared";
import { qualityGrade, qualityStatus } from "@blog-review/shared";
import { average, cleanText } from "../lib/utils";
import type {
  AnalyzePostInput,
  PostSiblingContext,
  ProviderResult,
  RecommendationInput,
  SummarizeWeekInput,
} from "../providers/types";

type QualityArea = "headline" | "readability" | "value" | "originality" | "search-fit";

type NamedSignal = {
  key: keyof SignalBreakdown;
  label: string;
  score: number;
  area: QualityArea;
};

const stopWords = new Set([
  "and",
  "are",
  "blog",
  "for",
  "from",
  "how",
  "into",
  "just",
  "that",
  "the",
  "this",
  "with",
  "about",
  "your",
  "있다",
  "있는",
  "정리",
  "후기",
  "가이드",
  "방법",
  "리뷰",
  "이것",
  "그것",
  "그리고",
  "하는",
  "에서",
  "까지",
  "대한",
  "위한",
  "정도",
  "이유",
  "사용",
  "추천",
  "비교",
  "체크",
]);

const intentMarkers = /(방법|가이드|정리|비교|추천|체크|후기|리뷰|faq|질문|how|guide|check|review|vs|top\s*\d+)/i;
const actionMarkers = /(방법|단계|순서|체크|설정|준비|실행|해야|추천|step|checklist|todo)/i;
const intentGuideMarkers = /(방법|가이드|정리|체크|단계|how|guide|checklist)/i;
const intentComparisonMarkers = /(비교|차이|vs|추천|선택|best|top)/i;
const intentReviewMarkers = /(후기|리뷰|사용기|review)/i;

const clampScore = (value: number) => Math.max(0, Math.min(100, Math.round(value)));
const clampRatio = (value: number) => Math.max(0, Math.min(1, value));
const averageRounded = (values: number[]) => Math.round(average(values));
const weightedScore = (entries: Array<[number, number]>) =>
  clampScore(entries.reduce((sum, [score, weight]) => sum + score * weight, 0));
const gradeText = (score: number) => `${qualityGrade(score)} grade`;
const trimSnippet = (value: string, max = 88) => {
  const text = cleanText(value);
  if (text.length <= max) return text;
  return `${text.slice(0, max).trimEnd()}...`;
};

const scoreFromIdeal = (
  value: number,
  options: { idealMin: number; idealMax: number; outerMin: number; outerMax: number },
) => {
  const { idealMin, idealMax, outerMin, outerMax } = options;
  if (value >= idealMin && value <= idealMax) return 100;
  if (value < outerMin || value > outerMax) return 25;
  if (value < idealMin) {
    const ratio = (value - outerMin) / Math.max(idealMin - outerMin, 1);
    return clampScore(25 + ratio * 75);
  }
  const ratio = (outerMax - value) / Math.max(outerMax - idealMax, 1);
  return clampScore(25 + ratio * 75);
};

const tokenize = (value: string) =>
  cleanText(value)
    .toLowerCase()
    .match(/[\p{L}\p{N}]+/gu)
    ?.filter((token) => token.length >= 2 && !stopWords.has(token)) ?? [];

const countMatches = (value: string, pattern: RegExp) => value.match(pattern)?.length ?? 0;
const normalizeTitle = (title: string) => tokenize(title).join(" ");

const keywordMap = (tokens: string[]) => {
  const counts = new Map<string, number>();
  for (const token of tokens) {
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  return counts;
};

const topKeywords = (tokens: string[], limit = 8) =>
  Array.from(keywordMap(tokens).entries())
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, limit)
    .map(([token]) => token);

const buildParagraphs = (contentText: string, contentHtml?: string | null) => {
  if (contentHtml) {
    const $ = load(contentHtml);
    const htmlParagraphs = $("p")
      .map((_, element) => cleanText($(element).text()))
      .get()
      .filter(Boolean);
    if (htmlParagraphs.length) return htmlParagraphs;
  }
  return contentText
    .split(/\n{2,}/)
    .map((chunk) => cleanText(chunk))
    .filter(Boolean);
};

const buildSentences = (contentText: string) =>
  contentText
    .split(/(?<=[.!?])\s+|\n+/)
    .map((chunk) => cleanText(chunk))
    .filter(Boolean);

const detectIntent = (title: string, text: string) => {
  const source = `${title} ${text}`;
  if (intentComparisonMarkers.test(source)) return "comparison";
  if (intentGuideMarkers.test(source)) return "guide";
  if (intentReviewMarkers.test(source)) return "review";
  if (/\?/.test(title) || /(질문|faq|왜|어떻게|how)/i.test(title)) return "question";
  return "informational";
};

const inferIntent = (title: string, text: string) => {
  const intent = detectIntent(title, text);
  if (intent === "comparison") return "비교와 선택을 돕는 글";
  if (intent === "guide") return "실행 가이드를 주는 글";
  if (intent === "review") return "경험과 후기를 공유하는 글";
  if (intent === "question") return "질문형 검색 의도를 노린 글";
  return "정보를 정리해 전달하는 글";
};

const inferAudience = (title: string, text: string) => {
  const source = `${title} ${text}`;
  if (/(입문|초보|처음|기초)/.test(source)) return "기초부터 빠르게 이해하려는 독자";
  if (intentComparisonMarkers.test(source)) return "선택지 비교가 필요한 독자";
  if (intentGuideMarkers.test(source)) return "바로 실행 가능한 방법을 찾는 독자";
  return "핵심만 빠르게 파악하려는 독자";
};

const qualityAreaLabel = (area: QualityArea) => {
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
      return "제목을 더 구체화하고 첫 문단에서 문제 상황을 바로 보여주세요.";
    case "readability":
      return "소제목과 짧은 문단, 목록을 넣어 스캔하기 쉽게 바꿔주세요.";
    case "value":
      return "예시, 체크리스트, 실행 순서를 더 넣어 실전성을 높여주세요.";
    case "originality":
      return "직접 경험이나 비교 포인트를 넣어 다른 글과 차이를 만들어주세요.";
    case "search-fit":
      return "질문형 소제목과 FAQ를 넣고 제목-본문 키워드 정렬을 더 맞춰주세요.";
  }
};

const isPenaltySignal = (key: keyof SignalBreakdown) => key === "genericTitlePenalty" || key === "redundancyPenalty";

const signalDefinitions: Record<keyof SignalBreakdown, { label: string; area: QualityArea }> = {
  titleLengthFit: { label: "제목 길이 적합도", area: "headline" },
  titleSpecificity: { label: "제목 구체성", area: "headline" },
  titleIntentMarker: { label: "제목 의도 표시", area: "headline" },
  hookPreview: { label: "도입부 훅", area: "headline" },
  titleBodyAlignment: { label: "제목-본문 정렬", area: "headline" },
  genericTitlePenalty: { label: "일반적 제목 패널티", area: "headline" },
  paragraphBalance: { label: "문단 균형", area: "readability" },
  headingCoverage: { label: "소제목 커버리지", area: "readability" },
  listCoverage: { label: "목록 활용", area: "readability" },
  sentencePace: { label: "문장 호흡", area: "readability" },
  scanability: { label: "스캔 가능성", area: "readability" },
  concreteDetailDensity: { label: "구체 정보 밀도", area: "value" },
  actionability: { label: "실행 가능성", area: "value" },
  exampleCoverage: { label: "예시 커버리지", area: "value" },
  referenceCoverage: { label: "근거/참고 커버리지", area: "value" },
  completeness: { label: "완성도", area: "value" },
  lexicalVariety: { label: "어휘 다양성", area: "originality" },
  experienceSignal: { label: "경험 신호", area: "originality" },
  siblingUniqueness: { label: "블로그 내 고유성", area: "originality" },
  redundancyPenalty: { label: "중복 패널티", area: "originality" },
  titleIntentMatch: { label: "제목 의도 일치", area: "search-fit" },
  keywordAlignment: { label: "키워드 정렬", area: "search-fit" },
  faqCoverage: { label: "FAQ 커버리지", area: "search-fit" },
  longTailSpecificity: { label: "롱테일 구체성", area: "search-fit" },
};

const buildSignalList = (signals: SignalBreakdown): NamedSignal[] =>
  Object.entries(signals).map(([key, score]) => ({
    key: key as keyof SignalBreakdown,
    score,
    label: signalDefinitions[key as keyof SignalBreakdown].label,
    area: signalDefinitions[key as keyof SignalBreakdown].area,
  }));

const buildEvidenceSnippets = (contentText: string, pattern: RegExp, limit = 2) =>
  buildSentences(contentText)
    .filter((sentence) => pattern.test(sentence))
    .slice(0, limit)
    .map((sentence) => `"${trimSnippet(sentence, 74)}"`);

const buildSignalEvidence = (
  signal: NamedSignal,
  input: Pick<AnalyzePostInput, "postTitle">,
  contentText: string,
  metrics: ContentMetrics,
) => {
  const titleLength = cleanText(input.postTitle).length;
  const titleTokens = tokenize(input.postTitle);
  const overlap = Math.round(metrics.titleBodyOverlapRatio * 100);
  const topicOverlap = Math.round(metrics.siblingTopicOverlapRatio * 100);
  const exampleSnippets = buildEvidenceSnippets(contentText, /예를 들어|예시|사례|케이스|sample|case|before|after/i);
  const experienceSnippets = buildEvidenceSnippets(contentText, /직접|경험|테스트|써보니|비교해보니|사용해보니/i);
  const faqSnippets = buildEvidenceSnippets(contentText, /faq|자주 묻는 질문|질문\s*\d|q\./i);

  switch (signal.key) {
    case "titleLengthFit":
      return [`제목 길이 ${titleLength}자`, titleLength < 18 ? "제목이 짧아 대상과 결과가 덜 보입니다." : "제목 길이는 적정 범위에 가깝습니다."];
    case "titleSpecificity":
      return [`제목 고유 토큰 ${new Set(titleTokens).size}개`, /\d/.test(input.postTitle) ? "숫자나 범위 표현이 있습니다." : "숫자·범위 표현이 없습니다."];
    case "titleIntentMarker":
      return [intentMarkers.test(input.postTitle) ? "방법·비교·정리 같은 의도 표식이 제목에 있습니다." : "방법·비교·정리 같은 의도 표식이 제목에 없습니다."];
    case "hookPreview":
      return [`첫 문단 길이 ${metrics.avgParagraphLength || cleanText(contentText.slice(0, 180)).length}자`, /\?|문제|결론|핵심|비교|방법/i.test(contentText.slice(0, 180)) ? "첫 문단에 문제나 방향 제시가 있습니다." : "첫 문단에서 문제·대상·결과 선언이 약합니다."];
    case "titleBodyAlignment":
    case "keywordAlignment":
      return [`제목-본문 겹침 ${overlap}%`, overlap < 35 ? "제목 핵심어가 본문 초반과 소제목에서 덜 반복됩니다." : "제목 핵심어가 본문에 어느 정도 반영됩니다."];
    case "genericTitlePenalty":
      return [`중복 제목 ${metrics.duplicateTitleCount}개`, titleTokens.length <= 2 ? "제목 토큰 수가 적어 일반적인 인상이 강합니다." : "제목 토큰 수는 충분한 편입니다."];
    case "paragraphBalance":
      return [`문단 ${metrics.paragraphCount}개`, `문단 평균 길이 ${metrics.avgParagraphLength}자`];
    case "headingCoverage":
      return [`소제목 ${metrics.headingCount}개`, metrics.headingCount === 0 ? "소제목이 없어 스캔이 어렵습니다." : "소제목이 있어 흐름이 구분됩니다."];
    case "listCoverage":
      return [`목록 ${metrics.listCount}개`, `체크리스트·단계 표식 ${metrics.stepMarkerCount}개`];
    case "sentencePace":
      return [`문장 ${metrics.sentenceCount}개`, `본문 ${metrics.contentLength}자`];
    case "scanability":
      return [`소제목 ${metrics.headingCount}개`, `목록 ${metrics.listCount}개 / 질문 ${metrics.questionCount}개`];
    case "concreteDetailDensity":
      return [`숫자·날짜 토큰 ${metrics.numericTokenCount}개`, `출처·링크 ${metrics.referenceCount}개`];
    case "actionability":
      return [`체크리스트·단계 표식 ${metrics.stepMarkerCount}개`, metrics.stepMarkerCount === 0 ? "실행 순서를 바로 따라갈 구조가 약합니다." : "실행 단계가 보입니다."];
    case "exampleCoverage":
      return exampleSnippets.length ? exampleSnippets : ["`예를 들어`, `예시`, `사례` 패턴이 감지되지 않았습니다."];
    case "referenceCoverage":
      return [`출처·링크 ${metrics.referenceCount}개`, metrics.referenceCount === 0 ? "근거 링크나 출처 표시가 없습니다." : "근거 링크가 포함되어 있습니다."];
    case "completeness":
      return [`본문 ${metrics.contentLength}자`, `문단 ${metrics.paragraphCount}개`];
    case "lexicalVariety":
      return [`고유 토큰 비율 ${Math.round(metrics.uniqueTokenRatio * 100)}%`];
    case "experienceSignal":
      return experienceSnippets.length ? experienceSnippets : ["`직접`, `경험`, `테스트`, `써보니` 패턴이 감지되지 않았습니다."];
    case "siblingUniqueness":
      return [`중복 제목 ${metrics.duplicateTitleCount}개`, `형제 글 주제 겹침 ${topicOverlap}%`];
    case "redundancyPenalty":
      return [`중복 제목 ${metrics.duplicateTitleCount}개`, `형제 글 주제 겹침 ${topicOverlap}%`];
    case "titleIntentMatch":
      return [`추정 의도 ${detectIntent(input.postTitle, contentText)}`, `질문 ${metrics.questionCount}개 / FAQ ${metrics.faqCount}개`];
    case "faqCoverage":
      return faqSnippets.length ? faqSnippets : [`FAQ ${metrics.faqCount}개`, `질문형 문장 ${metrics.questionCount}개`];
    case "longTailSpecificity":
      return [`제목 고유 토큰 ${new Set(titleTokens).size}개`, /\d/.test(input.postTitle) ? "제목에 숫자나 범위 표현이 있습니다." : "제목에 숫자·범위·대상 표현이 약합니다."];
    default:
      return [];
  }
};

type ExplainabilityInput = {
  postTitle: string;
  contentText: string;
  signalBreakdown: SignalBreakdown;
  contentMetrics: ContentMetrics;
  scores: Pick<PostAnalysis, "headlineScore" | "readabilityScore" | "valueScore" | "originalityScore" | "searchFitScore">;
};

const buildSignalFindings = (input: ExplainabilityInput): SignalFinding[] =>
  buildSignalList(input.signalBreakdown)
    .map((signal) => {
      const normalizedScore = isPenaltySignal(signal.key) ? clampScore(100 - signal.score) : signal.score;
      return {
        key: signal.key,
        label: signal.label,
        area: signal.area,
        score: normalizedScore,
        qualityGrade: qualityGrade(normalizedScore),
        evidence: buildSignalEvidence(signal, { postTitle: input.postTitle }, input.contentText, input.contentMetrics).slice(0, 4),
      };
    })
    .sort((left, right) => left.score - right.score);

const buildImprovementItem = (
  area: QualityArea,
  score: number,
  findings: SignalFinding[],
  metrics: ContentMetrics,
  postTitle: string,
) => {
  const byKey = (key: string) => findings.find((item) => item.key === key);
  if (area === "headline") {
    const titleIssue = byKey("titleSpecificity");
    const hookIssue = byKey("hookPreview");
    const genericIssue = byKey("genericTitlePenalty");
    const primary = [titleIssue, hookIssue, genericIssue].filter(Boolean).sort((left, right) => (left?.score ?? 100) - (right?.score ?? 100))[0];
    return {
      area,
      title: primary?.key === "hookPreview" ? "첫 문단에서 문제와 결과를 먼저 선언하세요." : "제목에 대상과 결과를 더 분명히 넣으세요.",
      score,
      qualityGrade: qualityGrade(score),
      reason:
        primary?.key === "genericTitlePenalty"
          ? `비슷한 제목이 ${metrics.duplicateTitleCount}개 보여 일반적인 인상이 강합니다.`
          : primary?.key === "hookPreview"
            ? "첫 문단에서 글의 문제와 기대 결과가 바로 보이지 않습니다."
            : "제목이 짧거나 범위 표현이 약해 클릭 이유가 덜 선명합니다.",
      evidence: primary?.evidence ?? [],
      actions: [
        /\d/.test(postTitle) ? "제목에 대상·상황·결과 순서를 더 분명히 배치하세요." : "제목에 대상, 조건, 결과 중 최소 2개를 넣어 다시 써보세요.",
        "첫 두 문장 안에 이 글이 해결하는 문제와 얻는 결과를 적으세요.",
      ],
    } satisfies ImprovementItem;
  }

  if (area === "readability") {
    const headingIssue = byKey("headingCoverage");
    const listIssue = byKey("listCoverage");
    const paragraphIssue = byKey("paragraphBalance");
    const primary = [headingIssue, listIssue, paragraphIssue].filter(Boolean).sort((left, right) => (left?.score ?? 100) - (right?.score ?? 100))[0];
    return {
      area,
      title: primary?.key === "headingCoverage" ? "본문을 소제목 기준으로 다시 쪼개세요." : "긴 문단을 나누고 목록 구조를 추가하세요.",
      score,
      qualityGrade: qualityGrade(score),
      reason:
        primary?.key === "headingCoverage"
          ? `소제목이 ${metrics.headingCount}개라서 스캔 포인트가 부족합니다.`
          : primary?.key === "listCoverage"
            ? `목록 ${metrics.listCount}개, 단계 표식 ${metrics.stepMarkerCount}개로 따라가기 구조가 약합니다.`
            : `문단 ${metrics.paragraphCount}개, 평균 ${metrics.avgParagraphLength}자로 문단 균형이 좋지 않습니다.`,
      evidence: primary?.evidence ?? [],
      actions: [
        "핵심 구간을 3개 전후 소제목으로 나누세요.",
        metrics.listCount === 0 ? "체크리스트나 번호 목록을 1개 이상 추가하세요." : "긴 문단을 2~3문장 단위로 분리하세요.",
      ],
    } satisfies ImprovementItem;
  }

  if (area === "value") {
    const exampleIssue = byKey("exampleCoverage");
    const actionIssue = byKey("actionability");
    const referenceIssue = byKey("referenceCoverage");
    const primary = [exampleIssue, actionIssue, referenceIssue].filter(Boolean).sort((left, right) => (left?.score ?? 100) - (right?.score ?? 100))[0];
    return {
      area,
      title:
        primary?.key === "exampleCoverage"
          ? "예시 문단을 추가해 실전성을 올리세요."
          : primary?.key === "referenceCoverage"
            ? "근거 링크나 출처를 붙여 설득력을 보강하세요."
            : "실행 순서와 체크리스트를 더 분명히 적으세요.",
      score,
      qualityGrade: qualityGrade(score),
      reason:
        primary?.key === "exampleCoverage"
          ? "실제 사례가 드러나는 문장이 거의 없어 독자가 바로 적용하기 어렵습니다."
          : primary?.key === "referenceCoverage"
            ? `출처·링크가 ${metrics.referenceCount}개라 근거가 약합니다.`
            : `단계 표식이 ${metrics.stepMarkerCount}개라 실행 순서가 충분히 드러나지 않습니다.`,
      evidence: primary?.evidence ?? [],
      actions: [
        primary?.key === "exampleCoverage" ? "실제 사례 1개를 `예를 들어`로 시작하는 문단으로 추가하세요." : "번호 목록으로 실행 순서를 3단계 이상 적으세요.",
        primary?.key === "referenceCoverage" ? "공식 문서나 비교 링크를 1~2개 붙이세요." : "마지막에 체크리스트 블록을 붙이세요.",
      ],
    } satisfies ImprovementItem;
  }

  if (area === "originality") {
    const experienceIssue = byKey("experienceSignal");
    const uniqueIssue = byKey("siblingUniqueness");
    const redundancyIssue = byKey("redundancyPenalty");
    const primary = [experienceIssue, uniqueIssue, redundancyIssue].filter(Boolean).sort((left, right) => (left?.score ?? 100) - (right?.score ?? 100))[0];
    return {
      area,
      title:
        primary?.key === "experienceSignal"
          ? "직접 경험이나 테스트 기준을 한 단락 넣으세요."
          : "다른 글과 다른 비교 포인트를 먼저 세우세요.",
      score,
      qualityGrade: qualityGrade(score),
      reason:
        primary?.key === "experienceSignal"
          ? "직접 써본 기준이나 비교 결과가 드러나는 문장이 부족합니다."
          : `비슷한 제목 ${metrics.duplicateTitleCount}개, 주제 겹침 ${Math.round(metrics.siblingTopicOverlapRatio * 100)}%로 차별점이 약합니다.`,
      evidence: primary?.evidence ?? [],
      actions: [
        primary?.key === "experienceSignal" ? "직접 해본 기준, 실패 사례, 선택 이유 중 1가지를 넣으세요." : "기존 글과 다른 비교 축 하나를 제목과 소제목에 반영하세요.",
        "결론 문단에 왜 이 글이 다른 글과 다른지 한 문장으로 적으세요.",
      ],
    } satisfies ImprovementItem;
  }

  const faqIssue = byKey("faqCoverage");
  const keywordIssue = byKey("keywordAlignment");
  const longTailIssue = byKey("longTailSpecificity");
  const primary = [faqIssue, keywordIssue, longTailIssue].filter(Boolean).sort((left, right) => (left?.score ?? 100) - (right?.score ?? 100))[0];
  return {
    area,
    title:
      primary?.key === "faqCoverage"
        ? "FAQ 블록과 질문형 소제목을 추가하세요."
        : primary?.key === "longTailSpecificity"
          ? "제목에 연도·대상·상황을 더 구체적으로 넣으세요."
          : "제목 핵심어를 본문 초반과 소제목에 더 맞추세요.",
    score,
    qualityGrade: qualityGrade(score),
    reason:
      primary?.key === "faqCoverage"
        ? `FAQ ${metrics.faqCount}개, 질문형 문장 ${metrics.questionCount}개로 질문 대응이 약합니다.`
        : primary?.key === "longTailSpecificity"
          ? "제목에 구체적 조건이나 범위 표현이 약합니다."
          : `제목-본문 겹침이 ${Math.round(metrics.titleBodyOverlapRatio * 100)}%라 검색 의도 정렬이 약합니다.`,
    evidence: primary?.evidence ?? [],
    actions: [
      primary?.key === "faqCoverage" ? "하단에 FAQ 2개 이상을 추가하세요." : "제목 핵심어를 첫 문단과 소제목에 한 번씩 다시 사용하세요.",
      primary?.key === "longTailSpecificity" ? "연도, 대상, 조건 중 1개 이상을 제목에 넣으세요." : "질문형 소제목 1개를 추가하세요.",
    ],
  } satisfies ImprovementItem;
};

export const buildExplainabilityDetails = (input: ExplainabilityInput) => {
  const signalFindings = buildSignalFindings(input);
  const rankedAreas: Array<[QualityArea, number]> = [
    ["headline", input.scores.headlineScore],
    ["readability", input.scores.readabilityScore],
    ["value", input.scores.valueScore],
    ["originality", input.scores.originalityScore],
    ["search-fit", input.scores.searchFitScore],
  ].sort((left, right) => left[1] - right[1]);

  const improvementItems = rankedAreas.slice(0, 3).map(([area, score]) =>
    buildImprovementItem(area, score, signalFindings.filter((item) => item.area === area), input.contentMetrics, input.postTitle),
  );

  return {
    signalFindings,
    improvementItems,
    weaknesses: improvementItems.map((item) => item.reason).slice(0, 5),
    improvements: improvementItems
      .map((item) => `${item.title} ${item.actions[0] ?? ""}`.trim())
      .slice(0, 5),
  };
};

const buildContentMetrics = (
  title: string,
  contentText: string,
  contentHtml: string | null | undefined,
  siblingContext?: PostSiblingContext,
): ContentMetrics => {
  const paragraphs = buildParagraphs(contentText, contentHtml);
  const sentences = buildSentences(contentText);
  const titleTokens = tokenize(title);
  const contentTokens = tokenize(contentText);
  const contentKeywordSet = new Set(contentTokens);
  const overlapCount = titleTokens.filter((token) => contentKeywordSet.has(token)).length;
  const overlapRatio = titleTokens.length ? overlapCount / titleTokens.length : 0;

  let headingCount = 0;
  let listCount = 0;
  let faqCount = 0;
  let referenceCount = 0;
  if (contentHtml) {
    const $ = load(contentHtml);
    headingCount = $("h1, h2, h3, h4, h5, h6").length;
    listCount = $("li").length;
    faqCount = $("h1, h2, h3, h4, h5, h6, strong, b")
      .map((_, element) => cleanText($(element).text()))
      .get()
      .filter((text) => /(faq|자주 묻는 질문|질문|q\.)/i.test(text)).length;
    referenceCount = $('a[href^="http"]').length;
  }

  const faqInlineCount = countMatches(contentText, /(faq|자주 묻는 질문|질문\s*\d|q\.)/gi);
  const questionCount = countMatches(contentText, /\?/g) + countMatches(contentText, /(왜|어떻게|무엇|which|what|why|how)\b/gi);
  const numericTokenCount = countMatches(contentText, /(\d{1,4}[./-]\d{1,2}([./-]\d{1,4})?|\d+%|\d+[명개원건회]|\d+)/g);
  const stepMarkerCount = countMatches(contentText, /(\bstep\s*\d+\b|\d+\.\s|\[\s?[x ]?\s?\]|단계|체크리스트|체크포인트|순서|준비물)/gi);
  const urlCount = countMatches(contentText, /https?:\/\/\S+/g);
  const tokenCount = contentTokens.length;
  const uniqueTokenRatio = tokenCount ? new Set(contentTokens).size / tokenCount : 0;
  const avgParagraphLength = paragraphs.length
    ? Math.round(paragraphs.reduce((sum, paragraph) => sum + paragraph.length, 0) / paragraphs.length)
    : 0;

  return {
    contentLength: cleanText(contentText).length,
    paragraphCount: paragraphs.length,
    avgParagraphLength,
    sentenceCount: sentences.length,
    headingCount,
    listCount,
    questionCount,
    faqCount: faqCount + faqInlineCount,
    numericTokenCount,
    stepMarkerCount,
    referenceCount: referenceCount + urlCount + countMatches(contentText, /(출처|참고|링크)/gi),
    uniqueTokenRatio: clampRatio(uniqueTokenRatio),
    titleBodyOverlapRatio: clampRatio(overlapRatio),
    duplicateTitleCount: siblingContext?.duplicateTitleCount ?? 0,
    siblingTopicOverlapRatio: clampRatio(siblingContext?.siblingTopicOverlapRatio ?? 0),
  };
};

const scoreTitleLengthFit = (title: string) =>
  scoreFromIdeal(cleanText(title).length, { idealMin: 18, idealMax: 42, outerMin: 8, outerMax: 72 });

const scoreTitleSpecificity = (title: string, titleTokens: string[]) => {
  const uniqueCount = new Set(titleTokens).size;
  const hasNumber = /\d/.test(title);
  const hasQualifier = /(초보|비교|추천|체크|실전|예시|가이드|후기|정리|TOP|best)/i.test(title);
  return clampScore(34 + uniqueCount * 12 + (hasNumber ? 12 : 0) + (hasQualifier ? 14 : 0));
};

const scoreTitleIntentMarker = (title: string) => {
  if (intentMarkers.test(title)) return 88;
  if (/\?/.test(title) || /\d/.test(title)) return 70;
  return 46;
};

const scoreHookPreview = (opening: string) => {
  const openingLength = cleanText(opening).length;
  const lengthScore = scoreFromIdeal(openingLength, { idealMin: 70, idealMax: 180, outerMin: 20, outerMax: 320 });
  const signalBonus = (/\?/.test(opening) ? 8 : 0) + (/(문제|고민|핵심|바로|먼저|실제로|결론)/.test(opening) ? 10 : 0);
  return clampScore(lengthScore * 0.8 + signalBonus);
};

const scoreParagraphBalance = (paragraphCount: number, avgParagraphLength: number) =>
  clampScore(
    scoreFromIdeal(paragraphCount, { idealMin: 4, idealMax: 10, outerMin: 1, outerMax: 18 }) * 0.55 +
      scoreFromIdeal(avgParagraphLength, { idealMin: 55, idealMax: 180, outerMin: 20, outerMax: 360 }) * 0.45,
  );

const scoreHeadingCoverage = (headingCount: number, paragraphCount: number, contentLength: number) => {
  if (contentLength < 500) return headingCount > 0 ? 72 : 58;
  if (headingCount === 0) return 24;
  return clampScore(40 + Math.min(headingCount, Math.max(1, Math.floor(paragraphCount / 2))) * 18);
};

const scoreListCoverage = (listCount: number, stepMarkerCount: number, contentLength: number) => {
  if (contentLength < 450) return listCount > 0 || stepMarkerCount > 0 ? 70 : 52;
  return clampScore(28 + Math.min(listCount * 10 + stepMarkerCount * 6, 72));
};

const scoreSentencePace = (contentLength: number, sentenceCount: number) => {
  const avgSentenceLength = sentenceCount ? Math.round(contentLength / sentenceCount) : contentLength;
  return scoreFromIdeal(avgSentenceLength, { idealMin: 28, idealMax: 90, outerMin: 12, outerMax: 180 });
};

const scoreScanability = (metrics: ContentMetrics) => {
  const structuralBonus = metrics.headingCount * 8 + metrics.listCount * 4 + metrics.questionCount * 2;
  return clampScore(
    22 +
      Math.min(structuralBonus, 52) +
      scoreFromIdeal(metrics.paragraphCount, { idealMin: 4, idealMax: 10, outerMin: 1, outerMax: 18 }) * 0.26,
  );
};

const scoreConcreteDetailDensity = (metrics: ContentMetrics) => {
  const ratio = metrics.contentLength ? metrics.numericTokenCount / metrics.contentLength : 0;
  return clampScore(30 + Math.min(ratio * 4000, 45) + Math.min(metrics.referenceCount * 6, 15));
};

const scoreActionability = (metrics: ContentMetrics, title: string, text: string) => {
  const markerBonus = metrics.stepMarkerCount * 10 + countMatches(`${title} ${text}`, actionMarkers) * 4;
  return clampScore(26 + Math.min(markerBonus, 60));
};

const scoreExampleCoverage = (text: string) =>
  clampScore(30 + Math.min(countMatches(text, /예시|예를 들어|case|sample|직접|실제로|before|after/gi) * 14, 60));

const scoreReferenceCoverage = (metrics: ContentMetrics, text: string) =>
  clampScore(25 + Math.min(metrics.referenceCount * 16 + countMatches(text, /(출처|참고|링크)/gi) * 8, 65));

const scoreCompleteness = (metrics: ContentMetrics) =>
  clampScore(
    scoreFromIdeal(metrics.contentLength, { idealMin: 900, idealMax: 3200, outerMin: 250, outerMax: 6000 }) * 0.55 +
      scoreFromIdeal(metrics.paragraphCount, { idealMin: 4, idealMax: 11, outerMin: 1, outerMax: 18 }) * 0.45,
  );

const scoreLexicalVariety = (metrics: ContentMetrics) =>
  clampScore(Math.max(20, Math.min(100, metrics.uniqueTokenRatio * 160)));

const scoreExperienceSignal = (text: string) =>
  clampScore(26 + Math.min(countMatches(text, /직접|경험|겪|써보|실험|테스트|운영해보|비교해보/gi) * 16, 68));

const scoreSiblingUniqueness = (duplicateTitleCount: number, siblingTopicOverlapRatio: number) =>
  clampScore(100 - duplicateTitleCount * 14 - siblingTopicOverlapRatio * 45);

const scoreRedundancyPenalty = (duplicateTitleCount: number, siblingTopicOverlapRatio: number) =>
  clampScore(duplicateTitleCount * 18 + siblingTopicOverlapRatio * 52);

const scoreTitleIntentMatch = (title: string, text: string, metrics: ContentMetrics) => {
  const intent = detectIntent(title, text);
  if (intent === "guide") return clampScore(40 + metrics.stepMarkerCount * 10 + metrics.headingCount * 6);
  if (intent === "comparison") return clampScore(46 + countMatches(text, /(비교|장점|단점|차이|vs|대신)/gi) * 9);
  if (intent === "review") return clampScore(38 + countMatches(text, /(사용|후기|느낌|장점|단점|경험)/gi) * 8);
  if (intent === "question") return clampScore(34 + metrics.questionCount * 8 + metrics.faqCount * 10);
  return clampScore(42 + metrics.titleBodyOverlapRatio * 38);
};

const scoreKeywordAlignment = (metrics: ContentMetrics) => clampScore(22 + metrics.titleBodyOverlapRatio * 78);
const scoreFaqCoverage = (metrics: ContentMetrics) => clampScore(26 + Math.min(metrics.faqCount * 22 + metrics.questionCount * 3, 68));

const scoreLongTailSpecificity = (title: string, titleTokens: string[]) =>
  clampScore(
    28 +
      Math.min(new Set(titleTokens).size * 12, 36) +
      (/\d/.test(title) ? 10 : 0) +
      (/(초보|실전|비교|추천|체크|방법|정리|예시|템플릿|세팅)/i.test(title) ? 20 : 0),
  );

const buildSignals = (
  input: AnalyzePostInput,
  metrics: ContentMetrics,
  titleTokens: string[],
  contentText: string,
): SignalBreakdown => {
  const paragraphs = buildParagraphs(contentText, input.contentHtml);
  const opening = paragraphs[0] ?? contentText.slice(0, 180);
  const duplicateTitleCount = input.siblingContext?.duplicateTitleCount ?? 0;
  const siblingTopicOverlapRatio = input.siblingContext?.siblingTopicOverlapRatio ?? 0;

  return {
    titleLengthFit: scoreTitleLengthFit(input.postTitle),
    titleSpecificity: scoreTitleSpecificity(input.postTitle, titleTokens),
    titleIntentMarker: scoreTitleIntentMarker(input.postTitle),
    hookPreview: scoreHookPreview(opening),
    titleBodyAlignment: clampScore(metrics.titleBodyOverlapRatio * 100),
    genericTitlePenalty: clampScore(duplicateTitleCount * 12 + (titleTokens.length <= 2 ? 12 : 0)),
    paragraphBalance: scoreParagraphBalance(metrics.paragraphCount, metrics.avgParagraphLength),
    headingCoverage: scoreHeadingCoverage(metrics.headingCount, metrics.paragraphCount, metrics.contentLength),
    listCoverage: scoreListCoverage(metrics.listCount, metrics.stepMarkerCount, metrics.contentLength),
    sentencePace: scoreSentencePace(metrics.contentLength, metrics.sentenceCount),
    scanability: scoreScanability(metrics),
    concreteDetailDensity: scoreConcreteDetailDensity(metrics),
    actionability: scoreActionability(metrics, input.postTitle, contentText),
    exampleCoverage: scoreExampleCoverage(contentText),
    referenceCoverage: scoreReferenceCoverage(metrics, contentText),
    completeness: scoreCompleteness(metrics),
    lexicalVariety: scoreLexicalVariety(metrics),
    experienceSignal: scoreExperienceSignal(contentText),
    siblingUniqueness: scoreSiblingUniqueness(duplicateTitleCount, siblingTopicOverlapRatio),
    redundancyPenalty: scoreRedundancyPenalty(duplicateTitleCount, siblingTopicOverlapRatio),
    titleIntentMatch: scoreTitleIntentMatch(input.postTitle, contentText, metrics),
    keywordAlignment: scoreKeywordAlignment(metrics),
    faqCoverage: scoreFaqCoverage(metrics),
    longTailSpecificity: scoreLongTailSpecificity(input.postTitle, titleTokens),
  };
};

const buildScoresFromSignals = (signals: SignalBreakdown) => {
  const headlineScore = clampScore(
    signals.titleLengthFit * 0.3 +
      signals.titleSpecificity * 0.3 +
      signals.titleIntentMarker * 0.15 +
      signals.hookPreview * 0.15 +
      signals.titleBodyAlignment * 0.1 -
      signals.genericTitlePenalty,
  );
  const readabilityScore = weightedScore([
    [signals.paragraphBalance, 0.25],
    [signals.headingCoverage, 0.2],
    [signals.listCoverage, 0.15],
    [signals.sentencePace, 0.2],
    [signals.scanability, 0.2],
  ]);
  const valueScore = weightedScore([
    [signals.concreteDetailDensity, 0.25],
    [signals.actionability, 0.25],
    [signals.exampleCoverage, 0.2],
    [signals.referenceCoverage, 0.15],
    [signals.completeness, 0.15],
  ]);
  const originalityScore = weightedScore([
    [signals.lexicalVariety, 0.3],
    [signals.experienceSignal, 0.25],
    [signals.siblingUniqueness, 0.25],
    [100 - signals.redundancyPenalty, 0.2],
  ]);
  const searchFitScore = weightedScore([
    [signals.titleIntentMatch, 0.35],
    [signals.keywordAlignment, 0.25],
    [signals.faqCoverage, 0.2],
    [signals.longTailSpecificity, 0.2],
  ]);
  const qualityScore = clampScore(
    headlineScore * 0.18 +
      readabilityScore * 0.24 +
      valueScore * 0.26 +
      originalityScore * 0.14 +
      searchFitScore * 0.18,
  );

  return {
    headlineScore,
    readabilityScore,
    valueScore,
    originalityScore,
    searchFitScore,
    qualityScore,
    qualityStatus: qualityStatus(qualityScore),
  } as const;
};

const buildTopDrivers = (signals: SignalBreakdown) =>
  buildSignalList(signals)
    .filter((signal) => signal.key !== "genericTitlePenalty" && signal.key !== "redundancyPenalty")
    .sort((left, right) => right.score - left.score)
    .slice(0, 3)
    .map((signal) => `${signal.label} ${gradeText(signal.score)}`);

const buildTopRisks = (signals: SignalBreakdown) => {
  const normalized = buildSignalList(signals).map((signal) => ({
    ...signal,
    effectiveScore:
      signal.key === "genericTitlePenalty" || signal.key === "redundancyPenalty" ? 100 - signal.score : signal.score,
  }));
  return normalized
    .sort((left, right) => left.effectiveScore - right.effectiveScore)
    .slice(0, 3)
    .map((signal) => `${signal.label} ${gradeText(clampScore(signal.effectiveScore))}`);
};

const buildStrengths = (
  scores: Pick<PostAnalysis, "headlineScore" | "readabilityScore" | "valueScore" | "originalityScore" | "searchFitScore">,
  metrics: ContentMetrics,
  drivers: string[],
) => {
  const strengths: string[] = [...drivers];
  if (scores.readabilityScore >= 72 && metrics.headingCount > 0) strengths.push("소제목이 있어 읽는 흐름이 비교적 안정적입니다.");
  if (scores.valueScore >= 72 && metrics.stepMarkerCount > 0) strengths.push("실행 단계가 보여 실전형 정보로 읽힙니다.");
  if (scores.originalityScore >= 70 && metrics.duplicateTitleCount === 0) strengths.push("블로그 안에서 제목과 관점이 비교적 고유합니다.");
  return Array.from(new Set(strengths)).slice(0, 5);
};

const buildWeaknesses = (
  scores: Pick<PostAnalysis, "headlineScore" | "readabilityScore" | "valueScore" | "originalityScore" | "searchFitScore">,
  metrics: ContentMetrics,
) => {
  const weaknesses: string[] = [];
  if (scores.headlineScore < 60) weaknesses.push("제목과 첫 문단에서 글의 목적이 선명하게 잡히지 않습니다.");
  if (scores.readabilityScore < 60) weaknesses.push("소제목, 문단 분리, 목록 활용이 부족해 스캔성이 약합니다.");
  if (scores.valueScore < 60) weaknesses.push("예시나 실행 단계가 부족해 실전 정보 밀도가 낮습니다.");
  if (scores.originalityScore < 60) weaknesses.push("형제 글과 겹치는 제목/주제가 보여 차별성이 약합니다.");
  if (scores.searchFitScore < 60) weaknesses.push("질문형 소제목과 FAQ, 제목-본문 정렬이 약합니다.");
  if (!weaknesses.length && metrics.referenceCount === 0) weaknesses.push("참고 링크나 근거 표시가 적어 신뢰 신호가 약합니다.");
  return weaknesses.slice(0, 5);
};

const buildSeoNotes = (title: string, metrics: ContentMetrics, topics: string[]) => {
  const notes = [
    "핵심 키워드는 제목, 첫 문단, 소제목에 같은 표현으로 정렬하세요.",
    "질문형 소제목 2개와 FAQ 1개만 추가해도 검색 의도 대응력이 좋아집니다.",
  ];
  if (topics.length) notes.unshift(`반복 핵심어 후보: ${topics.slice(0, 3).join(", ")}`);
  if (!/\d/.test(title)) notes.push("제목에 숫자, 대상, 범위를 넣으면 롱테일 구체성이 올라갈 수 있습니다.");
  if (metrics.faqCount === 0) notes.push("하단에 짧은 FAQ 블록을 넣어 질문형 검색을 보완해보세요.");
  return Array.from(new Set(notes)).slice(0, 4);
};

const buildSummary = (title: string, text: string, qualityScore: number, topDrivers: string[], topRisks: string[]) => {
  const preview = cleanText(text).slice(0, 120);
  const driver = topDrivers[0] ?? "강점 신호";
  const risk = topRisks[0] ?? "보완 신호";
  return `${title} 글은 ${gradeText(qualityScore)}로 분류됐습니다. ${driver}이 돋보이지만 ${risk}에서 보완 여지가 보입니다. ${preview}${preview.length >= 120 ? "..." : ""}`;
};

const buildEngagementNote = (input: AnalyzePostInput) => {
  const values = Object.values(input.engagement ?? {}).filter((value): value is number => typeof value === "number");
  if (!values.length || values.every((value) => value <= 0)) {
    return "공개 참여 지표가 없어 본문 구조와 정보 신호 중심으로 평가했습니다.";
  }
  return "공개 참여 지표는 참고용으로만 보고, 등급은 본문 구조와 정보 신호로 계산했습니다.";
};

const buildTopicLabels = (title: string, text: string) => {
  const combined = [...tokenize(title), ...topKeywords(tokenize(text), 6)];
  return Array.from(new Set(combined)).slice(0, 5);
};

export const buildNarrativeFromAnalysis = (analysis: PostAnalysis): PostNarrative => ({
  summary: analysis.summary,
  targetAudienceGuess: analysis.targetAudienceGuess,
  intentGuess: analysis.intentGuess,
  topicLabels: analysis.topicLabels,
  strengths: analysis.strengths,
  weaknesses: analysis.weaknesses,
  improvements: analysis.improvements,
  seoNotes: analysis.seoNotes,
  engagementAdjustmentNote: analysis.engagementAdjustmentNote,
});

export const heuristicPostAnalysis = (input: AnalyzePostInput): ProviderResult<PostAnalysis> => {
  const contentText = cleanText(input.contentText);
  const titleTokens = tokenize(input.postTitle);
  const metrics = input.contentMetrics ?? buildContentMetrics(input.postTitle, contentText, input.contentHtml, input.siblingContext);
  const signals = buildSignals(input, metrics, titleTokens, contentText);
  const scores = buildScoresFromSignals(signals);
  const topics = buildTopicLabels(input.postTitle, contentText);
  const topScoreDrivers = buildTopDrivers(signals);
  const topScoreRisks = buildTopRisks(signals);
  const explainability = buildExplainabilityDetails({
    postTitle: input.postTitle,
    contentText,
    signalBreakdown: signals,
    contentMetrics: metrics,
    scores,
  });

  const analysis: PostAnalysis = {
    summary: buildSummary(input.postTitle, contentText, scores.qualityScore, topScoreDrivers, topScoreRisks),
    targetAudienceGuess: inferAudience(input.postTitle, contentText),
    intentGuess: inferIntent(input.postTitle, contentText),
    topicLabels: topics,
    strengths: buildStrengths(scores, metrics, topScoreDrivers),
    weaknesses: explainability.weaknesses.length ? explainability.weaknesses : buildWeaknesses(scores, metrics),
    improvements: explainability.improvements,
    seoNotes: buildSeoNotes(input.postTitle, metrics, topics),
    titleStrength: clampScore((signals.titleLengthFit + signals.titleSpecificity + signals.titleIntentMarker) / 3),
    hookStrength: clampScore((signals.hookPreview + signals.titleBodyAlignment + (100 - signals.genericTitlePenalty)) / 3),
    structureScore: clampScore(
      (signals.paragraphBalance + signals.headingCoverage + signals.listCoverage + signals.sentencePace + signals.scanability) / 5,
    ),
    informationDensityScore: clampScore((signals.concreteDetailDensity + signals.exampleCoverage + signals.referenceCoverage) / 3),
    practicalityScore: clampScore((signals.actionability + signals.completeness) / 2),
    differentiationScore: clampScore((signals.lexicalVariety + signals.experienceSignal + signals.siblingUniqueness) / 3),
    seoPotentialScore: clampScore((signals.titleIntentMatch + signals.keywordAlignment + signals.longTailSpecificity) / 3),
    audienceFitScore: clampScore((signals.keywordAlignment + signals.faqCoverage + signals.actionability) / 3),
    headlineScore: scores.headlineScore,
    readabilityScore: scores.readabilityScore,
    valueScore: scores.valueScore,
    originalityScore: scores.originalityScore,
    searchFitScore: scores.searchFitScore,
    qualityScore: scores.qualityScore,
    qualityStatus: scores.qualityStatus,
    qualityGrade: qualityGrade(scores.qualityScore),
    signalBreakdown: signals,
    contentMetrics: metrics,
    signalFindings: explainability.signalFindings,
    improvementItems: explainability.improvementItems,
    topScoreDrivers,
    topScoreRisks,
    engagementAdjustmentNote: buildEngagementNote(input),
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

type PostForSummary = SummarizeWeekInput["postAnalyses"][number];

const averageArea = (
  items: Array<{ analysis: PostAnalysis }>,
  key: keyof Pick<PostAnalysis, "headlineScore" | "readabilityScore" | "valueScore" | "originalityScore" | "searchFitScore" | "qualityScore">,
) => average(items.map((item) => Number(item.analysis[key] ?? 0)));

const summarizeRepeatedTitles = (items: PostForSummary[]) => {
  const counts = new Map<string, number>();
  for (const item of items) {
    const normalized = normalizeTitle(item.title);
    if (!normalized) continue;
    counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
  }
  return Array.from(counts.values()).filter((count) => count > 1).length;
};

const areaReason = (area: QualityArea, score: number) => `${qualityAreaLabel(area)} ${gradeText(score)}`;

export const topIssuesFromAnalysis = (
  analysis: Pick<PostAnalysis, "headlineScore" | "readabilityScore" | "valueScore" | "originalityScore" | "searchFitScore">,
) =>
  ([
    ["headline", analysis.headlineScore],
    ["readability", analysis.readabilityScore],
    ["value", analysis.valueScore],
    ["originality", analysis.originalityScore],
    ["search-fit", analysis.searchFitScore],
  ] as Array<[QualityArea, number]>)
    .sort((left, right) => left[1] - right[1])
    .filter(([, score]) => score < 65)
    .slice(0, 3)
    .map(([area]) => qualityAreaLabel(area));

export const heuristicAnalysisSummary = (input: SummarizeWeekInput): ProviderResult<AnalysisSummary> => {
  const analyses = input.postAnalyses;
  const topics = new Map<string, number>();

  for (const item of analyses) {
    for (const topic of item.analysis.topicLabels) {
      topics.set(topic, (topics.get(topic) ?? 0) + 1);
    }
  }

  const rankedTopics = Array.from(topics.entries()).sort((left, right) => right[1] - left[1]);
  const topicOverlap = rankedTopics.filter(([, count]) => count > 1).slice(0, 5).map(([topic]) => topic);
  const topicGaps = ["비교형 글", "FAQ형 글", "체크리스트형 글", "초보자 가이드"].filter(
    (topic) => !topicOverlap.includes(topic),
  );

  const headlineScore = averageArea(analyses, "headlineScore");
  const readabilityScore = averageArea(analyses, "readabilityScore");
  const valueScore = averageArea(analyses, "valueScore");
  const originalityScore = averageArea(analyses, "originalityScore");
  const searchFitScore = averageArea(analyses, "searchFitScore");
  const qualityScore = averageArea(analyses, "qualityScore");
  const status = qualityStatus(qualityScore);

  const weakestAreas = [
    ["headline", headlineScore],
    ["readability", readabilityScore],
    ["value", valueScore],
    ["originality", originalityScore],
    ["search-fit", searchFitScore],
  ]
    .sort((left, right) => Number(left[1]) - Number(right[1]))
    .slice(0, 2) as Array<[QualityArea, number]>;

  const summary: AnalysisSummary = {
    overallSummary: `${input.blogName}의 최신 분석은 평균 ${gradeText(qualityScore)}입니다. ${weakestAreas
      .map(([area]) => qualityAreaLabel(area))
      .join(", ")} 영역에서 먼저 개선 여지가 보입니다. 최근 글 중심으로 구조와 키워드 정렬, 실전 예시를 보강하면 체감 개선폭이 큽니다.`,
    topicOverlap,
    topicGaps: topicGaps.slice(0, 5),
    blogComparisons: [
      `현재 블로그는 읽기 흐름 ${gradeText(readabilityScore)}, 정보 가치 ${gradeText(valueScore)}, 검색 적합성 ${gradeText(searchFitScore)} 수준입니다.`,
      `반복 제목 경고는 ${summarizeRepeatedTitles(analyses)}건으로 집계되었습니다.`,
    ],
    priorityActions: weakestAreas.map(([area]) => areaAction(area)),
    nextWeekTopics: topicGaps.slice(0, 3),
    blogScores: [
      {
        blogId: "pending",
        blogName: input.blogName,
        postCount: analyses.length,
        avgTitleStrength: average(analyses.map((item) => item.analysis.titleStrength)),
        avgHookStrength: average(analyses.map((item) => item.analysis.hookStrength)),
        avgStructureScore: average(analyses.map((item) => item.analysis.structureScore)),
        avgInformationDensityScore: average(analyses.map((item) => item.analysis.informationDensityScore)),
        avgPracticalityScore: average(analyses.map((item) => item.analysis.practicalityScore)),
        avgDifferentiationScore: average(analyses.map((item) => item.analysis.differentiationScore)),
        avgSeoPotentialScore: average(analyses.map((item) => item.analysis.seoPotentialScore)),
        avgAudienceFitScore: average(analyses.map((item) => item.analysis.audienceFitScore)),
        topicDiversityScore: clampScore(rankedTopics.length * 14 + 20),
        publishingConsistencyScore: analyses.length >= 8 ? 88 : analyses.length >= 4 ? 74 : 58,
        freshnessScore: analyses.length ? 78 : 40,
        engagementScore: averageRounded(analyses.map((item) => item.analysis.searchFitScore)),
        qualityScore: Math.round(qualityScore),
        status,
        qualityGrade: qualityGrade(qualityScore),
        reasons: weakestAreas.map(([area, score]) => areaReason(area, score)),
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
  const lowestPost = [...input.postAnalyses].sort((left, right) => left.analysis.qualityScore - right.analysis.qualityScore)[0];
  const repeatedTitleWarning = summarizeRepeatedTitles(input.postAnalyses);

  return {
    data: [
      {
        recommendationType: "post-fix",
        priority: 92,
        title: "가장 약한 글부터 다시 다듬기",
        description: lowestPost
          ? `"${lowestPost.title}"은 ${gradeText(lowestPost.analysis.qualityScore)}라서 가장 먼저 손볼 가치가 큽니다.`
          : "낮은 등급 글부터 구조와 제목을 다시 정리하세요.",
        actionItems: lowestPost?.analysis.improvements.slice(0, 3) ?? [
          areaAction("headline"),
          areaAction("value"),
          areaAction("search-fit"),
        ],
        blogId: null,
      },
      {
        recommendationType: "structure",
        priority: repeatedTitleWarning > 0 ? 84 : 76,
        title: "반복 제목과 포맷 패턴 줄이기",
        description:
          repeatedTitleWarning > 0
            ? `같은 결의 제목이 반복되어 ${repeatedTitleWarning}건의 중복 경고가 잡혔습니다.`
            : "글 구조가 단조로우면 등급 분화가 줄어들기 때문에 포맷을 섞는 편이 좋습니다.",
        actionItems: [
          "비교형, 체크리스트형, FAQ형 포맷을 섞어보세요.",
          "제목에 대상, 범위, 숫자 같은 구체 요소를 넣어주세요.",
          "소제목과 목록을 넣어 스캔 구조를 선명하게 만들어주세요.",
        ],
        blogId: null,
      },
      {
        recommendationType: "content-mix",
        priority: 72,
        title: "다음 글은 검색 의도형으로 설계하기",
        description: `다음 주에는 ${summary.nextWeekTopics.join(", ") || "FAQ형 또는 비교형"} 주제를 우선 검토해보세요.`,
        actionItems: [
          "질문형 소제목 2개 이상 배치하기",
          "하단 FAQ 1개와 체크리스트 1개 넣기",
          "직접 경험이나 테스트 결과를 1문단 이상 넣기",
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
