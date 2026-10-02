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
        <span className="text-sm font-semibold text-cda-dark">Password</span>
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoFocus
          autoComplete="current-password"
          required
          className="mt-1 w-full rounded-lg border border-cda-grey px-3 py-2.5 outline-none focus:border-cda-red"
        />
      </label>
      {error && <p className="text-sm text-cda-red-dark">{error}</p>}
      <button
        type="submit"
        disabled={submitting || !password}
        className="w-full rounded-full bg-cda-red py-2.5 font-semibold text-white transition hover:bg-cda-red-dark disabled:opacity-50"
      >
        {submitting ? "Checking…" : "Open demo"}
      </button>
    </form>
  );
}
