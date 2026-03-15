import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api";
import { formatGrade, formatGradeRange, qualityTone } from "../lib/quality";

const formatDate = (value?: string | null) => (value ? new Date(value).toLocaleDateString("ko-KR") : "-");

const findingScore = (finding: any) => Number(finding?.score ?? 0);

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
    const averageQuality =
      scoredPosts.length > 0
        ? scoredPosts.reduce((sum: number, post: any) => sum + post.qualityScore, 0) / scoredPosts.length
        : null;

    return {
      orderedPosts,
      analyzedCount: scoredPosts.length,
      averageQuality,
      bestPost: [...orderedPosts].reverse()[0] ?? null,
      worstPost: orderedPosts[0] ?? null,
      latestSnapshot: data.scoreHistory?.[0] ?? null,
    };
  }, [data]);

  if (error) return <div className="panel error">{error}</div>;
  if (!data || !overview) return <div className="panel">블로그 상세 데이터를 불러오는 중입니다.</div>;

  return (
    <div className="page compact-page">
      <section className="hero dashboard-hero compact-hero">
        <div>
          <p className="eyebrow">Blog Detail</p>
          <h2>{data.blog.name}</h2>
          <p className="muted">{data.blog.mainUrl}</p>
          <p className="muted">수집 글 수는 검증된 전체 공개 글 기준입니다. 카드 순서는 낮은 등급 글부터 정렬됩니다.</p>
        </div>

        <div className="hero-stats dashboard-stats compact-metric-grid">
          <div className="metric-card compact-metric">
            <span>분석 글</span>
            <strong>{overview.analyzedCount}</strong>
          </div>
          <div className="metric-card compact-metric">
            <span>평균 등급</span>
            <strong>{formatGrade(overview.averageQuality)}</strong>
          </div>
          <div className="metric-card compact-metric">
            <span>최고 / 최저</span>
            <strong>{formatGradeRange(overview.worstPost?.qualityScore ?? null, overview.bestPost?.qualityScore ?? null)}</strong>
          </div>
          <div className="metric-card compact-metric">
            <span>최신 스냅샷</span>
            <strong>{overview.latestSnapshot?.qualityGrade ?? formatGrade(overview.latestSnapshot?.qualityScore ?? null)}</strong>
          </div>
        </div>
      </section>

      <section className="grid two compact-grid">
        <div className="panel compact-panel">
          <div className="section-header compact-section-header">
            <h3>요약</h3>
          </div>

          <div className="dashboard-summary-grid compact-summary-grid">
            <article className="summary-card compact-card">
              <small className="muted">Best</small>
              <strong>{overview.bestPost?.qualityGrade ?? formatGrade(overview.bestPost?.qualityScore ?? null)}</strong>
              <p>{overview.bestPost?.title ?? "-"}</p>
            </article>
            <article className="summary-card compact-card">
              <small className="muted">Worst</small>
              <strong>{overview.worstPost?.qualityGrade ?? formatGrade(overview.worstPost?.qualityScore ?? null)}</strong>
              <p>{overview.worstPost?.title ?? "-"}</p>
            </article>
            <article className="summary-card compact-card">
              <small className="muted">추천 수</small>
              <strong>{data.recommendations.length}</strong>
              <p>최신 분석 기준</p>
            </article>
          </div>
        </div>

        <div className="panel compact-panel">
          <div className="section-header compact-section-header">
            <h3>최신 추천</h3>
          </div>

          <div className="stack-list compact-stack">
            {data.recommendations.length ? (
              data.recommendations.map((item: any) => (
                <article className="stack-item compact-card" key={item.id}>
                  <div className="section-split">
                    <strong>{item.title}</strong>
                    <span className="pill">우선순위 {item.priority}</span>
                  </div>
                  <p>{item.description}</p>
                  <div className="pill-row dense-pills">
                    {item.actionItems.map((action: string) => (
                      <span className="pill" key={action}>
                        {action}
                      </span>
                    ))}
                  </div>
                </article>
              ))
            ) : (
              <p className="muted">최신 추천 항목이 없습니다. 분석을 다시 돌리면 갱신됩니다.</p>
            )}
          </div>
        </div>
      </section>

      <section className="panel compact-panel">
        <div className="section-header compact-section-header">
          <h3>게시글 진단 보드</h3>
        </div>

        <div className="stack-list compact-stack">
          {overview.orderedPosts.map((post: any) => {
            const signalFindings = [...(post.signalFindings ?? [])];
            const weakFindings = signalFindings.slice().sort((left, right) => findingScore(left) - findingScore(right)).slice(0, 3);
            const strongFindings = signalFindings.slice().sort((left, right) => findingScore(right) - findingScore(left)).slice(0, 3);
            const improvementItems = post.improvementItems ?? [];

            return (
              <article className="stack-item post-diagnostic-card compact-post-card" key={post.id}>
                <div className="section-split compact-post-head">
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

                <div className="pill-row dense-pills">
                  <span className="pill">제목 {formatGrade(post.headlineScore ?? null)}</span>
                  <span className="pill">가독성 {formatGrade(post.readabilityScore ?? null)}</span>
                  <span className="pill">가치 {formatGrade(post.valueScore ?? null)}</span>
                  <span className="pill">차별성 {formatGrade(post.originalityScore ?? null)}</span>
                  <span className="pill">검색 적합 {formatGrade(post.searchFitScore ?? null)}</span>
                </div>

                <p className="compact-summary">{post.summary ?? "요약이 아직 없습니다."}</p>

                <div className="post-card-grid">
                  <section className="compact-block">
                    <div className="compact-block-head">
                      <strong>낮은 신호</strong>
                    </div>
                    <div className="finding-list">
                      {weakFindings.length ? (
                        weakFindings.map((finding: any) => (
                          <article className="finding-row" key={`${post.id}-${finding.key}`}>
                            <div className="finding-head">
                              <strong>{finding.label}</strong>
                              <span className={`status-pill ${qualityTone(finding.score).tone}`}>
                                {finding.qualityGrade} / {finding.score}
                              </span>
                            </div>
                            <div className="evidence-list">
                              {(finding.evidence ?? []).map((line: string) => (
                                <span className="evidence-chip" key={line}>
                                  {line}
                                </span>
                              ))}
                            </div>
                          </article>
                        ))
                      ) : (
                        <p className="muted">낮은 신호가 아직 없습니다.</p>
                      )}
                    </div>
                  </section>

                  <section className="compact-block">
                    <div className="compact-block-head">
                      <strong>개선 작업</strong>
                    </div>
                    <div className="finding-list">
                      {improvementItems.length ? (
                        improvementItems.map((item: any, index: number) => (
                          <article className="finding-row improvement-row" key={`${post.id}-improve-${index}`}>
                            <div className="finding-head">
                              <strong>{item.title}</strong>
                              <span className={`status-pill ${qualityTone(item.score).tone}`}>
                                {item.qualityGrade} / {item.score}
                              </span>
                            </div>
                            <p className="muted compact-reason">{item.reason}</p>
                            <div className="evidence-list">
                              {(item.evidence ?? []).map((line: string) => (
                                <span className="evidence-chip" key={line}>
                                  {line}
                                </span>
                              ))}
                            </div>
                            <ul className="compact-list">
                              {(item.actions ?? []).map((action: string) => (
                                <li key={action}>{action}</li>
                              ))}
                            </ul>
                          </article>
                        ))
                      ) : (
                        <p className="muted">개선 항목이 아직 없습니다.</p>
                      )}
                    </div>
                  </section>

                  <section className="compact-block">
                    <div className="compact-block-head">
                      <strong>강한 신호 / 지표</strong>
                    </div>
                    <div className="finding-list">
                      {strongFindings.length ? (
                        strongFindings.map((finding: any) => (
                          <article className="finding-row" key={`${post.id}-strong-${finding.key}`}>
                            <div className="finding-head">
                              <strong>{finding.label}</strong>
                              <span className={`status-pill ${qualityTone(finding.score).tone}`}>
                                {finding.qualityGrade} / {finding.score}
                              </span>
                            </div>
                            <div className="evidence-list">
                              {(finding.evidence ?? []).slice(0, 2).map((line: string) => (
                                <span className="evidence-chip" key={line}>
                                  {line}
                                </span>
                              ))}
                            </div>
                          </article>
                        ))
                      ) : null}

                      {post.contentMetrics ? (
                        <div className="detail-metrics-grid compact-detail-metrics">
                          <div className="summary-card compact-card">
                            <small className="muted">문단</small>
                            <strong>{post.contentMetrics.paragraphCount}</strong>
                          </div>
                          <div className="summary-card compact-card">
                            <small className="muted">소제목</small>
                            <strong>{post.contentMetrics.headingCount}</strong>
                          </div>
                          <div className="summary-card compact-card">
                            <small className="muted">목록</small>
                            <strong>{post.contentMetrics.listCount}</strong>
                          </div>
                          <div className="summary-card compact-card">
                            <small className="muted">FAQ</small>
                            <strong>{post.contentMetrics.faqCount}</strong>
                          </div>
                          <div className="summary-card compact-card">
                            <small className="muted">중복 제목</small>
                            <strong>{post.contentMetrics.duplicateTitleCount}</strong>
                          </div>
                          <div className="summary-card compact-card">
                            <small className="muted">정렬</small>
                            <strong>{Math.round((post.contentMetrics.titleBodyOverlapRatio ?? 0) * 100)}%</strong>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </section>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
