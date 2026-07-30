import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { motion } from "framer-motion";
import { ArrowRight, UtensilsCrossed } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface TenantData {
  id: string;
  name: string;
  primary_color: string | null;
  logo_url: string | null;
  welcome_message: string | null;
  branch_id: string;
  is_open: boolean;
}

const fetchTenantBySlug = async (slug: string): Promise<TenantData | null> => {
  const { data, error } = await supabase
    .from("tenants")
    .select(`
      id, name, primary_color, logo_url, welcome_message,
      restaurants!inner(
        branches!inner(id, is_open)
      )
    `)
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();

  if (error || !data) return null;

  const restaurants = data.restaurants as any[];
  const branch = restaurants?.[0]?.branches?.[0];
  if (!branch) return null;

  return {
    id: data.id,
    name: data.name,
    primary_color: data.primary_color,
    logo_url: data.logo_url,
    welcome_message: data.welcome_message,
    branch_id: branch.id,
    is_open: branch.is_open ?? true,
  };
};

function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

export default function RestaurantSplash() {
  const { slug } = useParams<{ slug: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const { data: tenant, isLoading, isError } = useQuery({
    queryKey: ["tenant-splash", slug],
    queryFn: () => fetchTenantBySlug(slug!),
    enabled: !!slug,
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-background flex items-center justify-center">
        <Skeleton className="h-16 w-16 rounded-full" />
      </div>
    );
  }

  if (isError || !tenant) {
    return (
      <div className="fixed inset-0 bg-background flex flex-col items-center justify-center gap-3 p-6 text-center">
        <UtensilsCrossed className="h-10 w-10 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Restaurante no encontrado</p>
      </div>
    );
  }

  const primaryColor = tenant.primary_color || "#E8531D";
  const { h, s, l } = hexToHsl(primaryColor);
  const initial = tenant.name.charAt(0).toUpperCase();
  const isDark = l < 50;

  const handleGoToMenu = () => {
    const mesa = searchParams.get("mesa");
    const params = mesa ? `?mesa=${mesa}` : "";
    navigate(`/${slug}/menu${params}`, {
      state: { tenantId: tenant.id, branchId: tenant.branch_id },
    });
  };

  return (
    <div
      className="fixed inset-0 overflow-hidden flex flex-col items-center justify-center"
      style={{ backgroundColor: primaryColor }}
    >
      {/* Subtle radial glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(circle at 50% 40%, hsla(${h}, ${s}%, ${Math.min(l + 20, 95)}%, 0.3) 0%, transparent 70%)`,
        }}
      />

      {/* Center content */}
      <motion.div
        className="relative z-10 flex flex-col items-center gap-5 px-8 text-center"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
      >
        {/* Logo or initial */}
        {tenant.logo_url ? (
          <motion.img
            src={tenant.logo_url}
            alt={tenant.name}
            className="h-20 w-20 rounded-2xl object-cover shadow-lg"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
          />
        ) : (
          <motion.div
            className="flex h-20 w-20 items-center justify-center rounded-2xl text-3xl font-black shadow-lg"
            style={{
              backgroundColor: isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.1)",
              color: isDark ? "#fff" : "rgba(0,0,0,0.7)",
            }}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
          >
            {initial}
          </motion.div>
        )}

        {/* Restaurant name */}
        <motion.h1
          className="text-2xl font-extrabold leading-tight max-w-[260px]"
          style={{ color: isDark ? "#fff" : "rgba(0,0,0,0.85)" }}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
        >
          {tenant.name}
        </motion.h1>

        {/* Welcome message */}
        {tenant.welcome_message && (
          <motion.p
            className="text-sm max-w-[240px] leading-relaxed"
            style={{ color: isDark ? "rgba(255,255,255,0.7)" : "rgba(0,0,0,0.5)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.35 }}
          >
            {tenant.welcome_message}
          </motion.p>
        )}

        {/* CTA Button */}
        <motion.button
          onClick={handleGoToMenu}
          disabled={!tenant.is_open}
          className="mt-2 flex items-center gap-2 rounded-full px-8 py-3.5 text-sm font-bold shadow-xl transition-transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
          style={{
            backgroundColor: isDark ? "#fff" : "rgba(0,0,0,0.85)",
            color: isDark ? primaryColor : "#fff",
          }}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45, type: "spring", stiffness: 200 }}
        >
          {tenant.is_open ? (
            <>
              Ver menú
              <ArrowRight className="h-4 w-4" />
            </>
          ) : (
            "Cerrado ahora"
          )}
        </motion.button>
      </motion.div>

      {/* Powered by */}
      <motion.div
        className="absolute bottom-6 z-10 flex items-center gap-1.5 text-[11px] font-medium tracking-wide"
        style={{ color: isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.25)" }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.7 }}
      >
        powered by <span className="font-bold tracking-normal">tablio.</span>
      </motion.div>
    </div>
  );
}
