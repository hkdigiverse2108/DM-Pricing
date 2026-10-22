/** Backend sends naive UTC timestamps; add a Z so the browser converts them correctly. */
export function parseUtc(s: string): Date {
  return new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : `${s}Z`);
}

export function fmtDate(s: string | null | undefined): string {
  if (!s) return "-";
  const d = parseUtc(s);
  return Number.isNaN(d.getTime()) ? "-" : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export function daysLeft(s: string | null | undefined): number | null {
  if (!s) return null;
  const d = parseUtc(s);
  return Number.isNaN(d.getTime()) ? null : Math.ceil((d.getTime() - Date.now()) / 86_400_000);
}

export const fmtLimit = (n: number): string => (n < 0 ? "Unlimited" : n.toLocaleString());

export function fmtPrice(value: string | number, symbol = "$"): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return `${symbol}0`;
  return n === 0 ? "Free" : `${symbol}${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

export const slugify = (s: string): string =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

/** Instagram accounts show as @name; Facebook Pages show the Page name. */
export const accountLabel = (a: { platform: string; username: string }): string =>
  a.platform === "instagram" ? `@${a.username}` : a.username;
