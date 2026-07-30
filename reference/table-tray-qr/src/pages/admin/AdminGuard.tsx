import { Navigate, Outlet, useParams } from "react-router-dom";
import { useAdmin } from "@/contexts/AdminContext";

export default function AdminGuard() {
  const { isLoading, isAuthenticated } = useAdmin();
  const { slug } = useParams<{ slug: string }>();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/admin/login" replace />;
  }

  return <Outlet />;
}
