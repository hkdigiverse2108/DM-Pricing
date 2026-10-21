import { FormEvent, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { Alert, Button, Input } from "../components/ui";
import { errMsg } from "../lib/api";
import { useUserAuth } from "../lib/session";
import { AuthShell } from "./AuthShell";

export default function Register() {
  const { user, loading, signIn } = useUserAuth();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (!loading && user) return <Navigate to="/app" replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    if (password.length < 8) return setError("Password must be at least 8 characters.");
    if (password !== confirm) return setError("Passwords do not match.");
    setBusy(true);
    try {
      await signIn("/auth/register", { email: email.trim(), password, full_name: fullName.trim() });
      navigate("/app", { replace: true });
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell
      title="Create your account"
      subtitle="Free to start. No card needed."
      footer={<>Already have an account? <Link to="/login" className="font-medium text-brand-700 hover:underline">Log in</Link></>}
    >
      <form onSubmit={submit} className="space-y-4">
        {error && <Alert kind="error">{error}</Alert>}
        <Input label="Full name" autoComplete="name" required maxLength={255} value={fullName} onChange={(e) => setFullName(e.target.value)} />
        <Input label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <Input label="Password" type="password" autoComplete="new-password" required minLength={8} hint="At least 8 characters." value={password} onChange={(e) => setPassword(e.target.value)} />
        <Input label="Confirm password" type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        <Button type="submit" loading={busy} className="w-full">Create account</Button>
      </form>
    </AuthShell>
  );
}
