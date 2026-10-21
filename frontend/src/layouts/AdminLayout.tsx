import { Layers, LayoutDashboard, LogOut, Menu, Puzzle, Settings, ShieldCheck, Users, X } from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { cx } from "../components/ui";
import { useAdminAuth } from "../lib/session";

const NAV = [
  { to: "/admin-panel", label: "Overview", icon: LayoutDashboard, end: true },
  { to: "/admin-panel/users", label: "Users", icon: Users, end: false },
  { to: "/admin-panel/plans", label: "Pricing plans", icon: Layers, end: false },
  { to: "/admin-panel/addons", label: "Add-ons", icon: Puzzle, end: false },
  { to: "/admin-panel/settings", label: "Settings", icon: Settings, end: false },
];

export function AdminLayout() {
  const { user, signOut } = useAdminAuth();
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const navigate = useNavigate();

  useEffect(() => setOpen(false), [pathname]);

  const logout = () => {
    signOut();
    navigate("/admin-panel/login", { replace: true });
  };

  return (
    <div className="min-h-screen lg:flex">
      <div className="flex items-center justify-between border-b border-line bg-white px-4 py-3 lg:hidden">
        <span className="flex items-center gap-2 font-display font-bold"><ShieldCheck className="h-5 w-5 text-pop" aria-hidden /> Admin console</span>
        <button type="button" onClick={() => setOpen(true)} aria-label="Open menu" className="rounded p-2 hover:bg-ink/5"><Menu className="h-5 w-5" /></button>
      </div>
      {open && <div className="fixed inset-0 z-30 bg-ink/50 lg:hidden" onClick={() => setOpen(false)} aria-hidden />}

      <aside
        className={cx(
          "fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-line bg-white px-4 py-5 transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 font-display text-lg font-bold"><ShieldCheck className="h-5 w-5 text-pop" aria-hidden /> Admin console</span>
          <button type="button" onClick={() => setOpen(false)} aria-label="Close menu" className="rounded p-1 hover:bg-ink/5 lg:hidden"><X className="h-5 w-5" /></button>
        </div>
        <nav className="mt-8 flex-1 space-y-1">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cx("flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium", isActive ? "bg-pop-50 text-pop" : "text-ink-soft hover:bg-canvas")
              }
            >
              <Icon className="h-4 w-4" aria-hidden /> {label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-line pt-4">
          <p className="truncate text-sm font-medium">{user?.full_name}</p>
          <p className="truncate text-xs text-ink-mute">{user?.email}</p>
          <button type="button" onClick={logout} className="mt-3 flex items-center gap-2 text-sm text-ink-soft hover:text-ink"><LogOut className="h-4 w-4" aria-hidden /> Log out</button>
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-4 py-8 sm:px-8"><div className="mx-auto max-w-6xl"><Outlet /></div></main>
    </div>
  );
}
