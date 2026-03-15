import { eq } from "drizzle-orm";
import type { AppSettings, Blog, BlogCreateInput, BlogWithStats } from "@blog-review/shared";
import { blogCreateSchema, blogSchema, blogWithStatsSchema, calculateQualityComponents } from "@blog-review/shared";
import { db, sqlite } from "../db/client";
import { blogs, postEngagementSnapshots, posts } from "../db/schema";
import { discoverPosts, getAdapter, resolvePlatform } from "../platforms";
import { createId, nowIso, safeJsonParse, sha256, toBoolean } from "../lib/utils";
import { topIssuesFromAnalysis } from "./heuristics";
import { getAppSettings } from "./settings-service";

const NAVER_POLICY_MESSAGE =
  "naver_opt_in_required: Naver public crawl is disabled by default. Enable it in Settings if you understand the policy risk.";

export class NaverOptInRequiredError extends Error {
  code = "naver_opt_in_required" as const;

  constructor() {
    super(NAVER_POLICY_MESSAGE);
  }
}

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

const normalizeHost = (hostname: string) => hostname.replace(/^www\./, "");

const deriveBlogName = (mainUrl: string) => {
  const url = new URL(mainUrl);
  if (url.hostname.includes("blog.naver.com") || url.hostname.includes("m.blog.naver.com")) {
    return url.searchParams.get("blogId") ?? url.pathname.split("/").filter(Boolean)[0] ?? normalizeHost(url.hostname);
  }

  return normalizeHost(url.hostname);
};

const calculateQualityFromAverages = (row: Record<string, unknown>) =>
  calculateQualityComponents({
    titleStrength: Number(row.avg_title_strength ?? 0),
    hookStrength: Number(row.avg_hook_strength ?? 0),
    structureScore: Number(row.avg_structure_score ?? 0),
    informationDensityScore: Number(row.avg_information_density_score ?? 0),
    practicalityScore: Number(row.avg_practicality_score ?? 0),
    differentiationScore: Number(row.avg_differentiation_score ?? 0),
    seoPotentialScore: Number(row.avg_seo_potential_score ?? 0),
    audienceFitScore: Number(row.avg_audience_fit_score ?? 0),
  });

const calculateQualityFromPostRow = (row: Record<string, unknown> | null) => {
  if (!row || row.title_strength == null) return null;
  return calculateQualityComponents({
    titleStrength: Number(row.title_strength ?? 0),
    hookStrength: Number(row.hook_strength ?? 0),
    structureScore: Number(row.structure_score ?? 0),
    informationDensityScore: Number(row.information_density_score ?? 0),
    practicalityScore: Number(row.practicality_score ?? 0),
    differentiationScore: Number(row.differentiation_score ?? 0),
    seoPotentialScore: Number(row.seo_potential_score ?? 0),
    audienceFitScore: Number(row.audience_fit_score ?? 0),
  });
};

const deletePostsWithArtifacts = (postIds: string[]) => {
  if (!postIds.length) return;
  const placeholders = postIds.map(() => "?").join(", ");
  sqlite.prepare(`DELETE FROM post_engagement_snapshots WHERE post_id IN (${placeholders})`).run(...postIds);
  sqlite.prepare(`DELETE FROM post_analyses WHERE post_id IN (${placeholders})`).run(...postIds);
  sqlite.prepare(`DELETE FROM posts WHERE id IN (${placeholders})`).run(...postIds);
};

const removeStoredNonPostUrls = (
  blog: Blog,
  existing: Array<{
    id: string;
    url: string;
    content_hash: string | null;
  }>,
) => {
  if (blog.platform !== "tistory") return existing;

  const adapter = getAdapter(blog.platform);
  const blogHost = normalizeHost(new URL(blog.mainUrl).hostname);
  const stalePostIds = existing
    .filter((item) => {
      try {
        const url = new URL(item.url);
        return normalizeHost(url.hostname) === blogHost && !adapter.isPostUrl(url);
      } catch {
        return false;
      }
    })
    .map((item) => item.id);

  deletePostsWithArtifacts(stalePostIds);
  return stalePostIds.length ? existing.filter((item) => !stalePostIds.includes(item.id)) : existing;
};

