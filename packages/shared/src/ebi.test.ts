import { describe, expect, it } from "vitest";
import { calculateEbi, ebiStatus } from "./ebi";

describe("calculateEbi", () => {
  it("returns a bounded weighted score", () => {
    const score = calculateEbi({
      publishingConsistency: 80,
      topicDiversity: 70,
      contentQuality: 90,
      structureScore: 85,
      practicalityScore: 88,
      seoPotential: 75,
      audienceFit: 82,
      freshness: 78,
      engagementScore: 65,
    });

    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(100);
    expect(ebiStatus(score)).toBe("strong");
  });
});
