import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import type {
  AnalysisEngine,
  BlogCreateInput,
  BlogDiscoveryResult,
  BlogWithStats,
  RunDetails,
  RunScope,
} from "@blog-review/shared";
import { api } from "../api";
import { formatGrade, formatGradeRange } from "../lib/quality";

const initialForm: BlogCreateInput = {
  mainUrl: "",
  rssUrl: "",
  name: "",
};

const formatDiscoveryMessage = (result: BlogDiscoveryResult) => {
  const parts = [
    `rss ${result.sourceCounts.rss}`,
    `sitemap ${result.sourceCounts.sitemap}`,
    `wp-json ${result.sourceCounts.wpJson}`,
    `main ${result.sourceCounts.main}`,
  ].join(" / ");

  return `확인 ${result.discoveredCount}건 · 신규 ${result.insertedCount}건 · 갱신 ${result.updatedCount}건 (${parts})`;
};

const isPendingRunStatus = (status: string) => status === "queued" || status === "in_progress";

const formatRunStatus = (status: string) => {
  if (status === "queued") return "대기 중";
  if (status === "in_progress") return "분석 중";
  if (status === "completed") return "완료";
  if (status === "failed") return "실패";
  return status;
};

type ActiveAnalysisRun = {
  runId: string;
  status: string;
};

