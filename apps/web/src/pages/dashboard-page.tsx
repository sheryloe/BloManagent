import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { DashboardResponse } from "@blog-review/shared";
import { api } from "../api";
import { formatGrade, formatGradeRange, qualityTone } from "../lib/quality";

const formatDate = (value?: string | null) => (value ? new Date(value).toLocaleString("ko-KR") : "-");

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
    const qualityValues = data.blogs
      .map((blog) => blog.latestQualityScore)
      .filter((value): value is number => typeof value === "number");
    const watchPosts = data.blogs.reduce((sum, blog) => sum + blog.watchPostCount, 0);
    const repeatedTitleWarnings = data.blogs.reduce((sum, blog) => sum + blog.repeatedTitleWarningCount, 0);
    const recommendationByBlog = new Map(
      data.latestRecommendations.filter((item) => item.blogId).map((item) => [item.blogId as string, item]),
    );

    const blogCards = [...data.blogs]
      .map((blog) => ({
        ...blog,
        nextAction: recommendationByBlog.get(blog.id) ?? null,
        health: qualityTone(blog.latestQualityScore),
      }))
      .sort((left, right) => (left.latestQualityScore ?? -1) - (right.latestQualityScore ?? -1));

    return {
      totalPosts,
      averageQuality: qualityValues.length
        ? qualityValues.reduce((sum, value) => sum + value, 0) / qualityValues.length
        : null,
      watchPosts,
      repeatedTitleWarnings,
      activeRuns: data.latestRuns.filter((run) => run.status === "queued" || run.status === "in_progress").length,
      blogCards,
    };
  }, [data]);

  if (error) return <div className="panel error">{error}</div>;
  if (!data || !derived) return <div className="panel">대시보드 데이터를 불러오는 중입니다.</div>;

  return (
    <div className="page">
      <section className="hero dashboard-hero">
        <div>
          <p className="eyebrow">Executive Snapshot</p>
          <h2>지금 가장 먼저 봐야 할 블로그와 게시글을 보여주는 분석 개요</h2>
          <p className="muted">
            평균 수치보다 중요한 것은 현재 위험 구간의 글, 반복되는 약점, 그리고 바로 실행할 다음 액션입니다. 이 화면은 최신 분석
            스냅샷만 기준으로 보는 운영 보드입니다.
          </p>
        </div>

        <div className="hero-stats dashboard-stats">
          <div className="metric-card">
            <span>등록 블로그</span>
            <strong>{data.blogs.length}</strong>
          </div>
          <div className="metric-card">
            <span>검증된 글 수</span>
            <strong>{derived.totalPosts}</strong>
          </div>
          <div className="metric-card">
            <span>평균 등급</span>
            <strong>{formatGrade(derived.averageQuality)}</strong>
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
            <h3>블로그 상태 보드</h3>
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
                  <span className="pill">최신 등급 {blog.latestQualityGrade ?? formatGrade(blog.latestQualityScore)}</span>
                  <span className="pill">분석 글 {blog.analyzedPostCount}</span>
                  <span className="pill">주의 글 {blog.watchPostCount}</span>
                </div>

                <div className="insight-grid">
                  <div className="summary-card">
                    <small className="muted">등급 범위</small>
                    <strong>{formatGradeRange(blog.scoreRangeMin, blog.scoreRangeMax)}</strong>
                  </div>
                  <div className="summary-card">
                    <small className="muted">점수 분산</small>
                    <strong>{blog.distinctQualityScoreCount}</strong>
                  </div>
                </div>

                <div className="insight-grid">
                  <div className="action-box">
                    <small className="muted">반복 이슈</small>
                    <p>{blog.topIssues.length ? blog.topIssues.join(", ") : "아직 반복 이슈가 감지되지 않았습니다."}</p>
                  </div>
                  <div className="action-box">
                    <small className="muted">반복 제목 경고</small>
                    <p>{blog.repeatedTitleWarningCount ? `${blog.repeatedTitleWarningCount}건` : "없음"}</p>
                  </div>
                </div>

                <div className="action-box">
                  <small className="muted">다음 액션</small>
                  <strong>{blog.nextAction?.title ?? "수집과 분석을 먼저 한 번 실행해 주세요."}</strong>
                  <p>{blog.nextAction?.description ?? "최신 분석이 쌓이면 블로그별 추천 액션이 여기에 표시됩니다."}</p>
                </div>

                <div className="pill-row">
                  <span className="pill">마지막 수집 {formatDate(blog.lastCrawlAt)}</span>
                  <span className="pill">마지막 분석 {formatDate(blog.latestRunAt)}</span>
                </div>
              </article>
            ))}
          </div>
        </div>

        <div className="stack-list">
          <section className="panel">
            <div className="section-header">
              <h3>가장 먼저 볼 게시글</h3>
            </div>

            <div className="stack-list">
              {data.latestPostDiagnostics.length ? (
                data.latestPostDiagnostics.map((item) => (
                  <article className="stack-item" key={item.postId}>
                    <div className="section-split">
                      <div>
                        <strong>
                          <a href={item.url} rel="noreferrer" target="_blank">
                            {item.title}
                          </a>
                        </strong>
                        <p className="muted">{item.blogName}</p>
                      </div>
                      <span className={`status-pill ${qualityTone(item.qualityScore).tone}`}>
                        {item.qualityGrade ?? formatGrade(item.qualityScore)}
                      </span>
                    </div>

                    <p>{item.summary ?? "요약이 아직 없습니다."}</p>

                    <div className="pill-row">
                      {item.topImprovements.map((improvement) => (
                        <span className="pill" key={improvement}>
                          {improvement}
                        </span>
                      ))}
                    </div>

                    <div className="pill-row">
                      {item.weakSignals.map((signal) => (
                        <span className="pill risk-pill" key={signal}>
                          {signal}
                        </span>
                      ))}
                    </div>
                  </article>
                ))
              ) : (
                <p className="muted">아직 게시글 진단 결과가 없습니다. 수집 작업대에서 주소를 등록하고 분석을 실행해 주세요.</p>
              )}
            </div>
          </section>

          <section className="panel">
            <div className="section-header">
              <h3>운영 상태</h3>
            </div>

            <div className="dashboard-summary-grid">
              <article className="summary-card">
                <small className="muted">실행 중</small>
                <strong>{derived.activeRuns}</strong>
              </article>
              <article className="summary-card">
                <small className="muted">최신 추천 수</small>
                <strong>{data.latestRecommendations.length}</strong>
              </article>
              <article className="summary-card">
                <small className="muted">반복 제목 경고</small>
                <strong>{derived.repeatedTitleWarnings}</strong>
              </article>
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}
