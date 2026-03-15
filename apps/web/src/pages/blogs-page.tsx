import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { AnalysisEngine, BlogCreateInput, BlogDiscoveryResult, BlogWithStats, RunScope } from "@blog-review/shared";
import { api } from "../api";

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

  return `${result.discoveredCount}개 발견, ${result.insertedCount}개 신규, ${result.updatedCount}개 갱신 (${parts})`;
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

  const load = async () => {
    setBlogs(await api.getBlogs());
  };

  useEffect(() => {
    void load();
  }, []);

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

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);

    try {
      const created = await api.createBlog(form);
      const discovery = await handleDiscover(created.id, `${created.name} 저장 완료.`);
      setForm(initialForm);
      setShowAdvanced(false);
      setMessage(`${created.name} 저장 완료. ${formatDiscoveryMessage(discovery)}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "블로그 등록에 실패했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="page">
      <section className="grid two">
        <form className="panel form-panel" onSubmit={onSubmit}>
          <div className="section-header">
            <h3>메인 URL만 입력</h3>
          </div>

          <label>
            블로그 메인 URL
            <input
              value={form.mainUrl}
              onChange={(event) => setForm({ ...form, mainUrl: event.target.value })}
              placeholder="https://storybeing.tistory.com"
              required
            />
          </label>

          <p className="muted form-note">
            공개 메인 URL만 넣으면 RSS, sitemap, wp-json, 메인 페이지 링크를 순서대로 확인해 자동 수집합니다.
          </p>

          <div className="button-row">
            <button className="ghost-button" type="button" onClick={() => setShowAdvanced((current) => !current)}>
              {showAdvanced ? "고급 옵션 숨기기" : "고급 옵션 보기"}
            </button>
          </div>

          {showAdvanced ? (
            <div className="advanced-panel">
              <label>
                표시 이름
                <input
                  value={form.name ?? ""}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                  placeholder="비워두면 URL에서 자동 생성"
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
            {isSubmitting ? "저장 중..." : "저장 후 자동 수집"}
          </button>

          {message ? <p className="muted">{message}</p> : null}
        </form>

        <section className="panel form-panel">
          <div className="section-header">
            <h3>분석 실행 옵션</h3>
          </div>

          <label>
            기본 분석 범위
            <select value={scope} onChange={(event) => setScope(event.target.value as RunScope)}>
              <option value="latest7">최근 7일</option>
              <option value="latest30">최근 30일</option>
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

          <p className="muted">
            기본값은 algorithm입니다. AI 엔진을 선택해도 점수는 알고리즘으로 고정되고, 요약과 문장 보강만 선택적으로 사용됩니다.
          </p>
        </section>
      </section>

      <section className="panel">
        <div className="section-header">
          <h3>등록된 블로그</h3>
        </div>

        <div className="card-list">
          {blogs.map((blog) => (
            <article className="blog-card blog-card-wide" key={blog.id}>
              <div>
                <Link className="blog-link" to={`/blogs/${blog.id}`}>
                  {blog.name}
                </Link>
                <p className="muted">{blog.mainUrl}</p>
                <div className="pill-row">
                  <span className="pill">{blog.platform}</span>
                  <span className="pill">수집 글 {blog.postCount}</span>
                  <span className="pill">분석 글 {blog.analyzedPostCount}</span>
                  <span className="pill">최신 점수 {blog.latestQualityScore?.toFixed(1) ?? "-"}</span>
                  <span className="pill">주의 글 {blog.watchPostCount}</span>
                </div>
                {blog.topIssues.length ? (
                  <p className="muted">반복 이슈: {blog.topIssues.join(", ")}</p>
                ) : (
                  <p className="muted">아직 반복 이슈가 없습니다.</p>
                )}
              </div>

              <div className="button-row">
                <button
                  disabled={activeBlogId === blog.id}
                  onClick={async () => {
                    try {
                      await handleDiscover(blog.id);
                    } catch (error) {
                      setMessage(error instanceof Error ? error.message : "수집에 실패했습니다.");
                    }
                  }}
                >
                  {activeBlogId === blog.id ? "수집 중..." : "다시 수집"}
                </button>

                <button
                  className="primary-button"
                  disabled={activeBlogId === blog.id}
                  onClick={async () => {
                    try {
                      const response = await api.analyzeBlog(blog.id, { runScope: scope, engine });
                      setMessage(`분석 시작: ${response.runId}`);
                      await load();
                    } catch (error) {
                      setMessage(error instanceof Error ? error.message : "분석에 실패했습니다.");
                    }
                  }}
                >
                  Analyze Now
                </button>

                <button
                  className="danger-button"
                  disabled={activeBlogId === blog.id}
                  onClick={async () => {
                    try {
                      await api.deleteBlog(blog.id);
                      setMessage(`${blog.name} 삭제 완료.`);
                      await load();
                    } catch (error) {
                      setMessage(error instanceof Error ? error.message : "삭제에 실패했습니다.");
                    }
                  }}
                >
                  삭제
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
