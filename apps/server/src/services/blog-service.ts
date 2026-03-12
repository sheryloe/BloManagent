import { and, desc, eq, sql } from "drizzle-orm";
import type { Blog, BlogCreateInput, BlogWithStats } from "@blog-review/shared";
import { blogCreateSchema, blogSchema, blogWithStatsSchema } from "@blog-review/shared";
import { db, sqlite } from "../db/client";
import {
  analysisRuns,
  blogWeeklyScores,
  blogs,
  postEngagementSnapshots,
  posts,
  recommendations,
  weeklyReports,
} from "../db/schema";
import { detectPlatform, discoverPosts, getAdapter } from "../platforms";
import { createId, nowIso, safeJsonParse, sha256, toBoolean } from "../lib/utils";

const mapBlog = (row: typeof blogs.$inferSelect): Blog =>
  blogSchema.parse({
    id: row.id,
    name: row.name,
    mainUrl: row.mainUrl,
    platform: row.platform,
    rssUrl: row.rssUrl,
    sitemapUrl: row.sitemapUrl,
    description: row.description,
    isActive: toBoolean(row.isActive),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });

export const listBlogs = async (): Promise<BlogWithStats[]> => {
  const rows = sqlite
    .prepare(
      `
      SELECT
        b.*,
        COUNT(DISTINCT p.id) as post_count,
        (
          SELECT ar.id
          FROM analysis_run_targets art
          JOIN analysis_runs ar ON ar.id = art.run_id
          WHERE art.blog_id = b.id AND ar.status = 'completed'
          ORDER BY ar.started_at DESC
          LIMIT 1
        ) as latest_run_id,
        (
          SELECT ar.started_at
          FROM analysis_run_targets art
          JOIN analysis_runs ar ON ar.id = art.run_id
          WHERE art.blog_id = b.id AND ar.status = 'completed'
          ORDER BY ar.started_at DESC
          LIMIT 1
        ) as latest_run_at,
        (
          SELECT bws.ebi_score
          FROM analysis_run_targets art
          JOIN weekly_reports wr ON wr.run_id = art.run_id
          JOIN blog_weekly_scores bws ON bws.weekly_report_id = wr.id AND bws.blog_id = b.id
          JOIN analysis_runs ar ON ar.id = art.run_id
          WHERE art.blog_id = b.id AND ar.status = 'completed'
          ORDER BY ar.started_at DESC
          LIMIT 1
        ) as latest_ebi_score,
        (
          SELECT bws.ebi_score
          FROM analysis_run_targets art
          JOIN weekly_reports wr ON wr.run_id = art.run_id
          JOIN blog_weekly_scores bws ON bws.weekly_report_id = wr.id AND bws.blog_id = b.id
          JOIN analysis_runs ar ON ar.id = art.run_id
          WHERE art.blog_id = b.id AND ar.status = 'completed'
          ORDER BY ar.started_at DESC
          LIMIT 1 OFFSET 1
        ) as previous_ebi_score,
        MAX(p.last_crawled_at) as last_crawl_at
      FROM blogs b
      LEFT JOIN posts p ON p.blog_id = b.id
      GROUP BY b.id
      ORDER BY b.created_at DESC
      `,
    )
    .all() as Array<Record<string, unknown>>;

  return rows.map((row) =>
    blogWithStatsSchema.parse({
      id: row.id,
      name: row.name,
      mainUrl: row.main_url,
      platform: row.platform,
      rssUrl: row.rss_url,
      sitemapUrl: row.sitemap_url,
      description: row.description,
      isActive: Boolean(row.is_active),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      postCount: Number(row.post_count ?? 0),
      latestRunId: (row.latest_run_id as string | null) ?? null,
      latestRunAt: (row.latest_run_at as string | null) ?? null,
      latestEbiScore: row.latest_ebi_score == null ? null : Number(row.latest_ebi_score),
      previousEbiScore: row.previous_ebi_score == null ? null : Number(row.previous_ebi_score),
      lastCrawlAt: (row.last_crawl_at as string | null) ?? null,
    }),
  );
};

export const getBlog = async (id: string) => {
  const row = await db.select().from(blogs).where(eq(blogs.id, id)).get();
  if (!row) return null;
  return mapBlog(row);
};

