import type {
  AnalyzeRequest,
  BlogCreateInput,
  DashboardResponse,
  ProviderName,
  SettingsPayload,
} from "@blog-review/shared";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!response.ok) {
    const error = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(error?.message ?? `Request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export const api = {
  getDashboard: () => request<DashboardResponse>("/api/dashboard"),
  getBlogs: () => request("/api/blogs"),
  getBlog: (id: string) => request(`/api/blogs/${id}`),
  createBlog: (payload: BlogCreateInput) =>
    request("/api/blogs", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateBlog: (id: string, payload: Record<string, unknown>) =>
    request(`/api/blogs/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  deleteBlog: (id: string) =>
    request(`/api/blogs/${id}`, {
      method: "DELETE",
    }),
  discoverBlog: (id: string) =>
    request(`/api/blogs/${id}/discover`, {
      method: "POST",
      body: JSON.stringify({}),
    }),
  analyzeBlog: (id: string, payload: AnalyzeRequest) =>
    request<{ runId: string }>(`/api/blogs/${id}/analyze`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  getRuns: () => request("/api/runs"),
  getRun: (id: string) => request(`/api/runs/${id}`),
  getReports: () => request("/api/reports"),
  getSettings: () => request("/api/settings"),
  saveSettings: (payload: SettingsPayload) =>
    request("/api/settings", {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  getProviderModels: (provider: ProviderName) => request(`/api/providers/${provider}/models`),
};
