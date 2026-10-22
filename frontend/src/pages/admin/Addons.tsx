import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { FormEvent, useState } from "react";
import { Alert, Badge, Button, Card, ConfirmModal, EmptyState, Input, Modal, PageHeader, PageSpinner, Textarea, Toggle } from "../../components/ui";
import { api, errMsg } from "../../lib/api";
import { fmtPrice, slugify } from "../../lib/format";
import { useSite } from "../../lib/site";
import { Addon } from "../../lib/types";

interface AddonForm { name: string; slug: string; description: string; price_monthly: string; is_active: boolean }
const blank = (): AddonForm => ({ name: "", slug: "", description: "", price_monthly: "0", is_active: true });

export default function Addons() {
  const qc = useQueryClient();
  const { currency } = useSite();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Addon | null>(null);
  const [form, setForm] = useState<AddonForm>(blank());
  const [slugTouched, setSlugTouched] = useState(false);
  const [error, setError] = useState("");
  const [toDelete, setToDelete] = useState<Addon | null>(null);
  const [flash, setFlash] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  const q = useQuery({ queryKey: ["admin-addons"], queryFn: () => api.get<Addon[]>("/admin-panel/addons").then((r) => r.data) });
  const done = () => { qc.invalidateQueries({ queryKey: ["admin-addons"] }); qc.invalidateQueries({ queryKey: ["pricing"] }); };

  const body = () => ({
    name: form.name.trim(), slug: form.slug.trim(), description: form.description.trim() || null,
    price_monthly: Number(form.price_monthly), is_active: form.is_active,
  });

  const save = useMutation({
    mutationFn: () => (editing ? api.put(`/admin-panel/addons/${editing.id}`, body()) : api.post("/admin-panel/addons", body())),
    onSuccess: () => { setOpen(false); setFlash({ kind: "success", text: editing ? "Add-on updated." : "Add-on created." }); done(); },
    onError: (e) => setError(errMsg(e)),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/admin-panel/addons/${id}`),
    onSuccess: () => { setToDelete(null); setFlash({ kind: "success", text: "Add-on deleted." }); done(); },
    onError: (e) => { setToDelete(null); setFlash({ kind: "error", text: errMsg(e) }); },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return setError("Name is required.");
    if (!/^[a-z0-9-]+$/.test(form.slug)) return setError("Slug can only contain lowercase letters, numbers and hyphens.");
    if (form.price_monthly.trim() === "" || !Number.isFinite(Number(form.price_monthly)) || Number(form.price_monthly) < 0) return setError("Price must be a number of 0 or more.");
    setError("");
    save.mutate();
  };

  return (
    <>
      <PageHeader title="Add-ons" subtitle="Optional extras listed under the plans on the pricing page."
        action={<Button onClick={() => { setEditing(null); setForm(blank()); setSlugTouched(false); setError(""); setOpen(true); }}><Plus className="h-4 w-4" aria-hidden /> New add-on</Button>} />
      {flash && <div className="mb-4"><Alert kind={flash.kind} onClose={() => setFlash(null)}>{flash.text}</Alert></div>}
      {q.isLoading && <PageSpinner />}
      {q.isError && <Alert kind="error">{errMsg(q.error)}</Alert>}
      {q.data && q.data.length === 0 && <EmptyState title="No add-ons yet" text="Create an add-on such as an extra Instagram account." />}
      {q.data && q.data.length > 0 && (
        <Card className="divide-y divide-line">
          {q.data.map((a) => (
            <div key={a.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
              <div>
                <p className="font-medium">{a.name} <Badge tone={a.is_active ? "good" : "neutral"}>{a.is_active ? "Visible" : "Hidden"}</Badge></p>
                {a.description && <p className="text-sm text-ink-mute">{a.description}</p>}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{fmtPrice(a.price_monthly, currency)}/month</span>
                <Button size="sm" variant="ghost" aria-label={`Edit ${a.name}`} onClick={() => { setEditing(a); setForm({ name: a.name, slug: a.slug, description: a.description ?? "", price_monthly: String(Number(a.price_monthly)), is_active: a.is_active }); setSlugTouched(true); setError(""); setOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                <Button size="sm" variant="ghost" aria-label={`Delete ${a.name}`} onClick={() => setToDelete(a)}><Trash2 className="h-4 w-4" /></Button>
              </div>
            </div>
          ))}
        </Card>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? "Edit add-on" : "New add-on"}>
        <form onSubmit={submit} className="space-y-4">
          {error && <Alert kind="error">{error}</Alert>}
          <Input label="Name" value={form.name} onChange={(e) => { const v = e.target.value; setForm((f) => ({ ...f, name: v, slug: slugTouched ? f.slug : slugify(v) })); }} />
          <Input label="Slug" value={form.slug} onChange={(e) => { setSlugTouched(true); setForm({ ...form, slug: e.target.value }); }} />
          <Textarea label="Description" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <Input label="Monthly price" inputMode="decimal" value={form.price_monthly} onChange={(e) => setForm({ ...form, price_monthly: e.target.value })} />
          <div className="flex items-center gap-3"><Toggle checked={form.is_active} label="Visible" onChange={(v) => setForm({ ...form, is_active: v })} /><span className="text-sm">{form.is_active ? "Visible on the pricing page" : "Hidden"}</span></div>
          <div className="flex justify-end gap-2 border-t border-line pt-4">
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={save.isPending}>Cancel</Button>
            <Button type="submit" loading={save.isPending}>{editing ? "Save changes" : "Create add-on"}</Button>
          </div>
        </form>
      </Modal>

      <ConfirmModal open={!!toDelete} title="Delete add-on?" message={`"${toDelete?.name ?? ""}" will be removed from the pricing page.`} confirmLabel="Delete add-on"
        loading={remove.isPending} onConfirm={() => toDelete && remove.mutate(toDelete.id)} onCancel={() => setToDelete(null)} />
    </>
  );
}
