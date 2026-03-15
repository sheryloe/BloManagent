import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { BlogCreateInput, BlogDiscoveryResult, BlogWithStats, RunScope } from "@blog-review/shared";
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

  return `${result.discoveredCount} posts found, ${result.insertedCount} new, ${result.updatedCount} updated (${parts})`;
};

export function BlogsPage() {
  const [blogs, setBlogs] = useState<BlogWithStats[]>([]);
  const [form, setForm] = useState<BlogCreateInput>(initialForm);
  const [message, setMessage] = useState<string | null>(null);
  const [scope, setScope] = useState<RunScope>("latest30");
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
      const discovery = await handleDiscover(created.id, `Saved ${created.name}.`);
      setForm(initialForm);
      setShowAdvanced(false);
      setMessage(`Saved ${created.name}. ${formatDiscoveryMessage(discovery)}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to add blog.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="page">
      <section className="grid two">
        <form className="panel form-panel" onSubmit={onSubmit}>
          <div className="section-header">
            <h3>Main URL Only</h3>
          </div>

          <label>
            Blog main URL
            <input
              value={form.mainUrl}
              onChange={(event) => setForm({ ...form, mainUrl: event.target.value })}
              placeholder="https://example.tistory.com"
              required
            />
          </label>

          <p className="muted form-note">
            Enter a public blog URL and the app will try RSS, sitemap, wp-json, and main-page discovery automatically.
          </p>

          <div className="button-row">
            <button
              className="ghost-button"
              type="button"
              onClick={() => setShowAdvanced((current) => !current)}
            >
              {showAdvanced ? "Hide Advanced" : "Show Advanced"}
            </button>
          </div>

          {showAdvanced ? (
            <div className="advanced-panel">
              <label>
                Display name (optional)
                <input
                  value={form.name ?? ""}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                  placeholder="Auto-generated if left blank"
                />
              </label>

              <label>
                RSS URL override (optional)
                <input
                  value={form.rssUrl ?? ""}
                  onChange={(event) => setForm({ ...form, rssUrl: event.target.value })}
                  placeholder="https://example.com/feed"
                />
              </label>
            </div>
          ) : null}

          <button className="primary-button" disabled={isSubmitting} type="submit">
            {isSubmitting ? "Saving..." : "Save And Discover"}
          </button>

          {message ? <p className="muted">{message}</p> : null}
        </form>

        <section className="panel form-panel">
          <div className="section-header">
            <h3>Analyze Scope</h3>
          </div>

          <label>
            Default analysis range
            <select value={scope} onChange={(event) => setScope(event.target.value as RunScope)}>
              <option value="latest7">Latest 7 days</option>
              <option value="latest30">Latest 30 days</option>
              <option value="newOnly">New or changed only</option>
              <option value="full">Full refresh</option>
            </select>
          </label>

          <p className="muted">
            Analyze Now already runs discovery first, so a public main URL is enough to start.
          </p>
        </section>
      </section>

      <section className="panel">
        <div className="section-header">
          <h3>Blogs</h3>
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
                  <span className="pill">Posts {blog.postCount}</span>
                  <span className="pill">EBI {blog.latestEbiScore?.toFixed(1) ?? "-"}</span>
                </div>
              </div>

              <div className="button-row">
                <button
                  disabled={activeBlogId === blog.id}
                  onClick={async () => {
                    try {
                      await handleDiscover(blog.id);
                    } catch (error) {
                      setMessage(error instanceof Error ? error.message : "Discover failed.");
                    }
                  }}
                >
                  {activeBlogId === blog.id ? "Discovering..." : "Discover"}
                </button>

                <button
                  className="primary-button"
                  disabled={activeBlogId === blog.id}
                  onClick={async () => {
                    try {
                      const response = await api.analyzeBlog(blog.id, { runScope: scope });
                      setMessage(`Analysis started: ${response.runId}`);
                      await load();
                    } catch (error) {
                      setMessage(error instanceof Error ? error.message : "Analyze failed.");
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
                      setMessage(`${blog.name} removed.`);
                      await load();
                    } catch (error) {
                      setMessage(error instanceof Error ? error.message : "Delete failed.");
                    }
                  }}
                >
                  Delete
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
