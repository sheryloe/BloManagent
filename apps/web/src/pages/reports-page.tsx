import { useEffect, useMemo, useState } from "react";
import type { Report, RunDetails } from "@blog-review/shared";
import { api } from "../api";
import { formatGrade, formatGradeRange, gradeFromScore, qualityTone } from "../lib/quality";

const formatDate = (value?: string | null) => (value ? new Date(value).toLocaleDateString("ko-KR") : "-");
const formatDateTime = (value?: string | null) => (value ? new Date(value).toLocaleString("ko-KR") : "-");

const formatDuration = (startedAt?: string | null, endedAt?: string | null) => {
  if (!startedAt || !endedAt) return "-";
  const durationMs = new Date(endedAt).getTime() - new Date(startedAt).getTime();
  if (!Number.isFinite(durationMs) || durationMs <= 0) return "-";
  const seconds = Math.round(durationMs / 1000);
  if (seconds < 60) return `${seconds}초`;
  const minutes = Math.floor(seconds / 60);
  const remainSeconds = seconds % 60;
  return `${minutes}분 ${remainSeconds}초`;
};

const average = (values: number[]) => (values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null);

const formatRunStatus = (status: string) => {
  if (status === "queued") return "대기 중";
  if (status === "in_progress") return "진행 중";
  if (status === "completed") return "완료";
  if (status === "failed") return "실패";
  return status;
};

type BlogDetail = Awaited<ReturnType<typeof api.getBlog>>;

type ScoreBand = {
  label: string;
  count: number;
  ratio: number;
};

const qualityGrades = ["S", "A", "B", "C", "D", "F"] as const;

type ReportRecord = Report & {
  blogId: string;
  blogName?: string;
};

