import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/features/auth/useAuth";

export function RequireAuth({ role }: { role?: "officer" | "admin" }) {
  const { user, loading, sessionExpired } = useAuth();
  const location = useLocation();
  if (loading)
    return (
      <div role="status" className="mx-auto max-w-4xl p-10 text-center">
        Checking your session…
      </div>
    );
  if (!user) return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}${location.hash}`, sessionExpired }} />;
  if (role && user.role !== role && user.role !== "admin")
    return (
      <div role="alert" className="mx-auto max-w-4xl p-10">
        You do not have access to this page (403).
      </div>
    );
  return <Outlet />;
}
