import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { BlogCreateInput, BlogWithStats, RunScope } from "@blog-review/shared";
import { api } from "../api";

const initialForm: BlogCreateInput = {
  name: "",
  mainUrl: "",
  rssUrl: "",
};

export function BlogsPage() {
  const [blogs, setBlogs] = useState<BlogWithStats[]>([]);
  const [form, setForm] = useState<BlogCreateInput>(initialForm);
  const [message, setMessage] = useState<string | null>(null);
  const [scope, setScope] = useState<RunScope>("latest30");

  const load = async () => {
    setBlogs((await api.getBlogs()) as BlogWithStats[]);
  };

  useEffect(() => {
    void load();
  }, []);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    await api.createBlog(form);
    setForm(initialForm);
    setMessage("블로그가 등록되었습니다.");
    await load();
  };

  return (
    <div className="page">
      <section className="grid two">
        <form className="panel form-panel" onSubmit={onSubmit}>
          <div className="section-header">
            <h3>블로그 등록</h3>
          </div>
          <label>
            이름
            <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
          </label>
          <label>
            메인 URL
            <input
              value={form.mainUrl}
              onChange={(event) => setForm({ ...form, mainUrl: event.target.value })}
              placeholder="https://example.tistory.com"
              required
            />
          </label>
          <label>
            RSS URL
            <input value={form.rssUrl ?? ""} onChange={(event) => setForm({ ...form, rssUrl: event.target.value })} />
          </label>
          <button className="primary-button" type="submit">
            저장
          </button>
          {message ? <p className="muted">{message}</p> : null}
        </form>

        <section className="panel form-panel">
          <div className="section-header">
            <h3>분석 범위 기본값</h3>
          </div>
          <label>
            수동 분석 기본 범위
            <select value={scope} onChange={(event) => setScope(event.target.value as RunScope)}>
              <option value="latest7">최근 7일</option>
              <option value="latest30">최근 30일</option>
              <option value="newOnly">신규/변경 글만</option>
              <option value="full">전체 리프레시</option>
            </select>
          </label>
          <p className="muted">아래 Analyze Now 버튼에서 이 값을 사용합니다.</p>
        </section>
      </section>

      <section className="panel">
        <div className="section-header">
          <h3>블로그 목록</h3>
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
                  <span className="pill">포스트 {blog.postCount}</span>
                  <span className="pill">EBI {blog.latestEbiScore?.toFixed(1) ?? "-"}</span>
                </div>
              </div>
              <div className="button-row">
                <button
                  onClick={async () => {
                    await api.discoverBlog(blog.id);
                    await load();
                  }}
                >
                  Discover
                </button>
                <button
                  className="primary-button"
                  onClick={async () => {
                    const response = await api.analyzeBlog(blog.id, { runScope: scope });
                    setMessage(`분석 런이 시작되었습니다: ${response.runId}`);
                    await load();
                  }}
                >
                  Analyze Now
                </button>
                <button
                  className="danger-button"
                  onClick={async () => {
                    await api.deleteBlog(blog.id);
                    await load();
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
