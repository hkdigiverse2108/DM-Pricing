import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Alert, Badge, Button, Card, ConfirmModal, EmptyState, Input, Modal, PageHeader, PageSpinner, Select, Textarea, Toggle,
} from "../../components/ui";
import { api, errMsg } from "../../lib/api";
import { accountLabel } from "../../lib/format";
import { useUserAuth } from "../../lib/session";
import { Account, Keyword, KeywordStat } from "../../lib/types";

interface KwForm {
  connected_account_id: string;
  keyword: string;
  message: string;
  comment_reply1: string;
  comment_reply2: string;
  comment_reply3: string;
  follow_gate_message: string;
  follow_gate_button_text: string;
  media_target: "all" | "one";
  media_input: string; // a post link or a numeric media id
  require_follow: boolean;
  is_active: boolean;
  description: string;
}

const emptyForm = (accountId: string): KwForm => ({
  connected_account_id: accountId,
  keyword: "",
  message: "",
  comment_reply1: "",
  comment_reply2: "",
  comment_reply3: "",
  follow_gate_message: "Follow us first, then tap the button below to get your link.",
  follow_gate_button_text: "I am following",
  media_target: "all",
  media_input: "",
  require_follow: false,
  is_active: true,
  description: "",
});

const fromKeyword = (k: Keyword): KwForm => ({
  connected_account_id: k.connected_account_id,
  keyword: k.keyword,
  message: k.message,
  comment_reply1: k.comment_reply1 ?? "",
  comment_reply2: k.comment_reply2 ?? "",
  comment_reply3: k.comment_reply3 ?? "",
  follow_gate_message: k.follow_gate_message ?? "",
  follow_gate_button_text: k.follow_gate_button_text ?? "",
  media_target: k.media_url || k.media_id ? "one" : "all",
  media_input: k.media_url ?? k.media_id ?? "",
  require_follow: k.require_follow,
  is_active: k.is_active,
  description: k.description ?? "",
});

const nul = (s: string): string | null => (s.trim() === "" ? null : s.trim());

const ID_RE = /^\d+(_\d+)?$/;
function mediaFields(f: KwForm): { media_id: string | null; media_url: string | null } {
  const v = f.media_input.trim();
  if (f.media_target === "all" || !v) return { media_id: null, media_url: null };
  return ID_RE.test(v) ? { media_id: v, media_url: null } : { media_id: null, media_url: v };
}

function toPayload(f: KwForm) {
  return {
    keyword: f.keyword.trim(),
    message: f.message.trim(),
    comment_reply1: nul(f.comment_reply1),
    comment_reply2: nul(f.comment_reply2),
    comment_reply3: nul(f.comment_reply3),
    follow_gate_message: nul(f.follow_gate_message),
    follow_gate_button_text: nul(f.follow_gate_button_text),
    ...mediaFields(f),
    require_follow: f.require_follow,
    is_active: f.is_active,
    description: nul(f.description),
  };
}

function validate(f: KwForm): string | null {
  if (!f.connected_account_id) return "Choose an Instagram account.";
  if (!f.keyword.trim()) return "Enter the keyword people will comment.";
  if (!f.message.trim()) return "Enter the DM message.";
  if (f.media_target === "one" && !f.media_input.trim()) return "Paste the post link or media ID, or choose All posts.";
  if (f.require_follow && (!f.follow_gate_message.trim() || !f.follow_gate_button_text.trim()))
    return "Follow gate needs both a message and a button text.";
  if (f.follow_gate_button_text.trim().length > 80) return "Button text can be at most 80 characters.";
  return null;
}

