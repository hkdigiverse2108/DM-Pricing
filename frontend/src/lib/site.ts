import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { api } from "./api";

export type SiteSettings = Record<string, string>;

export function useSite() {
  const q = useQuery({
    queryKey: ["site"],
    queryFn: () => api.get<SiteSettings>("/public/site").then((r) => r.data),
    staleTime: 5 * 60 * 1000,
  });
  const s = q.data ?? {};
  const siteName = s.site_name || "Comment-to-DM";
  useEffect(() => {
    document.title = siteName;
  }, [siteName]);
  return {
    siteName,
    tagline: s.tagline || "",
    heroTitle: s.hero_title || "Turn every comment into a DM",
    heroSubtitle: s.hero_subtitle || "Reply publicly, message privately, and never miss a lead.",
    supportEmail: s.support_email || "",
    currency: s.currency_symbol || "$",
  };
}
