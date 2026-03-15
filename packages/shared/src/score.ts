export type QualityStatus = "excellent" | "solid" | "watch" | "needs-work";

export interface QualityScoreInput {
  titleStrength: number;
  hookStrength: number;
  structureScore: number;
  informationDensityScore: number;
  practicalityScore: number;
  differentiationScore: number;
  seoPotentialScore: number;
  audienceFitScore: number;
}

export interface QualityComponents {
  headlineScore: number;
  readabilityScore: number;
  valueScore: number;
  originalityScore: number;
  searchFitScore: number;
  qualityScore: number;
  qualityStatus: QualityStatus;
}

const clamp = (value: number) => Math.max(0, Math.min(100, Math.round(value)));
const average = (values: number[]) => {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

export const qualityStatus = (score: number): QualityStatus => {
  if (score >= 80) return "excellent";
  if (score >= 65) return "solid";
  if (score >= 50) return "watch";
  return "needs-work";
};

export const calculateQualityComponents = (input: QualityScoreInput): QualityComponents => {
  const headlineScore = clamp(average([input.titleStrength, input.hookStrength]));
  const readabilityScore = clamp(input.structureScore);
  const valueScore = clamp(average([input.informationDensityScore, input.practicalityScore]));
  const originalityScore = clamp(input.differentiationScore);
  const searchFitScore = clamp(average([input.seoPotentialScore, input.audienceFitScore]));
  const qualityScore = clamp(average([headlineScore, readabilityScore, valueScore, originalityScore, searchFitScore]));

  return {
    headlineScore,
    readabilityScore,
    valueScore,
    originalityScore,
    searchFitScore,
    qualityScore,
    qualityStatus: qualityStatus(qualityScore),
  };
};