export function ReportsPage() {
  const [reports, setReports] = useState<ReportRecord[]>([]);
  const [detail, setDetail] = useState<BlogDetail | null>(null);
  const [runDetail, setRunDetail] = useState<RunDetails | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedReport = useMemo(() => {
    if (!reports.length) return null;
    return [...reports].sort((left, right) => {
      const leftTime = new Date(left.weekEnd ?? left.createdAt ?? 0).getTime();
      const rightTime = new Date(right.weekEnd ?? right.createdAt ?? 0).getTime();
      return rightTime - leftTime;
    })[0];
  }, [reports]);

  useEffect(() => {
    api
      .getReports()
      .then((nextReports) => setReports(nextReports))
      .catch((nextError) => setError(nextError.message));
  }, []);

  useEffect(() => {
    if (!selectedReport) {
      setDetail(null);
      setRunDetail(null);
      return;
    }

    let cancelled = false;

    void Promise.all([api.getBlog(selectedReport.blogId), api.getRun(selectedReport.runId)])
      .then(([nextDetail, nextRunDetail]) => {
        if (cancelled) return;
        setDetail(nextDetail as BlogDetail);
        setRunDetail(nextRunDetail);
      })
      .catch((nextError) => {
        if (cancelled) return;
        setError(nextError.message);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedReport]);

  const analytics = useMemo(() => {
    if (!selectedReport || !detail) return null;

    const scoredPosts = detail.posts.filter((post: any) => typeof post.qualityScore === "number");
    const sortedAsc = [...scoredPosts].sort((left: any, right: any) => left.qualityScore - right.qualityScore);
    const sortedDesc = [...sortedAsc].reverse();
    const qualityValues = scoredPosts.map((post: any) => post.qualityScore as number);
    const totalScored = scoredPosts.length;
    const toBand = (label: string, count: number): ScoreBand => ({
      label,
      count,
      ratio: totalScored ? count / totalScored : 0,
    });

    const componentAverages = [
      { label: "제목·첫인상", value: average(scoredPosts.map((post: any) => post.headlineScore ?? 0)) ?? 0 },
      { label: "가독성", value: average(scoredPosts.map((post: any) => post.readabilityScore ?? 0)) ?? 0 },
      { label: "정보 가치", value: average(scoredPosts.map((post: any) => post.valueScore ?? 0)) ?? 0 },
      { label: "차별성", value: average(scoredPosts.map((post: any) => post.originalityScore ?? 0)) ?? 0 },
      { label: "검색 적합", value: average(scoredPosts.map((post: any) => post.searchFitScore ?? 0)) ?? 0 },
    ];

    const riskCounts = new Map<string, number>();
    for (const post of scoredPosts) {
      for (const risk of post.topScoreRisks ?? []) {
        riskCounts.set(risk, (riskCounts.get(risk) ?? 0) + 1);
      }
    }

    const riskLeaderboard = Array.from(riskCounts.entries())
      .sort((left, right) => right[1] - left[1])
      .slice(0, 8);

    return {
      totalScored,
      averageQuality: average(qualityValues),
      minQuality: qualityValues.length ? Math.min(...qualityValues) : null,
      maxQuality: qualityValues.length ? Math.max(...qualityValues) : null,
      bestPosts: sortedDesc.slice(0, 5),
      worstPosts: sortedAsc.slice(0, 5),
      scoreBands: qualityGrades.map((grade) =>
        toBand(
          grade,
          qualityValues.filter((score: number) => gradeFromScore(score) === grade).length,
        ),
      ),
      componentAverages,
      riskLeaderboard,
      repeatedTitleCount: scoredPosts.filter((post: any) => (post.contentMetrics?.duplicateTitleCount ?? 0) > 0).length,
    };
  }, [detail, selectedReport]);

  if (error) return <div className="panel error">{error}</div>;

  if (!reports.length) {
    return (
      <div className="page">
        <section className="panel">
          <div className="section-header">
            <h3>분석 리포트</h3>
          </div>
          <p className="muted">아직 리포트가 없습니다. 수집 작업대에서 블로그를 등록하고 분석을 먼저 실행해 주세요.</p>
        </section>
      </div>
    );
  }

  if (!selectedReport || !detail || !runDetail || !analytics) {
    return <div className="panel">리포트 데이터를 불러오는 중입니다.</div>;
  }

  return (
    <div className="page">
      <section className="hero dashboard-hero">
        <div>
          <p className="eyebrow">Report Control Room</p>
          <h2>{detail.blog.name} 분석 리포트</h2>
          <p className="muted">
            {formatDate(selectedReport.weekStart)} - {formatDate(selectedReport.weekEnd)} 기준 최신 분석입니다. 이 워크스페이스는 휘발성 흐름을
            전제로 하므로, 리포트 목록 대신 가장 최근 분석 1건만 관제 화면처럼 보여줍니다.
          </p>
        </div>

        <div className="hero-stats dashboard-stats">
          <div className="metric-card">
            <span>분석 게시글</span>
            <strong>{analytics.totalScored}</strong>
          </div>
          <div className="metric-card">
            <span>평균 등급</span>
            <strong>{formatGrade(analytics.averageQuality)}</strong>
          </div>
          <div className="metric-card">
            <span>최고 / 최저</span>
            <strong>{formatGradeRange(analytics.minQuality, analytics.maxQuality)}</strong>
          </div>
          <div className="metric-card">
            <span>반복 제목 경고</span>
            <strong>{analytics.repeatedTitleCount}</strong>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="section-header">
          <h3>요약 브리핑</h3>
        </div>

        <div className="stack-list">
          <article className="action-box">
            <small className="muted">Executive Summary</small>
            <p>{selectedReport.overallSummary}</p>
          </article>

          <div className="dashboard-summary-grid">
            <article className="summary-card">
              <small className="muted">다음 주제 수</small>
              <strong>{selectedReport.nextWeekTopics.length}</strong>
            </article>
            <article className="summary-card">
              <small className="muted">우선 액션 수</small>
              <strong>{selectedReport.priorityActions.length}</strong>
            </article>
            <article className="summary-card">
              <small className="muted">실행 시간</small>
              <strong>{formatDuration(runDetail.run.startedAt, runDetail.run.endedAt)}</strong>
            </article>
          </div>

          <div className="pill-row">
            {selectedReport.nextWeekTopics.map((topic) => (
              <span className="pill" key={topic}>
                {topic}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="grid two">
        <div className="panel">
          <div className="section-header">
            <h3>등급 분포</h3>
          </div>

          <div className="score-band-list">
            {analytics.scoreBands.map((band) => (
              <article className="score-band-row" key={band.label}>
                <div className="section-split">
                  <strong>{band.label}</strong>
                  <span>{band.count}건</span>
                </div>
                <div className="bar-track">
                  <div className="bar-fill" style={{ width: `${Math.max(6, band.ratio * 100)}%` }} />
                </div>
              </article>
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="section-header">
            <h3>축별 평균 등급</h3>
          </div>

          <div className="score-band-list">
            {analytics.componentAverages.map((item) => (
              <article className="score-band-row" key={item.label}>
                <div className="section-split">
                  <strong>{item.label}</strong>
                  <span>{formatGrade(item.value)}</span>
                </div>
                <div className="bar-track">
                  <div className="bar-fill bar-fill-alt" style={{ width: `${Math.max(6, item.value)}%` }} />
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="grid two">
        <div className="panel">
          <div className="section-header">
            <h3>Worst 5</h3>
          </div>

          <div className="stack-list">
            {analytics.worstPosts.map((post: any) => (
              <article className="stack-item" key={post.id}>
                <div className="section-split">
                  <strong>
                    <a href={post.url} rel="noreferrer" target="_blank">
                      {post.title}
                    </a>
                  </strong>
                  <span className={`status-pill ${qualityTone(post.qualityScore).tone}`}>
                    {post.qualityGrade ?? formatGrade(post.qualityScore)}
                  </span>
                </div>

                <p className="muted">{post.improvements?.slice(0, 2).join(" / ") || "개선 포인트가 아직 정리되지 않았습니다."}</p>

                <div className="pill-row">
                  <span className="pill">제목 {formatGrade(post.headlineScore ?? null)}</span>
                  <span className="pill">가독성 {formatGrade(post.readabilityScore ?? null)}</span>
                  <span className="pill">정보 가치 {formatGrade(post.valueScore ?? null)}</span>
                </div>
              </article>
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="section-header">
            <h3>Best 5</h3>
          </div>

          <div className="stack-list">
            {analytics.bestPosts.map((post: any) => (
              <article className="stack-item" key={post.id}>
                <div className="section-split">
                  <strong>
                    <a href={post.url} rel="noreferrer" target="_blank">
                      {post.title}
                    </a>
                  </strong>
                  <span className={`status-pill ${qualityTone(post.qualityScore).tone}`}>
                    {post.qualityGrade ?? formatGrade(post.qualityScore)}
                  </span>
                </div>

                <p className="muted">{post.topScoreDrivers?.slice(0, 2).join(" / ") || "강점 신호가 아직 정리되지 않았습니다."}</p>

                <div className="pill-row">
                  <span className="pill">차별성 {formatGrade(post.originalityScore ?? null)}</span>
                  <span className="pill">검색 적합 {formatGrade(post.searchFitScore ?? null)}</span>
                  <span className="pill">가독성 {formatGrade(post.readabilityScore ?? null)}</span>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="grid two">
        <div className="panel">
          <div className="section-header">
            <h3>반복 병목</h3>
          </div>

          <div className="stack-list">
            {analytics.riskLeaderboard.length ? (
              analytics.riskLeaderboard.map(([label, count]) => (
                <article className="score-band-row" key={label}>
                  <div className="section-split">
                    <strong>{label}</strong>
                    <span>{count}건</span>
                  </div>
                  <div className="bar-track">
                    <div
                      className="bar-fill bar-fill-risk"
                      style={{ width: `${Math.max(6, (count / Math.max(analytics.totalScored, 1)) * 100)}%` }}
                    />
                  </div>
                </article>
              ))
            ) : (
              <p className="muted">반복 병목 데이터가 아직 없습니다.</p>
            )}
          </div>
        </div>

        <div className="panel">
          <div className="section-header">
            <h3>실행 로그</h3>
          </div>

          <div className="stack-list">
            <article className="stack-item">
              <div className="pill-row">
                <span className="pill">엔진 {runDetail.run.engine}</span>
                <span className="pill">모델 {runDetail.run.model}</span>
                <span className="pill">상태 {formatRunStatus(runDetail.run.status)}</span>
              </div>
              <p className="muted">
                시작 {formatDateTime(runDetail.run.startedAt)} / 종료 {formatDateTime(runDetail.run.endedAt)}
              </p>
            </article>

            {runDetail.events.map((event) => (
              <article className={`stack-item ${event.level}`} key={event.id}>
                <div className="section-split">
                  <strong>{event.level}</strong>
                  <span>{formatDateTime(event.createdAt)}</span>
                </div>
                <p>{event.message}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="section-header">
          <h3>우선 실행 항목</h3>
        </div>

        <div className="stack-list">
          {selectedReport.priorityActions.length ? (
            selectedReport.priorityActions.map((action) => (
              <article className="action-box" key={action}>
                <p>{action}</p>
              </article>
            ))
          ) : (
            <p className="muted">이번 리포트에는 별도 우선 실행 항목이 없습니다.</p>
          )}
        </div>
      </section>
    </div>
  );
}