export function BlogsPage() {
  const [blogs, setBlogs] = useState<BlogWithStats[]>([]);
  const [form, setForm] = useState<BlogCreateInput>(initialForm);
  const [message, setMessage] = useState<string | null>(null);
  const [scope, setScope] = useState<RunScope>("latest30");
  const [engine, setEngine] = useState<AnalysisEngine>("algorithm");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeBlogId, setActiveBlogId] = useState<string | null>(null);
  const [isResetting, setIsResetting] = useState(false);
  const [analysisRuns, setAnalysisRuns] = useState<Record<string, ActiveAnalysisRun>>({});

  const load = async () => {
    setBlogs(await api.getBlogs());
  };

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    const pendingEntries = Object.entries(analysisRuns).filter(([, run]) => isPendingRunStatus(run.status));
    if (!pendingEntries.length) return;

    let timer: number | undefined;
    let cancelled = false;

    const poll = async () => {
      const updates = await Promise.all(
        pendingEntries.map(async ([blogId, run]) => {
          try {
            const details = (await api.getRun(run.runId)) as RunDetails;
            return { blogId, details };
          } catch {
            return { blogId, details: null };
          }
        }),
      );

      if (cancelled) return;

      const nextRuns = { ...analysisRuns };
      const notices: string[] = [];
      let shouldReload = false;

      for (const { blogId, details } of updates) {
        const current = nextRuns[blogId];
        if (!current) continue;

        if (!details) {
          delete nextRuns[blogId];
          continue;
        }

        const nextStatus = details.run.status;
        const blogName = blogs.find((blog) => blog.id === blogId)?.name ?? "선택한 블로그";

        if (isPendingRunStatus(nextStatus)) {
          nextRuns[blogId] = {
            ...current,
            status: nextStatus,
          };
          continue;
        }

        delete nextRuns[blogId];
        shouldReload = true;

        if (nextStatus === "completed") {
          notices.push(`${blogName} 분석이 완료되었습니다.`);
        } else if (nextStatus === "failed") {
          notices.push(`${blogName} 분석이 실패했습니다. ${details.run.errorMessage ?? "실행 로그를 확인해 주세요."}`);
        }
      }

      setAnalysisRuns(nextRuns);

      if (shouldReload) {
        await load();
      }

      if (notices.length) {
        setMessage(notices[0]);
      }

      if (Object.values(nextRuns).some((run) => isPendingRunStatus(run.status))) {
        timer = window.setTimeout(poll, 2000);
      }
    };

    void poll();

    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [analysisRuns, blogs]);

  const handleDiscover = async (blogId: string, prefix?: string) => {
    setActiveBlogId(blogId);
    try {
      const result = await api.discoverBlog(blogId);
      setMessage(`${prefix ? `${prefix} ` : ""}${formatDiscoveryMessage(result)}`);
      await load();
      return result;
    } finally {
      setActiveBlogId(null);
    }
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);

    try {
      const created = await api.createBlog(form);
      const discovery = await handleDiscover(created.id, `${created.name} 등록 완료.`);
      setForm(initialForm);
      setShowAdvanced(false);
      setMessage(`${created.name} 등록 완료. ${formatDiscoveryMessage(discovery)}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "블로그 등록에 실패했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const onResetWorkspace = async () => {
    if (!window.confirm("현재 워크스페이스의 블로그, 수집 글, 분석 결과를 모두 비울까요? 설정과 비밀값은 유지됩니다.")) {
      return;
    }

    setIsResetting(true);
    try {
      await api.resetWorkspace();
      setBlogs([]);
      setAnalysisRuns({});
      setMessage("워크스페이스를 초기화했습니다. 설정은 유지하고 수집/분석 데이터만 비웠습니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "초기화에 실패했습니다.");
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="page">
      <section className="hero dashboard-hero intake-hero">
        <div>
          <p className="eyebrow">Intake Board</p>
          <h2>주소 넣고 바로 분석하는 휘발성 작업대</h2>
          <p className="muted">
            블로그 주소를 넣어도 되고 게시글 주소를 넣어도 됩니다. 게시글 주소를 넣으면 가능한 범위에서 블로그 기준으로 정규화해
            수집합니다.
          </p>
        </div>

        <div className="hero-stats dashboard-stats">
          <div className="metric-card">
            <span>등록 블로그</span>
            <strong>{blogs.length}</strong>
          </div>
          <div className="metric-card">
            <span>검증된 글 수</span>
            <strong>{blogs.reduce((sum, blog) => sum + blog.postCount, 0)}</strong>
          </div>
          <div className="metric-card">
            <span>주의 글 수</span>
            <strong>{blogs.reduce((sum, blog) => sum + blog.watchPostCount, 0)}</strong>
          </div>
          <div className="metric-card">
            <span>반복 제목 경고</span>
            <strong>{blogs.reduce((sum, blog) => sum + blog.repeatedTitleWarningCount, 0)}</strong>
          </div>
        </div>
      </section>

      <section className="grid two">
        <form className="panel form-panel" onSubmit={onSubmit}>
          <div className="section-header">
            <h3>주소 입력</h3>
          </div>

          <label>
            블로그 또는 게시글 주소
            <input
              value={form.mainUrl}
              onChange={(event) => setForm({ ...form, mainUrl: event.target.value })}
              placeholder="https://storybeing.tistory.com 또는 https://storybeing.tistory.com/18"
              required
            />
          </label>

          <p className="muted">게시글 주소를 넣어도 가능한 범위에서 블로그 루트 기준으로 맞춰 수집합니다.</p>

          <div className="button-row">
            <button className="ghost-button" onClick={() => setShowAdvanced((current) => !current)} type="button">
              {showAdvanced ? "고급 옵션 닫기" : "고급 옵션 열기"}
            </button>
          </div>

          {showAdvanced ? (
            <div className="advanced-panel">
              <label>
                표시 이름
                <input
                  value={form.name ?? ""}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                  placeholder="비워두면 주소 기준으로 자동 생성"
                />
              </label>

              <label>
                RSS URL override
                <input
                  value={form.rssUrl ?? ""}
                  onChange={(event) => setForm({ ...form, rssUrl: event.target.value })}
                  placeholder="https://example.com/feed"
                />
              </label>
            </div>
          ) : null}

          <button className="primary-button" disabled={isSubmitting} type="submit">
            {isSubmitting ? "등록 중..." : "등록하고 자동 수집"}
          </button>

          {message ? <p className="muted">{message}</p> : null}
        </form>

        <div className="stack-list">
          <section className="panel form-panel">
            <div className="section-header">
              <h3>분석 옵션</h3>
            </div>

            <label>
              분석 범위
              <select value={scope} onChange={(event) => setScope(event.target.value as RunScope)}>
                <option value="latest7">최근 7개</option>
                <option value="latest30">최근 30개</option>
                <option value="newOnly">새 글 또는 변경 글만</option>
                <option value="full">가능한 전체</option>
              </select>
            </label>

            <label>
              분석 엔진
              <select value={engine} onChange={(event) => setEngine(event.target.value as AnalysisEngine)}>
                <option value="algorithm">algorithm</option>
                <option value="google">google</option>
                <option value="openai">openai</option>
                <option value="ollama">ollama</option>
              </select>
            </label>

            <p className="muted">등급은 algorithm이 계산하고, AI 엔진은 설명 문장 보강용으로만 사용됩니다.</p>
          </section>

          <section className="panel workspace-reset">
            <div className="section-header">
              <h3>워크스페이스 초기화</h3>
            </div>
            <p className="muted">필요할 때만 수집하고 끝나면 비우는 휘발성 사용 흐름에 맞춘 초기화 버튼입니다.</p>
            <button className="danger-button" disabled={isResetting} onClick={onResetWorkspace} type="button">
              {isResetting ? "초기화 중..." : "초기화"}
            </button>
          </section>
        </div>
      </section>

      <section className="panel">
        <div className="section-header">
          <h3>등록된 블로그</h3>
        </div>

        <div className="card-list">
          {blogs.map((blog) => {
            const currentRun = analysisRuns[blog.id];
            const isAnalyzing = isPendingRunStatus(currentRun?.status ?? "");

            return (
              <article className="stack-item insight-card" key={blog.id}>
                <div className="section-split">
                  <div>
                    <Link className="blog-link" to={`/blogs/${blog.id}`}>
                      {blog.name}
                    </Link>
                    <p className="muted">{blog.mainUrl}</p>
                  </div>
                  <span className="status-pill neutral">{blog.platform}</span>
                </div>

                <div className="pill-row">
                  <span className="pill">검증 글 {blog.postCount}</span>
                  <span className="pill">분석 글 {blog.analyzedPostCount}</span>
                  <span className="pill">최신 등급 {blog.latestQualityGrade ?? formatGrade(blog.latestQualityScore)}</span>
                  <span className="pill">등급 범위 {formatGradeRange(blog.scoreRangeMin, blog.scoreRangeMax)}</span>
                  <span className="pill">점수 분산 {blog.distinctQualityScoreCount}</span>
                  {currentRun ? <span className="pill">{formatRunStatus(currentRun.status)}</span> : null}
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

                <div className="button-row">
                  <button
                    disabled={activeBlogId === blog.id || isAnalyzing}
                    onClick={async () => {
                      try {
                        await handleDiscover(blog.id);
                      } catch (error) {
                        setMessage(error instanceof Error ? error.message : "수집에 실패했습니다.");
                      }
                    }}
                    type="button"
                  >
                    {activeBlogId === blog.id ? "수집 중..." : "다시 수집"}
                  </button>

                  <button
                    className="primary-button"
                    disabled={activeBlogId === blog.id || isAnalyzing}
                    onClick={async () => {
                      try {
                        const response = await api.analyzeBlog(blog.id, { runScope: scope, engine });
                        setAnalysisRuns((current) => ({
                          ...current,
                          [blog.id]: {
                            runId: response.runId,
                            status: "queued",
                          },
                        }));
                        setMessage(`${blog.name} 분석을 시작했습니다. 완료되면 자동으로 상태를 갱신합니다.`);
                      } catch (error) {
                        setMessage(error instanceof Error ? error.message : "분석에 실패했습니다.");
                      }
                    }}
                    type="button"
                  >
                    {currentRun?.status === "queued"
                      ? "대기 중..."
                      : currentRun?.status === "in_progress"
                        ? "분석 중..."
                        : "분석 시작"}
                  </button>

                  <button
                    className="danger-button"
                    disabled={activeBlogId === blog.id || isAnalyzing}
                    onClick={async () => {
                      try {
                        await api.deleteBlog(blog.id);
                        setAnalysisRuns((current) => {
                          const next = { ...current };
                          delete next[blog.id];
                          return next;
                        });
                        setMessage(`${blog.name} 삭제 완료.`);
                        await load();
                      } catch (error) {
                        setMessage(error instanceof Error ? error.message : "삭제에 실패했습니다.");
                      }
                    }}
                    type="button"
                  >
                    삭제
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
