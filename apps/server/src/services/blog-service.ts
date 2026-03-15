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
export const VERIFIED_CRAWL_STATUS = "verified";
export const EXCLUDED_CRAWL_STATUS = "excluded";

type CrawlStatus = typeof VERIFIED_CRAWL_STATUS | typeof EXCLUDED_CRAWL_STATUS;
type DiscoverySourceName = "rss" | "sitemap" | "main" | "wp-json";
type ExistingStoredPost = {
  id: string;
  url: string;
  content_hash: string | null;
  crawl_status: string | null;
  discovery_source: string | null;
  exclusion_reason: string | null;
};

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

const updateStoredPostState = (
  rowId: string,
  values: {
    crawlStatus: CrawlStatus;
    discoverySource?: string | null;
    exclusionReason?: string | null;
    lastVerifiedAt?: string | null;
    excludedAt?: string | null;
    lastCrawledAt?: string | null;
    updatedAt: string;
  },
) => {
  sqlite
    .prepare(
      `
      UPDATE posts
      SET
        crawl_status = @crawlStatus,
        discovery_source = @discoverySource,
        exclusion_reason = @exclusionReason,
        last_verified_at = @lastVerifiedAt,
        excluded_at = @excludedAt,
        last_crawled_at = COALESCE(@lastCrawledAt, last_crawled_at),
        updated_at = @updatedAt
      WHERE id = @id
      `,
    )
    .run({
      id: rowId,
      crawlStatus: values.crawlStatus,
      discoverySource: values.discoverySource ?? null,
      exclusionReason: values.exclusionReason ?? null,
      lastVerifiedAt: values.lastVerifiedAt ?? null,
      excludedAt: values.excludedAt ?? null,
      lastCrawledAt: values.lastCrawledAt ?? null,
      updatedAt: values.updatedAt,
    });
};

const excludeStoredPost = (
  existingByUrl: Map<string, ExistingStoredPost>,
  input: {
    blogId: string;
    url: string;
    source: DiscoverySourceName | null;
    reason: string;
    now: string;
  },
) => {
  const current = existingByUrl.get(input.url);
  if (!current) {
    const id = createId("post");
    sqlite
      .prepare(
        `
        INSERT INTO posts (
          id, blog_id, url, title, published_at, category_name, tags_json, content_raw, content_clean, content_hash,
          crawl_status, discovery_source, exclusion_reason, last_verified_at, excluded_at,
          discovered_at, last_crawled_at, created_at, updated_at
        ) VALUES (
          @id, @blogId, @url, NULL, NULL, NULL, @tagsJson, NULL, NULL, NULL,
          @crawlStatus, @discoverySource, @exclusionReason, NULL, @excludedAt,
          @discoveredAt, @lastCrawledAt, @createdAt, @updatedAt
        )
        `,
      )
      .run({
        id,
        blogId: input.blogId,
        url: input.url,
        tagsJson: JSON.stringify([]),
        crawlStatus: EXCLUDED_CRAWL_STATUS,
        discoverySource: input.source,
        exclusionReason: input.reason,
        excludedAt: input.now,
        discoveredAt: input.now,
        lastCrawledAt: input.now,
        createdAt: input.now,
        updatedAt: input.now,
      });
    existingByUrl.set(input.url, {
      id,
      url: input.url,
      content_hash: null,
      crawl_status: EXCLUDED_CRAWL_STATUS,
      discovery_source: input.source,
      exclusion_reason: input.reason,
    });
    return;
  }

  updateStoredPostState(current.id, {
    crawlStatus: EXCLUDED_CRAWL_STATUS,
    discoverySource: input.source ?? current.discovery_source,
    exclusionReason: input.reason,
    lastVerifiedAt: null,
    excludedAt: input.now,
    lastCrawledAt: input.now,
    updatedAt: input.now,
  });
  existingByUrl.set(input.url, {
    ...current,
    crawl_status: EXCLUDED_CRAWL_STATUS,
    discovery_source: input.source ?? current.discovery_source,
    exclusion_reason: input.reason,
  });
};

