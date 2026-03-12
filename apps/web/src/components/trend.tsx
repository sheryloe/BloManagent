interface TrendPoint {
  startedAt: string;
  ebiScore: number;
}

export function TrendSparkline({ points }: { points: TrendPoint[] }) {
  if (!points.length) {
    return <div className="empty-chart">이력 없음</div>;
  }

  const sorted = [...points].reverse();
  const max = Math.max(...sorted.map((point) => point.ebiScore), 100);
  const min = Math.min(...sorted.map((point) => point.ebiScore), 0);
  const width = 240;
  const height = 80;
  const step = sorted.length === 1 ? width : width / (sorted.length - 1);
  const path = sorted
    .map((point, index) => {
      const x = index * step;
      const ratio = max === min ? 0.5 : (point.ebiScore - min) / (max - min);
      const y = height - ratio * height;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg className="trend" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="EBI trend">
      <path d={path} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
