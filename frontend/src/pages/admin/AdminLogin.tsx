import { ShieldCheck } from "lucide-react";
import { FormEvent, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { Alert, Button, Input } from "../../components/ui";
import { errMsg } from "../../lib/api";
import { useAdminAuth } from "../../lib/session";

export default function AdminLogin() {
  const { user, loading, signIn } = useAdminAuth();
  const navigate = useNavigate();
  const from = (useLocation().state as { from?: string } | null)?.from;
  const dest = from && from.startsWith("/admin-panel") && !from.startsWith("/admin-panel/login") ? from : "/admin-panel";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (!loading && user) return <Navigate to={dest} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await signIn("/admin-panel/auth/login", { email: email.trim(), password });
      navigate(dest, { replace: true });
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <div className="w-full max-w-sm rounded-xl border border-line bg-white p-8">
        <div className="flex items-center gap-2 font-display text-xl font-bold"><ShieldCheck className="h-6 w-6 text-pop" aria-hidden /> Admin console</div>
        <p className="mt-1 text-sm text-ink-mute">Authorised administrators only.</p>
        <form onSubmit={submit} className="mt-6 space-y-4">
          {error && <Alert kind="error">{error}</Alert>}
          <Input label="Email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <Input label="Password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          <Button type="submit" loading={busy} className="w-full">Log in</Button>
        </form>
      </div>
    </div>
  );
}
