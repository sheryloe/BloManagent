import { useEffect, useState } from "react";
import { api } from "../api";

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

  return (
    <div className="page grid two">
      <section className="panel">
        <div className="section-header">
          <h3>분석 실행 로그</h3>
        </div>
        <div className="stack-list">
          {runs.map((run) => (
            <button
              className="log-row"
              key={run.id}
              onClick={async () => {
                setSelectedRun(await api.getRun(run.id));
              }}
              type="button"
            >
              <strong>{new Date(run.startedAt).toLocaleString("ko-KR")}</strong>
              <span>{run.engine}</span>
              <span>{run.status}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="section-header">
          <h3>상세 이벤트</h3>
        </div>
        {selectedRun ? (
          <div className="stack-list">
            {selectedRun.events.map((event: any) => (
              <article className={`stack-item ${event.level}`} key={event.id}>
                <strong>{event.level}</strong>
                <p>{event.message}</p>
                <small>{new Date(event.createdAt).toLocaleString("ko-KR")}</small>
              </article>
            ))}
          </div>
        ) : (
          <p className="muted">왼쪽 목록에서 실행을 선택해 주세요.</p>
        )}
      </section>
    </div>
  );
}
