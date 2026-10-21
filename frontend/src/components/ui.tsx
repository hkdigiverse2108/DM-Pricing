import { AlertTriangle, CheckCircle2, Info, Loader2, X } from "lucide-react";
import {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
  useEffect,
  useId,
} from "react";

export const cx = (...c: Array<string | false | null | undefined>): string => c.filter(Boolean).join(" ");

/* ---------- buttons ---------- */
type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
  loading?: boolean;
};

const BTN_VARIANT = {
  primary: "bg-brand-600 text-white hover:bg-brand-700 disabled:bg-brand-600/50",
  secondary: "border border-line bg-white text-ink hover:bg-canvas disabled:text-ink-mute",
  ghost: "text-ink-soft hover:bg-ink/5 disabled:text-ink-mute",
  danger: "bg-pop text-white hover:bg-pop/90 disabled:bg-pop/50",
} as const;

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  disabled,
  className,
  children,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:cursor-not-allowed",
        size === "sm" ? "px-3 py-1.5 text-sm" : "px-4 py-2.5 text-sm",
        BTN_VARIANT[variant],
        className,
      )}
      {...rest}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

/* ---------- form fields ---------- */
const FIELD =
  "block w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-ink-mute/70 disabled:bg-canvas disabled:text-ink-mute";

function FieldShell({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-ink-soft">
        {label}
      </label>
      {children}
      {error ? (
        <p className="mt-1 text-xs text-pop">{error}</p>
      ) : hint ? (
        <p className="mt-1 text-xs text-ink-mute">{hint}</p>
      ) : null}
    </div>
  );
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string; error?: string };
export function Input({ label, hint, error, className, id, ...rest }: InputProps) {
  const auto = useId();
  const iid = id ?? auto;
  return (
    <FieldShell id={iid} label={label} hint={hint} error={error}>
      <input id={iid} aria-invalid={!!error} className={cx(FIELD, error && "border-pop", className)} {...rest} />
    </FieldShell>
  );
}

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; hint?: string; error?: string };
export function Textarea({ label, hint, error, className, id, ...rest }: TextareaProps) {
  const auto = useId();
  const iid = id ?? auto;
  return (
    <FieldShell id={iid} label={label} hint={hint} error={error}>
      <textarea id={iid} rows={3} aria-invalid={!!error} className={cx(FIELD, error && "border-pop", className)} {...rest} />
    </FieldShell>
  );
}

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & { label: string; hint?: string; error?: string };
export function Select({ label, hint, error, className, id, children, ...rest }: SelectProps) {
  const auto = useId();
  const iid = id ?? auto;
  return (
    <FieldShell id={iid} label={label} hint={hint} error={error}>
      <select id={iid} aria-invalid={!!error} className={cx(FIELD, error && "border-pop", className)} {...rest}>
        {children}
      </select>
    </FieldShell>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50",
        checked ? "bg-brand-600" : "bg-ink/20",
      )}
    >
      <span
        className={cx(
          "inline-block h-5 w-5 rounded-full bg-white shadow transition-transform",
          checked ? "translate-x-5" : "translate-x-0.5",
        )}
      />
    </button>
  );
}

/* ---------- feedback ---------- */
export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cx("h-5 w-5 animate-spin text-ink-mute", className)} aria-label="Loading" />;
}

export function PageSpinner() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <Spinner className="h-7 w-7" />
    </div>
  );
}

const ALERT = {
  error: { cls: "border-pop/30 bg-pop-50 text-pop", Icon: AlertTriangle },
  success: { cls: "border-brand-500/30 bg-brand-50 text-brand-700", Icon: CheckCircle2 },
  info: { cls: "border-line bg-white text-ink-soft", Icon: Info },
} as const;

export function Alert({
  kind = "info",
  children,
  onClose,
}: {
  kind?: keyof typeof ALERT;
  children: ReactNode;
  onClose?: () => void;
}) {
  const { cls, Icon } = ALERT[kind];
  return (
    <div role={kind === "error" ? "alert" : "status"} className={cx("flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm", cls)}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">{children}</div>
      {onClose && (
        <button type="button" onClick={onClose} aria-label="Dismiss" className="shrink-0 opacity-70 hover:opacity-100">
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

export function Badge({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "good" | "warn" | "bad" | "ig" | "fb";
  children: ReactNode;
}) {
  const tones = {
    neutral: "bg-ink/5 text-ink-soft",
    good: "bg-brand-50 text-brand-700",
    warn: "bg-amber-100 text-amber-800",
    bad: "bg-pop-50 text-pop",
    ig: "bg-pop-50 text-pop",
    fb: "bg-sky-100 text-sky-800",
  } as const;
  return <span className={cx("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium", tones[tone])}>{children}</span>;
}

/* ---------- layout bits ---------- */
export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("rounded-xl border border-line bg-white", className)}>{children}</div>;
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold">{title}</h1>
        {subtitle && <p className="mt-1 max-w-2xl text-sm text-ink-mute">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({ title, text, action }: { title: string; text: string; action?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-line bg-white px-6 py-12 text-center">
      <h3 className="text-lg font-bold">{title}</h3>
      <p className="mx-auto mt-1 max-w-md text-sm text-ink-mute">{text}</p>
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/50 p-4 sm:p-8"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cx("w-full rounded-xl bg-white shadow-xl", wide ? "max-w-2xl" : "max-w-md")}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="text-lg font-bold">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded p-1 text-ink-mute hover:bg-ink/5">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="px-5 py-5">{children}</div>
      </div>
    </div>
  );
}

export function ConfirmModal({
  open,
  title,
  message,
  confirmLabel,
  danger = true,
  loading,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal open={open} onClose={onCancel} title={title}>
      <p className="text-sm text-ink-soft">{message}</p>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel} disabled={loading}>
          Cancel
        </Button>
        <Button variant={danger ? "danger" : "primary"} onClick={onConfirm} loading={loading}>
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}

export function Meter({ label, used, limit }: { label: string; used: number; limit: number }) {
  const unlimited = limit < 0;
  const pct = unlimited ? 0 : limit === 0 ? 100 : Math.min(100, Math.round((used / limit) * 100));
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-ink-soft">{label}</span>
        <span className="font-medium">
          {used.toLocaleString()} / {unlimited ? "Unlimited" : limit.toLocaleString()}
        </span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-ink/10">
        <div className={cx("h-full rounded-full", pct >= 90 ? "bg-pop" : "bg-brand-600")} style={{ width: `${unlimited ? 4 : pct}%` }} />
      </div>
    </div>
  );
}
