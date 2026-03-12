import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api";
import { TrendSparkline } from "../components/trend";

export function BlogDetailPage() {
  const { blogId } = useParams();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!blogId) return;
    api
      .getBlog(blogId)
      .then(setData)
      .catch((nextError) => setError(nextError.message));
  }, [blogId]);

  if (error) return <div className="panel error">{error}</div>;
  if (!data) return <div className="panel">불러오는 중...</div>;

  return (
    <div className="page">
      <section className="hero compact">
        <div>
          <p className="eyebrow">{data.blog.platform}</p>
          <h2>{data.blog.name}</h2>
          <p className="muted">{data.blog.mainUrl}</p>
        </div>
        <TrendSparkline points={data.scoreHistory} />
      </section>

      <section className="grid two">
        <div className="panel">
          <div className="section-header">
            <h3>최근 추천</h3>
          </div>
          <div className="stack-list">
            {data.recommendations.map((item: any) => (
              <article className="stack-item" key={item.id}>
                <strong>{item.title}</strong>
                <p>{item.description}</p>
                <div className="pill-row">
                  {item.actionItems.map((action: string) => (
                    <span className="pill" key={action}>
                      {action}
                    </span>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="section-header">
            <h3>점수 이력</h3>
          </div>
          <div className="table">
            <div className="table-row table-head">
              <span>시작</span>
              <span>EBI</span>
              <span>제목</span>
              <span>구조</span>
            </div>
            {data.scoreHistory.map((row: any) => (
              <div className="table-row" key={row.startedAt}>
                <span>{new Date(row.startedAt).toLocaleDateString("ko-KR")}</span>
                <span>{row.ebiScore.toFixed(1)}</span>
                <span>{row.avgTitleStrength.toFixed(1)}</span>
                <span>{row.avgStructureScore.toFixed(1)}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="section-header">
          <h3>포스트 목록</h3>
        </div>
        <div className="table">
          <div className="table-row table-head">
            <span>제목</span>
            <span>발행일</span>
            <span>카테고리</span>
            <span>토픽</span>
          </div>
          {data.posts.map((post: any) => (
            <div className="table-row" key={post.id}>
              <span>
                <a href={post.url} rel="noreferrer" target="_blank">
                  {post.title ?? post.url}
                </a>
              </span>
              <span>{post.publishedAt ? new Date(post.publishedAt).toLocaleDateString("ko-KR") : "-"}</span>
              <span>{post.categoryName ?? "-"}</span>
              <span>{post.topicLabels.join(", ") || "-"}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
