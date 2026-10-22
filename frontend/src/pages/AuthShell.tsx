import { ReactNode } from "react";
import { Logo } from "../components/Logo";

export function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle: string; children: ReactNode; footer: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-canvas px-4 py-10">
      <Logo />
      <div className="mt-6 w-full max-w-md rounded-xl border border-line bg-white p-6 sm:p-8">
        <h1 className="text-2xl font-bold">{title}</h1>
        <p className="mt-1 text-sm text-ink-mute">{subtitle}</p>
        <div className="mt-6">{children}</div>
      </div>
      <p className="mt-5 text-sm text-ink-mute">{footer}</p>
    </div>
  );
}
