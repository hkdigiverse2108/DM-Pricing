import { useQuery } from "@tanstack/react-query";
import { Alert, Card, PageHeader, PageSpinner } from "../../components/ui";
import { api, errMsg } from "../../lib/api";
import { AdminStats } from "../../lib/types";

export default function Overview() {
  const q = useQuery({ queryKey: ["admin-stats"], queryFn: () => api.get<AdminStats>("/admin-panel/stats").then((r) => r.data) });
  const s = q.data;
  const items: Array<[string, number | undefined]> = [
    ["Users", s?.users],
    ["Active users", s?.active_users],
    ["Connected accounts", s?.connected_accounts],
    ["Keywords", s?.keywords],
    ["Pricing plans", s?.plans],
    ["DMs sent this month", s?.dm_this_month],
  ];
  return (
    <>
      <PageHeader title="Overview" subtitle="Platform activity at a glance." />
      {q.isLoading && <PageSpinner />}
      {q.isError && <Alert kind="error">{errMsg(q.error)}</Alert>}
      {s && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map(([label, value]) => (
            <Card key={label} className="p-5">
              <p className="text-sm text-ink-mute">{label}</p>
              <p className="mt-2 font-display text-3xl font-bold">{(value ?? 0).toLocaleString()}</p>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
