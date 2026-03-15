import { describe, expect, it } from "vitest";
import { calculateQualityComponents, qualityStatus } from "./score";

describe("calculateQualityComponents", () => {
  it("returns explainable component scores and a bounded overall quality score", () => {
    const result = calculateQualityComponents({
      titleStrength: 84,
      hookStrength: 76,
      structureScore: 72,
      informationDensityScore: 68,
      practicalityScore: 74,
      differentiationScore: 71,
      seoPotentialScore: 79,
      audienceFitScore: 73,
    });

    expect(result.headlineScore).toBe(80);
    expect(result.readabilityScore).toBe(72);
    expect(result.valueScore).toBe(71);
    expect(result.originalityScore).toBe(71);
    expect(result.searchFitScore).toBe(76);
    expect(result.qualityScore).toBe(74);
    expect(result.qualityStatus).toBe("solid");
  });

  it("maps score ranges to statuses", () => {
    expect(qualityStatus(80)).toBe("excellent");
    expect(qualityStatus(65)).toBe("solid");
    expect(qualityStatus(50)).toBe("watch");
    expect(qualityStatus(49)).toBe("needs-work");
  });
});
