interface TrendPoint {
  startedAt: string;
  qualityScore: number;
}

export function TrendSparkline({ points }: { points: TrendPoint[] }) {
  if (!points.length) {
    return <div className="empty-chart">No history yet</div>;
  }

  const sorted = [...points].reverse();
  const max = Math.max(...sorted.map((point) => point.qualityScore), 100);
  const min = Math.min(...sorted.map((point) => point.qualityScore), 0);
  const width = 240;
  const height = 80;
  const step = sorted.length === 1 ? width : width / (sorted.length - 1);
  const path = sorted
    .map((point, index) => {
      const x = index * step;
      const ratio = max === min ? 0.5 : (point.qualityScore - min) / (max - min);
      const y = height - ratio * height;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg className="trend" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Quality score trend">
      <path d={path} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