const aggregatedScoreRowsForBlog = (blogId: string, limit: number) =>
  sqlite
    .prepare(
      `
      SELECT
        ar.id as run_id,
        ar.started_at,
        AVG(pa.title_strength) as avg_title_strength,
        AVG(pa.hook_strength) as avg_hook_strength,
        AVG(pa.structure_score) as avg_structure_score,
        AVG(pa.information_density_score) as avg_information_density_score,
        AVG(pa.practicality_score) as avg_practicality_score,
        AVG(pa.differentiation_score) as avg_differentiation_score,
        AVG(pa.seo_potential_score) as avg_seo_potential_score,
        AVG(pa.audience_fit_score) as avg_audience_fit_score
      FROM analysis_run_targets art
      JOIN analysis_runs ar ON ar.id = art.run_id
      JOIN post_analyses pa ON pa.run_id = ar.id
      JOIN posts p ON p.id = pa.post_id AND p.blog_id = art.blog_id
      WHERE art.blog_id = ? AND ar.status = 'completed'
      GROUP BY ar.id, ar.started_at
      HAVING COUNT(p.id) > 0
      ORDER BY ar.started_at DESC
      LIMIT ?
      `,
    )
    .all(blogId, limit) as Array<Record<string, unknown>>;

export const assertBlogCrawlAllowed = async (blog: Blog, settings?: AppSettings) => {
  const appSettings = settings ?? (await getAppSettings());
  if (blog.platform === "naver" && !appSettings.allowNaverPublicCrawl) {
    throw new NaverOptInRequiredError();
  }
  return appSettings;
};

