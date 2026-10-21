import { Check, Minus } from "lucide-react";
import { ReactNode } from "react";
import { fmtLimit, fmtPrice } from "../lib/format";
import { Plan } from "../lib/types";
import { Badge, cx } from "./ui";

export type Cycle = "monthly" | "yearly";

export function PlanCard({
  plan,
  cycle,
  currency,
  cta,
  current = false,
}: {
  plan: Plan;
  cycle: Cycle;
  currency: string;
  cta?: ReactNode;
  current?: boolean;
}) {
  const price = cycle === "yearly" ? plan.price_yearly : plan.price_monthly;
  const isFree = Number(price) === 0;
  return (
    <div className={cx("flex flex-col rounded-xl border bg-white p-6", current ? "border-brand-600 ring-1 ring-brand-600" : "border-line")}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xl font-bold">{plan.name}</h3>
        {current && <Badge tone="good">Your plan</Badge>}
      </div>
      {plan.description && <p className="mt-1 min-h-[2.5rem] text-sm text-ink-mute">{plan.description}</p>}
      <p className="mt-4 flex items-baseline gap-1">
        <span className="font-display text-4xl font-bold">{fmtPrice(price, currency)}</span>
        {!isFree && <span className="text-sm text-ink-mute">/{cycle === "yearly" ? "year" : "month"}</span>}
      </p>
      <dl className="mt-5 space-y-2 border-t border-line pt-5 text-sm">
        <div className="flex justify-between"><dt className="text-ink-mute">Connected accounts</dt><dd className="font-medium">{fmtLimit(plan.max_instagram_accounts)}</dd></div>
        <div className="flex justify-between"><dt className="text-ink-mute">Keywords</dt><dd className="font-medium">{fmtLimit(plan.max_keywords)}</dd></div>
        <div className="flex justify-between"><dt className="text-ink-mute">DMs per month</dt><dd className="font-medium">{fmtLimit(plan.max_dm_per_month)}</dd></div>
      </dl>
      {plan.features.length > 0 && (
        <ul className="mt-5 space-y-2 text-sm">
          {plan.features.map((f) => (
            <li key={f.feature_key} className={cx("flex items-center gap-2", !f.is_included && "text-ink-mute")}>
              {f.is_included ? <Check className="h-4 w-4 shrink-0 text-brand-600" aria-hidden /> : <Minus className="h-4 w-4 shrink-0" aria-hidden />}
              <span>{f.feature_name}</span>
              {!f.is_included && <span className="sr-only">(not included)</span>}
            </li>
          ))}
        </ul>
      )}
      {cta && <div className="mt-auto pt-6">{cta}</div>}
    </div>
  );
}
