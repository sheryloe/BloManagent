import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { DashboardResponse } from "@blog-review/shared";
import { api } from "../api";

const formatDate = (value?: string | null) => (value ? new Date(value).toLocaleString("ko-KR") : "-");

const formatDelta = (value: number | null) => {
  if (value == null) return "비교 데이터 없음";
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}`;
};

const healthLabel = (score: number | null) => {
  if (score == null) return { label: "미분석", tone: "neutral" };
  if (score >= 80) return { label: "안정", tone: "good" };
  if (score >= 65) return { label: "관찰", tone: "watch" };
  return { label: "보완 필요", tone: "risk" };
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
    const scoredBlogs = data.blogs.filter((blog) => blog.latestEbiScore != null);
    const averageEbi =
      scoredBlogs.length > 0
        ? scoredBlogs.reduce((sum, blog) => sum + (blog.latestEbiScore ?? 0), 0) / scoredBlogs.length
        : null;
    const attentionBlogs = data.blogs.filter((blog) => blog.latestEbiScore == null || (blog.latestEbiScore ?? 0) < 65);
    const activeRuns = data.latestRuns.filter((run) => run.status === "queued" || run.status === "in_progress").length;
    const blogNameById = new Map(data.blogs.map((blog) => [blog.id, blog.name]));
    const recommendationByBlog = new Map(
      data.latestRecommendations
        .filter((item) => item.blogId)
        .map((item) => [item.blogId as string, item]),
    );

    const healthCards = [...data.blogs]
      .sort((left, right) => {
        const leftScore = left.latestEbiScore ?? -1;
        const rightScore = right.latestEbiScore ?? -1;
        return leftScore - rightScore;
      })
      .map((blog) => {
        const delta =
          blog.latestEbiScore != null && blog.previousEbiScore != null
            ? blog.latestEbiScore - blog.previousEbiScore
            : null;

        return {
          ...blog,
          delta,
          health: healthLabel(blog.latestEbiScore ?? null),
          nextAction: recommendationByBlog.get(blog.id) ?? null,
        };
      });

    const providerSummary = Array.from(
      data.latestRuns.reduce((map, run) => {
        map.set(run.provider, (map.get(run.provider) ?? 0) + 1);
        return map;
      }, new Map<string, number>()),
    );

    const priorityBlogs = [...data.blogs]
      .sort((left, right) => {
        const leftTime = left.lastCrawlAt ? new Date(left.lastCrawlAt).getTime() : 0;
        const rightTime = right.lastCrawlAt ? new Date(right.lastCrawlAt).getTime() : 0;
        return leftTime - rightTime;
      })
      .slice(0, 5);

    const recommendations = data.latestRecommendations.map((item) => ({
      ...item,
      blogName: item.blogId ? blogNameById.get(item.blogId) ?? "공통" : "공통",
    }));

    return {
      totalPosts,
      averageEbi,
      attentionBlogs,
      activeRuns,
      healthCards,
      providerSummary,
      priorityBlogs,
      recommendations,
    };
  }, [data]);

  if (error) return <div className="panel error">{error}</div>;
  if (!data || !derived) return <div className="panel">대시보드를 불러오는 중입니다.</div>;

  return (
    <div className="page">
      <section className="hero dashboard-hero">
        <div>
          <p className="eyebrow">Dashboard</p>
          <h2>지금 바로 손봐야 할 블로그 운영 포인트</h2>
          <p className="muted">
            최근 분석 점수, 마지막 수집 시각, 최신 추천 액션을 묶어서 블로그별 우선순위를 빠르게 볼 수 있게 정리했습니다.
          </p>
        </div>

        <div className="hero-stats dashboard-stats">
          <div className="metric-card">
            <span>등록 블로그</span>
            <strong>{data.blogs.length}</strong>
          </div>
          <div className="metric-card">
            <span>수집된 글</span>
            <strong>{derived.totalPosts}</strong>
          </div>
          <div className="metric-card">
            <span>평균 EBI</span>
            <strong>{derived.averageEbi?.toFixed(1) ?? "-"}</strong>
          </div>
          <div className="metric-card">
            <span>보완 필요</span>
            <strong>{derived.attentionBlogs.length}</strong>
          </div>
        </div>
      </section>

      <section className="grid two">
        <div className="panel">
          <div className="section-header">
            <h3>블로그별 상태</h3>
          </div>

          <div className="card-list">
            {derived.healthCards.map((blog) => (
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
                  <span className="pill">글 {blog.postCount}</span>
                  <span className="pill">EBI {blog.latestEbiScore?.toFixed(1) ?? "-"}</span>
                  <span className={blog.delta != null && blog.delta >= 0 ? "pill delta up" : "pill delta down"}>
                    {formatDelta(blog.delta)}
                  </span>
                </div>

                <div className="insight-grid">
                  <div>
                    <small className="muted">최근 수집</small>
                    <p>{formatDate(blog.lastCrawlAt)}</p>
                  </div>
                  <div>
                    <small className="muted">최근 분석</small>
                    <p>{formatDate(blog.latestRunAt)}</p>
                  </div>
                </div>

                <div className="action-box">
                  <small className="muted">다음 보완 포인트</small>
                  <strong>{blog.nextAction?.title ?? "아직 추천이 없습니다."}</strong>
                  <p>{blog.nextAction?.description ?? "먼저 수집과 분석을 실행하면 블로그별 개선 포인트가 여기에 표시됩니다."}</p>
                </div>
              </article>
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="section-header">
            <h3>최근 추천 액션</h3>
          </div>

          <div className="stack-list">
            {derived.recommendations.length ? (
              derived.recommendations.map((item) => (
                <article className="stack-item" key={item.id}>
                  <div className="pill-row">
                    <span className="pill">{item.blogName}</span>
                    <span className="pill">{item.recommendationType}</span>
                    <span className="pill">우선순위 {item.priority}</span>
                  </div>
                  <strong>{item.title}</strong>
                  <p>{item.description}</p>
                  {item.actionItems.length ? (
                    <div className="pill-row">
                      {item.actionItems.map((action) => (
                        <span className="pill" key={action}>
                          {action}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </article>
              ))
            ) : (
              <p className="muted">아직 표시할 추천이 없습니다. 블로그를 등록하고 분석을 한 번 실행해 보세요.</p>
            )}
          </div>
        </div>
      </section>

      <section className="grid two">
        <div className="panel">
          <div className="section-header">
            <h3>운영 리듬</h3>
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
            {derived.providerSummary.map(([provider, count]) => (
              <span className="pill" key={provider}>
                {provider} {count}
              </span>
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="section-header">
            <h3>점검 우선순위</h3>
          </div>

          <div className="stack-list">
            {derived.priorityBlogs.map((blog) => (
              <article className="stack-item" key={blog.id}>
                <strong>{blog.name}</strong>
                <p className="muted">{blog.mainUrl}</p>
                <div className="pill-row">
                  <span className="pill">마지막 수집 {formatDate(blog.lastCrawlAt)}</span>
                  <span className="pill">마지막 분석 {formatDate(blog.latestRunAt)}</span>
                </div>
              </article>
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
            <span>제공자</span>
            <span>모델</span>
            <span>상태</span>
            <span>포스트</span>
            <span>비용</span>
          </div>
          {data.latestRuns.map((run) => (
            <div className="table-row table-six" key={run.id}>
              <span>{new Date(run.startedAt).toLocaleString("ko-KR")}</span>
              <span>{run.provider}</span>
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
