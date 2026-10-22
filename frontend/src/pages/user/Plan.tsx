import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Cycle, PlanCard } from "../../components/PlanCard";
import { Alert, Card, Meter, PageHeader, PageSpinner, cx } from "../../components/ui";
import { api, errMsg } from "../../lib/api";
import { useUserAuth } from "../../lib/session";
import { useSite } from "../../lib/site";
import { PricingData } from "../../lib/types";

export default function PlanPage() {
  const { user, reload } = useUserAuth();
  useEffect(() => {
    void reload(); // pick up plan changes made by an admin
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const { currency, supportEmail } = useSite();
  const [cycle, setCycle] = useState<Cycle>("monthly");
  const q = useQuery({ queryKey: ["pricing"], queryFn: () => api.get<PricingData>("/public/pricing").then((r) => r.data) });
  if (!user) return null;
  const { plan, usage } = user;

  return (
    <>
      <PageHeader title="Plan" subtitle="Your current limits and usage, and the plans available." />

      <Card className="mb-8 p-5">
        <h2 className="text-lg font-bold">{plan ? `You are on ${plan.name}` : "No plan assigned"}</h2>
        {plan && (
          <div className="mt-5 grid gap-5 sm:grid-cols-3">
            <Meter label="Connected accounts" used={usage.instagram_accounts} limit={plan.max_instagram_accounts} />
            <Meter label="Keywords" used={usage.keywords} limit={plan.max_keywords} />
            <Meter label="DMs this month" used={usage.dm_this_month} limit={plan.max_dm_per_month} />
          </div>
        )}
      </Card>

      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold">Available plans</h2>
        <div className="inline-flex rounded-lg border border-line bg-white p-1 text-sm font-medium" role="group" aria-label="Billing period">
          {(["monthly", "yearly"] as const).map((c) => (
            <button key={c} type="button" aria-pressed={cycle === c} onClick={() => setCycle(c)}
              className={cx("rounded-md px-3 py-1", cycle === c ? "bg-ink text-white" : "text-ink-soft hover:bg-canvas")}>
              {c === "monthly" ? "Monthly" : "Yearly"}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-4">
        <Alert>
          Online payments are not available yet.{" "}
          {supportEmail ? <>To change your plan, email <a className="font-medium underline" href={`mailto:${supportEmail}`}>{supportEmail}</a>.</> : "To change your plan, contact support."}
        </Alert>
      </div>

      {q.isLoading && <PageSpinner />}
      {q.isError && <Alert kind="error">{errMsg(q.error)}</Alert>}
      {q.data && (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {q.data.plans.map((p) => (
            <PlanCard key={p.id} plan={p} cycle={cycle} currency={currency} current={plan?.slug === p.slug} />
          ))}
        </div>
      )}
    </>
  );
}
