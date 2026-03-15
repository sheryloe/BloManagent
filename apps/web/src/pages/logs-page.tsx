import { useEffect, useMemo, useState } from "react";
import { api } from "../api";

const formatDateTime = (value?: string | null) => (value ? new Date(value).toLocaleString("ko-KR") : "-");

const stageLabel = (status: string) => {
  if (status === "queued") return "대기";
  if (status === "in_progress") return "실행 중";
  if (status === "completed") return "완료";
  if (status === "failed") return "실패";
  return status;
};

const stageTone = (status: string) => {
  if (status === "completed") return "good";
  if (status === "failed") return "risk";
  if (status === "queued" || status === "in_progress") return "watch";
  return "neutral";
};

export function LogsPage() {
  const [runs, setRuns] = useState<any[]>([]);
  const [selectedRun, setSelectedRun] = useState<any>(null);

  useEffect(() => {
    let timer: number | undefined;
    const load = async () => {
      const nextRuns = (await api.getRuns()) as any[];
      setRuns(nextRuns);
      if (selectedRun?.run?.id) {
        setSelectedRun(await api.getRun(selectedRun.run.id));
      }
      if (nextRuns.some((run) => run.status === "queued" || run.status === "in_progress")) {
        timer = window.setTimeout(load, 2000);
      }
    };
    void load();
    return () => {
      if (timer) window.clearTimeout(timer);
    };
  }, [selectedRun?.run?.id]);

  const stats = useMemo(() => {
    return {
      total: runs.length,
      active: runs.filter((run) => run.status === "queued" || run.status === "in_progress").length,
      failed: runs.filter((run) => run.status === "failed").length,
      completed: runs.filter((run) => run.status === "completed").length,
    };
  }, [runs]);

  return (
    <div className="page">
      <section className="hero dashboard-hero">
        <div>
          <p className="eyebrow">Run Trace</p>
          <h2>수집과 분석이 어디까지 진행됐는지 추적하는 실행 로그 보드</h2>
          <p className="muted">
            대기, 실행 중, 완료, 실패 상태를 실시간으로 갱신합니다. 특정 실행을 누르면 아래에서 상세 이벤트 흐름을 바로 확인할 수
            있습니다.
          </p>
        </div>

        <div className="hero-stats dashboard-stats">
          <div className="metric-card">
            <span>전체 실행</span>
            <strong>{stats.total}</strong>
          </div>
          <div className="metric-card">
            <span>진행 중</span>
            <strong>{stats.active}</strong>
          </div>
          <div className="metric-card">
            <span>완료</span>
            <strong>{stats.completed}</strong>
          </div>
          <div className="metric-card">
            <span>실패</span>
            <strong>{stats.failed}</strong>
          </div>
        </div>
      </section>

      <section className="grid two">
        <section className="panel">
          <div className="section-header">
            <h3>실행 목록</h3>
          </div>
          <div className="stack-list">
            {runs.length ? (
              runs.map((run) => (
                <button
                  className="log-row"
                  key={run.id}
                  onClick={async () => {
                    setSelectedRun(await api.getRun(run.id));
                  }}
                  type="button"
                >
                  <div className="section-split">
                    <div>
                      <strong>{formatDateTime(run.startedAt)}</strong>
                      <p className="muted">
                        {run.engine} / {run.model}
                      </p>
                    </div>
                    <span className={`status-pill ${stageTone(run.status)}`}>{stageLabel(run.status)}</span>
                  </div>
                </button>
              ))
            ) : (
              <p className="muted">아직 실행 로그가 없습니다.</p>
            )}
          </div>
        </section>

        <section className="panel">
          <div className="section-header">
            <h3>상세 이벤트</h3>
          </div>
          {selectedRun ? (
            <div className="stack-list">
              <article className="summary-card">
                <small className="muted">선택한 실행</small>
                <strong>{stageLabel(selectedRun.run.status)}</strong>
                <p>
                  {selectedRun.run.engine} / {selectedRun.run.model} / 시작 {formatDateTime(selectedRun.run.startedAt)}
                </p>
              </article>

              {selectedRun.events.map((event: any) => (
                <article className={`stack-item ${event.level}`} key={event.id}>
                  <div className="section-split">
                    <strong>{event.level}</strong>
                    <span>{formatDateTime(event.createdAt)}</span>
                  </div>
                  <p>{event.message}</p>
                </article>
              ))}
            </div>
          ) : (
            <p className="muted">왼쪽 실행 목록에서 하나를 선택하면 단계별 로그가 여기에 표시됩니다.</p>
          )}
        </section>
      </section>
    </div>
  );
}
