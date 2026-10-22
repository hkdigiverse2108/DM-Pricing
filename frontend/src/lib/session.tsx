import { useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { ReactNode, createContext, useCallback, useContext, useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { PageSpinner } from "../components/ui";
import { Scope, api, tokenStore } from "./api";
import { Me, UserOut } from "./types";

export interface AuthCtx<T> {
  user: T | null;
  loading: boolean;
  signIn: (path: string, body: unknown) => Promise<void>;
  signOut: () => void;
  reload: () => Promise<void>;
}

/** One auth "session" per scope, so user and admin logins never mix. */
function makeAuth<T>(scope: Scope, fetchMe: () => Promise<T>, loginRoute: string) {
  const Ctx = createContext<AuthCtx<T> | null>(null);

  function AuthProvider({ children }: { children: ReactNode }) {
    const qc = useQueryClient();
    const [user, setUser] = useState<T | null>(null);
    const [loading, setLoading] = useState<boolean>(() => tokenStore.get(scope) !== null);

    useEffect(() => {
      let alive = true;
      if (!tokenStore.get(scope)) {
        setLoading(false);
        return;
      }
      fetchMe()
        .then((u) => {
          if (alive) setUser(u);
        })
        .catch((e) => {
          // Only drop the session when the server actually rejected it, not on a network blip.
          if (axios.isAxiosError(e) && [401, 403, 404].includes(e.response?.status ?? 0)) tokenStore.clear(scope);
        })
        .finally(() => {
          if (alive) setLoading(false);
        });
      return () => {
        alive = false;
      };
    }, []);

    useEffect(() => {
      const onExpired = (e: Event) => {
        if ((e as CustomEvent<Scope>).detail === scope) {
          setUser(null);
          qc.clear();
        }
      };
      window.addEventListener("auth:expired", onExpired);
      return () => window.removeEventListener("auth:expired", onExpired);
    }, [qc]);

    const signIn = useCallback(async (path: string, body: unknown) => {
      const { data } = await api.post<{ access_token: string; refresh_token: string }>(path, body);
      tokenStore.set(scope, { access_token: data.access_token, refresh_token: data.refresh_token });
      try {
        setUser(await fetchMe());
      } catch (e) {
        tokenStore.clear(scope);
        throw e;
      }
    }, []);

    const signOut = useCallback(() => {
      tokenStore.clear(scope);
      setUser(null);
      qc.clear();
    }, [qc]);

    const reload = useCallback(async () => {
      try {
        setUser(await fetchMe());
      } catch {
        /* keep the current state; the interceptor handles real session expiry */
      }
    }, []);

    return <Ctx.Provider value={{ user, loading, signIn, signOut, reload }}>{children}</Ctx.Provider>;
  }

  function useAuth(): AuthCtx<T> {
    const c = useContext(Ctx);
    if (!c) throw new Error("useAuth must be used inside its AuthProvider");
    return c;
  }

  function Guard({ children }: { children: ReactNode }) {
    const { user, loading } = useAuth();
    const loc = useLocation();
    if (loading) return <PageSpinner />;
    if (!user) return <Navigate to={loginRoute} replace state={{ from: loc.pathname + loc.search }} />;
    return <>{children}</>;
  }

  return { AuthProvider, useAuth, Guard };
}

const userSession = makeAuth<Me>("user", () => api.get<Me>("/auth/me").then((r) => r.data), "/login");
const adminSession = makeAuth<UserOut>("admin", () => api.get<UserOut>("/admin-panel/me").then((r) => r.data), "/admin-panel/login");

export const UserAuthProvider = userSession.AuthProvider;
export const useUserAuth = userSession.useAuth;
export const UserGuard = userSession.Guard;
export const AdminAuthProvider = adminSession.AuthProvider;
export const useAdminAuth = adminSession.useAuth;
export const AdminGuard = adminSession.Guard;
