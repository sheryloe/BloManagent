export interface EbiInput {
  publishingConsistency: number;
  topicDiversity: number;
  contentQuality: number;
  structureScore: number;
  practicalityScore: number;
  seoPotential: number;
  audienceFit: number;
  freshness: number;
  engagementScore?: number | null;
}

const clamp = (value: number) => Math.max(0, Math.min(100, value));

export const calculateEbi = (input: EbiInput) => {
  const base =
    0.15 * input.publishingConsistency +
    0.1 * input.topicDiversity +
    0.15 * input.contentQuality +
    0.1 * input.structureScore +
    0.15 * input.practicalityScore +
    0.15 * input.seoPotential +
    0.1 * input.audienceFit +
    0.1 * input.freshness;

  if (input.engagementScore == null) {
    return clamp(base);
  }

  return clamp(base * 0.9 + input.engagementScore * 0.1);
};

export const ebiStatus = (score: number) => {
  if (score >= 85) return "excellent";
  if (score >= 70) return "strong";
  if (score >= 55) return "watch";
  return "weak";
};
