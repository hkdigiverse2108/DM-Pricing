import { CreditCard, KeyRound, LayoutDashboard, Link2, LogOut, Menu, X } from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Logo } from "../components/Logo";
import { cx } from "../components/ui";
import { useUserAuth } from "../lib/session";

const NAV = [
  { to: "/app", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/app/accounts", label: "Accounts", icon: Link2, end: false },
  { to: "/app/keywords", label: "Keywords", icon: KeyRound, end: false },
  { to: "/app/plan", label: "Plan", icon: CreditCard, end: false },
];

export function AppLayout() {
  const { user, signOut } = useUserAuth();
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const navigate = useNavigate();

  useEffect(() => setOpen(false), [pathname]);

  const logout = () => {
    signOut();
    navigate("/", { replace: true });
  };

  return (
    <div className="min-h-screen lg:flex">
      <div className="flex items-center justify-between border-b border-line bg-white px-4 py-3 lg:hidden">
        <Logo to="/app" />
        <button type="button" onClick={() => setOpen(true)} aria-label="Open menu" className="rounded p-2 hover:bg-ink/5">
          <Menu className="h-5 w-5" />
        </button>
      </div>

      {open && <div className="fixed inset-0 z-30 bg-ink/50 lg:hidden" onClick={() => setOpen(false)} aria-hidden />}

      <aside
        className={cx(
          "fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-ink px-4 py-5 text-white transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-center justify-between">
          <Logo to="/app" dark />
          <button type="button" onClick={() => setOpen(false)} aria-label="Close menu" className="rounded p-1 hover:bg-white/10 lg:hidden">
            <X className="h-5 w-5" />
          </button>
        </div>
        <nav className="mt-8 flex-1 space-y-1">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cx(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium",
                  isActive ? "bg-white/10 text-white" : "text-white/70 hover:bg-white/5 hover:text-white",
                )
              }
            >
              <Icon className="h-4 w-4" aria-hidden />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-white/10 pt-4">
          <p className="truncate text-sm font-medium">{user?.user.full_name}</p>
          <p className="truncate text-xs text-white/60">{user?.user.email}</p>
          <button type="button" onClick={logout} className="mt-3 flex items-center gap-2 text-sm text-white/70 hover:text-white">
            <LogOut className="h-4 w-4" aria-hidden /> Log out
          </button>
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-4 py-8 sm:px-8">
        <div className="mx-auto max-w-5xl"><Outlet /></div>
      </main>
    </div>
  );
}