export default function Keywords() {
  const qc = useQueryClient();
  const { reload } = useUserAuth();
  const [filter, setFilter] = useState("");
  const [editing, setEditing] = useState<Keyword | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<KwForm>(emptyForm(""));
  const [formError, setFormError] = useState("");
  const [preview, setPreview] = useState<{ media_id: string; media_type: string | null; caption: string | null } | null>(null);
  const [previewError, setPreviewError] = useState("");
  const [toDelete, setToDelete] = useState<Keyword | null>(null);
  const [flash, setFlash] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  const accounts = useQuery({ queryKey: ["accounts"], queryFn: () => api.get<Account[]>("/accounts").then((r) => r.data) });
  const stats = useQuery({
    queryKey: ["kw-stats"],
    queryFn: () => api.get<{ items: KeywordStat[] }>("/stats/keywords", { params: { days: 30 } }).then((r) => r.data.items),
  });
  const statOf = useMemo(() => new Map((stats.data ?? []).map((x) => [x.keyword_id, x])), [stats.data]);
  const keywords = useQuery({ queryKey: ["keywords"], queryFn: () => api.get<Keyword[]>("/keywords").then((r) => r.data) });

  const nameOf = useMemo(() => {
    const m = new Map<string, string>();
    (accounts.data ?? []).forEach((a) => m.set(a.id, accountLabel(a)));
    return m;
  }, [accounts.data]);
  const activeAccounts = (accounts.data ?? []).filter((a) => a.is_active);
  const visible = (keywords.data ?? []).filter((k) => !filter || k.connected_account_id === filter);

  const set = <K extends keyof KwForm>(key: K, value: KwForm[K]) => setForm((f) => ({ ...f, [key]: value }));

  const openCreate = () => {
    setPreview(null);
    setPreviewError("");
    setForm(emptyForm(filter && activeAccounts.some((a) => a.id === filter) ? filter : activeAccounts[0]?.id ?? ""));
    setFormError("");
    setEditing(null);
    setCreating(true);
  };
  const openEdit = (k: Keyword) => {
    setPreview(null);
    setPreviewError("");
    setForm(fromKeyword(k));
    setFormError("");
    setCreating(false);
    setEditing(k);
  };
  const closeForm = () => {
    setCreating(false);
    setEditing(null);
  };

  const refreshAll = () => {
    qc.invalidateQueries({ queryKey: ["keywords"] });
    void reload();
  };

  const save = useMutation({
    mutationFn: async () => {
      const body = toPayload(form);
      if (editing) return api.patch(`/keywords/${editing.id}`, body);
      return api.post("/keywords", { ...body, connected_account_id: form.connected_account_id });
    },
    onSuccess: () => {
      setFlash({ kind: "success", text: editing ? "Keyword updated." : "Keyword created." });
      closeForm();
      refreshAll();
    },
    onError: (e) => setFormError(errMsg(e)),
  });

  const checkLink = useMutation({
    mutationFn: () =>
      api
        .post<{ media_id: string; media_type: string | null; caption: string | null }>("/keywords/resolve-media", {
          connected_account_id: editing ? editing.connected_account_id : form.connected_account_id,
          url: form.media_input.trim(),
        })
        .then((r) => r.data),
    onSuccess: (d) => {
      setPreviewError("");
      setPreview(d);
    },
    onError: (e) => {
      setPreview(null);
      setPreviewError(errMsg(e));
    },
  });

  const toggle = useMutation({
    mutationFn: (k: Keyword) => api.patch(`/keywords/${k.id}`, { is_active: !k.is_active }),
    onSuccess: refreshAll,
    onError: (e) => setFlash({ kind: "error", text: errMsg(e) }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/keywords/${id}`),
    onSuccess: () => {
      setToDelete(null);
      setFlash({ kind: "success", text: "Keyword deleted." });
      refreshAll();
    },
    onError: (e) => {
      setToDelete(null);
      setFlash({ kind: "error", text: errMsg(e) });
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const problem = validate(form);
    if (problem) return setFormError(problem);
    setFormError("");
    save.mutate();
  };

  const loading = accounts.isLoading || keywords.isLoading;
  const noAccounts = !!accounts.data && activeAccounts.length === 0;

  return (
    <>
      <PageHeader
        title="Keywords"
        subtitle="When someone comments a keyword, they get your DM. Each keyword belongs to one Instagram account."
        action={!noAccounts && !loading ? <Button onClick={openCreate}><Plus className="h-4 w-4" aria-hidden /> New keyword</Button> : undefined}
      />
      {flash && <div className="mb-4"><Alert kind={flash.kind} onClose={() => setFlash(null)}>{flash.text}</Alert></div>}

      {loading && <PageSpinner />}
      {(accounts.isError || keywords.isError) && <Alert kind="error">{errMsg(accounts.error ?? keywords.error)}</Alert>}

      {noAccounts && (keywords.data ?? []).length === 0 && (
        <EmptyState
          title="Connect an account first"
          text="Keywords are attached to an Instagram account, so connect one before creating your first keyword."
          action={<Link to="/app/accounts" className="rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700">Connect Instagram</Link>}
        />
      )}

      {!loading && keywords.data && (accounts.data ?? []).length > 1 && (
        <div className="mb-4 max-w-xs">
          <Select label="Show keywords for" value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="">All accounts</option>
            {(accounts.data ?? []).map((a) => <option key={a.id} value={a.id}>{accountLabel(a)}</option>)}
          </Select>
        </div>
      )}

      {!loading && !noAccounts && keywords.data && visible.length === 0 && (
        <EmptyState
          title="No keywords yet"
          text="Create a keyword like PRICE or GUIDE, write the DM people should receive, and you are live."
          action={<Button onClick={openCreate}><Plus className="h-4 w-4" aria-hidden /> Create keyword</Button>}
        />
      )}

      {visible.length > 0 && (
        <Card className="divide-y divide-line">
          {visible.map((k) => (
            <div key={k.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-md bg-pop-50 px-2 py-0.5 font-medium text-pop">{k.keyword}</span>
                  <span className="text-xs text-ink-mute">{nameOf.get(k.connected_account_id) ?? "unknown"}</span>
                  {k.require_follow && <Badge tone="warn">Follow gate</Badge>}
                  <Badge>{k.media_id ? "One post" : "All posts"}</Badge>
                  {k.media_url && /^https?:\/\//i.test(k.media_url) && (
                    <a href={k.media_url} target="_blank" rel="noreferrer" className="text-xs font-medium text-brand-700 hover:underline">View post</a>
                  )}
                </div>
                <p className="mt-1.5 line-clamp-2 text-sm text-ink-soft">{k.message}</p>
                {stats.data && (
                  <p className="mt-1 text-xs text-ink-mute">
                    {(() => {
                      const st = statOf.get(k.id);
                      if (!st) return "No activity in the last 30 days.";
                      const gate = k.require_follow ? ` · ${st.follow_gate_passed}/${st.follow_gate_shown} passed follow gate` : "";
                      return `Last 30 days: ${st.match} matches · ${st.public_reply} replies · ${st.dm_sent} DMs${gate}${st.error ? ` · ${st.error} errors` : ""}`;
                    })()}
                  </p>
                )}
                {k.description && <p className="mt-1 text-xs text-ink-mute">{k.description}</p>}
              </div>
              <div className="flex items-center gap-1">
                <Toggle checked={k.is_active} label={`${k.keyword} active`} onChange={() => toggle.mutate(k)} disabled={toggle.isPending} />
                <Button size="sm" variant="ghost" onClick={() => openEdit(k)} aria-label={`Edit ${k.keyword}`}><Pencil className="h-4 w-4" /></Button>
                <Button size="sm" variant="ghost" onClick={() => setToDelete(k)} aria-label={`Delete ${k.keyword}`}><Trash2 className="h-4 w-4" /></Button>
              </div>
            </div>
          ))}
        </Card>
      )}

      <Modal open={creating || !!editing} onClose={closeForm} title={editing ? "Edit keyword" : "New keyword"} wide>
        <form onSubmit={submit} className="space-y-4">
          {formError && <Alert kind="error">{formError}</Alert>}
          {editing ? (
            <p className="text-sm text-ink-mute">Account: <span className="font-medium text-ink">{nameOf.get(editing.connected_account_id) ?? "unknown"}</span></p>
          ) : (
            <Select label="Instagram account" value={form.connected_account_id} onChange={(e) => set("connected_account_id", e.target.value)}>
              {activeAccounts.map((a) => <option key={a.id} value={a.id}>{accountLabel(a)}</option>)}
            </Select>
          )}
          <Input label="Keyword" value={form.keyword} onChange={(e) => set("keyword", e.target.value)} maxLength={255} placeholder="PRICE" hint="Matched against comments." />
          <fieldset className="rounded-lg border border-line p-4">
            <legend className="px-1 text-sm font-medium text-ink-soft">Which post should trigger it?</legend>
            <div className="flex flex-wrap gap-5 text-sm">
              <label className="flex items-center gap-2">
                <input type="radio" name="media_target" checked={form.media_target === "all"} onChange={() => { set("media_target", "all"); setPreview(null); setPreviewError(""); }} />
                All posts
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" name="media_target" checked={form.media_target === "one"} onChange={() => set("media_target", "one")} />
                One post or reel
              </label>
            </div>
            {form.media_target === "one" && (
              <div className="mt-3 space-y-3">
                <div className="flex items-end gap-2">
                  <div className="min-w-0 flex-1">
                    <Input
                      label="Post link or media ID"
                      value={form.media_input}
                      onChange={(e) => { set("media_input", e.target.value); setPreview(null); setPreviewError(""); }}
                      placeholder="https://www.instagram.com/p/XXXXXXXXXXX/"
                      hint="Paste the link of a post or reel on the selected account. Boosted ad? Paste the original post's link. Ad-only creatives cannot be looked up from a link: paste the numeric media ID instead."
                    />
                  </div>
                  <Button variant="secondary" onClick={() => checkLink.mutate()} loading={checkLink.isPending}
                    disabled={!form.media_input.trim() || ID_RE.test(form.media_input.trim()) || !(editing ? editing.connected_account_id : form.connected_account_id)}>
                    Check link
                  </Button>
                </div>
                {preview && <Alert kind="success">Found {preview.media_type ? preview.media_type.toLowerCase().replace("_", " ") : "post"} <span className="font-mono text-xs">{preview.media_id}</span>{preview.caption ? <>: {preview.caption}</> : null}</Alert>}
                {previewError && <Alert kind="error">{previewError}</Alert>}
              </div>
            )}
          </fieldset>
          <Textarea label="DM message" value={form.message} onChange={(e) => set("message", e.target.value)} rows={4} placeholder="Hi! Here is the link you asked for..." />
          <fieldset className="space-y-3 rounded-lg border border-line p-4">
            <legend className="px-1 text-sm font-medium text-ink-soft">Public comment replies (optional, they rotate)</legend>
            <Input label="Reply 1" value={form.comment_reply1} onChange={(e) => set("comment_reply1", e.target.value)} />
            <Input label="Reply 2" value={form.comment_reply2} onChange={(e) => set("comment_reply2", e.target.value)} />
            <Input label="Reply 3" value={form.comment_reply3} onChange={(e) => set("comment_reply3", e.target.value)} />
          </fieldset>
          <div className="rounded-lg border border-line p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">Require follow</p>
                <p className="text-xs text-ink-mute">People must follow you before the DM is sent.</p>
              </div>
              <Toggle checked={form.require_follow} label="Require follow" onChange={(v) => set("require_follow", v)} />
            </div>
            {form.require_follow && (
              <div className="mt-4 space-y-3">
                <Textarea label="Follow gate message" value={form.follow_gate_message} onChange={(e) => set("follow_gate_message", e.target.value)} rows={2} />
                <Input label="Follow gate button text" value={form.follow_gate_button_text} onChange={(e) => set("follow_gate_button_text", e.target.value)} maxLength={80} />
              </div>
            )}
          </div>
          <Input label="Description (optional)" value={form.description} onChange={(e) => set("description", e.target.value)} hint="A note for yourself." />
          <div className="flex items-center gap-3">
            <Toggle checked={form.is_active} label="Active" onChange={(v) => set("is_active", v)} />
            <span className="text-sm">{form.is_active ? "Active" : "Paused"}</span>
          </div>
          <div className="flex justify-end gap-2 border-t border-line pt-4">
            <Button variant="secondary" onClick={closeForm} disabled={save.isPending}>Cancel</Button>
            <Button type="submit" loading={save.isPending}>{editing ? "Save changes" : "Create keyword"}</Button>
          </div>
        </form>
      </Modal>

      <ConfirmModal
        open={!!toDelete}
        title="Delete keyword?"
        message={`"${toDelete?.keyword ?? ""}" will stop triggering DMs. This cannot be undone.`}
        confirmLabel="Delete keyword"
        loading={remove.isPending}
        onConfirm={() => toDelete && remove.mutate(toDelete.id)}
        onCancel={() => setToDelete(null)}
      />
    </>
  );
}
