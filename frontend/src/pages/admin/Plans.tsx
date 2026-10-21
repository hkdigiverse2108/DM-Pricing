import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import { FormEvent, useState } from "react";
import { Alert, Badge, Button, Card, ConfirmModal, Input, Modal, PageHeader, PageSpinner, Textarea, Toggle } from "../../components/ui";
import { api, errMsg } from "../../lib/api";
import { fmtLimit, fmtPrice, slugify } from "../../lib/format";
import { useSite } from "../../lib/site";
import { Plan, PlanFeature } from "../../lib/types";

interface PlanForm {
  name: string;
  slug: string;
  price_monthly: string;
  price_yearly: string;
  description: string;
  max_instagram_accounts: string;
  max_keywords: string;
  max_dm_per_month: string;
  sort_order: string;
  is_active: boolean;
  features: PlanFeature[];
}

const blank = (): PlanForm => ({
  name: "", slug: "", price_monthly: "0", price_yearly: "0", description: "",
  max_instagram_accounts: "1", max_keywords: "5", max_dm_per_month: "500", sort_order: "0",
  is_active: true, features: [],
});

const fromPlan = (p: Plan): PlanForm => ({
  name: p.name, slug: p.slug, price_monthly: String(Number(p.price_monthly)), price_yearly: String(Number(p.price_yearly)),
  description: p.description ?? "", max_instagram_accounts: String(p.max_instagram_accounts), max_keywords: String(p.max_keywords),
  max_dm_per_month: String(p.max_dm_per_month), sort_order: String(p.sort_order), is_active: p.is_active,
  features: p.features.map((f) => ({ ...f })),
});

const isInt = (s: string, min: number) => /^-?\d+$/.test(s.trim()) && Number(s) >= min;
const isMoney = (s: string) => s.trim() !== "" && Number.isFinite(Number(s)) && Number(s) >= 0;

function validate(f: PlanForm): string | null {
  if (!f.name.trim()) return "Plan name is required.";
  if (!/^[a-z0-9-]+$/.test(f.slug)) return "Slug can only contain lowercase letters, numbers and hyphens.";
  if (!isMoney(f.price_monthly) || !isMoney(f.price_yearly)) return "Prices must be numbers of 0 or more.";
  if (!isInt(f.max_instagram_accounts, -1) || !isInt(f.max_keywords, -1) || !isInt(f.max_dm_per_month, -1))
    return "Limits must be whole numbers. Use -1 for unlimited.";
  if (!/^-?\d+$/.test(f.sort_order.trim())) return "Sort order must be a whole number.";
  const keys = new Set<string>();
  for (const ft of f.features) {
    if (!ft.feature_name.trim()) return "Every feature needs a name.";
    const k = ft.feature_key.trim() || slugify(ft.feature_name).replace(/-/g, "_");
    if (!k) return "Feature names must contain letters or numbers.";
    if (keys.has(k)) return `Two features share the key "${k}". Rename one.`;
    keys.add(k);
  }
  return null;
}

function payload(f: PlanForm) {
  return {
    name: f.name.trim(),
    slug: f.slug.trim(),
    price_monthly: Number(f.price_monthly),
    price_yearly: Number(f.price_yearly),
    description: f.description.trim() || null,
    max_instagram_accounts: Number(f.max_instagram_accounts),
    max_keywords: Number(f.max_keywords),
    max_dm_per_month: Number(f.max_dm_per_month),
    sort_order: Number(f.sort_order),
    is_active: f.is_active,
    features: f.features.map((ft) => ({
      feature_key: ft.feature_key.trim() || slugify(ft.feature_name).replace(/-/g, "_"),
      feature_name: ft.feature_name.trim(),
      is_included: ft.is_included,
    })),
  };
}

