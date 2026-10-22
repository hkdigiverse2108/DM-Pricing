import axios, { AxiosError, InternalAxiosRequestConfig } from "axios";

export type Scope = "user" | "admin";
export interface Tokens {
  access_token: string;
  refresh_token: string;
}

const KEYS: Record<Scope, string> = { user: "ig_user_tokens", admin: "ig_admin_tokens" };

export const tokenStore = {
  get(scope: Scope): Tokens | null {
    try {
      const raw = localStorage.getItem(KEYS[scope]);
      return raw ? (JSON.parse(raw) as Tokens) : null;
    } catch {
      return null;
    }
  },
  set(scope: Scope, t: Tokens): void {
    try {
      localStorage.setItem(KEYS[scope], JSON.stringify(t));
    } catch {
      /* storage unavailable (private mode) - session will not persist */
    }
  },
  clear(scope: Scope): void {
    try {
      localStorage.removeItem(KEYS[scope]);
    } catch {
      /* ignore */
    }
  },
};

export const api = axios.create({ baseURL: "/api", timeout: 30000 });

const scopeOf = (url?: string): Scope => ((url ?? "").startsWith("/admin-panel") ? "admin" : "user");
const isAuthCall = (url?: string): boolean =>
  /^\/(auth\/(login|register|refresh)|admin-panel\/auth\/(login|refresh))/.test(url ?? "");

function isExpired(jwt: string): boolean {
  try {
    const part = jwt.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(part)) as { exp?: number };
    return typeof payload.exp === "number" && payload.exp * 1000 <= Date.now() + 5000;
  } catch {
    return true;
  }
}

api.interceptors.request.use((cfg) => {
  if (!isAuthCall(cfg.url)) {
    const t = tokenStore.get(scopeOf(cfg.url));
    if (t) cfg.headers.set("Authorization", `Bearer ${t.access_token}`);
  }
  return cfg;
});

const refreshing: Partial<Record<Scope, Promise<string | null>>> = {};

async function doRefresh(scope: Scope): Promise<string | null> {
  const t = tokenStore.get(scope);
  if (!t) return null;
  try {
    const path = scope === "admin" ? "/api/admin-panel/auth/refresh" : "/api/auth/refresh";
    const r = await axios.post<Tokens>(path, { refresh_token: t.refresh_token });
    tokenStore.set(scope, { access_token: r.data.access_token, refresh_token: r.data.refresh_token });
    return r.data.access_token;
  } catch (e) {
    // Drop the session only if the server rejected the refresh token (not on 429 / network errors).
    const status = axios.isAxiosError(e) ? e.response?.status : undefined;
    if (status === 400 || status === 401 || status === 403 || status === 404) tokenStore.clear(scope);
    return null;
  }
}

type RetryConfig = InternalAxiosRequestConfig & { _retry?: boolean };

api.interceptors.response.use(
  (r) => r,
  async (error: AxiosError) => {
    const cfg = error.config as RetryConfig | undefined;
    const status = error.response?.status;
    if (!cfg || cfg._retry || isAuthCall(cfg.url)) return Promise.reject(error);

    const scope = scopeOf(cfg.url);
    const tokens = tokenStore.get(scope);
    if (!tokens) return Promise.reject(error);

    // The admin API answers 404 (not 401) to bad/expired tokens, so only treat a 404 as an
    // auth failure when the access token really has expired.
    const authFailure = status === 401 || (scope === "admin" && status === 404 && isExpired(tokens.access_token));
    if (!authFailure) return Promise.reject(error);

    cfg._retry = true;
    let p = refreshing[scope];
    if (!p) {
      p = doRefresh(scope).finally(() => {
        refreshing[scope] = undefined;
      });
      refreshing[scope] = p;
    }
    const fresh = await p;
    if (!fresh) {
      window.dispatchEvent(new CustomEvent<Scope>("auth:expired", { detail: scope }));
      return Promise.reject(error);
    }
    cfg.headers.set("Authorization", `Bearer ${fresh}`);
    return api(cfg);
  },
);

export function errMsg(e: unknown): string {
  if (axios.isAxiosError(e)) {
    if (!e.response) return "Cannot reach the server. Check your connection and try again.";
    const detail = (e.response.data as { detail?: unknown } | undefined)?.detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) {
      return detail
        .map((d: { loc?: unknown[]; msg?: string }) => {
          const field = (d.loc ?? []).slice(1).join(".");
          return field ? `${field}: ${d.msg ?? "invalid"}` : d.msg ?? "invalid";
        })
        .join("; ");
    }
    return `Request failed (${e.response.status}).`;
  }
  return e instanceof Error ? e.message : "Something went wrong.";
}
