import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { AppLayout } from "./components/layout";
import { BlogDetailPage } from "./pages/blog-detail-page";
import { BlogsPage } from "./pages/blogs-page";
import { DashboardPage } from "./pages/dashboard-page";
import { HelpPage } from "./pages/help-page";
import { LogsPage } from "./pages/logs-page";
import { ReportsPage } from "./pages/reports-page";
import { SettingsPage } from "./pages/settings-page";

const router = createBrowserRouter([
  {
    path: "/",
    element: <AppLayout />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: "blogs", element: <BlogsPage /> },
      { path: "blogs/:blogId", element: <BlogDetailPage /> },
      { path: "reports", element: <ReportsPage /> },
      { path: "help", element: <HelpPage /> },
      { path: "settings", element: <SettingsPage /> },
      { path: "logs", element: <LogsPage /> },
    ],
  },
]);

export function App() {
  return <RouterProvider router={router} />;
}
