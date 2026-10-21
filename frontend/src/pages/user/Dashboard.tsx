import { useQuery } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { Link } from "react-router-dom";
import { Badge, Card, Meter, PageHeader, cx } from "../../components/ui";
import { api } from "../../lib/api";
import { useUserAuth } from "../../lib/session";
import { Keyword, KeywordStat, Overview } from "../../lib/types";

export default function Dashboard() {
  const { user } = useUserAuth();
  const overview = useQuery({
    queryKey: ["stats-overview"],
    queryFn: () => api.get<Overview>("/stats/overview", { params: { days: 30 } }).then((r) => r.data),
  });
  const perKeyword = useQuery({
    queryKey: ["kw-stats"],
    queryFn: () => api.get<{ items: KeywordStat[] }>("/stats/keywords", { params: { days: 30 } }).then((r) => r.data.items),
  });
  const keywords = useQuery({ queryKey: ["keywords"], queryFn: () => api.get<Keyword[]>("/keywords").then((r) => r.data) });
  if (!user) return null;
  const { plan, usage } = user;
  const steps = [
    { done: usage.instagram_accounts > 0, label: "Connect an Instagram account", to: "/app/accounts" },
    { done: usage.keywords > 0, label: "Create your first keyword", to: "/app/keywords" },
  ];
  const allDone = steps.every((s) => s.done);

  return (
    <>
      <PageHeader title={`Hi, ${user.user.full_name.split(" ")[0]}`} subtitle="Here is how your automation is doing this month." />

      {!allDone && (
        <Card className="mb-6 p-5">
          <h2 className="text-lg font-bold">Finish setting up</h2>
          <ul className="mt-3 space-y-2">
            {steps.map((s) => (
              <li key={s.label}>
                <Link to={s.to} className="flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm hover:bg-canvas">
                  <span className={cx("flex h-5 w-5 items-center justify-center rounded-full border", s.done ? "border-brand-600 bg-brand-600 text-white" : "border-line")}>
                    {s.done && <Check className="h-3 w-3" aria-hidden />}
                  </span>
                  <span className={s.done ? "text-ink-mute line-through" : "font-medium"}>{s.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold">Current plan</h2>
            {plan ? <Badge tone="good">{plan.name}</Badge> : <Badge>No plan</Badge>}
          </div>
          <Link to="/app/plan" className="text-sm font-medium text-brand-700 hover:underline">Compare plans</Link>
        </div>
        {plan ? (
          <div className="mt-5 grid gap-5 sm:grid-cols-3">
            <Meter label="Connected accounts" used={usage.instagram_accounts} limit={plan.max_instagram_accounts} />
            <Meter label="Keywords" used={usage.keywords} limit={plan.max_keywords} />
            <Meter label="DMs this month" used={usage.dm_this_month} limit={plan.max_dm_per_month} />
          </div>
        ) : (
          <p className="mt-3 text-sm text-ink-mute">No plan is assigned yet. Please contact support.</p>
        )}
      </Card>
      <Card className="mt-6 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-bold">Keyword performance</h2>
          <span className="text-xs text-ink-mute">Last 30 days</span>
        </div>
        {overview.data && (() => {
          const t = overview.data.totals;
          const daily = overview.data.daily;
          const max = Math.max(1, ...daily.map((d) => d.matches));
          const empty = Object.values(t).every((n) => n === 0);
          if (empty) return <p className="mt-3 text-sm text-ink-mute">No activity yet. Matches and DMs appear here once your automation starts running.</p>;
          const tiles: Array<[string, string]> = [
            ["Keyword matches", t.match.toLocaleString()],
            ["Public replies", t.public_reply.toLocaleString()],
            ["DMs sent", t.dm_sent.toLocaleString()],
            ["Follow gate passed", `${t.follow_gate_passed.toLocaleString()} / ${t.follow_gate_shown.toLocaleString()}`],
          ];
          const top = (perKeyword.data ?? []).slice().sort((a, b) => b.match - a.match).slice(0, 5);
          const nameOf = new Map((keywords.data ?? []).map((k) => [k.id, k.keyword]));
          return (
            <>
              <dl className="mt-4 grid gap-4 sm:grid-cols-4">
                {tiles.map(([label, value]) => (
                  <div key={label}><dt className="text-sm text-ink-mute">{label}</dt><dd className="mt-1 font-display text-2xl font-bold">{value}</dd></div>
                ))}
              </dl>
              {t.error > 0 && <p className="mt-3 text-sm text-pop">{t.error.toLocaleString()} errors logged by your automation.</p>}
              <div className="mt-5 flex h-20 items-end gap-1" role="img" aria-label="Keyword matches per day">
                {daily.map((d) => (
                  <div key={d.date} title={`${d.date}: ${d.matches} matches, ${d.dm_sent} DMs`} className="flex-1 rounded-sm bg-brand-600/70" style={{ height: `${Math.max(6, (d.matches / max) * 100)}%` }} />
                ))}
              </div>
              {top.length > 0 && (
                <table className="mt-5 w-full text-left text-sm">
                  <thead className="text-ink-mute"><tr><th className="py-1 font-medium">Top keywords</th><th className="py-1 text-right font-medium">Matches</th><th className="py-1 text-right font-medium">DMs</th></tr></thead>
                  <tbody className="divide-y divide-line">
                    {top.map((s) => (
                      <tr key={s.keyword_id}><td className="py-1.5">{nameOf.get(s.keyword_id) ?? "Deleted keyword"}</td><td className="py-1.5 text-right">{s.match}</td><td className="py-1.5 text-right">{s.dm_sent}</td></tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          );
        })()}
      </Card>
    </>
  );
}
