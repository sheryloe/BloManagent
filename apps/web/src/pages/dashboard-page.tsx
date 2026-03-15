import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { DashboardResponse } from "@blog-review/shared";
import { api } from "../api";

const formatDate = (value?: string | null) => (value ? new Date(value).toLocaleString("ko-KR") : "-");

const formatDelta = (value: number | null) => {
  if (value == null) return "변화 없음";
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}`;
};

const qualityTone = (score: number | null) => {
  if (score == null) return { label: "미분석", tone: "neutral" as const };
  if (score >= 80) return { label: "우수", tone: "good" as const };
  if (score >= 65) return { label: "안정", tone: "watch" as const };
  if (score >= 50) return { label: "주의", tone: "watch" as const };
  return { label: "보완 필요", tone: "risk" as const };
};

export function DashboardPage() {
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getDashboard()
      .then(setData)
      .catch((nextError) => setError(nextError.message));
  }, []);

  const derived = useMemo(() => {
    if (!data) return null;

    const totalPosts = data.blogs.reduce((sum, blog) => sum + blog.postCount, 0);
    const averageQuality =
      data.blogs.filter((blog) => blog.latestQualityScore != null).reduce((sum, blog, _, list) => {
        return sum + (blog.latestQualityScore ?? 0) / Math.max(list.length, 1);
      }, 0) || null;
    const watchPosts = data.blogs.reduce((sum, blog) => sum + blog.watchPostCount, 0);
    const recommendationByBlog = new Map(
      data.latestRecommendations.filter((item) => item.blogId).map((item) => [item.blogId as string, item]),
    );
    const engineSummary = Array.from(
      data.latestRuns.reduce((map, run) => {
        map.set(run.engine, (map.get(run.engine) ?? 0) + 1);
        return map;
      }, new Map<string, number>()),
    );

    const blogCards = [...data.blogs]
      .map((blog) => ({
        ...blog,
        delta:
          blog.latestQualityScore != null && blog.previousQualityScore != null
            ? blog.latestQualityScore - blog.previousQualityScore
            : null,
        nextAction: recommendationByBlog.get(blog.id) ?? null,
        health: qualityTone(blog.latestQualityScore),
      }))
      .sort((left, right) => (left.latestQualityScore ?? -1) - (right.latestQualityScore ?? -1));

    return {
      totalPosts,
      averageQuality,
      watchPosts,
      activeRuns: data.latestRuns.filter((run) => run.status === "queued" || run.status === "in_progress").length,
      blogCards,
      engineSummary,
    };
  }, [data]);

  if (error) return <div className="panel error">{error}</div>;
  if (!data || !derived) return <div className="panel">대시보드를 불러오는 중입니다.</div>;

  return (
    <div className="page">
      <section className="hero dashboard-hero">
        <div>
          <p className="eyebrow">Dashboard</p>
          <h2>게시글 단위로 먼저 손볼 곳을 바로 확인하세요</h2>
          <p className="muted">
            평균 점수보다 지금 낮은 글과 반복 이슈를 먼저 보여주도록 구성했습니다. 수집된 글 수, 최근 분석, 다음 액션을 한 번에 봅니다.
          </p>
        </div>

        <div className="hero-stats dashboard-stats">
          <div className="metric-card">
            <span>등록 블로그</span>
            <strong>{data.blogs.length}</strong>
          </div>
          <div className="metric-card">
            <span>수집 글 수</span>
            <strong>{derived.totalPosts}</strong>
          </div>
          <div className="metric-card">
            <span>평균 품질 점수</span>
            <strong>{derived.averageQuality ? derived.averageQuality.toFixed(1) : "-"}</strong>
          </div>
          <div className="metric-card">
            <span>주의 글 수</span>
            <strong>{derived.watchPosts}</strong>
          </div>
        </div>
      </section>

      <section className="grid two">
        <div className="panel">
          <div className="section-header">
            <h3>블로그 상태</h3>
          </div>

          <div className="card-list">
            {derived.blogCards.map((blog) => (
              <article className="stack-item insight-card" key={blog.id}>
                <div className="section-split">
                  <div>
                    <Link className="blog-link" to={`/blogs/${blog.id}`}>
                      {blog.name}
                    </Link>
                    <p className="muted">{blog.mainUrl}</p>
                  </div>
                  <span className={`status-pill ${blog.health.tone}`}>{blog.health.label}</span>
                </div>

                <div className="pill-row">
                  <span className="pill">{blog.platform}</span>
                  <span className="pill">최신 점수 {blog.latestQualityScore?.toFixed(1) ?? "-"}</span>
                  <span className="pill">분석 글 {blog.analyzedPostCount}</span>
                  <span className="pill">주의 글 {blog.watchPostCount}</span>
                  <span className={blog.delta != null && blog.delta >= 0 ? "pill delta up" : "pill delta down"}>
                    {formatDelta(blog.delta)}
                  </span>
                </div>

                <div className="insight-grid">
                  <div>
                    <small className="muted">마지막 수집</small>
                    <p>{formatDate(blog.lastCrawlAt)}</p>
                  </div>
                  <div>
                    <small className="muted">마지막 분석</small>
                    <p>{formatDate(blog.latestRunAt)}</p>
                  </div>
                </div>

                <div className="action-box">
                  <small className="muted">반복 이슈</small>
                  <p>{blog.topIssues.length ? blog.topIssues.join(", ") : "아직 반복 이슈가 집계되지 않았습니다."}</p>
                </div>

                <div className="action-box">
                  <small className="muted">다음 액션</small>
                  <strong>{blog.nextAction?.title ?? "먼저 수집과 분석을 실행해 주세요."}</strong>
                  <p>{blog.nextAction?.description ?? "최근 분석이 쌓이면 블로그별 우선 액션을 자동으로 보여줍니다."}</p>
                </div>
              </article>
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="section-header">
            <h3>먼저 손볼 게시글</h3>
          </div>

          <div className="stack-list">
            {data.latestPostDiagnostics.length ? (
              data.latestPostDiagnostics.map((item) => (
                <article className="stack-item" key={item.postId}>
                  <div className="pill-row">
                    <span className="pill">{item.blogName}</span>
                    <span className="pill">점수 {item.qualityScore}</span>
                    <span className={`status-pill ${qualityTone(item.qualityScore).tone}`}>
                      {qualityTone(item.qualityScore).label}
                    </span>
                  </div>
                  <strong>
                    <a href={item.url} rel="noreferrer" target="_blank">
                      {item.title}
                    </a>
                  </strong>
                  <p>{item.summary ?? "요약 없음"}</p>
                  <div className="pill-row">
                    {item.topImprovements.map((improvement) => (
                      <span className="pill" key={improvement}>
                        {improvement}
                      </span>
                    ))}
                  </div>
                </article>
              ))
            ) : (
              <p className="muted">아직 게시글 분석 결과가 없습니다. 블로그를 등록하고 Analyze Now를 실행해 주세요.</p>
            )}
          </div>
        </div>
      </section>

      <section className="grid two">
        <div className="panel">
          <div className="section-header">
            <h3>최근 추천 액션</h3>
          </div>
          <div className="stack-list">
            {data.latestRecommendations.length ? (
              data.latestRecommendations.map((item) => (
                <article className="stack-item" key={item.id}>
                  <div className="pill-row">
                    <span className="pill">{item.recommendationType}</span>
                    <span className="pill">우선순위 {item.priority}</span>
                  </div>
                  <strong>{item.title}</strong>
                  <p>{item.description}</p>
                  <div className="pill-row">
                    {item.actionItems.map((action) => (
                      <span className="pill" key={action}>
                        {action}
                      </span>
                    ))}
                  </div>
                </article>
              ))
            ) : (
              <p className="muted">추천 액션은 분석 결과가 생기면 자동으로 채워집니다.</p>
            )}
          </div>
        </div>

        <div className="panel">
          <div className="section-header">
            <h3>운영 요약</h3>
          </div>

          <div className="dashboard-summary-grid">
            <article className="summary-card">
              <small className="muted">실행 중 분석</small>
              <strong>{derived.activeRuns}</strong>
            </article>
            <article className="summary-card">
              <small className="muted">완료된 분석</small>
              <strong>{data.latestRuns.filter((run) => run.status === "completed").length}</strong>
            </article>
            <article className="summary-card">
              <small className="muted">최근 추천 수</small>
              <strong>{data.latestRecommendations.length}</strong>
            </article>
          </div>

          <div className="pill-row summary-pills">
            {derived.engineSummary.map(([engine, count]) => (
              <span className="pill" key={engine}>
                {engine} {count}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="section-header">
          <h3>최근 실행 기록</h3>
        </div>

        <div className="table">
          <div className="table-row table-head table-six">
            <span>시작</span>
            <span>엔진</span>
            <span>모델</span>
            <span>상태</span>
            <span>글 수</span>
            <span>비용</span>
          </div>
          {data.latestRuns.map((run) => (
            <div className="table-row table-six" key={run.id}>
              <span>{new Date(run.startedAt).toLocaleString("ko-KR")}</span>
              <span>{run.engine}</span>
              <span>{run.model}</span>
              <span>{run.status}</span>
              <span>{run.postCount}</span>
              <span>${run.actualCost.toFixed(4)}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
