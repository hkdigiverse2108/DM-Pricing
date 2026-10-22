import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Search, UserPlus } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { Alert, Badge, Button, Card, Input, Modal, PageHeader, PageSpinner, Select } from "../../components/ui";
import { api, errMsg } from "../../lib/api";
import { fmtDate } from "../../lib/format";
import { useAdminAuth } from "../../lib/session";
import { Plan, UserList, UserOut } from "../../lib/types";

const PER_PAGE = 20;

export default function UsersPage() {
  const qc = useQueryClient();
  const { user: me } = useAdminAuth();
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [role, setRole] = useState("");
  const [page, setPage] = useState(1);
  const [flash, setFlash] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [planUser, setPlanUser] = useState<UserOut | null>(null);
  const [planId, setPlanId] = useState("");
  const [adminOpen, setAdminOpen] = useState(false);
  const [adminForm, setAdminForm] = useState({ full_name: "", email: "", password: "" });
  const [modalError, setModalError] = useState("");

  useEffect(() => {
    const t = setTimeout(() => {
      setQ(search.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [search]);

  const users = useQuery({
    queryKey: ["admin-users", q, role, page],
    queryFn: () =>
      api.get<UserList>("/admin-panel/users", { params: { q: q || undefined, role: role || undefined, page, per_page: PER_PAGE } }).then((r) => r.data),
    placeholderData: (prev) => prev,
  });
  const plans = useQuery({ queryKey: ["admin-plans"], queryFn: () => api.get<Plan[]>("/admin-panel/plans").then((r) => r.data) });

  const patch = useMutation({
    mutationFn: (u: UserOut) => api.patch(`/admin-panel/users/${u.id}`, { is_active: !u.is_active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-users"] }),
    onError: (e) => setFlash({ kind: "error", text: errMsg(e) }),
  });

  const assign = useMutation({
    mutationFn: () => api.put(`/admin-panel/users/${planUser?.id}/plan`, { plan_id: planId }),
    onSuccess: () => {
      setFlash({ kind: "success", text: `Plan assigned to ${planUser?.email}.` });
      setPlanUser(null);
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (e) => setModalError(errMsg(e)),
  });

  const createAdmin = useMutation({
    mutationFn: () => api.post("/admin-panel/admins", { ...adminForm, email: adminForm.email.trim(), full_name: adminForm.full_name.trim() }),
    onSuccess: () => {
      setFlash({ kind: "success", text: "Admin created." });
      setAdminOpen(false);
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (e) => setModalError(errMsg(e)),
  });

  const totalPages = Math.max(1, Math.ceil((users.data?.total ?? 0) / PER_PAGE));

  const openAssign = (u: UserOut) => {
    setModalError("");
    setPlanId(u.plan_id ?? plans.data?.[0]?.id ?? "");
    setPlanUser(u);
  };

  const submitAdmin = (e: FormEvent) => {
    e.preventDefault();
    setModalError("");
    if (adminForm.password.length < 8) return setModalError("Password must be at least 8 characters.");
    createAdmin.mutate();
  };

  return (
    <>
      <PageHeader
        title="Users"
        subtitle="View accounts, deactivate users, and assign plans."
        action={<Button variant="secondary" onClick={() => { setAdminForm({ full_name: "", email: "", password: "" }); setModalError(""); setAdminOpen(true); }}><UserPlus className="h-4 w-4" aria-hidden /> Add admin</Button>}
      />
      {flash && <div className="mb-4"><Alert kind={flash.kind} onClose={() => setFlash(null)}>{flash.text}</Alert></div>}

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-[2.3rem] h-4 w-4 text-ink-mute" aria-hidden />
          <Input label="Search" className="pl-9" placeholder="Name or email" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="w-40">
          <Select label="Role" value={role} onChange={(e) => { setRole(e.target.value); setPage(1); }}>
            <option value="">All</option>
            <option value="user">Users</option>
            <option value="admin">Admins</option>
          </Select>
        </div>
      </div>

      {users.isLoading && <PageSpinner />}
      {users.isError && <Alert kind="error">{errMsg(users.error)}</Alert>}
      {users.data && (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-line text-ink-mute">
              <tr><th className="px-5 py-3 font-medium">User</th><th className="px-3 py-3 font-medium">Role</th><th className="px-3 py-3 font-medium">Plan</th><th className="px-3 py-3 font-medium">Status</th><th className="px-3 py-3 font-medium">Joined</th><th className="px-5 py-3 text-right font-medium">Actions</th></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {users.data.items.map((u) => (
                <tr key={u.id}>
                  <td className="px-5 py-3"><p className="font-medium">{u.full_name}</p><p className="text-xs text-ink-mute">{u.email}</p></td>
                  <td className="px-3 py-3"><Badge tone={u.role === "admin" ? "bad" : "neutral"}>{u.role}</Badge></td>
                  <td className="px-3 py-3">{u.role === "user" ? (u.plan_name ?? "-") : "-"}</td>
                  <td className="px-3 py-3"><Badge tone={u.is_active ? "good" : "warn"}>{u.is_active ? "Active" : "Deactivated"}</Badge></td>
                  <td className="px-3 py-3 text-ink-mute">{fmtDate(u.created_at)}</td>
                  <td className="px-5 py-3">
                    <div className="flex justify-end gap-2">
                      {u.role === "user" && <Button size="sm" variant="secondary" onClick={() => openAssign(u)}>Assign plan</Button>}
                      {u.id !== me?.id && (
                        <Button size="sm" variant="ghost" onClick={() => patch.mutate(u)} loading={patch.isPending && patch.variables?.id === u.id}>
                          {u.is_active ? "Deactivate" : "Activate"}
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {users.data.items.length === 0 && <tr><td colSpan={6} className="px-5 py-10 text-center text-ink-mute">No users match your search.</td></tr>}
            </tbody>
          </table>
        </Card>
      )}

      {users.data && users.data.total > PER_PAGE && (
        <div className="mt-4 flex items-center justify-end gap-3 text-sm">
          <span className="text-ink-mute">Page {page} of {totalPages}</span>
          <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} aria-label="Previous page"><ChevronLeft className="h-4 w-4" /></Button>
          <Button size="sm" variant="secondary" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} aria-label="Next page"><ChevronRight className="h-4 w-4" /></Button>
        </div>
      )}

      <Modal open={!!planUser} onClose={() => setPlanUser(null)} title="Assign plan">
        <div className="space-y-4">
          {modalError && <Alert kind="error">{modalError}</Alert>}
          <p className="text-sm text-ink-soft">{planUser?.email}{planUser?.plan_name ? ` (currently ${planUser.plan_name})` : ""}</p>
          <Select label="Plan" value={planId} onChange={(e) => setPlanId(e.target.value)}>
            {(plans.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}{p.is_active ? "" : " (inactive)"}</option>)}
          </Select>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setPlanUser(null)}>Cancel</Button>
            <Button onClick={() => assign.mutate()} loading={assign.isPending} disabled={!planId}>Assign plan</Button>
          </div>
        </div>
      </Modal>

      <Modal open={adminOpen} onClose={() => setAdminOpen(false)} title="Add admin">
        <form onSubmit={submitAdmin} className="space-y-4">
          {modalError && <Alert kind="error">{modalError}</Alert>}
          <Input label="Full name" required value={adminForm.full_name} onChange={(e) => setAdminForm({ ...adminForm, full_name: e.target.value })} />
          <Input label="Email" type="email" required value={adminForm.email} onChange={(e) => setAdminForm({ ...adminForm, email: e.target.value })} />
          <Input label="Password" type="password" required minLength={8} autoComplete="new-password" value={adminForm.password} onChange={(e) => setAdminForm({ ...adminForm, password: e.target.value })} />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setAdminOpen(false)}>Cancel</Button>
            <Button type="submit" loading={createAdmin.isPending}>Create admin</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
