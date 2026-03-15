const scoreToGrade = (score: number) => {
  if (score >= 90) return "S";
  if (score >= 80) return "A";
  if (score >= 65) return "B";
  if (score >= 55) return "C";
  if (score >= 45) return "D";
  return "F";
};

export const qualityTone = (score: number | null) => {
  if (score == null) return { label: "미분석", tone: "neutral" as const };

  const grade = scoreToGrade(score);
  if (grade === "S" || grade === "A") return { label: grade, tone: "good" as const };
  if (grade === "B" || grade === "C") return { label: grade, tone: "watch" as const };
  return { label: grade, tone: "risk" as const };
};

export const formatGrade = (score: number | null) => (score == null ? "-" : scoreToGrade(score));

export const formatGradeLabel = (score: number | null) => (score == null ? "미분석" : `${scoreToGrade(score)} grade`);

export const formatGradeRange = (min: number | null, max: number | null) => {
  if (min == null || max == null) return "-";
  const minGrade = scoreToGrade(min);
  const maxGrade = scoreToGrade(max);
  return minGrade === maxGrade ? minGrade : `${minGrade} ~ ${maxGrade}`;
};

export const gradeFromScore = scoreToGrade;
