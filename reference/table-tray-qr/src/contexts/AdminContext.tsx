import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useParams, useNavigate } from "react-router-dom";

interface AdminContextType {
  tenantId: string;
  branchId: string;
  tenantName: string;
  branchName: string;
  primaryColor: string;
  slug: string;
  role: string;
  userId: string;
  isLoading: boolean;
  isAuthenticated: boolean;
  isImpersonating: boolean;
  logout: () => Promise<void>;
}

const AdminContext = createContext<AdminContextType | null>(null);

export function AdminProvider({ children }: { children: React.ReactNode }) {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();

  const [state, setState] = useState<Omit<AdminContextType, "logout" | "isLoading" | "isAuthenticated" | "isImpersonating">>({
    tenantId: "",
    branchId: "",
    tenantName: "",
    branchName: "",
    primaryColor: "#E8531D",
    slug: slug ?? "",
    role: "",
    userId: "",
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Check for SuperAdmin impersonation
  const impersonatingTenantId = sessionStorage.getItem("superadmin_impersonating");
  const impersonatingSlug = sessionStorage.getItem("superadmin_impersonating_slug");
  const isImpersonating = !!impersonatingTenantId;

  const loadTenantData = useCallback(async (tenantId: string, userId: string, role: string) => {
    const { data: tenant } = await supabase
      .from("tenants")
      .select("id, name, primary_color, slug")
      .eq("id", tenantId)
      .single();

    if (!tenant) return false;

    // Get first branch
    const { data: branch } = await supabase
      .from("branches")
      .select("id, name")
      .eq("tenant_id", tenantId)
      .limit(1)
      .maybeSingle();

    setState({
      tenantId: tenant.id,
      branchId: branch?.id ?? "",
      tenantName: tenant.name,
      branchName: branch?.name ?? "",
      primaryColor: tenant.primary_color ?? "#E8531D",
      slug: tenant.slug,
      role,
      userId,
    });
    return true;
  }, []);

  const loadFromAuth = useCallback(async () => {
    // If impersonating, skip auth check
    if (impersonatingTenantId) {
      await loadTenantData(impersonatingTenantId, "superadmin", "owner");
      setIsAuthenticated(true);
      setIsLoading(false);
      return;
    }

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setIsAuthenticated(false);
      setIsLoading(false);
      return;
    }

    const userId = session.user.id;

    // Find tenant by slug
    if (!slug) {
      setIsLoading(false);
      return;
    }

    const { data: tenant } = await supabase
      .from("tenants")
      .select("id")
      .eq("slug", slug)
      .eq("is_active", true)
      .single();

    if (!tenant) {
      setIsLoading(false);
      return;
    }

    // Check membership
    const { data: member } = await supabase
      .from("tenant_members")
      .select("id, tenant_id, branch_id, role")
      .eq("user_id", userId)
      .eq("tenant_id", tenant.id)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    if (!member) {
      setIsAuthenticated(false);
      setIsLoading(false);
      return;
    }

    await loadTenantData(tenant.id, userId, member.role);
    setIsAuthenticated(true);
    setIsLoading(false);
  }, [slug, impersonatingTenantId, loadTenantData]);

  useEffect(() => {
    loadFromAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        setState(prev => ({ ...prev, tenantId: "", branchId: "", userId: "", role: "" }));
        setIsAuthenticated(false);
      }
      if (event === "SIGNED_IN") {
        loadFromAuth();
      }
    });

    return () => subscription.unsubscribe();
  }, [loadFromAuth]);

  const logout = async () => {
    if (isImpersonating) {
      sessionStorage.removeItem("superadmin_impersonating");
      sessionStorage.removeItem("superadmin_impersonating_slug");
      navigate("/superadmin/tenants");
      return;
    }
    await supabase.auth.signOut();
    navigate(`/admin/login`);
  };

  return (
    <AdminContext.Provider value={{ ...state, isLoading, isAuthenticated, isImpersonating, logout }}>
      {children}
    </AdminContext.Provider>
  );
}

export function useAdmin() {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error("useAdmin must be used within AdminProvider");
  return ctx;
}
