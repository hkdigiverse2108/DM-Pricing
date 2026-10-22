import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useEffect, useState } from "react";
import { Alert, Button, Card, Input, PageHeader, PageSpinner, Textarea } from "../../components/ui";
import { api, errMsg } from "../../lib/api";

const FIELDS: Array<{ key: string; label: string; hint?: string; multiline?: boolean }> = [
  { key: "site_name", label: "Site name", hint: "Shown in the header and browser title." },
  { key: "tagline", label: "Tagline" },
  { key: "hero_title", label: "Home page headline" },
  { key: "hero_subtitle", label: "Home page subtitle", multiline: true },
  { key: "support_email", label: "Support email", hint: "Shown in the footer and on the plan page." },
  { key: "currency_symbol", label: "Currency symbol", hint: "For example $, € or ₹. Used on all prices." },
];

export default function SettingsPage() {
  const qc = useQueryClient();
  const [values, setValues] = useState<Record<string, string>>({});
  const [flash, setFlash] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  const q = useQuery({ queryKey: ["admin-settings"], queryFn: () => api.get<Record<string, string>>("/admin-panel/settings").then((r) => r.data) });
  useEffect(() => { if (q.data) setValues(q.data); }, [q.data]);

  const save = useMutation({
    mutationFn: () => api.put<Record<string, string>>("/admin-panel/settings", { values }),
    onSuccess: (r) => {
      setValues(r.data);
      setFlash({ kind: "success", text: "Settings saved." });
      qc.invalidateQueries({ queryKey: ["site"] });
      qc.invalidateQueries({ queryKey: ["admin-settings"] });
    },
    onError: (e) => setFlash({ kind: "error", text: errMsg(e) }),
  });

  const submit = (e: FormEvent) => { e.preventDefault(); setFlash(null); save.mutate(); };

  return (
    <>
      <PageHeader title="Settings" subtitle="Public site text and currency." />
      {q.isLoading && <PageSpinner />}
      {q.isError && <Alert kind="error">{errMsg(q.error)}</Alert>}
      {q.data && (
        <form onSubmit={submit} className="max-w-2xl">
          {flash && <div className="mb-4"><Alert kind={flash.kind} onClose={() => setFlash(null)}>{flash.text}</Alert></div>}
          <Card className="space-y-4 p-5">
            {FIELDS.map((f) =>
              f.multiline ? (
                <Textarea key={f.key} label={f.label} hint={f.hint} rows={2} value={values[f.key] ?? ""} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })} />
              ) : (
                <Input key={f.key} label={f.label} hint={f.hint} value={values[f.key] ?? ""} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })} />
              ),
            )}
          </Card>
          <div className="mt-4"><Button type="submit" loading={save.isPending}>Save settings</Button></div>
        </form>
      )}
    </>
  );
}
