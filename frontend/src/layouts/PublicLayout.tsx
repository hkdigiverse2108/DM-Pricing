import { Link, Outlet } from "react-router-dom";
import { Logo } from "../components/Logo";
import { useUserAuth } from "../lib/session";
import { useSite } from "../lib/site";

export function PublicLayout() {
  const { user } = useUserAuth();
  const { siteName, supportEmail } = useSite();
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <header className="border-b border-line">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Logo />
          <nav className="flex items-center gap-1 text-sm font-medium sm:gap-2">
            <Link to="/pricing" className="rounded-lg px-3 py-2 text-ink-soft hover:bg-ink/5">Pricing</Link>
            {user ? (
              <Link to="/app" className="rounded-lg bg-brand-600 px-4 py-2 text-white hover:bg-brand-700">Open dashboard</Link>
            ) : (
              <>
                <Link to="/login" className="rounded-lg px-3 py-2 text-ink-soft hover:bg-ink/5">Log in</Link>
                <Link to="/register" className="rounded-lg bg-brand-600 px-4 py-2 text-white hover:bg-brand-700">Get started</Link>
              </>
            )}
          </nav>
        </div>
      </header>
      <main className="flex-1"><Outlet /></main>
      <footer className="border-t border-line py-8 text-sm text-ink-mute">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 sm:px-6">
          <span>&copy; {new Date().getFullYear()} {siteName}</span>
          {supportEmail && <a href={`mailto:${supportEmail}`} className="hover:text-ink">{supportEmail}</a>}
        </div>
      </footer>
    </div>
  );
}