export const createBlog = async (input: BlogCreateInput) => {
  const parsed = blogCreateSchema.parse(input);
  const adapter = detectPlatform(parsed.mainUrl, parsed.platformOverride);
  const now = nowIso();
  const id = createId("blog");

  await db.insert(blogs).values({
    id,
    name: parsed.name,
    mainUrl: parsed.mainUrl,
    platform: adapter.platform,
    rssUrl: parsed.rssUrl || null,
    sitemapUrl: null,
    description: parsed.description ?? null,
    isActive: 1,
    createdAt: now,
    updatedAt: now,
  });

  return getBlog(id);
};

export const updateBlog = async (
  id: string,
  input: Partial<BlogCreateInput & { isActive: boolean }>,
) => {
  const current = await getBlog(id);
  if (!current) return null;
  const nextUrl = input.mainUrl ?? current.mainUrl;
  const adapter = detectPlatform(nextUrl, input.platformOverride ?? current.platform);
  const now = nowIso();

  await db
    .update(blogs)
    .set({
      name: input.name ?? current.name,
      mainUrl: nextUrl,
      platform: adapter.platform,
      rssUrl: input.rssUrl === "" ? null : input.rssUrl ?? current.rssUrl ?? null,
      description: input.description ?? current.description ?? null,
      isActive: input.isActive == null ? (current.isActive ? 1 : 0) : input.isActive ? 1 : 0,
      updatedAt: now,
    })
    .where(eq(blogs.id, id));

  return getBlog(id);
};

export const deleteBlog = async (id: string) => {
  await db.delete(blogs).where(eq(blogs.id, id));
  return { success: true };
};

export const discoverBlogPosts = async (blogId: string) => {
  const blog = await getBlog(blogId);
  if (!blog) throw new Error("Blog not found.");

  const discovered = await discoverPosts(blog.mainUrl, blog.platform, {
    rssUrl: blog.rssUrl ?? null,
    sitemapUrl: blog.sitemapUrl ?? null,
  });

  const now = nowIso();
  const existing = sqlite.prepare("SELECT id, url, content_hash FROM posts WHERE blog_id = ?").all(blogId) as Array<{
    id: string;
    url: string;
    content_hash: string | null;
  }>;
  const existingByUrl = new Map(existing.map((item) => [item.url, item]));
  const adapter = getAdapter(blog.platform);
  let inserted = 0;
  let updated = 0;
  const insertedPostIds: string[] = [];
  const updatedPostIds: string[] = [];

  for (const item of discovered) {
    try {
      const fetched = await adapter.fetchPost(item.url);
      const hash = sha256(fetched.contentClean);
      const current = existingByUrl.get(fetched.url);
      if (!current) {
        const postId = createId("post");
        await db.insert(posts).values({
          id: postId,
          blogId,
          url: fetched.url,
          title: fetched.title,
          publishedAt: fetched.publishedAt ?? null,
          categoryName: fetched.categoryName ?? null,
          tagsJson: JSON.stringify(fetched.tags),
          contentRaw: fetched.contentRaw,
          contentClean: fetched.contentClean,
          contentHash: hash,
          discoveredAt: now,
          lastCrawledAt: now,
          createdAt: now,
          updatedAt: now,
        });
        inserted += 1;
        insertedPostIds.push(postId);
      } else if (current.content_hash !== hash) {
        await db
          .update(posts)
          .set({
            title: fetched.title,
            publishedAt: fetched.publishedAt ?? null,
            categoryName: fetched.categoryName ?? null,
            tagsJson: JSON.stringify(fetched.tags),
            contentRaw: fetched.contentRaw,
            contentClean: fetched.contentClean,
            contentHash: hash,
            lastCrawledAt: now,
            updatedAt: now,
          })
          .where(eq(posts.id, current.id));
        updated += 1;
        updatedPostIds.push(current.id);
      } else {
        await db
          .update(posts)
          .set({
            lastCrawledAt: now,
            updatedAt: now,
          })
          .where(eq(posts.id, current.id));
      }

      const storedPost = sqlite.prepare("SELECT id FROM posts WHERE url = ?").get(fetched.url) as { id: string } | undefined;
      if (storedPost) {
        const engagement = await adapter.extractEngagement(fetched.url, fetched.contentRaw || fetched.contentClean);
        await db.insert(postEngagementSnapshots).values({
          id: createId("eng"),
          postId: storedPost.id,
          commentsCount: engagement.commentsCount ?? null,
          likesCount: engagement.likesCount ?? null,
          sympathyCount: engagement.sympathyCount ?? null,
          viewsCount: engagement.viewsCount ?? null,
          capturedAt: now,
          rawJson: JSON.stringify(engagement.rawJson ?? {}),
        });
      }
    } catch {
      continue;
    }
  }

  return {
    blog,
    discoveredCount: discovered.length,
    insertedCount: inserted,
    updatedCount: updated,
    insertedPostIds,
    updatedPostIds,
  };
};

