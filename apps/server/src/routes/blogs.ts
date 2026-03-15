import type { FastifyInstance } from "fastify";
import { analyzeRequestSchema, blogCreateSchema } from "@blog-review/shared";
import { analysisCoordinator } from "../services/run-service";
import {
  NaverOptInRequiredError,
  createBlog,
  deleteBlog,
  discoverBlogPosts,
  getBlogDetail,
  listBlogs,
  updateBlog,
} from "../services/blog-service";

export const registerBlogRoutes = async (app: FastifyInstance) => {
  app.get("/api/blogs", async () => listBlogs());

  app.get("/api/blogs/:id", async (request, reply) => {
    const result = await getBlogDetail((request.params as { id: string }).id);
    if (!result) {
      return reply.status(404).send({ message: "Blog not found." });
    }
    return result;
  });

  app.post("/api/blogs", async (request, reply) => {
    try {
      const blog = await createBlog(blogCreateSchema.parse(request.body));
      return reply.status(201).send(blog);
    } catch (error) {
      return reply.status(400).send({ message: error instanceof Error ? error.message : "Blog create failed." });
    }
  });

  app.patch("/api/blogs/:id", async (request, reply) => {
    try {
      const result = await updateBlog((request.params as { id: string }).id, request.body as Record<string, unknown>);
      if (!result) {
        return reply.status(404).send({ message: "Blog not found." });
      }
      return result;
    } catch (error) {
      return reply.status(400).send({ message: error instanceof Error ? error.message : "Blog update failed." });
    }
  });

  app.delete("/api/blogs/:id", async (request) => deleteBlog((request.params as { id: string }).id));

  app.post("/api/blogs/:id/discover", async (request, reply) => {
    try {
      return await discoverBlogPosts((request.params as { id: string }).id);
    } catch (error) {
      if (error instanceof NaverOptInRequiredError) {
        return reply.status(403).send({ code: error.code, message: error.message });
      }
      return reply.status(400).send({ message: error instanceof Error ? error.message : "Discover failed." });
    }
  });

  app.post("/api/blogs/:id/analyze", async (request, reply) => {
    try {
      const body = analyzeRequestSchema.parse(request.body ?? {});
      return reply.status(202).send(await analysisCoordinator.start((request.params as { id: string }).id, body));
    } catch (error) {
      if (error instanceof NaverOptInRequiredError) {
        return reply.status(403).send({ code: error.code, message: error.message });
      }
      return reply.status(400).send({ message: error instanceof Error ? error.message : "Analyze failed." });
    }
  });
};