const normalizeStoredTistoryRows = (blog: Blog, existingByUrl: Map<string, ExistingStoredPost>, now: string) => {
  if (blog.platform !== "tistory") return;

  const adapter = getAdapter(blog.platform);
  const blogHost = normalizeHost(new URL(blog.mainUrl).hostname);
  for (const current of existingByUrl.values()) {
    try {
      const url = new URL(current.url);
      if (normalizeHost(url.hostname) !== blogHost) continue;
      if (adapter.isPostUrl(url)) continue;

      updateStoredPostState(current.id, {
        crawlStatus: EXCLUDED_CRAWL_STATUS,
        discoverySource: current.discovery_source,
        exclusionReason: "blocked_path",
        lastVerifiedAt: null,
        excludedAt: now,
        updatedAt: now,
      });
      existingByUrl.set(current.url, {
        ...current,
        crawl_status: EXCLUDED_CRAWL_STATUS,
        exclusion_reason: "blocked_path",
      });
    } catch {
      continue;
    }
  }
};

const fetchFailureReason = (error: unknown) => {
  const message = error instanceof Error ? error.message : "";
  if (/not .*post page/i.test(message) || /not .*article/i.test(message)) {
    return "not_article";
  }
  return "fetch_failed";
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
      JOIN posts p ON p.id = pa.post_id AND p.blog_id = art.blog_id AND COALESCE(p.crawl_status, 'verified') = 'verified'
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
      LEFT JOIN posts p ON p.blog_id = b.id AND COALESCE(p.crawl_status, 'verified') = 'verified'
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
            JOIN posts p ON p.id = pa.post_id
            WHERE pa.run_id = ?
              AND COALESCE(p.crawl_status, 'verified') = 'verified'
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
  const existing = sqlite
    .prepare(
      `
      SELECT id, url, content_hash, crawl_status, discovery_source, exclusion_reason
      FROM posts
      WHERE blog_id = ?
      `,
    )
    .all(blogId) as ExistingStoredPost[];
  const existingByUrl = new Map(existing.map((item) => [item.url, item]));
  normalizeStoredTistoryRows(blog, existingByUrl, now);
  let inserted = 0;
  let updated = 0;
  let verifiedCount = 0;
  let verifiedFromPrimarySources = 0;
  const insertedPostIds: string[] = [];
  const updatedPostIds: string[] = [];
  const acceptedSourceCounts = {
    rss: 0,
    sitemap: 0,
    main: 0,
    wpJson: 0,
  };

  for (const item of discovered) {
    if (blog.platform === "tistory" && item.source === "main" && verifiedFromPrimarySources > 0) {
      continue;
    }

    try {
      const candidateUrl = new URL(item.url);
      if (!adapter.isPostUrl(candidateUrl)) {
        excludeStoredPost(existingByUrl, {
          blogId,
          url: item.url,
          source: item.source,
          reason: "blocked_path",
          now,
        });
        console.info(`[discover:${blog.platform}] excluded ${item.url} (blocked_path)`);
        continue;
      }
    } catch {
      excludeStoredPost(existingByUrl, {
        blogId,
        url: item.url,
        source: item.source,
        reason: "invalid_url",
        now,
      });
      console.info(`[discover:${blog.platform}] excluded ${item.url} (invalid_url)`);
      continue;
    }

    try {
      const fetched = await adapter.fetchPost(item.url);
      const hash = sha256(fetched.contentClean);
      const current = existingByUrl.get(fetched.url);
      const nextState = {
        title: fetched.title,
        publishedAt: fetched.publishedAt ?? null,
        categoryName: fetched.categoryName ?? null,
        tagsJson: JSON.stringify(fetched.tags),
        contentRaw: fetched.contentRaw,
        contentClean: fetched.contentClean,
        contentHash: hash,
        crawlStatus: VERIFIED_CRAWL_STATUS,
        discoverySource: item.source,
        exclusionReason: null,
        lastVerifiedAt: now,
        excludedAt: null,
        lastCrawledAt: now,
        updatedAt: now,
      } as const;

      let storedPostId: string;
      if (!current) {
        const postId = createId("post");
        await db.insert(posts).values({
          id: postId,
          blogId,
          url: fetched.url,
          title: nextState.title,
          publishedAt: nextState.publishedAt,
          categoryName: nextState.categoryName,
          tagsJson: nextState.tagsJson,
          contentRaw: nextState.contentRaw,
          contentClean: nextState.contentClean,
          contentHash: nextState.contentHash,
          crawlStatus: nextState.crawlStatus,
          discoverySource: nextState.discoverySource,
          exclusionReason: nextState.exclusionReason,
          lastVerifiedAt: nextState.lastVerifiedAt,
          excludedAt: nextState.excludedAt,
          discoveredAt: now,
          lastCrawledAt: nextState.lastCrawledAt,
          createdAt: now,
          updatedAt: nextState.updatedAt,
        });
        inserted += 1;
        insertedPostIds.push(postId);
        storedPostId = postId;
        existingByUrl.set(fetched.url, {
          id: postId,
          url: fetched.url,
          content_hash: hash,
          crawl_status: VERIFIED_CRAWL_STATUS,
          discovery_source: item.source,
          exclusion_reason: null,
        });
      } else if (current.content_hash !== hash || current.crawl_status !== VERIFIED_CRAWL_STATUS) {
        await db
          .update(posts)
          .set(nextState)
          .where(eq(posts.id, current.id));
        updated += 1;
        updatedPostIds.push(current.id);
        storedPostId = current.id;
        existingByUrl.set(fetched.url, {
          ...current,
          content_hash: hash,
          crawl_status: VERIFIED_CRAWL_STATUS,
          discovery_source: item.source,
          exclusion_reason: null,
        });
      } else {
        await db
          .update(posts)
          .set({
            crawlStatus: VERIFIED_CRAWL_STATUS,
            discoverySource: item.source,
            exclusionReason: null,
            lastVerifiedAt: now,
            excludedAt: null,
            lastCrawledAt: now,
            updatedAt: now,
          })
          .where(eq(posts.id, current.id));
        storedPostId = current.id;
        existingByUrl.set(fetched.url, {
          ...current,
          crawl_status: VERIFIED_CRAWL_STATUS,
          discovery_source: item.source,
          exclusion_reason: null,
        });
      }

      verifiedCount += 1;
      if (item.source !== "main") {
        verifiedFromPrimarySources += 1;
      }
      if (item.source === "wp-json") {
        acceptedSourceCounts.wpJson += 1;
      } else {
        acceptedSourceCounts[item.source] += 1;
      }

      if (appSettings.collectEngagementSnapshots) {
        const engagement = await adapter.extractEngagement(
          fetched.url,
          fetched.pageHtml || fetched.contentRaw || fetched.contentClean,
        );
        await db.insert(postEngagementSnapshots).values({
          id: createId("eng"),
          postId: storedPostId,
          commentsCount: engagement.commentsCount ?? null,
          likesCount: engagement.likesCount ?? null,
          sympathyCount: engagement.sympathyCount ?? null,
          viewsCount: engagement.viewsCount ?? null,
          capturedAt: now,
          rawJson: JSON.stringify(engagement.rawJson ?? {}),
        });
      }
    } catch (error) {
      const reason = fetchFailureReason(error);
      excludeStoredPost(existingByUrl, {
        blogId,
        url: item.url,
        source: item.source,
        reason,
        now,
      });
      console.info(`[discover:${blog.platform}] excluded ${item.url} (${reason})`);
      continue;
    }
  }

  return {
    blog,
    discoveredCount: verifiedCount,
    insertedCount: inserted,
    updatedCount: updated,
    insertedPostIds,
    updatedPostIds,
    sourceCounts: acceptedSourceCounts,
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
        AND COALESCE(p.crawl_status, 'verified') = 'verified'
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
        AND EXISTS (
          SELECT 1
          FROM post_analyses pa
          JOIN posts p ON p.id = pa.post_id
          WHERE pa.run_id = ar.id
            AND p.blog_id = art.blog_id
            AND COALESCE(p.crawl_status, 'verified') = 'verified'
        )
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
