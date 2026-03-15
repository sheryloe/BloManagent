import { useEffect, useState } from "react";
import { api } from "../api";

export function ReportsPage() {
  const [reports, setReports] = useState<any[]>([]);

  useEffect(() => {
    api.getReports().then((data) => setReports(data as any[]));
  }, []);

  return (
    <div className="page">
      <section className="panel">
        <div className="section-header">
          <h3>분석 리포트</h3>
        </div>
        <div className="stack-list">
          {reports.map((report) => (
            <article className="stack-item" key={report.id}>
              <div className="pill-row">
                <span className="pill">{report.blogName}</span>
                <span className="pill">
                  {new Date(report.weekStart).toLocaleDateString("ko-KR")} -{" "}
                  {new Date(report.weekEnd).toLocaleDateString("ko-KR")}
                </span>
              </div>
              <strong>{report.overallSummary}</strong>
              <p>다음 주제: {report.nextWeekTopics.join(", ") || "-"}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
