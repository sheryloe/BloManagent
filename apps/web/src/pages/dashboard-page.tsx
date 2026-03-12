import { useEffect, useState } from "react";
import type { DashboardResponse } from "@blog-review/shared";
import { api } from "../api";

export function DashboardPage() {
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getDashboard()
      .then(setData)
      .catch((nextError) => setError(nextError.message));
  }, []);

  if (error) return <div className="panel error">{error}</div>;
  if (!data) return <div className="panel">불러오는 중...</div>;

  return (
    <div className="page">
      <section className="hero">
        <div>
          <p className="eyebrow">WEEKLY CONTROL</p>
          <h2>오늘 기준 블로그 상태</h2>
          <p className="muted">최신 런과 직전 런 차이를 한 번에 확인합니다.</p>
        </div>
        <div className="hero-stats">
          <div className="metric-card">
            <span>등록 블로그</span>
            <strong>{data.blogs.length}</strong>
          </div>
          <div className="metric-card">
            <span>완료 런</span>
            <strong>{data.latestRuns.filter((run) => run.status === "completed").length}</strong>
          </div>
          <div className="metric-card">
            <span>최신 추천</span>
            <strong>{data.latestRecommendations.length}</strong>
          </div>
        </div>
      </section>

      <section className="grid two">
        <div className="panel">
          <div className="section-header">
            <h3>블로그 카드</h3>
          </div>
          <div className="card-list">
            {data.blogs.map((blog) => {
              const delta =
                blog.latestEbiScore != null && blog.previousEbiScore != null
                  ? blog.latestEbiScore - blog.previousEbiScore
                  : null;
              return (
                <div className="blog-card" key={blog.id}>
                  <div>
                    <strong>{blog.name}</strong>
                    <p className="muted">{blog.platform}</p>
                  </div>
                  <div className="blog-card-score">
                    <span>EBI</span>
                    <strong>{blog.latestEbiScore?.toFixed(1) ?? "-"}</strong>
                    <small className={delta != null && delta >= 0 ? "delta up" : "delta down"}>
                      {delta == null ? "이전 런 없음" : `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}`}
                    </small>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="panel">
          <div className="section-header">
            <h3>최신 추천</h3>
          </div>
          <div className="stack-list">
            {data.latestRecommendations.map((item) => (
              <article className="stack-item" key={item.id}>
                <div className="pill-row">
                  <span className="pill">{item.recommendationType}</span>
                  <span className="pill">우선순위 {item.priority}</span>
                </div>
                <strong>{item.title}</strong>
                <p>{item.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="section-header">
          <h3>최신 런</h3>
        </div>
        <div className="table">
          <div className="table-row table-head">
            <span>시작</span>
            <span>제공자</span>
            <span>모델</span>
            <span>상태</span>
            <span>포스트</span>
            <span>비용</span>
          </div>
          {data.latestRuns.map((run) => (
            <div className="table-row" key={run.id}>
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
