import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api";
import { TrendSparkline } from "../components/trend";

const qualityTone = (score: number | null) => {
  if (score == null) return { label: "미분석", tone: "neutral" as const };
  if (score >= 80) return { label: "우수", tone: "good" as const };
  if (score >= 65) return { label: "안정", tone: "watch" as const };
  if (score >= 50) return { label: "주의", tone: "watch" as const };
  return { label: "보완 필요", tone: "risk" as const };
};

export function BlogDetailPage() {
  const { blogId } = useParams();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!blogId) return;
    api
      .getBlog(blogId)
      .then(setData)
      .catch((nextError) => setError(nextError.message));
  }, [blogId]);

  if (error) return <div className="panel error">{error}</div>;
  if (!data) return <div className="panel">블로그 상세를 불러오는 중입니다.</div>;

  return (
    <div className="page">
      <section className="hero compact">
        <div>
          <p className="eyebrow">{data.blog.platform}</p>
          <h2>{data.blog.name}</h2>
          <p className="muted">{data.blog.mainUrl}</p>
          <p className="muted">수집 글 수는 검증된 전체 공개 글 기준이며 홈 최신 글 수와 다를 수 있습니다.</p>
        </div>
        <TrendSparkline points={data.scoreHistory} />
      </section>

      <section className="grid two">
        <div className="panel">
          <div className="section-header">
            <h3>최근 추천</h3>
          </div>
          <div className="stack-list">
            {data.recommendations.map((item: any) => (
              <article className="stack-item" key={item.id}>
                <strong>{item.title}</strong>
                <p>{item.description}</p>
                <div className="pill-row">
                  {item.actionItems.map((action: string) => (
                    <span className="pill" key={action}>
                      {action}
                    </span>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="section-header">
            <h3>점수 이력</h3>
          </div>
          <div className="table">
            <div className="table-row table-head">
              <span>시작</span>
              <span>품질 점수</span>
              <span>제목/훅</span>
              <span>가독성</span>
            </div>
            {data.scoreHistory.map((row: any) => (
              <div className="table-row" key={row.startedAt}>
                <span>{new Date(row.startedAt).toLocaleDateString("ko-KR")}</span>
                <span>{row.qualityScore.toFixed(1)}</span>
                <span>{row.headlineScore.toFixed(1)}</span>
                <span>{row.readabilityScore.toFixed(1)}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="section-header">
          <h3>게시글 진단 결과</h3>
        </div>

        <div className="stack-list">
          {data.posts.map((post: any) => (
            <article className="stack-item post-diagnostic-card" key={post.id}>
              <div className="section-split">
                <div>
                  <strong>
                    <a href={post.url} rel="noreferrer" target="_blank">
                      {post.title ?? post.url}
                    </a>
                  </strong>
                  <p className="muted">
                    {post.publishedAt ? new Date(post.publishedAt).toLocaleDateString("ko-KR") : "-"} /{" "}
                    {post.categoryName ?? "미분류"}
                  </p>
                </div>
                <span className={`status-pill ${qualityTone(post.qualityScore).tone}`}>
                  {post.qualityScore != null ? `${post.qualityScore}점` : "미분석"}
                </span>
              </div>

              <div className="pill-row">
                <span className="pill">제목/훅 {post.headlineScore ?? "-"}</span>
                <span className="pill">가독성 {post.readabilityScore ?? "-"}</span>
                <span className="pill">정보 가치 {post.valueScore ?? "-"}</span>
                <span className="pill">차별성 {post.originalityScore ?? "-"}</span>
                <span className="pill">검색 적합성 {post.searchFitScore ?? "-"}</span>
              </div>

              <p>{post.summary ?? "요약 없음"}</p>

              {post.topicLabels.length ? (
                <div className="pill-row">
                  {post.topicLabels.map((topic: string) => (
                    <span className="pill" key={topic}>
                      {topic}
                    </span>
                  ))}
                </div>
              ) : null}

              <div className="grid two diagnostic-grid">
                <div className="action-box">
                  <small className="muted">약점</small>
                  <p>{post.weaknesses.length ? post.weaknesses.join(" ") : "약점이 아직 집계되지 않았습니다."}</p>
                </div>
                <div className="action-box">
                  <small className="muted">개선 제안</small>
                  <p>{post.improvements.length ? post.improvements.join(" ") : "개선 제안이 아직 없습니다."}</p>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