const buildIssueSnapshot = (analysisRows: Array<Record<string, unknown>>) => {
  const counts = new Map<string, number>();
  let watchPostCount = 0;

  for (const row of analysisRows) {
    const quality = calculateQualityFromPostRow(row);
    if (!quality) continue;
    if (quality.qualityScore < 60) watchPostCount += 1;

    for (const issue of topIssuesFromAnalysis({
      headlineScore: quality.headlineScore,
      readabilityScore: quality.readabilityScore,
      valueScore: quality.valueScore,
      originalityScore: quality.originalityScore,
      searchFitScore: quality.searchFitScore,
    })) {
      counts.set(issue, (counts.get(issue) ?? 0) + 1);
    }
  }

  const topIssues = Array.from(counts.entries())
    .sort((left, right) => right[1] - left[1])
    .slice(0, 3)
    .map(([issue]) => issue);

  return {
    analyzedPostCount: analysisRows.length,
    watchPostCount,
    topIssues,
  };
};

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
        MAX(p.last_crawled_at) as last_crawl_at
      FROM blogs b
      LEFT JOIN posts p ON p.blog_id = b.id
      GROUP BY b.id
      ORDER BY b.created_at DESC
      `,
    )
    .all() as Array<Record<string, unknown>>;

  return rows.map((row) => {
    const blogId = String(row.id);
    const latestScores = aggregatedScoreRowsForBlog(blogId, 2);

    const latestQualityScore = latestScores[0] ? calculateQualityFromAverages(latestScores[0]).qualityScore : null;
    const previousQualityScore = latestScores[1] ? calculateQualityFromAverages(latestScores[1]).qualityScore : null;

    const latestRunId = (row.latest_run_id as string | null) ?? null;
    const analysisRows = latestRunId
      ? (sqlite
          .prepare(
            `
            SELECT
              pa.title_strength,
              pa.hook_strength,
              pa.structure_score,
              pa.information_density_score,
              pa.practicality_score,
              pa.differentiation_score,
              pa.seo_potential_score,
              pa.audience_fit_score
            FROM post_analyses pa
            WHERE pa.run_id = ?
            ORDER BY pa.created_at DESC
            `,
          )
          .all(latestRunId) as Array<Record<string, unknown>>)
      : [];

    const issueSnapshot = buildIssueSnapshot(analysisRows);

    return blogWithStatsSchema.parse({
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
      analyzedPostCount: issueSnapshot.analyzedPostCount,
      watchPostCount: issueSnapshot.watchPostCount,
      topIssues: issueSnapshot.topIssues,
      latestRunId,
      latestRunAt: (row.latest_run_at as string | null) ?? null,
      latestQualityScore,
      previousQualityScore,
      lastCrawlAt: (row.last_crawl_at as string | null) ?? null,
    });
  });
};

export const getBlog = async (id: string) => {
  const row = await db.select().from(blogs).where(eq(blogs.id, id)).get();
  if (!row) return null;
  return mapBlog(row);
};

export const createBlog = async (input: BlogCreateInput) => {
  const parsed = blogCreateSchema.parse(input);
  const adapter = await resolvePlatform(parsed.mainUrl, parsed.platformOverride);
  const now = nowIso();
  const id = createId("blog");

  await db.insert(blogs).values({
    id,
    name: parsed.name?.trim() || deriveBlogName(parsed.mainUrl),
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

export const updateBlog = async (id: string, input: Partial<BlogCreateInput & { isActive: boolean }>) => {
  const current = await getBlog(id);
  if (!current) return null;
  const nextUrl = input.mainUrl ?? current.mainUrl;
  const adapter = await resolvePlatform(nextUrl, input.platformOverride ?? current.platform);
  const now = nowIso();

  await db
    .update(blogs)
    .set({
      name: input.name?.trim() || current.name,
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
  const postIds = sqlite
    .prepare("SELECT id FROM posts WHERE blog_id = ?")
    .all(id)
    .map((row) => (row as { id: string }).id);
  const runIds = sqlite
    .prepare("SELECT run_id FROM analysis_run_targets WHERE blog_id = ?")
    .all(id)
    .map((row) => (row as { run_id: string }).run_id);
  const reportIds = sqlite
    .prepare("SELECT id FROM weekly_reports WHERE run_id IN (SELECT run_id FROM analysis_run_targets WHERE blog_id = ?)")
    .all(id)
    .map((row) => (row as { id: string }).id);

  const transaction = sqlite.transaction(() => {
    if (postIds.length) {
      deletePostsWithArtifacts(postIds);
    }

    if (reportIds.length) {
      const placeholders = reportIds.map(() => "?").join(", ");
      sqlite.prepare(`DELETE FROM topic_summaries WHERE weekly_report_id IN (${placeholders})`).run(...reportIds);
      sqlite.prepare(`DELETE FROM recommendations WHERE weekly_report_id IN (${placeholders})`).run(...reportIds);
      sqlite.prepare(`DELETE FROM blog_weekly_scores WHERE weekly_report_id IN (${placeholders})`).run(...reportIds);
      sqlite.prepare(`DELETE FROM weekly_reports WHERE id IN (${placeholders})`).run(...reportIds);
    }

    if (runIds.length) {
      const placeholders = runIds.map(() => "?").join(", ");
      sqlite.prepare(`DELETE FROM cost_logs WHERE run_id IN (${placeholders})`).run(...runIds);
      sqlite.prepare(`DELETE FROM run_events WHERE run_id IN (${placeholders})`).run(...runIds);
      sqlite.prepare(`DELETE FROM analysis_run_targets WHERE run_id IN (${placeholders})`).run(...runIds);
      sqlite.prepare(`DELETE FROM analysis_runs WHERE id IN (${placeholders})`).run(...runIds);
    }

    sqlite.prepare("DELETE FROM blogs WHERE id = ?").run(id);
  });

  transaction();
  return { success: true };
};

export const discoverBlogPosts = async (blogId: string) => {
  let blog = await getBlog(blogId);
  if (!blog) throw new Error("Blog not found.");

  const appSettings = await assertBlogCrawlAllowed(blog);

  if (blog.platform === "generic") {
    const resolved = await resolvePlatform(blog.mainUrl);
    if (resolved.platform !== blog.platform) {
      await db
        .update(blogs)
        .set({
          platform: resolved.platform,
          updatedAt: nowIso(),
        })
        .where(eq(blogs.id, blogId));
      blog = await getBlog(blogId);
      if (!blog) throw new Error("Blog not found.");
      await assertBlogCrawlAllowed(blog, appSettings);
    }
  }

  const discovery = await discoverPosts(
    blog.mainUrl,
    blog.platform,
    {
      rssUrl: blog.rssUrl ?? null,
      sitemapUrl: blog.sitemapUrl ?? null,
    },
    {
      rssPriority: appSettings.rssPriority,
      sitemapPriority: appSettings.sitemapPriority,
    },
  );

  const discovered = discovery.posts;
  const adapter = getAdapter(blog.platform);
  const now = nowIso();
  const existing = sqlite.prepare("SELECT id, url, content_hash FROM posts WHERE blog_id = ?").all(blogId) as Array<{
    id: string;
    url: string;
    content_hash: string | null;
  }>;
  const sanitizedExisting = removeStoredNonPostUrls(blog, existing);
  const existingByUrl = new Map(sanitizedExisting.map((item) => [item.url, item]));
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
      if (storedPost && appSettings.collectEngagementSnapshots) {
        const engagement = await adapter.extractEngagement(
          fetched.url,
          fetched.pageHtml || fetched.contentRaw || fetched.contentClean,
        );
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
    sourceCounts: discovery.sourceCounts,
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
        (SELECT pa.summary FROM post_analyses pa JOIN analysis_runs ar ON ar.id = pa.run_id WHERE pa.post_id = p.id AND ar.status = 'completed' ORDER BY pa.created_at DESC LIMIT 1) as latest_summary,
        (SELECT pa.topic_labels_json FROM post_analyses pa JOIN analysis_runs ar ON ar.id = pa.run_id WHERE pa.post_id = p.id AND ar.status = 'completed' ORDER BY pa.created_at DESC LIMIT 1) as latest_topics,
        (SELECT pa.strengths_json FROM post_analyses pa JOIN analysis_runs ar ON ar.id = pa.run_id WHERE pa.post_id = p.id AND ar.status = 'completed' ORDER BY pa.created_at DESC LIMIT 1) as latest_strengths,
        (SELECT pa.weaknesses_json FROM post_analyses pa JOIN analysis_runs ar ON ar.id = pa.run_id WHERE pa.post_id = p.id AND ar.status = 'completed' ORDER BY pa.created_at DESC LIMIT 1) as latest_weaknesses,
        (SELECT pa.improvements_json FROM post_analyses pa JOIN analysis_runs ar ON ar.id = pa.run_id WHERE pa.post_id = p.id AND ar.status = 'completed' ORDER BY pa.created_at DESC LIMIT 1) as latest_improvements,
        (SELECT pa.title_strength FROM post_analyses pa JOIN analysis_runs ar ON ar.id = pa.run_id WHERE pa.post_id = p.id AND ar.status = 'completed' ORDER BY pa.created_at DESC LIMIT 1) as title_strength,
        (SELECT pa.hook_strength FROM post_analyses pa JOIN analysis_runs ar ON ar.id = pa.run_id WHERE pa.post_id = p.id AND ar.status = 'completed' ORDER BY pa.created_at DESC LIMIT 1) as hook_strength,
        (SELECT pa.structure_score FROM post_analyses pa JOIN analysis_runs ar ON ar.id = pa.run_id WHERE pa.post_id = p.id AND ar.status = 'completed' ORDER BY pa.created_at DESC LIMIT 1) as structure_score,
        (SELECT pa.information_density_score FROM post_analyses pa JOIN analysis_runs ar ON ar.id = pa.run_id WHERE pa.post_id = p.id AND ar.status = 'completed' ORDER BY pa.created_at DESC LIMIT 1) as information_density_score,
        (SELECT pa.practicality_score FROM post_analyses pa JOIN analysis_runs ar ON ar.id = pa.run_id WHERE pa.post_id = p.id AND ar.status = 'completed' ORDER BY pa.created_at DESC LIMIT 1) as practicality_score,
        (SELECT pa.differentiation_score FROM post_analyses pa JOIN analysis_runs ar ON ar.id = pa.run_id WHERE pa.post_id = p.id AND ar.status = 'completed' ORDER BY pa.created_at DESC LIMIT 1) as differentiation_score,
        (SELECT pa.seo_potential_score FROM post_analyses pa JOIN analysis_runs ar ON ar.id = pa.run_id WHERE pa.post_id = p.id AND ar.status = 'completed' ORDER BY pa.created_at DESC LIMIT 1) as seo_potential_score,
        (SELECT pa.audience_fit_score FROM post_analyses pa JOIN analysis_runs ar ON ar.id = pa.run_id WHERE pa.post_id = p.id AND ar.status = 'completed' ORDER BY pa.created_at DESC LIMIT 1) as audience_fit_score
      FROM posts p
      WHERE p.blog_id = ?
      ORDER BY COALESCE(p.published_at, p.created_at) DESC
      LIMIT 50
      `,
    )
    .all(id) as Array<Record<string, unknown>>;

  const mappedPosts = postRows
    .map((row) => {
      const quality = calculateQualityFromPostRow(row);
      return {
        id: String(row.id),
        title: String(row.title ?? row.url),
        url: String(row.url),
        publishedAt: (row.published_at as string | null) ?? null,
        categoryName: (row.category_name as string | null) ?? null,
        tags: safeJsonParse(row.tags_json as string | null, [] as string[]),
        summary: (row.latest_summary as string | null) ?? null,
        topicLabels: safeJsonParse(row.latest_topics as string | null, [] as string[]),
        strengths: safeJsonParse(row.latest_strengths as string | null, [] as string[]),
        weaknesses: safeJsonParse(row.latest_weaknesses as string | null, [] as string[]),
        improvements: safeJsonParse(row.latest_improvements as string | null, [] as string[]),
        updatedAt: String(row.updated_at),
        qualityScore: quality?.qualityScore ?? null,
        qualityStatus: quality?.qualityStatus ?? null,
        headlineScore: quality?.headlineScore ?? null,
        readabilityScore: quality?.readabilityScore ?? null,
        valueScore: quality?.valueScore ?? null,
        originalityScore: quality?.originalityScore ?? null,
        searchFitScore: quality?.searchFitScore ?? null,
      };
    })
    .sort((left, right) => {
      if (left.qualityScore == null && right.qualityScore == null) return 0;
      if (left.qualityScore == null) return 1;
      if (right.qualityScore == null) return -1;
      return left.qualityScore - right.qualityScore;
    });

  const scoreRows = aggregatedScoreRowsForBlog(id, 12);

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
    posts: mappedPosts,
    scoreHistory: scoreRows.map((row) => {
      const quality = calculateQualityFromAverages(row);
      return {
        startedAt: row.started_at,
        qualityScore: quality.qualityScore,
        headlineScore: quality.headlineScore,
        readabilityScore: quality.readabilityScore,
        valueScore: quality.valueScore,
      };
    }),
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
