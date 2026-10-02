"use client";

import { useState } from "react";

export default function LoginForm({ nextPath }: { nextPath: string }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    const response = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (response.ok) {
      // Full navigation so the new cookie is sent with the next request.
      window.location.assign(nextPath);
      return;
    }
    setSubmitting(false);
    setError(response.status === 401 ? "Wrong password. Please try again." : "Sign-in is not available right now.");
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-4">
      <label className="block">
        <span className="text-sm font-semibold text-heading">Password</span>
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoFocus
          autoComplete="current-password"
          required
          className="mt-1 w-full rounded-xl border border-line px-3.5 py-2.5 outline-none transition focus:border-brand/60 focus:ring-4 focus:ring-brand/10"
        />
      </label>
      {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-brand-dark">{error}</p>}
      <button
        type="submit"
        disabled={submitting || !password}
        className="w-full rounded-xl bg-brand py-2.5 font-semibold text-white shadow-glow transition hover:bg-brand-dark disabled:opacity-50 disabled:shadow-none"
      >
        {submitting ? "Checking…" : "Open demo"}
      </button>
    </form>
  );
}
