import { createBrowserRouter, type RouteObject } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { HomePage } from "@/pages/HomePage";
import { ReportPage } from "@/pages/ReportPage";
import { TrackPage } from "@/pages/TrackPage";
import { OfficerPage } from "@/pages/OfficerPage";
import { NotFoundPage } from "@/pages/NotFoundPage";
import { WardExplorerPage } from "@/pages/WardExplorerPage";
import { WardDetailPage } from "@/pages/WardDetailPage";
import { LoginPage } from "@/pages/LoginPage";
import { AdminPage } from "@/pages/AdminPage";
import { RequireAuth } from "@/features/auth/RequireAuth";

export const routes: RouteObject[] = [
  {
    element: <AppShell />,
    children: [
      {
        path: "/",
        element: <HomePage />,
      },
      {
        path: "/report",
        element: <ReportPage />,
      },
      {
        path: "/track",
        element: <TrackPage />,
      },
      { path: "/login", element: <LoginPage /> },
      {
        path: "/wards",
        element: <WardExplorerPage />,
      },
      {
        path: "/wards/:wardId",
        element: <WardDetailPage />,
      },
      { element: <RequireAuth />, children: [
        { path: "/officer", element: <OfficerPage /> },
        { element: <RequireAuth role="admin" />, children: [{ path: "/admin", element: <AdminPage /> }] },
      ] },
      {
        path: "*",
        element: <NotFoundPage />,
      },
    ],
  },
];

export const router = createBrowserRouter(routes);
