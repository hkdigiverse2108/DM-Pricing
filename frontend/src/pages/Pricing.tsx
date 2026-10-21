import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { PlanCard, Cycle } from "../components/PlanCard";
import { Alert, PageSpinner, cx } from "../components/ui";
import { api, errMsg } from "../lib/api";
import { fmtPrice } from "../lib/format";
import { useUserAuth } from "../lib/session";
import { useSite } from "../lib/site";
import { PricingData } from "../lib/types";

export default function Pricing() {
  const { user } = useUserAuth();
  const { currency } = useSite();
  const [cycle, setCycle] = useState<Cycle>("monthly");
  const q = useQuery({ queryKey: ["pricing"], queryFn: () => api.get<PricingData>("/public/pricing").then((r) => r.data) });

  return (
    <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
      <div className="text-center">
        <h1 className="text-4xl font-bold">Pricing that grows with you</h1>
        <p className="mx-auto mt-3 max-w-xl text-ink-soft">Start free. Upgrade when you need more accounts, keywords, or DMs.</p>
        <div className="mx-auto mt-6 inline-flex rounded-lg border border-line bg-white p-1 text-sm font-medium" role="group" aria-label="Billing period">
          {(["monthly", "yearly"] as const).map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={cycle === c}
              onClick={() => setCycle(c)}
              className={cx("rounded-md px-4 py-1.5", cycle === c ? "bg-ink text-white" : "text-ink-soft hover:bg-canvas")}
            >
              {c === "monthly" ? "Monthly" : "Yearly"}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-10">
        {q.isLoading && <PageSpinner />}
        {q.isError && <Alert kind="error">{errMsg(q.error)}</Alert>}
        {q.data && q.data.plans.length === 0 && <Alert>No plans are available right now. Please check back soon.</Alert>}
        {q.data && q.data.plans.length > 0 && (
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
            {q.data.plans.map((p) => (
              <PlanCard
                key={p.id}
                plan={p}
                cycle={cycle}
                currency={currency}
                cta={
                  <Link
                    to={user ? "/app/plan" : "/register"}
                    className="block rounded-lg bg-brand-600 px-4 py-2.5 text-center text-sm font-medium text-white hover:bg-brand-700"
                  >
                    {user ? "View in dashboard" : Number(p.price_monthly) === 0 ? "Start free" : `Get ${p.name}`}
                  </Link>
                }
              />
            ))}
          </div>
        )}
      </div>

      {q.data && q.data.addons.length > 0 && (
        <section className="mt-14">
          <h2 className="text-2xl font-bold">Add-ons</h2>
          <ul className="mt-4 divide-y divide-line rounded-xl border border-line bg-white">
            {q.data.addons.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-4">
                <div>
                  <p className="font-medium">{a.name}</p>
                  {a.description && <p className="text-sm text-ink-mute">{a.description}</p>}
                </div>
                <p className="font-medium">{fmtPrice(a.price_monthly, currency)}<span className="text-sm text-ink-mute">/month</span></p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