export const getBlogDetail = async (id: string) => {
  const blog = await getBlog(id);
  if (!blog) return null;

  const postRows = sqlite
    .prepare(
      `
      SELECT
        p.*,
        pa.summary as latest_summary,
        pa.topic_labels_json as latest_topics
      FROM posts p
      LEFT JOIN post_analyses pa ON pa.post_id = p.id
      LEFT JOIN analysis_runs ar ON ar.id = pa.run_id
      WHERE p.blog_id = ?
      GROUP BY p.id
      ORDER BY COALESCE(p.published_at, p.created_at) DESC
      LIMIT 50
      `,
    )
    .all(id) as Array<Record<string, unknown>>;

  const scoreRows = sqlite
    .prepare(
      `
      SELECT ar.started_at, bws.ebi_score, bws.avg_title_strength, bws.avg_structure_score
      FROM analysis_run_targets art
      JOIN analysis_runs ar ON ar.id = art.run_id
      JOIN weekly_reports wr ON wr.run_id = ar.id
      JOIN blog_weekly_scores bws ON bws.weekly_report_id = wr.id AND bws.blog_id = art.blog_id
      WHERE art.blog_id = ? AND ar.status = 'completed'
      ORDER BY ar.started_at DESC
      LIMIT 12
      `,
    )
    .all(id);

  const recommendationRows = sqlite
    .prepare(
      `
      SELECT r.*
      FROM recommendations r
      JOIN weekly_reports wr ON wr.id = r.weekly_report_id
      JOIN analysis_runs ar ON ar.id = wr.run_id
      JOIN analysis_run_targets art ON art.run_id = ar.id
      WHERE art.blog_id = ?
      ORDER BY r.created_at DESC
      LIMIT 6
      `,
    )
    .all(id) as Array<Record<string, unknown>>;

  return {
    blog,
    posts: postRows.map((row) => ({
      id: row.id,
      title: row.title,
      url: row.url,
      publishedAt: row.published_at,
      categoryName: row.category_name,
      tags: safeJsonParse(row.tags_json as string | null, [] as string[]),
      summary: row.latest_summary,
      topicLabels: safeJsonParse(row.latest_topics as string | null, [] as string[]),
      updatedAt: row.updated_at,
    })),
    scoreHistory: scoreRows.map((row) => ({
      startedAt: (row as Record<string, unknown>).started_at,
      ebiScore: Number((row as Record<string, unknown>).ebi_score ?? 0),
      avgTitleStrength: Number((row as Record<string, unknown>).avg_title_strength ?? 0),
      avgStructureScore: Number((row as Record<string, unknown>).avg_structure_score ?? 0),
    })),
    recommendations: recommendationRows.map((row) => ({
      id: row.id,
      title: row.title,
      description: row.description,
      priority: row.priority,
      actionItems: safeJsonParse(row.action_items_json as string | null, [] as string[]),
      createdAt: row.created_at,
    })),
  };
};

export const getReports = async () => {
  const rows = sqlite
    .prepare(
      `
      SELECT wr.*, b.name as blog_name
      FROM weekly_reports wr
      JOIN analysis_runs ar ON ar.id = wr.run_id
      JOIN analysis_run_targets art ON art.run_id = ar.id
      JOIN blogs b ON b.id = art.blog_id
      ORDER BY wr.created_at DESC
      LIMIT 30
      `,
    )
    .all() as Array<Record<string, unknown>>;

  return rows.map((row) => ({
    id: row.id,
    runId: row.run_id,
    weekStart: row.week_start,
    weekEnd: row.week_end,
    overallSummary: row.overall_summary,
    topicOverlap: safeJsonParse(row.topic_overlap_json as string | null, [] as string[]),
    topicGaps: safeJsonParse(row.topic_gaps_json as string | null, [] as string[]),
    blogComparisons: safeJsonParse(row.blog_comparisons_json as string | null, [] as string[]),
    priorityActions: safeJsonParse(row.priority_actions_json as string | null, [] as string[]),
    nextWeekTopics: safeJsonParse(row.next_week_topics_json as string | null, [] as string[]),
    markdownReport: row.markdown_report,
    createdAt: row.created_at,
    blogName: row.blog_name,
  }));
};
