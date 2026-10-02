// Supabase over its REST API with the service role key, so no extra npm package is needed.
// Server side only: the service role key bypasses row level security and must never reach a browser.

function credentials() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local");
  }
  return { url: url.replace(/\/+$/, ""), key };
}

export function supabaseConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export async function supabaseRest<T>(path: string, init: RequestInit & { prefer?: string } = {}): Promise<T> {
  const { url, key } = credentials();
  const { prefer, ...options } = init;
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(prefer ? { Prefer: prefer } : {}),
      ...init.headers,
    },
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Supabase ${path} failed with ${response.status}: ${await response.text()}`);
  }
  // `return=minimal` answers 201 with an empty body, which response.json() would choke on.
  const body = await response.text();
  return (body ? JSON.parse(body) : undefined) as T;
}

/** PostgREST returns an embedded row as an object; older versions wrap it in an array. */
export function embedded<T>(value: T | T[] | null | undefined): T | null {
  return (Array.isArray(value) ? value[0] : value) ?? null;
}
