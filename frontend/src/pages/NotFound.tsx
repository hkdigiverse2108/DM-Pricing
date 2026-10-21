import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-canvas px-4 text-center">
      <h1 className="text-5xl font-bold">404</h1>
      <p className="mt-2 text-ink-soft">This page does not exist.</p>
      <Link to="/" className="mt-5 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-700">Go home</Link>
    </div>
  );
}
