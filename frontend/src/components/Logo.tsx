import { MessageCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { useSite } from "../lib/site";

export function Logo({ to = "/", dark = false }: { to?: string; dark?: boolean }) {
  const { siteName } = useSite();
  return (
    <Link to={to} className="inline-flex items-center gap-2">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white">
        <MessageCircle className="h-4 w-4" aria-hidden />
      </span>
      <span className={`font-display text-lg font-bold ${dark ? "text-white" : "text-ink"}`}>{siteName}</span>
    </Link>
  );
}