export default function Plans() {
  const qc = useQueryClient();
  const { currency } = useSite();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Plan | null>(null);
  const [form, setForm] = useState<PlanForm>(blank());
  const [slugTouched, setSlugTouched] = useState(false);
  const [error, setError] = useState("");
  const [toDelete, setToDelete] = useState<Plan | null>(null);
  const [flash, setFlash] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  const q = useQuery({ queryKey: ["admin-plans"], queryFn: () => api.get<Plan[]>("/admin-panel/plans").then((r) => r.data) });

  const set = <K extends keyof PlanForm>(k: K, v: PlanForm[K]) => setForm((f) => ({ ...f, [k]: v }));
  const done = () => {
    qc.invalidateQueries({ queryKey: ["admin-plans"] });
    qc.invalidateQueries({ queryKey: ["pricing"] });
  };

  const openNew = () => { setEditing(null); setForm(blank()); setSlugTouched(false); setError(""); setOpen(true); };
  const openEdit = (p: Plan) => { setEditing(p); setForm(fromPlan(p)); setSlugTouched(true); setError(""); setOpen(true); };

  const save = useMutation({
    mutationFn: () => (editing ? api.put(`/admin-panel/plans/${editing.id}`, payload(form)) : api.post("/admin-panel/plans", payload(form))),
    onSuccess: () => { setOpen(false); setFlash({ kind: "success", text: editing ? "Plan updated." : "Plan created." }); done(); },
    onError: (e) => setError(errMsg(e)),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/admin-panel/plans/${id}`),
    onSuccess: () => { setToDelete(null); setFlash({ kind: "success", text: "Plan deleted." }); done(); },
    onError: (e) => { setToDelete(null); setFlash({ kind: "error", text: errMsg(e) }); },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const problem = validate(form);
    if (problem) return setError(problem);
    setError("");
    save.mutate();
  };

  const setFeature = (i: number, patch: Partial<PlanFeature>) =>
    setForm((f) => ({ ...f, features: f.features.map((ft, idx) => (idx === i ? { ...ft, ...patch } : ft)) }));

  return (
    <>
      <PageHeader
        title="Pricing plans"
        subtitle="Everything on the public pricing page comes from here. Use -1 for unlimited."
        action={<Button onClick={openNew}><Plus className="h-4 w-4" aria-hidden /> New plan</Button>}
      />
      {flash && <div className="mb-4"><Alert kind={flash.kind} onClose={() => setFlash(null)}>{flash.text}</Alert></div>}
      {q.isLoading && <PageSpinner />}
      {q.isError && <Alert kind="error">{errMsg(q.error)}</Alert>}
      {q.data && (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-line text-ink-mute">
              <tr>
                <th className="px-5 py-3 font-medium">Plan</th><th className="px-3 py-3 font-medium">Monthly / yearly</th>
                <th className="px-3 py-3 font-medium">Accounts</th><th className="px-3 py-3 font-medium">Keywords</th>
                <th className="px-3 py-3 font-medium">DMs</th><th className="px-3 py-3 font-medium">Status</th>
                <th className="px-5 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {q.data.map((p) => (
                <tr key={p.id}>
                  <td className="px-5 py-3"><p className="font-medium">{p.name}</p><p className="text-xs text-ink-mute">{p.slug}</p></td>
                  <td className="px-3 py-3">{fmtPrice(p.price_monthly, currency)} / {fmtPrice(p.price_yearly, currency)}</td>
                  <td className="px-3 py-3">{fmtLimit(p.max_instagram_accounts)}</td>
                  <td className="px-3 py-3">{fmtLimit(p.max_keywords)}</td>
                  <td className="px-3 py-3">{fmtLimit(p.max_dm_per_month)}</td>
                  <td className="px-3 py-3"><Badge tone={p.is_active ? "good" : "neutral"}>{p.is_active ? "Visible" : "Hidden"}</Badge></td>
                  <td className="px-5 py-3">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => openEdit(p)} aria-label={`Edit ${p.name}`}><Pencil className="h-4 w-4" /></Button>
                      <Button size="sm" variant="ghost" onClick={() => setToDelete(p)} aria-label={`Delete ${p.name}`}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? `Edit ${editing.name}` : "New plan"} wide>
        <form onSubmit={submit} className="space-y-4">
          {error && <Alert kind="error">{error}</Alert>}
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Name" value={form.name} onChange={(e) => { set("name", e.target.value); if (!slugTouched) set("slug", slugify(e.target.value)); }} />
            <Input label="Slug" value={form.slug} onChange={(e) => { setSlugTouched(true); set("slug", e.target.value); }} hint="Used internally. The plan with slug “starter” is the default for new users." />
          </div>
          <Textarea label="Description" rows={2} value={form.description} onChange={(e) => set("description", e.target.value)} />
          <div className="grid gap-4 sm:grid-cols-3">
            <Input label="Monthly price" inputMode="decimal" value={form.price_monthly} onChange={(e) => set("price_monthly", e.target.value)} />
            <Input label="Yearly price" inputMode="decimal" value={form.price_yearly} onChange={(e) => set("price_yearly", e.target.value)} />
            <Input label="Sort order" inputMode="numeric" value={form.sort_order} onChange={(e) => set("sort_order", e.target.value)} hint="Lower shows first." />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Input label="Max connected accounts" inputMode="numeric" value={form.max_instagram_accounts} onChange={(e) => set("max_instagram_accounts", e.target.value)} />
            <Input label="Max keywords" inputMode="numeric" value={form.max_keywords} onChange={(e) => set("max_keywords", e.target.value)} />
            <Input label="Max DMs per month" inputMode="numeric" value={form.max_dm_per_month} onChange={(e) => set("max_dm_per_month", e.target.value)} />
          </div>
          <fieldset className="rounded-lg border border-line p-4">
            <legend className="px-1 text-sm font-medium text-ink-soft">Features shown on the pricing page</legend>
            <div className="space-y-3">
              {form.features.map((ft, i) => (
                <div key={i} className="flex items-end gap-2">
                  <div className="min-w-0 flex-1"><Input label="Feature name" value={ft.feature_name} onChange={(e) => setFeature(i, { feature_name: e.target.value })} /></div>
                  <div className="flex h-[38px] items-center gap-2 text-sm"><Toggle checked={ft.is_included} label={`${ft.feature_name || "Feature"} included`} onChange={(v) => setFeature(i, { is_included: v })} /><span className="w-20 text-xs text-ink-mute">{ft.is_included ? "Included" : "Not included"}</span></div>
                  <Button variant="ghost" size="sm" aria-label="Remove feature" onClick={() => set("features", form.features.filter((_, idx) => idx !== i))} className="mb-0.5"><X className="h-4 w-4" /></Button>
                </div>
              ))}
              <Button size="sm" variant="secondary" onClick={() => set("features", [...form.features, { feature_key: "", feature_name: "", is_included: true }])}><Plus className="h-4 w-4" aria-hidden /> Add feature</Button>
            </div>
          </fieldset>
          <div className="flex items-center gap-3">
            <Toggle checked={form.is_active} label="Visible on pricing page" onChange={(v) => set("is_active", v)} />
            <span className="text-sm">{form.is_active ? "Visible on the pricing page" : "Hidden from the pricing page"}</span>
          </div>
          <div className="flex justify-end gap-2 border-t border-line pt-4">
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={save.isPending}>Cancel</Button>
            <Button type="submit" loading={save.isPending}>{editing ? "Save changes" : "Create plan"}</Button>
          </div>
        </form>
      </Modal>

      <ConfirmModal
        open={!!toDelete}
        title="Delete plan?"
        message={`"${toDelete?.name ?? ""}" will be removed. Plans that have subscribers cannot be deleted; hide them instead.`}
        confirmLabel="Delete plan"
        loading={remove.isPending}
        onConfirm={() => toDelete && remove.mutate(toDelete.id)}
        onCancel={() => setToDelete(null)}
      />
    </>
  );
}
