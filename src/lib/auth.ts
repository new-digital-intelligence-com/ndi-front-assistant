export const SESSION_COOKIE = "cda_demo_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

export function sitePasswordConfigured(): boolean {
  return Boolean(process.env.SITE_PASSWORD);
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Cookie value derived from the password, so the password itself is never stored in the browser. */
export async function expectedSessionToken(): Promise<string | null> {
  const password = process.env.SITE_PASSWORD;
  if (!password) return null;
  return sha256Hex(`cda-demo-session:${password}`);
}

export async function isValidSession(cookieValue: string | undefined): Promise<boolean> {
  const expected = await expectedSessionToken();
  if (!expected || !cookieValue) return false;
  return constantTimeEqual(cookieValue, expected);
}

export async function passwordMatches(input: string): Promise<boolean> {
  const password = process.env.SITE_PASSWORD;
  if (!password) return false;
  // Compare hashes so the comparison time does not depend on the password length.
  return constantTimeEqual(await sha256Hex(input), await sha256Hex(password));
}

/** Only allow redirects back to paths on this site. */
export function safeNextPath(next: string | undefined | null): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/";
  return next;
}
