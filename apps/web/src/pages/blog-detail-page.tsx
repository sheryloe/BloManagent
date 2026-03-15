import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api";
import { formatGrade, formatGradeRange, qualityTone } from "../lib/quality";

const formatDate = (value?: string | null) => (value ? new Date(value).toLocaleDateString("ko-KR") : "-");

const signalEntries = (signalBreakdown: Record<string, number>) =>
  Object.entries(signalBreakdown).sort((left, right) => Number(right[1]) - Number(left[1]));

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

  const overview = useMemo(() => {
    if (!data?.posts?.length) return null;
    const scoredPosts = data.posts.filter((post: any) => typeof post.qualityScore === "number");
    const orderedPosts = [...scoredPosts].sort((left: any, right: any) => left.qualityScore - right.qualityScore);
    const average =
      scoredPosts.length > 0
        ? scoredPosts.reduce((sum: number, post: any) => sum + post.qualityScore, 0) / scoredPosts.length
        : null;

    return {
      orderedPosts,
      analyzedCount: scoredPosts.length,
      averageQuality: average,
      bestPost: [...orderedPosts].reverse()[0] ?? null,
      worstPost: orderedPosts[0] ?? null,
      latestSnapshot: data.scoreHistory?.[0] ?? null,
    };
  }, [data]);

  if (error) return <div className="panel error">{error}</div>;
  if (!data || !overview) return <div className="panel">블로그 상세 데이터를 불러오는 중입니다.</div>;

  return (
    <div className="page">
      <section className="hero dashboard-hero">
        <div>
          <p className="eyebrow">Blog Detail</p>
          <h2>{data.blog.name}</h2>
          <p className="muted">{data.blog.mainUrl}</p>
          <p className="muted">
            수집 글 수는 검증된 전체 공개 게시글 기준입니다. 홈 화면에 보이는 최신 글 수와 다를 수 있으며, 현재 화면은 낮은
            등급 게시글부터 우선 정렬해 보여줍니다.
          </p>
        </div>

        <div className="hero-stats dashboard-stats">
          <div className="metric-card">
            <span>분석 게시글</span>
            <strong>{overview.analyzedCount}</strong>
          </div>
          <div className="metric-card">
            <span>평균 등급</span>
            <strong>{formatGrade(overview.averageQuality)}</strong>
          </div>
          <div className="metric-card">
            <span>최고 / 최저</span>
            <strong>
              {formatGradeRange(overview.worstPost?.qualityScore ?? null, overview.bestPost?.qualityScore ?? null)}
            </strong>
          </div>
          <div className="metric-card">
            <span>최신 스냅샷</span>
            <strong>{overview.latestSnapshot?.qualityGrade ?? formatGrade(overview.latestSnapshot?.qualityScore ?? null)}</strong>
          </div>
        </div>
      </section>

      <section className="grid two">
        <div className="panel">
          <div className="section-header">
            <h3>운영 핵심 포인트</h3>
          </div>

          <div className="dashboard-summary-grid">
            <article className="summary-card">
              <small className="muted">가장 우수한 글</small>
              <strong>{overview.bestPost?.qualityGrade ?? formatGrade(overview.bestPost?.qualityScore ?? null)}</strong>
              <p>{overview.bestPost?.title ?? "아직 없습니다."}</p>
            </article>
            <article className="summary-card">
              <small className="muted">가장 먼저 손볼 글</small>
              <strong>{overview.worstPost?.qualityGrade ?? formatGrade(overview.worstPost?.qualityScore ?? null)}</strong>
              <p>{overview.worstPost?.title ?? "아직 없습니다."}</p>
            </article>
            <article className="summary-card">
              <small className="muted">추천 수</small>
              <strong>{data.recommendations.length}</strong>
              <p>최신 분석에서 생성된 우선 실행 항목 수</p>
            </article>
          </div>
        </div>

        <div className="panel">
          <div className="section-header">
            <h3>최신 추천</h3>
          </div>

          <div className="stack-list">
            {data.recommendations.length ? (
              data.recommendations.map((item: any) => (
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
              ))
            ) : (
              <p className="muted">아직 추천 항목이 없습니다. 최신 분석을 먼저 실행해 주세요.</p>
            )}
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="section-header">
          <h3>게시글 진단 보드</h3>
        </div>

        <div className="stack-list">
          {overview.orderedPosts.map((post: any) => {
            const strongSignals = signalEntries(post.signalBreakdown ?? {}).slice(0, 3);
            const weakSignals = signalEntries(post.signalBreakdown ?? {})
              .slice()
              .sort((left, right) => Number(left[1]) - Number(right[1]))
              .slice(0, 3);

            return (
              <article className="stack-item post-diagnostic-card" key={post.id}>
                <div className="section-split">
                  <div>
                    <strong>
                      <a href={post.url} rel="noreferrer" target="_blank">
                        {post.title ?? post.url}
                      </a>
                    </strong>
                    <p className="muted">
                      {formatDate(post.publishedAt)} / {post.categoryName ?? "미분류"}
                    </p>
                  </div>
                  <span className={`status-pill ${qualityTone(post.qualityScore).tone}`}>
                    {post.qualityGrade ?? formatGrade(post.qualityScore)}
                  </span>
                </div>

                <div className="pill-row">
                  <span className="pill">제목·첫인상 {formatGrade(post.headlineScore ?? null)}</span>
                  <span className="pill">가독성 {formatGrade(post.readabilityScore ?? null)}</span>
                  <span className="pill">정보 가치 {formatGrade(post.valueScore ?? null)}</span>
                  <span className="pill">차별성 {formatGrade(post.originalityScore ?? null)}</span>
                  <span className="pill">검색 적합 {formatGrade(post.searchFitScore ?? null)}</span>
                </div>

                <p>{post.summary ?? "요약이 아직 생성되지 않았습니다."}</p>

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
                    <small className="muted">강한 신호 상위 3개</small>
                    <p>{post.topScoreDrivers?.length ? post.topScoreDrivers.join(" / ") : "강점 신호가 아직 정리되지 않았습니다."}</p>
                  </div>
                  <div className="action-box">
                    <small className="muted">약한 신호 상위 3개</small>
                    <p>{post.topScoreRisks?.length ? post.topScoreRisks.join(" / ") : "리스크 신호가 아직 정리되지 않았습니다."}</p>
                  </div>
                </div>

                <div className="grid two diagnostic-grid">
                  <div className="action-box">
                    <small className="muted">세부 점수 신호</small>
                    <p>{strongSignals.map(([label, value]: [string, number]) => `${label} ${value}`).join(" / ") || "데이터 없음"}</p>
                  </div>
                  <div className="action-box">
                    <small className="muted">보완이 필요한 신호</small>
                    <p>{weakSignals.map(([label, value]: [string, number]) => `${label} ${value}`).join(" / ") || "데이터 없음"}</p>
                  </div>
                </div>

                {post.contentMetrics ? (
                  <div className="detail-metrics-grid">
                    <div className="summary-card">
                      <small className="muted">문단 수</small>
                      <strong>{post.contentMetrics.paragraphCount}</strong>
                    </div>
                    <div className="summary-card">
                      <small className="muted">소제목 수</small>
                      <strong>{post.contentMetrics.headingCount}</strong>
                    </div>
                    <div className="summary-card">
                      <small className="muted">목록 수</small>
                      <strong>{post.contentMetrics.listCount}</strong>
                    </div>
                    <div className="summary-card">
                      <small className="muted">FAQ 수</small>
                      <strong>{post.contentMetrics.faqCount}</strong>
                    </div>
                    <div className="summary-card">
                      <small className="muted">중복 제목 수</small>
                      <strong>{post.contentMetrics.duplicateTitleCount}</strong>
                    </div>
                    <div className="summary-card">
                      <small className="muted">제목-본문 정렬</small>
                      <strong>{Math.round((post.contentMetrics.titleBodyOverlapRatio ?? 0) * 100)}%</strong>
                    </div>
                  </div>
                ) : null}

                <div className="grid two diagnostic-grid">
                  <div className="action-box">
                    <small className="muted">약점 요약</small>
                    <p>{post.weaknesses.length ? post.weaknesses.join(" ") : "약점이 아직 정리되지 않았습니다."}</p>
                  </div>
                  <div className="action-box">
                    <small className="muted">개선 제안</small>
                    <p>{post.improvements.length ? post.improvements.join(" ") : "개선 제안이 아직 없습니다."}</p>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
